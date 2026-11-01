package call_test

import (
	"context"
	"errors"
	"reflect"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/core/call"
	"github.com/igor1309/ai-labs/gokit/clocktest"
)

// recoveringCaller is a caller over spy, which takes the inputs in its
// message, in "/r", its turns watched by staleness, its time limits on
// clock.
func recoveringCaller(t *testing.T, spy *runtimeSpy, staleness *stalenessSpy, clock *clocktest.Clock) *call.Caller {
	t.Helper()
	c, err := call.New(spy, call.InMessage, &validatorSpy{}, staleness, clock, clock.Timer, "/r", []string{"PATH=/bin"})
	if err != nil {
		t.Fatal(err)
	}
	return c
}

// inOrder is a turn answered by each of answers in turn, one a turn; a
// turn past the last is a runtime error.
func inOrder(answers ...func(context.Context) (call.Ended, error)) func(context.Context) (call.Ended, error) {
	next := 0
	return func(ctx context.Context) (call.Ended, error) {
		if next == len(answers) {
			return call.Ended{}, errors.New("no turn left")
		}
		next++
		return answers[next-1](ctx)
	}
}

// goesStale is a turn whose watch reports stale, which then ends, as the
// supervisor ends its program, once its context is ended; it reports
// session, "" for none.
func goesStale(staleness *stalenessSpy, stale call.Stale, session string) func(context.Context) (call.Ended, error) {
	return func(ctx context.Context) (call.Ended, error) {
		staleness.stale(stale)
		<-ctx.Done()
		return call.Ended{Signal: "terminated", Session: session}, nil
	}
}

// staleTurns keeps each stale turn a call reports.
type staleTurns []call.StaleTurn

func (s *staleTurns) report(r call.Report) {
	if r.Stale != nil {
		*s = append(*s, *r.Stale)
	}
}

var noEvent = call.Stale{Limit: call.NoEvent, What: "no event for 21m"}

// recovery is the step's recovery of recovery.feature, unless a scenario
// says otherwise.
var recovery = call.Recovery{Resumes: 1, Instruction: "Go on."}

// recovery.feature, "A stale turn with a resume left is recovered in its
// session": the recovery turn is the step's, its message and session the
// recovery's, watched anew.
func TestAStaleTurnWithAResumeLeftIsRecoveredInItsSession(t *testing.T) {
	t.Parallel()
	staleness := &stalenessSpy{}
	spy := &runtimeSpy{}
	spy.turn = inOrder(goesStale(staleness, noEvent, "s1"), replies(call.Reply{Text: "done", Session: "s1"}))
	step := call.Step{
		Inputs: []call.Named{{Name: "goal", Text: "g"}}, Environment: map[string]string{"A": "1"},
		Instruction: "i", Model: "opus", Effort: "high", Options: []string{"Read"},
		Staleness: limits, Recovery: recovery,
	}
	var stale staleTurns
	got := recoveringCaller(t, spy, staleness, clocktest.NewClock(start)).Call(context.Background(), step, stale.report)
	first := call.Turn{SessionCostBefore: dollars(0), Prompt: "## goal\n\ng", Dir: "/r", Env: []string{"PATH=/bin", "A=1"},
		Instruction: "i", Model: "opus", Effort: "high", Options: []string{"Read"}}
	second := first
	second.SessionCostBefore = nil
	second.Prompt, second.Session = "Go on.\n\nno event for 21m", "s1"
	if want := []call.Turn{first, second}; !reflect.DeepEqual(spy.given, want) {
		t.Errorf("turns\n got %+v\nwant %+v", spy.given, want)
	}
	if got.Status != call.Completed || !reflect.DeepEqual(got.Output, map[string]any{"text": "done"}) || got.Session != "s1" {
		t.Errorf("ended %q, output %v, session %q; want completed, the text done, s1", got.Status, got.Output, got.Session)
	}
	if want := (staleTurns{{What: "no event for 21m", Recovering: true}}); !reflect.DeepEqual(stale, want) {
		t.Errorf("stale turns reported %+v, want %+v", stale, want)
	}
	if want := []call.Limits{limits, limits}; !reflect.DeepEqual(staleness.limits, want) || staleness.stopped != 2 {
		t.Errorf("watched against %+v, %d stopped; want %+v, both stopped", staleness.limits, staleness.stopped, want)
	}
}

// A recovery turn is given the step's schema, as the turn it follows.
func TestARecoveryTurnIsGivenTheStepsSchema(t *testing.T) {
	t.Parallel()
	staleness := &stalenessSpy{}
	spy := &runtimeSpy{}
	spy.turn = inOrder(goesStale(staleness, noEvent, "s1"), replies(call.Reply{Output: []byte(`{"ok":true}`), Session: "s1"}))
	step := call.Step{Schema: []byte("s"), Staleness: limits, Recovery: recovery}
	got := recoveringCaller(t, spy, staleness, clocktest.NewClock(start)).Call(context.Background(), step, discard)
	if len(spy.given) != 2 || string(spy.given[1].Schema) != "s" {
		t.Fatalf("turns %+v, want two, the second given the schema s", spy.given)
	}
	if got.Status != call.Completed || !reflect.DeepEqual(got.Output, map[string]any{"ok": true}) {
		t.Errorf("ended %q, output %v; want completed, ok", got.Status, got.Output)
	}
}

