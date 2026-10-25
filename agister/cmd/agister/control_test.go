package main

import (
	"maps"
	"reflect"
	"slices"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/core/call"
	"github.com/igor1309/ai-labs/agister/core/workflow"
	"github.com/igor1309/ai-labs/agister/settings/documents"
	"github.com/igor1309/ai-labs/agister/settings/resolve"
)

// Contract test: the files home holds, as Agister ships them.
func TestEveryBranchArmAndBodyStepHasItsExecutablePlan(t *testing.T) {
	t.Parallel()
	f := newLoopFixture(t, nil)
	spies := newRuntimesSpy(t)
	contracts, err := newContracts(bashFacts(spies.bash), codexFacts(spies.codex), claudeCodeFacts(spies.claude))
	if err != nil {
		t.Fatal(err)
	}
	read, err := readSettings("/u/.agister", "/r", newFilesystemSpy(f.settings), rootSpy{root: "/r"}, contracts)
	if err != nil {
		t.Fatal(err)
	}
	resolved, faults := read.resolver.Resolve(resolve.Document(resolve.KindWorkflow, "tested").WithParams("brief"))
	if len(faults) > 0 {
		t.Fatalf("faults %+v", faults)
	}
	built, unrun, err := planOf("tested", resolved, read.documents, map[string]call.Inputs{"bash/1": call.InEnvironment, "codex/2": call.InMessage, "claude-code/3": call.InMessage})
	if err != nil || len(unrun) > 0 {
		t.Fatalf("unrun %v, error %v", unrun, err)
	}
	want := []string{"build", "done", "repair_tests", "retest", "test"}
	if got := slices.Sorted(maps.Keys(built.calls)); !slices.Equal(got, want) {
		t.Fatalf("plans %v, want %v", got, want)
	}
	for _, name := range want {
		planned := built.calls[name]
		if len(planned.definitions) == 0 || len(planned.permissions.Granted) == 0 {
			t.Errorf("step %s plan %+v", name, planned)
		}
	}
	for _, name := range []string{"build", "repair_tests"} {
		if !built.calls[name].chained {
			t.Errorf("%s may reuse a call in the session chain", name)
		}
	}
}

// Contract test: the files home holds, as Agister ships them.
func TestUnsupportedItemsAreFoundInsideBranchesAndBodies(t *testing.T) {
	t.Parallel()
	for _, c := range []struct{ name, workflow, line string }{
		{"unselected arm runtime", strings.Replace(testedWorkflow, "name: done, process: pass, agent: bash", "name: done, process: pass, agent: pi-m3", 1), `the step "done": the runtime "pi"'s turn is not run yet`},
		{"repeat body runtime", strings.Replace(testedWorkflow, "name: retest, process: tests, agent: bash", "name: retest, process: tests, agent: pi-m3", 1), `the step "retest": the runtime "pi"'s turn is not run yet`},
		{"body workflow runtime", strings.Replace(testedWorkflow, "name: retest, process: tests, agent: bash", "name: retest, workflow: checks", 1), `the step "run_checks": the runtime "pi"'s turn is not run yet`},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			f := newLoopFixture(t, nil)
			f.settings["/r/.agister/workflows/tested.yaml"] = c.workflow
			f.settings["/r/.agister/workflows/checks.yaml"] = `schema: agister.workflow/v1alpha1
steps:
 - {name: run_checks, process: tests, agent: pi-m3}
outputs:
 exit_code: {from: steps.run_checks.outputs.exit_code}
 stdout: {from: steps.run_checks.outputs.stdout}
`
			checked := f.run(t, "/r", "check")
			run := f.run(t, "/r", "run", "tested", "--param", "brief=b.md")
			if checked.code != 1 || !strings.Contains(checked.stdout, c.line) || run.code != 1 || !strings.Contains(run.stderr, c.line) || len(f.calls) > 0 {
				t.Fatalf("check %+v, run %+v, calls %v", checked, run, f.calls)
			}
		})
	}
}

// Contract test: the files home holds, as Agister ships them.
func TestAStepNamedWithASlashRunsItsOwnPlan(t *testing.T) {
	t.Parallel()
	for _, c := range []struct{ name, parallel string }{
		{"beside its prefix", "{name: done, process: pass, agent: bash}\n       - {name: done/unit, process: implement, agent: codex-sol-61, inputs: {brief: {from: params.brief}}}"},
		{"alone", "{name: done/unit, process: implement, agent: codex-sol-61, inputs: {brief: {from: params.brief}}}"},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			f := newLoopFixture(t, []int{0})
			f.settings["/r/.agister/workflows/tested.yaml"] = strings.Replace(testedWorkflow, "{name: done, process: pass, agent: bash}", c.parallel, 1)
			got := f.run(t, "/r", "run", "tested", "--param", "brief=b.md")
			if got.code != 0 {
				t.Fatalf("ran %+v", got)
			}
			processes := map[string]string{}
			for _, called := range f.store.last(t).Calls {
				processes[called.Step] = called.Process
			}
			if processes["done/unit"] != "implement" || strings.Contains(c.parallel, "name: done,") && processes["done"] != "pass" {
				t.Errorf("processes %v", processes)
			}
		})
	}
}

func TestWorkflowConditionMapsEveryNestedCondition(t *testing.T) {
	t.Parallel()
	field := func(condition documents.Condition) documents.Field[documents.Condition] {
		return documents.Field[documents.Condition]{Value: condition, Given: true}
	}
	reads := func(root documents.Root, name, f string) documents.Field[documents.Reference] {
		return documents.Field[documents.Reference]{Value: documents.Reference{Root: root, Name: name, Field: f}, Given: true}
	}
	equals := documents.Condition{Operator: "equals", Reads: reads(documents.ReadsOutputs, "test", "exit_code"), Equals: documents.Field[any]{Value: 0, Given: true}}
	present := documents.Condition{Operator: "present", Reads: reads(documents.ReadsItem, "", "fixed")}
	all := documents.Condition{Operator: "all", Reads: reads(documents.ReadsState, "review", "findings"), Of: []documents.Field[documents.Condition]{field(present)}}
	nested := documents.Condition{Operator: "or", Of: []documents.Field[documents.Condition]{
		field(documents.Condition{Operator: "not", Of: []documents.Field[documents.Condition]{field(equals)}}),
		field(documents.Condition{Operator: "and", Of: []documents.Field[documents.Condition]{field(all), field(documents.Condition{Operator: "any", Reads: all.Reads, Of: all.Of})}}),
	}}
	wantEquals := workflow.Condition{Operator: "equals", Reads: workflow.Reference{Of: workflow.Outputs, Name: "test", Field: "exit_code"}, Equals: 0}
	wantPresent := workflow.Condition{Operator: "present", Reads: workflow.Reference{Of: workflow.QueryItem, Field: "fixed"}}
	wantReads := workflow.Reference{Of: workflow.State, Name: "review", Field: "findings"}
	want := workflow.Condition{Operator: "or", Of: []workflow.Condition{
		{Operator: "not", Of: []workflow.Condition{wantEquals}},
		{Operator: "and", Of: []workflow.Condition{
			{Operator: "all", Reads: wantReads, Of: []workflow.Condition{wantPresent}},
			{Operator: "any", Reads: wantReads, Of: []workflow.Condition{wantPresent}},
		}},
	}}
	if got := workflowCondition(nested); !reflect.DeepEqual(got, want) {
		t.Fatalf("mapped %+v, want %+v", got, want)
	}
}
