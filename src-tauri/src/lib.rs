use std::fs;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread::sleep;
use std::time::{Duration, Instant};

use rand::{rngs::OsRng, RngCore};
use tauri::{Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};

const RUNTIME_HOST: &str = "127.0.0.1";
const RUNTIME_PORT: &str = "8001";
const BACKEND_HOST: &str = "127.0.0.1";
const BACKEND_PORT: &str = "4000";
const NEXT_HOST: &str = "localhost";
const NEXT_PORT: &str = "3000";
const WINDOW_LABEL: &str = "main";
const WINDOW_TITLE: &str = "Empyralis";
const WORKER_ID: &str = "empyralis-tauri-local";
const SERVER_BOOT_TIMEOUT: Duration = Duration::from_secs(45);
const SERVER_POLL_INTERVAL: Duration = Duration::from_millis(250);
const WORKER_BOOT_GRACE: Duration = Duration::from_secs(2);

struct DesktopShellLockState {
    lock_path: PathBuf,
    start_meta_path: PathBuf,
}

#[tauri::command]
fn open_external(target: String) -> Result<bool, String> {
    let normalized = target.trim();
    if normalized.is_empty() {
        return Err("Missing external target.".into());
    }
    if !normalized.starts_with("http://") && !normalized.starts_with("https://") {
        return Err("Only http(s) URLs can be opened externally.".into());
    }

    #[cfg(target_os = "macos")]
    let mut command = {
        let mut cmd = Command::new("open");
        cmd.arg(normalized);
        cmd
    };

    #[cfg(target_os = "windows")]
    let mut command = {
        let mut cmd = Command::new("cmd");
        cmd.arg("/C").arg("start").arg("").arg(normalized);
        cmd
    };

    #[cfg(all(unix, not(target_os = "macos")))]
    let mut command = {
        let mut cmd = Command::new("xdg-open");
        cmd.arg(normalized);
        cmd
    };

    let status = command
        .status()
        .map_err(|error| format!("Failed to open external URL: {error}"))?;

    if !status.success() {
        return Err(format!("External URL handler exited with status {status}."));
    }

    Ok(true)
}

#[derive(Default)]
struct Sidecars {
    runtime: Option<Child>,
    backend: Option<Child>,
    worker: Option<Child>,
    next: Option<Child>,
}

struct SidecarState(Mutex<Sidecars>);

fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("src-tauri should live at the repository root")
        .to_path_buf()
}

fn state_dir() -> PathBuf {
    repo_root().join(".orion-stack")
}

fn runtime_key_path() -> PathBuf {
    state_dir().join("runtime_key")
}

fn pid_dir() -> PathBuf {
    state_dir().join("pids")
}

fn start_meta_path() -> PathBuf {
    state_dir().join("start.meta.json")
}

fn desktop_shell_lock_path() -> PathBuf {
    state_dir().join("desktop-shell.pid")
}

fn ensure_state_dir() -> Result<(), String> {
    fs::create_dir_all(state_dir()).map_err(|error| format!("Failed to create .orion-stack: {error}"))?;
    fs::create_dir_all(pid_dir()).map_err(|error| format!("Failed to create pid directory: {error}"))
}

fn process_running(pid: u32) -> bool {
    if pid == 0 {
        return false;
    }

    #[cfg(target_os = "windows")]
    {
        let filter = format!("PID eq {pid}");
        if let Ok(output) = Command::new("tasklist").arg("/FI").arg(filter).output() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            return stdout.contains(&pid.to_string());
        }
        false
    }

    #[cfg(not(target_os = "windows"))]
    {
        Command::new("kill")
            .arg("-0")
            .arg(pid.to_string())
            .status()
            .map(|status| status.success())
            .unwrap_or(false)
    }
}

fn focus_existing_desktop_process(pid: u32) {
    #[cfg(target_os = "macos")]
    {
        let script = format!(
            "tell application \"System Events\" to set frontmost of (first process whose unix id is {pid}) to true"
        );
        let _ = Command::new("osascript").arg("-e").arg(script).status();
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = pid;
    }
}

