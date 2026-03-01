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
