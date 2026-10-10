package app_test

import (
	"context"
	"reflect"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/contract"
	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

// What check says of the agent a node binds its process to (ADR-030 rule
// 8), over the harness's spies. Every runtime answers as the harness's
// runner does: version 1.2.3, and sessions it resumes unless a case says
// otherwise.

// onAgentC is the harness on the workflow tests' settings with agent c,
// agent a but for its name and the runtime mapping it runs on, and node two
// of workflow w bound to it. Workflow v, w but for its name, binds no node.
func onAgentC(runtime string) *harness {
	h := newHarness()
	h.defs.docs = workflowDocs()
	h.defs.docs[definition.KindAgent]["c"] = strings.NewReplacer(`name = "a"`, `name = "c"`, `runtime = "rt"`, `runtime = "`+runtime+`"`).Replace(settingsDocs()[definition.KindAgent]["a"])
	h.defs.docs[definition.KindWorkflow]["w"] = boundTo(workflowDoc, "two", "second", "c")
	h.defs.docs[definition.KindWorkflow]["v"] = strings.Replace(workflowDoc, "name: w", "name: v", 1)
	return h
}

// oneOf is a runtime mapping that grants a call one of the primitives
// given, each as "Name: {grants: [...], verified: [...]}".
func oneOf(name string, primitives ...string) string {
	return `schema: agister.runtime/v1alpha1
name: ` + name + `
adapter: spy
contract: spy/1
efforts: [high]
primitives:
  select: one
  items:
    ` + strings.Join(primitives, "\n    ") + "\n"
}

// bash grants process.execute, which no node's process allows.
const bash = `Bash: {grants: [process.execute, repository.read], verified: ["1."]}`

// repairingSecond has process second, which sets no session, repair in its
// call's session, and agents a and c resumable.
func repairingSecond(h *harness) {
	h.defs.docs[definition.KindService]["service"] += "max_verify_attempts = 3\n"
	h.defs.docs[definition.KindProcess]["second"] = strings.Replace(nodeProcess("second", "Work as second."),
		"  revision: candidate_revision\n", "  revision: candidate_revision\n  clean: true\n", 1) + verifyBlock
	for _, agent := range []string{"a", "c"} {
		h.defs.docs[definition.KindAgent][agent] += "session = \"resumable\"\n"
	}
}

// ADR-030 rule 8: check resolves every node of every workflow as its call
// would, on the agent the node binds: the plan, and whether the session
// may be resumed, first as the settings say and, where it asks the
// runtimes, on the version installed. A binding that cannot run is a
// problem of the workflow, which names the node: it refuses that workflow,
// and neither the process nor workflow v, which binds the same process to
// the agent that runs it.
func TestCheckJudgesEachBindingOfAWorkflow(t *testing.T) {
	t.Parallel()
	const (
		node    = "workflow w: fan-out node two: process second: "
		repairs = "verify.max_attempts 3 repairs in the call's session, but "
	)
	cases := []struct {
		name    string
		arrange func() *harness
		// probe: the problem is found only where check asks the runtimes.
		probe bool
		want  string
		// beside is the process's own problem on the agent it names, which
		// the same runtime answer gives.
		beside string
	}{
		{name: "no primitive of the agent's runtime is within what the process allows",
			arrange: func() *harness {
				h := onAgentC("narrow")
				h.defs.docs[definition.KindRuntime]["narrow"] = oneOf("narrow", bash)
				return h
			},
			want: node + "cannot run on agent c's runtime narrow: cannot enforce the effective permissions: Bash also grants process.execute"},
		{name: "the agent is fresh-only, and the process repairs",
			arrange: func() *harness {
				h := onAgentC("rt")
				repairingSecond(h)
				h.defs.docs[definition.KindAgent]["c"] = strings.Replace(h.defs.docs[definition.KindAgent]["c"], "resumable", "fresh-only", 1)
				return h
			},
			want: node + repairs + "agent c is fresh-only"},
		{name: "the installed version verifies no primitive within what the process allows",
			arrange: func() *harness {
				h := onAgentC("split")
				h.defs.docs[definition.KindRuntime]["split"] = oneOf("split", `Read: {grants: [repository.read], verified: ["2."]}`, bash)
				return h
			},
			probe: true,
			want:  node + "cannot run on agent c's runtime split version 1.2.3: cannot enforce the effective permissions: Bash also grants process.execute (not verified for version 1.2.3: Read)"},
		{name: "the runtime cannot resume a session, and the process repairs",
			arrange: func() *harness {
				h := onAgentC("rt")
				repairingSecond(h)
				h.runner.identity.Resume = false
				return h
			},
			probe:  true,
			want:   node + repairs + "runtime rt cannot resume sessions",
			beside: "process second: " + repairs + "runtime rt cannot resume sessions"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			check := func(probe bool) contract.CheckReport {
				h := c.arrange()
				report, err := h.clientOn(h.defs).Check(context.Background(), probe)
				if err != nil {
					t.Fatal(err)
				}
				return report
			}
			if c.probe {
				if report := check(false); len(report.Problems) != 0 {
					t.Fatalf("before the runtimes are asked: problems = %q", messages(report.Problems))
				}
			}
			report := check(c.probe)
			want := []string{c.want}
			if c.beside != "" {
				want = []string{c.beside, c.want}
			}
			if !reflect.DeepEqual(messages(report.Problems), want) {
				t.Fatalf("problems = %q, want %q", messages(report.Problems), want)
			}
			reach := reachOf(t, report, c.want)
			if reach.Subject == nil || *reach.Subject != (contract.DefinitionRef{Kind: "workflows", Name: "w"}) || reach.Agent != "" || reach.Stops {
				t.Fatalf("the problem is of %+v, agent %q, stops %v; want workflow w's alone", reach.Subject, reach.Agent, reach.Stops)
			}
			if len(reach.Processes) != 0 || !reflect.DeepEqual(reach.Workflows, []string{"w"}) {
				t.Fatalf("reach = %+v, want workflow w and no process", reach)
			}
			// The process's own problem is of the agent it names: it refuses
			// its own calls, and workflow v's, not those of w's node.
			if c.beside != "" {
				if reach := reachOf(t, report, c.beside); reach.Agent != "a" || !reflect.DeepEqual(reach.Processes, []string{"second"}) || !reflect.DeepEqual(reach.Workflows, []string{"v"}) {
					t.Fatalf("the process's problem reaches %+v, want agent a, process second and workflow v", reach)
				}
			}
		})
	}
}

