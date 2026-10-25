package workflow_test

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"maps"
	"reflect"
	"slices"
	"testing"

	"github.com/igor1309/ai-labs/agister/core/workflow"
)

type childResolver struct {
	asked   []map[string]string
	resolve func(map[string]string) workflow.Boundary
}

func (r *childResolver) Resolve(_ context.Context, given map[string]string) (workflow.Boundary, error) {
	r.asked = append(r.asked, maps.Clone(given))
	return r.resolve(given), nil
}

type boundaryResolverFunc func(context.Context, map[string]string) (workflow.Boundary, error)

func (f boundaryResolverFunc) Resolve(ctx context.Context, given map[string]string) (workflow.Boundary, error) {
	return f(ctx, given)
}

func TestCancellationWhileWorkflowInputsResolveEndsInterruptedCancelled(t *testing.T) {
	t.Parallel()
	for _, where := range []string{"root", "item", "parallel item"} {
		t.Run(where, func(t *testing.T) {
			t.Parallel()
			f := newItemFixture(t)
			ctx, cancel := context.WithCancel(context.Background())
			resolving := make(chan struct{})
			resolver := boundaryResolverFunc(func(ctx context.Context, _ map[string]string) (workflow.Boundary, error) {
				close(resolving)
				<-ctx.Done()
				return workflow.Boundary{}, errors.New("revision lookup ended")
			})
			if where == "root" {
				var err error
				f.runner, err = workflow.New(resolver, f.caller, f.events, f.clock)
				if err != nil {
					t.Fatal(err)
				}
			} else {
				f.w.Steps[0].Resolver = resolver
				if where == "parallel item" {
					f.w.Steps[0] = workflow.Step{Name: "reviews", Parallel: []workflow.Step{f.w.Steps[0]}}
				}
			}
			done := make(chan workflow.Result, 1)
			finished := make(chan struct{})
			go func() {
				defer close(finished)
				done <- f.runner.Run(ctx, f.w, nil)
			}()
			t.Cleanup(func() { cancel(); <-finished })
			<-resolving
			cancel()
			got := <-done
			if got.Status != workflow.Interrupted || got.Class != workflow.Cancelled || got.Output != nil {
				t.Fatalf("run %+v, want interrupted, cancelled, no output", got)
			}
			// Input resolution belongs to the child's execution, so cancellation ends its lifecycle.
			var wantEvents []string
			if where != "root" {
				wantEvents = []string{"tests child lens started", `tests child ended interrupted "cancelled"`}
			}
			if len(f.caller.params) != 0 || !slices.Equal(f.events.told, wantEvents) {
				t.Fatalf("calls %v, events %v, want no calls and %v", f.caller.params, f.events.told, wantEvents)
			}
		})
	}
}

type itemFixture struct {
	*fixture
	child *childResolver
	lens  *workflow.Workflow
	w     workflow.Workflow
}

func itemResult(output map[string]any) func() workflow.Result {
	return func() workflow.Result {
		return workflow.Result{Status: workflow.Completed, Output: output, Cost: new(float64)}
	}
}

func newItemFixture(t *testing.T) *itemFixture {
	t.Helper()
	f := newFixture(t, workflow.Boundary{Params: map[string]string{"goal": "ship", "depth": "outer"}}, map[string]func() workflow.Result{
		"tests/draft":  itemResult(map[string]any{"text": "t"}),
		"tests/polish": itemResult(map[string]any{"verdict": "approve"}),
		"judge":        itemResult(map[string]any{}),
	})
	child := &childResolver{resolve: func(given map[string]string) workflow.Boundary {
		params := maps.Clone(given)
		if _, ok := params["depth"]; !ok {
			params["depth"] = "2"
		}
		return workflow.Boundary{Params: params, Inputs: map[string]workflow.Input{}}
	}}
	lens := &workflow.Workflow{Steps: []workflow.Step{
		{Name: "draft", Bindings: []workflow.Binding{bind("g", param("goal"))}},
		{Name: "polish", Bindings: []workflow.Binding{bind("d", param("depth")), bind("r", outputs("draft", "text"))}},
	}, Outputs: []workflow.Binding{bind("output", outputs("polish", ""))}}
	return &itemFixture{fixture: f, child: child, lens: lens, w: workflow.Workflow{Steps: []workflow.Step{
		{Name: "tests", Bindings: []workflow.Binding{bind("goal", param("goal"))}, Workflow: lens, Resolver: child, WorkflowName: "lens"},
		{Name: "judge", Bindings: []workflow.Binding{bind("reviews", outputs("tests", ""))}},
	}}}
}

