package definition

import (
	"strings"

	"gopkg.in/yaml.v3"
)

// WorkflowSchema is the schema of a workflow definition (ADR-003).
const WorkflowSchema = "agister.workflow/v1alpha1"

// CollectionSource is the input source through which a workflow's join
// receives the collection: for each fan-out node, in declaration order, its
// node name, process, run and recorded output. Only a join is given one; a
// process called on its own, or as a fan-out node, has none to receive.
const CollectionSource = "workflow.collection"

// Node is one node of a workflow: a unique name and the process it calls.
type Node struct {
	Name    string
	Process string
}

// Workflow is a settings definition of one fixed shape (ADR-003): fan-out
// nodes, each a call of its process over the same resolved inputs, then one
// join node, a call of its process given the fan-out nodes' results.
type Workflow struct {
	Name string
	// Params are what the caller supplies; Values are resolved from them
	// once, before any node starts. Each fan-out node receives, as its
	// process's param of the same name, every resolved value its process
	// declares a param for. The join receives none.
	Params []Param
	Values []Value
	FanOut []Node
	Join   Node
	Source Source
}

// Nodes lists the fan-out nodes in declaration order, then the join.
func (w Workflow) Nodes() []Node { return append(append([]Node(nil), w.FanOut...), w.Join) }

// Collects reports the inputs of a process that receive a workflow's
// collection.
func (p Process) Collects() []string {
	var names []string
	for _, value := range p.Values {
		if value.Source == CollectionSource {
			names = append(names, value.Name)
		}
	}
	return names
}

// ParseWorkflow parses a workflow definition. What the nodes' processes
// declare is checked across documents (settings.WorkflowProblems).
func ParseWorkflow(doc Document) (Workflow, error) {
	p := &problems{}
	subject := "workflow " + subjectName(doc.Source)
	workflow := Workflow{Name: doc.Source.Name, Source: doc.Source}
	root := parseYAML(doc.Bytes, p)
	if root == nil {
		return workflow, p.err(subject)
	}
	values := fields(root, "", []string{"schema", "name", "status", "type", "input", "fan_out", "join"}, p)
	header(values, WorkflowSchema, doc.Source.Name, p)
	if value, _ := scalar(values["type"], "type", p); value != "workflow" {
		p.add("type", `must be "workflow"`)
	}

	input := fields(values["input"], "input", []string{"params", "values"}, p)
	workflow.Params, workflow.Values = parseInputs(input, p)
	for _, value := range workflow.Values {
		switch value.Source {
		case CollectionSource:
			p.add("input.values."+value.Name+".source", "%s is given only to a join", CollectionSource)
		case PromptSource:
			// A workflow resolves no settings document as an input; the
			// process that needs the prompt names it (ADR-014).
			p.add("input.values."+value.Name+".source", "%s is given only to a process", PromptSource)
		}
	}

	seen := map[string]string{} // node name: the field that declared it first
	node := func(item *yaml.Node, field string) Node {
		spec := fields(item, field, []string{"node", "uses"}, p)
		n := Node{Name: required(spec, "node", field, p)}
		if n.Name != "" {
			if !ValidName(n.Name) {
				p.add(field+".node", "invalid node name %q", n.Name)
			} else if first, ok := seen[n.Name]; ok {
				p.add(field+".node", "duplicate node name %q (also %s)", n.Name, first)
			} else {
				seen[n.Name] = field
			}
		}
		uses := required(spec, "uses", field, p)
		if process, ok := strings.CutPrefix(uses, "process:"); ok && process != "" {
			n.Process = process
		} else if uses != "" {
			p.add(field+".uses", `must be "process:<name>"`)
		}
		return n
	}
	switch list := values["fan_out"]; {
	case list == nil:
		p.add("fan_out", "is required: a workflow needs at least one fan-out node")
	case list.Kind != yaml.SequenceNode:
		p.add("fan_out", "must be a list of nodes")
	case len(list.Content) == 0:
		p.add("fan_out", "must list at least one node")
	default:
		for i, item := range list.Content {
			workflow.FanOut = append(workflow.FanOut, node(item, fieldIndex("fan_out", i)))
		}
	}
	if item, ok := values["join"]; ok {
		workflow.Join = node(item, "join")
	} else {
		p.add("join", "is required")
	}
	return workflow, p.err(subject)
}
