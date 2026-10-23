package main

import (
	"maps"
	"slices"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/core/call"
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
		{"body workflow", strings.Replace(testedWorkflow, "name: retest, process: tests, agent: bash", "name: retest, workflow: checks", 1), `the workflow "tested": the item "retest", a workflow, is not run yet`},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			f := newLoopFixture(t, nil)
			f.settings["/r/.agister/workflows/tested.yaml"] = c.workflow
			f.settings["/r/.agister/workflows/checks.yaml"] = `schema: agister.workflow/v1alpha1
steps:
 - {name: run_checks, process: tests, agent: bash}
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
