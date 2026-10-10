package logging

import (
	"context"
	"errors"
	"log/slog"

	"github.com/igor1309/ai-labs/agister/internal/contract"
)

// Client logs what a client fails at before there is a run to record it
// in: a command the settings refuse (contract.SettingsError), from any
// command they gate, and a call that could not be submitted, as when its
// run folder cannot be made, since a call submitted has a run even when it
// is refused. It wraps the whole client, the settings' gate included.
type Client struct {
	contract.Client
	Log *slog.Logger
}

// failed logs err, which the client's operation returned, when the
// settings refused it.
func (c Client) failed(ctx context.Context, operation string, err error) {
	var refused *contract.SettingsError
	if !errors.As(err, &refused) {
		return
	}
	problems := make([]string, 0, len(refused.Report.Problems))
	for _, problem := range refused.Report.Problems {
		problems = append(problems, problem.Message)
	}
	c.Log.ErrorContext(ctx, "the settings refused the command", "operation", operation, "error", err.Error(), "problems", problems)
}

func (c Client) CreateAgent(ctx context.Context, agent contract.Agent, overwrite bool, approved *contract.AgentWrite) (contract.AgentWrite, error) {
	write, err := c.Client.CreateAgent(ctx, agent, overwrite, approved)
	c.failed(ctx, "CreateAgent", err)
	return write, err
}

func (c Client) ListAgents(ctx context.Context) ([]contract.Agent, error) {
	agents, err := c.Client.ListAgents(ctx)
	c.failed(ctx, "ListAgents", err)
	return agents, err
}

func (c Client) ListProcesses(ctx context.Context) ([]contract.ProcessSummary, error) {
	processes, err := c.Client.ListProcesses(ctx)
	c.failed(ctx, "ListProcesses", err)
	return processes, err
}

func (c Client) ShowProcess(ctx context.Context, name, agent string) (contract.ProcessView, error) {
	view, err := c.Client.ShowProcess(ctx, name, agent)
	c.failed(ctx, "ShowProcess", err)
	return view, err
}

func (c Client) ListWorkflows(ctx context.Context) ([]contract.WorkflowSummary, error) {
	workflows, err := c.Client.ListWorkflows(ctx)
	c.failed(ctx, "ListWorkflows", err)
	return workflows, err
}

func (c Client) ShowWorkflow(ctx context.Context, name string) (contract.WorkflowView, error) {
	view, err := c.Client.ShowWorkflow(ctx, name)
	c.failed(ctx, "ShowWorkflow", err)
	return view, err
}

// Submit logs every failure: a call it does not submit has no run.
func (c Client) Submit(ctx context.Context, request contract.CallRequest) (string, error) {
	id, err := c.Client.Submit(ctx, request)
	var refused *contract.SettingsError
	switch {
	case errors.As(err, &refused):
		c.failed(ctx, "Submit", err)
	case err != nil:
		c.Log.ErrorContext(ctx, "the call was not submitted", "process", request.Process, "cwd", request.Cwd, "error", err.Error())
	}
	return id, err
}

func (c Client) Observe(ctx context.Context, runID string, afterSeq int, each func(contract.Event) error) error {
	err := c.Client.Observe(ctx, runID, afterSeq, each)
	c.failed(ctx, "Observe", err)
	return err
}

func (c Client) Inspect(ctx context.Context, runID string) (contract.Run, error) {
	inspected, err := c.Client.Inspect(ctx, runID)
	c.failed(ctx, "Inspect", err)
	return inspected, err
}

func (c Client) ListRuns(ctx context.Context) ([]contract.Run, error) {
	runs, err := c.Client.ListRuns(ctx)
	c.failed(ctx, "ListRuns", err)
	return runs, err
}

func (c Client) Export(ctx context.Context, request contract.ExportRequest) (contract.ExportResult, error) {
	result, err := c.Client.Export(ctx, request)
	c.failed(ctx, "Export", err)
	return result, err
}
