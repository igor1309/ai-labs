package documents_test

import (
	"fmt"
	"reflect"
	"testing"

	"github.com/igor1309/ai-labs/agister/settings/documents"
)

// param is a reference to the param name.
func param(name string) documents.Reference {
	return documents.Reference{Root: documents.ReadsParam, Name: name}
}

// input is a reference to the input name.
func input(name string) documents.Reference {
	return documents.Reference{Root: documents.ReadsInput, Name: name}
}

// state is a reference to the state name, or its field, "" for the whole.
func state(name, field string) documents.Reference {
	return documents.Reference{Root: documents.ReadsState, Name: name, Field: field}
}

// outputs is a reference to the outputs of the item name, or their field,
// "" for the whole.
func outputs(name, field string) documents.Reference {
	return documents.Reference{Root: documents.ReadsOutputs, Name: name, Field: field}
}

// session is a reference to the session of the item name.
func session(name string) documents.Reference {
	return documents.Reference{Root: documents.ReadsSession, Name: name}
}

// queryItem is a reference to the item of a query, or its field, "" for
// the whole.
func queryItem(field string) documents.Reference {
	return documents.Reference{Root: documents.ReadsItem, Field: field}
}

const (
	// workflowReading is a workflow whose output o reads what is put in
	// %s, on line 5.
	workflowReading = workflowHeader + `steps:
  - {name: a, process: p, agent: x}
outputs:
  o: {from: %s}
`
	// processReading is a process whose environment's HEAD reads what is
	// put in %s, on line 3.
	processReading = `schema: agister.process/v1alpha1
environment:
  HEAD: {from: %s}
`
	// workflowRepeating is a workflow whose first step is a repeat until all
	// of state.findings where the condition put in %s holds, on line 9.
	workflowRepeating = workflowHeader + `steps:
  - name: r
    repeat:
      state: {findings: {from: params.x}}
      steps:
        - {name: a, process: p, agent: x}
      next: {findings: {from: steps.a.outputs}}
      until: {all: {in: {from: state.findings}, where: %s}}
      max: 2
`
	// workflowBranching is a workflow whose first step is a branch whose
	// first arm's condition is put in %s, on line 5.
	workflowBranching = workflowHeader + `steps:
  - name: b
    branch:
      - {name: x, process: p, agent: a, outputs: {}, if: %s}
      - {name: y, process: p, agent: a, outputs: {}}
`
)

// references.feature, "A reference gives what it reads".
func TestAReferenceGivesWhatItReads(t *testing.T) {
	t.Parallel()
	cases := []struct {
		reads string
		want  documents.Reference
	}{
		{"params.base", param("base")},
		{"inputs.base", input("base")},
		{"state.review", state("review", "")},
		{"state.review.x", state("review", "x")},
		{"steps.a.outputs", outputs("a", "")},
		{"steps.a.outputs.v", outputs("a", "v")},
		{"steps.a.session", session("a")},
	}
	for _, c := range cases {
		t.Run(c.reads, func(t *testing.T) {
			t.Parallel()
			got, problems := typeWorkflow(t, fmt.Sprintf(workflowReading, c.reads))
			assertProblems(t, problems, nil)
			if want := bindings(4, "outputs", binding("outputs", "o", c.want, 5)); !reflect.DeepEqual(got.Outputs, want) {
				t.Errorf("outputs\n got %+v\nwant %+v", got.Outputs, want)
			}
		})
	}
}

