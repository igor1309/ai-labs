// Package run models one agent call's record: identities, definitions,
// plan, inputs, events and layered outcomes.
package run

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
)

// Status is how a node ended. Every kind of node (an agent call today;
// commands and checks later) ends in one of these, so a workflow routes
// without knowing what ran: a completed node routes on its output, any
// other status follows the failure route. What the output says, however
// unfavourable, is output of a completed node, never a status.
type Status string

const (
	Completed   Status = "completed"
	Failed      Status = "failed"
	Interrupted Status = "interrupted"
	Lost        Status = "lost"
)

// Class says why a node did not complete. The set is closed so a workflow
// can route on it, e.g. retry rate_limited but not refused.
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

// Cost sources.
const (
	CostRuntime = "runtime" // reported by the runtime (its own estimate)
	CostUnknown = "unknown" // not reported; never read as zero
)

// Cost is what a node cost and who says so.
type Cost struct {
	USD    *float64 `json:"usd,omitempty"`
	Source string   `json:"source"`
}

// Timing is measured by Agister; RuntimeMS is the runtime's own figure.
type Timing struct {
	StartedAt  time.Time `json:"started_at"`
	FinishedAt time.Time `json:"finished_at"`
	WallMS     int64     `json:"wall_ms"`
	TurnMS     *int64    `json:"turn_ms,omitempty"`    // the runtime process, start to exit
	RuntimeMS  *int64    `json:"runtime_ms,omitempty"` // as the runtime reports it
}

// Artifact is a file a node produced, stored with its evidence.
type Artifact struct {
	Name   string `json:"name"`
	Path   string `json:"path"` // relative to the run's evidence
	Digest string `json:"digest"`
	Bytes  int64  `json:"bytes"`
}

// Session identifies the provider session a node ran in.
type Session struct {
	ProviderSessionID string `json:"provider_session_id"`
	// The run whose session this one continued; empty for a fresh session.
	Continues string `json:"continues,omitempty"`
}

// Result is a node's output as a workflow sees it.
type Result struct {
	Status    Status          `json:"status"`
	Error     *Error          `json:"error,omitempty"`
	Output    json.RawMessage `json:"output,omitempty"` // contract-valid, completed only
	Text      string          `json:"text,omitempty"`
	Usage     *Usage          `json:"usage,omitempty"`
	Cost      Cost            `json:"cost"`
	Timing    Timing          `json:"timing"`
	Artifacts []Artifact      `json:"artifacts,omitempty"`
	Session   *Session        `json:"session,omitempty"`
}

// Event sources.
const (
	SourceProtocol = "protocol" // the runtime's own stream
	SourceProcess  = "process"  // the runtime's OS process
	SourceAgister  = "agister"  // Agister's decisions
)

// Event is one ordered observation during a call.
type Event struct {
	Seq    int            `json:"seq"`
	At     time.Time      `json:"at"`
	Source string         `json:"source"`
	Kind   string         `json:"kind"`
	Data   map[string]any `json:"data,omitempty"`
}

// Exit is a runtime process's exit status.
type Exit struct {
	Code   *int   `json:"code"`
	Signal string `json:"signal,omitempty"`
}

// Turn is the normalized result of one runtime turn.
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
	StderrTail        string          `json:"stderr_tail,omitempty"`
	// Session is what the runtime reported as its session's totals after
	// the turn, where it reports those instead of the turn's own cost or
	// usage; the turn's own are derived from them (Own).
	Session *SessionTotals `json:"session,omitempty"`
	// SessionBefore is the resumed session's totals before the turn, as
	// Agister recorded them on the session's latest turn before it (see
	// LatestTotals); unset for a fresh session, or when Agister had none.
	SessionBefore *SessionTotals `json:"session_before,omitempty"`
}

// Input is one resolved, immutable input.
type Input struct {
	Name     string `json:"name"`
	Source   string `json:"source"`
	Identity string `json:"identity"`           // commit, digest, or the literal itself
	Revision bool   `json:"revision,omitempty"` // Identity is a commit that can be checked out
	Value    any    `json:"value,omitempty"`    // omitted from records when large
}

