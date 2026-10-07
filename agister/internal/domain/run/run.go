// Package run models one agent call's record, or one workflow's:
// identities, definitions, plan, inputs, events and layered outcomes.
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
	ClassSetupFailed        Class = "setup_failed"        // the checkout's setup command failed (ADR-012)
	ClassCommitted          Class = "committed"           // the agent committed in the caller's worktree (ADR-022 rule 7)
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
	Output    json.RawMessage `json:"output,omitempty"` // the latest turn's, when contract-valid, whatever then ended the node
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
	// StderrTail is the end of the runtime's stderr, bounded; when more was
	// written, StderrOmitted counts the bytes cut before it, and the tail's
	// first line says so.
	StderrTail    string `json:"stderr_tail,omitempty"`
	StderrOmitted int64  `json:"stderr_omitted,omitempty"`
	// Session is what the runtime reported as its session's totals after
	// the turn, where it reports those instead of the turn's own cost or
	// usage; the turn's own are derived from them (Own).
	Session *SessionTotals `json:"session,omitempty"`
	// SessionBefore is the resumed session's totals before the turn, as
	// Agister recorded them on the session's latest turn before it (see
	// LatestTotals); unset for a fresh session, or when Agister had none.
	SessionBefore *SessionTotals `json:"session_before,omitempty"`
	// Stale is set when Agister ended the turn at a staleness limit.
	Stale *Stale `json:"stale,omitempty"`
}

