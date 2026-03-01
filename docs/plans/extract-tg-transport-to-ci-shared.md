# Extract Telegram Transport Script to ci-shared

Status: ready for implementation (requires access to both `ai-labs` and `ci-shared` repos)

## Goal

Extract the Telegram HTTP transport into `ci-shared` so any repo can send a message to any bot/chat with correct retry and timeout settings. Keep message formatting with callers.

## Design

### Script: `notify_telegram.sh`

```
Usage: notify_telegram.sh <token> <chat_id> <message>
```

**Responsibility — transport only:**
- Accept token, chat_id, and message as positional args
- POST to `https://api.telegram.org/bot<token>/sendMessage`
- curl flags: `-fsS --connect-timeout 5 --max-time 20 --retry 3 --retry-delay 1 --retry-all-errors`
- `--data-urlencode` for message text (safe special chars)
- Propagate exit code

**Not its responsibility:**
- Message formatting (emoji, templates) — caller
- Message splitting — caller
- Choosing which bot/chat — caller via args
- Deciding when to notify — caller

### Target script (~12 lines)

```bash
#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 3 ]; then
  echo "usage: notify_telegram.sh <token> <chat_id> <message>" >&2
  exit 2
fi

token="$1"
chat_id="$2"
message="$3"

curl -fsS --connect-timeout 5 --max-time 20 \
  --retry 3 --retry-delay 1 --retry-all-errors \
  -X POST "https://api.telegram.org/bot${token}/sendMessage" \
  -d "chat_id=${chat_id}" --data-urlencode "text=${message}"
```

## Implementation Steps

All steps require both repos checked out.

### Step 1 — Add script to ci-shared repo

1. Create `scripts/notify_telegram.sh` in `ci-shared` with the content above.
2. `chmod +x`.
3. Commit and push to `ci-shared` trunk.
4. Note the new commit SHA.

### Step 2 — Vendor into ai-labs

1. Update `vendor/ci-shared` subtree to the new `ci-shared` commit SHA.
2. Verify `vendor/ci-shared/scripts/notify_telegram.sh` exists.

### Step 3 — Add local wrapper in ai-labs

Create `scripts/ci/notify_telegram.sh` (follows `run_silent.sh` proxy pattern):

```bash
#!/usr/bin/env bash
set -euo pipefail

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec "$script_dir/../../vendor/ci-shared/scripts/notify_telegram.sh" "$@"
```

### Step 4 — Update callers in ai-labs

**A. `scripts/ci/notify_telegram_failure.sh`** — replace with wrapper call:

```bash
#!/usr/bin/env bash
set -euo pipefail

message="${1:-}"
if [ -z "$message" ]; then
  echo "usage: notify_telegram_failure.sh <message>" >&2
  exit 2
fi

: "${CI_BOT_TOKEN:?CI_BOT_TOKEN is required}"
: "${CI_CHAT_ID:?CI_CHAT_ID is required}"

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec "$script_dir/notify_telegram.sh" "$CI_BOT_TOKEN" "$CI_CHAT_ID" "$message"
```

This preserves the existing interface (env-var based) for `notify-telegram-failure.yml` — no workflow changes needed.

**B. `release-unit.yml:228`** — replace inline curl (see related issue):

```yaml
# Before (inline curl, missing retries):
curl -fsS --max-time 10 -X POST "https://api.telegram.org/bot${CI_BOT_TOKEN}/sendMessage" ...

# After (uses shared transport):
# Note: script must be available on VPS or copied during deploy.
# Simplest option: inline the same curl flags from the shared script.
# Or: scp the script to VPS during deploy setup.
```

> **Decision needed:** The VPS deploy step runs via SSH (`appleboy/ssh-action`), so scripts from the repo aren't available on the remote host. Options:
> 1. Inline the correct curl flags (matching the shared script) — simplest, still a mild duplication of flags but not logic.
> 2. Copy the script to VPS as part of deployment — cleaner but adds a step.
> 3. Run the notification from the GitHub runner instead of the VPS — requires restructuring the step.

### Step 5 — Tests

- Run `./scripts/run_silent.sh "tests" npm test` (full suite).
- Manually verify: `./scripts/ci/notify_telegram.sh <test-token> <test-chat-id> "test message"` (with a test bot).

### Step 6 — Commit and push ai-labs changes

## Current State Reference

| File | Role |
|---|---|
| `vendor/ci-shared/scripts/run_silent.sh` | Existing ci-shared script (pattern to follow) |
| `scripts/run_silent.sh` | Local wrapper proxy (pattern to follow) |
| `scripts/ci/notify_telegram_failure.sh` | Current TG script — env-var interface, 15 lines |
| `.github/workflows/notify-telegram-failure.yml` | Reusable workflow — formats failure messages, calls the script |
| `.github/workflows/release-unit.yml:228` | Inline curl — duplicate, missing retries (GitHub issue created) |
