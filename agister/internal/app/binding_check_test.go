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

// workflowWarnings are the warnings of the report about a workflow.
func workflowWarnings(report contract.CheckReport) []string {
	var warnings []string
	for _, warning := range report.Warnings {
		if strings.HasPrefix(warning, "workflow ") {
			warnings = append(warnings, warning)
		}
	}
	return warnings
}

// requiring has process second require permission, which it allows.
func requiring(h *harness, permission string) {
	second := strings.Replace(h.defs.docs[definition.KindProcess]["second"],
		"tools: {allow: [repository.read, repository.search, repository.diff]}\n", "tools:\n  allow: [repository.read, repository.search, repository.diff]\n", 1)
	h.defs.docs[definition.KindProcess]["second"] = second + "  require: [" + permission + "]\n"
}

// ADR-030 rule 8: check resolves every node of every workflow as its call
// would, on the agent the node binds: the plan, and whether the session
// may be resumed, first as the settings say and, where it asks the
// runtimes, on the version installed. A binding that cannot run, a
// permission in tools.require withheld among the reasons, is a problem of
// the workflow, which names the node, and no warning: it refuses that
// workflow, and neither the process nor workflow v, which binds the same
// process to the agent that runs it.
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
		{name: "no version of the agent's runtime gives a permission the process requires",
			arrange: func() *harness {
				h := onAgentC("reads")
				h.defs.docs[definition.KindRuntime]["reads"] = strings.Replace(reads, `    Grep: {grants: [repository.search], verified: ["2."]}`+"\n", "", 1)
				requiring(h, "repository.search")
				return h
			},
			want: node + "cannot run on agent c's runtime reads: cannot enforce the effective permissions: required permissions would be withheld: repository.search"},
		{name: "the installed version withholds a permission the process requires",
			arrange: func() *harness {
				h := onAgentC("reads")
				h.defs.docs[definition.KindRuntime]["reads"] = reads
				requiring(h, "repository.search")
				return h
			},
			probe: true,
			want:  node + "cannot run on agent c's runtime reads version 1.2.3: cannot enforce the effective permissions: required permissions would be withheld: repository.search (not verified for version 1.2.3: Grep)"},
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
		{name: "the runtime cannot enforce a cost limit, and the process sets one",
			arrange: func() *harness {
				h := onAgentC("rt")
				h.defs.docs[definition.KindProcess]["second"] += "max_cost_usd: 2\n"
				h.runner.identity.CostLimit = false
				return h
			},
			probe:  true,
			want:   node + "runtime rt cannot enforce the cost limit 2",
			beside: "process second: runtime rt cannot enforce the cost limit 2"},
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
			if !reflect.DeepEqual(messages(report.Problems), want) || len(workflowWarnings(report)) != 0 {
				t.Fatalf("problems = %q, warnings %q; want %q and no warning of a workflow", messages(report.Problems), report.Warnings, want)
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
// agent that runs it, is not. So is one whose binding would withhold a
// permission in tools.require (ADR-030 rule 8).
func TestAWorkflowWithABindingThatCannotRunIsRefused(t *testing.T) {
	t.Parallel()
	const refused = "workflow w (mem/workflows/w): fan-out node two: process second: "
	cases := []struct {
		name    string
		arrange func() *harness
		want    string
	}{
		{name: "no primitive of the agent's runtime is within what the process allows",
			arrange: func() *harness {
				h := onAgentC("narrow")
				h.defs.docs[definition.KindRuntime]["narrow"] = oneOf("narrow", bash)
				return h
			},
			want: refused + "cannot run on agent c's runtime narrow: cannot enforce the effective permissions: Bash also grants process.execute"},
		{name: "the agent's runtime withholds a permission the process requires",
			arrange: func() *harness {
				h := onAgentC("narrow")
				h.defs.docs[definition.KindRuntime]["narrow"] = oneOf("narrow", `Read: {grants: [repository.read], verified: ["1."]}`)
				requiring(h, "repository.search")
				return h
			},
			want: refused + "cannot run on agent c's runtime narrow: cannot enforce the effective permissions: required permissions would be withheld: repository.search"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			ctx := context.Background()
			h := c.arrange()
			client := h.clientOn(h.defs)
			workflows, err := client.ListWorkflows(ctx)
			if err != nil || len(workflows) != 2 {
				t.Fatalf("workflows = %+v, %v", workflows, err)
			}
			refusals := map[string]string{}
			for _, workflow := range workflows {
				refusals[workflow.Name] = workflow.Refusal
			}
			if !reflect.DeepEqual(refusals, map[string]string{"v": "", "w": c.want}) {
				t.Fatalf("refusals = %q, want workflow w's alone: %s", refusals, c.want)
			}
			if view, err := client.ShowWorkflow(ctx, "w"); err != nil || view.Refusal != c.want {
				t.Fatalf("show says %q, %v; want %q", view.Refusal, err, c.want)
			}
			record := h.submit(t, client, contract.CallRequest{Process: "w", Params: map[string]string{"candidate": "c"}})
			if class(record) != run.ClassRefused || message(record) != c.want || len(h.recorder.created) != 1 || len(h.runner.calls()) != 0 {
				t.Fatalf("workflow: %s %q, %d runs, %d turns; want refused before any node: %q", class(record), message(record), len(h.recorder.created), len(h.runner.calls()), c.want)
			}
		})
	}
}

