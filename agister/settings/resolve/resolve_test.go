package resolve_test

import (
	"reflect"
	"testing"

	"github.com/igor1309/ai-labs/agister/settings/resolve"
)

// source is a spy of resolve's source and wrappers: the documents,
// problems and runtime facts its test gives, and nothing else. A document
// it holds neither of has the problem "no layer holds it". It counts what
// it is asked.
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
	// facts are the runtime facts, by contract.
	facts map[string]resolve.Facts
	// blocks are the repository's.
	blocks []resolve.Block
}

// able is the contract of a wrapper that can do everything.
const able = "able/1"

func newSource() *source {
	return &source{
		workflows: map[string]resolve.Workflow{}, processes: map[string]resolve.Process{},
		agents: map[string]resolve.Agent{}, runtimes: map[string]resolve.Runtime{},
		others: map[resolve.Reference]bool{}, problems: map[resolve.Reference][]resolve.Problem{},
		asked: map[resolve.Reference]int{},
		facts: map[string]resolve.Facts{able: {Schema: true, Session: true, Skills: true, Model: true, ToolCalls: true, ToolCommands: true, Message: true}},
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

func (s *source) Blocks() []resolve.Block { return s.blocks }

// Holds is whether s holds the document of kind and name, problems or not.
func (s *source) Holds(kind resolve.Kind, name string) bool {
	reference := resolve.Reference{Kind: kind, Name: name}
	held := map[resolve.Kind]bool{
		resolve.KindWorkflow: has(s.workflows, name), resolve.KindProcess: has(s.processes, name),
		resolve.KindAgent: has(s.agents, name), resolve.KindRuntime: has(s.runtimes, name),
	}
	return held[kind] || s.others[reference] || len(s.problems[reference]) > 0
}

func has[T any](held map[string]T, name string) bool {
	_, ok := held[name]
	return ok
}

func (s *source) Facts(contract string) (resolve.Facts, bool) {
	facts, ok := s.facts[contract]
	return facts, ok
}

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

// pair holds the agent name on the runtime of its name, and the runtime,
// of a wrapper that can do everything.
func (s *source) pair(agent, runtime string) {
	s.agents[agent] = resolve.Agent{Name: agent, Runtime: resolve.Name{Value: runtime}}
	s.runtimes[runtime] = resolve.Runtime{Name: runtime, Contract: resolve.Name{Value: able}}
}

// step is the item name, a step binding process to agent.
func step(name, process, agent string) resolve.Item {
	return resolve.Item{Name: name, Process: resolve.Name{Value: process}, Agent: resolve.Name{Value: agent}}
}

// stepAt is the step name binding process to agent at place, its process
// and agent at their own places there, as a source gives them.
func stepAt(name, process, agent, place string) resolve.Item {
	return resolve.Item{
		Name: name, Origin: resolve.Origin{Place: place},
		Process: named(process, place+".process"), Agent: named(agent, place+".agent"),
	}
}

// named is the name value, given at place.
func named(value, place string) resolve.Name {
	return resolve.Name{Value: value, Origin: resolve.Origin{Place: place}}
}

// param, input and state read the param, the input or the repeat's state
// of name; outputs, the outputs of the item name, or their field, "" for
// the whole; session, the session of the item name; and queryItem, the
// field of the item of an all or any query.
func param(name string) resolve.Read { return resolve.Read{Root: resolve.RootParam, Name: name} }
func input(name string) resolve.Read { return resolve.Read{Root: resolve.RootInput, Name: name} }
func state(name string) resolve.Read { return resolve.Read{Root: resolve.RootState, Name: name} }
func outputs(item, field string) resolve.Read {
	return resolve.Read{Root: resolve.RootOutputs, Name: item, Field: field}
}
func session(item string) resolve.Read { return resolve.Read{Root: resolve.RootSession, Name: item} }
func queryItem(field string) resolve.Read {
	return resolve.Read{Root: resolve.RootQueryItem, Field: field}
}

func newResolver(t *testing.T, s *source) *resolve.Resolver {
	t.Helper()
	r, err := resolve.New(s, s)
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

func TestNewNeedsASourceAndWrappers(t *testing.T) {
	t.Parallel()
	if _, err := resolve.New(nil, newSource()); err == nil {
		t.Error("New with no source gave no error")
	}
	if _, err := resolve.New(newSource(), nil); err == nil {
		t.Error("New with no wrappers gave no error")
	}
}

// request.feature, "A workflow requested resolves with what it reaches":
// each definition is given whole, every field its document gives.
func TestAWorkflowRequestedResolvesWithWhatItReaches(t *testing.T) {
	t.Parallel()
	s := newSource()
	base := []resolve.Param{{Name: "base", Default: true}}
	item := stepAt("s", "p", "a", "steps[0]")
	item.Inputs = []resolve.Binding{{Name: "base", From: ptr(param("base"))}}
	loop := resolve.Item{Name: "loop", Origin: resolve.Origin{Place: "steps[1]"}, Repeat: &resolve.Repeat{
		State: []resolve.Binding{{Name: "round", Text: "1"}},
		Steps: []resolve.Item{stepAt("t", "p", "a", "steps[1].repeat.steps[0]")},
		Next:  []resolve.Binding{{Name: "round", From: ptr(state("round"))}},
		Until: resolve.Condition{Reads: []resolve.Read{outputs("t", "done")}},
		Max:   3,
	}}
	w := resolve.Workflow{
		Name:    "w",
		Params:  base,
		Inputs:  []resolve.Input{{Name: "goal", Forms: []resolve.Name{named("wb", "inputs.goal.form[0]")}, Arguments: []resolve.Binding{{Name: "path", From: ptr(param("base"))}}}},
		Steps:   []resolve.Item{item, loop},
		Outputs: []resolve.Binding{{Name: "verdict", From: ptr(outputs("s", "verdict"))}, {Name: "note", Text: "done"}},
	}
	s.workflows["w"] = w
	s.processes["p"] = resolve.Process{
		Name:              "p",
		Prompt:            named("pr", "prompt"),
		Guidance:          []resolve.Name{named("g", "guidance[0]")},
		Skills:            []resolve.Name{named("k", "skills[0]")},
		Params:            base,
		Inputs:            []resolve.Input{{Name: "rev", Forms: []resolve.Name{named("b", "inputs.rev.form[0]")}, Arguments: []resolve.Binding{{Name: "rev", From: ptr(param("base"))}}}},
		Environment:       []resolve.Binding{{Name: "HEAD", From: ptr(param("base"))}, {Name: "MODE", Text: "ci"}},
		Revision:          ptr(input("rev")),
		Schema:            named("sc", "output.schema"),
		Require:           []string{"read"},
		Allow:             []string{"read", "write"},
		Recovery:          true,
		StaleToolCalls:    true,
		StaleToolCommands: true,
	}
	s.agents["a"] = resolve.Agent{Name: "a", Runtime: named("r", "runtime"), Model: named("m", "model"), Effort: named("high", "effort")}
	s.runtimes["r"] = resolve.Runtime{Name: "r", Contract: named(able, "contract"), Grants: []string{"tmp"}, Select: "any",
		Options: []resolve.Option{{Name: "look", Grants: []string{"read"}}, {Name: "edit", Grants: []string{"write"}}}}
	facts := s.facts[able]
	facts.Efforts = []string{"high"}
	s.facts[able] = facts
	for _, other := range []resolve.Reference{ref(resolve.KindBrief, "wb"), ref(resolve.KindPrompt, "pr"),
		ref(resolve.KindPrompt, "g"), ref(resolve.KindSkill, "k"), ref(resolve.KindBrief, "b"), ref(resolve.KindSchema, "sc")} {
		s.other(other.Kind, other.Name)
	}

	got, faults := newResolver(t, s).Resolve(resolve.Document(resolve.KindWorkflow, "w"))

	assertResolved(t, faults)
	if !reflect.DeepEqual(got.Workflow, &w) {
		t.Errorf("workflow\n got %+v\nwant %+v", got.Workflow, w)
	}
	// It reached the workflow, the process, the agent and the runtime, and
	// the documents of which resolve reads nothing that they name.
	assertReached(t, got, ref(resolve.KindWorkflow, "w"), ref(resolve.KindBrief, "wb"),
		ref(resolve.KindProcess, "p"), ref(resolve.KindPrompt, "pr"), ref(resolve.KindPrompt, "g"), ref(resolve.KindSkill, "k"),
		ref(resolve.KindBrief, "b"), ref(resolve.KindSchema, "sc"),
		ref(resolve.KindAgent, "a"), ref(resolve.KindRuntime, "r"))
	assertDefinitions(t, got, s, []string{"w"}, []string{"p"}, []string{"a"}, []string{"r"})
}

// assertDefinitions asserts that got gives the definitions s holds of the
// workflows, processes, agents and runtimes of those names, and no other.
func assertDefinitions(t *testing.T, got resolve.Resolved, s *source, workflows, processes, agents, runtimes []string) {
	t.Helper()
	if want := held(s.workflows, workflows); !reflect.DeepEqual(got.Workflows, want) {
		t.Errorf("workflows\n got %+v\nwant %+v", got.Workflows, want)
	}
	if want := held(s.processes, processes); !reflect.DeepEqual(got.Processes, want) {
		t.Errorf("processes\n got %+v\nwant %+v", got.Processes, want)
	}
	if want := held(s.agents, agents); !reflect.DeepEqual(got.Agents, want) {
		t.Errorf("agents\n got %+v\nwant %+v", got.Agents, want)
	}
	if want := held(s.runtimes, runtimes); !reflect.DeepEqual(got.Runtimes, want) {
		t.Errorf("runtimes\n got %+v\nwant %+v", got.Runtimes, want)
	}
}

// held is the documents of names in documents, by name.
func held[T any](documents map[string]T, names []string) map[string]T {
	picked := map[string]T{}
	for _, name := range names {
		picked[name] = documents[name]
	}
	return picked
}

// request.feature, "A step requested alone is a workflow of that one step".
func TestAStepRequestedAloneIsAWorkflowOfThatOneStep(t *testing.T) {
	t.Parallel()
	s := newSource()
	params := []resolve.Param{{Name: "base", Default: true}, {Name: "goal", Default: true}}
	inputs := []resolve.Input{{Name: "rev", Arguments: []resolve.Binding{{Name: "rev", From: ptr(param("base"))}}}}
	s.processes["p"] = resolve.Process{Name: "p", Params: params, Inputs: inputs, Revision: ptr(input("rev"))}
	s.pair("a", "r")

	got, faults := newResolver(t, s).Resolve(resolve.Step("p", "a"))

	assertResolved(t, faults)
	// The made workflow has no document, so resolve gives its places.
	fromParam := func(name string) resolve.Binding {
		reads := param(name)
		reads.Origin = resolve.Origin{Place: "steps[0].inputs." + name}
		return resolve.Binding{Name: name, From: &reads, Origin: reads.Origin}
	}
	output := outputs("p", "")
	output.Origin = resolve.Origin{Place: "outputs.output"}
	want := resolve.Workflow{
		Params: params,
		Steps: []resolve.Item{{
			Name: "p", Origin: resolve.Origin{Place: "steps[0]"},
			Process: named("p", "steps[0].process"), Agent: named("a", "steps[0].agent"),
			Inputs: []resolve.Binding{fromParam("base"), fromParam("goal")},
		}},
		Outputs: []resolve.Binding{{Name: "output", From: &output, Origin: output.Origin}},
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
	problem := resolve.Problem{Origin: resolve.Origin{Path: "/home/.agister/processes/p.yaml", Line: 2, Place: "prompt"}, Message: "it is a string"}
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
	assertDefinitions(t, got, s, nil, nil, []string{"a"}, []string{"r"})
}

// request.feature, "A document requested alone is followed, and planned
// not": a process alone has no agent, so it plans no step, whatever it
// requires.
func TestADocumentRequestedAloneIsFollowedAndPlannedNot(t *testing.T) {
	t.Parallel()
	for _, test := range []struct {
		request resolve.Request
		reached []resolve.Reference
	}{
		{resolve.Document(resolve.KindProcess, "p"), []resolve.Reference{ref(resolve.KindProcess, "p"), ref(resolve.KindPrompt, "pr")}},
		{resolve.Document(resolve.KindPrompt, "pr"), []resolve.Reference{ref(resolve.KindPrompt, "pr")}},
	} {
		t.Run(string(test.reached[0].Kind), func(t *testing.T) {
			t.Parallel()
			s := newSource()
			s.processes["p"] = resolve.Process{Name: "p", Prompt: named("pr", "prompt"), Require: []string{"edit"}}
			s.other(resolve.KindPrompt, "pr")

			got, faults := newResolver(t, s).Resolve(test.request)

			assertResolved(t, faults)
			if got.Workflow != nil {
				t.Errorf("workflow %+v, want none", got.Workflow)
			}
			if len(got.Plans) > 0 {
				t.Errorf("plans %+v, want none", got.Plans)
			}
			assertReached(t, got, test.reached...)
		})
	}
}

// request.feature, "A process requested alone has its own references
// checked".
func TestAProcessRequestedAloneHasItsOwnReferencesChecked(t *testing.T) {
	t.Parallel()
	s := newSource()
	head := param("head")
	head.Origin = resolve.Origin{Path: "/home/.agister/processes/p.yaml", Line: 3, Place: "environment.HEAD"}
	s.processes["p"] = resolve.Process{Name: "p", Environment: []resolve.Binding{{Name: "HEAD", From: &head, Origin: head.Origin}}}

	got, faults := newResolver(t, s).Resolve(resolve.Document(resolve.KindProcess, "p"))

	assertFaults(t, got, faults, resolve.Fault{
		Chain:    []resolve.Link{{Kind: resolve.KindProcess, Name: "p"}},
		Problems: []resolve.Problem{{Origin: head.Origin, Message: `its process declares the param "head"`}},
	})
}

// request.feature, "The problems of no document come before the documents
// at fault".
func TestTheProblemsOfNoDocumentComeBeforeTheDocumentsAtFault(t *testing.T) {
	t.Parallel()
	s := newSource()
	none := resolve.Problem{Origin: resolve.Origin{Path: "/repo/.agister"}, Message: "it cannot be listed"}
	s.none = []resolve.Problem{none}
	broken := resolve.Problem{Message: "it is broken"}
	s.fail(resolve.KindProcess, "p", broken)

	got, faults := newResolver(t, s).Resolve(resolve.Document(resolve.KindProcess, "p"))

	assertFaults(t, got, faults,
		resolve.Fault{Problems: []resolve.Problem{none}},
		resolve.Fault{Chain: []resolve.Link{{Kind: resolve.KindProcess, Name: "p"}}, Problems: []resolve.Problem{broken}},
	)
}

// request.feature, "A problem of no document refuses every request".
func TestAProblemOfNoDocumentRefusesEveryRequest(t *testing.T) {
	t.Parallel()
	for name, request := range map[string]resolve.Request{
		"workflow": resolve.Document(resolve.KindWorkflow, "w"),
		"step":     resolve.Step("p", "a"),
		"agent":    resolve.Document(resolve.KindAgent, "a"),
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			s := newSource()
			s.workflows["w"] = resolve.Workflow{Name: "w", Steps: []resolve.Item{step("s", "p", "a")}}
			s.processes["p"] = resolve.Process{Name: "p"}
			s.pair("a", "r")
			problem := resolve.Problem{Origin: resolve.Origin{Path: "/repo/.agister"}, Message: "it cannot be listed"}
			s.none = []resolve.Problem{problem}

			got, faults := newResolver(t, s).Resolve(request)

			assertFaults(t, got, faults, resolve.Fault{Problems: []resolve.Problem{problem}})
		})
	}
}

// references.feature, "Every name a document gives is followed".
func TestEveryNameADocumentGivesIsFollowed(t *testing.T) {
	t.Parallel()
	s := newSource()
	s.workflows["w"] = resolve.Workflow{
		Name:   "w",
		Inputs: []resolve.Input{{Name: "brief", Forms: []resolve.Name{{Value: "wb"}}}},
		Steps:  []resolve.Item{step("s", "p", "a")},
	}
	s.processes["p"] = resolve.Process{
		Name:     "p",
		Prompt:   resolve.Name{Value: "pr"},
		Guidance: []resolve.Name{{Value: "g"}},
		Skills:   []resolve.Name{{Value: "k"}},
		Inputs:   []resolve.Input{{Name: "goal", Forms: []resolve.Name{{Value: "b"}}}},
		Schema:   resolve.Name{Value: "sc"},
	}
	s.pair("a", "r")
	s.other(resolve.KindBrief, "wb")
	s.other(resolve.KindPrompt, "pr")
	s.other(resolve.KindPrompt, "g")
	s.other(resolve.KindSkill, "k")
	s.other(resolve.KindBrief, "b")
	s.other(resolve.KindSchema, "sc")

	got, faults := newResolver(t, s).Resolve(resolve.Document(resolve.KindWorkflow, "w"))

	assertResolved(t, faults)
	reached := []resolve.Reference{ref(resolve.KindWorkflow, "w"), ref(resolve.KindBrief, "wb"),
		ref(resolve.KindProcess, "p"), ref(resolve.KindPrompt, "pr"), ref(resolve.KindPrompt, "g"), ref(resolve.KindSkill, "k"),
		ref(resolve.KindBrief, "b"), ref(resolve.KindSchema, "sc"),
		ref(resolve.KindAgent, "a"), ref(resolve.KindRuntime, "r")}
	assertReached(t, got, reached...)
	for _, reference := range reached {
		if times := s.asked[reference]; times != 1 {
			t.Errorf("%v asked %d times, want once", reference, times)
		}
	}
}

// references.feature, "A problem refuses with the chain that reached it",
// for every document resolve reads nothing of, wherever it is named: each
// link at the origin the source gives the name it follows.
func TestEveryDocumentReachedIsChecked(t *testing.T) {
	t.Parallel()
	link := func(kind resolve.Kind, name, place string) resolve.Link {
		return resolve.Link{Kind: kind, Name: name, Origin: resolve.Origin{Place: place}}
	}
	w := resolve.Link{Kind: resolve.KindWorkflow, Name: "w"}
	p := link(resolve.KindProcess, "p", "steps[0].process")
	for _, test := range []struct {
		kind  resolve.Kind
		name  string
		chain []resolve.Link
	}{
		{resolve.KindBrief, "wb", []resolve.Link{w, link(resolve.KindBrief, "wb", "inputs.brief.form[0]")}},
		{resolve.KindPrompt, "pr", []resolve.Link{w, p, link(resolve.KindPrompt, "pr", "prompt")}},
		{resolve.KindPrompt, "g", []resolve.Link{w, p, link(resolve.KindPrompt, "g", "guidance[0]")}},
		{resolve.KindSkill, "k", []resolve.Link{w, p, link(resolve.KindSkill, "k", "skills[0]")}},
		{resolve.KindBrief, "b", []resolve.Link{w, p, link(resolve.KindBrief, "b", "inputs.goal.form[0]")}},
		{resolve.KindSchema, "sc", []resolve.Link{w, p, link(resolve.KindSchema, "sc", "output.schema")}},
	} {
		t.Run(string(test.kind)+" "+test.name, func(t *testing.T) {
			t.Parallel()
			s := newSource()
			s.workflows["w"] = resolve.Workflow{
				Name:   "w",
				Inputs: []resolve.Input{{Name: "brief", Forms: []resolve.Name{named("wb", "inputs.brief.form[0]")}}},
				Steps:  []resolve.Item{stepAt("s", "p", "a", "steps[0]")},
			}
			s.processes["p"] = resolve.Process{
				Name:     "p",
				Prompt:   named("pr", "prompt"),
				Guidance: []resolve.Name{named("g", "guidance[0]")},
				Skills:   []resolve.Name{named("k", "skills[0]")},
				Inputs:   []resolve.Input{{Name: "goal", Forms: []resolve.Name{named("b", "inputs.goal.form[0]")}}},
				Schema:   named("sc", "output.schema"),
			}
			s.pair("a", "r")
			for _, other := range []resolve.Reference{ref(resolve.KindBrief, "wb"), ref(resolve.KindPrompt, "pr"),
				ref(resolve.KindPrompt, "g"), ref(resolve.KindSkill, "k"), ref(resolve.KindBrief, "b"), ref(resolve.KindSchema, "sc")} {
				if other != ref(test.kind, test.name) {
					s.other(other.Kind, other.Name)
				}
			}

			got, faults := newResolver(t, s).Resolve(resolve.Document(resolve.KindWorkflow, "w"))

			assertFaults(t, got, faults, resolve.Fault{Chain: test.chain, Problems: []resolve.Problem{noLayer}})
		})
	}
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
	process := resolve.Origin{Path: "/home/.agister/workflows/w.yaml", Line: 4, Place: "steps[0].process"}
	prompt := resolve.Origin{Path: "/home/.agister/processes/p.yaml", Line: 3, Place: "prompt"}
	s.workflows["w"] = resolve.Workflow{Name: "w", Steps: []resolve.Item{{
		Name: "s", Process: resolve.Name{Value: "p", Origin: process}, Agent: resolve.Name{Value: "a"},
	}}}
	s.processes["p"] = resolve.Process{Name: "p", Prompt: resolve.Name{Value: "pr", Origin: prompt}}
	s.pair("a", "r")

	got, faults := newResolver(t, s).Resolve(resolve.Document(resolve.KindWorkflow, "w"))

	assertFaults(t, got, faults, resolve.Fault{
		Chain: []resolve.Link{
			{Kind: resolve.KindWorkflow, Name: "w"},
			{Kind: resolve.KindProcess, Name: "p", Origin: process},
			{Kind: resolve.KindPrompt, Name: "pr", Origin: prompt},
		},
		Problems: []resolve.Problem{noLayer},
	})
}

// references.feature, "Every document at fault is given once, with its
// first chain"; each document is asked of the source once.
func TestEveryDocumentAtFaultIsGivenOnceWithItsFirstChain(t *testing.T) {
	t.Parallel()
	s := newSource()
	s.workflows["w"] = resolve.Workflow{Name: "w", Steps: []resolve.Item{stepAt("s", "p", "a", "steps[0]"), stepAt("t", "q", "a", "steps[1]")}}
	s.processes["p"] = resolve.Process{Name: "p", Prompt: named("pr", "prompt")}
	s.processes["q"] = resolve.Process{Name: "q", Prompt: named("pr", "prompt"), Schema: named("sc", "output.schema")}
	s.pair("a", "r")
	broken := resolve.Problem{Message: "it is broken"}
	s.fail(resolve.KindPrompt, "pr", broken)
	s.fail(resolve.KindSchema, "sc", broken)

	got, faults := newResolver(t, s).Resolve(resolve.Document(resolve.KindWorkflow, "w"))

	w := resolve.Link{Kind: resolve.KindWorkflow, Name: "w"}
	assertFaults(t, got, faults,
		resolve.Fault{Chain: []resolve.Link{w,
			{Kind: resolve.KindProcess, Name: "p", Origin: resolve.Origin{Place: "steps[0].process"}},
			{Kind: resolve.KindPrompt, Name: "pr", Origin: resolve.Origin{Place: "prompt"}},
		}, Problems: []resolve.Problem{broken}},
		resolve.Fault{Chain: []resolve.Link{w,
			{Kind: resolve.KindProcess, Name: "q", Origin: resolve.Origin{Place: "steps[1].process"}},
			{Kind: resolve.KindSchema, Name: "sc", Origin: resolve.Origin{Place: "output.schema"}},
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
	s.workflows["w"] = resolve.Workflow{Name: "w", Steps: []resolve.Item{stepAt("s", "p", "a", "steps[0]")}}
	broken := resolve.Problem{Message: "it is broken"}
	s.fail(resolve.KindProcess, "p", broken)
	s.pair("a", "r")

	got, faults := newResolver(t, s).Resolve(resolve.Document(resolve.KindWorkflow, "w"))

	assertFaults(t, got, faults, resolve.Fault{Chain: []resolve.Link{
		{Kind: resolve.KindWorkflow, Name: "w"},
		{Kind: resolve.KindProcess, Name: "p", Origin: resolve.Origin{Place: "steps[0].process"}},
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
		return resolve.Item{Name: "child", Workflow: named(name, "steps[0].workflow")}
	}
	s.workflows["w"] = resolve.Workflow{Name: "w", Steps: []resolve.Item{child("c")}}
	s.workflows["c"] = resolve.Workflow{Name: "c", Steps: []resolve.Item{child("w")}}

	got, faults := newResolver(t, s).Resolve(resolve.Document(resolve.KindWorkflow, "w"))

	assertFaults(t, got, faults, resolve.Fault{Chain: []resolve.Link{
		{Kind: resolve.KindWorkflow, Name: "w"},
		{Kind: resolve.KindWorkflow, Name: "c", Origin: resolve.Origin{Place: "steps[0].workflow"}},
		{Kind: resolve.KindWorkflow, Name: "w", Origin: resolve.Origin{Place: "steps[0].workflow"}},
	}, Problems: []resolve.Problem{{Message: "it reaches itself"}}})
}

// references.feature, "Every document at fault is given once, with its
// first chain", of a workflow that reaches itself by two cycles.
func TestAWorkflowThatReachesItselfTwiceIsGivenOnceWithItsFirstCycle(t *testing.T) {
	t.Parallel()
	s := newSource()
	child := func(item, name, place string) resolve.Item {
		return resolve.Item{Name: item, Workflow: named(name, place)}
	}
	s.workflows["w"] = resolve.Workflow{Name: "w", Steps: []resolve.Item{child("one", "c", "steps[0].workflow"), child("two", "d", "steps[1].workflow")}}
	s.workflows["c"] = resolve.Workflow{Name: "c", Steps: []resolve.Item{child("back", "w", "steps[0].workflow")}}
	s.workflows["d"] = resolve.Workflow{Name: "d", Steps: []resolve.Item{child("back", "w", "steps[0].workflow")}}

	got, faults := newResolver(t, s).Resolve(resolve.Document(resolve.KindWorkflow, "w"))

	assertFaults(t, got, faults, resolve.Fault{Chain: []resolve.Link{
		{Kind: resolve.KindWorkflow, Name: "w"},
		{Kind: resolve.KindWorkflow, Name: "c", Origin: resolve.Origin{Place: "steps[0].workflow"}},
		{Kind: resolve.KindWorkflow, Name: "w", Origin: resolve.Origin{Place: "steps[0].workflow"}},
	}, Problems: []resolve.Problem{{Message: "it reaches itself"}}})
}

// The source's problems of no document are its own: resolve adds a
// request's to a copy, so neither the source's nor another request's
// refusal changes with a later request.
func TestTheSourcesProblemsAreNotChangedByARequest(t *testing.T) {
	t.Parallel()
	s := newSource()
	s.workflows["w"] = resolve.Workflow{Name: "w", Steps: []resolve.Item{step("s", "p", "a")}}
	s.processes["p"] = resolve.Process{Name: "p"}
	s.pair("a", "r")
	problem := resolve.Problem{Origin: resolve.Origin{Path: "/repo/.agister"}, Message: "it cannot be listed"}
	// Room beyond its length, which an append in place would write to.
	s.none = append(make([]resolve.Problem, 0, 4), problem)
	r := newResolver(t, s)

	first, firstFaults := r.Resolve(requestW.WithParams("head"))
	_, _ = r.Resolve(requestW.WithParams("tail"))

	assertFaults(t, first, firstFaults, resolve.Fault{Problems: []resolve.Problem{
		problem, {Message: `the workflow declares the param "head"`},
	}})
	if got := s.none[:cap(s.none)]; got[1] != (resolve.Problem{}) {
		t.Errorf("the source's problems were written beyond their length: %+v", got)
	}
}
