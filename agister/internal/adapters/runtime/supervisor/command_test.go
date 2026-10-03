package supervisor_test

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"strconv"
	"strings"
	"syscall"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/supervisor"
	"github.com/igor1309/ai-labs/agister/internal/adapters/system/systemtest"
)

// runCommand runs a command in dir on commands and returns its result and
// the references it reported.
func runCommand(ctx context.Context, t *testing.T, commands supervisor.Commands, dir, command string, timeout time.Duration, bound int) (supervisor.CommandResult, []string) {
	t.Helper()
	var refs []string
	result := commands.Run(ctx, supervisor.CommandRequest{Command: command, Dir: dir, Timeout: timeout, Bound: bound}, func(ref string) error {
		if len(refs) == 0 {
			cleanUpGroup(t, ref)
		}
		refs = append(refs, ref)
		return nil
	})
	return result, refs
}

// hangBound is how long a command may run in these tests before the
// watchdog ends it as a hang.
const hangBound = 20 * time.Second

// cleanUpGroup makes sure the group a reference names ends with the test,
// whatever the runner did: it is killed, its leader reaped if the runner
// did not, and the test waits until no member is left. A group still there
// after hangBound is a hang: the watchdog kills it and fails the test, so
// the runner returns and the cleanup runs.
func cleanUpGroup(t *testing.T, ref string) {
	t.Helper()
	group, _, err := supervisor.ParseRef(ref)
	if err != nil || group <= 1 {
		t.Errorf("reference %q names no group: %v", ref, err)
		return
	}
	watchdog := time.AfterFunc(hangBound, func() {
		t.Errorf("group %d still ran after %s: killed as a hang", group, hangBound)
		_ = syscall.Kill(-group, syscall.SIGKILL)
	})
	t.Cleanup(func() {
		watchdog.Stop()
		_ = syscall.Kill(-group, syscall.SIGKILL)
		var status syscall.WaitStatus
		_, _ = syscall.Wait4(group, &status, syscall.WNOHANG, nil)
		deadline := time.Now().Add(5 * time.Second)
		for !errors.Is(syscall.Kill(-group, 0), syscall.ESRCH) && time.Now().Before(deadline) {
			_, _ = syscall.Wait4(group, &status, syscall.WNOHANG, nil)
			time.Sleep(20 * time.Millisecond)
		}
	})
}

// A command runs with bash in its directory; its combined output is kept
// as a head and a tail with the size and digest of the whole, and its exit
// code is reported. Its group is on record, with the leader's token.
func TestCommandRunsWithBoundedOutput(t *testing.T) {
	dir := t.TempDir()
	whole := "out:" + strings.Repeat("x", 30) + "err:" + strings.Repeat("y", 30) + "end\n"
	result, refs := runCommand(context.Background(), t, supervisor.Commands{}, dir,
		`printf 'out:%s' "$(printf 'x%.0s' {1..30})"; printf 'err:%s' "$(printf 'y%.0s' {1..30})" >&2; echo end; pwd > where; exit 3`,
		10*time.Second, 8)
	sum := sha256.Sum256([]byte(whole))
	if result.Error != "" || result.ExitCode == nil || *result.ExitCode != 3 || result.TimedOut || result.Cancelled {
		t.Fatalf("result = %+v", result)
	}
	if string(result.Head) != whole[:8] || string(result.Tail) != whole[len(whole)-8:] || result.Bytes != int64(len(whole)) || result.SHA256 != hex.EncodeToString(sum[:]) {
		t.Fatalf("head %q, tail %q, bytes %d, sha %s", result.Head, result.Tail, result.Bytes, result.SHA256)
	}
	if where, _ := os.ReadFile(filepath.Join(dir, "where")); !strings.HasSuffix(strings.TrimSpace(string(where)), filepath.Base(dir)) {
		t.Fatalf("ran in %q", where)
	}
	if len(refs) != 2 || !strings.HasPrefix(refs[1], refs[0]+":") {
		t.Fatalf("refs = %q", refs)
	}

	// Output within twice the bound is kept whole, head then tail.
	result, _ = runCommand(context.Background(), t, supervisor.Commands{}, dir, "printf abcdefghij", 10*time.Second, 8)
	if string(result.Head)+string(result.Tail) != "abcdefghij" || string(result.Head) != "abcdefgh" || result.Bytes != 10 || *result.ExitCode != 0 {
		t.Fatalf("result = %+v", result)
	}
}

// blocks never ends on its own: only a kill ends it, so a timeout or a
// cancel is its one way out and no load can let it finish first.
const blocks = "tail -f /dev/null"

