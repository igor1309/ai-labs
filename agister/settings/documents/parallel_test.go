package documents_test

import (
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/settings/documents"
)

// parallelWorkflow is the workflow of parallel.feature's "A parallel of a
// map gives its items and its max".
const parallelWorkflow = workflowHeader + `steps:
  - name: reviews
    parallel:
      max: 1
      steps:
        - {name: tests, process: tests_review, agent: codex}
        - {name: intent, process: intent_review, agent: codex}
`

// reviewsItem is the step name of the parallel's items, its process
// process, on line, at place.
func reviewsItem(name, process string, line int, place string) documents.Field[documents.Item] {
	return ofWorkflow(documents.Item{Name: name, Process: ofWorkflow(process, line, place+".process"), Agent: ofWorkflow("codex", line, place+".agent")}, line, place)
}

// parallel.feature, "A parallel of a map gives its items and its max".
func TestAParallelOfAMapGivesItsItemsAndItsMax(t *testing.T) {
	t.Parallel()
	got, problems := typeWorkflow(t, parallelWorkflow)
	assertProblems(t, problems, nil)
	const at = "steps[0].parallel.steps"
	assertWorkflow(t, got, documents.WorkflowDefinition{Name: "a", Steps: ofWorkflow([]documents.Field[documents.Item]{
		ofWorkflow(documents.Item{
			Name: "reviews",
			Parallel: ofWorkflow([]documents.Field[documents.Item]{
				reviewsItem("tests", "tests_review", 7, at+"[0]"),
				reviewsItem("intent", "intent_review", 8, at+"[1]"),
			}, 6, at),
			Max: ofWorkflow(1, 5, "steps[0].parallel.max"),
		}, 3, "steps[0]"),
	}, 2, "steps")})
}

// parallel.feature, "A parallel's max is given only where its map gives
// it".
func TestAParallelsMaxIsGivenOnlyWhereItsMapGivesIt(t *testing.T) {
	t.Parallel()
	for _, c := range []struct {
		parallel string
		source   string
		at       string
		line     int
	}{
		{"a list of its items", workflowHeader + `steps:
  - name: reviews
    parallel:
      - {name: tests, process: tests_review, agent: codex}
      - {name: intent, process: intent_review, agent: codex}
`, "steps[0].parallel", 4},
		{"a map of its items, under steps, and no max", strings.Replace(parallelWorkflow, "      max: 1\n", "", 1), "steps[0].parallel.steps", 5},
	} {
		t.Run(c.parallel, func(t *testing.T) {
			t.Parallel()
			got, problems := typeWorkflow(t, c.source)
			assertProblems(t, problems, nil)
			assertWorkflow(t, got, documents.WorkflowDefinition{Name: "a", Steps: ofWorkflow([]documents.Field[documents.Item]{
				ofWorkflow(documents.Item{Name: "reviews", Parallel: ofWorkflow([]documents.Field[documents.Item]{
					reviewsItem("tests", "tests_review", c.line+1, c.at+"[0]"),
					reviewsItem("intent", "intent_review", c.line+2, c.at+"[1]"),
				}, c.line, c.at)}, 3, "steps[0]"),
			}, 2, "steps")})
		})
	}
}

// parallel.feature, "A parallel's map holds its items and a max of 1 or
// more".
func TestAParallelsMapHoldsItsItemsAndAMaxOf1OrMore(t *testing.T) {
	t.Parallel()
	for _, c := range []struct {
		fault    string
		old, new string
		want     documents.Problem
	}{
		{"is a map of max 0", "max: 1", "max: 0", inHomeWorkflow(5, "steps[0].parallel.max", "it is at least 1")},
		{`is a map of max "one"`, "max: 1", "max: one", inHomeWorkflow(5, "steps[0].parallel.max", "it is an integer, not a string")},
		{"is a map with no steps", "      steps:\n        - {name: tests, process: tests_review, agent: codex}\n        - {name: intent, process: intent_review, agent: codex}\n", "",
			missing("steps[0].parallel.steps")},
		{`is a map with the key "colour"`, "max: 1", "max: 1\n      colour: red", inHomeWorkflow(6, "steps[0].parallel.colour", "the field is not known")},
		{"is a list beside the max 1", "    parallel:\n      max: 1\n      steps:\n", "    max: 1\n    parallel:\n", inHomeWorkflow(4, "steps[0].max", "the field is not known")},
	} {
		t.Run(c.fault, func(t *testing.T) {
			t.Parallel()
			if !strings.Contains(parallelWorkflow, c.old) {
				t.Fatalf("the parallel workflow has no %q", c.old)
			}
			got, problems := typeWorkflow(t, strings.Replace(parallelWorkflow, c.old, c.new, 1))
			assertNoWorkflow(t, got)
			assertProblems(t, problems, []documents.Problem{c.want})
		})
	}
}
