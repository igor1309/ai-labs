package runtime

import (
	"context"

	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/opencode"
	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
	"github.com/igor1309/ai-labs/gokit/supervisor"
)

// OpenCodeSupervisor is the process dependency this transport consumes.
type OpenCodeSupervisor interface {
	Run(context.Context, supervisor.Spec, supervisor.Sink, func(string)) supervisor.Evidence
	Version(context.Context, string) (string, error)
}

// OpenCodeTransport translates the wrapper's CLI dependency to the supervisor.
type OpenCodeTransport struct{ Supervisor OpenCodeSupervisor }

func (t OpenCodeTransport) Run(ctx context.Context, spec opencode.Spec, sink opencode.Sink, onLine func(string)) opencode.Evidence {
	e := t.Supervisor.Run(ctx, supervisor.Spec{Command: spec.Command, Args: spec.Args, Dir: spec.Dir, Env: spec.Env, Stdin: spec.Stdin, Timeout: spec.Timeout, KillGrace: spec.KillGrace}, supervisorSink{sink}, onLine)
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

// Admit admits every first turn: the runtime can run any it is given.
func (opencodeRunner) Admit(app.TurnStart) *run.Error { return nil }

type opencodeSink struct{ app.EventSink }

func (s opencodeSink) ToolStarted(tool opencode.ToolCall) {
	s.EventSink.ToolStarted(app.ToolCall{ID: tool.ID, Name: tool.Name, Input: tool.Input, Command: tool.Command})
}
func (s opencodeSink) ToolFinished(result opencode.ToolResult) {
	s.EventSink.ToolFinished(app.ToolResult(result))
}
func (r opencodeRunner) RunTurn(ctx context.Context, request app.TurnRequest, sink app.EventSink) run.Turn {
	return OpenCodeResult(r.wrapper.RunTurn(ctx, OpenCodeRequest(request), opencodeSink{sink}))
}

// OpenCodeRequest translates the application's turn request to the wrapper's,
// its skills in order.
func OpenCodeRequest(r app.TurnRequest) opencode.TurnRequest {
	request := opencode.TurnRequest{Prompt: r.Prompt, Instruction: r.Instruction, Cwd: r.Cwd, ResumeSessionID: r.ResumeSessionID, MaxCostUSD: r.MaxCostUSD, Model: r.Model, Effort: r.Effort, Primitives: r.Primitives, Timeout: r.Timeout, OutputSchema: r.OutputSchema}
	for _, skill := range r.Skills {
		request.Skills = append(request.Skills, opencode.Skill{Name: skill.Name, Bytes: skill.Bytes})
	}
	return request
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

// NewOpenCode is the OpenCode runner of command, run on the process
// supervisor given.
func NewOpenCode(command string, processes OpenCodeSupervisor) app.TurnRunner {
	return AdaptOpenCode(opencode.New(command, OpenCodeTransport{Supervisor: processes}))
}
