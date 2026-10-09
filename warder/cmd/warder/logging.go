package main

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"time"

	"github.com/igor1309/ai-labs/warder/internal/capture"
)

// newLogger is the logger of the decorators: text records on writer, at
// Debug when verbose and above it otherwise. The decorators log at Debug,
// so by default they write nothing.
func newLogger(writer io.Writer, verbose bool) *slog.Logger {
	level := slog.LevelInfo
	if verbose {
		level = slog.LevelDebug
	}
	return slog.New(slog.NewTextHandler(writer, &slog.HandlerOptions{Level: level}))
}

// sourceLog writes the records of one source's decorators through the
// logger it is given, timed by the clock it is given. The decorators
// share it; the components they wrap do not know it.
type sourceLog struct {
	logger *slog.Logger
	clock  clockFunc
	source string
}

// record writes one Debug record of an operation that began at began and
// has just ended with err: message, the source ID, attrs, the outcome, ok
// or the error, and the duration. The record carries the clock's time,
// not slog's: the clock is the only time the decorators read. A record
// that cannot be written has nowhere else to go, and is dropped.
func (l sourceLog) record(ctx context.Context, message string, began time.Time, err error, attrs ...slog.Attr) {
	handler := l.logger.Handler()
	if !handler.Enabled(ctx, slog.LevelDebug) {
		return
	}
	ended := l.clock()
	record := slog.NewRecord(ended, slog.LevelDebug, message, 0)
	record.AddAttrs(slog.String("source", l.source))
	record.AddAttrs(attrs...)
	if err != nil {
		record.AddAttrs(slog.String("outcome", "error"), slog.String("error", err.Error()))
	} else {
		record.AddAttrs(slog.String("outcome", "ok"))
	}
	record.AddAttrs(slog.Duration("duration", ended.Sub(began)))
	_ = handler.Handle(ctx, record)
}

// loggedExecute decorates a command execution, as the Claude Code
// adapter's executor: each command is executed as it is, and recorded
// with its name.
type loggedExecute struct {
	execute executeFunc
	log     sourceLog
}

// logExecute decorates execute. A missing execute stays missing, as a nil
// decorator, so the adapter rejects it as it would execute itself.
func logExecute(execute executeFunc, log sourceLog) *loggedExecute {
	if execute == nil {
		return nil
	}
	return &loggedExecute{execute: execute, log: log}
}

func (e *loggedExecute) Execute(ctx context.Context, name string, args ...string) ([]byte, error) {
	began := e.log.clock()
	stdout, err := e.execute(ctx, name, args...)
	e.log.record(ctx, "execute", began, err, slog.String("command", name))
	return stdout, err
}

// loggedReadAgents decorates the Claude Code read, as a capture's agent
// reader: each read is made as it is, and recorded.
type loggedReadAgents struct {
	read func(ctx context.Context) ([]capture.Agent, error)
	log  sourceLog
}

func (r loggedReadAgents) ReadAgents(ctx context.Context) ([]capture.Agent, error) {
	began := r.log.clock()
	agents, err := r.read(ctx)
	r.log.record(ctx, "read agents", began, err)
	return agents, err
}

// loggedCapture decorates a capture, as an attempt's capturer: each
// capture is made as it is, and recorded.
type loggedCapture struct {
	capture func(ctx context.Context) (capture.Observation, error)
	log     sourceLog
}

func (c loggedCapture) Capture(ctx context.Context) (capture.Observation, error) {
	began := c.log.clock()
	observation, err := c.capture(ctx)
	c.log.record(ctx, "capture", began, err)
	return observation, err
}

// loggedDeadline decorates a deadline, as an attempt's deadline: each
// limit is set as it is, and recorded when it is released, with the limit
// given and whether the limit ended the read.
type loggedDeadline struct {
	limit func(ctx context.Context) (limited context.Context, release func())
	// given is the limit the wrapped deadline sets, as recorded.
	given time.Duration
	log   sourceLog
}

// Limit returns the limited context as the wrapped deadline does, and a
// release that releases it, then records the limit. The limit ended the
// read when the limited context ended with context.DeadlineExceeded as its
// cause and ctx did not.
func (d loggedDeadline) Limit(ctx context.Context) (limited context.Context, release func()) {
	began := d.log.clock()
	limited, releaseLimit := d.limit(ctx)
	return limited, func() {
		releaseLimit()
		expired := errors.Is(context.Cause(limited), context.DeadlineExceeded) && !errors.Is(context.Cause(ctx), context.DeadlineExceeded)
		d.log.record(ctx, "deadline", began, nil, slog.Duration("limit", d.given), slog.Bool("expired", expired))
	}
}

// loggedPublish decorates a publish, as an attempt's publisher: each
// observation is published as it is, and the publish recorded.
type loggedPublish struct {
	publish func(observation capture.Observation) error
	log     sourceLog
}

func (p loggedPublish) Publish(observation capture.Observation) error {
	began := p.log.clock()
	err := p.publish(observation)
	p.log.record(context.Background(), "publish", began, err)
	return err
}

// loggedWait decorates a wait, as a loop's wait: each wait is waited as
// it is, and recorded with its interval.
type loggedWait struct {
	wait func(ctx context.Context, interval time.Duration) error
	log  sourceLog
}

func (w loggedWait) Wait(ctx context.Context, interval time.Duration) error {
	began := w.log.clock()
	err := w.wait(ctx, interval)
	w.log.record(ctx, "wait", began, err, slog.Duration("interval", interval))
	return err
}
