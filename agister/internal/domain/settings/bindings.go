package settings

import (
	"fmt"

	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
	"github.com/igor1309/ai-labs/agister/internal/domain/policy"
)

// binding is one node of a workflow that binds its process to an agent
// other than the process's own, as a call of the node resolves it (ADR-030
// rules 5 and 8).
type binding struct {
	node      string // as the workflow's problems name it
	process   definition.Process
	agent     definition.Agent
	effective policy.Effective
}

// bindings are the nodes of the workflow that name an agent, each with the
// process it binds to it, in declaration order, the join last. A node that
// names its process's own agent is judged with the process, whose problems
// on that agent refuse the workflow (ADR-015 rule 2). So is one whose
// process is missing or does not compose, and one whose agent is missing,
// each reported where it is found.
func (b Bundle) bindings(workflow definition.Workflow) []binding {
	if b.Service == nil {
		return nil
	}
	var bound []binding
	for i, node := range workflow.Nodes() {
		agent, ok := b.Agents[node.Agent]
		own, exists := b.Processes[node.Process]
		if !ok || !exists || node.Agent == own.Agent {
			continue
		}
		process := b.Resolved(node.Process)
		effective, err := policy.Compose(*b.Service, process, policy.Caller{})
		if err != nil {
			continue
		}
		bound = append(bound, binding{node: nodeLabel(workflow, i, node), process: process, agent: agent, effective: effective})
	}
	return bound
}

// problem is a problem of the workflow named name about the binding: it
// names the node, its process and why the process cannot run there.
func (bound binding) problem(name, format string, args ...any) Problem {
	return Problem{Subject: "workflow " + name, Message: bound.node + ": process " + bound.process.Name + ": " + fmt.Sprintf(format, args...)}
}

// unresumed are the turns of the process that resume its call's session, a
// repair turn (ADR-002 rule 4) and a recovery turn (ADR-024 rule 6), each
// with why the session cannot be resumed.
func unresumed(process definition.Process, effective policy.Effective, why string) []string {
	var problems []string
	if process.Verify.Repairs() {
		problems = append(problems, fmt.Sprintf("verify.max_attempts %d repairs in the call's session, but %s", process.Verify.MaxAttempts, why))
	}
	if resumes := effective.Stale.Recover.MaxResumes; resumes > 0 {
		problems = append(problems, fmt.Sprintf("stale.recover.max_resumes %d recovers in the call's session, but %s", resumes, why))
	}
	return problems
}
