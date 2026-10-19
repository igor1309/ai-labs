package workflow_test

import (
	"context"
	"maps"
	"slices"
	"testing"

	"github.com/igor1309/ai-labs/agister/core/workflow"
)

// reports is a completed call whose output is empty, reporting session.
func reports(session string) func() workflow.Result {
	return func() workflow.Result {
		return workflow.Result{Status: workflow.Completed, Output: map[string]any{}, Session: session}
	}
}

// session.feature, "A step is given the session of the step it names"
// and "A step of a parallel is given its session as well": each step is
// called with the session of the step it continues, the others with none.
func TestAStepIsGivenTheSessionOfTheStepItNames(t *testing.T) {
	t.Parallel()
	continuing := func(name, of string) workflow.Step { return workflow.Step{Name: name, Session: of} }
	for _, c := range []struct {
		name  string
		steps []workflow.Step
		want  map[string]string
	}{
		{"in sequence", []workflow.Step{{Name: "a"}, parallel("p", workflow.Step{Name: "b"}), continuing("c", "a")},
			map[string]string{"a": "", "b": "", "c": "s1"}},
		{"in a parallel", []workflow.Step{{Name: "a"}, parallel("q", continuing("c", "a"), workflow.Step{Name: "d"})},
			map[string]string{"a": "", "c": "s1", "d": ""}},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			f := newFixture(t, workflow.Boundary{}, map[string]func() workflow.Result{
				"a": reports("s1"), "b": reports("s2"), "c": reports("s1"), "d": reports(""),
			})
			got := f.runner.Run(context.Background(), workflow.Workflow{Steps: c.steps}, nil)
			if got.Status != workflow.Completed {
				t.Fatalf("ended %q, %q; want completed", got.Status, got.Reason)
			}
			if !maps.Equal(f.caller.sessions, c.want) {
				t.Errorf("called with the sessions %v, want %v", f.caller.sessions, c.want)
			}
		})
	}
}

// session.feature, "A step whose named step reported no session is not
// called", in sequence and in a parallel, whose other steps are not
// called either.
func TestAStepWhoseNamedStepReportedNoSessionIsNotCalled(t *testing.T) {
	t.Parallel()
	c := workflow.Step{Name: "c", Session: "a"}
	for name, steps := range map[string][]workflow.Step{
		"in sequence":   {{Name: "a"}, c},
		"in a parallel": {{Name: "a"}, parallel("q", c, workflow.Step{Name: "d"})},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			f := newFixture(t, workflow.Boundary{}, map[string]func() workflow.Result{"a": reports("")})
			got := f.runner.Run(context.Background(), workflow.Workflow{Steps: steps}, nil)
			if got.Status != workflow.Failed || got.Class != workflow.Refused || got.Reason != `the step "a" reported no session` {
				t.Errorf("ended %q, class %q, reason %q; want failed, refused, the step \"a\" reported no session",
					got.Status, got.Class, got.Reason)
			}
			if want := (trail{"resolve", "a"}); !slices.Equal(f.trail, want) {
				t.Errorf("asked %q, want %q", f.trail, want)
			}
		})
	}
}
