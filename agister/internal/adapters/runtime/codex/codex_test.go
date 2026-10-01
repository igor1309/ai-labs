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
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

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
			return &codex.Runner{Command: command, KillGrace: 200 * time.Millisecond}
		},
		Fake:     runtimetest.Binary(t, "fakecodex"),
		Contract: codex.Contract,
		Request:  request,
	})
}

func TestArguments(t *testing.T) {
	args, err := codex.Arguments(request("hello"), "/tmp/schema.json")
	if err != nil {
		t.Fatal(err)
	}
	want := []string{
		"exec", "--json", "--skip-git-repo-check", "--sandbox", "read-only",
		"--config", `approval_policy="never"`, "--ignore-user-config", "--ignore-rules",
		"--model", "gpt-5.5", "--config", `model_reasoning_effort="high"`,
		"--output-schema", "/tmp/schema.json", "-",
	}
	if !reflect.DeepEqual(args, want) {
		t.Fatalf("args =\n%q\nwant\n%q", args, want)
	}
	if got := codex.Prompt(request("hello")); got != "<instructions>\nDo the thing.\n</instructions>\n\nhello" {
		t.Fatalf("prompt = %q", got)
	}
}

// A continuation runs `exec resume` on the reported thread with every
// setting of a fresh turn; resume has no --sandbox, so the sandbox mode
// goes in as config.
func TestResumeArguments(t *testing.T) {
	r := request("hello")
	r.ResumeSessionID = "thread-0"
	args, err := codex.Arguments(r, "/tmp/schema.json")
	if err != nil {
		t.Fatal(err)
	}
	want := []string{
		"exec", "resume", "thread-0", "--json", "--skip-git-repo-check", "--config", `sandbox_mode="read-only"`,
		"--config", `approval_policy="never"`, "--ignore-user-config", "--ignore-rules",
		"--model", "gpt-5.5", "--config", `model_reasoning_effort="high"`,
		"--output-schema", "/tmp/schema.json", "-",
	}
	if !reflect.DeepEqual(args, want) {
		t.Fatalf("args =\n%q\nwant\n%q", args, want)
	}
}

func TestIdentityReportsResume(t *testing.T) {
	identity, err := codex.New(runtimetest.Binary(t, "fakecodex")).Identity(context.Background())
	if err != nil || identity.Contract != "codex/2" || !identity.Resume || identity.CostLimit {
		t.Fatalf("identity = %+v, %v", identity, err)
	}
}

// A resume turn must report the thread it resumed: another one, or none by
// the end of the turn, breaks the contract of resuming in place.
func TestResumeReportingAnotherThreadFails(t *testing.T) {
	code := 0
	clean := supervisor.Evidence{Exit: &run.Exit{Code: &code}}
	for name, lines := range map[string][]string{
		"another thread": {`{"type":"thread.started","thread_id":"t-2"}`, `{"type":"turn.completed"}`},
		"no thread":      {`{"type":"turn.completed"}`},
	} {
		stream := &codex.Stream{ResumedThreadID: "t-1"}
		for _, line := range lines {
			stream.Reduce(line)
		}
		if turn := stream.Reconcile(clean, false); turn.Status != run.Failed || turn.Error.Class != run.ClassRuntimeError || !strings.Contains(turn.Error.Message, "t-1") {
			t.Errorf("%s: turn = %+v", name, turn)
		}
	}
	stream := &codex.Stream{ResumedThreadID: "t-1"}
	stream.Reduce(`{"type":"thread.started","thread_id":"t-1"}`)
	stream.Reduce(`{"type":"turn.completed"}`)
	if turn := stream.Reconcile(clean, false); turn.Status != run.Completed || turn.ProviderSessionID != "t-1" {
		t.Fatalf("the same thread: turn = %+v", turn)
	}
}

func TestRejectsWhatItCannotHonour(t *testing.T) {
	for _, primitives := range [][]string{nil, {"read-only", "workspace-write"}, {"danger-full-access"}} {
		r := request("x")
		r.Primitives = primitives
		if _, err := codex.Arguments(r, ""); err == nil {
			t.Fatalf("primitives %v accepted", primitives)
		}
	}
	r := request("x")
	limit := 1.0
	r.MaxCostUSD = &limit
	if _, err := codex.Arguments(r, ""); err == nil || !strings.Contains(err.Error(), "cannot limit cost") {
		t.Fatalf("err = %v", err)
	}
}

