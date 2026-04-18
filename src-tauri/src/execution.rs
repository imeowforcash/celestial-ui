use flate2::write::ZlibEncoder;
use flate2::Compression;
use std::io::Write;
use std::net::TcpStream;
use std::sync::atomic::{AtomicU16, Ordering};
use std::time::Duration;

static CACHED_EXEC_PORT: AtomicU16 = AtomicU16::new(0);
const HYDRO_START_PORT: u16 = 6969;
const HYDRO_END_PORT: u16 = 7069;
const MS_START_PORT: u16 = 5553;
const MS_END_PORT: u16 = 5562;

#[derive(Copy, Clone)]
pub enum ExecutorKind {
    Hydrogen,
    Opiumware,
    Macsploit,
}

pub fn normalize_executor(value: Option<&str>) -> ExecutorKind {
    let normalized = value.unwrap_or("opium").trim().to_ascii_lowercase();
    if normalized == "opium" || normalized == "opiumware" {
        return ExecutorKind::Opiumware;
    }
    if normalized == "ms" || normalized == "macsploit" {
        return ExecutorKind::Macsploit;
    }
    if normalized == "hydro" || normalized == "hydrogen" {
        return ExecutorKind::Hydrogen;
    }
    ExecutorKind::Opiumware
}

fn exec_client(timeout: Duration) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(timeout)
        .build()
        .map_err(|_| String::new())
}

async fn is_hydro_port(client: &reqwest::Client, port: u16) -> bool {
    let url = format!("http://127.0.0.1:{}/secret", port);
    let response = client.get(url).send().await;
    let Ok(response) = response else {
        return false;
    };
    if !response.status().is_success() {
        return false;
    }
    let Ok(text) = response.text().await else {
        return false;
    };
    text == "0xdeadbeef"
}

async fn resolve_hydro_port(client: &reqwest::Client) -> Option<u16> {
    let cached_port = CACHED_EXEC_PORT.load(Ordering::SeqCst);
    if cached_port != 0 && is_hydro_port(client, cached_port).await {
        return Some(cached_port);
    }

    if cached_port != 0 {
        CACHED_EXEC_PORT.store(0, Ordering::SeqCst);
    }

    for port in HYDRO_START_PORT..=HYDRO_END_PORT {
        if is_hydro_port(client, port).await {
            CACHED_EXEC_PORT.store(port, Ordering::SeqCst);
            return Some(port);
        }
    }

    None
}

async fn exec_hydro(script: String, name: Option<String>) -> Result<(), String> {
    let check_client = exec_client(Duration::from_millis(750))?;
    let exec_client = exec_client(Duration::from_secs(5))?;
    let Some(port) = resolve_hydro_port(&check_client).await else {
        return Err(String::new());
    };
    let url = format!("http://127.0.0.1:{}/execute", port);
    let response = exec_client
        .post(url)
        .header("Content-Type", "text/plain")
        .body(script.clone())
        .send()
        .await
        .map_err(|_| String::new())?;

    if !response.status().is_success() {
        CACHED_EXEC_PORT.store(0, Ordering::SeqCst);
        return Err(String::new());
    }

    super::history::save_history(
        name.unwrap_or_else(|| "Untitled Script".to_string()),
        script,
    )?;

    Ok(())
}

fn compress_data(data: &[u8]) -> Result<Vec<u8>, String> {
    let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
    encoder.write_all(data).map_err(|_| String::new())?;
    encoder.finish().map_err(|_| String::new())
}

fn send_bytes(stream: &mut TcpStream, message: &str) -> Result<(), String> {
    let compressed = compress_data(message.as_bytes())?;
    stream.write_all(&compressed).map_err(|_| String::new())?;
    Ok(())
}

fn build_opium_cmd(code: &str) -> String {
    let trimmed = code.trim_start();
    if trimmed.starts_with("OpiumwareScript ") || trimmed == "NULL" {
        return code.to_string();
    }
    format!("OpiumwareScript {}", code)
}

