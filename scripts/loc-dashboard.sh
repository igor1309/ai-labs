#!/usr/bin/env bash
# LOC dashboard — counts code, tests, and docs files.
# Run from repo root: ./scripts/loc-dashboard.sh
# Options: --sort=name (default) | --sort=total
#
# ROW PROJECTS (update the loop in main when adding a new project):
#   agents, agister, agonara, cairana, claude-insights, clipdeck, corpus-scout,
#   dashboard-sync-agent, debates, dev-skills, dragoman, foliotell, insights,
#   loki, neris, nexum, nomos, noreta, notio, oracle, prompts, reading, reinix,
#   sandbox, session-digest, tools, web-scout

set -euo pipefail

SORT_BY="name"
for arg in "$@"; do
  case "$arg" in
    --sort=name)  SORT_BY="name"  ;;
    --sort=total) SORT_BY="total" ;;
  esac
done

# ---------- helpers ----------

loc_find() {
  # Sum line counts for files matching find predicates under <dir>.
  # Usage: loc_find <dir> [find-predicates...]
  local dir="$1"; shift
  local total=0
  while IFS= read -r f; do
    local n
    n=$(wc -l < "$f" 2>/dev/null || echo 0)
    total=$((total + n))
  done < <(find "$dir" "$@" 2>/dev/null)
  echo $total
}

COL_NAME=32
COL_NUM=8
TABLE_WIDTH=$(( COL_NAME + (COL_NUM + 1) * 4 ))

header() {
  echo ""
  printf "%-${COL_NAME}s %${COL_NUM}s %${COL_NUM}s %${COL_NUM}s %${COL_NUM}s\n" \
    "project" "code" "tests" "docs" "TOTAL"
  divider
}

row() {
  local name="$1" code="$2" tests="$3" text="$4"
  local total=$(( code + tests + text ))
  printf "%-${COL_NAME}s %${COL_NUM}s %${COL_NUM}s %${COL_NUM}s %${COL_NUM}s\n" \
    "$name" "$code" "$tests" "$text" "$total"
}

divider() {
  printf '%0.s─' $(seq 1 $TABLE_WIDTH); echo ""
}

# ---------- counting ----------

# Shared exclusions for all find commands
EXCLUDES=( ! -path "*/node_modules/*" ! -path "*/dist/*" ! -path "*/build/*" ! -path "*/.venv/*" ! -path "*/.build/*" ! -path "*/worktrees/*" ! -path "*/.wrangler/*" ! -path "*/wrangler/*" ! -path "*/img/*" ! -path "*/images/*" )

count_project() {
  local dir="$1"

  # code: .js/.ts/.swift/.py/.go/.svelte/.sql/.css/.html/.mjs/.sh, not test
  local code
  code=$(loc_find "$dir" \( -name "*.js" -o -name "*.ts" -o -name "*.swift" -o -name "*.py" -o -name "*.go" -o -name "*.svelte" -o -name "*.sql" -o -name "*.css" -o -name "*.html" -o -name "*.mjs" -o -name "*.sh" \) \
    ! -name "*.test.js" ! -name "*.test.ts" ! -name "*.test.swift" ! -name "*_test.go" \
    ! -name "*Tests.swift" ! -path "*Tests/*" ! -path "*/tests/*" \
    ! -name "test_*.py" ! -name "*_test.py" \
    ! -name "conftest.py" \
    "${EXCLUDES[@]}")

  # tests: .test.js/.test.ts, *Tests.swift, Tests/ dir, test_*.py, conftest.py, *_test.go
  local tests
  tests=$(loc_find "$dir" \( \
    -name "*.test.js" -o -name "*.test.ts" -o -name "*_test.go" -o \
    -name "*.test.swift" -o -name "*Tests.swift" -o \
    -name "test_*.py" -o -name "*_test.py" -o -name "conftest.py" \
    \) "${EXCLUDES[@]}")
  # Also count Swift files inside Tests/ directories
  local swift_tests_dir
  swift_tests_dir=$(loc_find "$dir" -path "*/Tests/*.swift" ! -name "*.test.swift" ! -name "*Tests.swift" "${EXCLUDES[@]}")
  # And Python files inside tests/ directories (not already matched)
  local py_tests_dir
  py_tests_dir=$(loc_find "$dir" -path "*/tests/*.py" ! -name "test_*.py" ! -name "*_test.py" ! -name "conftest.py" "${EXCLUDES[@]}")
  tests=$((tests + swift_tests_dir + py_tests_dir))

  # docs: .md files
  local text
  text=$(loc_find "$dir" -name "*.md" "${EXCLUDES[@]}")

  echo "$code $tests $text"
}

count_text() {
  local total=0

  # Root agent config files
  for f in AGENTS.md CLAUDE.md; do
    [[ -f "$f" ]] && total=$((total + $(wc -l < "$f")))
  done

  # Per-project AGENTS.md (exclude worktrees to avoid double-counting)
  while IFS= read -r f; do
    total=$((total + $(wc -l < "$f")))
  done < <(find . -name "AGENTS.md" -not -path "./AGENTS.md" ! -path "*/worktrees/*" ! -path "*/node_modules/*" ! -path "*/.build/*" 2>/dev/null)

  # .claude/ directory (skills, settings, memory — not JSON or OS junk)
  [[ -d ".claude" ]] && total=$((total + $(loc_find ".claude" -type f ! -name "*.json" ! -name ".DS_Store" ! -path "*/worktrees/*")))

  # .agents/ directory (progressive-disclosure agent docs — not JSON or OS junk)
  [[ -d ".agents" ]] && total=$((total + $(loc_find ".agents" -type f ! -name "*.json" ! -name ".DS_Store" ! -path "*/worktrees/*")))

  # docs/my-way/ methodology docs
  [[ -d "docs/my-way" ]] && total=$((total + $(loc_find "docs/my-way" -type f -name "*.md")))

  echo $total
}

