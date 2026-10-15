// Package resolve is the gate before a run (ADR-002, rule 6): given a
// request naming a document by kind and name, or a step, it follows every
// name from it and gives what it checked, or a refusal naming the chain to
// each document at fault. It reads no file: its source gives each document
// in resolve's own types, holding only what resolve reads, and the
// composition answers the source.
package resolve

import (
	"errors"
	"fmt"
)

// Kind is a kind of document.
type Kind string

const (
	KindWorkflow Kind = "workflow"
	KindProcess  Kind = "process"
	KindAgent    Kind = "agent"
	KindRuntime  Kind = "runtime"
	KindBrief    Kind = "brief"
	KindPrompt   Kind = "prompt"
	KindSchema   Kind = "schema"
	KindSkill    Kind = "skill"
)

// Source is what resolve asks of the settings: each document it reads, by
// name, or its problems; the problems of a document it reads nothing of,
// a brief, a prompt, a schema or a skill; and the problems of no document.
// A document with problems is given as the zero document.
type Source interface {
	Workflow(name string) (Workflow, []Problem)
	Process(name string) (Process, []Problem)
	Agent(name string) (Agent, []Problem)
	Runtime(name string) (Runtime, []Problem)
	Other(kind Kind, name string) []Problem
	Problems() []Problem
}

// Origin is where a document gives a value: its file's path, and its line
// there, 0 for none.
type Origin struct {
	Path string
	Line int
}

// Name is a name a document gives, and where; "" where it gives none.
type Name struct {
	Value  string
	Origin Origin
}

// Problem is one thing wrong with a document, or with no document: the
// path of the file it is in, "" for none; the line there, 0 for none; the
// place in the document, "" for the whole; and what is wrong.
type Problem struct {
	Path    string
	Line    int
	Place   string
	Message string
}

// Workflow is a workflow (ADR-011): its name, "" for one resolve makes of
// a step (ADR-013); the params a caller gives it, and the inputs it reads;
// its steps, a sequence of items; and its outputs.
type Workflow struct {
	Name    string
	Params  []Param
	Inputs  []Input
	Steps   []Item
	Outputs []Binding
}

// Param is a param a caller gives, by name, and whether it has a default.
type Param struct {
	Name    string
	Default bool
}

// Item is one item of a workflow, named, unique in its workflow, and one
// of five: a step, its process and agent, and the session it continues; a
// workflow, by name; a parallel or a branch, of items; or a repeat. A step
// and a workflow have their inputs. An arm of a branch has the condition
// it is taken on, but the default, and its outputs, the branch's.
type Item struct {
	Name     string
	Origin   Origin
	If       Condition
	Process  Name
	Agent    Name
	Session  Name
	Workflow Name
	Inputs   []Binding
	Parallel []Item
	Branch   []Item
	Repeat   *Repeat
	Outputs  []Binding
}

// Repeat is a bounded repetition: its initial state, its body, its next
// state and its stopping condition.
type Repeat struct {
	State []Binding
	Steps []Item
	Next  []Binding
	Until Condition
}

// Condition is a condition of a workflow: every reference it reads, an
// item of a collection among them.
type Condition struct {
	Reads []Name
}

// Binding is a value given by name: a text, or what a reference reads in
// From.
type Binding struct {
	Name   string
	Text   string
	From   string
	Origin Origin
}

// Process is a process: the prompt it is given, its guidance and its
// skills; its params and its inputs; its environment; the input whose
// revision its worktree must be at; and the schema of its output.
type Process struct {
	Name        string
	Prompt      Name
	Guidance    []Name
	Skills      []Name
	Params      []Param
	Inputs      []Input
	Environment []Binding
	Revision    Name
	Schema      Name
}

// Input is an input of a workflow or a process, by name: the brief forms
// its text may take, and its source's arguments.
type Input struct {
	Name      string
	Forms     []Name
	Arguments []Binding
}

// Agent is an agent: the runtime mapping it names.
type Agent struct {
	Name    string
	Runtime Name
}

// Runtime is a runtime mapping.
type Runtime struct {
	Name string
}

