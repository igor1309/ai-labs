package app

import (
	"strings"

	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
)

// DocumentRef names one settings document.
type DocumentRef struct {
	Kind definition.Kind
	Name string
}

// reach is what the problems of the settings refuse (ADR-013): a problem of
// one document refuses the calls that depend on it, through any chain of
// uses, and a problem that depends on the agent refuses only the calls that
// select that agent.
type reach struct {
	documents map[DocumentRef]reachDocument
	// The problems of each document, in the order found.
	about map[DocumentRef][]reachProblem
}

// reachDocument is one document listed in the settings.
type reachDocument struct {
	path string
	uses []DocumentRef // whether or not they exist
}

type reachProblem struct {
	message string // without its document's name
	agent   string // the agent it depends on, if it does
}

var (
	serviceRef   = DocumentRef{Kind: definition.KindService, Name: "service"}
	workspaceRef = DocumentRef{Kind: definition.KindWorkspace, Name: string(definition.KindWorkspace)}
)

func newReach() *reach {
	return &reach{documents: map[DocumentRef]reachDocument{}, about: map[DocumentRef][]reachProblem{}}
}

// label names a document as check's problems do.
func label(ref DocumentRef) string {
	return ref.Kind.Singular() + " " + ref.Name
}

// step is one document a call depends on, and the one that uses it; from
// is nil for the call's own document and the service settings.
type step struct {
	ref  DocumentRef
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
func (r *reach) walk(root DocumentRef, agent string) []*step {
	steps := []*step{{ref: root}}
	seen := map[DocumentRef]bool{root: true}
	if root != serviceRef {
		steps = append(steps, &step{ref: serviceRef})
		seen[serviceRef] = true
	}
	for i := 0; i < len(steps); i++ {
		current := steps[i]
		uses := r.documents[current.ref].uses
		if i == 0 && agent != "" && root.Kind == definition.KindProcess {
			var selected []DocumentRef
			for _, used := range uses {
				if used.Kind != definition.KindAgent {
					selected = append(selected, used)
				}
			}
			uses = append(selected, DocumentRef{Kind: definition.KindAgent, Name: agent})
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

// listed says the settings list the document ref.
func (r *reach) listed(ref DocumentRef) bool {
	_, ok := r.documents[ref]
	return ok
}

// call is the refusal of a call of process, with agent in place of its own
// when set; nil when nothing it depends on has a problem.
func (r *reach) call(process, agent string) error {
	return r.refusal(DocumentRef{Kind: definition.KindProcess, Name: process}, agent)
}

// workflow is the refusal of a run of the workflow name, for a problem in
// it or in what any node's call depends on; nil when there is none.
func (r *reach) workflow(name string) error {
	return r.refusal(DocumentRef{Kind: definition.KindWorkflow, Name: name}, "")
}

// explain gives a problem discovered during resolution the same document,
// path and use chain as a problem found by check.
func (r *reach) explain(root DocumentRef, agent string, subject DocumentRef, message string) error {
	for _, s := range r.walk(root, agent) {
		if s.ref != subject {
			continue
		}
		return refuse("%s%s: %s", s.chain(), r.where(subject), message)
	}
	return refuse("%s", message)
}

// where is the document's path, as a refusal shows it after its chain.
func (r *reach) where(ref DocumentRef) string {
	if path := r.documents[ref].path; path != "" {
		return " (" + path + ")"
	}
	return ""
}

// refusal names each document with problems a call of root depends on, its
// path, its problems and the chain that reaches it.
func (r *reach) refusal(root DocumentRef, agent string) error {
	var parts []string
	for _, s := range r.walk(root, agent) {
		var messages []string
		for _, problem := range r.about[s.ref] {
			// A call that selects another agent is judged on that one.
			if problem.agent != "" && s.ref == root && agent != "" && agent != problem.agent {
				continue
			}
			messages = append(messages, problem.message)
		}
		if len(messages) == 0 {
			continue
		}
		parts = append(parts, s.chain()+r.where(s.ref)+": "+strings.Join(messages, "; "))
	}
	if len(parts) == 0 {
		return nil
	}
	return &Refusal{Reason: strings.Join(parts, "; ")}
}

// refuses is the roots among roots whose calls, without --agent, depend on
// subject.
func (r *reach) refuses(subject DocumentRef, roots []DocumentRef) []string {
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
