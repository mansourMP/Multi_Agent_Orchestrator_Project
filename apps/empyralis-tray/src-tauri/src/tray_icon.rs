use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use tauri::image::Image;
use tauri::menu::{CheckMenuItem, CheckMenuItemBuilder, MenuBuilder, MenuItem, MenuItemBuilder};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Runtime};

use crate::process_manager::{ProcessManager, TrayStatus};

const TRAY_ID: &str = "empyralis-tray";
const MENU_STATUS_ID: &str = "status";
const MENU_WORKSPACE_ID: &str = "workspace";
const MENU_CONNECT_ID: &str = "connect";
const MENU_GATEWAY_ID: &str = "gateway";
const MENU_LAUNCH_AT_LOGIN_ID: &str = "launch_at_login";
const MENU_USAGE_TITLE_ID: &str = "usage_title";
const MENU_USAGE_VALUE_ID: &str = "usage_value";
const MENU_LOCAL_TITLE_ID: &str = "local_title";
const MENU_SUPERVISOR_ID: &str = "supervisor";
const MENU_LOCAL_GATEWAY_ID: &str = "local_gateway";
const MENU_SESSION_ID: &str = "session";
const MENU_HEARTBEAT_ID: &str = "heartbeat";
const MENU_QUIT_ID: &str = "quit";
const ACTIVE_ICON_FRAMES: usize = 16;
const CONNECTING_ICON_FRAMES: usize = 4;

struct NativeTrayMenu<R: Runtime> {
    status: MenuItem<R>,
    workspace: MenuItem<R>,
    connect: MenuItem<R>,
    gateway: MenuItem<R>,
    launch_at_login: CheckMenuItem<R>,
    usage_value: MenuItem<R>,
    supervisor: MenuItem<R>,
    local_gateway: MenuItem<R>,
    session: MenuItem<R>,
    heartbeat: MenuItem<R>,
}