// Request is what resolve is asked for: a document, by kind and name, or a
// step, a process on an agent; and the names of the params it gives.
type Request struct {
	kind           Kind
	name           string
	process, agent string
	params         []string
}

// WithParams is the request giving the params names.
func (r Request) WithParams(names ...string) Request {
	r.params = names
	return r
}

// Document is the request for the document of kind and name.
func Document(kind Kind, name string) Request { return Request{kind: kind, name: name} }

// Step is the request for the step binding the process to the agent, with
// no workflow file (ADR-013).
func Step(process, agent string) Request { return Request{process: process, agent: agent} }

// Reference is a document, by kind and name.
type Reference struct {
	Kind Kind
	Name string
}

// Resolved is what resolve checked: the workflow, requested or made of a
// step, nil for a request of another kind; and every document it reached,
// in the order it reached them.
type Resolved struct {
	Workflow *Workflow
	Reached  []Reference
}

// Fault is a document at fault, the last link of its chain, and its
// problems; or problems of no document, with no chain.
type Fault struct {
	Chain    []Link
	Problems []Problem
}

// Link is a document of a chain: its kind and name, and where the document
// before it names it, its place and origin; none for the first.
type Link struct {
	Kind   Kind
	Name   string
	Place  string
	Origin Origin
}

// Resolver resolves requests from its source.
type Resolver struct {
	source Source
}

// New gives a resolver asking source.
func New(source Source) (*Resolver, error) {
	if source == nil {
		return nil, errors.New("resolve: no source")
	}
	return &Resolver{source: source}, nil
}

// Resolve gives what request reaches, or the faults that refuse it: the
// problems of no document first, then each document at fault once, with
// the first chain that reached it, in the order reached. It follows every
// name from the request, then checks what each document it reached reads.
func (r *Resolver) Resolve(request Request) (Resolved, []Fault) {
	w := &walk{
		source: r.source, index: map[Reference]int{}, chains: map[Reference][]Link{},
		problems: map[Reference][]Problem{}, open: map[string]bool{},
		workflows: map[string]Workflow{}, processes: map[string]Process{},
	}
	var workflow *Workflow
	switch {
	case request.kind == "":
		made := w.step(request.process, request.agent)
		workflow = &made
	case request.kind == KindWorkflow:
		w.follow(nil, Link{Kind: KindWorkflow, Name: request.name})
		if requested, ok := w.workflows[request.name]; ok {
			workflow = &requested
		}
	default:
		w.follow(nil, Link{Kind: request.kind, Name: request.name})
	}
	w.check()
	if workflow != nil {
		w.given(request, *workflow)
	}
	var faults []Fault
	if problems := r.source.Problems(); len(problems) > 0 {
		faults = append(faults, Fault{Problems: problems})
	}
	for _, reference := range w.reached {
		if problems := w.problems[reference]; len(problems) > 0 {
			faults = append(faults, Fault{Chain: w.chains[reference], Problems: problems})
		}
	}
	if len(faults) > 0 {
		return Resolved{}, faults
	}
	return Resolved{Workflow: workflow, Reached: w.reached}, nil
}

// walk follows names from a request, each document once, and keeps each
// document's chain and problems.
type walk struct {
	source  Source
	reached []Reference
	index   map[Reference]int
	chains  map[Reference][]Link
	// problems are each document's, by the document at fault.
	problems map[Reference][]Problem
	// open are the workflows being followed: one named again is a cycle.
	open map[string]bool
	// workflows and processes are those reached that have no problem of
	// their own source.
	workflows map[string]Workflow
	processes map[string]Process
}

// step is the workflow of one step resolve makes of the process on the
// agent (ADR-013): the process's params, each given to the step from the
// workflow's of its name, and the step's output its output.
func (w *walk) step(process, agent string) Workflow {
	w.follow(nil, Link{Kind: KindProcess, Name: process})
	w.follow(nil, Link{Kind: KindAgent, Name: agent})
	p := w.processes[process]
	inputs := []Binding{}
	for _, param := range p.Params {
		inputs = append(inputs, Binding{Name: param.Name, From: "params." + param.Name})
	}
	return Workflow{
		Params: p.Params,
		Steps: []Item{{
			Name:    process,
			Process: Name{Value: process},
			Agent:   Name{Value: agent},
			Inputs:  inputs,
		}},
		Outputs: []Binding{{Name: "output", From: "steps." + process + ".outputs"}},
	}
}

