#!/usr/bin/env bash
set -euo pipefail

SCRIPTS_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "$TEST_ROOT"' EXIT

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

assert_equal() {
  local expected="$1"
  local actual="$2"
  local behavior="$3"

  [[ "$actual" == "$expected" ]] || fail "$behavior: expected '$expected', got '$actual'"
}

assert_nonzero() {
  local actual="$1"
  local behavior="$2"

  [[ "$actual" -ne 0 ]] || fail "$behavior: expected nonzero status"
}

assert_absent() {
  local path="$1"
  local behavior="$2"

  [[ ! -e "$path" ]] || fail "$behavior: unexpected file $path"
}

assert_directory() {
  local path="$1"
  local behavior="$2"

  [[ -d "$path" ]] || fail "$behavior: expected directory $path"
}

assert_files_equal() {
  local expected="$1"
  local actual="$2"
  local behavior="$3"

  cmp -s "$expected" "$actual" || fail "$behavior: complete file content differs"
}

assert_empty() {
  local path="$1"
  local behavior="$2"

  [[ ! -s "$path" ]] || fail "$behavior: expected empty file $path"
}

test_create_orders_sync_before_provision_and_forwards_stdout() {
  local case_root="$TEST_ROOT/create-order"
  local fake_scripts="$case_root/scripts"
  local fake_bin="$case_root/bin"
  local created_worktree="$case_root/repository.worktrees/feature-runtime"
  local reported_worktree="$case_root/worktree-link"
  local call_log="$case_root/calls"
  local expected_output="$case_root/expected-output"
  local output="$case_root/output"
  local stderr_output="$case_root/stderr-output"
  local status=0

  mkdir -p "$fake_scripts" "$fake_bin" "$case_root/repository" "$created_worktree"
  created_worktree="$(cd "$created_worktree" && pwd -P)"
  ln -s "$created_worktree" "$reported_worktree"

  cat > "$fake_scripts/git-worktree-create" <<'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail
echo "create $*" >> "$CALL_LOG"
mkdir -p "$CREATED_WORKTREE/.worktree-hooks"
cat > "$CREATED_WORKTREE/.worktree-hooks/runtime" <<'HOOK'
#!/usr/bin/env bash
set -euo pipefail
echo "provision $*" >> "$CALL_LOG"
printf '%s\n' \
  '{"schemaVersion": 91, "opaque": "keep  two spaces"}' \
  '{"nested": ["first", "second"]}'
printf '%s' 'opaque-final-line-without-newline'
HOOK
chmod +x "$CREATED_WORKTREE/.worktree-hooks/runtime"
SCRIPT

  cat > "$fake_scripts/ensure-shared-config-links.sh" <<'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail
echo "sync $*" >> "$CALL_LOG"
SCRIPT

  cat > "$fake_bin/git" <<'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail
if [[ "$*" == "worktree list --porcelain" ]]; then
  printf 'worktree %s\nHEAD deadbeef\nbranch refs/heads/feature/runtime\n\n' "$REPORTED_WORKTREE"
  exit 0
fi
echo "unexpected git invocation: $*" >&2
exit 97
SCRIPT

  chmod +x \
    "$fake_scripts/git-worktree-create" \
    "$fake_scripts/ensure-shared-config-links.sh" \
    "$fake_bin/git"

  if [[ -x "$SCRIPTS_DIR/worktree-create" ]]; then
    cp "$SCRIPTS_DIR/worktree-create" "$fake_scripts/worktree-create"
  fi

  CALL_LOG="$call_log" \
    CREATED_WORKTREE="$created_worktree" \
    REPORTED_WORKTREE="$reported_worktree" \
    PATH="$fake_bin:$PATH" \
    "$fake_scripts/worktree-create" feature/runtime > "$output" 2> "$stderr_output" || status=$?

  assert_equal 0 "$status" "create orchestration succeeds"
  assert_equal \
    $'create feature/runtime\nsync '"$created_worktree"$'\nprovision provision --worktree '"$created_worktree" \
    "$(cat "$call_log")" \
    "create orchestration order and canonical worktree argument"
  printf '%s\n' \
    '{"schemaVersion": 91, "opaque": "keep  two spaces"}' \
    '{"nested": ["first", "second"]}' > "$expected_output"
  printf '%s' 'opaque-final-line-without-newline' >> "$expected_output"
  assert_files_equal "$expected_output" "$output" "complete provision stdout is forwarded byte-for-byte"
  assert_empty "$stderr_output" "successful provision emits no diagnostics on stderr"
}

