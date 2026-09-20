#!/bin/sh
set -eu

tool_dir=$(CDPATH='' cd -- "$(dirname "$0")" && pwd)
script_path="$tool_dir/ccswitch-limits.sh"

fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }
assert_contains() { grep -F "$1" "$2" >/dev/null || fail "expected '$1' in $2"; }
assert_not_contains() { if grep -F "$1" "$2" >/dev/null; then fail "did not expect '$1' in $2"; fi; }
assert_count() {
    expected=$1; needle=$2; file=$3
    actual=$(grep -F -c "$needle" "$file" || true)
    [ "$actual" = "$expected" ] || fail "expected $expected occurrences of '$needle', got $actual"
}

write_sequence() {
    mkdir -p "$1/.claude-switch-backup"
    cat <<'EOF' >"$1/.claude-switch-backup/sequence.json"
{"activeAccountNumber":2,"sequence":[1,2,3],"accounts":{"1":{"email":"inactive@example.com"},"2":{"email":"active@example.com"},"3":{"email":"missing@example.com"}}}
EOF
}

write_credentials() {
    state_dir=$1; scenario=$2; inactive_expiry=9999999999999; live_expiry=9999999999999
    [ "$scenario" != expired ] || inactive_expiry=0
    [ "$scenario" != active_expired ] || live_expiry=0
    jq -cn --arg token token-1 --arg refresh refresh-1 --argjson expiry "$inactive_expiry" \
        '{claudeAiOauth:{accessToken:$token,refreshToken:$refresh,expiresAt:$expiry,scopes:["user:inference","user:profile"]}}' >"$state_dir/account-1"
    jq -cn --arg token token-stored-active --arg refresh refresh-stored-active \
        '{claudeAiOauth:{accessToken:$token,refreshToken:$refresh,expiresAt:0,scopes:["user:inference","user:profile"]}}' >"$state_dir/account-2"
    jq -cn --arg token token-live --arg refresh refresh-live --argjson expiry "$live_expiry" \
        '{claudeAiOauth:{accessToken:$token,refreshToken:$refresh,expiresAt:$expiry,scopes:["user:inference","user:profile"]}}' >"$state_dir/live"
}

write_mocks() {
    mock_bin=$1
    cat <<'EOF' >"$mock_bin/claude"
#!/bin/sh
printf '2.1.81 (Claude Code)\n'
EOF
    cat <<'EOF' >"$mock_bin/readlink"
#!/bin/sh
printf '/var/db/timezone/zoneinfo/Europe/Moscow\n'
EOF
    cat <<'EOF' >"$mock_bin/shlock"
#!/bin/sh
set -eu
printf 'shlock %s\n' "$*" >>"$COMMAND_LOG"
while [ "$#" -gt 0 ]; do case "$1" in -f) lock_file=$2; shift 2;; -p) shift 2;; *) exit 2;; esac; done
: >"$lock_file"
EOF
    cat <<'EOF' >"$mock_bin/sleep"
#!/bin/sh
printf 'sleep %s\n' "$*" >>"$COMMAND_LOG"
EOF
    cat <<'EOF' >"$mock_bin/security"
#!/bin/sh
set -eu
service_file() {
    case "$1" in
        'Claude Code-Account-1-inactive@example.com') printf '%s/account-1' "$TEST_STATE_DIR";;
        'Claude Code-Account-2-active@example.com') printf '%s/account-2' "$TEST_STATE_DIR";;
        'Claude Code-Account-3-missing@example.com') printf '%s/missing' "$TEST_STATE_DIR";;
        'Claude Code-credentials') printf '%s/live' "$TEST_STATE_DIR";;
        *) exit 2;;
    esac
}
case "$1" in
    find-generic-password)
        service=$3; file=$(service_file "$service"); [ -f "$file" ] || exit 44
        if [ "${4:-}" = '-w' ]; then printf 'security read %s\n' "$service" >>"$COMMAND_LOG"; cat "$file"
        else printf 'security metadata %s\n' "$service" >>"$COMMAND_LOG"; printf '    "acct"<blob>="test-user"\n'; fi;;
    add-generic-password)
        service=''
        while [ "$#" -gt 0 ]; do case "$1" in -s) service=$2; shift 2;; -a) shift 2;; *) shift;; esac; done
        if [ "$service" = 'Claude Code-credentials' ]; then
            printf 'forbidden live write\n' >>"$COMMAND_LOG"
            exit 99
        fi
        file=$(service_file "$service"); cat >"$file"; printf 'security write %s\n' "$service" >>"$COMMAND_LOG";;
    *) exit 2;;
