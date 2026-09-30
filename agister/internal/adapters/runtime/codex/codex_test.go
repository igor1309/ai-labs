package codex_test

import (
	"context"
	"encoding/json"
	"errors"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/codex"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/runtimetest"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/supervisor"
	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

func request(prompt string) app.TurnRequest {
	return app.TurnRequest{
		Prompt:       prompt,
		Instruction:  "Do the thing.",
		Primitives:   []string{"read-only"},
		Model:        "gpt-5.5",
		Effort:       "high",
		Timeout:      time.Minute,
		OutputSchema: json.RawMessage(`{"type":"object"}`),
	}
}

// The fake's error_result scenario emits turn.failed, which the suite's
// "runtime reported" check matches.
func TestConformance(t *testing.T) {
	runtimetest.Conformance(t, runtimetest.Subject{
		New: func(command string) app.TurnRunner {
			return &codex.Runner{Command: command, KillGrace: 200 * time.Millisecond}
		},
		Fake:     runtimetest.Binary(t, "fakecodex"),
		Contract: codex.Contract,
		Request:  request,
	})
}

func TestArguments(t *testing.T) {
	args, err := codex.Arguments(request("hello"), "/tmp/schema.json")
	if err != nil {
		t.Fatal(err)
	}
	want := []string{
		"exec", "--json", "--skip-git-repo-check", "--sandbox", "read-only",
		"--config", `approval_policy="never"`, "--ignore-user-config", "--ignore-rules",
		"--model", "gpt-5.5", "--config", `model_reasoning_effort="high"`,
		"--output-schema", "/tmp/schema.json", "-",
	}
	if !reflect.DeepEqual(args, want) {
		t.Fatalf("args =\n%q\nwant\n%q", args, want)
	}
	if got := codex.Prompt(request("hello")); got != "<instructions>\nDo the thing.\n</instructions>\n\nhello" {
		t.Fatalf("prompt = %q", got)
	}
}

// A continuation runs `exec resume` on the reported thread with every
// setting of a fresh turn; resume has no --sandbox, so the sandbox mode
// goes in as config.
func TestResumeArguments(t *testing.T) {
	r := request("hello")
	r.ResumeSessionID = "thread-0"
	args, err := codex.Arguments(r, "/tmp/schema.json")
	if err != nil {
		t.Fatal(err)
	}
	want := []string{
		"exec", "resume", "thread-0", "--json", "--skip-git-repo-check", "--config", `sandbox_mode="read-only"`,
		"--config", `approval_policy="never"`, "--ignore-user-config", "--ignore-rules",
		"--model", "gpt-5.5", "--config", `model_reasoning_effort="high"`,
		"--output-schema", "/tmp/schema.json", "-",
	}
	if !reflect.DeepEqual(args, want) {
		t.Fatalf("args =\n%q\nwant\n%q", args, want)
	}
}

func TestIdentityReportsResume(t *testing.T) {
	identity, err := codex.New(runtimetest.Binary(t, "fakecodex")).Identity(context.Background())
	if err != nil || identity.Contract != "codex/2" || !identity.Resume || identity.CostLimit {
		t.Fatalf("identity = %+v, %v", identity, err)
	}
}

// A resume turn must report the thread it resumed: another one, or none by
// the end of the turn, breaks the contract of resuming in place.
func TestResumeReportingAnotherThreadFails(t *testing.T) {
	code := 0
	clean := supervisor.Evidence{Exit: &run.Exit{Code: &code}}
	for name, lines := range map[string][]string{
		"another thread": {`{"type":"thread.started","thread_id":"t-2"}`, `{"type":"turn.completed"}`},
		"no thread":      {`{"type":"turn.completed"}`},
	} {
		stream := &codex.Stream{ResumedThreadID: "t-1"}
		for _, line := range lines {
			stream.Reduce(line)
		}
		if turn := stream.Reconcile(clean, false); turn.Status != run.Failed || turn.Error.Class != run.ClassRuntimeError || !strings.Contains(turn.Error.Message, "t-1") {
			t.Errorf("%s: turn = %+v", name, turn)
		}
	}
	stream := &codex.Stream{ResumedThreadID: "t-1"}
	stream.Reduce(`{"type":"thread.started","thread_id":"t-1"}`)
	stream.Reduce(`{"type":"turn.completed"}`)
	if turn := stream.Reconcile(clean, false); turn.Status != run.Completed || turn.ProviderSessionID != "t-1" {
		t.Fatalf("the same thread: turn = %+v", turn)
	}
}

func TestRejectsWhatItCannotHonour(t *testing.T) {
	for _, primitives := range [][]string{nil, {"read-only", "workspace-write"}, {"danger-full-access"}} {
		r := request("x")
		r.Primitives = primitives
		if _, err := codex.Arguments(r, ""); err == nil {
			t.Fatalf("primitives %v accepted", primitives)
		}
	}
	r := request("x")
	limit := 1.0
	r.MaxCostUSD = &limit
	if _, err := codex.Arguments(r, ""); err == nil || !strings.Contains(err.Error(), "cannot limit cost") {
		t.Fatalf("err = %v", err)
	}
}

func TestErrorEventsAreNotTerminal(t *testing.T) {
	stream := &codex.Stream{}
	for _, line := range []string{
		`{"type":"thread.started","thread_id":"t-1"}`,
		`{"type":"turn.started"}`,
		`{"type":"error","message":"Reconnecting... 2/5"}`,
		`{"type":"item.completed","item":{"id":"item_0","type":"error","message":"Falling back to HTTPS"}}`,
		`{"type":"item.started","item":{"id":"item_1","type":"command_execution","command":"ls"}}`,
		`{"type":"item.completed","item":{"id":"item_1","type":"command_execution","exit_code":2,"status":"failed"}}`,
		`{"type":"item.completed","item":{"id":"item_2","type":"agent_message","text":"{\"answer\":\"vm\"}"}}`,
	} {
		stream.Reduce(line)
	}
	code := 0
	clean := supervisor.Evidence{Exit: &run.Exit{Code: &code}}
	if turn := stream.Reconcile(clean, true); turn.Status != run.Lost || turn.Error.Class != run.ClassNoResult || turn.Error.Message != "exited without a result: Reconnecting... 2/5" {
		t.Fatalf("errors so far are evidence, not an outcome: %+v", turn)
	}
	stream.Reduce(`{"type":"turn.completed","usage":{"input_tokens":10,"cached_input_tokens":4,"output_tokens":5,"reasoning_output_tokens":3}}`)
	turn := stream.Reconcile(clean, true)
	if turn.Status != run.Completed || string(turn.Output) != `{"answer":"vm"}` || turn.ProviderSessionID != "t-1" || turn.CostUSD != nil {
		t.Fatalf("turn = %+v", turn)
	}
	// The thread's usage; the turn's own is the call's to derive.
	if u := turn.Session.Usage; turn.Usage != nil || turn.Session.CostUSD != nil || *u.InputTokens != 10 || *u.CacheReadTokens != 4 || *u.OutputTokens != 5 || *u.ReasoningTokens != 3 || u.CacheWriteTokens != nil {
		t.Fatalf("turn = %+v", turn)
	}
}

func TestStructuredOutputMustBeJSON(t *testing.T) {
	stream := &codex.Stream{}
	stream.Reduce(`{"type":"item.completed","item":{"type":"agent_message","text":"not json"}}`)
	stream.Reduce(`{"type":"turn.completed"}`)
	code := 0
	if turn := stream.Reconcile(supervisor.Evidence{Exit: &run.Exit{Code: &code}}, true); turn.Status != run.Failed || turn.Error.Class != run.ClassInvalidOutput {
		t.Fatalf("turn = %+v", turn)
	}
}

func TestFailuresAreClassified(t *testing.T) {
	code := 0
	clean := supervisor.Evidence{Exit: &run.Exit{Code: &code}}
	for message, class := range map[string]run.Class{
		"You've hit your usage limit": run.ClassRateLimited,
		"401 Unauthorized":            run.ClassAuth,
		"exceeds the context window":  run.ClassContextOverflow,
		"stream disconnected":         run.ClassRuntimeError,
	} {
		stream := &codex.Stream{}
		data, _ := json.Marshal(map[string]any{"type": "turn.failed", "error": map[string]any{"message": message}})
		stream.Reduce(string(data))
		if turn := stream.Reconcile(clean, false); turn.Status != run.Failed || turn.Error.Class != class {
			t.Errorf("%q: %+v", message, turn.Error)
		}
	}
}

// A process that could not be recorded fails the turn, whatever the stream
// says: it was killed, and nothing it reported can be trusted to be whole.
func TestUnrecordedProcessFailsTheTurnWhateverTheStreamSays(t *testing.T) {
	stream := &codex.Stream{}
	stream.Reduce(`{"type":"turn.completed"}`)
	turn := stream.Reconcile(supervisor.Evidence{RecordError: "disk full"}, false)
	if turn.Status != run.Failed || turn.Error == nil || turn.Error.Class != run.ClassInternal || !strings.Contains(turn.Error.Message, "disk full") {
		t.Fatalf("turn = %+v", turn)
	}
}

// ccusage lists sessions by rollout path; the fake's fresh thread is this
// one (observed shape, ccusage 20.0.26).
const fakeThread = "01a0e850-b808-71c2-8401-53ba16d8ae18"

func listing(cost string) codex.Sessions {
	return func(context.Context) ([]byte, error) {
		return []byte(`{"sessions":[
			{"sessionId":"2026/09/30/rollout-2026-09-30T10-00-00-01a0f1e9-210c-7853-b2dc-7abbe3cf6073","costUSD":0.318266},
			{"sessionId":"2026/09/30/rollout-2026-09-30T11-00-00-` + fakeThread + `","costUSD":` + cost + `}
		]}`), nil
	}
}

// A turn's cost is the thread's, from ccusage, less what Agister recorded
// for the thread before it: all of it for a fresh thread, the difference
// for a resumed one.
func TestTurnCostIsTheThreadsFromCCUsage(t *testing.T) {
	runner := &codex.Runner{Command: runtimetest.Binary(t, "fakecodex"), KillGrace: 200 * time.Millisecond}
	ctx := context.Background()

	runner.Sessions = listing("0.25")
	fresh := run.Own(runner.RunTurn(ctx, request("SCENARIO:approve"), &runtimetest.Recorder{}), false)
	if fresh.Status != run.Completed || fresh.ProviderSessionID != fakeThread || fresh.CostUSD == nil || *fresh.CostUSD != 0.25 {
		t.Fatalf("fresh turn = %+v", fresh)
	}

	created := time.Date(2026, 9, 30, 10, 0, 0, 0, time.UTC)
	finished := created.Add(time.Minute)
	records := []run.Record{{ID: "run-1", CreatedAt: created, FinishedAt: &finished, Turn: &fresh}}
	resume := request("SCENARIO:approve")
	resume.ResumeSessionID = fakeThread
	runner.Sessions = listing("0.75")
	turn := runner.RunTurn(ctx, resume, &runtimetest.Recorder{})
	turn.SessionBefore = run.LatestTotals(records, fakeThread, "run-2")
	resumed := run.Own(turn, true)
	if resumed.Status != run.Completed || resumed.CostUSD == nil || *resumed.CostUSD != 0.5 {
		t.Fatalf("resumed turn = %+v", resumed)
	}
}

// Zero, a thread ccusage does not list, and ccusage failing or missing
// leave the cost unknown.
func TestTurnCostUnknownWithoutCCUsagesPrice(t *testing.T) {
	for name, sessions := range map[string]codex.Sessions{
		"zero":    listing("0"),
		"missing": func(context.Context) ([]byte, error) { return []byte(`{"sessions":[]}`), nil },
		"failing": func(context.Context) ([]byte, error) { return nil, errors.New("exit status 1") },
		"absent":  codex.CCUsage(filepath.Join(t.TempDir(), "ccusage")),
	} {
		runner := &codex.Runner{Command: runtimetest.Binary(t, "fakecodex"), KillGrace: 200 * time.Millisecond, Sessions: sessions}
		turn := run.Own(runner.RunTurn(context.Background(), request("SCENARIO:approve"), &runtimetest.Recorder{}), false)
		if turn.Status != run.Completed || turn.CostUSD != nil || turn.Session != nil && turn.Session.CostUSD != nil {
			t.Errorf("%s: turn = %+v", name, turn)
		}
	}
}

func TestThreadCost(t *testing.T) {
	path := "2026/09/30/rollout-2026-09-30T11-00-00-01a0f1e9-210c-7853-b2dc-7abbe3cf6073"
	for name, c := range map[string]struct {
		listing string
		want    *float64
	}{
		"listed":    {`{"sessions":[{"sessionId":"` + path + `","costUSD":0.318266}]}`, ptr(0.318266)},
		"no cost":   {`{"sessions":[{"sessionId":"` + path + `"}]}`, nil},
		"twice":     {`{"sessions":[{"sessionId":"` + path + `","costUSD":1},{"sessionId":"x/` + path + `","costUSD":2}]}`, nil},
		"not json":  {`ccusage: error`, nil},
		"other one": {`{"sessions":[{"sessionId":"rollout-01a0f1e9-210c-7853-b2dc-7abbe3cf6074","costUSD":1}]}`, nil},
	} {
		got := codex.ThreadCost([]byte(c.listing), "01a0f1e9-210c-7853-b2dc-7abbe3cf6073")
		if (got == nil) != (c.want == nil) || got != nil && *got != *c.want {
			t.Errorf("%s: cost = %v, want %v", name, got, c.want)
		}
	}
}

func ptr(v float64) *float64 { return &v }

// Codex fails a prompt over its input limit with the reason on stderr and
// none in the stream (observed with codex-cli 0.159.2); the message quotes
// it.
func TestAnOversizedPromptFailsWithCodexsReason(t *testing.T) {
	runner := &codex.Runner{Command: runtimetest.Binary(t, "fakecodex"), KillGrace: 200 * time.Millisecond}
	turn := runner.RunTurn(context.Background(), request("SCENARIO:input_too_large"), &runtimetest.Recorder{})
	if turn.Status != run.Failed || turn.Error == nil || turn.Error.Class != run.ClassRuntimeError ||
		!strings.HasPrefix(turn.Error.Message, "exit code 1: Error: turn/start: turn/start failed: Input exceeds the maximum length of 1048576 characters.") ||
		!strings.Contains(turn.StderrTail, `"input_error_code":"input_too_large"`) {
		t.Fatalf("turn = %+v", turn)
	}
}
