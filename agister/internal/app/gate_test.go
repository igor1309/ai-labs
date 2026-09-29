package app_test

import (
	"context"
	"errors"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/contract"
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

// While the settings have problems every use is refused before it reaches
// the core, except writing them (Init), reporting them (Check), stopping a
// run, and following a run the gate itself admitted.
func TestGatedRefusesUseOfBrokenSettings(t *testing.T) {
	ctx := context.Background()
	inner := &clientFake{}
	gated := &app.Gated{Inner: inner}
	id, err := gated.Submit(ctx, contract.CallRequest{})
	if err != nil || id != "run-1" {
		t.Fatalf("valid settings: %q, %v", id, err)
	}

	inner.report = contract.CheckReport{Problems: []string{"agent a: bad"}}
	inner.reached = nil
	refused := map[string]error{}
	_, refused["CreateAgent"] = gated.CreateAgent(ctx, contract.Agent{}, false, nil)
	_, refused["ListAgents"] = gated.ListAgents(ctx)
	_, refused["ListProcesses"] = gated.ListProcesses(ctx)
	_, refused["ShowProcess"] = gated.ShowProcess(ctx, "p", "")
	_, refused["Submit"] = gated.Submit(ctx, contract.CallRequest{})
	refused["Observe other"] = gated.Observe(ctx, "other", 0, nil)
	_, refused["Inspect other"] = gated.Inspect(ctx, "other")
	_, refused["ListRuns"] = gated.ListRuns(ctx)
	for name, err := range refused {
		var settings *contract.SettingsError
		if !errors.As(err, &settings) || settings.Report.Problems[0] != "agent a: bad" {
			t.Errorf("%s: %v", name, err)
		}
	}
	if len(inner.reached) != 0 {
		t.Fatalf("refused calls reached the core: %v", inner.reached)
	}

	if _, err := gated.Init(ctx, false, nil); err != nil {
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
	want := "Init Cancel other Observe run-1 Inspect run-1"
	if got := join(inner.reached); got != want {
		t.Fatalf("reached %q, want %q", got, want)
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
