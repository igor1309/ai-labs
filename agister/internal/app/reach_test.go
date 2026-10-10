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

// withBrokenMapping adds runtime mapping bad, rt but for an adapter the
// code does not provide, agent b on it, and process q, p but for agent b.
func withBrokenMapping(docs map[definition.Kind]map[string]string) map[definition.Kind]map[string]string {
	docs[definition.KindRuntime]["bad"] = strings.Replace(strings.Replace(docs[definition.KindRuntime]["rt"], "name: rt", "name: bad", 1), "adapter: spy", "adapter: nowhere", 1)
	docs[definition.KindAgent]["b"] = strings.Replace(strings.Replace(docs[definition.KindAgent]["a"], `name = "a"`, `name = "b"`, 1), `runtime = "rt"`, `runtime = "bad"`, 1)
	docs[definition.KindProcess]["q"] = strings.Replace(strings.Replace(settingsDocs()[definition.KindProcess]["p"], "name: p", "name: q", 1), "uses: agent:a", "uses: agent:b", 1)
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
	if record := h.submit(t, client, contract.CallRequest{Process: "p"}); class(record) != "" || len(h.runner.calls()) != 1 {
		t.Fatalf("call of p: %s %s, %d turns", class(record), message(record), len(h.runner.calls()))
	}
	if runs, err := client.ListRuns(ctx); err != nil || len(runs) != 1 {
		t.Fatalf("runs = %v, %v", runs, err)
	}
}

// A call whose agent runs on a broken mapping is refused before its
// runtime is asked anything and recorded, naming the document, its path,
// its problem and the chain; the same process with another agent runs.
func TestACallOnABrokenDocumentIsRefusedBeforeItsFirstTurn(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	h := newHarness()
	withBrokenMapping(h.defs.docs)
	client := h.clientOn(h.defs)

	report, err := client.Check(ctx, false)
	if err != nil {
		t.Fatal(err)
	}
	if reach := reachOf(t, report, badMapping); reach.Stops || !reflect.DeepEqual(reach.Processes, []string{"q"}) || reach.Workflows != nil ||
		*reach.Subject != (contract.DefinitionRef{Kind: "runtimes", Name: "bad"}) {
		t.Fatalf("reach = %+v", reach)
	}

	record := h.submit(t, client, contract.CallRequest{Process: "q"})
	want := `process q uses agent b, which uses runtime mapping bad (mem/runtimes/bad): unknown adapter "nowhere" (available: spy)`
	if class(record) != run.ClassRefused || message(record) != want {
		t.Fatalf("call of q: %s %q, want %q", class(record), message(record), want)
	}
	if kinds := strings.Join(h.recorder.kinds(), " "); !strings.Contains(kinds, "REFUSED") || strings.Contains(kinds, "PLANNED") {
		t.Fatalf("events = %s", kinds)
	}
	if len(h.runner.calls()) != 0 || len(h.runtimes.asked) != 0 || len(h.runtimes.identified) != 0 {
		t.Fatalf("the runtime was reached: %d turns, asked %v, identified %v", len(h.runner.calls()), h.runtimes.asked, h.runtimes.identified)
	}

	if record := h.submit(t, client, contract.CallRequest{Process: "q", Agent: "a"}); class(record) != "" || record.Agent != "a" {
		t.Fatalf("call of q as agent a: %s %s", class(record), message(record))
	}
	if record := h.submit(t, client, contract.CallRequest{Process: "p"}); class(record) != "" {
		t.Fatalf("call of p: %s %s", class(record), message(record))
	}
	if turns := len(h.runner.calls()); turns != 2 {
		t.Fatalf("%d turns, want the two calls that ran", turns)
	}
}

// A problem that depends on the agent is judged on the agent the call
// selects: the agent a process names does not exist, and --agent selects
// one that does. NewClient gives the resolver the agent the problem
// depends on, and the listings the problem as a call without --agent has
// it, each with the document's path and its problem without its name.
func TestAProblemOfTheAgentIsJudgedOnTheCallsAgent(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	h := newHarness()
	h.defs.docs[definition.KindProcess]["p"] = strings.Replace(settingsDocs()[definition.KindProcess]["p"], "uses: agent:a", "uses: agent:ghost", 1)
	client := h.clientOn(h.defs)

	report, err := client.Check(ctx, false)
	if err != nil {
		t.Fatal(err)
	}
	if reach := reachOf(t, report, `process p: agent "ghost" does not exist`); reach.Agent != "ghost" || !reflect.DeepEqual(reach.Processes, []string{"p"}) {
		t.Fatalf("reach = %+v", reach)
	}
	if view, err := client.ShowProcess(ctx, "p", ""); err != nil || view.Refusal != `process p (mem/processes/p): agent "ghost" does not exist` {
		t.Fatalf("show p: %q, %v", view.Refusal, err)
	}
	if view, err := client.ShowProcess(ctx, "p", "a"); err != nil || view.Refusal != "" || view.Agent != "a" {
		t.Fatalf("show p as agent a: %+v, %v", view, err)
	}
	// A listing shows the call without --agent, on the agent p names.
	if processes, err := client.ListProcesses(ctx); err != nil || len(processes) != 1 || processes[0].Refusal != `process p (mem/processes/p): agent "ghost" does not exist` {
		t.Fatalf("processes = %+v, %v", processes, err)
	}
	if record := h.submit(t, client, contract.CallRequest{Process: "p"}); class(record) != run.ClassRefused {
		t.Fatalf("call of p: %s %s", class(record), message(record))
	}
	if record := h.submit(t, client, contract.CallRequest{Process: "p", Agent: "a"}); class(record) != "" {
		t.Fatalf("call of p as agent a: %s %s", class(record), message(record))
	}
}

