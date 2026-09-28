// Package run models one agent call's record: identities, definitions,
// plan, inputs, events and layered outcomes.
package run

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
	"github.com/igor1309/ai-labs/agister/internal/domain/enforce"
	"github.com/igor1309/ai-labs/agister/internal/domain/policy"
)

// TurnOutcome is how one runtime turn ended.
type TurnOutcome string

const (
	TurnCompleted   TurnOutcome = "completed"
	TurnFailed      TurnOutcome = "failed"
	TurnInterrupted TurnOutcome = "interrupted"
	TurnLost        TurnOutcome = "lost"
)

// CallOutcome is how one agent call ended.
type CallOutcome string

const (
	CallAccepted CallOutcome = "accepted"
	CallRejected CallOutcome = "rejected"
	CallFailed   CallOutcome = "failed"
	CallRefused  CallOutcome = "refused"
)

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
	Outcome           TurnOutcome     `json:"outcome"`
	Reason            string          `json:"reason,omitempty"`
	ProviderSessionID string          `json:"provider_session_id,omitempty"`
	Model             string          `json:"model,omitempty"`
	Output            json.RawMessage `json:"output,omitempty"` // structured output
	Text              string          `json:"text,omitempty"`
	CostUSD           *float64        `json:"cost_usd,omitempty"`
	Usage             map[string]any  `json:"usage,omitempty"`
	DurationMS        *int64          `json:"duration_ms,omitempty"`
	NumTurns          *int            `json:"num_turns,omitempty"`
	PermissionDenials int             `json:"permission_denials,omitempty"`
	Exit              *Exit           `json:"exit,omitempty"`
	StderrTail        string          `json:"stderr_tail,omitempty"`
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
	Schema             string              `json:"schema"`
	ID                 string              `json:"id"`
	Process            string              `json:"process"`
	Agent              string              `json:"agent,omitempty"`
	Request            Request             `json:"request"`
	CreatedAt          time.Time           `json:"created_at"`
	FinishedAt         *time.Time          `json:"finished_at,omitempty"`
	Definitions        []definition.Source `json:"definitions,omitempty"`
	Effective          *policy.Effective   `json:"effective,omitempty"`
	Runtime            *Runtime            `json:"runtime,omitempty"`
	Plan               *enforce.Plan       `json:"plan,omitempty"`
	Inputs             []Input             `json:"inputs,omitempty"`
	Workspace          string              `json:"workspace,omitempty"`
	RequestedSessionID string              `json:"requested_session_id,omitempty"`
	Turn               *Turn               `json:"turn,omitempty"`
	Outcome            CallOutcome         `json:"outcome,omitempty"`
	Reason             string              `json:"reason,omitempty"`
	Output             json.RawMessage     `json:"output,omitempty"`
}

const RecordSchema = "agister.run/v1alpha1"

// Request is what the caller asked for, recorded as given.
type Request struct {
	Process string            `json:"process"`
	Params  map[string]string `json:"params,omitempty"`
	Agent   string            `json:"agent,omitempty"`   // override of the process's agent
	Timeout string            `json:"timeout,omitempty"` // narrowing override
	Cwd     string            `json:"cwd"`
}

// Status of a record as read.
type Status string

const (
	StatusRunning  Status = "running"
	StatusFinished Status = "finished"
	StatusLost     Status = "lost" // never finished and no longer owned
)

// Judge derives the call outcome from a turn and the output contract.
// A completed turn counts only with valid output; the process decides
// which valid outputs mean rejection.
func Judge(turn Turn, output definition.Output, validation error) (CallOutcome, string) {
	if turn.Outcome != TurnCompleted {
		reason := string(turn.Outcome)
		if turn.Reason != "" {
			reason += ": " + turn.Reason
		}
		return CallFailed, reason
	}
	if output.Format != "json" {
		return CallAccepted, ""
	}
	if validation != nil {
		return CallFailed, "invalid output: " + validation.Error()
	}
	if output.ResultField == "" {
		return CallAccepted, ""
	}
	var object map[string]any
	if err := json.Unmarshal(turn.Output, &object); err != nil {
		return CallFailed, "output is not an object"
	}
	value := fmt.Sprint(object[output.ResultField])
	for _, reject := range output.Reject {
		if value == reject {
			return CallRejected, fmt.Sprintf("%s is %s", output.ResultField, value)
		}
	}
	return CallAccepted, ""
}
