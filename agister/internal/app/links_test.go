package app_test

import (
	"context"
	"encoding/json"
	"reflect"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/contract"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

// A run records the goal it serves and the judgement it answers by
// reference to the runs that hold them (ADR-026 rules 2 and 6), read from
// those runs' records as it starts; nothing is found by searching runs.

// earlierRuns gives runs the earlier runs a call may name: run-g, whose
// goal is kept as an artifact, its brief inline, and its lists of files
// inline, as a provider resolves one and as a record read back from JSON
// holds one, run-old, recorded
// before inputs were kept, run-j, completed, run-f, failed, and run-r,
// still running.
func earlierRuns(runs *runsSpy) *run.Artifact {
	artifact := runs.store("run-g", "input-goal.txt", []byte(longText))
	completed := &run.Result{Status: run.Completed}
	for id, earlier := range map[string]struct {
		record run.Record
		state  run.State
	}{
		"run-g": {run.Record{ID: "run-g", Inputs: []run.Input{
			{Name: "goal", Source: "file", Identity: artifact.Digest, Artifact: &artifact},
			{Name: "brief", Source: "file", Identity: "sha256:" + sha("a short brief"), Value: "a short brief"},
			{Name: "changed", Source: "git.changed_files", Identity: "sha256:" + sha("a.go\nb.go"), Value: []string{"a.go", "b.go"}},
			{Name: "files", Source: "git.changed_files", Identity: "sha256:" + sha("c.go\nd.go"), Value: []any{"c.go", "d.go"}},
		}, Result: completed}, run.StateFinished},
		"run-old": {run.Record{ID: "run-old", Inputs: []run.Input{{Name: "goal", Source: "file", Identity: "sha256:" + sha(longText)}}, Result: completed}, run.StateFinished},
		"run-j":   {run.Record{ID: "run-j", Result: completed}, run.StateFinished},
		"run-f":   {run.Record{ID: "run-f", Result: &run.Result{Status: run.Failed, Error: run.Fault(run.ClassInvalidOutput, "no output")}}, run.StateFinished},
		"run-r":   {run.Record{ID: "run-r"}, run.StateRunning},
	} {
		runs.records[id], runs.states[id] = earlier.record, earlier.state
	}
	return &artifact
}

// --goal records the goal's run, input and digest, and the artifact that
// keeps its bytes, the input goal when it names none; --answers records
// the run whose judgement the call answers.
func TestARunRecordsTheGoalItServesAndTheJudgementItAnswers(t *testing.T) {
	t.Parallel()
	for name, test := range map[string]struct {
		goal, answers string
		want          func(artifact *run.Artifact) *run.Links
	}{
		"the goal input": {goal: "run-g", want: func(artifact *run.Artifact) *run.Links {
			return &run.Links{Goal: &run.GoalLink{Run: "run-g", Input: "goal", Digest: "sha256:" + sha(longText), Artifact: artifact}}
		}},
		"an input kept inline": {goal: "run-g:brief", want: func(*run.Artifact) *run.Links {
			return &run.Links{Goal: &run.GoalLink{Run: "run-g", Input: "brief", Digest: "sha256:" + sha("a short brief")}}
		}},
		"a list kept inline": {goal: "run-g:changed", want: func(*run.Artifact) *run.Links {
			return &run.Links{Goal: &run.GoalLink{Run: "run-g", Input: "changed", Digest: "sha256:" + sha("a.go\nb.go")}}
		}},
		"a list read back from JSON": {goal: "run-g:files", want: func(*run.Artifact) *run.Links {
			return &run.Links{Goal: &run.GoalLink{Run: "run-g", Input: "files", Digest: "sha256:" + sha("c.go\nd.go")}}
		}},
		"the judgement": {answers: "run-j", want: func(*run.Artifact) *run.Links {
			return &run.Links{Judgement: &run.JudgementLink{Run: "run-j"}}
		}},
		"both": {goal: "run-g", answers: "run-j", want: func(artifact *run.Artifact) *run.Links {
			return &run.Links{
				Goal:      &run.GoalLink{Run: "run-g", Input: "goal", Digest: "sha256:" + sha(longText), Artifact: artifact},
				Judgement: &run.JudgementLink{Run: "run-j"},
			}
		}},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			h := newHarness()
			artifact := *earlierRuns(h.runs)
			record := h.call(t, contract.CallRequest{Goal: test.goal, Answers: test.answers})
			if record.Result.Status != run.Completed {
				t.Fatalf("result = %+v", record.Result)
			}
			if want := test.want(&artifact); !reflect.DeepEqual(record.Links, want) {
				t.Fatalf("links = %+v, want %+v", record.Links, want)
			}
			if record.Request.Goal != test.goal || record.Request.Answers != test.answers {
				t.Fatalf("request = %+v", record.Request)
			}
		})
	}
}

// A run named by neither option records no links at all.
func TestARunWithoutGoalOrAnswersRecordsNoLinks(t *testing.T) {
	t.Parallel()
	h := newHarness()
	record := h.call(t, contract.CallRequest{})
	data, _ := json.Marshal(record)
	if record.Links != nil || strings.Contains(string(data), `"links"`) {
		t.Fatalf("links = %+v\n%s", record.Links, data)
	}
}