fn existing_desktop_process() -> Option<u32> {
    let current_pid = std::process::id();
    let exe_path = std::env::current_exe().ok()?;
    let exe_path = exe_path.to_string_lossy().to_string();
    let exe_name = std::path::Path::new(&exe_path)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("empyralis-tauri-shell")
        .to_string();

    let output = Command::new("ps")
        .arg("-ax")
        .arg("-o")
        .arg("pid=")
        .arg("-o")
        .arg("command=")
        .output()
        .ok()?;
    let stdout = String::from_utf8(output.stdout).ok()?;
    for line in stdout.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let mut parts = trimmed.split_whitespace();
        let Some(pid_token) = parts.next() else {
            continue;
        };
        let Ok(pid) = pid_token.parse::<u32>() else {
            continue;
        };
        if pid == 0 || pid == current_pid {
            continue;
        }
        let command = parts.collect::<Vec<_>>().join(" ");
        if command.contains(&exe_path) || command.contains(&exe_name) {
            return Some(pid);
        }
    }
    None
}

fn acquire_desktop_shell_lock() -> Result<PathBuf, String> {
    ensure_state_dir()?;
    let lock_path = desktop_shell_lock_path();
    let current_pid = std::process::id();

    if let Some(existing_pid) = existing_desktop_process() {
        focus_existing_desktop_process(existing_pid);
        return Err("Empyralis desktop is already running.".into());
    }

    if lock_path.exists() {
        let raw = fs::read_to_string(&lock_path).unwrap_or_default();
        let existing_pid = raw.trim().parse::<u32>().unwrap_or(0);
        if existing_pid != 0 && existing_pid != current_pid && process_running(existing_pid) {
            focus_existing_desktop_process(existing_pid);
            return Err("Empyralis desktop is already running.".into());
        }
    }

    fs::write(&lock_path, current_pid.to_string()).map_err(|error| {
        format!(
            "Failed to write desktop shell lock at {}: {error}",
            lock_path.display()
        )
    })?;

    Ok(lock_path)
}

fn release_desktop_shell_lock(lock_path: &PathBuf) {
    let current_pid = std::process::id().to_string();
    let contents = fs::read_to_string(lock_path).unwrap_or_default();
    if contents.trim() == current_pid {
        let _ = fs::remove_file(lock_path);
    }
}

fn normalize_runtime_key(raw: &str) -> String {
    raw.chars().filter(|char| !char.is_whitespace()).collect()
}

fn pid_file_path(name: &str) -> PathBuf {
    pid_dir().join(format!("{name}.pid"))
}

fn write_service_pid_file(name: &str, pid: u32) -> Result<(), String> {
    let path = pid_file_path(name);
    fs::write(&path, pid.to_string())
        .map_err(|error| format!("Failed to write {name} pid file at {}: {error}", path.display()))
}

fn clear_service_pid_file(name: &str, pid: u32) {
    let path = pid_file_path(name);
    let contents = fs::read_to_string(&path).unwrap_or_default();
    if contents.trim() == pid.to_string() {
        let _ = fs::remove_file(path);
    }
}

fn current_utc_timestamp() -> String {
    Command::new("date")
        .arg("-u")
        .arg("+%Y-%m-%dT%H:%M:%SZ")
        .output()
        .ok()
        .and_then(|output| String::from_utf8(output.stdout).ok())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "unknown".into())
}

fn listening_pid_for_port(port: &str) -> Option<u32> {
    let output = Command::new("lsof")
        .arg("-ti")
        .arg(format!("tcp:{port}"))
        .arg("-sTCP:LISTEN")
        .output()
        .ok()?;
    let stdout = String::from_utf8(output.stdout).ok()?;
    stdout
        .lines()
        .find_map(|line| line.trim().parse::<u32>().ok())
}

fn lock_owner_label() -> String {
    let user = std::env::var("USER").unwrap_or_else(|_| "unknown".into());
    let host = std::env::var("HOSTNAME")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .or_else(|| {
            Command::new("hostname")
                .output()
                .ok()
                .and_then(|output| String::from_utf8(output.stdout).ok())
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty())
        })
        .unwrap_or_else(|| "unknown-host".into());
    format!("{user}@{host}")
}

