#!/bin/sh
set -eu

test_dir=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
. "$test_dir/lib/test-common.sh"

check=$(mh_check_script leftovers)

seed_inspected_dirs() {
    mkdir -p "$sandbox_home/Library/Developer/Xcode/DerivedData"
    mkdir -p "$sandbox_home/Library/Developer/CoreSimulator/Caches"
    mkdir -p "$sandbox_home/Library/Caches"
    mkdir -p "$sandbox_home/Library/Caches/Homebrew/downloads"
    mkdir -p "$sandbox_home/.Trash"

    printf 'canary-derived\n' >"$sandbox_home/Library/Developer/Xcode/DerivedData/marker.txt"
    printf 'canary-sim\n'     >"$sandbox_home/Library/Developer/CoreSimulator/Caches/marker.txt"
    printf 'canary-cache\n'   >"$sandbox_home/Library/Caches/marker.txt"
    printf 'canary-brew\n'    >"$sandbox_home/Library/Caches/Homebrew/downloads/marker.txt"
    printf 'canary-trash\n'   >"$sandbox_home/.Trash/marker.txt"
}

verify_inspected_dirs_unchanged() {
    label=$1
    mh_assert_equal 'canary-derived' "$(cat "$sandbox_home/Library/Developer/Xcode/DerivedData/marker.txt")" "$label: derived data marker"
    mh_assert_equal 'canary-sim'     "$(cat "$sandbox_home/Library/Developer/CoreSimulator/Caches/marker.txt")" "$label: simulator marker"
    mh_assert_equal 'canary-cache'   "$(cat "$sandbox_home/Library/Caches/marker.txt")" "$label: user caches marker"
    mh_assert_equal 'canary-brew'    "$(cat "$sandbox_home/Library/Caches/Homebrew/downloads/marker.txt")" "$label: homebrew marker"
    mh_assert_equal 'canary-trash'   "$(cat "$sandbox_home/.Trash/marker.txt")" "$label: trash marker"
}

# Test 9 (spec): Leftovers never invokes the notifier.
mh_start_test "leftovers: never invokes the notifier"
mh_setup_sandbox
seed_inspected_dirs
mh_mock_du
mh_mock_terminal_notifier 0
"$check"
mh_assert_equal 0 "$(mh_notifier_call_count)" "notifier calls from leftovers"
mh_cleanup_sandbox

# Test 10 (spec): Leftovers never modifies the inspected directories.
mh_start_test "leftovers: never modifies inspected directories"
mh_setup_sandbox
seed_inspected_dirs
mh_mock_du
mh_mock_terminal_notifier 0
"$check"
verify_inspected_dirs_unchanged "after run"
mh_cleanup_sandbox

# Also assert the leftovers line shape is well-formed.
mh_start_test "leftovers: emits one well-formed JSONL line"
mh_setup_sandbox
seed_inspected_dirs
mh_mock_du
mh_mock_terminal_notifier 0
"$check"
mh_assert_file_lines 1 "$sandbox_log"
line=$(cat "$sandbox_log")
mh_assert_contains '"check":"leftovers"' "$line" "check field"
mh_assert_contains '"status":"ok"' "$line" "status field"
mh_assert_contains '"sizes":{' "$line" "sizes object present"
mh_assert_contains '"derived_data":' "$line" "derived_data key"
mh_assert_contains '"simulator_caches":' "$line" "simulator_caches key"
mh_assert_contains '"user_caches":' "$line" "user_caches key"
mh_assert_contains '"homebrew_downloads":' "$line" "homebrew_downloads key"
mh_assert_contains '"trash_old_30d":' "$line" "trash_old_30d key"
mh_cleanup_sandbox

mh_print_summary "test-leftovers.sh"
