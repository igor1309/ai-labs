package claudecode_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/claudecode"
)

func TestArgumentsCarryPrimitivesAndContractFlags(t *testing.T) {
	t.Parallel()
	args, err := claudecode.Arguments(claudecode.TurnRequest(request("hello")))
	if err != nil {
		t.Fatal(err)
	}
	want := []string{
		"-p", "--output-format", "stream-json", "--verbose", "--permission-mode", "dontAsk",
		"--tools=Read,Grep,Skill", "--allowedTools=Read,Grep,Skill",
		"--strict-mcp-config", "--model", "sonnet", "--effort", "high",
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

// A turn loads the repository's instructions and skills (ADR-006): nothing
// turns that loading off, and every turn, fresh or resumed, whatever it is
// granted, gets Skill to use a skill with.
func TestEveryTurnLoadsTheRepositoryAndGetsSkill(t *testing.T) {
	t.Parallel()
	for _, c := range []struct {
		name       string
		primitives []string
		resume     string
		tools      string
	}{
		{"fresh, granted", []string{"Read", "Grep"}, "", "Read,Grep,Skill"},
		{"resumed, granted", []string{"Read", "Grep"}, session, "Read,Grep,Skill"},
		{"fresh, nothing granted", nil, "", "Skill"},
		{"resumed, nothing granted", nil, session, "Skill"},
		{"granted Skill itself", []string{"Skill", "Read"}, "", "Skill,Read"},
	} {
		r := request("x")
		r.Primitives, r.ResumeSessionID = c.primitives, c.resume
		args, err := claudecode.Arguments(claudecode.TurnRequest(r))
		if err != nil {
			t.Fatal(err)
		}
		if slices.Contains(args, "--restricted") || !slices.Contains(args, "--tools="+c.tools) || !slices.Contains(args, "--allowedTools="+c.tools) ||
			c.resume != "" && !strings.Contains(strings.Join(args, " "), "--resume "+c.resume) {
			t.Errorf("%s: args = %q", c.name, args)
		}
	}
}

func TestInvalidPrimitiveIsRejected(t *testing.T) {
	t.Parallel()
	r := request("x")
	r.Primitives = []string{"Bash(git diff:*)"}
	if _, err := claudecode.Arguments(claudecode.TurnRequest(r)); err == nil {
		t.Fatal("a primitive with spaces must be rejected")
	}
}

func TestStreamReduction(t *testing.T) {
	t.Parallel()
	stream := &claudecode.Stream{ResumedSessionID: session}
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
	turn := stream.Reconcile(claudecode.Evidence{Exit: &claudecode.Exit{Code: &code}}, true)
	if string(turn.Status) != string(claudecode.Completed) || string(turn.Output) != `{"answer":"vm"}` || turn.Text != "The hostname is vm." ||
		// The session's cost; the turn's own is the call's to derive.
		turn.CostUSD != nil || *turn.Session.CostUSD != 0.06 || turn.Session.Usage != nil {
		t.Fatalf("turn = %+v", turn)
	}
}

// A resume turn must report the session it resumed: another one breaks
// the contract of resuming in place, whatever the result says.
func TestResumeReportingAnotherSessionFails(t *testing.T) {
	t.Parallel()
	stream := &claudecode.Stream{ResumedSessionID: session}
	events := stream.Reduce(`{"type":"system","subtype":"init","session_id":"other"}`)
	if len(events) != 2 || events[1].Kind != "SESSION_ID_MISMATCH" {
		t.Fatalf("events = %+v", events)
	}
	stream.Reduce(`{"type":"result","subtype":"success","is_error":false,"session_id":"other"}`)
	code := 0
	turn := stream.Reconcile(claudecode.Evidence{Exit: &claudecode.Exit{Code: &code}}, false)
	if string(turn.Status) != string(claudecode.Failed) || string(turn.Error.Class) != string(claudecode.ClassRuntimeError) || turn.ProviderSessionID != "other" || !strings.Contains(turn.Error.Message, session) {
		t.Fatalf("turn = %+v", turn)
	}
	// A terminal result naming another session breaks it too, after an
	// init that named the resumed one.
	late := &claudecode.Stream{ResumedSessionID: session}
	late.Reduce(`{"type":"system","subtype":"init","session_id":"` + session + `"}`)
	if events := late.Reduce(`{"type":"result","subtype":"success","is_error":false,"session_id":"other"}`); len(events) != 2 || events[1].Kind != "SESSION_ID_MISMATCH" {
		t.Fatalf("events = %+v", events)
	}
	if turn := late.Reconcile(claudecode.Evidence{Exit: &claudecode.Exit{Code: &code}}, false); string(turn.Status) != string(claudecode.Failed) || string(turn.Error.Class) != string(claudecode.ClassRuntimeError) || !strings.Contains(turn.Error.Message, `"other"`) {
		t.Fatalf("turn = %+v", turn)
	}
	// A result that names no session does not confirm the resumed one.
	silent := &claudecode.Stream{ResumedSessionID: session}
	silent.Reduce(`{"type":"result","subtype":"success","is_error":false}`)
	if turn := silent.Reconcile(claudecode.Evidence{Exit: &claudecode.Exit{Code: &code}}, false); string(turn.Status) != string(claudecode.Failed) || string(turn.Error.Class) != string(claudecode.ClassRuntimeError) {
		t.Fatalf("turn = %+v", turn)
	}
}

func TestGarbageIsRecorded(t *testing.T) {
	t.Parallel()
	stream := &claudecode.Stream{}
	if events := stream.Reduce("{broken"); len(events) != 1 || events[0].Kind != "STREAM_PARSE_ERROR" {
		t.Fatalf("events = %+v", events)
	}
	if events := stream.Reduce("null"); len(events) != 0 {
		t.Fatalf("events = %+v", events)
	}
}

func TestResultPrecedence(t *testing.T) {
	t.Parallel()
	code := 0
	clean := claudecode.Evidence{Exit: &claudecode.Exit{Code: &code}}
	with := func(result string) *claudecode.Stream {
		stream := &claudecode.Stream{}
		stream.Reduce(result)
		return stream
	}
	if turn := with(`{"type":"result","subtype":"success","is_error":true}`).Reconcile(clean, false); string(turn.Status) != string(claudecode.Failed) {
		t.Fatalf("success with is_error must fail: %+v", turn)
	}
	if turn := with(`{"type":"result","subtype":"success","is_error":false}`).Reconcile(clean, true); string(turn.Status) != string(claudecode.Failed) || string(turn.Error.Class) != string(claudecode.ClassInvalidOutput) {
		t.Fatalf("missing structured output must fail: %+v", turn)
	}
	timedOut := claudecode.Evidence{TimedOut: true, Exit: &claudecode.Exit{Signal: "terminated"}}
	if turn := with(`{"type":"result","subtype":"success","is_error":false}`).Reconcile(timedOut, false); string(turn.Status) != string(claudecode.Completed) {
		t.Fatalf("a result before the timeout decides the turn: %+v", turn)
	}
}

// Agister chooses no session ID: a fresh turn names none, and a
// continuation resumes the reported one in place, without forking.
func TestContinuationResumesInPlaceAndCostLimitIsPassed(t *testing.T) {
	t.Parallel()
	fresh, err := claudecode.Arguments(claudecode.TurnRequest(request("x")))
	if err != nil {
		t.Fatal(err)
	}
	if joined := strings.Join(fresh, " "); strings.Contains(joined, "--session-id") || strings.Contains(joined, "--resume") {
		t.Fatalf("fresh args = %v", fresh)
	}
	r := request("x")
	r.ResumeSessionID = "earlier"
	limit := 0.5
	r.MaxCostUSD = &limit
	args, err := claudecode.Arguments(claudecode.TurnRequest(r))
	if err != nil {
		t.Fatal(err)
	}
	joined := strings.Join(args, " ")
	if !strings.Contains(joined, "--resume earlier --max-budget-usd 0.5") || strings.Contains(joined, "--fork-session") || strings.Contains(joined, "--session-id") {
		t.Fatalf("args = %v", args)
	}
}

func TestUsageIsNormalized(t *testing.T) {
	t.Parallel()
	stream := &claudecode.Stream{}
	stream.Reduce(`{"type":"result","subtype":"success","is_error":false,"duration_ms":1200,"usage":{"input_tokens":10,"output_tokens":20,"cache_read_input_tokens":30,"cache_creation_input_tokens":40}}`)
	code := 0
	turn := stream.Reconcile(claudecode.Evidence{Exit: &claudecode.Exit{Code: &code}}, false)
	u := turn.Usage
	if u == nil || *u.InputTokens != 10 || *u.OutputTokens != 20 || *u.CacheReadTokens != 30 || *u.CacheWriteTokens != 40 || u.ReasoningTokens != nil || *turn.RuntimeMS != 1200 {
		t.Fatalf("usage %+v, turn %+v", u, turn)
	}
}

func TestFailuresAreClassified(t *testing.T) {
	t.Parallel()
	code := 0
	clean := claudecode.Evidence{Exit: &claudecode.Exit{Code: &code}}
	for _, c := range []struct {
		name  string
		lines []string
		class claudecode.Class
	}{
		{"budget (observed live)", []string{`{"type":"result","subtype":"error_max_budget_usd","is_error":true,"errors":["Reached maximum budget ($0.0001)"]}`}, claudecode.ClassBudgetExhausted},
		{"http 429", []string{`{"type":"result","subtype":"success","is_error":true,"api_error_status":429}`}, claudecode.ClassRateLimited},
		{"rejected by the rate limiter", []string{`{"type":"rate_limit_event","rate_limit_info":{"status":"rejected"}}`, `{"type":"result","subtype":"success","is_error":true}`}, claudecode.ClassRateLimited},
		{"http 401", []string{`{"type":"result","subtype":"success","is_error":true,"api_error_status":401}`}, claudecode.ClassAuth},
		{"prompt too long", []string{`{"type":"result","subtype":"success","is_error":true,"result":"Prompt is too long"}`}, claudecode.ClassContextOverflow},
		{"anything else", []string{`{"type":"result","subtype":"error_max_turns","is_error":true}`}, claudecode.ClassRuntimeError},
	} {
		stream := &claudecode.Stream{}
		for _, line := range c.lines {
			stream.Reduce(line)
		}
		if turn := stream.Reconcile(clean, false); string(turn.Status) != string(claudecode.Failed) || string(turn.Error.Class) != string(c.class) {
			t.Errorf("%s: %+v", c.name, turn.Error)
		}
	}
}

func TestErrorResultMessages(t *testing.T) {
	t.Parallel()
	const limit = "You've hit your session limit · resets 12:30pm (Europe/Moscow)"
	for _, c := range []struct {
		name    string
		result  string
		class   claudecode.Class
		message string
	}{
		{
			name:    "session limit observed 2026-10-02",
			result:  `{"type":"result","subtype":"success","is_error":true,"result":"You've hit your session limit · resets 12:30pm (Europe/Moscow)","api_error_status":429,"stop_reason":"stop_sequence"}`,
			class:   claudecode.ClassRateLimited,
			message: "runtime reported an error (429): " + limit,
		},
		{
			name:    "error without status",
			result:  `{"type":"result","subtype":"success","is_error":true,"result":"Something went wrong"}`,
			class:   claudecode.ClassRuntimeError,
			message: "runtime reported an error: Something went wrong",
		},
		{
			name:    "named error",
			result:  `{"type":"result","subtype":"error_max_turns","is_error":true}`,
			class:   claudecode.ClassRuntimeError,
			message: "runtime reported error_max_turns",
		},
		{
			name:    "budget error",
			result:  `{"type":"result","subtype":"error_max_budget_usd","is_error":true,"errors":["Reached maximum budget ($0.0001)"]}`,
			class:   claudecode.ClassBudgetExhausted,
			message: "runtime reported error_max_budget_usd: Reached maximum budget ($0.0001)",
		},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			path := filepath.Join(t.TempDir(), "result.json")
			if err := os.WriteFile(path, []byte(c.result), 0600); err != nil {
				t.Fatal(err)
			}
			data, err := os.ReadFile(path)
			if err != nil {
				t.Fatal(err)
			}
			stream := &claudecode.Stream{}
			if events := stream.Reduce(string(data)); len(events) != 1 || events[0].Kind != "TURN_FAILED" {
				t.Fatalf("events = %+v", events)
			}
			code := 0
			turn := stream.Reconcile(claudecode.Evidence{Exit: &claudecode.Exit{Code: &code}}, false)
			if turn.Status != claudecode.Failed || turn.Error == nil || turn.Error.Class != c.class {
				t.Fatalf("turn = %+v", turn)
			}
			if turn.Error.Message != c.message || strings.Contains(turn.Error.Message, "success") {
				t.Fatalf("message = %q, want %q without success", turn.Error.Message, c.message)
			}
		})
	}
}

