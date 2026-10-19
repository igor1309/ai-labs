package workflow_test

import (
	"context"
	"fmt"
	"reflect"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/core/workflow"
	"github.com/igor1309/ai-labs/gokit/clocktest"
)

// ends is a call that ended in status, of class, after took.
func ends(status workflow.Status, class workflow.Class, took time.Duration) func() workflow.Result {
	return func() workflow.Result {
		return workflow.Result{Status: status, Class: class, Output: map[string]any{}, Timing: workflow.Timing{Duration: took}}
	}
}

// progress.feature, "A step's start, its tool calls and its end, in
// order".
func TestAStepsStartItsToolCallsAndItsEndInOrder(t *testing.T) {
	t.Parallel()
	f := newFixture(t, workflow.Boundary{}, map[string]func() workflow.Result{
		"a": ends(workflow.Completed, "", 2*time.Second),
		"b": ends(workflow.Failed, "killed", time.Second),
	})
	f.caller.tools = map[string][]workflow.Tool{"a": {{Name: "Bash", Input: "ls"}}}
	f.runner.Run(context.Background(), workflow.Workflow{Steps: []workflow.Step{
		{Name: "a", Agent: "claude-opus"}, {Name: "b", Agent: "bash"},
	}}, nil)
	want := []string{
		"a started on claude-opus",
		"a Bash ls",
		`a ended completed "" in 2s`,
		"b started on bash",
		`b ended failed "killed" in 1s`,
	}
	if !reflect.DeepEqual(f.events.told, want) {
		t.Errorf("told\n%q\nwant\n%q", f.events.told, want)
	}
}

// progress.feature, "A step that is not called reports nothing": neither
// one after a step that did not complete, nor one whose bindings read
// what is not there.
func TestAStepThatIsNotCalledReportsNothing(t *testing.T) {
	t.Parallel()
	for _, c := range []struct {
		name    string
		answers map[string]func() workflow.Result
		b       workflow.Step
	}{
		{"after a step that failed", map[string]func() workflow.Result{"a": ends(workflow.Failed, "killed", 0)}, workflow.Step{Name: "b"}},
		{"its binding not there", map[string]func() workflow.Result{"a": completes(0)},
			workflow.Step{Name: "b", Bindings: []workflow.Binding{bind("x", param("missing"))}}},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			f := newFixture(t, workflow.Boundary{}, c.answers)
			f.runner.Run(context.Background(), workflow.Workflow{Steps: []workflow.Step{{Name: "a"}, c.b}}, nil)
			for _, told := range f.events.told {
				if strings.HasPrefix(told, "b ") {
					t.Errorf("told %q, want nothing of b", f.events.told)
				}
			}
			if len(f.events.told) == 0 {
				t.Error("told nothing, want the start and end of a")
			}
		})
	}
}

// progress.feature, "A step's stale turn is an event": by the step's name,
// between its start and its end, recovering or not, a tool call before it
// kept before it.
func TestAStepsStaleTurnIsAnEvent(t *testing.T) {
	t.Parallel()
	for _, recovering := range []bool{true, false} {
		t.Run(fmt.Sprintf("recovering %t", recovering), func(t *testing.T) {
			t.Parallel()
			f := newFixture(t, workflow.Boundary{}, map[string]func() workflow.Result{"a": ends(workflow.Completed, "", time.Second)})
			f.caller.tools = map[string][]workflow.Tool{"a": {{Name: "Bash", Input: "ls"}}}
			f.caller.stale = map[string][]workflow.Stale{"a": {{What: "no event for 1m", Recovering: recovering}}}
			f.runner.Run(context.Background(), workflow.Workflow{Steps: []workflow.Step{{Name: "a", Agent: "claude-opus"}}}, nil)
			want := []string{
				"a started on claude-opus",
				"a Bash ls",
				fmt.Sprintf(`a stale "no event for 1m" recovering %t`, recovering),
				`a ended completed "" in 1s`,
			}
			if !reflect.DeepEqual(f.events.told, want) {
				t.Errorf("told\n%q\nwant\n%q", f.events.told, want)
			}
		})
	}
}

