use anyhow::{bail, Context, Result};
use enigo::{Button, Coordinate, Direction, Enigo, Key, Keyboard, Mouse, Settings};
use serde::Deserialize;
use serde_json::{json, Value};
use tokio::time::{sleep, Duration};

#[derive(Debug, Deserialize)]
struct ClickArguments {
    x: Option<i32>,
    y: Option<i32>,
    text: Option<String>,
    button: String,
    double: bool,
}

#[derive(Debug, Deserialize)]
struct TypeArguments {
    text: String,
    delay_ms: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct KeyArguments {
    key: String,
}

pub fn click(arguments: &Value) -> Result<Value> {
    let args: ClickArguments = serde_json::from_value(arguments.clone())
        .context("invalid computer_control.click arguments")?;
    let (click_x, click_y, matched_text) = if let (Some(x), Some(y)) = (args.x, args.y) {
        (x, y, None)
    } else if args.text.as_deref().map(str::trim).filter(|value| !value.is_empty()).is_some() {
        let resolved = crate::capabilities::ocr::find_text_center(arguments)?;
        let x = resolved
            .get("x")
            .and_then(Value::as_i64)
            .ok_or_else(|| anyhow::anyhow!("OCR text resolution did not return x"))? as i32;
        let y = resolved
            .get("y")
            .and_then(Value::as_i64)
            .ok_or_else(|| anyhow::anyhow!("OCR text resolution did not return y"))? as i32;
        let matched = resolved
            .get("matched_text")
            .and_then(Value::as_str)
            .map(|value| value.to_string());
        (x, y, matched)
    } else {
        bail!("computer_control.click requires x/y or text");
    };
    let mut enigo = Enigo::new(&Settings::default()).context("failed to initialize enigo")?;
    enigo
        .move_mouse(click_x, click_y, Coordinate::Abs)
        .context("failed to move mouse")?;
    let button = parse_button(&args.button)?;
    enigo
        .button(button, Direction::Click)
        .context("failed to click mouse")?;
    if args.double {
        enigo
            .button(button, Direction::Click)
            .context("failed to double click mouse")?;
    }
    Ok(json!({
        "clicked": true,
        "x": click_x,
        "y": click_y,
        "matched_text": matched_text,
    }))
}

pub async fn type_text(arguments: &Value) -> Result<Value> {
    let args: TypeArguments = serde_json::from_value(arguments.clone())
        .context("invalid computer_control.type arguments")?;
    let mut enigo = Enigo::new(&Settings::default()).context("failed to initialize enigo")?;
    if let Some(delay_ms) = args.delay_ms {
        for ch in args.text.chars() {
            enigo
                .text(&ch.to_string())
                .context("failed while typing text")?;
            sleep(Duration::from_millis(delay_ms)).await;
        }
    } else {
        enigo.text(&args.text).context("failed to type text")?;
    }
    Ok(json!({ "typed": true, "length": args.text.chars().count() }))
}

pub fn press_key(arguments: &Value) -> Result<Value> {
    let args: KeyArguments = serde_json::from_value(arguments.clone())
        .context("invalid computer_control.key arguments")?;
    let mut enigo = Enigo::new(&Settings::default()).context("failed to initialize enigo")?;
    let keys = parse_key_combo(&args.key)?;
    let (modifiers, main_key) = split_modifiers(keys);

    for key in &modifiers {
        enigo
            .key(*key, Direction::Press)
            .context("failed to press modifier")?;
    }
    enigo
        .key(main_key, Direction::Click)
        .context("failed to press key")?;
    for key in modifiers.iter().rev() {
        enigo
            .key(*key, Direction::Release)
            .context("failed to release modifier")?;
    }
    Ok(json!({ "pressed": true }))
}

fn parse_button(button: &str) -> Result<Button> {
    match button {
        "left" => Ok(Button::Left),
        "right" => Ok(Button::Right),
        "middle" => Ok(Button::Middle),
        _ => bail!("unsupported mouse button: {button}"),
    }
}

fn parse_key_combo(combo: &str) -> Result<Vec<Key>> {
    let mut keys = Vec::new();
    for part in combo.split('+') {
        let normalized = part.trim().to_lowercase();
        let key = match normalized.as_str() {
            "ctrl" | "control" => Key::Control,
            "alt" | "option" => Key::Alt,
            "shift" => Key::Shift,
            "cmd" | "command" | "meta" | "super" => Key::Meta,
            "enter" | "return" => Key::Return,
            "escape" | "esc" => Key::Escape,
            "tab" => Key::Tab,
            "space" => Key::Space,
            "backspace" => Key::Backspace,
            "delete" => Key::Delete,
            "up" => Key::UpArrow,
            "down" => Key::DownArrow,
            "left" => Key::LeftArrow,
            "right" => Key::RightArrow,
            "home" => Key::Home,
            "end" => Key::End,
            "pageup" => Key::PageUp,
            "pagedown" => Key::PageDown,
            _ if normalized.len() == 1 => Key::Unicode(normalized.chars().next().unwrap()),
            _ => bail!("unsupported key token: {normalized}"),
        };
        keys.push(key);
    }
    if keys.is_empty() {
        bail!("key combination cannot be empty");
    }
    Ok(keys)
}

fn split_modifiers(mut keys: Vec<Key>) -> (Vec<Key>, Key) {
    let main_key = keys.pop().unwrap_or(Key::Return);
    (keys, main_key)
}
