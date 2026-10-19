// Package call makes a call (ADR-001, "Core"; ADR-012, rule 7): a turn on
// the runtime, through the runtime protocol it declares, ended at the
// call's time limit or when its staleness port says it went stale (ADR-006,
// rule 2), a stale turn followed by a recovery turn in its session while
// the step's recovery allows (ADR-006, rules 3 to 5), and a turn at
// capacity made again after a wait (ADR-004, rule 8); and given in the
// result shape (ADR-001, invariant 3); on a model, its inputs in its
// message and its output checked against its schema.
package call

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
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
	// BudgetExhausted is a turn ended for making the same tool call too
	// many times in a row.
	BudgetExhausted Class = "budget_exhausted"
	// Capacity is a turn the runtime failed because its model is at
	// capacity.
	Capacity Class = "capacity"
)

// known tells whether class is one of core's, a closed set (ADR-001,
// invariant 3).
func known(class Class) bool {
	switch class {
	case RuntimeUnavailable, RuntimeError, Timeout, Cancelled, Killed, Refused,
		InvalidOutput, RateLimited, Auth, ContextOverflow, NoResult, BudgetExhausted, Capacity:
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
// options; the schema, nil where none is given; and the session it
// resumes, "" for none.
type Turn struct {
	Prompt      string
	Dir         string
	Env         []string
	Instruction string
	Model       string
	Effort      string
	Options     []string
	Schema      []byte
	Session     string
}

// Ended is how a turn's program ended and what it wrote: the code it
// exited with, or the name of the signal that ended it; the session its
// runtime reported, outside the reply, so that a turn a signal ended gives
// it too, "" for none; and the reply of a model's turn, nil on bash.
type Ended struct {
	Code           int
	Signal         string
	Stdout, Stderr Stream
	Session        string
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

// Report is a line a turn read: the tool call it made, where Tool is not
// nil; a tool's result, where Result is set; else another line. A call
// reports besides each turn that went stale, where Stale is not nil, and
// each turn at capacity, where Capacity is not nil; a runtime reports
// none.
type Report struct {
	Tool     *Tool
	Result   bool
	Stale    *StaleTurn
	Capacity *CapacityTurn
}

// StaleTurn is a turn that went stale, as a call reports it: what went
// stale, and whether a recovery turn follows.
type StaleTurn struct {
	What       string
	Recovering bool
}

// CapacityTurn is a turn at capacity, as a call reports it: its reply's
// reason, and the wait before the turn is made again, zero where it is
// not.
type CapacityTurn struct {
	Reason string
	Retry  time.Duration
}

// Tool is a tool call a turn reports: the tool's name and all it was
// given.
type Tool struct {
	Name, Input string
}

// Runtime takes a turn: it gives each line it reads to report, as it
// reads it, and how the turn's program ended, or an error, wrapping
// ErrNotStarted when the program could not start.
type Runtime interface {
	Turn(ctx context.Context, turn Turn, report func(Report)) (Ended, error)
}

// Limits are a turn's staleness limits (ADR-006, rule 1), each none where
// zero: the same tool call made so many times in a row; no result
// following a tool call, its command running, for so long; and nothing at
// all for so long.
type Limits struct {
	RepeatedToolCalls int
	ToolCommand       time.Duration
	NoEvent           time.Duration
}

// Limit is which of a turn's staleness limits was reached.
type Limit int

const (
	RepeatedToolCalls Limit = iota + 1
	ToolCommand
	NoEvent
)

// Stale is what went stale of a turn: the limit reached, and what it says
// of the turn.
type Stale struct {
	Limit Limit
	What  string
}

// Staleness watches a turn against its limits, as the turn starts: report
// is given each line the turn reads, and stale is told what went stale,
// once, when a limit is reached; stop ends the watch, and returns once
// stale will be told nothing more.
type Staleness interface {
	Watch(limits Limits, stale func(Stale)) (report func(Report), stop func())
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
// the options and the schema the turn is given; the session it continues,
// "" for none; its time limit, none when zero; its staleness limits; its
// recovery; and the warnings of its plan.
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
	Session     string
	TimeLimit   time.Duration
	Staleness   Limits
	Recovery    Recovery
	Warnings    []string
}

// Recovery is how many recovery turns a call may make, none when zero, and
// the instruction each is given (ADR-006, rule 3).
type Recovery struct {
	Resumes     int
	Instruction string
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
	staleness Staleness
	clock     Clock
	timer     Timer
	dir       string
	env       []string
}

// New gives a caller whose turns run on runtime, which takes a call's
// inputs as inputs says, in dir, over env, as "KEY=value"; whose output is
// checked by validator; whose turns are watched for staleness by
// staleness; whose timing is read from clock; and whose time limits are
// kept on timer.
func New(runtime Runtime, inputs Inputs, validator Validator, staleness Staleness, clock Clock, timer Timer, dir string, env []string) (*Caller, error) {
	switch {
	case runtime == nil:
		return nil, errors.New("call: no runtime")
	case inputs != InEnvironment && inputs != InMessage:
		return nil, errors.New("call: no inputs")
	case validator == nil:
		return nil, errors.New("call: no validator")
	case staleness == nil:
		return nil, errors.New("call: no staleness")
	case clock == nil:
		return nil, errors.New("call: no clock")
	case timer == nil:
		return nil, errors.New("call: no timer")
	}
	return &Caller{runtime: runtime, inputs: inputs, validator: validator, staleness: staleness, clock: clock, timer: timer, dir: dir, env: slices.Clone(env)}, nil
}

var (
	errTimeout    = errors.New("the call's time limit has passed")
	errTurnReturn = errors.New("the turn has returned")
	errCallReturn = errors.New("the call has returned")
)

// staleCause is the cause of a turn ended for going stale.
type staleCause struct {
	Stale
}

func (s staleCause) Error() string { return s.What }

// Call makes step's turns, each line they report given to report, each's
// environment the caller's, then the process's, then, where the runtime
// takes them there, each input by its name; and ends a turn at the step's
// time limit, when it goes stale, or when ctx ends. A turn is watched for
// staleness only where its step sets a limit, each line it reports given
// to the watch after report. A runtime that takes the inputs in its
// message is given the message of the step's inputs and documents in
// place of its prompt. A turn that goes stale is reported, then followed
// by a recovery turn where the step's recovery has a resume left, the
// turn reported its session and no other than the one it resumed, the
// same words have not gone stale before in this call, and neither ctx nor
// the time limit has ended: the turn as the step gives it, but resuming
// that session, its message the recovery's instruction, a blank line and
// what went stale, watched anew; the time limit is the call's, over all
// its turns. A turn that ends by a reply of the class capacity is reported,
// then, while the call has made fewer than capacityTurns such turns, made
// again as it was given, in the session it reported, else in the one it
// was given, once capacityWait times their count has passed on the timer;
// unless it reported a session other than the one it resumed, ctx or the
// time limit has ended, or the time limit leaves no more than the wait,
// read on the clock: a retry never starts as the limit passes. A retry spends none of the step's recovery. A wait that
// the call's context ends ends the call interrupted. A turn whose context
// the call ended ends the call interrupted, however its program then
// exited; one that reported a session other than the one it resumed fails
// it, however it ended otherwise, since its work went elsewhere; a stale
// one, not recovered, as what went stale says, unless ctx has ended
// meanwhile; a model's turn that ended otherwise ends by its reply, one at
// capacity its reason after how many of capacityTurns were. A call whose
// ctx has already ended makes no turn: its program would start, and act,
// only to be ended.
func (c *Caller) Call(ctx context.Context, step Step, report func(Report)) Result {
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
	callCtx, cancel := context.WithCancelCause(ctx)
	watched := c.watch(callCtx, cancel, step.TimeLimit)
	turn := c.turn(step)
	resumes, went := step.Recovery.Resumes, map[string]bool{}
	var turns []turned
	// atCapacity counts the call's turns at capacity; interrupted is the
	// cause of the call's context where it ended a wait.
	atCapacity, interrupted := 0, error(nil)
	for {
		last := c.take(callCtx, turn, step.Staleness, report)
		turns = append(turns, last)
		if reason, ok := last.atCapacity(); ok {
			atCapacity++
			wait := time.Duration(atCapacity) * capacityWait
			left := step.TimeLimit - c.clock.Now().Sub(started)
			if atCapacity == capacityTurns || last.strayed != "" || callCtx.Err() != nil || step.TimeLimit > 0 && left <= wait {
				wait = 0
			}
			report(Report{Capacity: &CapacityTurn{Reason: reason, Retry: wait}})
			if wait == 0 {
				break
			}
			if !c.pause(callCtx, wait) {
				interrupted = context.Cause(callCtx)
				break
			}
			if session := last.session(); session != "" {
				turn.Session = session
			}
			continue
		}
		var stale staleCause
		if !errors.As(last.cause, &stale) || ctx.Err() != nil {
			break
		}
		session := last.session()
		recovering := resumes > 0 && session != "" && last.strayed == "" && !went[stale.What] && callCtx.Err() == nil
		report(Report{Stale: &StaleTurn{What: stale.What, Recovering: recovering}})
		if !recovering {
			break
		}
		resumes--
		went[stale.What] = true
		turn = c.turn(step)
		turn.Prompt, turn.Session = step.Recovery.Instruction+"\n\n"+stale.What, session
	}
	// The cause is fixed once the call has returned: a limit that passes
	// later ends nothing.
	cancel(errCallReturn)
	<-watched

	result := timed()
	counted(&result, turns)
	switch {
	case errors.Is(interrupted, errTimeout):
		result.Status, result.Class = Interrupted, Timeout
	case interrupted != nil:
		result.Status, result.Class = Interrupted, Cancelled
	default:
		c.end(&result, step, turns[len(turns)-1], ctx.Err() != nil, atCapacity)
	}
	return result
}

// capacityTurns is the most turns at capacity a call makes; the wait
// before a retry is capacityWait times how many turns were at capacity,
// fixed rather than drawn at random: the load is the provider's, which
// the few calls of a run retrying together do not change.
const (
	capacityTurns = 3
	capacityWait  = 30 * time.Second
)

// pause waits wait on the timer, unless ctx ends first, and tells whether
// the wait passed with ctx still running.
func (c *Caller) pause(ctx context.Context, wait time.Duration) bool {
	fired, stop := c.timer(wait)
	defer stop()
	select {
	case <-fired:
		return ctx.Err() == nil
	case <-ctx.Done():
		return false
	}
}

// turned is how one of a call's turns ended: what its runtime gave, the
// cause its context ended with, and why its work went elsewhere, "" where
// it did not.
type turned struct {
	ended   Ended
	err     error
	cause   error
	strayed string
}

// atCapacity is the reason of the turn's reply, and whether the turn ended
// by that reply, of the class capacity: it returned of itself, with no
// error and no signal.
func (t turned) atCapacity() (string, bool) {
	reply := t.ended.Reply
	if !errors.Is(t.cause, errTurnReturn) || t.err != nil || t.ended.Signal != "" || reply == nil || reply.Failure != Capacity {
		return "", false
	}
	return reply.Reason, true
}

// session is the session the turn reported, its end's, else its reply's;
// "" for none.
func (t turned) session() string {
	if t.ended.Session != "" {
		return t.ended.Session
	}
	if reply := t.ended.Reply; t.err == nil && reply != nil {
		return reply.Session
	}
	return ""
}

// strayed is why a turn that resumed the session resumed, "" for none,
// and ended as ended and err say, did its work elsewhere: a session it
// reported, at its end or in its reply, other than that one; "" where it
// reported none other.
func strayed(resumed string, ended Ended, err error) string {
	reported := []string{ended.Session}
	if reply := ended.Reply; err == nil && reply != nil {
		reported = append(reported, reply.Session)
	}
	for _, session := range reported {
		if resumed != "" && session != "" && session != resumed {
			return cut(fmt.Sprintf("the turn reported the session %q, not %q", session, resumed))
		}
	}
	return ""
}

// take takes turn within ctx, watched against limits where any is set,
// each line it reports given to report, then to the watch.
func (c *Caller) take(ctx context.Context, turn Turn, limits Limits, report func(Report)) turned {
	turnCtx, cancel := context.WithCancelCause(ctx)
	reported, unwatch := report, func() {}
	if limits != (Limits{}) {
		watching, stop := c.staleness.Watch(limits, func(s Stale) { cancel(staleCause{s}) })
		reported, unwatch = func(r Report) { report(r); watching(r) }, stop
	}
	ended, err := c.runtime.Turn(turnCtx, turn, reported)
	// The cause is fixed once the turn has returned: a watch that tells
	// later ends nothing.
	cancel(errTurnReturn)
	unwatch()
	return turned{ended: ended, err: err, cause: context.Cause(turnCtx), strayed: strayed(turn.Session, ended, err)}
}

// counted gives result what its turns reported: the session the last that
// reported one reported; and, where any gave a reply, its cost and each
// count of its usage, the sum of its turns', unknown where any turn
// reported none (ADR-001, invariant 3), as a turn with no reply does.
func counted(result *Result, turns []turned) {
	replied := false
	costs, usages := make([]*float64, len(turns)), make([]Usage, len(turns))
	for i, t := range turns {
		if session := t.session(); session != "" {
			result.Session = session
		}
		if reply := t.ended.Reply; t.err == nil && reply != nil {
			replied, costs[i], usages[i] = true, reply.Cost, reply.Usage
		}
	}
	if !replied {
		return
	}
	count := func(of func(Usage) *int64) *int64 {
		counts := make([]*int64, len(usages))
		for i, usage := range usages {
			counts[i] = of(usage)
		}
		return total(counts)
	}
	result.Cost = total(costs)
	result.Usage = &Usage{
		Input:      count(func(u Usage) *int64 { return u.Input }),
		Output:     count(func(u Usage) *int64 { return u.Output }),
		CacheRead:  count(func(u Usage) *int64 { return u.CacheRead }),
		CacheWrite: count(func(u Usage) *int64 { return u.CacheWrite }),
		Reasoning:  count(func(u Usage) *int64 { return u.Reasoning }),
	}
}

// total is the sum of values, nil where any is.
func total[T int64 | float64](values []*T) *T {
	var sum T
	for _, value := range values {
		if value == nil {
			return nil
		}
		sum += *value
	}
	return &sum
}

// end ends result as the call's last turn, last, ended it, the call's
// ctx ended where cancelled, atCapacity of its turns at capacity.
func (c *Caller) end(result *Result, step Step, last turned, cancelled bool, atCapacity int) {
	var stale staleCause
	isStale := errors.As(last.cause, &stale)
	switch cause, err, ended := last.cause, last.err, last.ended; {
	case errors.Is(cause, errTimeout):
		result.Status, result.Class = Interrupted, Timeout
	case isStale && cancelled, !isStale && !errors.Is(cause, errTurnReturn):
		result.Status, result.Class = Interrupted, Cancelled
	case last.strayed != "":
		result.Status, result.Class, result.Reason = Failed, RuntimeError, last.strayed
	case isStale:
		result.Status, result.Class, result.Reason = Interrupted, Timeout, cut(stale.What)
		// A turn that repeats itself makes no progress, whatever time is
		// left (ADR-006, rule 2).
		if stale.Limit == RepeatedToolCalls {
			result.Status, result.Class = Failed, BudgetExhausted
		}
	case errors.Is(err, ErrNotStarted):
		result.Status, result.Class, result.Reason = Failed, RuntimeUnavailable, cut(err.Error())
	case err != nil:
		result.Status, result.Class, result.Reason = Failed, RuntimeError, cut(err.Error())
	case ended.Signal != "":
		result.Status, result.Class = Failed, Killed
	case ended.Reply != nil:
		c.replied(result, step, *ended.Reply, atCapacity)
	default:
		result.Status, result.Output = Completed, output(ended)
	}
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
		Session:     step.Session,
	}
}

// replied ends result by reply: its failure first, a turn that failed
// not checked, one at capacity its reason after how many, atCapacity, of
// capacityTurns were; then, where step gives a schema, its structured
// output checked against it by the validator, and decoded as the call's
// output; else its text the output.
func (c *Caller) replied(result *Result, step Step, reply Reply, atCapacity int) {
	switch failure := reply.Failure; {
	case failure == Capacity:
		result.Status, result.Class = Failed, Capacity
		result.Reason = cut(fmt.Sprintf("%d of %d turns at capacity: %s", atCapacity, capacityTurns, reply.Reason))
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
