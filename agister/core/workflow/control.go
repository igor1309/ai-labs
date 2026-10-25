package workflow

import (
	"context"
	"fmt"
	"maps"
	"sync"
)

// Repeat runs Steps with explicit state, binding Next after each pass.
type Repeat struct {
	State, Next []Binding
	Steps       []Step
	Until       Condition
	Max         int
}

// execution accounts for calls in sequence or buffers them until a parallel joins.
type execution struct {
	runner *Runner
	count  func(string, Result)
}

func (e execution) sequence(ctx context.Context, steps []Step, read reader, suffix string) Result {
	return e.sequenceAt(ctx, steps, read, "", suffix)
}

func (e execution) sequenceAt(ctx context.Context, steps []Step, read reader, prefix, suffix string) Result {
	for _, step := range steps {
		result := e.itemAt(ctx, step, read, prefix, suffix)
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
	return e.itemAt(ctx, item, read, "", suffix)
}

func (e execution) itemAt(ctx context.Context, item Step, read reader, prefix, suffix string) Result {
	if ctx.Err() != nil {
		return Result{Status: Interrupted, Class: Cancelled}
	}
	name := prefix + item.Name + suffix
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
			result := e.itemAt(ctx, arm, inner, prefix, suffix)
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
			result := refused()
			result.Reason = fmt.Sprintf("the repeat %q's state reads nothing", name)
			return result
		}
		for pass := 1; pass <= repeat.Max; pass++ {
			inner := read
			inner.state, inner.outputs = layered(read.state, state), maps.Clone(read.outputs)
			inner.sessions = maps.Clone(read.sessions)
			result := e.sequenceAt(ctx, repeat.Steps, inner, prefix, fmt.Sprintf("%s/%d", suffix, pass))
			if result.Status != Completed {
				return result
			}
			next, ok := inner.bindings(repeat.Next)
			if !ok {
				result := refused()
				result.Reason = fmt.Sprintf("the repeat %q's next state reads nothing", name)
				return result
			}
			// A name next does not bind keeps its value.
			state = layered(state, next)
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
		calls, reason, ok := e.parallel(ctx, item, read, prefix, suffix)
		if !ok {
			result := refused()
			result.Reason = reason
			return result
		}
		ends := make([]any, len(calls))
		completed := false
		for i, call := range calls {
			for _, accounted := range call.calls {
				e.count(accounted.step, accounted.result)
			}
			read.sessions[item.Parallel[i].Name] = call.Session
			ends[i] = endOf(call.Result)
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
	case item.Workflow != nil:
		if item.Resolver == nil {
			result := refused()
			result.Reason = fmt.Sprintf("the workflow item %q has no resolver", name)
			return result
		}
		params, ok := read.params(item.Bindings)
		if !ok {
			result := refused()
			result.Reason = fmt.Sprintf("the workflow item %q's inputs read nothing", name)
			return result
		}
		boundary, err := item.Resolver.Resolve(ctx, params)
		if err != nil {
			boundary = Boundary{Params: params, Inputs: map[string]string{}}
		}
		e.runner.events.ChildStarted(name, item.WorkflowName, maps.Clone(boundary.Params), maps.Clone(boundary.Inputs))
		inner := reader{boundary: boundary, outputs: map[string]any{}, sessions: map[string]string{}}
		var result Result
		if err != nil {
			result = refused()
			result.Reason = err.Error()
			if ctx.Err() != nil {
				result = Result{Status: Interrupted, Class: Cancelled}
			}
		} else {
			result = e.sequenceAt(ctx, item.Workflow.Steps, inner, prefix+item.Name+"/", suffix)
		}
		if result.Status == Completed {
			output := map[string]any{}
			for _, binding := range item.Workflow.Outputs {
				value, found := inner.value(binding.Value)
				if !found {
					result = refused()
					break
				}
				output[binding.Name] = value
			}
			if result.Status == Completed && len(item.Workflow.Outputs) == 1 && item.Workflow.Outputs[0].Name == "output" {
				result.Output = output["output"]
			} else if result.Status == Completed {
				result.Output = output
			}
		}
		end := ChildEnd{Status: result.Status, Class: result.Class}
		if result.Status == Completed {
			end.Output = result.Output
		}
		e.runner.events.ChildEnded(name, end)
		return result
	default:
		params, session, reason, ok := read.call(item)
		if !ok {
			result := refused()
			result.Reason = reason
			return result
		}
		logical := item.Name
		item.declared, item.Name = prefix+logical, name
		result := e.runner.call(ctx, item, params, session)
		e.count(name, result)
		read.sessions[logical] = result.Session
		return result
	}
}

type accountedCall struct {
	step   string
	result Result
}

type parallelResult struct {
	Result
	calls []accountedCall
}

// parallel runs arbitrary items in declaration order, bounded by Max. Each
// child gets its own view of the parent's boundary and completed outputs.
func (e execution) parallel(ctx context.Context, together Step, read reader, prefix, suffix string) ([]parallelResult, string, bool) {
	items := together.Parallel
	params := len(items)
	if params == 0 {
		return nil, "", true
	}
	for _, child := range items {
		if child.Workflow != nil {
			if _, ok := read.params(child.Bindings); !ok {
				return nil, "", false
			}
			continue
		}
		if _, _, reason, ok := read.call(child); !ok {
			return nil, reason, false
		}
	}
	running := params
	if together.Max > 0 && together.Max < running {
		running = together.Max
	}
	slots := make(chan struct{}, running)
	results := make([]parallelResult, params)
	var all sync.WaitGroup
	for i, child := range items {
		select {
		case slots <- struct{}{}:
		case <-ctx.Done():
		}
		if ctx.Err() != nil {
			results[i].Result = Result{Status: Interrupted, Class: Cancelled, Cost: new(float64)}
			continue
		}
		all.Add(1)
		go func(i int, child Step) {
			defer all.Done()
			defer func() { <-slots }()
			inner := read
			inner.outputs = maps.Clone(read.outputs)
			inner.sessions = maps.Clone(read.sessions)
			childExecution := execution{runner: e.runner, count: func(step string, result Result) {
				results[i].calls = append(results[i].calls, accountedCall{step: step, result: result})
			}}
			results[i].Result = childExecution.itemAt(ctx, child, inner, prefix, suffix)
		}(i, child)
	}
	all.Wait()
	return results, "", true
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
