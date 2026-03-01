# Extract Telegram Transport Script to ci-shared

Status: ready for implementation (requires access to both `ai-labs` and `ci-shared` repos)

## Goal

Extract the Telegram HTTP transport into `ci-shared` so any repo can send messages to any bot/chat with correct retry, timeout, and ordered delivery. Keep message formatting with callers.

Governed by: `docs/adr/ci/ADR-001-telegram-transport-api.md`

## Why extract transport, not the whole notification?

Message formatting (emoji, templates, job-result parsing) is business logic owned by each caller. Transport — the curl call with correct retry, timeout, and encoding flags — is the part that's easy to get subtly wrong. Different clients may also use different bots and chats, so token and chat_id are positional args rather than env vars. The script accepts variadic message chunks and sends them sequentially, guaranteeing delivery order. Splitting is a caller decision; ordered delivery is a transport concern.

## Design

### Script: `notify_telegram.sh`

```
Usage: notify_telegram.sh <token> <chat_id> <chunk1> [chunk2...]
```

**Responsibility — transport only:**
- Accept token, chat_id, and one or more message chunks as positional args
- POST each chunk to `https://api.telegram.org/bot<token>/sendMessage` sequentially
- curl flags: `-fsS --connect-timeout 5 --max-time 20 --retry 3 --retry-delay 1 --retry-all-errors`
- `--data-urlencode` for message text (safe special chars)
- Fail-fast: stop on first chunk failure, propagate exit code
- Partial delivery accepted (chunks sent before failure cannot be retracted)

**Not its responsibility:**
- Message formatting (emoji, templates) — caller
- Message splitting — caller
- Choosing which bot/chat — caller via args
- Deciding when to notify — caller

### Target script

```bash
#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 3 ]; then
  echo "usage: notify_telegram.sh <token> <chat_id> <chunk1> [chunk2...]" >&2
  exit 2
fi

token="$1"
chat_id="$2"
shift 2

for chunk in "$@"; do
  curl -fsS --connect-timeout 5 --max-time 20 --retry 3 --retry-delay 1 --retry-all-errors -X POST "https://api.telegram.org/bot${token}/sendMessage" -d "chat_id=${chat_id}" --data-urlencode "text=${chunk}"
done
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

**`scripts/ci/notify_telegram_failure.sh`** — rewrite as thin adapter:

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

This preserves the existing interface (env-var based) for `notify-telegram-failure.yml` — no workflow changes needed. The file stays at its current path and name; it becomes a thin adapter from the env-var convention to the positional-args transport script.

> **Out of scope:** The inline curl in `release-unit.yml:228` is tracked separately in [#62](https://github.com/igor1309/ai-labs/issues/62).

### Step 5 — Tests

- Run `./scripts/run_silent.sh "tests" npm test` (full suite).
- Manually verify: `./scripts/ci/notify_telegram.sh <test-token> <test-chat-id> "test message"` (with a test bot).

### Step 6 — Commit and push ai-labs changes

Expected changed files in ai-labs:
- `docs/adr/ci/ADR-001-telegram-transport-api.md` — new ADR
- `vendor/ci-shared/` — subtree update
- `scripts/ci/notify_telegram.sh` — new local wrapper
- `scripts/ci/notify_telegram_failure.sh` — rewritten as thin adapter (preserves existing env-var interface, delegates to `notify_telegram.sh`)

No workflow interface changes — `notify-telegram-failure.yml` and all callers remain unchanged.

## Current State Reference

| File | Role |
|---|---|
| `vendor/ci-shared/scripts/run_silent.sh` | Existing ci-shared script (pattern to follow) |
| `scripts/run_silent.sh` | Local wrapper proxy (pattern to follow) |
| `scripts/ci/notify_telegram_failure.sh` | Current TG script — env-var interface, 15 lines |
| `.github/workflows/notify-telegram-failure.yml` | Reusable workflow — formats failure messages, calls the script |
| `.github/workflows/release-unit.yml:228` | Inline curl — out of scope, tracked in [#62](https://github.com/igor1309/ai-labs/issues/62) |
