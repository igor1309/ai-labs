package workflow_test

import (
	"context"
	"fmt"
	"reflect"
	"slices"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/core/workflow"
)

func TestBranchSelectsTheFirstMatchingArmOrDefault(t *testing.T) {
	t.Parallel()
	for _, c := range []struct {
		code int
		arm  string
	}{{0, "zero"}, {2, "two"}, {1, "other"}} {
		t.Run(c.arm, func(t *testing.T) {
			t.Parallel()
			zero, two := compare(outputs("t", "exit_code"), 0), compare(outputs("t", "exit_code"), 2)
			f := newFixture(t, workflow.Boundary{}, map[string]func() workflow.Result{"t": completes(c.code), c.arm: completes(0)})
			result := f.runner.Run(context.Background(), workflow.Workflow{Steps: []workflow.Step{
				{Name: "t"}, {Name: "b", Branch: []workflow.Step{{Name: "zero", If: &zero}, {Name: "two", If: &two}, {Name: "other"}}},
			}}, nil)
			if result.Status != workflow.Completed || !slices.Equal([]string(f.trail), []string{"resolve", "t", c.arm}) {
				t.Fatalf("result %+v, calls %v", result, f.trail)
			}
			read := fmt.Sprintf("b took %s", c.arm)
			if !strings.HasPrefix(f.events.told[2], read) {
				t.Fatalf("events %v, want %s", f.events.told, read)
			}
			if c.code == 1 && !strings.Contains(f.events.told[2], "zero false map[steps.t.outputs.exit_code:1]") {
				t.Fatalf("events %v", f.events.told)
			}
		})
	}
}

func TestBranchStopsReadingAfterTheFirstMatch(t *testing.T) {
	t.Parallel()
	condition := present(outputs("t", "exit_code"))
	f := newFixture(t, workflow.Boundary{}, map[string]func() workflow.Result{"t": completes(1), "one": completes(0)})
	result := f.runner.Run(context.Background(), workflow.Workflow{Steps: []workflow.Step{
		{Name: "t"}, {Name: "b", Branch: []workflow.Step{{Name: "one", If: &condition}, {Name: "two", If: &condition}, {Name: "other"}}},
	}}, nil)
	if result.Status != workflow.Completed || !slices.Equal([]string(f.trail), []string{"resolve", "t", "one"}) {
		t.Fatalf("result %+v, calls %v", result, f.trail)
	}
	if want := "b took one [{one true map[steps.t.outputs.exit_code:1]}]"; f.events.told[2] != want {
		t.Fatalf("event %s, want %s", f.events.told[2], want)
	}
}

func TestBranchMapsItsArmsOutputAndPropagatesFailure(t *testing.T) {
	t.Parallel()
	for _, status := range []workflow.Status{workflow.Completed, workflow.Failed, workflow.Interrupted} {
		t.Run(string(status), func(t *testing.T) {
			t.Parallel()
			f := newFixture(t, workflow.Boundary{}, map[string]func() workflow.Result{
				"d": func() workflow.Result {
					return workflow.Result{Status: status, Class: "runtime_error", Output: map[string]any{"s": "done"}}
				}, "j": completes(0),
			})
			result := f.runner.Run(context.Background(), workflow.Workflow{Steps: []workflow.Step{
				{Name: "b", Branch: []workflow.Step{{Name: "d", Outputs: []workflow.Binding{bind("summary", outputs("d", "s"))}}}},
				{Name: "j", Bindings: []workflow.Binding{bind("x", outputs("b", "summary"))}},
			}}, nil)
			if status == workflow.Completed {
				if result.Status != workflow.Completed || !reflect.DeepEqual(f.caller.bound["j"], map[string]string{"x": "done"}) {
					t.Fatalf("result %+v, bindings %v", result, f.caller.bound)
				}
			} else if result.Status != status || result.Class != "runtime_error" || !slices.Equal([]string(f.trail), []string{"resolve", "d"}) {
				t.Fatalf("result %+v, calls %v", result, f.trail)
			}
		})
	}
}

func TestBranchArmMayBeARepeat(t *testing.T) {
	t.Parallel()
	f := newFixture(t, workflow.Boundary{}, map[string]func() workflow.Result{"review/1": func() workflow.Result {
		return workflow.Result{Status: workflow.Completed, Output: map[string]any{"done": true}}
	}})
	condition := compare(outputs("review", "done"), true)
	result := f.runner.Run(context.Background(), workflow.Workflow{Steps: []workflow.Step{
		{Name: "b", Branch: []workflow.Step{{Name: "fix", Repeat: &workflow.Repeat{Steps: []workflow.Step{{Name: "review"}}, Next: []workflow.Binding{bind("review", outputs("review", ""))}, Until: condition, Max: 2}, Outputs: []workflow.Binding{bind("summary", outputs("fix", "state", "review"))}}}},
	}, Outputs: []workflow.Binding{bind("summary", outputs("b", "summary"))}}, nil)
	if result.Status != workflow.Completed || !reflect.DeepEqual(result.Output, map[string]any{"summary": map[string]any{"done": true}}) {
		t.Fatalf("result %+v", result)
	}
}
