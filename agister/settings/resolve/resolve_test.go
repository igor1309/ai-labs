package resolve_test

import (
	"reflect"
	"testing"

	"github.com/igor1309/ai-labs/agister/settings/resolve"
)

// source is a spy of resolve's source: the documents and problems its test
// gives, and nothing else. A document it holds neither of has the problem
// "no layer holds it". It counts what it is asked.
type source struct {
	workflows map[string]resolve.Workflow
	processes map[string]resolve.Process
	agents    map[string]resolve.Agent
	runtimes  map[string]resolve.Runtime
	// others are the briefs, prompts, schemas and skills it holds.
	others   map[resolve.Reference]bool
	problems map[resolve.Reference][]resolve.Problem
	// none are the problems of no document.
	none  []resolve.Problem
	asked map[resolve.Reference]int
}

func newSource() *source {
	return &source{
		workflows: map[string]resolve.Workflow{}, processes: map[string]resolve.Process{},
		agents: map[string]resolve.Agent{}, runtimes: map[string]resolve.Runtime{},
		others: map[resolve.Reference]bool{}, problems: map[resolve.Reference][]resolve.Problem{},
		asked: map[resolve.Reference]int{},
	}
}

var noLayer = resolve.Problem{Message: "no layer holds it"}

// lookup is the document of kind and name in held, or its problems.
func lookup[T any](s *source, kind resolve.Kind, name string, held map[string]T) (T, []resolve.Problem) {
	reference := resolve.Reference{Kind: kind, Name: name}
	s.asked[reference]++
	var none T
	if problems := s.problems[reference]; len(problems) > 0 {
		return none, problems
	}
	document, ok := held[name]
	if !ok {
		return none, []resolve.Problem{noLayer}
	}
	return document, nil
}

func (s *source) Workflow(name string) (resolve.Workflow, []resolve.Problem) {
	return lookup(s, resolve.KindWorkflow, name, s.workflows)
}

func (s *source) Process(name string) (resolve.Process, []resolve.Problem) {
	return lookup(s, resolve.KindProcess, name, s.processes)
}

func (s *source) Agent(name string) (resolve.Agent, []resolve.Problem) {
	return lookup(s, resolve.KindAgent, name, s.agents)
}

func (s *source) Runtime(name string) (resolve.Runtime, []resolve.Problem) {
	return lookup(s, resolve.KindRuntime, name, s.runtimes)
}

func (s *source) Other(kind resolve.Kind, name string) []resolve.Problem {
	reference := resolve.Reference{Kind: kind, Name: name}
	s.asked[reference]++
	if problems := s.problems[reference]; len(problems) > 0 {
		return problems
	}
	if !s.others[reference] {
		return []resolve.Problem{noLayer}
	}
	return nil
}

func (s *source) Problems() []resolve.Problem { return s.none }

// other holds the document of kind and name, of which resolve reads
// nothing.
func (s *source) other(kind resolve.Kind, name string) {
	s.others[resolve.Reference{Kind: kind, Name: name}] = true
}

// fail gives the document of kind and name problem.
func (s *source) fail(kind resolve.Kind, name string, problem resolve.Problem) {
	reference := resolve.Reference{Kind: kind, Name: name}
	s.problems[reference] = append(s.problems[reference], problem)
}

// pair holds the agent name on the runtime of its name, and the runtime.
func (s *source) pair(agent, runtime string) {
	s.agents[agent] = resolve.Agent{Name: agent, Runtime: resolve.Name{Value: runtime}}
	s.runtimes[runtime] = resolve.Runtime{Name: runtime}
}

// step is the item name, a step binding process to agent.
func step(name, process, agent string) resolve.Item {
	return resolve.Item{Name: name, Process: resolve.Name{Value: process}, Agent: resolve.Name{Value: agent}}
}

func newResolver(t *testing.T, s *source) *resolve.Resolver {
	t.Helper()
	r, err := resolve.New(s)
	if err != nil {
		t.Fatal(err)
	}
	return r
}

func ref(kind resolve.Kind, name string) resolve.Reference {
	return resolve.Reference{Kind: kind, Name: name}
}

func assertResolved(t *testing.T, faults []resolve.Fault) {
	t.Helper()
	if len(faults) > 0 {
		t.Fatalf("refused: %+v", faults)
	}
}

func assertReached(t *testing.T, got resolve.Resolved, want ...resolve.Reference) {
	t.Helper()
	if !reflect.DeepEqual(got.Reached, want) {
		t.Errorf("reached\n got %v\nwant %v", got.Reached, want)
	}
}

