package documents

import (
	"fmt"
	"slices"

	"github.com/igor1309/ai-labs/gokit/tree"
)

// WorkflowDefinition is a workflow (ADR-011): its name; the params a
// caller gives it and the inputs it reads, as a process's; its steps, a
// sequence of items; and its outputs, by name, its output contract and
// its mapping.
type WorkflowDefinition struct {
	Name    string
	Params  Field[[]Field[Param]]
	Inputs  Field[[]Field[Input]]
	Steps   Field[[]Field[Item]]
	Outputs Field[[]Field[Binding]]
}

// Item is one item of a workflow, named, unique in its workflow, and one
// of five (ADR-011, rule 2): a step, its process and agent, the session
// of an earlier call it continues (rule 3) and its inputs; a workflow, by
// name, and its inputs; a parallel, or a branch, of items; or a repeat.
// An arm of a branch has the condition it is taken on, but the last, the
// default; and its outputs, the branch's.
type Item struct {
	Name     string
	If       Field[Condition]
	Process  Field[string]
	Agent    Field[string]
	Session  Field[Reference]
	Workflow Field[string]
	Inputs   Field[[]Field[Binding]]
	Parallel Field[[]Field[Item]]
	Branch   Field[[]Field[Item]]
	Repeat   Field[Repeat]
	Outputs  Field[[]Field[Binding]]
}

// Repeat is a bounded repetition (ADR-011, rule 4): its initial state, its
// body, its next state, its stopping condition, and the most times its
// body runs.
type Repeat struct {
	State Field[[]Field[Binding]]
	Steps Field[[]Field[Item]]
	Next  Field[[]Field[Binding]]
	Until Field[Condition]
	Max   Field[int]
}

// Workflow is the workflow name, typed from its composed tree, extends
// applied, or its problems, and then no workflow: those of its tree, as
// Tree gives them, or else those of its fields.
func (d *Documents) Workflow(name string) (WorkflowDefinition, []Problem) {
	workflow, problems := definitionOf(d.workflows, Workflow, name)
	workflow.Params.Value = slices.Clone(workflow.Params.Value)
	workflow.Inputs.Value = cloneInputs(workflow.Inputs.Value)
	workflow.Steps.Value = cloneItems(workflow.Steps.Value)
	workflow.Outputs.Value = slices.Clone(workflow.Outputs.Value)
	return workflow, problems
}

// workflowReads is what a workflow's bindings and outputs may read.
func workflowReads() readable {
	return readable{roots: []string{"params", "inputs", "state", "steps"}, workflow: true}
}

// itemKinds are the fields that say what an item is: each item gives one.
func itemKinds() []string {
	return []string{"process", "workflow", "parallel", "branch", "repeat"}
}

func typeWorkflow(name string, root tree.Node) (WorkflowDefinition, []Problem) {
	t := newTyping(Workflow, root)
	items := &items{names: map[string]bool{}}
	workflow := WorkflowDefinition{
		Name:   name,
		Params: typeParams(t),
		Inputs: typeInputs(t),
		Steps:  items.of(t, "steps"),
		// Outputs are the workflow's contract: resolve checks the
		// workflow's callers read only them.
		Outputs: t.bindings("outputs", optional, workflowReads()),
	}
	if problems := t.end(); len(problems) > 0 {
		return WorkflowDefinition{}, problems
	}
	return workflow, nil
}

// items types a workflow's items, each named once in it.
type items struct {
	names map[string]bool
}

// of is the field key, a list of items, at least one.
func (s *items) of(f *fields, key string) Field[[]Field[Item]] {
	list := f.list(key, required)
	if !list.Given {
		return Field[[]Field[Item]]{}
	}
	if node, _ := f.node.Get(key); len(node.Items()) == 0 {
		f.problem(list.Origin, f.at(key), "it has an item")
		return Field[[]Field[Item]]{}
	}
	typed := []Field[Item]{}
	for _, item := range list.Value {
		typed = append(typed, s.item(item, nil))
	}
	return Field[[]Field[Item]]{Value: typed, Origin: list.Origin, Given: true}
}