esac
EOF
    cat <<'EOF' >"$mock_bin/curl"
#!/bin/sh
set -eu
output=''; headers=''; url=''; authorization=''
while [ "$#" -gt 0 ]; do
    case "$1" in
        -o) output=$2; shift 2;; -D) headers=$2; shift 2;; -w|--max-time) shift 2;;
        -H) case "$2" in Authorization:*) authorization=${2#Authorization: Bearer };; esac; shift 2;;
        --data-binary) shift 2;; -sS) shift;; http*) url=$1; shift;; *) shift;;
    esac
done
if [ "$url" = 'https://platform.claude.com/v1/oauth/token' ]; then
    cat >/dev/null; printf 'curl refresh\n' >>"$COMMAND_LOG"
    if [ "$SCENARIO" = active_expired ]; then
        printf '%s' '{"access_token":"token-live-new","refresh_token":"refresh-live-new","expires_in":3600,"scope":"user:inference user:profile"}' >"$output"
    else
        printf '%s' '{"access_token":"token-1-new","refresh_token":"refresh-1-new","expires_in":3600,"scope":"user:inference user:profile"}' >"$output"
    fi
    printf '200'; exit 0
fi
[ "$url" = 'https://api.anthropic.com/api/oauth/usage' ] || exit 2
printf 'curl usage %s\n' "$authorization" >>"$COMMAND_LOG"
count_file="$TEST_STATE_DIR/usage-count-$authorization"; count=0; [ ! -f "$count_file" ] || count=$(cat "$count_file")
count=$((count + 1)); printf '%s' "$count" >"$count_file"; : >"$headers"
case "$SCENARIO:$authorization:$count" in
    unauthorized:token-1:1) printf '%s' '{"error":{}}' >"$output"; printf '401'; exit 0;;
    forbidden:token-1:1) printf '%s' '{"error":{}}' >"$output"; printf '403'; exit 0;;
    rate_limited:token-1:1) printf 'retry-after: 7\r\n' >"$headers"; printf '%s' '{"error":{}}' >"$output"; printf '429'; exit 0;;
    rate_limited_large:token-1:1) printf 'retry-after: 999999\r\n' >"$headers"; printf '%s' '{"error":{}}' >"$output"; printf '429'; exit 0;;
    rate_limited_date:token-1:1) printf 'retry-after: Wed, 31 Dec 2099 23:59:59 GMT\r\n' >"$headers"; printf '%s' '{"error":{}}' >"$output"; printf '429'; exit 0;;
    active_rejected:token-live:1)
        printf '%s' '{"claudeAiOauth":{"accessToken":"token-switched","refreshToken":"refresh-switched","expiresAt":9999999999999,"scopes":["user:inference","user:profile"]}}' >"$TEST_STATE_DIR/live"
        printf 'concurrent live switch\n' >>"$COMMAND_LOG"
        printf '%s' '{"error":{}}' >"$output"; printf '401'; exit 0;;
esac
case "$authorization" in
    token-1|token-1-new) printf '%s' '{"five_hour":{"utilization":6.0,"resets_at":"2026-03-24T19:59:59+00:00"},"seven_day":{"utilization":35.0,"resets_at":"2026-03-27T03:59:59+00:00"}}' >"$output";;
    token-live|token-live-new) printf '%s' '{"five_hour":{"utilization":12.0,"resets_at":"2026-03-25T00:00:00+00:00"},"seven_day":{"utilization":40.0,"resets_at":"2026-03-28T00:00:00+00:00"}}' >"$output";;
    *) exit 2;;