func (f *itemFixture) run(t *testing.T) workflow.Result {
	t.Helper()
	return f.runner.Run(context.Background(), f.w, map[string]string{"goal": "ship"})
}

func (f *itemFixture) completed(t *testing.T) workflow.Result {
	t.Helper()
	got := f.run(t)
	if got.Status != workflow.Completed {
		t.Fatalf("run: %+v", got)
	}
	return got
}

func assertItemCalls(t *testing.T, f *itemFixture, names ...string) {
	t.Helper()
	want := append(trail{"resolve"}, names...)
	if !slices.Equal(f.trail, want) {
		t.Fatalf("calls %v, want %v", f.trail, want)
	}
}

func TestTheItemsStepsRunInOrderEachWithItsBindings(t *testing.T) {
	t.Parallel()
	f := newItemFixture(t)
	f.completed(t)
	assertItemCalls(t, f, "tests/draft", "tests/polish", "judge")
	if !reflect.DeepEqual(f.caller.bound["tests/draft"], map[string]string{"g": "ship"}) || !reflect.DeepEqual(f.caller.bound["tests/polish"], map[string]string{"d": "2", "r": "t"}) {
		t.Fatalf("bindings %v", f.caller.bound)
	}
	if f.caller.declared["tests/draft"] != "tests/draft" || f.caller.declared["tests/polish"] != "tests/polish" {
		t.Fatalf("declared %v", f.caller.declared)
	}
}

func TestAWorkflowItemsOutputShapeDependsOnItsOutputNames(t *testing.T) {
	t.Parallel()
	for _, c := range []struct {
		name     string
		bindings []workflow.Binding
		want     string
	}{
		{"one output", []workflow.Binding{bind("output", outputs("polish", ""))}, `{"verdict":"approve"}`},
		{"one other name", []workflow.Binding{bind("verdict", outputs("polish", "verdict"))}, `{"verdict":"approve"}`},
		{"output and another", []workflow.Binding{bind("output", outputs("polish", "")), bind("text", outputs("draft", "text"))}, `{"output":{"verdict":"approve"},"text":"t"}`},
		{"other names", []workflow.Binding{bind("verdict", outputs("polish", "verdict")), bind("text", outputs("draft", "text"))}, `{"text":"t","verdict":"approve"}`},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			f := newItemFixture(t)
			f.lens.Outputs = c.bindings
			f.completed(t)
			if got := f.caller.bound["judge"]["reviews"]; got != c.want {
				t.Fatalf("judge reads %s, want %s", got, c.want)
			}
		})
	}
}

func TestTheItemsInputsResolveOverTheParamsItBound(t *testing.T) {
	t.Parallel()
	f := newItemFixture(t)
	f.child.resolve = func(given map[string]string) workflow.Boundary {
		if len(f.caller.params) != 0 {
			t.Error("child inputs resolved after a call")
		}
		return workflow.Boundary{Params: map[string]string{"goal": given["goal"], "depth": "2"}, Inputs: map[string]workflow.Input{"rev": {Value: "rev-of-" + given["goal"]}}}
	}
	f.lens.Steps[0].Bindings = []workflow.Binding{bind("g", input("rev"))}
	f.completed(t)
	if !reflect.DeepEqual(f.child.asked, []map[string]string{{"goal": "ship"}}) || f.caller.bound["tests/draft"]["g"] != "rev-of-ship" || f.caller.bound["tests/polish"]["d"] != "2" {
		t.Fatalf("resolved %v, calls %v", f.child.asked, f.caller.bound)
	}
}

