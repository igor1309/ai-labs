package main

import (
	"context"
	"encoding/json"
	"fmt"
	"reflect"
	"slices"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/runstore"
	"github.com/igor1309/ai-labs/agister/runtime/claudecode"
	"github.com/igor1309/ai-labs/agister/runtime/codex"
)

const itemLens = `schema: agister.workflow/v1alpha1
params: {goal: {}}
steps:
 - {name: draft, process: tests_review, agent: codex-sol-61, inputs: {goal: {from: params.goal}}}
 - name: debate
   repeat:
    state: {review: {from: steps.draft.outputs}}
    steps:
     - {name: critique, process: review_critique, agent: claude-opus, inputs: {goal: {from: params.goal}, review: {from: state.review}, critique: none}}
     - {name: revise, process: review_revise, agent: codex-sol-61, session: {from: steps.draft.session}, inputs: {critique: {from: steps.critique.outputs}}}
    next: {review: {from: steps.revise.outputs}}
    until: {equals: [{from: steps.critique.outputs.verdict}, converged]}
    max: 2
outputs: {output: {from: steps.debate.outputs.state.review}}
`

const itemReviewed = `schema: agister.workflow/v1alpha1
params: {goal: {}}
inputs: {goal: {source: file, path: {from: params.goal}}}
steps:
 - name: reviews
   parallel:
    max: 1
    steps:
     - {name: arch, process: architecture_review, agent: codex-sol-61, inputs: {goal: {from: inputs.goal}}}
     - {name: tests, workflow: lens, inputs: {goal: {from: inputs.goal}}}
 - {name: judge, process: review_judge, agent: claude-opus, inputs: {reviews: {from: steps.reviews.outputs}}}
outputs: {judgement: {from: steps.judge.outputs}}
`

type workflowItemFixture struct {
	*runFixture
	made               []string
	critique, revision int
	archCost           *float64
}

// newWorkflowItemFixture integrates settings resolution, planning, workflow,
// calls, admission and records; only their external ports are spies.
func newWorkflowItemFixture(t *testing.T, converges int) *workflowItemFixture {
	t.Helper()
	f := &workflowItemFixture{runFixture: newReviewFixture(t)}
	f.settings["/r/.agister/workflows/lens.yaml"] = itemLens
	f.settings["/r/.agister/workflows/reviewed.yaml"] = itemReviewed
	f.runtimes.codex.answer = func(_ context.Context, turn codex.Turn) (codex.Result, error) {
		name, session, review := "arch", "arch-session", reviewResult("arch")
		if strings.Contains(turn.Message, f.settings["/u/.agister/prompts/code-review-tests.md"]) {
			name, session, review = "tests/draft", "draft-session", reviewResult("draft")
		}
		if turn.Session != "" {
			f.revision++
			name, session, review = fmt.Sprintf("tests/revise/%d", f.revision), turn.Session, reviewResult(fmt.Sprintf("revision-%d", f.revision))
		}
		f.made = append(f.made, name)
		data, err := json.Marshal(review)
		reply := &codex.Reply{Session: session, Output: data}
		if name == "arch" {
			reply.Cost = f.archCost
		}
		return codex.Result{Reply: reply}, err
	}
	f.runtimes.claude.answer = func(_ context.Context, turn claudecode.Turn) (claudecode.Result, error) {
		data := []byte(judgement)
		name := "judge"
		if strings.Contains(turn.Message, f.settings["/u/.agister/prompts/code-review-critic.md"]) {
			f.critique++
			name = fmt.Sprintf("tests/critique/%d", f.critique)
			verdict := "another_round"
			if f.critique >= converges {
				verdict = "converged"
			}
			data = []byte(fmt.Sprintf(`{"verdict":%q,"challenges":[]}`, verdict))
		}
		f.made = append(f.made, name)
		return claudecode.Result{Reply: &claudecode.Reply{Output: data}}, nil
	}
	return f
}

func (f *workflowItemFixture) runItem(t *testing.T) ran {
	t.Helper()
	got := f.run(t, "/r", "run", "reviewed", "--param", "goal=g.md")
	if got.stderr != "" || got.code != 0 {
		t.Fatalf("run %+v", got)
	}
	return got
}

func itemCalls(record runstore.Record) map[string]runstore.Call {
	calls := map[string]runstore.Call{}
	for _, c := range record.Calls {
		calls[c.Step] = c
	}
	return calls
}

