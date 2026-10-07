package app_test

import (
	"context"
	"encoding/json"
	"errors"
	"reflect"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/contract"
	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

// A run keeps the words of every input it was given (ADR-026 rule 6): a
// value too long for the record is stored as an artifact of the run, which
// the record's input names, and a long literal is recorded by its digest.

// longText is longer than the record keeps inline.
var longText = strings.Repeat("The brief says what to do.\n", 100)

// inputOf is the record's input name.
func inputOf(t *testing.T, record run.Record, name string) run.Input {
	t.Helper()
	for _, input := range record.Inputs {
		if input.Name == name {
			return input
		}
	}
	t.Fatalf("%s has no input %s: %+v", record.ID, name, record.Inputs)
	return run.Input{}
}

// keptInputs is a harness whose process p also takes a brief from a file
// and a goal from its params; the file reads as brief, and a param is its
// own identity, as inputs.Param makes it.
func keptInputs(brief string) *harness {
	h := newHarness()
	h.defs.docs[definition.KindProcess]["p"] = strings.Replace(strings.Replace(h.defs.docs[definition.KindProcess]["p"],
		"    candidate: {default: HEAD}\n", "    candidate: {default: HEAD}\n    goal: {default: short goal}\n", 1),
		`    diff: {source: git.diff, base: "${param.base}", head: "${param.candidate}"}`+"\n",
		`    diff: {source: git.diff, base: "${param.base}", head: "${param.candidate}"}`+"\n"+
			"    brief: {source: file, path: brief.md}\n    goal: {source: param, name: goal}\n", 1)
	base := h.inputs.respond
	h.inputs.respond = func(spec app.InputSpec) (app.Resolved, error) {
		switch spec.Source {
		case "file":
			return app.Resolved{Value: brief, Identity: "sha256:" + sha(brief)}, nil
		case "param":
			value := spec.Params[spec.Args["name"]]
			return app.Resolved{Value: value, Identity: value}, nil
		}
		return base(spec)
	}
	return h
}

func TestALongInputIsKeptAsAnArtifactOfItsRun(t *testing.T) {
	t.Parallel()
	h := keptInputs(longText)
	record := h.call(t, contract.CallRequest{Params: map[string]string{"goal": longText + "goal"}})
	if record.Result.Status != run.Completed {
		t.Fatalf("result = %+v", record.Result)
	}
	goal := longText + "goal"

	// The file's text is an artifact of the run, which the input names,
	// with its digest, the file's identity.
	brief := inputOf(t, record, "brief")
	want := run.Artifact{Name: "input-brief.txt", Path: "artifacts/input-brief.txt", Digest: "sha256:" + sha(longText), Bytes: int64(len(longText))}
	if brief.Value != nil || brief.Identity != want.Digest || brief.Artifact == nil || *brief.Artifact != want {
		t.Fatalf("brief = %+v, artifact %+v, want %+v", brief, brief.Artifact, want)
	}
	if stored := string(h.recorder.artifacts["input-brief.txt"]); stored != longText {
		t.Fatalf("brief stored as %q", stored)
	}

	// A long param is recorded by its digest, in the input and in the
	// request, and its bytes in the artifact.
	digest := "sha256:" + sha(goal)
	kept := inputOf(t, record, "goal")
	if kept.Value != nil || kept.Identity != digest || kept.Artifact == nil || kept.Artifact.Path != "artifacts/input-goal.txt" || kept.Artifact.Digest != digest {
		t.Fatalf("goal = %+v, artifact %+v", kept, kept.Artifact)
	}
	if stored := string(h.recorder.artifacts["input-goal.txt"]); stored != goal {
		t.Fatalf("goal stored as %q", stored)
	}
	if want := map[string]string{"goal": digest}; !reflect.DeepEqual(record.Request.Params, want) {
		t.Fatalf("request params = %v, want %v", record.Request.Params, want)
	}
	// Nowhere in the record is the literal.
	data, _ := json.Marshal(record)
	if strings.Contains(string(data), longText) {
		t.Fatalf("the record holds the long text:\n%s", data)
	}

	// A short value stays inline, with no artifact.
	diff := inputOf(t, record, "diff")
	if diff.Value != "line one\nline two" || diff.Artifact != nil || h.recorder.artifacts["input-diff.txt"] != nil {
		t.Fatalf("diff = %+v, artifacts %v", diff, h.recorder.artifacts)
	}
	// The agent received both values whole.
	prompt := h.runner.calls()[0].Prompt
	if !strings.Contains(prompt, longText) || !strings.Contains(prompt, goal) {
		t.Fatalf("prompt = %q", prompt)
	}
	stored := 0
	for _, event := range h.recorder.events {
		if event.Kind == "ARTIFACT_STORED" && event.Data["input"] != nil {
			stored++
		}
	}
	if stored != 2 {
		t.Fatalf("%d inputs stored, events %v", stored, h.recorder.kinds())
	}
}

// A short value stays inline as it always did, a short param in the
// request too; nothing is stored for them.
func TestShortInputsStayInline(t *testing.T) {
	t.Parallel()
	h := keptInputs("a short brief")
	record := h.call(t, contract.CallRequest{Params: map[string]string{"goal": "a short goal"}})
	brief, goal := inputOf(t, record, "brief"), inputOf(t, record, "goal")
	if brief.Value != "a short brief" || brief.Artifact != nil || goal.Value != "a short goal" || goal.Identity != "a short goal" || goal.Artifact != nil {
		t.Fatalf("inputs = %+v", record.Inputs)
	}
	if want := map[string]string{"goal": "a short goal"}; !reflect.DeepEqual(record.Request.Params, want) {
		t.Fatalf("request params = %v", record.Request.Params)
	}
	if len(h.recorder.artifacts) != 0 {
		t.Fatalf("artifacts = %v", h.recorder.artifacts)
	}
}

// An input's artifact that cannot be stored is recorded as ARTIFACT_FAILED,
// as changes.patch is, not silently lost; the call goes on with the value.
func TestAnInputArtifactThatFailsIsRecorded(t *testing.T) {
	t.Parallel()
	h := keptInputs(longText)
	h.recorder.artifactErr = func(name string) error {
		if name == "input-brief.txt" {
			return errors.New("disk full")
		}
		return nil
	}
	record := h.call(t, contract.CallRequest{})
	if record.Result.Status != run.Completed {
		t.Fatalf("result = %+v", record.Result)
	}
	if brief := inputOf(t, record, "brief"); brief.Value != nil || brief.Artifact != nil || brief.Identity != "sha256:"+sha(longText) {
		t.Fatalf("brief = %+v", brief)
	}
	var failed []map[string]any
	for _, event := range h.recorder.events {
		if event.Kind == "ARTIFACT_FAILED" {
			failed = append(failed, event.Data)
		}
	}
	if want := []map[string]any{{"name": "input-brief.txt", "input": "brief", "error": "disk full"}}; !reflect.DeepEqual(failed, want) {
		t.Fatalf("failed = %v, want %v", failed, want)
	}
	if !strings.Contains(h.runner.calls()[0].Prompt, longText) {
		t.Fatal("the agent did not receive the brief")
	}
}

// A workflow keeps its long goal as its own artifact, and each fan-out
// node, which receives it as a param, records its digest, in its request
// and its input, and keeps the bytes as its own artifact; the node's agent
// receives the text.
func TestAWorkflowNodesLongParamIsRecordedAsADigest(t *testing.T) {
	t.Parallel()
	h := newFlowHarness()
	takesGoal := func(doc string) string {
		return strings.Replace(strings.Replace(doc,
			"    candidate: {default: HEAD}\n", "    candidate: {default: HEAD}\n    goal: {}\n", 1),
			"  values:\n", "  values:\n    goal: {source: param, name: goal}\n", 1)
	}
	h.defs.docs[definition.KindProcess]["first"] = takesGoal(nodeProcess("first", "Work as first."))
	h.defs.docs[definition.KindProcess]["second"] = takesGoal(nodeProcess("second", "Work as second."))
	h.defs.docs[definition.KindWorkflow]["w"] = strings.Replace(workflowDoc, "  values:\n", "  values:\n    goal: {source: file, path: goal.md}\n", 1)
	base := h.inputs.respond
	h.inputs.respond = func(spec app.InputSpec) (app.Resolved, error) {
		if spec.Source == "file" && spec.Args["path"] == "goal.md" {
			return app.Resolved{Value: longText, Identity: "sha256:" + sha(longText)}, nil
		}
		return base(spec)
	}
	id := h.submit(t, contract.CallRequest{})
	record := h.store.wait(t, id)
	if record.Result.Status != run.Completed {
		t.Fatalf("result = %+v", record.Result)
	}
	digest := "sha256:" + sha(longText)
	want := run.Artifact{Name: "input-goal.txt", Path: "artifacts/input-goal.txt", Digest: digest, Bytes: int64(len(longText))}

	// The workflow's own input.
	if goal := inputOf(t, record, "goal"); goal.Value != nil || goal.Identity != digest || goal.Artifact == nil || *goal.Artifact != want {
		t.Fatalf("workflow goal = %+v", goal)
	}
	if stored := string(h.store.handle(t, id).artifacts["input-goal.txt"]); stored != longText {
		t.Fatalf("workflow stored %q", stored)
	}
	for _, node := range []string{"run-2", "run-3"} {
		record := h.store.wait(t, node)
		if record.Request.Params["goal"] != digest || !strings.HasPrefix(record.Request.Params["candidate"], "sha-HEAD-") {
			t.Fatalf("%s params = %v", node, record.Request.Params)
		}
		if goal := inputOf(t, record, "goal"); goal.Value != nil || goal.Identity != digest || goal.Artifact == nil || *goal.Artifact != want {
			t.Fatalf("%s goal = %+v", node, goal)
		}
		if stored := string(h.store.handle(t, node).artifacts["input-goal.txt"]); stored != longText {
			t.Fatalf("%s stored %q", node, stored)
		}
		if data, _ := json.Marshal(record); strings.Contains(string(data), longText) {
			t.Fatalf("%s's record holds the goal's text:\n%s", node, data)
		}
	}
	for _, instruction := range []string{"Work as first.", "Work as second."} {
		if turns := h.runner.turns(instruction); len(turns) != 1 || !strings.Contains(turns[0].Prompt, longText) {
			t.Fatalf("%s did not receive the goal", instruction)
		}
	}
}

// A record written before inputs were kept has no input artifact; it still
// reads, and the record runs show prints names an input's artifact once
// there is one.
func TestRunsShowNamesAnInputsArtifact(t *testing.T) {
	t.Parallel()
	var earlier run.Record
	if err := json.Unmarshal([]byte(`{"id":"old","inputs":[{"name":"brief","source":"file","identity":"sha256:b"}]}`), &earlier); err != nil {
		t.Fatal(err)
	}
	if len(earlier.Inputs) != 1 || earlier.Inputs[0].Artifact != nil || earlier.Inputs[0].Identity != "sha256:b" {
		t.Fatalf("inputs = %+v", earlier.Inputs)
	}
	artifact := run.Artifact{Name: "input-brief.txt", Path: "artifacts/input-brief.txt", Digest: "sha256:b", Bytes: 2100}
	record := run.Record{ID: "r", Inputs: []run.Input{{Name: "brief", Source: "file", Identity: "sha256:b", Artifact: &artifact}}}
	for _, record := range []run.Record{earlier, record} {
		view, err := app.NewRuns(&readerSpy{state: run.StateFinished, record: record}, nil, nil, nil, 0).Inspect(context.Background(), record.ID)
		if err != nil {
			t.Fatal(err)
		}
		var shown run.Record
		if err := json.Unmarshal(view.Record, &shown); err != nil || !reflect.DeepEqual(shown.Inputs, record.Inputs) {
			t.Fatalf("inputs shown = %+v, %v\n%s", shown.Inputs, err, view.Record)
		}
	}
}
