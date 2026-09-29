package app

import (
	"context"
	"sync"

	"github.com/igor1309/ai-labs/agister/internal/contract"
)

// Gated refuses every use of the client while the settings have problems,
// except Init, which writes them, and Check, which reports them. Stopping a
// run is never refused, and a run it admitted stays observable, so editing
// settings mid-run cannot strand a call that already started.
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
	Definitions DefinitionSource
	// Global is the live global layer alone, snapshotted like Definitions for
	// the write scope that checks global settings without the project.
	Global DefinitionSource
	// Build makes a client whose use cases read definitions only from the
	// sources given: the layered settings and the global layer alone. It must
	// share state (hosted runs, evidence) across builds.
	Build func(layered, global DefinitionSource) contract.Client

	mu       sync.Mutex
	admitted map[string]bool
}

var _ contract.Client = (*Gated)(nil)

func (g *Gated) live() contract.Client { return g.Build(g.Definitions, g.Global) }

// gate snapshots the settings, checks them and returns the client built on
// that snapshot, or the refusal.
func (g *Gated) gate(ctx context.Context) (contract.Client, error) {
	layered := Snapshot(ctx, g.Definitions)
	client := g.Build(layered, Snapshot(ctx, g.Global))
	report, err := client.Check(ctx, false)
	if err != nil {
		return nil, err
	}
	if len(report.Problems) > 0 {
		return nil, &contract.SettingsError{Report: report}
	}
	return client, nil
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