// progress.feature, "A step's turn at capacity is an event": by the
// step's name, between its start and its end, with its wait or with none.
func TestAStepsTurnAtCapacityIsAnEvent(t *testing.T) {
	t.Parallel()
	for _, retry := range []time.Duration{30 * time.Second, 0} {
		t.Run(fmt.Sprint(retry), func(t *testing.T) {
			t.Parallel()
			f := newFixture(t, workflow.Boundary{}, map[string]func() workflow.Result{"a": ends(workflow.Completed, "", time.Second)})
			f.caller.capacity = map[string][]workflow.Capacity{"a": {{Reason: "at capacity", Retry: retry}}}
			f.runner.Run(context.Background(), workflow.Workflow{Steps: []workflow.Step{{Name: "a", Agent: "claude-opus"}}}, nil)
			want := []string{
				"a started on claude-opus",
				fmt.Sprintf(`a at capacity "at capacity" retrying in %v`, retry),
				`a ended completed "" in 1s`,
			}
			if !reflect.DeepEqual(f.events.told, want) {
				t.Errorf("told\n%q\nwant\n%q", f.events.told, want)
			}
		})
	}
}

// startingCaller is a caller that keeps the events told by the time it is
// asked, then reports its call's start and completes it.
type startingCaller struct {
	events *eventsSpy
	before []string
}

func (c *startingCaller) Call(_ context.Context, _ string, _ map[string]string, report func(workflow.Report)) workflow.Result {
	c.events.mu.Lock()
	c.before = slices.Clone(c.events.told)
	c.events.mu.Unlock()
	report(workflow.Report{Started: true})
	return workflow.Result{Status: workflow.Completed, Output: map[string]any{}}
}

// progress.feature, "A step's start is told when its call reports it".
func TestAStepsStartIsToldWhenItsCallReportsIt(t *testing.T) {
	t.Parallel()
	events := &eventsSpy{}
	caller := &startingCaller{events: events}
	runner, err := workflow.New(&resolverSpy{trail: &trail{}}, caller, events, clocktest.NewClock(start))
	if err != nil {
		t.Fatal(err)
	}
	runner.Run(context.Background(), workflow.Workflow{Steps: []workflow.Step{{Name: "a", Agent: "bash"}}}, nil)
	if len(caller.before) > 0 {
		t.Errorf("told %q before the call port was asked, want nothing", caller.before)
	}
	if want := []string{"a started on bash", `a ended completed "" in 0s`}; !reflect.DeepEqual(events.told, want) {
		t.Errorf("told %q, want %q", events.told, want)
	}
}

// progress.feature, "A step whose call reports no start tells no end":
// the step after it is called and told as any.
func TestAStepWhoseCallReportsNoStartTellsNoEnd(t *testing.T) {
	t.Parallel()
	for _, c := range []struct {
		name   string
		given  func(*callerSpy)
		events []string
	}{
		{"nothing", func(s *callerSpy) { s.silent = []string{"a"} }, nil},
		{"it reused R1/a", func(s *callerSpy) { s.reused = map[string]string{"a": "R1/a"} }, []string{"a reused R1/a"}},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			f := newFixture(t, workflow.Boundary{}, map[string]func() workflow.Result{"a": completes(0), "b": completes(0)})
			c.given(f.caller)
			got := f.runner.Run(context.Background(), workflow.Workflow{Steps: []workflow.Step{{Name: "a"}, {Name: "b", Agent: "bash"}}}, nil)
			want := append(slices.Clone(c.events), "b started on bash", `b ended completed "" in 0s`)
			if !reflect.DeepEqual(f.events.told, want) {
				t.Errorf("told %q, want %q", f.events.told, want)
			}
			if got.Status != workflow.Completed {
				t.Errorf("the run ended %q, want completed", got.Status)
			}
		})
	}
}

// progress.feature, "Each step's report reaches the call port": the tool
// calls a step's call reports are told by that step's name.
func TestEachStepsReportReachesTheCallPort(t *testing.T) {
	t.Parallel()
	f := newFixture(t, workflow.Boundary{}, map[string]func() workflow.Result{"a": completes(0), "b": completes(0)})
	f.caller.tools = map[string][]workflow.Tool{"a": {{Name: "Bash", Input: "ls"}}, "b": {{Name: "Read", Input: "a.go"}}}
	f.runner.Run(context.Background(), workflow.Workflow{Steps: []workflow.Step{{Name: "a"}, {Name: "b"}}}, nil)
	var tools []string
	for _, told := range f.events.told {
		if !strings.Contains(told, " started on ") && !strings.Contains(told, " ended ") {
			tools = append(tools, told)
		}
	}
	if want := []string{"a Bash ls", "b Read a.go"}; !reflect.DeepEqual(tools, want) {
		t.Errorf("told the tool calls %q, want %q", tools, want)
	}
}
