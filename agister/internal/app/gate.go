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
// Each method is spelled out, so a method added to the contract does not
// compile here until it is decided whether it is gated.
type Gated struct {
	Inner contract.Client

	mu       sync.Mutex
	admitted map[string]bool
}

var _ contract.Client = (*Gated)(nil)

func (g *Gated) gate(ctx context.Context) error {
	report, err := g.Inner.Check(ctx, false)
	if err != nil {
		return err
	}
	if len(report.Problems) > 0 {
		return &contract.SettingsError{Report: report}
	}
	return nil
}

func (g *Gated) gateUnlessAdmitted(ctx context.Context, runID string) error {
	g.mu.Lock()
	admitted := g.admitted[runID]
	g.mu.Unlock()
	if admitted {
		return nil
	}
	return g.gate(ctx)
}

func (g *Gated) Init(ctx context.Context, overwrite bool, approved *contract.InitResult) (contract.InitResult, error) {
	return g.Inner.Init(ctx, overwrite, approved)
}

func (g *Gated) Check(ctx context.Context, probe bool) (contract.CheckReport, error) {
	return g.Inner.Check(ctx, probe)
}

func (g *Gated) CreateAgent(ctx context.Context, agent contract.Agent, overwrite bool, approved *contract.AgentWrite) (contract.AgentWrite, error) {
	if err := g.gate(ctx); err != nil {
		return contract.AgentWrite{}, err
	}
	return g.Inner.CreateAgent(ctx, agent, overwrite, approved)
}

func (g *Gated) ListAgents(ctx context.Context) ([]contract.Agent, error) {
	if err := g.gate(ctx); err != nil {
		return nil, err
	}
	return g.Inner.ListAgents(ctx)
}

func (g *Gated) ListProcesses(ctx context.Context) ([]contract.ProcessSummary, error) {
	if err := g.gate(ctx); err != nil {
		return nil, err
	}
	return g.Inner.ListProcesses(ctx)
}

func (g *Gated) ShowProcess(ctx context.Context, name, agent string) (contract.ProcessView, error) {
	if err := g.gate(ctx); err != nil {
		return contract.ProcessView{}, err
	}
	return g.Inner.ShowProcess(ctx, name, agent)
}

func (g *Gated) Submit(ctx context.Context, request contract.CallRequest) (string, error) {
	if err := g.gate(ctx); err != nil {
		return "", err
	}
	id, err := g.Inner.Submit(ctx, request)
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
	if err := g.gateUnlessAdmitted(ctx, runID); err != nil {
		return err
	}
	return g.Inner.Observe(ctx, runID, afterSeq, each)
}

func (g *Gated) Cancel(ctx context.Context, runID string) error {
	return g.Inner.Cancel(ctx, runID)
}

func (g *Gated) Inspect(ctx context.Context, runID string) (contract.Run, error) {
	if err := g.gateUnlessAdmitted(ctx, runID); err != nil {
		return contract.Run{}, err
	}
	return g.Inner.Inspect(ctx, runID)
}

func (g *Gated) ListRuns(ctx context.Context) ([]contract.Run, error) {
	if err := g.gate(ctx); err != nil {
		return nil, err
	}
	return g.Inner.ListRuns(ctx)
}
