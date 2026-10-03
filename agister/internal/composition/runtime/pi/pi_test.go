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
	"github.com/igor1309/ai-labs/agister/internal/app"
	composition "github.com/igor1309/ai-labs/agister/internal/composition/runtime"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"

	// fresh is the session the fake starts.
	"github.com/igor1309/ai-labs/gokit/clocktest"
	supervisor "github.com/igor1309/ai-labs/gokit/supervisor"
)

// The fake this package builds is removed when its tests end.
func TestMain(m *testing.M) { os.Exit(runtimetest.Run(m)) }

// fake is the command the in-process starter runs the fake Pi by.
const fake = "pi"

// stillSupervisor is the real supervisor over the fakes run in process,
// with its waits on a manual clock that nothing advances: no turn or
// lookup times out unless a test advances a clock of its own, and no grace
// passes.
func stillSupervisor() supervisor.Runtime {
	return stillOver(runtimetest.InProcess{})
}

// stillOver is stillSupervisor starting through starter.
func stillOver(starter runtimetest.InProcess) supervisor.Runtime {
	return supervisor.Runtime{Starter: starter, Timer: clocktest.NewClock(time.Date(2026, 10, 3, 12, 0, 0, 0, time.UTC)).Timer}
}

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
//
// Contract test: the Pi adapter against its built fake, a real process
// under the real supervisor.
func TestConformance(t *testing.T) {
	t.Parallel()
	clock := clocktest.NewClock(time.Date(2026, 10, 3, 12, 0, 0, 0, time.UTC))
	root, cwd := t.TempDir(), t.TempDir()
	session(t, root, "7d1c2a4e-0000-4000-8000-000000000001", cwd)
	runtimetest.Conformance(t, runtimetest.Subject{
		New: func(command string) app.TurnRunner {
			return composition.AdaptPi(&pi.Runner{Transport: composition.PiTransport{Supervisor: supervisor.Runtime{Timer: clock.Timer}}, Command: command, Sessions: root})
		},
		Clock:     clock,
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

// A skill is used by reading it, and Pi reads with read or bash only: a
// turn granted neither is refused before Pi starts, so --no-tools, with
// which Pi leaves skills out, is never passed.
func TestRefusesATurnThatCannotReadASkill(t *testing.T) {
	t.Parallel()
	for _, primitives := range [][]string{nil, {}, {"grep", "find", "ls"}, {"edit", "write"}} {
		r := request("x")
		r.Primitives = primitives
		if args, err := pi.Arguments(pi.TurnRequest(r), "/s", ""); err == nil || err.Error() != "pi/1 needs read or bash to use the repository's skills (ADR-006)" {
			t.Errorf("primitives %q: args %q, err = %v", primitives, args, err)
		}
	}
	for _, primitives := range [][]string{{"read"}, {"bash"}, {"grep", "read"}, {"ls", "bash"}} {
		r := request("x")
		r.Primitives = primitives
		if args, err := pi.Arguments(pi.TurnRequest(r), "/s", ""); err != nil || slices.Contains(args, "--no-tools") || !follows(args, "--tools", strings.Join(primitives, ",")) {
			t.Errorf("primitives %q: args %q, err = %v", primitives, args, err)
		}
	}
	root := t.TempDir()
	r := request("x")
	r.Primitives = []string{"grep"}
	sink := &runtimetest.Recorder{}
	turn := composition.AdaptPi((&pi.Runner{Transport: composition.PiTransport{Supervisor: stillSupervisor()}, Command: fake, Sessions: root})).RunTurn(context.Background(), r, sink)
	if string(turn.Status) != string(run.Failed) || string(turn.Error.Class) != string(run.ClassInternal) || len(sink.Processes) != 0 {
		t.Fatalf("turn = %+v, processes %v", turn, sink.Processes)
	}
	if entries, _ := os.ReadDir(root); len(entries) != 0 {
		t.Fatalf("root holds %v", entries)
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
	t.Parallel()
	r := request("x")
	limit := 1.0
	r.MaxCostUSD = &limit
	if _, err := pi.Arguments(pi.TurnRequest(r), "/s", ""); err == nil || err.Error() != "pi/1 cannot limit cost" {
		t.Fatalf("cost limit: err = %v", err)
	}
	for _, primitives := range [][]string{{"Bash"}, {"read", "web_fetch"}, {""}} {
		r := request("x")
		r.Primitives = primitives
		if _, err := pi.Arguments(pi.TurnRequest(r), "/s", ""); err == nil || !strings.Contains(err.Error(), "pi/1 has no tool") {
			t.Errorf("primitives %q: err = %v", primitives, err)
		}
	}
	r = request("x")
	r.Effort = "extreme"
	if _, err := pi.Arguments(pi.TurnRequest(r), "/s", ""); err == nil {
		t.Fatal("an unknown thinking level was accepted")
	}
	// Refused before Pi starts.
	r = request("x")
	r.MaxCostUSD = &limit
	sink := &runtimetest.Recorder{}
	turn := composition.AdaptPi((&pi.Runner{Transport: composition.PiTransport{Supervisor: stillSupervisor()}, Command: fake, Sessions: t.TempDir()})).RunTurn(context.Background(), r, sink)
	if string(turn.Status) != string(run.Failed) || string(turn.Error.Class) != string(run.ClassInternal) || len(sink.Processes) != 0 {
		t.Fatalf("turn = %+v, processes %v", turn, sink.Processes)
	}
}

// The instruction and the schema the output must meet go in the system
// prompt, which the fake echoes, read from the file passed; the prompt
// goes on stdin.
func TestInstructionAndSchemaGoInTheSystemPrompt(t *testing.T) {
	t.Parallel()
	if got := pi.SystemPrompt(pi.TurnRequest(app.TurnRequest{Instruction: "Do the thing."})); got != "Do the thing." {
		t.Fatalf("instruction only: %q", got)
	}
	if got := pi.SystemPrompt(pi.TurnRequest(app.TurnRequest{})); got != "" {
		t.Fatalf("neither: %q", got)
	}
	runner := &pi.Runner{Transport: composition.PiTransport{Supervisor: stillSupervisor()}, Command: fake, Sessions: t.TempDir()}
	sink := &runtimetest.Recorder{}
	turn := composition.AdaptPi(runner).RunTurn(context.Background(), request("hello SCENARIO:approve"), sink)
	if string(turn.Status) != string(run.Completed) {
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
	t.Parallel()
	identity, err := pi.New(fake, t.TempDir(), composition.PiTransport{Supervisor: stillSupervisor()}).Identity(context.Background())
	want := pi.RuntimeIdentity{Contract: "pi/1", Version: "0.85.1", Resume: true, ResumeWhereItRan: true, ToolCalls: true, SkillTools: []string{"read", "bash"}}
	if err != nil || !reflect.DeepEqual(identity, want) {
		t.Fatalf("identity = %+v, %v", identity, err)
	}
}

// A fresh turn's session is kept under the root, named by the ID Pi
// reported, and a later turn of the call resumes it in place there. The
// root is a literal path: brackets in it are no pattern.
func TestSessionsAreKeptForTheCallsLaterTurns(t *testing.T) {
	t.Parallel()
	root, cwd := filepath.Join(t.TempDir(), "sessions[1]"), t.TempDir()
	runner := &pi.Runner{Transport: composition.PiTransport{Supervisor: stillSupervisor()}, Command: fake, Sessions: root}
	first := request("SCENARIO:approve")
	first.Cwd = cwd
	sink := &runtimetest.Recorder{}
	turn := composition.AdaptPi(runner).RunTurn(context.Background(), first, sink)
	if string(turn.Status) != string(run.Completed) || turn.ProviderSessionID != fresh {
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
	turn = composition.AdaptPi(runner).RunTurn(context.Background(), next, sink)
	if string(turn.Status) != string(run.Completed) || turn.ProviderSessionID != fresh {
		t.Fatalf("resumed turn = %+v", turn)
	}
	if got := argAfter(t, sink, "--session-dir"); got != filepath.Join(root, fresh) || argAfter(t, sink, "--session") != fresh {
		t.Fatalf("resumed turn's session dir %s", got)
	}
}

// A turn that reported no session leaves nothing to resume behind.
func TestATurnWithoutASessionLeavesNoDirectory(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	runner := &pi.Runner{Transport: composition.PiTransport{Supervisor: stillSupervisor()}, Command: "/nonexistent/runtime", Sessions: root}
	if turn := composition.AdaptPi(runner).RunTurn(context.Background(), request("x"), &runtimetest.Recorder{}); string(turn.Status) != string(run.Failed) {
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
	t.Parallel()
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
		turn := composition.AdaptPi((&pi.Runner{Transport: composition.PiTransport{Supervisor: stillSupervisor()}, Command: fake, Sessions: root})).RunTurn(context.Background(), r, sink)
		if string(turn.Status) != string(run.Failed) || string(turn.Error.Class) != string(run.ClassRuntimeError) || !strings.Contains(turn.Error.Message, c.reason) || len(sink.Processes) != 0 {
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

// Usage and cost are the turn's own, summed over every message it ended,
// a failed attempt Pi retried and a tool's own model work included; the
// user's message counts nothing.
func TestUsageAndCostAreSummedOverTheTurn(t *testing.T) {
	t.Parallel()
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
	if string(turn.Status) != string(run.Completed) || turn.ProviderSessionID != "s-1" || turn.Model != "opencode-go/minimax-m3" || turn.Session != nil {
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
	if own := run.Own(composition.PiResult(turn), true); *own.CostUSD != 0.885 || *own.Usage.InputTokens != 1117 {
		t.Fatalf("own = %+v", own)
	}
}

const (
	overflowed = `{"type":"message_end","message":{"role":"assistant","content":[],"provider":"opencode-go","model":"minimax-m3","usage":{"input":0,"output":0,"cacheRead":0,"cacheWrite":0,"cost":{"total":0}},"stopReason":"error","errorMessage":"prompt is too long: 210000 tokens > 200000 maximum"}}`
	// The compaction of an overflow recovery: Pi retries the turn after it.
	recovering = `{"type":"compaction_end","reason":"overflow","result":{"summary":"So far.","firstKeptEntryId":"e1","tokensBefore":210000,"estimatedTokensAfter":32000,"usage":{"input":3000,"output":120,"cacheRead":30,"cacheWrite":10,"totalTokens":3160,"cost":{"total":0.5}},"details":{}},"aborted":false,"willRetry":true}`
)
