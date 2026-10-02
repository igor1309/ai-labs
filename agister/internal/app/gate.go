package app

import (
	"context"
	"sort"
	"sync"

	"github.com/igor1309/ai-labs/agister/internal/contract"
	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
)

// Gated refuses every use of the client while the settings have a problem
// that stops every command (ADR-014 rule 4), except Init, which writes
// them, and Check, which reports them. Stopping a run is never refused, and
// a run it admitted stays observable, so editing settings mid-run cannot
// strand a call that already started. Any other problem refuses only the
// calls that depend on the document it is about, which the client it
// builds refuses and its listings and views show refused.
//
// Each gated operation reads the settings (layered, and the global layer
// alone) once into snapshots, builds its client on them, checks with that client and then runs the
// operation on the same client, so what was checked is what is used and an
// edit landing in between changes neither. Init, Check, Cancel and following
// an admitted run use a client built on the live source.
//
// Each method is spelled out, so a method added to the contract does not
// compile here until it is decided whether it is gated.
type Gated struct {
	// Definitions is the live source, read once per gated operation.
	Definitions GateDefinitions
	// Global is the live global layer alone, snapshotted like Definitions for
	// the write scope that checks global settings without the project.
	Global GateDefinitions
	// Build makes a client whose use cases read definitions only from the
	// sources given: the layered settings and the global layer alone. It must
	// share state (hosted runs, evidence) across builds.
	Build func(layered, global GateDefinitions) contract.Client

	mu       sync.Mutex
	admitted map[string]bool
}

// GateDefinitions supplies the settings the gate checks and hands to the
// client it builds.
type GateDefinitions interface {
	Read(ctx context.Context, kind definition.Kind, name string) (definition.Document, error)
	List(ctx context.Context, kind definition.Kind) ([]string, error)
}

var _ contract.Client = (*Gated)(nil)

// Infrastructure is what the core runs on, by the component that uses it:
// the adapters, stores and runtimes the composition root builds, and the
// decorator it chooses. One adapter may serve several components.
type Infrastructure struct {
	// Definitions is the live layered settings; Global the live global
	// layer alone (see Gated).
	Definitions GateDefinitions
	Global      GateDefinitions
	// Project names the repository whose settings are layered over the
	// global ones, for messages; empty when there are none.
	Project  string
	Settings SettingsAdapters
	Checker  CheckAdapters
	Resolver ResolverAdapters
	Calls    CallAdapters
	Preparer SetupAdapters
	Verifier VerifyAdapters
	Runs     RunsAdapters
	// Decorate wraps every client the gate builds.
	Decorate func(contract.Client) contract.Client
	// Checks makes the checker whose result the resolver and the listings
	// refuse what depends on a problem from, over the settings given; nil
	// makes the Checker over them. Optional: a seam for tests.
	Checks func(GateDefinitions) GateCheck
}

// GateCheck is a checker as the components NewClient assembles read it:
// what a check of the settings finds.
type GateCheck interface {
	Checked(ctx context.Context) (CheckResult, error)
}

