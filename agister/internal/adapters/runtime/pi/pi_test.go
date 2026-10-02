package pi_test

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/pi"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/runtimetest"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/supervisor"
	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

// fresh is the session the fake starts.
const fresh = "3b0c9a52-6f1e-4d8a-9c47-0e2f5d8b1a63"

func request(prompt string) app.TurnRequest {
	return app.TurnRequest{
		Prompt:       prompt,
		Instruction:  "Do the thing.",
		Primitives:   []string{"read", "bash"},
		Model:        "opencode-go/minimax-m3",
		Effort:       "high",
		Timeout:      time.Minute,
		OutputSchema: json.RawMessage(`{"type":"object"}`),
	}
}

// session writes, under root, session id's file as Pi keeps it: in a
// directory of its own, its header recording cwd.
func session(t *testing.T, root, id, cwd string) {
	t.Helper()
	dir := filepath.Join(root, id)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		t.Fatal(err)
	}
	header, _ := json.Marshal(map[string]any{"type": "session", "version": 3, "id": id, "timestamp": "2026-10-01T10:00:00Z", "cwd": cwd})
	if err := os.WriteFile(filepath.Join(dir, "2026-10-01T10-00-00Z_"+id+".jsonl"), append(header, '\n'), 0o600); err != nil {
		t.Fatal(err)
	}
}

// The suite's resume turn resumes a session that ran in the request's
// working directory, kept as a fresh turn keeps it.
func TestConformance(t *testing.T) {
	root, cwd := t.TempDir(), t.TempDir()
	session(t, root, "7d1c2a4e-0000-4000-8000-000000000001", cwd)
	runtimetest.Conformance(t, runtimetest.Subject{
		New: func(command string) app.TurnRunner {
			return &pi.Runner{Transport: supervisor.Runtimes{}, Command: command, KillGrace: 200 * time.Millisecond, Sessions: root}
		},
		Fake:      runtimetest.Binary(t, "fakepi"),
		Contract:  pi.Contract,
		ToolCalls: true,
		Request: func(prompt string) app.TurnRequest {
			r := request(prompt)
			r.Cwd = cwd
			return r
		},
	})
}

