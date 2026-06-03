use rand::RngCore;
use serde::Serialize;
use serde_json::Value;
use std::fs;
use std::io::{Read, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

const SUPERVISOR_URL: &str = "http://127.0.0.1:7788";
const SUPERVISOR_HEALTH_ADDR: &str = "127.0.0.1:7788";
const STATUS_URL: &str = "http://127.0.0.1:7790/status";
const SESSION_VERIFY_TIMEOUT: Duration = Duration::from_secs(30);
const SESSION_VERIFY_INTERVAL: Duration = Duration::from_secs(3);

#[derive(Clone, Serialize)]
pub struct TrayStatus {
    pub state: String,
    pub device_name: String,
    pub supervisor_running: bool,
    pub gateway_running: bool,
    pub supervisor_adopted: bool,
    pub gateway_adopted: bool,
    pub desired_connected: bool,
    pub session_verified: bool,
    pub heartbeat_fresh: bool,
    pub session_status: String,
    pub launch_at_login: bool,
    pub status_url: String,
    pub error: Option<String>,
}

#[derive(Default)]
struct ManagedProcesses {
    supervisor: Option<Child>,
    gateway: Option<Child>,
    adopted_supervisor_pid: Option<u32>,
    adopted_gateway_pid: Option<u32>,
    desired_connected: bool,
    session_verified: bool,
    heartbeat_fresh: bool,
    session_status: String,
    last_error: Option<String>,
}

pub struct ProcessManager {
    state: Mutex<ManagedProcesses>,
    backend_url: String,
    workspace_id: String,
    api_key: String,
}

impl ProcessManager {
    pub fn new() -> Self {
        Self {
            state: Mutex::new(ManagedProcesses::default()),
            backend_url: env_value("EMPYRALIS_BACKEND_URL")
                .or_else(|| env_value("EMPYRALIS_API_URL"))
                .unwrap_or_else(|| "http://127.0.0.1:8001".to_string()),
            workspace_id: env_value("EMPYRALIS_WORKSPACE_ID")
                .or_else(|| env_value("EXPO_PUBLIC_WORKSPACE_ID"))
                .unwrap_or_else(|| "ws-1".to_string()),
            api_key: env_value("EMPYRALIS_API_KEY")
                .or_else(|| env_value("ORION_API_KEY"))
                .unwrap_or_default(),
        }
    }

    pub fn connect_device(&self) -> Result<TrayStatus, String> {
        self.set_desired_connected(true)?;
        match self.start_gateway() {
            Ok(status) => Ok(status),
            Err(error) => {
                self.record_error(error.clone());
                Err(error)
            }
        }
    }

    pub fn disconnect_device(&self) -> Result<TrayStatus, String> {
        self.set_desired_connected(false)?;
        self.stop_gateway()?;
        self.stop_supervisor()?;
        Ok(self.status())
    }

    pub fn start_gateway(&self) -> Result<TrayStatus, String> {
        self.set_desired_connected(true)?;
        self.start_supervisor()?;
        self.ensure_gateway_dist()?;

        let gateway_state = self.gateway_state_dir();
        fs::create_dir_all(&gateway_state)
            .map_err(|error| format!("Failed to create gateway state directory: {error}"))?;
        self.clear_dead_gateway_lock()?;

        if let Some(pid) = self.live_gateway_lock_pid()? {
            let mut guard = self.lock_state()?;
            guard.gateway = None;
            guard.adopted_gateway_pid = Some(pid);
            guard.last_error = None;
            drop(guard);
            self.verify_session();
            let guard = self.lock_state()?;
            return Ok(self.status_from_guard(&guard));
        }

        let node = node_binary();
        let gateway_entry = self.repo_root().join("empyralis-gateway/dist/index.js");
        let secret = self.supervisor_secret()?;
        let child = Command::new(node)
            .arg(gateway_entry)
            .current_dir(self.repo_root())
            .env("EMPYRALIS_SUPERVISOR_SECRET", secret)
            .env("EMPYRALIS_SUPERVISOR_URL", SUPERVISOR_URL)
            .env("EMPYRALIS_GATEWAY_STATE_DIR", &gateway_state)
            .env("EMPYRALIS_GATEWAY_DISPLAY_NAME", self.device_name())
            .env("EMPYRALIS_GATEWAY_BROWSER_PROJECT_ROOT", self.repo_root())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|error| format!("Failed to start Empyralis Gateway: {error}"))?;

        let gateway_pid = child.id();
        let mut guard = self.lock_state()?;
        guard.adopted_gateway_pid = None;
        guard.gateway = Some(child);
        guard.last_error = None;
        drop(guard);

        if gateway_pid == 0 {
            return Err("Gateway process did not return a process id.".to_string());
        }

        self.verify_session();
        Ok(self.status())
    }

    pub fn stop_gateway(&self) -> Result<TrayStatus, String> {
        self.set_desired_connected(false)?;
        let mut guard = self.lock_state()?;
        stop_child(&mut guard.gateway);
        if let Some(pid) = guard.adopted_gateway_pid.take() {
            let _ = terminate_pid(pid);
        }
        guard.session_verified = false;
        guard.heartbeat_fresh = false;
        guard.session_status = "none".to_string();
        Ok(self.status_from_guard(&guard))
    }

    pub fn set_launch_at_login(&self, enabled: bool) -> Result<TrayStatus, String> {
        if enabled {
            self.install_launch_agent()?;
        } else {
            self.remove_launch_agent()?;
        }
        Ok(self.status())
    }

    pub fn status(&self) -> TrayStatus {
        match self.lock_state() {
            Ok(mut guard) => {
                refresh_process_state(&mut guard);
                self.status_from_guard(&guard)
            }
            Err(error) => TrayStatus {
                state: "error".to_string(),
                device_name: self.device_name(),
                supervisor_running: false,
                gateway_running: false,
                supervisor_adopted: false,
                gateway_adopted: false,
                desired_connected: false,
                session_verified: false,
                heartbeat_fresh: false,
                session_status: "none".to_string(),
                launch_at_login: false,
                status_url: STATUS_URL.to_string(),
                error: Some(error),
            },
        }
    }

    pub fn maintain_connection(&self) {
        let should_recover = match self.lock_state() {
            Ok(mut guard) => {
                refresh_process_state(&mut guard);
                guard.desired_connected
            }
            Err(_) => false,
        };
        if !should_recover {
            return;
        }

        let status = self.status();
        if !status.supervisor_running || !status.gateway_running {
            self.record_error("Recovering hardware connection...".to_string());
            if let Err(error) = self.start_gateway() {
                self.record_error(error);
            }
            return;
        }

        let result = self.poll_session_once();
        self.update_session_verification(result);
    }

    fn start_supervisor(&self) -> Result<(), String> {
        if supervisor_healthy() {
            let mut guard = self.lock_state()?;
            guard.supervisor = None;
            guard.adopted_supervisor_pid = listening_pid_for_port(7788);
            guard.last_error = None;
            return Ok(());
        }

        self.ensure_supervisor_binary()?;
        let secret = self.supervisor_secret()?;
        let audit_db = self.app_support_dir().join("supervisor-audit.sqlite3");
        let supervisor_bin = self.supervisor_binary();
        let mut child = Command::new(supervisor_bin)
            .env("EMPYRALIS_SUPERVISOR_SECRET", secret)
            .env("EMPYRALIS_SUPERVISOR_AUDIT_DB", audit_db)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|error| format!("Failed to start Empyralis Supervisor: {error}"))?;

        for _ in 0..40 {
            if supervisor_healthy() {
                let mut guard = self.lock_state()?;
                guard.adopted_supervisor_pid = None;
                guard.supervisor = Some(child);
                guard.last_error = None;
                return Ok(());
            }
            std::thread::sleep(Duration::from_millis(150));
        }

        let _ = child.kill();
        Err("Supervisor did not become healthy on 127.0.0.1:7788.".to_string())
    }

    fn stop_supervisor(&self) -> Result<(), String> {
        let mut guard = self.lock_state()?;
        stop_child(&mut guard.supervisor);
        if let Some(pid) = guard.adopted_supervisor_pid.take() {
            let _ = terminate_pid(pid);
        }
        Ok(())
    }

    fn status_from_guard(&self, guard: &ManagedProcesses) -> TrayStatus {
        let supervisor_running = guard.supervisor.as_ref().map(process_still_running).unwrap_or(false)
            || guard.adopted_supervisor_pid.map(process_alive).unwrap_or(false)
            || supervisor_healthy();
        let gateway_running = guard.gateway.as_ref().map(process_still_running).unwrap_or(false)
            || guard.adopted_gateway_pid.map(process_alive).unwrap_or(false)
            || self.live_gateway_lock_pid().ok().flatten().is_some();
        let state = if let Some(error) = guard.last_error.as_ref() {
            if !error.is_empty() {
                "error"
            } else if guard.session_verified && gateway_running {
                "active"
            } else if gateway_running || supervisor_running || guard.desired_connected {
                "connecting"
            } else {
                "idle"
            }
        } else if guard.session_verified && gateway_running {
            "active"
        } else if gateway_running || supervisor_running || guard.desired_connected {
            "connecting"
        } else {
            "idle"
        };

        TrayStatus {
            state: state.to_string(),
            device_name: self.device_name(),
            supervisor_running,
            gateway_running,
            supervisor_adopted: guard.adopted_supervisor_pid.is_some(),
            gateway_adopted: guard.adopted_gateway_pid.is_some(),
            desired_connected: guard.desired_connected,
            session_verified: guard.session_verified,
            heartbeat_fresh: guard.heartbeat_fresh,
            session_status: if guard.session_status.is_empty() {
                "none".to_string()
            } else {
                guard.session_status.clone()
            },
            launch_at_login: self.launch_agent_path().exists(),
            status_url: STATUS_URL.to_string(),
            error: guard.last_error.clone(),
        }
    }

    fn verify_session(&self) {
        let deadline = Instant::now() + SESSION_VERIFY_TIMEOUT;
        loop {
            let result = self.poll_session_once();
            if self.update_session_verification(result) {
                return;
            }
            if Instant::now() >= deadline {
                return;
            }
            std::thread::sleep(SESSION_VERIFY_INTERVAL);
        }
    }

    fn update_session_verification(&self, result: SessionVerification) -> bool {
        let verified = result.session_verified;
        if let Ok(mut guard) = self.lock_state() {
            guard.session_verified = result.session_verified;
            guard.heartbeat_fresh = result.heartbeat_fresh;
            guard.session_status = result.session_status;
            if verified {
                guard.last_error = None;
            }
        }
        verified
    }

    fn set_desired_connected(&self, desired: bool) -> Result<(), String> {
        let mut guard = self.lock_state()?;
        guard.desired_connected = desired;
        if !desired {
            guard.last_error = None;
            guard.session_verified = false;
            guard.heartbeat_fresh = false;
            guard.session_status = "none".to_string();
        }
        Ok(())
    }

    fn record_error(&self, error: String) {
        if let Ok(mut guard) = self.lock_state() {
            guard.last_error = Some(error);
            guard.session_verified = false;
            guard.heartbeat_fresh = false;
        }
    }

    fn poll_session_once(&self) -> SessionVerification {
        if self.backend_url.trim().is_empty() || self.workspace_id.trim().is_empty() || self.api_key.trim().is_empty() {
            return SessionVerification {
                session_verified: false,
                heartbeat_fresh: false,
                session_status: "none".to_string(),
            };
        }
        let url = format!(
            "{}/api/gateway/registrations?workspace_id={}",
            self.backend_url.trim_end_matches('/'),
            percent_encode_query(self.workspace_id.trim()),
        );
        let output = Command::new("curl")
            .arg("--silent")
            .arg("--show-error")
            .arg("--max-time")
            .arg("2")
            .arg("-H")
            .arg(format!("Authorization: Bearer {}", self.api_key.trim()))
            .arg(&url)
            .output();
        let Ok(output) = output else {
            return SessionVerification {
                session_verified: false,
                heartbeat_fresh: false,
                session_status: "none".to_string(),
            };
        };
        if !output.status.success() {
            return SessionVerification {
                session_verified: false,
                heartbeat_fresh: false,
                session_status: "none".to_string(),
            };
        }
        let Ok(value) = serde_json::from_slice::<Value>(&output.stdout) else {
            return SessionVerification {
                session_verified: false,
                heartbeat_fresh: false,
                session_status: "none".to_string(),
            };
        };
        session_verification_from_payload(&value)
    }

    fn lock_state(&self) -> Result<std::sync::MutexGuard<'_, ManagedProcesses>, String> {
        self.state
            .lock()
            .map_err(|_| "Tray process state lock poisoned.".to_string())
    }

    fn supervisor_secret(&self) -> Result<String, String> {
        let path = self.app_support_dir().join("supervisor.secret");
        if path.exists() {
            let secret = fs::read_to_string(&path)
                .map_err(|error| format!("Failed to read supervisor secret: {error}"))?
                .trim()
                .to_string();
            if !secret.is_empty() {
                return Ok(secret);
            }
        }

        fs::create_dir_all(self.app_support_dir())
            .map_err(|error| format!("Failed to create tray application support directory: {error}"))?;
        let mut bytes = [0_u8; 32];
        rand::thread_rng().fill_bytes(&mut bytes);
        let secret = bytes.iter().map(|byte| format!("{byte:02x}")).collect::<String>();
        fs::write(&path, &secret)
            .map_err(|error| format!("Failed to persist supervisor secret: {error}"))?;
        Ok(secret)
    }

    fn ensure_supervisor_binary(&self) -> Result<(), String> {
        if self.supervisor_binary().exists() {
            return Ok(());
        }
        let status = Command::new("cargo")
            .arg("build")
            .arg("--release")
            .arg("--manifest-path")
            .arg(self.repo_root().join("empyralis-supervisor/Cargo.toml"))
            .current_dir(self.repo_root())
            .status()
            .map_err(|error| format!("Failed to build supervisor: {error}"))?;
        if status.success() {
            Ok(())
        } else {
            Err("Supervisor build failed.".to_string())
        }
    }

    fn ensure_gateway_dist(&self) -> Result<(), String> {
        if self.repo_root().join("empyralis-gateway/dist/index.js").exists() {
            return Ok(());
        }
        let status = Command::new(npm_binary())
            .arg("run")
            .arg("build")
            .arg("--prefix")
            .arg("empyralis-gateway")
            .current_dir(self.repo_root())
            .status()
            .map_err(|error| format!("Failed to build gateway: {error}"))?;
        if status.success() {
            Ok(())
        } else {
            Err("Gateway build failed.".to_string())
        }
    }

    fn clear_dead_gateway_lock(&self) -> Result<(), String> {
        let lock_path = self.gateway_lock_path();
        if !lock_path.exists() {
            return Ok(());
        }
        if self.live_gateway_lock_pid()?.is_none() {
            fs::remove_file(lock_path)
                .map_err(|error| format!("Failed to clear stale gateway lock: {error}"))?;
        }
        Ok(())
    }

    fn live_gateway_lock_pid(&self) -> Result<Option<u32>, String> {
        let lock_path = self.gateway_lock_path();
        if !lock_path.exists() {
            return Ok(None);
        }
        let payload = fs::read_to_string(lock_path)
            .map_err(|error| format!("Failed to read gateway lock: {error}"))?;
        let value: Value = serde_json::from_str(&payload).unwrap_or(Value::Null);
        let pid = value.get("pid").and_then(Value::as_u64).unwrap_or(0) as u32;
        if pid > 0 && process_alive(pid) {
            Ok(Some(pid))
        } else {
            Ok(None)
        }
    }

    fn gateway_lock_path(&self) -> PathBuf {
        self.gateway_state_dir().join("gateway.lock")
    }

    fn gateway_state_dir(&self) -> PathBuf {
        self.app_support_dir().join("gateway")
    }

    fn supervisor_binary(&self) -> PathBuf {
        self.repo_root()
            .join("empyralis-supervisor/target/release/empyralis-supervisor")
    }

    fn repo_root(&self) -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .and_then(Path::parent)
            .and_then(Path::parent)
            .expect("apps/empyralis-tray/src-tauri should live inside the repository")
            .to_path_buf()
    }

    fn app_support_dir(&self) -> PathBuf {
        let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
        PathBuf::from(home)
            .join("Library")
            .join("Application Support")
            .join("com.empyralis.tray")
    }

    fn launch_agent_path(&self) -> PathBuf {
        let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
        PathBuf::from(home)
            .join("Library")
            .join("LaunchAgents")
            .join("com.empyralis.tray.plist")
    }

    fn install_launch_agent(&self) -> Result<(), String> {
        if !cfg!(target_os = "macos") {
            return Err("Launch at login is currently available on macOS only.".to_string());
        }
        let launch_agent_path = self.launch_agent_path();
        let launch_agents_dir = launch_agent_path
            .parent()
            .ok_or_else(|| "LaunchAgents directory could not be resolved.".to_string())?;
        fs::create_dir_all(launch_agents_dir)
            .map_err(|error| format!("Failed to create LaunchAgents directory: {error}"))?;
        let executable = std::env::current_exe()
            .map_err(|error| format!("Failed to resolve tray executable: {error}"))?;
        let plist = format!(
            r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.empyralis.tray</string>
  <key>ProgramArguments</key>
  <array>
    <string>{}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <false/>
</dict>
</plist>
"#,
            escape_xml(&executable.to_string_lossy())
        );
        fs::write(&launch_agent_path, plist)
            .map_err(|error| format!("Failed to write LaunchAgent: {error}"))?;
        let _ = Command::new("launchctl")
            .arg("bootstrap")
            .arg(format!("gui/{}", current_uid()))
            .arg(&launch_agent_path)
            .status();
        Ok(())
    }

    fn remove_launch_agent(&self) -> Result<(), String> {
        let launch_agent_path = self.launch_agent_path();
        if launch_agent_path.exists() {
            let _ = Command::new("launchctl")
                .arg("bootout")
                .arg(format!("gui/{}", current_uid()))
                .arg(&launch_agent_path)
                .status();
            fs::remove_file(&launch_agent_path)
                .map_err(|error| format!("Failed to remove LaunchAgent: {error}"))?;
        }
        Ok(())
    }

    fn device_name(&self) -> String {
        Command::new("hostname")
            .output()
            .ok()
            .and_then(|output| String::from_utf8(output.stdout).ok())
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| "This device".to_string())
    }
}