// references.feature, "A reference that reads none of these is a
// problem": the feature's cases, and each root's form with a part too few
// or too many, or a part of none of its forms.
func TestAReferenceThatReadsNoneOfTheseIsAProblem(t *testing.T) {
	t.Parallel()
	const (
		workflowRoots = "it reads params.<name>, inputs.<name>, state.<name>[.<field>] or steps.<name>.<part>"
		processRoots  = "it reads params.<name> or inputs.<name>"
	)
	cases := []struct {
		document, reads string
		want            documents.Problem
	}{
		{workflowReading, "params.base.x", inHomeWorkflow(5, "outputs.o", workflowRoots)},
		{workflowReading, "state.review.x.y", inHomeWorkflow(5, "outputs.o", workflowRoots)},
		{workflowReading, "steps.a", inHomeWorkflow(5, "outputs.o", workflowRoots)},
		{workflowReading, "steps.a.outputs.v.w", inHomeWorkflow(5, "outputs.o", workflowRoots)},
		{processReading, "state.review", inHomeProcess(3, "environment.HEAD", processRoots)},
		{processReading, "params.base.x", inHomeProcess(3, "environment.HEAD", processRoots)},
		{workflowReading, "params", inHomeWorkflow(5, "outputs.o", workflowRoots)},
		{workflowReading, "inputs.base.x", inHomeWorkflow(5, "outputs.o", workflowRoots)},
		{workflowReading, "state", inHomeWorkflow(5, "outputs.o", workflowRoots)},
		{workflowReading, "state..x", inHomeWorkflow(5, "outputs.o", workflowRoots)},
		{workflowReading, "steps.a.status", inHomeWorkflow(5, "outputs.o", workflowRoots)},
		{workflowReading, "steps.a.session.x", inHomeWorkflow(5, "outputs.o", workflowRoots)},
		{workflowReading, "outputs.a", inHomeWorkflow(5, "outputs.o", workflowRoots)},
		{processReading, "steps.a.outputs", inHomeProcess(3, "environment.HEAD", processRoots)},
		{processReading, "item", inHomeProcess(3, "environment.HEAD", processRoots)},
	}
	for _, c := range cases {
		t.Run(c.reads, func(t *testing.T) {
			t.Parallel()
			var problems []documents.Problem
			if c.document == processReading {
				_, problems = typeProcess(t, fmt.Sprintf(c.document, c.reads))
			} else {
				_, problems = typeWorkflow(t, fmt.Sprintf(c.document, c.reads))
			}
			assertProblems(t, problems, []documents.Problem{c.want})
		})
	}
}

// references.feature, "The item of a query is read in the query's where":
// the feature's cases, and the item read at any depth of the where, a
// nested query's in among it.
func TestTheItemOfAQueryIsReadInTheQuerysWhere(t *testing.T) {
	t.Parallel()
	const roots = "it reads item[.<field>], params.<name>, inputs.<name>, state.<name>[.<field>] or steps.<name>.<part>"
	// The where is at where; each condition in it at its place.
	const where = "steps[0].repeat.until.all.where"
	present := func(place string, what documents.Reference) documents.Field[documents.Condition] {
		return ofWorkflow(documents.Condition{Operator: "present", Reads: ofWorkflow(what, 9, place+".present")}, 9, place)
	}
	cases := []struct {
		where string
		want  documents.Field[documents.Condition]
	}{
		{"{present: {from: item}}", present(where, queryItem(""))},
		{"{present: {from: item.fixed}}", present(where, queryItem("fixed"))},
		{"{not: {present: {from: item}}}", ofWorkflow(documents.Condition{Operator: "not",
			Of: []documents.Field[documents.Condition]{present(where+".not", queryItem(""))}}, 9, where)},
		{"{equals: [{from: item.verdict}, approve]}", ofWorkflow(documents.Condition{Operator: "equals",
			Reads: ofWorkflow(queryItem("verdict"), 9, where+".equals[0]"), Equals: ofWorkflow[any]("approve", 9, where+".equals[1]")}, 9, where)},
		{"{any: {in: {from: item.notes}, where: {present: {from: item}}}}", ofWorkflow(documents.Condition{Operator: "any",
			Reads: ofWorkflow(queryItem("notes"), 9, where+".any.in"),
			Of:    []documents.Field[documents.Condition]{present(where+".any.where", queryItem(""))}}, 9, where)},
	}
	for _, c := range cases {
		t.Run(c.where, func(t *testing.T) {
			t.Parallel()
			got, problems := typeWorkflow(t, fmt.Sprintf(workflowRepeating, c.where))
			assertProblems(t, problems, nil)
			if len(got.Steps.Value) == 0 {
				t.Fatal("no step")
			}
			if where := got.Steps.Value[0].Value.Repeat.Value.Until.Value.Of[0]; !reflect.DeepEqual(where, c.want) {
				t.Errorf("where\n got %+v\nwant %+v", where, c.want)
			}
		})
	}
	t.Run("item.a.b", func(t *testing.T) {
		t.Parallel()
		got, problems := typeWorkflow(t, fmt.Sprintf(workflowRepeating, "{present: {from: item.a.b}}"))
		assertNoWorkflow(t, got)
		assertProblems(t, problems, []documents.Problem{inHomeWorkflow(9, "steps[0].repeat.until.all.where.present", roots)})
	})
}

