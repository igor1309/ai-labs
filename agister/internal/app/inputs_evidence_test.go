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

// inlineLimit is the longest text the record keeps inline.
const inlineLimit = 2000

// longText is longer than the record keeps inline.
var longText = strings.Repeat("The brief says what to do.\n", 100)

// jsonText is text as a JSON document holds it, escaped, so a search of a
// marshalled record finds it.
func jsonText(text string) string {
	data, _ := json.Marshal(text)
	return string(data[1 : len(data)-1])
}

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
	if strings.Contains(string(data), jsonText(longText)) {
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

// A long param whose artifact cannot be stored keeps its text in the
// request: no artifact keeps its bytes, so its record does. Another long
// input's artifact, stored beside it, does not stand for the param's.
func TestALongParamWhoseArtifactFailsKeepsItsText(t *testing.T) {
	t.Parallel()
	brief := longText + "brief"
	h := keptInputs(brief)
	h.recorder.artifactErr = func(name string) error {
		if name == "input-goal.txt" {
			return errors.New("disk full")
		}
		return nil
	}
	goal := longText + "goal"
	record := h.call(t, contract.CallRequest{Params: map[string]string{"goal": goal}})
	if record.Result.Status != run.Completed {
		t.Fatalf("result = %+v", record.Result)
	}
	// The brief's artifact is stored, under its own digest.
	if kept := inputOf(t, record, "brief"); kept.Artifact == nil || kept.Artifact.Digest != "sha256:"+sha(brief) {
		t.Fatalf("brief = %+v, artifact %+v", kept, kept.Artifact)
	}
	if stored := string(h.recorder.artifacts["input-brief.txt"]); stored != brief {
		t.Fatalf("brief stored as %q", stored)
	}
	if record.Request.Params["goal"] != goal {
		t.Fatalf("request params = %v, want the goal's text", record.Request.Params)
	}
	if kept := inputOf(t, record, "goal"); kept.Artifact != nil {
		t.Fatalf("goal = %+v, artifact %+v", kept, kept.Artifact)
	}
	var failed []map[string]any
	for _, event := range h.recorder.events {
		if event.Kind == "ARTIFACT_FAILED" {
			failed = append(failed, event.Data)
		}
	}
	if want := []map[string]any{{"name": "input-goal.txt", "input": "goal", "error": "disk full"}}; !reflect.DeepEqual(failed, want) {
		t.Fatalf("failed = %v, want %v", failed, want)
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
		if data, _ := json.Marshal(record); strings.Contains(string(data), jsonText(longText)) {
			t.Fatalf("%s's record holds the goal's text:\n%s", node, data)
		}
	}
	for _, instruction := range []string{"Work as first.", "Work as second."} {
		if turns := h.runner.turns(instruction); len(turns) != 1 || !strings.Contains(turns[0].Prompt, longText) {
			t.Fatalf("%s did not receive the goal", instruction)
		}
	}
}

// Inputs whose names repeat, hold what a file name cannot, or run over 64
// characters, each keep their own artifact, under a safe name of their
// place among the inputs.
func TestInputArtifactsAreEachInputsOwn(t *testing.T) {
	t.Parallel()
	longName := strings.Repeat("a", 65)
	h := newHarness()
	h.defs.docs[definition.KindProcess]["p"] = strings.Replace(h.defs.docs[definition.KindProcess]["p"],
		`    diff: {source: git.diff, base: "${param.base}", head: "${param.candidate}"}`+"\n",
		`    diff: {source: git.diff, base: "${param.base}", head: "${param.candidate}"}`+"\n"+
			"    brief: {source: file, path: one.md}\n    brief: {source: file, path: two.md}\n    notes/today: {source: file, path: notes.md}\n"+
			"    "+longName+": {source: file, path: long.md}\n", 1)
	texts := map[string]string{"one.md": longText + "one", "two.md": longText + "two", "notes.md": longText + "notes", "long.md": longText + "long"}
	base := h.inputs.respond
	h.inputs.respond = func(spec app.InputSpec) (app.Resolved, error) {
		if text, ok := texts[spec.Args["path"]]; ok {
			return app.Resolved{Value: text, Identity: "sha256:" + sha(text)}, nil
		}
		return base(spec)
	}
	record := h.call(t, contract.CallRequest{})
	if record.Result.Status != run.Completed {
		t.Fatalf("result = %+v", record.Result)
	}
	want := []struct{ name, text, file string }{
		{"brief", texts["one.md"], "input.2.txt"},
		{"brief", texts["two.md"], "input.3.txt"},
		{"notes/today", texts["notes.md"], "input.4.txt"},
		{longName, texts["long.md"], "input.5.txt"},
	}
	if len(record.Inputs) != 7 {
		t.Fatalf("inputs = %+v", record.Inputs)
	}
	for i, want := range want {
		input := record.Inputs[2+i]
		digest := "sha256:" + sha(want.text)
		if input.Name != want.name || input.Value != nil || input.Identity != digest || input.Artifact == nil ||
			*input.Artifact != (run.Artifact{Name: want.file, Path: "artifacts/" + want.file, Digest: digest, Bytes: int64(len(want.text))}) {
			t.Fatalf("input %d = %+v, artifact %+v", 2+i, input, input.Artifact)
		}
		if stored := string(h.recorder.artifacts[want.file]); stored != want.text {
			t.Fatalf("%s holds %q, want %s's text", want.file, stored, want.name)
		}
	}
	if len(h.recorder.artifacts) != 4 {
		t.Fatalf("artifacts = %v", h.recorder.artifacts)
	}
}

// Inputs whose names differ only in case keep their own artifacts on a file
// system that ignores case: each under its place among the inputs, while a
// name no other shares keeps its own.
func TestInputArtifactsOfNamesThatDifferInCaseAreEachInputsOwn(t *testing.T) {
	t.Parallel()
	h := newHarness()
	h.defs.docs[definition.KindProcess]["p"] = strings.Replace(h.defs.docs[definition.KindProcess]["p"],
		`    diff: {source: git.diff, base: "${param.base}", head: "${param.candidate}"}`+"\n",
		`    diff: {source: git.diff, base: "${param.base}", head: "${param.candidate}"}`+"\n"+
			"    goal: {source: file, path: lower.md}\n    Goal: {source: file, path: upper.md}\n    notes: {source: file, path: notes.md}\n", 1)
	texts := map[string]string{"lower.md": longText + "lower", "upper.md": longText + "upper", "notes.md": longText + "notes"}
	base := h.inputs.respond
	h.inputs.respond = func(spec app.InputSpec) (app.Resolved, error) {
		if text, ok := texts[spec.Args["path"]]; ok {
			return app.Resolved{Value: text, Identity: "sha256:" + sha(text)}, nil
		}
		return base(spec)
	}
	record := h.call(t, contract.CallRequest{})
	if record.Result.Status != run.Completed {
		t.Fatalf("result = %+v", record.Result)
	}
	want := []struct{ name, text, file string }{
		{"goal", texts["lower.md"], "input.2.txt"},
		{"Goal", texts["upper.md"], "input.3.txt"},
		{"notes", texts["notes.md"], "input-notes.txt"},
	}
	if len(record.Inputs) != 6 {
		t.Fatalf("inputs = %+v", record.Inputs)
	}
	folded := map[string]bool{}
	for i, want := range want {
		input := record.Inputs[2+i]
		digest := "sha256:" + sha(want.text)
		if input.Name != want.name || input.Value != nil || input.Identity != digest || input.Artifact == nil ||
			*input.Artifact != (run.Artifact{Name: want.file, Path: "artifacts/" + want.file, Digest: digest, Bytes: int64(len(want.text))}) {
			t.Fatalf("input %d = %+v, artifact %+v", 2+i, input, input.Artifact)
		}
		if stored := string(h.recorder.artifacts[want.file]); stored != want.text {
			t.Fatalf("%s holds %q, want %s's text", want.file, stored, want.name)
		}
		folded[strings.ToLower(input.Artifact.Name)] = true
	}
	if len(folded) != 3 || len(h.recorder.artifacts) != 3 {
		t.Fatalf("artifact names, case folded = %v; artifacts = %v", folded, h.recorder.artifacts)
	}
}

// A long prompt is kept as an artifact of the run that receives it, with
// its digest, its identity; the agent receives it unchanged. So is a long
// guidance prompt.
func TestALongPromptIsKeptAsAnArtifactOfItsRun(t *testing.T) {
	t.Parallel()
	h := newHarness()
	text := longText + "Inspect the change for defects.\n"
	h.defs.docs[definition.KindPrompt]["inspect"] = text
	guidance := longText + "Prove each rule with a test.\n"
	guided(h, []string{"testing"}, map[string]string{"testing": guidance})
	record := h.call(t, contract.CallRequest{})
	if record.Result.Status != run.Completed {
		t.Fatalf("result %+v: %s", record.Result, message(record))
	}
	// guidance.testing is no plain name: its artifact is named by its place.
	for input, c := range map[string]struct{ text, name string }{
		"prompt":           {text, "input-prompt.txt"},
		"guidance.testing": {guidance, "input.3.txt"},
	} {
		text, name := c.text, c.name
		digest := "sha256:" + sha(text)
		want := run.Artifact{Name: name, Path: "artifacts/" + name, Digest: digest, Bytes: int64(len(text))}
		if got := inputOf(t, record, input); got.Source != "prompt" || got.Value != nil || got.Identity != digest || got.Artifact == nil || *got.Artifact != want {
			t.Fatalf("%s = %+v, artifact %+v, want %+v", input, got, got.Artifact, want)
		}
		if stored := string(h.recorder.artifacts[name]); stored != text {
			t.Fatalf("%s stored as %q", input, stored)
		}
		if calls := h.runner.calls(); len(calls) != 1 || !strings.Contains(calls[0].Prompt, text) {
			t.Fatalf("the agent was not given %s: %+v", input, calls)
		}
	}
}

// A collection over the inline limit is kept as an artifact of the join
// that receives it, the same bytes as the workflow's collection.json; the
// join's agent receives it unchanged.
func TestALongCollectionIsKeptAsAnArtifactOfTheJoin(t *testing.T) {
	t.Parallel()
	h := newFlowHarness()
	h.script("Work as first.").turn = completed(`{"from":"first","notes":"`+strings.Repeat("n", inlineLimit)+`"}`, 0.1, 1)
	id := h.submit(t, contract.CallRequest{})
	record := h.store.wait(t, id)
	if record.Result.Status != run.Completed {
		t.Fatalf("result = %+v", record.Result)
	}
	collection := string(h.store.handle(t, id).artifacts["collection.json"])
	if len(collection) <= inlineLimit {
		t.Fatalf("collection is %d bytes, not over the limit", len(collection))
	}
	digest := "sha256:" + sha(collection)
	want := run.Artifact{Name: "input-gathered.txt", Path: "artifacts/input-gathered.txt", Digest: digest, Bytes: int64(len(collection))}
	join := h.store.wait(t, "run-4")
	if gathered := inputOf(t, join, "gathered"); gathered.Value != nil || gathered.Identity != digest || gathered.Artifact == nil || *gathered.Artifact != want {
		t.Fatalf("gathered = %+v, artifact %+v", gathered, gathered.Artifact)
	}
	if stored := string(h.store.handle(t, "run-4").artifacts["input-gathered.txt"]); stored != collection {
		t.Fatalf("the join stored %q, want the collection %q", stored, collection)
	}
	if turns := h.runner.turns("Join them."); len(turns) != 1 || !strings.Contains(turns[0].Prompt, collection) {
		t.Fatal("the join did not receive the collection")
	}
}

// A run refused before its inputs are recorded keeps a long param as it was
// given: no artifact keeps its bytes, so its record does.
func TestARefusedRunKeepsALongParamsText(t *testing.T) {
	t.Parallel()
	h := keptInputs(longText)
	h.defs.docs[definition.KindProcess]["p"] = strings.Replace(h.defs.docs[definition.KindProcess]["p"],
		"    brief: {source: file, path: brief.md}\n    goal: {source: param, name: goal}\n",
		"    goal: {source: param, name: goal}\n    brief: {source: file, path: missing.md}\n", 1)
	keep := h.inputs.respond
	h.inputs.respond = func(spec app.InputSpec) (app.Resolved, error) {
		if spec.Source == "file" {
			return app.Resolved{}, errors.New("no such file")
		}
		return keep(spec)
	}
	goal := longText + "goal"
	record := h.call(t, contract.CallRequest{Params: map[string]string{"goal": goal}})
	if class(record) != run.ClassRefused || !strings.Contains(message(record), "input brief: no such file") {
		t.Fatalf("result = %+v", record.Result)
	}
	if record.Request.Params["goal"] != goal {
		t.Fatalf("request params = %v, want the goal's text", record.Request.Params)
	}
	if len(record.Inputs) != 0 || len(h.recorder.artifacts) != 0 {
		t.Fatalf("inputs = %+v, artifacts %v", record.Inputs, h.recorder.artifacts)
	}
}

// A workflow given a long goal through its params records the goal's
// digest, in its request and its input, and keeps the bytes as its
// artifact; its nodes, which take the goal from the workflow, receive the
// goal's text unchanged, not its digest.
func TestAWorkflowsLongParamReachesItsNodesWhole(t *testing.T) {
	t.Parallel()
	h := newFlowHarness()
	takesGoal := func(doc string) string {
		return strings.Replace(strings.Replace(doc,
			"    candidate: {default: HEAD}\n", "    candidate: {default: HEAD}\n    goal: {}\n", 1),
			"  values:\n", "  values:\n    goal: {source: param, name: goal}\n", 1)
	}
	h.defs.docs[definition.KindProcess]["first"] = takesGoal(nodeProcess("first", "Work as first."))
	h.defs.docs[definition.KindProcess]["second"] = takesGoal(nodeProcess("second", "Work as second."))
	h.defs.docs[definition.KindWorkflow]["w"] = strings.Replace(strings.Replace(workflowDoc,
		"    candidate: {}\n", "    candidate: {}\n    goal: {}\n", 1),
		"  values:\n", "  values:\n    goal: {source: param, name: goal}\n", 1)
	goal := longText + "goal"
	id := h.submit(t, contract.CallRequest{Params: map[string]string{"candidate": "HEAD", "goal": goal}})
	record := h.store.wait(t, id)
	if record.Result.Status != run.Completed {
		t.Fatalf("result = %+v", record.Result)
	}
	digest := "sha256:" + sha(goal)
	if record.Request.Params["goal"] != digest || record.Request.Params["candidate"] != "HEAD" {
		t.Fatalf("workflow params = %v", record.Request.Params)
	}
	want := run.Artifact{Name: "input-goal.txt", Path: "artifacts/input-goal.txt", Digest: digest, Bytes: int64(len(goal))}
	if kept := inputOf(t, record, "goal"); kept.Value != nil || kept.Identity != digest || kept.Artifact == nil || *kept.Artifact != want {
		t.Fatalf("workflow goal = %+v", kept)
	}
	if stored := string(h.store.handle(t, id).artifacts["input-goal.txt"]); stored != goal {
		t.Fatalf("workflow stored %q", stored)
	}
	for _, instruction := range []string{"Work as first.", "Work as second."} {
		if turns := h.runner.turns(instruction); len(turns) != 1 || !strings.Contains(turns[0].Prompt, goal) || strings.Contains(turns[0].Prompt, digest) {
			t.Fatalf("%s did not receive the goal's text", instruction)
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
