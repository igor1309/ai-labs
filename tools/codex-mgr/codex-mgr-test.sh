#!/bin/bash
# Tests for codex-mgr: limits, install/uninstall, and load of a missing profile.
set -euo pipefail

test_dir=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
script_path="$test_dir/codex-mgr.sh"

case "${1:-}" in
    '') ;;
    -h | --help)
        printf 'Usage: %s\n' "$0"
        printf '  runs the codex-mgr tests with mocks; prints ok on success\n'
        exit 0
        ;;
    *)
        printf 'Usage: %s\n' "$0" >&2
        exit 2
        ;;
esac

assert_equal() {
    local expected="$1"
    local actual="$2"

    if [[ "$actual" == "$expected" ]]; then
        return
    fi

    printf 'expected:\n%s\n' "$expected" >&2
    printf 'actual:\n%s\n' "$actual" >&2
    exit 1
}

read_optional_file() {
    local file_path="$1"
    if [[ -f "$file_path" ]]; then
        cat "$file_path"
    fi
}

write_profile() {
    local profiles_dir="$1"
    local email="$2"
    local auth_json="$3"

    mkdir -p "$profiles_dir/$email"
    printf '%s' "$auth_json" > "$profiles_dir/$email/auth.json"
}

write_curl_mock() {
    local mock_bin_dir="$1"

    cat <<'__CURL__' > "$mock_bin_dir/curl"
#!/bin/bash
set -euo pipefail

url=''
authorization=''
account=''
user_agent=''

args=("$@")
i=0
while [[ $i -lt ${#args[@]} ]]; do
    case "${args[$i]}" in
        -fsS)
            ;;
        -H)
            i=$((i + 1))
            case "${args[$i]}" in
                Authorization:*) authorization="${args[$i]}" ;;
                ChatGPT-Account-Id:*) account="${args[$i]}" ;;
                User-Agent:*) user_agent="${args[$i]}" ;;
            esac
            ;;
        *)
            url="${args[$i]}"
            ;;
    esac
    i=$((i + 1))
done

printf 'curl %s | %s | %s | %s\n' "$url" "$authorization" "$account" "$user_agent" >> "$COMMAND_LOG_PATH"

case "$authorization" in
    "Authorization: Bearer token-active")
        printf '{"rate_limit":{"primary_window":{"used_percent":12,"reset_at":1774310400},"secondary_window":{"used_percent":40,"reset_at":1774569600}}}'
        ;;
    "Authorization: Bearer token-1")
        printf '{"rate_limit":{"primary_window":{"used_percent":6,"reset_at":1774382400},"secondary_window":{"used_percent":35,"reset_at":1774641600}}}'
        ;;
    "Authorization: Bearer token-null")
        printf '{"rate_limit":{"primary_window":{"used_percent":8,"reset_at":1774382400},"secondary_window":null}}'
        ;;
    "Authorization: Bearer token-bad")
        printf 'not json'
        ;;
    "Authorization: Bearer token-fail")
        exit 22
        ;;
    *)
        printf 'unexpected authorization header: %s\n' "$authorization" >&2
        exit 1
        ;;
esac
__CURL__
}

write_readlink_mock() {
    local mock_bin_dir="$1"

    cat <<'__READLINK__' > "$mock_bin_dir/readlink"
#!/bin/bash
set -euo pipefail

if [[ "$#" -eq 1 && "$1" == "/etc/localtime" ]]; then
    printf '/var/db/timezone/zoneinfo/Europe/Moscow\n'
    exit 0
fi

printf 'unexpected readlink invocation: %s\n' "$*" >&2
exit 1
__READLINK__
}

run_limits_scenario() {
    local temp_dir
    temp_dir=$(mktemp -d "${TMPDIR:-/tmp}/codex-mgr-test.XXXXXX")
    trap '[[ -n "${temp_dir:-}" ]] && rm -rf "$temp_dir"' EXIT HUP INT TERM

    local home_dir="$temp_dir/home"
    local profiles_dir="$temp_dir/profiles"
    local mock_bin_dir="$temp_dir/bin"
    local command_log_path="$temp_dir/command-log.txt"
    local output_path="$temp_dir/output.txt"

    mkdir -p "$home_dir/.codex" "$mock_bin_dir"

    write_profile "$profiles_dir" "active@example.com" '{"tokens":{"access_token":"token-active","account_id":"acct-active"}}'
    write_profile "$profiles_dir" "first@example.com" '{"tokens":{"access_token":"token-1","account_id":"acct-1"}}'
    write_profile "$profiles_dir" "missing@example.com" '{"tokens":{}}'
    write_profile "$profiles_dir" "nulledge@example.com" '{"tokens":{"access_token":"token-null","account_id":"acct-null"}}'
    write_profile "$profiles_dir" "ybad@example.com" '{"tokens":{"access_token":"token-bad","account_id":"acct-bad"}}'
    write_profile "$profiles_dir" "zfail@example.com" '{"tokens":{"access_token":"token-fail","account_id":"acct-fail"}}'

    # Mark active@example.com as the live profile.
    cp "$profiles_dir/active@example.com/auth.json" "$home_dir/.codex/auth.json"

    write_curl_mock "$mock_bin_dir"
    write_readlink_mock "$mock_bin_dir"
    chmod +x "$mock_bin_dir/curl" "$mock_bin_dir/readlink"

    local status=0
    HOME="$home_dir" CODEX_PROFILES_DIR="$profiles_dir" PATH="$mock_bin_dir:$PATH" \
        COMMAND_LOG_PATH="$command_log_path" TZ=UTC \
        bash "$script_path" limits "$@" > "$output_path" 2>&1 || status=$?

    local actual_output actual_log
    actual_output=$(read_optional_file "$output_path")
    actual_log=$(read_optional_file "$command_log_path")

    cat <<__RESULT__
exit=$status
output<<EOF
$actual_output
EOF
log<<EOF
$actual_log
EOF
__RESULT__
}

