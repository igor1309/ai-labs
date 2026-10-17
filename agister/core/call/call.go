// Package call makes a call (ADR-001, "Core"; ADR-012, rule 7): one turn
// on the runtime, through the runtime protocol it declares, ended at its
// time limit and given in the result shape (ADR-001, invariant 3); on a
// model, its inputs in its message and its output checked against its
// schema.
package call

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"maps"
	"slices"
	"strings"
	"time"
	"unicode/utf8"
)

// Status is how a call ended.
type Status string

const (
	Completed   Status = "completed"
	Failed      Status = "failed"
	Interrupted Status = "interrupted"
	// Lost is a call that ended without finishing: its turn gave no result.
	Lost Status = "lost"
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
	// InvalidOutput is output its schema rejects, or none where one is
	// given.
	InvalidOutput Class = "invalid_output"
	// RateLimited is a turn the runtime refused for a rate or usage limit.
	RateLimited Class = "rate_limited"
	// Auth is a turn the runtime refused for its credentials.
	Auth Class = "auth"
	// ContextOverflow is a turn larger than the model's context.
	ContextOverflow Class = "context_overflow"
	// NoResult is a turn that ended with no result.
	NoResult Class = "no_result"
)

// known tells whether class is one of core's, a closed set (ADR-001,
// invariant 3).
func known(class Class) bool {
	switch class {
	case RuntimeUnavailable, RuntimeError, Timeout, Cancelled, Killed, Refused,
		InvalidOutput, RateLimited, Auth, ContextOverflow, NoResult:
		return true
	}
	return false
}

// Inputs is how a runtime takes a call's inputs.
type Inputs int

const (
	// InEnvironment is each input a variable of its program's environment.
	InEnvironment Inputs = iota + 1
	// InMessage is each input a section of its message.
	InMessage
)

// ErrNotStarted is what a runtime's error wraps when the turn's program
// could not start.
var ErrNotStarted = errors.New("the program could not start")

// Turn is what a turn is given: the prompt, a script on bash and the
// message on a model; the directory; the environment, as "KEY=value"; the
// instruction, the model and the effort, each empty where not given; the
// options; and the schema, nil where none is given.
type Turn struct {
	Prompt      string
	Dir         string
	Env         []string
	Instruction string
	Model       string
	Effort      string
	Options     []string
	Schema      []byte
}

// Ended is how a turn's program ended and what it wrote: the code it
// exited with, or the name of the signal that ended it; and the reply of a
// model's turn, nil on bash.
type Ended struct {
	Code           int
	Signal         string
	Stdout, Stderr Stream
	Reply          *Reply
}

// Reply is what a model's runtime reported of its turn: its text; its
// structured output, nil for none; its session; its cost in US dollars,
// nil where not reported; its usage; and its failure class and reason,
// empty where it reports none.
type Reply struct {
	Text    string
	Output  []byte
	Session string
	Cost    *float64
	Usage   Usage
	Failure Class
	Reason  string
}