fn write_desktop_start_metadata(runtime_key: &str) -> Result<PathBuf, String> {
    ensure_state_dir()?;
    let path = start_meta_path();
    let payload = format!(
        concat!(
            "{{\n",
            "  \"starter_pid\": {},\n",
            "  \"started_at\": \"{}\",\n",
            "  \"lock_owner\": \"{}\",\n",
            "  \"runtime_key_fingerprint\": \"{}\",\n",
            "  \"openclaw_policy\": \"desktop_shell\",\n",
            "  \"auth_mode\": \"desktop\"\n",
            "}}\n"
        ),
        std::process::id(),
        current_utc_timestamp(),
        lock_owner_label(),
        runtime_key.chars().take(12).collect::<String>()
    );

    fs::write(&path, payload)
        .map_err(|error| format!("Failed to write desktop start metadata at {}: {error}", path.display()))?;
    Ok(path)
}

fn release_desktop_start_metadata(path: &PathBuf) {
    let current_pid = std::process::id().to_string();
    let contents = fs::read_to_string(path).unwrap_or_default();
    if contents.contains(&format!("\"starter_pid\": {current_pid}")) {
        let _ = fs::remove_file(path);
    }
}

fn generate_runtime_key() -> String {
    let mut bytes = [0u8; 24];
    OsRng.fill_bytes(&mut bytes);
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn ensure_runtime_key() -> Result<String, String> {
    ensure_state_dir()?;
    let path = runtime_key_path();
    if path.exists() {
        let raw = fs::read_to_string(&path).map_err(|error| {
            format!("Failed to read runtime key at {}: {error}", path.display())
        })?;
        let normalized = normalize_runtime_key(&raw);
        if !normalized.is_empty() {
            return Ok(normalized);
        }
    }

    let generated = generate_runtime_key();
    fs::write(&path, &generated)
        .map_err(|error| format!("Failed to write runtime key at {}: {error}", path.display()))?;
    Ok(generated)
}

fn frontend_dir() -> PathBuf {
    repo_root().join("frontend")
}

fn backend_dir() -> PathBuf {
    repo_root().join("backend")
}

fn next_cli_path() -> PathBuf {
    frontend_dir()
        .join("node_modules")
        .join("next")
        .join("dist")
        .join("bin")
        .join("next")
}

fn runtime_url() -> String {
    format!("http://{RUNTIME_HOST}:{RUNTIME_PORT}")
}

fn runtime_health_url() -> String {
    format!("{}/health", runtime_url())
}

fn backend_base_url() -> String {
    format!("http://{BACKEND_HOST}:{BACKEND_PORT}/api/v1")
}

fn backend_health_url() -> String {
    format!("{}/health", backend_base_url())
}

fn next_url() -> String {
    format!("http://{NEXT_HOST}:{NEXT_PORT}")
}

fn next_health_url() -> String {
    next_url()
}

fn node_binary() -> &'static str {
    if cfg!(target_os = "windows") {
        "node.exe"
    } else {
        "node"
    }
}

fn npm_binary() -> &'static str {
    if cfg!(target_os = "windows") {
        "npm.cmd"
    } else {
        "npm"
    }
}

fn runtime_launcher() -> Result<(PathBuf, Vec<String>), String> {
    let root = repo_root();
    let candidates = [
        root.join("venv").join("bin").join("uvicorn"),
        root.join(".venv").join("bin").join("uvicorn"),
    ];
    if let Some(path) = candidates.into_iter().find(|candidate| candidate.exists()) {
        return Ok((path, Vec::new()));
    }

    let python_candidates = [
        root.join("venv").join("bin").join("python"),
        root.join(".venv").join("bin").join("python"),
    ];
    if let Some(path) = python_candidates
        .into_iter()
        .find(|candidate| candidate.exists())
    {
        return Ok((path, vec!["-m".into(), "uvicorn".into()]));
    }

    Err("Could not find a uvicorn launcher in venv/ or .venv/.".into())
}

fn backend_mode() -> BackendMode {
    if backend_dir().join("dist").join("main.js").exists() {
        BackendMode::Dist
    } else {
        BackendMode::Dev
    }
}

enum BackendMode {
    Dist,
    Dev,
}

