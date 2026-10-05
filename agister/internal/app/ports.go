// Package app implements Agister's use cases over the interfaces each of
// them declares beside itself, with only the methods it calls. No interface
// is shared between components. What is left here is data that crosses
// them. It knows no concrete storage, runtime, workspace or diagnostics
// mechanism.
package app

import (
	"context"
	"encoding/json"
	"io/fs"
	"time"
)

// Examples are definitions shipped with Agister, laid out as kind/name.ext.
type Examples = fs.FS

// RuntimeIdentity is what a runtime adapter reports about itself.
type RuntimeIdentity struct {
	Contract string
	Version  string
	// A turn may resume an earlier provider session in place, by the
	// session ID the runtime reported for it; the session keeps that ID.
	Resume bool
	// A session resumes only in the working directory it ran in, so a
	// continuation that would work anywhere else is refused before its
	// workspace is made.
	ResumeWhereItRan bool
	// The runtime stops a turn that reaches a cost limit.
	CostLimit bool
	// The adapter reports the agent's tool calls as they start and finish
	// (EventSink.ToolStarted), which the staleness limits on tool calls need.
	ToolCalls bool
	// SkillTools are the primitives a call needs one of to use the
	// repository's skills, which are used by reading them (ADR-006); none
	// when the runtime reads them without a granted tool.
	SkillTools []string
	// The adapter gives a call the skills its settings name (ADR-021 rule
	// 6); on one that does not, a call that names a skill is refused before
	// its first turn.
	Skills bool
}

// ToolCall is a tool call the agent started, as the runtime adapter reports
// it, in no runtime's own format.
type ToolCall struct {
	// ID is the runtime's name for the call; its end is reported by it.
	ID   string
	Name string
	// Input is the whole input, the same text for the same input: two calls
	// are identical when their Name and Input are.
	Input string
	// Command is true when the tool runs a command.
	Command bool
}

// TurnRequest is one runtime turn, expressed in primitives, not permissions.
type TurnRequest struct {
	Prompt      string
	Instruction string
	Cwd         string
	// The provider session to resume in place, as the runtime reported it;
	// empty for a fresh one.
	ResumeSessionID string
	MaxCostUSD      *float64
	Model           string
	Effort          string
	Primitives      []string
	Timeout         time.Duration
	OutputSchema    json.RawMessage
}

// CommandRequest is one run of a process's verification command.
type CommandRequest struct {
	Command string // run as bash -c Command
	Dir     string
	Timeout time.Duration
	// NoOutput is how long the command may go without output before it is
	// stale; zero: no such limit.
	NoOutput time.Duration
	// Bound is how many bytes of the combined output are kept from each
	// end.
	Bound int
}

// CommandResult is how one run of a command ended. Whatever ended it, its
// process group is gone by then.
type CommandResult struct {
	ExitCode  *int   // unset when a signal ended it or it never ran
	Signal    string // the signal that ended it
	TimedOut  bool   // its timeout passed and its group was killed
	Cancelled bool   // the call was cancelled and its group was killed
	Stale     bool   // it produced no output for NoOutput and its group was killed
	// Error is why it could not run: it did not start, or its group could
	// not be recorded and was killed at once.
	Error string
	// The first and last Bound bytes of the combined stdout and stderr;
	// Tail starts after Head ends, so nothing is repeated.
	Head, Tail []byte
	Bytes      int64  // of the whole output
	SHA256     string // hex digest of the whole output
}

// InputSpec asks one input source for a value.
type InputSpec struct {
	Source string
	Args   map[string]string
	Params map[string]string
	Cwd    string
}

// Resolved is an immutable input value and its identity.
type Resolved struct {
	Value    any    // string or []string
	Identity string // commit, content digest, or the literal
	Revision bool   // Identity is a commit that can be checked out
}

// correlation carries identifying fields for diagnostics through context.
type correlationKey struct{}

// WithCorrelation adds key/value pairs that diagnostics attach to every
// line logged under ctx.
func WithCorrelation(ctx context.Context, keyValues ...any) context.Context {
	existing, _ := ctx.Value(correlationKey{}).([]any)
	return context.WithValue(ctx, correlationKey{}, append(append([]any(nil), existing...), keyValues...))
}

// Correlation returns the pairs added with WithCorrelation.
func Correlation(ctx context.Context) []any {
	values, _ := ctx.Value(correlationKey{}).([]any)
	return values
}