// NewClient assembles the core over infra and returns it behind the gate:
// nothing but init and check works on settings with a problem that stops
// every command, and what depends on a document with any other problem is
// refused (ADR-014). Every field of infra is required but Checks.
func NewClient(infra Infrastructure) contract.Client {
	// The calls hosted in this process, the preparer and the verifier are
	// shared by every client the gate builds.
	hosted := NewHosted()
	preparer := NewPreparer(infra.Preparer.Content, infra.Preparer.Commands, infra.Preparer.Clock)
	verifier := NewVerifier(infra.Verifier.Content, infra.Verifier.Copies, infra.Verifier.Commands, infra.Verifier.Clock)
	sources := make([]string, 0, len(infra.Calls.Inputs))
	for name := range infra.Calls.Inputs {
		sources = append(sources, name)
	}
	sort.Strings(sources)
	checkerOn := func(definitions GateDefinitions) *Checker {
		return NewChecker(definitions, infra.Checker.Validator, infra.Checker.Runtimes, sources)
	}
	checksOn := infra.Checks
	if checksOn == nil {
		checksOn = func(definitions GateDefinitions) GateCheck { return checkerOn(definitions) }
	}
	// Each use case that resolves a process gets a resolver of its own,
	// which refuses a call that depends on a document with a problem.
	resolverOn := func(definitions GateDefinitions) *Resolver {
		return NewResolver(definitions, infra.Resolver.Identities, infra.Resolver.Validator, resolverCheck{checksOn(definitions)})
	}
	// build makes the whole client over the sources given: the layered
	// settings and the global layer alone. The gate builds it on snapshots
	// per operation, so every use case, including the scopes that validate a
	// write, reads only the settings that operation checked; hosted runs and
	// evidence are shared by every build.
	build := func(layered, globalOnly GateDefinitions) contract.Client {
		// Writes go to global settings, which must stay valid on their own
		// and with the project in view.
		scopes := []Scope{{Name: "global settings", Check: checkerOn(globalOnly)}}
		if infra.Project != "" {
			scopes = append(scopes, Scope{Name: "settings in " + infra.Project, Check: checkerOn(layered)})
		}
		calls := infra.Calls
		host := &Host{
			Settings:   NewSettings(layered, infra.Settings.Writer, infra.Settings.Examples, scopes, settingsCheck{checksOn(layered)}),
			Checker:    checkerOn(layered),
			Inspection: NewInspection(resolverOn(layered)),
			Calls: NewCalls(
				resolverOn(layered), calls.Runners, calls.Inputs, calls.Workspaces, calls.Changes, preparer, verifier, calls.Validator,
				calls.Recorder, calls.Runs, calls.Clock, calls.Timer, calls.IDs, calls.StateDir, hosted,
			),
			Runs: NewRuns(infra.Runs.Reader, hosted, 0),
		}
		return infra.Decorate(host)
	}
	return &Gated{Definitions: infra.Definitions, Global: infra.Global, Build: build}
}

func (g *Gated) live() contract.Client { return g.Build(g.Definitions, g.Global) }

// gate snapshots the settings, checks them and returns the client built on
// that snapshot, or the refusal when a problem stops every command.
func (g *Gated) gate(ctx context.Context) (contract.Client, error) {
	layered := Snapshot(ctx, g.Definitions)
	client := g.Build(layered, Snapshot(ctx, g.Global))
	report, err := client.Check(ctx, false)
	if err != nil {
		return nil, err
	}
	if stopsEveryCommand(report) {
		return nil, &contract.SettingsError{Report: report}
	}
	return client, nil
}

// stopsEveryCommand says report has a problem that stops every command
// (ADR-014 rule 4). A problem whose reach the report does not say stops
// every command: where it cannot be said what a problem stops, it stops
// everything.
func stopsEveryCommand(report contract.CheckReport) bool {
	if len(report.Reach) != len(report.Problems) {
		return len(report.Problems) > 0
	}
	for _, item := range report.Reach {
		if item.Stops || item.Subject == nil {
			return true
		}
	}
	return false
}

// resolverCheck is a checker as a Resolver reads it.
type resolverCheck struct{ checker resolverChecker }

// resolverChecker is the checker a resolverCheck translates.
type resolverChecker interface {
	Checked(ctx context.Context) (CheckResult, error)
}

func (c resolverCheck) Check(ctx context.Context) (ResolverChecked, error) {
	found, err := c.checker.Checked(ctx)
	if err != nil {
		return ResolverChecked{}, err
	}
	var result ResolverChecked
	for _, d := range found.Documents {
		result.Documents = append(result.Documents, ResolverDocument{Ref: d.Ref, Path: d.Path, Uses: d.Uses})
	}
	for _, p := range found.Problems {
		if p.About != nil {
			result.Problems = append(result.Problems, ResolverProblem{About: *p.About, Message: p.Message, Agent: p.Agent})
		}
	}
	return result, nil
}

// settingsCheck is a checker as Settings reads it.
type settingsCheck struct{ checker settingsChecker }

// settingsChecker is the checker a settingsCheck translates.
type settingsChecker interface {
	Checked(ctx context.Context) (CheckResult, error)
}

