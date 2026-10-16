// Package codex is the codex wrapper (ADR-001): its contract and what it
// can do (ADR-003, rule 7), in its own types. It gives its facts alone
// until it runs its program.
package codex

// Facts are the wrapper's contract and what it can do: check output
// against a schema, resume a session, take skills, take a model, the
// efforts it accepts, report tool calls and tool commands, and how it
// takes a call's inputs.
type Facts struct {
	Contract     string
	Schema       bool
	Session      bool
	Skills       bool
	Model        bool
	Efforts      []string
	ToolCalls    bool
	ToolCommands bool
	Inputs       Inputs
}

// Inputs is how a runtime takes a call's inputs.
type Inputs int

const (
	// InEnvironment is each input a variable of its program's environment.
	InEnvironment Inputs = iota + 1
	// InMessage is each input a section of its message.
	InMessage
)

// Wrapper is the codex wrapper.
type Wrapper struct{}

// New gives the codex wrapper.
func New() *Wrapper { return &Wrapper{} }

// Facts gives the wrapper's facts, a new value on each call.
func (*Wrapper) Facts() Facts {
	return Facts{
		Contract:     "codex/2",
		Schema:       true,
		Session:      true,
		Skills:       true,
		Model:        true,
		Efforts:      []string{"minimal", "low", "medium", "high", "xhigh"},
		ToolCalls:    true,
		ToolCommands: true,
		Inputs:       InMessage,
	}
}
