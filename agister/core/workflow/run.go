// Package workflow runs a workflow (ADR-001, "Core"; ADR-011): its
// inputs resolved once at its boundary, then its items in order, a step or
// a parallel of steps called at once, each step called through the one
// port it declares (ADR-012, rule 1) with its process's params bound from
// the workflow's params and inputs and the outputs of the items before it,
// what each is doing told to its events; and its result, in the result
// shape (ADR-001, invariant 3), read through its output mapping.
package workflow

import (
	"context"
	"encoding/json"
	"errors"
	"sync"
	"sync/atomic"
	"time"
)

// Status is how a call or a run ended.
type Status string

const (
	// Completed is a call or a run that produced its output.
	Completed Status = "completed"
	// Failed is a run refused; a run that ended otherwise ends in its last
	// call's status.
	Failed Status = "failed"
	// Interrupted is a call or a run ended before it finished, a run
	// cancelled among them.
	Interrupted Status = "interrupted"
)

// Class is why a call or a run that did not complete ended so.
type Class string

const (
	// Refused is a run whose inputs, a step's bindings or its output
	// mapping could not be resolved: no later step starts.
	Refused Class = "refused"
	// Cancelled is a run whose context ended: no later item starts.
	Cancelled Class = "cancelled"
)

// Workflow is what a run executes: its items, in sequence, and its output
// mapping.
type Workflow struct {
	Steps   []Step
	Outputs []Binding
}

// Step is an item of the workflow, by its name, unique in the workflow: a
// step, the agent it runs on and its bindings, which give its process's
// params; or, where Parallel is not nil, a parallel of the steps it holds,
// called at once (ADR-011, rule 2).
type Step struct {
	Name     string
	Agent    string
	Bindings []Binding
	Parallel []Step
}

// Binding is a value given by name.
type Binding struct {
	Name  string
	Value Value
}

// Value is a text, or, when Reads is not nil, what it reads.
type Value struct {
	Text  string
	Reads *Reference
}

// Reference reads a param or an input, by Name, or the outputs of the step
// Name, or one Field of them, "" for the whole, and in Path the fields
// read within that Field, in order.
type Reference struct {
	Of    Scope
	Name  string
	Field string
	Path  []string
}

// Scope is what a reference reads.
type Scope int

const (
	Params Scope = iota + 1
	Inputs
	Outputs
)

// Boundary is the workflow's params, a param not given taking its default,
// and its inputs' values, each by its name.
type Boundary struct {
	Params map[string]string
	Inputs map[string]string
}

// Resolver resolves the workflow's boundary over the params given: what
// the workflow declares of its params and inputs is the resolver's. An
// error refuses the run, its words the run's reason.
type Resolver interface {
	Resolve(ctx context.Context, given map[string]string) (Boundary, error)
}

// Caller calls the step named step, its process's params given by name,
// and gives report that the call starts, or the id of a call it took in
// place of making one; then each tool call its turns report, each turn
// that went stale and each turn at capacity. It is called from many
// goroutines at once, one for each step of a parallel.
type Caller interface {
	Call(ctx context.Context, step string, params map[string]string, report func(Report)) Result
}

// Report is what a step's call reports: that it starts, where Started;
// the id of the call it took in place of making one, where Reused is not
// ""; a tool call, where Tool is not nil; a stale turn, where Stale is not
// nil; else a turn at capacity, where Capacity is not nil.
type Report struct {
	Started  bool
	Reused   string
	Tool     *Tool
	Stale    *Stale
	Capacity *Capacity
}

// Tool is a tool call a step's turn reports: the tool's name and what it
// was given.
type Tool struct {
	Name, Input string
}

// Stale is a step's turn that went stale: what went stale, and whether a
// recovery turn follows.
type Stale struct {
	What       string
	Recovering bool
}

// Capacity is a step's turn at capacity: its reason, and the wait before
// it is made again, zero where it is not.
type Capacity struct {
	Reason string
	Retry  time.Duration
}

// Events is told what each step of a run is doing, by the step's name: that
// it started, on its agent, or that it took the call of the id call in
// place of making one; each tool call its turns report, each turn that
// went stale and each turn at capacity; and how a step that started ended.
// It is told from many goroutines at once, one for each step of a
// parallel.
type Events interface {
	Started(step, agent string)
	Reused(step, call string)
	Tool(step string, tool Tool)
	Stale(step string, stale Stale)
	Capacity(step string, capacity Capacity)
	Ended(step string, ended Ended)
}

// Ended is how a step's call ended: its status and class, and how long it
// took.
type Ended struct {
	Status   Status
	Class    Class
	Duration time.Duration
}