struct SessionVerification {
    session_verified: bool,
    heartbeat_fresh: bool,
    session_status: String,
}

fn session_verification_from_payload(value: &Value) -> SessionVerification {
    let items = value
        .get("items")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let mut saw_stale = false;
    let mut saw_fresh = false;
    for item in items {
        let status = item.get("status").and_then(Value::as_str).unwrap_or("").trim().to_lowercase();
        let backend_heartbeat_fresh = item.get("heartbeat_fresh").and_then(Value::as_bool).unwrap_or(false);
        let heartbeat_age_seconds = item.get("heartbeat_age_seconds").and_then(Value::as_i64);
        let heartbeat_fresh = backend_heartbeat_fresh && heartbeat_age_seconds.map(|age| age <= 30).unwrap_or(false);
        let latest_session_status = item
            .get("latest_session_status")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim()
            .to_lowercase();
        if heartbeat_fresh {
            saw_fresh = true;
        }
        if status == "active" && heartbeat_fresh && matches!(latest_session_status.as_str(), "active" | "connected") {
            return SessionVerification {
                session_verified: true,
                heartbeat_fresh: true,
                session_status: "active".to_string(),
            };
        }
        if !latest_session_status.is_empty() {
            saw_stale = true;
        }
    }
    SessionVerification {
        session_verified: false,
        heartbeat_fresh: saw_fresh,
        session_status: if saw_stale { "stale" } else { "none" }.to_string(),
    }
}

