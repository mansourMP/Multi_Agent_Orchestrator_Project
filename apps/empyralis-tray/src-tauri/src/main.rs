mod commands;
mod process_manager;
mod status;
mod tray_icon;

use std::sync::Arc;
use std::thread;
use std::time::Duration;

use process_manager::ProcessManager;
use tauri::{Manager, RunEvent};

const POPOVER_LABEL: &str = "tray-popover";

fn main() {
    let manager = Arc::new(ProcessManager::new());

    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .manage(manager.clone())
        .invoke_handler(tauri::generate_handler![
            commands::connect_device,
            commands::disconnect_device,
            commands::get_status,
            commands::start_gateway,
            commands::stop_gateway,
            commands::set_launch_at_login,
            commands::notify,
        ])
        .setup(move |app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            status::start_status_server(manager.clone(), app.handle().clone());
            tray_icon::install(app.handle().clone(), manager.clone())?;
            let recovery_manager = manager.clone();
            thread::spawn(move || loop {
                recovery_manager.maintain_connection();
                thread::sleep(Duration::from_secs(3));
            });

            if let Some(window) = app.get_webview_window(POPOVER_LABEL) {
                let _ = window.hide();
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("failed to build Empyralis tray")
        .run(|app, event| {
            if matches!(event, RunEvent::Exit | RunEvent::ExitRequested { .. }) {
                let manager = app.state::<Arc<ProcessManager>>();
                let _ = manager.disconnect_device();
            }
        });
}
