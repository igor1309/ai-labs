#!/bin/sh
# Runs the already built tests of the Swift package in the current
# directory, and kills them if they outlive a limit, so a hang fails in
# seconds rather than at a job's timeout.
#
#   swift-test-bounded.sh <seconds> [swift test args]
#
# Build first with `swift build --build-tests`: compiling is not bounded
# here. Exits as `swift test` does, or 124 on the limit, after naming the
# tests that started and never ended, after sampling the stacks of every
# process below the run. A crash is named the same way, with the Swift
# runtime's backtrace in the output.

[ $# -ge 1 ] || { echo "usage: $(basename "$0") <seconds> [swift test args]" >&2; exit 2; }
limit=$1
shift
events=$(mktemp)
trap 'rm -f "$events"' EXIT

# swift test starts its test runner in a process group of its own, so the
# limit kills every process below the run, not a group. perl is on every
# macOS.
perl -e '
  my ($limit, @cmd) = @ARGV;
  sub tree {
    my %children;
    for (`ps -A -o pid= -o ppid=`) { my ($p, $pp) = split; push @{$children{$pp}}, $p }
    my @all, my @next = @_;
    while (my $p = shift @next) { push @all, $p; push @next, @{$children{$p} || []} }
    return @all;
  }
  my $pid = fork() // die "fork: $!";
  exec(@cmd) or die "exec: $!" if $pid == 0;
  local $SIG{ALRM} = sub {
    my @all = tree($pid);
    system("sample", $_, "2") for @all;
    kill("TERM", @all); sleep 3; kill("KILL", tree($pid), @all);
    waitpid($pid, 0);
    exit 124;
  };
  alarm($limit);
  waitpid($pid, 0);
  alarm(0);
  exit($? & 127 ? 128 + ($? & 127) : $? >> 8);
' "$limit" env SWIFT_BACKTRACE=enable=yes swift test --skip-build \
  --event-stream-output-path "$events" --event-stream-version 0 "$@"
code=$?

# The event stream is written as the tests run; the console output is
# buffered and lost with the killed run.
if [ "$code" -ne 0 ]; then
  if [ "$code" -eq 124 ]; then
    echo "error: the tests ran past ${limit}s and were killed; started and never ended:"
  else
    echo "error: the tests failed with exit code $code; started and never ended:"
  fi
  python3 -I -c '
import json, sys
started, ended = [], set()
for line in open(sys.argv[1]):
    try:
        payload = json.loads(line).get("payload", {})
    except ValueError:
        continue
    test = payload.get("testID")
    if payload.get("kind") == "testStarted":
        started.append(test)
    elif payload.get("kind") == "testEnded":
        ended.add(test)
for test in started:
    if test not in ended:
        print("  " + test)
' "$events"
fi
exit "$code"
