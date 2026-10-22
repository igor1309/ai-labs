package main

import (
	"errors"
	"fmt"

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
	Budget() (documents.Field[float64], []documents.Problem)
}

// source answers resolve's source from documents, and from the layout
// snapshot documents was given: the problems of no document and whether a
// layer holds a document are layout's. Each value has its origin, at the
// place documents gives it: how a document is laid out is documents' to
// know.
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
		Inputs:  inputsOf(workflow.Inputs.Value),
		Steps:   itemsOf(workflow.Steps.Value),
		Outputs: bindingsOf(workflow.Outputs.Value),
	}, nil
}

// File is the nearest layer file of a document, for a composition-generated
// problem that has no field origin of its own.
func (s *source) File(kind resolve.Kind, name string) string {
	k := kindOf(kind).layout
	document, ok := s.snapshot.Documents[k][name]
	if !ok {
		return ""
	}
	for _, file := range []*layout.Source{document.Sources.Project, document.Sources.Repository, document.Sources.Home} {
		if file != nil {
			return file.Path
		}
	}
	return ""
}

func (s *source) Process(name string) (resolve.Process, []resolve.Problem) {
	process, problems := s.documents.Process(name)
	if len(problems) > 0 {
		return resolve.Process{}, problemsOf(problems)
	}
	var revision *resolve.Read
	if r := process.Workspace.Value.Revision; r.Given {
		revision = readOf(r.Value, r.Origin)
	}
	stale := process.Limits.Value.Stale.Value
	return resolve.Process{
		Name:              process.Name,
		Prompt:            nameOf(process.Prompt),
		Guidance:          namesOf(process.Guidance),
		Skills:            namesOf(process.Skills),
		Params:            paramsOf(process.Params.Value),
		Inputs:            inputsOf(process.Inputs.Value),
		Environment:       bindingsOf(process.Environment.Value),
		Revision:          revision,
		Schema:            nameOf(process.Output.Value.Schema),
		Require:           process.Permissions.Value.Require.Value,
		Allow:             process.Permissions.Value.Allow.Value,
		Recovery:          process.Recovery.Given,
		Instruction:       process.Instruction.Given,
		Staleness:         process.Limits.Value.Stale.Given,
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
	model := nameOf(agent.Model)
	if !agent.Model.Given {
		model = nameOf(agent.ModelFamily)
	}
	return resolve.Agent{
		Name:     agent.Name,
		Runtime:  nameOf(agent.Runtime),
		Model:    model,
		Effort:   nameOf(agent.Effort),
		Fallback: nameOf(agent.Fallback),
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
		Contract: nameOf(runtime.Contract),
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
// and budget files'.
func (s *source) Problems() []resolve.Problem {
	var problems []resolve.Problem
	for _, p := range s.snapshot.Problems {
		problems = append(problems, resolve.Problem{Origin: resolve.Origin{Path: p.Path}, Message: p.Err.Error()})
	}
	_, blocks := s.documents.Blocks()
	_, budget := s.documents.Budget()
	return append(append(problems, problemsOf(blocks)...), problemsOf(budget)...)
}

func (s *source) Blocks() []resolve.Block {
	typed, _ := s.documents.Blocks()
	var blocks []resolve.Block
	for _, block := range typed {
		blocks = append(blocks, resolve.Block{
			Kind:   documentsKind(block.Value.Kind).resolve,
			Name:   block.Value.Name,
			Reason: block.Value.Reason,
			Origin: originOf(block.Origin),
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

func originOf(origin documents.Origin) resolve.Origin {
	return resolve.Origin{Path: origin.Path, Line: origin.Line, Place: origin.Place}
}

// nameOf is the name field gives; none where it gives none.
func nameOf(field documents.Field[string]) resolve.Name {
	if !field.Given {
		return resolve.Name{}
	}
	return resolve.Name{Value: field.Value, Origin: originOf(field.Origin)}
}

// namesOf is each name of the list field gives.
func namesOf(field documents.Field[[]documents.Field[string]]) []resolve.Name {
	var names []resolve.Name
	for _, name := range field.Value {
		names = append(names, nameOf(name))
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

func inputsOf(inputs []documents.Field[documents.Input]) []resolve.Input {
	var mapped []resolve.Input
	for _, input := range inputs {
		value := input.Value
		mappedInput := resolve.Input{Name: value.Name, Forms: namesOf(value.Form), Arguments: bindingsOf(value.Arguments)}
		// The composition owns source definitions. Resolve only needs to know
		// whether this source reads a file and what its path argument reads.
		if value.Source.Value == "file" {
			mappedInput.File = true
			for _, argument := range value.Arguments {
				if argument.Value.Name == "path" && argument.Value.Value.From.Root != "" {
					mappedInput.Path = readOf(argument.Value.Value.From, argument.Origin)
					break
				}
			}
		}
		mapped = append(mapped, mappedInput)
	}
	return mapped
}

// bindingsOf is bindings, each a text or what its reference reads, at the
// binding's origin.
func bindingsOf(bindings []documents.Field[documents.Binding]) []resolve.Binding {
	var mapped []resolve.Binding
	for _, binding := range bindings {
		b := resolve.Binding{Name: binding.Value.Name, Text: binding.Value.Value.Text, Origin: originOf(binding.Origin)}
		if from := binding.Value.Value.From; from.Root != "" {
			b.From = readOf(from, binding.Origin)
		}
		mapped = append(mapped, b)
	}
	return mapped
}

// readOf is what reference reads, at origin.
func readOf(reference documents.Reference, origin documents.Origin) *resolve.Read {
	return &resolve.Read{
		Root:   rootOf(reference.Root),
		Name:   reference.Name,
		Field:  reference.Field,
		Origin: originOf(origin),
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

// itemsOf is items. A parallel's and a branch's items are never nil, for
// resolve tells an item's kind by them.
func itemsOf(items []documents.Field[documents.Item]) []resolve.Item {
	mapped := make([]resolve.Item, 0, len(items))
	for _, field := range items {
		item := field.Value
		m := resolve.Item{
			Name:     item.Name,
			Origin:   originOf(field.Origin),
			Process:  nameOf(item.Process),
			Agent:    nameOf(item.Agent),
			Workflow: nameOf(item.Workflow),
			Inputs:   bindingsOf(item.Inputs.Value),
			Outputs:  bindingsOf(item.Outputs.Value),
		}
		if item.If.Given {
			m.If = resolve.Condition{Reads: readsOf(item.If.Value)}
		}
		if item.Session.Given {
			m.Session = readOf(item.Session.Value, item.Session.Origin)
		}
		if item.Parallel.Given {
			m.Parallel, m.Max = itemsOf(item.Parallel.Value), item.Max.Value
		}
		if item.Branch.Given {
			m.Branch = itemsOf(item.Branch.Value)
		}
		if item.Repeat.Given {
			repeat := item.Repeat.Value
			m.Repeat = &resolve.Repeat{
				State: bindingsOf(repeat.State.Value),
				Steps: itemsOf(repeat.Steps.Value),
				Next:  bindingsOf(repeat.Next.Value),
				Until: resolve.Condition{Reads: readsOf(repeat.Until.Value)},
				Max:   repeat.Max.Value,
			}
		}
		mapped = append(mapped, m)
	}
	return mapped
}

// readsOf is every reference condition reads, at any depth, in the order
// documents gives them.
func readsOf(condition documents.Condition) []resolve.Read {
	var reads []resolve.Read
	if condition.Reads.Given {
		reads = append(reads, *readOf(condition.Reads.Value, condition.Reads.Origin))
	}
	for _, of := range condition.Of {
		reads = append(reads, readsOf(of.Value)...)
	}
	return reads
}