test_create_provision_failure_preserves_worktree() {
  local case_root="$TEST_ROOT/create-provision-failure"
  local fake_scripts="$case_root/scripts"
  local fake_bin="$case_root/bin"
  local created_worktree="$case_root/repository.worktrees/feature-runtime"
  local rollback_marker="$case_root/rollback-invoked"
  local status=0

  mkdir -p "$fake_scripts" "$fake_bin" "$case_root/repository" "$created_worktree"
  created_worktree="$(cd "$created_worktree" && pwd -P)"

  cat > "$fake_scripts/git-worktree-create" <<'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail
mkdir -p "$CREATED_WORKTREE/.worktree-hooks"
cat > "$CREATED_WORKTREE/.worktree-hooks/runtime" <<'HOOK'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' '{"state":"provision-failed"}'
exit 23
HOOK
chmod +x "$CREATED_WORKTREE/.worktree-hooks/runtime"
SCRIPT

  cat > "$fake_scripts/ensure-shared-config-links.sh" <<'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail
SCRIPT

  cat > "$fake_bin/git" <<'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail
if [[ "$*" == "worktree list --porcelain" ]]; then
  printf 'worktree %s\nHEAD deadbeef\nbranch refs/heads/feature/runtime\n\n' "$CREATED_WORKTREE"
  exit 0
fi
if [[ "${1-}" == "worktree" && "${2-}" == "remove" ]] || \
   [[ "${1-}" == "-C" && "${3-}" == "worktree" && "${4-}" == "remove" ]]; then
  mv "$CREATED_WORKTREE" "$CREATED_WORKTREE.rolled-back"
  : > "$ROLLBACK_MARKER"
  exit 0
fi
echo "unexpected git invocation: $*" >&2
exit 97
SCRIPT

  chmod +x \
    "$fake_scripts/git-worktree-create" \
    "$fake_scripts/ensure-shared-config-links.sh" \
    "$fake_bin/git"
  cp "$SCRIPTS_DIR/worktree-create" "$fake_scripts/worktree-create"

  CREATED_WORKTREE="$created_worktree" \
    PATH="$fake_bin:$PATH" \
    ROLLBACK_MARKER="$rollback_marker" \
    "$fake_scripts/worktree-create" feature/runtime >/dev/null 2>&1 || status=$?

  assert_equal 23 "$status" "provision failure is returned unchanged"
  assert_directory "$created_worktree" "provision failure preserves the created worktree for retry"
  assert_absent "$rollback_marker" "provision failure does not invoke automatic git rollback"
}

test_remove_disposes_before_git_removal() {
  local case_root="$TEST_ROOT/remove-order"
  local fake_scripts="$case_root/scripts"
  local fake_bin="$case_root/bin"
  local primary="$case_root/repository"
  local worktree="$case_root/repository.worktrees/feature-runtime"
  local worktree_input="$case_root/worktree-link"
  local call_log="$case_root/calls"
  local status=0

  mkdir -p "$fake_scripts" "$fake_bin" "$primary" "$worktree/.worktree-hooks"
  primary="$(cd "$primary" && pwd -P)"
  worktree="$(cd "$worktree" && pwd -P)"
  ln -s "$worktree" "$worktree_input"

  cat > "$worktree/.worktree-hooks/runtime" <<'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail
echo "dispose $*" >> "$CALL_LOG"
SCRIPT

  chmod +x "$worktree/.worktree-hooks/runtime"
  write_target_validation_git "$fake_bin/git"

  if [[ -x "$SCRIPTS_DIR/worktree-remove" ]]; then
    cp "$SCRIPTS_DIR/worktree-remove" "$fake_scripts/worktree-remove"
  fi

  CALL_LOG="$call_log" \
    FAKE_PRIMARY_WORKTREE="$primary" \
    FAKE_REGISTERED_WORKTREE="$worktree_input" \
    FAKE_TARGET_ROOT="$worktree_input" \
    PATH="$fake_bin:$PATH" \
    "$fake_scripts/worktree-remove" "$worktree_input/." >/dev/null 2>&1 || status=$?

  assert_equal 0 "$status" "remove orchestration succeeds"
  assert_equal \
    $'dispose dispose --worktree '"$worktree"$'\ngit -C '"$worktree"$' worktree remove '"$worktree" \
    "$(cat "$call_log")" \
    "disposal completes before git worktree removal"
}

