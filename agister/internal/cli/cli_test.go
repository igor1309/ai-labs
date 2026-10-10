package cli_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
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

	exported  contract.ExportResult // returned by Export
	exportErr error                 // returned by Export

	buildErr error        // returned by the build in place of the client
	logged   bytes.Buffer // the log the CLI was given
	logHome  string       // the home whose log the CLI opened
}

// logs is what the CLI logged, record by record.
func (s *clientSpy) logs(t *testing.T) []map[string]any {
	t.Helper()
	var records []map[string]any
	for _, line := range strings.Split(strings.TrimSpace(s.logged.String()), "\n") {
		var record map[string]any
		if err := json.Unmarshal([]byte(line), &record); line != "" && err != nil {
			t.Fatalf("log line %q: %v", line, err)
		} else if line != "" {
			records = append(records, record)
		}
	}
	return records
}

// unlogged opens a log nobody reads.
func unlogged(cli.Config) (*slog.Logger, error) { return slog.New(slog.DiscardHandler), nil }

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

func (s *clientSpy) Export(context.Context, contract.ExportRequest) (contract.ExportResult, error) {
	return s.exported, s.exportErr
}

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

// testVersion is the version the composition root would read from the build.
const testVersion = "v1.2.3 143e31f8 2026-10-02T11:31:17Z"

