# Changelog

## 1.0.0 — first public release

The first public release of Kamurafy — a fast, honest disk cleaner for macOS.

### Cleaning
- **One-tap sweep**: scans every category in parallel, cleans in one tap.
- Targets: Caches & Logs, Developer Junk (Xcode, Homebrew, npm, pip, Gradle), App Leftovers, Large Files, Duplicates, Trash.
- **Duplicate finder** with a size → partial-hash → full-hash funnel.
- **Space breakdown** bar showing where your disk went after a scan.

### Safety
- Single `SafeZone` perimeter validates every deletion (allowlist + denylist).
- **Safety Vault**: reversible delete with configurable retention (off / 3 / 7 / 30 days) and one-tap Undo.
- **Protected items**: mark any file or folder as never-touched.
- Personal files and heuristic finds always arrive unselected.

### Tools & convenience
- **App Uninstaller**: removes an app plus every trace it left.
- **Menu-bar companion** with live RAM/disk and a one-tap sweep.
- **Auto sweep** (opt-in) with a notification of the amount freed.
- **Lifetime stats**, item search/filter, keyboard shortcuts (⌘K / ⌘⌦ / ⌘F).
- Memory optimization via `purge`.

### Platform
- **28 languages** with in-app picker and system auto-detection.
- Native SwiftUI, compositor-driven animations, ~1.5 MB app.
- Requires macOS 15+.

[1.0.0]: https://github.com/gabrielkamura/kamurafy/releases/tag/v1.0.0
