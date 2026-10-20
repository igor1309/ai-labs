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

// daily.feature: each turn gets the least remaining budget, and its own
// known cost reduces the next turn's share.
func TestTheTurnsBudgetCountsTheDayAndTheCallsKnownCost(t *testing.T) {
	t.Parallel()
	for _, c := range []struct {
		name  string
		limit *float64
		day   *call.DailyBudget
		want  float64
	}{
		{"daily only", nil, &call.DailyBudget{Cost: 20, Spent: 19}, 1},
		{"daily less", dollars(3), &call.DailyBudget{Cost: 20, Spent: 19}, 1},
		{"limit less", dollars(3), &call.DailyBudget{Cost: 20, Spent: 10}, 3},
		{"no daily", dollars(3), nil, 3},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			clock := clocktest.NewClock(start)
			spy := &runtimeSpy{turn: inOrder(
				replies(call.Reply{Session: "s1", Cost: dollars(0.25), Failure: call.Capacity}),
				replies(call.Reply{Session: "s1", Text: "done"}),
			)}
			done := calling(context.Background(), recoveringCaller(t, spy, &stalenessSpy{}, clock), call.Step{CostLimit: c.limit, DailyBudget: c.day}, discard)
			clock.Started(30 * time.Second)
			clock.Advance(30 * time.Second)
			got := <-done
			if got.Status != call.Completed || len(spy.given) != 2 || !reflect.DeepEqual(spy.given[0].Budget, dollars(c.want)) || !reflect.DeepEqual(spy.given[1].Budget, dollars(c.want-0.25)) {
				t.Fatalf("result %+v, turns %+v; want completed, budgets %g then %g", got, spy.given, c.want, c.want-0.25)
			}
		})
	}
}

// daily.feature: every runtime takes no turn on a spent day.
func TestACallOnASpentDayTakesNoTurn(t *testing.T) {
	t.Parallel()
	for _, inputs := range []call.Inputs{call.InMessage, call.InEnvironment} {
		for _, spent := range []float64{20, 21.5} {
			t.Run(fmt.Sprintf("%d/%g", inputs, spent), func(t *testing.T) {
				t.Parallel()
				clock := clocktest.NewClock(start)
				spy := &runtimeSpy{turn: replies(call.Reply{Text: "done"})}
				caller, err := call.New(spy, inputs, &validatorSpy{}, &stalenessSpy{}, clock, clock.Timer, "/r", nil)
				if err != nil {
					t.Fatal(err)
				}
				got := caller.Call(context.Background(), call.Step{DailyBudget: &call.DailyBudget{Cost: 20, Spent: spent}, TimeLimit: time.Minute, Warnings: []string{"warning"}}, discard)
				if len(spy.given) != 0 || len(clock.Waits()) != 0 || got.Status != call.Failed || got.Class != call.BudgetExhausted || got.Reason != fmt.Sprintf("the daily budget 20 is spent: %g", spent) || !reflect.DeepEqual(got.Warnings, []string{"warning"}) || !got.Timing.Started.Equal(start) || !got.Timing.Ended.Equal(start) {
					t.Fatalf("result %+v, turns %+v, waits %v; want budget_exhausted and no turn or wait", got, spy.given, clock.Waits())
				}
			})
		}
	}
}

// daily.feature: an exhausted budget prevents capacity retries, with the
// cost limit's reason first where both are spent.
func TestNoRetryStartsOnceTheDayIsSpent(t *testing.T) {
	t.Parallel()
	for _, c := range []struct {
		name, reason string
		cost         float64
		limit        *float64
	}{
		{"daily", "the daily budget 20 is spent: 20.5", 1.5, nil},
		{"both", "the cost limit 1 is spent: 1", 1, dollars(1)},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			clock := clocktest.NewClock(start)
			spy := &runtimeSpy{turn: inOrder(replies(call.Reply{Session: "s1", Cost: dollars(c.cost), Failure: call.Capacity, Reason: busy}), replies(call.Reply{Text: "done"}))}
			var reported capacityTurns
			got := recoveringCaller(t, spy, &stalenessSpy{}, clock).Call(context.Background(), call.Step{CostLimit: c.limit, DailyBudget: &call.DailyBudget{Cost: 20, Spent: 19}}, reported.report)
			if len(spy.given) != 1 || len(clock.Waits()) != 0 || got.Status != call.Failed || got.Class != call.BudgetExhausted || got.Reason != c.reason || !reflect.DeepEqual(got.Cost, dollars(c.cost)) || !reflect.DeepEqual(reported, capacityTurns{{Reason: busy}}) {
				t.Fatalf("result %+v, turns %+v, reports %+v, waits %v; want budget_exhausted, %q and no retry", got, spy.given, reported, clock.Waits(), c.reason)
			}
		})
	}
}
