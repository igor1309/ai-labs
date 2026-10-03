package supervisor

import "time"

type CommandRequest struct {
	Command string // run as bash -c Command
	Dir     string
	Timeout time.Duration
	// NoOutput is how long the command may go without output before it is
	// stale; zero: no such limit.
	NoOutput time.Duration
	// Bound is how many bytes of the combined output are kept from each
	// end.
	Bound int
}

// CommandResult is how one run of a command ended. Whatever ended it, its
// process group is gone by then.
type CommandResult struct {
	ExitCode  *int   // unset when a signal ended it or it never ran
	Signal    string // the signal that ended it
	TimedOut  bool   // its timeout passed and its group was killed
	Cancelled bool   // the call was cancelled and its group was killed
	Stale     bool   // it produced no output for NoOutput and its group was killed
	// Error is why it could not run: it did not start, or its group could
	// not be recorded and was killed at once.
	Error string
	// The first and last Bound bytes of the combined stdout and stderr;
	// Tail starts after Head ends, so nothing is repeated.
	Head, Tail []byte
	Bytes      int64  // of the whole output
	SHA256     string // hex digest of the whole output
}

type Exit struct {
	Code   *int
	Signal string
}

// The source of an event a Sink is given: the process's own, or the
// supervisor's decision about it (a timeout, an abort, a record that
// failed).
const (
	SourceProcess    = "process"
	SourceSupervisor = "supervisor"
)

type Reaping string

const (
	ReapKilled Reaping = "killed"
	ReapGone   Reaping = "gone"
	ReapLeft   Reaping = "left"
)

// Runtime executes a CLI and reads its version.
type Runtime struct {
	// Starter starts the CLI's process; nil is Exec, the operating
	// system's.
	Starter Starter
	// Timer starts a turn's timeout, the grace a group that was told to
	// end has before it is killed, the grace for reading stdout after the
	// exit, and the version's timeout: the wait has passed when the channel
	// it returns delivers, and stop releases it. Nil is the wall clock.
	Timer func(wait time.Duration) (fired <-chan time.Time, stop func())
}
