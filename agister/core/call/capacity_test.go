package call_test

import (
	"context"
	"reflect"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/core/call"
	"github.com/igor1309/ai-labs/gokit/clocktest"
)

// busy is the reason of capacity.feature's turn at capacity.
const busy = "Selected model is at capacity"

// atCapacity is a turn that fails at capacity, reporting session, "" for
// none.
func atCapacity(session string) func(context.Context) (call.Ended, error) {
	return exits(call.Ended{Session: session, Reply: &call.Reply{Session: session, Failure: call.Capacity, Reason: busy}})
}

// capacityTurns keeps each turn at capacity a call reports.
type capacityTurns []call.CapacityTurn

func (s *capacityTurns) report(r call.Report) {
	if r.Capacity != nil {
		*s = append(*s, *r.Capacity)
	}
}

// calling makes the call of step on c within ctx, each line it reports
// given to report, and gives its result once it has ended.
func calling(ctx context.Context, c *call.Caller, step call.Step, report func(call.Report)) <-chan call.Result {
	done := make(chan call.Result, 1)
	go func() { done <- c.Call(ctx, step, report) }()
	return done
}

// capacity.feature, "A turn at capacity is told to go on in its session
// after a wait": only its message and session change, once the wait passes.
func TestATurnAtCapacityIsToldToGoOnInItsSessionAfterAWait(t *testing.T) {
	t.Parallel()
	for _, session := range []string{"", "s1"} {
		t.Run("session="+session, func(t *testing.T) {
			t.Parallel()
			clock := clocktest.NewClock(start)
			staleness := &stalenessSpy{}
			spy := &runtimeSpy{turn: inOrder(atCapacity("s1"), replies(call.Reply{Output: []byte(`{"text":"done"}`), Session: "s1"}))}
			step := call.Step{
				Session: session,
				Inputs:  []call.Named{{Name: "goal", Text: "g"}}, Environment: map[string]string{"A": "1"},
				Instruction: "i", Model: "opus", Effort: "high", Options: []string{"Read"}, Schema: []byte("s"),
				Staleness: limits, Recovery: recovery,
			}
			var reported capacityTurns
			done := calling(context.Background(), recoveringCaller(t, spy, staleness, clock), step, reported.report)
			clock.Started(30 * time.Second)
			if len(spy.given) != 1 {
				t.Errorf("%d turns made before the wait passed, want 1", len(spy.given))
			}
			clock.Advance(30 * time.Second)
			got := <-done
			before := dollars(0)
			if session != "" {
				before = nil
			}
			first := call.Turn{Session: session, SessionCostBefore: before, Prompt: "## goal\n\ng", Dir: "/r", Env: []string{"PATH=/bin", "A=1"},
				Instruction: "i", Model: "opus", Effort: "high", Options: []string{"Read"}, Schema: []byte("s")}
			second := first
			second.SessionCostBefore = nil
			second.Session, second.Prompt = "s1", "Go on."
			if want := []call.Turn{first, second}; !reflect.DeepEqual(spy.given, want) {
				t.Errorf("turns\n got %+v\nwant %+v", spy.given, want)
			}
			if got.Status != call.Completed || !reflect.DeepEqual(got.Output, map[string]any{"text": "done"}) || got.Session != "s1" {
				t.Errorf("ended %q, output %v, session %q; want completed, the text done, s1", got.Status, got.Output, got.Session)
			}
			if want := (capacityTurns{{Reason: busy, Retry: 30 * time.Second}}); !reflect.DeepEqual(reported, want) {
				t.Errorf("turns at capacity reported %+v, want %+v", reported, want)
			}
			if waits := clock.Waits(); !reflect.DeepEqual(waits, []time.Duration{30 * time.Second}) {
				t.Errorf("timers %v, want one of 30s", waits)
			}
		})
	}
}

// capacity.feature, "A turn at capacity with no session runs again in its
// own".
func TestATurnAtCapacityWithNoSessionRunsAgainInItsOwn(t *testing.T) {
	t.Parallel()
	for _, session := range []string{"", "s0"} {
		t.Run("session="+session, func(t *testing.T) {
			t.Parallel()
			clock := clocktest.NewClock(start)
			spy := &runtimeSpy{turn: inOrder(atCapacity(""), replies(call.Reply{Text: "done", Session: session}))}
			step := call.Step{Session: session, Inputs: []call.Named{{Name: "goal", Text: "g"}}}
			done := calling(context.Background(), recoveringCaller(t, spy, &stalenessSpy{}, clock), step, discard)
			clock.Started(30 * time.Second)
			clock.Advance(30 * time.Second)
			got := <-done
			if len(spy.given) != 2 || spy.given[1].Session != session || spy.given[1].Prompt != "## goal\n\ng" {
				t.Errorf("turns %+v, want two, the second given the session %q and the original message", spy.given, session)
			}
			if got.Status != call.Completed {
				t.Errorf("ended %q, class %q, reason %q; want completed", got.Status, got.Class, got.Reason)
			}
		})
	}
}

