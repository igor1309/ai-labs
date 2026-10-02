package codex_test

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/codex"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/runtimetest"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/supervisor"
	"github.com/igor1309/ai-labs/agister/internal/app"
	composition "github.com/igor1309/ai-labs/agister/internal/composition/runtime"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

// The fakes this package builds are removed when its tests end.
func TestMain(m *testing.M) { os.Exit(runtimetest.Run(m)) }

func request(prompt string) app.TurnRequest {
	return app.TurnRequest{
		Prompt:       prompt,
		Instruction:  "Do the thing.",
		Primitives:   []string{"read-only"},
		Model:        "gpt-5.5",
		Effort:       "high",
		Timeout:      time.Minute,
		OutputSchema: json.RawMessage(`{"type":"object"}`),
	}
}

// The fake's error_result scenario emits turn.failed, which the suite's
// "runtime reported" check matches.
func TestConformance(t *testing.T) {
	runtimetest.Conformance(t, runtimetest.Subject{
		New: func(command string) app.TurnRunner {
			return composition.AdaptCodex(&codex.Runner{Transport: composition.CodexTransport{Supervisor: supervisor.Runtime{}}, Command: command, KillGrace: 200 * time.Millisecond})
		},
		Fake:      runtimetest.Binary(t, "fakecodex"),
		Contract:  codex.Contract,
		ToolCalls: true,
		Request:   request,
	})
}

func TestIdentityReportsResume(t *testing.T) {
	identity, err := codex.New(runtimetest.Binary(t, "fakecodex"), composition.CodexTransport{Supervisor: supervisor.Runtime{}}).Identity(context.Background())
	if err != nil || identity.Contract != "codex/2" || !identity.Resume || identity.CostLimit {
		t.Fatalf("identity = %+v, %v", identity, err)
	}
}

// ccusage lists sessions by rollout path; the fake's fresh thread is this
// one (observed shape, ccusage 20.0.26).
const fakeThread = "01a0e850-b808-71c2-8401-53ba16d8ae18"

func listingJSON(cost string) string {
	return `{"sessions":[
		{"sessionId":"2026/09/30/rollout-2026-09-30T10-00-00-01a0f1e9-210c-7853-b2dc-7abbe3cf6073","costUSD":0.318266},
		{"sessionId":"2026/09/30/rollout-2026-09-30T11-00-00-` + fakeThread + `","costUSD":` + cost + `}
	]}`
}

func listing(cost string) codex.Sessions {
	return func(context.Context, time.Duration, codex.LookupSink) ([]byte, error) {
		return []byte(listingJSON(cost)), nil
	}
}

// fakeCCUsage is a ccusage that runs script with /bin/sh.
func fakeCCUsage(t *testing.T, script string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "ccusage")
	if err := os.WriteFile(path, []byte("#!/bin/sh\n"+script), 0o755); err != nil {
		t.Fatal(err)
	}
	return path
}

// printsListing is a ccusage script that prints a listing of cost.
func printsListing(cost string) string {
	return "cat <<'EOF'\n" + listingJSON(cost) + "\nEOF\n"
}

// A turn's cost is the thread's, from ccusage, less what Agister recorded
// for the thread before it: all of it for a fresh thread, the difference
// for a resumed one.
func TestTurnCostIsTheThreadsFromCCUsage(t *testing.T) {
	runner := &codex.Runner{Transport: composition.CodexTransport{Supervisor: supervisor.Runtime{}}, Command: runtimetest.Binary(t, "fakecodex"), KillGrace: 200 * time.Millisecond}
	ctx := context.Background()

	runner.Sessions = listing("0.25")
	fresh := run.Own(composition.AdaptCodex(runner).RunTurn(ctx, request("SCENARIO:approve"), &runtimetest.Recorder{}), false)
	if string(fresh.Status) != string(run.Completed) || fresh.ProviderSessionID != fakeThread || fresh.CostUSD == nil || *fresh.CostUSD != 0.25 {
		t.Fatalf("fresh turn = %+v", fresh)
	}

	created := time.Date(2026, 9, 30, 10, 0, 0, 0, time.UTC)
	finished := created.Add(time.Minute)
	records := []run.Record{{ID: "run-1", CreatedAt: created, FinishedAt: &finished, Turn: &fresh}}
	resume := request("SCENARIO:approve")
	resume.ResumeSessionID = fakeThread
	runner.Sessions = listing("0.75")
	turn := composition.AdaptCodex(runner).RunTurn(ctx, resume, &runtimetest.Recorder{})
	turn.SessionBefore = run.LatestTotals(records, fakeThread, "run-2")
	resumed := run.Own(turn, true)
	if string(resumed.Status) != string(run.Completed) || resumed.CostUSD == nil || *resumed.CostUSD != 0.5 {
		t.Fatalf("resumed turn = %+v", resumed)
	}
}

