package codex_test

import (
	"context"
	"encoding/json"

	"reflect"

	"strings"

	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/codex"
)

func TestArguments(t *testing.T) {
	args, err := codex.Arguments(codex.TurnRequest(request("hello")), "/tmp/schema.json")
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
	if got := codex.Prompt(codex.TurnRequest(request("hello"))); got != "<instructions>\nDo the thing.\n</instructions>\n\nhello" {
		t.Fatalf("prompt = %q", got)
	}
}

// A continuation runs `exec resume` on the reported thread with every
// setting of a fresh turn; resume has no --sandbox, so the sandbox mode
// goes in as config.
func TestResumeArguments(t *testing.T) {
	r := request("hello")
	r.ResumeSessionID = "thread-0"
	args, err := codex.Arguments(codex.TurnRequest(r), "/tmp/schema.json")
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

// A resume turn must report the thread it resumed: another one, or none by
// the end of the turn, breaks the contract of resuming in place.
func TestResumeReportingAnotherThreadFails(t *testing.T) {
	code := 0
	clean := codex.Evidence{Exit: &codex.Exit{Code: &code}}
	for name, lines := range map[string][]string{
		"another thread": {`{"type":"thread.started","thread_id":"t-2"}`, `{"type":"turn.completed"}`},
		"no thread":      {`{"type":"turn.completed"}`},
	} {
		stream := &codex.Stream{ResumedThreadID: "t-1"}
		for _, line := range lines {
			stream.Reduce(line)
		}
		if turn := stream.Reconcile(clean, false); string(turn.Status) != string(codex.Failed) || string(turn.Error.Class) != string(codex.ClassRuntimeError) || !strings.Contains(turn.Error.Message, "t-1") {
			t.Errorf("%s: turn = %+v", name, turn)
		}
	}
	stream := &codex.Stream{ResumedThreadID: "t-1"}
	stream.Reduce(`{"type":"thread.started","thread_id":"t-1"}`)
	stream.Reduce(`{"type":"turn.completed"}`)
	if turn := stream.Reconcile(clean, false); string(turn.Status) != string(codex.Completed) || turn.ProviderSessionID != "t-1" {
		t.Fatalf("the same thread: turn = %+v", turn)
	}
}

func TestRejectsWhatItCannotHonour(t *testing.T) {
	for _, primitives := range [][]string{nil, {"read-only", "workspace-write"}, {"danger-full-access"}} {
		r := request("x")
		r.Primitives = primitives
		if _, err := codex.Arguments(codex.TurnRequest(r), ""); err == nil {
			t.Fatalf("primitives %v accepted", primitives)
		}
	}
	r := request("x")
	limit := 1.0
	r.MaxCostUSD = &limit
	if _, err := codex.Arguments(codex.TurnRequest(r), ""); err == nil || !strings.Contains(err.Error(), "cannot limit cost") {
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
	clean := codex.Evidence{Exit: &codex.Exit{Code: &code}}
	if turn := stream.Reconcile(clean, true); string(turn.Status) != string(codex.Lost) || string(turn.Error.Class) != string(codex.ClassNoResult) || turn.Error.Message != "exited without a result: Reconnecting... 2/5" {
		t.Fatalf("errors so far are evidence, not an outcome: %+v", turn)
	}
	stream.Reduce(`{"type":"turn.completed","usage":{"input_tokens":10,"cached_input_tokens":4,"output_tokens":5,"reasoning_output_tokens":3}}`)
	turn := stream.Reconcile(clean, true)
	if string(turn.Status) != string(codex.Completed) || string(turn.Output) != `{"answer":"vm"}` || turn.ProviderSessionID != "t-1" || turn.CostUSD != nil {
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
	if turn := stream.Reconcile(codex.Evidence{Exit: &codex.Exit{Code: &code}}, true); string(turn.Status) != string(codex.Failed) || string(turn.Error.Class) != string(codex.ClassInvalidOutput) {
		t.Fatalf("turn = %+v", turn)
	}
}

func TestFailuresAreClassified(t *testing.T) {
	code := 0
	clean := codex.Evidence{Exit: &codex.Exit{Code: &code}}
	for message, class := range map[string]codex.Class{
		"You've hit your usage limit": codex.ClassRateLimited,
		"401 Unauthorized":            codex.ClassAuth,
		"exceeds the context window":  codex.ClassContextOverflow,
		"stream disconnected":         codex.ClassRuntimeError,
	} {
		stream := &codex.Stream{}
		data, _ := json.Marshal(map[string]any{"type": "turn.failed", "error": map[string]any{"message": message}})
		stream.Reduce(string(data))
		if turn := stream.Reconcile(clean, false); string(turn.Status) != string(codex.Failed) || string(turn.Error.Class) != string(class) {
			t.Errorf("%q: %+v", message, turn.Error)
		}
	}
}

// A process that could not be recorded fails the turn, whatever the stream
// says: it was killed, and nothing it reported can be trusted to be whole.
func TestUnrecordedProcessFailsTheTurnWhateverTheStreamSays(t *testing.T) {
	stream := &codex.Stream{}
	stream.Reduce(`{"type":"turn.completed"}`)
	turn := stream.Reconcile(codex.Evidence{RecordError: "disk full"}, false)
	if string(turn.Status) != string(codex.Failed) || turn.Error == nil || string(turn.Error.Class) != string(codex.ClassInternal) || !strings.Contains(turn.Error.Message, "disk full") {
		t.Fatalf("turn = %+v", turn)
	}
}

func listing(cost string) codex.Sessions {
	return func(context.Context, time.Duration, codex.LookupSink) ([]byte, error) {
		return []byte(listingJSON(cost)), nil
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

// The stream's tool calls are reported for the core to watch: each with its
// whole input and whether it runs a command; a completed item ends the call
// of its ID, and an item that is no tool call is not one.
func TestStreamReportsToolCalls(t *testing.T) {
	stream := &codex.Stream{}
	long := "echo " + strings.Repeat("x", 1000)
	command, _ := json.Marshal(long)
	for _, line := range []string{
		`{"type":"item.started","item":{"id":"item_1","type":"command_execution","command":` + string(command) + `}}`,
		`{"type":"item.completed","item":{"id":"item_1","type":"command_execution","exit_code":0,"status":"completed"}}`,
		`{"type":"item.started","item":{"id":"item_2","type":"web_search","query":"agister"}}`,
		`{"type":"item.completed","item":{"id":"item_3","type":"agent_message","text":"done"}}`,
	} {
		stream.Reduce(line)
	}
	tools := stream.TakeTools()
	if len(tools) != 3 || tools[0].Started == nil || tools[1].Finished != "item_1" || tools[2].Started == nil {
		t.Fatalf("tools = %+v", tools)
	}
	if first := *tools[0].Started; first.ID != "item_1" || first.Name == "" || first.Input != long || !first.Command {
		t.Fatalf("command = %+v", first)
	}
	if search := *tools[2].Started; search.ID != "item_2" || search.Input != "agister" || search.Command {
		t.Fatalf("search = %+v", search)
	}
	if again := stream.TakeTools(); len(again) != 0 {
		t.Fatalf("taken twice: %+v", again)
	}
}

// Two calls of one tool whose inputs differ only in a large integer are
// distinct calls, not one repeated: the input keeps its numbers as written.
func TestLargeIntegerInputsAreNotRepeatedCalls(t *testing.T) {
	stream := &codex.Stream{}
	for _, line := range []string{
		`{"type":"item.started","item":{"id":"item_1","type":"mcp_tool_call","server":"s","tool":"read","arguments":{"offset":9007199254740993}}}`,
		`{"type":"item.started","item":{"id":"item_2","type":"mcp_tool_call","server":"s","tool":"read","arguments":{"offset":9007199254740992}}}`,
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
