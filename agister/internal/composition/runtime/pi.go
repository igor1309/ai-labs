package runtime

import (
	"context"

	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/pi"
	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
	"github.com/igor1309/ai-labs/gokit/supervisor"
)

// PiSupervisor is the process dependency this transport consumes.
type PiSupervisor interface {
	Run(context.Context, supervisor.Spec, supervisor.Sink, func(string)) supervisor.Evidence
	Version(context.Context, string) (string, error)
}

// PiTransport translates the wrapper's CLI dependency to the supervisor.
type PiTransport struct{ Supervisor PiSupervisor }

func (t PiTransport) Run(ctx context.Context, spec pi.Spec, sink pi.Sink, onLine func(string)) pi.Evidence {
	e := t.Supervisor.Run(ctx, supervisor.Spec{Command: spec.Command, Args: spec.Args, Dir: spec.Dir, Stdin: spec.Stdin, Timeout: spec.Timeout, KillGrace: spec.KillGrace}, supervisorSink{sink}, onLine)
	var exit *pi.Exit
	if e.Exit != nil {
		exit = &pi.Exit{Code: e.Exit.Code, Signal: e.Exit.Signal}
	}
	return pi.Evidence{Exit: exit, SpawnError: e.SpawnError, TimedOut: e.TimedOut, Aborted: e.Aborted, StderrTail: e.StderrTail, StderrOmitted: e.StderrOmitted, RecordError: e.RecordError}
}
func (t PiTransport) Version(ctx context.Context, command string) (string, error) {
	return t.Supervisor.Version(ctx, command)
}

// Pi is the wrapper API consumed by the application adapter.
type Pi interface {
	RunTurn(context.Context, pi.TurnRequest, pi.EventSink) pi.Turn
	Identity(context.Context) (pi.RuntimeIdentity, error)
}
type piRunner struct{ wrapper Pi }

func AdaptPi(wrapper Pi) app.TurnRunner { return piRunner{wrapper} }
func (r piRunner) Identity(ctx context.Context) (app.RuntimeIdentity, error) {
	identity, err := r.wrapper.Identity(ctx)
	return app.RuntimeIdentity(identity), err
}

// Admit admits every first turn: the runtime can run any it is given.
func (piRunner) Admit(app.TurnStart) *run.Error { return nil }

type piSink struct{ app.EventSink }

func (s piSink) ToolStarted(tool pi.ToolCall) { s.EventSink.ToolStarted(app.ToolCall(tool)) }
func (r piRunner) RunTurn(ctx context.Context, request app.TurnRequest, sink app.EventSink) run.Turn {
	return PiResult(r.wrapper.RunTurn(ctx, PiRequest(request), piSink{sink}))
}

// PiRequest translates the application's turn request to the wrapper's,
// its skills in order.
func PiRequest(r app.TurnRequest) pi.TurnRequest {
	request := pi.TurnRequest{Prompt: r.Prompt, Instruction: r.Instruction, Cwd: r.Cwd, ResumeSessionID: r.ResumeSessionID, MaxCostUSD: r.MaxCostUSD, Model: r.Model, Effort: r.Effort, Primitives: r.Primitives, Timeout: r.Timeout, OutputSchema: r.OutputSchema}
	for _, skill := range r.Skills {
		request.Skills = append(request.Skills, pi.Skill{Name: skill.Name, Bytes: skill.Bytes})
	}
	return request
}

// PiResult translates a wrapper's reported result to the application's domain.
func PiResult(t pi.Turn) run.Turn {
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

// NewPi is the Pi runner of command, keeping its sessions in sessions, run
// on the process supervisor given.
func NewPi(command, sessions string, processes PiSupervisor) app.TurnRunner {
	return AdaptPi(pi.New(command, sessions, PiTransport{Supervisor: processes}))
}
