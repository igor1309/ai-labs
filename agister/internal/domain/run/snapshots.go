package run

import "time"

// The types below are the record's own copy of what the definitions,
// policy and enforcement packages decided for a call. The record is
// evidence under a versioned schema: those packages may change their types
// without changing what an earlier run said or what a later one writes.

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
}

// Plan is what the call was granted on its runtime.
type Plan struct {
	Primitives []string `json:"primitives"`
	Granted    []string `json:"granted"`  // permissions the primitives provide
	Withheld   []string `json:"withheld"` // allowed but not provided
}
