use std::fs;
use std::path::Path;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::webview::PageLoadEvent;
use tauri::{Emitter, Manager, RunEvent};

static HWID_CACHE: Mutex<Option<String>> = Mutex::new(None);
static BROWSER_LOGIN_IMPORT_IN_PROGRESS: AtomicBool = AtomicBool::new(false);
const HTTP_TIMEOUT_SECONDS: u64 = 30;

fn build_http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(HTTP_TIMEOUT_SECONDS))
        .build()
        .map_err(|_| String::new())
}

#[derive(serde::Serialize, serde::Deserialize)]
struct KeyCache {
    key: String,
    expires_at: i64,
}

#[derive(Default, serde::Serialize)]
struct ImportDroppedScriptsResult {
    added: Vec<String>,
    duplicates: Vec<String>,
    rejected: Vec<String>,
}

mod accounts;
mod cookies;
mod exec_server;
mod execution;
mod filtering;
mod history;
mod logs;
mod rpc;

#[derive(Clone, serde::Serialize)]
struct TrayScriptEventPayload {
    name: String,
    content: String,
}

#[tauri::command]
fn close_window(window: tauri::Window) -> Result<(), String> {
    if window.label() == "main" {
        clear_rpc_presence_for_shutdown();
    }

    window.close().map_err(|_| String::new())
}

fn clear_rpc_presence_for_shutdown() {
    let _ = rpc::clear_for_shutdown();
}

#[tauri::command]
fn minimize_window(window: tauri::Window) -> Result<(), String> {
    window.minimize().map_err(|_| String::new())
}

#[tauri::command]
fn toggle_maximize_window(window: tauri::Window) -> Result<(), String> {
    match window.is_fullscreen() {
        Ok(true) => window.set_fullscreen(false).map_err(|_| String::new()),
        Ok(false) => window.set_fullscreen(true).map_err(|_| String::new()),
        Err(_) => Err(String::new()),
    }
}

#[tauri::command]
fn open_console_window(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;

    fn bring_window_to_front(window: &tauri::WebviewWindow) -> Result<(), String> {
        window.show().map_err(|_| String::new())?;
        window.unminimize().map_err(|_| String::new())?;
        window.set_focus().map_err(|_| String::new())?;
        window.set_always_on_top(true).map_err(|_| String::new())?;
        window.set_always_on_top(false).map_err(|_| String::new())?;
        Ok(())
    }

    if let Some(window) = app.get_webview_window("console") {
        bring_window_to_front(&window)?;
        return Ok(());
    }

    let window = tauri::WebviewWindowBuilder::new(
        &app,
        "console",
        tauri::WebviewUrl::App("index.html?mode=console".into()),
    )
    .title("Console")
    .inner_size(800.0, 500.0)
    .min_inner_size(400.0, 300.0)
    .decorations(false)
    .transparent(true)
    .build()
    .map_err(|_| String::new())?;

    bring_window_to_front(&window)?;

    Ok(())
}

#[tauri::command]
fn start_roblox_browser_login(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(not(target_os = "macos"))]
    let _ = app;

    #[cfg(target_os = "macos")]
    {
        fn focus_window(window: &tauri::WebviewWindow) -> Result<(), String> {
            window.show().map_err(|_| String::new())?;
            window.unminimize().map_err(|_| String::new())?;
            window.set_focus().map_err(|_| String::new())?;
            Ok(())
        }

        if let Some(existing_window) = app.get_webview_window("roblox-login") {
            focus_window(&existing_window)?;
            return Ok(());
        }

        let login_url = "https://www.roblox.com/login"
            .parse()
            .map_err(|_| String::new())?;
        let app_handle = app.clone();

        let login_window = tauri::WebviewWindowBuilder::new(
            &app,
            "roblox-login",
            tauri::WebviewUrl::External(login_url),
        )
        .title("Roblox Login")
        .inner_size(920.0, 760.0)
        .min_inner_size(720.0, 560.0)
        .resizable(true)
        .incognito(true)
        .on_page_load(move |window, payload| {
            if payload.event() != PageLoadEvent::Finished {
                return;
            }

            let cookies = match window.cookies() {
                Ok(cookies) => cookies,
                Err(_) => {
                    if let Some(main_window) = app_handle.get_webview_window("main") {
                        let _ = main_window.emit("browser-login-error", "login failed");
                    }
                    return;
                }
            };

            let roblox_cookie = cookies.into_iter().find_map(|cookie| {
                if cookie.name() != ".ROBLOSECURITY" {
                    return None;
                }

                let domain = cookie
                    .domain()
                    .map(|value| value.to_ascii_lowercase())
                    .unwrap_or_default();
                if !domain.contains("roblox.com") {
                    return None;
                }

                let value = cookie.value().trim();
                if value.is_empty() {
                    return None;
                }

                Some(value.to_string())
            });

            let Some(roblox_cookie) = roblox_cookie else {
                return;
            };

            if BROWSER_LOGIN_IMPORT_IN_PROGRESS
                .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
                .is_err()
            {
                return;
            }

            let app_handle_for_task = app_handle.clone();
            tauri::async_runtime::spawn(async move {
                let add_result = accounts::add_account(roblox_cookie).await;

                match add_result {
                    Ok(account) => {
                        if let Some(main_window) = app_handle_for_task.get_webview_window("main") {
                            let _ = main_window.emit("browser-login-account-added", &account);
                        }
                        if let Some(login_window) =
                            app_handle_for_task.get_webview_window("roblox-login")
                        {
                            let _ = login_window.close();
                        }
                    }
                    Err(_) => {
                        if let Some(main_window) = app_handle_for_task.get_webview_window("main") {
                            let _ = main_window.emit("browser-login-error", "login failed");
                        }
                    }
                }

                BROWSER_LOGIN_IMPORT_IN_PROGRESS.store(false, Ordering::SeqCst);
            });
        })
        .build()
        .map_err(|_| String::new())?;

        focus_window(&login_window)?;
        Ok(())
    }

    #[cfg(not(target_os = "macos"))]
    Ok(())
}

