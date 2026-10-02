package cli_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
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
	agentExists     bool
	approved        []contract.AgentWrite
	refuse          error // returned by Submit

	events   []contract.Event
	onCancel chan string
	run      contract.Run
	report   contract.CheckReport
	view     contract.ProcessView
	observe  func(ctx context.Context) // runs during Observe
}

func (s *clientSpy) ShowProcess(context.Context, string, string) (contract.ProcessView, error) {
	return s.view, nil
}

func (s *clientSpy) Submit(_ context.Context, request contract.CallRequest) (string, error) {
	if s.refuse != nil {
		return "", s.refuse
	}
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

func (s *clientSpy) CreateAgent(_ context.Context, agent contract.Agent, overwrite bool, approved *contract.AgentWrite) (contract.AgentWrite, error) {
	write := contract.AgentWrite{Path: "/home/agents/" + agent.Name + ".toml", Replaces: overwrite && s.agentExists, Digest: "d1"}
	if approved != nil {
		s.agents = append(s.agents, agent)
		s.approved = append(s.approved, *approved)
	}
	return write, nil
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

// finished is a finished run with the given result.
func finished(status, class string) contract.Run {
	result := &contract.Result{Status: status, Cost: contract.Cost{Source: "unknown"}}
	if class != "" {
		result.Error = &contract.Error{Class: class, Message: "why"}
	}
	return contract.Run{ID: "run-1", State: "finished", Result: result}
}

func TestRunSubmitsTheRequestBuiltFromArguments(t *testing.T) {
	spy := &clientSpy{run: finished("completed", "")}
	spy.run.Result.Text = "hi"
	r := run(context.Background(), spy, "run", "p", "--param", "a=1", "--agent", "x", "--param", "b=two=2", "--timeout", "5m", "--max-cost", "0.5", "--continue", "run-0", "--quiet")
	limit := 0.5
	want := contract.CallRequest{Process: "p", Params: map[string]string{"a": "1", "b": "two=2"}, Agent: "x", Timeout: "5m", MaxCostUSD: &limit, Continue: "run-0", Cwd: "/work"}
	if !reflect.DeepEqual(spy.submitted, []contract.CallRequest{want}) {
		t.Fatalf("submitted %+v", spy.submitted)
	}
	if !reflect.DeepEqual(spy.observed, []string{"run-1@0"}) || spy.config.Home != "/env-home" || spy.config.Debug != nil {
		t.Fatalf("observed %v, config %+v", spy.observed, spy.config)
	}
	if r.code != cli.ExitCompleted || r.stdout != "hi\n" {
		t.Fatalf("result = %+v", r)
	}
}

func TestExitCodeAndOutputFollowTheNodeResult(t *testing.T) {
	withOutput := finished("completed", "")
	withOutput.Result.Output = json.RawMessage(`{"verdict":"request_changes"}`)
	withStderr := finished("failed", "runtime_error")
	withStderr.StderrTail = "boom"
	failedText := finished("failed", "invalid_output")
	failedText.Result.Text = "partial answer"
	cases := []struct {
		name   string
		run    contract.Run
		code   int
		stdout string
		stderr string
	}{
		// A domain result is output, and the exit code says only that the node completed.
		{"output", withOutput, cli.ExitCompleted, "{\n  \"verdict\": \"request_changes\"\n}\n", ": completed"},
		{"failed", withStderr, cli.ExitFailed, "", ": failed/runtime_error (why)\n  stderr: boom"},
		{"text of a failed node is not printed as its answer", failedText, cli.ExitFailed, "", ": failed/invalid_output"},
		{"interrupted", finished("interrupted", "timeout"), cli.ExitInterrupted, "", ": interrupted/timeout"},
		{"refused", finished("failed", "refused"), cli.ExitRefused, "", ": failed/refused (why)"},
		{"lost", finished("lost", "abandoned"), cli.ExitLost, "", ": lost/abandoned"},
	}
	for _, c := range cases {
		spy := &clientSpy{run: c.run}
		r := run(context.Background(), spy, "run", "p", "--quiet")
		if r.code != c.code || r.stdout != c.stdout || !strings.Contains(r.stderr, c.stderr) {
			t.Errorf("%s: %+v", c.name, r)
		}
	}
}

func TestJSONPrintsTheNodeResult(t *testing.T) {
	spy := &clientSpy{run: finished("failed", "rate_limited")}
	r := run(context.Background(), spy, "run", "p", "--json", "--quiet")
	var got contract.Result
	if err := json.Unmarshal([]byte(r.stdout), &got); err != nil || got.Status != "failed" || got.Error.Class != "rate_limited" || r.code != cli.ExitFailed {
		t.Fatalf("stdout %s, err %v", r.stdout, err)
	}
}

func TestResultSummary(t *testing.T) {
	spy := &clientSpy{run: finished("completed", "")}
	cost, in, out := 0.1234, int64(10), int64(20)
	result := spy.run.Result
	result.Cost = contract.Cost{USD: &cost, Source: "runtime"}
	result.Timing.WallMS = 1500
	result.Usage = &contract.Usage{InputTokens: &in, OutputTokens: &out}
	result.Artifacts = []contract.Artifact{{Path: "artifacts/changes.patch", Bytes: 3, Digest: "sha256:x"}}
	result.Session = &contract.Session{ProviderSessionID: "prov-1", Continues: "run-0"}
	r := run(context.Background(), spy, "run", "p", "--quiet")
	want := "run run-1: completed $0.1234 1.5s 10 in/20 out tokens\n  artifact: artifacts/changes.patch (3 bytes, sha256:x)\n  provider session: prov-1 (continues run run-0)\n"
	if r.stderr != want {
		t.Fatalf("stderr:\n%s\nwant\n%s", r.stderr, want)
	}
}

func TestInterruptCancelsTheRunAndStillReportsIt(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	spy := &clientSpy{run: finished("interrupted", "cancelled"), onCancel: make(chan string, 1)}
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
	if cancelled != "run-1" || r.code != cli.ExitInterrupted {
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
	if r.code != cli.ExitStoppedWatch || len(spy.cancelled) != 0 || !strings.Contains(r.stderr, "stopped watching run r; it continues") {
		t.Fatalf("result %+v, cancelled %v", r, spy.cancelled)
	}
}

func TestProgressDescribesEvents(t *testing.T) {
	spy := &clientSpy{run: finished("completed", ""), events: []contract.Event{
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

// Verification attempts show as they happen: each run, each repair turn,
// and why the loop stopped.
func TestProgressDescribesVerification(t *testing.T) {
	spy := &clientSpy{run: finished("failed", "budget_exhausted"), events: []contract.Event{
		{Kind: "VERIFY_STARTED", Data: map[string]any{"attempt": 1.0, "command": "make test"}},
		{Kind: "VERIFY_FINISHED", Data: map[string]any{"attempt": 1.0, "code": 2.0, "bytes": 120.0}},
		{Kind: "REPAIR_STARTED", Data: map[string]any{"attempt": 2.0, "session": "s-1"}},
		{Kind: "VERIFY_FINISHED", Data: map[string]any{"attempt": 2.0, "code": nil, "timed_out": true, "bytes": 0.0}},
		{Kind: "VERIFY_STOPPED", Data: map[string]any{"attempt": 2.0, "class": "timeout"}},
		{Kind: "CALL_FINISHED"},
	}}
	r := run(context.Background(), spy, "run", "p")
	want := "· verify attempt 1: make test\n· verify attempt 1: exit 2, 120 bytes of output\n· repair turn for attempt 2 in session s-1\n" +
		"· verify attempt 2: timed out, 0 bytes of output\n! VERIFY_STOPPED {\"attempt\":2,\"class\":\"timeout\"}\n"
	if !strings.Contains(r.stderr, want) {
		t.Fatalf("stderr:\n%s", r.stderr)
	}
}

// A workflow's progress says which fan-out nodes its join runs without, and
// that no join ran when none completed (ADR-004).
func TestProgressNamesTheNodesThatDidNotComplete(t *testing.T) {
	for _, tc := range []struct {
		name  string
		event contract.Event
		want  string
	}{
		{"passed without some", contract.Event{Kind: "BARRIER", Data: map[string]any{"state": "passed", "incomplete": []any{"tests", "clarity"}}},
			"! barrier passed: the join runs without tests, clarity, which did not complete\n"},
		{"passed with all", contract.Event{Kind: "BARRIER", Data: map[string]any{"state": "passed"}}, "· barrier passed\n"},
		{"blocked", contract.Event{Kind: "BARRIER", Data: map[string]any{"state": "blocked", "blocked_by": "one", "incomplete": []any{"one", "two"}}},
			"! barrier blocked: no node completed (one, two), no join\n"},
		// A run recorded before ADR-004 has no incomplete: its first node
		// that did not complete blocked the join.
		{"blocked, recorded before", contract.Event{Kind: "BARRIER", Data: map[string]any{"state": "blocked", "blocked_by": "two"}},
			"! barrier blocked by node two: no join\n"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			spy := &clientSpy{run: finished("completed", ""), events: []contract.Event{tc.event, {Kind: "WORKFLOW_FINISHED"}}}
			r := run(context.Background(), spy, "run", "w")
			if !strings.Contains(r.stderr, tc.want) {
				t.Fatalf("stderr:\n%s", r.stderr)
			}
		})
	}
}

// Text from the agent or the runtime reaches the terminal with its control
// characters escaped.
func TestProgressAndSummaryEscapeControlCharacters(t *testing.T) {
	spy := &clientSpy{run: finished("failed", "runtime_error"), events: []contract.Event{
		{Kind: "TOOL_REQUESTED", Data: map[string]any{"name": "Bash", "input": "\x1b]0;owned\x07ls\rrm"}},
		{Kind: "CALL_FINISHED"},
	}}
	spy.run.Result.Error.Message = "boom\x1b[2J"
	spy.run.StderrTail = "line\u009b31m\nnext"
	r := run(context.Background(), spy, "run", "p")
	for _, want := range []string{`· Bash \x1b]0;owned\x07ls\x0drm`, `(boom\x1b[2J)`, "stderr: line\\x9b31m\nnext"} {
		if !strings.Contains(r.stderr, want) {
			t.Errorf("stderr lacks %q:\n%s", want, r.stderr)
		}
	}
	if strings.ContainsAny(r.stderr, "\x1b\x07\r\u009b") {
		t.Fatalf("raw control characters in stderr: %q", r.stderr)
	}
}

func TestWatchResumesFromTheGivenSequence(t *testing.T) {
	spy := &clientSpy{run: finished("completed", "")}
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

// Warnings are printed whether or not the settings have problems, and are
// not problems themselves.
func TestCheckPrintsWarnings(t *testing.T) {
	spy := &clientSpy{report: contract.CheckReport{Checked: map[string]int{"processes": 1}, Warnings: []string{"process p: verify runs with the operator's authority"}}}
	r := run(context.Background(), spy, "check")
	if r.code != 0 || r.stdout != "settings OK: 1 processes\n" || r.stderr != "warning process p: verify runs with the operator's authority\n" {
		t.Fatalf("result %+v", r)
	}
	r = run(context.Background(), spy, "check", "--json")
	var got map[string]any
	if err := json.Unmarshal([]byte(r.stdout), &got); err != nil || fmt.Sprint(got["warnings"]) != "[process p: verify runs with the operator's authority]" {
		t.Fatalf("json: %v\n%s", err, r.stdout)
	}
	spy.report.Warnings = nil
	r = run(context.Background(), spy, "check", "--json")
	if err := json.Unmarshal([]byte(r.stdout), &got); err != nil || fmt.Sprint(got["warnings"]) != "[]" {
		t.Fatalf("json without warnings: %v\n%s", err, r.stdout)
	}
}

// Settings with problems still print their warnings, beside the problems,
// and check exits with the usage code.
func TestCheckPrintsWarningsBesideProblems(t *testing.T) {
	spy := &clientSpy{report: contract.CheckReport{Checked: map[string]int{"processes": 1},
		Problems: []string{"process q: agent \"ghost\" does not exist"},
		Warnings: []string{"process p: verify runs with the operator's authority"}}}
	r := run(context.Background(), spy, "check")
	if r.code != cli.ExitUsage ||
		!strings.Contains(r.stderr, "warning process p: verify runs with the operator's authority\n") ||
		!strings.Contains(r.stderr, "process q: agent \"ghost\" does not exist\n1 problem(s) in 1 processes\n") {
		t.Fatalf("result %+v", r)
	}
}

// process show prints the verify block and the warnings it is given.
func TestShowProcessPrintsVerifyAndWarnings(t *testing.T) {
	spy := &clientSpy{view: contract.ProcessView{Name: "p", Agent: "a", Runtime: "rt", Output: "text", Timeout: time.Hour, MaxAttempts: 1,
		Verify:   &contract.Verify{Command: "go test ./...", Timeout: 10 * time.Minute, MaxAttempts: 3, Instruction: "Fix the cause."},
		Warnings: []string{"verify runs with the operator's authority"}}}
	r := run(context.Background(), spy, "process", "show", "p")
	for _, want := range []string{
		"verify       go test ./...\n  limits     timeout 10m0s, attempts 3\n  on failure Fix the cause.\n",
		"WARNING      verify runs with the operator's authority\n",
	} {
		if r.code != 0 || !strings.Contains(r.stdout, want) {
			t.Fatalf("missing %q in %d:\n%s", want, r.code, r.stdout)
		}
	}
	spy.view.Verify, spy.view.Warnings = nil, nil
	if r := run(context.Background(), spy, "process", "show", "p"); strings.Contains(r.stdout, "verify") || strings.Contains(r.stdout, "WARNING") {
		t.Fatalf("without verify:\n%s", r.stdout)
	}
}

// process show says which verification the verify fields come from, and of
// one that was not resolved, that it was not, beside the refusal.
func TestShowProcessPrintsTheNamedVerification(t *testing.T) {
	spy := &clientSpy{view: contract.ProcessView{Name: "p", Agent: "a", Runtime: "rt", Output: "text", Timeout: time.Hour, MaxAttempts: 1,
		Verify: &contract.Verify{Command: "go test ./...", Timeout: 10 * time.Minute, MaxAttempts: 3, Instruction: "Fix the cause."}, VerifyName: "repo"}}
	r := run(context.Background(), spy, "process", "show", "p")
	want := "verify       go test ./...\n  limits     timeout 10m0s, attempts 3\n  on failure Fix the cause.\n  from       verify:repo\n"
	if r.code != 0 || !strings.Contains(r.stdout, want) {
		t.Fatalf("missing %q in %d:\n%s", want, r.code, r.stdout)
	}
	spy.view.Verify, spy.view.Refusal = nil, `process p names verify:repo: verification "repo": not found (expected /r/.agister/verifies/repo.yaml or /h/verifies/repo.yaml)`
	r = run(context.Background(), spy, "process", "show", "p")
	want = "verify       verify:repo (not resolved)\nplan         REFUSED: " + spy.view.Refusal + "\n"
	if r.code != 0 || !strings.Contains(r.stdout, want) {
		t.Fatalf("missing %q in %d:\n%s", want, r.code, r.stdout)
	}
}

// A client refusal over broken settings prints their report, then the
// refusal, and exits 64; a bare agister checks before it shows the usage.
func TestSettingsRefusalPrintsTheReport(t *testing.T) {
	broken := contract.CheckReport{Checked: map[string]int{"agents": 1}, Problems: []string{"agent a: bad"}, Overrides: []string{"agent a: /p overrides /g"}}
	spy := &clientSpy{refuse: &contract.SettingsError{Report: broken}}
	r := run(context.Background(), spy, "run", "p")
	if r.code != cli.ExitUsage || r.stderr != "agent a: bad\n1 problem(s) in 1 agents\nagister: settings have problems; fix them first (see `agister check`)\n" || r.stdout != "override agent a: /p overrides /g\n" {
		t.Fatalf("refused run: %+v", r)
	}
	spy = &clientSpy{report: broken}
	if r := run(context.Background(), spy); r.code != cli.ExitUsage || !strings.HasPrefix(r.stderr, "agent a: bad\n") || strings.Contains(r.stdout, "Usage:") || !reflect.DeepEqual(spy.checked, []bool{false}) {
		t.Fatalf("bare with broken settings: %+v", r)
	}
	spy = &clientSpy{}
	if r := run(context.Background(), spy); r.code != cli.ExitUsage || !strings.Contains(r.stdout, "Usage:") {
		t.Fatalf("bare: %+v", r)
	}
	for _, args := range [][]string{{"--help"}, {"-h"}, {"run", "p", "--help"}} {
		spy := &clientSpy{report: broken}
		if r := run(context.Background(), spy, args...); r.code != 0 || len(spy.checked) != 0 {
			t.Errorf("%v: %+v, checked %v", args, r, spy.checked)
		}
	}
}

func TestCheckTreeAndJSON(t *testing.T) {
	ref := func(kind, name string) contract.DefinitionRef { return contract.DefinitionRef{Kind: kind, Name: name} }
	report := contract.CheckReport{
		Checked:   map[string]int{"processes": 1},
		Overrides: []string{"agent a: /p/agents/a.toml overrides /g/agents/a.toml"},
		Definitions: []contract.Definition{
			{Kind: "service", Name: "service", Layer: "global", Path: "/g/service.toml"},
			{Kind: "workspace", Name: "workspace", Layer: "project", Path: "/p/workspace.yaml", UsedBy: []contract.DefinitionRef{ref("processes", "p")}},
			{Kind: "runtimes", Name: "rt", Layer: "global", Path: "/g/runtimes/rt.yaml", UsedBy: []contract.DefinitionRef{ref("agents", "a")}},
			{Kind: "agents", Name: "a", Layer: "project", Path: "/p/agents/a.toml", Overrides: "/g/agents/a.toml", Uses: []contract.DefinitionRef{ref("runtimes", "rt")}, UsedBy: []contract.DefinitionRef{ref("processes", "p")}},
			// b is used by no process, so neither is rt2, which only b uses.
			{Kind: "runtimes", Name: "rt2", Layer: "global", Path: "/g/runtimes/rt2.yaml", UsedBy: []contract.DefinitionRef{ref("agents", "b")}},
			{Kind: "agents", Name: "b", Layer: "global", Path: "/g/agents/b.toml", Uses: []contract.DefinitionRef{ref("runtimes", "rt2")}},
			{Kind: "policies", Name: "spare", Layer: "project", Path: "/p/policies/spare.yaml", Invalid: true},
			{Kind: "verifies", Name: "repo", Layer: "project", Path: "/p/verifies/repo.yaml", UsedBy: []contract.DefinitionRef{ref("processes", "p")}},
			{Kind: "verifies", Name: "spare", Layer: "global", Path: "/g/verifies/spare.yaml"},
			{Kind: "processes", Name: "p", Layer: "global", Path: "/g/processes/p.yaml", Uses: []contract.DefinitionRef{ref("agents", "a"), ref("policies", "gone"), ref("verifies", "repo"), ref("workspace", "workspace")}},
			{Kind: "processes", Name: "q", Layer: "global", Path: "/g/processes/q.yaml", Uses: []contract.DefinitionRef{ref("verifies", "gone")}},
		},
	}
	spy := &clientSpy{report: report}
	r := run(context.Background(), spy, "check", "--tree")
	want := `service service         global  /g/service.toml
process p               global  /g/processes/p.yaml
├─ agent a              project /p/agents/a.toml (overrides /g/agents/a.toml)
│  └─ runtime rt        global  /g/runtimes/rt.yaml
├─ policy gone          MISSING
├─ verification repo    project /p/verifies/repo.yaml
└─ workspace workspace  project /p/workspace.yaml
process q               global  /g/processes/q.yaml
└─ verification gone    MISSING
unused (no process uses these)
   runtime rt2          global  /g/runtimes/rt2.yaml
   agent b              global  /g/agents/b.toml
   policy spare         project /p/policies/spare.yaml INVALID
   verification spare   global  /g/verifies/spare.yaml
settings OK: 1 processes
`
	if r.code != 0 || r.stdout != want {
		t.Fatalf("tree: %d\n%s", r.code, r.stdout)
	}

	spy = &clientSpy{report: contract.CheckReport{Checked: map[string]int{}, Problems: []string{"agent a: bad"}}}
	r = run(context.Background(), spy, "check", "--json", "--tree")
	var got map[string]any
	if err := json.Unmarshal([]byte(r.stdout), &got); err != nil || r.code != cli.ExitUsage || r.stderr != "" {
		t.Fatalf("json: %d %v\n%s%s", r.code, err, r.stdout, r.stderr)
	}
	// Empty lists are lists, so consumers need no null checks.
	if fmt.Sprint(got["problems"]) != "[agent a: bad]" || fmt.Sprint(got["overrides"]) != "[]" || fmt.Sprint(got["definitions"]) != "[]" {
		t.Fatalf("json = %v", got)
	}
}

func TestAgentCreateAsksOnlyToReplace(t *testing.T) {
	spy := &clientSpy{agentExists: true}
	r := run(context.Background(), spy, "agent", "create", "x", "--runtime", "rt", "--force")
	if r.code != cli.ExitUsage || len(spy.agents) != 0 || r.stderr != "Type yes to replace agent x:\nagister: agent create cancelled; nothing was written\n" {
		t.Fatalf("no answer: %+v, agents %v", r, spy.agents)
	}
	spy = &clientSpy{}
	// The write carries the plan it was shown, so a changed file is refused.
	if r := run(context.Background(), spy, "agent", "create", "x", "--runtime", "rt", "--force"); r.code != 0 || r.stderr != "" || r.stdout != "created agent x: /home/agents/x.toml\n" || len(spy.agents) != 1 || spy.approved[0].Digest != "d1" {
		t.Fatalf("nothing to replace: %+v, agents %v", r, spy.agents)
	}
}

func TestAgentCreatePayload(t *testing.T) {
	spy := &clientSpy{}
	r := run(context.Background(), spy, "--home", "rel", "agent", "create", "x", "--runtime", "rt", "--model", "m", "--model-family", "f", "--effort", "high", "--session", "resumable", "--command", "/bin/c")
	want := contract.Agent{Name: "x", Runtime: "rt", Model: "m", ModelFamily: "f", Effort: "high", Session: "resumable", Command: "/bin/c"}
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
		{"run", "p", "--max-cost", "free"},
		{"run", "p", "--max-cost", "-1"},
	} {
		spy := &clientSpy{}
		r := run(context.Background(), spy, args...)
		if r.code != cli.ExitUsage || len(spy.submitted) != 0 || len(spy.agents) != 0 {
			t.Errorf("%v: %+v", args, r)
		}
	}
}

// workflowSpy answers the workflow commands.
type workflowSpy struct {
	clientSpy
	summaries []contract.WorkflowSummary
	shown     []string
	workflow  contract.WorkflowView
}

func (s *workflowSpy) ListWorkflows(context.Context) ([]contract.WorkflowSummary, error) {
	return s.summaries, nil
}

func (s *workflowSpy) ShowWorkflow(_ context.Context, name string) (contract.WorkflowView, error) {
	s.shown = append(s.shown, name)
	return s.workflow, nil
}

func TestWorkflowListAndShow(t *testing.T) {
	spy := &workflowSpy{
		summaries: []contract.WorkflowSummary{{Name: "w", FanOut: []string{"one:p", "two:q"}, Join: "merge:j"}, {Name: "broken", Problem: "invalid (run `agister check`)"}},
		workflow: contract.WorkflowView{
			Name:   "w",
			Params: []contract.Param{{Name: "candidate", Default: "HEAD"}},
			Inputs: []string{"candidate <- git.revision"},
			FanOut: []contract.WorkflowNode{
				{Name: "one", Process: contract.ProcessView{Name: "p", Agent: "a", Runtime: "rt", Primitives: []string{"Read"}}, Params: []string{"candidate"}},
				{Name: "two", Process: contract.ProcessView{Name: "q", Refusal: "no agent"}},
			},
			Join:       contract.WorkflowNode{Name: "merge", Process: contract.ProcessView{Name: "j", Agent: "a", Runtime: "rt"}},
			Collection: "gathered",
		},
	}
	var stdout, stderr bytes.Buffer
	build := func(cli.Config) (contract.Client, error) { return spy, nil }
	code := cli.Run(context.Background(), []string{"workflow", "list"}, cli.IO{Stdout: &stdout, Stderr: &stderr, Cwd: "/work", Getenv: func(string) string { return "" }}, build)
	if code != 0 || stdout.String() != "w\tone:p,two:q\tjoin merge:j\nbroken\tinvalid (run `agister check`)\n" {
		t.Fatalf("list: %d %q %q", code, stdout.String(), stderr.String())
	}
	stdout.Reset()
	code = cli.Run(context.Background(), []string{"workflow", "show", "w"}, cli.IO{Stdout: &stdout, Stderr: &stderr, Cwd: "/work", Getenv: func(string) string { return "" }}, build)
	want := `workflow     w
params       candidate=HEAD
inputs       candidate <- git.revision
fan-out      one: process p, agent a (runtime rt)
  receives   params candidate
  plan       Read
             two: process q
  receives   params (none)
  plan       REFUSED: no agent
join         merge: process j, agent a (runtime rt)
  receives   the collection as input gathered, and nothing else
  plan       (none)
`
	if code != 0 || stdout.String() != want || !reflect.DeepEqual(spy.shown, []string{"w"}) {
		t.Fatalf("show: %d\n%s\nwant\n%s", code, stdout.String(), want)
	}
}

// process show prints the effective staleness limits, and no line for them
// when there are none.
func TestShowProcessPrintsTheStalenessLimits(t *testing.T) {
	spy := &clientSpy{view: contract.ProcessView{Name: "p", Agent: "a", Runtime: "rt", Output: "text", Timeout: time.Hour, MaxAttempts: 1,
		Stale: contract.Stale{NoEvent: 5 * time.Minute, NoOutput: 2 * time.Minute, ToolCommand: 10 * time.Minute, RepeatedToolCalls: 5}}}
	r := run(context.Background(), spy, "process", "show", "p")
	if want := "  stale      no event 5m0s, no output 2m0s, tool command 10m0s, repeated tool calls 5\n"; r.code != 0 || !strings.Contains(r.stdout, want) {
		t.Fatalf("missing %q in %d:\n%s", want, r.code, r.stdout)
	}
	spy.view.Stale = contract.Stale{NoEvent: 5 * time.Minute}
	if r := run(context.Background(), spy, "process", "show", "p"); !strings.Contains(r.stdout, "  stale      no event 5m0s\n") {
		t.Fatalf("one limit:\n%s", r.stdout)
	}
	spy.view.Stale = contract.Stale{}
	if r := run(context.Background(), spy, "process", "show", "p"); strings.Contains(r.stdout, "stale") {
		t.Fatalf("without limits:\n%s", r.stdout)
	}
}

func TestHelpNamesTheSessionsLatestRunAsThePatchSource(t *testing.T) {
	r := run(context.Background(), &clientSpy{}, "--help")
	if r.code != 0 || !strings.Contains(r.stdout, "the session's latest run's changes") {
		t.Fatalf("help: code %d, stdout %q, stderr %q", r.code, r.stdout, r.stderr)
	}
}
