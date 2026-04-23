#!/usr/bin/env bash
# LOC dashboard — counts code, generated, scripts, tests, and text files.
# Run from repo root: ./scripts/loc-dashboard.sh
# Options: --sort=name (default) | --sort=total
#
# ROW PROJECTS (implementation footprint only; update when row-bearing dirs change):
#   nomos, oracle, loki, corpus-scout, web-scout, neris, notio, claude-insights,
#   dev-skills, sandbox, tools
# Docs-only or pre-implementation directories remain known to drift detection
# but are intentionally omitted from LOC rows until they gain code/test/script
# footprint (currently: nexum, niora, regentara).

set -euo pipefail

SORT_BY="name"
for arg in "$@"; do
  case "$arg" in
    --sort=name)  SORT_BY="name"  ;;
    --sort=total) SORT_BY="total" ;;
  esac
done

DOCS_ONLY_DIRS=( "nexum" "niora" "regentara" )

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
TABLE_WIDTH=$(( COL_NAME + (COL_NUM + 1) * 6 ))

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

# Shared exclusions for all find commands
EXCLUDES=( ! -path "*/node_modules/*" ! -path "*/dist/*" ! -path "*/build/*" ! -path "*/.venv/*" ! -path "*/.build/*" ! -path "*/worktrees/*" )

count_project() {
  local dir="$1"

  # code: .js/.ts/.swift/.py, not test, not generated
  local code
  code=$(loc_find "$dir" \( -name "*.js" -o -name "*.ts" -o -name "*.swift" -o -name "*.py" \) \
    ! -name "*.test.js" ! -name "*.test.ts" ! -name "*.test.swift" \
    ! -name "*Tests.swift" ! -path "*Tests/*" ! -path "*/tests/*" \
    ! -name "test_*.py" ! -name "*_test.py" \
    ! -name "*.generated.js" ! -name "*.generated.ts" \
    ! -name "conftest.py" \
    "${EXCLUDES[@]}")

  # generated
  local gen
  gen=$(loc_find "$dir" \( -name "*.generated.js" -o -name "*.generated.ts" \) \
    "${EXCLUDES[@]}")

  # shell scripts
  local sh
  sh=$(loc_find "$dir" -name "*.sh" "${EXCLUDES[@]}")

  # tests: .test.js/.test.ts, *Tests.swift, Tests/ dir, test_*.py, conftest.py
  local tests
  tests=$(loc_find "$dir" \( \
    -name "*.test.js" -o -name "*.test.ts" -o \
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

  echo "$code $gen $sh $tests"
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

  # .claude/ directory (skills, settings, memory — not JSON)
  [[ -d ".claude" ]] && total=$((total + $(loc_find ".claude" -type f ! -name "*.json" ! -path "*/worktrees/*")))

  # docs/my-way/ methodology docs
  [[ -d "docs/my-way" ]] && total=$((total + $(loc_find "docs/my-way" -type f -name "*.md")))

  echo $total
}

# ---------- accumulator ----------

TC=0; TG=0; TS=0; TT=0; TX=0
ROWS=()

emit_row() {
  local name="$1" c="$2" g="$3" s="$4" t="$5" x="$6"
  local total=$(( c + g + s + t + x ))
  ROWS+=("${name}	${c}	${g}	${s}	${t}	${x}	${total}")
  TC=$((TC+c)); TG=$((TG+g)); TS=$((TS+s)); TT=$((TT+t)); TX=$((TX+x))
}

print_rows() {
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

# ---------- drift detection ----------

check_project_drift() {
  local known="agents claude-insights corpus-scout debates dev-skills docker docs gemini insights loki migrate-to-skills neris nexum niora node_modules nomos notio oracle prompts reading regentara research sandbox scripts tests tools vendor web-scout worktrees _inbox"
  local unknown=""
  for d in */; do
    d="${d%/}"
    if ! echo " $known " | grep -q " $d "; then
      unknown="${unknown} ${d}"
    fi
  done
  if [[ -n "$unknown" ]]; then
    echo "  ⚠ unknown top-level dirs (classify in loc-dashboard.sh):${unknown}"
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

# neris (Swift)
read rc rg rs rt < <(count_project "neris")
emit_row "neris" "$rc" "$rg" "$rs" "$rt" "0"

# notio (Swift)
read oc og os ot < <(count_project "notio")
emit_row "notio" "$oc" "$og" "$os" "$ot" "0"

# claude-insights (TS/Python)
read ic ig is it < <(count_project "claude-insights")
emit_row "claude-insights" "$ic" "$ig" "$is" "$it" "0"

# dev-skills
read dc dg ds dt < <(count_project "dev-skills")
emit_row "dev-skills" "$dc" "$dg" "$ds" "$dt" "0"

# sandbox
read sc sg ss st < <(count_project "sandbox")
emit_row "sandbox" "$sc" "$sg" "$ss" "$st" "0"

# tools
read tcg tgg tsg ttg < <(count_project "tools")
emit_row "tools" "$tcg" "$tgg" "$tsg" "$ttg" "0"

# repo-level rows
REPO_SH=$(loc_find "scripts" -name "*.sh" ! -path "*/node_modules/*")
REPO_JS=$(loc_find "scripts" \( -name "*.js" -o -name "*.ts" \) ! -path "*/node_modules/*" ! -name "*.test.js" ! -name "*.test.ts")
REPO_TESTS=$(loc_find "tests" \( -name "*.test.js" -o -name "*.test.ts" -o -name "test_*.py" -o -name "*.py" \) ! -path "*/node_modules/*" ! -path "*/.venv/*")
REPO_TESTS=$((REPO_TESTS + $(loc_find "scripts/tests" \( -name "*.test.js" -o -name "*.test.ts" \) ! -path "*/node_modules/*")))
emit_row "repo-scripts" "$REPO_JS" "0" "$REPO_SH" "$REPO_TESTS" "0"

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

OMITTED_ROWS=()
for dir in "${DOCS_ONLY_DIRS[@]}"; do
  if [[ -d "$dir" ]]; then
    OMITTED_ROWS+=( "$dir" )
  fi
done

if [[ ${#OMITTED_ROWS[@]} -gt 0 ]]; then
  echo "  omitted docs-only/pre-implementation dirs (no code/tests/scripts): ${OMITTED_ROWS[*]}"
fi

# drift detection
check_project_drift

echo ""
