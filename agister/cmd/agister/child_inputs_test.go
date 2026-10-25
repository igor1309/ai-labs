package main

import (
	"context"
	"errors"
	"maps"
	"reflect"
	"testing"

	"github.com/igor1309/ai-labs/agister/cli"
	"github.com/igor1309/ai-labs/agister/core/inputs"
	"github.com/igor1309/ai-labs/agister/core/workflow"
	"github.com/igor1309/ai-labs/agister/runstore"
	"github.com/igor1309/ai-labs/gokit/clocktest"
)

func TestChildInputCapturePreservesTheResolutionAndKeepsItsOwnSnapshot(t *testing.T) {
	t.Parallel()
	declared := inputs.Declared{Params: []inputs.Param{{Name: "goal"}}}
	given := map[string]string{"goal": "ship"}
	resolved := inputs.Resolved{
		Params: given,
		Inputs: map[string]inputs.Fixed{"brief": {Value: "ship", Identity: "digest"}},
	}
	spy := &inputsSpy{resolved: resolved}
	capture := &childInputCapture{inputs: spy}
	got, err := capture.Resolve(context.Background(), declared, given)
	if err != nil || !reflect.DeepEqual(got, resolved) {
		t.Fatalf("resolution %+v, %v; want %+v", got, err, resolved)
	}
	if !reflect.DeepEqual(spy.declared, []inputs.Declared{declared}) || !reflect.DeepEqual(spy.given, []map[string]string{given}) {
		t.Fatalf("resolved %+v over %v", spy.declared, spy.given)
	}
	got.Inputs["brief"] = inputs.Fixed{Value: "changed", Identity: "changed"}
	want := []runstore.Input{{Name: "brief", Value: "ship", Identity: "digest"}}
	if kept := capture.recorded(); !reflect.DeepEqual(kept, want) {
		t.Fatalf("captured %+v, want %+v", kept, want)
	}
	kept := capture.recorded()
	kept[0].Identity = "changed by recorder"
	if got := capture.recorded(); !reflect.DeepEqual(got, want) {
		t.Fatalf("recorder changed capture: %+v, want %+v", got, want)
	}

	refusal := errors.New("input refused")
	spy.err = refusal
	got, err = capture.Resolve(context.Background(), declared, given)
	if !errors.Is(err, refusal) || !reflect.DeepEqual(got, spy.resolved) {
		t.Fatalf("refusal %+v, %v; want %+v, %v", got, err, spy.resolved, refusal)
	}
	if kept := capture.recorded(); !reflect.DeepEqual(kept, []runstore.Input{}) {
		t.Fatalf("refused inputs %+v, want empty", kept)
	}
}

// Integrates the child resolver observers and recording with input and store spies.
func TestChildResolversCaptureIdentitiesForTheirOwnRecordedStarts(t *testing.T) {
	t.Parallel()
	store := &storeSpy{}
	record, err := newRunRecord(store, clocktest.NewClock(recordStart), recordID, recordStart, cli.Request{Workflow: "reviews"}, nil, nil, "/r", "/r")
	if err != nil {
		t.Fatal(err)
	}
	w := workflow.Workflow{Steps: []workflow.Step{
		{Name: "reviews", Parallel: []workflow.Step{
			{Name: "tests", Workflow: &workflow.Workflow{}},
			{Name: "architecture", Workflow: &workflow.Workflow{Steps: []workflow.Step{
				{Name: "tests", Workflow: &workflow.Workflow{}},
			}}},
		}},
	}}
	declared := inputs.Declared{Params: []inputs.Param{{Name: "goal"}}}
	boundaries := map[string]inputs.Declared{
		"tests": declared, "architecture": declared, "architecture/tests": declared,
	}
	spy := &inputsSpy{}
	record.childInputs = attachWorkflowResolvers(&w, boundaries, spy)
	children := []workflow.Step{w.Steps[0].Parallel[0], w.Steps[0].Parallel[1], w.Steps[0].Parallel[1].Workflow.Steps[0]}
	paths := []string{"tests", "architecture", "architecture/tests"}
	for pass := range 3 {
		want := make([][]runstore.Input, len(children))
		for i, child := range children {
			given := map[string]string{"goal": paths[i]}
			spy.resolved = inputs.Resolved{Params: maps.Clone(given), Inputs: map[string]inputs.Fixed{
				"revision": {Value: paths[i], Identity: "commit-of-" + paths[i]},
				"brief":    {Value: "same text", Identity: "digest-of-" + paths[i]},
			}}
			spy.err = nil
			if pass == 1 {
				spy.err = errors.New("input refused")
			}
			got, err := child.Resolver.Resolve(context.Background(), given)
			want[i] = []runstore.Input{
				{Name: "brief", Value: "same text", Identity: "digest-of-" + paths[i]},
				{Name: "revision", Value: paths[i], Identity: "commit-of-" + paths[i]},
			}
			if pass == 1 {
				if !errors.Is(err, spy.err) {
					t.Fatalf("%s refusal %v, want %v", paths[i], err, spy.err)
				}
				want[i] = []runstore.Input{}
			} else if err != nil || !reflect.DeepEqual(got, workflow.Boundary{Params: given, Inputs: map[string]string{"brief": "same text", "revision": paths[i]}}) {
				t.Fatalf("%s boundary %+v, %v", paths[i], got, err)
			}
		}
		// Siblings can resolve before either reports its start. The same
		// observer then serves subsequent passes, including a refused pass.
		for i := len(children) - 1; i >= 0; i-- {
			step := paths[i]
			switch pass {
			case 1:
				step += "/2"
			case 2:
				step += "/3/1"
			}
			record.ChildStarted(step, "lens", map[string]string{"goal": paths[i]}, nil)
			last := store.last(t)
			child := last.Children[len(last.Children)-1]
			_, _, events := store.given()
			event := events[len(events)-1].event
			if child.ID != recordID+"/"+step || !reflect.DeepEqual(child.Inputs, want[i]) {
				t.Errorf("child %+v, want %s inputs %+v", child, step, want[i])
			}
			if event.Step != step || event.Kind != runstore.ChildStarted || !reflect.DeepEqual(event.Inputs, want[i]) {
				t.Errorf("start %+v, want %s inputs %+v", event, step, want[i])
			}
		}
	}
}
