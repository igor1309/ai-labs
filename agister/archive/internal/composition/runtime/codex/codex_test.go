package codex_test

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/codex"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/runtimetest"
	"github.com/igor1309/ai-labs/agister/internal/app"
	composition "github.com/igor1309/ai-labs/agister/internal/composition/runtime"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
	"github.com/igor1309/ai-labs/gokit/clocktest"
	"github.com/igor1309/ai-labs/gokit/fakeproc"
	"github.com/igor1309/ai-labs/gokit/supervisor"
	"github.com/igor1309/ai-labs/gokit/supervisor/supervisortest"
)

// The fake this package builds is removed when its tests end.
func TestMain(m *testing.M) { os.Exit(runtimetest.Run(m)) }

// fake is the command the in-process starter runs the fake Codex by.
const fake = "codex"

// stillSupervisor is the real supervisor over the fakes run in process,
// with its waits on a manual clock that nothing advances: no turn or
// lookup times out unless a test advances a clock of its own, and no grace
// passes. Its starter numbers groups of its own: a test whose lookups
// start through another starter shares one Groups with it (stillOver).
func stillSupervisor() supervisor.Runtime {
	return stillOver(runtimetest.InProcess{Groups: supervisortest.NewGroups()})
}

// stillOver is stillSupervisor starting through starter, which carries a
// test's own ccusage, or the Groups a test's turn and lookups share.
func stillOver(starter runtimetest.InProcess) supervisor.Runtime {
	return supervisor.Runtime{Starter: starter, Timer: clocktest.NewClock(time.Date(2026, 10, 3, 12, 0, 0, 0, time.UTC)).Timer}
}

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
//
// Contract test: the Codex adapter against its built fake, a real process
// under the real supervisor.
func TestConformance(t *testing.T) {
	t.Parallel()
	clock := clocktest.NewClock(time.Date(2026, 10, 3, 12, 0, 0, 0, time.UTC))
	runtimetest.Conformance(t, runtimetest.Subject{
		New: func(command string) app.TurnRunner {
			return composition.AdaptCodex(&codex.Runner{Transport: composition.CodexTransport{Supervisor: supervisor.Runtime{Timer: clock.Timer}}, Command: command})
		},
		Fake:      runtimetest.Binary(t, "fakecodex"),
		Contract:  codex.Contract,
		ToolCalls: true,
		Request:   request,
		Clock:     clock,
	})
}

func TestIdentityReportsResume(t *testing.T) {
	t.Parallel()
	identity, err := codex.New(fake, composition.CodexTransport{Supervisor: stillSupervisor()}).Identity(context.Background())
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
	return func(context.Context, time.Duration, string, codex.LookupSink) ([]byte, error) {
		return []byte(listingJSON(cost)), nil
	}
}

// withCCUsage is a starter whose ccusage is program, run in process as the
// fake runtimes are, its groups numbered by groups.
func withCCUsage(groups *supervisortest.Groups, program supervisortest.Fake) runtimetest.InProcess {
	return runtimetest.InProcess{Groups: groups, Fakes: map[string]supervisortest.Fake{"ccusage": program}}
}

// printsListing is a ccusage that prints a listing of cost and exits with
// code.
func printsListing(cost string, code int) supervisortest.Fake {
	return func(p fakeproc.Process) int {
		fmt.Fprintln(p.Stdout, listingJSON(cost))
		return code
	}
}

