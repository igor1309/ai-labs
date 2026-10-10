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
			version, plan, found := planOn(effective, mapping, versions, b.Service.StateReaching)
			if !found {
				continue
			}
			planned := BindingPlan{Workflow: name, Node: node.Name, Label: nodeLabel(workflow, i, node), Process: process.Name, Agent: agent.Name, Runtime: mapping.Name, Version: version}
			planned.Required, planned.Withheld = split(plan.Withheld, effective.Require)
			plans = append(plans, planned)
		}
	}
	return plans
}

// SettingsPlan is the plan a call composed to effective would be given on
// mapping, judged on the settings alone, as BindingPlans plans a binding
// whose runtime was not asked: on the version the mapping verifies that
// withholds the fewest required permissions, then the fewest others. Its
// Withheld has the required permissions it withholds too. It is for a view
// of a call the settings refuse: never one a call is given. found is false
// where no version can be planned.
func SettingsPlan(service definition.Service, effective policy.Effective, mapping definition.Mapping) (plan enforce.Plan, found bool) {
	_, plan, found = planOn(effective, mapping, mapping.Versions(), service.StateReaching)
	return plan, found
}

// planOn plans effective on whichever of versions withholds the fewest
// permissions in tools.require, then the fewest others, the first when
// tied, required permissions withheld or not; found is false where none
// can be planned.
func planOn(effective policy.Effective, mapping definition.Mapping, versions, stateReaching []string) (version string, best enforce.Plan, found bool) {
	fewest := func(plan enforce.Plan) (required, others int) {
		withheldRequired, withheld := split(plan.Withheld, effective.Require)
		return len(withheldRequired), len(withheld)
	}
	for _, candidate := range versions {
		verified, _ := mapping.ForVersion(candidate)
		plan, err := enforce.Make(effective.Permissions, verified, nil, stateReaching)
		if err != nil {
			continue
		}
		required, others := fewest(plan)
		bestRequired, bestOthers := fewest(best)
		if !found || required < bestRequired || required == bestRequired && others < bestOthers {
			version, best, found = candidate, plan, true
		}
	}
	return version, best, found
}

// split divides withheld into the permissions in required and the others.
func split(withheld, required []string) (inRequired, others []string) {
	for _, permission := range withheld {
		if contains(required, permission) {
			inRequired = append(inRequired, permission)
		} else {
			others = append(others, permission)
		}
	}
	return inRequired, others
}

// CostRefusal is why a call composed to effective cannot run on the runtime
// named runtime, which enforces a cost limit only where enforces says so:
// the limit it sets, which the runtime cannot enforce; "" when the call can
// run.
func CostRefusal(effective policy.Effective, runtime string, enforces bool) string {
	if effective.MaxCostUSD == nil || enforces {
		return ""
	}
	return fmt.Sprintf("runtime %s cannot enforce the cost limit %g", runtime, *effective.MaxCostUSD)
}

// CostProblems reports the processes of the agent that set a cost limit,
// which the agent's runtime was found unable to enforce, and each node that
// binds such a process to the agent (ADR-030 rule 8). Only the runtime can
// say whether it enforces one.
func CostProblems(b Bundle, agent definition.Agent) []Problem {
	mapping, ok := b.Mappings[agent.Runtime]
	if !ok || b.Service == nil {
		return nil
	}
	var problems []Problem
	for _, name := range sortedKeys(b.Processes) {
		process := b.Resolved(name)
		if process.Agent != agent.Name {
			continue
		}
		// One whose limits do not compose has no cost limit; Check reports
		// it.
		effective, err := policy.Compose(*b.Service, process, policy.Caller{})
		if err != nil {
			continue
		}
		if message := CostRefusal(effective, mapping.Name, false); message != "" {
			problems = append(problems, Problem{Subject: "process " + name, Message: message, Agent: agent.Name})
		}
	}
	for _, name := range sortedKeys(b.Workflows) {
		for _, bound := range b.bindings(b.Workflows[name]) {
			if bound.agent.Name != agent.Name {
				continue
			}
			if message := CostRefusal(bound.effective, mapping.Name, false); message != "" {
				problems = append(problems, bound.problem(name, "%s", message))
			}
		}
	}
	return problems
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