// Runtime identifies the runtime a call ran on.
type Runtime struct {
	Mapping  string `json:"mapping"`
	Adapter  string `json:"adapter"`
	Contract string `json:"contract"`
	Version  string `json:"version"`
}

// Record is the authoritative evidence of one call.
type Record struct {
	Schema      string             `json:"schema"`
	ID          string             `json:"id"`
	Process     string             `json:"process"`
	Agent       string             `json:"agent,omitempty"`
	Request     Request            `json:"request"`
	CreatedAt   time.Time          `json:"created_at"`
	FinishedAt  *time.Time         `json:"finished_at,omitempty"`
	Definitions []DefinitionSource `json:"definitions,omitempty"`
	Effective   *EffectivePolicy   `json:"effective,omitempty"`
	Verify      *Verify            `json:"verify,omitempty"`
	Runtime     *Runtime           `json:"runtime,omitempty"`
	Plan        *Plan              `json:"plan,omitempty"`
	Inputs      []Input            `json:"inputs,omitempty"`
	Workspace   string             `json:"workspace,omitempty"`
	Effects     *Effects           `json:"effects,omitempty"`
	// Turn is the latest turn; with verification, Attempts has every one.
	Turn     *Turn     `json:"turn,omitempty"`
	Attempts []Attempt `json:"attempts,omitempty"`
	Result   *Result   `json:"result,omitempty"` // set when finished
}

// Effects are what a call leaves outside its record, written down as soon
// as each exists so that whoever finds the run abandoned can undo them.
type Effects struct {
	Checkout *Checkout `json:"checkout,omitempty"`
	Process  *Process  `json:"process,omitempty"`
	// Command is the latest run of the verification command, as the process
	// group that runs it; only one runs at a time.
	Command *Process `json:"command,omitempty"`
}

// Checkout is a workspace the call created in Repository.
type Checkout struct {
	Repository string `json:"repository"`
	Dir        string `json:"dir"`
}

// Process is the runtime's process as an opaque reference, made and read
// only by the runtime adapter that started it. Records of v1alpha2 carry no
// effects, so the reaper never lists them and what such a run left is not
// reaped. Pre-release records that held a group and token read here with an
// empty Ref, which no adapter can reap: it is left, with an error.
type Process struct {
	Ref string `json:"ref"`
}

const RecordSchema = "agister.run/v1alpha3"

// Request is what the caller asked for, recorded as given.
type Request struct {
	Process string            `json:"process"`
	Params  map[string]string `json:"params,omitempty"`
	Agent   string            `json:"agent,omitempty"`   // override of the process's agent
	Timeout string            `json:"timeout,omitempty"` // narrowing override
	// Narrowing cost override.
	MaxCostUSD *float64 `json:"max_cost_usd,omitempty"`
	// A finished run whose session to continue; empty for a fresh session.
	Continue string `json:"continue,omitempty"`
	Cwd      string `json:"cwd"`
}

// State of a record as read.
type State string

const (
	StateRunning   State = "running"
	StateFinished  State = "finished"
	StateAbandoned State = "abandoned" // never finished and no longer owned
)

// Conclude derives the node status from a turn and the output contract:
// a runtime's failure is never upgraded, and a completed turn counts only
// with contract-valid output. What the output means is not Agister's.
func Conclude(turn Turn, output definition.Output, validation error) (Status, *Error) {
	if turn.Status != Completed {
		if turn.Error == nil {
			return turn.Status, Fault(ClassRuntimeError, "no reason reported")
		}
		return turn.Status, turn.Error
	}
	if output.Format == "json" && validation != nil {
		return Failed, Fault(ClassInvalidOutput, "%v", validation)
	}
	return Completed, nil
}

// AbandonedResult is the result of a run whose owner ended before it
// finished.
func AbandonedResult(startedAt time.Time) Result {
	return Result{
		Status: Lost,
		Error:  Fault(ClassAbandoned, "the process running it ended before it finished"),
		Cost:   Cost{Source: CostUnknown},
		Timing: Timing{StartedAt: startedAt},
	}
}
