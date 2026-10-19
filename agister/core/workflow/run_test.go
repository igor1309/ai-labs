package workflow_test

import (
	"context"
	"errors"
	"fmt"
	"reflect"
	"slices"
	"sync"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/core/workflow"
	"github.com/igor1309/ai-labs/gokit/clocktest"
)

// trail is what the spies were asked, in order: "resolve", or the name of
// the step called.
type trail []string

// resolverSpy answers the boundary with its test's answer, and keeps the
// params it is given each time it is asked.
type resolverSpy struct {
	trail  *trail
	answer workflow.Boundary
	err    error
	asked  []map[string]string
}

func (s *resolverSpy) Resolve(_ context.Context, given map[string]string) (workflow.Boundary, error) {
	*s.trail = append(*s.trail, "resolve")
	s.asked = append(s.asked, given)
	return s.answer, s.err
}

// callerSpy answers each step by its test's answer for its name, once it
// has given the call's report its start, or, where its test gives one,
// the call it reused for that name, or nothing where its test names the
// step in silent; then its test's tools for that name, in order, then its
// stale turns; and keeps each call's params, in the order called and by
// its step. A step it has no answer for fails its test, and is answered
// with nothing. It is safe for concurrent use; the trail is read once the
// run has ended.
type callerSpy struct {
	t       *testing.T
	trail   *trail
	answers map[string]func() workflow.Result
	reused  map[string]string
	silent  []string
	tools   map[string][]workflow.Tool
	stale   map[string][]workflow.Stale
	mu      sync.Mutex
	params  []map[string]string
	bound   map[string]map[string]string
}

func (s *callerSpy) Call(_ context.Context, step string, params map[string]string, report func(workflow.Report)) workflow.Result {
	s.mu.Lock()
	*s.trail = append(*s.trail, step)
	s.params = append(s.params, params)
	if s.bound == nil {
		s.bound = map[string]map[string]string{}
	}
	s.bound[step] = params
	s.mu.Unlock()
	switch reused := s.reused[step]; {
	case reused != "":
		report(workflow.Report{Reused: reused})
	case !slices.Contains(s.silent, step):
		report(workflow.Report{Started: true})
	}
	for _, tool := range s.tools[step] {
		report(workflow.Report{Tool: &tool})
	}
	for _, stale := range s.stale[step] {
		report(workflow.Report{Stale: &stale})
	}
	answer, ok := s.answers[step]
	if !ok {
		s.t.Errorf("step %q called, with no answer given", step)
		return workflow.Result{}
	}
	return answer()
}

// completes is a completed call whose output is the exit code code.
func completes(code int) func() workflow.Result {
	return func() workflow.Result {
		return workflow.Result{Status: workflow.Completed, Output: map[string]any{"exit_code": code}}
	}
}

var start = time.Date(2026, 10, 16, 10, 0, 0, 0, time.UTC)

// eventsSpy keeps what it is told, in order, each a line of the step's
// name and what it was told of it. It is safe for concurrent use; told is
// read once the run has ended.
type eventsSpy struct {
	mu   sync.Mutex
	told []string
}

func (s *eventsSpy) tell(format string, args ...any) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.told = append(s.told, fmt.Sprintf(format, args...))
}

func (s *eventsSpy) Started(step, agent string) {
	s.tell("%s started on %s", step, agent)
}

func (s *eventsSpy) Reused(step, call string) {
	s.tell("%s reused %s", step, call)
}

func (s *eventsSpy) Tool(step string, tool workflow.Tool) {
	s.tell("%s %s %s", step, tool.Name, tool.Input)
}

func (s *eventsSpy) Stale(step string, stale workflow.Stale) {
	s.tell("%s stale %q recovering %t", step, stale.What, stale.Recovering)
}

func (s *eventsSpy) Ended(step string, ended workflow.Ended) {
	s.tell("%s ended %s %q in %v", step, ended.Status, ended.Class, ended.Duration)
}

// fixture is a runner over its spies and its clock, the resolver and the
// caller sharing one trail.
type fixture struct {
	trail    trail
	resolver *resolverSpy
	caller   *callerSpy
	events   *eventsSpy
	clock    *clocktest.Clock
	runner   *workflow.Runner
}

