package logging_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/adapters/logging"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/claudecode"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/runtimetest"
	"github.com/igor1309/ai-labs/agister/internal/app"
	composition "github.com/igor1309/ai-labs/agister/internal/composition/runtime"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
	"github.com/igor1309/ai-labs/gokit/clocktest"
	"github.com/igor1309/ai-labs/gokit/supervisor"
	"github.com/igor1309/ai-labs/gokit/supervisor/supervisortest"
)

var start = time.Date(2026, 10, 3, 12, 0, 0, 0, time.UTC)

func request(prompt string) app.TurnRequest {
	return app.TurnRequest{Prompt: prompt, Primitives: []string{"Read"}, Timeout: time.Minute, OutputSchema: json.RawMessage(`{"type":"object"}`)}
}

// fake is the command the in-process starter runs the fake Claude Code by.
const fake = "claude"

// The decorator must be substitutable for what it wraps. Its claim is not
// the process: the fake runs in process.
func TestDecoratorConformance(t *testing.T) {
	t.Parallel()
	log := slog.New(slog.NewJSONHandler(&bytes.Buffer{}, nil))
	clock := clocktest.NewClock(start)
	runtimetest.Conformance(t, runtimetest.Subject{
		New: func(command string) app.TurnRunner {
			return logging.Runner{Inner: composition.NewClaudeCode(command, supervisor.Runtime{Starter: runtimetest.InProcess{Groups: supervisortest.NewGroups()}, Timer: clock.Timer}), Adapter: "claude-code", Log: log, Clock: clock}
		},
		Fake:      fake,
		InProcess: true,
		Contract:  claudecode.Contract,
		ToolCalls: true,
		Request:   request,
		Clock:     clock,
	})
}

func TestLogsAreCorrelatedAndOmitPrompts(t *testing.T) {
	t.Parallel()
	var buffer, global bytes.Buffer
	turns := slog.New(logging.Handler{Handler: slog.NewJSONHandler(&buffer, &slog.HandlerOptions{Level: slog.LevelInfo})})
	log := slog.New(slog.NewJSONHandler(&global, &slog.HandlerOptions{Level: slog.LevelDebug}))
	clock := clocktest.NewClock(start)
	runner := logging.Runner{Inner: composition.NewClaudeCode(fake, supervisor.Runtime{Starter: runtimetest.InProcess{Groups: supervisortest.NewGroups()}, Timer: clock.Timer}), Adapter: "claude-code", Log: log, Turns: turns, Clock: clock}
	ctx := app.WithCorrelation(context.Background(), "run_id", "run-1", "process", "p")
	runner.RunTurn(ctx, request("secret prompt SCENARIO:approve"), &runtimetest.Recorder{})

	var messages []string
	for _, line := range strings.Split(strings.TrimSpace(buffer.String()), "\n") {
		var entry map[string]any
		if err := json.Unmarshal([]byte(line), &entry); err != nil {
			t.Fatal(err)
		}
		if entry["run_id"] != "run-1" || entry["process"] != "p" {
			t.Fatalf("uncorrelated line: %s", line)
		}
		messages = append(messages, entry["msg"].(string)+":"+stringOr(entry["kind"]))
	}
	want := "turn.started: turn.event:STREAM_PARSE_ERROR turn.finished:"
	if strings.Join(messages, " ") != want {
		t.Fatalf("messages = %v", messages)
	}
	if strings.Contains(buffer.String(), "secret prompt") {
		t.Fatal("prompt text was logged")
	}
	// What a turn did is its run's: none of it reaches the log, not even
	// the event that warns.
	if global.Len() != 0 {
		t.Fatalf("the log got %s", global.String())
	}
}

// failing is a runner whose turn fails.
type failing struct{ starter }

func (*failing) RunTurn(_ context.Context, _ app.TurnRequest, sink app.EventSink) run.Turn {
	sink.Event("runtime", "TIMEOUT", nil)
	return run.Turn{Status: run.Failed, Error: run.Fault(run.ClassRefused, "timed out")}
}

// A turn that fails is its run's too, and a runner given nobody to tell of
// its turns tells nobody.
func TestAFailedTurnStaysOutOfTheLog(t *testing.T) {
	t.Parallel()
	var global bytes.Buffer
	log := slog.New(slog.NewJSONHandler(&global, &slog.HandlerOptions{Level: slog.LevelDebug}))
	turn := logging.Runner{Inner: &failing{}, Adapter: "x", Log: log, Clock: clocktest.NewClock(start)}.RunTurn(context.Background(), request("p"), &runtimetest.Recorder{})
	if turn.Status != run.Failed || global.Len() != 0 {
		t.Fatalf("turn %+v, the log got %s", turn, global.String())
	}
}

func stringOr(value any) string {
	text, _ := value.(string)
	return text
}

// starter is a runner that only reports its process.
type starter struct{ got error }

func (*starter) Identity(context.Context) (app.RuntimeIdentity, error) {
	return app.RuntimeIdentity{}, nil
}

func (*starter) Admit(app.TurnStart) *run.Error { return nil }

func (s *starter) RunTurn(_ context.Context, _ app.TurnRequest, sink app.EventSink) run.Turn {
	s.got = sink.ProcessStarted("ref")
	return run.Turn{Status: run.Completed}
}