// reads is a runtime mapping that grants a call repository.read on
// versions 1 and 2, and repository.search on version 2 alone.
const reads = `schema: agister.runtime/v1alpha1
name: reads
adapter: spy
contract: spy/1
efforts: [high]
primitives:
  select: any
  items:
    Read: {grants: [repository.read], verified: ["1.", "2."]}
    Grep: {grants: [repository.search], verified: ["2."]}
`

// ADR-030 rules 7 and 8: check plans every node of every workflow on the
// agent it binds, its process's own where it names none, first on the
// version of its runtime that gives the most and, where it asks the
// runtimes, on the version installed: it lists what each binding allows
// and does not require that the plan withholds, and each permission in
// tools.require it would withhold, which refuses the binding's workflow
// (TestCheckJudgesEachBindingOfAWorkflow) and is no warning.
func TestCheckListsWhatEachBindingWithholds(t *testing.T) {
	t.Parallel()
	onReads := func(require bool) *harness {
		h := onAgentC("reads")
		h.defs.docs[definition.KindRuntime]["reads"] = reads
		if require {
			requiring(h, "repository.search")
		}
		return h
	}
	check := func(h *harness, probe bool) contract.CheckReport {
		report, err := h.clientOn(h.defs).Check(context.Background(), probe)
		if err != nil {
			t.Fatal(err)
		}
		return report
	}
	// On agent a, runtime rt gives Read and Grep, never Bash, which grants
	// process.execute: repository.diff is withheld.
	onA := func(workflow, node, process, version string, withheld ...string) contract.Binding {
		return contract.Binding{Workflow: workflow, Node: node, Process: process, Agent: "a", Runtime: "rt", Version: version, Withheld: withheld}
	}
	bindings := func(version string, two contract.Binding) []contract.Binding {
		return []contract.Binding{
			onA("v", "one", "first", version, "repository.diff"), onA("v", "two", "second", version, "repository.diff"), onA("v", "merge", "joiner", version),
			onA("w", "one", "first", version, "repository.diff"), two, onA("w", "merge", "joiner", version),
		}
	}
	const refusal = "workflow w: fan-out node two: process second: cannot run on agent c's runtime reads version 1.2.3: cannot enforce the effective permissions: required permissions would be withheld: repository.search (not verified for version 1.2.3: Grep)"

	t.Run("allowed and not required", func(t *testing.T) {
		t.Parallel()
		report := check(onReads(false), true)
		want := bindings("1.2.3", contract.Binding{Workflow: "w", Node: "two", Process: "second", Agent: "c", Runtime: "reads", Version: "1.2.3", Withheld: []string{"repository.search", "repository.diff"}})
		if !reflect.DeepEqual(report.Bindings, want) {
			t.Fatalf("bindings = %+v\nwant %+v", report.Bindings, want)
		}
		if len(report.Problems) != 0 || len(report.Warnings) != 0 {
			t.Fatalf("problems %q, warnings %q; want none", messages(report.Problems), report.Warnings)
		}
	})
	t.Run("required, given on a version the runtime verifies", func(t *testing.T) {
		t.Parallel()
		report := check(onReads(true), false)
		want := bindings("1", contract.Binding{Workflow: "w", Node: "two", Process: "second", Agent: "c", Runtime: "reads", Version: "2", Withheld: []string{"repository.diff"}})
		if !reflect.DeepEqual(report.Bindings, want) {
			t.Fatalf("bindings = %+v\nwant %+v", report.Bindings, want)
		}
		if len(report.Problems) != 0 || len(report.Warnings) != 0 {
			t.Fatalf("problems %q, warnings %q; want none", messages(report.Problems), report.Warnings)
		}
	})
	t.Run("required, withheld on the version installed", func(t *testing.T) {
		t.Parallel()
		report := check(onReads(true), true)
		want := bindings("1.2.3", contract.Binding{Workflow: "w", Node: "two", Process: "second", Agent: "c", Runtime: "reads", Version: "1.2.3",
			Withheld: []string{"repository.diff"}, Required: []string{"repository.search"}})
		if !reflect.DeepEqual(report.Bindings, want) {
			t.Fatalf("bindings = %+v\nwant %+v", report.Bindings, want)
		}
		// A refusal of workflow w, not a warning (ADR-030 rule 8).
		if want := []string{refusal}; !reflect.DeepEqual(messages(report.Problems), want) || len(workflowWarnings(report)) != 0 {
			t.Fatalf("problems %q, warnings %q; want %q and no warning", messages(report.Problems), report.Warnings, want)
		}
	})
}