func recordedInput(t *testing.T, c runstore.Call, name string) string {
	t.Helper()
	for _, input := range c.Inputs {
		if input.Name == name {
			return input.Value
		}
	}
	t.Fatalf("call %s has no input %s: %v", c.Step, name, c.Inputs)
	return ""
}

// Contract test: the review processes, prompts and schemas shipped in home.
func TestTheItemsCallsRunInItsSlotAndTheJoinReadsItsOutputWhole(t *testing.T) {
	t.Parallel()
	f := newWorkflowItemFixture(t, 1)
	f.runItem(t)
	want := []string{"arch", "tests/draft", "tests/critique/1", "tests/revise/1", "judge"}
	if !slices.Equal(f.made, want) {
		t.Fatalf("made %v, want %v", f.made, want)
	}
	outcomes := judged(t, f.runFixture)
	wantSlot := map[string]any{"status": "completed", "class": nil, "output": reviewResult("revision-1")}
	if len(outcomes) != 2 || !reflect.DeepEqual(outcomes[1], wantSlot) {
		t.Fatalf("join %v", outcomes)
	}
	calls := itemCalls(f.store.last(t))
	if !reflect.DeepEqual(calls["tests/revise/1"].Result.Output, reviewResult("revision-1")) {
		t.Fatalf("revision %+v", calls["tests/revise/1"])
	}
}

// Contract test: the review processes, prompts and schemas shipped in home.
func TestTheReviseContinuesTheDraftsSessionInsideTheItem(t *testing.T) {
	t.Parallel()
	f := newWorkflowItemFixture(t, 2)
	f.runItem(t)
	calls := itemCalls(f.store.last(t))
	id := f.store.last(t).ID
	for _, pair := range [][2]string{{"tests/revise/1", "tests/draft"}, {"tests/revise/2", "tests/revise/1"}} {
		c := calls[pair[0]]
		if c.Continues == nil || *c.Continues != id+"/"+pair[1] || c.Result.Session == nil || *c.Result.Session != "draft-session" {
			t.Fatalf("continuation %+v", c)
		}
	}
	turns := f.runtimes.codex.ran()
	if len(turns) != 4 || turns[2].Session != "draft-session" || turns[3].Session != "draft-session" {
		t.Fatalf("turns %+v", turns)
	}
	for _, turn := range turns[2:] {
		if !strings.Contains(turn.Message, "## continuation\n") {
			t.Fatal("resumed turn lacks continuation prompt")
		}
	}
}

// Contract test: the review processes, prompts and schemas shipped in home.
func TestEachPasssCritiqueReadsTheReviewThePassBeforeLeft(t *testing.T) {
	t.Parallel()
	f := newWorkflowItemFixture(t, 2)
	f.runItem(t)
	calls := itemCalls(f.store.last(t))
	for _, pair := range [][2]string{{"tests/critique/1", "tests/draft"}, {"tests/critique/2", "tests/revise/1"}} {
		var review map[string]any
		if err := json.Unmarshal([]byte(recordedInput(t, calls[pair[0]], "review")), &review); err != nil {
			t.Fatal(err)
		}
		if !reflect.DeepEqual(review, calls[pair[1]].Result.Output) {
			t.Fatalf("%s reads %v, want %v", pair[0], review, calls[pair[1]].Result.Output)
		}
	}
}

// Contract test: the review processes, prompts and schemas shipped in home.
func TestTheRecordKeepsTheItemAsAChildRunAndEachCallByTheItem(t *testing.T) {
	t.Parallel()
	f := newWorkflowItemFixture(t, 1)
	f.runItem(t)
	record := f.store.last(t)
	for _, c := range record.Calls {
		if c.ID != record.ID+"/"+c.Step {
			t.Fatalf("call id %s for %s", c.ID, c.Step)
		}
	}
	calls := itemCalls(record)
	for _, name := range []string{"tests/draft", "tests/critique/1"} {
		if calls[name].ID != record.ID+"/"+name {
			t.Fatalf("missing call %s", name)
		}
	}
	want := []runstore.Child{{ID: record.ID + "/tests", Workflow: "lens", Parent: record.ID, Params: map[string]string{"goal": goalBrief}, Inputs: []runstore.Input{}, Status: "completed", Output: reviewResult("revision-1")}}
	if !reflect.DeepEqual(record.Children, want) {
		t.Fatalf("children %+v, want %+v", record.Children, want)
	}
	// Assert the public record field as well as its typed representation.
	children, ok := asJSON(t, record)["children"].([]any)
	if !ok || len(children) != 1 || children[0].(map[string]any)["id"] != record.ID+"/tests" {
		t.Fatalf("record children %v", children)
	}
	_, _, events := f.store.given()
	var child []runstore.Event
	for _, event := range events {
		if event.event.Kind == runstore.ChildStarted || event.event.Kind == runstore.ChildEnded {
			child = append(child, event.event)
		}
	}
	if len(child) != 2 || child[0].Step != "tests" || child[0].Workflow != "lens" || child[1].Status != "completed" || !reflect.DeepEqual(child[1].Output, reviewResult("revision-1")) {
		t.Fatalf("child events %+v", child)
	}
}

