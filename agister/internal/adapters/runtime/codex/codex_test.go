package codex_test

import (
	"context"
	"encoding/json"
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
	if u := turn.Usage; *u.InputTokens != 10 || *u.CacheReadTokens != 4 || *u.OutputTokens != 5 || *u.ReasoningTokens != 3 || u.CacheWriteTokens != nil {
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