// A process that could not be recorded fails the turn, whatever the stream
// says: it was killed, and nothing it reported can be trusted to be whole.
func TestUnrecordedProcessFailsTheTurnWhateverTheStreamSays(t *testing.T) {
	t.Parallel()
	stream := &claudecode.Stream{}
	stream.Reduce(`{"type":"result","subtype":"success","is_error":false}`)
	turn := stream.Reconcile(claudecode.Evidence{RecordError: "disk full"}, false)
	if string(turn.Status) != string(claudecode.Failed) || turn.Error == nil || string(turn.Error.Class) != string(claudecode.ClassInternal) || !strings.Contains(turn.Error.Message, "disk full") {
		t.Fatalf("turn = %+v", turn)
	}
}

// The stream's tool calls are reported for the core to watch: each with its
// whole input, the same text for the same input, and whether it runs a
// command; each result ends the call of its ID.
func TestStreamReportsToolCalls(t *testing.T) {
	t.Parallel()
	stream := &claudecode.Stream{}
	long := strings.Repeat("x", 1000)
	use := func(id, name string, input map[string]any) map[string]any {
		return map[string]any{"type": "assistant", "message": map[string]any{"content": []any{map[string]any{"type": "tool_use", "id": id, "name": name, "input": input}}}}
	}
	for _, line := range []map[string]any{
		use("t1", "Bash", map[string]any{"command": "go test ./...", "description": long}),
		{"type": "user", "message": map[string]any{"content": []any{map[string]any{"type": "tool_result", "tool_use_id": "t1"}}}},
		use("t2", "Read", map[string]any{"file_path": "a.go"}),
	} {
		data, _ := json.Marshal(line)
		stream.Reduce(string(data))
	}
	bash, _ := json.Marshal(map[string]any{"command": "go test ./...", "description": long})
	started := func(call claudecode.ToolCall) claudecode.Tool { return claudecode.Tool{Started: &call} }
	want := []claudecode.Tool{
		started(claudecode.ToolCall{ID: "t1", Name: "Bash", Input: string(bash), Command: true}),
		{Finished: "t1"},
		started(claudecode.ToolCall{ID: "t2", Name: "Read", Input: `{"file_path":"a.go"}`}),
	}
	if got := stream.TakeTools(); !reflect.DeepEqual(got, want) {
		t.Fatalf("tools = %+v", got)
	}
	if again := stream.TakeTools(); len(again) != 0 {
		t.Fatalf("taken twice: %+v", again)
	}
}

// Two calls of one tool whose inputs differ only in a large integer are
// distinct calls, not one repeated: the input keeps its numbers as written.
func TestLargeIntegerInputsAreNotRepeatedCalls(t *testing.T) {
	t.Parallel()
	stream := &claudecode.Stream{}
	for _, line := range []string{
		`{"type":"assistant","message":{"content":[{"type":"tool_use","id":"t1","name":"Read","input":{"offset":9007199254740993}}]}}`,
		`{"type":"assistant","message":{"content":[{"type":"tool_use","id":"t2","name":"Read","input":{"offset":9007199254740992}}]}}`,
	} {
		stream.Reduce(line)
	}
	tools := stream.TakeTools()
	if len(tools) != 2 || tools[0].Started == nil || tools[1].Started == nil {
		t.Fatalf("tools = %+v", tools)
	}
	first, second := *tools[0].Started, *tools[1].Started
	if first.Name != second.Name || first.Input != `{"offset":9007199254740993}` || second.Input != `{"offset":9007199254740992}` {
		t.Fatalf("calls = %+v, %+v", first, second)
	}
}