func TestTheItemsStepsReadOnlyItsOwnBoundaryAndOutputs(t *testing.T) {
	t.Parallel()
	f := newItemFixture(t)
	f.w.Steps = append([]workflow.Step{{Name: "draft"}}, f.w.Steps...)
	f.caller.answers["draft"] = itemResult(map[string]any{"text": "outer"})
	f.caller.answers["tests/draft"] = itemResult(map[string]any{"text": "inner"})
	f.completed(t)
	if f.caller.bound["tests/polish"]["r"] != "inner" || f.caller.bound["tests/polish"]["d"] != "2" {
		t.Fatalf("polish %v", f.caller.bound["tests/polish"])
	}
}

func TestASessionContinuedInsideTheItemIsTheItemsOwn(t *testing.T) {
	t.Parallel()
	f := newItemFixture(t)
	f.w.Steps = append([]workflow.Step{{Name: "draft"}}, f.w.Steps...)
	f.caller.answers["draft"] = func() workflow.Result { return workflow.Result{Status: workflow.Completed, Session: "outer"} }
	f.caller.answers["tests/draft"] = func() workflow.Result {
		return workflow.Result{Status: workflow.Completed, Session: "inner", Output: map[string]any{"text": "t"}}
	}
	f.lens.Steps[1].Session = "draft"
	got := f.completed(t)
	if f.caller.sessions["tests/polish"] != "inner" || got.Sessions["tests/draft"] != "inner" || got.Sessions["draft"] != "outer" {
		t.Fatalf("sessions passed %v, counted %v", f.caller.sessions, got.Sessions)
	}
}

func TestARepeatInsideTheItemIsToldByTheItemAndItsPass(t *testing.T) {
	t.Parallel()
	f := newItemFixture(t)
	debate := workflow.Step{Name: "debate", Repeat: &workflow.Repeat{Steps: []workflow.Step{{Name: "revise"}}, Max: 2, Until: workflow.Condition{Operator: "equals", Reads: *outputs("revise", "done").Reads, Equals: true}}}
	f.lens.Steps = []workflow.Step{f.lens.Steps[0], debate, f.lens.Steps[1]}
	f.caller.answers["tests/revise/1"] = itemResult(map[string]any{"done": false})
	f.caller.answers["tests/revise/2"] = itemResult(map[string]any{"done": true})
	f.completed(t)
	assertItemCalls(t, f, "tests/draft", "tests/revise/1", "tests/revise/2", "tests/polish", "judge")
	for _, step := range []string{"tests/revise/1", "tests/revise/2"} {
		if f.caller.declared[step] != "tests/revise" {
			t.Fatalf("declared %v", f.caller.declared)
		}
	}
	if !slices.Contains(f.events.told, "tests/debate stopped until after 2") {
		t.Fatalf("events %v", f.events.told)
	}
}

func TestAnItemStepThatDoesNotCompleteEndsTheRun(t *testing.T) {
	t.Parallel()
	for _, status := range []workflow.Status{workflow.Failed, workflow.Interrupted, "lost"} {
		t.Run(string(status), func(t *testing.T) {
			t.Parallel()
			f := newItemFixture(t)
			f.caller.answers["tests/draft"] = func() workflow.Result {
				return workflow.Result{Status: status, Class: "runtime_error", Reason: "draft failed"}
			}
			got := f.run(t)
			assertItemCalls(t, f, "tests/draft")
			if got.Status != status || got.Class != "runtime_error" || got.Reason != "draft failed" || got.Output != nil {
				t.Fatalf("run %+v", got)
			}
		})
	}
}

func (f *itemFixture) parallel(max int, more bool) {
	children := []workflow.Step{{Name: "arch"}, f.w.Steps[0]}
	f.caller.answers["arch"] = itemResult(map[string]any{"arch": true})
	if more {
		children = append(children, workflow.Step{Name: "intent"})
		f.caller.answers["intent"] = itemResult(map[string]any{"intent": true})
	}
	f.w.Steps = []workflow.Step{{Name: "reviews", Parallel: children, Max: max}, {Name: "judge", Bindings: []workflow.Binding{bind("reviews", outputs("reviews", ""))}}}
}

func itemOutcomes(t *testing.T, f *itemFixture) []map[string]any {
	t.Helper()
	var outcomes []map[string]any
	if err := json.Unmarshal([]byte(f.caller.bound["judge"]["reviews"]), &outcomes); err != nil {
		t.Fatal(err)
	}
	return outcomes
}

