package main

import (
	"context"
	"encoding/json"
	"fmt"
	"path/filepath"
	"reflect"
	"slices"
	"strings"
	"sync"
	"testing"

	"github.com/igor1309/ai-labs/agister/runstore"
	"github.com/igor1309/ai-labs/agister/runtime/bash"
	"github.com/igor1309/ai-labs/agister/runtime/claudecode"
)

const simpleChild = `schema: agister.workflow/v1alpha1
steps:
 - {name: draft, process: say, agent: bash, inputs: {what: child}}
outputs: {output: {from: steps.draft.outputs.exit_code}}
`

// Contract test: the runtime settings shipped in home.
func TestQualifiedChildNamesCannotOverwriteDeclaredStepPlans(t *testing.T) {
	t.Parallel()
	for _, childFirst := range []bool{false, true} {
		t.Run(fmt.Sprintf("child first %t", childFirst), func(t *testing.T) {
			t.Parallel()
			steps := []string{
				" - {name: tests/draft, process: say, agent: bash, inputs: {what: parent}}\n",
				" - {name: tests, workflow: child}\n",
			}
			if childFirst {
				slices.Reverse(steps)
			}
			f := newRunFixture(t, runSettings(t, map[string]string{
				"/r/.agister/workflows/parent.yaml": "schema: agister.workflow/v1alpha1\nsteps:\n" + strings.Join(steps, ""),
				"/r/.agister/workflows/child.yaml":  simpleChild,
			}), echoes)
			got := f.run(t, "/r", "run", "parent")
			for _, text := range []string{`the step "tests/draft" of workflow "parent"`, `the step "draft" of workflow "child"`, `both be planned as "tests/draft"`} {
				if !strings.Contains(got.stderr, text) {
					t.Errorf("refusal lacks %q: %+v", text, got)
				}
			}
			if got.code != 1 || len(f.runtimes.bash.ran()) != 0 || len(f.store.records) != 0 {
				t.Fatalf("run %+v, calls %v, records %v", got, f.runtimes.bash.ran(), f.store.records)
			}
			check := f.run(t, "/r", "check")
			if check.code != 1 || !strings.Contains(check.stdout, `both be planned as "tests/draft"`) || !strings.Contains(check.stdout, "refuses workflow parent") {
				t.Errorf("check %+v", check)
			}
			inspect := f.run(t, "/r", "inspect", "workflow", "parent")
			if inspect.code != 0 || !strings.Contains(inspect.stdout, `both be planned as "tests/draft"`) || !strings.Contains(inspect.stdout, "\nrefused\n") || strings.Contains(inspect.stdout, "plan of ") {
				t.Errorf("inspect %+v", inspect)
			}
		})
	}
}

// Contract test: the runtime settings shipped in home.
func TestAnUnfinishedChildIsRecordedLostThenRewrittenWhenItEnds(t *testing.T) {
	t.Parallel()
	f := newRunFixture(t, runSettings(t, map[string]string{
		"/r/.agister/workflows/parent.yaml": "schema: agister.workflow/v1alpha1\nsteps: [{name: tests, workflow: child}]\n",
		"/r/.agister/workflows/child.yaml":  simpleChild,
	}), nil)
	started, release, finished := make(chan struct{}), make(chan struct{}), make(chan struct{})
	var unblock sync.Once
	f.runtimes.bash.answer = func(ctx context.Context, turn bash.Turn) (bash.Ended, error) {
		close(started)
		<-release
		return echoes(ctx, turn)
	}
	done := make(chan ran, 1)
	go func() {
		defer close(finished)
		done <- f.run(t, "/r", "run", "parent")
	}()
	t.Cleanup(func() { unblock.Do(func() { close(release) }); <-finished })
	<-started
	unfinished := f.store.last(t)
	want := []runstore.Child{{ID: unfinished.ID + "/tests", Parent: unfinished.ID, Workflow: "child", Params: map[string]string{}, Inputs: []runstore.Input{}, Status: "lost"}}
	if unfinished.Status != "lost" || !reflect.DeepEqual(unfinished.Children, want) {
		t.Fatalf("unfinished root %s, children %+v, want %+v", unfinished.Status, unfinished.Children, want)
	}
	unblock.Do(func() { close(release) })
	got := <-done
	if got.code != 0 || got.stderr != "" {
		t.Fatalf("run %+v", got)
	}
	want[0].Status, want[0].Output = "completed", 0
	ended := f.store.last(t)
	if ended.Status != "completed" || !reflect.DeepEqual(ended.Children, want) {
		t.Fatalf("ended root %s, children %+v, want %+v", ended.Status, ended.Children, want)
	}
	if unfinished.Children[0].Status != "lost" {
		t.Fatal("rewriting the child changed the unfinished snapshot")
	}
}

