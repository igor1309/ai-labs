// Package logging provides diagnostics as decorators around ports. A
// decorator observes and never changes arguments, results or errors.
// Correlation fields placed in the context by the core (run ID, process)
// are attached to every line.
package logging

import (
	"context"
	"log/slog"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

// Handler adds the context's correlation fields to every record.
type Handler struct{ slog.Handler }

func (h Handler) Handle(ctx context.Context, record slog.Record) error {
	record.Add(app.Correlation(ctx)...)
	return h.Handler.Handle(ctx, record)
}

func (h Handler) WithAttrs(attrs []slog.Attr) slog.Handler {
	return Handler{h.Handler.WithAttrs(attrs)}
}
func (h Handler) WithGroup(name string) slog.Handler { return Handler{h.Handler.WithGroup(name)} }

// Fanout sends records to every handler that is enabled for them.
type Fanout []slog.Handler

func (f Fanout) Enabled(ctx context.Context, level slog.Level) bool {
	for _, h := range f {
		if h.Enabled(ctx, level) {
			return true
		}
	}
	return false
}

func (f Fanout) Handle(ctx context.Context, record slog.Record) error {
	for _, h := range f {
		if h.Enabled(ctx, record.Level) {
			_ = h.Handle(ctx, record.Clone())
		}
	}
	return nil
}

func (f Fanout) WithAttrs(attrs []slog.Attr) slog.Handler {
	out := make(Fanout, len(f))
	for i, h := range f {
		out[i] = h.WithAttrs(attrs)
	}
	return out
}

func (f Fanout) WithGroup(name string) slog.Handler {
	out := make(Fanout, len(f))
	for i, h := range f {
		out[i] = h.WithGroup(name)
	}
	return out
}

var warnEvents = map[string]bool{
	"PROVIDER_ERROR": true, "PROVIDER_RETRY": true, "RATE_LIMITED": true, "STREAM_PARSE_ERROR": true,
	"SESSION_ID_MISMATCH": true, "TIMEOUT": true, "SPAWN_FAILED": true,
}

// Runner logs a runtime runner's turns. What a turn did, its turn.*
// records, is the run's: its record and events hold it, and it goes to
// turns, never to log. The log gets what no run's record holds: a runtime
// that cannot be identified or does not admit a turn, before there is a run
// to record it in, and a process the run could not record. A turn's wall
// time is read on clock.
type Runner struct {
	inner   app.TurnRunner
	adapter string
	log     *slog.Logger
	turns   *slog.Logger
	clock   Clock
}

// Clock is what the runner reads the time on.
type Clock interface{ Now() time.Time }

// NewRunner is inner, the runner of adapter, logged: log gets what no
// run's record holds and turns the turn.* records, which nobody reads when
// turns discards them. Every one of them is required: a runner missing one
// is not built.
func NewRunner(inner app.TurnRunner, adapter string, log, turns *slog.Logger, clock Clock) Runner {
	switch {
	case inner == nil:
		panic("logging.NewRunner: no runner")
	case log == nil:
		panic("logging.NewRunner: no log")
	case turns == nil:
		panic("logging.NewRunner: no turns")
	case clock == nil:
		panic("logging.NewRunner: no clock")
	}
	return Runner{inner: inner, adapter: adapter, log: log, turns: turns, clock: clock}
}

func (r Runner) Identity(ctx context.Context) (app.RuntimeIdentity, error) {
	identity, err := r.inner.Identity(ctx)
	if err != nil {
		r.log.WarnContext(ctx, "runtime.identity_failed", "adapter", r.adapter, "error", err.Error())
	}
	return identity, err
}

func (r Runner) Admit(start app.TurnStart) *run.Error {
	fault := r.inner.Admit(start)
	if fault != nil {
		r.log.Warn("runtime.not_admitted", "adapter", r.adapter, "error", fault.String())
	}
	return fault
}

func (r Runner) RunTurn(ctx context.Context, request app.TurnRequest, sink app.EventSink) run.Turn {
	started := r.clock.Now()
	r.turns.InfoContext(ctx, "turn.started",
		"adapter", r.adapter, "cwd", request.Cwd, "model", request.Model, "effort", request.Effort,
		"primitives", request.Primitives, "timeout", request.Timeout.String(),
		"output_schema", len(request.OutputSchema) > 0, "prompt_chars", len(request.Prompt))
	counting := &countingSink{inner: sink, counts: map[string]int{}, log: r.log, turns: r.turns, ctx: ctx, adapter: r.adapter}
	turn := r.inner.RunTurn(ctx, request, counting)
	level := slog.LevelInfo
	fault := ""
	if turn.Status != run.Completed {
		level = slog.LevelWarn
		if turn.Error != nil {
			fault = turn.Error.String()
		}
	}
	r.turns.Log(ctx, level, "turn.finished",
		"adapter", r.adapter, "status", string(turn.Status), "error", fault,
		"provider_session_id", turn.ProviderSessionID, "wall", r.clock.Now().Sub(started).String(), "events", counting.counts)
	return turn
}

type countingSink struct {
	inner   app.EventSink
	counts  map[string]int
	log     *slog.Logger
	turns   *slog.Logger
	ctx     context.Context
	adapter string
}

func (s *countingSink) Event(source, kind string, data map[string]any) {
	s.counts[kind]++
	if warnEvents[kind] {
		s.turns.WarnContext(s.ctx, "turn.event", "adapter", s.adapter, "kind", kind, "source", source, "data", data)
	} else {
		s.turns.DebugContext(s.ctx, "turn.event", "adapter", s.adapter, "kind", kind, "source", source)
	}
	s.inner.Event(source, kind, data)
}

func (s *countingSink) ProcessStarted(ref string) error {
	err := s.inner.ProcessStarted(ref)
	if err != nil {
		s.log.WarnContext(s.ctx, "runtime.process_not_recorded", "adapter", s.adapter, "error", err.Error())
	}
	return err
}

func (s *countingSink) ToolStarted(call app.ToolCall) { s.inner.ToolStarted(call) }

func (s *countingSink) ToolFinished(result app.ToolResult) { s.inner.ToolFinished(result) }

func (s *countingSink) PermissionDenied(denial app.PermissionDenial) {
	s.inner.PermissionDenied(denial)
}

func (s *countingSink) Raw(line string) { s.inner.Raw(line) }
