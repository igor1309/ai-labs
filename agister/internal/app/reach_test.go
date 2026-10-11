package app_test

import (
	"context"
	"errors"
	"reflect"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/contract"
	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

// What a problem in the settings refuses (ADR-015), through the client as
// NewClient assembles it behind its gate, over the harness's spies.

// clientOn is the whole client over the harness, both settings layers read
// from defs.
func (h *harness) clientOn(defs app.GateDefinitions) contract.Client {
	return h.clientWith(defs, nil)
}

// clientWith is clientOn whose resolver and listings read what the problems
// refuse from checks in place of the Checker; nil is the Checker.
func (h *harness) clientWith(defs app.GateDefinitions, checks func(app.GateDefinitions) app.GateCheck) contract.Client {
	return app.NewClient(app.Infrastructure{
		Definitions: defs,
		Global:      defs,
		Settings:    app.SettingsAdapters{Writer: &writerSpy{}},
		Checker:     app.CheckAdapters{Validator: h.validator, Runtimes: h.runtimes, Probes: h.probes},
		Resolver:    app.ResolverAdapters{Identities: h.runtimes, Validator: h.validator, Probes: h.probes},
		Calls: app.CallAdapters{
			Runners:    h.runtimes,
			Inputs:     map[string]app.InputProvider{"git.revision": h.inputs, "git.diff": h.inputs, "file": h.inputs, "param": h.inputs},
			Workspaces: h.workspaces, Changes: h.changes, Validator: h.validator, Recorder: h.recorder, Runs: h.runs,
			Clock: h.clock, Timer: h.timer, IDs: fixedIDs{}, StateDir: "/state",
		},
		Holder:    app.HoldAdapters{Locks: h.locks, Worktrees: h.worktrees, Content: h.changes, Runs: h.runs, Reaper: h.reaper, Writers: h.writers},
		Verifier:  app.VerifyAdapters{Content: h.changes, Commands: h.commands, Clock: h.clock},
		Recoverer: app.RecoverAdapters{Clock: h.clock},
		Runs:      app.RunsAdapters{Reader: &readerSpy{record: run.Record{ID: "earlier"}, state: run.StateFinished}},
		Decorate:  func(client contract.Client) contract.Client { return client },
		Checks:    checks,
	})
}

// checkStub stands in for the checker the resolver and the listings
// read: it finds what it is given.
type checkStub struct{ found app.CheckResult }

func (s checkStub) Checked(context.Context) (app.CheckResult, error) { return s.found, nil }

// submit submits a call through client and waits for its record.
func (h *harness) submit(t *testing.T, client contract.Client, request contract.CallRequest) run.Record {
	t.Helper()
	request.Cwd = "/repo"
	if _, err := client.Submit(context.Background(), request); err != nil {
		t.Fatalf("submit %s: %v", request.Process, err)
	}
	return h.recorder.wait(t)
}

// callOf is a workflow of one call: node work binds process to agent.
func callOf(name, process, agent string) string {
	return "schema: agister.workflow/v1alpha1\nname: " + name + "\ntype: workflow\ncall: {node: work, uses: process:" + process + ", agent: " + agent + "}\n"
}

// withBrokenMapping adds runtime mapping bad, rt but for an adapter the
// code does not provide, agent b on it, process q, p by another name, and
// workflow q_b, whose call binds q to b.
func withBrokenMapping(docs map[definition.Kind]map[string]string) map[definition.Kind]map[string]string {
	docs[definition.KindRuntime]["bad"] = strings.Replace(strings.Replace(docs[definition.KindRuntime]["rt"], "name: rt", "name: bad", 1), "adapter: spy", "adapter: nowhere", 1)
	docs[definition.KindAgent]["b"] = strings.Replace(strings.Replace(docs[definition.KindAgent]["a"], `name = "a"`, `name = "b"`, 1), `runtime = "rt"`, `runtime = "bad"`, 1)
	docs[definition.KindProcess]["q"] = strings.Replace(settingsDocs()[definition.KindProcess]["p"], "name: p", "name: q", 1)
	docs[definition.KindWorkflow]["q_b"] = callOf("q_b", "q", "b")
	return docs
}

const badMapping = `runtime mapping bad: unknown adapter "nowhere" (available: spy)`

// reachOf is what check says the problem refuses.
func reachOf(t *testing.T, report contract.CheckReport, problem string) contract.ProblemReach {
	t.Helper()
	if len(report.Reach) != len(report.Problems) {
		t.Fatalf("reach %d of %d problems", len(report.Reach), len(report.Problems))
	}
	for i, reach := range report.Reach {
		if reach.Problem != report.Problems[i].Message {
			t.Fatalf("reach %d is of %q, not %q", i, reach.Problem, report.Problems[i].Message)
		}
		if reach.Problem == problem {
			return reach
		}
	}
	t.Fatalf("no problem %q in %v", problem, messages(report.Problems))
	return contract.ProblemReach{}
}

// A mapping no process uses refuses nothing: check fails on it and says
// so, and every call runs.
func TestAnUnusedBrokenDocumentRefusesNothing(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	h := newHarness()
	h.defs.docs[definition.KindRuntime]["unused"] = strings.Replace(strings.Replace(settingsDocs()[definition.KindRuntime]["rt"], "name: rt", "name: unused", 1), "adapter: spy", "adapter: nowhere", 1)
	client := h.clientOn(h.defs)

	report, err := client.Check(ctx, false)
	if err != nil {
		t.Fatal(err)
	}
	if reach := reachOf(t, report, `runtime mapping unused: unknown adapter "nowhere" (available: spy)`); reach.Stops || len(reach.Processes)+len(reach.Workflows) != 0 {
		t.Fatalf("reach = %+v, want nothing refused", reach)
	}
	if record := h.submit(t, client, contract.CallRequest{Process: "p_a"}); class(record) != "" || len(h.runner.calls()) != 1 {
		t.Fatalf("call of p: %s %s, %d turns", class(record), message(record), len(h.runner.calls()))
	}
	if runs, err := client.ListRuns(ctx); err != nil || len(runs) != 1 {
		t.Fatalf("runs = %v, %v", runs, err)
	}
}

// A call whose agent runs on a broken mapping is refused before its
// runtime is asked anything and recorded, naming the document, its path,
// its problem and the chain; the same process bound to another agent runs.
// The mapping refuses the workflow that binds the agent and no process: a
// process names no agent (ADR-030 rule 2).
func TestACallOnABrokenDocumentIsRefusedBeforeItsFirstTurn(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	h := newHarness()
	withBrokenMapping(h.defs.docs)
	h.bind("q_a", "q", "a")
	client := h.clientOn(h.defs)

	report, err := client.Check(ctx, false)
	if err != nil {
		t.Fatal(err)
	}
	if reach := reachOf(t, report, badMapping); reach.Stops || len(reach.Processes) != 0 || !reflect.DeepEqual(reach.Workflows, []string{"q_b"}) ||
		*reach.Subject != (contract.DefinitionRef{Kind: "runtimes", Name: "bad"}) {
		t.Fatalf("reach = %+v", reach)
	}

	record := h.submit(t, client, contract.CallRequest{Process: "q_b"})
	want := `workflow q_b uses agent b, which uses runtime mapping bad (mem/runtimes/bad): unknown adapter "nowhere" (available: spy)`
	if class(record) != run.ClassRefused || message(record) != want {
		t.Fatalf("call of q on agent b: %s %q, want %q", class(record), message(record), want)
	}
	if kinds := strings.Join(h.recorder.kinds(), " "); !strings.Contains(kinds, "REFUSED") || strings.Contains(kinds, "PLANNED") {
		t.Fatalf("events = %s", kinds)
	}
	if len(h.runner.calls()) != 0 || len(h.runtimes.asked) != 0 || len(h.runtimes.identified) != 0 {
		t.Fatalf("the runtime was reached: %d turns, asked %v, identified %v", len(h.runner.calls()), h.runtimes.asked, h.runtimes.identified)
	}

	if record := h.submit(t, client, contract.CallRequest{Process: "q_a"}); class(record) != "" || record.Agent != "a" {
		t.Fatalf("call of q on agent a: %s %s", class(record), message(record))
	}
	if record := h.submit(t, client, contract.CallRequest{Process: "p_a"}); class(record) != "" {
		t.Fatalf("call of p: %s %s", class(record), message(record))
	}
	if turns := len(h.runner.calls()); turns != 2 {
		t.Fatalf("%d turns, want the two calls that ran", turns)
	}
}

// A binding to an agent the settings lack is a problem of the workflow
// that makes it, and of nothing else: the process is bound to an agent
// that exists by another workflow, whose call runs.
//
// Until ADR-030 rule 2 a process named its agent, and this test was of a
// process naming agent ghost: a problem of the process that --agent a
// stepped over. A process names no agent now, so there is no such problem
// and nothing for a call to select: the binding is the workflow's.
func TestABindingToAMissingAgentIsItsWorkflowsProblem(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	h := newHarness()
	h.bind("p_ghost", "p", "ghost")
	client := h.clientOn(h.defs)

	report, err := client.Check(ctx, false)
	if err != nil {
		t.Fatal(err)
	}
	const problem = `workflow p_ghost: call node work: agent "ghost" does not exist`
	if reach := reachOf(t, report, problem); reach.Agent != "" || len(reach.Processes) != 0 || !reflect.DeepEqual(reach.Workflows, []string{"p_ghost"}) {
		t.Fatalf("reach = %+v", reach)
	}
	const refusal = `workflow p_ghost (mem/workflows/p_ghost): call node work: agent "ghost" does not exist`
	if view, err := client.ShowWorkflow(ctx, "p_ghost"); err != nil || view.Refusal != refusal {
		t.Fatalf("show p_ghost: %q, %v", view.Refusal, err)
	}
	if view, err := callShown(client, "p_a"); err != nil || view.Refusal != "" || view.Agent != "a" {
		t.Fatalf("show p on agent a: %+v, %v", view, err)
	}
	// The process has no problem of its own.
	if processes, err := client.ListProcesses(ctx); err != nil || len(processes) != 1 || processes[0].Refusal != "" {
		t.Fatalf("processes = %+v, %v", processes, err)
	}
	if record := h.submit(t, client, contract.CallRequest{Process: "p_ghost"}); class(record) != run.ClassRefused || message(record) != refusal {
		t.Fatalf("call of p on agent ghost: %s %s", class(record), message(record))
	}
	if record := h.submit(t, client, contract.CallRequest{Process: "p_a"}); class(record) != "" {
		t.Fatalf("call of p on agent a: %s %s", class(record), message(record))
	}
}

// NewClient gives the resolver and the listings what the checker found,
// each as it reads them: every document's path and uses, every workflow's
// bindings, every problem's message, and, to the resolver, the agent a
// problem depends on. A problem that stops every command is the gate's,
// not theirs.
func TestNewClientTranslatesWhatTheCheckerFound(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	h := newHarness()
	workflow := app.DocumentRef{Kind: definition.KindWorkflow, Name: "p_a"}
	process := app.DocumentRef{Kind: definition.KindProcess, Name: "p"}
	agent := app.DocumentRef{Kind: definition.KindAgent, Name: "a"}
	documents := []app.CheckedDocument{
		// A process names no agent (ADR-030 rule 2): the workflow whose
		// node binds it uses the agent, where the process did.
		{Ref: workflow, Path: "stub/workflows/p_a", Uses: []app.DocumentRef{process, agent}, Binds: []app.NodeBinding{{Process: "p", Agent: "a"}}},
		{Ref: process, Path: "stub/processes/p"},
		{Ref: agent, Path: "stub/agents/a"},
	}
	stubbed := func(dependsOn string) contract.Client {
		stub := checkStub{found: app.CheckResult{
			Documents: documents,
			Problems: []app.CheckedProblem{
				{Text: "process p: needs ghost", About: &process, Message: "needs ghost", Agent: dependsOn},
				{Text: "agent a: is stubbed", About: &agent, Message: "is stubbed"},
				{Text: "settings directory verifies: stops", Message: "stops"},
			},
		}}
		return h.clientWith(h.defs, func(app.GateDefinitions) app.GateCheck { return stub })
	}

	client := stubbed("")
	both := "workflow p_a uses process p (stub/processes/p): needs ghost; workflow p_a uses agent a (stub/agents/a): is stubbed"
	if view, err := client.ShowWorkflow(ctx, "p_a"); err != nil || view.Refusal != both {
		t.Fatalf("show p_a: %q, %v; want %q", view.Refusal, err, both)
	}
	if workflows, err := client.ListWorkflows(ctx); err != nil || len(workflows) != 1 || workflows[0].Refusal != both {
		t.Fatalf("workflows = %+v, %v", workflows, err)
	}
	// The process is listed with its own problem and not the agent's: only
	// the workflow depends on the agent.
	if processes, err := client.ListProcesses(ctx); err != nil || len(processes) != 1 || processes[0].Refusal != "process p (stub/processes/p): needs ghost" {
		t.Fatalf("processes = %+v, %v", processes, err)
	}
	// The process's problem depends on agent ghost; the call the workflow
	// binds to agent a does not have it.
	client = stubbed("ghost")
	if view, err := client.ShowWorkflow(ctx, "p_a"); err != nil || view.Refusal != "workflow p_a uses agent a (stub/agents/a): is stubbed" {
		t.Fatalf("show p_a, the problem depending on agent ghost: %q, %v", view.Refusal, err)
	}
}

// A workflow with a node on an agent that depends on a broken document is
// refused before any node runs; listings and views show it refused, and no
// process: none names an agent (ADR-030 rule 2).
func TestAWorkflowOnABrokenDocumentIsRefusedBeforeAnyNode(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	h := newHarness()
	h.defs.docs = withBrokenMapping(workflowDocs())
	h.defs.docs[definition.KindWorkflow]["w"] = boundTo(workflowDoc, "two", "second", "b")
	client := h.clientOn(h.defs)

	report, err := client.Check(ctx, false)
	if err != nil {
		t.Fatal(err)
	}
	if reach := reachOf(t, report, badMapping); len(reach.Processes) != 0 || !reflect.DeepEqual(reach.Workflows, []string{"q_b", "w"}) {
		t.Fatalf("reach = %+v", reach)
	}

	record := h.submit(t, client, contract.CallRequest{Process: "w", Params: map[string]string{"candidate": "c"}})
	want := `workflow w uses agent b, which uses runtime mapping bad (mem/runtimes/bad): unknown adapter "nowhere" (available: spy)`
	if class(record) != run.ClassRefused || message(record) != want {
		t.Fatalf("workflow: %s %q, want %q", class(record), message(record), want)
	}
	if record.Workflow != nil || len(h.recorder.created) != 1 || len(h.runner.calls()) != 0 || len(h.inputs.specs) != 0 {
		t.Fatalf("a node started: workflow %+v, %d runs, %d turns, %d inputs", record.Workflow, len(h.recorder.created), len(h.runner.calls()), len(h.inputs.specs))
	}

	view, err := client.ShowWorkflow(ctx, "w")
	if err != nil || view.Refusal != want || view.FanOut[0].Process.Refusal != "" || view.FanOut[1].Process.Refusal == "" {
		t.Fatalf("show: %+v, %v", view, err)
	}
	workflows, err := client.ListWorkflows(ctx)
	if err != nil {
		t.Fatal(err)
	}
	refusals := map[string]string{}
	for _, workflow := range workflows {
		refusals[workflow.Name] = workflow.Refusal
	}
	if !reflect.DeepEqual(refusals, map[string]string{"w": want, "q_b": strings.Replace(want, "workflow w", "workflow q_b", 1)}) {
		t.Fatalf("workflows = %+v", workflows)
	}
	processes, err := client.ListProcesses(ctx)
	if err != nil {
		t.Fatal(err)
	}
	refused := map[string]bool{}
	for _, process := range processes {
		refused[process.Name] = process.Refusal != ""
	}
	// Processes second and q were refused here while each named agent b.
	// Neither names an agent now: the mapping is their workflows' to
	// depend on, and no process is refused for it.
	if !reflect.DeepEqual(refused, map[string]bool{"first": false, "second": false, "joiner": false, "q": false}) {
		t.Fatalf("refused = %v", refused)
	}
}

// Listings, views, runs and writes run beside a broken document: a broken
// agent is listed as such, and a write that adds no problem is not refused
// for the problems already there.
func TestCommandsRunBesideABrokenDocument(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	h := newHarness()
	withBrokenMapping(h.defs.docs)
	h.defs.docs[definition.KindAgent]["z"] = "not an agent"
	client := h.clientOn(h.defs)

	agents, err := client.ListAgents(ctx)
	if err != nil {
		t.Fatal(err)
	}
	problems := map[string]string{}
	for _, agent := range agents {
		problems[agent.Name] = agent.Problem
	}
	if len(problems) != 3 || problems["a"] != "" || problems["b"] != "" || problems["z"] == "" {
		t.Fatalf("agents = %+v", agents)
	}
	if runs, err := client.ListRuns(ctx); err != nil || len(runs) != 1 || runs[0].ID != "earlier" {
		t.Fatalf("runs = %+v, %v", runs, err)
	}
	if _, err := client.Inspect(ctx, "earlier"); err != nil {
		t.Fatalf("inspect: %v", err)
	}
	if _, err := client.CreateAgent(ctx, contract.Agent{Name: "c", Runtime: "rt"}, false, nil); err != nil {
		t.Fatalf("a write that adds no problem: %v", err)
	}
}

// What no one document is at fault for stops every command but init,
// check, cancelling a run and following one admitted.
func TestProblemsNoDocumentOwnsStopEveryCommand(t *testing.T) {
	t.Parallel()
	sameName := workflowDocs()
	sameName[definition.KindProcess]["p"] = settingsDocs()[definition.KindProcess]["p"]
	sameName[definition.KindWorkflow]["p"] = strings.Replace(workflowDoc, "name: w", "name: p", 1)
	for _, tc := range []struct {
		name    string
		docs    map[definition.Kind]map[string]string
		listErr map[definition.Kind]error
		problem string
	}{
		{name: "broken service settings", docs: map[definition.Kind]map[string]string{definition.KindService: {"service": "not toml ="}}, problem: "service service: "},
		{name: "a file name that is not a name", docs: map[definition.Kind]map[string]string{definition.KindAgent: {"Not A Name": "x"}}, problem: `agent Not A Name: "Not A Name" is not a valid name`},
		{name: "a directory that cannot be listed", listErr: map[definition.Kind]error{definition.KindVerify: errors.New("permission denied")}, problem: "settings directory verifies: cannot be listed: permission denied"},
		{name: "blocks that cannot be listed", listErr: map[definition.Kind]error{definition.KindBlocks: errors.New("permission denied")}, problem: "blocks: cannot be listed: permission denied"},
		{name: "a workflow named like a process", docs: sameName, problem: "workflow p: a process has the same name"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			ctx := context.Background()
			h := newHarness()
			for kind, docs := range tc.docs {
				if h.defs.docs[kind] == nil {
					h.defs.docs[kind] = map[string]string{}
				}
				for name, text := range docs {
					h.defs.docs[kind][name] = text
				}
			}
			client := h.clientOn(failingSource{definitionsSpy: h.defs, listErr: tc.listErr})

			report, err := client.Check(ctx, false)
			if err != nil {
				t.Fatal(err)
			}
			stops := false
			for i, reach := range report.Reach {
				if strings.HasPrefix(report.Problems[i].Message, tc.problem) {
					stops = reach.Stops && reach.Subject == nil && reach.Processes == nil
				}
			}
			if !stops {
				t.Fatalf("no problem %q that stops every command: %+v", tc.problem, report.Reach)
			}

			refused := map[string]error{}
			_, refused["CreateAgent"] = client.CreateAgent(ctx, contract.Agent{Name: "c", Runtime: "rt"}, false, nil)
			_, refused["ListAgents"] = client.ListAgents(ctx)
			_, refused["ListProcesses"] = client.ListProcesses(ctx)
			_, refused["ShowProcess"] = callShown(client, "p_a")
			_, refused["ListWorkflows"] = client.ListWorkflows(ctx)
			_, refused["ShowWorkflow"] = client.ShowWorkflow(ctx, "w")
			_, refused["Submit"] = client.Submit(ctx, contract.CallRequest{Process: "p_a", Cwd: "/repo"})
			refused["Observe"] = client.Observe(ctx, "earlier", 0, func(contract.Event) error { return nil })
			_, refused["Inspect"] = client.Inspect(ctx, "earlier")
			_, refused["ListRuns"] = client.ListRuns(ctx)
			for name, err := range refused {
				var settings *contract.SettingsError
				if !errors.As(err, &settings) {
					t.Errorf("%s: %v", name, err)
				}
			}
			if len(h.recorder.created) != 0 || len(h.runner.calls()) != 0 {
				t.Fatalf("a call started: %d runs, %d turns", len(h.recorder.created), len(h.runner.calls()))
			}
			if err := client.Cancel(ctx, "earlier"); err == nil || errors.As(err, new(*contract.SettingsError)) {
				t.Fatalf("cancel was refused for the settings: %v", err)
			}
		})
	}
}

