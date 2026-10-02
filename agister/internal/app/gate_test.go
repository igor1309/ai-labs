package app_test

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/contract"
	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
)

// clientFake answers every method and records which were reached.
type clientFake struct {
	report  contract.CheckReport
	reached []string
}

func (c *clientFake) hit(name string) { c.reached = append(c.reached, name) }

func (c *clientFake) Init(context.Context, bool, *contract.InitResult) (contract.InitResult, error) {
	c.hit("Init")
	return contract.InitResult{}, nil
}
func (c *clientFake) Install(context.Context, string, *contract.InstallPlan) (contract.InstallPlan, error) {
	c.hit("Install")
	return contract.InstallPlan{}, nil
}
func (c *clientFake) Restore(context.Context, string, *contract.RestorePlan) (contract.RestorePlan, error) {
	c.hit("Restore")
	return contract.RestorePlan{}, nil
}
func (c *clientFake) CreateAgent(context.Context, contract.Agent, bool, *contract.AgentWrite) (contract.AgentWrite, error) {
	c.hit("CreateAgent")
	return contract.AgentWrite{}, nil
}
func (c *clientFake) ListAgents(context.Context) ([]contract.Agent, error) {
	c.hit("ListAgents")
	return nil, nil
}
func (c *clientFake) ListProcesses(context.Context) ([]contract.ProcessSummary, error) {
	c.hit("ListProcesses")
	return nil, nil
}
func (c *clientFake) ShowProcess(context.Context, string, string) (contract.ProcessView, error) {
	c.hit("ShowProcess")
	return contract.ProcessView{}, nil
}
func (c *clientFake) ListWorkflows(context.Context) ([]contract.WorkflowSummary, error) {
	c.hit("ListWorkflows")
	return nil, nil
}
func (c *clientFake) ShowWorkflow(context.Context, string) (contract.WorkflowView, error) {
	c.hit("ShowWorkflow")
	return contract.WorkflowView{}, nil
}
func (c *clientFake) Check(context.Context, bool) (contract.CheckReport, error) {
	return c.report, nil
}
func (c *clientFake) Submit(context.Context, contract.CallRequest) (string, error) {
	c.hit("Submit")
	return "run-1", nil
}
func (c *clientFake) Observe(_ context.Context, id string, _ int, _ func(contract.Event) error) error {
	c.hit("Observe " + id)
	return nil
}
func (c *clientFake) Cancel(_ context.Context, id string) error {
	c.hit("Cancel " + id)
	return nil
}
func (c *clientFake) Inspect(_ context.Context, id string) (contract.Run, error) {
	c.hit("Inspect " + id)
	return contract.Run{}, nil
}
func (c *clientFake) ListRuns(context.Context) ([]contract.Run, error) {
	c.hit("ListRuns")
	return nil, nil
}

