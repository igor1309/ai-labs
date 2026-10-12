// Package settings checks a whole set of parsed definitions for consistency:
// references resolve, limits compose, every process can be enforced on the
// runtime of each agent a workflow's node binds it to, every workflow's
// nodes can run as ADR-003 has them. It reports every problem at once.
package settings

import (
	"fmt"
	"sort"
	"strings"

	"github.com/igor1309/ai-labs/agister/internal/domain/enforce"
	"github.com/igor1309/ai-labs/agister/internal/domain/policy"
)

// Bundle is every definition that parsed, with what the checks use of
// each.
type Bundle struct {
	Service   *Service
	Agents    map[string]Agent
	Processes map[string]Process
	Mappings  map[string]Mapping
	Schemas   map[string]bool
	Workflows map[string]Workflow
	// Prompts are the prompt documents the settings have; an unreadable
	// one is a problem of its own, not of the processes that name it.
	Prompts map[string]bool
	// Skills are the skill documents the settings have; a broken one is a
	// problem of its own, not of the agents and processes that name it.
	Skills map[string]bool
	// Briefs are the brief forms the settings have; a broken one is a
	// problem of its own, not of the processes and workflows that name it.
	Briefs map[string]bool
	// Bases are the processes some process extends, each with those that
	// extend it, whether or not they parsed (ADR-030 rule 9).
	Bases map[string][]string
}

// Service is what of the service bounds every call: its ceilings, whose
// permissions are the vocabulary, and the permissions never granted.
type Service struct {
	Ceilings policy.Ceilings
	// StateReaching are the permissions that would let an agent reach
	// Agister's own state.
	StateReaching []string
}

// Agent is a runtime profile, as a node binds a process to it.
type Agent struct {
	Name    string
	Runtime string // the name of a runtime mapping
	Effort  string
	Skills  []string
}

// Mapping is what one runtime adapter offers: the efforts it supports and
// the primitives a plan is made of.
type Mapping struct {
	Name    string
	Adapter string
	Efforts []string
	Offer   enforce.Offer
}

// Process is named work, resolved as a call resolves it: its limits hold
// the verification it names (ADR-010 rule 3), unless the settings lack it.
type Process struct {
	Name     string
	Params   []Param
	Values   []Value
	Prompt   string
	Guidance []string
	Skills   []string
	// Schema is the output schema its output is validated against; "": its
	// output is text.
	Schema string
	Limits policy.Declared
	// Resumable says a call's session may be resumed (ADR-030 rule 3);
	// otherwise it is fresh-only.
	Resumable bool
}

// Param is a value the caller of a process supplies.
type Param struct {
	Name       string
	HasDefault bool
}

// Value is one input, and the kind of source it comes from.
type Value struct {
	Name   string
	Source string
	// Forms are the brief forms its text must have one of, by name.
	Forms []string
}

// collectionSource is the input source through which a workflow's join
// receives the collection (ADR-003 rule 4).
const collectionSource = "workflow.collection"

// collects reports the inputs of the process that receive a workflow's
// collection.
func (p Process) collects() []string {
	var names []string
	for _, value := range p.Values {
		if value.Source == collectionSource {
			names = append(names, value.Name)
		}
	}
	return names
}

// Node is one node of a workflow: the process it calls and the agent it
// binds the process to (ADR-030 rule 5).
type Node struct {
	Name    string
	Process string
	Agent   string
}

// Workflow is fan-out nodes and a join (ADR-003), or one call (ADR-030
// rule 6).
type Workflow struct {
	Name   string
	Values []Value
	FanOut []Node
	Join   Node
	// Call is the one node of a workflow of one call; nil: the workflow
	// fans out and joins.
	Call *Node
}

// nodes lists a workflow's nodes: the one call, or the fan-out nodes in
// declaration order, then the join.
func (w Workflow) nodes() []Node {
	if w.Call != nil {
		return []Node{*w.Call}
	}
	return append(append([]Node(nil), w.FanOut...), w.Join)
}

// Mechanisms are what the code provides, named by settings.
type Mechanisms struct {
	Sources  []string // input source kinds
	Adapters []string // runtime adapters
}

// Problem is one inconsistency, attributed to a definition.
type Problem struct {
	Subject string
	Message string
	// Agent is set on a process's problem that depends on the agent it
	// names (ADR-015 rule 2): it holds for a call of the process only with
	// that agent.
	Agent string
	// Unattributed is set on a problem no one document is at fault for
	// (ADR-015 rule 4).
	Unattributed bool
	// Unknown: it names a mechanism the code does not provide, as settings
	// written for a newer Agister would.
	Unknown bool
}

func (p Problem) String() string { return p.Subject + ": " + p.Message }