fn service_ready(url: &str, accept_client_errors: bool) -> bool {
    let Ok(response) = ureq::get(url).call() else {
        return false;
    };

    let status = response.status().as_u16();
    if accept_client_errors {
        (200..500).contains(&status)
    } else {
        (200..300).contains(&status)
    }
}

fn wait_for_ready(url: &str, accept_client_errors: bool, label: &str) -> Result<(), String> {
    let started = Instant::now();
    loop {
        if service_ready(url, accept_client_errors) {
            return Ok(());
        }
        if started.elapsed() >= SERVER_BOOT_TIMEOUT {
            return Err(format!(
                "Timed out waiting for {label} on {url} after {}s.",
                SERVER_BOOT_TIMEOUT.as_secs()
            ));
        }
        sleep(SERVER_POLL_INTERVAL);
    }
}

fn spawn_runtime(runtime_key: &str) -> Result<Child, String> {
    let (launcher, prefix_args) = runtime_launcher()?;
    let mut command = Command::new(launcher);
    command
        .args(prefix_args)
        .arg("server:app")
        .arg("--host")
        .arg(RUNTIME_HOST)
        .arg("--port")
        .arg(RUNTIME_PORT)
        .current_dir(repo_root())
        .env("ORION_AUTH_REQUIRED", "1")
        .env("ORION_API_KEY", runtime_key)
        .env("ORION_LOCAL_COMPANION_ENABLED", "1")
        .env("OPENAI_HEALTHCHECK", "0")
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit());

    command
        .spawn()
        .map_err(|error| format!("Failed to start runtime sidecar: {error}"))
}

fn spawn_backend(runtime_key: &str) -> Result<Child, String> {
    let mut command = match backend_mode() {
        BackendMode::Dist => {
            let mut cmd = Command::new(node_binary());
            cmd.arg("--enable-source-maps").arg("dist/main.js");
            cmd
        }
        BackendMode::Dev => {
            let mut cmd = Command::new(npm_binary());
            cmd.arg("run").arg("start:dev");
            cmd
        }
    };

    command
        .current_dir(backend_dir())
        .env("RUNTIME_KEY", runtime_key)
        .env("ORION_API_KEY", runtime_key)
        .env("ORION_API_URL", runtime_url())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit());

    command
        .spawn()
        .map_err(|error| format!("Failed to start backend sidecar: {error}"))
}

fn spawn_next() -> Result<Child, String> {
    let frontend = frontend_dir();
    let next_cli = next_cli_path();
    if !frontend.exists() {
        return Err(format!(
            "Frontend directory not found: {}",
            frontend.display()
        ));
    }
    if !next_cli.exists() {
        return Err(format!(
            "Next.js CLI not found at {}. Run npm install in frontend/ first.",
            next_cli.display()
        ));
    }

    let mut command = Command::new(node_binary());
    command
        .arg(next_cli)
        .arg(if cfg!(debug_assertions) {
            "dev"
        } else {
            "start"
        })
        .arg("-H")
        .arg(NEXT_HOST)
        .arg("-p")
        .arg(NEXT_PORT)
        .current_dir(frontend)
        .env("NEXT_TELEMETRY_DISABLED", "1")
        .env("EMPYRALIS_TAURI_DESKTOP", "1")
        .env("ORION_API_URL", runtime_url())
        .env("NEXT_PUBLIC_API_URL", backend_base_url())
        .env(
            "NEXT_PUBLIC_WS_URL",
            format!("ws://{BACKEND_HOST}:{BACKEND_PORT}"),
        )
        .env("NEXT_PUBLIC_ORION_API_URL", runtime_url())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit());

    command
        .spawn()
        .map_err(|error| format!("Failed to start Next.js sidecar: {error}"))
}

fn desktop_bridge_script() -> String {
    format!(
        r#"
(() => {{
  const bridge = {{
    desktop: true,
    platform: "{platform}",
    openExternal: async (target) => {{
      if (window.__TAURI_INTERNALS__ && typeof window.__TAURI_INTERNALS__.invoke === "function") {{
        return await window.__TAURI_INTERNALS__.invoke("open_external", {{ target }});
      }}
      return false;
    }},
  }};
  window.empyralisDesktop = Object.assign(window.empyralisDesktop || {{}}, bridge);
  window.orionDesktop = window.empyralisDesktop;
}})();
"#,
        platform = std::env::consts::OS
    )
}

