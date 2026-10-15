package resolve_test

import (
	"fmt"
	"testing"

	"github.com/igor1309/ai-labs/agister/settings/resolve"
)

// boundaries.feature, "A step binds the params its process declares" and
// "A step binds every param of no default".
func TestAStepBindsTheParamsItsProcessDeclares(t *testing.T) {
	t.Parallel()
	params := []resolve.Param{{Name: "base"}, {Name: "goal", Default: true}}
	for name, test := range map[string]struct {
		bindings []resolve.Binding
		problem  resolve.Problem
	}{
		"one it does not declare": {
			[]resolve.Binding{{Name: "base", Text: "main"}, from("head", "params.head", 5)},
			problemOfW(5, "steps[0].inputs.head", `the process "p" declares the param "head"`),
		},
		"none of no default": {
			nil,
			problemOfW(4, "steps[0]", `it binds the param "base" of the process "p", which has no default`),
		},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			item := reading("p", test.bindings...)
			item.Origin = resolve.Origin{Path: homeW, Line: 4}
			s := newSource()
			s.processes["p"] = resolve.Process{Name: "p", Params: params}
			s.workflows["w"] = resolve.Workflow{Params: []resolve.Param{{Name: "head", Default: true}}}
			withSteps(s, item)
			assertProblemsOf(t, s, requestW, resolve.KindWorkflow, "w", test.problem)
		})
	}
}

// boundaries.feature, "A workflow item binds the params its workflow
// declares".
func TestAWorkflowItemBindsTheParamsItsWorkflowDeclares(t *testing.T) {
	t.Parallel()
	s := withSteps(newSource(), resolve.Item{
		Name: "child", Origin: resolve.Origin{Path: homeW, Line: 4}, Workflow: resolve.Name{Value: "c"},
		Inputs: []resolve.Binding{{Name: "head", Text: "HEAD", Origin: resolve.Origin{Path: homeW, Line: 5}}},
	})
	s.workflows["c"] = resolve.Workflow{Name: "c", Params: []resolve.Param{{Name: "base"}}, Steps: []resolve.Item{reading("t")}}
	s.processes["t"] = resolve.Process{Name: "t"}
	assertProblemsOf(t, s, requestW, resolve.KindWorkflow, "w",
		problemOfW(5, "steps[0].inputs.head", `the workflow "c" declares the param "head"`),
		problemOfW(4, "steps[0]", `it binds the param "base" of the workflow "c", which has no default`))
}

// boundaries.feature, "A child workflow is read through its outputs".
func TestAChildWorkflowIsReadThroughItsOutputs(t *testing.T) {
	t.Parallel()
	s := withSteps(newSource(), resolve.Item{Name: "child", Workflow: resolve.Name{Value: "c"}},
		reading("use", from("verdict", "steps.child.outputs.verdict", 5), from("summary", "steps.child.outputs.summary", 6)))
	s.workflows["c"] = resolve.Workflow{Name: "c", Steps: []resolve.Item{reading("t")},
		Outputs: []resolve.Binding{{Name: "verdict", From: "steps.t.outputs.verdict"}}}
	s.processes["t"] = resolve.Process{Name: "t"}
	assertProblemsOf(t, s, requestW, resolve.KindWorkflow, "w",
		problemOfW(6, "steps[1].inputs.summary", `the workflow "c" gives the output "summary"`))
}

// boundaries.feature, "Every arm of a branch gives the branch's outputs".
func TestEveryArmOfABranchGivesTheBranchsOutputs(t *testing.T) {
	t.Parallel()
	arm := func(name string, line int, outputs ...string) resolve.Item {
		item := reading(name)
		item.Origin = resolve.Origin{Path: homeW, Line: line}
		for _, output := range outputs {
			item.Outputs = append(item.Outputs, from(output, fmt.Sprintf("steps.%s.outputs.%s", name, output), line))
		}
		return item
	}
	for name, test := range map[string]struct {
		fix, done []string
		line      int
		place     string
	}{
		"the later arm gives less":   {[]string{"summary", "diff"}, []string{"summary"}, 8, "steps[0].branch[1].outputs"},
		"the earlier arm gives less": {[]string{"summary"}, []string{"summary", "diff"}, 4, "steps[0].branch[0].outputs"},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			fix := arm("fix", 4, test.fix...)
			fix.If = resolve.Condition{Reads: []resolve.Name{{Value: "params.base"}}}
			s := newSource()
			s.workflows["w"] = resolve.Workflow{Params: []resolve.Param{{Name: "base", Default: true}}}
			withSteps(s, resolve.Item{Name: "decide", Branch: []resolve.Item{fix, arm("done", 8, test.done...)}})
			assertProblemsOf(t, s, requestW, resolve.KindWorkflow, "w",
				problemOfW(test.line, test.place, `it gives the output "diff", as another arm of its branch does`))
		})
	}
}

// boundaries.feature, "The request gives the params its workflow
// declares".
func TestTheRequestGivesTheParamsItsWorkflowDeclares(t *testing.T) {
	t.Parallel()
	s := newSource()
	s.workflows["w"] = resolve.Workflow{Params: []resolve.Param{{Name: "base"}}}
	withSteps(s, reading("s"))

	got, faults := newResolver(t, s).Resolve(requestW.WithParams("head"))

	assertFaults(t, got, faults, resolve.Fault{Problems: []resolve.Problem{
		{Message: `the request gives the param "base", which has no default`},
		{Message: `the workflow declares the param "head"`},
	}})
}

// boundaries.feature, "A step requested alone takes its process's params".
func TestAStepRequestedAloneTakesItsProcesssParams(t *testing.T) {
	t.Parallel()
	s := newSource()
	s.processes["p"] = resolve.Process{Name: "p", Params: []resolve.Param{{Name: "base"}}}
	s.pair("a", "r")
	resolver := newResolver(t, s)

	t.Run("with the param", func(t *testing.T) {
		t.Parallel()
		_, faults := resolver.Resolve(resolve.Step("p", "a").WithParams("base"))
		assertResolved(t, faults)
	})
	t.Run("with no param", func(t *testing.T) {
		t.Parallel()
		got, faults := resolver.Resolve(resolve.Step("p", "a"))
		assertFaults(t, got, faults, resolve.Fault{Problems: []resolve.Problem{
			{Message: `the request gives the param "base", which has no default`},
		}})
	})
}
