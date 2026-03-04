#!/usr/bin/env bash
# LOC dashboard — counts code, generated, scripts, tests, and text files.
# Run from repo root: ./scripts/loc-dashboard.sh
# Options: --sort=name (default) | --sort=total

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
TABLE_WIDTH=$(( COL_NAME + (COL_NUM + 1) * 6 ))  # 86: name + 6 cols each with leading space

header() {
  echo ""
  printf "%-${COL_NAME}s %${COL_NUM}s %${COL_NUM}s %${COL_NUM}s %${COL_NUM}s %${COL_NUM}s %${COL_NUM}s\n" \
    "project" "code" "gen" "scripts" "tests" "text" "TOTAL"
  divider
}

row() {
  local name="$1" code="$2" gen="$3" sh="$4" tests="$5" text="$6"
  local total=$(( code + gen + sh + tests + text ))
  printf "%-${COL_NAME}s %${COL_NUM}s %${COL_NUM}s %${COL_NUM}s %${COL_NUM}s %${COL_NUM}s %${COL_NUM}s\n" \
    "$name" "$code" "$gen" "$sh" "$tests" "$text" "$total"
}

divider() {
  printf '%0.s─' $(seq 1 $TABLE_WIDTH); echo ""
}

# ---------- counting ----------

count_project() {
  local dir="$1"
  # code: .js/.ts, not test, not generated
  local code
  code=$(loc_find "$dir" \( -name "*.js" -o -name "*.ts" \) \
    ! -name "*.test.js" ! -name "*.test.ts" \
    ! -name "*.generated.js" ! -name "*.generated.ts" \
    ! -path "*/node_modules/*" ! -path "*/dist/*" ! -path "*/build/*" ! -path "*/.venv/*")
  # generated
  local gen
  gen=$(loc_find "$dir" \( -name "*.generated.js" -o -name "*.generated.ts" \) \
    ! -path "*/node_modules/*" ! -path "*/.venv/*")
  # shell scripts
  local sh
  sh=$(loc_find "$dir" -name "*.sh" ! -path "*/node_modules/*")
  # tests
  local tests
  tests=$(loc_find "$dir" \( -name "*.test.js" -o -name "*.test.ts" \) \
    ! -path "*/node_modules/*" ! -path "*/.venv/*")
  echo "$code $gen $sh $tests"
}

count_text() {
  # Text/doc files: AGENTS.md, CLAUDE.md, .claude/, .codex/
  local total=0
  for f in AGENTS.md CLAUDE.md; do
    [[ -f "$f" ]] && total=$((total + $(wc -l < "$f")))
  done
  [[ -d ".claude" ]] && total=$((total + $(loc_find ".claude" -type f ! -name "*.json")))
  [[ -d ".codex"  ]] && total=$((total + $(loc_find ".codex"  -type f ! -name "*.json")))
  echo $total
}

# ---------- accumulator ----------

TC=0; TG=0; TS=0; TT=0; TX=0   # grand totals: code gen scripts tests text
ROWS=()                          # buffered rows: tab-separated name c g s t x

emit_row() {
  local name="$1" c="$2" g="$3" s="$4" t="$5" x="$6"
  local total=$(( c + g + s + t + x ))
  ROWS+=("${name}	${c}	${g}	${s}	${t}	${x}	${total}")
  TC=$((TC+c)); TG=$((TG+g)); TS=$((TS+s)); TT=$((TT+t)); TX=$((TX+x))
}

print_rows() {
  # sort by name (field 1) or total (field 7, numeric descending)
  local sorted
  if [[ "$SORT_BY" == "total" ]]; then
    sorted=$(printf '%s\n' "${ROWS[@]}" | sort -t$'\t' -k7 -rn)
  else
    sorted=$(printf '%s\n' "${ROWS[@]}" | sort -t$'\t' -k1)
  fi
  while IFS=$'\t' read -r name c g s t x total; do
    printf "%-${COL_NAME}s %${COL_NUM}s %${COL_NUM}s %${COL_NUM}s %${COL_NUM}s %${COL_NUM}s %${COL_NUM}s\n" \
      "$name" "$c" "$g" "$s" "$t" "$x" "$total"
  done <<< "$sorted"
}

# ---------- main ----------

inner=$(( TABLE_WIDTH - 2 ))
printf "╔%s╗\n" "$(printf '%0.s═' $(seq 1 $inner))"
title="LOC Dashboard"
pad=$(( (inner - ${#title}) / 2 ))
printf "║%*s%s%*s║\n" $pad "" "$title" $(( inner - pad - ${#title} )) ""
printf "╚%s╝\n" "$(printf '%0.s═' $(seq 1 $inner))"
printf "  Generated: %s   sort: %s\n" "$(date '+%Y-%m-%d %H:%M')" "$SORT_BY"

# collect all rows (order doesn't matter — they get sorted before printing)

# nomos
read nc ng ns nt < <(count_project "nomos")
emit_row "nomos" "$nc" "$ng" "$ns" "$nt" "0"

# oracle packages
for pkg in oracle/packages/*/; do
  name="oracle-$(basename "$pkg")"
  read c g s t < <(count_project "$pkg")
  emit_row "$name" "$c" "$g" "$s" "$t" "0"
done

# oracle apps
for app in oracle/apps/*/; do
  name="oracle-$(basename "$app")"
  read c g s t < <(count_project "$app")
  emit_row "$name" "$c" "$g" "$s" "$t" "0"
done

# loki
read lc lg ls lt < <(count_project "loki")
emit_row "loki" "$lc" "$lg" "$ls" "$lt" "0"

# corpus-scout
read cc cg cs ct < <(count_project "corpus-scout")
emit_row "corpus-scout" "$cc" "$cg" "$cs" "$ct" "0"

# web-scout
read wc wg ws wt < <(count_project "web-scout")
emit_row "web-scout" "$wc" "$wg" "$ws" "$wt" "0"

# repo-level rows
REPO_SH=$(loc_find "scripts" -name "*.sh")
emit_row "repo-scripts" "0" "0" "$REPO_SH" "0" "0"

TEXT=$(count_text)
emit_row "agents" "0" "0" "0" "0" "$TEXT"

# print sorted rows, then grand total
header
print_rows
divider
row "TOTAL" "$TC" "$TG" "$TS" "$TT" "$TX"
divider

# ratio
if [[ $TC -gt 0 ]]; then
  ratio=$(awk "BEGIN{printf \"%.1f\", $TT/$TC}")
  echo "  test/code ratio: ${ratio}x"
fi
echo ""