func (c settingsCheck) Check(ctx context.Context) (SettingsChecked, error) {
	found, err := c.checker.Checked(ctx)
	if err != nil {
		return SettingsChecked{}, err
	}
	var result SettingsChecked
	for _, d := range found.Documents {
		result.Documents = append(result.Documents, SettingsDocument{Ref: d.Ref, Path: d.Path, Uses: d.Uses})
	}
	for _, p := range found.Problems {
		if p.About != nil {
			result.Problems = append(result.Problems, SettingsProblem{About: *p.About, Message: p.Message})
		}
	}
	return result, nil
}

func (g *Gated) gateUnlessAdmitted(ctx context.Context, runID string) (contract.Client, error) {
	g.mu.Lock()
	admitted := g.admitted[runID]
	g.mu.Unlock()
	if admitted {
		return g.live(), nil
	}
	return g.gate(ctx)
}

func (g *Gated) Init(ctx context.Context, overwrite bool, approved *contract.InitResult) (contract.InitResult, error) {
	return g.live().Init(ctx, overwrite, approved)
}

func (g *Gated) Check(ctx context.Context, probe bool) (contract.CheckReport, error) {
	return g.live().Check(ctx, probe)
}

func (g *Gated) CreateAgent(ctx context.Context, agent contract.Agent, overwrite bool, approved *contract.AgentWrite) (contract.AgentWrite, error) {
	client, err := g.gate(ctx)
	if err != nil {
		return contract.AgentWrite{}, err
	}
	return client.CreateAgent(ctx, agent, overwrite, approved)
}

func (g *Gated) ListAgents(ctx context.Context) ([]contract.Agent, error) {
	client, err := g.gate(ctx)
	if err != nil {
		return nil, err
	}
	return client.ListAgents(ctx)
}

func (g *Gated) ListProcesses(ctx context.Context) ([]contract.ProcessSummary, error) {
	client, err := g.gate(ctx)
	if err != nil {
		return nil, err
	}
	return client.ListProcesses(ctx)
}

func (g *Gated) ShowProcess(ctx context.Context, name, agent string) (contract.ProcessView, error) {
	client, err := g.gate(ctx)
	if err != nil {
		return contract.ProcessView{}, err
	}
	return client.ShowProcess(ctx, name, agent)
}

func (g *Gated) ListWorkflows(ctx context.Context) ([]contract.WorkflowSummary, error) {
	client, err := g.gate(ctx)
	if err != nil {
		return nil, err
	}
	return client.ListWorkflows(ctx)
}

func (g *Gated) ShowWorkflow(ctx context.Context, name string) (contract.WorkflowView, error) {
	client, err := g.gate(ctx)
	if err != nil {
		return contract.WorkflowView{}, err
	}
	return client.ShowWorkflow(ctx, name)
}

func (g *Gated) Submit(ctx context.Context, request contract.CallRequest) (string, error) {
	client, err := g.gate(ctx)
	if err != nil {
		return "", err
	}
	id, err := client.Submit(ctx, request)
	if err == nil {
		g.mu.Lock()
		if g.admitted == nil {
			g.admitted = map[string]bool{}
		}
		g.admitted[id] = true
		g.mu.Unlock()
	}
	return id, err
}

func (g *Gated) Observe(ctx context.Context, runID string, afterSeq int, each func(contract.Event) error) error {
	client, err := g.gateUnlessAdmitted(ctx, runID)
	if err != nil {
		return err
	}
	return client.Observe(ctx, runID, afterSeq, each)
}

func (g *Gated) Cancel(ctx context.Context, runID string) error {
	return g.live().Cancel(ctx, runID)
}

func (g *Gated) Inspect(ctx context.Context, runID string) (contract.Run, error) {
	client, err := g.gateUnlessAdmitted(ctx, runID)
	if err != nil {
		return contract.Run{}, err
	}
	return client.Inspect(ctx, runID)
}

func (g *Gated) ListRuns(ctx context.Context) ([]contract.Run, error) {
	client, err := g.gate(ctx)
	if err != nil {
		return nil, err
	}
	return client.ListRuns(ctx)
}
