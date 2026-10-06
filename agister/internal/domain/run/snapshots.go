package run

import "time"

// The types below are the record's own copy of what the definitions,
// policy and enforcement packages decided for a call. The record is
// evidence under a versioned schema: those packages may change their types
// without changing what an earlier run said or what a later one writes.
// A field removed from these types is dropped when an earlier record is
// rewritten (a reap finishing it).

// DefinitionSource is where a definition the call used came from, with the
// digest of what was read.
type DefinitionSource struct {
	Kind   string `json:"kind"`
	Name   string `json:"name"`
	Path   string `json:"path"`
	SHA256 string `json:"sha256"`
	// From a project's own settings rather than the global ones.
	Project bool `json:"project,omitempty"`
	// The global definition this project one takes priority over.
	Overrides string `json:"overrides,omitempty"`
}

// EffectivePolicy is the limits a call ran under, composed from the
// service, policy, process and caller.
type EffectivePolicy struct {
	Timeout     time.Duration `json:"timeout"`
	MaxAttempts int           `json:"max_attempts"`
	MaxCostUSD  *float64      `json:"max_cost_usd,omitempty"` // unset: no cost limit
	Allow       []string      `json:"allow"`
	Deny        []string      `json:"deny"`
	Permissions []string      `json:"permissions"` // allowed and not denied
	Require     []string      `json:"require,omitempty"`
	Access      string        `json:"access"`
	Scope       string        `json:"scope"`
	// Stale are the staleness limits; unset when the call had none.
	Stale *StaleLimits `json:"stale,omitempty"`
}

// StaleLimits are the staleness limits a call ran under; a zero one was
// not set and ended nothing.
type StaleLimits struct {
	NoEvent           time.Duration `json:"no_event,omitempty"`
	NoOutput          time.Duration `json:"no_output,omitempty"`
	ToolCommand       time.Duration `json:"tool_command,omitempty"`
	RepeatedToolCalls int           `json:"repeated_tool_calls,omitempty"`
	// Recover is the call's recovery of a stale turn; unset when it had no
	// budget for one.
	Recover *StaleRecover `json:"recover,omitempty"`
}

// StaleRecover is the recovery of a stale turn a call ran under (ADR-023
// rule 5): how many turns might resume its session with the evidence of
// what went stale, and what they were told.
type StaleRecover struct {
	MaxResumes  int    `json:"max_resumes"`
	Instruction string `json:"instruction"`
}

// Plan is what the call was granted on its runtime.
type Plan struct {
	Primitives []string `json:"primitives"`
	Granted    []string `json:"granted"`  // permissions the primitives provide
	Withheld   []string `json:"withheld"` // allowed but not provided
}

// Verify is the verification command a call's process declared, as
// resolved. It is part of the process definition, whose recorded digest
// covers it.
type Verify struct {
	Command     string        `json:"command"`
	Timeout     time.Duration `json:"timeout"`
	MaxAttempts int           `json:"max_attempts"`
	Instruction string        `json:"instruction"`
	// Where is "workspace" when the verification declares it (ADR-022 rule
	// 6); empty: a clean copy.
	Where string `json:"where,omitempty"`
}

// Precheck is the command that gates an in-place call (ADR-022 rule 5), as
// resolved from the workspace settings at Path. SHA256 is the hex digest of
// Command.
type Precheck struct {
	Command string        `json:"command"`
	Timeout time.Duration `json:"timeout"`
	SHA256  string        `json:"sha256"`
	Path    string        `json:"path"`
}

// Setup is the setup command a call's checkout runs (ADR-012), as
// resolved: the process's own, or its workspace settings' default. From
// says which, and Path is the document it came from, whose recorded digest
// covers it.
type Setup struct {
	Command string        `json:"command"`
	Timeout time.Duration `json:"timeout"`
	From    string        `json:"from"` // SetupFromProcess or SetupFromWorkspace
	Path    string        `json:"path"`
}

// Where a call's setup comes from.
const (
	SetupFromProcess   = "process"
	SetupFromWorkspace = "workspace"
)
