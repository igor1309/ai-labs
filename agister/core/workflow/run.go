// Package workflow runs a workflow (ADR-001, "Core"; ADR-011): its
// inputs resolved once at its boundary, then its steps in order, each
// called through the one port it declares (ADR-012, rule 1) with its
// process's params bound from the workflow's params and inputs and the
// outputs of the steps before it; and its result, in the result shape
// (ADR-001, invariant 3), read through its output mapping.
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

// Workflow is what a run executes: its params and its inputs, each in its
// order; its steps, in sequence; and its output mapping.
type Workflow struct {
	Params  []Param
	Inputs  []Input
	Steps   []Step
	Outputs []Binding
}

// Param is a param a caller gives, with its default, nil for none.
type Param struct {
	Name    string
	Default *string
}

// Input is an input of the workflow, by name: the source it comes from and
// the arguments the source takes.
type Input struct {
	Name      string
	Source    string
	Arguments []Binding
}

// Step is a step of the workflow, by its name, unique in the workflow, and
// its bindings, which give its process's params.
type Step struct {
	Name     string
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

// Resolver resolves the workflow's params and inputs over the params given.
// An error refuses the run.
type Resolver interface {
	Resolve(ctx context.Context, params []Param, inputs []Input, given map[string]string) (Boundary, error)
}

// Caller calls the step named step, its process's params given by name.
type Caller interface {
	Call(ctx context.Context, step string, params map[string]string) Result
}

// Clock tells the time a run's timing is measured by.
type Clock interface {
	Now() time.Time
}

// Result is the result shape, a call's or a run's: the status and class;
// the output of a completed one; its timing; its cost, nil when unknown;
// and its warnings.
type Result struct {
	Status   Status
	Class    Class
	Output   map[string]any
	Timing   Timing
	Cost     *float64
	Warnings []string
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
	clock    Clock
}

// New gives a runner whose inputs are resolved by resolver, whose steps are
// called by caller, and whose timing is read from clock.
func New(resolver Resolver, caller Caller, clock Clock) (*Runner, error) {
	switch {
	case resolver == nil:
		return nil, errors.New("workflow: no resolver")
	case caller == nil:
		return nil, errors.New("workflow: no caller")
	case clock == nil:
		return nil, errors.New("workflow: no clock")
	}
	return &Runner{resolver: resolver, caller: caller, clock: clock}, nil
}

// Run runs w over the params given: its inputs resolved once, then each
// step in order, until one does not complete. The run's status and class
// are its last call's, its output its output mapping once every step has
// completed, its timing the whole run's, its cost unknown where a call's
// is, and its warnings every call's, in order.
func (r *Runner) Run(ctx context.Context, w Workflow, given map[string]string) Result {
	started := r.clock.Now()
	result := Result{Status: Completed, Cost: new(float64)}
	finish := func() Result {
		ended := r.clock.Now()
		result.Timing = Timing{Started: started, Ended: ended, Duration: ended.Sub(started)}
		return result
	}
	refuse := func() Result {
		result.Status, result.Class, result.Output = Failed, Refused, nil
		return finish()
	}

	boundary, err := r.resolver.Resolve(ctx, w.Params, w.Inputs, given)
	if err != nil {
		return refuse()
	}
	read := reader{boundary: boundary, outputs: map[string]map[string]any{}}
	for _, step := range w.Steps {
		params, ok := read.params(step.Bindings)
		if !ok {
			return refuse()
		}
		called := r.caller.Call(ctx, step.Name, params)
		result.Status, result.Class = called.Status, called.Class
		result.Warnings = append(result.Warnings, called.Warnings...)
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
