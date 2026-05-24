---
name: simulator-settings
author: Igor Malyarov
description: Tweak iOS simulator settings via xcrun simctl. Use when granting app permissions, changing UI appearance, simulating location, or overriding status bar. Triggers on "simulator settings", "grant permission", "privacy", "dark mode", "light mode", "location", "status bar", "simctl".
allowed-tools: Bash(xcrun simctl:*)
---

# Simulator Settings via simctl

**Announce:** "I'm using the simulator-settings skill to configure simulator settings."

## Project Constants

Read from `.claude/AGENTS.md`:
- **Bundle ID:** `<bundle-id>`
- **Primary Simulator ID:** `<simulator-id>`
Substitute placeholders below with values from `.claude/AGENTS.md`.

## Privacy & Permissions

Grant, revoke, or reset app permissions.

```bash
xcrun simctl privacy <simulator-id> <action> <service> <bundle-id>
```

### Actions

| Action | Description |
|--------|-------------|
| `grant` | Grant access without prompting |
| `revoke` | Revoke access, deny all use |
| `reset` | Reset access, prompt on next use |

### Services

| Service | Description |
|---------|-------------|
| `all` | All services |
| `calendar` | Calendar access |
| `contacts` | Full contact details |
| `contacts-limited` | Basic contact info |
| `location` | Location when app in use |
| `location-always` | Location at all times |
| `photos` | Full photo library access |
| `photos-add` | Add photos only |
| `media-library` | Media library access |
| `microphone` | Audio input |
| `motion` | Motion and fitness data |
| `reminders` | Reminders access |
| `siri` | Siri integration |

### Examples

```bash
# Grant location access
xcrun simctl privacy <simulator-id> grant location <bundle-id>

# Grant all permissions
xcrun simctl privacy <simulator-id> grant all <bundle-id>

# Reset all permissions
xcrun simctl privacy <simulator-id> reset all <bundle-id>
```

## UI Settings

```bash
xcrun simctl ui <simulator-id> <option> [value]
```

### Options

| Option | Values |
|--------|--------|
| `appearance` | `light`, `dark` |
| `increase_contrast` | `enabled`, `disabled` |
| `content_size` | `extra-small`, `small`, `medium`, `large`, `extra-large`, `extra-extra-large`, `extra-extra-extra-large`, `accessibility-medium`, `accessibility-large`, `accessibility-extra-large`, `accessibility-extra-extra-large`, `accessibility-extra-extra-extra-large` |

### Examples

```bash
# Set dark mode
xcrun simctl ui <simulator-id> appearance dark

# Set light mode
xcrun simctl ui <simulator-id> appearance light

# Increase text size
xcrun simctl ui <simulator-id> content_size extra-large
```

## Location Simulation

```bash
xcrun simctl location <simulator-id> <action> [arguments]
```

### Actions

| Action | Description |
|--------|-------------|
| `set <lat>,<lon>` | Set fixed location |
| `clear` | Stop simulation, clear location |
| `list` | List available scenarios |
| `run <scenario>` | Run predefined scenario |

### Examples

```bash
# Set Moscow location
xcrun simctl location <simulator-id> set 55.7558,37.6173

# Clear simulated location
xcrun simctl location <simulator-id> clear
```

## Status Bar Overrides

```bash
xcrun simctl status_bar <simulator-id> override [flags]
```

### Flags

| Flag | Values |
|------|--------|
| `--time` | Time string (e.g., `"9:41"`) |
| `--dataNetwork` | `hide`, `wifi`, `3g`, `4g`, `lte`, `lte-a`, `lte+`, `5g`, `5g+`, `5g-uwb`, `5g-uc` |
| `--wifiMode` | `searching`, `failed`, `active` |
| `--wifiBars` | `0-3` |
| `--cellularMode` | `notSupported`, `searching`, `failed`, `active` |
| `--cellularBars` | `0-4` |
| `--operatorName` | Carrier name string |
| `--batteryState` | `charging`, `charged`, `discharging` |
| `--batteryLevel` | `0-100` |

### Examples

```bash
# Screenshot-ready status bar
xcrun simctl status_bar <simulator-id> override \
  --time "9:41" \
  --batteryLevel 100 \
  --batteryState charged \
  --wifiBars 3 \
  --cellularBars 4

# Clear overrides
xcrun simctl status_bar <simulator-id> clear
```

## Other Useful Commands

```bash
# Boot simulator
xcrun simctl boot <simulator-id>

# Shutdown simulator
xcrun simctl shutdown <simulator-id>

# Open URL in simulator
xcrun simctl openurl <simulator-id> "vortex://some/deeplink"

# Launch app
xcrun simctl launch <simulator-id> <bundle-id>

# Terminate app
xcrun simctl terminate <simulator-id> <bundle-id>
```
