package supervisor_test

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/supervisor"
	"github.com/igor1309/ai-labs/agister/internal/app"
)

// runCommand runs a command in dir and returns its result and the
// references it reported.
func runCommand(ctx context.Context, t *testing.T, dir, command string, timeout time.Duration, bound int) (app.CommandResult, []string) {
	t.Helper()
	var refs []string
	result := supervisor.Commands{}.Run(ctx, app.CommandRequest{Command: command, Dir: dir, Timeout: timeout, Bound: bound}, func(ref string) error {
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
	result, refs := runCommand(context.Background(), t, dir,
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
	result, _ = runCommand(context.Background(), t, dir, "printf abcdefghij", 10*time.Second, 8)
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
	for _, c := range []struct {
		name    string
		command string
		timeout time.Duration
		cancel  bool
	}{
		{"timeout", blocks + " & wait", 300 * time.Millisecond, false},
		{"cancellation", blocks + " & echo $$ > group; wait", 30 * time.Second, true},
		{"exit", blocks + " & exit 0", 30 * time.Second, false},
	} {
		t.Run(c.name, func(t *testing.T) {
			dir := t.TempDir()
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			if c.cancel {
				go func() { groupOf(t, filepath.Join(dir, "group")); cancel() }()
			}
			result, refs := runCommand(ctx, t, dir, c.command, c.timeout, 64)
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
	result := supervisor.Commands{}.Run(context.Background(), app.CommandRequest{Command: blocks, Dir: dir, Timeout: 30 * time.Second, Bound: 64}, func(ref string) error {
		cleanUpGroup(t, ref)
		return errors.New("disk full")
	})
	if result.Error != "disk full" || result.ExitCode != nil || result.Signal != "killed" || result.TimedOut || result.Cancelled {
		t.Fatalf("result %+v", result)
	}
}

// The command's timeout is on the runner's Timer: started with the
// request's timeout, it times the run out when it fires, and is stopped
// once the run is over.
func TestCommandTimesOutOnItsTimer(t *testing.T) {
	fired := make(chan time.Time, 1)
	fired <- time.Time{}
	var timeout time.Duration
	stopped := false
	commands := supervisor.Commands{Timer: func(d time.Duration) (<-chan time.Time, func()) {
		timeout = d
		return fired, func() { stopped = true }
	}}
	result := commands.Run(context.Background(), app.CommandRequest{Command: blocks, Dir: t.TempDir(), Timeout: time.Hour, Bound: 64}, func(ref string) error {
		cleanUpGroup(t, ref)
		return nil
	})
	if !result.TimedOut || result.Cancelled || result.Error != "" || timeout != time.Hour || !stopped {
		t.Fatalf("result %+v, timer started with %s, stopped %t", result, timeout, stopped)
	}
}

// quietTimers is a Commands.Timer that tells the wait for output from the
// timeout by its length: the timeout never passes, and the n-th wait for
// output is waits[n], called as it starts.
type quietTimers struct {
	mu      sync.Mutex
	timeout time.Duration
	waits   []func() <-chan time.Time
	started int
	stopped int
}

func (q *quietTimers) timer(wait time.Duration) (<-chan time.Time, func()) {
	if wait == q.timeout {
		return nil, func() {}
	}
	q.mu.Lock()
	n := q.started
	q.started++
	q.mu.Unlock()
	var fired <-chan time.Time
	if n < len(q.waits) {
		fired = q.waits[n]()
	}
	return fired, func() {
		q.mu.Lock()
		defer q.mu.Unlock()
		q.stopped++
	}
}

func (q *quietTimers) counts() (started, stopped int) {
	q.mu.Lock()
	defer q.mu.Unlock()
	return q.started, q.stopped
}

func passed() <-chan time.Time {
	fired := make(chan time.Time, 1)
	fired <- time.Time{}
	return fired
}

func never() <-chan time.Time { return nil }

// A command that goes without output for the request's NoOutput is killed
// as stale, before its timeout and not as a timeout.
func TestCommandWithoutOutputIsKilledAsStale(t *testing.T) {
	timers := &quietTimers{timeout: time.Hour, waits: []func() <-chan time.Time{passed}}
	commands := supervisor.Commands{Timer: timers.timer}
	request := app.CommandRequest{Command: blocks, Dir: t.TempDir(), Timeout: time.Hour, NoOutput: 2 * time.Minute, Bound: 64}
	result := commands.Run(context.Background(), request, func(ref string) error {
		cleanUpGroup(t, ref)
		return nil
	})
	if !result.Stale || result.TimedOut || result.Cancelled || result.Error != "" || result.ExitCode != nil || result.Signal != "killed" {
		t.Fatalf("result %+v", result)
	}
	if started, stopped := timers.counts(); started != 1 || stopped != 1 {
		t.Fatalf("waits for output: %d started, %d stopped", started, stopped)
	}
}

// Each output starts the wait again: the wait is for the time since the
// last output, so a command that keeps writing is live, and one that stops
// is stale from its last line.
func TestCommandOutputRestartsTheWaitForOutput(t *testing.T) {
	t.Run("live", func(t *testing.T) {
		dir := t.TempDir()
		// The command ends only once its first line restarted the wait.
		restarted := func() <-chan time.Time {
			if err := os.WriteFile(filepath.Join(dir, "restarted"), nil, 0o600); err != nil {
				t.Error(err)
			}
			return nil
		}
		timers := &quietTimers{timeout: time.Hour, waits: []func() <-chan time.Time{never, restarted}}
		commands := supervisor.Commands{Timer: timers.timer}
		request := app.CommandRequest{Command: "echo one; until [ -e restarted ]; do sleep 0.02; done", Dir: dir, Timeout: time.Hour, NoOutput: 2 * time.Minute, Bound: 64}
		result := commands.Run(context.Background(), request, func(ref string) error {
			cleanUpGroup(t, ref)
			return nil
		})
		if result.Stale || result.TimedOut || result.ExitCode == nil || *result.ExitCode != 0 || string(result.Head) != "one\n" {
			t.Fatalf("result %+v", result)
		}
		if started, stopped := timers.counts(); started != 2 || stopped != 2 {
			t.Fatalf("waits for output: %d started, %d stopped", started, stopped)
		}
	})
	t.Run("stale after its last output", func(t *testing.T) {
		timers := &quietTimers{timeout: time.Hour, waits: []func() <-chan time.Time{never, passed}}
		commands := supervisor.Commands{Timer: timers.timer}
		request := app.CommandRequest{Command: "echo one; " + blocks, Dir: t.TempDir(), Timeout: time.Hour, NoOutput: 2 * time.Minute, Bound: 64}
		result := commands.Run(context.Background(), request, func(ref string) error {
			cleanUpGroup(t, ref)
			return nil
		})
		if !result.Stale || result.TimedOut || string(result.Head) != "one\n" {
			t.Fatalf("result %+v", result)
		}
	})
}

// Without a NoOutput only the timeout is started.
func TestCommandWithoutANoOutputLimitStartsNoWaitForOutput(t *testing.T) {
	timers := &quietTimers{timeout: time.Hour}
	commands := supervisor.Commands{Timer: timers.timer}
	result := commands.Run(context.Background(), app.CommandRequest{Command: "echo one", Dir: t.TempDir(), Timeout: time.Hour, Bound: 64}, func(ref string) error {
		cleanUpGroup(t, ref)
		return nil
	})
	if started, _ := timers.counts(); started != 0 || result.Stale || result.ExitCode == nil {
		t.Fatalf("result %+v, waits for output started %d", result, started)
	}
}
