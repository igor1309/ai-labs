package workflow_test

import (
	"context"
	"fmt"
	"reflect"
	"testing"

	"github.com/igor1309/ai-labs/agister/core/workflow"
)

// No join starts without a completed node, with or without a concurrency
// bound; every node still ends and contributes its cost and warnings.
func TestAParallelWithNoCompletedNodeStopsBeforeTheJoin(t *testing.T) {
	t.Parallel()
	for _, max := range []int{0, 1, 2} {
		t.Run(fmt.Sprint(max), func(t *testing.T) {
			t.Parallel()
			cost := 1.0
			f := newFixture(t, workflow.Boundary{}, map[string]func() workflow.Result{
				"a": func() workflow.Result {
					return workflow.Result{Status: workflow.Failed, Class: "capacity", Reason: "busy", Cost: &cost, Warnings: []string{"a failed"}}
				},
				"b": func() workflow.Result {
					return workflow.Result{Status: workflow.Interrupted, Class: "timeout", Cost: &cost, Warnings: []string{"b failed"}}
				},
			})
			got := f.runner.Run(context.Background(), workflow.Workflow{Steps: []workflow.Step{
				bounded("p", max, workflow.Step{Name: "a"}, workflow.Step{Name: "b"}), {Name: "j"},
			}}, nil)
			if got.Status != workflow.Failed || got.Class != "capacity" || got.Reason != `no step of parallel "p" completed: busy` ||
				got.Cost == nil || *got.Cost != 2 || !reflect.DeepEqual(got.Warnings, []string{"a failed", "b failed"}) {
				t.Errorf("result %+v; want failed, capacity, both calls counted, no join", got)
			}
		})
	}
}