// capacity.feature, "Five turns at capacity end the call": each retry
// resumes the session the first turn reported, after 30s, then 1m, then
// 3m, then 5m, with the message "Go on.".
func TestFiveTurnsAtCapacityEndTheCall(t *testing.T) {
	t.Parallel()
	clock := clocktest.NewClock(start)
	spy := &runtimeSpy{turn: atCapacity("s1")}
	var reported capacityTurns
	done := calling(context.Background(), recoveringCaller(t, spy, &stalenessSpy{}, clock), call.Step{}, reported.report)
	waits := []time.Duration{30 * time.Second, time.Minute, 3 * time.Minute, 5 * time.Minute}
	for _, wait := range waits {
		clock.Started(wait)
		clock.Advance(wait)
	}
	got := <-done
	var sessions []string
	for i, turn := range spy.given {
		if i > 0 && turn.Prompt != "Go on." {
			t.Errorf("retry message %q, want Go on.", turn.Prompt)
		}
		sessions = append(sessions, turn.Session)
	}
	if want := []string{"", "s1", "s1", "s1", "s1"}; !reflect.DeepEqual(sessions, want) {
		t.Errorf("turns given the sessions %q, want %q", sessions, want)
	}
	if got := clock.Waits(); !reflect.DeepEqual(got, waits) {
		t.Errorf("timers %v, want %v", got, waits)
	}
	if want := "5 of 5 turns at capacity: " + busy; got.Status != call.Failed || got.Class != call.Capacity || got.Reason != want {
		t.Errorf("ended %q, class %q, reason %q; want failed, class capacity, reason %q", got.Status, got.Class, got.Reason, want)
	}
	want := capacityTurns{{Reason: busy, Retry: 30 * time.Second}, {Reason: busy, Retry: time.Minute}, {Reason: busy, Retry: 3 * time.Minute}, {Reason: busy, Retry: 5 * time.Minute}, {Reason: busy}}
	if !reflect.DeepEqual(reported, want) {
		t.Errorf("turns at capacity reported %+v, want %+v", reported, want)
	}
}

// capacity.feature, "A wait the time limit would cut is not started";
// and one that would end as the limit passes, where the retry would
// start as the call is ended.
func TestAWaitTheTimeLimitWouldCutIsNotStarted(t *testing.T) {
	t.Parallel()
	for _, failed := range []time.Duration{9*time.Minute + 45*time.Second, 9*time.Minute + 30*time.Second} {
		t.Run(failed.String(), func(t *testing.T) {
			t.Parallel()
			waitNotStarted(t, failed)
		})
	}
}

// waitNotStarted is a call of the time limit 10m whose first turn fails at
// capacity at failed, which makes no other.
func waitNotStarted(t *testing.T, failed time.Duration) {
	t.Helper()
	clock := clocktest.NewClock(start)
	spy := &runtimeSpy{turn: func(ctx context.Context) (call.Ended, error) {
		clock.Advance(failed)
		return atCapacity("")(ctx)
	}}
	var reported capacityTurns
	got := recoveringCaller(t, spy, &stalenessSpy{}, clock).Call(context.Background(), call.Step{TimeLimit: 10 * time.Minute}, reported.report)
	if len(spy.given) != 1 {
		t.Errorf("%d turns, want one", len(spy.given))
	}
	if waits := clock.Waits(); !reflect.DeepEqual(waits, []time.Duration{10 * time.Minute}) {
		t.Errorf("timers %v, want the time limit's alone", waits)
	}
	if want := "1 of 5 turns at capacity: " + busy; got.Status != call.Failed || got.Class != call.Capacity || got.Reason != want {
		t.Errorf("ended %q, class %q, reason %q; want failed, class capacity, reason %q", got.Status, got.Class, got.Reason, want)
	}
	if want := (capacityTurns{{Reason: busy}}); !reflect.DeepEqual(reported, want) {
		t.Errorf("turns at capacity reported %+v, want %+v", reported, want)
	}
}

