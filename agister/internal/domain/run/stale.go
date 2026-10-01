package run

import "time"

// Staleness limits, as a record names the one that ended a turn or a
// verification run.
const (
	StaleNoEvent           = "no_event"            // no runtime event for the limit
	StaleNoOutput          = "no_output"           // no output from the verification command for the limit
	StaleToolCommand       = "tool_command"        // a tool's command ran for the limit
	StaleRepeatedToolCalls = "repeated_tool_calls" // the same tool call, the limit's number of times in a row
)

// Stale is why Agister ended a turn or a verification run before its
// timeout: the staleness limit reached, what went stale and when.
type Stale struct {
	Limit string `json:"limit"`
	// After is the limit that passed, for a limit that is a span of time;
	// Count, the identical calls made, for repeated tool calls.
	After time.Duration `json:"after,omitempty"`
	Count int           `json:"count,omitempty"`
	// Since is when what went stale last moved: the last runtime event, the
	// start of the tool's command, the first of the repeated calls; unset
	// when Agister has no time for it.
	Since *time.Time `json:"since,omitempty"`
	// At is when Agister found it stale and ended it.
	At time.Time `json:"at"`
	// Tool is the tool call that hung or was repeated.
	Tool *ToolCall `json:"tool,omitempty"`
}

// ToolCall is a tool call as the runtime adapter reported it; Input is
// bounded, and SHA256 is of the whole input.
type ToolCall struct {
	ID     string `json:"id,omitempty"`
	Name   string `json:"name"`
	Input  string `json:"input,omitempty"`
	SHA256 string `json:"sha256,omitempty"`
}
