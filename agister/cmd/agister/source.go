package main

import (
	"errors"
	"fmt"
	"strconv"

	"github.com/igor1309/ai-labs/agister/settings/documents"
	"github.com/igor1309/ai-labs/agister/settings/layout"
	"github.com/igor1309/ai-labs/agister/settings/resolve"
)

// definitions is what the source asks of documents: each document typed,
// by kind and name, or its problems; and the repository's blocks, or the
// blocks file's problems.
type definitions interface {
	Workflow(name string) (documents.WorkflowDefinition, []documents.Problem)
	Process(name string) (documents.ProcessDefinition, []documents.Problem)
	Agent(name string) (documents.AgentDefinition, []documents.Problem)
	Runtime(name string) (documents.RuntimeDefinition, []documents.Problem)
	Brief(name string) (documents.BriefDefinition, []documents.Problem)
	Blob(kind documents.Kind, name string) (documents.Blob, []documents.Problem)
	Blocks() ([]documents.Field[documents.Block], []documents.Problem)
}

// source answers resolve's source from documents, and from the layout
// snapshot documents was given: the problems of no document and whether a
// layer holds a document are layout's. Each value has its origin, its
// place spelled as documents spells a problem's.
type source struct {
	documents definitions
	snapshot  layout.Snapshot
}

func newSource(documents definitions, snapshot layout.Snapshot) (*source, error) {
	if documents == nil {
		return nil, errors.New("source: no documents")
	}
	return &source{documents: documents, snapshot: snapshot}, nil
}

func (s *source) Workflow(name string) (resolve.Workflow, []resolve.Problem) {
	workflow, problems := s.documents.Workflow(name)
	if len(problems) > 0 {
		return resolve.Workflow{}, problemsOf(problems)
	}
	return resolve.Workflow{
		Name:    workflow.Name,
		Params:  paramsOf(workflow.Params.Value),
		Inputs:  inputsOf(workflow.Inputs.Value, "inputs"),
		Steps:   itemsOf(workflow.Steps.Value, "steps"),
		Outputs: bindingsOf(workflow.Outputs.Value, "outputs"),
	}, nil
}

func (s *source) Process(name string) (resolve.Process, []resolve.Problem) {
	process, problems := s.documents.Process(name)
	if len(problems) > 0 {
		return resolve.Process{}, problemsOf(problems)
	}
	var revision *resolve.Read
	if r := process.Workspace.Value.Revision; r.Given {
		revision = readOf(r, "workspace.revision")
	}
	stale := process.Limits.Value.Stale.Value
	return resolve.Process{
		Name:              process.Name,
		Prompt:            nameOf(process.Prompt, "prompt"),
		Guidance:          namesOf(process.Guidance, "guidance"),
		Skills:            namesOf(process.Skills, "skills"),
		Params:            paramsOf(process.Params.Value),
		Inputs:            inputsOf(process.Inputs.Value, "inputs"),
		Environment:       bindingsOf(process.Environment.Value, "environment"),
		Revision:          revision,
		Schema:            nameOf(process.Output.Value.Schema, "output.schema"),
		Require:           process.Permissions.Value.Require.Value,
		Allow:             process.Permissions.Value.Allow.Value,
		Recovery:          process.Recovery.Given,
		StaleToolCalls:    stale.RepeatedToolCalls.Given,
		StaleToolCommands: stale.ToolCommand.Given,
	}, nil
}

func (s *source) Agent(name string) (resolve.Agent, []resolve.Problem) {
	agent, problems := s.documents.Agent(name)
	if len(problems) > 0 {
		return resolve.Agent{}, problemsOf(problems)
	}
	// An agent gives its model, or the model's family.
	model := nameOf(agent.Model, "model")
	if !agent.Model.Given {
		model = nameOf(agent.ModelFamily, "model_family")
	}
	return resolve.Agent{
		Name:    agent.Name,
		Runtime: nameOf(agent.Runtime, "runtime"),
		Model:   model,
		Effort:  nameOf(agent.Effort, "effort"),
	}, nil
}

func (s *source) Runtime(name string) (resolve.Runtime, []resolve.Problem) {
	runtime, problems := s.documents.Runtime(name)
	if len(problems) > 0 {
		return resolve.Runtime{}, problemsOf(problems)
	}
	var options []resolve.Option
	for _, option := range runtime.Options.Value {
		options = append(options, resolve.Option{Name: option.Value.Name, Grants: option.Value.Grants.Value})
	}
	return resolve.Runtime{
		Name:     runtime.Name,
		Contract: nameOf(runtime.Contract, "contract"),
		Grants:   runtime.Grants.Value,
		Select:   runtime.Select.Value,
		Options:  options,
	}, nil
}

