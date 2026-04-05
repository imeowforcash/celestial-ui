use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use serde_json::Value;

const HISTORY_DB_FILE_NAME: &str = "history.sqlite";
const HISTORY_RETENTION_LIMIT: i64 = 100;

#[derive(Debug, Serialize)]
pub struct HistoryItem {
    pub id: i64,
    pub name: String,
    pub executed_at: i64,
}

#[derive(Debug, Serialize)]
pub struct HistoryEntry {
    pub id: i64,
    pub name: String,
    pub content: String,
    pub executed_at: i64,
}

fn history_db_path() -> Result<PathBuf, String> {
    let app_data = super::get_app_data_dir()?;
    fs::create_dir_all(&app_data).map_err(|_| String::new())?;
    Ok(app_data.join(HISTORY_DB_FILE_NAME))
}

fn open_history() -> Result<Connection, String> {
    let db_path = history_db_path()?;
    let connection = Connection::open(db_path).map_err(|_| String::new())?;
    connection
        .execute_batch(
            "
            CREATE TABLE IF NOT EXISTS execution_history (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                content TEXT NOT NULL,
                executed_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_execution_history_executed_at
            ON execution_history (executed_at DESC, id DESC);
            ",
        )
        .map_err(|_| String::new())?;

    Ok(connection)
}

fn history_off() -> bool {
    let app_data = match super::get_app_data_dir() {
        Ok(path) => path,
        Err(_) => return false,
    };
    let settings_path = app_data.join("settings.json");
    let settings_content = match fs::read_to_string(settings_path) {
        Ok(content) => content,
        Err(_) => return false,
    };
    let settings_json: Value = match serde_json::from_str(&settings_content) {
        Ok(value) => value,
        Err(_) => return false,
    };

    settings_json
        .get("disableHistory")
        .and_then(Value::as_bool)
        .unwrap_or(false)
}

pub fn init_history() -> Result<(), String> {
    let _ = open_history()?;
    Ok(())
}

pub fn save_history(name: String, content: String) -> Result<(), String> {
    if history_off() {
        return Ok(());
    }

    let mut connection = open_history()?;
    let tx = connection.transaction().map_err(|_| String::new())?;
    let executed_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or(0);

    tx.execute(
        "INSERT INTO execution_history (name, content, executed_at) VALUES (?1, ?2, ?3)",
        params![name, content, executed_at],
    )
    .map_err(|_| String::new())?;
    tx.execute(
        "
        DELETE FROM execution_history
        WHERE id NOT IN (
            SELECT id
            FROM (
                SELECT id
                FROM execution_history
                ORDER BY executed_at DESC, id DESC
                LIMIT ?1
            )
        )
        ",
        params![HISTORY_RETENTION_LIMIT],
    )
    .map_err(|_| String::new())?;
    tx.commit().map_err(|_| String::new())?;

    Ok(())
}

#[tauri::command]
pub fn list_history() -> Result<Vec<HistoryItem>, String> {
    let connection = open_history()?;
    let mut statement = connection
        .prepare(
            "
            SELECT id, name, executed_at
            FROM execution_history
            ORDER BY executed_at DESC, id DESC
            ",
        )
        .map_err(|_| String::new())?;
    let rows = statement
        .query_map([], |row| {
            Ok(HistoryItem {
                id: row.get(0)?,
                name: row.get(1)?,
                executed_at: row.get(2)?,
            })
        })
        .map_err(|_| String::new())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|_| String::new())
}

#[tauri::command]
pub fn get_history(id: i64) -> Result<HistoryEntry, String> {
    let connection = open_history()?;
    let entry = connection
        .query_row(
            "
            SELECT id, name, content, executed_at
            FROM execution_history
            WHERE id = ?1
            ",
            params![id],
            |row| {
                Ok(HistoryEntry {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    content: row.get(2)?,
                    executed_at: row.get(3)?,
                })
            },
        )
        .optional()
        .map_err(|_| String::new())?;
    entry.ok_or_else(|| String::new())
}

#[tauri::command]
pub fn clear_history() -> Result<(), String> {
    let connection = open_history()?;
    connection
        .execute_batch(
            "
            DELETE FROM execution_history;
            VACUUM;
            ",
        )
        .map_err(|_| String::new())?;
    Ok(())
}