// A workflow whose binding check finds unable to run is listed and shown
// as refused, and its run is refused before any node's, with the problem
// as check reports it; workflow v, which binds the same process to the
// agent that runs it, is not.
func TestAWorkflowWithABindingThatCannotRunIsRefused(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	h := onAgentC("narrow")
	h.defs.docs[definition.KindRuntime]["narrow"] = oneOf("narrow", bash)
	client := h.clientOn(h.defs)
	const want = "workflow w (mem/workflows/w): fan-out node two: process second: cannot run on agent c's runtime narrow: cannot enforce the effective permissions: Bash also grants process.execute"
	workflows, err := client.ListWorkflows(ctx)
	if err != nil || len(workflows) != 2 {
		t.Fatalf("workflows = %+v, %v", workflows, err)
	}
	refusals := map[string]string{}
	for _, workflow := range workflows {
		refusals[workflow.Name] = workflow.Refusal
	}
	if !reflect.DeepEqual(refusals, map[string]string{"v": "", "w": want}) {
		t.Fatalf("refusals = %q, want workflow w's alone: %s", refusals, want)
	}
	if view, err := client.ShowWorkflow(ctx, "w"); err != nil || view.Refusal != want {
		t.Fatalf("show says %q, %v; want %q", view.Refusal, err, want)
	}
	record := h.submit(t, client, contract.CallRequest{Process: "w", Params: map[string]string{"candidate": "c"}})
	if class(record) != run.ClassRefused || message(record) != want || len(h.recorder.created) != 1 || len(h.runner.calls()) != 0 {
		t.Fatalf("workflow: %s %q, %d runs, %d turns; want refused before any node: %q", class(record), message(record), len(h.recorder.created), len(h.runner.calls()), want)
	}
}
