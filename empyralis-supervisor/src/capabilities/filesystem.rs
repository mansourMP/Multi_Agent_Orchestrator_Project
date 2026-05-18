use anyhow::{bail, Context, Result};
use serde::Deserialize;
use serde_json::{json, Value};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Deserialize)]
struct FilesystemArguments {
    path: String,
    mode: Option<String>,
    content: Option<String>,
    overwrite: Option<bool>,
}

pub fn read_write(arguments: &Value) -> Result<Value> {
    let args: FilesystemArguments = serde_json::from_value(arguments.clone())
        .context("invalid filesystem.read_write arguments")?;
    let mode = args.mode.as_deref().unwrap_or("read").trim().to_lowercase();
    let target = resolve_path(&args.path)?;
    let display_path = target.to_string_lossy().to_string();

    match mode.as_str() {
        "read" => {
            if !target.exists() {
                bail!("path not found: {display_path}");
            }
            if target.is_dir() {
                let mut entries: Vec<String> = fs::read_dir(&target)
                    .with_context(|| format!("failed to read directory: {display_path}"))?
                    .filter_map(|entry| entry.ok())
                    .map(|entry| {
                        let file_name = entry.file_name().to_string_lossy().to_string();
                        match entry.file_type() {
                            Ok(kind) if kind.is_dir() => format!("{file_name}/"),
                            _ => file_name,
                        }
                    })
                    .collect();
                entries.sort();
                return Ok(json!({
                    "mode": "read",
                    "path": display_path,
                    "is_directory": true,
                    "entries": entries,
                }));
            }
            let content = fs::read_to_string(&target)
                .with_context(|| format!("failed to read file: {display_path}"))?;
            Ok(json!({
                "mode": "read",
                "path": display_path,
                "is_directory": false,
                "content": content,
            }))
        }
        "write" => {
            if target.exists() && !args.overwrite.unwrap_or(false) {
                bail!("file already exists: {display_path}");
            }
            let content = args.content.unwrap_or_default();
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent).with_context(|| {
                    format!("failed to create parent directory for: {display_path}")
                })?;
            }
            fs::write(&target, content.as_bytes())
                .with_context(|| format!("failed to write file: {display_path}"))?;
            Ok(json!({
                "mode": "write",
                "path": display_path,
                "bytes_written": content.as_bytes().len(),
            }))
        }
        "append" => {
            let content = args.content.unwrap_or_default();
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent).with_context(|| {
                    format!("failed to create parent directory for: {display_path}")
                })?;
            }
            let mut existing = if target.exists() {
                fs::read(&target)
                    .with_context(|| format!("failed to read file for append: {display_path}"))?
            } else {
                Vec::new()
            };
            existing.extend_from_slice(content.as_bytes());
            fs::write(&target, existing)
                .with_context(|| format!("failed to append file: {display_path}"))?;
            Ok(json!({
                "mode": "append",
                "path": display_path,
                "bytes_written": content.as_bytes().len(),
            }))
        }
        "delete" => {
            if !target.exists() {
                bail!("path not found: {display_path}");
            }
            if target.is_dir() {
                bail!("directory deletion is not supported");
            }
            fs::remove_file(&target)
                .with_context(|| format!("failed to delete file: {display_path}"))?;
            Ok(json!({
                "mode": "delete",
                "path": display_path,
            }))
        }
        _ => bail!("filesystem.read_write mode must be read, write, append, or delete."),
    }
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
