// Package contract is Agister's client-facing contract. Clients (the CLI)
// depend on this package only. It is service-shaped: submitting a call is
// separate from observing it, and runs are cancelled and inspected by
// identity, so the same contract works in-process or behind a service.
package contract

import (
	"context"
	"encoding/json"
	"errors"
	"time"
)

type Client interface {
	Init(ctx context.Context, overwrite bool) (InitResult, error)
	CreateAgent(ctx context.Context, agent Agent, overwrite bool) (string, error)
	ListAgents(ctx context.Context) ([]Agent, error)
	ListProcesses(ctx context.Context) ([]ProcessSummary, error)
	ShowProcess(ctx context.Context, name, agent string) (ProcessView, error)

	// Submit records a call and starts it. Every call gets a run, including
	// one that is refused.
	Submit(ctx context.Context, request CallRequest) (string, error)
	// Observe delivers the run's events after afterSeq, in order, until the
	// run is no longer running. It can be resumed from any sequence.
	Observe(ctx context.Context, runID string, afterSeq int, each func(Event) error) error
	Cancel(ctx context.Context, runID string) error
	Inspect(ctx context.Context, runID string) (Run, error)
	ListRuns(ctx context.Context) ([]Run, error)
}

// InputError is a request mistake outside any call (e.g. an unknown
// runtime when creating an agent).
type InputError struct{ Message string }

func (e *InputError) Error() string { return e.Message }

var ErrNotFound = errors.New("not found")

type InitResult struct {
	Created []string
	Kept    []string
}

type Agent struct {
	Name        string
	Runtime     string
	Model       string
	ModelFamily string
	Effort      string
	Command     string
}

type ProcessSummary struct {
	Name   string
	Agent  string
	Policy string
	Output string
}

type Param struct {
	Name     string
	Default  string
	Required bool
}

type ProcessView struct {
	Name        string
	Agent       string
	Runtime     string
	Policy      string
	Params      []Param
	Inputs      []string
	Output      string
	Timeout     time.Duration
	MaxAttempts int
	Allowed     []string
	Denied      []string
	Permissions []string
	Access      string
	Scope       string
	Constraints []string
	// Plan on the agent's runtime, or why none exists.
	Primitives []string
	Withheld   []string
	Refusal    string
}

type CallRequest struct {
	Process string
	Params  map[string]string
	Agent   string // optional override
	Timeout string // optional, may only shorten
	Cwd     string
}

type Event struct {
	Seq    int
	At     time.Time
	Source string
	Kind   string
	Data   map[string]any
}

type Run struct {
	ID                string
	Process           string
	Agent             string
	Status            string // running | finished | lost
	Outcome           string // accepted | rejected | failed | refused
	Reason            string
	CreatedAt         time.Time
	ProviderSessionID string
	ResumeHint        string
	CostUSD           *float64
	DurationMS        *int64
	Text              string
	StderrTail        string // the runtime's last stderr, when the turn did not complete
	Output            json.RawMessage
	Record            json.RawMessage // the full evidence record
}
