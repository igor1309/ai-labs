package app

import (
	"slices"
	"sort"
	"strings"

	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
)

// DocumentRef names one settings document.
type DocumentRef struct {
	Kind definition.Kind
	Name string
}

// NodeBinding is one node of a workflow: the process it calls and the agent
// it binds the process to (ADR-030 rule 5).
type NodeBinding struct {
	Process string
	Agent   string
}

// reach is what the problems of the settings refuse (ADR-015): a problem of
// one document refuses the calls that depend on it, through any chain of
// uses, and a problem that depends on the agent refuses only the calls that
// run on that agent.
type reach struct {
	documents map[DocumentRef]reachDocument
	// The problems of each document, in the order found.
	about map[DocumentRef][]reachProblem
	// The documents the repository blocks (ADR-018), which refuse what
	// depends on them as a problem does.
	blocked map[DocumentRef]reachBlock
}

// reachDocument is one document listed in the settings.
type reachDocument struct {
	path string
	uses []DocumentRef // whether or not they exist
	// binds are a workflow's nodes: each call's process and agent.
	binds []NodeBinding
}

type reachProblem struct {
	message string // without its document's name
	agent   string // the agent it depends on, if it does
	// It names something this code does not know (definition.Problem).
	unknown bool
}

// reachBlock is the block on one document: the repository's blocks.yaml
// and why.
type reachBlock struct {
	path   string
	reason string // optional
}

var (
	serviceRef = DocumentRef{Kind: definition.KindService, Name: "service"}
	blocksRef  = DocumentRef{Kind: definition.KindBlocks, Name: string(definition.KindBlocks)}
)

func newReach() *reach {
	return &reach{documents: map[DocumentRef]reachDocument{}, about: map[DocumentRef][]reachProblem{}, blocked: map[DocumentRef]reachBlock{}}
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
	// agents, on a process whose calls run on other agents than the one it
	// names, are those agents; "" among them is the one it names.
	agents []string
}

// judged says the problem holds for the calls of the step's process: one
// that depends on the agent the process names holds only for a call that
// runs on that agent (ADR-015 rule 2).
func (s *step) judged(problem reachProblem) bool {
	return problem.agent == "" || s.agents == nil || slices.Contains(s.agents, "") || slices.Contains(s.agents, problem.agent)
}

// calledOn is what a process that uses uses depends on when its calls run
// on agents in place of the agent it names; "" among agents is that one.
func calledOn(uses []DocumentRef, agents []string) []DocumentRef {
	own := slices.Contains(agents, "")
	var selected []DocumentRef
	for _, used := range uses {
		if used.Kind != definition.KindAgent || own {
			selected = append(selected, used)
		}
	}
	for _, agent := range agents {
		if agent != "" {
			selected = append(selected, DocumentRef{Kind: definition.KindAgent, Name: agent})
		}
	}
	return selected
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

// blockedBy names the block on the step's document after the chain that
// reaches it (ADR-018 rule 3): "process p: agent a is blocked by
// /repo/.agister/blocks.yaml: why".
func (s *step) blockedBy(block reachBlock) string {
	text := label(s.ref) + " is blocked by " + block.path
	if block.reason != "" {
		text += ": " + block.reason
	}
	if s.from == nil {
		return text
	}
	return s.from.chain() + ": " + text
}

// walk is every document a call of root depends on, each once, by the
// shortest chain of uses: root itself, the service settings, then what
// they use. agent, when set, is the agent a call of the process root
// selects in place of its own. The nodes of a workflow root each bind
// their process to an agent, in place of the process's own where they name
// one (ADR-030 rule 5).
func (r *reach) walk(root DocumentRef, agent string) []*step {
	bound := map[DocumentRef][]string{}
	switch {
	case root.Kind == definition.KindProcess && agent != "":
		bound[root] = []string{agent}
	case root.Kind == definition.KindWorkflow:
		for _, node := range r.documents[root].binds {
			process := DocumentRef{Kind: definition.KindProcess, Name: node.Process}
			bound[process] = append(bound[process], node.Agent)
		}
	}
	steps := []*step{{ref: root, agents: bound[root]}}
	seen := map[DocumentRef]bool{root: true}
	if root != serviceRef {
		steps = append(steps, &step{ref: serviceRef})
		seen[serviceRef] = true
	}
	for i := 0; i < len(steps); i++ {
		current := steps[i]
		uses := r.documents[current.ref].uses
		if current.agents != nil {
			uses = calledOn(uses, current.agents)
		}
		for _, used := range uses {
			if !seen[used] {
				seen[used] = true
				steps = append(steps, &step{ref: used, from: current, agents: bound[used]})
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
// when set; nil when nothing it depends on has a problem or is blocked.
func (r *reach) call(process, agent string) error {
	return r.refusal(DocumentRef{Kind: definition.KindProcess, Name: process}, agent)
}

// workflow is the refusal of a run of the workflow name, for a problem in
// it or in what any node's call depends on, on the agent its node binds,
// or a block on one of them; nil when there is none.
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
// path, its problems and the chain that reaches it, and each blocked one
// with its block. It counts the problems it names that name something this
// code does not know.
func (r *reach) refusal(root DocumentRef, agent string) error {
	var parts []string
	unknown := 0
	// A base is not work (ADR-030 rule 9).
	if extenders := r.extenders(root); len(extenders) > 0 {
		parts = append(parts, label(root)+" is a base of "+strings.Join(extenders, ", ")+", not work, and is not run (ADR-030 rule 9): run a process that extends it")
	}
	for _, s := range r.walk(root, agent) {
		if block, ok := r.blocked[s.ref]; ok {
			parts = append(parts, s.blockedBy(block))
		}
		var messages []string
		for _, problem := range r.about[s.ref] {
			// A call that runs on another agent is judged on that one.
			if !s.judged(problem) {
				continue
			}
			messages = append(messages, problem.message)
			if problem.unknown {
				unknown++
			}
		}
		if len(messages) == 0 {
			continue
		}
		parts = append(parts, s.chain()+r.where(s.ref)+": "+strings.Join(messages, "; "))
	}
	if len(parts) == 0 {
		return nil
	}
	return &Refusal{Reason: strings.Join(parts, "; "), Unknown: unknown}
}

// extenders are the processes that use the process ref: those that extend
// it, when it is a base (ADR-030 rule 9).
func (r *reach) extenders(ref DocumentRef) []string {
	var names []string
	for from, document := range r.documents {
		if ref.Kind == definition.KindProcess && from.Kind == definition.KindProcess && slices.Contains(document.uses, ref) {
			names = append(names, from.Name)
		}
	}
	sort.Strings(names)
	return names
}

// binders are the workflows a node of which binds the process (ADR-030
// rule 5), sorted.
func (r *reach) binders(process string) []string {
	var names []string
	for ref, document := range r.documents {
		if ref.Kind == definition.KindWorkflow && slices.ContainsFunc(document.binds, func(node NodeBinding) bool { return node.Process == process }) {
			names = append(names, ref.Name)
		}
	}
	sort.Strings(names)
	return names
}

// refuses is the roots among roots whose calls depend on subject: what a
// problem of subject, or a block on it, refuses. agent is the agent a
// problem of the process subject depends on, if it does: a workflow whose
// nodes bind the process to other agents does not have it.
func (r *reach) refuses(subject DocumentRef, agent string, roots []DocumentRef) []string {
	var names []string
	for _, root := range roots {
		for _, s := range r.walk(root, "") {
			if s.ref == subject && s.judged(reachProblem{agent: agent}) {
				names = append(names, root.Name)
				break
			}
		}
	}
	return names
}
