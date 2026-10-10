package logging_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"reflect"
	"slices"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/adapters/logging"
	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/contract"
)

// scripted is a client whose every operation answers with its script: the
// result given for it, and err. It answers with nothing it was not given.
type scripted struct {
	err       error
	init      contract.InitResult
	install   contract.InstallPlan
	restore   contract.RestorePlan
	write     contract.AgentWrite
	agents    []contract.Agent
	processes []contract.ProcessSummary
	process   contract.ProcessView
	workflows []contract.WorkflowSummary
	workflow  contract.WorkflowView
	report    contract.CheckReport
	id        string
	run       contract.Run
	runs      []contract.Run
	export    contract.ExportResult
}

func (s scripted) Init(context.Context, bool, *contract.InitResult) (contract.InitResult, error) {
	return s.init, s.err
}

func (s scripted) Install(context.Context, string, *contract.InstallPlan) (contract.InstallPlan, error) {
	return s.install, s.err
}

func (s scripted) Restore(context.Context, string, *contract.RestorePlan) (contract.RestorePlan, error) {
	return s.restore, s.err
}

func (s scripted) CreateAgent(context.Context, contract.Agent, bool, *contract.AgentWrite) (contract.AgentWrite, error) {
	return s.write, s.err
}

func (s scripted) ListAgents(context.Context) ([]contract.Agent, error) { return s.agents, s.err }

func (s scripted) ListProcesses(context.Context) ([]contract.ProcessSummary, error) {
	return s.processes, s.err
}

func (s scripted) ShowProcess(context.Context, string, string) (contract.ProcessView, error) {
	return s.process, s.err
}

func (s scripted) ListWorkflows(context.Context) ([]contract.WorkflowSummary, error) {
	return s.workflows, s.err
}

func (s scripted) ShowWorkflow(context.Context, string) (contract.WorkflowView, error) {
	return s.workflow, s.err
}

func (s scripted) Check(context.Context, bool) (contract.CheckReport, error) { return s.report, s.err }

func (s scripted) Submit(context.Context, contract.CallRequest) (string, error) { return s.id, s.err }

func (s scripted) Observe(context.Context, string, int, func(contract.Event) error) error {
	return s.err
}

func (s scripted) Cancel(context.Context, string) error { return s.err }

func (s scripted) Inspect(context.Context, string) (contract.Run, error) { return s.run, s.err }

func (s scripted) ListRuns(context.Context) ([]contract.Run, error) { return s.runs, s.err }

func (s scripted) Export(context.Context, contract.ExportRequest) (contract.ExportResult, error) {
	return s.export, s.err
}

// script is a result for every operation, each its own.
func script() scripted {
	return scripted{
		init:      contract.InitResult{Created: []string{"service.toml"}},
		install:   contract.InstallPlan{Source: "given"},
		restore:   contract.RestorePlan{Stamp: "given"},
		write:     contract.AgentWrite{Path: "agents/reviewer.toml"},
		agents:    []contract.Agent{{Name: "reviewer"}},
		processes: []contract.ProcessSummary{{Name: "review"}},
		process:   contract.ProcessView{Name: "review"},
		workflows: []contract.WorkflowSummary{{Name: "reviews"}},
		workflow:  contract.WorkflowView{Name: "reviews"},
		report:    contract.CheckReport{Warnings: []string{"a verification runs with your authority"}},
		id:        "given",
		run:       contract.Run{ID: "r1"},
		runs:      []contract.Run{{ID: "r1"}},
		export:    contract.ExportResult{To: "/audit"},
	}
}

// operation is one operation of the client, called with a request of its
// own: what the scripted client answers it with, and what the log says it
// was asked.
type operation struct {
	name  string
	call  func(context.Context, contract.Client) (any, error)
	want  any
	asked map[string]any
}

