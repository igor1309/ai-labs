#!/bin/sh
set -eu

tool_dir=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
script_path="$tool_dir/select-account.sh"

# 2026-03-24T12:00:00Z
now=1774353600

assert_equal() {
    expected=$1
    actual=$2

    if [ "$actual" = "$expected" ]; then
        return
    fi

    printf 'expected:\n%s\n' "$expected" >&2
    printf 'actual:\n%s\n' "$actual" >&2
    exit 1
}

run_selection() {
    input=$1

    scenario_dir=$(mktemp -d)
    printf '%s\n' "$input" >"$scenario_dir/records.jsonl"
    printf '#!/bin/sh\ncat "%s/records.jsonl"\n' "$scenario_dir" >"$scenario_dir/ccswitch-limits.sh"
    chmod +x "$scenario_dir/ccswitch-limits.sh"

    set +e
    output=$(SELECT_ACCOUNT_LIMITS_SCRIPT="$scenario_dir/ccswitch-limits.sh" SELECT_ACCOUNT_NOW=$now TZ=UTC sh "$script_path" 2>"$scenario_dir/progress" </dev/null)
    exit_code=$?
    set -e
    progress=$(cat "$scenario_dir/progress")
    rm -rf "$scenario_dir"

    printf 'exit=%s\noutput=%s\nprogress:\n%s' "$exit_code" "$output" "$progress"
}

# account_record <number> <status> [<5h used> <5h reset> <7d used> <7d reset>]
account_record() {
    if [ "$2" != "ok" ]; then
        printf '{"account_number":%s,"email":"a%s@example.com","active":false,"status":"%s"}' "$1" "$1" "$2"
        return
    fi

    printf '{"account_number":%s,"email":"a%s@example.com","active":false,"status":"ok","usage":{"five_hour":{"utilization":%s,"resets_at":"%s"},"seven_day":{"utilization":%s,"resets_at":"%s"}}}' \
        "$1" "$1" "$3" "$4" "$5" "$6"
}

# Half of each interval remains until these resets.
short_reset="2026-03-24T14:30:00.000000+00:00"
short_reset_offset="2026-03-24T17:30:00.943648+03:00"
weekly_reset="2026-03-28T00:00:00.000000+00:00"