pub fn install<R: Runtime>(
    app: AppHandle<R>,
    manager: Arc<ProcessManager>,
) -> Result<(), Box<dyn std::error::Error>> {
    let status = MenuItemBuilder::with_id(MENU_STATUS_ID, "Empyralis Hardware")
        .enabled(false)
        .build(&app)?;
    let workspace = MenuItemBuilder::with_id(MENU_WORKSPACE_ID, "Workspace: Not verified")
        .enabled(false)
        .build(&app)?;
    let connect = MenuItemBuilder::with_id(MENU_CONNECT_ID, "Connect Device").build(&app)?;
    let gateway = MenuItemBuilder::with_id(MENU_GATEWAY_ID, "Start Gateway").build(&app)?;
    let launch_at_login = CheckMenuItemBuilder::with_id(MENU_LAUNCH_AT_LOGIN_ID, "Launch at login")
        .checked(false)
        .build(&app)?;
    let usage_title = MenuItemBuilder::with_id(MENU_USAGE_TITLE_ID, "Usage")
        .enabled(false)
        .build(&app)?;
    let usage_value = MenuItemBuilder::with_id(MENU_USAGE_VALUE_ID, "Usage unavailable")
        .enabled(false)
        .build(&app)?;
    let local_title = MenuItemBuilder::with_id(MENU_LOCAL_TITLE_ID, "Local status")
        .enabled(false)
        .build(&app)?;
    let supervisor = MenuItemBuilder::with_id(MENU_SUPERVISOR_ID, "Supervisor: Off")
        .enabled(false)
        .build(&app)?;
    let local_gateway = MenuItemBuilder::with_id(MENU_LOCAL_GATEWAY_ID, "Gateway: Off")
        .enabled(false)
        .build(&app)?;
    let session = MenuItemBuilder::with_id(MENU_SESSION_ID, "Session verified: Off")
        .enabled(false)
        .build(&app)?;
    let heartbeat = MenuItemBuilder::with_id(MENU_HEARTBEAT_ID, "Heartbeat fresh: Off")
        .enabled(false)
        .build(&app)?;
    let quit = MenuItemBuilder::with_id(MENU_QUIT_ID, "Quit Empyralis").build(&app)?;

    let menu = MenuBuilder::new(&app)
        .item(&status)
        .item(&workspace)
        .separator()
        .item(&connect)
        .item(&gateway)
        .item(&launch_at_login)
        .separator()
        .item(&usage_title)
        .item(&usage_value)
        .separator()
        .item(&local_title)
        .item(&supervisor)
        .item(&local_gateway)
        .item(&session)
        .item(&heartbeat)
        .separator()
        .item(&quit)
        .build()?;

    let native_menu = Arc::new(NativeTrayMenu {
        status,
        workspace,
        connect,
        gateway,
        launch_at_login,
        usage_value,
        supervisor,
        local_gateway,
        session,
        heartbeat,
    });
    update_native_menu(&native_menu, &manager.status());

    let menu_for_events = native_menu.clone();
    let tray = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip("Empyralis Hardware")
        .icon(icon_idle()?)
        .icon_as_template(true)
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event({
            let manager = manager.clone();
            move |app, event| {
                match event.id().as_ref() {
                    MENU_CONNECT_ID => {
                        let status = manager.status();
                        if status.session_verified {
                            let _ = manager.disconnect_device();
                        } else {
                            let _ = manager.connect_device();
                        }
                    }
                    MENU_GATEWAY_ID => {
                        let status = manager.status();
                        if status.gateway_running {
                            let _ = manager.stop_gateway();
                        } else {
                            let _ = manager.start_gateway();
                        }
                    }
                    MENU_LAUNCH_AT_LOGIN_ID => {
                        let status = manager.status();
                        let _ = manager.set_launch_at_login(!status.launch_at_login);
                    }
                    MENU_QUIT_ID => app.exit(0),
                    _ => {}
                }
                let status = manager.status();
                update_native_menu(&menu_for_events, &status);
                update_tray_icon(app, &manager, &status);
            }
        })
        .build(&app)?;

    let app_for_timer = app.clone();
    let menu_for_timer = native_menu.clone();
    thread::spawn(move || {
        let frame = AtomicUsize::new(0);
        loop {
            let status = manager.status();
            update_native_menu(&menu_for_timer, &status);
            let icon = match status.state.as_str() {
                "active" => icon_active(frame.fetch_add(1, Ordering::Relaxed) % ACTIVE_ICON_FRAMES),
                "connecting" => {
                    icon_connecting(frame.fetch_add(1, Ordering::Relaxed) % CONNECTING_ICON_FRAMES)
                }
                "connected" => icon_connected(),
                "error" => icon_error(),
                _ => icon_idle(),
            };
            if let Ok(icon) = icon {
                tray.set_icon(Some(icon)).ok();
            } else {
                update_tray_icon(&app_for_timer, &manager, &status);
            }
            thread::sleep(Duration::from_millis(match status.state.as_str() {
                "active" => 75,
                "connecting" => 500,
                _ => 1400,
            }));
        }
    });

    Ok(())
}

fn update_native_menu<R: Runtime>(menu: &NativeTrayMenu<R>, status: &TrayStatus) {
    let state = status_label(status);
    let _ = menu
        .status
        .set_text(format!("{state} - {}", status.device_name));
    let _ = menu
        .workspace
        .set_text(format!("Workspace: {}", workspace_label(status)));
    let _ = menu.connect.set_text(if status.session_verified {
        "Disconnect Device"
    } else if status.desired_connected {
        "Reconnect Device"
    } else {
        "Connect Device"
    });
    let _ = menu.gateway.set_text(if status.gateway_running {
        "Stop Gateway"
    } else {
        "Start Gateway"
    });
    let _ = menu.launch_at_login.set_checked(status.launch_at_login);
    let _ = menu.usage_value.set_text("Usage unavailable");
    let _ = menu
        .supervisor
        .set_text(format!("Supervisor: {}", on_off(status.supervisor_running)));
    let _ = menu
        .local_gateway
        .set_text(format!("Gateway: {}", on_off(status.gateway_running)));
    let _ = menu.session.set_text(format!(
        "Session verified: {}",
        on_off(status.session_verified)
    ));
    let _ = menu.heartbeat.set_text(format!(
        "Heartbeat fresh: {}",
        on_off(status.heartbeat_fresh)
    ));
}

