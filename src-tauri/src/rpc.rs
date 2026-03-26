use discord_rich_presence::{activity, DiscordIpc, DiscordIpcClient};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

const DISCORD_APP_ID: &str = "1467834586716442696";
const SHUTDOWN_BLOCK_MS: u64 = 2_000;

static DISCORD_STATE: Mutex<Option<(DiscordIpcClient, i64)>> = Mutex::new(None);
static IGNORE_UPDATES_UNTIL_MS: AtomicU64 = AtomicU64::new(0);

fn get_unix_timestamp() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn get_unix_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn updates_blocked() -> bool {
    get_unix_millis() < IGNORE_UPDATES_UNTIL_MS.load(Ordering::Relaxed)
}

fn clear_presence() -> Result<(), String> {
    let mut guard = DISCORD_STATE.lock().map_err(|_| String::new())?;
    if let Some((ref mut client, _)) = *guard {
        let _ = client.clear_activity();
        let _ = client.close();
    }
    *guard = None;
    Ok(())
}

fn ensure_connected() -> Result<(), String> {
    if updates_blocked() {
        return Err(String::new());
    }
    let mut guard = DISCORD_STATE.lock().map_err(|_| String::new())?;
    if guard.is_none() {
        let mut client = DiscordIpcClient::new(DISCORD_APP_ID);
        if client.connect().is_err() {
            return Err(String::new());
        }
        let start_time = get_unix_timestamp();
        *guard = Some((client, start_time));
    }
    Ok(())
}

#[tauri::command]
pub fn update_rpc_presence(
    view: String,
    file_name: Option<String>,
    app_version: String,
    is_watching: Option<bool>,
    search_query: Option<String>,
) -> Result<(), String> {
    if updates_blocked() {
        return Ok(());
    }

    if ensure_connected().is_err() {
        return Ok(());
    }
    let mut guard = DISCORD_STATE.lock().map_err(|_| String::new())?;
    if updates_blocked() {
        return Ok(());
    }
    let (client, start_time) = match guard.as_mut() {
        Some((c, t)) => (c, *t),
        None => return Ok(()),
    };

    fn truncate_filename(name: &str, max_len: usize) -> String {
        if name.len() <= max_len {
            return name.to_string();
        }

        if let Some(dot_pos) = name.rfind('.') {
            let extension = &name[dot_pos..];
            let base_max = max_len.saturating_sub(extension.len());
            if base_max > 0 {
                let base: String = name.chars().take(base_max).collect();
                return format!("{}{}", base, extension);
            }
        }

        name.chars().take(max_len).collect()
    }

    fn truncate_string(s: &str, max_len: usize) -> String {
        if s.len() <= max_len {
            s.to_string()
        } else {
            s.chars().take(max_len).collect()
        }
    }

    let details = match view.as_str() {
        "editor" => {
            if let Some(ref name) = file_name {
                let truncated = truncate_filename(name, 32);
                format!("Editing {}", truncated)
            } else {
                "Idling".to_string()
            }
        }
        "console" => {
            if is_watching.unwrap_or(false) {
                "Watching Logs".to_string()
            } else {
                "Idling".to_string()
            }
        }
        "library" => {
            if let Some(ref query) = search_query {
                if !query.is_empty() {
                    let truncated = truncate_string(query, 32);
                    format!("Searching for {}", truncated)
                } else {
                    "Idling".to_string()
                }
            } else {
                "Idling".to_string()
            }
        }
        "multi-instance" => "Managing Accounts".to_string(),
        "stats" => "Viewing Info".to_string(),
        "settings" => "Editing Settings".to_string(),
        _ => "Using Celestial".to_string(),
    };

    let large_image_text = format!("Celestial v{}", app_version);

    let (small_image, small_text) = match view.as_str() {
        "editor" => ("editor_icon", "Editor"),
        "console" => ("console_icon", "Console"),
        "library" => ("library_icon", "Library"),
        "multi-instance" => ("server_icon", "Storage"),
        "stats" => ("stats_icon", "Info"),
        "settings" => ("settings_icon", "Settings"),
        _ => ("editor_icon", "Editor"),
    };

    let activity = activity::Activity::new()
        .details(&details)
        .assets(
            activity::Assets::new()
                .large_image("celestial_icon")
                .large_text(&large_image_text)
                .small_image(small_image)
                .small_text(small_text),
        )
        .timestamps(activity::Timestamps::new().start(start_time))
        .buttons(vec![activity::Button::new(
            "Join Celestial",
            "https://discord.gg/6gKwR9WzVY",
        )]);

    if client.set_activity(activity.clone()).is_err() {
        if client.reconnect().is_err() {
            *guard = None;
            return Ok(());
        }
        let _ = client.set_activity(activity);
    }

    Ok(())
}

#[tauri::command]
pub fn clear_rpc_presence() -> Result<(), String> {
    clear_presence()
}

pub fn clear_for_shutdown() -> Result<(), String> {
    let until = get_unix_millis().saturating_add(SHUTDOWN_BLOCK_MS);
    IGNORE_UPDATES_UNTIL_MS.store(until, Ordering::Relaxed);
    clear_presence()
}