# Bottleneck decides: account 1 is (1.0, 1.0); account 2 is (0.6, 1.6).
# Failed and exhausted accounts are skipped.
assert_equal "exit=0
output=1
progress:
querying accounts...
account 2 a2@example.com: 5h 20% used, resets 14:30 24.03; 7d 70% used, resets 00:00 28.03
account 1 a1@example.com: 5h 50% used, resets 14:30 24.03; 7d 50% used, resets 00:00 28.03
account 3 a3@example.com: skipped, usage_request_failed
account 4 a4@example.com: skipped, 5h limit reached
account 1: ratios 1.00 / 1.00
account 2: ratios 0.60 / 1.60
selected account 1 a1@example.com" "$(run_selection "$(account_record 2 ok 20.0 "$short_reset" 70.0 "$weekly_reset")
$(account_record 1 ok 50.0 "$short_reset_offset" 50.0 "$weekly_reset")
$(account_record 3 usage_request_failed)
$(account_record 4 ok 100.0 "$short_reset" 0.0 "$weekly_reset")")"

# A window without a reset time is a failed query, even when it would rank first.
assert_equal "exit=0
output=2
progress:
querying accounts...
account 1 a1@example.com: skipped, incomplete usage response
account 2 a2@example.com: 5h 50% used, resets 14:30 24.03; 7d 50% used, resets 00:00 28.03
account 2: ratios 1.00 / 1.00
selected account 2 a2@example.com" "$(run_selection "$(account_record 1 ok 0.0 "$short_reset" 0.0 "$weekly_reset" | sed 's/"resets_at":"[^"]*"/"resets_at":null/')
$(account_record 2 ok 50.0 "$short_reset" 50.0 "$weekly_reset")")"

# Equal bottleneck: the larger other ratio decides (1.4 over 1.0).
assert_equal "exit=0
output=2
progress:
querying accounts...
account 1 a1@example.com: 5h 50% used, resets 14:30 24.03; 7d 50% used, resets 00:00 28.03
account 2 a2@example.com: 5h 50% used, resets 14:30 24.03; 7d 30% used, resets 00:00 28.03
account 2: ratios 1.00 / 1.40
account 1: ratios 1.00 / 1.00
selected account 2 a2@example.com" "$(run_selection "$(account_record 1 ok 50.0 "$short_reset" 50.0 "$weekly_reset")
$(account_record 2 ok 50.0 "$short_reset" 30.0 "$weekly_reset")")"

# Full tie: lowest account number wins.
assert_equal "exit=0
output=2
progress:
querying accounts...
account 5 a5@example.com: 5h 40% used, resets 14:30 24.03; 7d 30% used, resets 00:00 28.03
account 2 a2@example.com: 5h 40% used, resets 14:30 24.03; 7d 30% used, resets 00:00 28.03
account 7 a7@example.com: 5h 60% used, resets 14:30 24.03; 7d 30% used, resets 00:00 28.03
account 2: ratios 1.20 / 1.40
account 5: ratios 1.20 / 1.40
account 7: ratios 0.80 / 1.40
selected account 2 a2@example.com" "$(run_selection "$(account_record 5 ok 40.0 "$short_reset" 30.0 "$weekly_reset")
$(account_record 2 ok 40.0 "$short_reset" 30.0 "$weekly_reset")
$(account_record 7 ok 60.0 "$short_reset" 30.0 "$weekly_reset")")"

# No eligible account.
assert_equal "exit=1
output=
progress:
querying accounts...
account 1 a1@example.com: skipped, oauth_token_not_found
account 2 a2@example.com: skipped, 7d limit reached
Error: no eligible account" "$(run_selection "$(account_record 1 oauth_token_not_found)
$(account_record 2 ok 20.0 "$short_reset" 100.0 "$weekly_reset")")"

# A negative utilization is invalid rather than extra quota.
assert_equal "exit=1
output=
progress:
querying accounts...
account 1 a1@example.com: skipped, invalid utilization
Error: no eligible account" "$(run_selection "$(account_record 1 ok -1.0 "$short_reset" 0.0 "$weekly_reset")")"

# A malformed reset timestamp is rejected before ranking.
assert_equal "exit=1
output=
progress:
querying accounts...
account 1 a1@example.com: skipped, invalid reset time
Error: no eligible account" "$(run_selection "$(account_record 1 ok 0.0 bad 0.0 "$weekly_reset")")"

# A reset at or before now cannot produce a valid pacing ratio.
for elapsed_reset in "2026-03-24T12:00:00.000000+00:00" "2026-03-24T11:59:59.000000+00:00"; do
    elapsed_display=$(printf '%s' "$elapsed_reset" | sed -E 's/^2026-03-([0-9]{2})T([0-9]{2}:[0-9]{2}).*/\2 \1.03/')
    assert_equal "exit=1
output=
progress:
querying accounts...
account 1 a1@example.com: 5h 0% used, resets $elapsed_display; 7d 0% used, resets 00:00 28.03
Error: no eligible account" "$(run_selection "$(account_record 1 ok 0.0 "$elapsed_reset" 0.0 "$weekly_reset")")"
done

# A full tie is deterministic regardless of provider input order.
tie_a=$(printf '%s\n%s' "$(account_record 9 ok 40.0 "$short_reset" 30.0 "$weekly_reset")" "$(account_record 2 ok 40.0 "$short_reset" 30.0 "$weekly_reset")")
tie_b=$(printf '%s\n%s' "$(account_record 2 ok 40.0 "$short_reset" 30.0 "$weekly_reset")" "$(account_record 9 ok 40.0 "$short_reset" 30.0 "$weekly_reset")")
first=$(run_selection "$tie_a" | sed -n '2p')
second=$(run_selection "$tie_b" | sed -n '2p')
assert_equal "$first" "$second"

# --codex: codex-mgr profiles are ranked the same way and selected by email.
codex_dir=$(mktemp -d)
printf '%s\n%s\n' "$(account_record 1 ok 50.0 "$short_reset" 50.0 "$weekly_reset")" "$(account_record 2 ok 20.0 "$short_reset" 20.0 "$weekly_reset")" >"$codex_dir/records.jsonl"
printf '#!/bin/sh\nprintf "%%s\\n" "$*" >"%s/args"\ncat "%s/records.jsonl"\n' "$codex_dir" "$codex_dir" >"$codex_dir/codex-mgr.sh"
chmod +x "$codex_dir/codex-mgr.sh"
codex_output=$(SELECT_ACCOUNT_LIMITS_SCRIPT=false SELECT_ACCOUNT_CODEX_MGR_SCRIPT="$codex_dir/codex-mgr.sh" SELECT_ACCOUNT_NOW=$now TZ=UTC sh "$script_path" --codex 2>/dev/null </dev/null)
assert_equal "limits --json
a2@example.com" "$(cat "$codex_dir/args")
$codex_output"
rm -rf "$codex_dir"

printf 'ok\n'
