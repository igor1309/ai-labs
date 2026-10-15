package resolve

import (
	"fmt"
	"slices"
	"strings"
)

// check checks what each workflow and process reached reads, and what
// crosses each boundary (ADR-011, rules 3 and 6). A problem is its
// document's, at the place and origin of what is wrong.
func (w *walk) check() {
	for _, reference := range w.reached {
		switch reference.Kind {
		case KindWorkflow:
			if workflow, ok := w.workflows[reference.Name]; ok {
				w.checkWorkflow(reference, workflow)
			}
		case KindProcess:
			if process, ok := w.processes[reference.Name]; ok {
				w.checkProcess(reference, process)
			}
		}
	}
}

// given checks the params request gives against those workflow declares:
// the workflow's problems where it was requested, its process's where it
// was made of a step.
func (w *walk) given(request Request, workflow Workflow) {
	owner, reference := "workflow", Reference{Kind: KindWorkflow, Name: request.name}
	if request.kind == "" {
		owner, reference = "process", Reference{Kind: KindProcess, Name: request.process}
	}
	for _, param := range workflow.Params {
		if !param.Default && !slices.Contains(request.params, param.Name) {
			w.fault(reference, Problem{Message: fmt.Sprintf("the request gives the param %q, which has no default", param.Name)})
		}
	}
	for _, name := range request.params {
		if !declares(workflow.Params, name) {
			w.fault(reference, Problem{Message: fmt.Sprintf("the %s declares the param %q", owner, name)})
		}
	}
}

// scope is what a document's references may read: its params and inputs;
// in a workflow, its items, each by name, and the item holding each, ""
// for one of its steps.
type scope struct {
	walk      *walk
	reference Reference
	params    []Param
	inputs    []Input
	items     map[string]Item
	holders   map[string]string
}

// at is where a reference reads from: the items that have ended before it,
// those that run beside it, the items it is inside, and the state of the
// repeats it is in.
type at struct {
	ended  map[string]bool
	beside []string
	within []string
	state  []string
}

// with is a with the items names ended too.
func (a at) with(names ...string) at {
	ended := make(map[string]bool, len(a.ended)+len(names))
	for name := range a.ended {
		ended[name] = true
	}
	for _, name := range names {
		ended[name] = true
	}
	a.ended = ended
	return a
}

// inside is a inside the item name.
func (a at) inside(name string) at {
	a.within = append(a.within[:len(a.within):len(a.within)], name)
	return a
}

func (w *walk) checkWorkflow(reference Reference, workflow Workflow) {
	s := &scope{walk: w, reference: reference, params: workflow.Params, inputs: workflow.Inputs,
		items: map[string]Item{}, holders: map[string]string{}}
	s.index(workflow.Steps, "")
	s.arguments(workflow.Inputs)
	s.sequence(workflow.Steps, "steps", at{}, false)
	var steps []string
	for _, item := range workflow.Steps {
		steps = append(steps, item.Name)
	}
	s.bindings(workflow.Outputs, "outputs", at{}.with(steps...))
}

func (w *walk) checkProcess(reference Reference, process Process) {
	s := &scope{walk: w, reference: reference, params: process.Params, inputs: process.Inputs}
	s.bindings(process.Environment, "environment", at{})
	s.arguments(process.Inputs)
	if process.Revision.Value != "" {
		s.read(process.Revision, "workspace.revision", at{})
	}
}

// arguments checks what the arguments of inputs read.
func (s *scope) arguments(inputs []Input) {
	for _, input := range inputs {
		s.bindings(input.Arguments, "inputs."+input.Name, at{})
	}
}

// index records each of items, and those inside them, held by holder.
func (s *scope) index(items []Item, holder string) {
	for _, item := range items {
		s.items[item.Name] = item
		s.holders[item.Name] = holder
		s.index(item.Parallel, item.Name)
		s.index(item.Branch, item.Name)
		if item.Repeat != nil {
			s.index(item.Repeat.Steps, item.Name)
		}
	}
}

// sequence checks items at place, read from a; concurrent items, a
// parallel's or a branch's, do not read one another.
func (s *scope) sequence(items []Item, place string, a at, concurrent bool) {
	if concurrent {
		for _, item := range items {
			a.beside = append(a.beside[:len(a.beside):len(a.beside)], item.Name)
		}
	}
	for i, item := range items {
		s.item(item, fmt.Sprintf("%s[%d]", place, i), a)
		if !concurrent {
			a = a.with(item.Name)
		}
	}
}