// groupOf reads the group a command wrote as $$ (bash leads its group).
func groupOf(t *testing.T, path string) int {
	t.Helper()
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		if data, err := os.ReadFile(path); err == nil && strings.HasSuffix(string(data), "\n") {
			group, err := strconv.Atoi(strings.TrimSpace(string(data)))
			if err == nil {
				return group
			}
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatal("the command never wrote its group")
	return 0
}

// A timeout, or the caller's cancellation, kills the whole group, children
// included; so does an exit that leaves children behind.
func TestCommandGroupIsKilled(t *testing.T) {
	// The timeout is on a manual clock: it passes only when the test
	// advances the clock past it.
	const timeout = time.Hour
	for _, c := range []struct {
		name    string
		command string
		passes  bool
		cancel  bool
	}{
		{"timeout", blocks + " & wait", true, false},
		{"cancellation", blocks + " & echo $$ > group; wait", false, true},
		{"exit", blocks + " & exit 0", false, false},
	} {
		t.Run(c.name, func(t *testing.T) {
			dir := t.TempDir()
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			if c.cancel {
				go func() { groupOf(t, filepath.Join(dir, "group")); cancel() }()
			}
			clock := systemtest.NewClock(start)
			if c.passes {
				go func() { clock.Started(timeout); clock.Advance(timeout) }()
			}
			result, refs := runCommand(ctx, t, supervisor.Commands{Timer: clock.Timer}, dir, c.command, timeout, 64)
			if result.TimedOut != (c.name == "timeout") || result.Cancelled != c.cancel || len(refs) == 0 {
				t.Fatalf("result %+v, refs %q", result, refs)
			}
			// The group as the runner put it on record: a command killed
			// before it ran a line wrote nothing.
			group, _, err := supervisor.ParseRef(refs[0])
			if err != nil {
				t.Fatal(err)
			}
			// A killed child is gone once its new parent has reaped it.
			deadline := time.Now().Add(5 * time.Second)
			for !errors.Is(syscall.Kill(-group, 0), syscall.ESRCH) {
				if time.Now().After(deadline) {
					t.Fatalf("group %d is still there", group)
				}
				time.Sleep(20 * time.Millisecond)
			}
		})
	}
}

// A group that cannot be recorded is killed at once, not by its timeout,
// and the run fails.
func TestUnrecordedCommandIsKilled(t *testing.T) {
	dir := t.TempDir()
	result := supervisor.Commands{}.Run(context.Background(), supervisor.CommandRequest{Command: blocks, Dir: dir, Timeout: 30 * time.Second, Bound: 64}, func(ref string) error {
		cleanUpGroup(t, ref)
		return errors.New("disk full")
	})
	if result.Error != "disk full" || result.ExitCode != nil || result.Signal != "killed" || result.TimedOut || result.Cancelled {
		t.Fatalf("result %+v", result)
	}
}

// runOn runs request with clock as the runner's Timer, aside, and gives
// the channel its result arrives on.
func runOn(t *testing.T, ctx context.Context, clock *systemtest.Clock, request supervisor.CommandRequest) <-chan supervisor.CommandResult {
	done := make(chan supervisor.CommandResult, 1)
	go func() {
		done <- supervisor.Commands{Timer: clock.Timer, KillGrace: grace}.Run(ctx, request, func(ref string) error {
			cleanUpGroup(t, ref)
			return nil
		})
	}()
	return done
}

// grace is the commands' kill grace in these tests: no other wait is as
// long.
const grace = 3 * time.Second

// released fails the test unless every wait the run started on clock is
// stopped or has fired, as each is by the time the run returns.
func released(t *testing.T, clock *systemtest.Clock) {
	t.Helper()
	if pending := clock.Pending(); pending != 0 {
		t.Fatalf("%d waits left running; started %v", pending, clock.Waits())
	}
}

// The command's timeout is on the runner's Timer: started with the
// request's timeout, it times the run out once the clock passes it, and
// not a moment before: cancelled a moment short of it, the run is
// cancelled, not timed out.
func TestCommandTimesOutOnItsTimer(t *testing.T) {
	request := supervisor.CommandRequest{Command: blocks, Dir: t.TempDir(), Timeout: time.Hour, Bound: 64}
	t.Run("passed", func(t *testing.T) {
		clock := systemtest.NewClock(start)
		done := runOn(t, context.Background(), clock, request)
		clock.Started(time.Hour)
		clock.Advance(time.Hour)
		result := <-done
		if !result.TimedOut || result.Cancelled || result.Error != "" {
			t.Fatalf("result %+v", result)
		}
		released(t, clock)
	})
	t.Run("not yet passed", func(t *testing.T) {
		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()
		clock := systemtest.NewClock(start)
		done := runOn(t, ctx, clock, request)
		clock.Started(time.Hour)
		clock.Advance(time.Hour - time.Nanosecond)
		cancel()
		result := <-done
		if result.TimedOut || !result.Cancelled {
			t.Fatalf("result %+v", result)
		}
		released(t, clock)
	})
}

// A command that goes without output for the request's NoOutput is killed
// as stale, before its timeout and not as a timeout, once the clock passes
// NoOutput and not a moment before.
func TestCommandWithoutOutputIsKilledAsStale(t *testing.T) {
	const noOutput = 2 * time.Minute
	request := supervisor.CommandRequest{Command: blocks, Dir: t.TempDir(), Timeout: time.Hour, NoOutput: noOutput, Bound: 64}
	t.Run("passed", func(t *testing.T) {
		clock := systemtest.NewClock(start)
		done := runOn(t, context.Background(), clock, request)
		clock.Started(noOutput)
		clock.Advance(noOutput)
		result := <-done
		if !result.Stale || result.TimedOut || result.Cancelled || result.Error != "" || result.ExitCode != nil || result.Signal != "killed" {
			t.Fatalf("result %+v", result)
		}
		released(t, clock)
	})
	t.Run("not yet passed", func(t *testing.T) {
		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()
		clock := systemtest.NewClock(start)
		done := runOn(t, ctx, clock, request)
		clock.Started(noOutput)
		clock.Advance(noOutput - time.Nanosecond)
		cancel()
		result := <-done
		if result.Stale || !result.Cancelled {
			t.Fatalf("result %+v", result)
		}
		released(t, clock)
	})
}

// Each output starts the wait again: the wait is for the time since the
// last output, so a command that keeps writing is live, and one that stops
// is stale from its last line.
func TestCommandOutputRestartsTheWaitForOutput(t *testing.T) {
	const noOutput = 2 * time.Minute
	// run starts a command that writes a line once it reads one from its
	// gate and exits once it reads another. A minute in, the test lets it
	// write; another minute on, past the end of the first wait, it returns
	// with the clock and the gate.
	run := func(t *testing.T) (*systemtest.Clock, *os.File, <-chan supervisor.CommandResult) {
		dir := t.TempDir()
		if err := syscall.Mkfifo(filepath.Join(dir, "gate"), 0o600); err != nil {
			t.Fatal(err)
		}
		// Held for reading and writing, the FIFO opens at once for both
		// ends, and a line written stays until the command reads it.
		gate, err := os.OpenFile(filepath.Join(dir, "gate"), os.O_RDWR, 0)
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { _ = gate.Close() })
		clock := systemtest.NewClock(start)
		done := runOn(t, context.Background(), clock, supervisor.CommandRequest{
			Command: "read _ < gate; echo one; read _ < gate", Dir: dir, Timeout: time.Hour, NoOutput: noOutput, Bound: 64,
		})
		clock.Started(noOutput)
		clock.Advance(time.Minute)
		if _, err := gate.WriteString("write\n"); err != nil {
			t.Fatal(err)
		}
		clock.Started(noOutput)
		clock.Advance(time.Minute)
		return clock, gate, done
	}
	t.Run("live", func(t *testing.T) {
		clock, gate, done := run(t)
		// A moment short of the second wait's end, the command exits.
		clock.Advance(time.Minute - time.Nanosecond)
		if _, err := gate.WriteString("exit\n"); err != nil {
			t.Fatal(err)
		}
		result := <-done
		if result.Stale || result.TimedOut || result.ExitCode == nil || *result.ExitCode != 0 || string(result.Head) != "one\n" {
			t.Fatalf("result %+v", result)
		}
		released(t, clock)
	})
	t.Run("stale after its last output", func(t *testing.T) {
		clock, _, done := run(t)
		clock.Advance(time.Minute)
		result := <-done
		if !result.Stale || result.TimedOut || string(result.Head) != "one\n" {
			t.Fatalf("result %+v", result)
		}
		released(t, clock)
	})
}