fn spawn_worker(runtime_key: &str) -> Result<Child, String> {
    let mut command = Command::new("bash");
    command
        .arg("scripts/run_local_worker.sh")
        .current_dir(repo_root())
        .env("RUNTIME_KEY", runtime_key)
        .env("ORION_API_URL", runtime_url())
        .env("WORKER_ID", WORKER_ID)
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit());

    command
        .spawn()
        .map_err(|error| format!("Failed to start local worker sidecar: {error}"))
}

fn cleanup_stale_worker_processes(worker_id: &str) -> Result<(), String> {
    let output = Command::new("ps")
        .arg("-ax")
        .arg("-o")
        .arg("pid=")
        .arg("-o")
        .arg("command=")
        .output()
        .map_err(|error| format!("Failed to inspect running worker processes: {error}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    for line in stdout.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        if !trimmed.contains("scripts/orion_local_worker.py") {
            continue;
        }
        if !trimmed.contains(&format!("--worker-id {worker_id}")) {
            continue;
        }

        let mut parts = trimmed.split_whitespace();
        let Some(pid_token) = parts.next() else {
            continue;
        };
        let Ok(pid) = pid_token.parse::<i32>() else {
            continue;
        };

        let status = Command::new("kill")
            .arg("-TERM")
            .arg(pid.to_string())
            .status()
            .map_err(|error| format!("Failed to stop stale worker process {pid}: {error}"))?;

        if !status.success() {
            return Err(format!("Failed to stop stale worker process {pid}."));
        }
    }

    Ok(())
}

fn stop_child(name: &str, child: &mut Option<Child>) {
    let Some(mut child) = child.take() else {
        return;
    };
    let pid = child.id();
    let _ = child.kill();
    let _ = child.wait();
    clear_service_pid_file(name, pid);
}

fn stop_sidecars(state: &SidecarState) {
    let Ok(mut guard) = state.0.lock() else {
        return;
    };
    stop_child("frontend", &mut guard.next);
    stop_child("worker", &mut guard.worker);
    stop_child("backend", &mut guard.backend);
    stop_child("runtime", &mut guard.runtime);
}

fn ensure_service<FSpawn, FStore>(
    state: &SidecarState,
    service_name: &str,
    port: &str,
    ready_url: &str,
    accept_client_errors: bool,
    label: &str,
    spawn: FSpawn,
    store: FStore,
) -> Result<(), String>
where
    FSpawn: FnOnce() -> Result<Child, String>,
    FStore: FnOnce(&mut Sidecars, Child),
{
    if service_ready(ready_url, accept_client_errors) {
        if let Some(pid) = listening_pid_for_port(port) {
            let _ = write_service_pid_file(service_name, pid);
        }
        return Ok(());
    }

    let child = spawn()?;
    {
        let mut guard = state
            .0
            .lock()
            .map_err(|_| format!("{label} sidecar state lock poisoned"))?;
        store(&mut guard, child);
    }
    wait_for_ready(ready_url, accept_client_errors, label)
}

