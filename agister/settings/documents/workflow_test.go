package documents_test

import (
	"reflect"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/settings/documents"
	"github.com/igor1309/ai-labs/gokit/tree"
)

const (
	homeWorkflow   = "/home/.agister/workflows/a.yaml"
	workflowHeader = "schema: agister.workflow/v1alpha1\n"
	// validWorkflow is the workflow of workflow.feature's "A workflow's
	// fields".
	validWorkflow = workflowHeader + `params:
  base: {default: origin/trunk}
inputs:
  base: {source: git.revision, rev: {from: params.base}}
steps:
  - name: reviews
    parallel:
      - {name: tests, process: tests_review, agent: codex, inputs: {base: {from: inputs.base}}}
      - {name: intent, workflow: intent, inputs: {base: {from: inputs.base}}}
  - name: judge
    process: review_judge
    agent: claude-opus
    inputs: {reviews: {from: steps.reviews.outputs}}
  - name: decide
    branch:
      - name: fix
        if: {not: {equals: [{from: steps.judge.outputs.verdict}, approve]}}
        repeat:
          state: {review: {from: steps.judge.outputs}}
          steps:
            - {name: repair, process: implement, agent: codex, inputs: {review: {from: state.review}}}
          next: {review: {from: steps.repair.outputs}}
          until: {all: {in: {from: state.review.findings}, where: {present: {from: item.fixed}}}}
          max: 3
        outputs: {summary: {from: steps.fix.outputs.state.review}}
      - name: done
        process: summarize
        agent: claude-opus
        session: {from: steps.judge.session}
        outputs: {summary: {from: steps.done.outputs.summary}}
outputs:
  summary: {from: steps.decide.outputs.summary}
`
)

// typeWorkflow is the workflow a typed from bytes, decoded in YAML as its
// home file.
func typeWorkflow(t *testing.T, bytes string) (documents.WorkflowDefinition, []documents.Problem) {
	t.Helper()
	root, decoded := tree.Decode(tree.YAML, []byte(bytes), homeWorkflow)
	if len(decoded) > 0 {
		t.Fatalf("%q does not decode: %v", bytes, decoded)
	}
	return documents.TypeWorkflow("a", root)
}

func assertWorkflow(t *testing.T, got, want documents.WorkflowDefinition) {
	t.Helper()
	if !reflect.DeepEqual(got, want) {
		t.Errorf("workflow\n got %+v\nwant %+v", got, want)
	}
}

func assertNoWorkflow(t *testing.T, got documents.WorkflowDefinition) {
	t.Helper()
	if !reflect.DeepEqual(got, documents.WorkflowDefinition{}) {
		t.Errorf("a workflow %+v, want none", got)
	}
}

// inHomeWorkflow is a problem at place of the workflow a's home file, on
// line.
func inHomeWorkflow(line int, place, message string) documents.Problem {
	return documents.Problem{Path: homeWorkflow, Line: line, Place: place, Message: message}
}

// ofWorkflow is value, given by the workflow a's home file, on line, at
// place.
func ofWorkflow[T any](value T, line int, place string) documents.Field[T] {
	return documents.Field[T]{Value: value, Origin: documents.Origin{Path: homeWorkflow, Line: line, Place: place}, Given: true}
}

// binding is the binding at place, name, reading what, on line.
func binding(place, name string, what documents.Reference, line int) documents.Field[documents.Binding] {
	return ofWorkflow(documents.Binding{Name: name, Value: documents.Value{From: what}}, line, place+"."+name)
}

// bindings are the bindings of the map at place, on line.
func bindings(line int, place string, items ...documents.Field[documents.Binding]) documents.Field[[]documents.Field[documents.Binding]] {
	return ofWorkflow(items, line, place)
}

