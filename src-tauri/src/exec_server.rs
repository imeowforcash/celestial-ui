use crate::execution::{normalize_executor, ExecutorKind};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

fn get_bridge_path(executor: ExecutorKind) -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or_else(|| String::new())?;
    let path = match executor {
        ExecutorKind::Hydrogen => home
            .join("Hydrogen")
            .join("workspace/celestial_multiexec.json"),
        ExecutorKind::Opiumware => home
            .join("Opiumware")
            .join("workspace/celestial_multiexec.json"),
        ExecutorKind::Macsploit => home
            .join("Documents")
            .join("Macsploit Workspace")
            .join("celestial_multiexec.json"),
    };
    Ok(path)
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Client {
    #[serde(rename = "userId")]
    pub user_id: String,
    pub username: String,
    #[serde(rename = "displayName")]
    pub display_name: String,
    #[serde(rename = "gameId")]
    pub game_id: u64,
    #[serde(rename = "jobId")]
    pub job_id: String,
    #[serde(rename = "lastCommandId")]
    pub last_command_id: u64,
    #[serde(rename = "lastHeartbeat")]
    pub last_heartbeat: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Command {
    pub id: String,
    #[serde(rename = "userId")]
    pub user_id: String,
    pub script: String,
    pub timestamp: u64,
}

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct BridgeData {
    #[serde(default)]
    pub clients: Vec<Client>,
    #[serde(default)]
    pub commands: Vec<Command>,
}

fn read_bridge(executor: ExecutorKind) -> BridgeData {
    let path = match get_bridge_path(executor) {
        Ok(p) => p,
        Err(_) => return BridgeData::default(),
    };

    if !path.exists() {
        return BridgeData::default();
    }

    match fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
        Err(_) => BridgeData::default(),
    }
}

fn write_bridge(executor: ExecutorKind, data: &BridgeData) -> Result<(), String> {
    let path = get_bridge_path(executor)?;
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let content = serde_json::to_string_pretty(data).map_err(|_| String::new())?;
    fs::write(&path, content).map_err(|_| String::new())?;
    Ok(())
}

#[tauri::command]
pub fn execute_via_bridge(
    user_ids: Vec<String>,
    script: String,
    executor: Option<String>,
    name: Option<String>,
) -> Result<(), String> {
    let executor = normalize_executor(executor.as_deref());
    let mut data = read_bridge(executor);
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.subsec_nanos())
        .unwrap_or(0);
    for (i, user_id) in user_ids.into_iter().enumerate() {
        let id = format!("{}_{}_{}_{}", now, nanos, i, &user_id);
        data.commands.push(Command {
            id,
            user_id,
            script: script.clone(),
            timestamp: now,
        });
    }
    write_bridge(executor, &data)?;
    super::history::save_history(
        name.unwrap_or_else(|| "Untitled Script".to_string()),
        script,
    )?;
    Ok(())
}
