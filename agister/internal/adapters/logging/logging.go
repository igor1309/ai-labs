// Package logging provides diagnostics as decorators around ports. A
// decorator observes and never changes arguments, results or errors.
// Correlation fields placed in the context by the core (run ID, process)
// are attached to every line.
package logging

import (
	"context"
	"log/slog"

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

// Runner logs what no run's record holds of a runtime runner: a runtime
// that cannot be identified or does not admit a turn, before there is a run
// to record it in, and a process the run could not record. What a turn did
// is its run's, in its record and events, and is logged nowhere.
type Runner struct {
	Inner   app.TurnRunner
	Adapter string
	Log     *slog.Logger
}

func (r Runner) Identity(ctx context.Context) (app.RuntimeIdentity, error) {
	identity, err := r.Inner.Identity(ctx)
	if err != nil {
		r.Log.WarnContext(ctx, "runtime.identity_failed", "adapter", r.Adapter, "error", err.Error())
	}
	return identity, err
}

func (r Runner) Admit(start app.TurnStart) *run.Error {
	fault := r.Inner.Admit(start)
	if fault != nil {
		r.Log.Warn("runtime.not_admitted", "adapter", r.Adapter, "error", fault.String())
	}
	return fault
}

func (r Runner) RunTurn(ctx context.Context, request app.TurnRequest, sink app.EventSink) run.Turn {
	return r.Inner.RunTurn(ctx, request, &loggingSink{EventSink: sink, log: r.Log, ctx: ctx, adapter: r.Adapter})
}

// loggingSink is a turn's sink, a failure to record the process logged.
type loggingSink struct {
	app.EventSink
	log     *slog.Logger
	ctx     context.Context
	adapter string
}

func (s *loggingSink) ProcessStarted(ref string) error {
	err := s.EventSink.ProcessStarted(ref)
	if err != nil {
		s.log.WarnContext(s.ctx, "runtime.process_not_recorded", "adapter", s.adapter, "error", err.Error())
	}
	return err
}
