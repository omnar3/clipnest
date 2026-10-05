use crate::model::Settings;
use regex::Regex;
use std::sync::OnceLock;

fn secret_patterns() -> &'static Regex {
    static PATTERNS: OnceLock<Regex> = OnceLock::new();
    PATTERNS.get_or_init(|| Regex::new(r"(?im)(-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:AKIA|ASIA)[A-Z0-9]{16}\b|\bgh[pousr]_[A-Za-z0-9_]{20,}\b|\bgithub_pat_[A-Za-z0-9_]{20,}\b|\bsk-[A-Za-z0-9_-]{20,}\b|\bBearer\s+[A-Za-z0-9_.-]{16,}|(?:password|passwd|api[_-]?key|client[_-]?secret|access[_-]?token)\s*[:=]\s*\S+|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b)").expect("static privacy regex"))
}
fn payment_card(text: &str) -> bool {
    let trimmed = text.trim();
    if !trimmed
        .chars()
        .all(|c| c.is_ascii_digit() || c == ' ' || c == '-')
    {
        return false;
    }
    let digits: Vec<u32> = trimmed.chars().filter_map(|c| c.to_digit(10)).collect();
    if !(13..=19).contains(&digits.len()) || digits.iter().all(|d| *d == 0) {
        return false;
    }
    let sum: u32 = digits
        .iter()
        .rev()
        .enumerate()
        .map(|(i, d)| {
            let n = if i % 2 == 1 { d * 2 } else { *d };
            if n > 9 {
                n - 9
            } else {
                n
            }
        })
        .sum();
    sum % 10 == 0
}
pub fn allowed(text: &str, settings: &Settings) -> bool {
    if text.trim().is_empty() || text.len() > settings.max_text_bytes as usize {
        return false;
    }
    let lower = text.to_lowercase();
    if settings
        .ignored_phrases
        .iter()
        .any(|p| lower.contains(&p.to_lowercase()))
    {
        return false;
    }
    if !settings.filter_sensitive {
        return true;
    }
    let trimmed = text.trim();
    !secret_patterns().is_match(text)
        && !payment_card(text)
        && !(4..=8)
            .contains(&trimmed.len())
            .then(|| trimmed.bytes().all(|c| c.is_ascii_digit()))
            .unwrap_or(false)
}
pub fn classify(text: &str) -> &'static str {
    let t = text.trim();
    if (t.starts_with("https://") || t.starts_with("http://"))
        && !t.chars().any(char::is_whitespace)
    {
        "link"
    } else if serde_json::from_str::<serde_json::Value>(t).is_ok()
        && (t.starts_with('{') || t.starts_with('['))
    {
        "code"
    } else if t.contains("function ")
        || t.contains("const ")
        || t.contains("=>")
        || t.starts_with("SELECT ")
        || t.starts_with("import ")
        || t.starts_with("<html")
    {
        "code"
    } else {
        "text"
    }
}
// Windows clipboard owners can opt out of history without exposing the content to us.
#[cfg(windows)]
pub fn owner_excludes_capture() -> bool {
    use windows_sys::Win32::System::DataExchange::{
        IsClipboardFormatAvailable, RegisterClipboardFormatW,
    };
    [
        "ExcludeClipboardContentFromMonitorProcessing",
        "CanIncludeInClipboardHistory",
        "CanUploadToCloudClipboard",
    ]
    .iter()
    .any(|name| {
        let wide: Vec<u16> = name.encode_utf16().chain(Some(0)).collect();
        unsafe {
            let format = RegisterClipboardFormatW(wide.as_ptr());
            format != 0 && IsClipboardFormatAvailable(format) != 0
        }
    })
}
#[cfg(not(windows))]
pub fn owner_excludes_capture() -> bool {
    false
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn detects_secrets() {
        let s = Settings::default();
        for text in [
            "123456",
            "password=secret",
            "4111 1111 1111 1111",
            "-----BEGIN RSA PRIVATE KEY-----",
            "ghp_abcdefghijklmnopqrstuvwxyz123456",
        ] {
            assert!(!allowed(text, &s), "secret should be filtered");
        }
        assert!(allowed("Meeting at 10:30 tomorrow", &s));
        assert!(allowed("4111 1111 1111 1112", &s));
    }
    #[test]
    fn size_and_literal_exclusions() {
        let mut s = Settings::default();
        s.ignored_phrases = vec!["private.*".into()];
        assert!(!allowed("PRIVATE.* notes", &s));
        assert!(allowed("private notes", &s));
        assert!(!allowed(&"a".repeat(100001), &s));
        assert!(!allowed("  ", &s));
    }
    #[test]
    fn text_types() {
        assert_eq!(classify("https://example.com"), "link");
        assert_eq!(classify("{\"a\":1}"), "code");
        assert_eq!(classify("hello"), "text");
    }
}