// ccusage runs under the supervisor: its listing prices the thread, it is
// not the turn's raw output, and its group goes on record as the
// runtime's does.
func TestTurnCostFromTheInstalledCCUsage(t *testing.T) {
	command := fakeCCUsage(t, `[ "$*" = "codex session --json" ] || exit 3
`+printsListing("0.25"))
	runner := &codex.Runner{Transport: composition.CodexTransport{Supervisor: supervisor.Runtime{}}, Command: runtimetest.Binary(t, "fakecodex"), KillGrace: 200 * time.Millisecond, Sessions: codex.CCUsage(composition.CodexTransport{Supervisor: supervisor.Runtime{}}, command, 200*time.Millisecond)}
	sink := &runtimetest.Recorder{}
	turn := run.Own(composition.AdaptCodex(runner).RunTurn(context.Background(), request("SCENARIO:approve"), sink), false)
	if string(turn.Status) != string(run.Completed) || turn.CostUSD == nil || *turn.CostUSD != 0.25 {
		t.Fatalf("turn = %+v", turn)
	}
	for _, line := range sink.Lines {
		if strings.Contains(line, "sessions") {
			t.Fatalf("the listing went into the turn's raw output: %q", line)
		}
	}
	first, _, err := supervisor.ParseRef(sink.Processes[0])
	if err != nil {
		t.Fatal(err)
	}
	last, _, err := supervisor.ParseRef(sink.Processes[len(sink.Processes)-1])
	if err != nil || last == first {
		t.Fatalf("the lookup's group is not on record: %v, %v", sink.Processes, err)
	}
}

// The lookup gets what is left of the turn's timeout, by the runner's
// clock, and none once the turn has used it all, as a timed-out turn has.
func TestTheLookupGetsOnlyWhatIsLeftOfTheTurnsTimeout(t *testing.T) {
	start := time.Date(2026, 9, 30, 10, 0, 0, 0, time.UTC)
	for name, c := range map[string]struct {
		used time.Duration
		want []time.Duration
	}{
		"time left": {20 * time.Second, []time.Duration{40 * time.Second}},
		"time up":   {time.Minute, nil},
		"overrun":   {time.Minute + time.Second, nil},
	} {
		readings := 0
		var given []time.Duration
		runner := &codex.Runner{
			Transport: composition.CodexTransport{Supervisor: supervisor.Runtime{}},
			Command:   runtimetest.Binary(t, "fakecodex"), KillGrace: 200 * time.Millisecond,
			// The first reading starts the turn; by any later one the turn
			// has used c.used.
			Now: func() time.Time {
				readings++
				if readings == 1 {
					return start
				}
				return start.Add(c.used)
			},
			Sessions: func(_ context.Context, timeout time.Duration, _ codex.LookupSink) ([]byte, error) {
				given = append(given, timeout)
				return []byte(listingJSON("0.25")), nil
			},
		}
		turn := run.Own(composition.AdaptCodex(runner).RunTurn(context.Background(), request("SCENARIO:approve"), &runtimetest.Recorder{}), false)
		if !reflect.DeepEqual(given, c.want) {
			t.Errorf("%s: lookups given %v, want %v", name, given, c.want)
		}
		if string(turn.Status) != string(run.Completed) || (turn.CostUSD != nil) != (c.want != nil) {
			t.Errorf("%s: turn = %+v", name, turn)
		}
	}
}

