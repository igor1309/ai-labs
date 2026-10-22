package call_test

import (
	"context"
	"errors"
	"fmt"
	"reflect"
	"slices"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/core/call"
	"github.com/igor1309/ai-labs/gokit/clocktest"
)

// capacityWaits are the waits between a call's four turns at capacity.
var capacityWaits = []time.Duration{30 * time.Second, time.Minute, 3 * time.Minute}

// passWaits lets each wait between a call's turns at capacity pass, once
// its timer has started.
func passWaits(clock *clocktest.Clock) {
	for _, wait := range capacityWaits {
		clock.Started(wait)
		clock.Advance(wait)
	}
}

// fallbackReports keeps what a call reports of its turns at capacity and
// of its fallback, in order: "capacity" or "fallback".
type fallbackReports []string

func (s *fallbackReports) report(r call.Report) {
	switch {
	case r.Capacity != nil:
		*s = append(*s, "capacity")
	case r.Fallback:
		*s = append(*s, "fallback")
	}
}

// withFallback makes the call of step on primary within ctx, its fallback
// fallback, each line it reports given to report, and gives its result
// once it has ended.
func withFallback(ctx context.Context, primary call.Maker, step call.Step, fallback call.Fallback, report func(call.Report)) <-chan call.Result {
	done := make(chan call.Result, 1)
	go func() { done <- call.WithFallback(ctx, primary, step, fallback, report) }()
	return done
}

// fallback.feature, "A call whose turns at capacity are spent is made on
// its fallback".
func TestACallWhoseTurnsAtCapacityAreSpentIsMadeOnItsFallback(t *testing.T) {
	t.Parallel()
	clock := clocktest.NewClock(start)
	primary := &runtimeSpy{turn: atCapacity("s0")}
	fallback := &runtimeSpy{turn: replies(call.Reply{Text: "done", Session: "f1"})}
	goal := []call.Named{{Name: "goal", Text: "g"}}
	var reported fallbackReports
	done := withFallback(context.Background(), recoveringCaller(t, primary, &stalenessSpy{}, clock),
		call.Step{Inputs: goal, Model: "gpt", Session: "s0"},
		call.Fallback{Maker: recoveringCaller(t, fallback, &stalenessSpy{}, clock), Step: call.Step{Inputs: goal, Model: "opus", Session: "s0"}},
		reported.report)
	passWaits(clock)
	got := <-done
	want := []call.Turn{{Prompt: "## goal\n\ng", Dir: "/r", Env: []string{"PATH=/bin"}, Model: "opus", SessionCostBefore: dollars(0)}}
	if !reflect.DeepEqual(fallback.given, want) {
		t.Errorf("fallback's turns\n got %+v\nwant %+v", fallback.given, want)
	}
	ended := start.Add(4*time.Minute + 30*time.Second)
	if got.Status != call.Completed || !reflect.DeepEqual(got.Output, map[string]any{"text": "done"}) || got.Session != "f1" ||
		got.Timing != (call.Timing{Started: start, Ended: ended, Duration: 4*time.Minute + 30*time.Second}) {
		t.Errorf("ended %q, output %v, session %q, timing %+v; want completed, the text done, f1, from %v to %v",
			got.Status, got.Output, got.Session, got.Timing, start, ended)
	}
	if p := got.Primary; p == nil || p.Status != call.Failed || p.Class != call.Capacity || p.Reason != "4 of 4 turns at capacity: "+busy || p.Session != "s0" {
		t.Errorf("primary %+v, want failed, class capacity, 4 of 4 turns at capacity, session s0", p)
	}
	if want := (fallbackReports{"capacity", "capacity", "capacity", "capacity", "fallback"}); !slices.Equal(reported, want) {
		t.Errorf("reported %q, want %q", reported, want)
	}
}

// fallback.feature, "Only a call at capacity falls back".
func TestOnlyACallAtCapacityFallsBack(t *testing.T) {
	t.Parallel()
	for _, c := range []struct {
		how    string
		turn   func(context.Context) (call.Ended, error)
		step   call.Step
		status call.Status
		class  call.Class
	}{
		{"completed", replies(call.Reply{Text: "done"}), call.Step{}, call.Completed, ""},
		{"rate_limited", replies(call.Reply{Failure: call.RateLimited, Reason: "r"}), call.Step{}, call.Failed, call.RateLimited},
		{"auth", replies(call.Reply{Failure: call.Auth, Reason: "r"}), call.Step{}, call.Failed, call.Auth},
		{"a runtime error", func(context.Context) (call.Ended, error) { return call.Ended{}, errors.New("broken") }, call.Step{}, call.Failed, call.RuntimeError},
		{"at capacity, its cost limit spent", replies(call.Reply{Failure: call.Capacity, Reason: busy, Cost: dollars(1)}),
			call.Step{CostLimit: dollars(1)}, call.Failed, call.BudgetExhausted},
	} {
		t.Run(c.how, func(t *testing.T) {
			t.Parallel()
			clock := clocktest.NewClock(start)
			fallback := &runtimeSpy{turn: replies(call.Reply{Text: "fallback"})}
			var reported fallbackReports
			got := call.WithFallback(context.Background(), recoveringCaller(t, &runtimeSpy{turn: c.turn}, &stalenessSpy{}, clock), c.step,
				call.Fallback{Maker: recoveringCaller(t, fallback, &stalenessSpy{}, clock)}, reported.report)
			if len(fallback.given) != 0 || slices.Contains(reported, "fallback") {
				t.Errorf("fallback given %d turns, reported %q; want none", len(fallback.given), reported)
			}
			if got.Status != c.status || got.Class != c.class || got.Primary != nil {
				t.Errorf("ended %q, class %q, primary %+v; want %q, class %q, no primary", got.Status, got.Class, got.Primary, c.status, c.class)
			}
		})
	}
}