// follow follows the document link names, reached by chain.
func (w *walk) follow(chain []Link, link Link) {
	reference := Reference{Kind: link.Kind, Name: link.Name}
	// A workflow being followed, named again, is at fault by the chain
	// that closes the cycle, which its first chain begins.
	if link.Kind == KindWorkflow && w.open[link.Name] {
		w.chains[reference] = append(chain[:len(chain):len(chain)], link)
		w.fault(reference, Problem{Message: "it reaches itself"})
		return
	}
	if _, seen := w.index[reference]; seen {
		return
	}
	w.index[reference] = len(w.reached)
	w.reached = append(w.reached, reference)
	chain = append(chain[:len(chain):len(chain)], link)
	w.chains[reference] = chain
	switch link.Kind {
	case KindWorkflow:
		workflow, problems := w.source.Workflow(link.Name)
		if w.fault(reference, problems...) {
			return
		}
		w.workflows[link.Name] = workflow
		w.forms(chain, workflow.Inputs)
		w.open[link.Name] = true
		w.items(chain, "steps", workflow.Steps)
		delete(w.open, link.Name)
	case KindProcess:
		process, problems := w.source.Process(link.Name)
		if w.fault(reference, problems...) {
			return
		}
		w.processes[link.Name] = process
		w.optional(chain, KindPrompt, process.Prompt, "prompt")
		for i, guidance := range process.Guidance {
			w.optional(chain, KindPrompt, guidance, fmt.Sprintf("guidance[%d]", i))
		}
		for i, skill := range process.Skills {
			w.optional(chain, KindSkill, skill, fmt.Sprintf("skills[%d]", i))
		}
		w.forms(chain, process.Inputs)
		w.optional(chain, KindSchema, process.Schema, "output.schema")
	case KindAgent:
		agent, problems := w.source.Agent(link.Name)
		if w.fault(reference, problems...) {
			return
		}
		w.optional(chain, KindRuntime, agent.Runtime, "runtime")
	case KindRuntime:
		_, problems := w.source.Runtime(link.Name)
		w.fault(reference, problems...)
	default:
		w.fault(reference, w.source.Other(link.Kind, link.Name)...)
	}
}

// fault adds problems to those of the document reference, and is whether
// there are any.
func (w *walk) fault(reference Reference, problems ...Problem) bool {
	w.problems[reference] = append(w.problems[reference], problems...)
	return len(problems) > 0
}

// items follows the items at place of the workflow chain ends at.
func (w *walk) items(chain []Link, place string, items []Item) {
	for i, item := range items {
		at := fmt.Sprintf("%s[%d]", place, i)
		switch {
		case item.Process.Value != "":
			w.follow(chain, named(KindProcess, item.Process, at+".process"))
			w.follow(chain, named(KindAgent, item.Agent, at+".agent"))
		case item.Workflow.Value != "":
			w.follow(chain, named(KindWorkflow, item.Workflow, at+".workflow"))
		case item.Parallel != nil:
			w.items(chain, at+".parallel", item.Parallel)
		case item.Branch != nil:
			w.items(chain, at+".branch", item.Branch)
		case item.Repeat != nil:
			w.items(chain, at+".repeat.steps", item.Repeat.Steps)
		}
	}
}

// forms follows the brief forms of inputs.
func (w *walk) forms(chain []Link, inputs []Input) {
	for _, input := range inputs {
		for i, form := range input.Forms {
			w.optional(chain, KindBrief, form, fmt.Sprintf("inputs.%s.form[%d]", input.Name, i))
		}
	}
}

// optional follows name, of kind, at place, where it is given.
func (w *walk) optional(chain []Link, kind Kind, name Name, place string) {
	if name.Value != "" {
		w.follow(chain, named(kind, name, place))
	}
}

// named is the link to the document of kind name gives, at place.
func named(kind Kind, name Name, place string) Link {
	return Link{Kind: kind, Name: name.Value, Place: place, Origin: name.Origin}
}
