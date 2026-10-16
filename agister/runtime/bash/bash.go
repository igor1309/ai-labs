// Package bash is the bash wrapper (ADR-001): its contract and what it
// can do (ADR-003, rule 7), in its own types, and its turn: a script run
// by bash through the supervisor (ADR-012, rules 2 and 6).
package bash

import (
	"context"
	"errors"

	"github.com/igor1309/ai-labs/agister/supervisor"
)

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

// Supervisor runs a program and gives how it ended and the ends of its
// output, or an error wrapping supervisor.ErrNotStarted when it could not
// start.
type Supervisor interface {
	Run(ctx context.Context, program supervisor.Program) (supervisor.Result, error)
}

// Turn is a script, the directory it runs in, and its environment, as
// "KEY=value".
type Turn struct {
	Script string
	Dir    string
	Env    []string
}

// Wrapper is the bash wrapper.
type Wrapper struct {
	supervisor Supervisor
}

// New gives the bash wrapper, which runs its turns through supervisor.
func New(supervisor Supervisor) (*Wrapper, error) {
	if supervisor == nil {
		return nil, errors.New("bash: no supervisor")
	}
	return &Wrapper{supervisor: supervisor}, nil
}

// Run runs the turn's script as "bash -c <script>" in its directory with
// its environment, through the supervisor, and gives what the supervisor
// gives, its error that the program could not start included.
func (w *Wrapper) Run(ctx context.Context, turn Turn) (supervisor.Result, error) {
	return w.supervisor.Run(ctx, supervisor.Program{
		Name: "bash", Args: []string{"-c", turn.Script}, Dir: turn.Dir, Env: turn.Env,
	})
}

// Facts gives the wrapper's facts, a new value on each call.
func (*Wrapper) Facts() Facts {
	return Facts{
		Contract:     "bash/1",
		Schema:       false,
		Session:      false,
		Skills:       false,
		Model:        false,
		ToolCalls:    false,
		ToolCommands: false,
	}
}
