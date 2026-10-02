package runtime

import (
	"context"

	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/opencode"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/supervisor"
	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

// OpenCodeSupervisor is the process dependency this transport consumes.
type OpenCodeSupervisor interface {
	Run(context.Context, supervisor.Spec, supervisor.Sink, func(string)) supervisor.Evidence
	Version(context.Context, string) (string, error)
}

// OpenCodeTransport translates the wrapper's CLI dependency to the supervisor.
type OpenCodeTransport struct{ Supervisor OpenCodeSupervisor }

func (t OpenCodeTransport) Run(ctx context.Context, spec opencode.Spec, sink opencode.Sink, onLine func(string)) opencode.Evidence {
	e := t.Supervisor.Run(ctx, supervisor.Spec{Command: spec.Command, Args: spec.Args, Dir: spec.Dir, Env: spec.Env, Stdin: spec.Stdin, Timeout: spec.Timeout, KillGrace: spec.KillGrace}, sink, onLine)
	var exit *opencode.Exit
	if e.Exit != nil {
		exit = &opencode.Exit{Code: e.Exit.Code, Signal: e.Exit.Signal}
	}
	return opencode.Evidence{Exit: exit, SpawnError: e.SpawnError, TimedOut: e.TimedOut, Aborted: e.Aborted, StderrTail: e.StderrTail, StderrOmitted: e.StderrOmitted, RecordError: e.RecordError}
}
func (t OpenCodeTransport) Version(ctx context.Context, command string) (string, error) {
	return t.Supervisor.Version(ctx, command)
}

// OpenCode is the wrapper API consumed by the application adapter.
type OpenCode interface {
	RunTurn(context.Context, opencode.TurnRequest, opencode.EventSink) opencode.Turn
	Identity(context.Context) (opencode.RuntimeIdentity, error)
}
type opencodeRunner struct{ wrapper OpenCode }

func AdaptOpenCode(wrapper OpenCode) app.TurnRunner { return opencodeRunner{wrapper} }
func (r opencodeRunner) Identity(ctx context.Context) (app.RuntimeIdentity, error) {
	identity, err := r.wrapper.Identity(ctx)
	return app.RuntimeIdentity(identity), err
}

type opencodeSink struct{ app.EventSink }

func (s opencodeSink) ToolStarted(tool opencode.ToolCall) {
	s.EventSink.ToolStarted(app.ToolCall(tool))
}
func (r opencodeRunner) RunTurn(ctx context.Context, request app.TurnRequest, sink app.EventSink) run.Turn {
	return OpenCodeResult(r.wrapper.RunTurn(ctx, opencode.TurnRequest(request), opencodeSink{sink}))
}

// OpenCodeResult translates a wrapper's reported result to the application's domain.
func OpenCodeResult(t opencode.Turn) run.Turn {
	result := run.Turn{Status: run.Status(t.Status), ProviderSessionID: t.ProviderSessionID, Model: t.Model, Output: t.Output, Text: t.Text, CostUSD: t.CostUSD, RuntimeMS: t.RuntimeMS, NumTurns: t.NumTurns, PermissionDenials: t.PermissionDenials, StderrTail: t.StderrTail, StderrOmitted: t.StderrOmitted}
	if t.Error != nil {
		result.Error = &run.Error{Class: run.Class(t.Error.Class), Message: t.Error.Message}
	}
	if t.Exit != nil {
		result.Exit = &run.Exit{Code: t.Exit.Code, Signal: t.Exit.Signal}
	}
	if t.Usage != nil {
		result.Usage = &run.Usage{InputTokens: t.Usage.InputTokens, OutputTokens: t.Usage.OutputTokens, CacheReadTokens: t.Usage.CacheReadTokens, CacheWriteTokens: t.Usage.CacheWriteTokens, ReasoningTokens: t.Usage.ReasoningTokens}
	}
	if t.Session != nil {
		result.Session = &run.SessionTotals{CostUSD: t.Session.CostUSD}
		if t.Session.Usage != nil {
			u := t.Session.Usage
			result.Session.Usage = &run.Usage{InputTokens: u.InputTokens, OutputTokens: u.OutputTokens, CacheReadTokens: u.CacheReadTokens, CacheWriteTokens: u.CacheWriteTokens, ReasoningTokens: u.ReasoningTokens}
		}
	}
	return result
}
func NewOpenCode(command string) app.TurnRunner {
	return AdaptOpenCode(opencode.New(command, OpenCodeTransport{Supervisor: supervisor.Runtime{}}))
}
