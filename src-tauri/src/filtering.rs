use serde::Serialize;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum LogKind {
    Print,
    Warn,
    Error,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct LogItem {
    pub content: String,
    #[serde(rename = "type")]
    pub kind: LogKind,
}

impl LogItem {
    fn new(content: impl Into<String>, kind: LogKind) -> Self {
        Self {
            content: content.into(),
            kind,
        }
    }
}

pub fn filter_line(line: &str, show_raw_logs: bool) -> Option<LogItem> {
    if show_raw_logs {
        return Some(LogItem::new(line, raw_kind(line)));
    }

    if is_system_message(line) {
        return None;
    }

    if line.contains("[FLog::Output]") {
        let content = after_tag(line)?;
        if is_system_message(content) {
            return None;
        }
        return Some(LogItem::new(content, LogKind::Print));
    }

    if line.contains("[FLog::Warning]")
        || (line.contains("[FLog::ClientScriptState]") && contains_ignore_ascii_case(line, "warning"))
    {
        let content = trim_label(after_tag(line)?, "warning:");
        return Some(LogItem::new(content, LogKind::Warn));
    }

    if line.contains("[FLog::ScriptContext]") || line.contains("[FLog::Error]") {
        let content = trim_label(after_tag(line)?, "error:");
        return Some(LogItem::new(content, LogKind::Error));
    }

    None
}

fn raw_kind(line: &str) -> LogKind {
    if line.contains("[FLog::Error]") || line.contains("[FLog::ScriptContext]") {
        return LogKind::Error;
    }

    if line.contains("[FLog::Warning]") {
        return LogKind::Warn;
    }

    LogKind::Print
}

fn after_tag(line: &str) -> Option<&str> {
    let (_, content) = line.split_once(']')?;
    let content = content.trim();
    if content.is_empty() {
        return None;
    }
    Some(content)
}

fn trim_label<'a>(content: &'a str, label: &str) -> &'a str {
    if content.len() >= label.len()
        && content.is_char_boundary(label.len())
        && content[..label.len()].eq_ignore_ascii_case(label)
    {
        return content[label.len()..].trim_start();
    }

    content
}

fn contains_ignore_ascii_case(line: &str, needle: &str) -> bool {
    line.to_ascii_lowercase().contains(needle)
}

fn is_system_message(line: &str) -> bool {
    if contains_ignore_ascii_case(line, "settings date header")
        || contains_ignore_ascii_case(line, "settings date timestamp")
        || contains_ignore_ascii_case(line, "settings x-signature")
    {
        return true;
    }

    if line.contains("(AppDelegate)")
        || (line.contains("Asset (Image)") && line.contains("load failed"))
        || line.contains("Warning: HTTP error url:")
        || line.contains("Warning: HTTP error body:")
        || line.contains("AnalyticsSessionId is")
        || line.contains("! Joining game")
        || line.contains("Connecting to UDMUX")
        || line.contains("Server RobloxGitHash:")
        || line.contains("Server Prefix:")
        || line.contains("Replicator created:")
        || line.contains("VoiceChatInternal")
        || line.contains("Hello world!!!")
        || line.contains("dirSizeOf(")
        || line.contains("Failed to load sound")
        || line.contains("Hidden Surface Removal")
        || line.contains("AdPortal is invalid")
        || line.contains("syncCookiesFromNativeToEngine was skipped")
        || line.contains("syncCookiesFromEngineToNative was skipped")
        || line.contains("setAssetFolder")
        || line.contains("setExtraAssetFolder")
        || line.contains("Evaluating deferred inferred crashes")
        || line.contains("GetServerChannelRemote not available")
        || line.contains("Unable to fetch completed survey ids")
        || line.contains("Wrap-deformer begin skinning-transfer context is empty")
        || line.contains("Wrap-deformer begin skinning-transfer resulted in an error")
        || line.contains("LoadClientSettingsFromLocal")
        || line.contains("Hello world ...!")
        || line.contains("Info: DataModel Loading")
    {
        return true;
    }

    !line.is_empty() && line.bytes().all(|byte| byte == b'*')
}

#[cfg(test)]
mod tests {
    use super::{filter_line, LogItem, LogKind};

    #[test]
    fn filters_system_lines_when_raw_logs_are_off() {
        assert_eq!(filter_line("Settings Date header: hi", false), None);
        assert_eq!(filter_line("********", false), None);
    }

    #[test]
    fn keeps_system_lines_when_raw_logs_are_on() {
        assert_eq!(
            filter_line("Settings Date header: hi", true),
            Some(LogItem {
                content: "Settings Date header: hi".into(),
                kind: LogKind::Print,
            })
        );
    }

    #[test]
    fn extracts_output_lines() {
        assert_eq!(
            filter_line("[FLog::Output] hello there", false),
            Some(LogItem {
                content: "hello there".into(),
                kind: LogKind::Print,
            })
        );
    }

    #[test]
    fn classifies_warning_and_error_lines() {
        assert_eq!(
            filter_line("[FLog::Warning] Warning: be careful", false),
            Some(LogItem {
                content: "be careful".into(),
                kind: LogKind::Warn,
            })
        );

        assert_eq!(
            filter_line("[FLog::Error] Error: kaboom", false),
            Some(LogItem {
                content: "kaboom".into(),
                kind: LogKind::Error,
            })
        );
    }
}
