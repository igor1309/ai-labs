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

// SettingsError refuses a use of the client while the settings have
// problems; the report says which.
type SettingsError struct {
	Report CheckReport
}

func (e *SettingsError) Error() string {
	return "settings have problems; fix them first (see `agister check`)"
}

type Client interface {
	// Init installs the example settings. Without an approved plan it
	// writes nothing and returns the plan; with one it writes, refusing if
	// the request now plans anything else or any file changed since.
	Init(ctx context.Context, overwrite bool, approved *InitResult) (InitResult, error)
	// CreateAgent writes an agent profile. Without an approved plan it
	// validates and returns the plan, writing nothing; with one it writes,
	// refusing if the request now plans anything else or the file changed
	// since.
	CreateAgent(ctx context.Context, agent Agent, overwrite bool, approved *AgentWrite) (AgentWrite, error)
	ListAgents(ctx context.Context) ([]Agent, error)
	ListProcesses(ctx context.Context) ([]ProcessSummary, error)
	ShowProcess(ctx context.Context, name, agent string) (ProcessView, error)
	ListWorkflows(ctx context.Context) ([]WorkflowSummary, error)
	// ShowWorkflow shows a workflow as a run of it would see it: its
	// params, inputs and nodes, and each node's process as a call of it
	// would see it.
	ShowWorkflow(ctx context.Context, name string) (WorkflowView, error)
	// Check validates every setting and reports all problems. With probe,
	// it also asks each agent's runtime for its identity.
	Check(ctx context.Context, probe bool) (CheckReport, error)

	// Submit records a call, or a workflow when the request names one, and
	// starts it. Every call and workflow gets a run, including one that is
	// refused; each node of a workflow gets its own.
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

type AgentWrite struct {
	Path     string
	Replaces bool   // an existing agent is overwritten
	Digest   string // of the file as planned; empty when absent
	Content  string // digest of the agent to be written
}

type InitResult struct {
	Created  []string
	Replaced []string // existing files overwritten
	Kept     []string
	Digests  map[string]string // path: digest of the file as planned; empty when absent
	Contents map[string]string // path: digest of the example to be written
}

type Agent struct {
	Name        string
	Runtime     string
	Model       string
	ModelFamily string
	Effort      string
	Session     string // fresh-only (default) | resumable
	Command     string
}

type ProcessSummary struct {
	Name    string
	Agent   string
	Policy  string
	Output  string
	Problem string // set when the definition is invalid
}

type CheckReport struct {
	Checked  map[string]int `json:"checked"` // definitions checked, by kind
	Problems []string       `json:"problems"`
	// Project definitions that take priority over global ones.
	Overrides []string `json:"overrides"`
	// What the settings do that their user should know, such as a
	// verification command that runs with the operator's authority. They
	// are not problems: nothing is refused for them.
	Warnings []string `json:"warnings"`
	// Every definition read, in check order, with what it references.
	Definitions []Definition `json:"definitions"`
}

// Definition is one settings document in the composed settings.
type Definition struct {
	Kind      string          `json:"kind"` // service, agents, processes, policies, runtimes, schemas, workflows, verifies
	Name      string          `json:"name"`
	Layer     string          `json:"layer"` // global or project
	Path      string          `json:"path"`
	Overrides string          `json:"overrides,omitempty"` // the global document this one replaces
	Invalid   bool            `json:"invalid,omitempty"`   // did not parse; see problems
	Uses      []DefinitionRef `json:"uses,omitempty"`      // whether or not they exist
	UsedBy    []DefinitionRef `json:"used_by,omitempty"`
}

// DefinitionOrigin is where one definition a call uses comes from.
type DefinitionOrigin struct {
	Kind      string // agents, processes, policies, runtimes, schemas, verifies or service
	Name      string
	Layer     string // global or project
	Path      string
	Overrides string // the global document this one replaces
}

type DefinitionRef struct {
	Kind string `json:"kind"`
	Name string `json:"name"`
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
	MaxCostUSD  *float64 // unset: no cost limit
	Allowed     []string
	Denied      []string
	Permissions []string
	Access      string
	Scope       string
	// The staleness limits a call of it would run under.
	Stale Stale
	// Plan on the agent's runtime, or why none exists.
	Primitives []string
	Withheld   []string
	Refusal    string
	// The verification command the process declares, inline or by naming
	// a verification; unset when none, or when the named one is not
	// resolved (Refusal says why).
	Verify *Verify
	// The verification the process names; empty for an inline block.
	VerifyName string
	// What the user should know before calling it.
	Warnings []string
	// Where each definition the call uses comes from.
	Sources []DefinitionOrigin
}

type WorkflowSummary struct {
	Name    string
	FanOut  []string // node:process, in declaration order
	Join    string   // node:process
	Problem string   // set when the definition is invalid
}

// WorkflowView is a workflow as a run of it would see it (ADR-003).
type WorkflowView struct {
	Name   string
	Params []Param
	Inputs []string // resolved once, before any node starts
	FanOut []WorkflowNode
	Join   WorkflowNode
	// Collection is the join's input that receives the collection.
	Collection string
	// Why a run of it would be refused now; empty when it would run.
	Refusal  string
	Warnings []string
	Sources  []DefinitionOrigin
}

// WorkflowNode is one node of a workflow, and its process as a call of it
// would see it; Process.Refusal says why that call would be refused.
type WorkflowNode struct {
	Name    string
	Process ProcessView
	// The workflow's inputs it receives as params; none for a join.
	Params []string
}

// Stale are a call's staleness limits: what ends an agent turn or a
// verification run before its timeout. A zero one is not set.
type Stale struct {
	NoEvent           time.Duration // an agent turn without a runtime event
	NoOutput          time.Duration // a verification run without output
	ToolCommand       time.Duration // one command an agent's tool runs
	RepeatedToolCalls int           // identical tool calls in a row
}

// Verify is a process's verification command.
type Verify struct {
	Command     string
	Timeout     time.Duration
	MaxAttempts int
	Instruction string
}

// CallRequest asks for a call of a process, or a run of a workflow: Process
// names either. A workflow takes Params and Cwd only.
type CallRequest struct {
	Process    string
	Params     map[string]string
	Agent      string   // optional override
	Timeout    string   // optional, may only shorten
	MaxCostUSD *float64 // optional, may only lower
	Continue   string   // optional: a finished run whose session to continue
	Cwd        string
}

type Event struct {
	Seq    int
	At     time.Time
	Source string
	Kind   string
	Data   map[string]any
}

// Run is one call, or one workflow, as a client sees it.
type Run struct {
	ID        string
	Process   string // the process called, or the workflow run
	Agent     string
	State     string  // running | finished | abandoned
	Result    *Result // set unless running
	CreatedAt time.Time
	// The runtime's last stderr, when the node did not complete.
	StderrTail string
	Record     json.RawMessage // the full evidence record
}

// Result is a node's output, the same for every kind of node: a workflow
// routes a completed node on Output and any other status on its failure
// route, optionally by Error.Class.
type Result struct {
	Status    string          `json:"status"` // completed | failed | interrupted | lost
	Error     *Error          `json:"error,omitempty"`
	Output    json.RawMessage `json:"output,omitempty"`
	Text      string          `json:"text,omitempty"`
	Usage     *Usage          `json:"usage,omitempty"`
	Cost      Cost            `json:"cost"`
	Timing    Timing          `json:"timing"`
	Artifacts []Artifact      `json:"artifacts,omitempty"`
	Session   *Session        `json:"session,omitempty"`
}

type Error struct {
	Class   string `json:"class"`
	Message string `json:"message,omitempty"`
}

type Usage struct {
	InputTokens      *int64 `json:"input_tokens,omitempty"`
	OutputTokens     *int64 `json:"output_tokens,omitempty"`
	CacheReadTokens  *int64 `json:"cache_read_tokens,omitempty"`
	CacheWriteTokens *int64 `json:"cache_write_tokens,omitempty"`
	ReasoningTokens  *int64 `json:"reasoning_tokens,omitempty"`
}

type Cost struct {
	USD    *float64 `json:"usd,omitempty"`
	Source string   `json:"source"` // runtime | unknown
}

type Timing struct {
	StartedAt  time.Time `json:"started_at"`
	FinishedAt time.Time `json:"finished_at"`
	WallMS     int64     `json:"wall_ms"`
	TurnMS     *int64    `json:"turn_ms,omitempty"`
	RuntimeMS  *int64    `json:"runtime_ms,omitempty"`
}

type Artifact struct {
	Name   string `json:"name"`
	Path   string `json:"path"`
	Digest string `json:"digest"`
	Bytes  int64  `json:"bytes"`
}

type Session struct {
	ProviderSessionID string `json:"provider_session_id"`
	Continues         string `json:"continues,omitempty"`
}