#[tauri::command]
fn cancel_roblox_browser_login(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        if let Some(window) = app.get_webview_window("roblox-login") {
            window.close().map_err(|_| String::new())?;
        }
        BROWSER_LOGIN_IMPORT_IN_PROGRESS.store(false, Ordering::SeqCst);
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
    }

    Ok(())
}

#[cfg(target_os = "macos")]
fn get_tray_order_from_explorer() -> Option<Vec<String>> {
    let app_data = get_app_data_dir().ok()?;
    let explorer_path = app_data.join("explorer.json");
    let explorer_content = fs::read_to_string(explorer_path).ok()?;
    let explorer_json: serde_json::Value = serde_json::from_str(&explorer_content).ok()?;

    let tray_folder_id = "folder-Tray";
    let tray_file_prefix = format!("{}-", tray_folder_id);

    let ordered_ids = explorer_json
        .get("treeOrder")
        .and_then(|tree_order| tree_order.get(tray_folder_id))
        .and_then(|value| value.as_array())?;

    let mut ordered_names = Vec::new();
    for id_value in ordered_ids {
        let Some(id_str) = id_value.as_str() else {
            continue;
        };
        let Some(file_name) = id_str.strip_prefix(&tray_file_prefix) else {
            continue;
        };
        ordered_names.push(file_name.to_string());
    }

    Some(ordered_names)
}

#[cfg(target_os = "macos")]
fn collect_tray_scripts() -> Vec<(String, PathBuf)> {
    let mut fs_scripts: Vec<(String, PathBuf)> = Vec::new();

    if let Ok(tray_path) = ensure_tray_folder_exists() {
        if let Ok(entries) = fs::read_dir(tray_path) {
            for entry in entries.flatten() {
                let file_type = match entry.file_type() {
                    Ok(file_type) => file_type,
                    Err(_) => continue,
                };
                if !file_type.is_file() {
                    continue;
                }

                let file_name = entry.file_name().to_string_lossy().to_string();
                if file_name.starts_with('.') {
                    continue;
                }

                let lower_name = file_name.to_ascii_lowercase();
                if !(lower_name.ends_with(".lua")
                    || lower_name.ends_with(".luau")
                    || lower_name.ends_with(".txt"))
                {
                    continue;
                }

                fs_scripts.push((file_name, entry.path()));
            }
        }
    }

    if fs_scripts.is_empty() {
        return fs_scripts;
    }

    let Some(ordered_names) = get_tray_order_from_explorer() else {
        return fs_scripts.into_iter().take(10).collect();
    };

    let mut remaining_by_name = std::collections::HashMap::new();
    for (name, path) in &fs_scripts {
        remaining_by_name.insert(name.clone(), path.clone());
    }

    let mut ordered_scripts: Vec<(String, PathBuf)> = Vec::new();
    for ordered_name in ordered_names {
        if ordered_scripts.len() >= 10 {
            break;
        }
        if let Some(path) = remaining_by_name.remove(&ordered_name) {
            ordered_scripts.push((ordered_name, path));
        }
    }

    if ordered_scripts.len() < 10 {
        for (name, path) in fs_scripts {
            if ordered_scripts.len() >= 10 {
                break;
            }
            if remaining_by_name.remove(&name).is_some() {
                ordered_scripts.push((name, path));
            }
        }
    }

    ordered_scripts
}

#[cfg(target_os = "macos")]
fn build_menu_bar_tray_menu(
    app: &tauri::AppHandle,
) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
    use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};

    let show_item = MenuItem::with_id(app, "show", "Show Celestial", true, None::<&str>)?;
    let show_console_item =
        MenuItem::with_id(app, "show-console", "Show Console", true, None::<&str>)?;
    let separator_after_show_console = PredefinedMenuItem::separator(app)?;
    let separator_before_quit = PredefinedMenuItem::separator(app)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit Celestial UI", true, None::<&str>)?;

    let tray_menu = Menu::new(app)?;
    tray_menu.append(&show_item)?;
    tray_menu.append(&show_console_item)?;
    tray_menu.append(&separator_after_show_console)?;

    for (index, (script_name, _)) in collect_tray_scripts().into_iter().enumerate() {
        let menu_id = format!("tray-script-{}", index);
        let item = MenuItem::with_id(app, menu_id, script_name, true, None::<&str>)?;
        tray_menu.append(&item)?;
    }

    tray_menu.append(&separator_before_quit)?;
    tray_menu.append(&quit_item)?;

    Ok(tray_menu)
}

