#!/bin/sh
set -eu

test_dir=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
. "$test_dir/lib/test-common.sh"

check=$(mh_check_script memory)

# Test 1 (spec): emits one JSONL line per invocation.
mh_start_test "emits one JSONL line per invocation"
mh_setup_sandbox
mh_mock_memory_pressure normal
mh_mock_sysctl_swap 0
mh_mock_terminal_notifier 0
"$check"
mh_assert_file_lines 1 "$sandbox_log"
line=$(cat "$sandbox_log")
mh_assert_contains '"check":"memory"' "$line" "log line check field"
mh_assert_contains '"status":"' "$line" "log line status field"
mh_assert_contains '"pressure":"normal"' "$line" "log line pressure field"
mh_assert_contains '"swap_used_mb":0' "$line" "log line swap field"
mh_cleanup_sandbox

# Test 2 (spec): status=ok when pressure=normal (regardless of swap).
mh_start_test "status=ok when pressure=normal regardless of swap"
mh_setup_sandbox
mh_mock_memory_pressure normal
mh_mock_sysctl_swap 4096
mh_mock_terminal_notifier 0
# Seed a long history of high, growing swap to ensure trend rule would fire if checked.
mh_seed_log \
    '{"ts":"t","check":"memory","status":"ok","pressure":"normal","swap_used_mb":2000}' \
    '{"ts":"t","check":"memory","status":"ok","pressure":"normal","swap_used_mb":2500}' \
    '{"ts":"t","check":"memory","status":"ok","pressure":"normal","swap_used_mb":3000}' \
    '{"ts":"t","check":"memory","status":"ok","pressure":"normal","swap_used_mb":3500}' \
    '{"ts":"t","check":"memory","status":"ok","pressure":"normal","swap_used_mb":3900}'
"$check"
last_line=$(tail -n 1 "$sandbox_log")
mh_assert_contains '"status":"ok"' "$last_line" "status when pressure=normal"
mh_assert_equal 0 "$(mh_notifier_call_count)" "notifier call count for status=ok"
mh_cleanup_sandbox

# Test 3a (spec): status=critical only when pressure=critical AND swap trending up.
mh_start_test "status=critical when pressure=critical AND swap trending up"
mh_setup_sandbox
mh_mock_memory_pressure critical
mh_mock_sysctl_swap 2000
mh_mock_terminal_notifier 0
mh_seed_log \
    '{"ts":"t","check":"memory","status":"ok","pressure":"normal","swap_used_mb":100}' \
    '{"ts":"t","check":"memory","status":"ok","pressure":"normal","swap_used_mb":200}' \
    '{"ts":"t","check":"memory","status":"ok","pressure":"normal","swap_used_mb":300}' \
    '{"ts":"t","check":"memory","status":"ok","pressure":"normal","swap_used_mb":400}' \
    '{"ts":"t","check":"memory","status":"ok","pressure":"normal","swap_used_mb":500}'
"$check"
last_line=$(tail -n 1 "$sandbox_log")
mh_assert_contains '"status":"critical"' "$last_line" "status when critical+trending"
mh_cleanup_sandbox

# Test 3b (spec): pressure=critical with stable swap maps to warn, not critical.
mh_start_test "pressure=critical with stable swap maps to warn"
mh_setup_sandbox
mh_mock_memory_pressure critical
mh_mock_sysctl_swap 500
mh_mock_terminal_notifier 0
mh_seed_log \
    '{"ts":"t","check":"memory","status":"ok","pressure":"normal","swap_used_mb":500}' \
    '{"ts":"t","check":"memory","status":"ok","pressure":"normal","swap_used_mb":500}' \
    '{"ts":"t","check":"memory","status":"ok","pressure":"normal","swap_used_mb":500}' \
    '{"ts":"t","check":"memory","status":"ok","pressure":"normal","swap_used_mb":500}' \
    '{"ts":"t","check":"memory","status":"ok","pressure":"normal","swap_used_mb":500}'
"$check"
last_line=$(tail -n 1 "$sandbox_log")
mh_assert_contains '"status":"warn"' "$last_line" "status when critical+stable swap"
mh_cleanup_sandbox

# Test 4 (spec): notification fires on ok -> critical transition.
mh_start_test "notification fires on ok->critical transition"
mh_setup_sandbox
mh_mock_memory_pressure critical
mh_mock_sysctl_swap 2000
mh_mock_terminal_notifier 0
mh_seed_log \
    '{"ts":"t","check":"memory","status":"ok","pressure":"normal","swap_used_mb":100}' \
    '{"ts":"t","check":"memory","status":"ok","pressure":"normal","swap_used_mb":200}' \
    '{"ts":"t","check":"memory","status":"ok","pressure":"normal","swap_used_mb":300}' \
    '{"ts":"t","check":"memory","status":"ok","pressure":"normal","swap_used_mb":400}' \
    '{"ts":"t","check":"memory","status":"ok","pressure":"normal","swap_used_mb":500}'
"$check"
mh_assert_equal 1 "$(mh_notifier_call_count)" "notifier calls on ok->critical"
mh_cleanup_sandbox

# Test 5 (spec): notification does NOT fire on critical -> critical.
mh_start_test "notification does NOT fire on critical->critical"
mh_setup_sandbox
mh_mock_memory_pressure critical
mh_mock_sysctl_swap 3000
mh_mock_terminal_notifier 0
mh_seed_log \
    '{"ts":"t","check":"memory","status":"critical","pressure":"critical","swap_used_mb":1100}' \
    '{"ts":"t","check":"memory","status":"critical","pressure":"critical","swap_used_mb":1200}' \
    '{"ts":"t","check":"memory","status":"critical","pressure":"critical","swap_used_mb":1300}' \
    '{"ts":"t","check":"memory","status":"critical","pressure":"critical","swap_used_mb":1400}' \
    '{"ts":"t","check":"memory","status":"critical","pressure":"critical","swap_used_mb":1500}'
"$check"
last_line=$(tail -n 1 "$sandbox_log")
mh_assert_contains '"status":"critical"' "$last_line" "current status is critical"
mh_assert_equal 0 "$(mh_notifier_call_count)" "notifier calls on critical->critical"
mh_cleanup_sandbox

mh_print_summary "test-memory.sh"
