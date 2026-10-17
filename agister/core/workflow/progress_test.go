package workflow_test

import (
	"context"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/core/workflow"
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