// references.feature, "The item read outside a query's where is a
// problem": the feature's cases, and the item read by every other
// reference of a workflow, which is outside any query's where.
func TestTheItemReadOutsideAQuerysWhereIsAProblem(t *testing.T) {
	t.Parallel()
	const outside = "item is read in the where of all or any"
	cases := []struct {
		document, put string
		want          documents.Problem
	}{
		{workflowBranching, "{present: {from: item.fixed}}", inHomeWorkflow(5, "steps[0].branch[0].if.present", outside)},
		{workflowBranching, "{all: {in: {from: item.x}, where: {present: {from: item}}}}", inHomeWorkflow(5, "steps[0].branch[0].if.all.in", outside)},
		{workflowBranching, "{not: {equals: [{from: item}, 1]}}", inHomeWorkflow(5, "steps[0].branch[0].if.not.equals[0]", outside)},
		{workflowBranching, "{and: [{present: {from: item.a.b}}]}", inHomeWorkflow(5, "steps[0].branch[0].if.and[0].present", outside)},
		{workflowReading, "item", inHomeWorkflow(5, "outputs.o", outside)},
		{workflowReading, "item.x", inHomeWorkflow(5, "outputs.o", outside)},
	}
	for _, c := range cases {
		t.Run(c.put, func(t *testing.T) {
			t.Parallel()
			got, problems := typeWorkflow(t, fmt.Sprintf(c.document, c.put))
			assertNoWorkflow(t, got)
			assertProblems(t, problems, []documents.Problem{c.want})
		})
	}
}

// operands are the references of condition and of every condition in it,
// in the order they are read.
func operands(condition documents.Condition) []documents.Field[documents.Reference] {
	var all []documents.Field[documents.Reference]
	if condition.Reads.Given {
		all = append(all, condition.Reads)
	}
	for _, of := range condition.Of {
		all = append(all, operands(of.Value)...)
	}
	return all
}

// references.feature, "Each operand of a condition has its place": the
// feature's cases, and an operand of every operator, at any depth.
func TestEachOperandOfAConditionHasItsPlace(t *testing.T) {
	t.Parallel()
	const if0 = "steps[0].branch[0].if"
	cases := []struct {
		condition string
		want      []documents.Field[documents.Reference]
	}{
		{"{equals: [{from: params.a}, x]}", []documents.Field[documents.Reference]{
			ofWorkflow(param("a"), 5, if0+".equals[0]"),
		}},
		{"{not: {and: [{present: {from: state.s}}]}}", []documents.Field[documents.Reference]{
			ofWorkflow(state("s", ""), 5, if0+".not.and[0].present"),
		}},
		{"{any: {in: {from: params.l}, where: {present: {from: item}}}}", []documents.Field[documents.Reference]{
			ofWorkflow(param("l"), 5, if0+".any.in"),
			ofWorkflow(queryItem(""), 5, if0+".any.where.present"),
		}},
		{"{or: [{present: {from: inputs.i}}, {all: {in: {from: params.l}, where: {equals: [{from: item.v}, 1]}}}]}", []documents.Field[documents.Reference]{
			ofWorkflow(input("i"), 5, if0+".or[0].present"),
			ofWorkflow(param("l"), 5, if0+".or[1].all.in"),
			ofWorkflow(queryItem("v"), 5, if0+".or[1].all.where.equals[0]"),
		}},
	}
	for _, c := range cases {
		t.Run(c.condition, func(t *testing.T) {
			t.Parallel()
			got, problems := typeWorkflow(t, fmt.Sprintf(workflowBranching, c.condition))
			assertProblems(t, problems, nil)
			if len(got.Steps.Value) == 0 {
				t.Fatal("no step")
			}
			if got := operands(got.Steps.Value[0].Value.Branch.Value[0].Value.If.Value); !reflect.DeepEqual(got, c.want) {
				t.Errorf("operands\n got %+v\nwant %+v", got, c.want)
			}
		})
	}
}
