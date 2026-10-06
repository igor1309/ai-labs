package runtime

import (
	"context"
	"errors"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/codex"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/runtimetest"
	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
	"github.com/igor1309/ai-labs/gokit/supervisor"
	"reflect"
	"testing"
	"time"
)

type codexStandIn struct {
	request       codex.TurnRequest
	result        codex.Turn
	identity      codex.RuntimeIdentity
	identityError error
	ctx           context.Context
	recordError   error
	admitted      codex.TurnRequest
	refusal       *codex.Error
}

func (s *codexStandIn) Admit(r codex.TurnRequest) *codex.Error {
	s.admitted = r
	return s.refusal
}

func (s *codexStandIn) Identity(ctx context.Context) (codex.RuntimeIdentity, error) {
	s.ctx = ctx
	return s.identity, s.identityError
}
func (s *codexStandIn) RunTurn(ctx context.Context, r codex.TurnRequest, sink codex.EventSink) codex.Turn {
	s.ctx = ctx
	s.request = r
	sink.Event("protocol", "TOOL_REQUESTED", map[string]any{"tool_use_id": "id", "input": "full"})
	sink.ToolStarted(codex.ToolCall{ID: "id", Name: "bash", Input: "full", Command: true})
	sink.ToolFinished(codex.ToolResult{ID: "id", Output: "done", Reported: true})
	sink.Raw("raw")
	s.recordError = sink.ProcessStarted("pgid:42")
	return s.result
}
func TestCodexApplicationAdapter(t *testing.T) {
	t.Parallel()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	code := 7
	tokens := int64(10)
	cost := 0.25
	turns := 2
	runtimeMS := int64(75)
	refusal := errors.New("disk full")
	stub := &codexStandIn{result: codex.Turn{Status: codex.Failed, Error: &codex.Error{Class: codex.ClassRateLimited, Message: "quota"}, ProviderSessionID: "session", Model: "model", Output: []byte(`{"answer":1}`), Text: "answer", CostUSD: &cost, Usage: &codex.Usage{InputTokens: &tokens, OutputTokens: &tokens, CacheReadTokens: &tokens, CacheWriteTokens: &tokens, ReasoningTokens: &tokens}, RuntimeMS: &runtimeMS, NumTurns: &turns, PermissionDenials: 3, Exit: &codex.Exit{Code: &code, Signal: "signal"}, StderrTail: "tail", StderrOmitted: 55, Session: &codex.SessionTotals{CostUSD: &cost, Usage: &codex.Usage{InputTokens: &tokens, OutputTokens: &tokens, CacheReadTokens: &tokens, CacheWriteTokens: &tokens, ReasoningTokens: &tokens}}}, identity: codex.RuntimeIdentity{Contract: "contract", Version: "1.2.3", Resume: true, ResumeWhereItRan: true, CostLimit: true, ToolCalls: true, SkillTools: []string{"skill"}, Skills: true}}
	adapter := AdaptCodex(stub)
	sink := &runtimetest.Recorder{ProcessErr: refusal}
	request := app.TurnRequest{Prompt: "prompt", Instruction: "instruction", Cwd: "/checkout", ResumeSessionID: "session", MaxCostUSD: &cost, Model: "model", Effort: "high", Primitives: []string{"read"}, Timeout: time.Minute, OutputSchema: []byte(`{"type":"object"}`), Skills: []app.TurnSkill{{Name: "review", Bytes: []byte("review")}, {Name: "style", Bytes: []byte("style")}}}
	got := adapter.RunTurn(ctx, request, sink)
	wantRequest := codex.TurnRequest{Prompt: "prompt", Instruction: "instruction", Cwd: "/checkout", ResumeSessionID: "session", MaxCostUSD: &cost, Model: "model", Effort: "high", Primitives: []string{"read"}, Timeout: time.Minute, OutputSchema: []byte(`{"type":"object"}`), Skills: []codex.Skill{{Name: "review", Bytes: []byte("review")}, {Name: "style", Bytes: []byte("style")}}}
	usage := &run.Usage{InputTokens: &tokens, OutputTokens: &tokens, CacheReadTokens: &tokens, CacheWriteTokens: &tokens, ReasoningTokens: &tokens}
	want := run.Turn{Status: run.Failed, Error: &run.Error{Class: run.ClassRateLimited, Message: "quota"}, ProviderSessionID: "session", Model: "model", Output: []byte(`{"answer":1}`), Text: "answer", CostUSD: &cost, Usage: usage, RuntimeMS: &runtimeMS, NumTurns: &turns, PermissionDenials: 3, Exit: &run.Exit{Code: &code, Signal: "signal"}, StderrTail: "tail", StderrOmitted: 55, Session: &run.SessionTotals{CostUSD: &cost, Usage: usage}}
	if stub.ctx != ctx || !reflect.DeepEqual(stub.request, wantRequest) || !reflect.DeepEqual(got, want) || stub.recordError != refusal {
		t.Fatalf("request %+v, result %+v, record error %v", stub.request, got, stub.recordError)
	}
	if !reflect.DeepEqual(sink.Trace, []string{"TOOL_REQUESTED id", "ToolStarted id", "ToolFinished id"}) || !reflect.DeepEqual(sink.Tools, []app.ToolCall{{ID: "id", Name: "bash", Input: "full", Command: true}}) || !reflect.DeepEqual(sink.Results, []app.ToolResult{{ID: "id", Output: "done", Reported: true}}) || !reflect.DeepEqual(sink.Lines, []string{"raw"}) || !reflect.DeepEqual(sink.Processes, []string{"pgid:42"}) || !reflect.DeepEqual(sink.Events[0].Data, map[string]any{"tool_use_id": "id", "input": "full"}) || sink.Events[0].Source != "protocol" {
		t.Fatalf("sink %+v", sink)
	}
	identity, err := adapter.Identity(ctx)
	wantIdentity := app.RuntimeIdentity{Contract: "contract", Version: "1.2.3", Resume: true, ResumeWhereItRan: true, CostLimit: true, ToolCalls: true, SkillTools: []string{"skill"}, Skills: true}
	if err != nil || !reflect.DeepEqual(identity, wantIdentity) || stub.ctx != ctx {
		t.Fatalf("identity %+v, err %v", identity, err)
	}
	stub.identity = codex.RuntimeIdentity{}
	stub.identityError = refusal
	if identity, err := adapter.Identity(ctx); identity.Contract != "" || err != refusal {
		t.Fatalf("identity %+v, err %v", identity, err)
	}
	stub.result = codex.Turn{Status: codex.Completed}
	if got := adapter.RunTurn(ctx, request, sink); !reflect.DeepEqual(got, run.Turn{Status: run.Completed}) {
		t.Fatalf("absent optional data became %+v", got)
	}
	for _, fault := range []struct{ status, class string }{{"failed", "runtime_unavailable"}, {"interrupted", "timeout"}, {"interrupted", "cancelled"}, {"lost", "killed"}, {"lost", "no_result"}, {"failed", "internal"}, {"failed", "auth"}, {"failed", "context_overflow"}, {"failed", "invalid_output"}, {"failed", "budget_exhausted"}, {"failed", "runtime_error"}} {
		stub.result = codex.Turn{Status: codex.Status(fault.status), Error: &codex.Error{Class: codex.Class(fault.class), Message: "reason"}}
		got := adapter.RunTurn(ctx, request, sink)
		if string(got.Status) != fault.status || string(got.Error.Class) != fault.class || got.Error.Message != "reason" {
			t.Fatalf("failure %+v became %+v", fault, got)
		}
	}
}
func TestCodexSupervisorAdapter(t *testing.T) {
	t.Parallel()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	code := 7
	refusal := errors.New("record refused")
	sink := &runtimetest.Recorder{ProcessErr: refusal}
	var lines []string
	want := supervisor.Spec{Command: "/cli", Args: []string{"run", "--json"}, Dir: "/checkout", Env: []string{"CODEX_HOME=/homes/thread"}, Stdin: "prompt", Timeout: time.Minute, KillGrace: time.Second}
	transport := CodexTransport{Supervisor: supervisorStandIn{run: func(c context.Context, spec supervisor.Spec, s supervisor.Sink, onLine func(string)) supervisor.Evidence {
		if c != ctx || !reflect.DeepEqual(spec, want) {
			t.Fatalf("spec %+v", spec)
		}
		s.Event("process", "PROCESS_STARTED", map[string]any{"pid": 42})
		s.Raw("raw")
		if err := s.ProcessStarted("pgid:42"); err != refusal {
			t.Fatalf("record error %v", err)
		}
		onLine("line")
		return supervisor.Evidence{Exit: &supervisor.Exit{Code: &code, Signal: "signal"}, SpawnError: "spawn", TimedOut: true, Aborted: true, StderrTail: "tail", StderrOmitted: 123, RecordError: "record"}
	}, version: func(c context.Context, command string) (string, error) {
		if c != ctx || command != "/cli" {
			t.Fatalf("version command %q", command)
		}
		return "1.2.3", refusal
	}}}
	spec := codex.Spec{Command: "/cli", Args: []string{"run", "--json"}, Dir: "/checkout", Env: []string{"CODEX_HOME=/homes/thread"}, Stdin: "prompt", Timeout: time.Minute, KillGrace: time.Second}
	got := transport.Run(ctx, spec, sink, func(line string) { lines = append(lines, line) })
	expected := codex.Evidence{Exit: &codex.Exit{Code: &code, Signal: "signal"}, SpawnError: "spawn", TimedOut: true, Aborted: true, StderrTail: "tail", StderrOmitted: 123, RecordError: "record"}
	if !reflect.DeepEqual(got, expected) || !reflect.DeepEqual(lines, []string{"line"}) || !reflect.DeepEqual(sink.Lines, []string{"raw"}) || !reflect.DeepEqual(sink.Processes, []string{"pgid:42"}) || !reflect.DeepEqual(sink.Kinds(), []string{"PROCESS_STARTED"}) {
		t.Fatalf("evidence %+v, sink %+v, lines %v", got, sink, lines)
	}
	if out, err := transport.Version(ctx, "/cli"); out != "1.2.3" || err != refusal {
		t.Fatalf("version %q, error %v", out, err)
	}
	empty := CodexTransport{Supervisor: supervisorStandIn{run: func(context.Context, supervisor.Spec, supervisor.Sink, func(string)) supervisor.Evidence {
		return supervisor.Evidence{}
	}}}
	if e := empty.Run(ctx, codex.Spec{}, sink, func(string) {}); !reflect.DeepEqual(e, codex.Evidence{}) {
		t.Fatalf("empty evidence %+v", e)
	}
}