// validWorkflowDefinition is validWorkflow typed: every field it gives,
// each with its value and the origin of its home file, on its line, at its
// place; a name the name alone, a reference what it reads, and its items
// in order.
func validWorkflowDefinition() documents.WorkflowDefinition {
	const (
		fixAt    = "steps[2].branch[0]"
		repeatAt = fixAt + ".repeat"
		repairAt = repeatAt + ".steps[0]"
		untilAt  = repeatAt + ".until"
		doneAt   = "steps[2].branch[1]"
		testsAt  = "steps[0].parallel[0]"
		intentAt = "steps[0].parallel[1]"
	)
	present := documents.Condition{Operator: "present", Reads: ofWorkflow(queryItem("fixed"), 24, untilAt+".all.where.present")}
	equals := documents.Condition{Operator: "equals",
		Reads:  ofWorkflow(outputs("judge", "verdict"), 18, fixAt+".if.not.equals[0]"),
		Equals: ofWorkflow[any]("approve", 18, fixAt+".if.not.equals[1]")}
	fix := documents.Item{
		Name: "fix",
		If: ofWorkflow(documents.Condition{Operator: "not", Of: []documents.Field[documents.Condition]{
			ofWorkflow(equals, 18, fixAt+".if.not"),
		}}, 18, fixAt+".if"),
		Repeat: ofWorkflow(documents.Repeat{
			State: bindings(20, repeatAt+".state", binding(repeatAt+".state", "review", outputs("judge", ""), 20)),
			Steps: ofWorkflow([]documents.Field[documents.Item]{ofWorkflow(documents.Item{
				Name: "repair", Process: ofWorkflow("implement", 22, repairAt+".process"), Agent: ofWorkflow("codex", 22, repairAt+".agent"),
				Inputs: bindings(22, repairAt+".inputs", binding(repairAt+".inputs", "review", state("review", ""), 22)),
			}, 22, repairAt)}, 21, repeatAt+".steps"),
			Next: bindings(23, repeatAt+".next", binding(repeatAt+".next", "review", outputs("repair", ""), 23)),
			Until: ofWorkflow(documents.Condition{Operator: "all", Reads: ofWorkflow(state("review", "findings"), 24, untilAt+".all.in"),
				Of: []documents.Field[documents.Condition]{ofWorkflow(present, 24, untilAt+".all.where")}}, 24, untilAt),
			Max: ofWorkflow(3, 25, repeatAt+".max"),
		}, 19, repeatAt),
		Outputs: bindings(26, fixAt+".outputs", binding(fixAt+".outputs", "summary", outputs("fix", "state", "review"), 26)),
	}
	done := documents.Item{
		Name: "done", Process: ofWorkflow("summarize", 28, doneAt+".process"), Agent: ofWorkflow("claude-opus", 29, doneAt+".agent"),
		Session: ofWorkflow(session("judge"), 30, doneAt+".session"),
		Outputs: bindings(31, doneAt+".outputs", binding(doneAt+".outputs", "summary", outputs("done", "summary"), 31)),
	}
	return documents.WorkflowDefinition{
		Name: "a",
		Params: ofWorkflow([]documents.Field[documents.Param]{
			ofWorkflow(documents.Param{Name: "base", Default: ofWorkflow("origin/trunk", 3, "params.base.default")}, 3, "params.base"),
		}, 2, "params"),
		Inputs: ofWorkflow([]documents.Field[documents.Input]{
			ofWorkflow(documents.Input{Name: "base", Source: ofWorkflow("git.revision", 5, "inputs.base.source"), Arguments: []documents.Field[documents.Binding]{
				binding("inputs.base", "rev", param("base"), 5),
			}}, 5, "inputs.base"),
		}, 4, "inputs"),
		Steps: ofWorkflow([]documents.Field[documents.Item]{
			ofWorkflow(documents.Item{Name: "reviews", Parallel: ofWorkflow([]documents.Field[documents.Item]{
				ofWorkflow(documents.Item{Name: "tests", Process: ofWorkflow("tests_review", 9, testsAt+".process"), Agent: ofWorkflow("codex", 9, testsAt+".agent"),
					Inputs: bindings(9, testsAt+".inputs", binding(testsAt+".inputs", "base", input("base"), 9))}, 9, testsAt),
				ofWorkflow(documents.Item{Name: "intent", Workflow: ofWorkflow("intent", 10, intentAt+".workflow"),
					Inputs: bindings(10, intentAt+".inputs", binding(intentAt+".inputs", "base", input("base"), 10))}, 10, intentAt),
			}, 8, "steps[0].parallel")}, 7, "steps[0]"),
			ofWorkflow(documents.Item{Name: "judge", Process: ofWorkflow("review_judge", 12, "steps[1].process"), Agent: ofWorkflow("claude-opus", 13, "steps[1].agent"),
				Inputs: bindings(14, "steps[1].inputs", binding("steps[1].inputs", "reviews", outputs("reviews", ""), 14))}, 11, "steps[1]"),
			ofWorkflow(documents.Item{Name: "decide", Branch: ofWorkflow([]documents.Field[documents.Item]{
				ofWorkflow(fix, 17, fixAt), ofWorkflow(done, 27, doneAt),
			}, 16, "steps[2].branch")}, 15, "steps[2]"),
		}, 6, "steps"),
		Outputs: bindings(32, "outputs", binding("outputs", "summary", outputs("decide", "summary"), 33)),
	}
}