# ---------- accumulator ----------

TC=0; TT=0; TX=0
ROWS=()

emit_row() {
  local name="$1" c="$2" t="$3" x="$4"
  local total=$(( c + t + x ))
  ROWS+=("${name}	${c}	${t}	${x}	${total}")
  TC=$((TC+c)); TT=$((TT+t)); TX=$((TX+x))
}

print_rows() {
  local sorted
  if [[ "$SORT_BY" == "total" ]]; then
    sorted=$(printf '%s\n' "${ROWS[@]}" | sort -t$'\t' -k5,5nr)
  else
    sorted=$(printf '%s\n' "${ROWS[@]}" | sort -t$'\t' -k1)
  fi
  while IFS=$'\t' read -r name c t x total; do
    printf "%-${COL_NAME}s %${COL_NUM}s %${COL_NUM}s %${COL_NUM}s %${COL_NUM}s\n" \
      "$name" "$c" "$t" "$x" "$total"
  done <<< "$sorted"
}

# ---------- drift detection ----------

check_project_drift() {
  local known=".claude .codex .git .github .lazyweb .wrangler agents agister agonara backlog cairana claude-insights clipdeck corpus-scout dashboard-sync-agent debates dev-skills docker docs dragoman foliotell img insights loki migrate-to-skills neris nexum node_modules nomos noreta notio oracle prompts reading reinix research sandbox scripts session-digest tests tools vendor web-scout worktrees _inbox"
  # Entries in `known` that may legitimately be absent (fresh clone, worktree, no active state, etc.).
  # Dotfile entries are tooling/config and skipped wholesale; the rest are explicit.
  local optional="node_modules vendor worktrees _inbox"
  local unknown=""
  local missing=""
  for d in */; do
    d="${d%/}"
    if ! echo " $known " | grep -q " $d "; then
      unknown="${unknown} ${d}"
    fi
  done
  for k in $known; do
    [[ "$k" == .* ]] && continue
    if echo " $optional " | grep -q " $k "; then
      continue
    fi
    if [[ ! -d "$k" ]]; then
      missing="${missing} ${k}"
    fi
  done
  if [[ -n "$unknown" ]]; then
    echo "  ⚠ unknown top-level dirs (classify in loc-dashboard.sh):${unknown}"
  fi
  if [[ -n "$missing" ]]; then
    echo "  ⚠ known dirs missing on disk (stale entries in loc-dashboard.sh):${missing}"
  fi
}

# ---------- main ----------

inner=$(( TABLE_WIDTH - 2 ))
printf "╔%s╗\n" "$(printf '%0.s═' $(seq 1 $inner))"
title="LOC Dashboard"
pad=$(( (inner - ${#title}) / 2 ))
printf "║%*s%s%*s║\n" $pad "" "$title" $(( inner - pad - ${#title} )) ""
printf "╚%s╝\n" "$(printf '%0.s═' $(seq 1 $inner))"
printf "  Generated: %s   sort: %s\n" "$(date '+%Y-%m-%d %H:%M')" "$SORT_BY"

# per-project rows
for proj in agents agister agonara cairana claude-insights clipdeck corpus-scout dashboard-sync-agent debates dev-skills dragoman foliotell insights loki neris nexum nomos noreta notio oracle prompts reading reinix sandbox session-digest tools web-scout; do
  [[ -d "$proj" ]] || continue
  read c t x < <(count_project "$proj")
  emit_row "$proj" "$c" "$t" "$x"
done

# repo-level rows
REPO_CODE=$(loc_find "scripts" \( -name "*.js" -o -name "*.ts" -o -name "*.sh" \) ! -path "*/node_modules/*" ! -name "*.test.js" ! -name "*.test.ts")
REPO_TESTS=$(loc_find "tests" \( -name "*.test.js" -o -name "*.test.ts" -o -name "test_*.py" -o -name "*.py" \) ! -path "*/node_modules/*" ! -path "*/.venv/*")
REPO_TESTS=$((REPO_TESTS + $(loc_find "scripts/tests" \( -name "*.test.js" -o -name "*.test.ts" \) ! -path "*/node_modules/*")))
emit_row "repo-scripts" "$REPO_CODE" "$REPO_TESTS" "0"

TEXT=$(count_text)
# Synthetic aggregate row for repo-wide text/docs; not a real directory.
emit_row "repo-text" "0" "0" "$TEXT"

# print sorted rows, then grand total
header
print_rows
divider
row "TOTAL" "$TC" "$TT" "$TX"
divider

# ratio
if [[ $TC -gt 0 ]]; then
  ratio=$(awk "BEGIN{printf \"%.1f\", $TT/$TC}")
  echo "  test/code ratio: ${ratio}x"
fi

# drift detection
check_project_drift

echo ""
