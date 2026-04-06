mod capabilities;

use std::env;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;

use anyhow::{Context, Result};
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::{get, post};
use axum::{Json, Router};
use base64::Engine;
use chrono::{DateTime, SecondsFormat, Utc};
use hmac::{Hmac, KeyInit, Mac};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::Sha256;
use tokio::net::TcpListener;
use tower_http::trace::TraceLayer;
use tracing::{error, info, warn};

type HmacSha256 = Hmac<Sha256>;

const VERSION: &str = "0.1.0";
const AUDIT_DB_FILENAME: &str = "empyralis_audit.db";

#[derive(Clone)]
struct AppState {
    secret: Arc<Vec<u8>>,
    audit_db_path: Arc<PathBuf>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
struct ExecuteRequest {
    request_id: String,
    capability_id: String,
    run_id: String,
    trace_id: String,
    workspace_id: String,
    arguments: Value,
    nonce: String,
    expires_at: String,
    signature: String,
}

#[derive(Debug, Serialize)]
struct ExecuteResponse {
    success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Serialize)]
struct HealthResponse {
    status: &'static str,
    version: &'static str,
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "empyralis_supervisor=info,tower_http=info".into()),
        )
        .init();

    let secret = env::var("EMPYRALIS_SUPERVISOR_SECRET")
        .expect("EMPYRALIS_SUPERVISOR_SECRET is required to start empyralis-supervisor");
    let audit_db_path = PathBuf::from(AUDIT_DB_FILENAME);
    initialize_audit_db(&audit_db_path)?;

    let state = AppState {
        secret: Arc::new(secret.into_bytes()),
        audit_db_path: Arc::new(audit_db_path),
    };

    let app = Router::new()
        .route("/health", get(health))
        .route("/execute", post(execute))
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let addr: SocketAddr = "127.0.0.1:7788".parse().context("invalid bind address")?;
    let listener = TcpListener::bind(addr)
        .await
        .context("failed to bind listener")?;
    info!(address = %addr, version = VERSION, "empyralis-supervisor listening");

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .context("axum server error")?;

    Ok(())
}

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok",
        version: VERSION,
    })
}

async fn execute(
    State(state): State<AppState>,
    Json(request): Json<ExecuteRequest>,
) -> impl IntoResponse {
    if let Err(message) = verify_request(&state, &request) {
        warn!(request_id = %request.request_id, capability_id = %request.capability_id, error = %message, "rejecting signed request");
        let _ = write_audit_log(&state, &request, false, Some(message.clone()));
        return (
            StatusCode::UNAUTHORIZED,
            Json(ExecuteResponse {
                success: false,
                result: None,
                error: Some(message),
            }),
        );
    }

    let execution = execute_capability(&request).await;
    match execution {
        Ok(result) => {
            let _ = write_audit_log(&state, &request, true, None);
            (
                StatusCode::OK,
                Json(ExecuteResponse {
                    success: true,
                    result: Some(result),
                    error: None,
                }),
            )
        }
        Err(error) => {
            let message = error.to_string();
            error!(request_id = %request.request_id, capability_id = %request.capability_id, error = %message, "capability execution failed");
            let _ = write_audit_log(&state, &request, false, Some(message.clone()));
            (
                StatusCode::OK,
                Json(ExecuteResponse {
                    success: false,
                    result: None,
                    error: Some(message),
                }),
            )
        }
    }
}

async fn execute_capability(request: &ExecuteRequest) -> Result<Value> {
    match request.capability_id.as_str() {
        "screenshot.capture" => capabilities::screenshot::capture(&request.arguments),
        "computer_control.ocr" => capabilities::ocr::read_screen_text(&request.arguments),
        "computer_control.click" => capabilities::control::click(&request.arguments),
        "computer_control.type" => capabilities::control::type_text(&request.arguments).await,
        "computer_control.key" => capabilities::control::press_key(&request.arguments),
        "computer_control.clipboard_read" => capabilities::clipboard::read_clipboard(),
        "computer_control.clipboard_write" => {
            capabilities::clipboard::write_clipboard(&request.arguments)
        }
        "computer_control.list_windows" => capabilities::windows::list_windows(),
        "computer_control.list_apps" => capabilities::windows::list_windows(),
        "computer_control.launch" => capabilities::launch::launch_target(&request.arguments),
        "computer_control.launch_app" => capabilities::launch::launch_target(&request.arguments),
        "computer_control.notify" => capabilities::system::notify(&request.arguments),
        "computer_control.applescript" => capabilities::system::applescript(&request.arguments),
        "computer_control.speak" => capabilities::system::speak(&request.arguments),
        other => Err(anyhow::anyhow!("unsupported capability_id: {other}")),
    }
}

fn verify_request(state: &AppState, request: &ExecuteRequest) -> Result<(), String> {
    let expires_at = DateTime::parse_from_rfc3339(&request.expires_at)
        .map_err(|_| "invalid expires_at".to_string())?
        .with_timezone(&Utc);

    if Utc::now().signed_duration_since(expires_at).num_seconds() > 30 {
        return Err("request expired".to_string());
    }

    let sign_str = format!(
        "{}:{}:{}:{}",
        request.request_id, request.capability_id, request.nonce, request.expires_at
    );

    let mut mac = HmacSha256::new_from_slice(state.secret.as_slice())
        .map_err(|_| "invalid secret".to_string())?;
    mac.update(sign_str.as_bytes());
    let expected = mac.finalize().into_bytes();
    let provided =
        hex::decode(&request.signature).map_err(|_| "invalid signature encoding".to_string())?;
    if expected.as_slice() != provided.as_slice() {
        return Err("signature mismatch".to_string());
    }

    Ok(())
}

fn initialize_audit_db(path: &PathBuf) -> Result<()> {
    let connection = Connection::open(path).context("failed to open audit db")?;
    connection.execute(
        "CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            request_id TEXT NOT NULL,
            capability_id TEXT NOT NULL,
            run_id TEXT NOT NULL,
            trace_id TEXT NOT NULL,
            workspace_id TEXT NOT NULL,
            success INTEGER NOT NULL,
            error TEXT,
            executed_at TEXT NOT NULL
        )",
        [],
    )?;
    Ok(())
}

fn write_audit_log(
    state: &AppState,
    request: &ExecuteRequest,
    success: bool,
    error_message: Option<String>,
) -> Result<()> {
    let connection = Connection::open(state.audit_db_path.as_ref())
        .context("failed to open audit db for logging")?;
    connection.execute(
        "INSERT INTO audit_log (
            request_id, capability_id, run_id, trace_id, workspace_id, success, error, executed_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            request.request_id,
            request.capability_id,
            request.run_id,
            request.trace_id,
            request.workspace_id,
            if success { 1 } else { 0 },
            error_message,
            Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true),
        ],
    )?;
    Ok(())
}

async fn shutdown_signal() {
    if let Err(error) = tokio::signal::ctrl_c().await {
        error!(error = %error, "failed to install ctrl+c handler");
        return;
    }
    info!("shutdown signal received");
}

pub(crate) fn encode_png_base64(bytes: &[u8]) -> String {
    base64::engine::general_purpose::STANDARD.encode(bytes)
}