func TestArguments(t *testing.T) {
	args, err := pi.Arguments(request("hello"), "/sessions/new-1", "/tmp/system-prompt.md")
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
	args, err := pi.Arguments(r, "/sessions/s-1", "/tmp/system-prompt.md")
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
	args, err := pi.Arguments(app.TurnRequest{Prompt: "x", Primitives: []string{"read"}}, "/sessions/new-1", "")
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

// A skill is used by reading it, and Pi reads with read or bash only: a
// turn granted neither is refused before Pi starts, so --no-tools, with
// which Pi leaves skills out, is never passed.
func TestRefusesATurnThatCannotReadASkill(t *testing.T) {
	for _, primitives := range [][]string{nil, {}, {"grep", "find", "ls"}, {"edit", "write"}} {
		r := request("x")
		r.Primitives = primitives
		if args, err := pi.Arguments(r, "/s", ""); err == nil || err.Error() != "pi/1 needs read or bash to use the repository's skills (ADR-006)" {
			t.Errorf("primitives %q: args %q, err = %v", primitives, args, err)
		}
	}
	for _, primitives := range [][]string{{"read"}, {"bash"}, {"grep", "read"}, {"ls", "bash"}} {
		r := request("x")
		r.Primitives = primitives
		if args, err := pi.Arguments(r, "/s", ""); err != nil || slices.Contains(args, "--no-tools") || !follows(args, "--tools", strings.Join(primitives, ",")) {
			t.Errorf("primitives %q: args %q, err = %v", primitives, args, err)
		}
	}
	root := t.TempDir()
	r := request("x")
	r.Primitives = []string{"grep"}
	sink := &runtimetest.Recorder{}
	turn := (&pi.Runner{Transport: supervisor.Runtimes{}, Command: runtimetest.Binary(t, "fakepi"), Sessions: root}).RunTurn(context.Background(), r, sink)
	if turn.Status != run.Failed || turn.Error.Class != run.ClassInternal || len(sink.Processes) != 0 {
		t.Fatalf("turn = %+v, processes %v", turn, sink.Processes)
	}
	if entries, _ := os.ReadDir(root); len(entries) != 0 {
		t.Fatalf("root holds %v", entries)
	}
}

// Every Pi tool is a primitive, and every thinking level an effort.
func TestToolsAndThinkingLevels(t *testing.T) {
	for _, tool := range pi.Tools {
		r := request("x")
		r.Primitives = []string{"read", tool}
		if args, err := pi.Arguments(r, "/s", ""); err != nil || !follows(args, "--tools", "read,"+tool) {
			t.Errorf("tool %s: %q, %v", tool, args, err)
		}
	}
	for _, level := range []string{"off", "minimal", "low", "medium", "high", "xhigh", "max"} {
		r := request("x")
		r.Effort = level
		if args, err := pi.Arguments(r, "/s", ""); err != nil || !follows(args, "--thinking", level) {
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

func TestRejectsWhatItCannotHonour(t *testing.T) {
	r := request("x")
	limit := 1.0
	r.MaxCostUSD = &limit
	if _, err := pi.Arguments(r, "/s", ""); err == nil || err.Error() != "pi/1 cannot limit cost" {
		t.Fatalf("cost limit: err = %v", err)
	}
	for _, primitives := range [][]string{{"Bash"}, {"read", "web_fetch"}, {""}} {
		r := request("x")
		r.Primitives = primitives
		if _, err := pi.Arguments(r, "/s", ""); err == nil || !strings.Contains(err.Error(), "pi/1 has no tool") {
			t.Errorf("primitives %q: err = %v", primitives, err)
		}
	}
	r = request("x")
	r.Effort = "extreme"
	if _, err := pi.Arguments(r, "/s", ""); err == nil {
		t.Fatal("an unknown thinking level was accepted")
	}
	// Refused before Pi starts.
	r = request("x")
	r.MaxCostUSD = &limit
	sink := &runtimetest.Recorder{}
	turn := (&pi.Runner{Transport: supervisor.Runtimes{}, Command: runtimetest.Binary(t, "fakepi"), Sessions: t.TempDir()}).RunTurn(context.Background(), r, sink)
	if turn.Status != run.Failed || turn.Error.Class != run.ClassInternal || len(sink.Processes) != 0 {
		t.Fatalf("turn = %+v, processes %v", turn, sink.Processes)
	}
}

// The instruction and the schema the output must meet go in the system
// prompt, which the fake echoes, read from the file passed; the prompt
// goes on stdin.
func TestInstructionAndSchemaGoInTheSystemPrompt(t *testing.T) {
	if got := pi.SystemPrompt(app.TurnRequest{Instruction: "Do the thing."}); got != "Do the thing." {
		t.Fatalf("instruction only: %q", got)
	}
	if got := pi.SystemPrompt(app.TurnRequest{}); got != "" {
		t.Fatalf("neither: %q", got)
	}
	runner := &pi.Runner{Transport: supervisor.Runtimes{}, Command: runtimetest.Binary(t, "fakepi"), KillGrace: 200 * time.Millisecond, Sessions: t.TempDir()}
	sink := &runtimetest.Recorder{}
	turn := runner.RunTurn(context.Background(), request("hello SCENARIO:approve"), sink)
	if turn.Status != run.Completed {
		t.Fatalf("turn = %+v", turn)
	}
	var echo struct {
		Prompt, System string
		Argv           []string
	}
	if err := json.Unmarshal([]byte(sink.Lines[0]), &echo); err != nil {
		t.Fatal(err)
	}
	if echo.Prompt != "hello SCENARIO:approve" || !strings.HasPrefix(echo.System, "Do the thing.\n\n") ||
		!strings.Contains(echo.System, "<output-schema>\n{\"type\":\"object\"}\n</output-schema>") {
		t.Fatalf("echo = %+v", echo)
	}
	// The file is the turn's own, gone once it returns.
	path := echo.Argv[len(echo.Argv)-1]
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatalf("system prompt file %s: %v", path, err)
	}
}

func TestIdentity(t *testing.T) {
	identity, err := pi.New(runtimetest.Binary(t, "fakepi"), t.TempDir(), supervisor.Runtimes{}).Identity(context.Background())
	want := app.RuntimeIdentity{Contract: "pi/1", Version: "0.85.1", Resume: true, ResumeWhereItRan: true, ToolCalls: true, SkillTools: []string{"read", "bash"}}
	if err != nil || !reflect.DeepEqual(identity, want) {
		t.Fatalf("identity = %+v, %v", identity, err)
	}
}

// A fresh turn's session is kept under the root, named by the ID Pi
// reported, and a later turn of the call resumes it in place there. The
// root is a literal path: brackets in it are no pattern.
func TestSessionsAreKeptForTheCallsLaterTurns(t *testing.T) {
	root, cwd := filepath.Join(t.TempDir(), "sessions[1]"), t.TempDir()
	runner := &pi.Runner{Transport: supervisor.Runtimes{}, Command: runtimetest.Binary(t, "fakepi"), KillGrace: 200 * time.Millisecond, Sessions: root}
	first := request("SCENARIO:approve")
	first.Cwd = cwd
	sink := &runtimetest.Recorder{}
	turn := runner.RunTurn(context.Background(), first, sink)
	if turn.Status != run.Completed || turn.ProviderSessionID != fresh {
		t.Fatalf("fresh turn = %+v", turn)
	}
	entries, _ := os.ReadDir(root)
	if len(entries) != 1 || entries[0].Name() != fresh {
		t.Fatalf("root holds %v", entries)
	}
	sessionDir := argAfter(t, sink, "--session-dir")
	if filepath.Dir(sessionDir) != root || filepath.Base(sessionDir) == fresh {
		t.Fatalf("fresh turn's session dir %s", sessionDir)
	}

	next := request("SCENARIO:approve")
	next.Cwd, next.ResumeSessionID = cwd, fresh
	sink = &runtimetest.Recorder{}
	turn = runner.RunTurn(context.Background(), next, sink)
	if turn.Status != run.Completed || turn.ProviderSessionID != fresh {
		t.Fatalf("resumed turn = %+v", turn)
	}
	if got := argAfter(t, sink, "--session-dir"); got != filepath.Join(root, fresh) || argAfter(t, sink, "--session") != fresh {
		t.Fatalf("resumed turn's session dir %s", got)
	}
}

// A turn that reported no session leaves nothing to resume behind.
func TestATurnWithoutASessionLeavesNoDirectory(t *testing.T) {
	root := t.TempDir()
	runner := &pi.Runner{Transport: supervisor.Runtimes{}, Command: "/nonexistent/pi", Sessions: root}
	if turn := runner.RunTurn(context.Background(), request("x"), &runtimetest.Recorder{}); turn.Status != run.Failed {
		t.Fatalf("turn = %+v", turn)
	}
	if entries, _ := os.ReadDir(root); len(entries) != 0 {
		t.Fatalf("root holds %v", entries)
	}
}

// Pi finds a session by ID only among its working directory's, and asks on
// stdin whether to fork one from another: a resume turn elsewhere, or of a
// session not kept, is refused before Pi starts.
func TestResumeIsRefusedWhereItCannotResumeInPlace(t *testing.T) {
	root, cwd, elsewhere := t.TempDir(), t.TempDir(), t.TempDir()
	session(t, root, "s-1", cwd)
	for name, c := range map[string]struct {
		id, cwd, reason string
	}{
		"another directory": {"s-1", elsewhere, "only in the directory it ran in"},
		"no such session":   {"s-2", cwd, "it is not under"},
		"not an ID":         {"../s-1", cwd, "not a session ID"},
	} {
		r := request("SCENARIO:approve")
		r.Cwd, r.ResumeSessionID = c.cwd, c.id
		sink := &runtimetest.Recorder{}
		turn := (&pi.Runner{Transport: supervisor.Runtimes{}, Command: runtimetest.Binary(t, "fakepi"), Sessions: root}).RunTurn(context.Background(), r, sink)
		if turn.Status != run.Failed || turn.Error.Class != run.ClassRuntimeError || !strings.Contains(turn.Error.Message, c.reason) || len(sink.Processes) != 0 {
			t.Errorf("%s: turn = %+v, processes %v", name, turn, sink.Processes)
		}
	}
}

func argAfter(t *testing.T, sink *runtimetest.Recorder, flag string) string {
	t.Helper()
	var echo struct{ Argv []string }
	if err := json.Unmarshal([]byte(sink.Lines[0]), &echo); err != nil {
		t.Fatal(err)
	}
	for i, arg := range echo.Argv[:len(echo.Argv)-1] {
		if arg == flag {
			return echo.Argv[i+1]
		}
	}
	t.Fatalf("no %s in %q", flag, echo.Argv)
	return ""
}

var clean = func() supervisor.Evidence {
	code := 0
	return supervisor.Evidence{Exit: &run.Exit{Code: &code}}
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
		if turn := stream.Reconcile(clean, false); turn.Status != run.Failed || turn.Error.Class != run.ClassRuntimeError || !strings.Contains(turn.Error.Message, "s-1") {
			t.Errorf("%s: turn = %+v", name, turn)
		}
	}
	stream := &pi.Stream{ResumedSessionID: "s-1"}
	reduce(stream, `{"type":"session","version":3,"id":"s-1","cwd":"/w"}`, stopped, agentEnd)
	if turn := stream.Reconcile(clean, false); turn.Status != run.Completed || turn.ProviderSessionID != "s-1" {
		t.Fatalf("the same session: turn = %+v", turn)
	}
}

func TestStructuredOutputMustBeJSON(t *testing.T) {
	for text, class := range map[string]run.Class{"not json": run.ClassInvalidOutput, "": run.ClassInvalidOutput} {
		stream := &pi.Stream{}
		data, _ := json.Marshal(map[string]any{"type": "message_end", "message": map[string]any{"role": "assistant", "content": []any{map[string]any{"type": "text", "text": text}}, "stopReason": "stop"}})
		reduce(stream, string(data), agentEnd)
		if turn := stream.Reconcile(clean, true); turn.Status != run.Failed || turn.Error.Class != class {
			t.Errorf("%q: turn = %+v", text, turn)
		}
		// Without a schema, text is text.
		if turn := stream.Reconcile(clean, false); turn.Status != run.Completed || turn.Output != nil {
			t.Errorf("%q without a schema: turn = %+v", text, turn)
		}
	}
	stream := &pi.Stream{}
	reduce(stream, stopped, agentEnd)
	if turn := stream.Reconcile(clean, true); turn.Status != run.Completed || string(turn.Output) != `{"answer":"vm"}` || turn.Text != `{"answer":"vm"}` {
		t.Fatalf("turn = %+v", turn)
	}
}

// Usage and cost are the turn's own, summed over every message it ended,
// a failed attempt Pi retried and a tool's own model work included; the
// user's message counts nothing.
func TestUsageAndCostAreSummedOverTheTurn(t *testing.T) {
	stream := &pi.Stream{}
	reduce(stream,
		`{"type":"session","version":3,"id":"s-1","cwd":"/w"}`,
		`{"type":"agent_start"}`,
		`{"type":"message_end","message":{"role":"user","content":"hi"}}`,
		`{"type":"message_end","message":{"role":"assistant","content":[],"usage":{"input":100,"output":0,"cacheRead":0,"cacheWrite":0,"cost":{"total":0.01}},"stopReason":"error","errorMessage":"overloaded"}}`,
		`{"type":"auto_retry_start","attempt":1,"maxAttempts":3,"delayMs":2000,"errorMessage":"overloaded"}`,
		`{"type":"agent_end","messages":[],"willRetry":true}`,
		`{"type":"agent_start"}`,
		`{"type":"message_end","message":{"role":"assistant","content":[{"type":"toolCall","id":"c1","name":"read","arguments":{"path":"a.txt"}}],"usage":{"input":1000,"output":40,"cacheRead":500,"cacheWrite":20,"cost":{"total":0.5}},"stopReason":"toolUse"}}`,
		`{"type":"message_end","message":{"role":"toolResult","toolCallId":"c1","toolName":"read","content":[],"isError":false}}`,
		`{"type":"message_end","message":{"role":"toolResult","toolCallId":"c2","toolName":"subagent","content":[],"usage":{"input":7,"output":3,"cacheRead":0,"cacheWrite":0,"cost":{"total":0.125}},"isError":false}}`,
		stopped,
		agentEnd,
	)
	turn := stream.Reconcile(clean, true)
	if turn.Status != run.Completed || turn.ProviderSessionID != "s-1" || turn.Model != "opencode-go/minimax-m3" || turn.Session != nil {
		t.Fatalf("turn = %+v", turn)
	}
	u := turn.Usage
	if u == nil || *u.InputTokens != 1117 || *u.OutputTokens != 48 || *u.CacheReadTokens != 504 || *u.CacheWriteTokens != 22 || u.ReasoningTokens != nil {
		t.Fatalf("usage = %+v", u)
	}
	if turn.CostUSD == nil || *turn.CostUSD != 0.885 {
		t.Fatalf("cost = %v", turn.CostUSD)
	}
	// What the call derives from it is the same: it is the turn's own.
	if own := run.Own(turn, true); *own.CostUSD != 0.885 || *own.Usage.InputTokens != 1117 {
		t.Fatalf("own = %+v", own)
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
		class               run.Class
	}{
		{"error", "429 Too Many Requests: rate limit exceeded", run.ClassRateLimited},
		{"error", "You exceeded your current quota", run.ClassRateLimited},
		{"error", "401 Unauthorized", run.ClassAuth},
		{"error", "No API key found for opencode-go", run.ClassAuth},
		{"error", "prompt exceeds the context window", run.ClassContextOverflow},
		{"error", "terminated", run.ClassRuntimeError},
		{"aborted", "", run.ClassRuntimeError},
		{"length", "", run.ClassRuntimeError},
	} {
		stream := &pi.Stream{}
		data, _ := json.Marshal(map[string]any{"type": "message_end", "message": map[string]any{"role": "assistant", "content": []any{}, "stopReason": c.stopReason, "errorMessage": c.message}})
		reduce(stream, string(data), agentEnd)
		turn := stream.Reconcile(clean, false)
		if turn.Status != run.Failed || turn.Error.Class != c.class || !strings.HasPrefix(turn.Error.Message, "runtime reported "+c.stopReason) {
			t.Errorf("%s %q: %+v", c.stopReason, c.message, turn.Error)
		}
	}
	stream := &pi.Stream{}
	reduce(stream, agentEnd)
	if turn := stream.Reconcile(clean, false); turn.Status != run.Failed || turn.Error.Class != run.ClassRuntimeError {
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
	if turn := stream.Reconcile(clean, false); turn.Status != run.Lost || turn.Error.Class != run.ClassNoResult || turn.Error.Message != "exited without a result: overloaded" {
		t.Fatalf("turn = %+v", turn)
	}
	reduce(stream, stopped, agentEnd)
	if turn := stream.Reconcile(clean, false); turn.Status != run.Completed {
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
	timedOut := supervisor.Evidence{TimedOut: true, Exit: &run.Exit{Signal: "killed"}}
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
		if turn := stream.Reconcile(timedOut, true); turn.Status == run.Completed || turn.Error == nil || turn.Error.Class != run.ClassTimeout || turn.Output != nil {
			t.Errorf("%s, timed out: turn = %+v", name, turn)
		}
		if turn := stream.Reconcile(clean, true); turn.Status != run.Lost || turn.Error.Class != run.ClassNoResult {
			t.Errorf("%s, exited: turn = %+v", name, turn)
		}
	}
	// The recovery's agent_end decides the turn.
	stream := &pi.Stream{}
	reduce(stream, append(overflow, `{"type":"agent_start"}`, stopped, agentEnd)...)
	if turn := stream.Reconcile(clean, true); turn.Status != run.Completed || string(turn.Output) != `{"answer":"vm"}` {
		t.Fatalf("recovered: turn = %+v", turn)
	}
}

// Any agent run that starts after an agent_end takes it back, and a
// compaction Pi does not retry after leaves the turn ended.
func TestOnlyTheLastAgentRunEndsTheTurn(t *testing.T) {
	stream := &pi.Stream{}
	reduce(stream, stopped, agentEnd, `{"type":"agent_start"}`)
	if turn := stream.Reconcile(clean, false); turn.Status != run.Lost || turn.Error.Class != run.ClassNoResult {
		t.Fatalf("another agent run: turn = %+v", turn)
	}
	stream = &pi.Stream{}
	reduce(stream, stopped, agentEnd,
		`{"type":"compaction_start","reason":"threshold"}`,
		`{"type":"compaction_end","reason":"threshold","result":{"summary":"So far.","usage":{"input":1,"output":1,"cacheRead":0,"cacheWrite":0,"cost":{"total":0.5}}},"aborted":false,"willRetry":false}`,
	)
	if turn := stream.Reconcile(clean, false); turn.Status != run.Completed {
		t.Fatalf("compacted after the end: turn = %+v", turn)
	}
}

// What an automatic compaction's summary cost is the turn's too: usage and
// cost are summed over the assistant messages and the compaction.
func TestCompactionUsageAndCostAreCounted(t *testing.T) {
	stream := &pi.Stream{}
	reduce(stream, `{"type":"agent_start"}`, overflowed, agentEnd, recovering, `{"type":"agent_start"}`, stopped, agentEnd)
	turn := stream.Reconcile(clean, true)
	if turn.Status != run.Completed {
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
	if turn := stream.Reconcile(clean, false); turn.Status != run.Completed || turn.Usage != nil || turn.CostUSD != nil {
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
		if turn := stream.Reconcile(clean, false); turn.Status != run.Completed || turn.CostUSD == nil || *turn.CostUSD != 0.25 || *turn.Usage.InputTokens != 10 {
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
	if len(tools) != 1 || *tools[0].Started != (app.ToolCall{ID: "c1", Name: "bash", Input: input, Command: true}) {
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
		if turn := stream.Reconcile(clean, false); turn.Status != run.Completed || turn.Text != final {
			t.Errorf("%s: turn = %+v", name, turn)
		}
	}
}

// A process that could not be recorded fails the turn, whatever the stream
// says: it was killed, and nothing it reported can be trusted to be whole.
func TestUnrecordedProcessFailsTheTurnWhateverTheStreamSays(t *testing.T) {
	stream := &pi.Stream{}
	reduce(stream, stopped, agentEnd)
	turn := stream.Reconcile(supervisor.Evidence{RecordError: "disk full"}, false)
	if turn.Status != run.Failed || turn.Error == nil || turn.Error.Class != run.ClassInternal || !strings.Contains(turn.Error.Message, "disk full") {
		t.Fatalf("turn = %+v", turn)
	}
}