// Other gives the problems of a document resolve reads nothing of. A skill
// is a problem while no layer holds one: documents holds none
// (backlog/skills.md).
func (s *source) Other(kind resolve.Kind, name string) []resolve.Problem {
	switch kind {
	case resolve.KindBrief:
		_, problems := s.documents.Brief(name)
		return problemsOf(problems)
	case resolve.KindSkill:
		return []resolve.Problem{{Message: fmt.Sprintf("no layer holds the skill %q", name)}}
	}
	_, problems := s.documents.Blob(kindOf(kind).documents, name)
	return problemsOf(problems)
}

// Problems gives the problems of no document: layout's, then the blocks
// file's.
func (s *source) Problems() []resolve.Problem {
	var problems []resolve.Problem
	for _, p := range s.snapshot.Problems {
		problems = append(problems, resolve.Problem{Origin: resolve.Origin{Path: p.Path}, Message: p.Err.Error()})
	}
	_, blocks := s.documents.Blocks()
	return append(problems, problemsOf(blocks)...)
}

func (s *source) Blocks() []resolve.Block {
	typed, _ := s.documents.Blocks()
	var blocks []resolve.Block
	for i, block := range typed {
		blocks = append(blocks, resolve.Block{
			Kind:   documentsKind(block.Value.Kind).resolve,
			Name:   block.Value.Name,
			Reason: block.Value.Reason,
			Origin: originOf(block.Origin, itemPlace("", i)),
		})
	}
	return blocks
}

// Holds tells whether a layer holds a file of the document: its layout
// snapshot has it, whether the file reads or not.
func (s *source) Holds(kind resolve.Kind, name string) bool {
	k := kindOf(kind)
	if k.layout == "" {
		return false
	}
	_, held := s.snapshot.Documents[k.layout][name]
	return held
}

func problemsOf(problems []documents.Problem) []resolve.Problem {
	var mapped []resolve.Problem
	for _, p := range problems {
		mapped = append(mapped, resolve.Problem{Origin: resolve.Origin{Path: p.Path, Line: p.Line, Place: p.Place}, Message: p.Message})
	}
	return mapped
}

func originOf(origin documents.Origin, place string) resolve.Origin {
	return resolve.Origin{Path: origin.Path, Line: origin.Line, Place: place}
}

// nameOf is the name field gives, at place; none where it gives none.
func nameOf(field documents.Field[string], place string) resolve.Name {
	if !field.Given {
		return resolve.Name{}
	}
	return resolve.Name{Value: field.Value, Origin: originOf(field.Origin, place)}
}

// namesOf is each name of the list field gives, at its place in the list
// at place, on the list's line: documents gives no line of an item of a
// list of names.
func namesOf(field documents.Field[[]string], place string) []resolve.Name {
	var names []resolve.Name
	for i, name := range field.Value {
		names = append(names, resolve.Name{Value: name, Origin: originOf(field.Origin, itemPlace(place, i))})
	}
	return names
}

func paramsOf(params []documents.Field[documents.Param]) []resolve.Param {
	var mapped []resolve.Param
	for _, param := range params {
		mapped = append(mapped, resolve.Param{Name: param.Value.Name, Default: param.Value.Default.Given})
	}
	return mapped
}

// inputsOf is inputs, the map at place.
func inputsOf(inputs []documents.Field[documents.Input], place string) []resolve.Input {
	var mapped []resolve.Input
	for _, input := range inputs {
		at := key(place, input.Value.Name)
		mapped = append(mapped, resolve.Input{
			Name:      input.Value.Name,
			Forms:     namesOf(input.Value.Form, key(at, "form")),
			Arguments: bindingsOf(input.Value.Arguments, at),
		})
	}
	return mapped
}

// bindingsOf is bindings, the map at place, each at its name's place.
func bindingsOf(bindings []documents.Field[documents.Binding], place string) []resolve.Binding {
	var mapped []resolve.Binding
	for _, binding := range bindings {
		at := key(place, binding.Value.Name)
		b := resolve.Binding{Name: binding.Value.Name, Text: binding.Value.Value.Text, Origin: originOf(binding.Origin, at)}
		if from := binding.Value.Value.From; from.Root != "" {
			b.From = readOf(documents.Field[documents.Reference]{Value: from, Origin: binding.Origin, Given: true}, at)
		}
		mapped = append(mapped, b)
	}
	return mapped
}