// Clock tells the time a run's timing is measured by.
type Clock interface {
	Now() time.Time
}

// Result is the result shape, a call's or a run's: the status and class;
// the output of a completed one; its timing; its cost, nil when unknown;
// its usage; a call's session, empty where none was reported, and a run's
// sessions, each step's name to its call's session; the reason of one that
// did not complete, empty where there is none; and its warnings.
type Result struct {
	Status   Status
	Class    Class
	Output   map[string]any
	Timing   Timing
	Cost     *float64
	Usage    Usage
	Session  string
	Sessions map[string]string
	Reason   string
	Warnings []string
}

// Usage is the tokens a call or a run used, each nil where not reported.
type Usage struct {
	Input, Output, CacheRead, CacheWrite, Reasoning *int64
}

// add is usage with called's counts added, a count nil only where neither
// reported it.
func (u Usage) add(called Usage) Usage {
	sum := func(a, b *int64) *int64 {
		switch {
		case a == nil:
			return b
		case b == nil:
			return a
		}
		total := *a + *b
		return &total
	}
	return Usage{
		Input:      sum(u.Input, called.Input),
		Output:     sum(u.Output, called.Output),
		CacheRead:  sum(u.CacheRead, called.CacheRead),
		CacheWrite: sum(u.CacheWrite, called.CacheWrite),
		Reasoning:  sum(u.Reasoning, called.Reasoning),
	}
}

// Timing is when a call or a run started and ended, and how long it took.
type Timing struct {
	Started, Ended time.Time
	Duration       time.Duration
}

// Runner runs workflows.
type Runner struct {
	resolver Resolver
	caller   Caller
	events   Events
	clock    Clock
}

// New gives a runner whose inputs are resolved by resolver, whose steps are
// called by caller, what each is doing told to events, and whose timing is
// read from clock.
func New(resolver Resolver, caller Caller, events Events, clock Clock) (*Runner, error) {
	switch {
	case resolver == nil:
		return nil, errors.New("workflow: no resolver")
	case caller == nil:
		return nil, errors.New("workflow: no caller")
	case events == nil:
		return nil, errors.New("workflow: no events")
	case clock == nil:
		return nil, errors.New("workflow: no clock")
	}
	return &Runner{resolver: resolver, caller: caller, events: events, clock: clock}, nil
}

// Run runs w over the params given: its inputs resolved once, then each
// item in order, until a step in sequence does not complete or the run is
// cancelled, each step's start on its agent or the call it reused, tool
// calls, stale turns, turns at capacity and end told to the events as its
// caller reports
// them. A parallel calls its steps at once and ends once
// all have ended: completed, its outputs each step's end, in declaration
// order, whatever each ended as; a run cancelled meanwhile ends with it,
// interrupted, cancelled. The run's status, class and reason are its last
// item's, its output its output mapping once every item has completed, its
// timing the whole run's, its cost unknown where a call's is, its usage the
// sum of what its calls reported, its sessions each step's whose call
// reported one, and its warnings every call's, in declaration order.
func (r *Runner) Run(ctx context.Context, w Workflow, given map[string]string) Result {
	started := r.clock.Now()
	result := Result{Status: Completed, Cost: new(float64), Sessions: map[string]string{}}
	finish := func() Result {
		ended := r.clock.Now()
		result.Timing = Timing{Started: started, Ended: ended, Duration: ended.Sub(started)}
		return result
	}
	refuse := func() Result {
		result.Status, result.Class, result.Output = Failed, Refused, nil
		return finish()
	}
	cancelled := func() Result {
		result.Status, result.Class, result.Reason = Interrupted, Cancelled, ""
		return finish()
	}
	count := func(step string, called Result) {
		result.Warnings = append(result.Warnings, called.Warnings...)
		result.Usage = result.Usage.add(called.Usage)
		if called.Session != "" {
			result.Sessions[step] = called.Session
		}
		if result.Cost != nil && called.Cost != nil {
			*result.Cost += *called.Cost
		} else {
			result.Cost = nil
		}
	}

	boundary, err := r.resolver.Resolve(ctx, given)
	if err != nil {
		result.Reason = err.Error()
		return refuse()
	}
	read := reader{boundary: boundary, outputs: map[string]any{}}
	for _, item := range w.Steps {
		if ctx.Err() != nil {
			return cancelled()
		}
		if item.Parallel != nil {
			calls, ok := r.parallel(ctx, item.Parallel, read)
			if !ok {
				return refuse()
			}
			ends := make([]any, len(item.Parallel))
			for i, step := range item.Parallel {
				count(step.Name, calls[i])
				ends[i] = endOf(calls[i])
			}
			if ctx.Err() != nil {
				return cancelled()
			}
			result.Status, result.Class, result.Reason = Completed, "", ""
			read.outputs[item.Name] = ends
			continue
		}
		params, ok := read.params(item.Bindings)
		if !ok {
			return refuse()
		}
		called := r.call(ctx, item, params)
		count(item.Name, called)
		result.Status, result.Class, result.Reason = called.Status, called.Class, called.Reason
		if called.Status != Completed {
			return finish()
		}
		read.outputs[item.Name] = called.Output
	}
	result.Output = map[string]any{}
	for _, output := range w.Outputs {
		value, ok := read.value(output.Value)
		if !ok {
			return refuse()
		}
		result.Output[output.Name] = value
	}
	return finish()
}