#[cfg(target_os = "macos")]
fn build_app_menu(app: &tauri::AppHandle) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
    use tauri::menu::{AboutMetadata, MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};

    let package_name = app.package_info().name.clone();
    let about_metadata = AboutMetadata {
        name: Some(package_name.clone()),
        version: Some(app.package_info().version.to_string()),
        copyright: app.config().bundle.copyright.clone(),
        authors: app.config().bundle.publisher.clone().map(|publisher| vec![publisher]),
        ..Default::default()
    };

    let hide_app_item = MenuItemBuilder::with_id("hide-app-shortcut", format!("Hide {package_name}"))
        .accelerator("Cmd+W")
        .build(app)?;
    let fullscreen_item = MenuItemBuilder::with_id("toggle-fullscreen-shortcut", "Enter Full Screen")
        .build(app)?;

    let app_submenu = SubmenuBuilder::new(app, &package_name)
        .item(&PredefinedMenuItem::about(app, None, Some(about_metadata))?)
        .separator()
        .services()
        .separator()
        .item(&hide_app_item)
        .hide_others()
        .show_all()
        .separator()
        .quit()
        .build()?;

    let edit_submenu = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;

    let view_submenu = SubmenuBuilder::new(app, "View")
        .item(&fullscreen_item)
        .build()?;

    let window_submenu = SubmenuBuilder::new(app, "Window")
        .minimize()
        .maximize()
        .build()?;

    MenuBuilder::new(app)
        .item(&app_submenu)
        .item(&edit_submenu)
        .item(&view_submenu)
        .item(&window_submenu)
        .build()
}

#[cfg(target_os = "macos")]
fn get_focused_webview_window(app: &tauri::AppHandle) -> Option<tauri::WebviewWindow> {
    app
        .webview_windows()
        .into_values()
        .find(|window| window.is_focused().unwrap_or(false))
        .or_else(|| app.get_webview_window("main"))
}

#[cfg(target_os = "macos")]
fn disable_auto_fullscreen_menu_item() {
    use objc2_foundation::{ns_string, NSUserDefaults};

    NSUserDefaults::standardUserDefaults()
        .setBool_forKey(false, ns_string!("NSFullScreenMenuItemEverywhere"));
}

#[cfg(target_os = "macos")]
fn toggle_focused_window_fullscreen(app: &tauri::AppHandle) {
    if let Some(window) = get_focused_webview_window(app) {
        if let Ok(is_fullscreen) = window.is_fullscreen() {
            let _ = window.set_fullscreen(!is_fullscreen);
        }
    }
}

#[cfg(target_os = "macos")]
fn install_fn_fullscreen_monitor(app: tauri::AppHandle) {
    use std::ptr::NonNull;

    use block2::RcBlock;
    use objc2_app_kit::{NSEvent, NSEventMask, NSEventModifierFlags};

    let monitor = RcBlock::new(move |event: NonNull<NSEvent>| -> *mut NSEvent {
        let event_ref = unsafe { event.as_ref() };
        let modifiers = event_ref.modifierFlags();
        let non_function_modifiers = NSEventModifierFlags::Shift
            | NSEventModifierFlags::Control
            | NSEventModifierFlags::Option
            | NSEventModifierFlags::Command;

        if event_ref.keyCode() == 3
            && modifiers.contains(NSEventModifierFlags::Function)
            && !modifiers.intersects(non_function_modifiers)
        {
            toggle_focused_window_fullscreen(&app);
            return std::ptr::null_mut();
        }

        event.as_ptr()
    });

    let token = unsafe {
        NSEvent::addLocalMonitorForEventsMatchingMask_handler(NSEventMask::KeyDown, &monitor)
    };

    std::mem::forget(monitor);
    if let Some(token) = token {
        std::mem::forget(token);
    }
}

#[cfg(target_os = "macos")]
fn handle_native_menu_event(app: &tauri::AppHandle, event: tauri::menu::MenuEvent) {
    match event.id().as_ref() {
        "hide-app-shortcut" => {
            let _ = app.hide();
        }
        "toggle-fullscreen-shortcut" => {
            toggle_focused_window_fullscreen(app);
        }
        _ => {}
    }
}

#[cfg(target_os = "macos")]
fn execute_tray_script(app_handle: &tauri::AppHandle, menu_id: &str) {
    use tauri::{Emitter, Manager};

    let Some(index_str) = menu_id.strip_prefix("tray-script-") else {
        return;
    };

    let Ok(index) = index_str.parse::<usize>() else {
        return;
    };

    let tray_scripts = collect_tray_scripts();
    let Some((_, script_path)) = tray_scripts.get(index) else {
        return;
    };

    match fs::read_to_string(script_path) {
        Ok(script_content) => {
            if let Some(window) = app_handle.get_webview_window("main") {
                let script_name = script_path
                    .file_name()
                    .map(|file_name| file_name.to_string_lossy().to_string())
                    .unwrap_or_else(|| "Tray Script".to_string());
                let payload = TrayScriptEventPayload {
                    name: script_name,
                    content: script_content,
                };
                let _ = window.emit("tray-execute-script", payload);
            }
        }
        Err(_) => {}
    }
}