fn env_value(name: &str) -> Option<String> {
    std::env::var(name)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn percent_encode_query(value: &str) -> String {
    let mut encoded = String::new();
    for byte in value.bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'~') {
            encoded.push(byte as char);
        } else {
            encoded.push_str(&format!("%{byte:02X}"));
        }
    }
    encoded
}

fn supervisor_healthy() -> bool {
    let Ok(mut addrs) = SUPERVISOR_HEALTH_ADDR.to_socket_addrs() else {
        return false;
    };
    let Some(addr) = addrs.next() else {
        return false;
    };
    let Ok(mut stream) = TcpStream::connect_timeout(&addr, Duration::from_millis(250)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(300)));
    let _ = stream.set_write_timeout(Some(Duration::from_millis(300)));
    if stream
        .write_all(b"GET /health HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n")
        .is_err()
    {
        return false;
    }
    let mut response = String::new();
    stream.read_to_string(&mut response).is_ok() && response.contains("200")
}

fn process_still_running(child: &Child) -> bool {
    process_alive(child.id())
}

fn refresh_process_state(guard: &mut ManagedProcesses) {
    if guard
        .supervisor
        .as_mut()
        .map(child_has_exited)
        .unwrap_or(false)
    {
        guard.supervisor = None;
        guard.session_verified = false;
        guard.heartbeat_fresh = false;
    }
    if guard
        .gateway
        .as_mut()
        .map(child_has_exited)
        .unwrap_or(false)
    {
        guard.gateway = None;
        guard.session_verified = false;
        guard.heartbeat_fresh = false;
    }
    if guard
        .adopted_supervisor_pid
        .map(|pid| !process_alive(pid))
        .unwrap_or(false)
    {
        guard.adopted_supervisor_pid = None;
        guard.session_verified = false;
        guard.heartbeat_fresh = false;
    }
    if guard
        .adopted_gateway_pid
        .map(|pid| !process_alive(pid))
        .unwrap_or(false)
    {
        guard.adopted_gateway_pid = None;
        guard.session_verified = false;
        guard.heartbeat_fresh = false;
    }
}

