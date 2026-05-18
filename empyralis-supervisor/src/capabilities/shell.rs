use crate::execution::ExecutionContext;
use anyhow::{bail, Context, Result};
use serde::Deserialize;
use serde_json::{json, Value};
use std::process::Command;

#[derive(Debug, Deserialize)]
struct ShellArguments {
    command: String,
}

pub fn execute(arguments: &Value, context: &ExecutionContext) -> Result<Value> {
    let args: ShellArguments =
        serde_json::from_value(arguments.clone()).context("invalid shell.execute arguments")?;
    let command = args.command.trim();
    if command.is_empty() {
        bail!("command is required");
    }
    if !safe_shell_command(command) {
        bail!("shell.execute command is not allowed");
    }

    context.check_cancelled()?;
    #[cfg(target_os = "windows")]
    let output = Command::new("powershell")
        .args(["-NoProfile", "-Command", command])
        .output()
        .context("failed to execute shell command")?;

    #[cfg(not(target_os = "windows"))]
    let output = Command::new("/bin/zsh")
        .args(["-lc", command])
        .output()
        .context("failed to execute shell command")?;

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
