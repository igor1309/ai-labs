package runtime

import (
	"context"
	"errors"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/opencode"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/runtimetest"
	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
	"github.com/igor1309/ai-labs/gokit/supervisor"
	"reflect"
	"testing"
	"time"
)

type opencodeStandIn struct {
	request       opencode.TurnRequest
	result        opencode.Turn
	identity      opencode.RuntimeIdentity
	identityError error
	ctx           context.Context
	recordError   error
}

func (s *opencodeStandIn) Identity(ctx context.Context) (opencode.RuntimeIdentity, error) {
	s.ctx = ctx
	return s.identity, s.identityError
}
func (s *opencodeStandIn) RunTurn(ctx context.Context, r opencode.TurnRequest, sink opencode.EventSink) opencode.Turn {
	s.ctx = ctx
	s.request = r
	sink.Event("protocol", "TOOL_REQUESTED", map[string]any{"tool_use_id": "id", "input": "full"})
	sink.ToolStarted(opencode.ToolCall{ID: "id", Name: "bash", Input: "full", Command: true})
	sink.ToolFinished("id")
	sink.Raw("raw")
	s.recordError = sink.ProcessStarted("pgid:42")
	return s.result
}
func TestOpenCodeApplicationAdapter(t *testing.T) {
	t.Parallel()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	code := 7
	tokens := int64(10)
	cost := 0.25
	turns := 2
	runtimeMS := int64(75)
	refusal := errors.New("disk full")
	stub := &opencodeStandIn{result: opencode.Turn{Status: opencode.Failed, Error: &opencode.Error{Class: opencode.ClassRateLimited, Message: "quota"}, ProviderSessionID: "session", Model: "model", Output: []byte(`{"answer":1}`), Text: "answer", CostUSD: &cost, Usage: &opencode.Usage{InputTokens: &tokens, OutputTokens: &tokens, CacheReadTokens: &tokens, CacheWriteTokens: &tokens, ReasoningTokens: &tokens}, RuntimeMS: &runtimeMS, NumTurns: &turns, PermissionDenials: 3, Exit: &opencode.Exit{Code: &code, Signal: "signal"}, StderrTail: "tail", StderrOmitted: 55, Session: &opencode.SessionTotals{CostUSD: &cost, Usage: &opencode.Usage{InputTokens: &tokens, OutputTokens: &tokens, CacheReadTokens: &tokens, CacheWriteTokens: &tokens, ReasoningTokens: &tokens}}}, identity: opencode.RuntimeIdentity{Contract: "contract", Version: "1.2.3", Resume: true, ResumeWhereItRan: true, CostLimit: true, ToolCalls: true, SkillTools: []string{"skill"}, Skills: true}}
	adapter := AdaptOpenCode(stub)
	sink := &runtimetest.Recorder{ProcessErr: refusal}
	request := app.TurnRequest{Prompt: "prompt", Instruction: "instruction", Cwd: "/checkout", ResumeSessionID: "session", MaxCostUSD: &cost, Model: "model", Effort: "high", Primitives: []string{"read"}, Timeout: time.Minute, OutputSchema: []byte(`{"type":"object"}`)}
	got := adapter.RunTurn(ctx, request, sink)
	wantRequest := opencode.TurnRequest{Prompt: "prompt", Instruction: "instruction", Cwd: "/checkout", ResumeSessionID: "session", MaxCostUSD: &cost, Model: "model", Effort: "high", Primitives: []string{"read"}, Timeout: time.Minute, OutputSchema: []byte(`{"type":"object"}`)}
	usage := &run.Usage{InputTokens: &tokens, OutputTokens: &tokens, CacheReadTokens: &tokens, CacheWriteTokens: &tokens, ReasoningTokens: &tokens}
	want := run.Turn{Status: run.Failed, Error: &run.Error{Class: run.ClassRateLimited, Message: "quota"}, ProviderSessionID: "session", Model: "model", Output: []byte(`{"answer":1}`), Text: "answer", CostUSD: &cost, Usage: usage, RuntimeMS: &runtimeMS, NumTurns: &turns, PermissionDenials: 3, Exit: &run.Exit{Code: &code, Signal: "signal"}, StderrTail: "tail", StderrOmitted: 55, Session: &run.SessionTotals{CostUSD: &cost, Usage: usage}}
	if stub.ctx != ctx || !reflect.DeepEqual(stub.request, wantRequest) || !reflect.DeepEqual(got, want) || stub.recordError != refusal {
		t.Fatalf("request %+v, result %+v, record error %v", stub.request, got, stub.recordError)
	}
	if !reflect.DeepEqual(sink.Trace, []string{"TOOL_REQUESTED id", "ToolStarted id", "ToolFinished id"}) || !reflect.DeepEqual(sink.Tools, []app.ToolCall{{ID: "id", Name: "bash", Input: "full", Command: true}}) || !reflect.DeepEqual(sink.Lines, []string{"raw"}) || !reflect.DeepEqual(sink.Processes, []string{"pgid:42"}) || !reflect.DeepEqual(sink.Events[0].Data, map[string]any{"tool_use_id": "id", "input": "full"}) || sink.Events[0].Source != "protocol" {
		t.Fatalf("sink %+v", sink)
	}
	identity, err := adapter.Identity(ctx)
	wantIdentity := app.RuntimeIdentity{Contract: "contract", Version: "1.2.3", Resume: true, ResumeWhereItRan: true, CostLimit: true, ToolCalls: true, SkillTools: []string{"skill"}, Skills: true}
	if err != nil || !reflect.DeepEqual(identity, wantIdentity) || stub.ctx != ctx {
		t.Fatalf("identity %+v, err %v", identity, err)
	}
	stub.identity = opencode.RuntimeIdentity{}
	stub.identityError = refusal
	if identity, err := adapter.Identity(ctx); identity.Contract != "" || err != refusal {
		t.Fatalf("identity %+v, err %v", identity, err)
	}
	stub.result = opencode.Turn{Status: opencode.Completed}
	if got := adapter.RunTurn(ctx, request, sink); !reflect.DeepEqual(got, run.Turn{Status: run.Completed}) {
		t.Fatalf("absent optional data became %+v", got)
	}
	for _, fault := range []struct{ status, class string }{{"failed", "runtime_unavailable"}, {"interrupted", "timeout"}, {"interrupted", "cancelled"}, {"lost", "killed"}, {"lost", "no_result"}, {"failed", "internal"}, {"failed", "auth"}, {"failed", "context_overflow"}, {"failed", "invalid_output"}, {"failed", "budget_exhausted"}, {"failed", "runtime_error"}} {
		stub.result = opencode.Turn{Status: opencode.Status(fault.status), Error: &opencode.Error{Class: opencode.Class(fault.class), Message: "reason"}}
		got := adapter.RunTurn(ctx, request, sink)
		if string(got.Status) != fault.status || string(got.Error.Class) != fault.class || got.Error.Message != "reason" {
			t.Fatalf("failure %+v became %+v", fault, got)
		}
	}
}
func TestOpenCodeSupervisorAdapter(t *testing.T) {
	t.Parallel()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	code := 7
	refusal := errors.New("record refused")
	sink := &runtimetest.Recorder{ProcessErr: refusal}
	var lines []string
	want := supervisor.Spec{Command: "/cli", Args: []string{"run", "--json"}, Dir: "/checkout", Stdin: "prompt", Timeout: time.Minute, KillGrace: time.Second}
	want.Env = []string{"KEY=value"}
	transport := OpenCodeTransport{Supervisor: supervisorStandIn{run: func(c context.Context, spec supervisor.Spec, s supervisor.Sink, onLine func(string)) supervisor.Evidence {
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
	spec := opencode.Spec{Command: "/cli", Args: []string{"run", "--json"}, Dir: "/checkout", Stdin: "prompt", Timeout: time.Minute, KillGrace: time.Second}
	spec.Env = []string{"KEY=value"}
	got := transport.Run(ctx, spec, sink, func(line string) { lines = append(lines, line) })
	expected := opencode.Evidence{Exit: &opencode.Exit{Code: &code, Signal: "signal"}, SpawnError: "spawn", TimedOut: true, Aborted: true, StderrTail: "tail", StderrOmitted: 123, RecordError: "record"}
	if !reflect.DeepEqual(got, expected) || !reflect.DeepEqual(lines, []string{"line"}) || !reflect.DeepEqual(sink.Lines, []string{"raw"}) || !reflect.DeepEqual(sink.Processes, []string{"pgid:42"}) || !reflect.DeepEqual(sink.Kinds(), []string{"PROCESS_STARTED"}) {
		t.Fatalf("evidence %+v, sink %+v, lines %v", got, sink, lines)
	}
	if out, err := transport.Version(ctx, "/cli"); out != "1.2.3" || err != refusal {
		t.Fatalf("version %q, error %v", out, err)
	}
	empty := OpenCodeTransport{Supervisor: supervisorStandIn{run: func(context.Context, supervisor.Spec, supervisor.Sink, func(string)) supervisor.Evidence {
		return supervisor.Evidence{}
	}}}
	if e := empty.Run(ctx, opencode.Spec{}, sink, func(string) {}); !reflect.DeepEqual(e, opencode.Evidence{}) {
		t.Fatalf("empty evidence %+v", e)
	}
}
