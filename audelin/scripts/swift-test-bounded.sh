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
#
# The run also watches coreaudiod, the system audio daemon its real-audio
# tests talk to. It prints the daemon's memory before and after, and if the
# daemon grows by more than BOUNDED_RSS_GROWTH_KB (1 GB by default) the run
# is killed and exits 125: a daemon that keeps growing takes the whole Mac
# down with it. BOUNDED_WATCH_PID watches another process instead.

[ $# -ge 1 ] || { echo "usage: $(basename "$0") <seconds> [swift test args]" >&2; exit 2; }
limit=$1
shift
events=$(mktemp)
grown=$(mktemp)
rm -f "$grown"
: > "$events"

# While the tests run, a stretch of 5 s with no new event is sampled: the
# stacks of the test process, memory pressure and the busiest processes, at
# most eight times. It records what the run waits on; it changes nothing.
(
  taken=0 quiet=0 size=0
  while [ "$taken" -lt 8 ]; do
    sleep 1
    now=$(wc -c < "$events" 2>/dev/null) || exit 0
    if [ "$now" -ne "$size" ]; then size=$now quiet=0; continue; fi
    quiet=$((quiet + 1))
    [ "$quiet" -ge 5 ] || continue
    quiet=0 taken=$((taken + 1))
    echo "observer: no test event for 5 s at $(date -u +%H:%M:%S)"
    memory_pressure -Q 2>&1 | sed 's/^/observer: /'
    ps -A -o pid=,pcpu=,rss=,comm= -r | head -8 | sed 's/^/observer: /'
    for pid in $(pgrep -f 'PackageTests'); do sample "$pid" 2 2>&1 | sed 's/^/observer: /'; done
  done
) &
observer=$!
trap 'kill "$observer" 2>/dev/null; wait "$observer" 2>/dev/null; rm -f "$events" "$grown"' EXIT

# swift test starts its test runner in a process group of its own, so the
# limit kills every process below the run, not a group. perl is on every
# macOS.
BOUNDED_EVENTS="$events" BOUNDED_GROWN="$grown" SWIFT_BACKTRACE=enable=yes perl -e '
  my ($limit, @cmd) = @ARGV;
  sub tree {
    my %children;
    for (`ps -A -o pid= -o ppid=`) { my ($p, $pp) = split; push @{$children{$pp}}, $p }
    my @all, my @next = @_;
    while (my $p = shift @next) { push @all, $p; push @next, @{$children{$p} || []} }
    return @all;
  }
  my $watched = $ENV{BOUNDED_WATCH_PID} // (split /\n/, `pgrep -x coreaudiod 2>/dev/null`)[0];
  sub rss {
    return undef unless $watched;
    my $kb = `ps -o rss= -p $watched 2>/dev/null`;
    $kb =~ s/\s//g;
    return $kb eq "" ? undef : $kb;
  }
  my $growth = $ENV{BOUNDED_RSS_GROWTH_KB} // 1048576;
  my $before = rss();
  print STDERR defined $before
    ? "coreaudiod before the run: " . int($before / 1024) . " MB\n"
    : "coreaudiod memory cannot be read here; it is not watched\n";
  my $pid = fork() // die "fork: $!";
  exec(@cmd) or die "exec: $!" if $pid == 0;
  # A test past its own time limit is reported while its stuck work still
  # runs: sample every process below the run once, at that moment, so a
  # per-test timeout leaves stacks and not only its name.
  my $watcher = fork() // die "fork: $!";
  if ($watcher == 0) {
    my $sampled = 0;
    while (kill(0, $pid)) {
      my $now = rss();
      if (defined $before && defined $now && $now - $before > $growth) {
        print STDERR "error: coreaudiod grew from " . int($before / 1024) . " MB to "
          . int($now / 1024) . " MB during the run; killing it\n";
        open(my $mark, ">", $ENV{BOUNDED_GROWN}) and close $mark;
        my @all = tree($pid);
        kill("TERM", @all); sleep 2; kill("KILL", tree($pid), @all);
        exit 0;
      }
      if (!$sampled && open(my $fh, "<", $ENV{BOUNDED_EVENTS})) {
        local $/; my $text = <$fh>; close $fh;
        if ($text =~ /Time limit was exceeded/) {
          print STDERR "error: a test exceeded its time limit; sampling the run\n";
          # Sample every process at once, deepest first: the test helper
          # holds the stuck work and may end while a parent is sampled.
          my @samplers = map {
            my $s = fork() // die "fork: $!";
            if ($s == 0) { exec("sample", $_, "2") or exit 1 }
            $s
          } reverse tree($pid);
          waitpid($_, 0) for @samplers;
          $sampled = 1;
        }
      }
      sleep 2;
    }
    exit 0;
  }
  local $SIG{ALRM} = sub {
    my @all = tree($pid);
    system("sample", $_, "2") for @all;
    kill("TERM", @all); sleep 3; kill("KILL", tree($pid), @all);
    waitpid($pid, 0);
    exit 124;
  };
  alarm($limit);
  waitpid($pid, 0);
  my $status = $?;
  alarm(0);
  kill("TERM", $watcher); waitpid($watcher, 0);
  my $after = rss();
  print STDERR "coreaudiod after the run: " . int($after / 1024) . " MB\n"
    if defined $before && defined $after;
  exit($status & 127 ? 128 + ($status & 127) : $status >> 8);
' "$limit" swift test --skip-build \
  --event-stream-output-path "$events" --event-stream-version 0 "$@"
code=$?
if [ -e "$grown" ]; then
  echo "error: coreaudiod grew past its limit and the run was killed; started and never ended:"
  code=125
fi

# The event stream is written as the tests run; the console output is
# buffered and lost with the killed run.
if [ "$code" -ne 0 ]; then
  if [ "$code" -eq 125 ]; then
    :
  elif [ "$code" -eq 124 ]; then
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
# The event stream's own clock: tests that took over 5 s, with when they
# started and ended, independent of the buffered console.
echo "tests that took over 5 s (start, end, seconds; UTC):"
python3 -I -c '
import json, sys, time
start = {}
for line in open(sys.argv[1]):
  try:
      record = json.loads(line).get("payload", {})
  except ValueError:
      continue
  at = record.get("instant", {}).get("since1970")
  test, kind = record.get("testID"), record.get("kind")
  if at is None or test is None:
      continue
  if kind == "testStarted":
      start[test] = at
  elif kind == "testEnded" and test in start and at - start[test] > 5:
      clock = lambda t: time.strftime("%H:%M:%S", time.gmtime(t)) + ("%.1f" % (t % 1))[1:]
      print("  %s  %s  %5.1f  %s" % (clock(start[test]), clock(at), at - start[test], test))
' "$events"
exit "$code"