// Contract test: the review processes, prompts and schemas shipped in home.
func TestProgressNamesEachCallByTheItem(t *testing.T) {
	t.Parallel()
	f := newWorkflowItemFixture(t, 1)
	got := f.runItem(t)
	for _, line := range []string{"· tests/draft: started on codex-sol-61\n", "· tests/critique/1: started on claude-opus\n", "· tests/revise/1: started on codex-sol-61\n", "· tests/debate: stopped until after 1 passes\n"} {
		if !strings.Contains(got.progress, line) {
			t.Fatalf("progress lacks %q: %s", line, got.progress)
		}
	}
}

// Contract test: the review processes, prompts and schemas shipped in home.
func TestACallInsideTheItemMeetsTheDaysBudgetAsAnyCall(t *testing.T) {
	t.Parallel()
	f := newWorkflowItemFixture(t, 1)
	f.settings["/u/.agister/budget.yaml"] = "daily: {cost: 1}"
	f.archCost = usd(1)
	got := f.run(t, "/r", "run", "reviewed", "--param", "goal=g.md")
	if got.code != 1 || got.stderr != "" || !slices.Equal(f.made, []string{"arch"}) {
		t.Fatalf("run %+v, made %v", got, f.made)
	}
	calls := itemCalls(f.store.last(t))
	c := calls["tests/draft"]
	if c.Result.Status != "failed" || c.Result.Class == nil || *c.Result.Class != "budget_exhausted" {
		t.Fatalf("draft %+v", c)
	}
	var outcomes []map[string]any
	if err := json.Unmarshal([]byte(recordedInput(t, calls["judge"], "reviews")), &outcomes); err != nil {
		t.Fatal(err)
	}
	if len(outcomes) != 2 || !reflect.DeepEqual(outcomes[1], map[string]any{"status": "failed", "class": "budget_exhausted", "output": nil}) {
		t.Fatalf("join %v", outcomes)
	}
}

// Contract test: the review processes, prompts and schemas shipped in home.
func TestCheckPassesTheWorkflow(t *testing.T) {
	t.Parallel()
	f := newWorkflowItemFixture(t, 1)
	got := f.run(t, "/r", "check")
	if got.code != 0 || got.stderr != "" || !strings.HasSuffix(got.stdout, "0 refused\n") {
		t.Fatalf("check %+v", got)
	}
	for _, name := range []string{"reviewed", "lens"} {
		shown := f.run(t, "/r", "inspect", "workflow", name)
		if shown.code != 0 || strings.Contains(shown.stdout, "\nrefused\n") || !strings.Contains(shown.stdout, "plan of lens ") {
			t.Fatalf("inspect %s: %+v", name, shown)
		}
	}
}

// Contract test: the complete settings shipped in home.
func TestCheckPassesHomesCodeReviewItsTestsLensADebate(t *testing.T) {
	t.Parallel()
	got := compose(t, nil, "check")
	if got.code != 0 || got.stderr != "" || !strings.HasSuffix(got.stdout, "0 refused\n") {
		t.Fatalf("home check %+v", got)
	}
	for _, name := range []string{"code_review", "tests_debate"} {
		shown := compose(t, nil, "inspect", "workflow", name)
		if shown.code != 0 || strings.Contains(shown.stdout, "\nrefused\n") || !strings.Contains(shown.stdout, "plan of tests_debate ") {
			t.Fatalf("inspect %s: %+v", name, shown)
		}
	}
}
