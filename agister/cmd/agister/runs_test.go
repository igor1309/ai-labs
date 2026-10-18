package main

import (
	"context"
	"errors"
	"reflect"
	"testing"

	"github.com/igor1309/ai-labs/agister/runstore"
	"github.com/igor1309/ai-labs/agister/runtime/claudecode"
	"github.com/igor1309/ai-labs/agister/runtime/codex"
)

// input is the input name as the record keeps it.
func input(name, value, identity string) runstore.Input {
	return runstore.Input{Name: name, Value: value, Identity: identity}
}

// runs.feature, "The workflow's inputs and each call's are recorded":
// the workflow's in the order it declares them, each call's in the order
// its process declares them, and the judge's reviews as its message gives
// them.
//
// Contract test: the files home holds, as Agister ships them.
func TestTheWorkflowsInputsAndEachCallsAreRecorded(t *testing.T) {
	t.Parallel()
	f := newReviewFixture(t)
	f.runtimes.codex.answer = func(_ context.Context, turn codex.Turn) (codex.Result, error) {
		return completesReview(t, f.settings, turn)
	}
	got := f.run(t, "/r", "run", "code_review", "--param", "goal=g.md")
	if got.stderr != "" || got.code != 0 {
		t.Fatalf("stderr %q, exit %d; want none, 0", got.stderr, got.code)
	}
	last := f.store.last(t)
	goal := input("goal", goalBrief, identityOf(goalBrief))
	if want := []runstore.Input{input("base", "c0", "c0"), input("candidate", "c1", "c1"), goal}; !reflect.DeepEqual(last.Inputs, want) {
		t.Errorf("the record's inputs\n%+v\nwant\n%+v", last.Inputs, want)
	}
	of := map[string][]runstore.Input{}
	for _, call := range last.Calls {
		of[call.Step] = call.Inputs
	}
	review := []runstore.Input{input("base_revision", "c0", "c0"), input("candidate_revision", "c1", "c1"),
		input("changed_files", "a.go", identityOf("a.go")), goal}
	reviewsGiven := judgedText(t, f)
	want := map[string][]runstore.Input{"judge": {input("reviews", reviewsGiven, identityOf(reviewsGiven))}}
	for _, r := range reviews {
		want[r.step] = review
	}
	if !reflect.DeepEqual(of, want) {
		t.Errorf("the calls' inputs\n%+v\nwant\n%+v", of, want)
	}
}

// runs.feature, "A request naming a step records its call's inputs
// alone".
//
// Contract test: the files home holds, as Agister ships them.
func TestARequestNamingAStepRecordsItsCallsInputsAlone(t *testing.T) {
	t.Parallel()
	f := newRecordFixture(t, modelSettings(t, nil), nil)
	f.runtimes.claude.answer = claudeReply(claudecode.Reply{Output: []byte(`{"ok":true}`)})
	f.validator = &validatorSpy{}
	got := f.run(t, "/r", "run", "--process", "ask", "--agent", "claude-opus", "--param", "q=why")
	if got.stderr != "" || got.code != 0 {
		t.Fatalf("stderr %q, exit %d; want none, 0", got.stderr, got.code)
	}
	last := f.store.last(t)
	if len(last.Inputs) > 0 {
		t.Errorf("the record's inputs %+v, want none", last.Inputs)
	}
	if want := []runstore.Input{input("q", "why", identityOf("why"))}; len(last.Calls) != 1 || !reflect.DeepEqual(last.Calls[0].Inputs, want) {
		t.Errorf("the record's calls %+v, want one, its inputs %+v", last.Calls, want)
	}
}

// runs.feature, "A run whose workflow's inputs are refused records none".
//
// Contract test: the files home holds, as Agister ships them.
func TestARunWhoseWorkflowsInputsAreRefusedRecordsNone(t *testing.T) {
	t.Parallel()
	settings := inputsSettings(t, "{source: param, name: what}", map[string]string{
		"/r/.agister/workflows/w.yaml": `schema: agister.workflow/v1alpha1
inputs:
  goal: {source: file, path: g.md}
steps:
  - {name: say, process: say, agent: bash, inputs: {what: {from: inputs.goal}}}
`,
	})
	settings["/r/.agister/processes/say.yaml"] += "params:\n  what: {}\n"
	f := newRunFixture(t, settings, nil)
	if got := f.run(t, "/r", "run", "w"); got.stderr != "" || got.code != 1 {
		t.Fatalf("stderr %q, exit %d; want none, 1", got.stderr, got.code)
	}
	last := f.store.last(t)
	if last.Status != "failed" || last.Result == nil || last.Result.Class == nil || *last.Result.Class != "refused" {
		t.Errorf("the record %s, its result %+v; want failed, refused", last.Status, last.Result)
	}
	if len(last.Inputs) > 0 || len(last.Calls) > 0 {
		t.Errorf("the record's inputs %+v and calls %+v, want none", last.Inputs, last.Calls)
	}
}

// runs.feature, "A call whose inputs are refused records none".
//
// Contract test: the files home holds, as Agister ships them.
func TestACallWhoseInputsAreRefusedRecordsNone(t *testing.T) {
	t.Parallel()
	f := newRunFixture(t, shippedHome(t), nil)
	f.sources.commits = map[string]string{"HEAD": "c1"}
	if got := f.run(t, "/r", "run", "--process", "implement", "--agent", "claude-opus", "--param", "brief=missing.md"); got.stderr != "" || got.code != 1 {
		t.Fatalf("stderr %q, exit %d; want none, 1", got.stderr, got.code)
	}
	last := f.store.last(t)
	if len(last.Calls) != 1 {
		t.Fatalf("the record's calls %+v, want one", last.Calls)
	}
	call := last.Calls[0]
	if result := call.Result; result.Status != "failed" || result.Class == nil || *result.Class != "refused" {
		t.Errorf("the call's result %+v, want failed, refused", result)
	}
	if len(call.Inputs) > 0 {
		t.Errorf("the call's inputs %+v, want none", call.Inputs)
	}
}

// runs.feature, "A run is exported from home's runs".
func TestARunIsExportedFromHomesRuns(t *testing.T) {
	t.Parallel()
	f := newRunFixture(t, map[string]string{}, nil)
	got := f.run(t, "/r", "runs", "export", "R1", "--to", "/out")
	if got != (ran{}) {
		t.Errorf("ran %+v, want nothing printed, exit 0", got)
	}
	folders, _, _ := f.store.given()
	if want := []string{"/u/.agister/runs"}; !reflect.DeepEqual(folders, want) {
		t.Errorf("runstore over %q, want home's runs", folders)
	}
	if exported, want := f.store.exported(), []storedExport{{id: "R1", folder: "/out"}}; !reflect.DeepEqual(exported, want) {
		t.Errorf("runstore exported %+v, want %+v", exported, want)
	}
}

// runs.feature, "An export runstore fails is a failure".
func TestAnExportRunstoreFailsIsAFailure(t *testing.T) {
	t.Parallel()
	f := newRunFixture(t, map[string]string{}, nil)
	f.store.failExport = errors.New(`runstore: the export of "R1": open /u/.agister/runs/R1/record.json: no such file or directory`)
	got := f.run(t, "/r", "runs", "export", "R1", "--to", "/out")
	if want := (ran{stderr: "agister: " + f.store.failExport.Error() + "\n", code: 1}); got != want {
		t.Errorf("ran %+v, want %+v", got, want)
	}
}