// runGuarded runs an approved turn in a worker and returns what the turn
// returns. Past a 30-second hang guard the test fails, saying why the turn
// hung; guarded's cleanup ends what the turn started.
func runGuarded(t *testing.T, ctx context.Context, runner *codex.Runner, hang string) run.Turn {
	t.Helper()
	turn, ok := guarded(t, ctx, runner, time.After(30*time.Second))
	if !ok {
		t.Fatalf("RunTurn did not return: %s", hang)
	}
	return turn
}

// guarded runs an approved turn in a worker under a context of its own and
// reports whether it returned before expired fired. When it did not, cleanup
// cancels the call, kills every process group the turn recorded until the
// worker returns, and joins it, so nothing the turn started outlives t.
func guarded(t *testing.T, ctx context.Context, runner *codex.Runner, expired <-chan time.Time) (run.Turn, bool) {
	ctx, cancel := context.WithCancel(ctx)
	var mu sync.Mutex
	var groups []int
	watchdog := runtimetest.Watchdog(t)
	sink := &runtimetest.Recorder{OnProcess: func(ref string) {
		if group, _, err := supervisor.ParseRef(ref); err == nil && group > 1 {
			mu.Lock()
			groups = append(groups, group)
			mu.Unlock()
		}
		watchdog(ref)
	}}
	done := make(chan run.Turn, 1)
	go func() {
		done <- composition.AdaptCodex(runner).RunTurn(ctx, request("SCENARIO:approve"), sink)
	}()
	select {
	case turn := <-done:
		cancel()
		return turn, true
	case <-expired:
	}
	// Only on this path do the groups still run: a returned turn's groups
	// are gone, and their IDs are not the test's to signal.
	t.Cleanup(func() {
		cancel()
		for {
			mu.Lock()
			for _, group := range groups {
				_ = syscall.Kill(-group, syscall.SIGKILL)
			}
			mu.Unlock()
			select {
			case <-done:
				return
			case <-time.After(100 * time.Millisecond):
			}
		}
	})
	return run.Turn{}, false
}

// When the hang guard fires, cleanup ends the lookup the turn is held in
// and joins the worker before the test finishes.
func TestTheHangGuardJoinsTheTurnItGaveUpOn(t *testing.T) {
	lookup := codex.CCUsage(composition.CodexTransport{Supervisor: supervisor.Runtime{}}, fakeCCUsage(t, "exec sleep 600\n"), 200*time.Millisecond)
	var mu sync.Mutex
	var lookupErr error
	returned := false
	// The guard fires once the lookup has started, so it gives up on a turn
	// held in the lookup, whatever the machine's pace.
	expired := make(chan time.Time)
	runner := &codex.Runner{
		Transport: composition.CodexTransport{Supervisor: supervisor.Runtime{}},
		Command:   runtimetest.Binary(t, "fakecodex"), KillGrace: 200 * time.Millisecond,
		Sessions: func(ctx context.Context, timeout time.Duration, sink codex.LookupSink) ([]byte, error) {
			close(expired)
			listing, err := lookup(ctx, timeout, sink)
			mu.Lock()
			lookupErr, returned = err, true
			mu.Unlock()
			return listing, err
		},
	}
	var ok bool
	t.Run("guarded", func(t *testing.T) {
		_, ok = guarded(t, context.Background(), runner, expired)
	})
	if ok {
		t.Fatal("the turn returned before its lookup started: the guard never fired")
	}
	mu.Lock()
	defer mu.Unlock()
	if !returned || lookupErr == nil {
		t.Fatalf("the worker was not joined: lookup returned %v, %v", returned, lookupErr)
	}
}