// The user's CODEX_HOME is $CODEX_HOME when it is set, else .codex in the
// user's home.
func TestCodexHomeIsTheEnvironmentsOrInTheUsersHome(t *testing.T) {
	t.Parallel()
	userHome := func() (string, error) { return "/users/me", nil }
	for name, c := range map[string]struct {
		env      string
		userHome func() (string, error)
		want     string
		err      bool
	}{
		"set":          {"/elsewhere/codex", func() (string, error) { return "", errors.New("unused") }, "/elsewhere/codex", false},
		"unset":        {"", userHome, "/users/me/.codex", false},
		"no user home": {"", func() (string, error) { return "", errors.New("$HOME is not defined") }, "", true},
	} {
		getenv := func(key string) string {
			if key == "CODEX_HOME" {
				return c.env
			}
			return "/wrong"
		}
		home, err := CodexHome(getenv, c.userHome)()
		if home != c.want || (err != nil) != c.err {
			t.Errorf("%s: home %q, err %v", name, home, err)
		}
	}
}

// The Codex adapter puts a first turn to the wrapper as a request that
// resumes its session with its skills, and the wrapper's fault is the
// call's, translated.
func TestCodexAdmitsAsTheWrapperDoes(t *testing.T) {
	t.Parallel()
	stub := &codexStandIn{}
	adapter := AdaptCodex(stub)
	start := app.TurnStart{ResumeSessionID: "thread", Skills: []app.TurnSkill{{Name: "review", Bytes: []byte("review")}}}
	if fault := adapter.Admit(start); fault != nil {
		t.Fatalf("admit = %+v", fault)
	}
	if want := (codex.TurnRequest{ResumeSessionID: "thread", Skills: []codex.Skill{{Name: "review", Bytes: []byte("review")}}}); !reflect.DeepEqual(stub.admitted, want) {
		t.Fatalf("admitted %+v", stub.admitted)
	}
	stub.refusal = &codex.Error{Class: codex.ClassRefused, Message: "thread ran in the user's CODEX_HOME"}
	if fault := adapter.Admit(start); !reflect.DeepEqual(fault, &run.Error{Class: run.ClassRefused, Message: "thread ran in the user's CODEX_HOME"}) {
		t.Fatalf("admit = %+v", fault)
	}
}

// Claude Code, Pi and OpenCode can run any first turn: a resumed session
// with skills is admitted.
func TestEveryOtherRuntimeAdmitsAnyFirstTurn(t *testing.T) {
	t.Parallel()
	start := app.TurnStart{ResumeSessionID: "session", Skills: []app.TurnSkill{{Name: "review", Bytes: []byte("review")}}}
	for name, adapter := range map[string]app.TurnRunner{
		"claude-code": AdaptClaudeCode(&claudecodeStandIn{}), "pi": AdaptPi(&piStandIn{}), "opencode": AdaptOpenCode(&opencodeStandIn{}),
	} {
		if fault := adapter.Admit(start); fault != nil {
			t.Fatalf("%s: admit = %+v", name, fault)
		}
	}
}
