// Package pi is the pi wrapper (ADR-001): its contract and what it
// can do (ADR-003, rule 7), in its own types. It gives its facts alone
// until it runs its program.
package pi

// Facts are the wrapper's contract and what it can do: check output
// against a schema, resume a session, take skills, take a model, the
// efforts it accepts, and report tool calls and tool commands.
type Facts struct {
	Contract     string
	Schema       bool
	Session      bool
	Skills       bool
	Model        bool
	Efforts      []string
	ToolCalls    bool
	ToolCommands bool
}

// Wrapper is the pi wrapper.
type Wrapper struct{}

// New gives the pi wrapper.
func New() *Wrapper { return &Wrapper{} }

// Facts gives the wrapper's facts, a new value on each call.
func (*Wrapper) Facts() Facts {
	return Facts{
		Contract:     "pi/1",
		Schema:       true,
		Session:      true,
		Skills:       true,
		Model:        true,
		Efforts:      []string{"off", "minimal", "low", "medium", "high", "xhigh", "max"},
		ToolCalls:    true,
		ToolCommands: true,
	}
}