test_remove_refuses_enrolled_worktree_with_missing_hook() {
  local case_root="$TEST_ROOT/remove-enrolled-missing-hook"
  local fake_scripts="$case_root/scripts"
  local fake_bin="$case_root/bin"
  local primary="$case_root/repository"
  local worktree="$case_root/repository.worktrees/feature-runtime"
  local call_log="$case_root/calls"
  local status=0

  mkdir -p "$fake_scripts" "$fake_bin" "$primary" "$worktree/.worktree-runtime"
  primary="$(cd "$primary" && pwd -P)"
  worktree="$(cd "$worktree" && pwd -P)"

  write_target_validation_git "$fake_bin/git"
  cp "$SCRIPTS_DIR/worktree-remove" "$fake_scripts/worktree-remove"

  CALL_LOG="$call_log" \
    FAKE_PRIMARY_WORKTREE="$primary" \
    FAKE_REGISTERED_WORKTREE="$worktree" \
    FAKE_TARGET_ROOT="$worktree" \
    PATH="$fake_bin:$PATH" \
    "$fake_scripts/worktree-remove" "$worktree" >/dev/null 2>&1 || status=$?

  assert_nonzero "$status" "enrolled worktree with missing runtime hook is refused"
  assert_absent "$call_log" "refused removal makes zero git worktree removal calls"
}

test_remove_allows_unenrolled_worktree_with_missing_hook() {
  local case_root="$TEST_ROOT/remove-unenrolled-missing-hook"
  local fake_scripts="$case_root/scripts"
  local fake_bin="$case_root/bin"
  local primary="$case_root/repository"
  local worktree="$case_root/repository.worktrees/feature-runtime"
  local call_log="$case_root/calls"
  local status=0

  mkdir -p "$fake_scripts" "$fake_bin" "$primary" "$worktree"
  primary="$(cd "$primary" && pwd -P)"
  worktree="$(cd "$worktree" && pwd -P)"

  write_target_validation_git "$fake_bin/git"
  cp "$SCRIPTS_DIR/worktree-remove" "$fake_scripts/worktree-remove"

  CALL_LOG="$call_log" \
    FAKE_PRIMARY_WORKTREE="$primary" \
    FAKE_REGISTERED_WORKTREE="$worktree" \
    FAKE_TARGET_ROOT="$worktree" \
    PATH="$fake_bin:$PATH" \
    "$fake_scripts/worktree-remove" "$worktree" >/dev/null 2>&1 || status=$?

  assert_equal 0 "$status" "unenrolled worktree without runtime hook may be removed"
  assert_equal \
    "git -C $worktree worktree remove $worktree" \
    "$(cat "$call_log")" \
    "unenrolled removal delegates exactly once to git"
}

run_enrolled_unusable_hook_case() {
  local case_name="$1"
  local hook_kind="$2"
  local case_root="$TEST_ROOT/$case_name"
  local fake_scripts="$case_root/scripts"
  local fake_bin="$case_root/bin"
  local primary="$case_root/repository"
  local worktree="$case_root/repository.worktrees/feature-runtime"
  local call_log="$case_root/calls"
  local status=0

  mkdir -p \
    "$fake_scripts" \
    "$fake_bin" \
    "$primary" \
    "$worktree/.worktree-hooks" \
    "$worktree/.worktree-runtime"
  primary="$(cd "$primary" && pwd -P)"
  worktree="$(cd "$worktree" && pwd -P)"

  case "$hook_kind" in
    broken)
      ln -s "$case_root/missing-runtime-hook" "$worktree/.worktree-hooks/runtime"
      ;;
    non-executable)
      printf '%s\n' '#!/usr/bin/env bash' > "$worktree/.worktree-hooks/runtime"
      ;;
    *)
      fail "unknown hook kind: $hook_kind"
      ;;
  esac

  write_target_validation_git "$fake_bin/git"
  cp "$SCRIPTS_DIR/worktree-remove" "$fake_scripts/worktree-remove"

  CALL_LOG="$call_log" \
    FAKE_PRIMARY_WORKTREE="$primary" \
    FAKE_REGISTERED_WORKTREE="$worktree" \
    FAKE_TARGET_ROOT="$worktree" \
    PATH="$fake_bin:$PATH" \
    "$fake_scripts/worktree-remove" "$worktree" >/dev/null 2>&1 || status=$?

  assert_nonzero "$status" "enrolled worktree with $hook_kind runtime hook is refused"
  assert_absent "$call_log" "enrolled $hook_kind hook makes zero git removal calls"
}

test_remove_refuses_enrolled_worktree_with_broken_hook() {
  run_enrolled_unusable_hook_case remove-enrolled-broken-hook broken
}

