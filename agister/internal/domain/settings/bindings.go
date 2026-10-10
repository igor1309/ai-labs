package settings

import (
	"fmt"

	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
	"github.com/igor1309/ai-labs/agister/internal/domain/enforce"
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

// BindingPlan is what a call of one node of a workflow would be given on
// the runtime of the agent the node binds its process to (ADR-030 rules 7
// and 8).
type BindingPlan struct {
	Workflow string
	Node     string
	Label    string // the node as the workflow's problems name it
	Process  string
	Agent    string
	Runtime  string // the runtime mapping's name
	Version  string // the runtime version it is planned on
	// Withheld are the permissions the process allows and does not require
	// that the plan does not give: not a problem, but shown.
	Withheld []string
	// Required are the permissions in tools.require the plan would
	// withhold.
	Required []string
}

// BindingPlans plans every node of every workflow as its call would, on
// the agent the node binds its process to, its process's own where it
// names none, workflows by name, each workflow's nodes in declaration
// order, the join last. installed is the runtime version found for an
// agent, by name: an agent's runtime is planned on it where it is known,
// and otherwise on the version its mapping verifies that withholds the
// fewest required permissions, then the fewest others, the first when
// tied. A node that cannot be planned at all is left out: what stops it is
// a problem Check, PlanProblems or ResumeProblems reports.
func BindingPlans(b Bundle, installed map[string]string) []BindingPlan {
	if b.Service == nil {
		return nil
	}
	var plans []BindingPlan
	for _, name := range sortedKeys(b.Workflows) {
		workflow := b.Workflows[name]
		for i, node := range workflow.Nodes() {
			if _, ok := b.Processes[node.Process]; !ok {
				continue
			}
			process := b.Resolved(node.Process)
			agentName := node.Agent
			if agentName == "" {
				agentName = process.Agent
			}
			agent, ok := b.Agents[agentName]
			if !ok {
				continue
			}
			mapping, ok := b.Mappings[agent.Runtime]
			if !ok {
				continue
			}
			effective, err := policy.Compose(*b.Service, process, policy.Caller{})
			if err != nil {
				continue
			}
			versions := mapping.Versions()
			if version, ok := installed[agent.Name]; ok {
				versions = []string{version}
			}
			best, found := BindingPlan{}, false
			for _, version := range versions {
				verified, _ := mapping.ForVersion(version)
				plan, err := enforce.Make(effective.Permissions, verified, nil, b.Service.StateReaching)
				if err != nil {
					continue
				}
				planned := BindingPlan{Workflow: name, Node: node.Name, Label: nodeLabel(workflow, i, node), Process: process.Name, Agent: agent.Name, Runtime: mapping.Name, Version: version}
				for _, permission := range plan.Withheld {
					if contains(effective.Require, permission) {
						planned.Required = append(planned.Required, permission)
					} else {
						planned.Withheld = append(planned.Withheld, permission)
					}
				}
				if !found || len(planned.Required) < len(best.Required) ||
					len(planned.Required) == len(best.Required) && len(planned.Withheld) < len(best.Withheld) {
					best, found = planned, true
				}
			}
			if found {
				plans = append(plans, best)
			}
		}
	}
	return plans
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
