use std::time::{Duration, SystemTime};

const FILE_HEADER: &[u8] = &[0x63, 0x6F, 0x6F, 0x6B];
const FILE_FOOTER: &[u8] = &[0x07, 0x17, 0x20, 0x05, 0x00, 0x00, 0x00, 0x4B];
const PAGE_HEADER: &[u8] = &[0x00, 0x00, 0x01, 0x00];
const PAGE_FOOTER: &[u8] = &[0x00, 0x00, 0x00, 0x00];

fn to_cocoa_timestamp(t: SystemTime) -> f64 {
    let unix_epoch = t
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap()
        .as_secs_f64();
    unix_epoch - 978307200.0
}

pub fn create_binary_cookie_file(cookie_value: &str) -> Vec<u8> {
    let domain = ".roblox.com";
    let name = ".ROBLOSECURITY";
    let path = "/";
    let value = cookie_value;

    let mut domain_bytes = domain.as_bytes().to_vec();
    domain_bytes.push(0);
    let mut name_bytes = name.as_bytes().to_vec();
    name_bytes.push(0);
    let mut path_bytes = path.as_bytes().to_vec();
    path_bytes.push(0);
    let mut value_bytes = value.as_bytes().to_vec();
    value_bytes.push(0);

    let domain_offset: u32 = 56;
    let name_offset: u32 = domain_offset + domain_bytes.len() as u32;
    let path_offset: u32 = name_offset + name_bytes.len() as u32;
    let value_offset: u32 = path_offset + path_bytes.len() as u32;
    let total_size: u32 = value_offset + value_bytes.len() as u32;

    let flags: u32 = 1 | 4;

    let now = SystemTime::now();
    let creation = to_cocoa_timestamp(now);
    let expiration = to_cocoa_timestamp(now + Duration::from_secs(60 * 60 * 24 * 365));

    let mut cookie_bytes = Vec::new();
    cookie_bytes.extend_from_slice(&total_size.to_le_bytes());
    cookie_bytes.extend_from_slice(&1u32.to_le_bytes());
    cookie_bytes.extend_from_slice(&flags.to_le_bytes());
    cookie_bytes.extend_from_slice(&0u32.to_le_bytes());
    cookie_bytes.extend_from_slice(&domain_offset.to_le_bytes());
    cookie_bytes.extend_from_slice(&name_offset.to_le_bytes());
    cookie_bytes.extend_from_slice(&path_offset.to_le_bytes());
    cookie_bytes.extend_from_slice(&value_offset.to_le_bytes());
    cookie_bytes.extend_from_slice(&0u32.to_le_bytes());
    cookie_bytes.extend_from_slice(&0u32.to_le_bytes());
    cookie_bytes.extend_from_slice(&expiration.to_le_bytes());
    cookie_bytes.extend_from_slice(&creation.to_le_bytes());
    cookie_bytes.extend_from_slice(&domain_bytes);
    cookie_bytes.extend_from_slice(&name_bytes);
    cookie_bytes.extend_from_slice(&path_bytes);
    cookie_bytes.extend_from_slice(&value_bytes);

    let mut page_bytes = Vec::new();
    page_bytes.extend_from_slice(PAGE_HEADER);
    page_bytes.extend_from_slice(&1u32.to_le_bytes());
    let first_cookie_offset: u32 = 16;
    page_bytes.extend_from_slice(&first_cookie_offset.to_le_bytes());
    page_bytes.extend_from_slice(PAGE_FOOTER);
    page_bytes.extend_from_slice(&cookie_bytes);
    let mut checksum: u32 = 0;

    let remainder = page_bytes.len() % 4;
    if remainder != 0 {
        for _ in 0..(4 - remainder) {
            page_bytes.push(0);
        }
    }

    for chunk in page_bytes.chunks(4) {
        let mut bytes = [0u8; 4];
        for (i, b) in chunk.iter().enumerate() {
            bytes[i] = *b;
        }
        checksum = checksum.wrapping_add(u32::from_be_bytes(bytes));
    }

    let mut file_bytes = Vec::new();
    file_bytes.extend_from_slice(FILE_HEADER);
    file_bytes.extend_from_slice(&1u32.to_be_bytes());
    file_bytes.extend_from_slice(&(page_bytes.len() as u32).to_be_bytes());
    file_bytes.extend_from_slice(&page_bytes);
    file_bytes.extend_from_slice(&checksum.to_be_bytes());
    file_bytes.extend_from_slice(FILE_FOOTER);

    file_bytes
}
