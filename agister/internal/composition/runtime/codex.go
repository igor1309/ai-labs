package runtime

import (
	"context"
	"path/filepath"

	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/codex"
	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
	"github.com/igor1309/ai-labs/gokit/supervisor"
)

// CodexSupervisor is the process dependency this transport consumes.
type CodexSupervisor interface {
	Run(context.Context, supervisor.Spec, supervisor.Sink, func(string)) supervisor.Evidence
	Version(context.Context, string) (string, error)
}

// CodexTransport translates the wrapper's CLI dependency to the supervisor.
type CodexTransport struct{ Supervisor CodexSupervisor }

func (t CodexTransport) Run(ctx context.Context, spec codex.Spec, sink codex.Sink, onLine func(string)) codex.Evidence {
	e := t.Supervisor.Run(ctx, supervisor.Spec{Command: spec.Command, Args: spec.Args, Dir: spec.Dir, Env: spec.Env, Stdin: spec.Stdin, Timeout: spec.Timeout, KillGrace: spec.KillGrace}, supervisorSink{sink}, onLine)
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
	Admit(codex.TurnRequest) *codex.Error
}
type codexRunner struct{ wrapper Codex }

func AdaptCodex(wrapper Codex) app.TurnRunner { return codexRunner{wrapper} }
func (r codexRunner) Identity(ctx context.Context) (app.RuntimeIdentity, error) {
	identity, err := r.wrapper.Identity(ctx)
	return app.RuntimeIdentity(identity), err
}

// Admit asks the wrapper whether it can run a first turn carrying start.
func (r codexRunner) Admit(start app.TurnStart) *run.Error {
	fault := r.wrapper.Admit(CodexRequest(app.TurnRequest{ResumeSessionID: start.ResumeSessionID, Skills: start.Skills}))
	if fault == nil {
		return nil
	}
	return &run.Error{Class: run.Class(fault.Class), Message: fault.Message}
}

type codexSink struct{ app.EventSink }

func (s codexSink) ToolStarted(tool codex.ToolCall) { s.EventSink.ToolStarted(app.ToolCall(tool)) }
func (r codexRunner) RunTurn(ctx context.Context, request app.TurnRequest, sink app.EventSink) run.Turn {
	return CodexResult(r.wrapper.RunTurn(ctx, CodexRequest(request), codexSink{sink}))
}

// CodexRequest translates the application's turn request to the wrapper's,
// its skills in order.
func CodexRequest(r app.TurnRequest) codex.TurnRequest {
	request := codex.TurnRequest{Prompt: r.Prompt, Instruction: r.Instruction, Cwd: r.Cwd, ResumeSessionID: r.ResumeSessionID, MaxCostUSD: r.MaxCostUSD, Model: r.Model, Effort: r.Effort, Primitives: r.Primitives, Timeout: r.Timeout, OutputSchema: r.OutputSchema}
	for _, skill := range r.Skills {
		request.Skills = append(request.Skills, codex.Skill{Name: skill.Name, Bytes: skill.Bytes})
	}
	return request
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

// NewCodex is the Codex runner of command, run with its ccusage lookups on
// the process supervisor given, keeping the homes of threads given skills
// under homes and linking them to the user's CODEX_HOME, as userHome
// tells it.
func NewCodex(command, homes string, userHome func() (string, error), processes CodexSupervisor) app.TurnRunner {
	runner := codex.New(command, CodexTransport{Supervisor: processes})
	runner.Homes, runner.UserHome = homes, userHome
	return AdaptCodex(runner)
}

// CodexHome tells the user's CODEX_HOME: $CODEX_HOME when it is set, else
// .codex in the user's home.
func CodexHome(getenv func(string) string, userHome func() (string, error)) func() (string, error) {
	return func() (string, error) {
		if home := getenv("CODEX_HOME"); home != "" {
			return home, nil
		}
		home, err := userHome()
		if err != nil {
			return "", err
		}
		return filepath.Join(home, ".codex"), nil
	}
}