func workflowsOf(workflows map[string]documents.Document) *documents.Documents {
	return documents.New(documents.Snapshot{Documents: map[documents.Kind]map[string]documents.Document{documents.Workflow: workflows}})
}

// workflow.feature, "A workflow's fields".
func TestAWorkflowsFields(t *testing.T) {
	t.Parallel()
	got, problems := workflowsOf(map[string]documents.Document{"a": {Sources: documents.Sources{Home: source(homeWorkflow, validWorkflow)}}}).Workflow("a")
	assertProblems(t, problems, nil)
	assertWorkflow(t, got, validWorkflowDefinition())
}

// workflow.feature, "A workflow's items each hold what they name": a
// workflow with a field's problem, asked of documents, is no workflow and
// has the problem; one whose tree has problems has its tree's.
func TestDocumentsGivesAWorkflowsProblems(t *testing.T) {
	t.Parallel()
	d := workflowsOf(map[string]documents.Document{
		"a": {Sources: documents.Sources{Home: source(homeWorkflow, strings.Replace(validWorkflow, "max: 3", "max: 0", 1))}},
		"b": {Sources: documents.Sources{Home: source("/home/.agister/workflows/b.yaml", "x: [1")}},
	})
	got, problems := d.Workflow("a")
	assertNoWorkflow(t, got)
	assertProblems(t, problems, []documents.Problem{inHomeWorkflow(25, "steps[2].branch[0].repeat.max", "it is at least 1")})
	_, want := d.Tree(documents.Workflow, "b")
	if len(want) == 0 {
		t.Fatal("the workflow b's tree has no problem")
	}
	got, problems = d.Workflow("b")
	assertNoWorkflow(t, got)
	assertProblems(t, problems, want)
}

// pathsWorkflow is a workflow each of whose kinds of reference reads a
// path within an output field: a step's, a parallel's item's and a repeat's
// step's inputs, an arm's condition, inputs and outputs, a repeat's state,
// next state and until, and the workflow's outputs.
const pathsWorkflow = workflowHeader + `steps:
  - {name: a, process: p, agent: x, inputs: {what: {from: steps.a.outputs.stdout.head}}}
  - name: both
    parallel:
      - {name: b, process: p, agent: x, inputs: {what: {from: steps.a.outputs.stdout.head}}}
  - name: pick
    branch:
      - name: c
        if: {not: {present: {from: steps.a.outputs.stdout.head}}}
        process: p
        agent: x
        inputs: {what: {from: steps.a.outputs.stdout.head}}
        outputs: {said: {from: steps.c.outputs.stdout.head}}
      - name: loop
        repeat:
          state: {last: {from: steps.a.outputs.stdout.head}}
          steps:
            - {name: d, process: p, agent: x, inputs: {what: {from: steps.a.outputs.stdout.head}}}
          next: {last: {from: steps.d.outputs.stdout.head}}
          until: {equals: [{from: steps.d.outputs.stdout.tail}, done]}
          max: 2
        outputs: {said: {from: steps.d.outputs.stdout.head}}
outputs:
  said: {from: steps.a.outputs.stdout.head}
`

