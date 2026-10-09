# Privacy behavior

ClipNest stores clipboard text on the current device. The application has no user accounts, analytics, synchronization server, or remote content fetching. It begins with capture paused and asks the user to enable it.

Capture can be paused from the window, tray, or in-app shortcut. Pausing stops new reads and does not erase existing history or the system clipboard. Quitting the process stops monitoring. Closing the window may only hide it, depending on Settings.

The default filter skips common private-key headers, AWS access keys, GitHub tokens, `sk-` tokens, bearer tokens, JWT-looking strings, common `password`/`api_key`/secret assignments, standalone 4–8 digit codes, and standalone Luhn-valid 13–19 digit card numbers. Custom ignored phrases are literal, case-insensitive substring matches, not regular expressions. These rules can have false positives and false negatives. Ordinary passwords, embedded payment numbers, unusual token formats, and other sensitive text can still be saved. Pause before copying confidential material.

On Windows, the presence of `ExcludeClipboardContentFromMonitorProcessing`, `CanIncludeInClipboardHistory`, or `CanUploadToCloudClipboard` registered clipboard formats conservatively suppresses capture. This intentionally treats the presence of either latter hint as a reason to skip, regardless of its payload, and can skip otherwise harmless entries. It cannot identify every password-manager application or protect against another process modifying the clipboard between checks.

Data and JSON backups are unencrypted. Anyone with access to the user's application data or exported file may read the contents. Use Windows account access controls and disk encryption as appropriate. Deleting history does not clear the operating system clipboard, Windows clipboard history, third-party clipboard managers, exported backups, or filesystem snapshots. SQLite secure deletion is enabled but is not a guarantee of secure erasure from storage media.

Favorites persist beyond age/count retention until explicitly deleted. Turning on sensitive-content filtering does not retroactively inspect or purge older clips. Imports apply current filters. Exported backups contain all current clip text and should be treated as private files.
