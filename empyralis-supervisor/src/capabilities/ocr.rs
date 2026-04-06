use anyhow::{bail, Context, Result};
use base64::Engine;
use serde_json::{json, Value};
use std::fs;
use std::process::Command;
use uuid::Uuid;

pub fn read_screen_text(arguments: &Value) -> Result<Value> {
    if Command::new("tesseract")
        .arg("--version")
        .output()
        .is_err()
    {
        bail!("tesseract is not installed on this machine");
    }
    let captured = crate::capabilities::screenshot::capture(arguments)?;
    let images = captured
        .get("images")
        .and_then(Value::as_array)
        .ok_or_else(|| anyhow::anyhow!("screenshot.capture returned no images"))?;
    let first = images
        .first()
        .ok_or_else(|| anyhow::anyhow!("screenshot.capture returned no images"))?;
    let encoded = first
        .get("data_base64")
        .and_then(Value::as_str)
        .ok_or_else(|| anyhow::anyhow!("screenshot.capture returned invalid image payload"))?;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(encoded)
        .context("failed to decode screenshot image")?;

    let temp_path = std::env::temp_dir().join(format!("empyralis-ocr-{}.png", Uuid::new_v4()));
    fs::write(&temp_path, bytes).context("failed to write OCR temp image")?;

    let output = Command::new("tesseract")
        .arg(&temp_path)
        .arg("stdout")
        .output()
        .context("failed to invoke tesseract")?;
    let _ = fs::remove_file(&temp_path);
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        if !stderr.is_empty() {
            bail!("{stderr}");
        }
        bail!("tesseract OCR failed");
    }

    Ok(json!({
        "text": String::from_utf8_lossy(&output.stdout).trim().to_string(),
    }))
}
