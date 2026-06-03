use std::sync::Arc;

use tauri::{AppHandle, State};
use tauri_plugin_notification::NotificationExt;

use crate::process_manager::{ProcessManager, TrayStatus};

#[tauri::command]
pub fn connect_device(manager: State<'_, Arc<ProcessManager>>) -> Result<TrayStatus, String> {
    manager.connect_device()
}

#[tauri::command]
pub fn disconnect_device(manager: State<'_, Arc<ProcessManager>>) -> Result<TrayStatus, String> {
    manager.disconnect_device()
}

#[tauri::command]
pub fn get_status(manager: State<'_, Arc<ProcessManager>>) -> Result<TrayStatus, String> {
    Ok(manager.status())
}

#[tauri::command]
pub fn start_gateway(manager: State<'_, Arc<ProcessManager>>) -> Result<TrayStatus, String> {
    manager.start_gateway()
}

#[tauri::command]
pub fn stop_gateway(manager: State<'_, Arc<ProcessManager>>) -> Result<TrayStatus, String> {
    manager.stop_gateway()
}

#[tauri::command]
pub fn set_launch_at_login(manager: State<'_, Arc<ProcessManager>>, enabled: bool) -> Result<TrayStatus, String> {
    manager.set_launch_at_login(enabled)
}

#[tauri::command]
pub fn notify(app: AppHandle, title: String, body: String) -> Result<(), String> {
    app.notification()
        .builder()
        .title(title)
        .body(body)
        .show()
        .map_err(|error| error.to_string())
}