fn run_opium(code: String, port: String) -> Result<String, String> {
    let ports = ["8392", "8393", "8394", "8395", "8396", "8397"];

    let ports_to_check: Vec<String> = match port.as_str() {
        "ALL" => ports.iter().map(|value| value.to_string()).collect(),
        _ => vec![port],
    };

    let mut stream = None;
    let mut connected_port: Option<String> = None;
    let payload = build_opium_cmd(&code);

    for current_port in ports_to_check {
        let server_address = format!("127.0.0.1:{}", current_port);
        match TcpStream::connect(&server_address) {
            Ok(s) => {
                stream = Some(s);
                connected_port = Some(current_port);
                break;
            }
            Err(_) => continue,
        }
    }

    let mut stream = match stream {
        Some(s) => s,
        None => return Err(String::new()),
    };

    if payload != "NULL" {
        send_bytes(&mut stream, &payload).map_err(|_| String::new())?;
    }

    drop(stream);
    match connected_port {
        Some(_) => Ok(String::new()),
        None => Err(String::new()),
    }
}

async fn exec_opium(code: String, port: String, name: Option<String>) -> Result<String, String> {
    let history_code = code.clone();
    let result = tauri::async_runtime::spawn_blocking(move || run_opium(code, port))
        .await
        .map_err(|_| String::new())?;
    let success_message = result?;
    super::history::save_history(
        name.unwrap_or_else(|| "Untitled Script".to_string()),
        history_code,
    )?;

    Ok(success_message)
}

fn build_ms_payload(script: &str) -> Result<Vec<u8>, String> {
    let encoded = script.as_bytes();
    let length = u32::try_from(encoded.len()).map_err(|e| e.to_string())?;
    let mut payload = vec![0_u8; 16 + encoded.len()];
    payload[0] = 0;
    payload[8..12].copy_from_slice(&length.to_le_bytes());
    payload[16..16 + encoded.len()].copy_from_slice(encoded);
    Ok(payload)
}

fn parse_ms_ports(port: String) -> Vec<u16> {
    if port.trim().eq_ignore_ascii_case("ALL") {
        return (MS_START_PORT..=MS_END_PORT).collect();
    }

    match port.parse::<u16>() {
        Ok(value) => vec![value],
        Err(_) => Vec::new(),
    }
}

fn run_ms(code: String, port: String) -> Result<String, String> {
    let ports_to_check = parse_ms_ports(port);
    if ports_to_check.is_empty() {
        return Err("Macsploit port list is empty".to_string());
    }

    let payload = build_ms_payload(&code)?;
    let mut last_error = "No Macsploit ports responded".to_string();

    for current_port in ports_to_check {
        let server_address = format!("127.0.0.1:{}", current_port);
        let mut stream = match TcpStream::connect(&server_address) {
            Ok(stream) => stream,
            Err(err) => {
                last_error = format!("connect {} failed: {}", server_address, err);
                continue;
            }
        };
        if let Err(err) = stream.write_all(&payload) {
            last_error = format!("write {} failed: {}", server_address, err);
            continue;
        }
        if let Err(err) = stream.flush() {
            last_error = format!("flush {} failed: {}", server_address, err);
            continue;
        }
        drop(stream);
        return Ok(String::new());
    }

    Err(last_error)
}

async fn exec_ms(code: String, port: String, name: Option<String>) -> Result<String, String> {
    let history_code = code.clone();
    let result = tauri::async_runtime::spawn_blocking(move || run_ms(code, port))
        .await
        .map_err(|_| String::new())?;
    let success_message = result?;
    super::history::save_history(
        name.unwrap_or_else(|| "Untitled Script".to_string()),
        history_code,
    )?;

    Ok(success_message)
}

#[tauri::command]
pub async fn execute_with_executor(
    script: String,
    name: Option<String>,
    executor: Option<String>,
    port: Option<String>,
) -> Result<String, String> {
    match normalize_executor(executor.as_deref()) {
        ExecutorKind::Hydrogen => {
            exec_hydro(script, name).await?;
            Ok(String::new())
        }
        ExecutorKind::Opiumware => {
            exec_opium(script, port.unwrap_or_else(|| "ALL".to_string()), name).await
        }
        ExecutorKind::Macsploit => {
            exec_ms(script, port.unwrap_or_else(|| "ALL".to_string()), name).await
        }
    }
}