func TestErrorEventsAreNotTerminal(t *testing.T) {
	stream := &codex.Stream{}
	for _, line := range []string{
		`{"type":"thread.started","thread_id":"t-1"}`,
		`{"type":"turn.started"}`,
		`{"type":"error","message":"Reconnecting... 2/5"}`,
		`{"type":"item.completed","item":{"id":"item_0","type":"error","message":"Falling back to HTTPS"}}`,
		`{"type":"item.started","item":{"id":"item_1","type":"command_execution","command":"ls"}}`,
		`{"type":"item.completed","item":{"id":"item_1","type":"command_execution","exit_code":2,"status":"failed"}}`,
		`{"type":"item.completed","item":{"id":"item_2","type":"agent_message","text":"{\"answer\":\"vm\"}"}}`,
	} {
		stream.Reduce(line)
	}
	code := 0
	clean := supervisor.Evidence{Exit: &run.Exit{Code: &code}}
	if turn := stream.Reconcile(clean, true); turn.Status != run.Lost || turn.Error.Class != run.ClassNoResult || turn.Error.Message != "exited without a result: Reconnecting... 2/5" {
		t.Fatalf("errors so far are evidence, not an outcome: %+v", turn)
	}
	stream.Reduce(`{"type":"turn.completed","usage":{"input_tokens":10,"cached_input_tokens":4,"output_tokens":5,"reasoning_output_tokens":3}}`)
	turn := stream.Reconcile(clean, true)
	if turn.Status != run.Completed || string(turn.Output) != `{"answer":"vm"}` || turn.ProviderSessionID != "t-1" || turn.CostUSD != nil {
		t.Fatalf("turn = %+v", turn)
	}
	// The thread's usage; the turn's own is the call's to derive.
	if u := turn.Session.Usage; turn.Usage != nil || turn.Session.CostUSD != nil || *u.InputTokens != 10 || *u.CacheReadTokens != 4 || *u.OutputTokens != 5 || *u.ReasoningTokens != 3 || u.CacheWriteTokens != nil {
		t.Fatalf("turn = %+v", turn)
	}
}

func TestStructuredOutputMustBeJSON(t *testing.T) {
	stream := &codex.Stream{}
	stream.Reduce(`{"type":"item.completed","item":{"type":"agent_message","text":"not json"}}`)
	stream.Reduce(`{"type":"turn.completed"}`)
	code := 0
	if turn := stream.Reconcile(supervisor.Evidence{Exit: &run.Exit{Code: &code}}, true); turn.Status != run.Failed || turn.Error.Class != run.ClassInvalidOutput {
		t.Fatalf("turn = %+v", turn)
	}
}

func TestFailuresAreClassified(t *testing.T) {
	code := 0
	clean := supervisor.Evidence{Exit: &run.Exit{Code: &code}}
	for message, class := range map[string]run.Class{
		"You've hit your usage limit": run.ClassRateLimited,
		"401 Unauthorized":            run.ClassAuth,
		"exceeds the context window":  run.ClassContextOverflow,
		"stream disconnected":         run.ClassRuntimeError,
	} {
		stream := &codex.Stream{}
		data, _ := json.Marshal(map[string]any{"type": "turn.failed", "error": map[string]any{"message": message}})
		stream.Reduce(string(data))
		if turn := stream.Reconcile(clean, false); turn.Status != run.Failed || turn.Error.Class != class {
			t.Errorf("%q: %+v", message, turn.Error)
		}
	}
}

