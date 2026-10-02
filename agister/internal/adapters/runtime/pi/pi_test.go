package pi_test

import (
	"encoding/json"

	"reflect"

	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/pi"
	// fresh is the session the fake starts.
)

func TestArguments(t *testing.T) {
	args, err := pi.Arguments(pi.TurnRequest(request("hello")), "/sessions/new-1", "/tmp/system-prompt.md")
	if err != nil {
		t.Fatal(err)
	}
	want := []string{
		"-p", "--mode", "json", "--no-extensions", "--no-prompt-templates", "--no-themes", "--approve", "--offline",
		"--session-dir", "/sessions/new-1",
		"--model", "opencode-go/minimax-m3", "--thinking", "high",
		"--tools", "read,bash",
		"--append-system-prompt", "/tmp/system-prompt.md",
	}
	if !reflect.DeepEqual(args, want) {
		t.Fatalf("args =\n%q\nwant\n%q", args, want)
	}
}

// A continuation resumes the session by ID from its own directory, with
// every setting of a fresh turn.
func TestResumeArguments(t *testing.T) {
	r := request("hello")
	r.ResumeSessionID = "s-1"
	args, err := pi.Arguments(pi.TurnRequest(r), "/sessions/s-1", "/tmp/system-prompt.md")
	if err != nil {
		t.Fatal(err)
	}
	want := []string{
		"-p", "--mode", "json", "--no-extensions", "--no-prompt-templates", "--no-themes", "--approve", "--offline",
		"--session-dir", "/sessions/s-1", "--session", "s-1",
		"--model", "opencode-go/minimax-m3", "--thinking", "high",
		"--tools", "read,bash",
		"--append-system-prompt", "/tmp/system-prompt.md",
	}
	if !reflect.DeepEqual(args, want) {
		t.Fatalf("args =\n%q\nwant\n%q", args, want)
	}
}

// No model, effort or system prompt leaves Pi's own; the tools are always
// an allowlist.
func TestDefaults(t *testing.T) {
	args, err := pi.Arguments(pi.TurnRequest(pi.TurnRequest{Prompt: "x", Primitives: []string{"read"}}), "/sessions/new-1", "")
	if err != nil {
		t.Fatal(err)
	}
	want := []string{
		"-p", "--mode", "json", "--no-extensions", "--no-prompt-templates", "--no-themes", "--approve", "--offline",
		"--session-dir", "/sessions/new-1", "--tools", "read",
	}
	if !reflect.DeepEqual(args, want) {
		t.Fatalf("args =\n%q\nwant\n%q", args, want)
	}
}

// Every Pi tool is a primitive, and every thinking level an effort.
func TestToolsAndThinkingLevels(t *testing.T) {
	for _, tool := range pi.Tools {
		r := request("x")
		r.Primitives = []string{"read", tool}
		if args, err := pi.Arguments(pi.TurnRequest(r), "/s", ""); err != nil || !follows(args, "--tools", "read,"+tool) {
			t.Errorf("tool %s: %q, %v", tool, args, err)
		}
	}
	for _, level := range []string{"off", "minimal", "low", "medium", "high", "xhigh", "max"} {
		r := request("x")
		r.Effort = level
		if args, err := pi.Arguments(pi.TurnRequest(r), "/s", ""); err != nil || !follows(args, "--thinking", level) {
			t.Errorf("effort %s: %q, %v", level, args, err)
		}
	}
}

func follows(args []string, flag, value string) bool {
	for i := range args[:len(args)-1] {
		if args[i] == flag && args[i+1] == value {
			return true
		}
	}
	return false
}

var clean = func() pi.Evidence {
	code := 0
	return pi.Evidence{Exit: &pi.Exit{Code: &code}}
}()

func reduce(stream *pi.Stream, lines ...string) {
	for _, line := range lines {
		stream.Reduce(line)
	}
}

const (
	agentEnd = `{"type":"agent_end","messages":[],"willRetry":false}`
	stopped  = `{"type":"message_end","message":{"role":"assistant","content":[{"type":"text","text":"{\"answer\":\"vm\"}"}],"provider":"opencode-go","model":"minimax-m3","usage":{"input":10,"output":5,"cacheRead":4,"cacheWrite":2,"totalTokens":21,"cost":{"total":0.25}},"stopReason":"stop"}}`
)