// parallel calls each of steps at once, its params bound by read, and
// gives each call's result, in declaration order, once all have ended. It
// is false, nothing called, when a binding reads what is not there.
func (r *Runner) parallel(ctx context.Context, steps []Step, read reader) ([]Result, bool) {
	params := make([]map[string]string, len(steps))
	for i, step := range steps {
		bound, ok := read.params(step.Bindings)
		if !ok {
			return nil, false
		}
		params[i] = bound
	}
	calls := make([]Result, len(steps))
	var all sync.WaitGroup
	for i, step := range steps {
		all.Add(1)
		go func() {
			defer all.Done()
			calls[i] = r.call(ctx, step, params[i])
		}()
	}
	all.Wait()
	return calls, true
}

// call calls step with params, its start or the call it reused, its tool
// calls, stale turns and turns at capacity told to the events by its name
// as the caller reports them, and its end once it has ended, where it started.
func (r *Runner) call(ctx context.Context, step Step, params map[string]string) Result {
	// A caller may report from a goroutine of its own, as a turn's tool
	// calls come from the one reading its program's output.
	var started atomic.Bool
	called := r.caller.Call(ctx, step.Name, params, func(report Report) {
		switch {
		case report.Started:
			started.Store(true)
			r.events.Started(step.Name, step.Agent)
		case report.Reused != "":
			r.events.Reused(step.Name, report.Reused)
		case report.Tool != nil:
			r.events.Tool(step.Name, *report.Tool)
		case report.Stale != nil:
			r.events.Stale(step.Name, *report.Stale)
		case report.Capacity != nil:
			r.events.Capacity(step.Name, *report.Capacity)
		}
	})
	if started.Load() {
		r.events.Ended(step.Name, Ended{Status: called.Status, Class: called.Class, Duration: called.Timing.Duration})
	}
	return called
}

// endOf is how a step of a parallel ended, as its outputs give it to what
// reads them: its status, its class, null where none, and its output, null
// where it did not complete.
func endOf(called Result) map[string]any {
	end := map[string]any{"status": string(called.Status), "class": nil, "output": nil}
	if called.Class != "" {
		end["class"] = string(called.Class)
	}
	if called.Status == Completed {
		end["output"] = called.Output
	}
	return end
}

// reader reads values from the workflow's boundary and the outputs of its
// completed items: a step's its fields, a parallel's the list of its steps'
// ends.
type reader struct {
	boundary Boundary
	outputs  map[string]any
}

// params is each binding's value, given as text: a value that is not text
// as its JSON. It is false when a binding reads what is not there.
func (r reader) params(bindings []Binding) (map[string]string, bool) {
	params := map[string]string{}
	for _, binding := range bindings {
		value, ok := r.value(binding.Value)
		if !ok {
			return nil, false
		}
		if text, ok := value.(string); ok {
			params[binding.Name] = text
			continue
		}
		encoded, err := json.Marshal(value)
		if err != nil {
			return nil, false
		}
		params[binding.Name] = string(encoded)
	}
	return params, true
}

// value is value's text, or what it reads; false when that is not there.
func (r reader) value(value Value) (any, bool) {
	if value.Reads == nil {
		return value.Text, true
	}
	ref := *value.Reads
	switch ref.Of {
	case Params:
		text, ok := r.boundary.Params[ref.Name]
		return text, ok
	case Inputs:
		text, ok := r.boundary.Inputs[ref.Name]
		return text, ok
	case Outputs:
		output, ok := r.outputs[ref.Name]
		if !ok || ref.Field == "" {
			return output, ok
		}
		fields, ok := output.(map[string]any)
		if !ok {
			return nil, false
		}
		field, ok := fields[ref.Field]
		for _, name := range ref.Path {
			if !ok {
				break
			}
			var within map[string]any
			if within, ok = field.(map[string]any); ok {
				field, ok = within[name]
			}
		}
		return field, ok
	}
	return nil, false
}
