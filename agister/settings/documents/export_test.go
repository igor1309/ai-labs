package documents

import "github.com/igor1309/ai-labs/gokit/tree"

// NewDecodingWith gives the documents of snapshot, each layer's bytes
// decoded by decode.
func NewDecodingWith(snapshot Snapshot, decode func(tree.Format, []byte, string) (tree.Node, []tree.Problem)) *Documents {
	return newDocuments(snapshot, decode, typers{agent: typeAgent, runtime: typeRuntime, brief: typeBrief, process: typeProcess, workflow: typeWorkflow})
}

// Typers are the typer of each kind that is typed, by kind.
type Typers struct {
	Agent    func(string, tree.Node) (AgentDefinition, []Problem)
	Runtime  func(string, tree.Node) (RuntimeDefinition, []Problem)
	Brief    func(string, tree.Node) (BriefDefinition, []Problem)
	Process  func(string, tree.Node) (ProcessDefinition, []Problem)
	Workflow func(string, tree.Node) (WorkflowDefinition, []Problem)
}

// NewTypingWith gives the documents of snapshot, the composed tree of each
// agent, each runtime, each brief, each process and each workflow typed by its kind's
// typer in given.
func NewTypingWith(snapshot Snapshot, given Typers) *Documents {
	return newDocuments(snapshot, tree.Decode, typers{agent: given.Agent, runtime: given.Runtime, brief: given.Brief, process: given.Process, workflow: given.Workflow})
}

// TypeAgent is the kinds' typer of an agent's composed tree.
var TypeAgent = typeAgent

// TypeRuntime is the kinds' typer of a runtime's composed tree.
var TypeRuntime = typeRuntime

// TypeBrief is the kinds' typer of a brief's composed tree.
var TypeBrief = typeBrief

// TypeProcess is the kinds' typer of a process's composed tree.
var TypeProcess = typeProcess

// TypeWorkflow is the kinds' typer of a workflow's composed tree.
var TypeWorkflow = typeWorkflow