func (s *scope) item(item Item, place string, a at) {
	s.condition(item.If, place+".if", a)
	s.bindings(item.Inputs, place+".inputs", a)
	if item.Session.Value != "" {
		s.read(item.Session, place+".session", a)
	}
	inner := a.inside(item.Name)
	switch {
	case item.Process.Value != "":
		if process, ok := s.walk.processes[item.Process.Value]; ok {
			s.boundary(item, place, "process", item.Process.Value, process.Params)
		}
	case item.Workflow.Value != "":
		if child, ok := s.walk.workflows[item.Workflow.Value]; ok {
			s.boundary(item, place, "workflow", item.Workflow.Value, child.Params)
		}
	case item.Parallel != nil:
		s.sequence(item.Parallel, place+".parallel", inner, true)
	case item.Branch != nil:
		s.sequence(item.Branch, place+".branch", inner, true)
		s.arms(item.Branch, place+".branch")
	case item.Repeat != nil:
		repeat := item.Repeat
		s.bindings(repeat.State, place+".repeat.state", inner)
		for _, state := range repeat.State {
			inner.state = append(inner.state[:len(inner.state):len(inner.state)], state.Name)
		}
		s.sequence(repeat.Steps, place+".repeat.steps", inner, false)
		var body []string
		for _, step := range repeat.Steps {
			body = append(body, step.Name)
		}
		s.bindings(repeat.Next, place+".repeat.next", inner.with(body...))
		s.condition(repeat.Until, place+".repeat.until", inner.with(body...))
	}
	// An arm's outputs read the arm itself, once it has ended.
	s.bindings(item.Outputs, place+".outputs", inner.with(item.Name))
}

// boundary checks the inputs item binds against params, those of the
// document of kind and name it names.
func (s *scope) boundary(item Item, place, kind, name string, params []Param) {
	for _, binding := range item.Inputs {
		if !declares(params, binding.Name) {
			s.problem(binding.Origin, place+".inputs."+binding.Name, "the %s %q declares the param %q", kind, name, binding.Name)
		}
	}
	for _, param := range params {
		bound := slices.ContainsFunc(item.Inputs, func(b Binding) bool { return b.Name == param.Name })
		if !param.Default && !bound {
			s.problem(item.Origin, place, "it binds the param %q of the %s %q, which has no default", param.Name, kind, name)
		}
	}
}

// arms checks that every arm of a branch gives each output another arm
// gives: the branch has one output mapping for every path.
func (s *scope) arms(arms []Item, place string) {
	var outputs []string
	for _, arm := range arms {
		for _, output := range arm.Outputs {
			if !slices.Contains(outputs, output.Name) {
				outputs = append(outputs, output.Name)
			}
		}
	}
	for i, arm := range arms {
		for _, output := range outputs {
			if !slices.ContainsFunc(arm.Outputs, func(b Binding) bool { return b.Name == output }) {
				s.problem(arm.Origin, fmt.Sprintf("%s[%d].outputs", place, i), "it gives the output %q, as another arm of its branch does", output)
			}
		}
	}
}

func (s *scope) bindings(bindings []Binding, place string, a at) {
	for _, binding := range bindings {
		if binding.From != "" {
			s.read(Name{Value: binding.From, Origin: binding.Origin}, place+"."+binding.Name, a)
		}
	}
}

func (s *scope) condition(condition Condition, place string, a at) {
	for _, reads := range condition.Reads {
		s.read(reads, place, a)
	}
}

// read checks that reference reads what is there, read from a.
func (s *scope) read(reference Name, place string, a at) {
	parts := strings.Split(reference.Value, ".")
	field := func(i int) string {
		if i < len(parts) {
			return parts[i]
		}
		return ""
	}
	owner := string(s.reference.Kind)
	switch name := field(1); parts[0] {
	case "params":
		if !declares(s.params, name) {
			s.problem(reference.Origin, place, "its %s declares the param %q", owner, name)
		}
	case "inputs":
		if !slices.ContainsFunc(s.inputs, func(i Input) bool { return i.Name == name }) {
			s.problem(reference.Origin, place, "its %s declares the input %q", owner, name)
		}
	case "state":
		if !slices.Contains(a.state, name) {
			s.problem(reference.Origin, place, "it is in no repeat of the state %q", name)
		}
	case "steps":
		s.step(reference, place, a, name, field(2), field(3), len(parts))
	}
}

// step checks a reference to the item name, reading what of it, and of
// that the output field.
func (s *scope) step(reference Name, place string, a at, name, what, field string, parts int) {
	item, known := s.items[name]
	holder := s.holders[name]
	switch {
	case !known:
		s.problem(reference.Origin, place, "its workflow has the item %q", name)
	case holder != "" && !slices.Contains(a.within, holder):
		s.problem(reference.Origin, place, "the item %q is read through the item holding it", name)
	case !a.ended[name] && slices.Contains(a.beside, name):
		s.problem(reference.Origin, place, "the item %q runs beside it", name)
	case !a.ended[name]:
		s.problem(reference.Origin, place, "the item %q has ended before it", name)
	case what != "outputs" && (what != "session" || parts > 3):
		s.problem(reference.Origin, place, "it reads an item's outputs or its session")
	case what == "session" && item.Process.Value == "":
		s.problem(reference.Origin, place, "the item %q is no step, and has no session", name)
	case what == "outputs" && field != "" && item.Workflow.Value != "":
		child, ok := s.walk.workflows[item.Workflow.Value]
		if ok && !slices.ContainsFunc(child.Outputs, func(b Binding) bool { return b.Name == field }) {
			s.problem(reference.Origin, place, "the workflow %q gives the output %q", item.Workflow.Value, field)
		}
	}
}

func (s *scope) problem(origin Origin, place, format string, args ...any) {
	s.walk.fault(s.reference, Problem{Path: origin.Path, Line: origin.Line, Place: place, Message: fmt.Sprintf(format, args...)})
}

// declares is whether params has one named name.
func declares(params []Param, name string) bool {
	return slices.ContainsFunc(params, func(p Param) bool { return p.Name == name })
}
