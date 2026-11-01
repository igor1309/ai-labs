package call_test

import (
	"context"
	"fmt"
	"reflect"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/core/call"
	"github.com/igor1309/ai-labs/gokit/clocktest"
)

func dollars(n float64) *float64 { return &n }

// cost.feature: the first turn gets the step's session cost, zero for a
// new session; the next gets only what the previous turn reported.
func TestEachTurnIsGivenTheSessionsCostBeforeIt(t *testing.T) {
	t.Parallel()
	for _, c := range []struct {
		name, session                       string
		before, firstCost, firstSessionCost *float64
		stale                               bool
		nextBefore                          *float64
	}{
		{"continuing stale", "s1", dollars(1), nil, nil, true, nil},
		{"new capacity", "", nil, dollars(0.25), dollars(0.25), false, dollars(0.25)},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			clock, stale := clocktest.NewClock(start), &stalenessSpy{}
			first := replies(call.Reply{Session: "s1", Cost: c.firstCost, SessionCost: c.firstSessionCost, Failure: call.Capacity})
			if c.stale {
				first = goesStale(stale, noEvent, "s1")
			}
			spy := &runtimeSpy{turn: inOrder(first, replies(call.Reply{Text: "done", Session: "s1", SessionCost: dollars(2)}))}
			done := calling(context.Background(), recoveringCaller(t, spy, stale, clock), call.Step{Session: c.session, SessionCostBefore: c.before, Staleness: limits, Recovery: recovery}, discard)
			if !c.stale {
				clock.Started(30 * time.Second)
				clock.Advance(30 * time.Second)
			}
			got := <-done
			before := c.before
			if c.session == "" {
				before = dollars(0)
			}
			if len(spy.given) != 2 || !reflect.DeepEqual(spy.given[0].SessionCostBefore, before) || !reflect.DeepEqual(spy.given[1].SessionCostBefore, c.nextBefore) {
				t.Fatalf("turns %+v, want before %v then %v", spy.given, before, c.nextBefore)
			}
			if got.Status != call.Completed || got.SessionCost == nil || *got.SessionCost != 2 {
				t.Fatalf("result %+v, want completed, session cost 2", got)
			}
		})
	}
}

// cost.feature: a retry spends only known costs, and a step with no limit
// gives no budget.
func TestEachTurnsBudgetIsTheLimitLessKnownCost(t *testing.T) {
	t.Parallel()
	for _, c := range []struct {
		name                                  string
		limit, firstCost, secondBudget, total *float64
		stale                                 bool
	}{
		{"capacity", dollars(1), dollars(0.25), dollars(0.75), dollars(0.75), false},
		{"no limit", nil, dollars(0.25), nil, dollars(0.75), false},
		{"unknown stale cost", dollars(1), nil, dollars(1), nil, true},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			clock, stale := clocktest.NewClock(start), &stalenessSpy{}
			first := replies(call.Reply{Session: "s1", Cost: c.firstCost, Failure: call.Capacity})
			if c.stale {
				first = goesStale(stale, noEvent, "s1")
			}
			spy := &runtimeSpy{turn: inOrder(first, replies(call.Reply{Text: "done", Session: "s1", Cost: dollars(0.5)}))}
			done := calling(context.Background(), recoveringCaller(t, spy, stale, clock), call.Step{CostLimit: c.limit, Staleness: limits, Recovery: recovery}, discard)
			if !c.stale {
				clock.Started(30 * time.Second)
				clock.Advance(30 * time.Second)
			}
			got := <-done
			if len(spy.given) != 2 || !reflect.DeepEqual(spy.given[0].Budget, c.limit) || !reflect.DeepEqual(spy.given[1].Budget, c.secondBudget) {
				t.Fatalf("turns %+v, want budgets %v then %v", spy.given, c.limit, c.secondBudget)
			}
			if got.Status != call.Completed || !reflect.DeepEqual(got.Cost, c.total) {
				t.Fatalf("result %+v, want completed, cost %v", got, c.total)
			}
			if got.SessionCost != nil {
				t.Fatalf("session cost %v, want unknown after last reply", got.SessionCost)
			}
		})
	}
}

