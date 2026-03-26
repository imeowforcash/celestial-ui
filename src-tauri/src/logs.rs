use crate::filtering::{filter_line, LogItem};
use std::fs::{self, File};
use std::io::{self, BufRead, BufReader, Seek};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::Duration;
use tauri::{Emitter, Window};

pub(crate) static WATCHING: AtomicBool = AtomicBool::new(false);
pub(crate) static SHOW_RAW_LOGS: AtomicBool = AtomicBool::new(false);

pub fn find_latest_log_file() -> Option<PathBuf> {
    let home = dirs::home_dir()?;
    let log_dir = home.join("Library").join("Logs").join("Roblox");

    if !log_dir.exists() {
        return None;
    }

    let latest = fs::read_dir(log_dir)
        .ok()?
        .filter_map(|entry| entry.ok())
        .filter(|entry| entry.path().extension().map_or(false, |ext| ext == "log"))
        .max_by_key(|entry| entry.metadata().ok().and_then(|m| m.modified().ok()));
    latest.map(|entry| entry.path())
}

pub fn watch_log_file(window: Window, mut current_log_path: PathBuf) -> io::Result<()> {
    let mut file = File::open(&current_log_path)?;
    let mut reader = BufReader::new(&file);
    let mut line = String::new();
    reader.seek(io::SeekFrom::End(0))?;
    let mut last_position = reader.stream_position()?;
    let mut last_check = std::time::Instant::now();
    let mut log_batch: Vec<LogItem> = Vec::with_capacity(100);
    let mut last_batch_emit = std::time::Instant::now();

    while WATCHING.load(Ordering::SeqCst) {
        if last_check.elapsed() >= Duration::from_secs(1) {
            if let Some(new_path) = find_latest_log_file() {
                if new_path != current_log_path {
                    current_log_path = new_path;
                    file = File::open(&current_log_path)?;
                    reader = BufReader::new(&file);
                    reader.seek(io::SeekFrom::End(0))?;
                    last_position = reader.stream_position()?;
                }
            }
            last_check = std::time::Instant::now();
        }

        let metadata = fs::metadata(&current_log_path)?;
        let len = metadata.len();

        if len < last_position {
            file = File::open(&current_log_path)?;
            reader = BufReader::new(&file);
            last_position = 0;
        }

        if len > last_position {
            reader.seek(io::SeekFrom::Start(last_position))?;
            while reader.read_line(&mut line)? > 0 {
                let trimmed = line.trim();
                if !trimmed.is_empty() {
                    let show_raw_logs = SHOW_RAW_LOGS.load(Ordering::Relaxed);
                    if let Some(item) = filter_line(trimmed, show_raw_logs) {
                        log_batch.push(item);
                    }
                }
                line.clear();
                if log_batch.len() >= 50 {
                    let _ = window.emit("log_batch", &log_batch);
                    log_batch.clear();
                    last_batch_emit = std::time::Instant::now();
                }
            }

            last_position = reader.stream_position()?;
        }

        if !log_batch.is_empty() && last_batch_emit.elapsed() >= Duration::from_millis(50) {
            let _ = window.emit("log_batch", &log_batch);
            log_batch.clear();
            last_batch_emit = std::time::Instant::now();
        }

        thread::sleep(Duration::from_millis(50));
    }

    Ok(())
}

#[tauri::command]
pub async fn start_log_watcher(window: Window, show_raw_logs: bool) -> Result<(), String> {
    SHOW_RAW_LOGS.store(show_raw_logs, Ordering::Relaxed);

    if WATCHING.load(Ordering::SeqCst) {
        return Ok(());
    }
    let log_path = find_latest_log_file().ok_or("")?;
    WATCHING.store(true, Ordering::SeqCst);
    let window_clone = window.clone();
    thread::spawn(move || {
        let _ = watch_log_file(window_clone, log_path);
    });

    Ok(())
}

#[tauri::command]
pub async fn stop_log_watcher() -> Result<(), String> {
    WATCHING.store(false, Ordering::SeqCst);
    Ok(())
}