// newFixture is a runner whose resolver answers boundary and whose caller
// answers each step by answers.
func newFixture(t *testing.T, boundary workflow.Boundary, answers map[string]func() workflow.Result) *fixture {
	t.Helper()
	f := &fixture{clock: clocktest.NewClock(start)}
	f.resolver = &resolverSpy{trail: &f.trail, answer: boundary}
	f.caller = &callerSpy{t: t, trail: &f.trail, answers: answers}
	f.events = &eventsSpy{}
	runner, err := workflow.New(f.resolver, f.caller, f.events, f.clock)
	if err != nil {
		t.Fatal(err)
	}
	f.runner = runner
	return f
}

func text(s string) workflow.Value { return workflow.Value{Text: s} }

func param(name string) workflow.Value {
	return workflow.Value{Reads: &workflow.Reference{Of: workflow.Params, Name: name}}
}

func input(name string) workflow.Value {
	return workflow.Value{Reads: &workflow.Reference{Of: workflow.Inputs, Name: name}}
}

func outputs(step, field string, path ...string) workflow.Value {
	return workflow.Value{Reads: &workflow.Reference{Of: workflow.Outputs, Name: step, Field: field, Path: path}}
}

func bind(name string, value workflow.Value) workflow.Binding {
	return workflow.Binding{Name: name, Value: value}
}

// A runner takes each of its collaborators, and fails without one.
func TestNewFailsWithoutACollaborator(t *testing.T) {
	t.Parallel()
	var tr trail
	resolver, caller, events, clock := &resolverSpy{trail: &tr}, &callerSpy{t: t, trail: &tr}, &eventsSpy{}, clocktest.NewClock(start)
	cases := []struct {
		name     string
		resolver workflow.Resolver
		caller   workflow.Caller
		events   workflow.Events
		clock    workflow.Clock
	}{
		{"resolver", nil, caller, events, clock},
		{"caller", resolver, nil, events, clock},
		{"events", resolver, caller, nil, clock},
		{"clock", resolver, caller, events, nil},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			if _, err := workflow.New(c.resolver, c.caller, c.events, c.clock); err == nil || err.Error() != "workflow: no "+c.name {
				t.Errorf("New without a %s: %v, want workflow: no %s", c.name, err, c.name)
			}
		})
	}
}

// run.feature, "Each step is called in order, its process's params bound".
func TestEachStepIsCalledInOrderItsParamsBound(t *testing.T) {
	t.Parallel()
	f := newFixture(t, workflow.Boundary{Params: map[string]string{"goal": "x"}},
		map[string]func() workflow.Result{"a": completes(0), "b": completes(0)})
	got := f.runner.Run(context.Background(), workflow.Workflow{
		Steps: []workflow.Step{
			{Name: "a", Bindings: []workflow.Binding{bind("g", param("goal"))}},
			{Name: "b", Bindings: []workflow.Binding{bind("code", outputs("a", "exit_code"))}},
		},
	}, map[string]string{"goal": "x"})
	if got.Status != workflow.Completed {
		t.Errorf("ended %q, class %q; want completed", got.Status, got.Class)
	}
	if want := (trail{"resolve", "a", "b"}); !slices.Equal(f.trail, want) {
		t.Errorf("asked %q, want %q", f.trail, want)
	}
	want := []map[string]string{{"g": "x"}, {"code": "0"}}
	if !reflect.DeepEqual(f.caller.params, want) {
		t.Errorf("params\n got %v\nwant %v", f.caller.params, want)
	}
}