test_remove_refuses_enrolled_worktree_with_non_executable_hook() {
  run_enrolled_unusable_hook_case remove-enrolled-non-executable-hook non-executable
}

test_remove_retries_after_ambiguous_disposal() {
  local case_root="$TEST_ROOT/remove-ambiguous-retry"
  local fake_scripts="$case_root/scripts"
  local fake_bin="$case_root/bin"
  local primary="$case_root/repository"
  local worktree="$case_root/repository.worktrees/feature-runtime"
  local call_log="$case_root/calls"
  local hook_log="$case_root/hook-calls"
  local attempt_file="$case_root/attempt"
  local enrollment_sentinel="$worktree/.worktree-runtime/enrollment-sentinel"
  local expected_first_output="$case_root/expected-first-output"
  local first_output="$case_root/first-output"
  local first_stderr="$case_root/first-stderr"
  local first_status=0
  local retry_status=0

  mkdir -p \
    "$fake_scripts" \
    "$fake_bin" \
    "$primary" \
    "$worktree/.worktree-hooks" \
    "$worktree/.worktree-runtime"
  primary="$(cd "$primary" && pwd -P)"
  worktree="$(cd "$worktree" && pwd -P)"
  enrollment_sentinel="$worktree/.worktree-runtime/enrollment-sentinel"
  printf '%s\n' enrolled > "$enrollment_sentinel"

  cat > "$worktree/.worktree-hooks/runtime" <<'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail
echo "$*" >> "$HOOK_LOG"
if [[ ! -e "$ATTEMPT_FILE" ]]; then
  : > "$ATTEMPT_FILE"
  printf '%s\n' \
    '{"state":"ambiguous", "leftovers":["owned-resource"]}' \
    '{"diagnostic":"preserve  exact spacing"}'
  printf '%s' 'disposal-final-line-without-newline'
  exit 42
fi
printf '%s\n' '{"state":"disposed"}'
SCRIPT

  chmod +x "$worktree/.worktree-hooks/runtime"
  write_target_validation_git "$fake_bin/git"
  cp "$SCRIPTS_DIR/worktree-remove" "$fake_scripts/worktree-remove"

  ATTEMPT_FILE="$attempt_file" \
    CALL_LOG="$call_log" \
    FAKE_PRIMARY_WORKTREE="$primary" \
    FAKE_REGISTERED_WORKTREE="$worktree" \
    FAKE_TARGET_ROOT="$worktree" \
    HOOK_LOG="$hook_log" \
    PATH="$fake_bin:$PATH" \
    "$fake_scripts/worktree-remove" "$worktree" > "$first_output" 2> "$first_stderr" || first_status=$?

  assert_equal 42 "$first_status" "ambiguous disposal status is returned unchanged"
  printf '%s\n' \
    '{"state":"ambiguous", "leftovers":["owned-resource"]}' \
    '{"diagnostic":"preserve  exact spacing"}' > "$expected_first_output"
  printf '%s' 'disposal-final-line-without-newline' >> "$expected_first_output"
  assert_files_equal \
    "$expected_first_output" \
    "$first_output" \
    "complete ambiguous disposal stdout is forwarded byte-for-byte"
  assert_empty "$first_stderr" "ambiguous disposal emits no diagnostics on stderr"
  assert_equal \
    enrolled \
    "$(cat "$enrollment_sentinel")" \
    "failed disposal preserves managed enrollment state for retry"
  assert_absent "$call_log" "ambiguous disposal makes zero git worktree removal calls"

  ATTEMPT_FILE="$attempt_file" \
    CALL_LOG="$call_log" \
    FAKE_PRIMARY_WORKTREE="$primary" \
    FAKE_REGISTERED_WORKTREE="$worktree" \
    FAKE_TARGET_ROOT="$worktree" \
    HOOK_LOG="$hook_log" \
    PATH="$fake_bin:$PATH" \
    "$fake_scripts/worktree-remove" "$worktree" >/dev/null 2>&1 || retry_status=$?

  assert_equal 0 "$retry_status" "removal can be retried after disposal failure"
  assert_equal \
    $'dispose --worktree '"$worktree"$'\ndispose --worktree '"$worktree" \
    "$(cat "$hook_log")" \
    "retry invokes disposal again with the exact canonical path"
  assert_equal \
    "git -C $worktree worktree remove $worktree" \
    "$(cat "$call_log")" \
    "only successful retry invokes git removal"
}