func assertFaults(t *testing.T, got resolve.Resolved, faults []resolve.Fault, want ...resolve.Fault) {
	t.Helper()
	if !reflect.DeepEqual(faults, want) {
		t.Errorf("faults\n got %+v\nwant %+v", faults, want)
	}
	if !reflect.DeepEqual(got, resolve.Resolved{}) {
		t.Errorf("refused, yet resolved %+v", got)
	}
}

func TestNewNeedsASource(t *testing.T) {
	t.Parallel()
	if _, err := resolve.New(nil); err == nil {
		t.Error("New(nil) gave no error")
	}
}

// request.feature, "A workflow requested resolves with what it reaches".
func TestAWorkflowRequestedResolvesWithWhatItReaches(t *testing.T) {
	t.Parallel()
	s := newSource()
	w := resolve.Workflow{Name: "w", Steps: []resolve.Item{step("s", "p", "a")}}
	s.workflows["w"] = w
	s.processes["p"] = resolve.Process{Name: "p"}
	s.pair("a", "r")

	got, faults := newResolver(t, s).Resolve(resolve.Document(resolve.KindWorkflow, "w"))

	assertResolved(t, faults)
	if !reflect.DeepEqual(got.Workflow, &w) {
		t.Errorf("workflow\n got %+v\nwant %+v", got.Workflow, w)
	}
	assertReached(t, got, ref(resolve.KindWorkflow, "w"), ref(resolve.KindProcess, "p"),
		ref(resolve.KindAgent, "a"), ref(resolve.KindRuntime, "r"))
}

// request.feature, "A step requested alone is a workflow of that one step".
func TestAStepRequestedAloneIsAWorkflowOfThatOneStep(t *testing.T) {
	t.Parallel()
	s := newSource()
	s.processes["p"] = resolve.Process{Name: "p", Params: []string{"base", "goal"}}
	s.pair("a", "r")

	got, faults := newResolver(t, s).Resolve(resolve.Step("p", "a"))

	assertResolved(t, faults)
	want := resolve.Workflow{
		Params: []string{"base", "goal"},
		Steps: []resolve.Item{{
			Name: "p", Process: resolve.Name{Value: "p"}, Agent: resolve.Name{Value: "a"},
			Inputs: []resolve.Binding{{Name: "base", From: "params.base"}, {Name: "goal", From: "params.goal"}},
		}},
		Outputs: []resolve.Binding{{Name: "output", From: "steps.p.outputs"}},
	}
	if !reflect.DeepEqual(got.Workflow, &want) {
		t.Errorf("workflow\n got %+v\nwant %+v", got.Workflow, want)
	}
	assertReached(t, got, ref(resolve.KindProcess, "p"), ref(resolve.KindAgent, "a"), ref(resolve.KindRuntime, "r"))
}

// request.feature, "A step requested alone resolves as its parts".
func TestAStepRequestedAloneResolvesAsItsParts(t *testing.T) {
	t.Parallel()
	s := newSource()
	problem := resolve.Problem{Path: "/home/.agister/processes/p.yaml", Line: 2, Place: "prompt", Message: "it is a string"}
	s.fail(resolve.KindProcess, "p", problem)
	s.pair("a", "r")

	got, faults := newResolver(t, s).Resolve(resolve.Step("p", "a"))

	assertFaults(t, got, faults, resolve.Fault{
		Chain:    []resolve.Link{{Kind: resolve.KindProcess, Name: "p"}},
		Problems: []resolve.Problem{problem},
	})
}

// request.feature, "A document of another kind resolves, and is no
// workflow".
func TestADocumentOfAnotherKindResolvesAndIsNoWorkflow(t *testing.T) {
	t.Parallel()
	s := newSource()
	s.pair("a", "r")

	got, faults := newResolver(t, s).Resolve(resolve.Document(resolve.KindAgent, "a"))

	assertResolved(t, faults)
	if got.Workflow != nil {
		t.Errorf("workflow %+v, want none", got.Workflow)
	}
	assertReached(t, got, ref(resolve.KindAgent, "a"), ref(resolve.KindRuntime, "r"))
}

// request.feature, "A problem of no document refuses every request".
func TestAProblemOfNoDocumentRefusesEveryRequest(t *testing.T) {
	t.Parallel()
	s := newSource()
	s.workflows["w"] = resolve.Workflow{Name: "w", Steps: []resolve.Item{step("s", "p", "a")}}
	s.processes["p"] = resolve.Process{Name: "p"}
	s.pair("a", "r")
	problem := resolve.Problem{Path: "/repo/.agister", Message: "it cannot be listed"}
	s.none = []resolve.Problem{problem}

	got, faults := newResolver(t, s).Resolve(resolve.Document(resolve.KindWorkflow, "w"))

	assertFaults(t, got, faults, resolve.Fault{Problems: []resolve.Problem{problem}})
}