// Contract test: the runtime settings shipped in home.
func TestComposedChildStepsReceiveDeclaredInputsOverBoundAndDefaultedParams(t *testing.T) {
	t.Parallel()
	for _, c := range []struct{ name, bindings, file, revision string }{
		{"bound", "{path: bound.md, rev: feature}", "bound.md", "feature"},
		{"defaulted", "{}", "default.md", "trunk"},
		{"mixed", "{path: bound.md}", "bound.md", "trunk"},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			f := newRunFixture(t, runSettings(t, map[string]string{
				"/r/.agister/workflows/parent.yaml": "schema: agister.workflow/v1alpha1\nparams: {path: {default: outer.md}, rev: {default: outer}}\nsteps:\n - {name: tests, workflow: child, inputs: " + c.bindings + "}\n",
				"/r/.agister/workflows/child.yaml": `schema: agister.workflow/v1alpha1
params: {path: {default: default.md}, rev: {default: trunk}}
inputs:
 brief: {source: file, path: {from: params.path}}
 revision: {source: git.revision, rev: {from: params.rev}}
steps:
 - {name: read_brief, process: say, agent: bash, inputs: {what: {from: inputs.brief}}}
 - {name: read_revision, process: say, agent: bash, inputs: {what: {from: inputs.revision}}}
`,
			}), echoes)
			f.sources.files = map[string]string{"/r/" + c.file: "brief from " + c.file}
			f.sources.commits = map[string]string{c.revision: "commit-of-" + c.revision}
			got := f.run(t, "/r", "run", "parent")
			if got.code != 0 || got.stderr != "" {
				t.Fatalf("run %+v", got)
			}
			calls := itemCalls(f.store.last(t))
			for step, value := range map[string]string{"tests/read_brief": "brief from " + c.file, "tests/read_revision": "commit-of-" + c.revision} {
				if input := recordedInput(t, calls[step], "what"); input != value {
					t.Errorf("%s received %q, want %q", step, input, value)
				}
			}
			if asked := f.sources.askedOf(); !slices.Equal(asked, []string{"bytes /r/" + c.file, "commit " + c.revision + " in /r"}) {
				t.Errorf("sources %v", asked)
			}
		})
	}
}