// A workflow given is the caller's own: changing any slice of it, at any
// depth, a reference's path included, changes nothing the documents hold,
// and the next call gives what documents of their own, over the same file,
// give.
func TestAWorkflowGivenIsTheCallersOwn(t *testing.T) {
	t.Parallel()
	decide := func(w *documents.WorkflowDefinition) *documents.Item { return &w.Steps.Value[2].Value }
	fix := func(w *documents.WorkflowDefinition) *documents.Item { return &decide(w).Branch.Value[0].Value }
	pick := func(w *documents.WorkflowDefinition, arm int) *documents.Item {
		return &w.Steps.Value[2].Value.Branch.Value[arm].Value
	}
	loop := func(w *documents.WorkflowDefinition) *documents.Repeat { return &pick(w, 1).Repeat.Value }
	path := func(binding *documents.Field[documents.Binding]) []string { return binding.Value.Value.From.Path }
	cases := []struct {
		name     string
		workflow string
		change   func(*documents.WorkflowDefinition)
	}{
		{"its params", validWorkflow, func(w *documents.WorkflowDefinition) { w.Params.Value[0].Value.Name = "x" }},
		{"its inputs", validWorkflow, func(w *documents.WorkflowDefinition) { w.Inputs.Value[0].Value.Arguments[0].Value.Name = "x" }},
		{"its outputs", validWorkflow, func(w *documents.WorkflowDefinition) { w.Outputs.Value[0].Value.Name = "x" }},
		{"its steps", validWorkflow, func(w *documents.WorkflowDefinition) { w.Steps.Value[0].Value.Name = "x" }},
		{"a parallel's items", validWorkflow, func(w *documents.WorkflowDefinition) { w.Steps.Value[0].Value.Parallel.Value[0].Value.Name = "x" }},
		{"a step's inputs", validWorkflow, func(w *documents.WorkflowDefinition) { w.Steps.Value[1].Value.Inputs.Value[0].Value.Name = "x" }},
		{"a branch's arms", validWorkflow, func(w *documents.WorkflowDefinition) { decide(w).Branch.Value[1].Value.Name = "x" }},
		{"an arm's outputs", validWorkflow, func(w *documents.WorkflowDefinition) { fix(w).Outputs.Value[0].Value.Name = "x" }},
		{"a condition's conditions", validWorkflow, func(w *documents.WorkflowDefinition) { fix(w).If.Value.Of[0].Value.Operator = "x" }},
		{"a repeat's state", validWorkflow, func(w *documents.WorkflowDefinition) { fix(w).Repeat.Value.State.Value[0].Value.Name = "x" }},
		{"a repeat's steps", validWorkflow, func(w *documents.WorkflowDefinition) { fix(w).Repeat.Value.Steps.Value[0].Value.Name = "x" }},
		{"a repeat's next state", validWorkflow, func(w *documents.WorkflowDefinition) { fix(w).Repeat.Value.Next.Value[0].Value.Name = "x" }},
		{"a repeat's until", validWorkflow, func(w *documents.WorkflowDefinition) { fix(w).Repeat.Value.Until.Value.Of[0].Value.Operator = "x" }},
		{"the path of its outputs", pathsWorkflow, func(w *documents.WorkflowDefinition) { path(&w.Outputs.Value[0])[0] = "x" }},
		{"the path of a step's inputs", pathsWorkflow, func(w *documents.WorkflowDefinition) { path(&w.Steps.Value[0].Value.Inputs.Value[0])[0] = "x" }},
		{"the path of a parallel's item's inputs", pathsWorkflow, func(w *documents.WorkflowDefinition) {
			path(&w.Steps.Value[1].Value.Parallel.Value[0].Value.Inputs.Value[0])[0] = "x"
		}},
		{"the path of an arm's condition", pathsWorkflow, func(w *documents.WorkflowDefinition) {
			pick(w, 0).If.Value.Of[0].Value.Reads.Value.Path[0] = "x"
		}},
		{"the path of an arm's inputs", pathsWorkflow, func(w *documents.WorkflowDefinition) { path(&pick(w, 0).Inputs.Value[0])[0] = "x" }},
		{"the path of an arm's outputs", pathsWorkflow, func(w *documents.WorkflowDefinition) { path(&pick(w, 0).Outputs.Value[0])[0] = "x" }},
		{"the path of a repeat's state", pathsWorkflow, func(w *documents.WorkflowDefinition) { path(&loop(w).State.Value[0])[0] = "x" }},
		{"the path of a repeat's step's inputs", pathsWorkflow, func(w *documents.WorkflowDefinition) {
			path(&loop(w).Steps.Value[0].Value.Inputs.Value[0])[0] = "x"
		}},
		{"the path of a repeat's next state", pathsWorkflow, func(w *documents.WorkflowDefinition) { path(&loop(w).Next.Value[0])[0] = "x" }},
		{"the path of a repeat's until", pathsWorkflow, func(w *documents.WorkflowDefinition) { loop(w).Until.Value.Reads.Value.Path[0] = "x" }},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			of := func() *documents.Documents {
				return workflowsOf(map[string]documents.Document{"a": {Sources: documents.Sources{Home: source(homeWorkflow, c.workflow)}}})
			}
			want, problems := of().Workflow("a")
			assertProblems(t, problems, nil)
			d := of()
			gotten, _ := d.Workflow("a")
			c.change(&gotten)
			got, problems := d.Workflow("a")
			assertProblems(t, problems, nil)
			assertWorkflow(t, got, want)
		})
	}
}