expected_result=$(cat <<'__EXPECTED__'
exit=0
output<<EOF
active@example.com (active)
  5h:      12% used, resets 03:00 24.03
  weekly:  40% used, resets 03:00 27.03

first@example.com
  5h:       6% used, resets 23:00 24.03
  weekly:  35% used, resets 23:00 27.03

missing@example.com
  unavailable: OAuth token not found

nulledge@example.com
  5h:       8% used, resets 23:00 24.03
  weekly:  unknown

ybad@example.com
  unavailable: usage response was invalid

zfail@example.com
  unavailable: usage request failed
EOF
log<<EOF
curl https://chatgpt.com/backend-api/wham/usage | Authorization: Bearer token-active | ChatGPT-Account-Id: acct-active | User-Agent: codex-cli
curl https://chatgpt.com/backend-api/wham/usage | Authorization: Bearer token-1 | ChatGPT-Account-Id: acct-1 | User-Agent: codex-cli
curl https://chatgpt.com/backend-api/wham/usage | Authorization: Bearer token-null | ChatGPT-Account-Id: acct-null | User-Agent: codex-cli
curl https://chatgpt.com/backend-api/wham/usage | Authorization: Bearer token-bad | ChatGPT-Account-Id: acct-bad | User-Agent: codex-cli
curl https://chatgpt.com/backend-api/wham/usage | Authorization: Bearer token-fail | ChatGPT-Account-Id: acct-fail | User-Agent: codex-cli
EOF
__EXPECTED__
)

assert_equal "$expected_result" "$(run_limits_scenario)"
printf 'ok: limits\n'

# --json: one record per profile in the ccswitch-limits --json shape.
expected_json_output=$(cat <<'__EXPECTED__'
{"account_number":1,"email":"active@example.com","active":true,"status":"ok","usage":{"five_hour":{"utilization":12,"resets_at":"2026-03-24T00:00:00Z"},"seven_day":{"utilization":40,"resets_at":"2026-03-27T00:00:00Z"}}}
{"account_number":2,"email":"first@example.com","active":false,"status":"ok","usage":{"five_hour":{"utilization":6,"resets_at":"2026-03-24T20:00:00Z"},"seven_day":{"utilization":35,"resets_at":"2026-03-27T20:00:00Z"}}}
{"account_number":3,"email":"missing@example.com","active":false,"status":"oauth_token_not_found"}
{"account_number":4,"email":"nulledge@example.com","active":false,"status":"ok","usage":{"five_hour":{"utilization":8,"resets_at":"2026-03-24T20:00:00Z"},"seven_day":null}}
{"account_number":5,"email":"ybad@example.com","active":false,"status":"invalid_usage_response"}
{"account_number":6,"email":"zfail@example.com","active":false,"status":"usage_request_failed"}
__EXPECTED__
)

json_result=$(run_limits_scenario --json)
assert_equal "exit=0" "$(printf '%s\n' "$json_result" | head -n 1)"
assert_equal "$expected_json_output" "$(printf '%s\n' "$json_result" | sed -n '/^output<<EOF$/,/^EOF$/p' | sed '1d;$d')"
printf 'ok: limits --json\n'

run_install_uninstall_scenario() {
    local temp_dir
    temp_dir=$(mktemp -d "${TMPDIR:-/tmp}/codex-mgr-install-test.XXXXXX")
    trap '[[ -n "${temp_dir:-}" ]] && rm -rf "$temp_dir"' EXIT HUP INT TERM

    local bin_dir="$temp_dir/bin"
    local link_path="$bin_dir/codex-mgr"

    # PATH excludes bin_dir so install.sh emits the not-on-PATH warning.
    local install_out
    install_out=$(CODEX_MGR_BIN_DIR="$bin_dir" PATH="/usr/bin:/bin" sh "$test_dir/install.sh" 2>&1)

    local linked=no warned=no points_at_script=no removed=no
    [[ -L "$link_path" ]] && linked=yes
    [[ "$(readlink "$link_path" 2>/dev/null)" == "$test_dir/codex-mgr.sh" ]] && points_at_script=yes
    [[ "$install_out" == *"is not on your PATH"* ]] && warned=yes

    CODEX_MGR_BIN_DIR="$bin_dir" sh "$test_dir/uninstall.sh" >/dev/null 2>&1
    [[ ! -e "$link_path" ]] && removed=yes

    printf 'linked=%s points_at_script=%s warned=%s removed=%s\n' \
        "$linked" "$points_at_script" "$warned" "$removed"
}

