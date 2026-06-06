use crate::execution::ExecutionContext;
use anyhow::{bail, Context, Result};
use serde::Deserialize;
use serde_json::{json, Value};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::thread;
use std::time::Duration;

#[derive(Debug, Deserialize)]
struct ShellArguments {
    command: String,
}

const LOCAL_SYSTEM_INFO_PROBE_COMPACT: &str = r#"printf "===os===\n"; (sw_vers 2>/dev/null || uname -a); printf "\n===cpu===\n"; (sysctl -n machdep.cpu.brand_string 2>/dev/null || uname -m); printf "\n===ram_bytes===\n"; (sysctl -n hw.memsize 2>/dev/null || true); printf "\n===cores===\n"; (sysctl -n hw.ncpu 2>/dev/null || nproc 2>/dev/null || true); printf "\n===disk===\n"; (df -h / 2>/dev/null || true)"#;

pub fn execute(
    arguments: &Value,
    context: &ExecutionContext,
    trusted_execution: bool,
    allowed_roots: &[String],
) -> Result<Value> {
    let args: ShellArguments =
        serde_json::from_value(arguments.clone()).context("invalid shell.execute arguments")?;
    let command = args.command.trim();
    if command.is_empty() {
        bail!("command is required");
    }
    if !trusted_execution {
        if !safe_shell_command(command) {
            bail!("shell.execute command is not allowed");
        }
        enforce_shell_path_policy(command, allowed_roots)?;
    }

    context.check_cancelled()?;
    #[cfg(target_os = "windows")]
    let mut child = Command::new("powershell")
        .args(["-NoProfile", "-Command", command])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .context("failed to execute shell command")?;

    #[cfg(not(target_os = "windows"))]
    let mut child = Command::new("/bin/zsh")
        .args(["-lc", command])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .context("failed to execute shell command")?;

    loop {
        context.check_cancelled().or_else(|error| {
            let _ = child.kill();
            Err(error)
        })?;
        if child
            .try_wait()
            .context("failed to poll shell command")?
            .is_some()
        {
            break;
        }
        thread::sleep(Duration::from_millis(50));
    }

    let output = child
        .wait_with_output()
        .context("failed to collect shell command output")?;

    context.check_cancelled()?;
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if !output.status.success() {
        bail!(
            "{}",
            if stderr.is_empty() {
                format!(
                    "command failed with exit code {}",
                    output.status.code().unwrap_or(1)
                )
            } else {
                stderr
            }
        );
    }
    Ok(json!({
        "command": command,
        "exit_code": output.status.code().unwrap_or(0),
        "stdout": stdout,
        "stderr": stderr,
    }))
}

fn safe_shell_command(command: &str) -> bool {
    let compact = command
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase();
    if compact.is_empty() {
        return false;
    }
    if compact == LOCAL_SYSTEM_INFO_PROBE_COMPACT {
        return true;
    }
    for blocked in ["&&", "||", ";", "|", ">", "<", "$(", "`"] {
        if compact.contains(blocked) {
            return false;
        }
    }
    let tokens: Vec<&str> = compact.split_whitespace().collect();
    let first = match tokens.first() {
        Some(token) => *token,
        None => return false,
    };
    let blocked_commands = [
        "rm", "mv", "cp", "chmod", "chown", "mkdir", "touch", "tee", "echo", "python", "python3",
        "node", "bash", "zsh", "sh", "kill", "xargs", "perl", "ruby", "git", "curl", "wget", "scp",
        "rsync",
    ];
    if blocked_commands.contains(&first) {
        return false;
    }
    match first {
        "ls" | "pwd" | "find" | "head" | "tail" | "cat" | "wc" | "stat" | "file" | "du"
        | "mdls" | "tree" | "rg" | "grep" | "readlink" | "dirname" | "basename" => true,
        "sed" => tokens.get(1).copied() == Some("-n"),
        _ => false,
    }
}

fn enforce_shell_path_policy(command: &str, allowed_roots: &[String]) -> Result<()> {
    let compact = command.split_whitespace().collect::<Vec<_>>().join(" ");
    if compact == LOCAL_SYSTEM_INFO_PROBE_COMPACT {
        return Ok(());
    }
    let tokens = shell_tokens(&compact);
    let first = tokens.first().map(String::as_str).unwrap_or_default();
    if first == "pwd" {
        return Ok(());
    }
    for token in tokens.iter().skip(1) {
        if token.starts_with('-') || token.is_empty() {
            continue;
        }
        if token == "." {
            continue;
        }
        if looks_like_path_argument(token) {
            let path = resolve_path(token)?;
            if sensitive_path(&path) {
                bail!("shell.execute path is blocked by the Agent Computer policy");
            }
            enforce_path_policy(&path, allowed_roots)?;
        }
    }
    Ok(())
}

