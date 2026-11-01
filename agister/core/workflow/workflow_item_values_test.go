package workflow_test

import (
	"encoding/json"
	"fmt"
	"reflect"
	"testing"

	"github.com/igor1309/ai-labs/agister/core/workflow"
)

func TestAWorkflowItemInsideARepeatKeepsItsDeclaredPrefix(t *testing.T) {
	t.Parallel()
	f := newItemFixture(t)
	f.w.Steps = []workflow.Step{{Name: "rounds", Repeat: &workflow.Repeat{
		Steps: f.w.Steps[:1], Max: 2,
		Until: workflow.Condition{Operator: "equals", Reads: *param("goal").Reads, Equals: "never"},
	}}}
	for pass := 1; pass <= 2; pass++ {
		for _, leaf := range []string{"draft", "polish"} {
			f.caller.answers[fmt.Sprintf("tests/%s/%d", leaf, pass)] = f.caller.answers["tests/"+leaf]
		}
	}
	f.completed(t)
	assertItemCalls(t, f, "tests/draft/1", "tests/polish/1", "tests/draft/2", "tests/polish/2")
	for pass := 1; pass <= 2; pass++ {
		for _, leaf := range []string{"draft", "polish"} {
			name := fmt.Sprintf("tests/%s/%d", leaf, pass)
			if got := f.caller.declared[name]; got != "tests/"+leaf {
				t.Errorf("%s declared as %q", name, got)
			}
		}
	}
}

func TestAWorkflowItemGivesEveryOutputTypeWholeAtEveryBoundary(t *testing.T) {
	t.Parallel()
	for _, c := range []struct {
		name  string
		value any
	}{
		{"number", float64(0)}, {"text", "review"}, {"boolean", false},
		{"collection", []any{float64(1), "two", nil}},
		{"mapping", map[string]any{"verdict": "approve"}}, {"null", nil},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			for _, placement := range []string{"sequence", "parallel join", "branch bindings"} {
				t.Run(placement, func(t *testing.T) {
					t.Parallel()
					f, events := childRunFixture(t)
					f.caller.answers["tests/draft"] = itemResult(map[string]any{"value": c.value})
					f.lens.Outputs = []workflow.Binding{bind("output", outputs("draft", "value"))}
					item := f.w.Steps[0]
					source := outputs("tests", "")
					want := c.value
					switch placement {
					case "parallel join":
						f.w.Steps = []workflow.Step{{Name: "reviews", Parallel: []workflow.Step{item}}}
						source = outputs("reviews", "")
						want = []any{map[string]any{"status": "completed", "class": nil, "output": c.value}}
					case "branch bindings":
						item.Outputs = []workflow.Binding{bind("value", outputs("tests", ""))}
						f.w.Steps = []workflow.Step{{Name: "choice", Branch: []workflow.Step{item}}}
						source = outputs("choice", "value")
					}
					f.w.Steps = append(f.w.Steps, workflow.Step{Name: "judge", Bindings: []workflow.Binding{bind("reviews", source)}})
					f.w.Outputs = []workflow.Binding{bind("published", source)}
					got := f.completed(t)
					if !reflect.DeepEqual(got.Output, map[string]any{"published": want}) {
						t.Fatalf("published %#v, want %#v", got.Output, want)
					}
					encoded, err := json.Marshal(want)
					if err != nil {
						t.Fatal(err)
					}
					wantText := string(encoded)
					if text, ok := want.(string); ok {
						wantText = text
					}
					if bound := f.caller.bound["judge"]["reviews"]; bound != wantText {
						t.Errorf("judge reads %q, want %q", bound, wantText)
					}
					if events.end.Status != workflow.Completed || !reflect.DeepEqual(events.end.Output, c.value) {
						t.Errorf("child end %#v, want output %#v", events.end, c.value)
					}
				})
			}
		})
	}
}