// capacity.feature, "A wait the caller cancels ends the call".
func TestAWaitTheCallerCancelsEndsTheCall(t *testing.T) {
	t.Parallel()
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	clock := clocktest.NewClock(start)
	spy := &runtimeSpy{turn: atCapacity("s1")}
	done := calling(ctx, recoveringCaller(t, spy, &stalenessSpy{}, clock), call.Step{}, discard)
	clock.Started(30 * time.Second)
	cancel()
	got := <-done
	if len(spy.given) != 1 {
		t.Errorf("%d turns, want one", len(spy.given))
	}
	if got.Status != call.Interrupted || got.Class != call.Cancelled || got.Reason != "" {
		t.Errorf("ended %q, class %q, reason %q; want interrupted, class cancelled, no reason", got.Status, got.Class, got.Reason)
	}
	if clock.Pending() != 0 {
		t.Errorf("%d timers pending, want the wait released", clock.Pending())
	}
}

// capacity.feature, "A turn at capacity that reported another session
// fails": reported, with no retry.
func TestATurnAtCapacityThatReportedAnotherSessionFails(t *testing.T) {
	t.Parallel()
	clock := clocktest.NewClock(start)
	staleness := &stalenessSpy{}
	spy := &runtimeSpy{turn: inOrder(goesStale(staleness, noEvent, "s1"), atCapacity("s2"))}
	var reported capacityTurns
	got := recoveringCaller(t, spy, staleness, clock).Call(context.Background(), call.Step{Staleness: limits, Recovery: recovery}, reported.report)
	if len(spy.given) != 2 || len(clock.Waits()) != 0 {
		t.Errorf("%d turns, timers %v; want 2 turns, no timer", len(spy.given), clock.Waits())
	}
	want := `the turn reported the session "s2", not "s1"`
	if got.Status != call.Failed || got.Class != call.RuntimeError || got.Reason != want {
		t.Errorf("ended %q, class %q, reason %q; want failed, class runtime_error, reason %q", got.Status, got.Class, got.Reason, want)
	}
	if want := (capacityTurns{{Reason: busy}}); !reflect.DeepEqual(reported, want) {
		t.Errorf("turns at capacity reported %+v, want %+v", reported, want)
	}
}

// A recovery turn at capacity keeps its message unless it reported a
// session, which already holds that message and needs only the nudge.
func TestACapacityRetryKeepsOrNudgesTheRecoveryMessage(t *testing.T) {
	t.Parallel()
	for _, c := range []struct{ session, message string }{
		{"", "Go on.\n\nno event for 21m"},
		{"s1", "Go on."},
	} {
		t.Run("reported session="+c.session, func(t *testing.T) {
			t.Parallel()
			clock := clocktest.NewClock(start)
			staleness := &stalenessSpy{}
			spy := &runtimeSpy{turn: inOrder(goesStale(staleness, noEvent, "s1"), atCapacity(c.session), replies(call.Reply{Text: "done", Session: "s1"}))}
			done := calling(context.Background(), recoveringCaller(t, spy, staleness, clock), call.Step{Staleness: limits, Recovery: recovery}, discard)
			clock.Started(30 * time.Second)
			clock.Advance(30 * time.Second)
			got := <-done
			if len(spy.given) != 3 || spy.given[2].Session != "s1" || spy.given[2].Prompt != c.message {
				t.Errorf("turns %+v, want three, the third given the session s1 and the message %q", spy.given, c.message)
			}
			if got.Status != call.Completed || !reflect.DeepEqual(got.Output, map[string]any{"text": "done"}) {
				t.Errorf("result %+v, want completed with text done", got)
			}
		})
	}
}

// capacity.feature, "A retry spends none of the recovery".
func TestARetrySpendsNoneOfTheRecovery(t *testing.T) {
	t.Parallel()
	clock := clocktest.NewClock(start)
	staleness := &stalenessSpy{}
	spy := &runtimeSpy{turn: inOrder(atCapacity(""), goesStale(staleness, noEvent, "s1"), replies(call.Reply{Text: "done", Session: "s1"}))}
	done := calling(context.Background(), recoveringCaller(t, spy, staleness, clock), call.Step{Staleness: limits, Recovery: recovery}, discard)
	clock.Started(30 * time.Second)
	clock.Advance(30 * time.Second)
	got := <-done
	if len(spy.given) != 3 || spy.given[2].Session != "s1" || spy.given[2].Prompt != "Go on.\n\nno event for 21m" {
		t.Errorf("turns %+v, want three, the third a recovery turn resuming s1", spy.given)
	}
	if got.Status != call.Completed {
		t.Errorf("ended %q, class %q, reason %q; want completed", got.Status, got.Class, got.Reason)
	}
}
