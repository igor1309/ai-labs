package runtime

import (
	"context"

	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/codex"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/supervisor"
	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

// CodexSupervisor is the process dependency this transport consumes.
type CodexSupervisor interface {
	Run(context.Context, supervisor.Spec, supervisor.Sink, func(string)) supervisor.Evidence
	Version(context.Context, string) (string, error)
}

// CodexTransport translates the wrapper's CLI dependency to the supervisor.
type CodexTransport struct{ Supervisor CodexSupervisor }

func (t CodexTransport) Run(ctx context.Context, spec codex.Spec, sink codex.Sink, onLine func(string)) codex.Evidence {
	e := t.Supervisor.Run(ctx, supervisor.Spec{Command: spec.Command, Args: spec.Args, Dir: spec.Dir, Stdin: spec.Stdin, Timeout: spec.Timeout, KillGrace: spec.KillGrace}, sink, onLine)
	var exit *codex.Exit
	if e.Exit != nil {
		exit = &codex.Exit{Code: e.Exit.Code, Signal: e.Exit.Signal}
	}
	return codex.Evidence{Exit: exit, SpawnError: e.SpawnError, TimedOut: e.TimedOut, Aborted: e.Aborted, StderrTail: e.StderrTail, StderrOmitted: e.StderrOmitted, RecordError: e.RecordError}
}
func (t CodexTransport) Version(ctx context.Context, command string) (string, error) {
	return t.Supervisor.Version(ctx, command)
}

// Codex is the wrapper API consumed by the application adapter.
type Codex interface {
	RunTurn(context.Context, codex.TurnRequest, codex.EventSink) codex.Turn
	Identity(context.Context) (codex.RuntimeIdentity, error)
}
type codexRunner struct{ wrapper Codex }

func AdaptCodex(wrapper Codex) app.TurnRunner { return codexRunner{wrapper} }
func (r codexRunner) Identity(ctx context.Context) (app.RuntimeIdentity, error) {
	identity, err := r.wrapper.Identity(ctx)
	return app.RuntimeIdentity(identity), err
}

type codexSink struct{ app.EventSink }

func (s codexSink) ToolStarted(tool codex.ToolCall) { s.EventSink.ToolStarted(app.ToolCall(tool)) }
func (r codexRunner) RunTurn(ctx context.Context, request app.TurnRequest, sink app.EventSink) run.Turn {
	return CodexResult(r.wrapper.RunTurn(ctx, codex.TurnRequest(request), codexSink{sink}))
}

// CodexResult translates a wrapper's reported result to the application's domain.
func CodexResult(t codex.Turn) run.Turn {
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
func NewCodex(command string) app.TurnRunner {
	return AdaptCodex(codex.New(command, CodexTransport{Supervisor: supervisor.Runtime{}}))
}