// Check returns every problem in the bundle, sorted by subject.
func Check(b Bundle, m Mechanisms) []Problem {
	var problems []Problem
	add := func(subject, format string, args ...any) {
		problems = append(problems, Problem{Subject: subject, Message: fmt.Sprintf(format, args...)})
	}
	unknown := func(subject, format string, args ...any) {
		problems = append(problems, Problem{Subject: subject, Message: fmt.Sprintf(format, args...), Unknown: true})
	}
	if b.Service == nil {
		add("service", "service settings are missing")
		return problems
	}
	vocabulary := b.Service.Ceilings.Permissions

	for _, name := range sortedKeys(b.Mappings) {
		mapping := b.Mappings[name]
		subject := "runtime mapping " + name
		if !contains(m.Adapters, mapping.Adapter) {
			unknown(subject, "unknown adapter %q (available: %s)", mapping.Adapter, strings.Join(m.Adapters, ", "))
		}
		if unknown := mapping.Offer.UnknownPermissions(vocabulary); len(unknown) > 0 {
			add(subject, "grants permissions not in the vocabulary: %s", strings.Join(unknown, ", "))
		}
		if verified, _ := mapping.Offer.ForAnyVersion(); len(verified.Primitives) == 0 {
			add(subject, "verifies no primitive against any runtime version; calls on it are refused")
		}
	}

	for _, name := range sortedKeys(b.Agents) {
		agent := b.Agents[name]
		subject := "agent " + name
		// A skill is a problem of what names it (ADR-021 rule 4).
		for _, skill := range agent.Skills {
			if !b.Skills[skill] {
				add(subject, "skill %q does not exist", skill)
			}
		}
		mapping, ok := b.Mappings[agent.Runtime]
		if !ok {
			add(subject, "runtime mapping %q does not exist", agent.Runtime)
			continue
		}
		if agent.Effort != "" && !contains(mapping.Efforts, agent.Effort) {
			add(subject, "effort %q is not supported by %s (supported: %s)", agent.Effort, mapping.Name, strings.Join(mapping.Efforts, ", "))
		}
	}

	for _, name := range sortedKeys(b.Processes) {
		process := b.Processes[name]
		subject := "process " + name
		for _, value := range process.Values {
			if !contains(m.Sources, value.Source) {
				unknown(subject, "input %s: unknown source %q (available: %s)", value.Name, value.Source, strings.Join(m.Sources, ", "))
			}
			// A form its text must have is part of the process (ADR-026 rule
			// 8).
			for _, form := range b.missingForms(value) {
				add(subject, "input %s: brief %q does not exist", value.Name, form)
			}
		}
		// So are its prompt and its guidance: a name no layer has refuses
		// its calls (ADR-028 rule 8).
		if process.Prompt != "" && !b.Prompts[process.Prompt] {
			add(subject, "prompt %q does not exist", process.Prompt)
		}
		for _, name := range process.Guidance {
			if !b.Prompts[name] {
				add(subject, "guidance: prompt %q does not exist", name)
			}
		}
		// So is a skill (ADR-021 rule 4).
		for _, skill := range process.Skills {
			if !b.Skills[skill] {
				add(subject, "skill %q does not exist", skill)
			}
		}
		if process.Schema != "" && !b.Schemas[process.Schema] {
			add(subject, "output schema %q does not exist", process.Schema)
		}
		effective, err := policy.Compose(b.Service.Ceilings, process.Limits, policy.Caller{})
		if err != nil {
			add(subject, "%v", strings.TrimPrefix(err.Error(), "process "+name+" is invalid:\n  "))
			continue
		}
		// A repair turn resumes the call's session (ADR-002 rule 4), and so
		// does a recovery turn (ADR-024 rule 6): each needs a session that
		// may be resumed, which the process says (ADR-030 rule 3).
		if !process.Resumable {
			for _, message := range unresumed(process, effective, subject+" is fresh-only") {
				add(subject, "%s", message)
			}
		}
	}

	for _, name := range sortedKeys(b.Workflows) {
		workflow := b.Workflows[name]
		subject := "workflow " + name
		// agister run <name> runs one or the other.
		if _, ok := b.Processes[name]; ok {
			problems = append(problems, Problem{Subject: subject, Message: "a process has the same name; name one of them otherwise", Unattributed: true})
		}
		for _, value := range workflow.Values {
			if !contains(m.Sources, value.Source) {
				unknown(subject, "input %s: unknown source %q (available: %s)", value.Name, value.Source, strings.Join(m.Sources, ", "))
			}
			for _, form := range b.missingForms(value) {
				add(subject, "input %s: brief %q does not exist", value.Name, form)
			}
		}
		for _, problem := range WorkflowProblems(workflow, b.Processes, b.Bases) {
			add(subject, "%s", problem)
		}
		// The agent a node binds its process to is the workflow's to name
		// (ADR-030 rule 5).
		for i, node := range workflow.nodes() {
			if _, ok := b.Agents[node.Agent]; !ok {
				add(subject, "%s: agent %q does not exist", nodeLabel(workflow, i, node), node.Agent)
			}
		}
		// So is the binding: a process that cannot run on the agent a node
		// binds it to is a problem of the workflow, which names the node
		// (ADR-030 rule 8).
		for _, bound := range b.bindings(workflow) {
			mapping, ok := b.Mappings[bound.agent.Runtime]
			if !ok {
				continue // reported on the agent
			}
			if err := planOnSomeVersion(bound.effective, mapping.Offer, b.Service.StateReaching); err != nil {
				problems = append(problems, bound.problem(name, "cannot run on agent %s's runtime %s: %v", bound.agent.Name, mapping.Name, err))
			}
		}
	}

	sort.SliceStable(problems, func(i, j int) bool { return problems[i].Subject < problems[j].Subject })
	return problems
}

