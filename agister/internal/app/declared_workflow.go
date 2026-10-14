package app

// declaredWorkflow is a workflow as the package uses it: the calls a run
// of it makes and what they are given, whatever file says it. The reader
// maps a workflow document to it. It has one of two shapes (ADR-030 rule
// 6): fan-out nodes, each a call of its process over the same resolved
// inputs, then one join node given their results (ADR-003); or one call,
// whose process's params and inputs are the workflow's.
type declaredWorkflow struct {
	name string
	// params are what the caller supplies; values are resolved from them
	// once, before any node starts.
	params []declaredParam
	values []declaredValue
	fanOut []workflowNode
	join   workflowNode
	// call is the one node of a workflow of one call; nil: the workflow
	// fans out and joins.
	call *workflowNode
}

// workflowNode is one node of a workflow: its name, the process it calls
// and the agent it binds the process to, which runs the node's call
// (ADR-030 rule 5).
type workflowNode struct {
	name    string
	process string
	agent   string
}

// nodes lists the workflow's nodes: the one call, or the fan-out nodes in
// declaration order, then the join.
func (w declaredWorkflow) nodes() []workflowNode {
	if w.call != nil {
		return []workflowNode{*w.call}
	}
	return append(append([]workflowNode(nil), w.fanOut...), w.join)
}

// forms lists the brief forms the workflow's inputs name, each once, in
// declaration order.
func (w declaredWorkflow) forms() []string { return formsOf(w.values) }