fn ensure_worker(state: &SidecarState, runtime_key: &str) -> Result<(), String> {
    {
        let guard = state
            .0
            .lock()
            .map_err(|_| "worker sidecar state lock poisoned".to_string())?;
        if guard.worker.is_some() {
            return Ok(());
        }
    }

    cleanup_stale_worker_processes(WORKER_ID)?;

    let child = spawn_worker(runtime_key)?;
    let _ = write_service_pid_file("worker", child.id());
    {
        let mut guard = state
            .0
            .lock()
            .map_err(|_| "worker sidecar state lock poisoned".to_string())?;
        guard.worker = Some(child);
    }

    sleep(WORKER_BOOT_GRACE);

    let mut guard = state
        .0
        .lock()
        .map_err(|_| "worker sidecar state lock poisoned".to_string())?;
    let Some(child) = guard.worker.as_mut() else {
        return Err("Worker sidecar disappeared during startup.".into());
    };

    match child.try_wait() {
        Ok(Some(status)) => Err(format!(
            "Local worker exited during startup with status {status}."
        )),
        Ok(None) => Ok(()),
        Err(error) => Err(format!("Failed to probe local worker status: {error}")),
    }
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![open_external])
        .setup(|app| {
            let lock_path =
                acquire_desktop_shell_lock().map_err(|error| -> Box<dyn std::error::Error> {
                    Box::new(std::io::Error::other(error))
                })?;

            let runtime_key =
                ensure_runtime_key().map_err(|error| -> Box<dyn std::error::Error> {
                    release_desktop_shell_lock(&lock_path);
                    Box::new(std::io::Error::other(error))
                })?;
            let start_meta_path =
                write_desktop_start_metadata(&runtime_key).map_err(|error| -> Box<dyn std::error::Error> {
                    release_desktop_shell_lock(&lock_path);
                    Box::new(std::io::Error::other(error))
                })?;

            app.manage(SidecarState(Mutex::new(Sidecars::default())));
            app.manage(DesktopShellLockState {
                lock_path: lock_path.clone(),
                start_meta_path: start_meta_path.clone(),
            });

            let state = app.state::<SidecarState>();

            if let Err(error) = ensure_service(
                &state,
                "runtime",
                RUNTIME_PORT,
                &runtime_health_url(),
                false,
                "runtime",
                || spawn_runtime(&runtime_key),
                |sidecars, child| {
                    let _ = write_service_pid_file("runtime", child.id());
                    sidecars.runtime = Some(child);
                },
            ) {
                stop_sidecars(&state);
                release_desktop_start_metadata(&start_meta_path);
                release_desktop_shell_lock(&lock_path);
                return Err(Box::new(std::io::Error::other(error)));
            }

            if let Err(error) = ensure_service(
                &state,
                "backend",
                BACKEND_PORT,
                &backend_health_url(),
                false,
                "backend",
                || spawn_backend(&runtime_key),
                |sidecars, child| {
                    let _ = write_service_pid_file("backend", child.id());
                    sidecars.backend = Some(child);
                },
            ) {
                stop_sidecars(&state);
                release_desktop_start_metadata(&start_meta_path);
                release_desktop_shell_lock(&lock_path);
                return Err(Box::new(std::io::Error::other(error)));
            }

            if let Err(error) = ensure_worker(&state, &runtime_key) {
                stop_sidecars(&state);
                release_desktop_start_metadata(&start_meta_path);
                release_desktop_shell_lock(&lock_path);
                return Err(Box::new(std::io::Error::other(error)));
            }

            if let Err(error) = ensure_service(
                &state,
                "frontend",
                NEXT_PORT,
                &next_health_url(),
                true,
                "Next.js",
                spawn_next,
                |sidecars, child| {
                    let _ = write_service_pid_file("frontend", child.id());
                    sidecars.next = Some(child);
                },
            ) {
                stop_sidecars(&state);
                release_desktop_start_metadata(&start_meta_path);
                release_desktop_shell_lock(&lock_path);
                return Err(Box::new(std::io::Error::other(error)));
            }

            let url = next_url().parse().map_err(|error| {
                Box::new(std::io::Error::other(format!("Invalid app URL: {error}")))
                    as Box<dyn std::error::Error>
            })?;

            if let Err(error) =
                WebviewWindowBuilder::new(app, WINDOW_LABEL, WebviewUrl::External(url))
                    .initialization_script(&desktop_bridge_script())
                    .title(WINDOW_TITLE)
                    .inner_size(1440.0, 960.0)
                    .min_inner_size(1100.0, 760.0)
                    .build()
            {
                stop_sidecars(&state);
                release_desktop_start_metadata(&start_meta_path);
                release_desktop_shell_lock(&lock_path);
                return Err(Box::new(std::io::Error::other(format!(
                    "Failed to build main window: {error}"
                ))));
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("failed to build Empyralis Tauri shell")
        .run(|app_handle, event| {
            if matches!(event, RunEvent::Exit | RunEvent::ExitRequested { .. }) {
                let state = app_handle.state::<SidecarState>();
                stop_sidecars(&state);
                let lock_state = app_handle.state::<DesktopShellLockState>();
                release_desktop_start_metadata(&lock_state.start_meta_path);
                release_desktop_shell_lock(&lock_state.lock_path);
            }
        });
}
