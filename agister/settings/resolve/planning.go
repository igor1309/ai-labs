package resolve

import (
	"fmt"
	"slices"
)

// planAll plans every step of items, in the workflow of name, those in
// branches a run may not take too, and gives each problem of theirs to
// fault.
func (w *walk) planAll(name string, items []Item, fault func(Problem)) {
	for _, item := range items {
		switch {
		case item.Process.Value != "":
			w.planStep(name, item, fault)
		case item.Parallel != nil:
			w.planAll(name, item.Parallel, fault)
		case item.Branch != nil:
			w.planAll(name, item.Branch, fault)
		case item.Repeat != nil:
			w.planAll(name, item.Repeat.Steps, fault)
		}
	}
}

// planStep plans the step item: what its process and the step need of its
// runtime, and the permissions its process requires, each problem at the
// step's origin; and each extra of its plan, a warning there. Where its
// agent falls back, it plans the process on the fallback's runtime too,
// each problem at the fallback's origin. A step whose process, agent or
// runtime is at fault is not planned: they refuse it.
func (w *walk) planStep(name string, item Item, fault func(Problem)) {
	process, ok := w.processes[item.Process.Value]
	if !ok {
		return
	}
	agent, ok := w.agents[item.Agent.Value]
	if !ok {
		return
	}
	plan, ok := w.planOn(process, agent, item.Session != nil, func(message string) {
		fault(Problem{Origin: item.Origin, Message: message})
	})
	if !ok {
		return
	}
	plan.Workflow, plan.Place = name, item.Origin.Place
	w.plans = append(w.plans, plan)
	for _, extra := range plan.Extra {
		w.warnings = append(w.warnings, Problem{Origin: item.Origin,
			Message: fmt.Sprintf("its plan grants %q beyond what its process %q allows", extra, process.Name)})
	}
	// The fallback is the call made again fresh: it resumes no session,
	// and its own fallback is never taken (ADR-004, rule 8).
	fallback, ok := w.agents[agent.Fallback.Value]
	if !ok || fallback.Name == agent.Name {
		return
	}
	plan, ok = w.planOn(process, fallback, false, func(message string) {
		fault(Problem{Origin: agent.Fallback.Origin, Message: fmt.Sprintf("the step %q falls back to it: %s", item.Name, message)})
	})
	if !ok {
		return
	}
	plan.Workflow, plan.Place = name, item.Origin.Place
	w.plans = append(w.plans, plan)
	for _, extra := range plan.Extra {
		w.warnings = append(w.warnings, Problem{Origin: item.Origin,
			Message: fmt.Sprintf("its plan on its fallback %q grants %q beyond what its process %q allows", fallback.Name, extra, process.Name)})
	}
}

// planOn is the plan of process on agent's runtime, and whether its runtime
// resolved: what the process, and a step resuming a session where resumes,
// need of the runtime, and the permissions the process requires, each
// problem given to problem.
func (w *walk) planOn(process Process, agent Agent, resumes bool, problem func(string)) (Plan, bool) {
	runtime, ok := w.runtimes[agent.Runtime.Value]
	if !ok {
		return Plan{}, false
	}
	who := fmt.Sprintf("its process %q", process.Name)
	for _, need := range []struct {
		needs, can bool
		what, who  string
	}{
		{process.Schema.Value != "", w.facts[runtime.Name].Schema, "checks output against a schema", who},
		{process.Recovery, w.facts[runtime.Name].Session, "resumes a session", who},
		{resumes, w.facts[runtime.Name].Session, "resumes a session", "it"},
		{len(process.Skills) > 0, w.facts[runtime.Name].Skills, "takes skills", who},
		{process.StaleToolCalls, w.facts[runtime.Name].ToolCalls, "reports tool calls", who},
		{process.StaleToolCommands, w.facts[runtime.Name].ToolCommands, "reports tool commands", who},
	} {
		if need.needs && !need.can {
			problem(fmt.Sprintf("its runtime %q %s, as %s needs", runtime.Name, need.what, need.who))
		}
	}
	plan := planOf(process, runtime)
	for _, required := range process.Require {
		if !slices.Contains(plan.Granted, required) {
			problem(fmt.Sprintf("its runtime %q grants the permission %q, as its process %q requires", runtime.Name, required, process.Name))
		}
	}
	plan.Agent = agent.Name
	return plan, true
}

