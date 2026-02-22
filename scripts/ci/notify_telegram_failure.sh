#!/usr/bin/env bash

set -euo pipefail

message="${1:-}"
if [ -z "$message" ]; then
  echo "usage: notify_telegram_failure.sh <message>" >&2
  exit 2
fi

: "${CI_BOT_TOKEN:?CI_BOT_TOKEN is required}"
: "${CI_CHAT_ID:?CI_CHAT_ID is required}"

curl -fsS -X POST "https://api.telegram.org/bot${CI_BOT_TOKEN}/sendMessage" -d "chat_id=${CI_CHAT_ID}" --data-urlencode "text=${message}"
