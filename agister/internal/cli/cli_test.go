package cli_test

import (
	"bytes"
	"context"
	"encoding/json"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/cli"
	"github.com/igor1309/ai-labs/agister/internal/contract"
)

// clientSpy records every request and answers with scripted responses.
type clientSpy struct {
	contract.Client // unused methods panic
	config          cli.Config
	submitted       []contract.CallRequest
	observed        []string // id@afterSeq
	cancelled       []string
	checked         []bool
	agents          []contract.Agent

	events   []contract.Event
	onCancel chan string
	run      contract.Run
	report   contract.CheckReport
	observe  func(ctx context.Context) // runs during Observe
}

func (s *clientSpy) Submit(_ context.Context, request contract.CallRequest) (string, error) {
	s.submitted = append(s.submitted, request)
	return "run-1", nil
}

func (s *clientSpy) Observe(ctx context.Context, id string, after int, each func(contract.Event) error) error {
	s.observed = append(s.observed, id+"@"+string(rune('0'+after)))
	if s.observe != nil {
		s.observe(ctx)
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	for _, event := range s.events {
		if err := each(event); err != nil {
			return err
		}
	}
	return nil
}

func (s *clientSpy) Cancel(_ context.Context, id string) error {
	if s.onCancel != nil {
		s.onCancel <- id
		return nil
	}
	s.cancelled = append(s.cancelled, id)
	return nil
}

func (s *clientSpy) Inspect(context.Context, string) (contract.Run, error) { return s.run, nil }

func (s *clientSpy) Check(_ context.Context, probe bool) (contract.CheckReport, error) {
	s.checked = append(s.checked, probe)
	return s.report, nil
}

func (s *clientSpy) CreateAgent(_ context.Context, agent contract.Agent, _ bool) (string, error) {
	s.agents = append(s.agents, agent)
	return "/home/agents/" + agent.Name + ".toml", nil
}

type result struct {
	code           int
	stdout, stderr string
}

func run(ctx context.Context, spy *clientSpy, args ...string) result {
	var stdout, stderr bytes.Buffer
	code := cli.Run(ctx, args, cli.IO{Stdout: &stdout, Stderr: &stderr, Cwd: "/work", Getenv: func(key string) string {
		if key == "AGISTER_HOME" {
			return "/env-home"
		}
		return ""
	}}, func(config cli.Config) (contract.Client, error) {
		spy.config = config
		return spy, nil
	})
	return result{code, stdout.String(), stderr.String()}
}

func TestRunSubmitsTheRequestBuiltFromArguments(t *testing.T) {
	spy := &clientSpy{run: contract.Run{ID: "run-1", Status: "finished", Outcome: "accepted", Text: "hi"}}
	r := run(context.Background(), spy, "run", "p", "--param", "a=1", "--agent", "x", "--param", "b=two=2", "--timeout", "5m", "--quiet")
	want := contract.CallRequest{Process: "p", Params: map[string]string{"a": "1", "b": "two=2"}, Agent: "x", Timeout: "5m", Cwd: "/work"}
	if !reflect.DeepEqual(spy.submitted, []contract.CallRequest{want}) {
		t.Fatalf("submitted %+v", spy.submitted)
	}
	if !reflect.DeepEqual(spy.observed, []string{"run-1@0"}) || spy.config.Home != "/env-home" || spy.config.Debug != nil {
		t.Fatalf("observed %v, config %+v", spy.observed, spy.config)
	}
	if r.code != cli.ExitAccepted || r.stdout != "hi\n" {
		t.Fatalf("result = %+v", r)
	}
}

func TestExitCodeAndOutputFollowTheInspectedRun(t *testing.T) {
	cases := []struct {
		run    contract.Run
		code   int
		stdout string
		stderr string
	}{
		{contract.Run{Status: "finished", Outcome: "accepted", Output: json.RawMessage(`{"a":"<b>"}`)}, cli.ExitAccepted, "{\n  \"a\": \"<b>\"\n}\n", ": accepted"},
		{contract.Run{Status: "finished", Outcome: "rejected", Reason: "outcome is no"}, cli.ExitRejected, "", ": rejected (outcome is no)"},
		{contract.Run{Status: "finished", Outcome: "failed", StderrTail: "boom"}, cli.ExitFailed, "", "stderr: boom"},
		{contract.Run{Status: "finished", Outcome: "refused", Reason: "no"}, cli.ExitRefused, "", ": refused (no)"},
		{contract.Run{Status: "lost"}, cli.ExitLost, "", ": lost"},
	}
	for _, c := range cases {
		c.run.ID = "run-1"
		spy := &clientSpy{run: c.run}
		r := run(context.Background(), spy, "run", "p", "--quiet")
		if r.code != c.code || r.stdout != c.stdout || !strings.Contains(r.stderr, c.stderr) {
			t.Errorf("%s: %+v", c.run.Outcome+c.run.Status, r)
		}
	}
}

func TestInterruptCancelsTheRunAndStillReportsIt(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	spy := &clientSpy{run: contract.Run{ID: "run-1", Status: "finished", Outcome: "failed", Reason: "interrupted: cancelled"}, onCancel: make(chan string, 1)}
	var cancelled string
	spy.observe = func(observeCtx context.Context) {
		cancel()
		select {
		case cancelled = <-spy.onCancel:
		case <-time.After(5 * time.Second):
			t.Error("interrupt did not cancel the run")
		}
		// Observation continues past the interrupt so the outcome is reported.
		if observeCtx.Err() != nil {
			t.Error("observation was cancelled with the caller")
		}
	}
	r := run(ctx, spy, "run", "p", "--quiet")
	if cancelled != "run-1" || r.code != cli.ExitFailed {
		t.Fatalf("cancelled %q, result %+v", cancelled, r)
	}
}

func TestInterruptStopsWatchingWithoutCancelling(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	spy := &clientSpy{}
	spy.observe = func(observeCtx context.Context) {
		cancel()
		<-observeCtx.Done() // watching follows the caller's interrupt
	}
	r := run(ctx, spy, "runs", "watch", "r", "--quiet")
	if r.code != cli.ExitInterrupted || len(spy.cancelled) != 0 || !strings.Contains(r.stderr, "stopped watching run r; it continues") {
		t.Fatalf("result %+v, cancelled %v", r, spy.cancelled)
	}
}

func TestProgressDescribesEvents(t *testing.T) {
	spy := &clientSpy{run: contract.Run{ID: "run-1", Status: "finished", Outcome: "accepted"}, events: []contract.Event{
		{Kind: "PLANNED", Data: map[string]any{"primitives": []any{"Read"}}},
		{Kind: "REFUSED", Data: map[string]any{"reason": "because"}},
		{Kind: "TOOL_RESULT", Data: map[string]any{"is_error": true}},
		{Kind: "CALL_FINISHED"},
	}}
	r := run(context.Background(), spy, "run", "p")
	if !strings.Contains(r.stderr, "run run-1\n· plan: [Read]\n! refused: because\n  ↳ tool error\n") {
		t.Fatalf("stderr:\n%s", r.stderr)
	}
}

func TestWatchResumesFromTheGivenSequence(t *testing.T) {
	spy := &clientSpy{run: contract.Run{ID: "r", Status: "finished", Outcome: "accepted"}}
	run(context.Background(), spy, "runs", "watch", "r", "--after", "5", "--quiet")
	if !reflect.DeepEqual(spy.observed, []string{"r@5"}) || len(spy.submitted) != 0 {
		t.Fatalf("observed %v", spy.observed)
	}
}

func TestCheck(t *testing.T) {
	spy := &clientSpy{report: contract.CheckReport{Checked: map[string]int{"agents": 2}, Problems: []string{"agent a: bad"}}}
	r := run(context.Background(), spy, "check", "--probe")
	if r.code != cli.ExitUsage || r.stderr != "agent a: bad\n1 problem(s) in 2 agents\n" || !reflect.DeepEqual(spy.checked, []bool{true}) {
		t.Fatalf("result %+v, checked %v", r, spy.checked)
	}
	spy.report.Problems = nil
	if r := run(context.Background(), spy, "check"); r.code != 0 || r.stdout != "settings OK: 2 agents\n" {
		t.Fatalf("result %+v", r)
	}
}

func TestAgentCreatePayload(t *testing.T) {
	spy := &clientSpy{}
	r := run(context.Background(), spy, "--home", "rel", "agent", "create", "x", "--runtime", "rt", "--model", "m", "--model-family", "f", "--effort", "high", "--command", "/bin/c")
	want := contract.Agent{Name: "x", Runtime: "rt", Model: "m", ModelFamily: "f", Effort: "high", Command: "/bin/c"}
	if r.code != 0 || !reflect.DeepEqual(spy.agents, []contract.Agent{want}) || spy.config.Home != "/work/rel" {
		t.Fatalf("result %+v, agents %+v, home %s", r, spy.agents, spy.config.Home)
	}
}

func TestUsageErrorsNeverReachTheClient(t *testing.T) {
	for _, args := range [][]string{
		{"frobnicate"},
		{"run"},
		{"run", "p", "--param", "no-equals"},
		{"agent", "create", "x"},
		{"--unknown-flag"},
	} {
		spy := &clientSpy{}
		r := run(context.Background(), spy, args...)
		if r.code != cli.ExitUsage || len(spy.submitted) != 0 || len(spy.agents) != 0 {
			t.Errorf("%v: %+v", args, r)
		}
	}
}