fn status_label(status: &TrayStatus) -> &'static str {
    if status
        .error
        .as_ref()
        .map(|error| !error.is_empty())
        .unwrap_or(false)
    {
        "Error"
    } else if status.session_verified && status.state == "active" {
        "Active"
    } else if status.state == "connecting" || status.desired_connected {
        "Connecting"
    } else {
        "Idle"
    }
}

fn workspace_label(status: &TrayStatus) -> String {
    if let Some(error) = status.error.as_ref().filter(|error| !error.is_empty()) {
        return error.clone();
    }
    if status.session_verified {
        return "Verified with this workspace".to_string();
    }
    if status.session_status != "none" && !status.session_status.is_empty() {
        return status.session_status.clone();
    }
    "Not verified".to_string()
}

fn on_off(enabled: bool) -> &'static str {
    if enabled {
        "On"
    } else {
        "Off"
    }
}

fn update_tray_icon<R: Runtime>(app: &AppHandle<R>, manager: &ProcessManager, status: &TrayStatus) {
    let icon = match status.state.as_str() {
        "active" => icon_active(0),
        "connecting" => icon_connecting(0),
        "connected" => icon_connected(),
        "error" => icon_error(),
        _ => icon_idle(),
    };
    if let (Some(tray), Ok(icon)) = (app.tray_by_id(TRAY_ID), icon) {
        let _ = tray.set_icon(Some(icon));
    }
    let _ = manager;
}

fn icon_idle() -> Result<Image<'static>, tauri::Error> {
    Image::from_bytes(include_bytes!("../icons/frames/tray-idle.png"))
}

fn icon_connected() -> Result<Image<'static>, tauri::Error> {
    Image::from_bytes(include_bytes!("../icons/frames/tray-connected.png"))
}

fn icon_error() -> Result<Image<'static>, tauri::Error> {
    Image::from_bytes(include_bytes!("../icons/frames/tray-error.png"))
}

fn icon_active(index: usize) -> Result<Image<'static>, tauri::Error> {
    match index {
        1 => Image::from_bytes(include_bytes!("../icons/frames/tray-active-2.png")),
        2 => Image::from_bytes(include_bytes!("../icons/frames/tray-active-3.png")),
        3 => Image::from_bytes(include_bytes!("../icons/frames/tray-active-4.png")),
        4 => Image::from_bytes(include_bytes!("../icons/frames/tray-active-5.png")),
        5 => Image::from_bytes(include_bytes!("../icons/frames/tray-active-6.png")),
        6 => Image::from_bytes(include_bytes!("../icons/frames/tray-active-7.png")),
        7 => Image::from_bytes(include_bytes!("../icons/frames/tray-active-8.png")),
        8 => Image::from_bytes(include_bytes!("../icons/frames/tray-active-9.png")),
        9 => Image::from_bytes(include_bytes!("../icons/frames/tray-active-10.png")),
        10 => Image::from_bytes(include_bytes!("../icons/frames/tray-active-11.png")),
        11 => Image::from_bytes(include_bytes!("../icons/frames/tray-active-12.png")),
        12 => Image::from_bytes(include_bytes!("../icons/frames/tray-active-13.png")),
        13 => Image::from_bytes(include_bytes!("../icons/frames/tray-active-14.png")),
        14 => Image::from_bytes(include_bytes!("../icons/frames/tray-active-15.png")),
        15 => Image::from_bytes(include_bytes!("../icons/frames/tray-active-16.png")),
        _ => Image::from_bytes(include_bytes!("../icons/frames/tray-active-1.png")),
    }
}

fn icon_connecting(index: usize) -> Result<Image<'static>, tauri::Error> {
    match index {
        1 => Image::from_bytes(include_bytes!("../icons/frames/tray-connecting-2.png")),
        2 => Image::from_bytes(include_bytes!("../icons/frames/tray-connecting-3.png")),
        3 => Image::from_bytes(include_bytes!("../icons/frames/tray-connecting-4.png")),
        _ => Image::from_bytes(include_bytes!("../icons/frames/tray-connecting-1.png")),
    }
}
