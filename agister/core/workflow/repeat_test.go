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

func repairRepeat() workflow.Step {
	return workflow.Step{Name: "r", Repeat: &workflow.Repeat{
		State: []workflow.Binding{bind("code", param("start"))},
		Steps: []workflow.Step{{Name: "fix", Bindings: []workflow.Binding{bind("c", state("code"))}}, {Name: "test"}},
		Next:  []workflow.Binding{bind("code", outputs("test", "exit_code"))}, Until: compare(state("code"), 0), Max: 3,
	}}
}

func state(name string) workflow.Value {
	return workflow.Value{Reads: &workflow.Reference{Of: workflow.State, Name: name}}
}

func TestRepeatRunsBodyBeforeItsConditionAndCountsEveryCall(t *testing.T) {
	t.Parallel()
	for _, c := range []struct {
		codes          []int
		start, stopped string
	}{
		{[]int{0}, "1", "until"}, {[]int{1, 0}, "1", "until"}, {[]int{1, 1, 1}, "1", "max"},
		{[]int{0}, "0", "until"}, {[]int{2, 0}, "1", "until"},
	} {
		t.Run(fmt.Sprint(c), func(t *testing.T) {
			t.Parallel()
			answers := map[string]func() workflow.Result{}
			var want []string
			for i, code := range c.codes {
				pass := i + 1
				cost, tokens := 0.5, int64(10)
				answers[fmt.Sprintf("fix/%d", pass)] = func() workflow.Result {
					return workflow.Result{Status: workflow.Completed, Cost: &cost, Usage: workflow.Usage{Input: &tokens}, Warnings: []string{"fix"}, Session: fmt.Sprint(pass)}
				}
				answers[fmt.Sprintf("test/%d", pass)] = func() workflow.Result {
					return workflow.Result{Status: workflow.Completed, Output: map[string]any{"exit_code": code}, Cost: new(float64)}
				}
				want = append(want, fmt.Sprintf("fix/%d", pass), fmt.Sprintf("test/%d", pass))
			}
			f := newFixture(t, workflow.Boundary{Params: map[string]string{"start": c.start}}, answers)
			result := f.runner.Run(context.Background(), workflow.Workflow{Steps: []workflow.Step{repairRepeat()}, Outputs: []workflow.Binding{bind("repeat", outputs("r", ""))}}, nil)
			passes := len(c.codes)
			output := map[string]any{"repeat": map[string]any{"state": map[string]any{"code": c.codes[passes-1]}, "stopped": c.stopped, "passes": passes}}
			if result.Status != workflow.Completed || !reflect.DeepEqual(result.Output, output) {
				t.Fatalf("result %+v, want %v", result, output)
			}
			if !slices.Equal([]string(f.trail)[1:], want) {
				t.Fatalf("calls %v, want %v", f.trail, want)
			}
			for i := range c.codes {
				name := fmt.Sprintf("fix/%d", i+1)
				code := c.start
				if i > 0 {
					code = fmt.Sprint(c.codes[i-1])
				}
				if f.caller.bound[name]["c"] != code || result.Sessions[name] != fmt.Sprint(i+1) {
					t.Errorf("call %s bound %v, sessions %v", name, f.caller.bound[name], result.Sessions)
				}
				if !slices.Contains(f.events.told, fmt.Sprintf("r pass %d map[code:%d]", i+1, c.codes[i])) {
					t.Errorf("events %v", f.events.told)
				}
				if !slices.Contains(f.events.told, name+" started on ") {
					t.Errorf("events %v, want qualified start", f.events.told)
				}
			}
			if !slices.Contains(f.events.told, fmt.Sprintf("r stopped %s after %d", c.stopped, passes)) {
				t.Errorf("events %v", f.events.told)
			}
			if result.Cost == nil || *result.Cost != float64(passes)*0.5 || result.Usage.Input == nil || *result.Usage.Input != int64(passes)*10 || len(result.Warnings) != passes {
				t.Errorf("accounting %+v", result)
			}
		})
	}
}

