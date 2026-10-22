package resolve

import (
	"fmt"
	"slices"
)

// check checks what each workflow and process reached reads, and what
// crosses each boundary (ADR-011, rules 3 and 6); and the fallback of each
// agent reached. A problem is its document's, at the origin of what is
// wrong.
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
		case KindAgent:
			if agent, ok := w.agents[reference.Name]; ok {
				w.checkAgent(reference, agent)
			}
		}
	}
}

// checkAgent checks the agent its fallback names: another agent, which
// resolves. It is checked once every agent is followed, for agents may
// fall back to each other.
func (w *walk) checkAgent(reference Reference, agent Agent) {
	fallback := agent.Fallback
	switch _, resolves := w.agents[fallback.Value]; {
	case fallback.Value == "":
	case fallback.Value == agent.Name:
		w.fault(reference, Problem{Origin: fallback.Origin, Message: "it names another agent"})
	case !resolves:
		w.fault(reference, Problem{Origin: fallback.Origin, Message: "it names an agent that resolves"})
	}
}

// given is the request's problems: the params it gives against those
// workflow declares, its process's where it was made of a step. They are
// the request's, of no document.
func given(request Request, workflow Workflow) []Problem {
	owner := "workflow"
	if request.kind == "" {
		owner = "process"
	}
	var problems []Problem
	for _, param := range workflow.Params {
		if !param.Default && !slices.Contains(request.params, param.Name) {
			problems = append(problems, Problem{Message: fmt.Sprintf("the request gives the param %q, which has no default", param.Name)})
		}
	}
	for _, name := range request.params {
		if !declares(workflow.Params, name) {
			problems = append(problems, Problem{Message: fmt.Sprintf("the %s declares the param %q", owner, name)})
		}
	}
	return problems
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
// those that run beside it, the other arms of the branches it is in, the
// items it is inside, and the state of the repeats it is in.
type at struct {
	ended  map[string]bool
	beside []string
	arms   []string
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
	s.sequence(workflow.Steps, at{})
	var steps []string
	for _, item := range workflow.Steps {
		steps = append(steps, item.Name)
	}
	s.bindings(workflow.Outputs, at{}.with(steps...))
}

func (w *walk) checkProcess(reference Reference, process Process) {
	s := &scope{walk: w, reference: reference, params: process.Params, inputs: process.Inputs}
	s.bindings(process.Environment, at{})
	s.arguments(process.Inputs)
	if process.Revision != nil {
		s.read(*process.Revision, at{})
	}
}

// arguments checks what the arguments of inputs read.
func (s *scope) arguments(inputs []Input) {
	for _, input := range inputs {
		s.bindings(input.Arguments, at{})
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

// sequence checks items, read from a, each after the one before it.
func (s *scope) sequence(items []Item, a at) {
	for _, item := range items {
		s.item(item, a)
		a = a.with(item.Name)
	}
}

// together checks items, read from a, none after another: a parallel's,
// which run beside one another, or a branch's arms, of which one runs. Two
// steps of a parallel do not continue one session: two turns at once in
// one session are not run. The later is at fault.
func (s *scope) together(items []Item, a at, arms bool) {
	for _, item := range items {
		if arms {
			a.arms = append(a.arms[:len(a.arms):len(a.arms)], item.Name)
		} else {
			a.beside = append(a.beside[:len(a.beside):len(a.beside)], item.Name)
		}
	}
	firsts := make([]string, len(items))
	for i, item := range items {
		firsts[i] = s.item(item, a)
		if arms || firsts[i] == "" {
			continue
		}
		if j := slices.Index(firsts[:i], firsts[i]); j >= 0 {
			s.problem(item.Session.Origin, "the step %q beside it continues the session of %q", items[j].Name, firsts[i])
		}
	}
}

// item checks item, read from a, and gives the first step of the session
// it continues, "" for none or one it cannot continue.
func (s *scope) item(item Item, a at) string {
	s.condition(item.If, a)
	s.bindings(item.Inputs, a)
	first := s.session(item, a)
	inner := a.inside(item.Name)
	switch {
	case item.Process.Value != "":
		if process, ok := s.walk.processes[item.Process.Value]; ok {
			s.boundary(item, "process", item.Process.Value, process.Params)
		}
	case item.Workflow.Value != "":
		if child, ok := s.walk.workflows[item.Workflow.Value]; ok {
			s.boundary(item, "workflow", item.Workflow.Value, child.Params)
		}
	case item.Parallel != nil:
		s.together(item.Parallel, inner, false)
	case item.Branch != nil:
		s.together(item.Branch, inner, true)
		s.arms(item.Branch)
	case item.Repeat != nil:
		repeat := item.Repeat
		s.bindings(repeat.State, inner)
		for _, state := range repeat.State {
			inner.state = append(inner.state[:len(inner.state):len(inner.state)], state.Name)
		}
		s.sequence(repeat.Steps, inner)
		var body []string
		for _, step := range repeat.Steps {
			body = append(body, step.Name)
		}
		s.bindings(repeat.Next, inner.with(body...))
		s.condition(repeat.Until, inner.with(body...))
	}
	// An arm's outputs read the arm itself, once it has ended.
	s.bindings(item.Outputs, inner.with(item.Name))
	return first
}

// session checks the session item continues, read from a, and gives the
// first step of it, followed back through the steps each continues; ""
// for none, or for one it cannot continue. A step continues an earlier
// step's session, and reads nothing else there (ADR-011, rule 3); that
// step is on its agent: a session belongs to its runtime, and one agent is
// the plainest same runtime.
func (s *scope) session(item Item, a at) string {
	session := item.Session
	switch {
	case session == nil:
		return ""
	case session.Root != RootSession:
		s.problem(session.Origin, "it reads a step's session")
		return ""
	case !s.step(*session, a):
		return ""
	}
	if from := s.items[session.Name]; from.Agent.Value != item.Agent.Value {
		s.problem(session.Origin, "the step %q runs on another agent, %q", session.Name, from.Agent.Value)
		return ""
	}
	// A chain whose reference is at fault may loop: the bound ends it.
	first := session.Name
	for range len(s.items) {
		from := s.items[first].Session
		if from == nil || from.Root != RootSession {
			break
		}
		if _, known := s.items[from.Name]; !known {
			break
		}
		first = from.Name
	}
	return first
}

// boundary checks the inputs item binds against params, those of the
// document of kind and name it names.
func (s *scope) boundary(item Item, kind, name string, params []Param) {
	for _, binding := range item.Inputs {
		if !declares(params, binding.Name) {
			s.problem(binding.Origin, "the %s %q declares the param %q", kind, name, binding.Name)
		}
	}
	for _, param := range params {
		bound := slices.ContainsFunc(item.Inputs, func(b Binding) bool { return b.Name == param.Name })
		if !param.Default && !bound {
			s.problem(item.Origin, "it binds the param %q of the %s %q, which has no default", param.Name, kind, name)
		}
	}
}

// arms checks that every arm of a branch gives each output another arm
// gives: the branch has one output mapping for every path. An arm missing
// one is at its own origin: what it leaves out has none.
func (s *scope) arms(arms []Item) {
	for _, arm := range arms {
		for _, output := range branchOutputs(arms) {
			if !slices.ContainsFunc(arm.Outputs, func(b Binding) bool { return b.Name == output }) {
				s.problem(arm.Origin, "it gives the output %q, as another arm of its branch does", output)
			}
		}
	}
}

// branchOutputs is the outputs of a branch of arms: each one an arm gives,
// in the order first given.
func branchOutputs(arms []Item) []string {
	var outputs []string
	for _, arm := range arms {
		for _, output := range arm.Outputs {
			if !slices.Contains(outputs, output.Name) {
				outputs = append(outputs, output.Name)
			}
		}
	}
	return outputs
}

func (s *scope) bindings(bindings []Binding, a at) {
	for _, binding := range bindings {
		if binding.From != nil {
			s.read(*binding.From, a)
		}
	}
}

func (s *scope) condition(condition Condition, a at) {
	for _, reads := range condition.Reads {
		s.read(reads, a)
	}
}

// read checks that reference reads what is there, read from a. The item
// of an all or any query is its condition's, and is not checked here.
func (s *scope) read(reference Read, a at) {
	owner := string(s.reference.Kind)
	switch reference.Root {
	case RootParam:
		if !declares(s.params, reference.Name) {
			s.problem(reference.Origin, "its %s declares the param %q", owner, reference.Name)
		}
	case RootInput:
		if !slices.ContainsFunc(s.inputs, func(i Input) bool { return i.Name == reference.Name }) {
			s.problem(reference.Origin, "its %s declares the input %q", owner, reference.Name)
		}
	case RootState:
		if !slices.Contains(a.state, reference.Name) {
			s.problem(reference.Origin, "it is in no repeat of the state %q", reference.Name)
		}
	case RootOutputs, RootSession:
		s.step(reference, a)
	}
}

// step checks a reference to an item's outputs or session: the item has
// ended where it is read, a session is a step's, and a field of the
// outputs of a child workflow or of a branch is one it gives. It is
// whether the reference reads what is there.
func (s *scope) step(reference Read, a at) bool {
	name := reference.Name
	item, known := s.items[name]
	holder := s.holders[name]
	problem := func(format string, args ...any) bool {
		s.problem(reference.Origin, format, args...)
		return false
	}
	switch {
	case !known:
		return problem("its workflow has the item %q", name)
	case holder != "" && !slices.Contains(a.within, holder):
		return problem("the item %q is read through the item holding it", name)
	case !a.ended[name] && slices.Contains(a.beside, name):
		return problem("the item %q runs beside it", name)
	case !a.ended[name] && slices.Contains(a.arms, name):
		return problem("the item %q is another arm of its branch", name)
	case !a.ended[name]:
		return problem("the item %q has ended before it", name)
	case reference.Root == RootSession && item.Process.Value == "":
		return problem("the item %q is no step, and has no session", name)
	case reference.Root == RootOutputs && reference.Field != "" && item.Workflow.Value != "":
		child, ok := s.walk.workflows[item.Workflow.Value]
		if ok && !slices.ContainsFunc(child.Outputs, func(b Binding) bool { return b.Name == reference.Field }) {
			return problem("the workflow %q gives the output %q", item.Workflow.Value, reference.Field)
		}
	case reference.Root == RootOutputs && reference.Field != "" && item.Branch != nil:
		if !slices.Contains(branchOutputs(item.Branch), reference.Field) {
			return problem("the branch %q gives the output %q", name, reference.Field)
		}
	}
	return true
}

func (s *scope) problem(origin Origin, format string, args ...any) {
	s.walk.fault(s.reference, Problem{Origin: origin, Message: fmt.Sprintf(format, args...)})
}

// declares is whether params has one named name.
func declares(params []Param, name string) bool {
	return slices.ContainsFunc(params, func(p Param) bool { return p.Name == name })
}
