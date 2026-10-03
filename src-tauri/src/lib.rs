use clipnest_core::{database, model, privacy};

use database::Database;
use model::{Backup, Settings, Snapshot};
use sha2::{Digest, Sha256};
use std::{io::Read, sync::Mutex, time::Duration};
use tauri::{Emitter, Manager, State};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

struct Inner {
    db: Database,
    last_hash: Option<String>,
    capture_error: Option<String>,
    shortcut_error: Option<String>,
}
struct AppState(Mutex<Inner>);
fn lock(state: &AppState) -> Result<std::sync::MutexGuard<'_, Inner>, String> {
    state
        .0
        .lock()
        .map_err(|_| "ClipNest needs to be restarted.".into())
}
fn notify(app: &tauri::AppHandle) {
    let _ = app.emit("clipnest:changed", ());
}
fn show(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}
#[tauri::command]
fn get_snapshot(state: State<'_, AppState>) -> Result<Snapshot, String> {
    let s = lock(&state)?;
    s.db.snapshot(s.capture_error.clone().or(s.shortcut_error.clone()))
}
#[tauri::command]
fn save_settings(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    settings: Settings,
) -> Result<(), String> {
    let mut s = lock(&state)?;
    let reset = s.db.settings.paused != settings.paused;
    s.db.save_settings(settings)?;
    if reset {
        s.last_hash = None;
        s.capture_error = None;
    }
    drop(s);
    notify(&app);
    Ok(())
}
#[tauri::command]
fn update_clip(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    id: String,
    favorite: bool,
    category_id: Option<String>,
    title: String,
) -> Result<(), String> {
    lock(&state)?
        .db
        .update_clip(&id, favorite, category_id, &title)?;
    notify(&app);
    Ok(())
}
#[tauri::command]
fn copy_clip(app: tauri::AppHandle, state: State<'_, AppState>, id: String) -> Result<(), String> {
    let mut s = lock(&state)?;
    let text = s.db.content(&id)?;
    let mut clipboard = arboard::Clipboard::new()
        .map_err(|_| "Clipboard is unavailable. Try again.".to_string())?;
    clipboard.set_text(text.clone()).map_err(|_| {
        "Could not copy. Another application may be using the clipboard.".to_string()
    })?;
    s.last_hash = Some(format!("{:x}", Sha256::digest(text.as_bytes())));
    s.db.record_copy(&id)?;
    drop(s);
    notify(&app);
    Ok(())
}
#[tauri::command]
fn delete_clips(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    ids: Vec<String>,
) -> Result<(), String> {
    lock(&state)?.db.delete(&ids)?;
    notify(&app);
    Ok(())
}
#[tauri::command]
fn clear_history(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    include_favorites: bool,
) -> Result<(), String> {
    lock(&state)?.db.clear(include_favorites)?;
    notify(&app);
    Ok(())
}
#[tauri::command]
fn save_category(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    id: Option<String>,
    name: String,
    color: String,
) -> Result<(), String> {
    lock(&state)?.db.category(id, &name, &color)?;
    notify(&app);
    Ok(())
}
#[tauri::command]
fn delete_category(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    lock(&state)?.db.delete_category(&id)?;
    notify(&app);
    Ok(())
}
#[tauri::command]
async fn export_backup(app: tauri::AppHandle) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = match rfd::FileDialog::new()
            .set_title("Export unencrypted ClipNest backup")
            .add_filter("JSON backup", &["json"])
            .set_file_name("clipnest-backup.json")
            .save_file()
        {
            Some(p) => p,
            None => return Ok(false),
        };
        let state = app.state::<AppState>();
        let backup = lock(&state)?.db.backup()?;
        let bytes = serde_json::to_vec_pretty(&backup)
            .map_err(|_| "Could not prepare backup.".to_string())?;
        use std::io::Write;
        let parent = path
            .parent()
            .ok_or_else(|| "Invalid backup location.".to_string())?;
        let mut temporary = tempfile::NamedTempFile::new_in(parent)
            .map_err(|_| "Could not create backup file.".to_string())?;
        temporary
            .write_all(&bytes)
            .and_then(|_| temporary.as_file().sync_all())
            .map_err(|_| "Could not write backup.".to_string())?;
        temporary
            .persist(&path)
            .map_err(|_| "Could not save backup.".to_string())?;
        Ok(true)
    })
    .await
    .map_err(|_| "Backup operation failed.".to_string())?
}
#[tauri::command]
async fn import_backup(app: tauri::AppHandle) -> Result<Option<usize>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = match rfd::FileDialog::new()
            .set_title("Import ClipNest backup")
            .add_filter("JSON backup", &["json"])
            .pick_file()
        {
            Some(p) => p,
            None => return Ok(None),
        };
        let file = std::fs::File::open(path).map_err(|_| "Could not open backup.".to_string())?;
        let mut data = Vec::new();
        file.take(350_000_001)
            .read_to_end(&mut data)
            .map_err(|_| "Could not read backup.".to_string())?;
        if data.len() > 350_000_000 {
            return Err("Backups must be smaller than 350 MB.".into());
        }
        let backup: Backup = serde_json::from_slice(&data)
            .map_err(|_| "This file is not a valid ClipNest backup.".to_string())?;
        let state = app.state::<AppState>();
        let count = lock(&state)?.db.import(backup)?;
        notify(&app);
        Ok(Some(count))
    })
    .await
    .map_err(|_| "Import operation failed.".to_string())?
}
fn monitor(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        let mut clipboard = None;
        let mut ticks = 0u32;
        loop {
            std::thread::sleep(Duration::from_millis(650));
            let state = app.state::<AppState>();
            let Ok(mut s) = lock(&state) else { continue };
            ticks = ticks.wrapping_add(1);
            let mut changed = false;
            if ticks % 90 == 0 {
                match s.db.prune() {
                    Ok(n) => changed = n > 0,
                    Err(e) => {
                        if s.capture_error.as_ref() != Some(&e) {
                            s.capture_error = Some(e);
                            changed = true;
                        }
                    }
                }
            }
            if s.db.settings.paused {
                s.last_hash = None;
                drop(s);
                if changed {
                    notify(&app);
                }
                continue;
            }
            // Honor source application privacy hints before reading any clipboard text.
            if privacy::owner_excludes_capture() {
                s.last_hash = None;
                drop(s);
                if changed {
                    notify(&app);
                }
                continue;
            }
            if clipboard.is_none() {
                clipboard = arboard::Clipboard::new().ok();
            }
            let result = clipboard.as_mut().map(|c| c.get_text());
            match result {
                Some(Ok(text)) => {
                    let fingerprint = format!("{:x}", Sha256::digest(text.as_bytes()));
                    let baseline = s.last_hash.is_none();
                    let different = s.last_hash.as_ref() != Some(&fingerprint);
                    let previous_hash = s.last_hash.clone();
                    s.last_hash = Some(fingerprint);
                    if different && !baseline && !privacy::owner_excludes_capture() {
                        match s.db.capture(&text) {
                            Ok(saved) => {
                                changed |= saved;
                                changed |= s.capture_error.take().is_some();
                            }
                            Err(e) => {
                                changed |= s.capture_error.as_ref() != Some(&e);
                                s.capture_error = Some(e);
                                s.last_hash = previous_hash; // Retry a failed database write.
                            }
                        }
                    } else {
                        changed |= s.capture_error.take().is_some();
                    }
                }
                Some(Err(arboard::Error::ContentNotAvailable)) => {
                    // Empty/non-text clipboard still marks a new clipboard generation.
                    s.last_hash = Some(String::new());
                    changed |= s.capture_error.take().is_some();
                }
                _ => {
                    let message =
                        "Clipboard is busy or unavailable. ClipNest will retry automatically."
                            .to_string();
                    changed |= s.capture_error.as_ref() != Some(&message);
                    s.capture_error = Some(message);
                    clipboard = None;
                }
            }
            drop(s);
            if changed {
                notify(&app);
            }
        }
    });
}
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| show(app)))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _, event| {
                    if event.state() == ShortcutState::Pressed {
                        show(app);
                    }
                })
                .build(),
        )
        .setup(|app| {
            let data = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data)?;
            let db =
                Database::open(&data.join("clipnest.sqlite3")).map_err(std::io::Error::other)?;
            let hidden = db.settings.start_minimized && db.settings.onboarding_complete;
            app.manage(AppState(Mutex::new(Inner {
                db,
                last_hash: None,
                capture_error: None,
                shortcut_error: None,
            })));
            use tauri::{
                menu::{Menu, MenuItem},
                tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
            };
            let open = MenuItem::with_id(app, "open", "Open ClipNest", true, None::<&str>)?;
            let pause =
                MenuItem::with_id(app, "pause", "Pause / resume capture", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit ClipNest", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &pause, &quit])?;
            let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/32x32.png"))?;
            TrayIconBuilder::new()
                .icon(icon)
                .tooltip("ClipNest")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => show(app),
                    "pause" => {
                        let state = app.state::<AppState>();
                        if let Ok(mut s) = lock(&state) {
                            if !s.db.settings.onboarding_complete {
                                drop(s);
                                show(app);
                                return;
                            }
                            let mut settings = s.db.settings.clone();
                            settings.paused = !settings.paused;
                            match s.db.save_settings(settings) {
                                Ok(()) => {
                                    s.last_hash = None;
                                    s.capture_error = None;
                                }
                                Err(e) => s.capture_error = Some(e),
                            }
                        };
                        notify(app);
                    }
                    "quit" => app.exit(0),
                    _ => (),
                })
                .on_tray_icon_event(|tray, event| {
                    if matches!(
                        event,
                        TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        }
                    ) {
                        show(tray.app_handle());
                    }
                })
                .build(app)?;
            if let Err(_) = app.global_shortcut().register("CommandOrControl+Shift+V") {
                if let Ok(mut s) = lock(&app.state::<AppState>()) {
                    s.shortcut_error = Some(
                        "The global shortcut is in use. Open ClipNest from its tray icon.".into(),
                    );
                }
            }
            if !hidden {
                show(app.handle());
            }
            monitor(app.handle().clone());
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let state = window.state::<AppState>();
                let hide = lock(&state)
                    .map(|s| s.db.settings.close_to_tray)
                    .unwrap_or(false);
                if hide {
                    if window.hide().is_ok() {
                        api.prevent_close();
                    }
                } else {
                    window.app_handle().exit(0);
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_snapshot,
            save_settings,
            update_clip,
            copy_clip,
            delete_clips,
            clear_history,
            save_category,
            delete_category,
            export_backup,
            import_backup
        ])
        .run(tauri::generate_context!())
        .expect("ClipNest could not start");
}