// While the settings have a problem that stops every command, or one whose
// reach the report does not say, every use is refused before it reaches the
// core, except writing them (Init, Install, Restore), reporting them
// (Check), stopping a run, and following a run the gate itself admitted. A
// problem of one document passes the gate: the core refuses what depends on
// it (ADR-015).
func TestGatedRefusesUseOfBrokenSettings(t *testing.T) {
	ctx := context.Background()
	inner := &clientFake{}
	gated := &app.Gated{
		Definitions: &definitionsSpy{docs: settingsDocs()},
		Global:      &definitionsSpy{docs: settingsDocs()},
		Build:       func(_, _ app.GateDefinitions) contract.Client { return inner },
	}
	id, err := gated.Submit(ctx, contract.CallRequest{})
	if err != nil || id != "run-1" {
		t.Fatalf("valid settings: %q, %v", id, err)
	}

	inner.report = contract.CheckReport{Problems: []contract.Problem{{Message: "agent a: bad"}}}
	inner.reached = nil
	refused := map[string]error{}
	_, refused["CreateAgent"] = gated.CreateAgent(ctx, contract.Agent{}, false, nil)
	_, refused["ListAgents"] = gated.ListAgents(ctx)
	_, refused["ListProcesses"] = gated.ListProcesses(ctx)
	_, refused["ShowProcess"] = gated.ShowProcess(ctx, "p", "")
	_, refused["ListWorkflows"] = gated.ListWorkflows(ctx)
	_, refused["ShowWorkflow"] = gated.ShowWorkflow(ctx, "w")
	_, refused["Submit"] = gated.Submit(ctx, contract.CallRequest{})
	refused["Observe other"] = gated.Observe(ctx, "other", 0, nil)
	_, refused["Inspect other"] = gated.Inspect(ctx, "other")
	_, refused["ListRuns"] = gated.ListRuns(ctx)
	for name, err := range refused {
		var settings *contract.SettingsError
		if !errors.As(err, &settings) || settings.Report.Problems[0].Message != "agent a: bad" {
			t.Errorf("%s: %v", name, err)
		}
	}
	if len(inner.reached) != 0 {
		t.Fatalf("refused calls reached the core: %v", inner.reached)
	}

	if _, err := gated.Init(ctx, false, nil); err != nil {
		t.Fatal(err)
	}
	if _, err := gated.Install(ctx, "/repo/.agister", nil); err != nil {
		t.Fatal(err)
	}
	if _, err := gated.Restore(ctx, "stamp", nil); err != nil {
		t.Fatal(err)
	}
	if report, err := gated.Check(ctx, false); err != nil || len(report.Problems) != 1 {
		t.Fatalf("check: %+v, %v", report, err)
	}
	if err := gated.Cancel(ctx, "other"); err != nil {
		t.Fatal(err)
	}
	if err := gated.Observe(ctx, "run-1", 0, nil); err != nil {
		t.Fatalf("admitted run: %v", err)
	}
	if _, err := gated.Inspect(ctx, "run-1"); err != nil {
		t.Fatalf("admitted run: %v", err)
	}
	want := "Init Install Restore Cancel other Observe run-1 Inspect run-1"
	if got := join(inner.reached); got != want {
		t.Fatalf("reached %q, want %q", got, want)
	}

	inner.report.Reach = []contract.ProblemReach{{Problem: "agent a: bad", Stops: true}}
	inner.reached = nil
	if _, err := gated.ListRuns(ctx); !errors.As(err, new(*contract.SettingsError)) || len(inner.reached) != 0 {
		t.Fatalf("a problem that stops every command: %v, reached %v", err, inner.reached)
	}
	inner.report.Reach = []contract.ProblemReach{{Problem: "agent a: bad", Subject: &contract.DefinitionRef{Kind: "agents", Name: "a"}, Processes: []string{"p"}}}
	if _, err := gated.Submit(ctx, contract.CallRequest{}); err != nil {
		t.Fatalf("a problem of one document: %v", err)
	}
	if _, err := gated.ListRuns(ctx); err != nil {
		t.Fatalf("a problem of one document: %v", err)
	}
	if got := join(inner.reached); got != "Submit ListRuns" {
		t.Fatalf("reached %q", got)
	}
}

func join(list []string) string {
	out := ""
	for i, item := range list {
		if i > 0 {
			out += " "
		}
		out += item
	}
	return out
}

// afterCheck runs f once, right after the check has answered.
type afterCheck struct {
	contract.Client
	f func()
}

func (c *afterCheck) Check(ctx context.Context, probe bool) (contract.CheckReport, error) {
	report, err := c.Client.Check(ctx, probe)
	if f := c.f; f != nil {
		c.f = nil
		f()
	}
	return report, err
}

// An edit landing after the gate's check does not reach the operation: it
// runs on the settings that were checked, and reads nothing from the live
// source once they were read.
func TestGatedOperationUsesTheCheckedSettings(t *testing.T) {
	ctx := context.Background()
	h := newHarness()
	sources := []string{"git.revision", "git.diff", "param"}
	readsAfterCheck := -1
	edited := false
	gated := &app.Gated{
		Definitions: h.defs,
		Global:      h.defs,
		Build: func(src, _ app.GateDefinitions) contract.Client {
			return &afterCheck{
				Client: &app.Host{
					Checker:    app.NewChecker(src, h.validator, h.runtimes, sources),
					Inspection: app.NewInspection(app.NewResolver(src, h.runtimes, h.validator, resolverCheckStub{})),
				},
				f: func() {
					readsAfterCheck = h.defs.readCount()
					h.defs.set(definition.KindProcess, "p", "not a process")
					h.defs.set(definition.KindAgent, "a", "not an agent")
					edited = true
				},
			}
		},
	}
	view, err := gated.ShowProcess(ctx, "p", "")
	if err != nil {
		t.Fatal(err)
	}
	if !edited || readsAfterCheck == 0 {
		t.Fatalf("the settings were not read before the check (edited %v, reads %d)", edited, readsAfterCheck)
	}
	if view.Name != "p" || view.Agent != "a" {
		t.Fatalf("view = %+v, want the checked process p with agent a", view)
	}
	if got := h.defs.readCount(); got != readsAfterCheck {
		t.Fatalf("the operation read the live settings %d more times", got-readsAfterCheck)
	}
}