// A resume turn must report the session it resumed: another one, or none
// by the end of the turn, breaks the contract of resuming in place.
func TestResumeReportingAnotherSessionFails(t *testing.T) {
	for name, lines := range map[string][]string{
		"another session": {`{"type":"session","version":3,"id":"s-2","cwd":"/w"}`, stopped, agentEnd},
		"no session":      {stopped, agentEnd},
	} {
		stream := &pi.Stream{ResumedSessionID: "s-1"}
		reduce(stream, lines...)
		if turn := stream.Reconcile(clean, false); string(turn.Status) != string(pi.Failed) || string(turn.Error.Class) != string(pi.ClassRuntimeError) || !strings.Contains(turn.Error.Message, "s-1") {
			t.Errorf("%s: turn = %+v", name, turn)
		}
	}
	stream := &pi.Stream{ResumedSessionID: "s-1"}
	reduce(stream, `{"type":"session","version":3,"id":"s-1","cwd":"/w"}`, stopped, agentEnd)
	if turn := stream.Reconcile(clean, false); string(turn.Status) != string(pi.Completed) || turn.ProviderSessionID != "s-1" {
		t.Fatalf("the same session: turn = %+v", turn)
	}
}

func TestStructuredOutputMustBeJSON(t *testing.T) {
	for text, class := range map[string]pi.Class{"not json": pi.ClassInvalidOutput, "": pi.ClassInvalidOutput} {
		stream := &pi.Stream{}
		data, _ := json.Marshal(map[string]any{"type": "message_end", "message": map[string]any{"role": "assistant", "content": []any{map[string]any{"type": "text", "text": text}}, "stopReason": "stop"}})
		reduce(stream, string(data), agentEnd)
		if turn := stream.Reconcile(clean, true); string(turn.Status) != string(pi.Failed) || string(turn.Error.Class) != string(class) {
			t.Errorf("%q: turn = %+v", text, turn)
		}
		// Without a schema, text is text.
		if turn := stream.Reconcile(clean, false); string(turn.Status) != string(pi.Completed) || turn.Output != nil {
			t.Errorf("%q without a schema: turn = %+v", text, turn)
		}
	}
	stream := &pi.Stream{}
	reduce(stream, stopped, agentEnd)
	if turn := stream.Reconcile(clean, true); string(turn.Status) != string(pi.Completed) || string(turn.Output) != `{"answer":"vm"}` || turn.Text != `{"answer":"vm"}` {
		t.Fatalf("turn = %+v", turn)
	}
}

// A figure an assistant message does not report is unknown for the turn,
// never a partial sum.
func TestAFigureSomeMessageLacksIsUnknown(t *testing.T) {
	stream := &pi.Stream{}
	reduce(stream,
		`{"type":"message_end","message":{"role":"assistant","content":[],"usage":{"input":100,"output":3},"stopReason":"toolUse"}}`,
		stopped, agentEnd)
	turn := stream.Reconcile(clean, false)
	if u := turn.Usage; u == nil || *u.InputTokens != 110 || *u.OutputTokens != 8 || u.CacheReadTokens != nil || turn.CostUSD != nil {
		t.Fatalf("turn = %+v, usage %+v", turn, u)
	}
}

