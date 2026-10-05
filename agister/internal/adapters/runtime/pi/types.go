package pi

import (
	"encoding/json"
	"fmt"
	"time"
)

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

// ToolCall describes a tool invocation reported by this CLI.
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

// TurnRequest asks this wrapper for one CLI turn.
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

type Status string

const (
	Completed   Status = "completed"
	Failed      Status = "failed"
	Interrupted Status = "interrupted"
	Lost        Status = "lost"
)

// Class describes why this CLI turn did not complete.
type Class string

const (
	// failed
	ClassRefused            Class = "refused"             // Agister refused before any effect
	ClassInvalidOutput      Class = "invalid_output"      // output missing or breaks its contract
	ClassBudgetExhausted    Class = "budget_exhausted"    // the cost limit was reached
	ClassRateLimited        Class = "rate_limited"        // provider usage or rate limit
	ClassAuth               Class = "auth"                // provider authentication or authorization
	ClassContextOverflow    Class = "context_overflow"    // the prompt does not fit the model
	ClassRuntimeError       Class = "runtime_error"       // the runtime reported another failure
	ClassRuntimeUnavailable Class = "runtime_unavailable" // the runtime could not be started
	ClassInternal           Class = "internal"            // Agister's own failure
	// interrupted
	ClassTimeout   Class = "timeout"
	ClassCancelled Class = "cancelled"
	// lost
	ClassNoResult  Class = "no_result" // the runtime exited without reporting an end
	ClassKilled    Class = "killed"    // the runtime died by a signal Agister did not send
	ClassAbandoned Class = "abandoned" // the owning process ended before the run finished
)

// StatusOf is the status a class belongs to.
func StatusOf(class Class) Status {
	switch class {
	case ClassTimeout, ClassCancelled:
		return Interrupted
	case ClassNoResult, ClassKilled, ClassAbandoned:
		return Lost
	}
	return Failed
}

// Error explains a status other than completed.
type Error struct {
	Class   Class  `json:"class"`
	Message string `json:"message,omitempty"`
}

// Fault builds an error; the status follows from its class.
func Fault(class Class, format string, args ...any) *Error {
	return &Error{Class: class, Message: fmt.Sprintf(format, args...)}
}

func (e *Error) String() string {
	if e.Message == "" {
		return string(e.Class)
	}
	return string(e.Class) + ": " + e.Message
}

// Usage is token usage as reported by the runtime. Unreported fields are
// unset, never zero.
type Usage struct {
	InputTokens      *int64 `json:"input_tokens,omitempty"`
	OutputTokens     *int64 `json:"output_tokens,omitempty"`
	CacheReadTokens  *int64 `json:"cache_read_tokens,omitempty"`
	CacheWriteTokens *int64 `json:"cache_write_tokens,omitempty"`
	ReasoningTokens  *int64 `json:"reasoning_tokens,omitempty"`
}

const (
	SourceProtocol = "protocol"
	SourceProcess  = "process"
	SourceAgister  = "agister"
)

type Exit struct {
	Code   *int
	Signal string
}
type EventSink interface {
	Event(source, kind string, data map[string]any)
	ProcessStarted(ref string) error
	Raw(line string)
	ToolStarted(ToolCall)
	ToolFinished(id string)
}
type Turn struct {
	Status            Status          `json:"status"`
	Error             *Error          `json:"error,omitempty"`
	ProviderSessionID string          `json:"provider_session_id,omitempty"`
	Model             string          `json:"model,omitempty"`
	Output            json.RawMessage `json:"output,omitempty"` // structured output
	Text              string          `json:"text,omitempty"`
	CostUSD           *float64        `json:"cost_usd,omitempty"`
	Usage             *Usage          `json:"usage,omitempty"`
	RuntimeMS         *int64          `json:"runtime_ms,omitempty"`
	NumTurns          *int            `json:"num_turns,omitempty"`
	PermissionDenials int             `json:"permission_denials,omitempty"`
	Exit              *Exit           `json:"exit,omitempty"`
	// StderrTail is the end of the runtime's stderr, bounded; when more was
	// written, StderrOmitted counts the bytes cut before it, and the tail's
	// first line says so.
	StderrTail    string `json:"stderr_tail,omitempty"`
	StderrOmitted int64  `json:"stderr_omitted,omitempty"`
	// Session is what the runtime reported as its session's totals after
	// the turn, where it reports those instead of the turn's own cost or
	// usage; the caller derives the turn's own from them.
	Session *SessionTotals `json:"session,omitempty"`
}
type SessionTotals struct {
	CostUSD *float64 `json:"cost_usd,omitempty"`
	Usage   *Usage   `json:"usage,omitempty"`
}