// Without a NoOutput only the timeout is started, and the grace for
// reading output once the command has exited.
func TestCommandWithoutANoOutputLimitStartsNoWaitForOutput(t *testing.T) {
	clock := systemtest.NewClock(start)
	result := <-runOn(t, context.Background(), clock, supervisor.CommandRequest{Command: "echo one", Dir: t.TempDir(), Timeout: time.Hour, Bound: 64})
	if waits := clock.Waits(); !reflect.DeepEqual(waits, []time.Duration{time.Hour, grace}) || result.Stale || result.ExitCode == nil {
		t.Fatalf("result %+v, waits started %v", result, waits)
	}
	released(t, clock)
}

// Output a descendant that left the group holds open cannot hold the run
// past the grace, which starts at the exit; until the grace has passed,
// the output is read.
func TestCommandOutputHeldOutsideTheGroupDoesNotHoldTheRun(t *testing.T) {
	pidFile := filepath.Join(t.TempDir(), "pid")
	t.Setenv(helperEnv, "escape")
	t.Setenv("PID_FILE", pidFile)
	t.Cleanup(func() {
		if data, err := os.ReadFile(pidFile); err == nil {
			if pid, err := strconv.Atoi(strings.TrimSpace(string(data))); err == nil && pid > 1 {
				_ = syscall.Kill(pid, syscall.SIGKILL)
			}
		}
	})
	clock := systemtest.NewClock(start)
	done := runOn(t, context.Background(), clock, supervisor.CommandRequest{Command: "exec '" + os.Args[0] + "'", Dir: t.TempDir(), Timeout: time.Hour, Bound: 64})
	// The escaped child never exits on its own: only the grace, started
	// at the exit, ends the read.
	clock.Started(grace)
	clock.Advance(grace - time.Nanosecond)
	select {
	case result := <-done:
		t.Fatalf("returned a moment short of the grace: %+v", result)
	default:
	}
	clock.Advance(time.Nanosecond)
	result := <-done
	if result.ExitCode == nil || *result.ExitCode != 0 || string(result.Head) != "started\n" {
		t.Fatalf("result %+v", result)
	}
	released(t, clock)
}
