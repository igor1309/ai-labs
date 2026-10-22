package resolve_test

import (
	"reflect"
	"testing"

	"github.com/igor1309/ai-labs/agister/settings/resolve"
)

// fallbackOfA is where the agent "a" names its fallback.
var fallbackOfA = resolve.Origin{Path: "/home/.agister/agents/a.toml", Place: "fallback"}

// fallingBack is a source holding the workflow "w" of the step "s",
// binding the process "p" to the agent "a" of the runtime "r", which falls
// back to fallback; and the agent "b" of the runtime "rb", each runtime of
// a wrapper that can do everything.
func fallingBack(fallback string) *source {
	s := newSource()
	s.processes["p"] = resolve.Process{Name: "p"}
	s.workflows["w"] = resolve.Workflow{Name: "w", Steps: []resolve.Item{at(step("s", "p", "a"), 4, "steps[0]")}}
	s.pair("a", "r")
	s.pair("b", "rb")
	a := s.agents["a"]
	a.Fallback = resolve.Name{Value: fallback, Origin: fallbackOfA}
	s.agents["a"] = a
	return s
}

// lacking gives the runtime "rb" a wrapper that cannot do what lack takes
// away.
func lacking(s *source, lack func(*resolve.Facts)) {
	facts := s.facts[able]
	lack(&facts)
	s.facts["lacking/1"] = facts
	s.runtimes["rb"] = resolve.Runtime{Name: "rb", Contract: resolve.Name{Value: "lacking/1"}}
}

// planOfS is the plan of the step "s" of "w" on agent of runtime, of the
// process "p", which requires and allows nothing.
func planOfS(agent, runtime string) resolve.Plan {
	return resolve.Plan{Workflow: "w", Place: "steps[0]", Process: "p", Agent: agent, Runtime: runtime}
}

func assertPlans(t *testing.T, got resolve.Resolved, want ...resolve.Plan) {
	t.Helper()
	if !reflect.DeepEqual(got.Plans, want) {
		t.Errorf("plans\n got %+v\nwant %+v", got.Plans, want)
	}
}

// fallback.feature, "A step's agent's fallback is followed and planned".
func TestAStepsAgentsFallbackIsFollowedAndPlanned(t *testing.T) {
	t.Parallel()
	got, faults := newResolver(t, fallingBack("b")).Resolve(requestW)
	assertResolved(t, faults)
	assertReached(t, got, ref(resolve.KindWorkflow, "w"), ref(resolve.KindProcess, "p"), ref(resolve.KindAgent, "a"),
		ref(resolve.KindRuntime, "r"), ref(resolve.KindAgent, "b"), ref(resolve.KindRuntime, "rb"))
	assertPlans(t, got, planOfS("a", "r"), planOfS("b", "rb"))
	if _, ok := got.Agents["b"]; !ok {
		t.Errorf("agents %v, want the fallback among them", got.Agents)
	}
}

// fallback.feature, "A fallback is another agent, which resolves".
func TestAFallbackIsAnotherAgentWhichResolves(t *testing.T) {
	t.Parallel()
	w := resolve.Link{Kind: resolve.KindWorkflow, Name: "w"}
	a := resolve.Link{Kind: resolve.KindAgent, Name: "a"}
	notResolving := resolve.Fault{Chain: []resolve.Link{w, a},
		Problems: []resolve.Problem{{Origin: fallbackOfA, Message: "it names an agent that resolves"}}}
	blocked := block(resolve.KindAgent, "b", 2)
	for _, c := range []struct {
		fallback string
		blocks   []resolve.Block
		want     []resolve.Fault
	}{
		{"a", nil, []resolve.Fault{{Chain: []resolve.Link{w, a}, Problems: []resolve.Problem{{Origin: fallbackOfA, Message: "it names another agent"}}}}},
		{"gone", nil, []resolve.Fault{notResolving,
			{Chain: []resolve.Link{w, a, {Kind: resolve.KindAgent, Name: "gone", Origin: fallbackOfA}}, Problems: []resolve.Problem{noLayer}}}},
		{"b", []resolve.Block{blocked}, []resolve.Fault{notResolving,
			{Chain: []resolve.Link{w, a, {Kind: resolve.KindAgent, Name: "b", Origin: fallbackOfA}}, Block: &blocked}}},
	} {
		t.Run(c.fallback, func(t *testing.T) {
			t.Parallel()
			s := fallingBack(c.fallback)
			s.blocks = c.blocks
			got, faults := newResolver(t, s).Resolve(requestW)
			assertFaults(t, got, faults, c.want...)
		})
	}
}