// Cancelling the call during the lookup ends the lookup's group, so a
// child of the launcher that holds its stdout cannot hold the turn; the
// cost stays unknown and the turn is as the runtime ended it.
func TestCancellingTheLookupReturnsWhenAChildHoldsItsStdout(t *testing.T) {
	dir := t.TempDir()
	started := filepath.Join(dir, "started")
	if err := syscall.Mkfifo(started, 0o600); err != nil {
		t.Fatal(err)
	}
	pidFile := filepath.Join(dir, "child")
	// The child inherits stdout and sleeps far past the test; it is killed
	// on every path, the PID file read lazily.
	command := fakeCCUsage(t, `sleep 600 &
echo $! > "`+pidFile+`"
echo started > "`+started+`"
wait
`)
	t.Cleanup(func() {
		if data, err := os.ReadFile(pidFile); err == nil {
			if pid, err := strconv.Atoi(strings.TrimSpace(string(data))); err == nil && pid > 1 {
				_ = syscall.Kill(pid, syscall.SIGKILL)
			}
		}
	})
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	// Cancel once the child holds stdout: the launcher says so through the
	// FIFO. The test holds the FIFO for writing too, so neither end's open
	// waits for the other, and cleanup releases a reader the launcher never
	// wrote to, as when the runtime fails to start, then joins it.
	fifo, err := os.OpenFile(started, os.O_RDWR, 0)
	if err != nil {
		t.Fatal(err)
	}
	read := make(chan struct{})
	go func() {
		defer close(read)
		if line, err := bufio.NewReader(fifo).ReadString('\n'); err == nil && strings.TrimSpace(line) == "started" {
			cancel()
		}
	}()
	t.Cleanup(func() {
		_, _ = fifo.WriteString("released\n")
		<-read
		_ = fifo.Close()
	})
	runner := &codex.Runner{Transport: composition.CodexTransport{Supervisor: supervisor.Runtime{}}, Command: runtimetest.Binary(t, "fakecodex"), KillGrace: 200 * time.Millisecond, Sessions: codex.CCUsage(composition.CodexTransport{Supervisor: supervisor.Runtime{}}, command, 200*time.Millisecond)}
	// Only a hang reaches the guard: the child outlives it by far.
	turn := runGuarded(t, ctx, runner, "the lookup's child held it")
	if ctx.Err() == nil {
		t.Fatal("the lookup never started, so nothing was cancelled")
	}
	turn = run.Own(turn, false)
	if string(turn.Status) != string(run.Completed) || turn.Error != nil || turn.ProviderSessionID != fakeThread || turn.CostUSD != nil || turn.Session != nil && turn.Session.CostUSD != nil {
		t.Fatalf("turn = %+v", turn)
	}
}

// A lookup that never exits by itself is ended by what is left of the
// turn's timeout: the cost stays unknown and the turn is as the runtime
// ended it.
func TestTheLookupEndsWhenTheTurnsTimeoutRunsOut(t *testing.T) {
	command := fakeCCUsage(t, "exec sleep 600\n")
	lookup := codex.CCUsage(composition.CodexTransport{Supervisor: supervisor.Runtime{}}, command, 200*time.Millisecond)
	start := time.Date(2026, 9, 30, 10, 0, 0, 0, time.UTC)
	readings := 0
	var lookupErr error
	runner := &codex.Runner{
		Transport: composition.CodexTransport{Supervisor: supervisor.Runtime{}},
		Command:   runtimetest.Binary(t, "fakecodex"), KillGrace: 200 * time.Millisecond,
		// The first reading starts the turn; by any later one only a moment
		// of its minute is left.
		Now: func() time.Time {
			readings++
			if readings == 1 {
				return start
			}
			return start.Add(time.Minute - 100*time.Millisecond)
		},
		Sessions: func(ctx context.Context, timeout time.Duration, sink codex.LookupSink) ([]byte, error) {
			listing, err := lookup(ctx, timeout, sink)
			lookupErr = err
			return listing, err
		},
	}
	// Only a hang reaches the guard: the lookup outlives it by far.
	turn := runGuarded(t, context.Background(), runner, "the lookup outlived the turn's timeout")
	if lookupErr == nil || lookupErr.Error() != "timed out after 100ms" {
		t.Fatalf("the lookup was not ended by the timeout: %v", lookupErr)
	}
	turn = run.Own(turn, false)
	if string(turn.Status) != string(run.Completed) || turn.Error != nil || turn.ProviderSessionID != fakeThread || turn.CostUSD != nil || turn.Session != nil && turn.Session.CostUSD != nil {
		t.Fatalf("turn = %+v", turn)
	}
}

