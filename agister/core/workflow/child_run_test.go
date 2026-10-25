package workflow_test

import (
	"context"
	"errors"
	"maps"
	"reflect"
	"slices"
	"testing"

	"github.com/igor1309/ai-labs/agister/core/workflow"
)

type childRunEvents struct {
	*eventsSpy
	name, definition string
	params, inputs   map[string]string
	end              workflow.ChildEnd
}

func (e *childRunEvents) ChildStarted(step, name string, params, inputs map[string]string) {
	e.tell("%s child started", step)
	e.name, e.definition = step, name
	e.params, e.inputs = maps.Clone(params), maps.Clone(inputs)
}

func (e *childRunEvents) ChildEnded(step string, end workflow.ChildEnd) {
	e.tell("%s child ended", step)
	e.end = end
}

func childRunFixture(t *testing.T) (*itemFixture, *childRunEvents) {
	t.Helper()
	f := newItemFixture(t)
	f.lens.Steps = f.lens.Steps[:1]
	f.lens.Outputs = []workflow.Binding{bind("output", outputs("draft", ""))}
	f.w.Steps = f.w.Steps[:1]
	f.child.resolve = func(given map[string]string) workflow.Boundary {
		return workflow.Boundary{Params: maps.Clone(given), Inputs: map[string]string{}}
	}
	events := &childRunEvents{eventsSpy: f.events}
	runner, err := workflow.New(f.resolver, f.caller, events, f.clock)
	if err != nil {
		t.Fatal(err)
	}
	f.runner = runner
	return f, events
}

func TestACompletedItemIsToldAsStartedThenCompleted(t *testing.T) {
	t.Parallel()
	f, events := childRunFixture(t)
	f.caller.answers["tests/draft"] = itemResult(map[string]any{"verdict": "approve"})
	f.completed(t)
	want := []string{"tests child started", "tests/draft started on ", `tests/draft ended completed "" in 0s`, "tests child ended"}
	if !slices.Equal(events.told, want) {
		t.Fatalf("events %q, want %q", events.told, want)
	}
	if events.name != "tests" || events.definition != "lens" || !reflect.DeepEqual(events.params, map[string]string{"goal": "ship"}) || !reflect.DeepEqual(events.inputs, map[string]string{}) {
		t.Fatalf("start %+v", events)
	}
	if !reflect.DeepEqual(events.end, workflow.ChildEnd{Status: workflow.Completed, Output: map[string]any{"verdict": "approve"}}) {
		t.Fatalf("end %+v", events.end)
	}
}

func TestAFailedItemIsToldAsEndedFailedOfItsStepsClass(t *testing.T) {
	t.Parallel()
	f, events := childRunFixture(t)
	f.caller.answers["tests/draft"] = func() workflow.Result {
		return workflow.Result{Status: workflow.Failed, Class: "runtime_error", Output: map[string]any{"partial": true}}
	}
	got := f.runner.Run(context.Background(), f.w, map[string]string{"goal": "ship"})
	if got.Status != workflow.Failed || !reflect.DeepEqual(events.end, workflow.ChildEnd{Status: workflow.Failed, Class: "runtime_error"}) || events.told[len(events.told)-1] != "tests child ended" {
		t.Fatalf("result %+v, events %+v", got, events)
	}
}

func TestAChildWhoseInputsAreRefusedStillStartsAndEnds(t *testing.T) {
	t.Parallel()
	f, events := childRunFixture(t)
	f.w.Steps[0].Resolver = boundaryResolverFunc(func(context.Context, map[string]string) (workflow.Boundary, error) {
		return workflow.Boundary{}, errors.New("missing child input")
	})
	got := f.run(t)
	if got.Status != workflow.Failed || got.Class != workflow.Refused || got.Reason != "missing child input" {
		t.Fatalf("run %+v", got)
	}
	if !slices.Equal(events.told, []string{"tests child started", "tests child ended"}) || len(f.caller.params) != 0 {
		t.Fatalf("events %v, calls %v", events.told, f.caller.params)
	}
	if events.name != "tests" || events.definition != "lens" || !reflect.DeepEqual(events.params, map[string]string{"goal": "ship"}) || len(events.inputs) != 0 {
		t.Fatalf("start %+v", events)
	}
	if !reflect.DeepEqual(events.end, workflow.ChildEnd{Status: workflow.Failed, Class: workflow.Refused}) {
		t.Fatalf("end %+v", events.end)
	}
}
