#!/bin/sh
set -eu

test_dir=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
. "$test_dir/lib/test-common.sh"

install_script=$(CDPATH= cd -- "$test_dir/.." && pwd)/install.sh

# Test 15 (spec): install script refuses if terminal-notifier is missing on PATH.
mh_start_test "install: refuses when terminal-notifier missing"
sandbox=$(mktemp -d -t mac-health-install.XXXXXX)
mkdir -p "$sandbox/bin" "$sandbox/launchd-dest" "$sandbox/newsyslog-dest"

# Build a PATH that explicitly excludes terminal-notifier. Mock common utilities
# the install script reads (id, sed, install, mkdir) by chaining /usr/bin etc.
PATH="$sandbox/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export PATH
MAC_HEALTH_LAUNCHD_DEST="$sandbox/launchd-dest"
MAC_HEALTH_NEWSYSLOG_DEST="$sandbox/newsyslog-dest"
MAC_HEALTH_SKIP_ACTIVATE=1
export MAC_HEALTH_LAUNCHD_DEST MAC_HEALTH_NEWSYSLOG_DEST MAC_HEALTH_SKIP_ACTIVATE

if "$install_script" >/dev/null 2>&1; then
    mh_fail "install.sh exited 0 with no terminal-notifier; expected non-zero"
fi

# And nothing should have been written to the dest dirs.
count_plists=$(find "$MAC_HEALTH_LAUNCHD_DEST" -name '*.plist' 2>/dev/null | wc -l | tr -d ' ')
mh_assert_equal 0 "$count_plists" "no plists installed on refusal"

count_conf=$(find "$MAC_HEALTH_NEWSYSLOG_DEST" -name '*.conf' 2>/dev/null | wc -l | tr -d ' ')
mh_assert_equal 0 "$count_conf" "no newsyslog conf installed on refusal"

rm -rf "$sandbox"
unset MAC_HEALTH_LAUNCHD_DEST MAC_HEALTH_NEWSYSLOG_DEST MAC_HEALTH_SKIP_ACTIVATE

# Positive case: with a terminal-notifier mock on PATH and activation skipped,
# install.sh substitutes placeholders and writes plists + newsyslog conf.
mh_start_test "install: writes substituted plists and newsyslog conf when activation is skipped"
sandbox=$(mktemp -d -t mac-health-install.XXXXXX)
mkdir -p "$sandbox/bin" "$sandbox/launchd-dest" "$sandbox/newsyslog-dest" "$sandbox/home"

cat >"$sandbox/bin/terminal-notifier" <<'EOF'
#!/bin/sh
exit 0
EOF
chmod +x "$sandbox/bin/terminal-notifier"

PATH="$sandbox/bin:/usr/bin:/bin:/usr/sbin:/sbin"
HOME="$sandbox/home"
MAC_HEALTH_LAUNCHD_DEST="$sandbox/launchd-dest"
MAC_HEALTH_NEWSYSLOG_DEST="$sandbox/newsyslog-dest"
MAC_HEALTH_SKIP_ACTIVATE=1
export PATH HOME MAC_HEALTH_LAUNCHD_DEST MAC_HEALTH_NEWSYSLOG_DEST MAC_HEALTH_SKIP_ACTIVATE

if ! "$install_script" >/dev/null 2>&1; then
    mh_fail "install.sh exited non-zero; expected 0"
fi

count_plists=$(find "$MAC_HEALTH_LAUNCHD_DEST" -name '*.plist' 2>/dev/null | wc -l | tr -d ' ')
mh_assert_equal 2 "$count_plists" "two plists installed"

memory_plist="$MAC_HEALTH_LAUNCHD_DEST/com.user.mac-health.memory.plist"
disk_plist="$MAC_HEALTH_LAUNCHD_DEST/com.user.mac-health.disk-leftovers.plist"
[ -f "$memory_plist" ]  || mh_fail "memory plist missing"
[ -f "$disk_plist" ]    || mh_fail "disk-leftovers plist missing"

# Placeholders must be fully substituted.
if grep -q '__CHECKS_DIR__' "$memory_plist"; then
    mh_fail "memory plist still contains __CHECKS_DIR__ placeholder"
fi
if grep -q '__HOME__' "$memory_plist"; then
    mh_fail "memory plist still contains __HOME__ placeholder"
fi
if grep -q '__CHECKS_DIR__' "$disk_plist"; then
    mh_fail "disk plist still contains __CHECKS_DIR__ placeholder"
fi

# Substituted script path points at the real check files.
expected_checks_dir=$(CDPATH= cd -- "$test_dir/.." && pwd)/checks
if ! grep -q "$expected_checks_dir/check-memory.sh" "$memory_plist"; then
    mh_fail "memory plist does not reference $expected_checks_dir/check-memory.sh"
fi
if ! grep -q "$expected_checks_dir/check-disk-and-leftovers.sh" "$disk_plist"; then
    mh_fail "disk-leftovers plist does not reference check-disk-and-leftovers.sh"
fi

# Newsyslog conf substituted and present.
conf="$MAC_HEALTH_NEWSYSLOG_DEST/mac-health.conf"
[ -f "$conf" ] || mh_fail "newsyslog conf missing"
if grep -q '__HOME__' "$conf"; then
    mh_fail "newsyslog conf still contains __HOME__ placeholder"
fi
if grep -q '__USER__' "$conf"; then
    mh_fail "newsyslog conf still contains __USER__ placeholder"
fi
if ! grep -q "$HOME/Library/Logs/mac-health/health.log" "$conf"; then
    mh_fail "newsyslog conf does not reference the substituted log path"
fi

rm -rf "$sandbox"
unset HOME MAC_HEALTH_LAUNCHD_DEST MAC_HEALTH_NEWSYSLOG_DEST MAC_HEALTH_SKIP_ACTIVATE

mh_print_summary "test-install.sh"
