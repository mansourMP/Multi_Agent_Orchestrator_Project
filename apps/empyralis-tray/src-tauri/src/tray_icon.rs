use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use tauri::image::Image;
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, Runtime};

use crate::process_manager::ProcessManager;
use crate::POPOVER_LABEL;

const TRAY_ID: &str = "empyralis-tray";
const MENU_STATUS_ID: &str = "status";
const MENU_CONNECT_ID: &str = "connect";
const MENU_DISCONNECT_ID: &str = "disconnect";
const MENU_QUIT_ID: &str = "quit";

pub fn install<R: Runtime>(app: AppHandle<R>, manager: Arc<ProcessManager>) -> Result<(), Box<dyn std::error::Error>> {
    let status = MenuItemBuilder::with_id(MENU_STATUS_ID, "Empyralis Hardware")
        .enabled(false)
        .build(&app)?;
    let connect = MenuItemBuilder::with_id(MENU_CONNECT_ID, "Connect this device").build(&app)?;
    let disconnect = MenuItemBuilder::with_id(MENU_DISCONNECT_ID, "Disconnect").build(&app)?;
    let quit = MenuItemBuilder::with_id(MENU_QUIT_ID, "Quit").build(&app)?;
    let menu = MenuBuilder::new(&app)
        .item(&status)
        .separator()
        .item(&connect)
        .item(&disconnect)
        .separator()
        .item(&quit)
        .build()?;

    let tray = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip("Empyralis Hardware")
        .icon(icon_idle()?)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| {
            if matches!(
                event,
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                }
            ) {
                toggle_popover(tray.app_handle());
            }
        })
        .on_menu_event({
            let manager = manager.clone();
            move |app, event| match event.id().as_ref() {
                MENU_CONNECT_ID => {
                    let _ = manager.connect_device();
                    update_tray_icon(app, &manager);
                }
                MENU_DISCONNECT_ID => {
                    let _ = manager.disconnect_device();
                    update_tray_icon(app, &manager);
                }
                MENU_QUIT_ID => app.exit(0),
                _ => {}
            }
        })
        .build(&app)?;

    let app_for_timer = app.clone();
    thread::spawn(move || {
        let frame = AtomicUsize::new(0);
        loop {
            let status = manager.status();
            let icon = match status.state.as_str() {
                "active" => icon_active(frame.fetch_add(1, Ordering::Relaxed) % 3),
                "connected" => icon_connected(),
                _ => icon_idle(),
            };
            if let Ok(icon) = icon {
                tray.set_icon(Some(icon)).ok();
            } else {
                update_tray_icon(&app_for_timer, &manager);
            }
            thread::sleep(Duration::from_millis(if status.state == "active" { 450 } else { 1400 }));
        }
    });

    Ok(())
}

fn toggle_popover<R: Runtime>(app: &AppHandle<R>) {
    let Some(window) = app.get_webview_window(POPOVER_LABEL) else {
        return;
    };
    if window.is_visible().unwrap_or(false) {
        let _ = window.hide();
    } else {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn update_tray_icon<R: Runtime>(app: &AppHandle<R>, manager: &ProcessManager) {
    let status = manager.status();
    let icon = match status.state.as_str() {
        "active" => icon_active(0),
        "connected" => icon_connected(),
        _ => icon_idle(),
    };
    if let (Some(tray), Ok(icon)) = (app.tray_by_id(TRAY_ID), icon) {
        let _ = tray.set_icon(Some(icon));
    }
}

fn icon_idle() -> Result<Image<'static>, tauri::Error> {
    Image::from_bytes(include_bytes!("../icons/tray-idle.png"))
}

fn icon_connected() -> Result<Image<'static>, tauri::Error> {
    Image::from_bytes(include_bytes!("../icons/tray-connected.png"))
}

fn icon_active(index: usize) -> Result<Image<'static>, tauri::Error> {
    match index {
        1 => Image::from_bytes(include_bytes!("../icons/tray-active-2.png")),
        2 => Image::from_bytes(include_bytes!("../icons/tray-active-3.png")),
        _ => Image::from_bytes(include_bytes!("../icons/tray-active-1.png")),
    }
}
