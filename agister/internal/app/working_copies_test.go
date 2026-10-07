package app_test

import (
	"errors"
	"path"
	"reflect"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/contract"
	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

// A run gives each of its file inputs a disposable working copy in
// Agister's cache, named by the digest of its bytes and the file's base
// name, which the record's input names in cache_path (ADR-026 rule 6).

// readFrom has the harness's file inputs read from the file their path
// names, as inputs.File reports it: by its base name.
func readFrom(inputs *inputsSpy) {
	base := inputs.respond
	inputs.respond = func(spec app.InputSpec) (app.Resolved, error) {
		resolved, err := base(spec)
		if spec.Source == "file" {
			resolved.File = path.Base(spec.Args["path"])
		}
		return resolved, err
	}
}

// cacheFailures are the CACHE_FAILED events among events.
func cacheFailures(events []run.Event) []map[string]any {
	var failed []map[string]any
	for _, event := range events {
		if event.Kind == "CACHE_FAILED" {
			failed = append(failed, event.Data)
		}
	}
	return failed
}

// Every file input of a process run has a working copy, long or short,
// beside the run's own copy; an input not read from a file has none.
func TestAProcessRunsFileInputsHaveWorkingCopies(t *testing.T) {
	t.Parallel()
	h := keptInputs(longText)
	h.defs.docs[definition.KindProcess]["p"] = strings.Replace(h.defs.docs[definition.KindProcess]["p"],
		"    brief: {source: file, path: brief.md}\n", "    brief: {source: file, path: docs/brief.md}\n    notes: {source: file, path: notes.md}\n", 1)
	file := h.inputs.respond
	h.inputs.respond = func(spec app.InputSpec) (app.Resolved, error) {
		if spec.Source == "file" && spec.Args["path"] == "notes.md" {
			return app.Resolved{Value: "short notes", Identity: "sha256:" + sha("short notes")}, nil
		}
		return file(spec)
	}
	readFrom(h.inputs)
	record := h.call(t, contract.CallRequest{})
	if record.Result.Status != run.Completed {
		t.Fatalf("result = %+v", record.Result)
	}

	brief := inputOf(t, record, "brief")
	if want := "/cache/" + sha(longText) + "/brief.md"; brief.CachePath != want || brief.Artifact == nil {
		t.Fatalf("brief = %+v, want cache_path %s beside its artifact", brief, want)
	}
	notes := inputOf(t, record, "notes")
	if want := "/cache/" + sha("short notes") + "/notes.md"; notes.CachePath != want || notes.Value != "short notes" {
		t.Fatalf("notes = %+v, want cache_path %s beside its value", notes, want)
	}
	if want := map[string][]byte{brief.CachePath: []byte(longText), notes.CachePath: []byte("short notes")}; !reflect.DeepEqual(h.copies.kept, want) {
		t.Fatalf("kept %v", h.copies.kept)
	}
	for _, name := range []string{"candidate_revision", "diff", "goal"} {
		if input := inputOf(t, record, name); input.CachePath != "" {
			t.Fatalf("%s = %+v", name, input)
		}
	}
	if failed := cacheFailures(h.recorder.events); failed != nil {
		t.Fatalf("failed = %v", failed)
	}
}

// Two runs given the same bytes name the same working copy, which the
// cache keeps once.
func TestRunsGivenTheSameBytesShareAWorkingCopy(t *testing.T) {
	t.Parallel()
	first, second := keptInputs("the brief"), keptInputs("the brief")
	readFrom(first.inputs)
	readFrom(second.inputs)
	second.copies = first.copies
	second.calls = second.callsOn(second.defs)
	one, other := inputOf(t, first.call(t, contract.CallRequest{}), "brief"), inputOf(t, second.call(t, contract.CallRequest{}), "brief")
	if want := "/cache/" + sha("the brief") + "/brief.md"; one.CachePath != want || other.CachePath != want || one.Identity != other.Identity {
		t.Fatalf("first %+v, second %+v, want cache_path %s", one, other, want)
	}
	if want := []string{one.CachePath}; !reflect.DeepEqual(first.copies.writes, want) {
		t.Fatalf("writes %v, want %v", first.copies.writes, want)
	}
}

// A working copy that cannot be written does not fail the run: it is
// recorded as CACHE_FAILED, as an artifact that fails is, and its input
// has no cache_path, its run's own copy kept as ever.
func TestAWorkingCopyThatFailsIsReported(t *testing.T) {
	t.Parallel()
	h := keptInputs(longText)
	readFrom(h.inputs)
	h.copies.err = func(string) error { return errors.New("cache full") }
	record := h.call(t, contract.CallRequest{})
	if record.Result.Status != run.Completed {
		t.Fatalf("result = %+v", record.Result)
	}
	if brief := inputOf(t, record, "brief"); brief.CachePath != "" || brief.Artifact == nil || brief.Identity != "sha256:"+sha(longText) {
		t.Fatalf("brief = %+v", brief)
	}
	if want := []map[string]any{{"name": "brief.md", "input": "brief", "error": "cache full"}}; !reflect.DeepEqual(cacheFailures(h.recorder.events), want) {
		t.Fatalf("failed = %v, want %v", cacheFailures(h.recorder.events), want)
	}
	if !strings.Contains(h.runner.calls()[0].Prompt, longText) {
		t.Fatal("the agent did not receive the brief")
	}
}

// A workflow run's file inputs have working copies too, and one that
// fails is reported on the workflow's run, which goes on.
func TestAWorkflowRunsFileInputsHaveWorkingCopies(t *testing.T) {
	t.Parallel()
	for name, fails := range map[string]bool{"kept": false, "failed": true} {
		t.Run(name, func(t *testing.T) {
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
			readFrom(h.inputs)
			if fails {
				h.copies.err = func(string) error { return errors.New("cache full") }
			}
			id := h.submit(t, contract.CallRequest{})
			record := h.store.wait(t, id)
			if record.Result.Status != run.Completed {
				t.Fatalf("result = %+v", record.Result)
			}
			goal := inputOf(t, record, "goal")
			failed := cacheFailures(h.store.handle(t, id).events)
			if fails {
				if want := []map[string]any{{"name": "goal.md", "input": "goal", "error": "cache full"}}; goal.CachePath != "" || !reflect.DeepEqual(failed, want) {
					t.Fatalf("goal = %+v, failed = %v", goal, failed)
				}
				return
			}
			if want := "/cache/" + sha("the guide") + "/goal.md"; goal.CachePath != want || failed != nil {
				t.Fatalf("goal = %+v, want cache_path %s; failed = %v", goal, want, failed)
			}
		})
	}
}
