package runtime

import (
	"context"

	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/claudecode"
	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
	"github.com/igor1309/ai-labs/gokit/supervisor"
)

// ClaudeCodeSupervisor is the process dependency this transport consumes.
type ClaudeCodeSupervisor interface {
	Run(context.Context, supervisor.Spec, supervisor.Sink, func(string)) supervisor.Evidence
	Version(context.Context, string) (string, error)
}

// ClaudeCodeTransport translates the wrapper's CLI dependency to the supervisor.
type ClaudeCodeTransport struct{ Supervisor ClaudeCodeSupervisor }

func (t ClaudeCodeTransport) Run(ctx context.Context, spec claudecode.Spec, sink claudecode.Sink, onLine func(string)) claudecode.Evidence {
	e := t.Supervisor.Run(ctx, supervisor.Spec{Command: spec.Command, Args: spec.Args, Dir: spec.Dir, Stdin: spec.Stdin, Timeout: spec.Timeout, KillGrace: spec.KillGrace}, supervisorSink{sink}, onLine)
	var exit *claudecode.Exit
	if e.Exit != nil {
		exit = &claudecode.Exit{Code: e.Exit.Code, Signal: e.Exit.Signal}
	}
	return claudecode.Evidence{Exit: exit, SpawnError: e.SpawnError, TimedOut: e.TimedOut, Aborted: e.Aborted, StderrTail: e.StderrTail, StderrOmitted: e.StderrOmitted, RecordError: e.RecordError}
}
func (t ClaudeCodeTransport) Version(ctx context.Context, command string) (string, error) {
	return t.Supervisor.Version(ctx, command)
}

// ClaudeCode is the wrapper API consumed by the application adapter.
type ClaudeCode interface {
	RunTurn(context.Context, claudecode.TurnRequest, claudecode.EventSink) claudecode.Turn
	Identity(context.Context) (claudecode.RuntimeIdentity, error)
}
type claudecodeRunner struct{ wrapper ClaudeCode }

func AdaptClaudeCode(wrapper ClaudeCode) app.TurnRunner { return claudecodeRunner{wrapper} }
func (r claudecodeRunner) Identity(ctx context.Context) (app.RuntimeIdentity, error) {
	identity, err := r.wrapper.Identity(ctx)
	return app.RuntimeIdentity(identity), err
}

type claudecodeSink struct{ app.EventSink }

func (s claudecodeSink) ToolStarted(tool claudecode.ToolCall) {
	s.EventSink.ToolStarted(app.ToolCall(tool))
}
func (r claudecodeRunner) RunTurn(ctx context.Context, request app.TurnRequest, sink app.EventSink) run.Turn {
	return ClaudeCodeResult(r.wrapper.RunTurn(ctx, ClaudeCodeRequest(request), claudecodeSink{sink}))
}

// ClaudeCodeRequest translates the application's turn request to the wrapper's,
// its skills in order.
func ClaudeCodeRequest(r app.TurnRequest) claudecode.TurnRequest {
	request := claudecode.TurnRequest{Prompt: r.Prompt, Instruction: r.Instruction, Cwd: r.Cwd, ResumeSessionID: r.ResumeSessionID, MaxCostUSD: r.MaxCostUSD, Model: r.Model, Effort: r.Effort, Primitives: r.Primitives, Timeout: r.Timeout, OutputSchema: r.OutputSchema}
	for _, skill := range r.Skills {
		request.Skills = append(request.Skills, claudecode.Skill{Name: skill.Name, Bytes: skill.Bytes})
	}
	return request
}

// ClaudeCodeResult translates a wrapper's reported result to the application's domain.
func ClaudeCodeResult(t claudecode.Turn) run.Turn {
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

// NewClaudeCode is the Claude Code runner of command, run on the process
// supervisor given.
func NewClaudeCode(command string, processes ClaudeCodeSupervisor) app.TurnRunner {
	return AdaptClaudeCode(claudecode.New(command, ClaudeCodeTransport{Supervisor: processes}))
}