fn child_has_exited(child: &mut Child) -> bool {
    matches!(child.try_wait(), Ok(Some(_)))
}

fn process_alive(pid: u32) -> bool {
    if pid == 0 {
        return false;
    }
    Command::new("kill")
        .arg("-0")
        .arg(pid.to_string())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

fn terminate_pid(pid: u32) -> Result<(), String> {
    if pid == 0 {
        return Ok(());
    }
    Command::new("kill")
        .arg("-TERM")
        .arg(pid.to_string())
        .status()
        .map_err(|error| format!("Failed to stop process {pid}: {error}"))?;
    Ok(())
}

fn stop_child(child: &mut Option<Child>) {
    let Some(mut child) = child.take() else {
        return;
    };
    let _ = child.kill();
    let _ = child.wait();
}

fn listening_pid_for_port(port: u16) -> Option<u32> {
    let output = Command::new("lsof")
        .arg("-ti")
        .arg(format!("tcp:{port}"))
        .output()
        .ok()?;
    String::from_utf8(output.stdout)
        .ok()?
        .lines()
        .find_map(|line| line.trim().parse::<u32>().ok())
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

fn current_uid() -> String {
    Command::new("id")
        .arg("-u")
        .output()
        .ok()
        .and_then(|output| String::from_utf8(output.stdout).ok())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "501".to_string())
}

fn escape_xml(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}
