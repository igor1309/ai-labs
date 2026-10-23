package workflow

import (
	"context"
	"fmt"
	"maps"
)

// Repeat runs Steps with explicit state, binding Next after each pass.
type Repeat struct {
	State, Next []Binding
	Steps       []Step
	Until       Condition
	Max         int
}

// execution owns the accounting shared by every nested item of one run.
type execution struct {
	runner *Runner
	count  func(string, Result)
}

func (e execution) sequence(ctx context.Context, steps []Step, read reader, suffix string) Result {
	for _, step := range steps {
		result := e.item(ctx, step, read, suffix)
		if result.Status != Completed {
			return result
		}
		if step.Parallel == nil {
			read.outputs[step.Name] = result.Output
		}
	}
	return Result{Status: Completed}
}

func refused() Result { return Result{Status: Failed, Class: Refused} }

func (r reader) bindings(bindings []Binding) (map[string]any, bool) {
	bound := map[string]any{}
	for _, binding := range bindings {
		value, ok := r.value(binding.Value)
		if !ok {
			return nil, false
		}
		bound[binding.Name] = value
	}
	return bound, true
}

func (e execution) item(ctx context.Context, item Step, read reader, suffix string) Result {
	if ctx.Err() != nil {
		return Result{Status: Interrupted, Class: Cancelled}
	}
	name := item.Name + suffix
	switch {
	case item.Branch != nil:
		var conditions []ConditionRead
		for _, arm := range item.Branch {
			if arm.If != nil {
				holds, values := read.condition(*arm.If)
				conditions = append(conditions, ConditionRead{Arm: arm.Name, Holds: holds, Read: values})
				if !holds {
					continue
				}
			}
			e.runner.events.Branch(name, arm.Name, conditions)
			inner := read
			inner.outputs = maps.Clone(read.outputs)
			inner.sessions = maps.Clone(read.sessions)
			result := e.item(ctx, arm, inner, suffix)
			if result.Status != Completed {
				return result
			}
			if arm.Parallel == nil {
				inner.outputs[arm.Name] = result.Output
			}
			output, ok := inner.bindings(arm.Outputs)
			if !ok {
				return refused()
			}
			return Result{Status: Completed, Output: output}
		}
		return refused()
	case item.Repeat != nil:
		repeat := item.Repeat
		state, ok := read.bindings(repeat.State)
		if !ok {
			return refused()
		}
		for pass := 1; pass <= repeat.Max; pass++ {
			inner := read
			inner.state, inner.outputs = layered(read.state, state), maps.Clone(read.outputs)
			inner.sessions = maps.Clone(read.sessions)
			result := e.sequence(ctx, repeat.Steps, inner, fmt.Sprintf("%s/%d", suffix, pass))
			if result.Status != Completed {
				return result
			}
			state, ok = inner.bindings(repeat.Next)
			if !ok {
				return refused()
			}
			e.runner.events.Pass(name, pass, state)
			inner.state = layered(read.state, state)
			holds, _ := inner.condition(repeat.Until)
			why := "max"
			if holds {
				why = "until"
			}
			if holds || pass == repeat.Max {
				e.runner.events.Stopped(name, why, pass)
				return Result{Status: Completed, Output: map[string]any{"state": state, "stopped": why, "passes": pass}}
			}
		}
		return refused()
	case item.Parallel != nil:
		together := item
		together.Parallel = append([]Step{}, item.Parallel...)
		for i := range together.Parallel {
			together.Parallel[i].declared = item.Parallel[i].Name
			together.Parallel[i].Name += suffix
		}
		calls, reason, ok := e.runner.parallel(ctx, together, read)
		if !ok {
			result := refused()
			result.Reason = reason
			return result
		}
		ends := make([]any, len(calls))
		completed := false
		for i, call := range calls {
			e.count(together.Parallel[i].Name, call)
			read.sessions[item.Parallel[i].Name] = call.Session
			ends[i] = endOf(call)
			completed = completed || call.Status == Completed
		}
		if ctx.Err() != nil {
			return Result{Status: Interrupted, Class: Cancelled}
		}
		if !completed && len(calls) > 0 {
			return Result{Status: Failed, Class: calls[0].Class, Reason: fmt.Sprintf("no step of parallel %q completed: %s", item.Name, calls[0].Reason)}
		}
		// Parallel outputs are a list, while a call's output is a mapping.
		read.outputs[item.Name] = ends
		return Result{Status: Completed}
	default:
		params, session, reason, ok := read.call(item)
		if !ok {
			result := refused()
			result.Reason = reason
			return result
		}
		logical := item.Name
		item.declared, item.Name = logical, name
		result := e.runner.call(ctx, item, params, session)
		e.count(name, result)
		read.sessions[logical] = result.Session
		return result
	}
}

// layered is the state a repeat's body reads: the enclosing repeats'
// state, own over it.
func layered(enclosing, own map[string]any) map[string]any {
	state := maps.Clone(enclosing)
	if state == nil {
		state = map[string]any{}
	}
	maps.Copy(state, own)
	return state
}
