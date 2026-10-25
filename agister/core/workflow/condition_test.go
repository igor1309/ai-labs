package workflow_test

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"

	"github.com/igor1309/ai-labs/agister/core/workflow"
)

func compare(value workflow.Value, literal any) workflow.Condition {
	return workflow.Condition{Operator: "equals", Reads: *value.Reads, Equals: literal}
}

func present(value workflow.Value) workflow.Condition {
	return workflow.Condition{Operator: "present", Reads: *value.Reads}
}

func TestConditionsKeepTypesAndQueryCollections(t *testing.T) {
	t.Parallel()
	item := workflow.Value{Reads: &workflow.Reference{Of: workflow.QueryItem, Field: "fixed"}}
	query := func(operator string) workflow.Condition {
		return workflow.Condition{Operator: operator, Reads: *outputs("t", "fs").Reads, Of: []workflow.Condition{present(item)}}
	}
	code := func(literal any) workflow.Condition { return compare(outputs("t", "code"), literal) }
	v := func(literal any) workflow.Condition { return compare(outputs("t", "v"), literal) }
	cases := []struct {
		output    string
		condition workflow.Condition
		holds     bool
	}{
		{`{"code":0}`, code(0), true},
		{`{"code":0}`, code("0"), false},
		{`{"ok":true}`, compare(outputs("t", "ok"), true), true},
		{`{"v":"a"}`, v("a"), true},
		{`{"v":"a"}`, present(outputs("t", "w")), false},
		{`{"v":"a"}`, compare(outputs("t", "w"), "a"), false},
		{`{"fs":[{"fixed":1},{"fixed":2}]}`, query("all"), true},
		{`{"fs":[{"fixed":1},{}]}`, query("all"), false},
		{`{"fs":[{"fixed":1},{}]}`, query("any"), true},
		{`{"fs":[]}`, query("all"), true},
		{`{"fs":[]}`, query("any"), false},
		{`{"fs":"x"}`, query("all"), false},
		{`{"fs":"x"}`, query("any"), false},
		{`{}`, query("all"), false},
		{`{}`, query("any"), false},
		{`{"code":1}`, workflow.Condition{Operator: "not", Of: []workflow.Condition{code(0)}}, true},
		{`{"code":1,"v":"a"}`, workflow.Condition{Operator: "and", Of: []workflow.Condition{code(1), v("b")}}, false},
		{`{"code":1,"v":"a"}`, workflow.Condition{Operator: "or", Of: []workflow.Condition{code(0), v("a")}}, true},
	}
	for i, c := range cases {
		t.Run(fmt.Sprint(i), func(t *testing.T) {
			t.Parallel()
			var output map[string]any
			if err := json.Unmarshal([]byte(c.output), &output); err != nil {
				t.Fatal(err)
			}
			assertCondition(t, workflow.Boundary{}, []workflow.Step{{Name: "t"}}, map[string]func() workflow.Result{
				"t": func() workflow.Result { return workflow.Result{Status: workflow.Completed, Output: output} },
			}, c.condition, c.holds)
		})
	}
}

func TestAndOrNotFollowTheirTruthTables(t *testing.T) {
	t.Parallel()
	yes, no := compare(outputs("t", "code"), 0), compare(outputs("t", "code"), 1)
	of := func(operator string, conditions ...workflow.Condition) workflow.Condition {
		return workflow.Condition{Operator: operator, Of: conditions}
	}
	cases := []struct {
		condition workflow.Condition
		holds     bool
	}{
		{of("not", yes), false}, {of("not", no), true},
		{of("and", yes, yes), true}, {of("and", yes, no), false}, {of("and", no, yes), false}, {of("and", no, no), false},
		{of("or", yes, yes), true}, {of("or", yes, no), true}, {of("or", no, yes), true}, {of("or", no, no), false},
	}
	for i, c := range cases {
		t.Run(fmt.Sprint(i), func(t *testing.T) {
			t.Parallel()
			assertCondition(t, workflow.Boundary{}, []workflow.Step{{Name: "t"}}, map[string]func() workflow.Result{
				"t": func() workflow.Result {
					return workflow.Result{Status: workflow.Completed, Output: map[string]any{"code": 0}}
				},
			}, c.condition, c.holds)
		})
	}
}

func TestParamsAndInputsAreText(t *testing.T) {
	t.Parallel()
	for _, value := range []workflow.Value{param("p"), input("p")} {
		for _, literal := range []any{"0", 0} {
			t.Run(fmt.Sprintf("%d/%T", value.Reads.Of, literal), func(t *testing.T) {
				t.Parallel()
				assertCondition(t, workflow.Boundary{Params: map[string]string{"p": "0"}, Inputs: map[string]workflow.Input{"p": {Value: "0"}}}, nil, nil, compare(value, literal), literal == "0")
			})
		}
	}
}

func assertCondition(t *testing.T, boundary workflow.Boundary, before []workflow.Step, answers map[string]func() workflow.Result, condition workflow.Condition, holds bool) {
	t.Helper()
	if answers == nil {
		answers = map[string]func() workflow.Result{}
	}
	answers["yes"], answers["no"] = completes(0), completes(0)
	f := newFixture(t, boundary, answers)
	w := workflow.Workflow{Steps: append(before, workflow.Step{Name: "b", Branch: []workflow.Step{
		{Name: "yes", If: &condition, Outputs: []workflow.Binding{bind("chosen", text("yes"))}},
		{Name: "no", Outputs: []workflow.Binding{bind("chosen", text("no"))}},
	}}), Outputs: []workflow.Binding{bind("chosen", outputs("b", "chosen"))}}
	result := f.runner.Run(context.Background(), w, nil)
	want := "no"
	if holds {
		want = "yes"
	}
	if result.Status != workflow.Completed || result.Output.(map[string]any)["chosen"] != want {
		t.Fatalf("result %+v, want chosen %s", result, want)
	}
}
