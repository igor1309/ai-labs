// Package workflow runs a workflow (ADR-001, "Core"; ADR-011): its
// inputs resolved once at its boundary, then its steps in order, each
// called through the one port it declares (ADR-012, rule 1) with its
// process's params bound from the workflow's params and inputs and the
// outputs of the steps before it, what each is doing told to its events;
// and its result, in the result shape (ADR-001, invariant 3), read through
// its output mapping.
package workflow

import (
	"context"
	"encoding/json"
	"errors"
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
)

// Class is why a call or a run that did not complete ended so.
type Class string

// Refused is a run whose inputs, a step's bindings or its output mapping
// could not be resolved: no later step starts.
const Refused Class = "refused"

// Workflow is what a run executes: its steps, in sequence, and its output
// mapping.
type Workflow struct {
	Steps   []Step
	Outputs []Binding
}

// Step is a step of the workflow, by its name, unique in the workflow; the
// agent it runs on; and its bindings, which give its process's params.
type Step struct {
	Name     string
	Agent    string
	Bindings []Binding
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
// and gives each tool call its turn reports to report.
type Caller interface {
	Call(ctx context.Context, step string, params map[string]string, report func(Tool)) Result
}

// Tool is a tool call a step's turn reports: the tool's name and what it
// was given.
type Tool struct {
	Name, Input string
}

// Events is told what each step of a run is doing, by the step's name: that
// it started, on its agent; each tool call its turn reports; and how it
// ended.
type Events interface {
	Started(step, agent string)
	Tool(step string, tool Tool)
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
// step in order, until one does not complete, each step's start on its
// agent, tool calls and end told to the events as they come. The run's
// status, class and reason are its last call's, its output its output
// mapping once every step has completed, its timing the whole run's, its
// cost unknown where a call's is, its usage the sum of what its calls
// reported, its sessions each step's whose call reported one, and its
// warnings every call's, in order.
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

	boundary, err := r.resolver.Resolve(ctx, given)
	if err != nil {
		result.Reason = err.Error()
		return refuse()
	}
	read := reader{boundary: boundary, outputs: map[string]map[string]any{}}
	for _, step := range w.Steps {
		params, ok := read.params(step.Bindings)
		if !ok {
			return refuse()
		}
		r.events.Started(step.Name, step.Agent)
		called := r.caller.Call(ctx, step.Name, params, func(tool Tool) { r.events.Tool(step.Name, tool) })
		r.events.Ended(step.Name, Ended{Status: called.Status, Class: called.Class, Duration: called.Timing.Duration})
		result.Status, result.Class, result.Reason = called.Status, called.Class, called.Reason
		result.Warnings = append(result.Warnings, called.Warnings...)
		result.Usage = result.Usage.add(called.Usage)
		if called.Session != "" {
			result.Sessions[step.Name] = called.Session
		}
		if result.Cost != nil && called.Cost != nil {
			*result.Cost += *called.Cost
		} else {
			result.Cost = nil
		}
		if called.Status != Completed {
			return finish()
		}
		read.outputs[step.Name] = called.Output
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

// reader reads values from the workflow's boundary and the outputs of its
// completed steps.
type reader struct {
	boundary Boundary
	outputs  map[string]map[string]any
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
		field, ok := output[ref.Field]
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
