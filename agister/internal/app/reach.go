package app

import (
	"strings"

	"github.com/igor1309/ai-labs/agister/internal/contract"
	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
)

// reach is what the problems of a check report refuse (ADR-012): a problem
// of one document refuses the calls that depend on it, through any chain of
// uses, and a problem that depends on the agent refuses only the calls that
// select that agent. What depends on what is the report's uses.
type reach struct {
	definitions map[contract.DefinitionRef]contract.Definition
	// The problems of each document itself.
	about map[contract.DefinitionRef][]reachProblem
	// The problems of each process that depend on its agent, by process.
	withAgent map[string][]reachProblem
	// The problems that stop every command.
	stops []string
}

type reachProblem struct {
	message string // without its subject
	agent   string // the agent it depends on, if it does
}

var serviceRef = contract.DefinitionRef{Kind: string(definition.KindService), Name: "service"}

// newReach reads what report's problems refuse. A problem whose reach the
// report does not say stops every command: where it cannot be said what a
// problem stops, it stops everything.
func newReach(report contract.CheckReport) *reach {
	r := &reach{
		definitions: map[contract.DefinitionRef]contract.Definition{},
		about:       map[contract.DefinitionRef][]reachProblem{},
		withAgent:   map[string][]reachProblem{},
	}
	for _, d := range report.Definitions {
		r.definitions[contract.DefinitionRef{Kind: d.Kind, Name: d.Name}] = d
	}
	if len(report.Reach) != len(report.Problems) {
		r.stops = append(r.stops, report.Problems...)
		return r
	}
	for _, item := range report.Reach {
		if item.Stops || item.Subject == nil {
			r.stops = append(r.stops, item.Problem)
			continue
		}
		subject := *item.Subject
		problem := reachProblem{message: strings.TrimPrefix(item.Problem, label(subject)+": "), agent: item.Agent}
		if item.Agent != "" && subject.Kind == string(definition.KindProcess) {
			r.withAgent[subject.Name] = append(r.withAgent[subject.Name], problem)
			continue
		}
		r.about[subject] = append(r.about[subject], problem)
	}
	return r
}

// label names a document as check's problems do.
func label(ref contract.DefinitionRef) string {
	return definition.Kind(ref.Kind).Singular() + " " + ref.Name
}

// step is one document a call depends on, and the one that uses it; from
// is nil for the call's own document and the service settings.
type step struct {
	ref  contract.DefinitionRef
	from *step
}

// chain is how the call reaches the step's document: "process p uses agent
// a, which uses runtime mapping rt".
func (s *step) chain() string {
	var labels []string
	for at := s; at != nil; at = at.from {
		labels = append([]string{label(at.ref)}, labels...)
	}
	text := labels[0]
	for i, next := range labels[1:] {
		if i == 0 {
			text += " uses " + next
		} else {
			text += ", which uses " + next
		}
	}
	return text
}

// walk is every document a call of root depends on, each once, by the
// shortest chain of uses: root itself, the service settings, then what
// they use. agent, when set, is the agent a call of the process root
// selects in place of its own.
func (r *reach) walk(root contract.DefinitionRef, agent string) []*step {
	steps := []*step{{ref: root}}
	seen := map[contract.DefinitionRef]bool{root: true}
	if root != serviceRef {
		steps = append(steps, &step{ref: serviceRef})
		seen[serviceRef] = true
	}
	for i := 0; i < len(steps); i++ {
		current := steps[i]
		uses := r.definitions[current.ref].Uses
		if i == 0 && agent != "" && root.Kind == string(definition.KindProcess) {
			var selected []contract.DefinitionRef
			for _, used := range uses {
				if used.Kind != string(definition.KindAgent) {
					selected = append(selected, used)
				}
			}
			uses = append(selected, contract.DefinitionRef{Kind: string(definition.KindAgent), Name: agent})
		}
		for _, used := range uses {
			if !seen[used] {
				seen[used] = true
				steps = append(steps, &step{ref: used, from: current})
			}
		}
	}
	return steps
}

// call is the refusal of a call of process, with agent in place of its own
// when set; nil when nothing it depends on has a problem.
func (r *reach) call(process, agent string) error {
	return r.refusal(contract.DefinitionRef{Kind: string(definition.KindProcess), Name: process}, agent)
}

// workflow is the refusal of a run of the workflow name, for a problem in
// it or in what any node's call depends on; nil when there is none.
func (r *reach) workflow(name string) error {
	return r.refusal(contract.DefinitionRef{Kind: string(definition.KindWorkflow), Name: name}, "")
}

// refusal names each document with problems a call of root depends on, its
// path, its problems and the chain that reaches it.
func (r *reach) refusal(root contract.DefinitionRef, agent string) error {
	if r == nil {
		return nil
	}
	var parts []string
	for _, s := range r.walk(root, agent) {
		var messages []string
		for _, problem := range r.about[s.ref] {
			messages = append(messages, problem.message)
		}
		if s.ref.Kind == string(definition.KindProcess) {
			for _, problem := range r.withAgent[s.ref.Name] {
				// A call that selects another agent is judged on that one.
				if s.ref == root && agent != "" && agent != problem.agent {
					continue
				}
				messages = append(messages, problem.message)
			}
		}
		if len(messages) == 0 {
			continue
		}
		where := ""
		if path := r.definitions[s.ref].Path; path != "" {
			where = " (" + path + ")"
		}
		parts = append(parts, s.chain()+where+": "+strings.Join(messages, "; "))
	}
	if len(parts) == 0 {
		return nil
	}
	return &Refusal{Reason: strings.Join(parts, "; ")}
}

// refuses is the roots among roots whose calls, without --agent, depend on
// subject.
func (r *reach) refuses(subject contract.DefinitionRef, roots []contract.DefinitionRef) []string {
	var names []string
	for _, root := range roots {
		for _, s := range r.walk(root, "") {
			if s.ref == subject {
				names = append(names, root.Name)
				break
			}
		}
	}
	return names
}