// arms is a branch's items: each taken on its condition, but the last,
// the default; and each with its outputs, the branch's.
func (s *items) arms(f *fields) Field[[]Field[Item]] {
	list := f.list("branch", required)
	if !list.Given {
		return Field[[]Field[Item]]{}
	}
	if node, _ := f.node.Get("branch"); len(node.Items()) == 0 {
		f.problem(list.Origin, f.at("branch"), "it has an item")
		return Field[[]Field[Item]]{}
	}
	typed := []Field[Item]{}
	for i, item := range list.Value {
		arm := func(item *fields, typed *Item) {
			if i < len(list.Value)-1 {
				typed.If = item.condition("if", required, false)
			} else if node, ok := item.node.Get("if"); ok {
				item.known["if"] = true
				item.typing.problems = append(item.typing.problems, at(node, item.at("if"), "the last arm is the default, with no if"))
			}
			typed.Outputs = item.bindings("outputs", required, workflowReads())
		}
		typed = append(typed, s.item(item, arm))
	}
	return Field[[]Field[Item]]{Value: typed, Origin: list.Origin, Given: true}
}

// item is the item f, an arm of a branch where arm reads what an arm has.
func (s *items) item(f *fields, arm func(*fields, *Item)) Field[Item] {
	var item Item
	if name := f.text("name", required); name.Given {
		if s.names[name.Value] {
			f.problem(name.Origin, f.at("name"), "no other item of its workflow has it")
		}
		s.names[name.Value] = true
		item.Name = name.Value
	}
	if arm != nil {
		arm(f, &item)
	}
	var kinds []string
	for _, kind := range itemKinds() {
		if _, ok := f.node.Get(kind); ok {
			kinds = append(kinds, kind)
		}
	}
	// An item that is not one of them has no fields to know: its one
	// problem is what it is.
	if len(kinds) != 1 {
		f.problem(originOf(f.node), f.place, "it is a step, a workflow, a parallel, a branch or a repeat")
		return Field[Item]{}
	}
	switch kinds[0] {
	case "process":
		item.Process = f.reference("process", required, Process)
		item.Agent = f.reference("agent", required, Agent)
		item.Session = f.from("session", optional, workflowReads())
		item.Inputs = f.bindings("inputs", optional, workflowReads())
	case "workflow":
		item.Workflow = f.reference("workflow", required, Workflow)
		item.Inputs = f.bindings("inputs", optional, workflowReads())
	case "parallel":
		item.Parallel = s.of(f, "parallel")
	case "branch":
		item.Branch = s.arms(f)
	case "repeat":
		item.Repeat = s.repeat(f)
	}
	f.done()
	return Field[Item]{Value: item, Origin: originOf(f.node), Given: true}
}

func (s *items) repeat(f *fields) Field[Repeat] {
	repeat := f.mapping("repeat", required)
	if !repeat.Given {
		return Field[Repeat]{}
	}
	r := repeat.Value
	typed := Repeat{
		State: r.bindings("state", required, workflowReads()),
		Steps: s.of(r, "steps"),
		Next:  r.bindings("next", required, workflowReads()),
		Until: r.condition("until", required, false),
		Max:   r.integer("max", required, 1),
	}
	r.done()
	return Field[Repeat]{Value: typed, Origin: repeat.Origin, Given: true}
}

func cloneInputs(inputs []Field[Input]) []Field[Input] {
	inputs = slices.Clone(inputs)
	for i := range inputs {
		input := &inputs[i].Value
		input.Form.Value = slices.Clone(input.Form.Value)
		input.Arguments = slices.Clone(input.Arguments)
	}
	return inputs
}

// cloneItems is items with slices of their own, at every depth.
func cloneItems(items []Field[Item]) []Field[Item] {
	items = slices.Clone(items)
	for i := range items {
		item := &items[i].Value
		item.If.Value = item.If.Value.clone()
		item.Inputs.Value = slices.Clone(item.Inputs.Value)
		item.Parallel.Value = cloneItems(item.Parallel.Value)
		item.Branch.Value = cloneItems(item.Branch.Value)
		item.Outputs.Value = slices.Clone(item.Outputs.Value)
		repeat := &item.Repeat.Value
		repeat.State.Value = slices.Clone(repeat.State.Value)
		repeat.Steps.Value = cloneItems(repeat.Steps.Value)
		repeat.Next.Value = slices.Clone(repeat.Next.Value)
		repeat.Until.Value = repeat.Until.Value.clone()
	}
	return items
}

// itemPlace is the place of the item i of the list at place.
func itemPlace(place string, i int) string {
	return fmt.Sprintf("%s[%d]", place, i)
}
