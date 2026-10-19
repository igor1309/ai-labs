package claudecode_test

import (
	"context"
	"fmt"
	"reflect"
	"slices"
	"testing"

	"github.com/igor1309/ai-labs/agister/runtime/claudecode"
)

// cost.feature: each turn counts only its own cost, retaining the whole
// report as the session's cost, including unknown and decreasing reports.
func TestATurnCountsItsOwnCost(t *testing.T) {
	t.Parallel()
	for _, c := range []struct {
		name, session, reported   string
		before, cost, sessionCost *float64
	}{
		{"resumed", "s1", `,"total_cost_usd":1.25`, ptr(1.0), ptr(0.25), ptr(1.25)},
		{"new", "", `,"total_cost_usd":0.25`, nil, ptr(0.25), ptr(0.25)},
		{"unknown before", "s1", `,"total_cost_usd":1`, nil, nil, ptr(1.0)},
		{"decreased", "s1", `,"total_cost_usd":1`, ptr(1.5), nil, ptr(1.0)},
		{"not reported", "s1", "", ptr(1.0), nil, nil},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			spy := &supervisorSpy{lines: []string{fmt.Sprintf(`{"type":"result","subtype":"success","session_id":"s1"%s}`, c.reported)}}
			got, err := wrapper(t, spy).Run(context.Background(), claudecode.Turn{Message: "m", Session: c.session, SessionCostBefore: c.before}, discard)
			if err != nil {
				t.Fatal(err)
			}
			if got.Reply == nil || !reflect.DeepEqual(got.Reply.Cost, c.cost) || !reflect.DeepEqual(got.Reply.SessionCost, c.sessionCost) {
				t.Fatalf("reply %+v, want cost %v, session cost %v", got.Reply, c.cost, c.sessionCost)
			}
		})
	}
}

// cost.feature: a budget follows effort; absent budgets add no argument.
func TestATurnPassesItsBudget(t *testing.T) {
	t.Parallel()
	for _, budget := range []*float64{nil, ptr(0.75)} {
		name := "no budget"
		if budget != nil {
			name = "budget 0.75"
		}
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			spy := &supervisorSpy{}
			_, err := wrapper(t, spy).Run(context.Background(), claudecode.Turn{Message: "m", Effort: "high", Budget: budget}, discard)
			if err != nil {
				t.Fatal(err)
			}
			args := spy.asked[0].Args
			at := slices.Index(args, "--max-budget-usd")
			if budget == nil {
				if at != -1 {
					t.Fatalf("unexpected budget in %q", args)
				}
				return
			}
			effort := slices.Index(args, "--effort")
			if at != effort+2 || args[at+1] != "0.75" {
				t.Fatalf("arguments %q, want effort high then budget 0.75", args)
			}
		})
	}
}

// cost.feature, "A turn ended at its budget is budget_exhausted".
func TestATurnEndedAtItsBudgetIsBudgetExhausted(t *testing.T) {
	t.Parallel()
	got := reply(t, &supervisorSpy{lines: []string{initLine, `{"type":"result","subtype":"error_max_budget_usd","is_error":true,"errors":["Reached maximum budget ($0.75)"],"total_cost_usd":0.8}`}}, nil)
	if got.Failure != claudecode.BudgetExhausted || got.Reason != "Reached maximum budget ($0.75)" || got.Cost == nil || *got.Cost != 0.8 || got.SessionCost == nil || *got.SessionCost != 0.8 {
		t.Fatalf("reply %+v, want budget_exhausted, runtime reason, cost and session cost 0.8", got)
	}
}