func TestAWorkflowItemInAParallelRunsBesideItsSteps(t *testing.T) {
	t.Parallel()
	f := newItemFixture(t)
	f.parallel(1, true)
	f.completed(t)
	assertItemCalls(t, f, "arch", "tests/draft", "tests/polish", "intent", "judge")
	want := []map[string]any{
		{"status": "completed", "class": nil, "output": map[string]any{"arch": true}},
		{"status": "completed", "class": nil, "output": map[string]any{"verdict": "approve"}},
		{"status": "completed", "class": nil, "output": map[string]any{"intent": true}},
	}
	if got := itemOutcomes(t, f); !reflect.DeepEqual(got, want) {
		t.Fatalf("outcomes %v, want %v", got, want)
	}
}

func TestAWorkflowItemInAParallelThatDoesNotCompleteIsItsSlotsFailure(t *testing.T) {
	t.Parallel()
	f := newItemFixture(t)
	f.parallel(0, false)
	f.caller.answers["tests/draft"] = func() workflow.Result { return workflow.Result{Status: workflow.Failed, Class: "runtime_error"} }
	f.completed(t)
	got := itemOutcomes(t, f)
	if len(got) != 2 || !reflect.DeepEqual(got[1], map[string]any{"status": "failed", "class": "runtime_error", "output": nil}) {
		t.Fatalf("outcomes %v", got)
	}
	if _, ok := f.caller.bound["tests/polish"]; ok {
		t.Fatal("polish called after failure")
	}
}

func TestTheRunsCostAndUsageCountTheItemsCalls(t *testing.T) {
	t.Parallel()
	for _, parallel := range []bool{false, true} {
		t.Run(map[bool]string{false: "sequence", true: "parallel"}[parallel], func(t *testing.T) {
			t.Parallel()
			f := newItemFixture(t)
			if parallel {
				f.parallel(0, false)
			}
			for _, step := range []string{"tests/draft", "tests/polish"} {
				answer := f.caller.answers[step]
				f.caller.answers[step] = func() workflow.Result {
					r := answer()
					cost, tokens := 0.5, int64(10)
					r.Cost = &cost
					r.Usage.Input = &tokens
					r.Warnings = []string{step}
					return r
				}
			}
			got := f.completed(t)
			if got.Cost == nil || *got.Cost != 1 || got.Usage.Input == nil || *got.Usage.Input != 20 || !slices.Equal(got.Warnings, []string{"tests/draft", "tests/polish"}) {
				t.Fatalf("accounting %+v", got)
			}
		})
	}
}

func TestParallelWarningsFollowDeclarationOrderAcrossStepsAndWorkflowItems(t *testing.T) {
	t.Parallel()
	for _, max := range []int{0, 1, 2} {
		t.Run(fmt.Sprintf("max %d", max), func(t *testing.T) {
			t.Parallel()
			f := newItemFixture(t)
			f.parallel(max, true)
			want := []string{"arch", "tests/draft", "tests/polish", "intent"}
			archDone := make(chan struct{})
			for i, step := range want {
				answer := f.caller.answers[step]
				f.caller.answers[step] = func() workflow.Result {
					if step == "arch" {
						defer close(archDone)
					} else if step == "tests/draft" {
						<-archDone
					}
					r := answer()
					cost, tokens := float64(i+1), int64(i+1)
					r.Cost, r.Usage.Input = &cost, &tokens
					r.Session = step + "-session"
					r.Warnings = []string{step}
					return r
				}
			}
			got := f.completed(t)
			if !slices.Equal(got.Warnings, want) {
				t.Errorf("warnings %v, want %v", got.Warnings, want)
			}
			if got.Cost == nil || *got.Cost != 10 || got.Usage.Input == nil || *got.Usage.Input != 10 {
				t.Errorf("accounting %+v, want cost 10 and input usage 10", got)
			}
			for _, step := range want {
				if got.Sessions[step] != step+"-session" {
					t.Errorf("sessions %v lack %s's session", got.Sessions, step)
				}
			}
		})
	}
}