// A binding gives a value that is not text as its JSON, and a text as it
// is.
func TestABindingGivesAValueThatIsNotTextAsItsJSON(t *testing.T) {
	t.Parallel()
	output := map[string]any{
		"exit_code": 4,
		"stdout":    map[string]any{"head": "o", "size": int64(1)},
		"text":      "t",
	}
	f := newFixture(t, workflow.Boundary{}, map[string]func() workflow.Result{
		"a": func() workflow.Result { return workflow.Result{Status: workflow.Completed, Output: output} },
		"b": completes(0),
	})
	f.runner.Run(context.Background(), workflow.Workflow{
		Steps: []workflow.Step{
			{Name: "a"},
			{Name: "b", Bindings: []workflow.Binding{
				bind("code", outputs("a", "exit_code")),
				bind("stdout", outputs("a", "stdout")),
				bind("text", outputs("a", "text")),
				bind("literal", text("l")),
			}},
		},
	}, nil)
	want := map[string]string{
		"code":    "4",
		"stdout":  `{"head":"o","size":1}`,
		"text":    "t",
		"literal": "l",
	}
	if len(f.caller.params) != 2 || !reflect.DeepEqual(f.caller.params[1], want) {
		t.Errorf("params %v, want b's %v", f.caller.params, want)
	}
}

// run.feature, "A binding reads a field within a step's output field".
func TestABindingReadsAFieldWithinAStepsOutputField(t *testing.T) {
	t.Parallel()
	output := map[string]any{"stdout": map[string]any{"head": "hi\n", "size": int64(3)}}
	f := newFixture(t, workflow.Boundary{}, map[string]func() workflow.Result{
		"a": func() workflow.Result { return workflow.Result{Status: workflow.Completed, Output: output} },
		"b": completes(0),
	})
	f.runner.Run(context.Background(), workflow.Workflow{
		Steps: []workflow.Step{
			{Name: "a"},
			{Name: "b", Bindings: []workflow.Binding{bind("what", outputs("a", "stdout", "head"))}},
		},
	}, nil)
	if want := map[string]string{"what": "hi\n"}; len(f.caller.params) != 2 || !reflect.DeepEqual(f.caller.params[1], want) {
		t.Errorf("params %v, want b's %v", f.caller.params, want)
	}
}

// run.feature, "The workflow's inputs are resolved once, at its boundary":
// the input "goal" from the param "g" is the resolver's, which answers it.
func TestTheWorkflowsInputsAreResolvedOnceAtItsBoundary(t *testing.T) {
	t.Parallel()
	f := newFixture(t, workflow.Boundary{
		Params: map[string]string{"g": "x"},
		Inputs: map[string]string{"goal": "x"},
	}, map[string]func() workflow.Result{"a": completes(0)})
	w := workflow.Workflow{
		Steps: []workflow.Step{{Name: "a", Bindings: []workflow.Binding{bind("t", input("goal"))}}},
	}
	f.runner.Run(context.Background(), w, map[string]string{"g": "x"})
	if want := (trail{"resolve", "a"}); !slices.Equal(f.trail, want) {
		t.Errorf("asked %q, want %q", f.trail, want)
	}
	if want := []map[string]string{{"g": "x"}}; !reflect.DeepEqual(f.resolver.asked, want) {
		t.Errorf("resolved over\n got %v\nwant %v", f.resolver.asked, want)
	}
	if want := []map[string]string{{"t": "x"}}; !reflect.DeepEqual(f.caller.params, want) {
		t.Errorf("params %v, want %v", f.caller.params, want)
	}
}

// run.feature, "A step that does not complete ends the run": a failed,
// interrupted or lost step, first, between or last, ends the run in its
// status and class.
func TestAStepThatDoesNotCompleteEndsTheRun(t *testing.T) {
	t.Parallel()
	cases := []struct {
		step   string
		status workflow.Status
		class  workflow.Class
		called trail
	}{
		{"a", "failed", "runtime_error", trail{"resolve", "a"}},
		{"b", "failed", "runtime_unavailable", trail{"resolve", "a", "b"}},
		{"a", "interrupted", "timeout", trail{"resolve", "a"}},
		{"b", "interrupted", "cancelled", trail{"resolve", "a", "b"}},
		{"c", "failed", "killed", trail{"resolve", "a", "b", "c"}},
		{"b", "lost", "no_result", trail{"resolve", "a", "b"}},
	}
	for _, c := range cases {
		t.Run(c.step+" "+string(c.status)+" "+string(c.class), func(t *testing.T) {
			t.Parallel()
			answers := map[string]func() workflow.Result{}
			for _, before := range c.called[1 : len(c.called)-1] {
				answers[before] = completes(0)
			}
			answers[c.step] = func() workflow.Result { return workflow.Result{Status: c.status, Class: c.class} }
			f := newFixture(t, workflow.Boundary{}, answers)
			got := f.runner.Run(context.Background(), workflow.Workflow{
				Steps:   []workflow.Step{{Name: "a"}, {Name: "b"}, {Name: "c"}},
				Outputs: []workflow.Binding{bind("result", text("r"))},
			}, nil)
			if !slices.Equal(f.trail, c.called) {
				t.Errorf("asked %q, want %q", f.trail, c.called)
			}
			if got.Status != c.status || got.Class != c.class || got.Output != nil {
				t.Errorf("ended %q, class %q, output %v; want %s, class %s, no output", got.Status, got.Class, got.Output, c.status, c.class)
			}
		})
	}
}