// workflow.feature, "A workflow needs its steps".
func TestAWorkflowNeedsItsSteps(t *testing.T) {
	t.Parallel()
	got, problems := typeWorkflow(t, workflowHeader)
	assertNoWorkflow(t, got)
	assertProblems(t, problems, []documents.Problem{missing("steps")})
}

// workflow.feature, "A workflow's items each hold what they name": each
// fault, in a valid workflow, is the workflow's one problem.
func TestAWorkflowsItemsEachHoldWhatTheyName(t *testing.T) {
	t.Parallel()
	const anyOf = "it is a step, a workflow, a parallel, a branch or a repeat"
	cases := []struct {
		fault    string
		old, new string
		want     documents.Problem
	}{
		{"the steps []", validWorkflow[len(workflowHeader):], "steps: []\n", inHomeWorkflow(2, "steps", "it has an item")},
		{"an item with no name", "  - name: judge\n    process", "  - process", missing("steps[1].name")},
		{"a second item named judge", "name: decide", "name: judge", inHomeWorkflow(15, "steps[2].name", "no other item of its workflow has it")},
		{"an item with a process and a workflow", "    process: review_judge\n", "    process: review_judge\n    workflow: x\n",
			inHomeWorkflow(11, "steps[1]", anyOf)},
		{"an item of its name alone", "    process: review_judge\n    agent: claude-opus\n    inputs: {reviews: {from: steps.reviews.outputs}}\n", "",
			inHomeWorkflow(11, "steps[1]", anyOf)},
		{"a step with no agent", "    agent: claude-opus\n", "", missing("steps[1].agent")},
		{"the process agent:x", "process: review_judge", "process: agent:x", inHomeWorkflow(12, "steps[1].process", "it names a process")},
		{"the binding {from: outputs.x}", "{from: steps.reviews.outputs}", "{from: outputs.x}",
			inHomeWorkflow(14, "steps[1].inputs.reviews", "it reads params.<name>, inputs.<name>, state.<name>[.<field>] or steps.<name>.<part>")},
		{"a last arm with an if", "      - name: done\n", "      - name: done\n        if: {present: {from: inputs.base}}\n",
			inHomeWorkflow(28, "steps[2].branch[1].if", "the last arm is the default, with no if")},
		{"an arm with no outputs", "        outputs: {summary: {from: steps.done.outputs.summary}}\n", "", missing("steps[2].branch[1].outputs")},
		{"the condition {same: [a, b]}", "{not: {equals: [{from: steps.judge.outputs.verdict}, approve]}}", "{same: [a, b]}",
			inHomeWorkflow(18, "steps[2].branch[0].if", "it has one operator of equals, present, all, any, and, or, not")},
		{"the condition {equals: [a]}", "{not: {equals: [{from: steps.judge.outputs.verdict}, approve]}}", "{equals: [a]}",
			inHomeWorkflow(18, "steps[2].branch[0].if.equals", "it is a reference and a value")},
		{"the condition {and: []}", "{not: {equals: [{from: steps.judge.outputs.verdict}, approve]}}", "{and: []}",
			inHomeWorkflow(18, "steps[2].branch[0].if.and", "it is a list of conditions, one or more")},
		{"a repeat of max 0", "max: 3", "max: 0", inHomeWorkflow(25, "steps[2].branch[0].repeat.max", "it is at least 1")},
		{"a repeat with no until", "          until: {all: {in: {from: state.review.findings}, where: {present: {from: item.fixed}}}}\n", "",
			missing("steps[2].branch[0].repeat.until")},
	}
	for _, c := range cases {
		t.Run(c.fault, func(t *testing.T) {
			t.Parallel()
			if !strings.Contains(validWorkflow, c.old) {
				t.Fatalf("the valid workflow has no %q", c.old)
			}
			got, problems := typeWorkflow(t, strings.Replace(validWorkflow, c.old, c.new, 1))
			assertNoWorkflow(t, got)
			assertProblems(t, problems, []documents.Problem{c.want})
		})
	}
}

