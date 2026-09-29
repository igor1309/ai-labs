package claudecode_test

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/claudecode"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/runtimetest"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/supervisor"
	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

const session = "5145d89d-470e-4b56-a78c-da035d5de49b"

func request(prompt string) app.TurnRequest {
	return app.TurnRequest{
		Prompt:       prompt,
		Instruction:  "Do the thing.",
		Primitives:   []string{"Read", "Grep"},
		SessionID:    session,
		Model:        "sonnet",
		Effort:       "high",
		Timeout:      time.Minute,
		OutputSchema: json.RawMessage(`{"type":"object"}`),
	}
}

func TestConformance(t *testing.T) {
	runtimetest.Conformance(t, runtimetest.Subject{
		New: func(command string) app.TurnRunner {
			return &claudecode.Runner{Command: command, KillGrace: 200 * time.Millisecond}
		},
		Fake:     runtimetest.Binary(t, "fakeclaude"),
		Contract: claudecode.Contract,
		Request:  request,
	})
}

func TestArgumentsCarryPrimitivesAndContractFlags(t *testing.T) {
	args, err := claudecode.Arguments(request("hello"))
	if err != nil {
		t.Fatal(err)
	}
	want := []string{
		"-p", "--output-format", "stream-json", "--verbose", "--permission-mode", "dontAsk",
		"--tools=Read,Grep", "--allowedTools=Read,Grep", "--session-id", session,
		"--restricted", "--strict-mcp-config", "--model", "sonnet", "--effort", "high",
		"--append-system-prompt", "Do the thing.", "--json-schema", `{"type":"object"}`,
	}
	if !reflect.DeepEqual(args, want) {
		t.Fatalf("args =\n%q\nwant\n%q", args, want)
	}
	for _, arg := range args {
		if arg == "hello" {
			t.Fatal("prompt must go on stdin, not argv")
		}
	}
}

func TestNoPrimitivesExposesNoTools(t *testing.T) {
	r := request("x")
	r.Primitives = nil
	args, _ := claudecode.Arguments(r)
	joined := strings.Join(args, " ")
	if !strings.Contains(joined, "--tools= ") || strings.Contains(joined, "--allowedTools") {
		t.Fatalf("args = %v", args)
	}
	r.Primitives = []string{"Bash(git diff:*)"}
	if _, err := claudecode.Arguments(r); err == nil {
		t.Fatal("a primitive with spaces must be rejected")
	}
}

func TestStreamReduction(t *testing.T) {
	stream := &claudecode.Stream{RequestedSessionID: session}
	lines := []map[string]any{
		{"type": "system", "subtype": "init", "session_id": session, "model": "claude-haiku-4-5", "tools": []string{"Read"}},
		{"type": "stream_event", "event": map[string]any{"type": "message_start"}},
		{"type": "assistant", "message": map[string]any{"content": []any{map[string]any{"type": "thinking"}, map[string]any{"type": "tool_use", "id": "t1", "name": "Read", "input": map[string]any{"file_path": "/etc/hostname"}}}}},
		{"type": "user", "message": map[string]any{"content": []any{map[string]any{"type": "tool_result", "tool_use_id": "t1", "is_error": false}}}},
		{"type": "assistant", "message": map[string]any{"content": []any{map[string]any{"type": "text", "text": "The hostname is vm."}}}},
		{"type": "rate_limit_event", "rate_limit_info": map[string]any{"status": "allowed"}},
		{"type": "result", "subtype": "success", "is_error": false, "session_id": session, "total_cost_usd": 0.06, "structured_output": map[string]any{"answer": "vm"}},
	}
	var kinds []string
	for _, line := range lines {
		data, _ := json.Marshal(line)
		for _, event := range stream.Reduce(string(data)) {
			kinds = append(kinds, event.Kind)
		}
	}
	want := []string{"PROVIDER_SESSION_BOUND", "TOOL_REQUESTED", "TOOL_RESULT", "ASSISTANT_TEXT", "TURN_COMPLETED"}
	if !reflect.DeepEqual(kinds, want) {
		t.Fatalf("kinds = %v", kinds)
	}
	code := 0
	turn := stream.Reconcile(supervisor.Evidence{Exit: &run.Exit{Code: &code}}, true)
	if turn.Status != run.Completed || string(turn.Output) != `{"answer":"vm"}` || turn.Text != "The hostname is vm." || *turn.CostUSD != 0.06 {
		t.Fatalf("turn = %+v", turn)
	}
}