// NewClient gives the resolver and the listings what the checker found,
// each as it reads them: every document's path and uses, every problem's
// message, and, to the resolver, the agent a problem depends on. A problem
// that stops every command is the gate's, not theirs.
func TestNewClientTranslatesWhatTheCheckerFound(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	h := newHarness()
	process := app.DocumentRef{Kind: definition.KindProcess, Name: "p"}
	agent := app.DocumentRef{Kind: definition.KindAgent, Name: "a"}
	stub := checkStub{found: app.CheckResult{
		Documents: []app.CheckedDocument{
			{Ref: process, Path: "stub/processes/p", Uses: []app.DocumentRef{agent}},
			{Ref: agent, Path: "stub/agents/a"},
		},
		Problems: []app.CheckedProblem{
			{Text: "process p: needs ghost", About: &process, Message: "needs ghost", Agent: "ghost"},
			{Text: "agent a: is stubbed", About: &agent, Message: "is stubbed"},
			{Text: "settings directory policies: stops", Message: "stops"},
		},
	}}
	client := h.clientWith(h.defs, func(app.GateDefinitions) app.GateCheck { return stub })

	both := "process p (stub/processes/p): needs ghost; process p uses agent a (stub/agents/a): is stubbed"
	if view, err := client.ShowProcess(ctx, "p", ""); err != nil || view.Refusal != both {
		t.Fatalf("show p: %q, %v; want %q", view.Refusal, err, both)
	}
	// The process's problem depends on agent ghost; a call as agent a does
	// not have it.
	if view, err := client.ShowProcess(ctx, "p", "a"); err != nil || view.Refusal != "process p uses agent a (stub/agents/a): is stubbed" {
		t.Fatalf("show p as agent a: %q, %v", view.Refusal, err)
	}
	if processes, err := client.ListProcesses(ctx); err != nil || len(processes) != 1 || processes[0].Refusal != both {
		t.Fatalf("processes = %+v, %v", processes, err)
	}
}

// A workflow with a node on a process that depends on a broken document is
// refused before any node runs; listings and views show it refused.
func TestAWorkflowOnABrokenDocumentIsRefusedBeforeAnyNode(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	h := newHarness()
	h.defs.docs = withBrokenMapping(workflowDocs())
	h.defs.docs[definition.KindProcess]["second"] = strings.Replace(nodeProcess("second", "Work as second."), "uses: agent:a", "uses: agent:b", 1)
	client := h.clientOn(h.defs)

	report, err := client.Check(ctx, false)
	if err != nil {
		t.Fatal(err)
	}
	if reach := reachOf(t, report, badMapping); !reflect.DeepEqual(reach.Processes, []string{"q", "second"}) || !reflect.DeepEqual(reach.Workflows, []string{"w"}) {
		t.Fatalf("reach = %+v", reach)
	}

	record := h.submit(t, client, contract.CallRequest{Process: "w", Params: map[string]string{"candidate": "c"}})
	want := `workflow w uses process second, which uses agent b, which uses runtime mapping bad (mem/runtimes/bad): unknown adapter "nowhere" (available: spy)`
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
	if err != nil || len(workflows) != 1 || workflows[0].Refusal != want {
		t.Fatalf("workflows = %+v, %v", workflows, err)
	}
	processes, err := client.ListProcesses(ctx)
	if err != nil {
		t.Fatal(err)
	}
	refused := map[string]bool{}
	for _, process := range processes {
		refused[process.Name] = process.Refusal != ""
	}
	if !reflect.DeepEqual(refused, map[string]bool{"first": false, "second": true, "joiner": false, "q": true}) {
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
		{name: "a directory that cannot be listed", listErr: map[definition.Kind]error{definition.KindPolicy: errors.New("permission denied")}, problem: "settings directory policies: cannot be listed: permission denied"},
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
			_, refused["ShowProcess"] = client.ShowProcess(ctx, "p", "")
			_, refused["ListWorkflows"] = client.ListWorkflows(ctx)
			_, refused["ShowWorkflow"] = client.ShowWorkflow(ctx, "w")
			_, refused["Submit"] = client.Submit(ctx, contract.CallRequest{Process: "p", Cwd: "/repo"})
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