// fallback.feature, "A fallback at capacity ends the call".
func TestAFallbackAtCapacityEndsTheCall(t *testing.T) {
	t.Parallel()
	clock := clocktest.NewClock(start)
	fallback := &runtimeSpy{turn: atCapacity("f1")}
	var reported fallbackReports
	done := withFallback(context.Background(), recoveringCaller(t, &runtimeSpy{turn: atCapacity("s1")}, &stalenessSpy{}, clock), call.Step{},
		call.Fallback{Maker: recoveringCaller(t, fallback, &stalenessSpy{}, clock)}, reported.report)
	passWaits(clock)
	passWaits(clock)
	got := <-done
	if want := "4 of 4 turns at capacity: " + busy; len(fallback.given) != 4 || got.Status != call.Failed || got.Class != call.Capacity || got.Reason != want {
		t.Errorf("fallback made %d turns, ended %q, class %q, reason %q; want 4, failed, class capacity, %q",
			len(fallback.given), got.Status, got.Class, got.Reason, want)
	}
	if p := got.Primary; p == nil || p.Class != call.Capacity {
		t.Errorf("primary %+v, want one of the class capacity", p)
	}
	if n := len(slices.DeleteFunc(slices.Clone(reported), func(r string) bool { return r != "fallback" })); n != 1 {
		t.Errorf("reported %q, want one fallback", reported)
	}
}

// fallback.feature, "The fallback is given what the call left of its
// limits".
func TestTheFallbackIsGivenWhatTheCallLeftOfItsLimits(t *testing.T) {
	t.Parallel()
	for _, c := range []struct {
		limit  float64
		day    *call.DailyBudget
		budget float64
	}{
		{2.5, nil, 0.5},
		{5, &call.DailyBudget{Cost: 4, Spent: 1}, 1},
	} {
		t.Run(fmt.Sprint(c.limit), func(t *testing.T) {
			t.Parallel()
			clock := clocktest.NewClock(start)
			tokens := func(n int64) *int64 { return &n }
			primary := &runtimeSpy{turn: replies(call.Reply{Failure: call.Capacity, Reason: busy, Cost: dollars(0.5), CostSource: "s",
				Usage: call.Usage{Input: tokens(10)}})}
			fallback := &runtimeSpy{turn: replies(call.Reply{Text: "done", Cost: dollars(1), CostSource: "s", Usage: call.Usage{Input: tokens(100)}})}
			step := call.Step{TimeLimit: 10 * time.Minute, CostLimit: dollars(c.limit), DailyBudget: c.day}
			done := withFallback(context.Background(), recoveringCaller(t, primary, &stalenessSpy{}, clock), step,
				call.Fallback{Maker: recoveringCaller(t, fallback, &stalenessSpy{}, clock), Step: step}, discard)
			passWaits(clock)
			got := <-done
			if want := []time.Duration{10 * time.Minute, 30 * time.Second, time.Minute, 3 * time.Minute, 5*time.Minute + 30*time.Second}; !reflect.DeepEqual(clock.Waits(), want) {
				t.Errorf("timers %v, want %v, the last the fallback's time limit", clock.Waits(), want)
			}
			if len(fallback.given) != 1 || !reflect.DeepEqual(fallback.given[0].Budget, dollars(c.budget)) {
				t.Errorf("fallback's turns %+v, want one of the budget %g", fallback.given, c.budget)
			}
			if got.Status != call.Completed || !reflect.DeepEqual(got.Cost, dollars(3)) || got.CostSource != "s" || got.Usage == nil || !reflect.DeepEqual(got.Usage.Input, tokens(140)) {
				t.Errorf("ended %q, cost %v, source %q, usage %+v; want completed, 3, s, 140 input tokens", got.Status, got.Cost, got.CostSource, got.Usage)
			}
		})
	}
}