// AbsentPrompt is an optional prompt input the call went ahead without:
// the input, and the prompt it names that neither settings layer had.
type AbsentPrompt struct {
	Input  string `json:"input"`
	Prompt string `json:"prompt"`
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

// Profile is the agent profile a call ran as: the model and effort it asked
// for, each empty when the agent left it to the runtime, and the session
// mode. The model the runtime reports is the turn's.
type Profile struct {
	Model   string `json:"model,omitempty"`
	Effort  string `json:"effort,omitempty"`
	Session string `json:"session,omitempty"`
}

// Record is the authoritative evidence of one call.
type Record struct {
	Schema  string `json:"schema"`
	ID      string `json:"id"`
	Process string `json:"process"`
	Agent   string `json:"agent,omitempty"`
	// Profile is what the call asked of its agent; unset on records
	// written before it was recorded.
	Profile     *Profile           `json:"profile,omitempty"`
	Request     Request            `json:"request"`
	CreatedAt   time.Time          `json:"created_at"`
	FinishedAt  *time.Time         `json:"finished_at,omitempty"`
	Definitions []DefinitionSource `json:"definitions,omitempty"`
	// AbsentPrompts are the optional prompt inputs whose prompt neither
	// settings layer had, so the agent was not given them (ADR-019 rule 3).
	AbsentPrompts []AbsentPrompt   `json:"absent_prompts,omitempty"`
	Effective     *EffectivePolicy `json:"effective,omitempty"`
	Verify        *Verify          `json:"verify,omitempty"`
	// Setup is the setup command the call's checkout runs (ADR-012), as
	// resolved; SetupRun is its one run, once it ran.
	Setup    *Setup      `json:"setup,omitempty"`
	SetupRun *CommandRun `json:"setup_run,omitempty"`
	// Precheck is the precheck that gates an in-place call (ADR-022 rule 5),
	// as resolved; PrecheckRun is its one run, once it ran.
	Precheck    *Precheck   `json:"precheck,omitempty"`
	PrecheckRun *CommandRun `json:"precheck_run,omitempty"`
	Runtime     *Runtime    `json:"runtime,omitempty"`
	Plan        *Plan       `json:"plan,omitempty"`
	Inputs      []Input     `json:"inputs,omitempty"`
	Workspace   string      `json:"workspace,omitempty"`
	// InPlace is the caller's worktree an in-place call borrowed (ADR-022
	// rule 2). It is not an effect: no release or reap reads it, and nothing
	// of Agister's removes it. Unset for any other call.
	InPlace *InPlace `json:"in_place,omitempty"`
	Effects *Effects `json:"effects,omitempty"`
	// ProcessesEnded says every process the run recorded (Effects.Process
	// and Effects.Command) is known to have ended: the call ended them
	// itself, or a reap did. False, a process it recorded may still run.
	// Nil on records written before it was recorded, which
	// ProcessesKnownEnded reads.
	ProcessesEnded *bool `json:"processes_ended,omitempty"`
	// Turn is the latest turn; with verification, Attempts has every one.
	Turn     *Turn     `json:"turn,omitempty"`
	Attempts []Attempt `json:"attempts,omitempty"`
	// Recoveries are the call's recovery turns, in order (ADR-024 rule 9).
	Recoveries []Recovery `json:"recoveries,omitempty"`
	// Trail is what the runtime reported the agent did on the way, over
	// every turn of the call: the paths its tool calls wrote and the tool
	// calls it was denied. Unset when it reported neither.
	Trail *Trail `json:"trail,omitempty"`
	// Workflow is set on a workflow's own run (ADR-003): its nodes and
	// barrier. Parent is set on a node's run: the workflow run it belongs to.
	Workflow *Workflow `json:"workflow,omitempty"`
	Parent   *Parent   `json:"parent,omitempty"`
	Result   *Result   `json:"result,omitempty"` // set when finished
}

// ProcessesKnownEnded says whether every process the run recorded is known
// to have ended: what ProcessesEnded says, when the record has it. A record
// written before has it only by how the run ended: a call that finished its
// run ended its processes first, so they are; a run its call left
// unfinished, or one a reap finished, says nothing of them.
func (r Record) ProcessesKnownEnded() bool {
	if r.ProcessesEnded != nil {
		return *r.ProcessesEnded
	}
	return r.FinishedAt != nil && !reaped(r)
}

// Effects are what a call leaves outside its record, written down as soon
// as each exists so that whoever finds the run abandoned can undo them.
type Effects struct {
	Checkout *Checkout `json:"checkout,omitempty"`
	Process  *Process  `json:"process,omitempty"`
	// Command is the latest run of the setup or the verification command,
	// as the process group that runs it; only one runs at a time.
	Command *Process `json:"command,omitempty"`
	// Copy is the clean copy the latest verification run checks: a checkout
	// of the base with the attempt's changes applied, removed after the
	// attempt; only one exists at a time.
	Copy *Checkout `json:"copy,omitempty"`
	// Unreleased is the call's checkout when its release failed, as at the
	// cleanup deadline, or when the reap of the abandoned run could not
	// remove it: still to be removed, by a later reap, which clears it once
	// removed. Checkout stays on record either way.
	Unreleased *Checkout `json:"unreleased,omitempty"`
}

// Checkout is a workspace the call created in Repository, of Revision:
// the commit it was checked out at, empty on records made before it was
// recorded and on clean copies.
type Checkout struct {
	Repository string `json:"repository"`
	// RepositoryIdentity is the canonical Git common directory. Older records
	// leave it empty and compare Repository paths instead.
	RepositoryIdentity string `json:"repository_identity,omitempty"`
	Dir                string `json:"dir"`
	Revision           string `json:"revision,omitempty"`
}

// InPlace is the caller's worktree a call worked in (ADR-022 rule 2): its
// directory, its identity, the repository, the revision it started from and
// how the call verifies.
type InPlace struct {
	Dir string `json:"dir"`
	// Worktree is the worktree's canonical path, symlinks resolved: the key
	// of its lock, by which runs in one worktree are found.
	Worktree string `json:"worktree"`
	// RepositoryIdentity is the canonical Git common directory.
	RepositoryIdentity string `json:"repository_identity"`
	Revision           string `json:"revision"`
	// Verify is where the call's verification runs (ADR-022 rule 6):
	// VerifyInWorkspace or VerifyOnCopy; empty when the call verifies
	// nothing.
	Verify string `json:"verify,omitempty"`
	// Content names the worktree's content the call's changes.patch was
	// captured from (ADR-022 rule 7); empty until then, and when the
	// capture failed.
	Content string `json:"content,omitempty"`
}

// Where verification runs: on a clean copy (ADR-005), or in the caller's
// worktree an in-place call borrowed (ADR-022 rule 6).
const (
	VerifyOnCopy      = "copy"
	VerifyInWorkspace = "workspace"
)

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
	// Workspace is the workspace mode the caller asked for (ADR-022 rule 1),
	// "in-place" or "temporary"; empty: the repository's setting.
	Workspace string `json:"workspace,omitempty"`
	Cwd       string `json:"cwd"`
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
