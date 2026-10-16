// Package bash is the bash wrapper (ADR-001): its contract and what it
// can do (ADR-003, rule 7), in its own types, and its turn: a script run
// by bash through the supervisor (ADR-012, rules 2 and 6), whose contract
// it declares in its own types.
package bash

import (
	"context"
	"errors"
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

// ErrNotStarted is what the supervisor's error wraps when the program could
// not start.
var ErrNotStarted = errors.New("the program could not start")

// Supervisor runs a program and gives how it ended and what it wrote, or
// an error wrapping ErrNotStarted when it could not start.
type Supervisor interface {
	Run(ctx context.Context, program Program) (Ended, error)
}

// Program is a program the supervisor runs: its name, its arguments, its
// directory and its environment, as "KEY=value".
type Program struct {
	Name string
	Args []string
	Dir  string
	Env  []string
}

// Ended is how a program ended and what it wrote: the code it exited with,
// or the name of the signal that ended it.
type Ended struct {
	Code           int
	Signal         string
	Stdout, Stderr Stream
}

// Stream is what the supervisor kept of one of the program's streams: its
// head and tail, its size and the digest of the whole; Incomplete when it
// was not read to its end.
type Stream struct {
	Head, Tail string
	Size       int64
	Digest     string
	Incomplete bool
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
func (w *Wrapper) Run(ctx context.Context, turn Turn) (Ended, error) {
	return w.supervisor.Run(ctx, Program{
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
