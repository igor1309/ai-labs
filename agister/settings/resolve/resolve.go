// Package resolve is the gate before a run (ADR-002, rule 6): given a
// request naming a document by kind and name, or a step, it follows every
// name from it, plans every step, and gives what it checked, or a refusal
// naming the chain to each document at fault. It reads no file: its
// source gives each document in resolve's own types, holding only what
// resolve reads, its wrappers give each runtime's facts, and the
// composition answers both.
package resolve

import (
	"errors"
	"fmt"
	"slices"
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
// a brief, a prompt, a schema or a skill; the problems of no document; the
// repository's blocks; and whether a layer holds a document. A document
// with problems is given as the zero document.
type Source interface {
	Workflow(name string) (Workflow, []Problem)
	Process(name string) (Process, []Problem)
	Agent(name string) (Agent, []Problem)
	Runtime(name string) (Runtime, []Problem)
	Other(kind Kind, name string) []Problem
	Problems() []Problem
	Blocks() []Block
	Holds(kind Kind, name string) bool
}

// Block is a document the repository refuses (ADR-002, rule 7), by kind
// and name, its reason, and where the blocks give it. A block is not a
// problem.
type Block struct {
	Kind   Kind
	Name   string
	Reason string
	Origin Origin
}

// Origin is where a document gives a value: its file's path; its line
// there, 0 for none; and its place in the document, "" for the whole. The
// composition takes it from documents: resolve gives a problem at it, and
// spells no place of a document.
type Origin struct {
	Path  string
	Line  int
	Place string
}

// Name is a name a document gives, and where; "" where it gives none.
type Name struct {
	Value  string
	Origin Origin
}

// Problem is one thing wrong with a document, or with no document: the
// origin of what it is about, the zero origin for none, and what is wrong.
type Problem struct {
	Origin  Origin
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
// of five: a step, its process and agent, and the session it continues,
// nil for none; a workflow, by name; a parallel, of items, and the most of
// them that run at once, 0 for all (ADR-012, rule 8); a branch, of items;
// or a repeat. A step and a workflow have their inputs. An arm of a branch
// has the condition it is taken on, but the default, and its outputs, the
// branch's.
type Item struct {
	Name     string
	Origin   Origin
	If       Condition
	Process  Name
	Agent    Name
	Session  *Read
	Workflow Name
	Inputs   []Binding
	Parallel []Item
	Max      int
	Branch   []Item
	Repeat   *Repeat
	Outputs  []Binding
}

// Repeat is a bounded repetition (ADR-011, rule 4): its initial state, its
// body, its next state, its stopping condition, and its bound, the most
// times its body runs.
type Repeat struct {
	State []Binding
	Steps []Item
	Next  []Binding
	Until Condition
	Max   int
}

// Condition is a condition of a workflow: every reference it reads, the
// item of an all or any query among them.
type Condition struct {
	Reads []Read
}

// Binding is a value given by name, where its document gives it: a text,
// or what a reference reads in From, nil for a text.
type Binding struct {
	Name   string
	Text   string
	From   *Read
	Origin Origin
}

// Read is what a reference reads, where its document gives it (ADR-011,
// rules 3 and 4): a param, an input or a repeat's state, by Name; an item's
// outputs, or one Field of them, "" for the whole; an item's session; or
// the item of an all or any query. The composition translates it from a
// document's reference, so resolve parses no reference's text.
type Read struct {
	Root   Root
	Name   string
	Field  string
	Origin Origin
}

// Root is what a reference reads of.
type Root string

const (
	RootParam     Root = "param"
	RootInput     Root = "input"
	RootState     Root = "state"
	RootOutputs   Root = "outputs"
	RootSession   Root = "session"
	RootQueryItem Root = "item"
)

// Process is a process: the prompt it is given, its guidance and its
// skills; its params and its inputs; its environment; the input whose
// revision its worktree must be at, nil for none; the schema of its
// output; the permissions it requires and those it allows (ADR-003, rule
// 2); whether it gives an instruction or staleness limits, whether it
// recovers a stale turn; and whether a turn is stale by the
// same tool call made in a row, or by a tool command running too long.
type Process struct {
	Name              string
	Prompt            Name
	Guidance          []Name
	Skills            []Name
	Params            []Param
	Inputs            []Input
	Environment       []Binding
	Revision          *Read
	Schema            Name
	Require           []string
	Allow             []string
	Recovery          bool
	Instruction       bool
	Staleness         bool
	StaleToolCalls    bool
	StaleToolCommands bool
}

// Input is an input of a workflow or a process, by name: the brief forms
// its text may take, and its source's arguments.
type Input struct {
	Name string
	// File says the input's source reads a file. Path is the reference its
	// source reads for that file's path, nil where the path is literal or the
	// source is not a file.
	File      bool
	Path      *Read
	Forms     []Name
	Arguments []Binding
}

// Agent is an agent: the runtime mapping it names; the model, or its
// family, and the effort it gives; and the agent its call is made again on
// at capacity (ADR-004, rule 8), "" for each it does not give.
type Agent struct {
	Name     string
	Runtime  Name
	Model    Name
	Effort   Name
	Fallback Name
}

// Runtime is a runtime mapping (ADR-003, rule 3): the contract of the
// wrapper it is for; what it grants with no option; and its options, of
// which a plan takes "any" or exactly "one", "" where it offers none. The
// efforts its runtime accepts are its wrapper's facts, not the mapping's.
type Runtime struct {
	Name     string
	Contract Name
	Grants   []string
	Select   string
	Options  []Option
}

// Option is an option of a runtime, by name, and what it grants.
type Option struct {
	Name   string
	Grants []string
}

// Wrappers is what resolve asks of the runtime wrappers: the facts of the
// one that takes contract, and whether one does (ADR-003, rule 7).
type Wrappers interface {
	Facts(contract string) (Facts, bool)
}

// Facts are what a runtime wrapper can do (ADR-003, rule 7): check output
// against a schema, resume a session, take skills, take a model, the
// efforts it accepts, report tool calls and tool commands, and take inputs
// in a message, with instructions, guidance and streamed staleness checks.
type Facts struct {
	Schema       bool
	Session      bool
	Skills       bool
	Model        bool
	Efforts      []string
	ToolCalls    bool
	ToolCommands bool
	Message      bool
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

// Resolved is what a run needs (ADR-002, rule 6): the workflow, requested
// or made of a step, nil for a request of another kind; every document it
// reached, in the order it reached them; the definitions of the workflows,
// processes, agents and runtime mappings among them, each by its name; the
// plan of every step, in the order its workflow was reached, and after
// it, that of the step on its agent's fallback; and its warnings: each
// grant of a plan beyond what its process allows, at its step's origin, in
// the order planned; then each block naming no document.
type Resolved struct {
	Workflow  *Workflow
	Reached   []Reference
	Workflows map[string]Workflow
	Processes map[string]Process
	Agents    map[string]Agent
	Runtimes  map[string]Runtime
	Plans     []Plan
	Warnings  []Problem
}

// Plan is a step's plan (ADR-003, rule 4): the step, by its workflow's
// name, "" for one made of a step, and its place there, as its origin
// gives it; its process, agent and runtime; the options it takes; and the
// permissions required, allowed, granted, granted beyond the allowed, its
// warning, and allowed but withheld.
type Plan struct {
	Workflow string
	Place    string
	Process  string
	Agent    string
	Runtime  string
	Options  []string
	Required []string
	Allowed  []string
	Granted  []string
	Extra    []string
	Withheld []string
}

// Fault is a document at fault, the last link of its chain, and its
// problems, or the block that refuses it; or problems of no document, the
// request's among them, with no chain.
type Fault struct {
	Chain    []Link
	Problems []Problem
	Block    *Block
}

// Link is a document of a chain: its kind and name, and where the document
// before it names it, the origin of the name it follows; none for the
// first.
type Link struct {
	Kind   Kind
	Name   string
	Origin Origin
}

// Resolver resolves requests from its source and its wrappers.
type Resolver struct {
	source   Source
	wrappers Wrappers
}

// New gives a resolver asking source for documents and wrappers for
// runtime facts.
func New(source Source, wrappers Wrappers) (*Resolver, error) {
	if source == nil {
		return nil, errors.New("resolve: no source")
	}
	if wrappers == nil {
		return nil, errors.New("resolve: no wrappers")
	}
	return &Resolver{source: source, wrappers: wrappers}, nil
}

// Resolve gives what request reaches, or the faults that refuse it: the
// problems of no document first, the source's, then the request's; then
// each document at fault once, with the first chain that reached it, in
// the order reached. It follows every name from the request, then checks
// what each document it reached reads.
func (r *Resolver) Resolve(request Request) (Resolved, []Fault) {
	w := &walk{
		blocks: map[Reference]Block{}, blocked: map[Reference]bool{},
		source: r.source, wrappers: r.wrappers, index: map[Reference]int{}, chains: map[Reference][]Link{},
		problems: map[Reference][]Problem{}, open: map[string]bool{}, cycled: map[Reference]bool{},
		workflows: map[string]Workflow{}, processes: map[string]Process{},
		agents: map[string]Agent{}, runtimes: map[string]Runtime{}, facts: map[string]Facts{},
	}
	for _, block := range r.source.Blocks() {
		w.blocks[Reference{Kind: block.Kind, Name: block.Name}] = block
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
	// The source's problems are its own: the request's are added to a copy.
	problems := slices.Clone(r.source.Problems())
	if workflow != nil {
		problems = append(problems, given(request, *workflow)...)
	}
	// A named workflow's steps are its own; a made one's are the request's.
	for _, reference := range w.reached {
		if named, ok := w.workflows[reference.Name]; ok && reference.Kind == KindWorkflow {
			w.planAll(reference.Name, named.Steps, func(p Problem) { w.fault(reference, p) })
		}
	}
	if request.kind == "" {
		w.planAll("", workflow.Steps, func(p Problem) { problems = append(problems, p) })
	}
	var faults []Fault
	if len(problems) > 0 {
		faults = append(faults, Fault{Problems: problems})
	}
	for _, reference := range w.reached {
		if w.blocked[reference] {
			block := w.blocks[reference]
			faults = append(faults, Fault{Chain: w.chains[reference], Block: &block})
		} else if problems := w.problems[reference]; len(problems) > 0 {
			faults = append(faults, Fault{Chain: w.chains[reference], Problems: problems})
		}
	}
	if len(faults) > 0 {
		return Resolved{}, faults
	}
	warnings := w.warnings
	for _, block := range r.source.Blocks() {
		if !r.source.Holds(block.Kind, block.Name) {
			warnings = append(warnings, Problem{Origin: block.Origin,
				Message: fmt.Sprintf("it blocks the %s %q, which no layer holds", block.Kind, block.Name)})
		}
	}
	// What resolves has no document at fault, so each document it reached
	// that resolve reads is among those kept, with no problem.
	return Resolved{
		Workflow: workflow, Reached: w.reached,
		Workflows: w.workflows, Processes: w.processes, Agents: w.agents, Runtimes: w.runtimes,
		Plans: w.plans, Warnings: warnings,
	}, nil
}

// walk follows names from a request, each document once, and keeps each
// document's chain and problems.
type walk struct {
	// blocks are the repository's, by the document each blocks; blocked,
	// the documents reached that a block refuses.
	blocks   map[Reference]Block
	blocked  map[Reference]bool
	source   Source
	wrappers Wrappers
	reached  []Reference
	index    map[Reference]int
	chains   map[Reference][]Link
	// problems are each document's, by the document at fault.
	problems map[Reference][]Problem
	// open are the workflows being followed: one named again is a cycle;
	// cycled, the workflows at fault for one.
	open   map[string]bool
	cycled map[Reference]bool
	// workflows and processes are those reached that have no problem of
	// their own source.
	workflows map[string]Workflow
	processes map[string]Process
	// agents and runtimes are those reached that have no problem of their
	// own source, and facts each runtime's, by its name.
	agents   map[string]Agent
	runtimes map[string]Runtime
	facts    map[string]Facts
	plans    []Plan
	// warnings are the plans' extras, given only with what resolves.
	warnings []Problem
}

// step is the workflow of one step resolve makes of the process on the
// agent (ADR-013, rule 1): the process's params, each given to the step
// from the workflow's of its name, and no input, for the process's inputs
// are its step's, resolved once, at its call; and the step's output its
// output. It has no document, so resolve gives its places.
func (w *walk) step(process, agent string) Workflow {
	w.follow(nil, Link{Kind: KindProcess, Name: process})
	w.follow(nil, Link{Kind: KindAgent, Name: agent})
	p := w.processes[process]
	inputs := []Binding{}
	for _, param := range p.Params {
		at := Origin{Place: "steps[0].inputs." + param.Name}
		inputs = append(inputs, Binding{Name: param.Name, From: &Read{Root: RootParam, Name: param.Name, Origin: at}, Origin: at})
	}
	output := Origin{Place: "outputs.output"}
	return Workflow{
		Params: p.Params,
		Steps: []Item{{
			Name:    process,
			Origin:  Origin{Place: "steps[0]"},
			Process: Name{Value: process, Origin: Origin{Place: "steps[0].process"}},
			Agent:   Name{Value: agent, Origin: Origin{Place: "steps[0].agent"}},
			Inputs:  inputs,
		}},
		Outputs: []Binding{{Name: "output", From: &Read{Root: RootOutputs, Name: process, Origin: output}, Origin: output}},
	}
}

// follow follows the document link names, reached by chain.
func (w *walk) follow(chain []Link, link Link) {
	reference := Reference{Kind: link.Kind, Name: link.Name}
	// A workflow being followed, named again, is at fault by the first
	// chain that closes a cycle, which its first chain begins.
	if link.Kind == KindWorkflow && w.open[link.Name] {
		if !w.cycled[reference] {
			w.cycled[reference] = true
			w.chains[reference] = append(chain[:len(chain):len(chain)], link)
			w.fault(reference, Problem{Message: "it reaches itself"})
		}
		return
	}
	if _, seen := w.index[reference]; seen {
		return
	}
	w.index[reference] = len(w.reached)
	w.reached = append(w.reached, reference)
	chain = append(chain[:len(chain):len(chain)], link)
	w.chains[reference] = chain
	// A blocked document is not asked for, nor followed.
	if _, ok := w.blocks[reference]; ok {
		w.blocked[reference] = true
		return
	}
	switch link.Kind {
	case KindWorkflow:
		workflow, problems := w.source.Workflow(link.Name)
		if w.fault(reference, problems...) {
			return
		}
		w.workflows[link.Name] = workflow
		w.forms(chain, workflow.Inputs)
		w.open[link.Name] = true
		w.items(chain, workflow.Steps)
		delete(w.open, link.Name)
	case KindProcess:
		process, problems := w.source.Process(link.Name)
		if w.fault(reference, problems...) {
			return
		}
		w.processes[link.Name] = process
		w.optional(chain, KindPrompt, process.Prompt)
		for _, guidance := range process.Guidance {
			w.optional(chain, KindPrompt, guidance)
		}
		for _, skill := range process.Skills {
			w.optional(chain, KindSkill, skill)
		}
		w.forms(chain, process.Inputs)
		w.optional(chain, KindSchema, process.Schema)
	case KindAgent:
		agent, problems := w.source.Agent(link.Name)
		if w.fault(reference, problems...) {
			return
		}
		w.optional(chain, KindRuntime, agent.Runtime)
		if runtime, ok := w.runtimes[agent.Runtime.Value]; ok {
			w.fault(reference, takes(agent, runtime.Name, w.facts[runtime.Name])...)
		}
		w.agents[link.Name] = agent
		w.optional(chain, KindAgent, agent.Fallback)
	case KindRuntime:
		runtime, problems := w.source.Runtime(link.Name)
		if w.fault(reference, problems...) {
			return
		}
		facts, ok := w.wrappers.Facts(runtime.Contract.Value)
		if !ok {
			w.fault(reference, Problem{Origin: runtime.Contract.Origin,
				Message: fmt.Sprintf("a runtime wrapper takes the contract %q", runtime.Contract.Value)})
			return
		}
		w.runtimes[link.Name], w.facts[link.Name] = runtime, facts
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

// items follows the items of the workflow chain ends at.
func (w *walk) items(chain []Link, items []Item) {
	for _, item := range items {
		switch {
		case item.Process.Value != "":
			w.follow(chain, named(KindProcess, item.Process))
			w.follow(chain, named(KindAgent, item.Agent))
		case item.Workflow.Value != "":
			w.follow(chain, named(KindWorkflow, item.Workflow))
		case item.Parallel != nil:
			w.items(chain, item.Parallel)
		case item.Branch != nil:
			w.items(chain, item.Branch)
		case item.Repeat != nil:
			w.items(chain, item.Repeat.Steps)
		}
	}
}

// forms follows the brief forms of inputs.
func (w *walk) forms(chain []Link, inputs []Input) {
	for _, input := range inputs {
		for _, form := range input.Forms {
			w.optional(chain, KindBrief, form)
		}
	}
}

// optional follows name, of kind, where it is given.
func (w *walk) optional(chain []Link, kind Kind, name Name) {
	if name.Value != "" {
		w.follow(chain, named(kind, name))
	}
}

// named is the link to the document of kind name gives, at its origin.
func named(kind Kind, name Name) Link {
	return Link{Kind: kind, Name: name.Value, Origin: name.Origin}
}