// Usage is the tokens a turn used, each nil where not reported.
type Usage struct {
	Input, Output, CacheRead, CacheWrite, Reasoning *int64
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

// Validator checks a model's output against its schema: an error rejects
// it, and says why.
type Validator interface {
	Validate(schema, output []byte) error
}

// Timer starts a wait: fired delivers once it has passed, and stop
// releases it.
type Timer func(wait time.Duration) (fired <-chan time.Time, stop func())

// Step is what a call makes its turn of: the prompt, the script on bash;
// the process's environment, each value by its name; the call's inputs, in
// the order its process declares them, and its documents, in order, which
// a model takes in its message; the instruction, the model, the effort,
// the options and the schema the turn is given; its time limit, none when
// zero; and the warnings of its plan.
type Step struct {
	Prompt      string
	Environment map[string]string
	Inputs      []Named
	Documents   []Named
	Instruction string
	Model       string
	Effort      string
	Options     []string
	Schema      []byte
	TimeLimit   time.Duration
	Warnings    []string
}

// Named is a text by its name.
type Named struct {
	Name, Text string
}

// Result is the result shape: the status and class; the output of a
// completed call; its timing; its cost, nil when unknown, as on bash,
// which reports none; its usage, nil on bash; the session its runtime
// reported; the reason of a call that did not complete, empty where there
// is none; and its warnings.
type Result struct {
	Status   Status
	Class    Class
	Output   map[string]any
	Timing   Timing
	Cost     *float64
	Usage    *Usage
	Session  string
	Reason   string
	Warnings []string
}

// Timing is when a call started and ended, and how long it took.
type Timing struct {
	Started, Ended time.Time
	Duration       time.Duration
}

// Caller makes calls on one runtime in a directory, over an environment.
type Caller struct {
	runtime   Runtime
	inputs    Inputs
	validator Validator
	clock     Clock
	timer     Timer
	dir       string
	env       []string
}

// New gives a caller whose turns run on runtime, which takes a call's
// inputs as inputs says, in dir, over env, as "KEY=value"; whose output is
// checked by validator; whose timing is read from clock; and whose time
// limits are kept on timer.
func New(runtime Runtime, inputs Inputs, validator Validator, clock Clock, timer Timer, dir string, env []string) (*Caller, error) {
	switch {
	case runtime == nil:
		return nil, errors.New("call: no runtime")
	case inputs != InEnvironment && inputs != InMessage:
		return nil, errors.New("call: no inputs")
	case validator == nil:
		return nil, errors.New("call: no validator")
	case clock == nil:
		return nil, errors.New("call: no clock")
	case timer == nil:
		return nil, errors.New("call: no timer")
	}
	return &Caller{runtime: runtime, inputs: inputs, validator: validator, clock: clock, timer: timer, dir: dir, env: slices.Clone(env)}, nil
}

var (
	errTimeout    = errors.New("the call's time limit has passed")
	errTurnReturn = errors.New("the turn has returned")
)

// Call makes step's one turn, its environment the caller's, then the
// process's, then, where the runtime takes them there, each input by its
// name; and ends it at the step's time limit or when ctx ends. A runtime
// that takes the inputs in its message is given the message of the step's
// inputs and documents in place of its prompt. A turn whose context the
// call ended ends interrupted, however its program then exited; a model's
// turn that ended otherwise ends by its reply. A call whose ctx has
// already ended makes no turn: its program would start, and act, only to
// be ended.
func (c *Caller) Call(ctx context.Context, step Step) Result {
	started := c.clock.Now()
	timed := func() Result {
		finished := c.clock.Now()
		return Result{
			Timing:   Timing{Started: started, Ended: finished, Duration: finished.Sub(started)},
			Warnings: slices.Clone(step.Warnings),
		}
	}
	if ctx.Err() != nil {
		result := timed()
		result.Status, result.Class = Interrupted, Cancelled
		return result
	}
	turnCtx, cancel := context.WithCancelCause(ctx)
	watched := c.watch(turnCtx, cancel, step.TimeLimit)
	ended, err := c.runtime.Turn(turnCtx, c.turn(step))
	// The cause is fixed once the turn has returned: a limit that passes
	// later ends nothing.
	cancel(errTurnReturn)
	<-watched

	result := timed()
	if reply := ended.Reply; err == nil && reply != nil {
		usage := reply.Usage
		result.Usage, result.Session, result.Cost = &usage, reply.Session, reply.Cost
	}
	switch cause := context.Cause(turnCtx); {
	case errors.Is(cause, errTimeout):
		result.Status, result.Class = Interrupted, Timeout
	case !errors.Is(cause, errTurnReturn):
		result.Status, result.Class = Interrupted, Cancelled
	case errors.Is(err, ErrNotStarted):
		result.Status, result.Class, result.Reason = Failed, RuntimeUnavailable, cut(err.Error())
	case err != nil:
		result.Status, result.Class, result.Reason = Failed, RuntimeError, cut(err.Error())
	case ended.Signal != "":
		result.Status, result.Class = Failed, Killed
	case ended.Reply != nil:
		c.replied(&result, step, *ended.Reply)
	default:
		result.Status, result.Output = Completed, output(ended)
	}
	return result
}

// turn is what step's turn is given: its prompt, or, where the runtime
// takes the inputs in its message, the message of its inputs and
// documents.
func (c *Caller) turn(step Step) Turn {
	prompt := step.Prompt
	if c.inputs == InMessage {
		prompt = message(step.Inputs, step.Documents)
	}
	return Turn{
		Prompt:      prompt,
		Dir:         c.dir,
		Env:         c.environment(step),
		Instruction: step.Instruction,
		Model:       step.Model,
		Effort:      step.Effort,
		Options:     slices.Clone(step.Options),
		Schema:      bytes.Clone(step.Schema),
	}
}

// replied ends result by reply: its failure first, a turn that failed not
// checked; then, where step gives a schema, its structured output checked
// against it by the validator, and decoded as the call's output; else its
// text the output.
func (c *Caller) replied(result *Result, step Step, reply Reply) {
	switch failure := reply.Failure; {
	case failure == NoResult:
		result.Status, result.Class, result.Reason = Lost, NoResult, cut(reply.Reason)
	case known(failure):
		result.Status, result.Class, result.Reason = Failed, failure, cut(reply.Reason)
	case failure != "":
		result.Status, result.Class, result.Reason = Failed, RuntimeError, cut(reply.Reason)
	case step.Schema != nil:
		if err := c.validator.Validate(step.Schema, reply.Output); err != nil {
			result.Status, result.Class, result.Reason = Failed, InvalidOutput, cut(err.Error())
			return
		}
		// Numbers are kept as written: a binding gives them on as their
		// JSON, which a float64 would round.
		decoder := json.NewDecoder(bytes.NewReader(reply.Output))
		decoder.UseNumber()
		var output map[string]any
		if err := decoder.Decode(&output); err != nil || output == nil {
			result.Status, result.Class, result.Reason = Failed, InvalidOutput, "the structured output is not a JSON object"
			return
		}
		result.Status, result.Output = Completed, output
	default:
		result.Status, result.Output = Completed, map[string]any{"text": reply.Text}
	}
}

// reasonLimit is the most of a reason a result keeps, in bytes.
const reasonLimit = 1 << 10

// cut is reason cut to reasonLimit, at the start of a character, so that
// it stays text.
func cut(reason string) string {
	if len(reason) <= reasonLimit {
		return reason
	}
	end := reasonLimit
	for end > 0 && !utf8.RuneStart(reason[end]) {
		end--
	}
	return reason[:end]
}

// message is a model's message: a section for each of sections, in order,
// "## <name>", a blank line and its text, fenced where it has a newline;
// the sections apart by a blank line.
func message(sections ...[]Named) string {
	var parts []string
	for _, named := range slices.Concat(sections...) {
		parts = append(parts, "## "+named.Name+"\n\n"+fenced(named.Text))
	}
	return strings.Join(parts, "\n\n")
}

// fenced is text as it is where it has no newline; else between two
// fences, each on its own line, of more backticks than the longest run in
// text, at least three.
func fenced(text string) string {
	if !strings.Contains(text, "\n") {
		return text
	}
	longest, run := 0, 0
	for _, r := range text {
		if r != '`' {
			run = 0
			continue
		}
		run++
		longest = max(longest, run)
	}
	fence := strings.Repeat("`", max(3, longest+1))
	if !strings.HasSuffix(text, "\n") {
		text += "\n"
	}
	return fence + "\n" + text + fence
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

// environment is the caller's environment, then the step's process's, by
// name, then its inputs, in order, where the runtime takes them there: an
// entry replaces one of the same name where it is, and the names new to it
// follow, in their order.
func (c *Caller) environment(step Step) []string {
	env := slices.Clone(c.env)
	at := map[string]int{}
	for i, entry := range env {
		name, _, _ := strings.Cut(entry, "=")
		at[name] = i
	}
	set := func(name, value string) {
		entry := name + "=" + value
		if i, ok := at[name]; ok {
			env[i] = entry
			return
		}
		at[name] = len(env)
		env = append(env, entry)
	}
	for _, name := range slices.Sorted(maps.Keys(step.Environment)) {
		set(name, step.Environment[name])
	}
	if c.inputs == InEnvironment {
		for _, input := range step.Inputs {
			set(input.Name, input.Text)
		}
	}
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
