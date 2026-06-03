#!/usr/bin/env bash
# Wiring test for doc-drift-orchestrator.sh. Stubs the worker (`openclaw`) and
# `curl`, points the wrapper at a throwaway sandbox via its env overrides, and
# asserts the select → worker → commit wiring without the live host or network.
# Run: bash agents/doc-drift-agent/runtime/cron/doc-drift-orchestrator.test.sh
set -uo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
WRAPPER="$HERE/doc-drift-orchestrator.sh"
SCOPE_SELECT_REAL="$HERE/../../scope-select"
REGISTRY="$HERE/../../agent/scope-registry.json"

pass=0; fail=0
check() { # name expected actual
  if [[ "$2" == "$3" ]]; then echo "ok   - $1"; pass=$((pass+1));
  else echo "FAIL - $1: expected [$2] got [$3]"; fail=$((fail+1)); fi
}

make_sandbox() { # echoes sandbox dir; stubs read log paths from env at run time
  local d; d=$(mktemp -d)
  mkdir -p "$d/repo" "$d/bin"
  ( cd "$d/repo" && git init -q && \
    git -c user.email=t@t -c user.name=t commit -q --allow-empty -m init )
  printf '{"channels":{"telegram":{"accounts":{"ai-labs":{"botToken":"x"}}}}}' > "$d/openclaw.json"
  cat > "$d/bin/curl" <<'EOF'
#!/usr/bin/env bash
echo called >> "$TG_LOG"
exit 0
EOF
  cat > "$d/bin/openclaw" <<'EOF'
#!/usr/bin/env bash
echo "$*" >> "$AGENT_LOG"
printf -- '- Findings: 0\n- Repo commit: abc1234 (trunk)\n'
exit 0
EOF
  chmod +x "$d/bin/curl" "$d/bin/openclaw"
  echo "$d"
}

run() { # $1=sandbox
  REFRESH=0 REPO_PATH="$1/repo" SCOPE_SELECT="$SCOPE_SELECT_REAL" \
  STATE_FILE="$1/state.json" LOG_FILE="$1/cron.log" \
  OPENCLAW_JSON="$1/openclaw.json" OPENCLAW_BIN_DIR="$1/bin" \
  AGENT_LOG="$1/agent.log" TG_LOG="$1/tg.log" \
  bash "$WRAPPER"
}

keys() { node -e 'const fs=require("fs");try{console.log(Object.keys(JSON.parse(fs.readFileSync(process.argv[1]))).length)}catch(e){console.log("absent")}' "$1"; }

# --- 1. happy path: absent state ⇒ a scope is selected, worker ok, state advances ---
s=$(make_sandbox)
# stub returns "ok" report for any message; worker is invoked with the real scope token
run "$s" >/dev/null 2>&1; rc=$?
check "happy: exit 0" "0" "$rc"
check "happy: worker invoked once" "1" "$(grep -c . "$s/agent.log" 2>/dev/null || echo 0)"
check "happy: worker got a --scope token" "1" "$(grep -c -- '--scope' "$s/agent.log" 2>/dev/null || echo 0)"
check "happy: one scope committed to state" "1" "$(keys "$s/state.json")"
rm -rf "$s"

# --- 2. no-op: every scope fresh at HEAD ⇒ nothing selected, worker never called ---
s=$(make_sandbox)
head=$(git -C "$s/repo" rev-parse HEAD); now=$(date -u +%FT%TZ)
node -e 'const fs=require("fs");const reg=JSON.parse(fs.readFileSync(process.argv[1]));const s={};for(const id of Object.keys(reg.scopes))s[id]={lastAuditedCommit:process.argv[2],lastAuditedAt:process.argv[3]};fs.writeFileSync(process.argv[4],JSON.stringify(s))' "$REGISTRY" "$head" "$now" "$s/state.json"
before=$(keys "$s/state.json")
run "$s" >/dev/null 2>&1; rc=$?
check "no-op: exit 0" "0" "$rc"
check "no-op: worker NOT invoked" "0" "$(grep -c . "$s/agent.log" 2>/dev/null || echo 0)"
check "no-op: state unchanged" "$before" "$(keys "$s/state.json")"
rm -rf "$s"

# --- 3. fail-closed: worker fails ⇒ exit 1, no commit, alert posted ---
s=$(make_sandbox)
# make the worker fail: replace the stub so any invocation exits non-zero w/o report
cat > "$s/bin/openclaw" <<'EOF'
#!/usr/bin/env bash
echo "$*" >> "$AGENT_LOG"
echo boom; exit 1
EOF
chmod +x "$s/bin/openclaw"
run "$s" >/dev/null 2>&1; rc=$?
check "fail: exit 1" "1" "$rc"
check "fail: no state written (no commit)" "absent" "$(keys "$s/state.json")"
check "fail: failure alert posted" "1" "$([[ -s "$s/tg.log" ]] && echo 1 || echo 0)"
rm -rf "$s"

echo "----"
echo "pass=$pass fail=$fail"
[[ "$fail" -eq 0 ]]
