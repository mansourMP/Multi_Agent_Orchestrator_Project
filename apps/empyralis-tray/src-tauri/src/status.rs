use crate::process_manager::{ProcessManager, TrayStatus};
use serde_json::{json, Value};
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::Arc;
use std::thread;
use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;

const LOCAL_ORIGIN: &str = "http://localhost:3000";

pub fn start_status_server(manager: Arc<ProcessManager>, app_handle: AppHandle) {
    thread::spawn(move || {
        let Ok(listener) = TcpListener::bind("127.0.0.1:7790") else {
            return;
        };

        for stream in listener.incoming() {
            let Ok(stream) = stream else {
                continue;
            };
            let request_manager = manager.clone();
            let request_app = app_handle.clone();
            thread::spawn(move || handle_stream(stream, request_manager, request_app));
        }
    });
}

fn handle_stream(mut stream: TcpStream, manager: Arc<ProcessManager>, app_handle: AppHandle) {
    let mut buffer = [0_u8; 8192];
    let read_len = stream.read(&mut buffer).unwrap_or(0);
    let request = String::from_utf8_lossy(&buffer[..read_len]);
    let first_line = request.lines().next().unwrap_or_default();
    let mut parts = first_line.split_whitespace();
    let method = parts.next().unwrap_or_default();
    let path = parts.next().unwrap_or("/").split('?').next().unwrap_or("/");

    if method == "OPTIONS" {
        write_response(&mut stream, "204 No Content", "");
        return;
    }

    let (status, body) = match (method, path) {
        ("GET", "/status") => ("200 OK", status_body(&manager)),
        ("POST", "/connect") => ("200 OK", action_body(manager.connect_device())),
        ("POST", "/disconnect") => ("200 OK", action_body(manager.disconnect_device())),
        ("POST", "/gateway/start") => ("200 OK", action_body(manager.start_gateway())),
        ("POST", "/gateway/stop") => ("200 OK", action_body(manager.stop_gateway())),
        ("POST", "/launch-at-login") => ("200 OK", launch_at_login_body(&manager, &request)),
        ("POST", "/notify") => ("200 OK", notify_body(&app_handle, &request)),
        _ => (
            "404 Not Found",
            json!({ "ok": false, "error": "Route not found" }).to_string(),
        ),
    };

    write_response(&mut stream, status, &body);
}

fn request_json_body(request: &str) -> Value {
    let body = request.split("\r\n\r\n").nth(1).unwrap_or_default().trim();
    serde_json::from_str(body).unwrap_or_else(|_| json!({}))
}

fn launch_at_login_body(manager: &ProcessManager, request: &str) -> String {
    let body = request_json_body(request);
    let enabled = body.get("enabled").and_then(Value::as_bool).unwrap_or(false);
    action_body(manager.set_launch_at_login(enabled))
}

fn notify_body(app_handle: &AppHandle, request: &str) -> String {
    let body = request_json_body(request);
    let title = body.get("title").and_then(Value::as_str).unwrap_or("Empyralis").trim();
    let message = body.get("body").and_then(Value::as_str).unwrap_or("").trim();
    if title.is_empty() || message.is_empty() {
        return json!({ "ok": false, "error": "title and body are required" }).to_string();
    }
    match app_handle
        .notification()
        .builder()
        .title(title)
        .body(message)
        .show()
    {
        Ok(_) => json!({ "ok": true }).to_string(),
        Err(error) => json!({ "ok": false, "error": error.to_string() }).to_string(),
    }
}

fn status_body(manager: &ProcessManager) -> String {
    let status = manager.status();
    status_json(status).to_string()
}

fn action_body(result: Result<TrayStatus, String>) -> String {
    match result {
        Ok(status) => status_json(status).to_string(),
        Err(error) => json!({ "ok": false, "error": error }).to_string(),
    }
}

fn status_json(status: TrayStatus) -> Value {
    let connected = status.session_verified;
    let mut value = serde_json::to_value(status).unwrap_or_else(|_| json!({}));
    if let Value::Object(ref mut object) = value {
        object.insert("ok".to_string(), json!(true));
        object.insert("connected".to_string(), json!(connected));
    }
    value
}

fn write_response(stream: &mut TcpStream, status: &str, body: &str) {
    let response = format!(
        "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: {LOCAL_ORIGIN}\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type\r\nContent-Length: {}\r\n\r\n{body}",
        body.as_bytes().len(),
    );
    let _ = stream.write_all(response.as_bytes());
}
