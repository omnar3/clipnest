use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Settings {
    pub paused: bool,
    pub onboarding_complete: bool,
    pub theme: String,
    pub history_limit: u32,
    pub retention_days: u32,
    pub max_text_bytes: u32,
    pub filter_sensitive: bool,
    pub ignored_phrases: Vec<String>,
    pub start_minimized: bool,
    pub close_to_tray: bool,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            paused: true,
            onboarding_complete: false,
            theme: "system".into(),
            history_limit: 500,
            retention_days: 30,
            max_text_bytes: 100_000,
            filter_sensitive: true,
            ignored_phrases: vec![],
            start_minimized: false,
            close_to_tray: true,
        }
    }
}
impl Settings {
    pub fn validate(&self) -> Result<(), String> {
        if !["light", "dark", "system"].contains(&self.theme.as_str()) {
            return Err("Invalid theme.".into());
        }
        if !(50..=5000).contains(&self.history_limit) {
            return Err("History limit must be 50–5,000.".into());
        }
        if !(1..=365).contains(&self.retention_days) {
            return Err("Retention must be 1–365 days.".into());
        }
        if !(1024..=1_000_000).contains(&self.max_text_bytes) {
            return Err("Text size must be 1,024–1,000,000 bytes.".into());
        }
        if self.ignored_phrases.len() > 50
            || self
                .ignored_phrases
                .iter()
                .any(|v| v.len() > 200 || v.trim().is_empty())
        {
            return Err("Use at most 50 nonempty ignored phrases, each up to 200 bytes.".into());
        }
        if !self.onboarding_complete && !self.paused {
            return Err("Enable capture from the welcome screen first.".into());
        }
        Ok(())
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Clip {
    pub id: String,
    pub content: String,
    pub kind: String,
    pub title: String,
    pub favorite: bool,
    pub category_id: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    pub copy_count: u32,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Category {
    pub id: String,
    pub name: String,
    pub color: String,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub clips: Vec<Clip>,
    pub categories: Vec<Category>,
    pub settings: Settings,
    pub capture_error: Option<String>,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Backup {
    pub format: String,
    pub schema: u32,
    pub clips: Vec<Clip>,
    pub categories: Vec<Category>,
}
pub fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}