// Contract test: the runtime settings shipped in home.
func TestUnsupportedChildWorkflowsRefuseTheParentBeforeItsFirstCall(t *testing.T) {
	t.Parallel()
	for _, c := range []struct{ name, child, line string }{
		{"input source", strings.Replace(simpleChild, "steps:", "inputs: {diff: {source: git.diff}}\nsteps:", 1), `the input "diff" from the source "git.diff"`},
		{"parallel branch", `schema: agister.workflow/v1alpha1
steps:
 - name: together
   parallel:
    - name: choose
      branch:
       - {name: draft, process: say, agent: bash, inputs: {what: child}, outputs: {value: {from: steps.draft.outputs}}}
outputs: {output: {from: steps.together.outputs}}
`, `the item "choose", a branch,`},
		{"parallel repeat", `schema: agister.workflow/v1alpha1
steps:
 - name: together
   parallel:
    - name: rounds
      repeat:
       state: {}
       steps:
        - {name: draft, process: say, agent: bash, inputs: {what: child}}
       next: {}
       until: {equals: [{from: steps.draft.outputs.exit_code}, 0]}
       max: 2
outputs: {output: {from: steps.together.outputs}}
`, `the item "rounds", a repeat,`},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			f := newRunFixture(t, runSettings(t, map[string]string{
				"/r/.agister/workflows/parent.yaml": `schema: agister.workflow/v1alpha1
steps:
 - {name: before, process: say, agent: bash, inputs: {what: parent}}
 - {name: tests, workflow: child}
 - {name: tests_again, workflow: child}
`,
				"/r/.agister/workflows/child.yaml": c.child,
			}), echoes)
			line := `the workflow "child": ` + c.line + " is not run yet"
			run := f.run(t, "/r", "run", "parent")
			if run.code != 1 || strings.Count(run.stderr, line) != 1 || len(f.runtimes.bash.ran()) != 0 || len(f.store.records) != 0 {
				t.Fatalf("run %+v, calls %v, records %v", run, f.runtimes.bash.ran(), f.store.records)
			}
			check := f.run(t, "/r", "check")
			if check.code != 1 || !strings.Contains(check.stdout, "/r/.agister/workflows/child.yaml: "+line) || !strings.Contains(check.stdout, "refuses workflow child, workflow parent") {
				t.Errorf("check %+v", check)
			}
			inspect := f.run(t, "/r", "inspect", "workflow", "parent")
			if inspect.code != 0 || !strings.Contains(inspect.stdout, line) || !strings.Contains(inspect.stdout, "\nrefused\n") || strings.Contains(inspect.stdout, "plan of ") {
				t.Errorf("inspect %+v", inspect)
			}
		})
	}
}

// Contract test: the runtime settings shipped in home.
func TestChildRecordsAndEventsKeepEveryOutputTypeWhole(t *testing.T) {
	t.Parallel()
	for _, c := range []struct {
		name  string
		value any
	}{
		{"number", float64(0)}, {"text", "review"}, {"boolean", false},
		{"collection", []any{float64(1), "two", nil}},
		{"mapping", map[string]any{"verdict": "approve"}}, {"null", nil},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			f := newRecordFixture(t, modelSettings(t, map[string]string{
				"/r/.agister/workflows/parent.yaml": `schema: agister.workflow/v1alpha1
steps: [{name: tests, workflow: child}]
outputs: {result: {from: steps.tests.outputs}}
`,
				"/r/.agister/workflows/child.yaml": `schema: agister.workflow/v1alpha1
steps: [{name: draft, process: ask, agent: claude-opus, inputs: {q: why}}]
outputs: {output: {from: steps.draft.outputs.value}}
`,
			}), nil)
			data, err := json.Marshal(map[string]any{"value": c.value})
			if err != nil {
				t.Fatal(err)
			}
			f.validator = &validatorSpy{}
			f.runtimes.claude.answer = claudeReply(claudecode.Reply{Output: data})
			got := f.run(t, "/r", "run", "parent")
			if got.code != 0 || got.stderr != "" {
				t.Fatalf("run %+v", got)
			}
			record := f.store.last(t)
			children := asJSON(t, record)["children"].([]any)
			if len(children) != 1 {
				t.Fatalf("children %v", children)
			}
			child := children[0].(map[string]any)
			output, present := child["output"]
			if child["status"] != "completed" || !present || !reflect.DeepEqual(output, c.value) {
				t.Errorf("child %v, want output %#v", child, c.value)
			}
			var ended []map[string]any
			for _, event := range f.store.events {
				if event.event.Kind == runstore.ChildEnded {
					ended = append(ended, asJSON(t, event.event))
				}
			}
			if len(ended) != 1 {
				t.Fatalf("child ends %v", ended)
			}
			output, present = ended[0]["output"]
			if ended[0]["status"] != "completed" || !present || !reflect.DeepEqual(output, c.value) {
				t.Errorf("child end %v, want output %#v", ended[0], c.value)
			}
		})
	}
}