esac
printf '200'
EOF
    chmod +x "$mock_bin"/*
}

run_scenario() {
    scenario=$1; temp_dir=$(mktemp -d "${TMPDIR:-/tmp}/ccswitch-limits-test-${scenario}.XXXXXX")
    home_dir="$temp_dir/home"; mock_bin="$temp_dir/bin"; state_dir="$temp_dir/state"; output="$temp_dir/output"; log="$temp_dir/log"
    mkdir -p "$mock_bin" "$state_dir"; write_sequence "$home_dir"; write_credentials "$state_dir" "$scenario"; write_mocks "$mock_bin"
    HOME="$home_dir" PATH="$mock_bin:$PATH" COMMAND_LOG="$log" TEST_STATE_DIR="$state_dir" SCENARIO="$scenario" sh "$script_path" >"$output"
    assert_contains 'Account 1: inactive@example.com' "$output"
    case "$scenario" in
        expired|unauthorized|forbidden) assert_contains 'unavailable: usage request failed' "$output";;
        *) assert_contains 'five_hour:   6% used' "$output";;
    esac
    assert_contains 'Account 2: active@example.com (active)' "$output"
    if [ "$scenario" = active_expired ] || [ "$scenario" = active_rejected ]; then
        assert_contains 'unavailable: usage request failed' "$output"
    else
        assert_contains 'five_hour:  12% used' "$output"
    fi
    assert_contains 'unavailable: OAuth token not found' "$output"; assert_not_contains 'curl usage token-stored-active' "$log"
    case "$scenario" in
        standard) assert_not_contains 'curl refresh' "$log";;
        expired|unauthorized|forbidden)
            assert_not_contains 'curl refresh' "$log"; assert_not_contains 'security write Claude Code-Account-1-inactive@example.com' "$log"
            assert_not_contains 'forbidden live write' "$log";;
        active_expired)
            assert_not_contains 'curl refresh' "$log"; assert_not_contains 'security write Claude Code-credentials' "$log"
            assert_not_contains 'forbidden live write' "$log";;
        active_rejected)
            assert_contains 'concurrent live switch' "$log"; assert_not_contains 'curl refresh' "$log"
            assert_not_contains 'security write Claude Code-credentials' "$log"; assert_not_contains 'forbidden live write' "$log"
            [ "$(jq -r '.claudeAiOauth.accessToken' "$state_dir/live")" = token-switched ] || fail 'concurrent live credential was overwritten';;
        rate_limited)
            assert_contains 'sleep 7' "$log"; assert_count 2 'curl usage token-1' "$log"; assert_not_contains 'curl refresh' "$log";;
        rate_limited_large|rate_limited_date)
            assert_contains 'sleep 30' "$log"; assert_count 2 'curl usage token-1' "$log"; assert_not_contains 'sleep 999999' "$log";;
    esac
    rm -rf "$temp_dir"
}

run_scenario standard
run_scenario expired
run_scenario unauthorized
run_scenario forbidden
run_scenario active_expired
run_scenario active_rejected
run_scenario rate_limited
run_scenario rate_limited_large
run_scenario rate_limited_date

json_dir=$(mktemp -d "${TMPDIR:-/tmp}/ccswitch-limits-test-json.XXXXXX")
trap 'rm -rf "$json_dir"' EXIT HUP INT TERM
mkdir -p "$json_dir/home" "$json_dir/bin" "$json_dir/state"
write_sequence "$json_dir/home"; write_credentials "$json_dir/state" standard; write_mocks "$json_dir/bin"
HOME="$json_dir/home" PATH="$json_dir/bin:$PATH" COMMAND_LOG="$json_dir/log" TEST_STATE_DIR="$json_dir/state" SCENARIO=standard sh "$script_path" --json >"$json_dir/output"
[ "$(wc -l <"$json_dir/output" | tr -d ' ')" = 3 ] || fail 'expected three JSON records'
jq -e -s '.[0].status == "ok" and .[1].active == true and .[2].status == "oauth_token_not_found"' "$json_dir/output" >/dev/null
printf 'ccswitch-limits tests passed\n'