// readOf is what the reference field reads, at place.
func readOf(field documents.Field[documents.Reference], place string) *resolve.Read {
	return &resolve.Read{
		Root:   rootOf(field.Value.Root),
		Name:   field.Value.Name,
		Field:  field.Value.Field,
		Origin: originOf(field.Origin, place),
	}
}

// rootOf is what a reference reads of, in resolve's words.
func rootOf(root documents.Root) resolve.Root {
	switch root {
	case documents.ReadsParam:
		return resolve.RootParam
	case documents.ReadsInput:
		return resolve.RootInput
	case documents.ReadsState:
		return resolve.RootState
	case documents.ReadsOutputs:
		return resolve.RootOutputs
	case documents.ReadsSession:
		return resolve.RootSession
	case documents.ReadsItem:
		return resolve.RootQueryItem
	}
	return resolve.Root(root)
}

// itemsOf is items, the list at place. A parallel's and a branch's items
// are never nil, for resolve tells an item's kind by them.
func itemsOf(items []documents.Field[documents.Item], place string) []resolve.Item {
	mapped := make([]resolve.Item, 0, len(items))
	for i, field := range items {
		at, item := itemPlace(place, i), field.Value
		m := resolve.Item{
			Name:     item.Name,
			Origin:   originOf(field.Origin, at),
			Process:  nameOf(item.Process, key(at, "process")),
			Agent:    nameOf(item.Agent, key(at, "agent")),
			Workflow: nameOf(item.Workflow, key(at, "workflow")),
			Inputs:   bindingsOf(item.Inputs.Value, key(at, "inputs")),
			Outputs:  bindingsOf(item.Outputs.Value, key(at, "outputs")),
		}
		if item.If.Given {
			m.If = resolve.Condition{Reads: readsOf(item.If, key(at, "if"))}
		}
		if item.Session.Given {
			m.Session = readOf(item.Session, key(at, "session"))
		}
		if item.Parallel.Given {
			m.Parallel = itemsOf(item.Parallel.Value, key(at, "parallel"))
		}
		if item.Branch.Given {
			m.Branch = itemsOf(item.Branch.Value, key(at, "branch"))
		}
		if item.Repeat.Given {
			repeat, at := item.Repeat.Value, key(at, "repeat")
			m.Repeat = &resolve.Repeat{
				State: bindingsOf(repeat.State.Value, key(at, "state")),
				Steps: itemsOf(repeat.Steps.Value, key(at, "steps")),
				Next:  bindingsOf(repeat.Next.Value, key(at, "next")),
				Until: resolve.Condition{Reads: readsOf(repeat.Until, key(at, "until"))},
				Max:   repeat.Max.Value,
			}
		}
		mapped = append(mapped, m)
	}
	return mapped
}

// readsOf is every reference the condition at place reads, at any depth,
// each at its place as documents spells it.
func readsOf(field documents.Field[documents.Condition], place string) []resolve.Read {
	condition := field.Value
	var reads []resolve.Read
	read := func(at string) {
		if condition.Reads.Given {
			reads = append(reads, *readOf(condition.Reads, at))
		}
	}
	operator := key(place, condition.Operator)
	switch condition.Operator {
	case "equals":
		read(itemPlace(operator, 0))
	case "present":
		read(operator)
	case "all", "any":
		read(key(operator, "in"))
		for _, where := range condition.Of {
			reads = append(reads, readsOf(where, key(operator, "where"))...)
		}
	case "and", "or":
		for i, of := range condition.Of {
			reads = append(reads, readsOf(of, itemPlace(operator, i))...)
		}
	case "not":
		for _, of := range condition.Of {
			reads = append(reads, readsOf(of, operator)...)
		}
	}
	return reads
}

// key is the place of the field name of the map at place, as documents
// spells it: the keys from the root joined by ".".
func key(place, name string) string {
	if place == "" {
		return name
	}
	return place + "." + name
}

// itemPlace is the place of the item i of the list at place, as documents
// spells it.
func itemPlace(place string, i int) string {
	return place + "[" + strconv.Itoa(i) + "]"
}