// A process that could not be recorded fails the turn, whatever the stream
// says: it was killed, and nothing it reported can be trusted to be whole.
func TestUnrecordedProcessFailsTheTurnWhateverTheStreamSays(t *testing.T) {
	stream := &codex.Stream{}
	stream.Reduce(`{"type":"turn.completed"}`)
	turn := stream.Reconcile(supervisor.Evidence{RecordError: "disk full"}, false)
	if turn.Status != run.Failed || turn.Error == nil || turn.Error.Class != run.ClassInternal || !strings.Contains(turn.Error.Message, "disk full") {
		t.Fatalf("turn = %+v", turn)
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
	runner := &codex.Runner{Command: runtimetest.Binary(t, "fakecodex"), KillGrace: 200 * time.Millisecond}
	ctx := context.Background()

	runner.Sessions = listing("0.25")
	fresh := run.Own(runner.RunTurn(ctx, request("SCENARIO:approve"), &runtimetest.Recorder{}), false)
	if fresh.Status != run.Completed || fresh.ProviderSessionID != fakeThread || fresh.CostUSD == nil || *fresh.CostUSD != 0.25 {
		t.Fatalf("fresh turn = %+v", fresh)
	}

	created := time.Date(2026, 9, 30, 10, 0, 0, 0, time.UTC)
	finished := created.Add(time.Minute)
	records := []run.Record{{ID: "run-1", CreatedAt: created, FinishedAt: &finished, Turn: &fresh}}
	resume := request("SCENARIO:approve")
	resume.ResumeSessionID = fakeThread
	runner.Sessions = listing("0.75")
	turn := runner.RunTurn(ctx, resume, &runtimetest.Recorder{})
	turn.SessionBefore = run.LatestTotals(records, fakeThread, "run-2")
	resumed := run.Own(turn, true)
	if resumed.Status != run.Completed || resumed.CostUSD == nil || *resumed.CostUSD != 0.5 {
		t.Fatalf("resumed turn = %+v", resumed)
	}
}

// ccusage runs under the supervisor: its listing prices the thread, it is
// not the turn's raw output, and its group goes on record as the
// runtime's does.
func TestTurnCostFromTheInstalledCCUsage(t *testing.T) {
	command := fakeCCUsage(t, `[ "$*" = "codex session --json" ] || exit 3
`+printsListing("0.25"))
	runner := &codex.Runner{Command: runtimetest.Binary(t, "fakecodex"), KillGrace: 200 * time.Millisecond, Sessions: codex.CCUsage(command, 200*time.Millisecond)}
	sink := &runtimetest.Recorder{}
	turn := run.Own(runner.RunTurn(context.Background(), request("SCENARIO:approve"), sink), false)
	if turn.Status != run.Completed || turn.CostUSD == nil || *turn.CostUSD != 0.25 {
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
			Command: runtimetest.Binary(t, "fakecodex"), KillGrace: 200 * time.Millisecond,
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
		turn := run.Own(runner.RunTurn(context.Background(), request("SCENARIO:approve"), &runtimetest.Recorder{}), false)
		if !reflect.DeepEqual(given, c.want) {
			t.Errorf("%s: lookups given %v, want %v", name, given, c.want)
		}
		if turn.Status != run.Completed || (turn.CostUSD != nil) != (c.want != nil) {
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
		done <- runner.RunTurn(ctx, request("SCENARIO:approve"), sink)
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
	lookup := codex.CCUsage(fakeCCUsage(t, "exec sleep 600\n"), 200*time.Millisecond)
	var mu sync.Mutex
	var lookupErr error
	returned := false
	// The guard fires once the lookup has started, so it gives up on a turn
	// held in the lookup, whatever the machine's pace.
	expired := make(chan time.Time)
	runner := &codex.Runner{
		Command: runtimetest.Binary(t, "fakecodex"), KillGrace: 200 * time.Millisecond,
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
	runner := &codex.Runner{Command: runtimetest.Binary(t, "fakecodex"), KillGrace: 200 * time.Millisecond, Sessions: codex.CCUsage(command, 200*time.Millisecond)}
	// Only a hang reaches the guard: the child outlives it by far.
	turn := runGuarded(t, ctx, runner, "the lookup's child held it")
	if ctx.Err() == nil {
		t.Fatal("the lookup never started, so nothing was cancelled")
	}
	turn = run.Own(turn, false)
	if turn.Status != run.Completed || turn.Error != nil || turn.ProviderSessionID != fakeThread || turn.CostUSD != nil || turn.Session != nil && turn.Session.CostUSD != nil {
		t.Fatalf("turn = %+v", turn)
	}
}

// A lookup that never exits by itself is ended by what is left of the
// turn's timeout: the cost stays unknown and the turn is as the runtime
// ended it.
func TestTheLookupEndsWhenTheTurnsTimeoutRunsOut(t *testing.T) {
	command := fakeCCUsage(t, "exec sleep 600\n")
	lookup := codex.CCUsage(command, 200*time.Millisecond)
	start := time.Date(2026, 9, 30, 10, 0, 0, 0, time.UTC)
	readings := 0
	var lookupErr error
	runner := &codex.Runner{
		Command: runtimetest.Binary(t, "fakecodex"), KillGrace: 200 * time.Millisecond,
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
	if turn.Status != run.Completed || turn.Error != nil || turn.ProviderSessionID != fakeThread || turn.CostUSD != nil || turn.Session != nil && turn.Session.CostUSD != nil {
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
		Command: runtimetest.Binary(t, "fakecodex"), KillGrace: 200 * time.Millisecond,
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
	turn := run.Own(runner.RunTurn(ctx, request("SCENARIO:approve"), sink), false)
	if ctx.Err() == nil {
		t.Fatal("the runtime never completed the turn, so nothing was cancelled")
	}
	if lookups != 0 {
		t.Fatalf("%d lookups after the call was cancelled", lookups)
	}
	if turn.Status != run.Completed || turn.Error != nil || turn.ProviderSessionID != fakeThread || turn.CostUSD != nil || turn.Session != nil && turn.Session.CostUSD != nil {
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
		"non-zero": codex.CCUsage(fakeCCUsage(t, printsListing("0.25")+"exit 1\n"), 200*time.Millisecond),
		"absent":   codex.CCUsage(filepath.Join(t.TempDir(), "ccusage"), 200*time.Millisecond),
	} {
		runner := &codex.Runner{Command: runtimetest.Binary(t, "fakecodex"), KillGrace: 200 * time.Millisecond, Sessions: sessions}
		turn := run.Own(runner.RunTurn(context.Background(), request("SCENARIO:approve"), &runtimetest.Recorder{}), false)
		if turn.Status != run.Completed || turn.CostUSD != nil || turn.Session != nil && turn.Session.CostUSD != nil {
			t.Errorf("%s: turn = %+v", name, turn)
		}
	}
}

func TestThreadCost(t *testing.T) {
	path := "2026/09/30/rollout-2026-09-30T11-00-00-01a0f1e9-210c-7853-b2dc-7abbe3cf6073"
	for name, c := range map[string]struct {
		listing string
		want    *float64
	}{
		"listed":    {`{"sessions":[{"sessionId":"` + path + `","costUSD":0.318266}]}`, ptr(0.318266)},
		"no cost":   {`{"sessions":[{"sessionId":"` + path + `"}]}`, nil},
		"twice":     {`{"sessions":[{"sessionId":"` + path + `","costUSD":1},{"sessionId":"x/` + path + `","costUSD":2}]}`, nil},
		"not json":  {`ccusage: error`, nil},
		"other one": {`{"sessions":[{"sessionId":"rollout-01a0f1e9-210c-7853-b2dc-7abbe3cf6074","costUSD":1}]}`, nil},
	} {
		got := codex.ThreadCost([]byte(c.listing), "01a0f1e9-210c-7853-b2dc-7abbe3cf6073")
		if (got == nil) != (c.want == nil) || got != nil && *got != *c.want {
			t.Errorf("%s: cost = %v, want %v", name, got, c.want)
		}
	}
}

func ptr(v float64) *float64 { return &v }

// Codex fails a prompt over its input limit with the reason on stderr and
// none in the stream (observed with codex-cli 0.159.2); the message quotes
// it.
func TestAnOversizedPromptFailsWithCodexsReason(t *testing.T) {
	runner := &codex.Runner{Command: runtimetest.Binary(t, "fakecodex"), KillGrace: 200 * time.Millisecond}
	turn := runner.RunTurn(context.Background(), request("SCENARIO:input_too_large"), &runtimetest.Recorder{})
	if turn.Status != run.Failed || turn.Error == nil || turn.Error.Class != run.ClassRuntimeError ||
		!strings.HasPrefix(turn.Error.Message, "exit code 1: Error: turn/start: turn/start failed: Input exceeds the maximum length of 1048576 characters.") ||
		!strings.Contains(turn.StderrTail, `"input_error_code":"input_too_large"`) {
		t.Fatalf("turn = %+v", turn)
	}
}

// The stream's tool calls are reported for the core to watch: each with its
// whole input and whether it runs a command; a completed item ends the call
// of its ID, and an item that is no tool call is not one.
func TestStreamReportsToolCalls(t *testing.T) {
	stream := &codex.Stream{}
	long := "echo " + strings.Repeat("x", 1000)
	command, _ := json.Marshal(long)
	for _, line := range []string{
		`{"type":"item.started","item":{"id":"item_1","type":"command_execution","command":` + string(command) + `}}`,
		`{"type":"item.completed","item":{"id":"item_1","type":"command_execution","exit_code":0,"status":"completed"}}`,
		`{"type":"item.started","item":{"id":"item_2","type":"web_search","query":"agister"}}`,
		`{"type":"item.completed","item":{"id":"item_3","type":"agent_message","text":"done"}}`,
	} {
		stream.Reduce(line)
	}
	tools := stream.TakeTools()
	if len(tools) != 3 || tools[0].Started == nil || tools[1].Finished != "item_1" || tools[2].Started == nil {
		t.Fatalf("tools = %+v", tools)
	}
	if first := *tools[0].Started; first.ID != "item_1" || first.Name == "" || first.Input != long || !first.Command {
		t.Fatalf("command = %+v", first)
	}
	if search := *tools[2].Started; search.ID != "item_2" || search.Input != "agister" || search.Command {
		t.Fatalf("search = %+v", search)
	}
	if again := stream.TakeTools(); len(again) != 0 {
		t.Fatalf("taken twice: %+v", again)
	}
}
