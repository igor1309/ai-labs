---
name: ios-simulator-install
version: "1.0.0"
description: Install built iOS app on simulator for manual testing or deep link validation. Use when user requests to run or launch the app on simulator (not for xcodebuild test). Reads Bundle ID and Primary Simulator ID from .claude/AGENTS.md.
allowed-tools: Bash(bash:*), Bash(xcrun simctl:*), Read
---

# iOS Simulator Install

Install and launch iOS apps on simulator from Xcode build output.

## Configuration

Read `<repo_root>/.claude/AGENTS.md` to extract:
- **Bundle identifier** (e.g., `dev.igor.todoapp`)
- **Simulator UUID** (e.g., `XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX`)

These values can appear in any format (key-value, prose, etc.).

## Workflow

1. **Find the app bundle:**
   ```bash
   APP_PATH=$(bash scripts/find_app.sh "<bundle_identifier>")
   ```

2. **Install and launch:**
   ```bash
   # Without deep link
   bash scripts/install_app.sh "$APP_PATH" "<simulator_uuid>"

   # With deep link (optional parameter from user)
   bash scripts/install_app.sh "$APP_PATH" "<simulator_uuid>" "myapp://path"
   ```

## Scripts

- `scripts/find_app.sh <bundle_id>` — Finds most recent matching .app in DerivedData (iOS Simulator builds only)
- `scripts/install_app.sh <app_path> <uuid> [deep_link]` — Boots simulator, installs app, launches (optionally via deep link)

## Notes

- DerivedData path is auto-detected from Xcode preferences (supports custom paths)
- Simulator is booted automatically if not running
- Deep link parameter is optional and provided by user at invocation time