// A goal or a judgement Agister cannot read from its run refuses the call
// before its first turn.
func TestAGoalOrJudgementThatCannotBeReadIsRefused(t *testing.T) {
	t.Parallel()
	for name, test := range map[string]struct {
		request contract.CallRequest
		reason  string
	}{
		"no goal run":                {contract.CallRequest{Goal: "run-none"}, "--goal: run run-none: not found"},
		"no such input":              {contract.CallRequest{Goal: "run-g:notes"}, "--goal: run run-g has no input notes"},
		"no goal input":              {contract.CallRequest{Goal: "run-j"}, "--goal: run run-j has no input goal"},
		"bytes kept nowhere":         {contract.CallRequest{Goal: "run-old"}, "--goal: run run-old keeps the bytes of its input goal nowhere, neither inline nor as an artifact"},
		"no run named":               {contract.CallRequest{Goal: ":goal"}, "--goal :goal: expected <run-id>[:<input>]"},
		"no judgement run":           {contract.CallRequest{Answers: "run-none"}, "--answers: run run-none: not found"},
		"a judgement that failed":    {contract.CallRequest{Answers: "run-f"}, "--answers: run run-f did not complete: it is failed/invalid_output"},
		"a judgement still running":  {contract.CallRequest{Answers: "run-r"}, "--answers: run run-r did not complete: it is running"},
		"a good goal, a bad answers": {contract.CallRequest{Goal: "run-g", Answers: "run-f"}, "--answers: run run-f did not complete"},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			h := newHarness()
			earlierRuns(h.runs)
			record := h.call(t, test.request)
			if class(record) != run.ClassRefused || !strings.HasPrefix(message(record), test.reason) {
				t.Fatalf("result = %+v, want refused: %s", record.Result, test.reason)
			}
			if turns := h.runner.calls(); len(turns) != 0 {
				t.Fatalf("turns = %d", len(turns))
			}
			if record.Links != nil || record.InPlace != nil {
				t.Fatalf("links %+v, in place %+v", record.Links, record.InPlace)
			}
		})
	}
}

// A workflow records its links on its own run, and is refused before any
// node starts when it cannot read one.
func TestAWorkflowRecordsItsLinksOrIsRefused(t *testing.T) {
	t.Parallel()
	h := newFlowHarness()
	artifact := *earlierRuns(h.runs)
	record := h.store.wait(t, h.submit(t, contract.CallRequest{Goal: "run-g", Answers: "run-j"}))
	want := &run.Links{
		Goal:      &run.GoalLink{Run: "run-g", Input: "goal", Digest: "sha256:" + sha(longText), Artifact: &artifact},
		Judgement: &run.JudgementLink{Run: "run-j"},
	}
	if record.Result.Status != run.Completed || !reflect.DeepEqual(record.Links, want) {
		t.Fatalf("result = %+v, links = %+v", record.Result, record.Links)
	}

	refused := newFlowHarness()
	earlierRuns(refused.runs)
	record = refused.store.wait(t, refused.submit(t, contract.CallRequest{Goal: "run-g:notes"}))
	if class(record) != run.ClassRefused || message(record) != "--goal: run run-g has no input notes" {
		t.Fatalf("result = %+v", record.Result)
	}
	if ids := refused.store.ids(); len(ids) != 1 || record.Workflow != nil {
		t.Fatalf("runs %v, workflow %+v", ids, record.Workflow)
	}
}

// A record written before links and working copies has neither, and still
// reads; runs show prints a record's links and its inputs' cache_path.
func TestRunsShowNamesLinksAndWorkingCopies(t *testing.T) {
	t.Parallel()
	var earlier run.Record
	if err := json.Unmarshal([]byte(`{"id":"old","request":{"process":"p","cwd":"/repo"},"inputs":[{"name":"brief","source":"file","identity":"sha256:b","value":"a brief"}]}`), &earlier); err != nil {
		t.Fatal(err)
	}
	if earlier.Links != nil || len(earlier.Inputs) != 1 || earlier.Inputs[0].CachePath != "" || earlier.Request.Goal != "" || earlier.Request.Answers != "" {
		t.Fatalf("earlier = %+v", earlier)
	}
	linked := run.Record{
		ID:      "r",
		Request: run.Request{Process: "p", Goal: "old:brief", Answers: "old", Cwd: "/repo"},
		Inputs:  []run.Input{{Name: "brief", Source: "file", Identity: "sha256:c", Value: "the step", CachePath: "/home/.agister/cache/c/brief.md"}},
		Links:   &run.Links{Goal: &run.GoalLink{Run: "old", Input: "brief", Digest: "sha256:b"}, Judgement: &run.JudgementLink{Run: "old"}},
	}
	for _, record := range []run.Record{earlier, linked} {
		view, err := app.NewRuns(&readerSpy{state: run.StateFinished, record: record}, nil, nil, nil, 0).Inspect(context.Background(), record.ID)
		if err != nil {
			t.Fatal(err)
		}
		var shown run.Record
		if err := json.Unmarshal(view.Record, &shown); err != nil || !reflect.DeepEqual(shown.Links, record.Links) || !reflect.DeepEqual(shown.Inputs, record.Inputs) || !reflect.DeepEqual(shown.Request, record.Request) {
			t.Fatalf("shown = %+v, %v\n%s", shown, err, view.Record)
		}
	}
}