// recovery.feature, "A stale turn not recovered ends the call": as the
// last stale turn ends it, whatever its limit, its session the last a turn
// reported.
func TestAStaleTurnNotRecoveredEndsTheCall(t *testing.T) {
	t.Parallel()
	toolCommand := call.Stale{Limit: call.ToolCommand, What: `the tool command "Bash" ran over 1m`}
	repeated := call.Stale{Limit: call.RepeatedToolCalls, What: `the tool call "Bash" repeated 5 times`}
	cases := []struct {
		name     string
		resumes  int
		stale    []call.Stale
		session  string
		reported staleTurns
		status   call.Status
		class    call.Class
	}{
		{"none, once", 0, []call.Stale{noEvent}, "s1",
			staleTurns{{What: noEvent.What}}, call.Interrupted, call.Timeout},
		{"1 resume, twice, on two things", 1, []call.Stale{noEvent, toolCommand}, "s1",
			staleTurns{{What: noEvent.What, Recovering: true}, {What: toolCommand.What}}, call.Interrupted, call.Timeout},
		{"1 resume, twice, the last repeating itself", 1, []call.Stale{noEvent, repeated}, "s1",
			staleTurns{{What: noEvent.What, Recovering: true}, {What: repeated.What}}, call.Failed, call.BudgetExhausted},
		{"2 resumes, twice, on the same thing", 2, []call.Stale{noEvent, noEvent}, "s1",
			staleTurns{{What: noEvent.What, Recovering: true}, {What: noEvent.What}}, call.Interrupted, call.Timeout},
		{"1 resume, once, no session reported", 1, []call.Stale{noEvent}, "",
			staleTurns{{What: noEvent.What}}, call.Interrupted, call.Timeout},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			staleness := &stalenessSpy{}
			var answers []func(context.Context) (call.Ended, error)
			for _, stale := range c.stale {
				answers = append(answers, goesStale(staleness, stale, c.session))
			}
			spy := &runtimeSpy{turn: inOrder(answers...)}
			step := call.Step{Staleness: limits, Recovery: call.Recovery{Resumes: c.resumes, Instruction: "Go on."}}
			var stale staleTurns
			got := recoveringCaller(t, spy, staleness, clocktest.NewClock(start)).Call(context.Background(), step, stale.report)
			last := c.stale[len(c.stale)-1]
			if len(spy.given) != len(c.stale) {
				t.Errorf("%d turns, want %d", len(spy.given), len(c.stale))
			}
			if got.Status != c.status || got.Class != c.class || got.Reason != last.What || got.Session != c.session {
				t.Errorf("ended %q, class %q, reason %q, session %q; want %q, class %q, reason %q, session %q",
					got.Status, got.Class, got.Reason, got.Session, c.status, c.class, last.What, c.session)
			}
			if !reflect.DeepEqual(stale, c.reported) {
				t.Errorf("stale turns reported %+v, want %+v", stale, c.reported)
			}
		})
	}
}

// recovery.feature, "A recovered call's cost and usage are unknown where a
// turn reported none": each the sum of its turns' where every turn
// reported it.
func TestARecoveredCallsCostAndUsageAreUnknownWhereATurnReportedNone(t *testing.T) {
	t.Parallel()
	count := func(n int64) *int64 { return &n }
	cost := func(c float64) *float64 { return &c }
	cases := []struct {
		name  string
		first *call.Reply
		cost  *float64
		input *int64
	}{
		{"the stale turn reported none", nil, nil, nil},
		{"the stale turn reported them", &call.Reply{Session: "s1", Cost: cost(0.25), Usage: call.Usage{Input: count(5)}}, cost(0.75), count(15)},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			staleness := &stalenessSpy{}
			stale := func(ctx context.Context) (call.Ended, error) {
				ended, err := goesStale(staleness, noEvent, "s1")(ctx)
				ended.Reply = c.first
				return ended, err
			}
			spy := &runtimeSpy{turn: inOrder(stale, replies(call.Reply{Text: "done", Session: "s1", Cost: cost(0.5), Usage: call.Usage{Input: count(10)}}))}
			got := recoveringCaller(t, spy, staleness, clocktest.NewClock(start)).Call(context.Background(), call.Step{Staleness: limits, Recovery: recovery}, discard)
			if got.Status != call.Completed || got.Usage == nil {
				t.Fatalf("ended %q, usage %+v; want completed, a usage", got.Status, got.Usage)
			}
			if !reflect.DeepEqual(got.Cost, c.cost) || !reflect.DeepEqual(got.Usage.Input, c.input) {
				t.Errorf("cost %v, input tokens %v; want %v, %v", got.Cost, got.Usage.Input, c.cost, c.input)
			}
			if got.Usage.Output != nil {
				t.Errorf("output tokens %v, want unknown: no turn reported them", *got.Usage.Output)
			}
		})
	}
}

