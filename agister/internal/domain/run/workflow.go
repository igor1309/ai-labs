package run

// Workflow is what a workflow run records beyond any run's fields (ADR-003
// rule 6): each node's run and outcome, the barrier, and the collection the
// join was given. The workflow definition and its resolved inputs are the
// record's Definitions and Inputs, with their digests.
type Workflow struct {
	// Nodes are the fan-out nodes in declaration order, then the join.
	Nodes   []Node  `json:"nodes"`
	Barrier Barrier `json:"barrier"`
	// Collection is the join's collection input as the join received it;
	// unset when no join started.
	Collection *Artifact `json:"collection,omitempty"`
}

// Node is one node of a workflow run.
type Node struct {
	Name    string `json:"name"`
	Process string `json:"process"`
	Join    bool   `json:"join,omitempty"`
	// Run is the node's own run; unset when the node never started.
	Run string `json:"run,omitempty"`
	// Status and Error are how the node's run ended; unset while it runs.
	Status Status `json:"status,omitempty"`
	Error  *Error `json:"error,omitempty"`
}

// Barrier states.
const (
	BarrierWaiting   = "waiting"   // fan-out nodes have not all ended
	BarrierPassed    = "passed"    // every fan-out node completed; the join may start
	BarrierBlocked   = "blocked"   // a fan-out node did not complete: no join
	BarrierCancelled = "cancelled" // the workflow was cancelled before the join started
)

// Barrier is whether the join may start, and what kept it from starting.
type Barrier struct {
	State string `json:"state"`
	// BlockedBy is the first fan-out node, in declaration order, that did
	// not complete.
	BlockedBy string `json:"blocked_by,omitempty"`
}

// Parent is the workflow run a node's run belongs to, and the node.
type Parent struct {
	Run  string `json:"run"`
	Node string `json:"node"`
}