// run.feature, "The run's output is its output mapping".
func TestTheRunsOutputIsItsOutputMapping(t *testing.T) {
	t.Parallel()
	aOutput := map[string]any{"exit_code": 7}
	cases := []struct {
		reads string
		value workflow.Value
		want  any
	}{
		{"steps.a.outputs", outputs("a", ""), aOutput},
		{"params.p", param("p"), "x"},
		{"inputs.i", input("i"), "x"},
	}
	for _, c := range cases {
		t.Run(c.reads, func(t *testing.T) {
			t.Parallel()
			f := newFixture(t, workflow.Boundary{
				Params: map[string]string{"p": "x"},
				Inputs: map[string]string{"i": "x"},
			}, map[string]func() workflow.Result{"a": completes(7), "b": completes(0)})
			got := f.runner.Run(context.Background(), workflow.Workflow{
				Steps:   []workflow.Step{{Name: "a"}, {Name: "b"}},
				Outputs: []workflow.Binding{bind("result", c.value)},
			}, map[string]string{"p": "x"})
			want := map[string]any{"result": c.want}
			if got.Status != workflow.Completed || !reflect.DeepEqual(got.Output, want) {
				t.Errorf("ended %q, output %v; want completed, %v", got.Status, got.Output, want)
			}
		})
	}
}

// run.feature, "The run's timing, cost and warnings cover its calls".
func TestTheRunsTimingCostAndWarningsCoverItsCalls(t *testing.T) {
	t.Parallel()
	// Each call takes its time on the run's clock, and its cost is unknown.
	var f *fixture
	takes := func(d time.Duration, warning string) func() workflow.Result {
		return func() workflow.Result {
			f.clock.Advance(d)
			return workflow.Result{Status: workflow.Completed, Warnings: []string{warning}}
		}
	}
	f = newFixture(t, workflow.Boundary{}, map[string]func() workflow.Result{
		"a": takes(4*time.Second, "w1"),
		"b": takes(5*time.Second, "w2"),
	})
	got := f.runner.Run(context.Background(), workflow.Workflow{
		Steps: []workflow.Step{{Name: "a"}, {Name: "b"}},
	}, nil)
	want := workflow.Timing{Started: start, Ended: start.Add(9 * time.Second), Duration: 9 * time.Second}
	if got.Timing != want {
		t.Errorf("timing %+v, want %+v", got.Timing, want)
	}
	if got.Cost != nil {
		t.Errorf("cost %v, want unknown", *got.Cost)
	}
	if !slices.Equal(got.Warnings, []string{"w1", "w2"}) {
		t.Errorf("warnings %q, want [w1 w2]", got.Warnings)
	}
}

// A run's cost is its calls' summed when each is known, and unknown when
// any is not.
func TestARunsCostIsItsCallsSummedWhenEachIsKnown(t *testing.T) {
	t.Parallel()
	cost := func(c *float64) func() workflow.Result {
		return func() workflow.Result { return workflow.Result{Status: workflow.Completed, Cost: c} }
	}
	one, two, three := 1.0, 2.0, 3.0
	cases := []struct {
		name string
		a, b *float64
		want *float64
	}{
		{"each known", &one, &two, &three},
		{"the first unknown", nil, &two, nil},
		{"the last unknown", &one, nil, nil},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			f := newFixture(t, workflow.Boundary{}, map[string]func() workflow.Result{"a": cost(c.a), "b": cost(c.b)})
			got := f.runner.Run(context.Background(), workflow.Workflow{Steps: []workflow.Step{{Name: "a"}, {Name: "b"}}}, nil)
			if !reflect.DeepEqual(got.Cost, c.want) {
				t.Errorf("cost %v, want %v", got.Cost, c.want)
			}
		})
	}
}