// Every problem of a workflow's fields is reported, nested or not, in the
// order its fields are read: each bad item of every list of items or
// conditions, and the fields no kind knows of an item after its own.
func TestEveryWorkflowFieldProblemIsReported(t *testing.T) {
	t.Parallel()
	got, problems := typeWorkflow(t, workflowHeader+`steps:
  - x
  - {name: a, workflow: w, agent: b}
  - name: b
    parallel:
      - {name: c, process: p}
      - {name: a, process: p, agent: b, inputs: {x: [1]}}
  - name: d
    branch:
      - {name: e, process: p, agent: b, if: {or: [x, {equals: [{from: y.z}, [1]]}, {present: {from: state.s}}]}, outputs: {}}
      - {name: f, process: p, agent: b, outputs: {x: {from: steps.e.outputs.x}}}
colour: red
`)
	assertNoWorkflow(t, got)
	assertProblems(t, problems, []documents.Problem{
		inHomeWorkflow(3, "steps[0]", "it is a map, not a string"),
		inHomeWorkflow(4, "steps[1].agent", "the field is not known"),
		missing("steps[2].parallel[0].agent"),
		inHomeWorkflow(8, "steps[2].parallel[1].name", "no other item of its workflow has it"),
		inHomeWorkflow(8, "steps[2].parallel[1].inputs.x", "it is a string, or a reference"),
		inHomeWorkflow(11, "steps[3].branch[0].if.or[0]", "it is a map, not a string"),
		inHomeWorkflow(11, "steps[3].branch[0].if.or[1].equals", "it is a reference and a value"),
		inHomeWorkflow(13, "colour", "the field is not known"),
	})
}

// workflow.feature, "A workflow's fields": a condition of each operator is
// typed whole: its operator, what its reference reads, its value, and its
// conditions.
func TestAConditionOfEachOperator(t *testing.T) {
	t.Parallel()
	type conditions = []documents.Field[documents.Condition]
	// The arm's condition is at if; each condition in it at its place.
	const if0 = "steps[0].branch[0].if"
	present := func(place string, what documents.Reference) documents.Field[documents.Condition] {
		return ofWorkflow(documents.Condition{Operator: "present", Reads: ofWorkflow(what, 3, place+".present")}, 3, place)
	}
	equals := func(what documents.Reference, value any) documents.Condition {
		return documents.Condition{Operator: "equals", Reads: ofWorkflow(what, 3, if0+".equals[0]"), Equals: ofWorkflow(value, 3, if0+".equals[1]")}
	}
	cases := []struct {
		condition string
		want      documents.Condition
	}{
		{"{equals: [{from: steps.x.outputs.verdict}, approve]}", equals(outputs("x", "verdict"), "approve")},
		{"{equals: [{from: steps.x.outputs.code}, 0]}", equals(outputs("x", "code"), int64(0))},
		{"{equals: [{from: steps.x.outputs.ok}, true]}", equals(outputs("x", "ok"), true)},
		{"{present: {from: inputs.a}}", present(if0, input("a")).Value},
		{"{all: {in: {from: steps.x.outputs.items}, where: {present: {from: item.ok}}}}",
			documents.Condition{Operator: "all", Reads: ofWorkflow(outputs("x", "items"), 3, if0+".all.in"),
				Of: conditions{present(if0+".all.where", queryItem("ok"))}}},
		{"{any: {in: {from: steps.x.outputs.items}, where: {present: {from: item.ok}}}}",
			documents.Condition{Operator: "any", Reads: ofWorkflow(outputs("x", "items"), 3, if0+".any.in"),
				Of: conditions{present(if0+".any.where", queryItem("ok"))}}},
		{"{and: [{present: {from: inputs.a}}, {present: {from: params.b}}]}",
			documents.Condition{Operator: "and", Of: conditions{present(if0+".and[0]", input("a")), present(if0+".and[1]", param("b"))}}},
		{"{or: [{present: {from: inputs.a}}, {present: {from: params.b}}]}",
			documents.Condition{Operator: "or", Of: conditions{present(if0+".or[0]", input("a")), present(if0+".or[1]", param("b"))}}},
		{"{not: {present: {from: state.s}}}", documents.Condition{Operator: "not", Of: conditions{present(if0+".not", state("s", ""))}}},
	}
	for _, c := range cases {
		t.Run(c.condition, func(t *testing.T) {
			t.Parallel()
			got, problems := typeWorkflow(t, workflowHeader+"steps:\n"+
				"  - {name: a, branch: [{name: b, process: p, agent: x, outputs: {}, if: "+c.condition+"}, {name: c, process: p, agent: x, outputs: {}}]}\n")
			assertProblems(t, problems, nil)
			if len(got.Steps.Value) == 0 {
				t.Fatal("no step")
			}
			if condition := got.Steps.Value[0].Value.Branch.Value[0].Value.If; !reflect.DeepEqual(condition, ofWorkflow(c.want, 3, if0)) {
				t.Errorf("condition\n got %+v\nwant %+v", condition, ofWorkflow(c.want, 3, if0))
			}
		})
	}
}
