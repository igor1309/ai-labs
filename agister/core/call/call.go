// Package call makes a call (ADR-001, "Core"; ADR-012, rule 7): one turn
// on the runtime, through the runtime protocol it declares, ended at its
// time limit and given in the result shape (ADR-001, invariant 3).
package call

import (
	"context"
	"errors"
	"maps"
	"slices"
	"strings"
	"time"
)

// Status is how a call ended.
type Status string

const (
	Completed   Status = "completed"
	Failed      Status = "failed"
	Interrupted Status = "interrupted"
)

// Class is why a call that did not complete ended so; a completed call
// has none.
type Class string

const (
	// RuntimeUnavailable is a turn whose program could not start.
	RuntimeUnavailable Class = "runtime_unavailable"
	// RuntimeError is any other error of the runtime.
	RuntimeError Class = "runtime_error"
	// Timeout is a turn ended by the call's time limit.
	Timeout Class = "timeout"
	// Cancelled is a turn ended because the caller cancelled.
	Cancelled Class = "cancelled"
	// Killed is a turn ended by a signal Agister did not send.
	Killed Class = "killed"
	// Refused is a call whose inputs refused it before it started.
	Refused Class = "refused"
)

// ErrNotStarted is what a runtime's error wraps when the turn's program
// could not start.
var ErrNotStarted = errors.New("the program could not start")

// Turn is what a turn is given: the prompt, a script on bash; the
// directory; and the environment, as "KEY=value".
type Turn struct {
	Prompt string
	Dir    string
	Env    []string
}

// Ended is how a turn's program ended and what it wrote: the code it
// exited with, or the name of the signal that ended it.
type Ended struct {
	Code           int
	Signal         string
	Stdout, Stderr Stream
}

// Stream is what the runtime kept of one of the program's streams: its
// head and tail, its size and the digest of the whole.
type Stream struct {
	Head, Tail string
	Size       int64
	Digest     string
}

// Runtime takes a turn: it gives how the turn's program ended, or an error,
// wrapping ErrNotStarted when the program could not start.
type Runtime interface {
	Turn(ctx context.Context, turn Turn) (Ended, error)
}

// Clock tells the time a call's timing is measured by.
type Clock interface {
	Now() time.Time
}

// Timer starts a wait: fired delivers once it has passed, and stop
// releases it.
type Timer func(wait time.Duration) (fired <-chan time.Time, stop func())

// Step is what a call makes its turn of: the prompt; the process's
// environment and the call's inputs, each by its name; its time limit,
// none when zero; and the warnings of its plan.
type Step struct {
	Prompt      string
	Environment map[string]string
	Inputs      map[string]string
	TimeLimit   time.Duration
	Warnings    []string
}

// Result is the result shape: the status and class; the output of a
// completed call; its timing; its cost, nil when unknown, as on bash,
// which reports none; and its warnings.
type Result struct {
	Status   Status
	Class    Class
	Output   map[string]any
	Timing   Timing
	Cost     *float64
	Warnings []string
}

// Timing is when a call started and ended, and how long it took.
type Timing struct {
	Started, Ended time.Time
	Duration       time.Duration
}

// Caller makes calls in a directory, over an environment.
type Caller struct {
	runtime Runtime
	clock   Clock
	timer   Timer
	dir     string
	env     []string
}

// New gives a caller whose turns run on runtime in dir, over env, as
// "KEY=value"; whose timing is read from clock; and whose time limits are
// kept on timer.
func New(runtime Runtime, clock Clock, timer Timer, dir string, env []string) (*Caller, error) {
	switch {
	case runtime == nil:
		return nil, errors.New("call: no runtime")
	case clock == nil:
		return nil, errors.New("call: no clock")
	case timer == nil:
		return nil, errors.New("call: no timer")
	}
	return &Caller{runtime: runtime, clock: clock, timer: timer, dir: dir, env: slices.Clone(env)}, nil
}

var (
	errTimeout    = errors.New("the call's time limit has passed")
	errTurnReturn = errors.New("the turn has returned")
)

// Call makes step's one turn, its environment the caller's, then the
// process's, then each input by its name, and ends it at the step's time
// limit or when ctx ends. A turn whose context the call ended ends
// interrupted, however its program then exited.
func (c *Caller) Call(ctx context.Context, step Step) Result {
	turnCtx, cancel := context.WithCancelCause(ctx)
	started := c.clock.Now()
	watched := c.watch(turnCtx, cancel, step.TimeLimit)
	ended, err := c.runtime.Turn(turnCtx, Turn{Prompt: step.Prompt, Dir: c.dir, Env: c.environment(step)})
	// The cause is fixed once the turn has returned: a limit that passes
	// later ends nothing.
	cancel(errTurnReturn)
	<-watched
	finished := c.clock.Now()

	result := Result{
		Timing:   Timing{Started: started, Ended: finished, Duration: finished.Sub(started)},
		Warnings: slices.Clone(step.Warnings),
	}
	switch cause := context.Cause(turnCtx); {
	case errors.Is(cause, errTimeout):
		result.Status, result.Class = Interrupted, Timeout
	case !errors.Is(cause, errTurnReturn):
		result.Status, result.Class = Interrupted, Cancelled
	case errors.Is(err, ErrNotStarted):
		result.Status, result.Class = Failed, RuntimeUnavailable
	case err != nil:
		result.Status, result.Class = Failed, RuntimeError
	case ended.Signal != "":
		result.Status, result.Class = Failed, Killed
	default:
		result.Status, result.Output = Completed, output(ended)
	}
	return result
}

// watch ends ctx by cancel once limit has passed on the timer, unless ctx
// ends first; no limit is kept when it is zero. The channel it gives is
// closed once it watches no more.
func (c *Caller) watch(ctx context.Context, cancel context.CancelCauseFunc, limit time.Duration) <-chan struct{} {
	watched := make(chan struct{})
	if limit <= 0 {
		close(watched)
		return watched
	}
	fired, stop := c.timer(limit)
	go func() {
		defer close(watched)
		defer stop()
		select {
		case <-fired:
			cancel(errTimeout)
		case <-ctx.Done():
		}
	}()
	return watched
}

// environment is the caller's environment, then the step's process's, then
// its inputs: an entry replaces one of the same name where it is, and the
// names new to it follow, in their order.
func (c *Caller) environment(step Step) []string {
	env := slices.Clone(c.env)
	at := map[string]int{}
	for i, entry := range env {
		name, _, _ := strings.Cut(entry, "=")
		at[name] = i
	}
	set := func(values map[string]string) {
		for _, name := range slices.Sorted(maps.Keys(values)) {
			entry := name + "=" + values[name]
			if i, ok := at[name]; ok {
				env[i] = entry
				continue
			}
			at[name] = len(env)
			env = append(env, entry)
		}
	}
	set(step.Environment)
	set(step.Inputs)
	return env
}

// output is a completed bash call's output: its exit code, and stdout and
// stderr as the runtime kept them.
func output(ended Ended) map[string]any {
	return map[string]any{
		"exit_code": ended.Code,
		"stdout":    stream(ended.Stdout),
		"stderr":    stream(ended.Stderr),
	}
}

func stream(s Stream) map[string]any {
	return map[string]any{"head": s.Head, "tail": s.Tail, "size": s.Size, "digest": s.Digest}
}