// A submitted call is recorded with the digests of the settings that passed
// the gate, though they were edited before the call resolved.
func TestGatedSubmitRecordsTheCheckedSettings(t *testing.T) {
	ctx := context.Background()
	h := newHarness()
	h.recorder.hold = make(chan struct{})
	original := map[string]string{}
	for kind, docs := range settingsDocs() {
		for name, text := range docs {
			original[string(kind)+"/"+name] = sha(text)
		}
	}
	gated := &app.Gated{
		Definitions: h.defs,
		Global:      h.defs,
		Build: func(src, _ app.GateDefinitions) contract.Client {
			return &app.Host{
				Checker: app.NewChecker(src, h.validator, h.runtimes, []string{"git.revision", "git.diff", "param"}),
				Calls:   h.callsOn(src),
			}
		},
	}
	if _, err := gated.Submit(ctx, contract.CallRequest{Process: "p", Cwd: "/repo"}); err != nil {
		t.Fatal(err)
	}
	h.defs.set(definition.KindAgent, "a", strings.Replace(settingsDocs()[definition.KindAgent]["a"], "m1", "m2", 1))
	close(h.recorder.hold)
	record := h.recorder.wait(t)
	if class(record) != "" {
		t.Fatalf("call failed: %s", message(record))
	}
	for _, source := range record.Definitions {
		if want := original[string(source.Kind)+"/"+source.Name]; source.SHA256 != want {
			t.Errorf("%s/%s recorded %s, checked %s", source.Kind, source.Name, source.SHA256, want)
		}
	}
	if len(record.Definitions) == 0 {
		t.Fatal("no definitions recorded")
	}
}

// An edit landing between the gate's check and Submit does not reach the
// call: it is recorded with the digests that were checked.
func TestGatedSubmitRecordsWhatTheCheckRead(t *testing.T) {
	ctx := context.Background()
	h := newHarness()
	original := map[string]string{}
	for kind, docs := range settingsDocs() {
		for name, text := range docs {
			original[string(kind)+"/"+name] = sha(text)
		}
	}
	edited := false
	gated := &app.Gated{
		Definitions: h.defs,
		Global:      h.defs,
		Build: func(src, _ app.GateDefinitions) contract.Client {
			return &afterCheck{
				Client: &app.Host{
					Checker: app.NewChecker(src, h.validator, h.runtimes, []string{"git.revision", "git.diff", "param"}),
					Calls:   h.callsOn(src),
				},
				f: func() {
					h.defs.set(definition.KindAgent, "a", strings.Replace(settingsDocs()[definition.KindAgent]["a"], "m1", "m2", 1))
					edited = true
				},
			}
		},
	}
	if _, err := gated.Submit(ctx, contract.CallRequest{Process: "p", Cwd: "/repo"}); err != nil {
		t.Fatal(err)
	}
	if !edited {
		t.Fatal("the settings were not edited after the check")
	}
	record := h.recorder.wait(t)
	if class(record) != "" {
		t.Fatalf("call failed: %s", message(record))
	}
	seen := false
	for _, source := range record.Definitions {
		if source.Kind == string(definition.KindAgent) && source.Name == "a" {
			seen = true
		}
		if want := original[string(source.Kind)+"/"+source.Name]; source.SHA256 != want {
			t.Errorf("%s/%s recorded %s, checked %s", source.Kind, source.Name, source.SHA256, want)
		}
	}
	if !seen {
		t.Fatal("agent a was not recorded")
	}
}

// The scope a write must keep valid is judged on the global settings the
// gate checked, not on what they became after: an edit landing after the
// check does not turn the verdict.
func TestGatedWriteScopeChecksTheGlobalSnapshot(t *testing.T) {
	ctx := context.Background()
	h := newHarness()
	h.defs.docs[definition.KindRuntime]["narrow"] = narrowRuntime
	global := &definitionsSpy{docs: settingsDocs()}
	global.docs[definition.KindRuntime]["narrow"] = narrowRuntime
	gated := &app.Gated{
		Definitions: h.defs,
		Global:      global,
		Build: func(src, globalOnly app.GateDefinitions) contract.Client {
			checker := func(defs app.GateDefinitions) *app.Checker {
				return app.NewChecker(defs, h.validator, h.runtimes, []string{"git.revision", "git.diff", "param"})
			}
			return &afterCheck{
				Client: &app.Host{
					Checker:  checker(src),
					Settings: app.NewSettings(src, &writerSpy{existed: map[string]bool{"agents/a": true}}, nil, []app.Scope{{Name: "global settings", Check: checker(globalOnly)}}, settingsCheckStub{}),
				},
				f: func() {
					// Live, process p can run on runtime narrow.
					global.set(definition.KindRuntime, "narrow", strings.Replace(settingsDocs()[definition.KindRuntime]["rt"], "name: rt", "name: narrow", 1))
				},
			}
		},
	}
	// Process p uses agent a, and cannot run on runtime narrow as checked.
	_, err := gated.CreateAgent(ctx, contract.Agent{Name: "a", Runtime: "narrow"}, true, nil)
	var input *contract.InputError
	if !errors.As(err, &input) || !strings.Contains(err.Error(), "would break the global settings") {
		t.Fatalf("err = %v, want the write refused on the checked settings", err)
	}
	if got := global.readCount(); got == 0 {
		t.Fatal("the global settings were never read")
	}
}