func TestRepeatPropagatesABodyFailureWithoutStartingLaterItems(t *testing.T) {
	t.Parallel()
	f := newFixture(t, workflow.Boundary{Params: map[string]string{"start": "1"}}, map[string]func() workflow.Result{
		"fix/1": completes(0), "test/1": completes(1), "fix/2": ends(workflow.Failed, "runtime_error", 0),
	})
	result := f.runner.Run(context.Background(), workflow.Workflow{Steps: []workflow.Step{repairRepeat(), {Name: "after"}}}, nil)
	if result.Status != workflow.Failed || result.Class != "runtime_error" || !slices.Equal([]string(f.trail), []string{"resolve", "fix/1", "test/1", "fix/2"}) {
		t.Fatalf("result %+v, calls %v", result, f.trail)
	}
	for _, event := range f.events.told {
		if strings.Contains(event, "stopped") || strings.Contains(event, "pass 2") {
			t.Errorf("event %s after failure", event)
		}
	}
}

func TestNestedRepeatsNameEveryPassAndKeepTheirOutputsLocal(t *testing.T) {
	t.Parallel()
	outer := repairRepeat()
	outer.Repeat.Steps = append(outer.Repeat.Steps, workflow.Step{Name: "inner", Repeat: &workflow.Repeat{Steps: []workflow.Step{{Name: "lint"}}, Until: compare(outputs("lint", "done"), true), Max: 2}})
	answers := map[string]func() workflow.Result{"fix/1": completes(0), "fix/2": completes(0), "test/1": completes(1), "test/2": completes(0)}
	for _, name := range []string{"lint/1/1", "lint/1/2", "lint/2/1", "lint/2/2"} {
		answers[name] = completes(0)
	}
	f := newFixture(t, workflow.Boundary{Params: map[string]string{"start": "1"}}, answers)
	result := f.runner.Run(context.Background(), workflow.Workflow{Steps: []workflow.Step{outer}}, nil)
	want := []string{"resolve", "fix/1", "test/1", "lint/1/1", "lint/1/2", "fix/2", "test/2", "lint/2/1", "lint/2/2"}
	if result.Status != workflow.Completed || !slices.Equal([]string(f.trail), want) {
		t.Fatalf("result %+v, calls %v", result, f.trail)
	}
	for _, name := range []string{"inner/1", "inner/2"} {
		if !slices.Contains(f.events.told, name+" stopped max after 2") {
			t.Errorf("events %v", f.events.told)
		}
	}
}

func TestRepeatCanRunABranchAndAParallel(t *testing.T) {
	t.Parallel()
	condition := compare(state("code"), "1")
	repeat := repairRepeat()
	repeat.Repeat.Steps = []workflow.Step{
		{Name: "choose", Branch: []workflow.Step{{Name: "p", If: &condition, Parallel: []workflow.Step{{Name: "a"}, {Name: "b"}}, Outputs: []workflow.Binding{bind("ends", outputs("p", ""))}}, {Name: "unused"}}},
		{Name: "test", Bindings: []workflow.Binding{bind("ends", outputs("choose", "ends"))}},
	}
	f := newFixture(t, workflow.Boundary{Params: map[string]string{"start": "1"}}, map[string]func() workflow.Result{"a/1": completes(3), "b/1": completes(4), "test/1": completes(0)})
	result := f.runner.Run(context.Background(), workflow.Workflow{Steps: []workflow.Step{repeat}}, nil)
	if result.Status != workflow.Completed || f.caller.bound["test/1"]["ends"] != `[{"class":null,"output":{"exit_code":3},"status":"completed"},{"class":null,"output":{"exit_code":4},"status":"completed"}]` {
		t.Fatalf("result %+v, params %v", result, f.caller.bound)
	}
	if !slices.Contains(f.events.told, "choose/1 took p [{p true map[state.code:1]}]") {
		t.Errorf("events %v", f.events.told)
	}
}