// references.feature, "Every name a document gives is followed".
func TestEveryNameADocumentGivesIsFollowed(t *testing.T) {
	t.Parallel()
	s := newSource()
	s.workflows["w"] = resolve.Workflow{Name: "w", Steps: []resolve.Item{step("s", "p", "a")}}
	s.processes["p"] = resolve.Process{
		Name:     "p",
		Prompt:   resolve.Name{Value: "pr"},
		Guidance: []resolve.Name{{Value: "g"}},
		Skills:   []resolve.Name{{Value: "k"}},
		Inputs:   []resolve.Input{{Name: "goal", Forms: []resolve.Name{{Value: "b"}}}},
		Schema:   resolve.Name{Value: "sc"},
	}
	s.pair("a", "r")
	s.other(resolve.KindPrompt, "pr")
	s.other(resolve.KindPrompt, "g")
	s.other(resolve.KindSkill, "k")
	s.other(resolve.KindBrief, "b")
	s.other(resolve.KindSchema, "sc")

	got, faults := newResolver(t, s).Resolve(resolve.Document(resolve.KindWorkflow, "w"))

	assertResolved(t, faults)
	assertReached(t, got, ref(resolve.KindWorkflow, "w"), ref(resolve.KindProcess, "p"),
		ref(resolve.KindPrompt, "pr"), ref(resolve.KindPrompt, "g"), ref(resolve.KindSkill, "k"),
		ref(resolve.KindBrief, "b"), ref(resolve.KindSchema, "sc"),
		ref(resolve.KindAgent, "a"), ref(resolve.KindRuntime, "r"))
}

// references.feature, "Every item is followed, in branches a run may not
// take too".
func TestEveryItemIsFollowedInBranchesARunMayNotTakeToo(t *testing.T) {
	t.Parallel()
	s := newSource()
	s.workflows["w"] = resolve.Workflow{Name: "w", Steps: []resolve.Item{
		{Name: "both", Parallel: []resolve.Item{step("s1", "p1", "a")}},
		{Name: "pick", Branch: []resolve.Item{step("s2", "p2", "a"), {Name: "else", Workflow: resolve.Name{Value: "c"}}}},
		{Name: "loop", Repeat: &resolve.Repeat{Steps: []resolve.Item{step("s3", "p3", "a")}}},
	}}
	s.workflows["c"] = resolve.Workflow{Name: "c", Steps: []resolve.Item{step("s4", "p4", "a")}}
	for _, p := range []string{"p1", "p2", "p3", "p4"} {
		s.processes[p] = resolve.Process{Name: p}
	}
	s.pair("a", "r")

	got, faults := newResolver(t, s).Resolve(resolve.Document(resolve.KindWorkflow, "w"))

	assertResolved(t, faults)
	assertReached(t, got, ref(resolve.KindWorkflow, "w"),
		ref(resolve.KindProcess, "p1"), ref(resolve.KindAgent, "a"), ref(resolve.KindRuntime, "r"),
		ref(resolve.KindProcess, "p2"), ref(resolve.KindWorkflow, "c"), ref(resolve.KindProcess, "p4"),
		ref(resolve.KindProcess, "p3"))
}

// references.feature, "A problem refuses with the chain that reached it".
func TestAProblemRefusesWithTheChainThatReachedIt(t *testing.T) {
	t.Parallel()
	s := newSource()
	process := resolve.Origin{Path: "/home/.agister/workflows/w.yaml", Line: 4}
	prompt := resolve.Origin{Path: "/home/.agister/processes/p.yaml", Line: 3}
	s.workflows["w"] = resolve.Workflow{Name: "w", Steps: []resolve.Item{{
		Name: "s", Process: resolve.Name{Value: "p", Origin: process}, Agent: resolve.Name{Value: "a"},
	}}}
	s.processes["p"] = resolve.Process{Name: "p", Prompt: resolve.Name{Value: "pr", Origin: prompt}}
	s.pair("a", "r")

	got, faults := newResolver(t, s).Resolve(resolve.Document(resolve.KindWorkflow, "w"))

	assertFaults(t, got, faults, resolve.Fault{
		Chain: []resolve.Link{
			{Kind: resolve.KindWorkflow, Name: "w"},
			{Kind: resolve.KindProcess, Name: "p", Place: "steps[0].process", Origin: process},
			{Kind: resolve.KindPrompt, Name: "pr", Place: "prompt", Origin: prompt},
		},
		Problems: []resolve.Problem{noLayer},
	})
}

