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
        outputs: {summary: {from: steps.fix.outputs.review}}
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

// ofWorkflow is value, given by the workflow a's home file, on line.
func ofWorkflow[T any](value T, line int) documents.Field[T] {
	return documents.Field[T]{Value: value, Origin: documents.Origin{Path: homeWorkflow, Line: line}, Given: true}
}

// binding is the binding name, reading what, on line.
func binding(name, what string, line int) documents.Field[documents.Binding] {
	return ofWorkflow(documents.Binding{Name: name, Value: documents.Value{From: what}}, line)
}

// bindings are the bindings of a map on line.
func bindings(line int, items ...documents.Field[documents.Binding]) documents.Field[[]documents.Field[documents.Binding]] {
	return ofWorkflow(items, line)
}

// validWorkflowDefinition is validWorkflow typed: every field it gives,
// each with its value and the origin of its home file, on its line; a name
// the name alone, a reference what it reads, and its items in order.
func validWorkflowDefinition() documents.WorkflowDefinition {
	present := documents.Condition{Operator: "present", Reads: ofWorkflow("item.fixed", 24)}
	equals := documents.Condition{Operator: "equals", Reads: ofWorkflow("steps.judge.outputs.verdict", 18), Equals: ofWorkflow[any]("approve", 18)}
	fix := documents.Item{
		Name: "fix",
		If:   ofWorkflow(documents.Condition{Operator: "not", Of: []documents.Field[documents.Condition]{ofWorkflow(equals, 18)}}, 18),
		Repeat: ofWorkflow(documents.Repeat{
			State: bindings(20, binding("review", "steps.judge.outputs", 20)),
			Steps: ofWorkflow([]documents.Field[documents.Item]{ofWorkflow(documents.Item{
				Name: "repair", Process: ofWorkflow("implement", 22), Agent: ofWorkflow("codex", 22),
				Inputs: bindings(22, binding("review", "state.review", 22)),
			}, 22)}, 21),
			Next: bindings(23, binding("review", "steps.repair.outputs", 23)),
			Until: ofWorkflow(documents.Condition{Operator: "all", Reads: ofWorkflow("state.review.findings", 24),
				Of: []documents.Field[documents.Condition]{ofWorkflow(present, 24)}}, 24),
			Max: ofWorkflow(3, 25),
		}, 19),
		Outputs: bindings(26, binding("summary", "steps.fix.outputs.review", 26)),
	}
	done := documents.Item{
		Name: "done", Process: ofWorkflow("summarize", 28), Agent: ofWorkflow("claude-opus", 29),
		Session: ofWorkflow("steps.judge.session", 30),
		Outputs: bindings(31, binding("summary", "steps.done.outputs.summary", 31)),
	}
	return documents.WorkflowDefinition{
		Name: "a",
		Params: ofWorkflow([]documents.Field[documents.Param]{
			ofWorkflow(documents.Param{Name: "base", Default: ofWorkflow("origin/trunk", 3)}, 3),
		}, 2),
		Inputs: ofWorkflow([]documents.Field[documents.Input]{
			ofWorkflow(documents.Input{Name: "base", Source: ofWorkflow("git.revision", 5), Arguments: []documents.Field[documents.Binding]{
				binding("rev", "params.base", 5),
			}}, 5),
		}, 4),
		Steps: ofWorkflow([]documents.Field[documents.Item]{
			ofWorkflow(documents.Item{Name: "reviews", Parallel: ofWorkflow([]documents.Field[documents.Item]{
				ofWorkflow(documents.Item{Name: "tests", Process: ofWorkflow("tests_review", 9), Agent: ofWorkflow("codex", 9),
					Inputs: bindings(9, binding("base", "inputs.base", 9))}, 9),
				ofWorkflow(documents.Item{Name: "intent", Workflow: ofWorkflow("intent", 10),
					Inputs: bindings(10, binding("base", "inputs.base", 10))}, 10),
			}, 8)}, 7),
			ofWorkflow(documents.Item{Name: "judge", Process: ofWorkflow("review_judge", 12), Agent: ofWorkflow("claude-opus", 13),
				Inputs: bindings(14, binding("reviews", "steps.reviews.outputs", 14))}, 11),
			ofWorkflow(documents.Item{Name: "decide", Branch: ofWorkflow([]documents.Field[documents.Item]{
				ofWorkflow(fix, 17), ofWorkflow(done, 27),
			}, 16)}, 15),
		}, 6),
		Outputs: bindings(32, binding("summary", "steps.decide.outputs.summary", 33)),
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

// A workflow given is the caller's own: changing any slice of it, at any
// depth, changes nothing the documents hold, and the next call gives the
// workflow as typed.
func TestAWorkflowGivenIsTheCallersOwn(t *testing.T) {
	t.Parallel()
	decide := func(w *documents.WorkflowDefinition) *documents.Item { return &w.Steps.Value[2].Value }
	fix := func(w *documents.WorkflowDefinition) *documents.Item { return &decide(w).Branch.Value[0].Value }
	cases := []struct {
		name   string
		change func(*documents.WorkflowDefinition)
	}{
		{"its params", func(w *documents.WorkflowDefinition) { w.Params.Value[0].Value.Name = "x" }},
		{"its inputs", func(w *documents.WorkflowDefinition) { w.Inputs.Value[0].Value.Arguments[0].Value.Name = "x" }},
		{"its outputs", func(w *documents.WorkflowDefinition) { w.Outputs.Value[0].Value.Name = "x" }},
		{"its steps", func(w *documents.WorkflowDefinition) { w.Steps.Value[0].Value.Name = "x" }},
		{"a parallel's items", func(w *documents.WorkflowDefinition) { w.Steps.Value[0].Value.Parallel.Value[0].Value.Name = "x" }},
		{"a step's inputs", func(w *documents.WorkflowDefinition) { w.Steps.Value[1].Value.Inputs.Value[0].Value.Name = "x" }},
		{"a branch's arms", func(w *documents.WorkflowDefinition) { decide(w).Branch.Value[1].Value.Name = "x" }},
		{"an arm's outputs", func(w *documents.WorkflowDefinition) { fix(w).Outputs.Value[0].Value.Name = "x" }},
		{"a condition's conditions", func(w *documents.WorkflowDefinition) { fix(w).If.Value.Of[0].Value.Operator = "x" }},
		{"a repeat's state", func(w *documents.WorkflowDefinition) { fix(w).Repeat.Value.State.Value[0].Value.Name = "x" }},
		{"a repeat's steps", func(w *documents.WorkflowDefinition) { fix(w).Repeat.Value.Steps.Value[0].Value.Name = "x" }},
		{"a repeat's next state", func(w *documents.WorkflowDefinition) { fix(w).Repeat.Value.Next.Value[0].Value.Name = "x" }},
		{"a repeat's until", func(w *documents.WorkflowDefinition) { fix(w).Repeat.Value.Until.Value.Of[0].Value.Operator = "x" }},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			d := workflowsOf(map[string]documents.Document{"a": {Sources: documents.Sources{Home: source(homeWorkflow, validWorkflow)}}})
			gotten, _ := d.Workflow("a")
			c.change(&gotten)
			got, problems := d.Workflow("a")
			assertProblems(t, problems, nil)
			assertWorkflow(t, got, validWorkflowDefinition())
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
			inHomeWorkflow(14, "steps[1].inputs.reviews", "it reads params.<name>, inputs.<name>, state.<name> or steps.<name>")},
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