func TestFailuresAreClassified(t *testing.T) {
	for _, c := range []struct {
		stopReason, message string
		class               pi.Class
	}{
		{"error", "429 Too Many Requests: rate limit exceeded", pi.ClassRateLimited},
		{"error", "You exceeded your current quota", pi.ClassRateLimited},
		{"error", "401 Unauthorized", pi.ClassAuth},
		{"error", "No API key found for opencode-go", pi.ClassAuth},
		{"error", "prompt exceeds the context window", pi.ClassContextOverflow},
		{"error", "terminated", pi.ClassRuntimeError},
		{"aborted", "", pi.ClassRuntimeError},
		{"length", "", pi.ClassRuntimeError},
	} {
		stream := &pi.Stream{}
		data, _ := json.Marshal(map[string]any{"type": "message_end", "message": map[string]any{"role": "assistant", "content": []any{}, "stopReason": c.stopReason, "errorMessage": c.message}})
		reduce(stream, string(data), agentEnd)
		turn := stream.Reconcile(clean, false)
		if string(turn.Status) != string(pi.Failed) || string(turn.Error.Class) != string(c.class) || !strings.HasPrefix(turn.Error.Message, "runtime reported "+c.stopReason) {
			t.Errorf("%s %q: %+v", c.stopReason, c.message, turn.Error)
		}
	}
	stream := &pi.Stream{}
	reduce(stream, agentEnd)
	if turn := stream.Reconcile(clean, false); string(turn.Status) != string(pi.Failed) || string(turn.Error.Class) != string(pi.ClassRuntimeError) {
		t.Fatalf("no assistant message: %+v", turn)
	}
}

// Only an agent_end Pi will not retry decides the turn; errors before it
// are evidence, quoted when the process ends without one.
func TestOnlyTheLastAgentEndDecides(t *testing.T) {
	stream := &pi.Stream{}
	reduce(stream,
		`{"type":"message_end","message":{"role":"assistant","content":[],"stopReason":"error","errorMessage":"overloaded"}}`,
		`{"type":"agent_end","messages":[],"willRetry":true}`,
	)
	if turn := stream.Reconcile(clean, false); string(turn.Status) != string(pi.Lost) || string(turn.Error.Class) != string(pi.ClassNoResult) || turn.Error.Message != "exited without a result: overloaded" {
		t.Fatalf("turn = %+v", turn)
	}
	reduce(stream, stopped, agentEnd)
	if turn := stream.Reconcile(clean, false); string(turn.Status) != string(pi.Completed) {
		t.Fatalf("turn = %+v", turn)
	}
}

const (
	overflowed = `{"type":"message_end","message":{"role":"assistant","content":[],"provider":"opencode-go","model":"minimax-m3","usage":{"input":0,"output":0,"cacheRead":0,"cacheWrite":0,"cost":{"total":0}},"stopReason":"error","errorMessage":"prompt is too long: 210000 tokens > 200000 maximum"}}`
	// The compaction of an overflow recovery: Pi retries the turn after it.
	recovering = `{"type":"compaction_end","reason":"overflow","result":{"summary":"So far.","firstKeptEntryId":"e1","tokensBefore":210000,"estimatedTokensAfter":32000,"usage":{"input":3000,"output":120,"cacheRead":30,"cacheWrite":10,"totalTokens":3160,"cost":{"total":0.5}},"details":{}},"aborted":false,"willRetry":true}`
)

// An agent_end Pi follows with a compaction and a retry of the turn did
// not end it: the recovery's own agent_end does. A recovery interrupted
// before it is decided by the transport, whatever its messages said.
func TestAnAgentEndBeforeARecoveryDoesNotEndTheTurn(t *testing.T) {
	overflow := []string{
		`{"type":"session","version":3,"id":"s-1","cwd":"/w"}`,
		`{"type":"agent_start"}`,
		overflowed,
		agentEnd,
		`{"type":"compaction_start","reason":"overflow"}`,
		recovering,
	}
	timedOut := pi.Evidence{TimedOut: true, Exit: &pi.Exit{Signal: "killed"}}
	for name, rest := range map[string][]string{
		"after the compaction":         nil,
		"after the recovery started":   {`{"type":"agent_start"}`},
		"after the recovery's message": {`{"type":"agent_start"}`, stopped},
	} {
		stream := &pi.Stream{}
		reduce(stream, append(overflow, rest...)...)
		if stream.Ended {
			t.Errorf("%s: the turn ended", name)
		}
		if turn := stream.Reconcile(timedOut, true); string(turn.Status) == string(pi.Completed) || turn.Error == nil || string(turn.Error.Class) != string(pi.ClassTimeout) || turn.Output != nil {
			t.Errorf("%s, timed out: turn = %+v", name, turn)
		}
		if turn := stream.Reconcile(clean, true); string(turn.Status) != string(pi.Lost) || string(turn.Error.Class) != string(pi.ClassNoResult) {
			t.Errorf("%s, exited: turn = %+v", name, turn)
		}
	}
	// The recovery's agent_end decides the turn.
	stream := &pi.Stream{}
	reduce(stream, append(overflow, `{"type":"agent_start"}`, stopped, agentEnd)...)
	if turn := stream.Reconcile(clean, true); string(turn.Status) != string(pi.Completed) || string(turn.Output) != `{"answer":"vm"}` {
		t.Fatalf("recovered: turn = %+v", turn)
	}
}

