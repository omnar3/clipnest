use crate::{model::*, privacy};
use rusqlite::{params, Connection, OptionalExtension};
use sha2::{Digest, Sha256};
use std::path::Path;

type Result<T> = std::result::Result<T, String>;
fn db_error(_: rusqlite::Error) -> String {
    "The local database could not complete this operation.".into()
}
fn hash(text: &str) -> String {
    format!("{:x}", Sha256::digest(text.as_bytes()))
}
pub struct Database {
    pub conn: Connection,
    pub settings: Settings,
}
impl Database {
    pub fn open(path: &Path) -> Result<Self> {
        Self::from_connection(Connection::open(path).map_err(db_error)?)
    }
    fn from_connection(conn: Connection) -> Result<Self> {
        let version: i64 = conn
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .map_err(db_error)?;
        if version > 1 {
            return Err("This database belongs to a newer ClipNest build. Update the application to open it.".into());
        }
        conn.busy_timeout(std::time::Duration::from_secs(5))
            .map_err(db_error)?;
        conn.execute_batch("PRAGMA foreign_keys=ON; PRAGMA journal_mode=DELETE; PRAGMA secure_delete=ON;
            CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, name TEXT NOT NULL COLLATE NOCASE UNIQUE, color TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS clips (
                id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL UNIQUE, content TEXT NOT NULL, kind TEXT NOT NULL,
                title TEXT NOT NULL DEFAULT '', favorite INTEGER NOT NULL DEFAULT 0,
                category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
                created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, copy_count INTEGER NOT NULL DEFAULT 0);
            CREATE INDEX IF NOT EXISTS clips_recency ON clips(updated_at DESC);
            CREATE INDEX IF NOT EXISTS clips_category ON clips(category_id);
            PRAGMA user_version=1;").map_err(db_error)?;
        let data: Option<String> = conn
            .query_row("SELECT data FROM settings WHERE id=1", [], |r| r.get(0))
            .optional()
            .map_err(db_error)?;
        let settings = match data {
            Some(data) => serde_json::from_str::<Settings>(&data).map_err(|_| {
                "Settings could not be read. Your history has not been changed.".to_string()
            })?,
            None => Settings::default(),
        };
        settings.validate()?;
        let mut db = Self { conn, settings };
        db.prune()?;
        Ok(db)
    }
    pub fn save_settings(&mut self, settings: Settings) -> Result<()> {
        settings.validate()?;
        let json =
            serde_json::to_string(&settings).map_err(|_| "Could not save settings.".to_string())?;
        let tx = self.conn.transaction().map_err(db_error)?;
        tx.execute("INSERT INTO settings(id,data) VALUES(1,?1) ON CONFLICT(id) DO UPDATE SET data=excluded.data", [&json]).map_err(db_error)?;
        Self::prune_connection(&tx, &settings)?;
        tx.commit().map_err(db_error)?;
        self.settings = settings;
        Ok(())
    }
    fn prune_connection(conn: &Connection, s: &Settings) -> Result<usize> {
        let cutoff = now() - i64::from(s.retention_days) * 86_400_000;
        let mut count = conn
            .execute(
                "DELETE FROM clips WHERE favorite=0 AND updated_at < ?1",
                [cutoff],
            )
            .map_err(db_error)?;
        count += conn.execute("DELETE FROM clips WHERE favorite=0 AND id NOT IN (SELECT id FROM clips WHERE favorite=0 ORDER BY updated_at DESC,id DESC LIMIT ?1)", [s.history_limit]).map_err(db_error)?;
        Ok(count)
    }
    fn validate_storage(conn: &Connection) -> Result<()> {
        let (count, bytes): (i64, i64) = conn
            .query_row(
                "SELECT COUNT(*), COALESCE(SUM(LENGTH(CAST(content AS BLOB))),0) FROM clips",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .map_err(db_error)?;
        if count > 10000 || bytes > 50_000_000 {
            return Err("History has reached its 10,000-clip or 50 MB safety limit. Delete some clips before capturing more.".into());
        }
        Ok(())
    }
    pub fn prune(&mut self) -> Result<usize> {
        Self::prune_connection(&self.conn, &self.settings)
    }
    pub fn capture(&mut self, content: &str) -> Result<bool> {
        if !privacy::allowed(content, &self.settings) {
            return Ok(false);
        }
        let time = now();
        let digest = hash(content);
        let tx = self.conn.transaction().map_err(db_error)?;
        tx.execute("INSERT INTO clips(id,fingerprint,content,kind,created_at,updated_at) VALUES(?1,?2,?3,?4,?5,?5)
            ON CONFLICT(fingerprint) DO UPDATE SET updated_at=excluded.updated_at",
            params![uuid::Uuid::new_v4().to_string(), digest, content, privacy::classify(content), time]).map_err(db_error)?;
        Self::prune_connection(&tx, &self.settings)?;
        Self::validate_storage(&tx)?;
        tx.commit().map_err(db_error)?;
        Ok(true)
    }
    pub fn snapshot(&self, error: Option<String>) -> Result<Snapshot> {
        let mut stmt = self.conn.prepare("SELECT id,content,kind,title,favorite,category_id,created_at,updated_at,copy_count FROM clips ORDER BY updated_at DESC,id DESC").map_err(db_error)?;
        let clips = stmt
            .query_map([], |r| {
                Ok(Clip {
                    id: r.get(0)?,
                    content: r.get(1)?,
                    kind: r.get(2)?,
                    title: r.get(3)?,
                    favorite: r.get(4)?,
                    category_id: r.get(5)?,
                    created_at: r.get(6)?,
                    updated_at: r.get(7)?,
                    copy_count: r.get(8)?,
                })
            })
            .map_err(db_error)?
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(db_error)?;
        let mut stmt = self
            .conn
            .prepare("SELECT id,name,color FROM categories ORDER BY name COLLATE NOCASE")
            .map_err(db_error)?;
        let categories = stmt
            .query_map([], |r| {
                Ok(Category {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    color: r.get(2)?,
                })
            })
            .map_err(db_error)?
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(db_error)?;
        Ok(Snapshot {
            clips,
            categories,
            settings: self.settings.clone(),
            capture_error: error,
        })
    }
    pub fn content(&self, id: &str) -> Result<String> {
        self.conn
            .query_row("SELECT content FROM clips WHERE id=?1", [id], |r| r.get(0))
            .optional()
            .map_err(db_error)?
            .ok_or_else(|| "This clip no longer exists.".into())
    }
    pub fn record_copy(&self, id: &str) -> Result<()> {
        self.conn
            .execute("UPDATE clips SET copy_count=copy_count+1 WHERE id=?1", [id])
            .map_err(db_error)?;
        Ok(())
    }
    pub fn update_clip(
        &mut self,
        id: &str,
        favorite: bool,
        category_id: Option<String>,
        title: &str,
    ) -> Result<()> {
        if title.chars().count() > 120 {
            return Err("Titles can contain up to 120 characters.".into());
        }
        let tx = self.conn.transaction().map_err(db_error)?;
        let changed = tx
            .execute(
                "UPDATE clips SET favorite=?2,category_id=?3,title=?4 WHERE id=?1",
                params![id, favorite, category_id, title.trim()],
            )
            .map_err(db_error)?;
        if changed == 0 {
            return Err("This clip no longer exists.".into());
        }
        Self::prune_connection(&tx, &self.settings)?;
        Self::validate_storage(&tx)?;
        tx.commit().map_err(db_error)?;
        Ok(())
    }
    pub fn delete(&self, ids: &[String]) -> Result<()> {
        if ids.len() > 10000 {
            return Err("Too many selected clips.".into());
        }
        let tx = self.conn.unchecked_transaction().map_err(db_error)?;
        for id in ids {
            tx.execute("DELETE FROM clips WHERE id=?1", [id])
                .map_err(db_error)?;
        }
        tx.commit().map_err(db_error)
    }
    pub fn clear(&self, include_favorites: bool) -> Result<()> {
        self.conn
            .execute(
                "DELETE FROM clips WHERE ?1 OR favorite=0",
                [include_favorites],
            )
            .map_err(db_error)?;
        Ok(())
    }
    pub fn category(&self, id: Option<String>, name: &str, color: &str) -> Result<()> {
        if name.trim().is_empty() || name.trim().chars().count() > 40 {
            return Err("Choose a category name of 1–40 characters.".into());
        }
        if !["mint", "blue", "violet", "amber", "rose"].contains(&color) {
            return Err("Invalid category color.".into());
        }
        let count: u32 = self
            .conn
            .query_row("SELECT COUNT(*) FROM categories", [], |r| r.get(0))
            .map_err(db_error)?;
        if id.is_none() && count >= 50 {
            return Err("You can create up to 50 categories.".into());
        }
        let result = match id {
            Some(id) => self.conn.execute(
                "UPDATE categories SET name=?2,color=?3 WHERE id=?1",
                params![id, name.trim(), color],
            ),
            None => self.conn.execute(
                "INSERT INTO categories(id,name,color) VALUES(?1,?2,?3)",
                params![uuid::Uuid::new_v4().to_string(), name.trim(), color],
            ),
        };
        result.map_err(|_| "Could not save category. Its name must be unique.".to_string())?;
        Ok(())
    }
    pub fn delete_category(&self, id: &str) -> Result<()> {
        self.conn
            .execute("DELETE FROM categories WHERE id=?1", [id])
            .map_err(db_error)?;
        Ok(())
    }
    pub fn backup(&self) -> Result<Backup> {
        let state = self.snapshot(None)?;
        Ok(Backup {
            format: "clipnest".into(),
            schema: 1,
            clips: state.clips,
            categories: state.categories,
        })
    }
    pub fn import(&mut self, backup: Backup) -> Result<usize> {
        if backup.format != "clipnest"
            || backup.schema != 1
            || backup.clips.len() > 10000
            || backup.categories.len() > 50
        {
            return Err("This is not a supported ClipNest backup.".into());
        }
        let tx = self.conn.transaction().map_err(db_error)?;
        let mut mapping = std::collections::HashMap::new();
        for c in backup.categories {
            if c.name.trim().is_empty()
                || c.name.chars().count() > 40
                || !["mint", "blue", "violet", "amber", "rose"].contains(&c.color.as_str())
            {
                return Err("Invalid backup category.".into());
            }
            let new_id = uuid::Uuid::new_v4().to_string();
            tx.execute(
                "INSERT OR IGNORE INTO categories(id,name,color) VALUES(?1,?2,?3)",
                params![new_id, c.name.trim(), c.color],
            )
            .map_err(db_error)?;
            let actual: String = tx
                .query_row(
                    "SELECT id FROM categories WHERE name=?1",
                    [c.name.trim()],
                    |r| r.get(0),
                )
                .map_err(db_error)?;
            mapping.insert(c.id, actual);
        }
        let count: u32 = tx
            .query_row("SELECT COUNT(*) FROM categories", [], |r| r.get(0))
            .map_err(db_error)?;
        if count > 50 {
            return Err("Import would exceed the 50-category limit.".into());
        }
        let mut inserted = 0;
        for c in backup.clips {
            if !privacy::allowed(&c.content, &self.settings) {
                continue;
            }
            if c.title.chars().count() > 120 {
                return Err("Invalid backup title.".into());
            }
            let category = c.category_id.as_ref().and_then(|id| mapping.get(id));
            let time = now();
            let created = c.created_at.clamp(0, time);
            let updated = c.updated_at.clamp(created, time);
            inserted += tx.execute("INSERT OR IGNORE INTO clips(id,fingerprint,content,kind,title,favorite,category_id,created_at,updated_at,copy_count) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
                params![uuid::Uuid::new_v4().to_string(),hash(&c.content),c.content,privacy::classify(&c.content),c.title,c.favorite,category,created,updated,c.copy_count]).map_err(db_error)?;
        }
        Self::prune_connection(&tx, &self.settings)?;
        Self::validate_storage(&tx)?;
        tx.commit().map_err(db_error)?;
        Ok(inserted)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    fn db() -> Database {
        Database::from_connection(Connection::open_in_memory().unwrap()).unwrap()
    }
    #[test]
    fn deduplicates_preserving_metadata() {
        let mut d = db();
        d.capture("hello world").unwrap();
        let clip = d.snapshot(None).unwrap().clips.remove(0);
        d.update_clip(&clip.id, true, None, "My note").unwrap();
        d.capture("hello world").unwrap();
        let s = d.snapshot(None).unwrap();
        assert_eq!(s.clips.len(), 1);
        assert!(s.clips[0].favorite);
        assert_eq!(s.clips[0].title, "My note");
    }
    #[test]
    fn category_removal_keeps_clip() {
        let mut d = db();
        d.category(None, "Work", "mint").unwrap();
        d.capture("some text").unwrap();
        let s = d.snapshot(None).unwrap();
        d.update_clip(&s.clips[0].id, false, Some(s.categories[0].id.clone()), "")
            .unwrap();
        d.delete_category(&s.categories[0].id).unwrap();
        assert!(d.snapshot(None).unwrap().clips[0].category_id.is_none());
    }
    #[test]
    fn limit_protects_favorites() {
        let mut d = db();
        let mut settings = d.settings.clone();
        settings.history_limit = 50;
        d.save_settings(settings).unwrap();
        d.capture("favorite").unwrap();
        let c = d.snapshot(None).unwrap().clips.remove(0);
        d.update_clip(&c.id, true, None, "").unwrap();
        for i in 0..70 {
            d.capture(&format!("item {i}")).unwrap();
        }
        let s = d.snapshot(None).unwrap();
        assert_eq!(s.clips.len(), 51);
        assert!(s.clips.iter().any(|c| c.favorite));
        d.clear(false).unwrap();
        assert_eq!(d.snapshot(None).unwrap().clips.len(), 1);
    }
    #[test]
    fn backup_merge_deduplicates() {
        let mut d = db();
        d.capture("test entry").unwrap();
        let b = d.backup().unwrap();
        assert_eq!(d.import(b).unwrap(), 0);
    }
    #[test]
    fn invalid_import_rolls_back() {
        let mut d = db();
        let b = Backup {
            format: "clipnest".into(),
            schema: 1,
            clips: vec![],
            categories: vec![
                Category {
                    id: "a".into(),
                    name: "Good".into(),
                    color: "mint".into(),
                },
                Category {
                    id: "b".into(),
                    name: "".into(),
                    color: "blue".into(),
                },
            ],
        };
        assert!(d.import(b).is_err());
        assert!(d.snapshot(None).unwrap().categories.is_empty());
    }
    #[test]
    fn retention_removes_old_clips_but_preserves_favorites() {
        let mut d = db();
        d.capture("old ordinary clip").unwrap();
        d.capture("old favorite clip").unwrap();
        let state = d.snapshot(None).unwrap();
        let favorite = state
            .clips
            .iter()
            .find(|c| c.content == "old favorite clip")
            .unwrap();
        d.update_clip(&favorite.id, true, None, "").unwrap();
        d.conn.execute("UPDATE clips SET updated_at=0", []).unwrap();
        d.prune().unwrap();
        let remaining = d.snapshot(None).unwrap().clips;
        assert_eq!(remaining.len(), 1);
        assert!(remaining[0].favorite);
    }
    #[test]
    fn storage_guard_rejects_oversized_history() {
        let d = db();
        d.conn.execute("INSERT INTO clips(id,fingerprint,content,kind,created_at,updated_at) VALUES('x','x',zeroblob(50000001),'text',1,1)", []).unwrap();
        assert!(Database::validate_storage(&d.conn).is_err());
    }
    #[test]
    fn newer_schema_is_not_downgraded() {
        let connection = Connection::open_in_memory().unwrap();
        connection.pragma_update(None, "user_version", 2).unwrap();
        assert!(Database::from_connection(connection).is_err());
    }
    #[test]
    fn settings_reject_out_of_range() {
        let mut s = Settings::default();
        s.history_limit = 1;
        assert!(s.validate().is_err());
    }
}