// Contract test: the workflow and brief settings shipped in home.
func TestChildWorkflowDefinitionsAndBoundaryBriefsAreArchivedWithTheRun(t *testing.T) {
	t.Parallel()
	f := newWorkflowItemFixture(t, 1)
	f.settings["/r/.agister/workflows/lens.yaml"] = strings.Replace(itemLens, "steps:", "inputs: {brief: {source: file, path: g.md, form: [goal]}}\nsteps:", 1)
	f.runItem(t)
	want := []runstore.Definition{
		definitionAt(f.settings, "brief", "goal", "home", "/u/.agister/brief-forms/goal.yaml"),
		definitionAt(f.settings, "workflow", "lens", "repository", "/r/.agister/workflows/lens.yaml"),
		definitionAt(f.settings, "workflow", "reviewed", "repository", "/r/.agister/workflows/reviewed.yaml"),
	}
	if got := f.store.last(t).Request.Definitions; !reflect.DeepEqual(got, want) {
		t.Fatalf("definitions %+v, want %+v", got, want)
	}
	assertDefinitionBytes(t, f.runFixture)
}

// Contract test: the runtime settings shipped in home.
func TestAChildWithAMissingInputFileIsRecordedAsAFailedChildRun(t *testing.T) {
	t.Parallel()
	for _, parallel := range []bool{false, true} {
		t.Run(fmt.Sprintf("parallel %t", parallel), func(t *testing.T) {
			t.Parallel()
			missing := filepath.Join(t.TempDir(), "missing.md")
			item := fmt.Sprintf("{name: tests, workflow: child, inputs: {path: %q}}", missing)
			if parallel {
				item = "{name: reviews, parallel: [" + item + "]}"
			}
			f := newRunFixture(t, runSettings(t, map[string]string{
				"/r/.agister/workflows/parent.yaml": "schema: agister.workflow/v1alpha1\nsteps: [" + item + "]\n",
				"/r/.agister/workflows/child.yaml":  "schema: agister.workflow/v1alpha1\nparams: {path: {}}\ninputs: {brief: {source: file, path: {from: params.path}}}\nsteps: [{name: draft, process: say, agent: bash, inputs: {what: {from: inputs.brief}}}]\n",
			}), echoes)
			got := f.run(t, "/r", "run", "parent")
			if got.code != 1 || !strings.Contains(got.stdout, missing) || len(f.runtimes.bash.ran()) != 0 {
				t.Fatalf("run %+v, calls %v", got, f.runtimes.bash.ran())
			}
			record := f.store.last(t)
			class := "refused"
			want := []runstore.Child{{ID: record.ID + "/tests", Parent: record.ID, Workflow: "child", Params: map[string]string{"path": missing}, Inputs: []runstore.Input{}, Status: "failed", Class: &class}}
			if record.Status != "failed" || !reflect.DeepEqual(record.Children, want) {
				t.Fatalf("root %s, children %+v, want %+v", record.Status, record.Children, want)
			}
			children := asJSON(t, record)["children"]
			wantJSON := []any{map[string]any{
				"id": record.ID + "/tests", "parent": record.ID, "workflow": "child",
				"params": map[string]any{"path": missing}, "inputs": []any{},
				"status": "failed", "class": "refused", "output": nil,
			}}
			if !reflect.DeepEqual(children, wantJSON) {
				t.Errorf("serialized children %v, want %v", children, wantJSON)
			}
			var events []map[string]any
			for _, event := range f.store.events {
				if event.event.Kind == runstore.ChildStarted || event.event.Kind == runstore.ChildEnded {
					events = append(events, asJSON(t, event.event))
				}
			}
			if len(events) != 2 {
				t.Fatalf("child events %v", events)
			}
			if events[0]["kind"] != "child_started" || events[0]["step"] != "tests" || events[0]["workflow"] != "child" || !reflect.DeepEqual(events[0]["params"], map[string]any{"path": missing}) {
				t.Errorf("child start %v", events[0])
			}
			if events[1]["kind"] != "child_ended" || events[1]["step"] != "tests" || events[1]["status"] != "failed" || events[1]["class"] != "refused" || events[1]["output"] != nil {
				t.Errorf("child end %v", events[1])
			}
		})
	}
}
