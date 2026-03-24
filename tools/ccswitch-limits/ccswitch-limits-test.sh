#!/bin/sh
set -eu

tool_dir=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
script_path="$tool_dir/ccswitch-limits.sh"

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

read_optional_file() {
    file_path=$1

    if [ -f "$file_path" ]; then
        cat "$file_path"
    fi
}

write_sequence_file() {
    home_dir=$1

    mkdir -p "$home_dir/.claude-switch-backup"
    cat <<'__SEQUENCE__' >"$home_dir/.claude-switch-backup/sequence.json"
{
  "activeAccountNumber": 4,
  "sequence": [3, 4, 5],
  "accounts": {
    "3": { "email": "first@example.com" },
    "4": { "email": "active@example.com" },
    "5": { "email": "missing@example.com" }
  }
}
__SEQUENCE__
}

write_claude_mock() {
    mock_bin_dir=$1

    cat <<'__CLAUDE__' >"$mock_bin_dir/claude"
#!/bin/sh
set -eu

if [ "$#" -eq 1 ] && [ "$1" = "--version" ]; then
    printf '2.1.81 (Claude Code)\n'
    exit 0
fi

printf 'unexpected claude invocation: %s\n' "$*" >&2
exit 1
__CLAUDE__
}

write_security_mock() {
    mock_bin_dir=$1

    cat <<'__SECURITY__' >"$mock_bin_dir/security"
#!/bin/sh
set -eu

printf 'security %s\n' "$*" >>"$COMMAND_LOG_PATH"

if [ "$#" -ne 4 ] || [ "$1" != "find-generic-password" ] || [ "$2" != "-s" ] || [ "$4" != "-w" ]; then
    printf 'unexpected security invocation: %s\n' "$*" >&2
    exit 1
fi

case "$3" in
    "Claude Code-Account-3-first@example.com")
        printf '{"claudeAiOauth":{"accessToken":"token-3"}}'
        ;;
    "Claude Code-Account-4-active@example.com")
        exit 44
        ;;
    "Claude Code-credentials")
        printf '{"claudeAiOauth":{"accessToken":"token-active"}}'
        ;;
    "Claude Code-Account-5-missing@example.com")
        exit 44
        ;;
    *)
        printf 'unexpected keychain service: %s\n' "$3" >&2
        exit 1
        ;;
esac
__SECURITY__
}

write_curl_mock() {
    mock_bin_dir=$1

    cat <<'__CURL__' >"$mock_bin_dir/curl"
#!/bin/sh
set -eu

url=''
authorization=''
user_agent=''
beta=''
accept=''

while [ "$#" -gt 0 ]; do
    case "$1" in
        -fsS)
            shift
            ;;
        -H)
            case "$2" in
                Authorization:*)
                    authorization=$2
                    ;;
                User-Agent:*)
                    user_agent=$2
                    ;;
                anthropic-beta:*)
                    beta=$2
                    ;;
                Accept:*)
                    accept=$2
                    ;;
            esac
            shift 2
            ;;
        *)
            url=$1
            shift
            ;;
    esac
done

printf 'curl %s | %s | %s | %s | %s\n' "$url" "$authorization" "$user_agent" "$beta" "$accept" >>"$COMMAND_LOG_PATH"

case "$authorization" in
    "Authorization: Bearer token-3")
        printf '{"five_hour":{"utilization":6.0,"resets_at":"2026-03-24T19:59:59.943648+00:00"},"seven_day":{"utilization":35.0,"resets_at":"2026-03-27T03:59:59.943679+00:00"}}'
        ;;
    "Authorization: Bearer token-active")
        printf '{"five_hour":{"utilization":12.0,"resets_at":"2026-03-25T00:00:00.000000+00:00"},"seven_day":{"utilization":40.0,"resets_at":"2026-03-28T00:00:00.000000+00:00"}}'
        ;;
    *)
        printf 'unexpected authorization header: %s\n' "$authorization" >&2
        exit 1
        ;;
esac
__CURL__
}

write_readlink_local_mock() {
    mock_bin_dir=$1

    cat <<'__READLINK__' >"$mock_bin_dir/readlink"
#!/bin/sh
set -eu

if [ "$#" -eq 1 ] && [ "$1" = "/etc/localtime" ]; then
    printf '/var/db/timezone/zoneinfo/Europe/Moscow\n'
    exit 0
fi

printf 'unexpected readlink invocation: %s\n' "$*" >&2
exit 1
__READLINK__
}

write_readlink_fallback_mock() {
    mock_bin_dir=$1

    cat <<'__READLINK__' >"$mock_bin_dir/readlink"
#!/bin/sh
set -eu

exit 1
__READLINK__
}

run_scenario() {
    scenario_name=$1
    readlink_mode=$2
    temp_dir=$(mktemp -d "${TMPDIR:-/tmp}/ccswitch-limits-test-${scenario_name}.XXXXXX")
    trap 'rm -rf "$temp_dir"' EXIT HUP INT TERM

    home_dir="$temp_dir/home"
    mock_bin_dir="$temp_dir/bin"
    command_log_path="$temp_dir/command-log.txt"
    output_path="$temp_dir/output.txt"

    mkdir -p "$mock_bin_dir"
    write_sequence_file "$home_dir"
    write_claude_mock "$mock_bin_dir"
    write_security_mock "$mock_bin_dir"
    write_curl_mock "$mock_bin_dir"

    case "$readlink_mode" in
        local)
            write_readlink_local_mock "$mock_bin_dir"
            ;;
        fallback)
            write_readlink_fallback_mock "$mock_bin_dir"
            ;;
        *)
            printf 'unexpected readlink mode: %s\n' "$readlink_mode" >&2
            exit 1
            ;;
    esac

    chmod +x "$mock_bin_dir/claude" "$mock_bin_dir/security" "$mock_bin_dir/curl" "$mock_bin_dir/readlink"

    status=0
    HOME="$home_dir" PATH="$mock_bin_dir:$PATH" COMMAND_LOG_PATH="$command_log_path" TZ=UTC sh "$script_path" >"$output_path" 2>&1 || status=$?

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
Account 3: first@example.com
  five_hour:   6% used, resets 22:59 24.03
  seven_day:  35% used, resets 06:59 27.03

Account 4: active@example.com (active)
  five_hour:  12% used, resets 03:00 25.03
  seven_day:  40% used, resets 03:00 28.03

Account 5: missing@example.com
  unavailable: OAuth token not found
EOF
log<<EOF
security find-generic-password -s Claude Code-Account-3-first@example.com -w
curl https://api.anthropic.com/api/oauth/usage | Authorization: Bearer token-3 | User-Agent: claude-code/2.1.81 | anthropic-beta: oauth-2025-04-20 | Accept: application/json
security find-generic-password -s Claude Code-Account-4-active@example.com -w
security find-generic-password -s Claude Code-credentials -w
curl https://api.anthropic.com/api/oauth/usage | Authorization: Bearer token-active | User-Agent: claude-code/2.1.81 | anthropic-beta: oauth-2025-04-20 | Accept: application/json
security find-generic-password -s Claude Code-Account-5-missing@example.com -w
EOF
__EXPECTED__
)

assert_equal "$expected_result" "$(run_scenario local local)"
assert_equal "$expected_result" "$(run_scenario fallback fallback)"