// run.feature, "A param not given takes its default": the default is the
// resolver's, and the params bound are those the boundary resolved,
// defaults included, not those given.
func TestAParamNotGivenTakesItsDefault(t *testing.T) {
	t.Parallel()
	f := newFixture(t, workflow.Boundary{Params: map[string]string{"base": "main"}}, map[string]func() workflow.Result{"a": completes(0)})
	w := workflow.Workflow{
		Steps: []workflow.Step{{Name: "a", Bindings: []workflow.Binding{bind("b", param("base"))}}},
	}
	f.runner.Run(context.Background(), w, nil)
	if len(f.resolver.asked) != 1 || len(f.resolver.asked[0]) != 0 {
		t.Errorf("resolved over %v, want once, no param given", f.resolver.asked)
	}
	if want := []map[string]string{{"b": "main"}}; !reflect.DeepEqual(f.caller.params, want) {
		t.Errorf("params %v, want %v", f.caller.params, want)
	}
}

// A run whose inputs, a step's bindings or its output mapping cannot be
// resolved is refused: failed, class "refused", with no output, and no
// later step is called; one refused at its boundary has the resolver's
// words as its reason.
func TestWhatCannotBeResolvedRefusesTheRun(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name    string
		refuse  error
		steps   []workflow.Step
		outputs []workflow.Binding
		called  trail
	}{
		{"the inputs", errors.New(`input "i": no source "git.revision" is plugged in`),
			[]workflow.Step{{Name: "a"}}, nil, trail{"resolve"}},
		{"a binding reading a step not run", nil, []workflow.Step{
			{Name: "a", Bindings: []workflow.Binding{bind("x", outputs("b", ""))}},
			{Name: "b"},
		}, nil, trail{"resolve"}},
		{"a binding reading a field not given", nil, []workflow.Step{
			{Name: "a"},
			{Name: "b", Bindings: []workflow.Binding{bind("x", outputs("a", "nothing"))}},
		}, nil, trail{"resolve", "a"}},
		{"a binding reading within a field that holds no fields", nil, []workflow.Step{
			{Name: "a"},
			{Name: "b", Bindings: []workflow.Binding{bind("x", outputs("a", "exit_code", "head"))}},
		}, nil, trail{"resolve", "a"}},
		{"a binding reading within a field not given", nil, []workflow.Step{
			{Name: "a"},
			{Name: "b", Bindings: []workflow.Binding{bind("x", outputs("a", "nothing", "head"))}},
		}, nil, trail{"resolve", "a"}},
		{"a binding reading a param not given", nil, []workflow.Step{
			{Name: "a", Bindings: []workflow.Binding{bind("x", param("p"))}},
		}, nil, trail{"resolve"}},
		{"an output reading an input not resolved", nil, []workflow.Step{{Name: "a"}},
			[]workflow.Binding{bind("result", input("i"))}, trail{"resolve", "a"}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			f := newFixture(t, workflow.Boundary{}, map[string]func() workflow.Result{"a": completes(0)})
			f.resolver.err = c.refuse
			got := f.runner.Run(context.Background(), workflow.Workflow{Steps: c.steps, Outputs: c.outputs}, nil)
			if got.Status != workflow.Failed || got.Class != workflow.Refused || got.Output != nil {
				t.Errorf("ended %q, class %q, output %v; want failed, class refused, no output", got.Status, got.Class, got.Output)
			}
			if !slices.Equal(f.trail, c.called) {
				t.Errorf("asked %q, want %q", f.trail, c.called)
			}
			var reason string
			if c.refuse != nil {
				reason = c.refuse.Error()
			}
			if got.Reason != reason {
				t.Errorf("reason %q, want %q", got.Reason, reason)
			}
		})
	}
}