// teller is a runner that only reports a path written and a call denied.
type teller struct{ starter }

func (*teller) RunTurn(_ context.Context, _ app.TurnRequest, sink app.EventSink) run.Turn {
	sink.ToolStarted(app.ToolCall{ID: "t1", Name: "Edit", Writes: []string{"a.go"}})
	sink.PermissionDenied(app.PermissionDenial{Tool: "Bash", Input: "git push"})
	return run.Turn{Status: run.Completed}
}

// The decorator passes on what the runtime reports of the turn's trail:
// the paths a tool call writes and each tool call denied.
func TestTheTrailReachesTheSinkThroughTheDecorator(t *testing.T) {
	t.Parallel()
	log := slog.New(slog.NewJSONHandler(&bytes.Buffer{}, nil))
	sink := &runtimetest.Recorder{}
	logging.Runner{Inner: &teller{}, Adapter: "x", Log: log, Clock: clocktest.NewClock(start)}.RunTurn(context.Background(), request("p"), sink)
	if !reflect.DeepEqual(sink.Tools, []app.ToolCall{{ID: "t1", Name: "Edit", Writes: []string{"a.go"}}}) || !reflect.DeepEqual(sink.Denials, []app.PermissionDenial{{Tool: "Bash", Input: "git push"}}) {
		t.Fatalf("tools %+v, denials %+v", sink.Tools, sink.Denials)
	}
}

// The decorator never swallows a failure to record the process: the
// runtime must hear of it, and it is logged.
func TestFailureToRecordTheProcessReachesTheRuntime(t *testing.T) {
	t.Parallel()
	var buffer bytes.Buffer
	log := slog.New(slog.NewJSONHandler(&buffer, nil))
	inner := &starter{}
	failure := errors.New("disk full")
	logging.Runner{Inner: inner, Adapter: "x", Log: log}.RunTurn(context.Background(), request("p"), &runtimetest.Recorder{ProcessErr: failure})
	if !errors.Is(inner.got, failure) {
		t.Fatalf("the runtime heard %v", inner.got)
	}
	if !strings.Contains(buffer.String(), "disk full") || strings.Contains(buffer.String(), `"msg":"turn.`) {
		t.Fatalf("not logged: %s", buffer.String())
	}
}

// taking is a runner whose turn takes what it advances its clock by.
type taking struct {
	clock *clocktest.Clock
	takes time.Duration
}

func (taking) Identity(context.Context) (app.RuntimeIdentity, error) {
	return app.RuntimeIdentity{}, nil
}

func (taking) Admit(app.TurnStart) *run.Error { return nil }

func (r taking) RunTurn(context.Context, app.TurnRequest, app.EventSink) run.Turn {
	r.clock.Advance(r.takes)
	return run.Turn{Status: run.Completed}
}

// A turn's wall time is what passed on the runner's clock while it ran.
func TestTheWallTimeIsReadOnTheRunnersClock(t *testing.T) {
	t.Parallel()
	var buffer bytes.Buffer
	log := slog.New(slog.NewJSONHandler(&buffer, nil))
	clock := clocktest.NewClock(start)
	runner := logging.Runner{Inner: taking{clock: clock, takes: 90 * time.Second}, Adapter: "x", Turns: log, Clock: clock}
	runner.RunTurn(context.Background(), request("p"), &runtimetest.Recorder{})
	var finished map[string]any
	for _, line := range strings.Split(strings.TrimSpace(buffer.String()), "\n") {
		var entry map[string]any
		if err := json.Unmarshal([]byte(line), &entry); err != nil {
			t.Fatal(err)
		}
		if entry["msg"] == "turn.finished" {
			finished = entry
		}
	}
	if finished["wall"] != "1m30s" {
		t.Fatalf("turn.finished = %v", finished)
	}
}

// admitting is a runner that admits by its fault.
type admitting struct {
	starter
	fault *run.Error
	got   []app.TurnStart
}

func (r *admitting) Admit(start app.TurnStart) *run.Error {
	r.got = append(r.got, start)
	return r.fault
}

// The decorator hands a first turn to the runner as it is, returns its
// answer unchanged, and logs a fault.
func TestAdmitPassesThroughAndLogsAFault(t *testing.T) {
	t.Parallel()
	var buffer bytes.Buffer
	log := slog.New(slog.NewJSONHandler(&buffer, nil))
	inner := &admitting{}
	runner := logging.Runner{Inner: inner, Adapter: "x", Log: log}
	start := app.TurnStart{ResumeSessionID: "session", Skills: []app.TurnSkill{{Name: "review", Bytes: []byte("review")}}}
	if fault := runner.Admit(start); fault != nil || buffer.Len() != 0 {
		t.Fatalf("admit = %+v, log %s", fault, buffer.String())
	}
	inner.fault = run.Fault(run.ClassRefused, "no home")
	if fault := runner.Admit(start); fault != inner.fault || !strings.Contains(buffer.String(), "runtime.not_admitted") || !strings.Contains(buffer.String(), "no home") {
		t.Fatalf("admit = %+v, log %s", fault, buffer.String())
	}
	if len(inner.got) != 2 || inner.got[1].ResumeSessionID != "session" || inner.got[1].Skills[0].Name != "review" {
		t.Fatalf("the runner got %+v", inner.got)
	}
}