// A call cancelled by the time the runtime has completed the turn starts
// no lookup: the cost stays unknown and the turn is as the runtime ended
// it.
func TestNoLookupOnceTheCallIsCancelled(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	lookups := 0
	runner := &codex.Runner{
		Transport: composition.CodexTransport{Supervisor: supervisor.Runtime{}},
		Command:   runtimetest.Binary(t, "fakecodex"), KillGrace: 200 * time.Millisecond,
		Sessions: func(context.Context, time.Duration, codex.LookupSink) ([]byte, error) {
			lookups++
			return []byte(listingJSON("0.25")), nil
		},
	}
	sink := &runtimetest.Recorder{OnProcess: runtimetest.Watchdog(t), OnEvent: func(kind string) {
		if kind == "TURN_COMPLETED" {
			cancel()
		}
	}}
	turn := run.Own(composition.AdaptCodex(runner).RunTurn(ctx, request("SCENARIO:approve"), sink), false)
	if ctx.Err() == nil {
		t.Fatal("the runtime never completed the turn, so nothing was cancelled")
	}
	if lookups != 0 {
		t.Fatalf("%d lookups after the call was cancelled", lookups)
	}
	if string(turn.Status) != string(run.Completed) || turn.Error != nil || turn.ProviderSessionID != fakeThread || turn.CostUSD != nil || turn.Session != nil && turn.Session.CostUSD != nil {
		t.Fatalf("turn = %+v", turn)
	}
}

// Zero, a thread ccusage does not list, and ccusage failing, exiting
// non-zero or missing leave the cost unknown.
func TestTurnCostUnknownWithoutCCUsagesPrice(t *testing.T) {
	for name, sessions := range map[string]codex.Sessions{
		"zero": listing("0"),
		"missing": func(context.Context, time.Duration, codex.LookupSink) ([]byte, error) {
			return []byte(`{"sessions":[]}`), nil
		},
		"failing": func(context.Context, time.Duration, codex.LookupSink) ([]byte, error) {
			return nil, errors.New("exit status 1")
		},
		"non-zero": codex.CCUsage(composition.CodexTransport{Supervisor: supervisor.Runtime{}}, fakeCCUsage(t, printsListing("0.25")+"exit 1\n"), 200*time.Millisecond),
		"absent":   codex.CCUsage(composition.CodexTransport{Supervisor: supervisor.Runtime{}}, filepath.Join(t.TempDir(), "ccusage"), 200*time.Millisecond),
	} {
		runner := &codex.Runner{Transport: composition.CodexTransport{Supervisor: supervisor.Runtime{}}, Command: runtimetest.Binary(t, "fakecodex"), KillGrace: 200 * time.Millisecond, Sessions: sessions}
		turn := run.Own(composition.AdaptCodex(runner).RunTurn(context.Background(), request("SCENARIO:approve"), &runtimetest.Recorder{}), false)
		if string(turn.Status) != string(run.Completed) || turn.CostUSD != nil || turn.Session != nil && turn.Session.CostUSD != nil {
			t.Errorf("%s: turn = %+v", name, turn)
		}
	}
}

func ptr(v float64) *float64 { return &v }

// Codex fails a prompt over its input limit with the reason on stderr and
// none in the stream (observed with codex-cli 0.159.2); the message quotes
// it.
func TestAnOversizedPromptFailsWithCodexsReason(t *testing.T) {
	runner := &codex.Runner{Transport: composition.CodexTransport{Supervisor: supervisor.Runtime{}}, Command: runtimetest.Binary(t, "fakecodex"), KillGrace: 200 * time.Millisecond}
	turn := composition.AdaptCodex(runner).RunTurn(context.Background(), request("SCENARIO:input_too_large"), &runtimetest.Recorder{})
	if string(turn.Status) != string(run.Failed) || turn.Error == nil || string(turn.Error.Class) != string(run.ClassRuntimeError) ||
		!strings.HasPrefix(turn.Error.Message, "exit code 1: Error: turn/start: turn/start failed: Input exceeds the maximum length of 1048576 characters.") ||
		!strings.Contains(turn.StderrTail, `"input_error_code":"input_too_large"`) {
		t.Fatalf("turn = %+v", turn)
	}
}
