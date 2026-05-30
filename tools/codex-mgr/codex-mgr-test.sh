#!/bin/bash
# Tests for codex-mgr. Currently covers the `limits` command.
set -euo pipefail

test_dir=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
script_path="$test_dir/codex-mgr.sh"

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
        bash "$script_path" limits > "$output_path" 2>&1 || status=$?

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