write_target_validation_git() {
  local fake_git="$1"

  cat > "$fake_git" <<'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail

if [[ "${1-}" == "-C" && "${3-}" == "rev-parse" && "${4-}" == "--show-toplevel" ]]; then
  [[ "${FAKE_GIT_REJECT_IDENTITY:-0}" == 0 ]] || exit 128
  printf '%s\n' "$FAKE_TARGET_ROOT"
  exit 0
fi

if [[ "${1-}" == "-C" && "${3-}" == "worktree" && "${4-}" == "list" && "${5-}" == "--porcelain" ]]; then
  printf 'worktree %s\nHEAD primary\nbranch refs/heads/trunk\n\n' "$FAKE_PRIMARY_WORKTREE"
  if [[ "$FAKE_REGISTERED_WORKTREE" != "$FAKE_PRIMARY_WORKTREE" ]]; then
    printf 'worktree %s\nHEAD linked\nbranch refs/heads/feature/runtime\n\n' "$FAKE_REGISTERED_WORKTREE"
  fi
  exit 0
fi

if [[ "${1-}" == "-C" && "${3-}" == "worktree" && "${4-}" == "remove" ]]; then
  echo "git $*" >> "$CALL_LOG"
  exit 0
fi

echo "unexpected git invocation: $*" >&2
exit 97
SCRIPT
  chmod +x "$fake_git"
}

test_remove_refuses_primary_checkout_before_executable_hook() {
  local case_root="$TEST_ROOT/remove-primary-checkout"
  local fake_scripts="$case_root/scripts"
  local fake_bin="$case_root/bin"
  local primary="$case_root/repository"
  local call_log="$case_root/removal-calls"
  local hook_log="$case_root/hook-calls"
  local status=0

  mkdir -p "$fake_scripts" "$fake_bin" "$primary/.worktree-hooks"
  primary="$(cd "$primary" && pwd -P)"

  cat > "$primary/.worktree-hooks/runtime" <<'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail
echo "$*" >> "$HOOK_LOG"
SCRIPT
  chmod +x "$primary/.worktree-hooks/runtime"
  write_target_validation_git "$fake_bin/git"
  cp "$SCRIPTS_DIR/worktree-remove" "$fake_scripts/worktree-remove"

  CALL_LOG="$call_log" \
    FAKE_PRIMARY_WORKTREE="$primary" \
    FAKE_REGISTERED_WORKTREE="$primary" \
    FAKE_TARGET_ROOT="$primary" \
    HOOK_LOG="$hook_log" \
    PATH="$fake_bin:$PATH" \
    "$fake_scripts/worktree-remove" "$primary/." >/dev/null 2>&1 || status=$?

  assert_nonzero "$status" "primary checkout removal is refused"
  assert_absent "$hook_log" "primary checkout refusal makes zero runtime hook calls"
  assert_absent "$call_log" "primary checkout refusal makes zero git removal calls"
}

test_remove_refuses_unrelated_directory_before_executable_hook() {
  local case_root="$TEST_ROOT/remove-unrelated-directory"
  local fake_scripts="$case_root/scripts"
  local fake_bin="$case_root/bin"
  local unrelated="$case_root/unrelated"
  local call_log="$case_root/removal-calls"
  local hook_log="$case_root/hook-calls"
  local status=0

  mkdir -p "$fake_scripts" "$fake_bin" "$unrelated/.worktree-hooks"
  unrelated="$(cd "$unrelated" && pwd -P)"

  cat > "$unrelated/.worktree-hooks/runtime" <<'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail
echo "$*" >> "$HOOK_LOG"
SCRIPT
  chmod +x "$unrelated/.worktree-hooks/runtime"
  write_target_validation_git "$fake_bin/git"
  cp "$SCRIPTS_DIR/worktree-remove" "$fake_scripts/worktree-remove"

  CALL_LOG="$call_log" \
    FAKE_GIT_REJECT_IDENTITY=1 \
    FAKE_PRIMARY_WORKTREE="$case_root/repository" \
    FAKE_REGISTERED_WORKTREE="$unrelated" \
    FAKE_TARGET_ROOT="$unrelated" \
    HOOK_LOG="$hook_log" \
    PATH="$fake_bin:$PATH" \
    "$fake_scripts/worktree-remove" "$unrelated" >/dev/null 2>&1 || status=$?

  assert_nonzero "$status" "unrelated directory removal is refused"
  assert_absent "$hook_log" "unrelated directory refusal makes zero runtime hook calls"
  assert_absent "$call_log" "unrelated directory refusal makes zero git removal calls"
}