// planOf is the plan of process on runtime (ADR-003, rule 4): what the
// runtime grants with no option, and the options that give what process
// requires with the fewest grants beyond what it allows, the first in the
// mapping's order of those that tie. Of "any", an option for each required
// permission not yet granted; of "one", the one option that gives most of
// what is required. An option grants each permission once, however often
// it lists one.
func planOf(process Process, runtime Runtime) Plan {
	allowed := slices.Clone(process.Allow)
	for _, required := range process.Require {
		if !slices.Contains(allowed, required) {
			allowed = append(allowed, required)
		}
	}
	plan := Plan{Process: process.Name, Runtime: runtime.Name, Required: process.Require, Allowed: allowed}
	granted := slices.Clone(runtime.Grants)
	// beyond is how many of option's grants are neither granted nor
	// allowed; lacking, how many required permissions granted with it lacks.
	beyond := func(option Option) int {
		n := 0
		for _, grant := range distinct(option.Grants) {
			if !slices.Contains(granted, grant) && !slices.Contains(allowed, grant) {
				n++
			}
		}
		return n
	}
	lacking := func(option Option) int {
		n := 0
		for _, required := range process.Require {
			if !slices.Contains(granted, required) && !slices.Contains(option.Grants, required) {
				n++
			}
		}
		return n
	}
	take := func(option Option) {
		plan.Options = append(plan.Options, option.Name)
		for _, grant := range option.Grants {
			if !slices.Contains(granted, grant) {
				granted = append(granted, grant)
			}
		}
	}
	switch runtime.Select {
	case "any":
		for _, required := range process.Require {
			best := -1
			for i, option := range runtime.Options {
				if !slices.Contains(granted, required) && slices.Contains(option.Grants, required) &&
					(best < 0 || beyond(option) < beyond(runtime.Options[best])) {
					best = i
				}
			}
			if best >= 0 {
				take(runtime.Options[best])
			}
		}
	case "one":
		best := -1
		for i, option := range runtime.Options {
			if best < 0 {
				best = i
				continue
			}
			b := runtime.Options[best]
			if lacking(option) < lacking(b) || lacking(option) == lacking(b) && beyond(option) < beyond(b) {
				best = i
			}
		}
		if best >= 0 {
			take(runtime.Options[best])
		}
	}
	plan.Granted = granted
	for _, grant := range granted {
		if !slices.Contains(allowed, grant) {
			plan.Extra = append(plan.Extra, grant)
		}
	}
	for _, permission := range allowed {
		if !slices.Contains(granted, permission) {
			plan.Withheld = append(plan.Withheld, permission)
		}
	}
	return plan
}

// distinct is permissions, each once, in the order first listed.
func distinct(permissions []string) []string {
	var once []string
	for _, permission := range permissions {
		if !slices.Contains(once, permission) {
			once = append(once, permission)
		}
	}
	return once
}

// takes is the problems of agent on the runtime of its name, of the
// runtime's facts: a model it takes none of, and an effort it does not
// accept.
func takes(agent Agent, runtime string, facts Facts) []Problem {
	var problems []Problem
	problem := func(name Name, format string, args ...any) {
		problems = append(problems, Problem{Origin: name.Origin, Message: fmt.Sprintf(format, args...)})
	}
	if agent.Model.Value != "" && !facts.Model {
		problem(agent.Model, "its runtime %q takes a model", runtime)
	}
	if agent.Effort.Value != "" && !slices.Contains(facts.Efforts, agent.Effort.Value) {
		problem(agent.Effort, "its runtime %q takes the effort %q", runtime, agent.Effort.Value)
	}
	return problems
}
