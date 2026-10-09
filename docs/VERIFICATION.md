# Delivery verification

Performed on this source delivery in a Linux environment:

| Check                                                           | Result                                                      |
| --------------------------------------------------------------- | ----------------------------------------------------------- |
| TypeScript strict checking and Vite production build            | Passed                                                      |
| Vitest frontend logic tests                                     | 7 passed                                                    |
| Rust core tests using bundled SQLite                            | 12 passed                                                   |
| Playwright browser workflow tests                               | 7 passed                                                    |
| Desktop and narrow-screen visual review                         | Reviewed rendered screenshots                               |
| Responsive overflow checks                                      | Passed at 360, 390, 768, 1024, and 1440 px                  |
| Native Tauri application compilation                            | Blocked by missing Linux GTK/WebKit/pkg-config dependencies |
| Windows installer compilation                                   | Not run in this environment                                 |
| Actual Windows clipboard, tray, hotkey, and native file dialogs | Not run in this environment                                 |

The browser tests exercise the explicit sample adapter. They verify the frontend workflows but do not prove operating-system integration. The Rust tests exercise real SQLite, transactions, limits, duplicates, privacy filters, expiry, category foreign keys, backup rollback, and schema compatibility. They do not mock a successful Windows desktop run.

The repository includes Windows CI checks and a manually triggered installer workflow. These workflows have been authored, not executed against the user's GitHub repository as part of this delivery.

## Windows acceptance checks before publishing a release

1. Build and launch the application. Verify that capture begins paused and only enables after choosing to enable it.
2. Copy a fresh normal sentence in Notepad after the baseline tick. Confirm that a single clip appears, survives restarting the app, and copies back correctly.
3. Copy a different sentence, then the first one again. Confirm that duplicate text moves forward without losing its favorite/category/title.
4. Pause capture and copy text; verify it is absent. Resume, wait a second, and copy a new sentence; verify it appears.
5. Confirm standalone numeric codes, a synthetic API-key assignment, and text matching a custom ignored phrase are skipped. Use synthetic test data, not real secrets.
6. Verify Ctrl + Shift + V, tray show/pause/quit, close-to-tray, close-to-exit, second-instance activation, and start-minimized behavior.
7. Export a backup, clear history, and import it. Check duplicate merging, category mapping, canceled dialogs, invalid files, and privacy-filtered content.
8. Confirm reducing history limits preserves favorites, expired ordinary clips disappear, and category deletion keeps its clips.
9. Install the NSIS artifact on a Windows account and confirm the WebView2 application launches.

No production-ready or Windows-tested claim is implied until those checks pass.