fn shell_tokens(command: &str) -> Vec<String> {
    command
        .split_whitespace()
        .map(|token| token.trim_matches('"').trim_matches('\'').to_string())
        .collect()
}

fn looks_like_path_argument(token: &str) -> bool {
    token.starts_with("/")
        || token.starts_with("~/")
        || token.starts_with("./")
        || token.starts_with("../")
        || token == "."
        || token.contains("/")
        || token.starts_with('.')
}

fn resolve_path(raw_path: &str) -> Result<PathBuf> {
    let trimmed = raw_path.trim();
    if trimmed.is_empty() {
        bail!("path is required");
    }
    let expanded = expand_home_alias(trimmed);
    let path = PathBuf::from(expanded);
    if path.is_absolute() {
        return Ok(path);
    }
    let cwd = env::current_dir().context("failed to resolve current directory")?;
    Ok(cwd.join(path))
}

fn expand_home_alias(raw_path: &str) -> String {
    let value = raw_path.trim();
    if let Some(rest) = value.strip_prefix("~/") {
        if let Ok(home) = env::var("HOME") {
            return Path::new(&home).join(rest).to_string_lossy().to_string();
        }
    }
    value.to_string()
}

fn enforce_path_policy(target: &Path, allowed_roots: &[String]) -> Result<()> {
    let target = normalize_for_policy(target)?;
    let roots = allowed_roots
        .iter()
        .filter_map(|raw| {
            let token = raw.trim();
            if token.is_empty() || token == "*" {
                None
            } else {
                Some(resolve_path(token))
            }
        })
        .collect::<Result<Vec<_>>>()?;
    let effective_roots = if roots.is_empty() {
        vec![env::current_dir().context("failed to resolve current directory")?]
    } else {
        roots
    };
    for root in effective_roots {
        let root = normalize_for_policy(&root)?;
        if target == root || target.starts_with(&root) {
            return Ok(());
        }
    }
    bail!("shell.execute path is outside the Agent Computer policy");
}

fn normalize_for_policy(path: &Path) -> Result<PathBuf> {
    if path.exists() {
        return fs::canonicalize(path)
            .with_context(|| format!("failed to canonicalize path: {}", path.to_string_lossy()));
    }
    if let Some(parent) = path.parent() {
        if parent.exists() {
            let parent = fs::canonicalize(parent).with_context(|| {
                format!(
                    "failed to canonicalize parent path: {}",
                    parent.to_string_lossy()
                )
            })?;
            if let Some(file_name) = path.file_name() {
                return Ok(parent.join(file_name));
            }
        }
    }
    Ok(path.to_path_buf())
}

fn sensitive_path(path: &Path) -> bool {
    let normalized = path.to_string_lossy().to_lowercase();
    let name = path
        .file_name()
        .map(|value| value.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    if name == ".env"
        || name.starts_with(".env.")
        || name == "id_rsa"
        || name == "id_ed25519"
        || name == "known_hosts"
        || name.ends_with(".pem")
        || name.ends_with(".key")
        || name.ends_with(".p12")
    {
        return true;
    }
    normalized.contains("/.ssh/")
        || normalized.contains("/.gws-config/")
        || normalized.contains("/.orion-stack/")
        || normalized.contains("/.local-dev-state/")
        || normalized.contains("token_cache")
        || normalized.contains("credentials")
}

#[cfg(test)]
mod tests {
    use super::{enforce_shell_path_policy, safe_shell_command, LOCAL_SYSTEM_INFO_PROBE_COMPACT};

    #[test]
    fn safe_shell_command_allows_known_read_only_system_probe() {
        assert!(safe_shell_command(LOCAL_SYSTEM_INFO_PROBE_COMPACT));
    }

    #[test]
    fn safe_shell_command_still_blocks_unknown_compound_commands() {
        assert!(!safe_shell_command("pwd; echo unsafe"));
        assert!(!safe_shell_command("uname -a && whoami"));
    }

    #[test]
    fn safe_shell_policy_blocks_secret_paths() {
        assert!(enforce_shell_path_policy("cat .env", &[]).is_err());
    }
}
