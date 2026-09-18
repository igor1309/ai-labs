---
date: 2026-03-04
model: gpt-5
description: "Hourly ccswitch automation with macOS notifications via launchd."
---

# ccswitch Hourly Automation

## Overview

This setup runs:

`ccswitch.sh --switch`

every hour on macOS and posts a notification with the command output.

## Installed Components

- LaunchAgent label: `com.igormalyarov.ccswitch.hourly`
- LaunchAgent file: `~/Library/LaunchAgents/com.igormalyarov.ccswitch.hourly.plist`
- Wrapper script: `/Users/igormalyarov/Developer/claude-account-switcher-alfred/ccswitch-hourly-notify.sh`
- Source plist in repo: `/Users/igormalyarov/Developer/claude-account-switcher-alfred/com.igormalyarov.ccswitch.hourly.plist`

## Schedule

- Runs at minute `0` of every hour (`StartCalendarInterval` with `Minute = 0`).

## Runtime Behavior

The wrapper script:

1. Executes `ccswitch.sh --switch`.
2. Captures stdout/stderr.
3. Posts a macOS notification on success or failure.
4. Appends detailed output to a log file.

## Logs

- Wrapper log: `~/Library/Logs/ccswitch-hourly.log`
- launchd stdout: `~/Library/Logs/ccswitch-hourly.launchd.log`
- launchd stderr: `~/Library/Logs/ccswitch-hourly.launchd.err.log`

## Useful Commands

```bash
launchctl print gui/$(id -u)/com.igormalyarov.ccswitch.hourly
launchctl kickstart -k gui/$(id -u)/com.igormalyarov.ccswitch.hourly
tail -f ~/Library/Logs/ccswitch-hourly.log ~/Library/Logs/ccswitch-hourly.launchd.err.log
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.igormalyarov.ccswitch.hourly.plist
```