// fallback.feature, "A fallback's runtime runs the step's process".
func TestAFallbacksRuntimeRunsTheStepsProcess(t *testing.T) {
	t.Parallel()
	for _, c := range []struct {
		need    string
		process func(*source, *resolve.Process)
		lack    func(*resolve.Facts)
		can     string
	}{
		{"a schema", func(s *source, p *resolve.Process) { p.Schema = resolve.Name{Value: "sc"}; s.other(resolve.KindSchema, "sc") },
			func(f *resolve.Facts) { f.Schema = false }, "checks output against a schema"},
		{"recovery", func(_ *source, p *resolve.Process) { p.Recovery = true },
			func(f *resolve.Facts) { f.Session = false }, "resumes a session"},
		{"a skill", func(s *source, p *resolve.Process) { p.Skills = []resolve.Name{{Value: "sk"}}; s.other(resolve.KindSkill, "sk") },
			func(f *resolve.Facts) { f.Skills = false }, "takes skills"},
	} {
		t.Run(c.need, func(t *testing.T) {
			t.Parallel()
			s := fallingBack("b")
			p := s.processes["p"]
			c.process(s, &p)
			s.processes["p"] = p
			lacking(s, c.lack)
			assertProblemsOf(t, s, requestW, resolve.KindWorkflow, "w", resolve.Problem{Origin: fallbackOfA,
				Message: `the step "s" falls back to it: its runtime "rb" ` + c.can + `, as its process "p" needs`})
		})
	}
}

// fallback.feature, "A fallback resumes no session".
func TestAFallbackResumesNoSession(t *testing.T) {
	t.Parallel()
	s := fallingBack("b")
	continuing := at(step("s", "p", "a"), 5, "steps[1]")
	continuing.Session = &resolve.Read{Root: resolve.RootSession, Name: "e"}
	s.workflows["w"] = resolve.Workflow{Name: "w", Steps: []resolve.Item{at(step("e", "p", "a"), 4, "steps[0]"), continuing}}
	lacking(s, func(f *resolve.Facts) { f.Session = false })
	_, faults := newResolver(t, s).Resolve(requestW)
	assertResolved(t, faults)
}

// fallback.feature, "A required permission the fallback's runtime does not
// grant".
func TestARequiredPermissionTheFallbacksRuntimeDoesNotGrant(t *testing.T) {
	t.Parallel()
	s := fallingBack("b")
	s.processes["p"] = resolve.Process{Name: "p", Require: []string{"net"}}
	r := s.runtimes["r"]
	r.Grants = []string{"net"}
	s.runtimes["r"] = r
	assertProblemsOf(t, s, requestW, resolve.KindWorkflow, "w", resolve.Problem{Origin: fallbackOfA,
		Message: `the step "s" falls back to it: its runtime "rb" grants the permission "net", as its process "p" requires`})
}

// fallback.feature, "A fallback's extra is a warning at the step's place".
func TestAFallbacksExtraIsAWarningAtTheStepsPlace(t *testing.T) {
	t.Parallel()
	s := fallingBack("b")
	rb := s.runtimes["rb"]
	rb.Grants = []string{"net"}
	s.runtimes["rb"] = rb
	got, faults := newResolver(t, s).Resolve(requestW)
	assertResolved(t, faults)
	want := []resolve.Problem{problemOfW(4, "steps[0]", `its plan on its fallback "b" grants "net" beyond what its process "p" allows`)}
	if !reflect.DeepEqual(got.Warnings, want) {
		t.Errorf("warnings\n got %+v\nwant %+v", got.Warnings, want)
	}
}

// fallback.feature, "A fallback's own fallback is never planned".
func TestAFallbacksOwnFallbackIsNeverPlanned(t *testing.T) {
	t.Parallel()
	s := fallingBack("b")
	s.pair("c", "rc")
	b := s.agents["b"]
	b.Fallback = resolve.Name{Value: "c"}
	s.agents["b"] = b
	got, faults := newResolver(t, s).Resolve(requestW)
	assertResolved(t, faults)
	assertReached(t, got, ref(resolve.KindWorkflow, "w"), ref(resolve.KindProcess, "p"), ref(resolve.KindAgent, "a"),
		ref(resolve.KindRuntime, "r"), ref(resolve.KindAgent, "b"), ref(resolve.KindRuntime, "rb"),
		ref(resolve.KindAgent, "c"), ref(resolve.KindRuntime, "rc"))
	assertPlans(t, got, planOfS("a", "r"), planOfS("b", "rb"))
}