assert_equal "linked=yes points_at_script=yes warned=yes removed=yes" "$(run_install_uninstall_scenario)"
printf 'ok: install/uninstall\n'

# Help or an unknown argument: nothing is installed or removed.
run_install_arguments_scenario() {
    local temp_dir
    temp_dir=$(mktemp -d "${TMPDIR:-/tmp}/codex-mgr-install-args-test.XXXXXX")
    trap '[[ -n "${temp_dir:-}" ]] && rm -rf "$temp_dir"' EXIT HUP INT TERM

    local script argument status
    for script in install.sh uninstall.sh; do
        for argument in -h --help --bogus; do
            status=0
            CODEX_MGR_BIN_DIR="$temp_dir/bin" sh "$test_dir/$script" "$argument" >/dev/null 2>&1 || status=$?
            printf '%s %s: exit=%s created=%s\n' "$script" "$argument" "$status" "$([[ -e "$temp_dir/bin" ]] && echo yes || echo no)"
        done
    done
}

assert_equal "install.sh -h: exit=0 created=no
install.sh --help: exit=0 created=no
install.sh --bogus: exit=2 created=no
uninstall.sh -h: exit=0 created=no
uninstall.sh --help: exit=0 created=no
uninstall.sh --bogus: exit=2 created=no" "$(run_install_arguments_scenario)"
printf 'ok: install/uninstall arguments\n'

# save/load/delete reject names that resolve outside the profiles directory,
# and leave the live auth, the outside directory, and the profiles intact.
run_invalid_profile_scenario() {
    local temp_dir
    temp_dir=$(mktemp -d "${TMPDIR:-/tmp}/codex-mgr-invalid-test.XXXXXX")
    trap '[[ -n "${temp_dir:-}" ]] && rm -rf "$temp_dir"' EXIT HUP INT TERM

    mkdir -p "$temp_dir/home/.codex" "$temp_dir/root/profiles/me@example.com" "$temp_dir/root/outside@example.com"
    printf '{"live":true}' > "$temp_dir/home/.codex/auth.json"
    printf '{"outside":true}' > "$temp_dir/root/outside@example.com/auth.json"

    local command name status output
    for command in save load delete; do
        for name in ../outside@example.com "$temp_dir/root/outside@example.com" nested/me@example.com "" . ..; do
            status=0
            output=$(HOME="$temp_dir/home" CODEX_PROFILES_DIR="$temp_dir/root/profiles" \
                bash "$script_path" "$command" "$name" 2>&1) || status=$?
            if [[ "$status" != 1 || "$output" != "Error: invalid profile name '$name'." ]]; then
                printf 'unexpected: %s %s -> exit=%s %s\n' "$command" "$name" "$status" "$output"
            fi
        done
    done

    printf 'live=%s outside=%s profile=%s backups=%s\n' \
        "$(cat "$temp_dir/home/.codex/auth.json")" \
        "$(cat "$temp_dir/root/outside@example.com/auth.json")" \
        "$([[ -d "$temp_dir/root/profiles/me@example.com" ]] && echo kept || echo removed)" \
        "$(find "$temp_dir/home/.codex" -name 'auth.json.backup.*' | wc -l | tr -d ' ')"
}

assert_equal 'live={"live":true} outside={"outside":true} profile=kept backups=0' "$(run_invalid_profile_scenario)"
printf 'ok: invalid profile names\n'

run_load_missing_scenario() {
    local profiles_dir="$1"
    local temp_dir
    temp_dir=$(mktemp -d "${TMPDIR:-/tmp}/codex-mgr-load-test.XXXXXX")
    trap '[[ -n "${temp_dir:-}" ]] && rm -rf "$temp_dir"' EXIT HUP INT TERM

    mkdir -p "$temp_dir/home" "$temp_dir/profiles/first@example.com" "$temp_dir/profiles/second@example.com"

    local status=0 output
    output=$(HOME="$temp_dir/home" CODEX_PROFILES_DIR="$temp_dir/$profiles_dir" \
        bash "$script_path" load nope@example.com 2>&1) || status=$?
    printf 'exit=%s\n%s\n' "$status" "$output"
}

assert_equal "exit=1
Error: Profile 'nope@example.com' not found.
Available: first@example.com second@example.com" "$(run_load_missing_scenario profiles)"
assert_equal "exit=1
Error: Profile 'nope@example.com' not found.
Available: none" "$(run_load_missing_scenario no-profiles)"
printf 'ok: load missing profile\n'