// Each problem of a check has a reference of its own: changing one a
// result returns changes no other checker's result.
func TestEachBlocksProblemHasItsOwnReference(t *testing.T) {
	t.Parallel()
	h := newHarness()
	// Home's blocks, as the spy reads every document: a problem about them.
	h.defs.docs[definition.KindBlocks] = map[string]string{"blocks": "schema: agister.blocks/v1alpha1\nblocks: []\n"}
	sources := []string{"git.revision", "git.diff"}
	want := app.DocumentRef{Kind: definition.KindBlocks, Name: "blocks"}
	about := func(result app.CheckResult) *app.DocumentRef {
		t.Helper()
		for _, problem := range result.Problems {
			if problem.About != nil && problem.About.Kind == definition.KindBlocks {
				return problem.About
			}
		}
		t.Fatalf("no problem about the blocks: %+v", result.Problems)
		return nil
	}

	first, err := app.NewChecker(h.defs, h.validator, h.runtimes, sources).Checked(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	*about(first) = app.DocumentRef{Kind: definition.KindAgent, Name: "changed"}

	second, err := app.NewChecker(h.defs, h.validator, h.runtimes, sources).Checked(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if got := *about(second); got != want {
		t.Fatalf("another checker's result is about %+v, want %+v", got, want)
	}
}

// usesOf are the documents check says the definition uses, as "kind name".
func usesOf(t *testing.T, report contract.CheckReport, kind, name string) []string {
	t.Helper()
	for _, found := range report.Definitions {
		if found.Kind == kind && found.Name == name {
			var uses []string
			for _, used := range found.Uses {
				uses = append(uses, used.Kind+" "+used.Name)
			}
			return uses
		}
	}
	t.Fatalf("check lists no %s %s", kind, name)
	return nil
}

// ADR-030 rules 5 and 10: a workflow is judged on the agents its nodes
// bind. A broken mapping that another workflow's agent runs on refuses that
// workflow and not this one, whose nodes bind the same processes to another
// agent. The agent a node binds is the workflow's to depend on: a broken
// one refuses the workflow, which names it, and not the process.
func TestAWorkflowIsJudgedOnTheAgentsItsNodesBind(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	refusalOf := func(t *testing.T, client contract.Client) string {
		t.Helper()
		view, err := client.ShowWorkflow(ctx, "w")
		if err != nil {
			t.Fatal(err)
		}
		workflows, err := client.ListWorkflows(ctx)
		if err != nil {
			t.Fatal(err)
		}
		for _, workflow := range workflows {
			if workflow.Name == "w" && workflow.Refusal == view.Refusal {
				return view.Refusal
			}
		}
		t.Fatalf("show says %q; the listing %+v", view.Refusal, workflows)
		return ""
	}

	// Until ADR-030 rule 2 this was of a process that named the broken
	// agent while the node bound it to another. No process names an agent
	// now: the broken one is bound by another workflow, q_b.
	t.Run("another workflow's agent is broken", func(t *testing.T) {
		t.Parallel()
		h := newHarness()
		h.defs.docs = withBrokenMapping(workflowDocs())
		h.bind("second_b", "second", "b")
		client := h.clientOn(h.defs)
		report, err := client.Check(ctx, false)
		if err != nil {
			t.Fatal(err)
		}
		if reach := reachOf(t, report, badMapping); len(reach.Processes) != 0 || !reflect.DeepEqual(reach.Workflows, []string{"q_b", "second_b"}) {
			t.Fatalf("reach = %+v, want workflows q_b and second_b and no process", reach)
		}
		if uses := usesOf(t, report, "workflows", "w"); !reflect.DeepEqual(uses, []string{"processes first", "agents a", "processes second", "processes joiner"}) {
			t.Fatalf("workflow w uses %v", uses)
		}
		if refusal := refusalOf(t, client); refusal != "" {
			t.Fatalf("the workflow is refused: %s", refusal)
		}
		if view, err := client.ShowWorkflow(ctx, "w"); err != nil || view.FanOut[1].Process.Agent != "a" || view.FanOut[1].Process.Refusal != "" {
			t.Fatalf("node two: %+v, %v", view.FanOut, err)
		}
	})

	t.Run("the agent its node binds is broken", func(t *testing.T) {
		t.Parallel()
		h := newHarness()
		h.defs.docs = withBrokenMapping(workflowDocs())
		h.defs.docs[definition.KindWorkflow]["w"] = boundTo(workflowDoc, "two", "second", "b")
		client := h.clientOn(h.defs)
		report, err := client.Check(ctx, false)
		if err != nil {
			t.Fatal(err)
		}
		if reach := reachOf(t, report, badMapping); len(reach.Processes) != 0 || !reflect.DeepEqual(reach.Workflows, []string{"q_b", "w"}) {
			t.Fatalf("reach = %+v, want workflows q_b and w and no process", reach)
		}
		want := `workflow w uses agent b, which uses runtime mapping bad (mem/runtimes/bad): unknown adapter "nowhere" (available: spy)`
		if refusal := refusalOf(t, client); refusal != want {
			t.Fatalf("refusal %q, want %q", refusal, want)
		}
		record := h.submit(t, client, contract.CallRequest{Process: "w", Params: map[string]string{"candidate": "c"}})
		if class(record) != run.ClassRefused || message(record) != want || len(h.recorder.created) != 1 || len(h.runner.calls()) != 0 {
			t.Fatalf("workflow: %s %q, %d runs; want refused before any node: %q", class(record), message(record), len(h.recorder.created), want)
		}
	})

	// The subtest "its process names an agent the settings lack" stood
	// here: a process naming agent ghost, a problem that depended on that
	// agent (ADR-015 rule 2) and that a node binding another stepped over.
	// A process names no agent (ADR-030 rule 2), so there is no such
	// problem; the old form itself is refused, as the definition package's
	// tests and check's show.

	// A node that names an agent the settings lack is a problem of its
	// workflow, and of nothing else.
	t.Run("its node names an agent the settings lack", func(t *testing.T) {
		t.Parallel()
		h := newHarness()
		h.defs.docs = workflowDocs()
		h.defs.docs[definition.KindWorkflow]["w"] = boundTo(workflowDoc, "two", "second", "ghost")
		client := h.clientOn(h.defs)
		report, err := client.Check(ctx, false)
		if err != nil {
			t.Fatal(err)
		}
		const problem = `workflow w: fan-out node two: agent "ghost" does not exist`
		if reach := reachOf(t, report, problem); len(reach.Processes) != 0 || !reflect.DeepEqual(reach.Workflows, []string{"w"}) {
			t.Fatalf("reach = %+v, want workflow w alone", reach)
		}
		if refusal := refusalOf(t, client); refusal != `workflow w (mem/workflows/w): fan-out node two: agent "ghost" does not exist` {
			t.Fatalf("refusal %q", refusal)
		}
	})
}

// NewClient gives the resolver and the listings each workflow's bindings
// as the checker found them: the workflow is refused for a block on the
// agent a node binds, and not for the problem its process has with the
// agent the process names.
func TestNewClientTranslatesTheBindingsTheCheckerFound(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	h := newHarness()
	h.defs.docs = workflowDocs()
	ref := func(kind definition.Kind, name string) app.DocumentRef {
		return app.DocumentRef{Kind: kind, Name: name}
	}
	workflow, second := ref(definition.KindWorkflow, "w"), ref(definition.KindProcess, "second")
	documents := func(binds ...app.NodeBinding) []app.CheckedDocument {
		return []app.CheckedDocument{
			{Ref: workflow, Path: "stub/workflows/w", Uses: []app.DocumentRef{second, ref(definition.KindAgent, "b")}, Binds: binds},
			{Ref: second, Path: "stub/processes/second", Uses: []app.DocumentRef{ref(definition.KindAgent, "a")}},
		}
	}
	problems := []app.CheckedProblem{{Text: "process second: needs a", About: &second, Message: "needs a", Agent: "a"}}
	blocks := []app.CheckedBlock{{Ref: ref(definition.KindAgent, "b"), Path: "stub/blocks.yaml", Reason: "not here"}}
	for name, c := range map[string]struct {
		binds []app.NodeBinding
		want  string
	}{
		"bound to agent b":      {[]app.NodeBinding{{Process: "second", Agent: "b"}}, "workflow w: agent b is blocked by stub/blocks.yaml: not here"},
		"on its process's own":  {[]app.NodeBinding{{Process: "second"}}, "workflow w uses process second (stub/processes/second): needs a; workflow w: agent b is blocked by stub/blocks.yaml: not here"},
		"on both, by two nodes": {[]app.NodeBinding{{Process: "second", Agent: "b"}, {Process: "second"}}, "workflow w uses process second (stub/processes/second): needs a; workflow w: agent b is blocked by stub/blocks.yaml: not here"},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			stub := checkStub{found: app.CheckResult{Documents: documents(c.binds...), Problems: problems, Blocks: blocks}}
			client := h.clientWith(h.defs, func(app.GateDefinitions) app.GateCheck { return stub })
			workflows, err := client.ListWorkflows(ctx)
			if err != nil || len(workflows) != 1 || workflows[0].Refusal != c.want {
				t.Fatalf("listed: %+v, %v; want %q", workflows, err, c.want)
			}
			if view, err := client.ShowWorkflow(ctx, "w"); err != nil || view.Refusal != c.want {
				t.Fatalf("show: %q, %v; want %q", view.Refusal, err, c.want)
			}
		})
	}
}