test_remove_refuses_worktree_subdirectory_before_executable_hook() {
  local case_root="$TEST_ROOT/remove-worktree-subdirectory"
  local fake_scripts="$case_root/scripts"
  local fake_bin="$case_root/bin"
  local primary="$case_root/repository"
  local worktree="$case_root/repository.worktrees/feature-runtime"
  local subdirectory="$worktree/nested"
  local call_log="$case_root/removal-calls"
  local hook_log="$case_root/hook-calls"
  local status=0

  mkdir -p "$fake_scripts" "$fake_bin" "$primary" "$subdirectory/.worktree-hooks"
  primary="$(cd "$primary" && pwd -P)"
  worktree="$(cd "$worktree" && pwd -P)"

  cat > "$subdirectory/.worktree-hooks/runtime" <<'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail
echo "$*" >> "$HOOK_LOG"
SCRIPT
  chmod +x "$subdirectory/.worktree-hooks/runtime"
  write_target_validation_git "$fake_bin/git"
  cp "$SCRIPTS_DIR/worktree-remove" "$fake_scripts/worktree-remove"

  CALL_LOG="$call_log" \
    FAKE_PRIMARY_WORKTREE="$primary" \
    FAKE_REGISTERED_WORKTREE="$worktree" \
    FAKE_TARGET_ROOT="$worktree" \
    HOOK_LOG="$hook_log" \
    PATH="$fake_bin:$PATH" \
    "$fake_scripts/worktree-remove" "$worktree/../feature-runtime/nested" >/dev/null 2>&1 || status=$?

  assert_nonzero "$status" "worktree subdirectory removal is refused"
  assert_absent "$hook_log" "subdirectory refusal makes zero runtime hook calls"
  assert_absent "$call_log" "subdirectory refusal makes zero git removal calls"
}

test_remove_refuses_unregistered_git_root_before_executable_hook() {
  local case_root="$TEST_ROOT/remove-unregistered-git-root"
  local fake_scripts="$case_root/scripts"
  local fake_bin="$case_root/bin"
  local primary="$case_root/repository"
  local unregistered="$case_root/unregistered"
  local other_registered="$case_root/repository.worktrees/other"
  local call_log="$case_root/removal-calls"
  local hook_log="$case_root/hook-calls"
  local status=0

  mkdir -p \
    "$fake_scripts" \
    "$fake_bin" \
    "$primary" \
    "$unregistered/.worktree-hooks" \
    "$other_registered"
  primary="$(cd "$primary" && pwd -P)"
  unregistered="$(cd "$unregistered" && pwd -P)"
  other_registered="$(cd "$other_registered" && pwd -P)"

  cat > "$unregistered/.worktree-hooks/runtime" <<'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail
echo "$*" >> "$HOOK_LOG"
SCRIPT
  chmod +x "$unregistered/.worktree-hooks/runtime"
  write_target_validation_git "$fake_bin/git"
  cp "$SCRIPTS_DIR/worktree-remove" "$fake_scripts/worktree-remove"

  CALL_LOG="$call_log" \
    FAKE_PRIMARY_WORKTREE="$primary" \
    FAKE_REGISTERED_WORKTREE="$other_registered" \
    FAKE_TARGET_ROOT="$unregistered" \
    HOOK_LOG="$hook_log" \
    PATH="$fake_bin:$PATH" \
    "$fake_scripts/worktree-remove" "$unregistered" >/dev/null 2>&1 || status=$?

  assert_nonzero "$status" "unregistered Git root removal is refused"
  assert_absent "$hook_log" "unregistered Git root refusal makes zero runtime hook calls"
  assert_absent "$call_log" "unregistered Git root refusal makes zero git removal calls"
}

test_create_orders_sync_before_provision_and_forwards_stdout
test_create_provision_failure_preserves_worktree
test_remove_disposes_before_git_removal
test_remove_refuses_enrolled_worktree_with_missing_hook
test_remove_allows_unenrolled_worktree_with_missing_hook
test_remove_refuses_enrolled_worktree_with_broken_hook
test_remove_refuses_enrolled_worktree_with_non_executable_hook
test_remove_retries_after_ambiguous_disposal
test_remove_refuses_primary_checkout_before_executable_hook
test_remove_refuses_unrelated_directory_before_executable_hook
test_remove_refuses_worktree_subdirectory_before_executable_hook
test_remove_refuses_unregistered_git_root_before_executable_hook
echo "PASS: worktree orchestration tests"