#[cfg(target_os = "macos")]
fn update_menu_bar_tray_menu(app: &tauri::AppHandle) -> Result<(), String> {
    let tray_menu = build_menu_bar_tray_menu(app).map_err(|_| String::new())?;

    if let Some(tray) = app.tray_by_id("menu-bar") {
        tray.set_menu(Some(tray_menu)).map_err(|_| String::new())?;
        return Ok(());
    }

    create_menu_bar_tray_icon(app).map_err(|_| String::new())
}

#[cfg(target_os = "macos")]
fn create_menu_bar_tray_icon(app: &tauri::AppHandle) -> tauri::Result<()> {
    use tauri::{image::Image, tray::TrayIconBuilder, Manager};

    if app.tray_by_id("menu-bar").is_some() {
        return Ok(());
    }

    let tray_icon = Image::from_bytes(include_bytes!("../icons/menu.png"))?;
    let tray_menu = build_menu_bar_tray_menu(app)?;

    TrayIconBuilder::with_id("menu-bar")
        .icon(tray_icon)
        .icon_as_template(true)
        .menu(&tray_menu)
        .show_menu_on_left_click(true)
        .on_menu_event(move |app_handle, event| match event.id().as_ref() {
            "show" => {
                if let Some(window) = app_handle.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                }
            }
            "show-console" => {
                let _ = open_console_window(app_handle.clone());
            }
            "quit" => {
                clear_rpc_presence_for_shutdown();
                app_handle.exit(0)
            }
            _ => execute_tray_script(app_handle, event.id().as_ref()),
        })
        .build(app)?;

    Ok(())
}

#[tauri::command]
fn set_tray_icon_disabled(app: tauri::AppHandle, disabled: bool) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        if disabled {
            let _ = app.remove_tray_by_id("menu-bar");
        } else {
            create_menu_bar_tray_icon(&app).map_err(|_| String::new())?;
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, disabled);
    }

    Ok(())
}

#[tauri::command]
fn refresh_tray_menu(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        if is_tray_icon_disabled() {
            return Ok(());
        }

        update_menu_bar_tray_menu(&app)?;
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
    }

    Ok(())
}

#[tauri::command]
fn open_roblox() -> Result<(), String> {
    let roblox_path = get_roblox_app_path()?;
    std::process::Command::new("open")
        .arg(roblox_path)
        .spawn()
        .map_err(|_| String::new())?;
    Ok(())
}

fn get_scripts_folder() -> Option<PathBuf> {
    dirs::document_dir().map(|docs| docs.join("Celestial"))
}

fn sanitize_script_file_name(file_name: &str) -> Result<String, String> {
    let safe_file_name = Path::new(file_name)
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| String::new())?;

    if safe_file_name != file_name
        || safe_file_name.trim().is_empty()
        || safe_file_name.contains("..")
    {
        return Err(String::new());
    }

    Ok(safe_file_name.to_string())
}

fn is_supported_script_file_name(file_name: &str, allow_txt: bool) -> bool {
    let lower_name = file_name.to_ascii_lowercase();
    lower_name.ends_with(".lua")
        || lower_name.ends_with(".luau")
        || (allow_txt && lower_name.ends_with(".txt"))
}