// recovery.feature, "A call cancelled as its turn goes stale is not
// recovered": whichever its turn's context learns of first.
func TestACallCancelledAsItsTurnGoesStaleIsNotRecovered(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name string
		// staleFirst is whether the turn's watch reports it stale before
		// its caller cancels, else after.
		staleFirst bool
	}{
		{"stale, then cancelled", true},
		{"cancelled, then stale", false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			ctx, cancel := context.WithCancel(context.Background())
			t.Cleanup(cancel)
			staleness := &stalenessSpy{}
			spy := &runtimeSpy{turn: func(turnCtx context.Context) (call.Ended, error) {
				if c.staleFirst {
					staleness.stale(noEvent)
					cancel()
				} else {
					cancel()
					staleness.stale(noEvent)
				}
				<-turnCtx.Done()
				return call.Ended{Signal: "terminated", Session: "s1"}, nil
			}}
			got := recoveringCaller(t, spy, staleness, clocktest.NewClock(start)).Call(ctx, call.Step{Staleness: limits, Recovery: recovery}, discard)
			if len(spy.given) != 1 {
				t.Errorf("%d turns, want one", len(spy.given))
			}
			if got.Status != call.Interrupted || got.Class != call.Cancelled {
				t.Errorf("ended %q, class %q; want interrupted, class cancelled", got.Status, got.Class)
			}
		})
	}
}

// recovery.feature, "A recovery turn that reports another session fails
// the call": however it ends, its session the one reported; one that goes
// stale is not recovered again, though it has a resume left.
func TestARecoveryTurnThatReportsAnotherSessionFailsTheCall(t *testing.T) {
	t.Parallel()
	toolCommand := call.Stale{Limit: call.ToolCommand, What: `the tool command "Bash" ran over 1m`}
	cases := []struct {
		name     string
		recovery func(*stalenessSpy) func(context.Context) (call.Ended, error)
		reported staleTurns
	}{
		{"it replies", func(*stalenessSpy) func(context.Context) (call.Ended, error) {
			return replies(call.Reply{Text: "done", Session: "s2"})
		}, staleTurns{{What: noEvent.What, Recovering: true}}},
		{"it goes stale", func(staleness *stalenessSpy) func(context.Context) (call.Ended, error) {
			return goesStale(staleness, toolCommand, "s2")
		}, staleTurns{{What: noEvent.What, Recovering: true}, {What: toolCommand.What}}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			staleness := &stalenessSpy{}
			spy := &runtimeSpy{turn: inOrder(goesStale(staleness, noEvent, "s1"), c.recovery(staleness))}
			step := call.Step{Staleness: limits, Recovery: call.Recovery{Resumes: 2, Instruction: "Go on."}}
			var stale staleTurns
			got := recoveringCaller(t, spy, staleness, clocktest.NewClock(start)).Call(context.Background(), step, stale.report)
			want := `the turn reported the session "s2", not "s1"`
			if got.Status != call.Failed || got.Class != call.RuntimeError || got.Reason != want || got.Output != nil {
				t.Errorf("ended %q, class %q, reason %q, output %v; want failed, class runtime_error, reason %q, none",
					got.Status, got.Class, got.Reason, got.Output, want)
			}
			if got.Session != "s2" {
				t.Errorf("session %q, want the one reported, s2", got.Session)
			}
			if len(spy.given) != 2 {
				t.Errorf("%d turns, want 2", len(spy.given))
			}
			if !reflect.DeepEqual(stale, c.reported) {
				t.Errorf("stale turns reported %+v, want %+v", stale, c.reported)
			}
		})
	}
}

// recovery.feature, "The call's time limit spans its turns": one timer,
// started once, ends the recovery turn.
func TestTheCallsTimeLimitSpansItsTurns(t *testing.T) {
	t.Parallel()
	clock := clocktest.NewClock(start)
	staleness := &stalenessSpy{}
	recovering := make(chan struct{})
	spy := &runtimeSpy{}
	spy.turn = inOrder(
		func(ctx context.Context) (call.Ended, error) {
			clock.Advance(6 * time.Minute)
			return goesStale(staleness, noEvent, "s1")(ctx)
		},
		func(ctx context.Context) (call.Ended, error) {
			close(recovering)
			<-ctx.Done()
			return call.Ended{Signal: "terminated", Session: "s1"}, nil
		},
	)
	c := recoveringCaller(t, spy, staleness, clock)
	done := make(chan call.Result, 1)
	go func() {
		done <- c.Call(context.Background(), call.Step{TimeLimit: 10 * time.Minute, Staleness: limits, Recovery: recovery}, discard)
	}()
	<-recovering
	clock.Advance(4 * time.Minute)
	got := <-done
	if got.Status != call.Interrupted || got.Class != call.Timeout || got.Reason != "" {
		t.Errorf("ended %q, class %q, reason %q; want interrupted, class timeout, no reason", got.Status, got.Class, got.Reason)
	}
	if len(spy.given) != 2 {
		t.Errorf("%d turns, want 2", len(spy.given))
	}
	if waits := clock.Waits(); !reflect.DeepEqual(waits, []time.Duration{10 * time.Minute}) {
		t.Errorf("timers %v, want one of 10m", waits)
	}
}