// cost.feature, "No retry starts once the limit is spent".
func TestNoRetryStartsOnceTheLimitIsSpent(t *testing.T) {
	t.Parallel()
	for _, cost := range []float64{1, 1.5} {
		t.Run(fmt.Sprint(cost), func(t *testing.T) {
			t.Parallel()
			clock := clocktest.NewClock(start)
			spy := &runtimeSpy{turn: inOrder(replies(call.Reply{Session: "s1", Cost: dollars(cost), Failure: call.Capacity, Reason: busy}), replies(call.Reply{Text: "done"}))}
			var reported capacityTurns
			got := recoveringCaller(t, spy, &stalenessSpy{}, clock).Call(context.Background(), call.Step{CostLimit: dollars(1)}, reported.report)
			if len(spy.given) != 1 || len(clock.Waits()) != 0 {
				t.Fatalf("turns %d, waits %v, want one turn and no wait", len(spy.given), clock.Waits())
			}
			if got.Status != call.Failed || got.Class != call.BudgetExhausted || got.Reason != fmt.Sprintf("the cost limit 1 is spent: %g", cost) || got.Cost == nil || *got.Cost != cost {
				t.Fatalf("result %+v, want failed budget_exhausted, cost %g", got, cost)
			}
			if !reflect.DeepEqual(reported, capacityTurns{{Reason: busy}}) {
				t.Fatalf("capacity reports %+v, want no retry", reported)
			}
		})
	}
}

// cost.feature, "A turn ended at its budget ends the call".
func TestATurnEndedAtItsBudgetEndsTheCall(t *testing.T) {
	t.Parallel()
	const why = "Reached maximum budget ($1)"
	spy := &runtimeSpy{turn: replies(call.Reply{Failure: call.BudgetExhausted, Reason: why, Cost: dollars(1.1)})}
	got := modelCaller(t, spy, &validatorSpy{}).Call(context.Background(), call.Step{CostLimit: dollars(1)}, discard)
	if len(spy.given) != 1 || got.Status != call.Failed || got.Class != call.BudgetExhausted || got.Reason != why || got.Cost == nil || *got.Cost != 1.1 {
		t.Fatalf("result %+v, turns %d, want budget_exhausted, runtime reason, cost 1.1", got, len(spy.given))
	}
}

// A call whose last turn reports no session cost cannot retain an earlier
// turn's cost for a later continuation.
func TestTheCallsSessionCostIsOnlyItsLastTurnsReport(t *testing.T) {
	t.Parallel()
	clock := clocktest.NewClock(start)
	spy := &runtimeSpy{turn: inOrder(
		replies(call.Reply{Session: "s1", SessionCost: dollars(1.25), Failure: call.Capacity}),
		exits(call.Ended{Signal: "terminated", Session: "s1"}),
	)}
	done := calling(context.Background(), recoveringCaller(t, spy, &stalenessSpy{}, clock), call.Step{}, discard)
	clock.Started(30 * time.Second)
	clock.Advance(30 * time.Second)
	got := <-done
	if got.Status != call.Failed || got.Class != call.Killed || got.SessionCost != nil || len(spy.given) != 2 || !reflect.DeepEqual(spy.given[1].SessionCostBefore, dollars(1.25)) {
		t.Fatalf("result %+v, turns %+v; want killed, unknown session cost, last turn given 1.25", got, spy.given)
	}
}

// cost.feature, "A call gives its cost's source, and why a cost is
// unknown".
func TestACallGivesItsCostsSourceAndWhyACostIsUnknown(t *testing.T) {
	t.Parallel()
	clock := clocktest.NewClock(start)
	spy := &runtimeSpy{turn: inOrder(
		replies(call.Reply{Session: "s1", Cost: dollars(0.25), CostSource: "ccusage", Failure: call.Capacity}),
		replies(call.Reply{Text: "done", Session: "s1", CostUnknown: "no totalCost"}),
	)}
	done := calling(context.Background(), recoveringCaller(t, spy, &stalenessSpy{}, clock), call.Step{}, discard)
	clock.Started(30 * time.Second)
	clock.Advance(30 * time.Second)
	got := <-done
	if got.Status != call.Completed || got.Cost != nil || got.CostSource != "" || !reflect.DeepEqual(got.Warnings, []string{"no totalCost"}) {
		t.Fatalf("result %+v, want completed, its cost unknown, no source, the warning %q", got, "no totalCost")
	}
}

// cost.feature, "A call whose turns all gave a cost gives their source".
func TestACallWhoseTurnsAllGaveACostGivesTheirSource(t *testing.T) {
	t.Parallel()
	spy := &runtimeSpy{turn: replies(call.Reply{Text: "done", Cost: dollars(0.25), CostSource: "ccusage"})}
	got := modelCaller(t, spy, &validatorSpy{}).Call(context.Background(), call.Step{}, discard)
	if got.Status != call.Completed || !reflect.DeepEqual(got.Cost, dollars(0.25)) || got.CostSource != "ccusage" || len(got.Warnings) != 0 {
		t.Fatalf("result %+v, want completed, its cost 0.25 from ccusage, no warning", got)
	}
}