// references.feature, "Every document at fault is given once, with its
// first chain"; each document is asked of the source once.
func TestEveryDocumentAtFaultIsGivenOnceWithItsFirstChain(t *testing.T) {
	t.Parallel()
	s := newSource()
	s.workflows["w"] = resolve.Workflow{Name: "w", Steps: []resolve.Item{step("s", "p", "a"), step("t", "q", "a")}}
	s.processes["p"] = resolve.Process{Name: "p", Prompt: resolve.Name{Value: "pr"}}
	s.processes["q"] = resolve.Process{Name: "q", Prompt: resolve.Name{Value: "pr"}, Schema: resolve.Name{Value: "sc"}}
	s.pair("a", "r")
	broken := resolve.Problem{Message: "it is broken"}
	s.fail(resolve.KindPrompt, "pr", broken)
	s.fail(resolve.KindSchema, "sc", broken)

	got, faults := newResolver(t, s).Resolve(resolve.Document(resolve.KindWorkflow, "w"))

	w := resolve.Link{Kind: resolve.KindWorkflow, Name: "w"}
	assertFaults(t, got, faults,
		resolve.Fault{Chain: []resolve.Link{w,
			{Kind: resolve.KindProcess, Name: "p", Place: "steps[0].process"},
			{Kind: resolve.KindPrompt, Name: "pr", Place: "prompt"},
		}, Problems: []resolve.Problem{broken}},
		resolve.Fault{Chain: []resolve.Link{w,
			{Kind: resolve.KindProcess, Name: "q", Place: "steps[1].process"},
			{Kind: resolve.KindSchema, Name: "sc", Place: "output.schema"},
		}, Problems: []resolve.Problem{broken}},
	)
	for reference, times := range s.asked {
		if times != 1 {
			t.Errorf("%v asked %d times, want once", reference, times)
		}
	}
}

// references.feature, "A document with a problem is not followed".
func TestADocumentWithAProblemIsNotFollowed(t *testing.T) {
	t.Parallel()
	s := newSource()
	s.workflows["w"] = resolve.Workflow{Name: "w", Steps: []resolve.Item{step("s", "p", "a")}}
	broken := resolve.Problem{Message: "it is broken"}
	s.fail(resolve.KindProcess, "p", broken)
	s.pair("a", "r")

	got, faults := newResolver(t, s).Resolve(resolve.Document(resolve.KindWorkflow, "w"))

	assertFaults(t, got, faults, resolve.Fault{Chain: []resolve.Link{
		{Kind: resolve.KindWorkflow, Name: "w"},
		{Kind: resolve.KindProcess, Name: "p", Place: "steps[0].process"},
	}, Problems: []resolve.Problem{broken}})
}

// references.feature, "A problem nothing in the request reaches refuses
// nothing".
func TestAProblemNothingInTheRequestReachesRefusesNothing(t *testing.T) {
	t.Parallel()
	s := newSource()
	s.workflows["w"] = resolve.Workflow{Name: "w", Steps: []resolve.Item{step("s", "p", "a")}}
	s.processes["p"] = resolve.Process{Name: "p"}
	s.fail(resolve.KindProcess, "q", resolve.Problem{Message: "it is broken"})
	s.pair("a", "r")

	got, faults := newResolver(t, s).Resolve(resolve.Document(resolve.KindWorkflow, "w"))

	assertResolved(t, faults)
	if got.Workflow == nil || got.Workflow.Name != "w" {
		t.Errorf("workflow %+v, want w", got.Workflow)
	}
}

// references.feature, "A workflow that reaches itself is refused".
func TestAWorkflowThatReachesItselfIsRefused(t *testing.T) {
	t.Parallel()
	s := newSource()
	child := func(name string) resolve.Item {
		return resolve.Item{Name: "child", Workflow: resolve.Name{Value: name}}
	}
	s.workflows["w"] = resolve.Workflow{Name: "w", Steps: []resolve.Item{child("c")}}
	s.workflows["c"] = resolve.Workflow{Name: "c", Steps: []resolve.Item{child("w")}}

	got, faults := newResolver(t, s).Resolve(resolve.Document(resolve.KindWorkflow, "w"))

	assertFaults(t, got, faults, resolve.Fault{Chain: []resolve.Link{
		{Kind: resolve.KindWorkflow, Name: "w"},
		{Kind: resolve.KindWorkflow, Name: "c", Place: "steps[0].workflow"},
		{Kind: resolve.KindWorkflow, Name: "w", Place: "steps[0].workflow"},
	}, Problems: []resolve.Problem{{Message: "it reaches itself"}}})
}