// operations is every operation of the client.
func operations() []operation {
	script := script()
	return []operation{
		{"Init", func(ctx context.Context, c contract.Client) (any, error) { return c.Init(ctx, false, nil) }, script.init, nil},
		{"Install", func(ctx context.Context, c contract.Client) (any, error) { return c.Install(ctx, "/settings", nil) }, script.install,
			map[string]any{"source": "/settings"}},
		{"Restore", func(ctx context.Context, c contract.Client) (any, error) {
			return c.Restore(ctx, "20261010T110000Z", nil)
		}, script.restore,
			map[string]any{"stamp": "20261010T110000Z"}},
		{"CreateAgent", func(ctx context.Context, c contract.Client) (any, error) {
			return c.CreateAgent(ctx, contract.Agent{Name: "reviewer"}, false, nil)
		}, script.write, map[string]any{"agent": "reviewer"}},
		{"ListAgents", func(ctx context.Context, c contract.Client) (any, error) { return c.ListAgents(ctx) }, script.agents, nil},
		{"ListProcesses", func(ctx context.Context, c contract.Client) (any, error) { return c.ListProcesses(ctx) }, script.processes, nil},
		{"ShowProcess", func(ctx context.Context, c contract.Client) (any, error) {
			return c.ShowProcess(ctx, "review", "reviewer")
		}, script.process,
			map[string]any{"process": "review", "agent": "reviewer"}},
		{"ListWorkflows", func(ctx context.Context, c contract.Client) (any, error) { return c.ListWorkflows(ctx) }, script.workflows, nil},
		{"ShowWorkflow", func(ctx context.Context, c contract.Client) (any, error) { return c.ShowWorkflow(ctx, "reviews") }, script.workflow,
			map[string]any{"workflow": "reviews"}},
		{"Check", func(ctx context.Context, c contract.Client) (any, error) { return c.Check(ctx, false) }, script.report, nil},
		{"Submit", func(ctx context.Context, c contract.Client) (any, error) {
			return c.Submit(ctx, contract.CallRequest{Process: "review", Cwd: "/repo"})
		}, script.id, map[string]any{"process": "review", "cwd": "/repo"}},
		{"Observe", func(ctx context.Context, c contract.Client) (any, error) { return nil, c.Observe(ctx, "r1", 0, nil) }, nil,
			map[string]any{"run": "r1"}},
		{"Cancel", func(ctx context.Context, c contract.Client) (any, error) { return nil, c.Cancel(ctx, "r1") }, nil, map[string]any{"run": "r1"}},
		{"Inspect", func(ctx context.Context, c contract.Client) (any, error) { return c.Inspect(ctx, "r1") }, script.run, map[string]any{"run": "r1"}},
		{"ListRuns", func(ctx context.Context, c contract.Client) (any, error) { return c.ListRuns(ctx) }, script.runs, nil},
		{"Export", func(ctx context.Context, c contract.Client) (any, error) {
			return c.Export(ctx, contract.ExportRequest{Runs: []string{"r1"}, To: "/audit"})
		}, script.export, map[string]any{"runs": []any{"r1"}, "to": "/audit"}},
	}
}

// records is every record in the log written to buffer.
func records(t *testing.T, buffer *bytes.Buffer) []map[string]any {
	t.Helper()
	var found []map[string]any
	for _, line := range strings.Split(strings.TrimSpace(buffer.String()), "\n") {
		if line == "" {
			continue
		}
		var entry map[string]any
		if err := json.Unmarshal([]byte(line), &entry); err != nil {
			t.Fatalf("log line %q: %v", line, err)
		}
		found = append(found, entry)
	}
	return found
}

// The operations the tests call are the client's, every one: an operation
// added to the client gets its case.
func TestEveryOperationOfTheClientHasItsCase(t *testing.T) {
	t.Parallel()
	client := reflect.TypeOf((*contract.Client)(nil)).Elem()
	var want, cases []string
	for i := range client.NumMethod() {
		want = append(want, client.Method(i).Name)
	}
	for _, operation := range operations() {
		cases = append(cases, operation.name)
	}
	slices.Sort(want)
	slices.Sort(cases)
	if !slices.Equal(cases, want) {
		t.Fatalf("cases %v, the client's operations %v", cases, want)
	}
}