// A turn's cost is the thread's, from ccusage, less what Agister recorded
// for the thread before it: all of it for a fresh thread, the difference
// for a resumed one.
func TestTurnCostIsTheThreadsFromCCUsage(t *testing.T) {
	t.Parallel()
	runner := &codex.Runner{Transport: composition.CodexTransport{Supervisor: stillSupervisor()}, Command: fake}
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
	t.Parallel()
	// The turn and its lookup start through starters of one Groups, as
	// one machine's processes are numbered.
	groups := supervisortest.NewGroups()
	lookups := stillOver(withCCUsage(groups, func(p fakeproc.Process) int {
		if strings.Join(p.Args, " ") != "codex session --json" {
			return 3
		}
		return printsListing("0.25", 0)(p)
	}))
	runner := &codex.Runner{Transport: composition.CodexTransport{Supervisor: stillOver(runtimetest.InProcess{Groups: groups})}, Command: fake, Sessions: codex.CCUsage(composition.CodexTransport{Supervisor: lookups}, "ccusage", 0)}
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
	t.Parallel()
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
			Transport: composition.CodexTransport{Supervisor: stillSupervisor()},
			Command:   fake,
			// The first reading starts the turn; by any later one the turn
			// has used c.used.
			Now: func() time.Time {
				readings++
				if readings == 1 {
					return start
				}
				return start.Add(c.used)
			},
			Sessions: func(_ context.Context, timeout time.Duration, _ string, _ codex.LookupSink) ([]byte, error) {
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

// Cancelling the call during the lookup ends the lookup's group, so a
// child of the launcher that holds its stdout cannot hold the turn; the
// cost stays unknown and the turn is as the runtime ended it.
func TestCancellingTheLookupReturnsWhenAChildHoldsItsStdout(t *testing.T) {
	t.Parallel()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	// The launcher never exits by itself and holds its stdout until its
	// group is ended. Cancel once it holds it: it says so by its report.
	reports := make(chan supervisortest.Report)
	held := make(chan struct{})
	go func() {
		defer close(held)
		for report := range reports {
			if report.Point == "blocked" {
				cancel()
			}
		}
	}()
	groups := supervisortest.NewGroups()
	lookups := withCCUsage(groups, fakeproc.Process.Block)
	lookups.Reports = reports
	runner := &codex.Runner{Transport: composition.CodexTransport{Supervisor: stillOver(runtimetest.InProcess{Groups: groups})}, Command: fake, Sessions: codex.CCUsage(composition.CodexTransport{Supervisor: stillOver(lookups)}, "ccusage", 0)}
	// Only the cancellation ends the lookup: a turn it held would never
	// return.
	turn := composition.AdaptCodex(runner).RunTurn(ctx, request("SCENARIO:approve"), &runtimetest.Recorder{})
	close(reports)
	<-held
	if ctx.Err() == nil {
		t.Fatal("the lookup never started, so nothing was cancelled")
	}
	turn = run.Own(turn, false)
	if string(turn.Status) != string(run.Completed) || turn.Error != nil || turn.ProviderSessionID != fakeThread || turn.CostUSD != nil || turn.Session != nil && turn.Session.CostUSD != nil {
		t.Fatalf("turn = %+v", turn)
	}
}

// A lookup that never exits by itself is ended by what is left of the
// turn's timeout, once that has passed on the supervisor's clock: the
// cost stays unknown and the turn is as the runtime ended it.
func TestTheLookupEndsWhenTheTurnsTimeoutRunsOut(t *testing.T) {
	t.Parallel()
	start := time.Date(2026, 9, 30, 10, 0, 0, 0, time.UTC)
	clock := clocktest.NewClock(start)
	groups := supervisortest.NewGroups()
	lookup := codex.CCUsage(composition.CodexTransport{Supervisor: supervisor.Runtime{Starter: withCCUsage(groups, fakeproc.Process.Block), Timer: clock.Timer}}, "ccusage", 0)
	// What is left passes once the lookup has started its wait.
	const left = 100 * time.Millisecond
	go func() { clock.Started(left); clock.Advance(left) }()
	readings := 0
	var lookupErr error
	runner := &codex.Runner{
		Transport: composition.CodexTransport{Supervisor: stillOver(runtimetest.InProcess{Groups: groups})},
		Command:   fake,
		// The first reading starts the turn; by any later one only a moment
		// of its minute is left.
		Now: func() time.Time {
			readings++
			if readings == 1 {
				return start
			}
			return start.Add(time.Minute - left)
		},
		Sessions: func(ctx context.Context, timeout time.Duration, home string, sink codex.LookupSink) ([]byte, error) {
			listing, err := lookup(ctx, timeout, home, sink)
			lookupErr = err
			return listing, err
		},
	}
	// Only the timeout ends the lookup: a turn it outlived would never
	// return.
	turn := composition.AdaptCodex(runner).RunTurn(context.Background(), request("SCENARIO:approve"), &runtimetest.Recorder{})
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
	t.Parallel()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	lookups := 0
	runner := &codex.Runner{
		Transport: composition.CodexTransport{Supervisor: stillSupervisor()},
		Command:   fake,
		Sessions: func(context.Context, time.Duration, string, codex.LookupSink) ([]byte, error) {
			lookups++
			return []byte(listingJSON("0.25")), nil
		},
	}
	sink := &runtimetest.Recorder{OnEvent: func(kind string) {
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
	t.Parallel()
	groups := supervisortest.NewGroups()
	for name, sessions := range map[string]codex.Sessions{
		"zero": listing("0"),
		"missing": func(context.Context, time.Duration, string, codex.LookupSink) ([]byte, error) {
			return []byte(`{"sessions":[]}`), nil
		},
		"failing": func(context.Context, time.Duration, string, codex.LookupSink) ([]byte, error) {
			return nil, errors.New("exit status 1")
		},
		"non-zero": codex.CCUsage(composition.CodexTransport{Supervisor: stillOver(withCCUsage(groups, printsListing("0.25", 1)))}, "ccusage", 0),
		"absent":   codex.CCUsage(composition.CodexTransport{Supervisor: stillOver(runtimetest.InProcess{Groups: groups})}, "ccusage", 0),
	} {
		runner := &codex.Runner{Transport: composition.CodexTransport{Supervisor: stillOver(runtimetest.InProcess{Groups: groups})}, Command: fake, Sessions: sessions}
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
	t.Parallel()
	runner := &codex.Runner{Transport: composition.CodexTransport{Supervisor: stillSupervisor()}, Command: fake}
	turn := composition.AdaptCodex(runner).RunTurn(context.Background(), request("SCENARIO:input_too_large"), &runtimetest.Recorder{})
	if string(turn.Status) != string(run.Failed) || turn.Error == nil || string(turn.Error.Class) != string(run.ClassRuntimeError) ||
		!strings.HasPrefix(turn.Error.Message, "exit code 1: Error: turn/start: turn/start failed: Input exceeds the maximum length of 1048576 characters.") ||
		!strings.Contains(turn.StderrTail, `"input_error_code":"input_too_large"`) {
		t.Fatalf("turn = %+v", turn)
	}
}