fn resolve_default_scripts_target_dir() -> Result<PathBuf, String> {
    let celestial_path = ensure_scripts_folder_exists()?;

    let mut folder_name = "Scripts".to_string();
    let mut found_in_explorer = false;

    if let Ok(app_data) = get_app_data_dir() {
        let explorer_path = app_data.join("explorer.json");
        if explorer_path.exists() {
            if let Ok(explorer_content) = fs::read_to_string(explorer_path) {
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&explorer_content) {
                    if let Some(root_children) = json
                        .get("treeOrder")
                        .and_then(|t| t.get("root"))
                        .and_then(|r| r.as_array())
                    {
                        for child_id in root_children {
                            if let Some(id_str) = child_id.as_str() {
                                if let Some(name) = id_str.strip_prefix("folder-") {
                                    if name.eq_ignore_ascii_case("Tray") {
                                        continue;
                                    }
                                    folder_name = name.to_string();
                                    found_in_explorer = true;
                                    break;
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if !found_in_explorer {
        if let Ok(entries) = fs::read_dir(&celestial_path) {
            for entry in entries.flatten() {
                if let Ok(file_type) = entry.file_type() {
                    if file_type.is_dir() && !entry.file_name().to_string_lossy().starts_with('.') {
                        let candidate = entry.file_name().to_string_lossy().to_string();
                        // skip the tray because why would u want ur script there
                        if candidate.eq_ignore_ascii_case("Tray") {
                            continue;
                        }
                        folder_name = candidate;
                        break;
                    }
                }
            }
        }
    }

    let target_dir = celestial_path.join(&folder_name);

    if !target_dir.exists() {
        fs::create_dir_all(&target_dir).map_err(|_| String::new())?;
    }

    Ok(target_dir)
}

fn write_script_to_default_location(
    content: &str,
    file_name: &str,
    overwrite: bool,
) -> Result<bool, String> {
    let target_dir = resolve_default_scripts_target_dir()?;
    let file_path = target_dir.join(file_name);

    if file_path.exists() && !overwrite {
        return Ok(false);
    }

    fs::write(file_path, content).map_err(|_| String::new())?;

    Ok(true)
}

fn probe_scripts_folder_access(path: &Path) -> std::io::Result<()> {
    match fs::metadata(path) {
        Ok(metadata) => {
            if !metadata.is_dir() {
                return Err(std::io::Error::new(
                    std::io::ErrorKind::Other,
                    "Celestial scripts path is not a directory",
                ));
            }
            let _ = fs::read_dir(path)?;
            Ok(())
        }
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => fs::create_dir_all(path),
        Err(err) => Err(err),
    }
}

fn ensure_scripts_folder_exists() -> Result<PathBuf, String> {
    match get_scripts_folder() {
        Some(path) => {
            probe_scripts_folder_access(&path).map_err(|_| String::new())?;
            Ok(path)
        }
        None => Err(String::new()),
    }
}

fn ensure_tray_folder_exists() -> Result<PathBuf, String> {
    let scripts_path = ensure_scripts_folder_exists()?;
    let tray_path = scripts_path.join("Tray");
    if !tray_path.exists() {
        fs::create_dir_all(&tray_path).map_err(|_| String::new())?;
    }
    Ok(tray_path)
}

fn ensure_default_scripts_subfolder_exists() -> Result<PathBuf, String> {
    let scripts_path = ensure_scripts_folder_exists()?;
    let default_scripts_path = scripts_path.join("Scripts");
    if !default_scripts_path.exists() {
        fs::create_dir_all(&default_scripts_path).map_err(|_| String::new())?;
    }
    Ok(default_scripts_path)
}

#[tauri::command]
fn get_scripts_path() -> Result<String, String> {
    get_scripts_folder()
        .map(|p| p.to_string_lossy().to_string())
        .ok_or_else(|| String::new())
}

#[tauri::command]
fn check_documents_access() -> Result<bool, String> {
    let Some(path) = get_scripts_folder() else {
        return Ok(false);
    };

    match probe_scripts_folder_access(&path) {
        Ok(()) => Ok(true),
        Err(err) if err.kind() == std::io::ErrorKind::PermissionDenied => Ok(false),
        Err(_) => Err(String::new()),
    }
}

fn get_roblox_app_path() -> Result<PathBuf, String> {
    if let Some(home) = dirs::home_dir() {
        let user_path = home.join("Applications/Roblox.app");
        if user_path.exists() {
            return Ok(user_path);
        }
    }

    let system_path = PathBuf::from("/Applications/Roblox.app");
    if system_path.exists() {
        return Ok(system_path);
    }

    Err(String::new())
}

fn get_app_data_dir() -> Result<PathBuf, String> {
    let app_data = dirs::data_dir().ok_or_else(|| String::new())?;
    Ok(app_data.join("com.miniluv.celestial-ui"))
}

#[cfg(target_os = "macos")]
fn is_tray_icon_disabled() -> bool {
    let app_data = match get_app_data_dir() {
        Ok(dir) => dir,
        Err(_) => return true,
    };
    let settings_path = app_data.join("settings.json");
    let settings_content = match fs::read_to_string(settings_path) {
        Ok(content) => content,
        Err(_) => return true,
    };
    let settings_json: serde_json::Value = match serde_json::from_str(&settings_content) {
        Ok(json) => json,
        Err(_) => return true,
    };

    settings_json
        .get("disableTrayIcon")
        .and_then(|value| value.as_bool())
        .unwrap_or(true)
}

fn get_client_settings_path() -> Result<PathBuf, String> {
    let roblox_path = get_roblox_app_path()?;
    Ok(roblox_path.join("Contents/MacOS/ClientSettings"))
}

#[allow(dead_code)]
fn ensure_client_settings_dir() -> Result<PathBuf, String> {
    let dir_path = get_client_settings_path()?;
    if !dir_path.exists() {
        let output = std::process::Command::new("mkdir")
            .args(&["-p", dir_path.to_str().unwrap()])
            .output()
            .map_err(|_| String::new())?;

        if !output.status.success() {
            let script = format!(
                "do shell script \"mkdir -p '{}'\" with prompt \"Celestial UI needs permission to modify Roblox settings.\" with administrator privileges",
                dir_path.display()
            );
            let admin_output = std::process::Command::new("osascript")
                .args(&["-e", &script])
                .output()
                .map_err(|_| String::new())?;

            if !admin_output.status.success() {
                return Err(String::new());
            }
        }
    }
    Ok(dir_path)
}

#[tauri::command]
fn get_fps_unlock_status() -> Result<bool, String> {
    let settings_dir = match get_client_settings_path() {
        Ok(p) => p,
        Err(_) => return Ok(false),
    };

    let path = settings_dir.join("ClientAppSettings.json");

    if !path.exists() {
        return Ok(false);
    }

    let content = fs::read_to_string(&path).map_err(|_| String::new())?;

    let json: serde_json::Value = serde_json::from_str(&content).unwrap_or(serde_json::json!({}));

    Ok(json
        .get("FFlagDebugGraphicsPreferOpenGL")
        .and_then(|v| v.as_bool())
        .unwrap_or(false))
}

#[tauri::command]
fn set_fps_unlock(enabled: bool) -> Result<(), String> {
    let dir_path = get_client_settings_path()?;
    let path = dir_path.join("ClientAppSettings.json");

    let json = serde_json::json!({
        "FFlagDebugGraphicsPreferOpenGL": enabled
    });

    let content = serde_json::to_string_pretty(&json).map_err(|_| String::new())?;

    if fs::create_dir_all(&dir_path).is_ok() && fs::write(&path, &content).is_ok() {
        return Ok(());
    }

    let shell_cmd = format!(
        "mkdir -p '{}' && cat > '{}' << 'CELESTIAL_EOF'\n{}\nCELESTIAL_EOF",
        dir_path.display().to_string().replace("'", "'\\''"),
        path.display().to_string().replace("'", "'\\''"),
        content
    );

    let output = std::process::Command::new("bash")
        .args(&["-c", &shell_cmd])
        .output()
        .map_err(|_| String::new())?;

    if !output.status.success() {
        let encoded_content =
            base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &content);
        let admin_cmd = format!(
            "mkdir -p '{}' && echo '{}' | base64 -d > '{}'",
            dir_path.display().to_string().replace("'", "'\\''"),
            encoded_content,
            path.display().to_string().replace("'", "'\\''")
        );
        let script = format!(
            "do shell script \"{}\" with prompt \"Celestial UI needs permission to modify Roblox settings.\" with administrator privileges",
            admin_cmd.replace("\"", "\\\"")
        );
        let admin_output = std::process::Command::new("osascript")
            .args(&["-e", &script])
            .output()
            .map_err(|_| String::new())?;

        if !admin_output.status.success() {
            return Err(String::new());
        }
    }

    Ok(())
}

#[tauri::command]
fn get_hydrogen_key() -> Result<String, String> {
    let home = dirs::home_dir().ok_or_else(|| String::new())?;
    let key_path = home.join("Library/Application Support/Hydrogen/key.txt");

    if !key_path.exists() {
        return Ok(String::new());
    }

    fs::read_to_string(&key_path).map_err(|_| String::new())
}

#[tauri::command]
fn is_hydrogen_installed() -> bool {
    Path::new("/Applications/Hydrogen.app").exists()
}

#[tauri::command]
async fn save_hydrogen_key(key: String) -> Result<(), String> {
    let home = dirs::home_dir().ok_or_else(|| String::new())?;
    let hydrogen_dir = home.join("Library/Application Support/Hydrogen");
    let key_path = hydrogen_dir.join("key.txt");

    fs::create_dir_all(&hydrogen_dir).map_err(|_| String::new())?;

    if key.trim().is_empty() {
        fs::write(&key_path, "").map_err(|_| String::new())?;
        return Ok(());
    }

    let hwid = get_hwid()?;

    let client = build_http_client()?;
    let response = client
        .post("https://www.hydrogen.lat/api/validate-key")
        .json(&serde_json::json!({
            "key": key.trim(),
            "mac_uuid": hwid
        }))
        .header("Content-Type", "application/json")
        .header("Accept", "*/*")
        .header("User-Agent", "curl/8.12.1")
        .send()
        .await
        .map_err(|_| String::new())?;

    let status = response.status();
    let text = response.text().await.map_err(|_| String::new())?;

    if !status.is_success() {
        return Err(String::new());
    }

    let res_json: serde_json::Value = serde_json::from_str(&text).map_err(|_| String::new())?;

    if !res_json
        .get("success")
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
    {
        return Err(String::new());
    }

    fs::write(&key_path, key.trim()).map_err(|_| String::new())?;

    let app_data = get_app_data_dir()?;
    let cache_path = app_data.join("key.json");
    let _ = fs::remove_file(&cache_path);

    Ok(())
}

fn get_hwid() -> Result<String, String> {
    if let Ok(cache) = HWID_CACHE.lock() {
        if let Some(hwid) = cache.as_ref() {
            return Ok(hwid.clone());
        }
    }

    let output = std::process::Command::new("ioreg")
        .args(&["-rd1", "-c", "IOPlatformExpertDevice"])
        .output()
        .map_err(|_| String::new())?;

    let output_str = String::from_utf8_lossy(&output.stdout);

    let uuid = output_str
        .lines()
        .find(|line| line.contains("IOPlatformUUID"))
        .and_then(|line| {
            line.split('=')
                .nth(1)
                .map(|s| s.trim().trim_matches('"').to_string())
        })
        .ok_or_else(|| String::new())?;

    if let Ok(mut cache) = HWID_CACHE.lock() {
        *cache = Some(uuid.clone());
    }

    Ok(uuid)
}

fn decode_jwt_payload(token: &str) -> Result<serde_json::Value, String> {
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() != 3 {
        return Err(String::new());
    }

    let payload = parts[1];

    let mut payload = payload.to_string();
    let padding = 4 - (payload.len() % 4);
    if padding != 4 {
        payload.push_str(&"=".repeat(padding));
    }

    payload = payload.replace('-', "+").replace('_', "/");

    let decoded = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, &payload)
        .map_err(|_| String::new())?;

    let decoded_str = String::from_utf8(decoded).map_err(|_| String::new())?;

    serde_json::from_str(&decoded_str).map_err(|_| String::new())
}

#[tauri::command]
async fn get_key_expiration() -> Result<serde_json::Value, String> {
    let hwid = get_hwid()?;
    let key = get_hydrogen_key()?;

    if key.is_empty() {
        return Err(String::new());
    }

    let app_data = get_app_data_dir()?;
    let cache_path = app_data.join("key.json");

    if cache_path.exists() {
        let cache_content = fs::read_to_string(&cache_path).map_err(|_| String::new())?;

        if let Ok(cache) = serde_json::from_str::<KeyCache>(&cache_content) {
            if cache.key == key {
                let now = chrono::Utc::now().timestamp();
                let remaining = cache.expires_at - now;

                let mut result = serde_json::json!({
                    "success": true,
                    "expires_at": cache.expires_at,
                    "remaining_seconds": remaining
                });

                if remaining > 0 {
                    let days = remaining / 86400;
                    let hours = (remaining % 86400) / 3600;

                    let formatted = if days > 0 && hours > 0 {
                        format!("in {} days, {} hours", days, hours)
                    } else if days > 0 {
                        format!("in {} days", days)
                    } else {
                        format!("in {} hours", hours)
                    };

                    result["formatted"] = formatted.into();
                } else {
                    result["formatted"] = "Expired".to_string().into();
                }

                return Ok(result);
            }
        }
    }

    let client = build_http_client()?;
    let response = client
        .post("https://www.hydrogen.lat/api/validate-key")
        .json(&serde_json::json!({
            "key": key,
            "mac_uuid": hwid
        }))
        .header("Content-Type", "application/json")
        .header("Accept", "*/*")
        .header("User-Agent", "curl/8.12.1")
        .send()
        .await
        .map_err(|_| String::new())?;

    let status = response.status();
    let text = response.text().await.map_err(|_| String::new())?;

    if !status.is_success() {
        return Err(String::new());
    }

    let res_json: serde_json::Value = serde_json::from_str(&text).map_err(|_| String::new())?;

    if !res_json
        .get("success")
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
    {
        return Err(String::new());
    }

    if let Some(token) = res_json.get("token").and_then(|v| v.as_str()) {
        let payload = decode_jwt_payload(token)?;
        let expiration = payload
            .get("key_expires_at")
            .and_then(|v| v.as_i64())
            .ok_or_else(|| String::new())?;

        let cache = KeyCache {
            key: key.clone(),
            expires_at: expiration,
        };

        fs::create_dir_all(&app_data).map_err(|_| String::new())?;

        let cache_json = serde_json::to_string_pretty(&cache).map_err(|_| String::new())?;

        fs::write(&cache_path, cache_json).map_err(|_| String::new())?;

        let now = chrono::Utc::now().timestamp();
        let remaining = expiration - now;

        let mut result = serde_json::json!({
            "success": true,
            "expires_at": expiration,
            "remaining_seconds": remaining
        });

        if remaining > 0 {
            let days = remaining / 86400;
            let hours = (remaining % 86400) / 3600;

            let formatted = if days > 0 && hours > 0 {
                format!("in {} days, {} hours", days, hours)
            } else if days > 0 {
                format!("in {} days", days)
            } else {
                format!("in {} hours", hours)
            };

            result["formatted"] = formatted.into();
        } else {
            result["formatted"] = "Expired".to_string().into();
        }

        return Ok(result);
    }

    Err(String::new())
}

#[tauri::command]
async fn download_script(url: String) -> Result<String, String> {
    let client = build_http_client()?;
    let response = client.get(&url)
        .header("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
        .send()
        .await
        .map_err(|_| String::new())?;

    if !response.status().is_success() {
        return Err(String::new());
    }

    response.text().await.map_err(|_| String::new())
}

#[tauri::command]
async fn get_latest_version() -> Result<serde_json::Value, String> {
    let client = build_http_client()?;
    let response = client
        .get("https://brave-mastiff-539.convex.site/version")
        .header("User-Agent", "curl/8.12.1")
        .send()
        .await
        .map_err(|_| String::new())?;

    if !response.status().is_success() {
        return Err(String::new());
    }

    let text = response.text().await.map_err(|_| String::new())?;

    serde_json::from_str(&text).map_err(|_| String::new())
}

#[tauri::command]
async fn get_discord_invite() -> Result<String, String> {
    let client = build_http_client()?;
    let response = client
        .get("https://brave-mastiff-539.convex.site/discord")
        .header("User-Agent", "curl/8.12.1")
        .send()
        .await
        .map_err(|_| String::new())?;

    if !response.status().is_success() {
        return Err(String::new());
    }

    let text = response.text().await.map_err(|_| String::new())?;

    let json: serde_json::Value = serde_json::from_str(&text).map_err(|_| String::new())?;

    json.get("invite")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| String::new())
}

#[tauri::command]
async fn get_announcement() -> Result<String, String> {
    let client = build_http_client()?;
    let response = client
        .get("https://brave-mastiff-539.convex.site/announcement")
        .header("User-Agent", "curl/8.12.1")
        .send()
        .await
        .map_err(|_| String::new())?;

    if !response.status().is_success() {
        return Err(String::new());
    }

    let text = response.text().await.map_err(|_| String::new())?;

    let json: serde_json::Value = serde_json::from_str(&text).map_err(|_| String::new())?;

    json.get("announcement")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .ok_or_else(|| String::new())
}

#[tauri::command]
fn save_script(content: &str, file_name: &str) -> Result<(), String> {
    let safe_file_name = sanitize_script_file_name(file_name)?;

    if !is_supported_script_file_name(&safe_file_name, true)
    {
        return Err(String::new());
    }
    write_script_to_default_location(content, &safe_file_name, true)?;

    Ok(())
}

#[tauri::command]
fn import_dropped_scripts(
    app: tauri::AppHandle,
    paths: Vec<String>,
) -> Result<ImportDroppedScriptsResult, String> {
    let mut result = ImportDroppedScriptsResult::default();

    for path_str in paths {
        let path = PathBuf::from(&path_str);
        let item_label = path
            .file_name()
            .and_then(|name| name.to_str())
            .map(|name| name.to_string())
            .unwrap_or(path_str.clone());

        match fs::metadata(&path) {
            Ok(metadata) if metadata.is_file() => {}
            _ => {
                result.rejected.push(item_label);
                continue;
            }
        }

        let Some(file_name) = path.file_name().and_then(|name| name.to_str()) else {
            result.rejected.push(item_label);
            continue;
        };

        let safe_file_name = match sanitize_script_file_name(file_name) {
            Ok(file_name) if is_supported_script_file_name(&file_name, false) => file_name,
            _ => {
                result.rejected.push(item_label);
                continue;
            }
        };

        let content = match fs::read_to_string(&path) {
            Ok(content) => content,
            Err(_) => {
                result.rejected.push(item_label);
                continue;
            }
        };

        match write_script_to_default_location(&content, &safe_file_name, false) {
            Ok(true) => result.added.push(safe_file_name),
            Ok(false) => result.duplicates.push(safe_file_name),
            Err(_) => result.rejected.push(item_label),
        }
    }

    if !result.added.is_empty() {
        let _ = refresh_tray_menu(app.clone());
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.emit("refresh-explorer", ());
        }
    }

    Ok(result)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "macos")]
    disable_auto_fullscreen_menu_item();

    let app = tauri::Builder::default()
        .enable_macos_default_menu(false)
        .menu(|app| {
            #[cfg(target_os = "macos")]
            {
                build_app_menu(app)
            }

            #[cfg(not(target_os = "macos"))]
            {
                tauri::menu::Menu::default(app)
            }
        })
        .on_menu_event(|app, event| {
            #[cfg(target_os = "macos")]
            handle_native_menu_event(app, event);
        })
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            history::init_history()?;
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let _ = ensure_scripts_folder_exists();
                let _ = ensure_default_scripts_subfolder_exists();
                let _ = ensure_tray_folder_exists();
                let _ = refresh_tray_menu(app_handle);
            });

            #[cfg(target_os = "macos")]
            {
                if !is_tray_icon_disabled() {
                    let app_handle = app.handle().clone();
                    create_menu_bar_tray_icon(&app_handle)?;
                }

                install_fn_fullscreen_monitor(app.handle().clone());

                let app_handle = app.handle().clone();
                std::thread::spawn(move || {
                    let mut previous_signature: Option<Vec<String>> = None;

                    loop {
                        std::thread::sleep(Duration::from_secs(3));

                        if is_tray_icon_disabled() {
                            previous_signature = None;
                            continue;
                        }

                        if app_handle.tray_by_id("menu-bar").is_none() {
                            continue;
                        }

                        let signature = collect_tray_scripts()
                            .into_iter()
                            .map(|(name, path)| format!("{}|{}", name, path.to_string_lossy()))
                            .collect::<Vec<_>>();

                        if previous_signature.as_ref() == Some(&signature) {
                            continue;
                        }

                        if update_menu_bar_tray_menu(&app_handle).is_ok() {
                            previous_signature = Some(signature);
                        }
                    }
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            close_window,
            minimize_window,
            toggle_maximize_window,
            open_console_window,
            start_roblox_browser_login,
            cancel_roblox_browser_login,
            set_tray_icon_disabled,
            refresh_tray_menu,
            get_scripts_path,
            check_documents_access,
            get_fps_unlock_status,
            set_fps_unlock,
            get_hydrogen_key,
            is_hydrogen_installed,
            save_hydrogen_key,
            get_key_expiration,
            download_script,
            save_script,
            import_dropped_scripts,
            get_latest_version,
            get_discord_invite,
            get_announcement,
            open_roblox,
            logs::start_log_watcher,
            logs::stop_log_watcher,
            accounts::add_account,
            accounts::get_accounts,
            accounts::self_heal_accounts,
            accounts::delete_account,
            accounts::refresh_account,
            accounts::set_default_account,
            accounts::launch_instance,
            accounts::launch_instance_join,
            accounts::clear_clients,
            accounts::get_running_instances,
            accounts::kill_all_roblox_instances,
            accounts::kill_roblox_instance,
            exec_server::get_bridge_clients,
            exec_server::execute_via_bridge,
            execution::execute_with_executor,
            history::list_history,
            history::get_history,
            history::clear_history,
            rpc::update_rpc_presence,
            rpc::clear_rpc_presence
        ])
        .build(tauri::generate_context!());

    let Ok(app) = app else {
        return;
    };

    app.run(|app_handle, event| {
        if matches!(event, RunEvent::ExitRequested { .. } | RunEvent::Exit) {
            clear_rpc_presence_for_shutdown();
        }

        #[cfg(target_os = "macos")]
        match event {
            RunEvent::Reopen { .. } => {
                let _ = app_handle.show();
                for window in app_handle.webview_windows().into_values() {
                    let _ = window.show();
                }
                if let Some(window) = get_focused_webview_window(app_handle).or_else(|| app_handle.get_webview_window("main")) {
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                }
            }
            _ => {}
        }
    });
}