// Every operation of the client is logged by one rule (the owner's decision
// of 2026-10-10, LAB-180: every failure before a run is logged, by each
// operation). One the settings refuse is one error record with the
// operation, what it was asked and the problems that refuse it; one that
// fails any other way is one error record with the operation and what it
// was asked; one that succeeds is none. Its result and error are the inner
// client's, unchanged.
//
// The rule has no exception by operation or by error. So a call that could
// not be submitted, once logged apart as "the call was not submitted", is
// logged as any other failure, still with its process and directory; and a
// failure that is the caller's to act on, as a run not found, once left
// out, is logged too.
func TestEveryOperationsFailureIsLogged(t *testing.T) {
	t.Parallel()
	refusal := &contract.SettingsError{Report: contract.CheckReport{Problems: []contract.Problem{{Message: "service service: not found"}}}}
	failure := errors.New("mkdir backups: not a directory")
	for _, operation := range operations() {
		for name, tc := range map[string]struct {
			err      error
			msg      string
			problems any
		}{
			"refused":   {refusal, "the settings refused the command", []any{"service service: not found"}},
			"failed":    {failure, "the command failed", nil},
			"not found": {contract.ErrNotFound, "the command failed", nil},
			"done":      {nil, "", nil},
		} {
			t.Run(operation.name+"/"+name, func(t *testing.T) {
				t.Parallel()
				var buffer bytes.Buffer
				inner := script()
				inner.err = tc.err
				client := logging.Client{Inner: inner, Log: slog.New(slog.NewJSONHandler(&buffer, nil))}

				got, err := operation.call(context.Background(), client)
				if err != tc.err || !reflect.DeepEqual(got, operation.want) {
					t.Fatalf("%s = %v, %v, want %v, %v", operation.name, got, err, operation.want, tc.err)
				}
				logged := records(t, &buffer)
				if tc.err == nil {
					if len(logged) != 0 {
						t.Fatalf("logged = %v", logged)
					}
					return
				}
				if len(logged) != 1 {
					t.Fatalf("logged = %v", logged)
				}
				want := map[string]any{"level": "ERROR", "msg": tc.msg, "operation": operation.name, "error": tc.err.Error(), "problems": tc.problems}
				for key, value := range operation.asked {
					want[key] = value
				}
				for key, value := range want {
					if !reflect.DeepEqual(logged[0][key], value) {
						t.Fatalf("logged %s = %v, want %v, in %v", key, logged[0][key], value, logged[0])
					}
				}
			})
		}
	}
}

// A failure is logged under the context's correlation.
func TestAFailureIsLoggedUnderItsCorrelation(t *testing.T) {
	t.Parallel()
	var buffer bytes.Buffer
	log := slog.New(logging.Handler{Handler: slog.NewJSONHandler(&buffer, nil)})
	inner := script()
	inner.err = &contract.SettingsError{}
	client := logging.Client{Inner: inner, Log: log}
	ctx := app.WithCorrelation(context.Background(), "process", "p")

	if _, err := client.ListProcesses(ctx); err != inner.err {
		t.Fatalf("ListProcesses: %v", err)
	}
	if logged := records(t, &buffer); len(logged) != 1 || logged[0]["process"] != "p" {
		t.Fatalf("logged = %v", logged)
	}
}

// Check says what is wrong with the settings in a report, not an error.
// One with a problem that stops every command, said by its reach or by a
// reach the report does not give, is what a bare agister refuses by, with
// no run to record it: it is one error record with the problems. A report
// whose problems stop only what uses a document, or that has none, is not
// logged. The report is the inner client's, unchanged.
func TestACheckReportThatStopsEveryCommandIsLogged(t *testing.T) {
	t.Parallel()
	problems := []contract.Problem{{Message: "service service: not found"}, {Message: "agent a: bad"}}
	agent := &contract.DefinitionRef{Kind: "agents", Name: "a"}
	for name, tc := range map[string]struct {
		report contract.CheckReport
		logged bool
	}{
		"stops": {contract.CheckReport{Problems: problems, Reach: []contract.ProblemReach{
			{Problem: "service service: not found", Stops: true}, {Problem: "agent a: bad", Subject: agent, Processes: []string{"p"}},
		}}, true},
		"no reach given": {contract.CheckReport{Problems: problems}, true},
		"stops only what uses a document": {contract.CheckReport{Problems: problems[1:], Reach: []contract.ProblemReach{
			{Problem: "agent a: bad", Subject: agent, Processes: []string{"p"}},
		}}, false},
		"no problem": {contract.CheckReport{Warnings: []string{"a verification runs with your authority"}}, false},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			var buffer bytes.Buffer
			inner := script()
			inner.report = tc.report
			client := logging.Client{Inner: inner, Log: slog.New(slog.NewJSONHandler(&buffer, nil))}

			report, err := client.Check(context.Background(), false)
			if err != nil || !reflect.DeepEqual(report, tc.report) {
				t.Fatalf("Check = %+v, %v", report, err)
			}
			logged := records(t, &buffer)
			if !tc.logged {
				if len(logged) != 0 {
					t.Fatalf("logged = %v", logged)
				}
				return
			}
			var want []any
			for _, problem := range tc.report.Problems {
				want = append(want, problem.Message)
			}
			if len(logged) != 1 || logged[0]["level"] != "ERROR" || logged[0]["msg"] != "the settings stop every command" ||
				logged[0]["operation"] != "Check" || !reflect.DeepEqual(logged[0]["problems"], want) {
				t.Fatalf("logged = %v", logged)
			}
		})
	}
}
