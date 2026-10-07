package cli_test

import (
	"bytes"
	"context"
	"reflect"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/cli"
	"github.com/igor1309/ai-labs/agister/internal/contract"
)

// reachedClient answers every call with ErrNotFound and counts the calls.
type reachedClient struct{ calls int }

func (c *reachedClient) reach() error { c.calls++; return contract.ErrNotFound }

func (c *reachedClient) Init(context.Context, bool, *contract.InitResult) (contract.InitResult, error) {
	return contract.InitResult{}, c.reach()
}
func (c *reachedClient) Install(context.Context, string, *contract.InstallPlan) (contract.InstallPlan, error) {
	return contract.InstallPlan{}, c.reach()
}
func (c *reachedClient) Restore(context.Context, string, *contract.RestorePlan) (contract.RestorePlan, error) {
	return contract.RestorePlan{}, c.reach()
}
func (c *reachedClient) CreateAgent(context.Context, contract.Agent, bool, *contract.AgentWrite) (contract.AgentWrite, error) {
	return contract.AgentWrite{}, c.reach()
}
func (c *reachedClient) ListAgents(context.Context) ([]contract.Agent, error) { return nil, c.reach() }
func (c *reachedClient) ListProcesses(context.Context) ([]contract.ProcessSummary, error) {
	return nil, c.reach()
}
func (c *reachedClient) ShowProcess(context.Context, string, string) (contract.ProcessView, error) {
	return contract.ProcessView{}, c.reach()
}
func (c *reachedClient) ListWorkflows(context.Context) ([]contract.WorkflowSummary, error) {
	return nil, c.reach()
}
func (c *reachedClient) ShowWorkflow(context.Context, string) (contract.WorkflowView, error) {
	return contract.WorkflowView{}, c.reach()
}
func (c *reachedClient) Check(context.Context, bool) (contract.CheckReport, error) {
	return contract.CheckReport{}, c.reach()
}
func (c *reachedClient) Submit(context.Context, contract.CallRequest) (string, error) {
	return "", c.reach()
}
func (c *reachedClient) Observe(context.Context, string, int, func(contract.Event) error) error {
	return c.reach()
}
func (c *reachedClient) Cancel(context.Context, string) error { return c.reach() }
func (c *reachedClient) Inspect(context.Context, string) (contract.Run, error) {
	return contract.Run{}, c.reach()
}
func (c *reachedClient) ListRuns(context.Context) ([]contract.Run, error) { return nil, c.reach() }

func dispatched(client *reachedClient, args ...string) result {
	var stdout, stderr bytes.Buffer
	code := cli.Run(context.Background(), args, cli.IO{Stdout: &stdout, Stderr: &stderr, Cwd: "/work", Getenv: func(string) string { return "" }},
		func(cli.Config) (contract.Client, error) { return client, nil })
	return result{code, stdout.String(), stderr.String()}
}

// Every command of the table is one dispatch runs: given what it needs, it
// asks the client, and version answers without one.
func TestDispatchRunsEveryCommandOfTheTable(t *testing.T) {
	t.Parallel()
	for _, command := range cli.Commands() {
		client := &reachedClient{}
		args := append(strings.Fields(command.Name), "a", "--runtime", "rt", "--quiet")
		r := dispatched(client, args...)
		if command.Name == "version" {
			if r.code != 0 || r.stdout != "agister unknown\n" || client.calls != 0 {
				t.Errorf("%v: %+v", args, r)
			}
			continue
		}
		if r.stderr != "agister: not found\n" || client.calls == 0 {
			t.Errorf("%v: %+v, %d call(s)", args, r, client.calls)
		}
	}
}

// A command line that names no command of the table is refused as unknown,
// and the client is asked nothing.
func TestDispatchRefusesACommandNotInTheTable(t *testing.T) {
	t.Parallel()
	for args, want := range map[string]string{
		"frobnicate":    "unknown command: frobnicate",
		"runs prune":    "unknown runs command: prune",
		"agent show x":  "unknown agent command: show",
		"process watch": "unknown process command: watch",
	} {
		client := &reachedClient{}
		r := dispatched(client, strings.Fields(args)...)
		if r.code != cli.ExitUsage || !strings.HasPrefix(r.stderr, "agister: "+want+"\n") || client.calls != 0 {
			t.Errorf("%s: %+v", args, r)
		}
	}
}

// Lookup resolves positionals as dispatch does: a subcommand only where the
// command has them, list when none is given.
func TestLookupResolvesAsDispatchDoes(t *testing.T) {
	t.Parallel()
	for _, c := range []struct {
		positionals []string
		want        cli.Command
		ok          bool
	}{
		{nil, cli.Command{}, true},
		{[]string{"runs"}, cli.Command{Name: "runs list"}, true},
		{[]string{"run", "implement"}, cli.Command{Name: "run", Flags: []string{"param", "agent", "timeout", "max-cost", "continue", "goal", "answers", "dir", "json"}}, true},
		{[]string{"process", "show", "x"}, cli.Command{Name: "process show", Flags: []string{"agent", "json"}}, true},
		{[]string{"runs", "prune"}, cli.Command{Name: "runs prune"}, false},
		{[]string{"launch", "x"}, cli.Command{Name: "launch"}, false},
	} {
		got, ok := cli.Lookup(c.positionals)
		if ok != c.ok || !reflect.DeepEqual(got, c.want) {
			t.Errorf("%v: %+v %v, want %+v %v", c.positionals, got, ok, c.want, c.ok)
		}
	}
}
