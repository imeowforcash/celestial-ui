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

fn open_log_reader(path: &PathBuf, position: io::SeekFrom) -> io::Result<(BufReader<File>, u64)> {
    let file = File::open(path)?;
    let mut reader = BufReader::new(file);
    reader.seek(position)?;
    let offset = reader.stream_position()?;
    Ok((reader, offset))
}

fn recover_log_reader(
    current_log_path: &mut PathBuf,
    last_position: u64,
) -> Option<(BufReader<File>, u64)> {
    if let Some(new_path) = find_latest_log_file() {
        if new_path != *current_log_path {
            if let Ok((reader, position)) = open_log_reader(&new_path, io::SeekFrom::End(0)) {
                *current_log_path = new_path;
                return Some((reader, position));
            }
        }
    }

    open_log_reader(current_log_path, io::SeekFrom::Start(last_position)).ok()
}

pub fn watch_log_file(window: Window, mut current_log_path: PathBuf) {
    let Ok((mut reader, mut last_position)) =
        open_log_reader(&current_log_path, io::SeekFrom::End(0))
    else {
        return;
    };

    let mut line = String::new();
    let mut last_check = std::time::Instant::now();
    let mut log_batch: Vec<LogItem> = Vec::with_capacity(100);
    let mut last_batch_emit = std::time::Instant::now();

    while WATCHING.load(Ordering::SeqCst) {
        if last_check.elapsed() >= Duration::from_secs(1) {
            if let Some(new_path) = find_latest_log_file() {
                if new_path != current_log_path {
                    if let Ok((new_reader, new_position)) =
                        open_log_reader(&new_path, io::SeekFrom::End(0))
                    {
                        current_log_path = new_path;
                        reader = new_reader;
                        last_position = new_position;
                    }
                }
            }
            last_check = std::time::Instant::now();
        }

        let metadata = match fs::metadata(&current_log_path) {
            Ok(metadata) => metadata,
            Err(_) => {
                if let Some((new_reader, new_position)) =
                    recover_log_reader(&mut current_log_path, last_position)
                {
                    reader = new_reader;
                    last_position = new_position;
                }
                thread::sleep(Duration::from_millis(50));
                continue;
            }
        };
        let len = metadata.len();

        if len < last_position {
            if let Ok((new_reader, new_position)) =
                open_log_reader(&current_log_path, io::SeekFrom::Start(0))
            {
                reader = new_reader;
                last_position = new_position;
            } else {
                thread::sleep(Duration::from_millis(50));
                continue;
            }
        }

        if len > last_position {
            if reader.seek(io::SeekFrom::Start(last_position)).is_err() {
                if let Some((new_reader, new_position)) =
                    recover_log_reader(&mut current_log_path, last_position)
                {
                    reader = new_reader;
                    last_position = new_position;
                }
                thread::sleep(Duration::from_millis(50));
                continue;
            }

            loop {
                let read = match reader.read_line(&mut line) {
                    Ok(read) => read,
                    Err(_) => {
                        if let Some((new_reader, new_position)) =
                            recover_log_reader(&mut current_log_path, last_position)
                        {
                            reader = new_reader;
                            last_position = new_position;
                        }
                        line.clear();
                        break;
                    }
                };

                if read == 0 {
                    break;
                }

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

            if let Ok(position) = reader.stream_position() {
                last_position = position;
            }
        }

        if !log_batch.is_empty() && last_batch_emit.elapsed() >= Duration::from_millis(50) {
            let _ = window.emit("log_batch", &log_batch);
            log_batch.clear();
            last_batch_emit = std::time::Instant::now();
        }

        thread::sleep(Duration::from_millis(50));
    }
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
        watch_log_file(window_clone, log_path);
        WATCHING.store(false, Ordering::SeqCst);
    });

    Ok(())
}

#[tauri::command]
pub async fn stop_log_watcher() -> Result<(), String> {
    WATCHING.store(false, Ordering::SeqCst);
    Ok(())
}
