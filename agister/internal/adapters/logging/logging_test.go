package logging_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"strings"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/adapters/logging"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/claudecode"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/runtimetest"
	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

func request(prompt string) app.TurnRequest {
	return app.TurnRequest{Prompt: prompt, Primitives: []string{"Read"}, Timeout: time.Minute, OutputSchema: json.RawMessage(`{"type":"object"}`)}
}

// The decorator must be substitutable for what it wraps.
func TestDecoratorConformance(t *testing.T) {
	log := slog.New(slog.NewJSONHandler(&bytes.Buffer{}, nil))
	runtimetest.Conformance(t, runtimetest.Subject{
		New: func(command string) app.TurnRunner {
			return logging.Runner{Inner: &claudecode.Runner{Command: command, KillGrace: 200 * time.Millisecond}, Adapter: "claude-code", Log: log}
		},
		Fake:      runtimetest.Binary(t, "fakeclaude"),
		Contract:  claudecode.Contract,
		ToolCalls: true,
		Request:   request,
	})
}

func TestLogsAreCorrelatedAndOmitPrompts(t *testing.T) {
	var buffer bytes.Buffer
	log := slog.New(logging.Handler{Handler: slog.NewJSONHandler(&buffer, &slog.HandlerOptions{Level: slog.LevelInfo})})
	runner := logging.Runner{Inner: claudecode.New(runtimetest.Binary(t, "fakeclaude")), Adapter: "claude-code", Log: log}
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

func (s *starter) RunTurn(_ context.Context, _ app.TurnRequest, sink app.EventSink) run.Turn {
	s.got = sink.ProcessStarted("ref")
	return run.Turn{Status: run.Completed}
}

// The decorator never swallows a failure to record the process: the
// runtime must hear of it, and it is logged.
func TestFailureToRecordTheProcessReachesTheRuntime(t *testing.T) {
	var buffer bytes.Buffer
	log := slog.New(slog.NewJSONHandler(&buffer, nil))
	inner := &starter{}
	failure := errors.New("disk full")
	logging.Runner{Inner: inner, Adapter: "x", Log: log}.RunTurn(context.Background(), request("p"), &runtimetest.Recorder{ProcessErr: failure})
	if !errors.Is(inner.got, failure) {
		t.Fatalf("the runtime heard %v", inner.got)
	}
	if !strings.Contains(buffer.String(), "disk full") {
		t.Fatalf("not logged: %s", buffer.String())
	}
}