func run(ctx context.Context, spy *clientSpy, args ...string) result {
	var stdout, stderr bytes.Buffer
	code := cli.Run(ctx, args, cli.IO{Stdout: &stdout, Stderr: &stderr, Cwd: "/work", Version: testVersion, Getenv: func(key string) string {
		if key == "AGISTER_HOME" {
			return "/env-home"
		}
		return ""
	}}, func(config cli.Config) (contract.Client, error) {
		spy.config = config
		if spy.buildErr != nil {
			return nil, spy.buildErr
		}
		return spy, nil
	}, func(config cli.Config) (*slog.Logger, error) {
		spy.logHome = config.Home
		return slog.New(slog.NewJSONHandler(&spy.logged, nil)), nil
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
	t.Parallel()
	spy := &clientSpy{run: finished("completed", "")}
	spy.run.Result.Text = "hi"
	r := run(context.Background(), spy, "run", "p", "--param", "a=1", "--agent", "x", "--param", "b=two=2", "--timeout", "5m", "--max-cost", "0.5", "--continue", "run-0", "--goal", "run-g:brief", "--answers", "run-j", "--quiet")
	limit := 0.5
	want := contract.CallRequest{Process: "p", Params: map[string]string{"a": "1", "b": "two=2"}, Agent: "x", Timeout: "5m", MaxCostUSD: &limit, Continue: "run-0", Goal: "run-g:brief", Answers: "run-j", Cwd: "/work"}
	if !reflect.DeepEqual(spy.submitted, []contract.CallRequest{want}) {
		t.Fatalf("submitted %+v", spy.submitted)
	}
	if !reflect.DeepEqual(spy.observed, []string{"run-1@0"}) || spy.config.Home != "/env-home" {
		t.Fatalf("observed %v, config %+v", spy.observed, spy.config)
	}
	if r.code != cli.ExitCompleted || r.stdout != "hi\n" {
		t.Fatalf("result = %+v", r)
	}
}

// ADR-025 rule 1: --dir names the directory a call, or a workflow's nodes,
// work in, relative to the working directory or absolute; the settings are
// read from it, as from the working directory without it.
func TestRunWorksInTheDirectoryDirNames(t *testing.T) {
	t.Parallel()
	for dir, want := range map[string]string{"../other": "/other", "/repo/sub": "/repo/sub"} {
		spy := &clientSpy{run: finished("completed", "")}
		r := run(context.Background(), spy, "run", "p", "--dir", dir, "--quiet")
		if r.code != cli.ExitCompleted || len(spy.submitted) != 1 || spy.submitted[0].Cwd != want || spy.config.Cwd != want {
			t.Errorf("--dir %s: result %+v, submitted %+v, config %+v", dir, r, spy.submitted, spy.config)
		}
	}
	// A workflow call takes --dir as a process call does: its nodes work there.
	workflow := finished("completed", "")
	workflow.Process = "w"
	workflow.Result.Output = json.RawMessage(`{"verdict":"approve"}`)
	spy := &clientSpy{run: workflow, events: []contract.Event{{Kind: "WORKFLOW_FINISHED"}}}
	r := run(context.Background(), spy, "run", "w", "--param", "goal=g.md", "--dir", "../other", "--quiet")
	want := contract.CallRequest{Process: "w", Params: map[string]string{"goal": "g.md"}, Cwd: "/other"}
	if r.code != cli.ExitCompleted || !reflect.DeepEqual(spy.submitted, []contract.CallRequest{want}) || spy.config.Cwd != "/other" {
		t.Errorf("workflow --dir: result %+v, submitted %+v, config %+v", r, spy.submitted, spy.config)
	}
}

// ADR-025: --workspace is gone; the command refuses it as an unknown flag,
// and nothing is submitted.
func TestRunRefusesWorkspaceAsAnUnknownFlag(t *testing.T) {
	t.Parallel()
	spy := &clientSpy{run: finished("completed", "")}
	r := run(context.Background(), spy, "run", "p", "--workspace", "in-place", "--quiet")
	if r.code != cli.ExitUsage || !strings.Contains(r.stderr, "flag provided but not defined: -workspace\n") || len(spy.submitted) != 0 {
		t.Fatalf("result = %+v, submitted %+v", r, spy.submitted)
	}
}

func TestExitCodeAndOutputFollowTheNodeResult(t *testing.T) {
	t.Parallel()
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
	t.Parallel()
	spy := &clientSpy{run: finished("failed", "rate_limited")}
	r := run(context.Background(), spy, "run", "p", "--json", "--quiet")
	var got contract.Result
	if err := json.Unmarshal([]byte(r.stdout), &got); err != nil || got.Status != "failed" || got.Error.Class != "rate_limited" || r.code != cli.ExitFailed {
		t.Fatalf("stdout %s, err %v", r.stdout, err)
	}
}

// --json names the run and gives each artifact's path absolute, in the
// run's directory, for a process run and for a workflow run alike; the
// stored record keeps its relative paths.
func TestJSONNamesTheRunAndGivesAbsoluteArtifactPaths(t *testing.T) {
	t.Parallel()
	process := finished("completed", "")
	process.Dir = "/home/runs/run-1"
	process.Record = json.RawMessage(`{"id":"run-1","result":{"artifacts":[{"path":"artifacts/changes.patch"}]}}`)
	process.Result.Artifacts = []contract.Artifact{{Name: "changes.patch", Path: "artifacts/changes.patch", Digest: "sha256:x", Bytes: 3}}
	workflow := finished("completed", "")
	workflow.Process, workflow.Dir = "wf", "/home/runs/run-1"
	workflow.Result.Output = json.RawMessage(`{"verdict":"approve"}`)
	cases := []struct {
		name      string
		run       contract.Run
		artifacts []contract.Artifact
	}{
		{"process", process, []contract.Artifact{{Name: "changes.patch", Path: "/home/runs/run-1/artifacts/changes.patch", Digest: "sha256:x", Bytes: 3}}},
		{"workflow", workflow, nil},
	}
	for _, c := range cases {
		spy := &clientSpy{run: c.run}
		r := run(context.Background(), spy, "run", c.run.Process, "--json", "--quiet")
		var got struct {
			RunID string `json:"run_id"`
			contract.Result
		}
		if err := json.Unmarshal([]byte(r.stdout), &got); err != nil || r.code != cli.ExitCompleted {
			t.Fatalf("%s: stdout %s, err %v", c.name, r.stdout, err)
		}
		var output bytes.Buffer
		_ = json.Compact(&output, got.Output)
		if got.RunID != "run-1" || got.Status != "completed" || !reflect.DeepEqual(got.Artifacts, c.artifacts) || output.String() != string(c.run.Result.Output) {
			t.Errorf("%s: printed %s", c.name, r.stdout)
		}
	}
	if process.Result.Artifacts[0].Path != "artifacts/changes.patch" {
		t.Fatalf("the result read was changed: %+v", process.Result.Artifacts)
	}
	spy := &clientSpy{run: process}
	if r := run(context.Background(), spy, "runs", "show", "run-1"); r.stdout != string(process.Record)+"\n" {
		t.Fatalf("stored record shown as %s", r.stdout)
	}
}

// A run that finished without a result prints only its ID under --json
// and exits as an internal failure.
func TestJSONOfARunWithoutAResultPrintsOnlyItsID(t *testing.T) {
	t.Parallel()
	spy := &clientSpy{run: contract.Run{ID: "run-1", State: "finished"}}
	r := run(context.Background(), spy, "run", "p", "--json", "--quiet")
	if r.stdout != "{\n  \"run_id\": \"run-1\"\n}\n" || r.code != cli.ExitInternal {
		t.Fatalf("result = %+v", r)
	}
}

func TestResultSummary(t *testing.T) {
	t.Parallel()
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
	t.Parallel()
	ctx, cancel := context.WithCancel(context.Background())
	spy := &clientSpy{run: finished("interrupted", "cancelled"), onCancel: make(chan string, 1)}
	var cancelled string
	spy.observe = func(observeCtx context.Context) {
		cancel()
		cancelled = <-spy.onCancel // the interrupt cancels the run
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

// An export interrupted after some runs still reports those runs, and exits
// as interrupted, not as an internal failure.
func TestAnInterruptedExportReportsTheRunsItExported(t *testing.T) {
	t.Parallel()
	spy := &clientSpy{exportErr: fmt.Errorf("exporting: %w", context.Canceled), exported: contract.ExportResult{To: "/audit", Runs: []contract.ExportedRun{
		{ID: "r1", Dir: "/audit/r1", Action: contract.ExportCopied, Files: 3, Bytes: 120},
	}}}
	r := run(context.Background(), spy, "runs", "export", "r1", "r2", "--to", "/audit")
	if r.code != cli.ExitInterrupted || r.stdout != "copied  r1: 3 files, 120 bytes to /audit/r1\n" || !strings.Contains(r.stderr, "export interrupted") {
		t.Fatalf("result %+v", r)
	}
}

func TestInterruptStopsWatchingWithoutCancelling(t *testing.T) {
	t.Parallel()
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
	t.Parallel()
	spy := &clientSpy{run: finished("completed", ""), events: []contract.Event{
		{Kind: "PLANNED", Data: map[string]any{"primitives": []any{"Read"}}},
		{Kind: "REFUSED", Data: map[string]any{"reason": "because"}},
		{Kind: "TOOL_RESULT", Data: map[string]any{"is_error": true}},
		{Kind: "NO_CHANGES", Data: map[string]any{"name": "changes.patch"}},
		{Kind: "CALL_FINISHED"},
	}}
	r := run(context.Background(), spy, "run", "p")
	if !strings.Contains(r.stderr, "run run-1\n· plan: [Read]\n! refused: because\n  ↳ tool error\n· no changes in the checkout\n") {
		t.Fatalf("stderr:\n%s", r.stderr)
	}
}

// Verification attempts show as they happen: each run, each repair turn,
// and why the loop stopped.
func TestProgressDescribesVerification(t *testing.T) {
	t.Parallel()
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

// A stale turn's recovery shows as it happens: the recovery turn, and why
// one did not start (ADR-024).
func TestProgressDescribesStaleRecovery(t *testing.T) {
	t.Parallel()
	spy := &clientSpy{run: finished("interrupted", "timeout"), events: []contract.Event{
		{Kind: "RECOVERY_STARTED", Data: map[string]any{"recovery": 1.0, "limit": "no_event", "session": "s-1", "message_sha256": "abc"}},
		{Kind: "RECOVERY_NOT_STARTED", Data: map[string]any{"limit": "no_event", "reason": "no resume is left of stale.recover.max_resumes 1"}},
		{Kind: "CALL_FINISHED"},
	}}
	r := run(context.Background(), spy, "run", "p")
	want := "· recovery turn 1 for stale.no_event in session s-1\n" +
		"! RECOVERY_NOT_STARTED {\"limit\":\"no_event\",\"reason\":\"no resume is left of stale.recover.max_resumes 1\"}\n"
	if !strings.Contains(r.stderr, want) {
		t.Fatalf("stderr:\n%s", r.stderr)
	}
}

// A working copy the cache could not keep shows as a warning that names
// the input, its file and the error; the run still completes.
func TestProgressWarnsOfAWorkingCopyNotKept(t *testing.T) {
	t.Parallel()
	spy := &clientSpy{run: finished("completed", ""), events: []contract.Event{
		{Kind: "CACHE_FAILED", Data: map[string]any{"name": "brief.md", "input": "brief", "error": "cache full"}},
		{Kind: "CALL_FINISHED"},
	}}
	r := run(context.Background(), spy, "run", "p")
	if want := "! CACHE_FAILED {\"error\":\"cache full\",\"input\":\"brief\",\"name\":\"brief.md\"}\n"; !strings.Contains(r.stderr, want) {
		t.Fatalf("stderr:\n%s", r.stderr)
	}
	if r.code != cli.ExitCompleted {
		t.Fatalf("code = %d, want %d", r.code, cli.ExitCompleted)
	}
}

// A watch warns of what the cleanup after a runtime's exit found: the
// leftovers it killed, or that it cannot tell, with the group and why.
func TestProgressWarnsOfTheCleanupAfterTheExit(t *testing.T) {
	t.Parallel()
	spy := &clientSpy{run: finished("completed", ""), events: []contract.Event{
		{Kind: "LEFTOVER_PROCESSES_KILLED", Data: map[string]any{"group": 41.0}},
		{Kind: "LEFTOVER_CLEANUP_UNKNOWN", Data: map[string]any{"group": 42.0, "error": "listing the group's processes: permission denied"}},
		{Kind: "CALL_FINISHED"},
	}}
	r := run(context.Background(), spy, "runs", "watch", "run-1")
	want := "! LEFTOVER_PROCESSES_KILLED {\"group\":41}\n" +
		"! LEFTOVER_CLEANUP_UNKNOWN {\"error\":\"listing the group's processes: permission denied\",\"group\":42}\n"
	if !strings.Contains(r.stderr, want) {
		t.Fatalf("stderr:\n%s", r.stderr)
	}
}

// A watch prints each path a tool call wrote and each tool call denied in
// a line of its own. A path, a tool name or an input that holds a newline
// is quoted, so it stays one line and forges no other; an ordinary one
// prints as it is.
func TestProgressDescribesTheTrail(t *testing.T) {
	t.Parallel()
	spy := &clientSpy{run: finished("completed", ""), events: []contract.Event{
		{Kind: "TOUCHED", Data: map[string]any{"path": "/work/a.go", "tool": "Edit", "tool_use_id": "t1"}},
		{Kind: "TOUCHED", Data: map[string]any{"path": "a.go\n! denied: Bash fake", "tool": "Write", "tool_use_id": "t2"}},
		{Kind: "PERMISSION_DENIED", Data: map[string]any{"tool": "Bash", "input": `{"command":"git push"}`}},
		// A tool name or an input that holds a newline would forge another
		// line, and an input that starts with a quote would read as one
		// quoted: each is quoted.
		{Kind: "TOUCHED", Data: map[string]any{"path": "b.go", "tool": "Edit\n· touched c.go", "tool_use_id": "t3"}},
		{Kind: "PERMISSION_DENIED", Data: map[string]any{"tool": "Bash\n! denied: Edit", "input": "x\n· touched d.go (Edit)"}},
		{Kind: "PERMISSION_DENIED", Data: map[string]any{"tool": "Bash", "input": `"x\n· touched d.go (Edit)"`}},
		{Kind: "CALL_FINISHED"},
	}}
	r := run(context.Background(), spy, "runs", "watch", "run-1")
	want := "· touched /work/a.go (Edit)\n" +
		`· touched "a.go\n! denied: Bash fake" (Write)` + "\n" +
		"! denied: Bash {\"command\":\"git push\"}\n" +
		`· touched b.go ("Edit\n· touched c.go")` + "\n" +
		`! denied: "Bash\n! denied: Edit" "x\n· touched d.go (Edit)"` + "\n" +
		`! denied: Bash "\"x\\n· touched d.go (Edit)\""` + "\n"
	if !strings.Contains(r.stderr, want) {
		t.Fatalf("stderr:\n%s", r.stderr)
	}
}

// A workflow's progress says which fan-out nodes its join runs without, and
// that no join ran when none completed (ADR-004).
func TestProgressNamesTheNodesThatDidNotComplete(t *testing.T) {
	t.Parallel()
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
			t.Parallel()
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
	t.Parallel()
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
	t.Parallel()
	spy := &clientSpy{run: finished("completed", "")}
	run(context.Background(), spy, "runs", "watch", "r", "--after", "5", "--quiet")
	if !reflect.DeepEqual(spy.observed, []string{"r@5"}) || len(spy.submitted) != 0 {
		t.Fatalf("observed %v", spy.observed)
	}
}

func TestCheck(t *testing.T) {
	t.Parallel()
	spy := &clientSpy{report: contract.CheckReport{Checked: map[string]int{"agents": 2}, Problems: []contract.Problem{{Message: "agent a: bad"}}}}
	r := run(context.Background(), spy, "check", "--probe")
	if r.code != cli.ExitUsage || r.stderr != "agent a: bad\n1 problem(s) in 2 agents\n" || !reflect.DeepEqual(spy.checked, []bool{true}) {
		t.Fatalf("result %+v, checked %v", r, spy.checked)
	}
	spy.report.Problems = nil
	if r := run(context.Background(), spy, "check"); r.code != 0 || r.stdout != "settings OK: 2 agents\n" {
		t.Fatalf("result %+v", r)
	}
}

// A problem that names something this binary does not know may mean the
// settings were written for a newer one: after the problems, a line says
// so and names the binary. Each problem's own message is unchanged.
func TestCheckHintsAtANewerBinary(t *testing.T) {
	t.Parallel()
	hint := "1 problem(s) name something this binary does not know; the settings may need one newer than agister " + testVersion + ".\n"
	report := contract.CheckReport{Checked: map[string]int{"runtimes": 1}, Problems: []contract.Problem{
		{Message: "runtime mapping rt: unknown adapter \"opencode\" (available: claude-code, codex)", Unknown: true},
		{Message: "runtime mapping rt: verifies no primitive against any runtime version; calls on it are refused"},
	}}
	spy := &clientSpy{report: report}
	r := run(context.Background(), spy, "check")
	want := report.Problems[0].Message + "\n" + report.Problems[1].Message + "\n2 problem(s) in 1 runtimes\n" + hint
	if r.code != cli.ExitUsage || r.stderr != want {
		t.Fatalf("check: %d\n%s", r.code, r.stderr)
	}

	// The refusal of any other command prints the same report.
	spy = &clientSpy{refuse: &contract.SettingsError{Report: report}}
	r = run(context.Background(), spy, "run", "p")
	if r.code != cli.ExitUsage || !strings.HasPrefix(r.stderr, want+"agister: ") {
		t.Fatalf("refused run: %d\n%s", r.code, r.stderr)
	}

	// In JSON, the marker is on the problem, and no hint line is printed:
	// the hint is for text output.
	spy = &clientSpy{report: report}
	r = run(context.Background(), spy, "check", "--json")
	if r.stderr != "" {
		t.Fatalf("json prints to stderr: %q", r.stderr)
	}
	var got struct {
		Problems []map[string]any `json:"problems"`
	}
	if err := json.Unmarshal([]byte(r.stdout), &got); err != nil || r.code != cli.ExitUsage || len(got.Problems) != 2 ||
		got.Problems[0]["unknown"] != true || got.Problems[0]["message"] != report.Problems[0].Message {
		t.Fatalf("json: %d %v\n%s", r.code, err, r.stdout)
	}
	if _, ok := got.Problems[1]["unknown"]; ok {
		t.Fatalf("json marks an unmarked problem: %v", got.Problems[1])
	}

	// Without a marked problem, no such line.
	spy = &clientSpy{report: contract.CheckReport{Checked: map[string]int{"runtimes": 1}, Problems: report.Problems[1:]}}
	r = run(context.Background(), spy, "check")
	if r.code != cli.ExitUsage || r.stderr != report.Problems[1].Message+"\n1 problem(s) in 1 runtimes\n" {
		t.Fatalf("unmarked: %d\n%s", r.code, r.stderr)
	}
}

// agister --version and agister version print the version the composition
// root gives, and need no settings: the client is never built.
func TestVersionNeedsNoSettings(t *testing.T) {
	t.Parallel()
	for _, args := range [][]string{{"--version"}, {"version"}, {"--home", "/nowhere", "--version"}} {
		var stdout, stderr bytes.Buffer
		built := 0
		code := cli.Run(context.Background(), args, cli.IO{Stdout: &stdout, Stderr: &stderr, Version: testVersion, Getenv: func(string) string { return "" }},
			func(cli.Config) (contract.Client, error) {
				built++
				return nil, fmt.Errorf("no settings")
			}, func(cli.Config) (*slog.Logger, error) {
				built++
				return nil, fmt.Errorf("no home")
			})
		if code != 0 || stdout.String() != "agister "+testVersion+"\n" || stderr.Len() != 0 || built != 0 {
			t.Errorf("%v: %d, built %d times, stdout %q, stderr %q", args, code, built, stdout.String(), stderr.String())
		}
	}
}

// Warnings are printed whether or not the settings have problems, and are
// not problems themselves.
func TestCheckPrintsWarnings(t *testing.T) {
	t.Parallel()
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
	t.Parallel()
	spy := &clientSpy{report: contract.CheckReport{Checked: map[string]int{"processes": 1},
		Problems: []contract.Problem{{Message: "process q: agent \"ghost\" does not exist"}},
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
	t.Parallel()
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

// A process that names no agent is listed and shown without one (ADR-030
// rule 2): no empty name, and no runtime.
func TestAProcessThatNamesNoAgentIsListedAndShownWithoutOne(t *testing.T) {
	t.Parallel()
	listing := &listingSpy{processList: []contract.ProcessSummary{{Name: "p", Agent: "a", Output: "text"}, {Name: "q", Output: "json:s"}}}
	var stdout, stderr bytes.Buffer
	build := func(cli.Config) (contract.Client, error) { return listing, nil }
	io := cli.IO{Stdout: &stdout, Stderr: &stderr, Cwd: "/work", Getenv: func(string) string { return "" }}
	if code := cli.Run(context.Background(), []string{"process", "list"}, io, build, unlogged); code != 0 || stdout.String() != "p\tagent:a\ttext\nq\tagent:-\tjson:s\n" {
		t.Fatalf("process list: %d %q %q", code, stdout.String(), stderr.String())
	}
	spy := &clientSpy{view: contract.ProcessView{Name: "q", Output: "json:s", Timeout: time.Hour, MaxAttempts: 1, Refusal: "process q: names no agent"}}
	r := run(context.Background(), spy, "process", "show", "q")
	if want := "process      q\nagent        (none: a workflow's node binds it to one)\nparams "; r.code != 0 || !strings.HasPrefix(r.stdout, want) {
		t.Fatalf("process show: %d\n%s", r.code, r.stdout)
	}
	if want := "REFUSED: process q: names no agent"; !strings.Contains(r.stdout, want) {
		t.Fatalf("missing %q in:\n%s", want, r.stdout)
	}
}

// process show says which verification the verify fields come from, and of
// one that was not resolved, that it was not, beside the refusal.
func TestShowProcessPrintsTheNamedVerification(t *testing.T) {
	t.Parallel()
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

// process show names the process's prompt and its guidance, each with the
// layer and path it comes from, or as not resolved beside the refusal; a
// process with no guidance says so (ADR-028 rule 8).
func TestShowProcessPrintsThePromptAndGuidance(t *testing.T) {
	t.Parallel()
	spy := &clientSpy{view: contract.ProcessView{Name: "p", Agent: "a", Runtime: "rt", Output: "text", Timeout: time.Hour, MaxAttempts: 1,
		Inputs: []string{"diff <- git.diff"}, Prompt: "review", Guidance: []string{"rules", "style"},
		Sources: []contract.DefinitionOrigin{
			{Kind: "processes", Name: "p", Layer: "home", Path: "/h/processes/p.yaml"},
			{Kind: "prompts", Name: "review", Layer: "home", Path: "/h/prompts/review.md"},
			{Kind: "prompts", Name: "rules", Layer: "repository", Path: "/r/.agister/prompts/rules.md", Layers: []contract.DefinitionLayer{
				{Layer: "repository", Path: "/r/.agister/prompts/rules.md"}, {Layer: "home", Path: "/h/prompts/rules.md", Replaced: true},
			}},
			{Kind: "prompts", Name: "style", Layer: "project", Path: "/r/docs/prompts/style.md"},
		}}}
	r := run(context.Background(), spy, "process", "show", "p")
	for _, want := range []string{
		"prompt       review: home /h/prompts/review.md\n" +
			"guidance     rules: repository /r/.agister/prompts/rules.md\n" +
			"             style: project /r/docs/prompts/style.md\nplan ",
		"sources      process p: home /h/processes/p.yaml\n" +
			"             prompt review: home /h/prompts/review.md\n" +
			"             prompt rules: repository /r/.agister/prompts/rules.md\n" +
			"                           home /h/prompts/rules.md (replaced)\n" +
			"             prompt style: project /r/docs/prompts/style.md\n",
	} {
		if r.code != 0 || !strings.Contains(r.stdout, want) {
			t.Fatalf("missing %q in %d:\n%s", want, r.code, r.stdout)
		}
	}
	spy.view.Sources = spy.view.Sources[:3]
	spy.view.Refusal = `process p names in its guidance prompt "style": not found (expected /r/.agister/prompts/style.md or /h/prompts/style.md)`
	r = run(context.Background(), spy, "process", "show", "p")
	want := "             style (not resolved)\nplan         REFUSED: " + spy.view.Refusal + "\n"
	if r.code != 0 || !strings.Contains(r.stdout, want) {
		t.Fatalf("missing %q in %d:\n%s", want, r.code, r.stdout)
	}

	spy.view.Guidance, spy.view.Refusal = nil, ""
	r = run(context.Background(), spy, "process", "show", "p")
	if want := "prompt       review: home /h/prompts/review.md\nguidance     (none)\nplan "; r.code != 0 || !strings.Contains(r.stdout, want) {
		t.Fatalf("missing %q in %d:\n%s", want, r.code, r.stdout)
	}
}

// check --tree shows a process's prompt and its guidance under it, each
// guidance prompt marked so, and a missing one as missing (ADR-028 rule
// 12).
func TestCheckTreeShowsThePromptAndGuidance(t *testing.T) {
	t.Parallel()
	ref := func(kind, name string) contract.DefinitionRef { return contract.DefinitionRef{Kind: kind, Name: name} }
	guidance := func(name string) contract.DefinitionRef {
		return contract.DefinitionRef{Kind: "prompts", Name: name, Guidance: true}
	}
	report := contract.CheckReport{
		Checked: map[string]int{"processes": 1, "prompts": 2},
		Definitions: []contract.Definition{
			{Kind: "prompts", Name: "implement", Layer: "home", Path: "/h/prompts/implement.md", UsedBy: []contract.DefinitionRef{ref("processes", "implement")}},
			{Kind: "prompts", Name: "testing", Layer: "repository", Path: "/r/prompts/testing.md", UsedBy: []contract.DefinitionRef{ref("processes", "implement")}},
			{Kind: "processes", Name: "implement", Layer: "home", Path: "/h/processes/implement.yaml",
				Uses: []contract.DefinitionRef{ref("prompts", "implement"), guidance("testing"), guidance("architecture")}},
		},
	}
	r := run(context.Background(), &clientSpy{report: report}, "check", "--tree")
	want := `process implement       home       /h/processes/implement.yaml
├─ prompt implement     home       /h/prompts/implement.md
├─ prompt testing       repository /r/prompts/testing.md (guidance)
└─ prompt architecture  MISSING (guidance)
settings OK: 1 processes, 2 prompts
`
	if r.code != 0 || r.stdout != want {
		t.Fatalf("tree: %d\n%s", r.code, r.stdout)
	}
}

// process show lists the call's skills, the process's then its agent's,
// each with the layer and path it comes from, or as not resolved beside the
// refusal (ADR-021).
func TestShowProcessPrintsTheSkills(t *testing.T) {
	t.Parallel()
	spy := &clientSpy{view: contract.ProcessView{Name: "p", Agent: "a", Runtime: "rt", Output: "text", Timeout: time.Hour, MaxAttempts: 1,
		Skills: []string{"review", "tests"}, AgentSkills: []string{"style"},
		Sources: []contract.DefinitionOrigin{
			{Kind: "processes", Name: "p", Layer: "home", Path: "/h/processes/p.yaml"},
			{Kind: "skills", Name: "review", Layer: "repository", Path: "/r/.agister/skills/review/SKILL.md", Layers: []contract.DefinitionLayer{
				{Layer: "repository", Path: "/r/.agister/skills/review/SKILL.md"}, {Layer: "home", Path: "/h/skills/review/SKILL.md", Replaced: true},
			}},
			{Kind: "skills", Name: "tests", Layer: "home", Path: "/h/skills/tests/SKILL.md"},
			{Kind: "skills", Name: "style", Layer: "home", Path: "/h/skills/style/SKILL.md"},
		}}}
	r := run(context.Background(), spy, "process", "show", "p")
	for _, want := range []string{
		"skills       review (process): repository /r/.agister/skills/review/SKILL.md\n" +
			"             tests (process): home /h/skills/tests/SKILL.md\n" +
			"             style (agent): home /h/skills/style/SKILL.md\nplan ",
		"             skill review: repository /r/.agister/skills/review/SKILL.md\n" +
			"                           home /h/skills/review/SKILL.md (replaced)\n",
	} {
		if r.code != 0 || !strings.Contains(r.stdout, want) {
			t.Fatalf("missing %q in %d:\n%s", want, r.code, r.stdout)
		}
	}
	// The agent's alone are still the call's.
	spy.view.Skills, spy.view.Sources = nil, spy.view.Sources[:1]
	spy.view.Refusal = `agent a names skill "style": not found (expected /r/.agister/skills/style/SKILL.md or /h/skills/style/SKILL.md)`
	r = run(context.Background(), spy, "process", "show", "p")
	want := "skills       style (agent, not resolved)\nplan         REFUSED: " + spy.view.Refusal + "\n"
	if r.code != 0 || !strings.Contains(r.stdout, want) {
		t.Fatalf("missing %q in %d:\n%s", want, r.code, r.stdout)
	}
	// A process whose call has none shows none.
	spy.view.AgentSkills, spy.view.Refusal = nil, ""
	if r = run(context.Background(), spy, "process", "show", "p"); r.code != 0 || strings.Contains(r.stdout, "skills") {
		t.Fatalf("skills shown for a call with none: %d\n%s", r.code, r.stdout)
	}
}

// check --tree shows the skills under the agent and the process that name
// them, a missing one as missing, and one nothing names as unused.
func TestCheckTreeShowsSkills(t *testing.T) {
	t.Parallel()
	ref := func(kind, name string) contract.DefinitionRef { return contract.DefinitionRef{Kind: kind, Name: name} }
	report := contract.CheckReport{
		Checked: map[string]int{"processes": 1, "skills": 3},
		Definitions: []contract.Definition{
			{Kind: "service", Name: "service", Layer: "home", Path: "/g/service.toml"},
			{Kind: "runtimes", Name: "rt", Layer: "home", Path: "/g/runtimes/rt.yaml", UsedBy: []contract.DefinitionRef{ref("agents", "a")}},
			{Kind: "agents", Name: "a", Layer: "home", Path: "/g/agents/a.toml", Uses: []contract.DefinitionRef{ref("runtimes", "rt"), ref("skills", "style")}, UsedBy: []contract.DefinitionRef{ref("processes", "p")}},
			{Kind: "skills", Name: "review", Layer: "repository", Path: "/p/skills/review/SKILL.md", Layers: []contract.DefinitionLayer{
				{Layer: "repository", Path: "/p/skills/review/SKILL.md"}, {Layer: "home", Path: "/g/skills/review/SKILL.md", Replaced: true},
			}, UsedBy: []contract.DefinitionRef{ref("processes", "p")}},
			{Kind: "skills", Name: "style", Layer: "home", Path: "/g/skills/style/SKILL.md", UsedBy: []contract.DefinitionRef{ref("agents", "a")}},
			{Kind: "skills", Name: "spare", Layer: "home", Path: "/g/skills/spare/SKILL.md", Invalid: true},
			{Kind: "processes", Name: "p", Layer: "home", Path: "/g/processes/p.yaml", Uses: []contract.DefinitionRef{ref("agents", "a"), ref("skills", "review"), ref("skills", "lost")}},
		},
	}
	r := run(context.Background(), &clientSpy{report: report}, "check", "--tree")
	want := `service service    home       /g/service.toml
process p          home       /g/processes/p.yaml
├─ agent a         home       /g/agents/a.toml
│  ├─ runtime rt   home       /g/runtimes/rt.yaml
│  └─ skill style  home       /g/skills/style/SKILL.md
├─ skill review    repository /p/skills/review/SKILL.md
│                  home       /g/skills/review/SKILL.md (replaced)
└─ skill lost      MISSING
unused (no process uses these)
   skill spare     home       /g/skills/spare/SKILL.md INVALID
settings OK: 1 processes, 3 skills
`
	if r.code != 0 || r.stdout != want {
		t.Fatalf("tree: %d\n%s", r.code, r.stdout)
	}
}

// check --tree shows the brief forms under the process and the workflow
// whose inputs name them (ADR-026 rule 8), a missing one as missing, and
// one nothing names as unused.
func TestCheckTreeShowsBriefs(t *testing.T) {
	t.Parallel()
	ref := func(kind, name string) contract.DefinitionRef { return contract.DefinitionRef{Kind: kind, Name: name} }
	report := contract.CheckReport{
		Checked: map[string]int{"processes": 1, "workflows": 1, "briefs": 3},
		Definitions: []contract.Definition{
			{Kind: "service", Name: "service", Layer: "home", Path: "/g/service.toml"},
			{Kind: "briefs", Name: "goal", Layer: "repository", Path: "/p/briefs/goal.yaml", Layers: []contract.DefinitionLayer{
				{Layer: "repository", Path: "/p/briefs/goal.yaml", Fields: []string{"sections.goal.heading", "max_bytes"}},
				{Layer: "home", Path: "/g/briefs/goal.yaml", Fields: []string{"schema", "name"}},
			}, UsedBy: []contract.DefinitionRef{ref("processes", "implement"), ref("workflows", "review")}},
			{Kind: "briefs", Name: "step", Layer: "home", Path: "/g/briefs/step.yaml", UsedBy: []contract.DefinitionRef{ref("processes", "implement")}},
			{Kind: "briefs", Name: "plan", Layer: "home", Path: "/g/briefs/plan.yaml", Invalid: true},
			{Kind: "processes", Name: "implement", Layer: "home", Path: "/g/processes/implement.yaml", Uses: []contract.DefinitionRef{ref("briefs", "goal"), ref("briefs", "step")}},
			{Kind: "workflows", Name: "review", Layer: "home", Path: "/g/workflows/review.yaml", Uses: []contract.DefinitionRef{ref("briefs", "goal"), ref("briefs", "lost")}},
		},
	}
	r := run(context.Background(), &clientSpy{report: report}, "check", "--tree")
	want := `service service    home       /g/service.toml
process implement  home       /g/processes/implement.yaml
├─ brief goal      repository /p/briefs/goal.yaml
│                               sections.goal.heading, max_bytes
│                  home       /g/briefs/goal.yaml
└─ brief step      home       /g/briefs/step.yaml
workflow review    home       /g/workflows/review.yaml
├─ brief goal      repository /p/briefs/goal.yaml
│                               sections.goal.heading, max_bytes
│                  home       /g/briefs/goal.yaml
└─ brief lost      MISSING
unused (no process uses these)
   brief plan      home       /g/briefs/plan.yaml INVALID
settings OK: 1 processes, 1 workflows, 3 briefs
`
	if r.code != 0 || r.stdout != want {
		t.Fatalf("tree: %d\n%s", r.code, r.stdout)
	}
}

// A client refusal over broken settings prints their report, then the
// refusal, and exits 64; a bare agister checks before it shows the usage.
func TestSettingsRefusalPrintsTheReport(t *testing.T) {
	t.Parallel()
	broken := contract.CheckReport{Checked: map[string]int{"agents": 1}, Problems: []contract.Problem{{Message: "agent a: bad"}}, Overrides: []string{"agent a: /p overrides /g"}}
	spy := &clientSpy{refuse: &contract.SettingsError{Report: broken}}
	r := run(context.Background(), spy, "run", "p")
	if r.code != cli.ExitUsage || r.stderr != "agent a: bad\n1 problem(s) in 1 agents\nagister: settings have problems that stop every command; fix them first (see `agister check`)\n" || r.stdout != "override agent a: /p overrides /g\n" {
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
	// A problem of one document stops nothing but what uses it (ADR-015).
	attributed := broken
	attributed.Reach = []contract.ProblemReach{{Problem: "agent a: bad", Subject: &contract.DefinitionRef{Kind: "agents", Name: "a"}}}
	spy = &clientSpy{report: attributed}
	if r := run(context.Background(), spy); r.code != cli.ExitUsage || !strings.Contains(r.stdout, "Usage:") || r.stderr != "" {
		t.Fatalf("bare with a problem of one document: %+v", r)
	}
	for _, args := range [][]string{{"--help"}, {"-h"}, {"run", "p", "--help"}} {
		spy := &clientSpy{report: broken}
		if r := run(context.Background(), spy, args...); r.code != 0 || len(spy.checked) != 0 {
			t.Errorf("%v: %+v, checked %v", args, r, spy.checked)
		}
	}
}

// listingSpy answers the agent and process listings.
type listingSpy struct {
	clientSpy
	agentList   []contract.Agent
	processList []contract.ProcessSummary
}

func (s *listingSpy) ListAgents(context.Context) ([]contract.Agent, error) { return s.agentList, nil }

func (s *listingSpy) ListProcesses(context.Context) ([]contract.ProcessSummary, error) {
	return s.processList, nil
}

// Check says, below each problem, what it refuses; listings show each
// broken agent and each refused process (ADR-015).
func TestCheckAndListingsSayWhatIsRefused(t *testing.T) {
	t.Parallel()
	ref := &contract.DefinitionRef{Kind: "runtimes", Name: "rt"}
	spy := &listingSpy{
		clientSpy: clientSpy{report: contract.CheckReport{
			Checked:  map[string]int{"runtimes": 2},
			Problems: []contract.Problem{{Message: "runtime mapping rt: bad"}, {Message: "runtime mapping unused: bad"}, {Message: "workflow p: a process has the same name"}},
			Reach: []contract.ProblemReach{
				{Problem: "runtime mapping rt: bad", Subject: ref, Processes: []string{"p", "q"}, Workflows: []string{"w"}},
				{Problem: "runtime mapping unused: bad", Subject: &contract.DefinitionRef{Kind: "runtimes", Name: "unused"}},
				{Problem: "workflow p: a process has the same name", Stops: true},
			},
		}},
		agentList: []contract.Agent{
			{Name: "a", Runtime: "rt", Model: "m"},
			{Name: "b", Runtime: "broken", Refusal: "agent b uses runtime mapping broken (/broken.yaml): bad"},
			{Name: "z", Problem: "invalid (run `agister check`)"},
		},
		processList: []contract.ProcessSummary{
			{Name: "p", Agent: "a", Output: "text", Refusal: "process p uses agent a, which uses runtime mapping rt (/rt.yaml): bad"},
			{Name: "s", Agent: "a", Output: "text"},
		},
	}
	r := run(context.Background(), &spy.clientSpy, "check")
	want := "runtime mapping rt: bad\n  refuses process p, process q, workflow w\n" +
		"runtime mapping unused: bad\n  refuses nothing\n" +
		"workflow p: a process has the same name\n  stops every command\n" +
		"3 problem(s) in 2 runtimes\n"
	if r.code != cli.ExitUsage || r.stderr != want {
		t.Fatalf("check: %d\n%s\nwant\n%s", r.code, r.stderr, want)
	}
	if r := run(context.Background(), &spy.clientSpy, "check", "--json"); r.code != cli.ExitUsage || !strings.Contains(r.stdout, `"stops": true`) || !strings.Contains(r.stdout, `"processes": [`) {
		t.Fatalf("check --json: %d\n%s", r.code, r.stdout)
	}

	var stdout, stderr bytes.Buffer
	build := func(cli.Config) (contract.Client, error) { return spy, nil }
	io := cli.IO{Stdout: &stdout, Stderr: &stderr, Cwd: "/work", Getenv: func(string) string { return "" }}
	if code := cli.Run(context.Background(), []string{"agent", "list"}, io, build, unlogged); code != 0 || stdout.String() != "a\trt\tm\t-\t-\nb\tbroken\t(default model)\t-\t-\tREFUSED: agent b uses runtime mapping broken (/broken.yaml): bad\nz\tinvalid (run `agister check`)\n" {
		t.Fatalf("agent list: %d %q %q", code, stdout.String(), stderr.String())
	}
	stdout.Reset()
	if code := cli.Run(context.Background(), []string{"process", "list"}, io, build, unlogged); code != 0 ||
		stdout.String() != "p\tagent:a\ttext\tREFUSED: process p uses agent a, which uses runtime mapping rt (/rt.yaml): bad\ns\tagent:a\ttext\n" {
		t.Fatalf("process list: %d %q %q", code, stdout.String(), stderr.String())
	}
}

func TestCheckTreeAndJSON(t *testing.T) {
	t.Parallel()
	ref := func(kind, name string) contract.DefinitionRef { return contract.DefinitionRef{Kind: kind, Name: name} }
	report := contract.CheckReport{
		Checked:   map[string]int{"processes": 1},
		Overrides: []string{"agent a: /p/agents/a.toml overrides /g/agents/a.toml"},
		Definitions: []contract.Definition{
			{Kind: "service", Name: "service", Layer: "home", Path: "/g/service.toml"},
			{Kind: "workspace", Name: "workspace", Layer: "repository", Path: "/p/workspace.yaml", UsedBy: []contract.DefinitionRef{ref("processes", "p")}},
			{Kind: "runtimes", Name: "rt", Layer: "home", Path: "/g/runtimes/rt.yaml", UsedBy: []contract.DefinitionRef{ref("agents", "a")}},
			{Kind: "agents", Name: "a", Layer: "repository", Path: "/p/agents/a.toml", Layers: []contract.DefinitionLayer{
				{Layer: "project", Path: "/p/sub/.agister/agents/a.toml", Fields: []string{"effort"}},
				{Layer: "repository", Path: "/p/agents/a.toml", Fields: []string{}},
				{Layer: "home", Path: "/g/agents/a.toml", Fields: []string{"schema", "name", "runtime"}},
			}, Uses: []contract.DefinitionRef{ref("runtimes", "rt")}, UsedBy: []contract.DefinitionRef{ref("processes", "p")}},
			// b is used by no process, so neither is rt2, which only b uses.
			{Kind: "runtimes", Name: "rt2", Layer: "home", Path: "/g/runtimes/rt2.yaml", UsedBy: []contract.DefinitionRef{ref("agents", "b")}},
			{Kind: "agents", Name: "b", Layer: "home", Path: "/g/agents/b.toml", Uses: []contract.DefinitionRef{ref("runtimes", "rt2")}},
			{Kind: "schemas", Name: "spare", Layer: "repository", Path: "/p/schemas/spare.json", Invalid: true},
			{Kind: "verifies", Name: "repo", Layer: "repository", Path: "/p/verifies/repo.yaml", UsedBy: []contract.DefinitionRef{ref("processes", "p")}},
			{Kind: "verifies", Name: "spare", Layer: "home", Path: "/g/verifies/spare.yaml"},
			{Kind: "processes", Name: "p", Layer: "home", Path: "/g/processes/p.yaml", Uses: []contract.DefinitionRef{ref("agents", "a"), ref("schemas", "gone"), ref("verifies", "repo"), ref("workspace", "workspace")}},
			{Kind: "prompts", Name: "rules", Layer: "repository", Path: "/p/prompts/rules.md", UsedBy: []contract.DefinitionRef{ref("processes", "q")}},
			{Kind: "processes", Name: "q", Layer: "home", Path: "/g/processes/q.yaml", Uses: []contract.DefinitionRef{ref("verifies", "gone"), ref("prompts", "rules"), ref("prompts", "lost")}},
		},
	}
	spy := &clientSpy{report: report}
	r := run(context.Background(), spy, "check", "--tree")
	want := `service service         home       /g/service.toml
process p               home       /g/processes/p.yaml
├─ agent a              project    /p/sub/.agister/agents/a.toml
│                                    effort
│                       repository /p/agents/a.toml
│                                    (none)
│                       home       /g/agents/a.toml
│  └─ runtime rt        home       /g/runtimes/rt.yaml
├─ schema gone          MISSING
├─ verification repo    repository /p/verifies/repo.yaml
└─ workspace workspace  repository /p/workspace.yaml
process q               home       /g/processes/q.yaml
├─ verification gone    MISSING
├─ prompt rules         repository /p/prompts/rules.md
└─ prompt lost          MISSING
unused (no process uses these)
   runtime rt2          home       /g/runtimes/rt2.yaml
   agent b              home       /g/agents/b.toml
   schema spare         repository /p/schemas/spare.json INVALID
   verification spare   home       /g/verifies/spare.yaml
settings OK: 1 processes
`
	if r.code != 0 || r.stdout != want {
		t.Fatalf("tree: %d\n%s", r.code, r.stdout)
	}

	spy = &clientSpy{report: contract.CheckReport{Checked: map[string]int{}, Problems: []contract.Problem{{Message: "agent a: bad"}}}}
	r = run(context.Background(), spy, "check", "--json", "--tree")
	var got map[string]any
	if err := json.Unmarshal([]byte(r.stdout), &got); err != nil || r.code != cli.ExitUsage || r.stderr != "" {
		t.Fatalf("json: %d %v\n%s%s", r.code, err, r.stdout, r.stderr)
	}
	// Empty lists are lists, so consumers need no null checks.
	if fmt.Sprint(got["problems"]) != "[map[message:agent a: bad]]" || fmt.Sprint(got["overrides"]) != "[]" || fmt.Sprint(got["definitions"]) != "[]" {
		t.Fatalf("json = %v", got)
	}
}

func TestAgentCreateAsksOnlyToReplace(t *testing.T) {
	t.Parallel()
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
	t.Parallel()
	spy := &clientSpy{}
	r := run(context.Background(), spy, "--home", "rel", "agent", "create", "x", "--runtime", "rt", "--model", "m", "--model-family", "f", "--effort", "high", "--session", "resumable", "--command", "/bin/c")
	want := contract.Agent{Name: "x", Runtime: "rt", Model: "m", ModelFamily: "f", Effort: "high", Session: "resumable", Command: "/bin/c"}
	if r.code != 0 || !reflect.DeepEqual(spy.agents, []contract.Agent{want}) || spy.config.Home != "/work/rel" {
		t.Fatalf("result %+v, agents %+v, home %s", r, spy.agents, spy.config.Home)
	}
}

func TestUsageErrorsNeverReachTheClient(t *testing.T) {
	t.Parallel()
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

// installSpy plans an install of one document, and its approved install
// stops after the backup with stopped.
type installSpy struct {
	clientSpy
	stopped error
}

func (s *installSpy) Install(_ context.Context, source string, approved *contract.InstallPlan) (contract.InstallPlan, error) {
	plan := contract.InstallPlan{Source: source, Documents: []contract.InstallDocument{{Kind: "prompts", Name: "p", Path: "/home/prompts/p.md", Action: contract.InstallCreate}}}
	if approved == nil {
		return plan, nil
	}
	plan.Stamp = "stamp-1"
	return plan, s.stopped
}

// An install that stopped after its backup says how to restore it, on
// stderr, and fails.
func TestInstallStoppedSaysHowToRestore(t *testing.T) {
	t.Parallel()
	spy := &installSpy{stopped: fmt.Errorf("install stopped after 0 of 1 document(s), before /home/prompts/p.md: disk full")}
	var stdout, stderr bytes.Buffer
	code := cli.Run(context.Background(), []string{"install", "settings"}, cli.IO{
		Stdin: strings.NewReader("yes\n"), Stdout: &stdout, Stderr: &stderr, Cwd: "/work", Getenv: func(string) string { return "" },
	}, func(cli.Config) (contract.Client, error) { return spy, nil }, unlogged)
	if code == 0 || !strings.Contains(stderr.String(), "restore with: agister install --restore stamp-1\n") ||
		!strings.Contains(stderr.String(), "agister: install stopped after 0 of 1 document(s)") || strings.Contains(stdout.String(), "restore with") {
		t.Fatalf("%d\n%s%s", code, stdout.String(), stderr.String())
	}
}

// install --restore takes no folder.
func TestInstallRestoreTakesAStampNotAFolder(t *testing.T) {
	t.Parallel()
	r := run(context.Background(), &clientSpy{}, "install", "--restore", "stamp-1", "settings")
	if r.code != cli.ExitUsage || !strings.HasPrefix(r.stderr, "agister: install --restore takes a stamp, not a folder\n") {
		t.Fatalf("%+v", r)
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
	t.Parallel()
	spy := &workflowSpy{
		summaries: []contract.WorkflowSummary{
			{Name: "w", FanOut: []string{"one:p", "two:q"}, Join: "merge:j"},
			{Name: "broken", Problem: "invalid (run `agister check`)", Refusal: "workflow broken (/w/broken.yaml): bad"},
			{Name: "stranded", FanOut: []string{"one:q"}, Join: "merge:j", Refusal: "workflow stranded uses process q (/p/q.yaml): bad"},
		},
		workflow: contract.WorkflowView{
			Name:   "w",
			Params: []contract.Param{{Name: "candidate", Default: "HEAD"}},
			Inputs: []string{"candidate <- git.revision"},
			FanOut: []contract.WorkflowNode{
				{Name: "one", Process: contract.ProcessView{Name: "p", Agent: "a", Runtime: "rt", Primitives: []string{"Read"}, Withheld: []string{"repository.diff", "network"}}, Params: []string{"candidate"}},
				{Name: "two", Process: contract.ProcessView{Name: "q", Refusal: "no agent"}},
			},
			Join:       contract.WorkflowNode{Name: "merge", Process: contract.ProcessView{Name: "j", Agent: "a", Runtime: "rt"}},
			Collection: "gathered",
		},
	}
	var stdout, stderr bytes.Buffer
	build := func(cli.Config) (contract.Client, error) { return spy, nil }
	code := cli.Run(context.Background(), []string{"workflow", "list"}, cli.IO{Stdout: &stdout, Stderr: &stderr, Cwd: "/work", Getenv: func(string) string { return "" }}, build, unlogged)
	if code != 0 || stdout.String() != "w\tone:p,two:q\tjoin merge:j\nbroken\tinvalid (run `agister check`)\tREFUSED: workflow broken (/w/broken.yaml): bad\n"+
		"stranded\tone:q\tjoin merge:j\tREFUSED: workflow stranded uses process q (/p/q.yaml): bad\n" {
		t.Fatalf("list: %d %q %q", code, stdout.String(), stderr.String())
	}
	stdout.Reset()
	code = cli.Run(context.Background(), []string{"workflow", "show", "w"}, cli.IO{Stdout: &stdout, Stderr: &stderr, Cwd: "/work", Getenv: func(string) string { return "" }}, build, unlogged)
	want := `workflow     w
params       candidate=HEAD
inputs       candidate <- git.revision
fan-out      one: process p, agent a (runtime rt)
  receives   params candidate
  plan       Read
  withheld   repository.diff, network
             two: process q
  receives   params (none)
  plan       REFUSED: no agent
join         merge: process j, agent a (runtime rt)
  receives   the collection as input gathered, and nothing else
  plan       (none)
  withheld   (none)
`
	if code != 0 || stdout.String() != want || !reflect.DeepEqual(spy.shown, []string{"w"}) {
		t.Fatalf("show: %d\n%s\nwant\n%s", code, stdout.String(), want)
	}
}

// process show prints the effective staleness limits, and no line for them
// when there are none.
func TestShowProcessPrintsTheStalenessLimits(t *testing.T) {
	t.Parallel()
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

// process show prints the effective recovery budget with the other
// staleness limits when it is above 0, and nothing for it when it is 0.
func TestShowProcessPrintsTheStaleRecoveryBudget(t *testing.T) {
	t.Parallel()
	spy := &clientSpy{view: contract.ProcessView{Name: "p", Agent: "a", Runtime: "rt", Output: "text", Timeout: time.Hour, MaxAttempts: 1,
		Stale: contract.Stale{NoEvent: 5 * time.Minute, RepeatedToolCalls: 5, MaxResumes: 1}}}
	r := run(context.Background(), spy, "process", "show", "p")
	if want := "  stale      no event 5m0s, repeated tool calls 5, recovery resumes 1\n"; r.code != 0 || !strings.Contains(r.stdout, want) {
		t.Fatalf("missing %q in %d:\n%s", want, r.code, r.stdout)
	}
	spy.view.Stale.MaxResumes = 0
	if r := run(context.Background(), spy, "process", "show", "p"); !strings.Contains(r.stdout, "  stale      no event 5m0s, repeated tool calls 5\n") || strings.Contains(r.stdout, "resumes") {
		t.Fatalf("a budget of 0:\n%s", r.stdout)
	}
	spy.view.Stale = contract.Stale{MaxResumes: 2}
	if r := run(context.Background(), spy, "process", "show", "p"); !strings.Contains(r.stdout, "  stale      recovery resumes 2\n") {
		t.Fatalf("a budget alone:\n%s", r.stdout)
	}
}

// The help says what the log holds and where a turn's detail is: the
// warnings and errors no run records, a check's warnings among them, within
// its cap, 5 MB a file and three older compressed files, and the turns with
// their runs. It offers no
// --debug, and a command line with one is a usage error.
func TestHelpSaysWhatTheLogKeepsAndOffersNoDebug(t *testing.T) {
	t.Parallel()
	r := run(context.Background(), &clientSpy{}, "--help")
	if r.code != 0 {
		t.Fatalf("help: code %d, stderr %q", r.code, r.stderr)
	}
	// The help as one line: its text wraps where the column ends.
	help := strings.Join(strings.Fields(r.stdout), " ")
	log := "<home>/logs/agister.jsonl keeps the warnings and errors no run records, each command that is refused or fails " +
		"and the warnings of each check, one that passes too, among them, " +
		"never what a turn did: a turn's detail is kept with its run, in <home>/runs/<id>/. " +
		"The cap is per file: the current log stays within 5 MB, and at most three older compressed files are kept beside it."
	if !strings.Contains(help, log) || strings.Contains(help, "debug") {
		t.Fatalf("the help:\n%s", r.stdout)
	}
	spy := &clientSpy{}
	if r := run(context.Background(), spy, "--debug", "check"); r.code != cli.ExitUsage || !strings.Contains(r.stderr, "flag provided but not defined: -debug") || spy.checked != nil {
		t.Fatalf("--debug: %+v, checked %v", r, spy.checked)
	}
}

// A command that is refused or fails is in the log as one error, by one
// rule whatever the command: with the command, its directory and the error
// stderr shows, a refusal by the settings with their problems. So is what
// the CLI reports without an error: a check whose report has problems and
// an export that refuses or fails at a run. A check's warnings are in the
// log as one warning, those of a check that passes too. A command that
// completes, one the caller interrupts, a check with its report among
// them, and one the caller does not confirm are not.
func TestACommandRefusedOrFailedIsLoggedOnce(t *testing.T) {
	t.Parallel()
	problems := contract.CheckReport{Problems: []contract.Problem{{Message: "service service: not found"}}}
	warned := contract.CheckReport{Warnings: []string{"a verification runs with your authority"}}
	cut := contract.CheckReport{Problems: []contract.Problem{{Message: "runtime unavailable"}}, Warnings: warned.Warnings}
	refusal := &contract.SettingsError{Report: problems}
	failure := errors.New("mkdir /env-home/runs: not a directory")
	interrupted, interrupt := context.WithCancel(context.Background())
	interrupt()
	for name, tc := range map[string]struct {
		ctx  context.Context
		spy  *clientSpy
		args []string
		want map[string]any // nil: nothing is logged
	}{
		"the settings refuse": {nil, &clientSpy{refuse: refusal}, []string{"run", "p", "--dir", "/repo"},
			map[string]any{"msg": "the settings refused the command", "command": "run", "cwd": "/repo", "error": refusal.Error(), "problems": []any{"service service: not found"}}},
		"a bare agister the settings stop": {nil, &clientSpy{report: problems}, nil,
			map[string]any{"msg": "the settings refused the command", "command": "", "cwd": "/work", "error": refusal.Error(), "problems": []any{"service service: not found"}}},
		"the command fails": {nil, &clientSpy{refuse: failure}, []string{"run", "p"},
			map[string]any{"msg": "the command failed", "command": "run", "cwd": "/work", "error": failure.Error()}},
		"the client is not built": {nil, &clientSpy{buildErr: failure}, []string{"process", "list"},
			map[string]any{"msg": "the command failed", "command": "process list", "cwd": "/work", "error": failure.Error()}},
		"the command is not one": {nil, &clientSpy{}, []string{"bogus"},
			map[string]any{"msg": "the command failed", "command": "bogus", "cwd": "/work", "error": "unknown command: bogus"}},
		"check finds problems": {nil, &clientSpy{report: problems}, []string{"check"},
			map[string]any{"msg": "the settings have problems", "command": "check", "cwd": "/work", "problems": []any{"service service: not found"}}},
		"an export refuses and fails": {nil, &clientSpy{exported: contract.ExportResult{To: "/audit", Runs: []contract.ExportedRun{
			{ID: "r1", Action: contract.ExportCopied}, {ID: "r2", Action: contract.ExportRefused, Problem: "a copy that differs is there"}, {ID: "r3", Action: contract.ExportFailed, Problem: "disk full"},
		}}}, []string{"runs", "export", "r1", "r2", "r3", "--to", "/audit"},
			map[string]any{"msg": "the export refused or failed", "command": "runs export", "cwd": "/work", "problems": []any{"r2: refused: a copy that differs is there", "r3: failed: disk full"}}},
		// The owner's decision of 2026-10-10 (LAB-180): a check that passes
		// with warnings logged nothing, and now logs them.
		"check warns and passes": {nil, &clientSpy{report: warned}, []string{"check"},
			map[string]any{"level": "WARN", "msg": "the settings have warnings", "command": "check", "cwd": "/work", "warnings": []any{"a verification runs with your authority"}}},
		"the command completes":       {nil, &clientSpy{run: finished("completed", "")}, []string{"run", "p", "--quiet"}, nil},
		"check finds nothing":         {nil, &clientSpy{}, []string{"check"}, nil},
		"the caller interrupts":       {interrupted, &clientSpy{refuse: fmt.Errorf("submitting: %w", context.Canceled)}, []string{"run", "p"}, nil},
		"the caller interrupts check": {interrupted, &clientSpy{report: cut}, []string{"check", "--probe"}, nil},
		"the caller says no":          {nil, &clientSpy{agentExists: true}, []string{"agent", "create", "x", "--runtime", "claude-code", "--force"}, nil},
		"the run itself fails":        {nil, &clientSpy{run: finished("failed", "refused")}, []string{"run", "p", "--quiet"}, nil},
		"an export copies it all":     {nil, &clientSpy{exported: contract.ExportResult{Runs: []contract.ExportedRun{{ID: "r1", Action: contract.ExportKept}}}}, []string{"runs", "export", "r1"}, nil},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			ctx := tc.ctx
			if ctx == nil {
				ctx = context.Background()
			}
			r := run(ctx, tc.spy, tc.args...)
			logged := tc.spy.logs(t)
			if tc.want == nil {
				if len(logged) != 0 {
					t.Fatalf("logged = %v, result %+v", logged, r)
				}
				return
			}
			// An error is of a command that did not complete, a warning of
			// one that did.
			if tc.want["level"] == nil {
				tc.want["level"] = "ERROR"
			}
			if len(logged) != 1 || (r.code == cli.ExitCompleted) != (tc.want["level"] == "WARN") {
				t.Fatalf("logged = %v, result %+v", logged, r)
			}
			delete(logged[0], "time")
			if !reflect.DeepEqual(logged[0], tc.want) {
				t.Fatalf("logged = %v, want %v", logged[0], tc.want)
			}
			if message, said := tc.want["error"].(string); said && !strings.Contains(r.stderr, "agister: "+message+"\n") {
				t.Fatalf("stderr does not say what the log does:\n%s", r.stderr)
			}
		})
	}
}

// A command line that cannot be read is refused in the log too, the log of
// the home it names as far as it was read, the flag's or else the
// environment's, as the command it named by then. No client is built, and
// it exits as a usage error with the usage, as before.
func TestACommandLineThatCannotBeReadIsLoggedInItsHome(t *testing.T) {
	t.Parallel()
	for name, tc := range map[string]struct {
		args                 []string
		home, command, error string
	}{
		"its home a flag's": {[]string{"--home", "/flag-home", "run", "p", "--param", "broken"}, "/flag-home", "run",
			`invalid value "broken" for flag -param: expected <name>=<value>, got "broken"`},
		"its home the environment's": {[]string{"--debug", "check"}, "/env-home", "", "flag provided but not defined: -debug"},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			spy := &clientSpy{}
			r := run(context.Background(), spy, tc.args...)
			if r.code != cli.ExitUsage || !strings.Contains(r.stderr, "agister: "+tc.error+"\n\nagister ") || !strings.Contains(r.stderr, "\nUsage:\n") || spy.config != (cli.Config{}) {
				t.Fatalf("result %+v, client built for %+v", r, spy.config)
			}
			logged := spy.logs(t)
			if len(logged) != 1 || spy.logHome != tc.home {
				t.Fatalf("logged = %v, in the log of %q", logged, spy.logHome)
			}
			delete(logged[0], "time")
			want := map[string]any{"level": "ERROR", "msg": "the command failed", "command": tc.command, "cwd": "/work", "error": tc.error}
			if !reflect.DeepEqual(logged[0], want) {
				t.Fatalf("logged = %v, want %v", logged[0], want)
			}
		})
	}
}

func TestHelpNamesTheSessionsLatestRunAsThePatchSource(t *testing.T) {
	t.Parallel()
	r := run(context.Background(), &clientSpy{}, "--help")
	if r.code != 0 || !strings.Contains(r.stdout, "the session's latest run's changes") {
		t.Fatalf("help: code %d, stdout %q, stderr %q", r.code, r.stdout, r.stderr)
	}
}