// Any agent run that starts after an agent_end takes it back, and a
// compaction Pi does not retry after leaves the turn ended.
func TestOnlyTheLastAgentRunEndsTheTurn(t *testing.T) {
	stream := &pi.Stream{}
	reduce(stream, stopped, agentEnd, `{"type":"agent_start"}`)
	if turn := stream.Reconcile(clean, false); string(turn.Status) != string(pi.Lost) || string(turn.Error.Class) != string(pi.ClassNoResult) {
		t.Fatalf("another agent run: turn = %+v", turn)
	}
	stream = &pi.Stream{}
	reduce(stream, stopped, agentEnd,
		`{"type":"compaction_start","reason":"threshold"}`,
		`{"type":"compaction_end","reason":"threshold","result":{"summary":"So far.","usage":{"input":1,"output":1,"cacheRead":0,"cacheWrite":0,"cost":{"total":0.5}}},"aborted":false,"willRetry":false}`,
	)
	if turn := stream.Reconcile(clean, false); string(turn.Status) != string(pi.Completed) {
		t.Fatalf("compacted after the end: turn = %+v", turn)
	}
}

// What an automatic compaction's summary cost is the turn's too: usage and
// cost are summed over the assistant messages and the compaction.
func TestCompactionUsageAndCostAreCounted(t *testing.T) {
	stream := &pi.Stream{}
	reduce(stream, `{"type":"agent_start"}`, overflowed, agentEnd, recovering, `{"type":"agent_start"}`, stopped, agentEnd)
	turn := stream.Reconcile(clean, true)
	if string(turn.Status) != string(pi.Completed) {
		t.Fatalf("turn = %+v", turn)
	}
	u := turn.Usage
	if u == nil || *u.InputTokens != 3010 || *u.OutputTokens != 125 || *u.CacheReadTokens != 34 || *u.CacheWriteTokens != 12 {
		t.Fatalf("usage = %+v", u)
	}
	if turn.CostUSD == nil || *turn.CostUSD != 0.75 {
		t.Fatalf("cost = %v", turn.CostUSD)
	}
}

// A compaction that reports no usage, or lacks a figure, leaves that
// figure unknown for the turn, never the assistant messages' partial sum;
// one that made no summary counts nothing.
func TestACompactionWithoutUsageLeavesTheFiguresUnknown(t *testing.T) {
	stream := &pi.Stream{}
	reduce(stream, stopped, agentEnd, `{"type":"compaction_end","reason":"threshold","result":{"summary":"So far."},"aborted":false,"willRetry":false}`)
	if turn := stream.Reconcile(clean, false); string(turn.Status) != string(pi.Completed) || turn.Usage != nil || turn.CostUSD != nil {
		t.Fatalf("no usage: turn = %+v, usage %+v", turn, turn.Usage)
	}
	stream = &pi.Stream{}
	reduce(stream, stopped, agentEnd, `{"type":"compaction_end","reason":"threshold","result":{"summary":"So far.","usage":{"input":90,"output":7}},"aborted":false,"willRetry":false}`)
	turn := stream.Reconcile(clean, false)
	if u := turn.Usage; u == nil || *u.InputTokens != 100 || *u.OutputTokens != 12 || u.CacheReadTokens != nil || u.CacheWriteTokens != nil || turn.CostUSD != nil {
		t.Fatalf("some figures: turn = %+v, usage %+v", turn, u)
	}
	for name, line := range map[string]string{
		"aborted": `{"type":"compaction_end","reason":"threshold","result":null,"aborted":true,"willRetry":false}`,
		"failed":  `{"type":"compaction_end","reason":"overflow","aborted":false,"willRetry":false,"errorMessage":"Context overflow recovery failed: quota"}`,
	} {
		stream := &pi.Stream{}
		reduce(stream, stopped, agentEnd, line)
		if turn := stream.Reconcile(clean, false); string(turn.Status) != string(pi.Completed) || turn.CostUSD == nil || *turn.CostUSD != 0.25 || *turn.Usage.InputTokens != 10 {
			t.Errorf("%s: turn = %+v, usage %+v", name, turn, turn.Usage)
		}
	}
}

