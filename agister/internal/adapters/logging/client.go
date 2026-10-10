package logging

import (
	"context"
	"errors"
	"log/slog"

	"github.com/igor1309/ai-labs/agister/internal/contract"
)

// Client logs what a client fails at, by one rule for every operation: an
// error the operation returns is logged as an error, with the operation and
// what it was asked, and a refusal by the settings (contract.SettingsError)
// with the problems that refuse it. So a failure with no run to record it
// in, a command the settings refuse, an install that cannot write its
// backup or a call whose run folder cannot be made, is in the log. Check
// says what is wrong with the settings in a report, not an error: one that
// stops every command is logged the same way. It wraps the whole client, the settings'
// gate included, and has every operation of it: none is the inner client's
// own.
type Client struct {
	Inner contract.Client
	Log   *slog.Logger
}

var _ contract.Client = Client{}

// failed logs err, which the client's operation returned, with what the
// operation was asked: asked is the log's attributes, key and value.
func (c Client) failed(ctx context.Context, operation string, err error, asked ...any) {
	if err == nil {
		return
	}
	attributes := append([]any{"operation", operation, "error", err.Error()}, asked...)
	var refused *contract.SettingsError
	if errors.As(err, &refused) {
		c.Log.ErrorContext(ctx, "the settings refused the command", append(attributes, "problems", messages(refused.Report))...)
		return
	}
	c.Log.ErrorContext(ctx, "the command failed", attributes...)
}

// messages are the report's problems as the log holds them.
func messages(report contract.CheckReport) []string {
	problems := make([]string, 0, len(report.Problems))
	for _, problem := range report.Problems {
		problems = append(problems, problem.Message)
	}
	return problems
}

// stops says report has a problem that stops every command; one whose
// reach the report does not say does. It is the rule a bare agister
// refuses by.
func stops(report contract.CheckReport) bool {
	if len(report.Reach) != len(report.Problems) {
		return true
	}
	for _, reach := range report.Reach {
		if reach.Stops {
			return true
		}
	}
	return false
}

func (c Client) Init(ctx context.Context, overwrite bool, approved *contract.InitResult) (contract.InitResult, error) {
	result, err := c.Inner.Init(ctx, overwrite, approved)
	c.failed(ctx, "Init", err)
	return result, err
}

func (c Client) Install(ctx context.Context, source string, approved *contract.InstallPlan) (contract.InstallPlan, error) {
	plan, err := c.Inner.Install(ctx, source, approved)
	c.failed(ctx, "Install", err, "source", source)
	return plan, err
}

func (c Client) Restore(ctx context.Context, stamp string, approved *contract.RestorePlan) (contract.RestorePlan, error) {
	plan, err := c.Inner.Restore(ctx, stamp, approved)
	c.failed(ctx, "Restore", err, "stamp", stamp)
	return plan, err
}

func (c Client) CreateAgent(ctx context.Context, agent contract.Agent, overwrite bool, approved *contract.AgentWrite) (contract.AgentWrite, error) {
	write, err := c.Inner.CreateAgent(ctx, agent, overwrite, approved)
	c.failed(ctx, "CreateAgent", err, "agent", agent.Name)
	return write, err
}

func (c Client) ListAgents(ctx context.Context) ([]contract.Agent, error) {
	agents, err := c.Inner.ListAgents(ctx)
	c.failed(ctx, "ListAgents", err)
	return agents, err
}

func (c Client) ListProcesses(ctx context.Context) ([]contract.ProcessSummary, error) {
	processes, err := c.Inner.ListProcesses(ctx)
	c.failed(ctx, "ListProcesses", err)
	return processes, err
}

func (c Client) ShowProcess(ctx context.Context, name, agent string) (contract.ProcessView, error) {
	view, err := c.Inner.ShowProcess(ctx, name, agent)
	c.failed(ctx, "ShowProcess", err, "process", name, "agent", agent)
	return view, err
}

func (c Client) ListWorkflows(ctx context.Context) ([]contract.WorkflowSummary, error) {
	workflows, err := c.Inner.ListWorkflows(ctx)
	c.failed(ctx, "ListWorkflows", err)
	return workflows, err
}

func (c Client) ShowWorkflow(ctx context.Context, name string) (contract.WorkflowView, error) {
	view, err := c.Inner.ShowWorkflow(ctx, name)
	c.failed(ctx, "ShowWorkflow", err, "workflow", name)
	return view, err
}

// Check logs, beside an error, the report that stops every command: the
// client refuses nothing by it, and its caller does, as a bare agister.
func (c Client) Check(ctx context.Context, probe bool) (contract.CheckReport, error) {
	report, err := c.Inner.Check(ctx, probe)
	c.failed(ctx, "Check", err)
	if err == nil && stops(report) {
		c.Log.ErrorContext(ctx, "the settings stop every command", "operation", "Check", "problems", messages(report))
	}
	return report, err
}

func (c Client) Submit(ctx context.Context, request contract.CallRequest) (string, error) {
	id, err := c.Inner.Submit(ctx, request)
	c.failed(ctx, "Submit", err, "process", request.Process, "cwd", request.Cwd)
	return id, err
}

func (c Client) Observe(ctx context.Context, runID string, afterSeq int, each func(contract.Event) error) error {
	err := c.Inner.Observe(ctx, runID, afterSeq, each)
	c.failed(ctx, "Observe", err, "run", runID)
	return err
}

func (c Client) Cancel(ctx context.Context, runID string) error {
	err := c.Inner.Cancel(ctx, runID)
	c.failed(ctx, "Cancel", err, "run", runID)
	return err
}

func (c Client) Inspect(ctx context.Context, runID string) (contract.Run, error) {
	inspected, err := c.Inner.Inspect(ctx, runID)
	c.failed(ctx, "Inspect", err, "run", runID)
	return inspected, err
}

func (c Client) ListRuns(ctx context.Context) ([]contract.Run, error) {
	runs, err := c.Inner.ListRuns(ctx)
	c.failed(ctx, "ListRuns", err)
	return runs, err
}

func (c Client) Export(ctx context.Context, request contract.ExportRequest) (contract.ExportResult, error) {
	result, err := c.Inner.Export(ctx, request)
	c.failed(ctx, "Export", err, "runs", request.Runs, "to", request.To)
	return result, err
}