func TestSessionMismatchAndGarbage(t *testing.T) {
	stream := &claudecode.Stream{RequestedSessionID: session}
	events := stream.Reduce(`{"type":"system","subtype":"init","session_id":"other"}`)
	if len(events) != 2 || events[1].Kind != "SESSION_ID_MISMATCH" {
		t.Fatalf("events = %+v", events)
	}
	if events := stream.Reduce("{broken"); len(events) != 1 || events[0].Kind != "STREAM_PARSE_ERROR" {
		t.Fatalf("events = %+v", events)
	}
	if events := stream.Reduce("null"); len(events) != 0 {
		t.Fatalf("events = %+v", events)
	}
}

func TestResultPrecedence(t *testing.T) {
	code := 0
	clean := supervisor.Evidence{Exit: &run.Exit{Code: &code}}
	with := func(result string) *claudecode.Stream {
		stream := &claudecode.Stream{}
		stream.Reduce(result)
		return stream
	}
	if turn := with(`{"type":"result","subtype":"success","is_error":true}`).Reconcile(clean, false); turn.Status != run.Failed {
		t.Fatalf("success with is_error must fail: %+v", turn)
	}
	if turn := with(`{"type":"result","subtype":"success","is_error":false}`).Reconcile(clean, true); turn.Status != run.Failed || turn.Error.Class != run.ClassInvalidOutput {
		t.Fatalf("missing structured output must fail: %+v", turn)
	}
	timedOut := supervisor.Evidence{TimedOut: true, Exit: &run.Exit{Signal: "terminated"}}
	if turn := with(`{"type":"result","subtype":"success","is_error":false}`).Reconcile(timedOut, false); turn.Status != run.Completed {
		t.Fatalf("a result before the timeout decides the turn: %+v", turn)
	}
}

func TestContinuationForksAndCostLimitIsPassed(t *testing.T) {
	r := request("x")
	r.ResumeSessionID = "earlier"
	limit := 0.5
	r.MaxCostUSD = &limit
	args, err := claudecode.Arguments(r)
	if err != nil {
		t.Fatal(err)
	}
	joined := strings.Join(args, " ")
	if !strings.Contains(joined, "--resume earlier --fork-session --session-id "+session) || !strings.Contains(joined, "--max-budget-usd 0.5") {
		t.Fatalf("args = %v", args)
	}
	r.SessionID = ""
	if _, err := claudecode.Arguments(r); err == nil {
		t.Fatal("continuing without a new session ID would change the earlier session")
	}
}

func TestUsageIsNormalized(t *testing.T) {
	stream := &claudecode.Stream{}
	stream.Reduce(`{"type":"result","subtype":"success","is_error":false,"duration_ms":1200,"usage":{"input_tokens":10,"output_tokens":20,"cache_read_input_tokens":30,"cache_creation_input_tokens":40}}`)
	code := 0
	turn := stream.Reconcile(supervisor.Evidence{Exit: &run.Exit{Code: &code}}, false)
	u := turn.Usage
	if u == nil || *u.InputTokens != 10 || *u.OutputTokens != 20 || *u.CacheReadTokens != 30 || *u.CacheWriteTokens != 40 || u.ReasoningTokens != nil || *turn.RuntimeMS != 1200 {
		t.Fatalf("usage %+v, turn %+v", u, turn)
	}
}

func TestFailuresAreClassified(t *testing.T) {
	code := 0
	clean := supervisor.Evidence{Exit: &run.Exit{Code: &code}}
	for _, c := range []struct {
		name  string
		lines []string
		class run.Class
	}{
		{"budget (observed live)", []string{`{"type":"result","subtype":"error_max_budget_usd","is_error":true,"errors":["Reached maximum budget ($0.0001)"]}`}, run.ClassBudgetExhausted},
		{"http 429", []string{`{"type":"result","subtype":"success","is_error":true,"api_error_status":429}`}, run.ClassRateLimited},
		{"rejected by the rate limiter", []string{`{"type":"rate_limit_event","rate_limit_info":{"status":"rejected"}}`, `{"type":"result","subtype":"success","is_error":true}`}, run.ClassRateLimited},
		{"http 401", []string{`{"type":"result","subtype":"success","is_error":true,"api_error_status":401}`}, run.ClassAuth},
		{"prompt too long", []string{`{"type":"result","subtype":"success","is_error":true,"result":"Prompt is too long"}`}, run.ClassContextOverflow},
		{"anything else", []string{`{"type":"result","subtype":"error_max_turns","is_error":true}`}, run.ClassRuntimeError},
	} {
		stream := &claudecode.Stream{}
		for _, line := range c.lines {
			stream.Reduce(line)
		}
		if turn := stream.Reconcile(clean, false); turn.Status != run.Failed || turn.Error.Class != c.class {
			t.Errorf("%s: %+v", c.name, turn.Error)
		}
	}
}