// Tool executions are reported as they start, with their whole arguments,
// numbers as written and however long, and as they finish; bash runs
// commands. Only the event's preview is cut.
func TestToolCallsAreReported(t *testing.T) {
	stream := &pi.Stream{}
	long := strings.Repeat("x", 1000)
	input := `{"command":"ls ` + long + `","timeout":12345678901234567890}`
	events := stream.Reduce(`{"type":"tool_execution_start","toolCallId":"c1","toolName":"bash","args":` + input + `}`)
	tools := stream.TakeTools()
	if len(tools) != 1 || *tools[0].Started != (pi.ToolCall{ID: "c1", Name: "bash", Input: input, Command: true}) {
		t.Fatalf("tools = %+v", tools)
	}
	if len(events) != 1 || events[0].Kind != "TOOL_REQUESTED" || events[0].Data["tool_use_id"] != "c1" || events[0].Data["input"] == input {
		t.Fatalf("events = %+v", events)
	}
	stream.Reduce(`{"type":"tool_execution_start","toolCallId":"c2","toolName":"read","args":{"path":"a.txt"}}`)
	if tools := stream.TakeTools(); tools[0].Started.Command {
		t.Fatalf("read runs a command: %+v", tools[0].Started)
	}
	events = stream.Reduce(`{"type":"tool_execution_end","toolCallId":"c1","toolName":"bash","result":{},"isError":true}`)
	if tools := stream.TakeTools(); len(tools) != 1 || tools[0].Finished != "c1" {
		t.Fatalf("tools = %+v", tools)
	}
	if events[0].Kind != "TOOL_RESULT" || events[0].Data["is_error"] != true {
		t.Fatalf("events = %+v", events)
	}
}

// A completed turn's text is its final assistant message's, never the
// commentary of an earlier one, even when the final one says nothing.
func TestACompletedTurnsTextIsTheFinalMessages(t *testing.T) {
	commentary := `{"type":"message_end","message":{"role":"assistant","content":[{"type":"text","text":"Let me look at the tests."},{"type":"toolCall","id":"c1","name":"read","arguments":{"path":"a_test.go"}}],"stopReason":"toolUse"}}`
	for name, final := range map[string]string{"empty": "", "whitespace": " \n"} {
		content, _ := json.Marshal([]any{map[string]any{"type": "text", "text": final}})
		stream := &pi.Stream{}
		reduce(stream,
			`{"type":"agent_start"}`,
			commentary,
			`{"type":"tool_execution_start","toolCallId":"c1","toolName":"read","args":{"path":"a_test.go"}}`,
			`{"type":"tool_execution_end","toolCallId":"c1","toolName":"read","result":{},"isError":false}`,
			`{"type":"message_end","message":{"role":"assistant","content":`+string(content)+`,"stopReason":"stop"}}`,
			agentEnd,
		)
		if turn := stream.Reconcile(clean, false); string(turn.Status) != string(pi.Completed) || turn.Text != final {
			t.Errorf("%s: turn = %+v", name, turn)
		}
	}
}

// A process that could not be recorded fails the turn, whatever the stream
// says: it was killed, and nothing it reported can be trusted to be whole.
func TestUnrecordedProcessFailsTheTurnWhateverTheStreamSays(t *testing.T) {
	stream := &pi.Stream{}
	reduce(stream, stopped, agentEnd)
	turn := stream.Reconcile(pi.Evidence{RecordError: "disk full"}, false)
	if string(turn.Status) != string(pi.Failed) || turn.Error == nil || string(turn.Error.Class) != string(pi.ClassInternal) || !strings.Contains(turn.Error.Message, "disk full") {
		t.Fatalf("turn = %+v", turn)
	}
}