// run.feature, "The run's usage sums what its calls reported, and its
// reason is its last call's": each of the five counts sums its own, a
// count none reported is unknown, one a call did not report sums the
// others', and 0 reported is 0.
func TestTheRunsUsageSumsWhatItsCallsReported(t *testing.T) {
	t.Parallel()
	count := func(n int64) *int64 { return &n }
	cases := []struct {
		name       string
		a, b, want workflow.Usage
	}{
		{"input and output", workflow.Usage{Input: count(10), Output: count(3)}, workflow.Usage{Input: count(5)},
			workflow.Usage{Input: count(15), Output: count(3)}},
		{"every count", workflow.Usage{Input: count(1), Output: count(2), CacheRead: count(3), CacheWrite: count(4), Reasoning: count(5)},
			workflow.Usage{Input: count(10), Output: count(20), CacheRead: count(30), CacheWrite: count(40), Reasoning: count(50)},
			workflow.Usage{Input: count(11), Output: count(22), CacheRead: count(33), CacheWrite: count(44), Reasoning: count(55)}},
		{"each by one call", workflow.Usage{CacheRead: count(3), Reasoning: count(5)}, workflow.Usage{CacheWrite: count(4)},
			workflow.Usage{CacheRead: count(3), CacheWrite: count(4), Reasoning: count(5)}},
		{"every count 0", workflow.Usage{Input: count(0), Output: count(0), CacheRead: count(0), CacheWrite: count(0), Reasoning: count(0)},
			workflow.Usage{},
			workflow.Usage{Input: count(0), Output: count(0), CacheRead: count(0), CacheWrite: count(0), Reasoning: count(0)}},
		{"none reported", workflow.Usage{}, workflow.Usage{}, workflow.Usage{}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			f := newFixture(t, workflow.Boundary{}, map[string]func() workflow.Result{
				"a": func() workflow.Result { return workflow.Result{Status: workflow.Completed, Usage: c.a} },
				"b": func() workflow.Result {
					return workflow.Result{Status: workflow.Failed, Class: "auth", Usage: c.b, Reason: "r"}
				},
			})
			got := f.runner.Run(context.Background(), workflow.Workflow{Steps: []workflow.Step{{Name: "a"}, {Name: "b"}}}, nil)
			if !reflect.DeepEqual(got.Usage, c.want) {
				t.Errorf("usage %+v, want %+v", got.Usage, c.want)
			}
			if got.Reason != "r" {
				t.Errorf("reason %q, want r", got.Reason)
			}
		})
	}
}

// The run's reason is its last call's: none where that call completed,
// whatever one before it gave.
func TestTheRunsReasonIsItsLastCalls(t *testing.T) {
	t.Parallel()
	f := newFixture(t, workflow.Boundary{}, map[string]func() workflow.Result{
		"a": func() workflow.Result { return workflow.Result{Status: workflow.Completed, Reason: "earlier"} },
		"b": completes(0),
	})
	got := f.runner.Run(context.Background(), workflow.Workflow{Steps: []workflow.Step{{Name: "a"}, {Name: "b"}}}, nil)
	if got.Status != workflow.Completed || got.Reason != "" {
		t.Errorf("ended %q, reason %q; want completed, none", got.Status, got.Reason)
	}
}

// run.feature, "A run carries each step's session by its name".
func TestARunCarriesEachStepsSessionByItsName(t *testing.T) {
	t.Parallel()
	f := newFixture(t, workflow.Boundary{}, map[string]func() workflow.Result{
		"a": func() workflow.Result { return workflow.Result{Status: workflow.Completed, Session: "s1"} },
		"b": completes(0),
	})
	got := f.runner.Run(context.Background(), workflow.Workflow{Steps: []workflow.Step{{Name: "a"}, {Name: "b"}}}, nil)
	if want := map[string]string{"a": "s1"}; !reflect.DeepEqual(got.Sessions, want) {
		t.Errorf("sessions %v, want %v", got.Sessions, want)
	}
}
