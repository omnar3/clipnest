# Architecture

## Ownership

`src-tauri/core` owns storage, validation, text classification, secret filtering, retention, and backup merging. It can be tested without GTK, WebView2, or a running desktop. `src-tauri/src/lib.rs` owns the clipboard worker, IPC commands, file dialogs, window lifecycle, global shortcut, and tray menu.

The React interface has no direct SQLite or filesystem access. It calls a typed frontend adapter in `src/lib/api.ts`. Tauri uses Rust commands; the browser uses the isolated in-memory sample implementation in `src/lib/demo.ts`.

## Data flow

A background worker wakes every 650 ms. While paused, it does not read the clipboard. Windows application privacy format hints are checked before reading text and checked again before storing it. On start/resume, the first readable value is a baseline, not a new history entry. Non-text clipboard content resets the baseline to an empty fingerprint. Polling may miss multiple changes made between ticks.

Clipboard contents are hashed with SHA-256. The worker remembers the last fingerprint, not an extra copy of the text. Exact duplicate contents update the existing row's recency while preserving the title, favorite, category, original timestamp, and copy count. ClipNest-originated copy commands update the worker fingerprint to prevent a feedback loop. Copy counts count successful copy actions inside ClipNest, not all copies made by other programs.

A mutex serializes worker access, settings mutations, database writes, and application-originated clipboard writes. A failed database capture keeps the previous fingerprint so the worker can retry. SQLite inserts, retention pruning, and storage guard checks commit as one transaction. The UI subscribes to lightweight change notifications, then retrieves a snapshot. Its refresh loop coalesces notifications instead of racing overlapping reads. UI rendering is limited to 60 cards at a time with “Show more”; search operates over the bounded snapshot.

## Schema

- `clips`: UUID primary key, unique content fingerprint, content, kind, title, favorite, nullable category, creation/recency timestamps, copy count.
- `categories`: UUID, case-insensitive unique name, validated color.
- `settings`: one validated JSON row.

Foreign keys are enabled. Category deletion uses `ON DELETE SET NULL`. The schema version is stored in `PRAGMA user_version`; a newer version is rejected instead of overwritten. Prepared statements bind all content and user input. SQLite `secure_delete` is enabled and a rollback journal is used; deletion is not a guarantee of forensic erasure on SSDs, backups, or filesystem snapshots.

## Backup behavior

Backup files identify their format and schema. They contain clips and categories, not application settings. A native file dialog selects the destination/source; the renderer cannot provide arbitrary file paths. Export writes a temporary file in the destination directory, syncs it, then persists it over the selected destination. Import reads a bounded file, validates its format, and runs a single database transaction. Category names merge case-insensitively; new UUIDs are generated; categories are remapped. Existing text wins on duplicates. Content types are recalculated. Privacy rules, limits, and retention apply. Malformed category/title data causes rollback; filtered content is skipped.

## Security boundary

The native window only loads bundled local content. The production CSP denies external scripts, network requests, frames, and object embedding. Clipboard text is rendered as escaped React text, never as HTML. Pasted links are displayed as text, not opened automatically. No cloud API, telemetry, remote font, or external image is loaded.

There is no encryption at rest, password vault, process exclusion list, background service, launch-at-login integration, or clipboard image support in this codebase. Native operation is Windows-first. macOS/Linux builds would require their own platform configuration and integration checks. The browser preview is for UI inspection only.