// missingForms lists the brief forms value names that the bundle lacks.
func (b Bundle) missingForms(value Value) []string {
	var missing []string
	for _, form := range value.Forms {
		if !b.Briefs[form] {
			missing = append(missing, form)
		}
	}
	return missing
}

// planOnSomeVersion succeeds if the plan can be made for at least one
// version the mapping is verified for: a call runs on one version, so
// primitives verified for different versions cannot be combined. Otherwise
// it explains the failure on the version with the most verified primitives
// (the first, when tied).
func planOnSomeVersion(effective policy.Effective, offer enforce.Offer, stateReaching []string) error {
	versions := offer.Versions()
	if len(versions) == 0 {
		versions = []string{""} // nothing verified: reported on the mapping
	}
	var closest error
	most := -1
	for _, version := range versions {
		verified, unverified := offer.ForVersion(version)
		_, err := enforce.Make(effective.Permissions, verified, effective.Require, stateReaching)
		if err == nil {
			return nil
		}
		if len(verified.Primitives) > most {
			most = len(verified.Primitives)
			closest = fmt.Errorf("%v%s", err, unverifiedNote(unverified, version))
		}
	}
	return closest
}

// PlanProblems reports each node that binds a process to the agent which
// cannot be planned on the runtime version the agent was found to have
// (ADR-030 rule 8). Composition problems are left to Check.
func PlanProblems(b Bundle, agent Agent, version string) []Problem {
	mapping, ok := b.Mappings[agent.Runtime]
	if !ok || b.Service == nil {
		return nil
	}
	verified, unverified := mapping.Offer.ForVersion(version)
	// refused is why the plan cannot be made, "" when it can.
	refused := func(effective policy.Effective) string {
		if _, err := enforce.Make(effective.Permissions, verified, effective.Require, b.Service.StateReaching); err != nil {
			return fmt.Sprintf("cannot run on agent %s's runtime %s version %s: %v%s", agent.Name, mapping.Name, version, err, unverifiedNote(unverified, version))
		}
		return ""
	}
	var problems []Problem
	for _, name := range sortedKeys(b.Workflows) {
		for _, bound := range b.bindings(b.Workflows[name]) {
			if bound.agent.Name != agent.Name {
				continue
			}
			if message := refused(bound.effective); message != "" {
				problems = append(problems, bound.problem(name, "%s", message))
			}
		}
	}
	return problems
}

// ResumeProblems reports each node that binds to the agent a process whose
// turns resume their call's session, which the agent's runtime was found
// unable to resume (ADR-030 rules 3 and 8). Only the runtime can say
// whether it resumes one.
func ResumeProblems(b Bundle, agent Agent) []Problem {
	mapping, ok := b.Mappings[agent.Runtime]
	if !ok || b.Service == nil {
		return nil
	}
	why := "runtime " + mapping.Name + " cannot resume sessions"
	var problems []Problem
	for _, name := range sortedKeys(b.Workflows) {
		for _, bound := range b.bindings(b.Workflows[name]) {
			if bound.agent.Name != agent.Name {
				continue
			}
			for _, message := range unresumed(bound.process, bound.effective, why) {
				problems = append(problems, bound.problem(name, "%s", message))
			}
		}
	}
	return problems
}

// unverifiedNote names the primitives a refused plan could not use.
func unverifiedNote(unverified []string, version string) string {
	if len(unverified) == 0 {
		return ""
	}
	return " (not verified for version " + version + ": " + strings.Join(unverified, ", ") + ")"
}

func sortedKeys[V any](m map[string]V) []string {
	keys := make([]string, 0, len(m))
	for key := range m {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func contains(list []string, value string) bool {
	for _, item := range list {
		if item == value {
			return true
		}
	}
	return false
}
