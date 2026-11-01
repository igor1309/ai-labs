package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"reflect"
	"slices"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/runstore"
	"github.com/igor1309/ai-labs/agister/runtime/claudecode"
	"github.com/igor1309/ai-labs/agister/runtime/codex"
)

// reviewWorkflow is the workflow "review" of reuse.feature: a parallel
// "reviews" of "a" and "b", each "ask" on "codex-sol-61" given q, then
// "judge", "rule" on "claude-opus" given the parallel's outputs.
const reviewWorkflow = `schema: agister.workflow/v1alpha1
params:
  q: {}
steps:
  - name: reviews
    parallel:
      - {name: a, process: ask, agent: codex-sol-61, inputs: {q: {from: params.q}}}
      - {name: b, process: ask, agent: codex-sol-61, inputs: {q: {from: params.q}}}
  - {name: judge, process: rule, agent: claude-opus, inputs: {reviews: {from: steps.reviews.outputs}}}
outputs:
  judgement: {from: steps.judge.outputs}
`

// ruleProcess is the process "rule": given reviews, it answers.
const ruleProcess = `schema: agister.process/v1alpha1
prompt: ask
params:
  reviews: {}
inputs:
  reviews: {source: param, name: reviews}
output:
  schema: answer
`

// identity is the identity of an input whose value is value, none other
// given.
func identity(value string) string {
	digest := sha256.Sum256([]byte(value))
	return hex.EncodeToString(digest[:])
}

// keptReview is the call "R1/<step>" of R1, "ask" on "codex-sol-61" given
// q "why", in "/r" at HEAD "c1" and the content "t1", completed with its
// step's name as its output's "by", its cost 1 and 100 tokens in.
func keptReview(step string, settings map[string]string) runstore.Call {
	cost, in, session := 1.0, int64(100), "s-"+step
	return runstore.Call{ID: "R1/" + step, Step: step, Process: "ask", Agent: "codex-sol-61", Root: "/r", Head: "c1",
		Content: "t1", Definitions: askDefinitions(settings, "codex-sol-61"), Environment: []runstore.Variable{{Name: "A", Value: "1"}},
		Inputs: []runstore.Input{{Name: "q", Value: "why", Identity: identity("why")}},
		Result: runstore.CallResult{Session: &session, Outcome: runstore.Outcome{Status: "completed",
			Output: map[string]any{"ok": true, "by": step}, Cost: &cost, Usage: runstore.Usage{Input: &in}}}}
}

// newReuseFixture is the run fixture of reuse.feature: the settings of
// record.feature, with "review" and "rule"; runstore keeping R1, "a" and
// "b" completed and "judge" failed; codex and claude-code completing.
func newReuseFixture(t *testing.T) *runFixture {
	t.Helper()
	f := newRecordFixture(t, modelSettings(t, map[string]string{
		"/r/.agister/workflows/review.yaml": reviewWorkflow,
		"/r/.agister/processes/rule.yaml":   ruleProcess,
	}), nil)
	class := "refused"
	judge := runstore.Call{ID: "R1/judge", Step: "judge", Process: "rule", Agent: "claude-opus", Root: "/r", Head: "c1",
		Content: "t1", Result: runstore.CallResult{Outcome: runstore.Outcome{Status: "failed", Class: &class}}}
	f.store.kept = map[string]runstore.Record{"R1": {Schema: runstore.Schema, ID: "R1", Status: "failed",
		Request: runstore.Request{Workflow: "review", Params: map[string]string{"q": "why"}, Dir: "/r"},
		Calls:   []runstore.Call{keptReview("a", f.settings), keptReview("b", f.settings), judge}}}
	f.runtimes.codex.answer = codexReply(codex.Reply{Output: []byte(`{"ok":true}`)})
	cost := 0.5
	f.runtimes.claude.answer = claudeReply(claudecode.Reply{Output: []byte(`{"ok":true}`), Cost: &cost,
		Usage: claudecode.Usage{Input: tokens(10), Output: tokens(3)}})
	f.validator = &validatorSpy{}
	return f
}

// reusing is each step's call the record reuses, by step, "" for one made.
func reusing(record runstore.Record) map[string]string {
	reuses := map[string]string{}
	for _, call := range record.Calls {
		reuses[call.Step] = ""
		if call.Reuses != nil {
			reuses[call.Step] = *call.Reuses
		}
	}
	return reuses
}

// reuse.feature, "A judge that failed runs alone on the reviews kept".
//
// Contract test: the files home holds, as Agister ships them.
func TestAJudgeThatFailedRunsAloneOnTheReviewsKept(t *testing.T) {
	t.Parallel()
	f := newReuseFixture(t)
	got := f.run(t, "/r", "run", "review", "--param", "q=why", "--reuse", "R1")
	if got.stderr != "" || got.code != 0 {
		t.Fatalf("stderr %q, exit %d; want none, 0", got.stderr, got.code)
	}
	if ran := f.runtimes.codex.ran(); len(ran) > 0 {
		t.Errorf("codex ran %d turns, want none", len(ran))
	}
	ran := f.runtimes.claude.ran()
	if len(ran) != 1 || !strings.Contains(ran[0].Message, `"by":"a"`) || !strings.Contains(ran[0].Message, `"by":"b"`) {
		t.Fatalf("claude-code ran %+v, want one turn, given the outputs of R1/a and R1/b", ran)
	}
	last := f.store.last(t)
	if r := last.Request.Reuse; r == nil || *r != "R1" {
		t.Errorf("the record's request reuses %v, want R1", r)
	}
	if want := map[string]string{"a": "R1/a", "b": "R1/b", "judge": ""}; !reflect.DeepEqual(reusing(last), want) {
		t.Errorf("the record's calls reuse %v, want %v", reusing(last), want)
	}
	for _, call := range last.Calls {
		if call.Reuses == nil {
			continue
		}
		kept := keptReview(call.Step, f.settings)
		if call.ID != last.ID+"/"+call.Step || call.Continues != nil || !reflect.DeepEqual(call.Result, kept.Result) {
			t.Errorf("the record's call %+v, want its id this run's, continuing none, its result %+v", call, kept.Result)
		}
	}
	for _, line := range []string{"· a: reused R1/a\n", "· b: reused R1/b\n"} {
		if !strings.Contains(got.progress, line) {
			t.Errorf("progress\n%s\nwant %q in it", got.progress, line)
		}
	}
	if strings.Contains(got.progress, "a: started") || strings.Contains(got.progress, "b: ended") {
		t.Errorf("progress\n%s\nwant no start or end of a or b", got.progress)
	}
	_, _, events := f.store.given()
	var reusedEvents []string
	for _, e := range events {
		if e.event.Kind == runstore.Reused {
			reusedEvents = append(reusedEvents, e.event.Step+" "+e.event.Call)
		}
	}
	if slices.Sort(reusedEvents); !slices.Equal(reusedEvents, []string{"a R1/a", "b R1/b"}) {
		t.Errorf("the events reused %q, want a's and b's", reusedEvents)
	}
	var printed struct {
		Cost  float64        `json:"cost"`
		Usage map[string]any `json:"usage"`
	}
	if err := json.Unmarshal([]byte(got.stdout), &printed); err != nil {
		t.Fatal(err)
	}
	wantUsage := map[string]any{"input_tokens": float64(10), "output_tokens": float64(3), "cache_read_tokens": nil,
		"cache_write_tokens": nil, "reasoning_tokens": nil}
	if printed.Cost != 0.5 || !reflect.DeepEqual(printed.Usage, wantUsage) {
		t.Errorf("the result's cost %v and usage %v, want the judge's alone, 0.5 and %v", printed.Cost, printed.Usage, wantUsage)
	}
}

// reuse.feature, "A continuation goes on from a call made, not one
// reused".
//
// Contract test: the files home holds, as Agister ships them.
func TestAContinuationGoesOnFromACallMadeNotOneReused(t *testing.T) {
	t.Parallel()
	f := newReuseFixture(t)
	r2 := keptReview("a", f.settings)
	continues := "R1/a"
	r2.ID, r2.Content, r2.Continues = "R2/a", "t2", &continues
	r3 := keptReview("a", f.settings)
	r3.ID, r3.Reuses = "R3/a", &continues
	f.store.kept["R2"] = keptRun("R2", r2)
	f.store.kept["R3"] = keptRun("R3", r3)
	got := f.run(t, "/r", "run", "--process", "ask", "--agent", "codex-sol-61", "--param", "q=why", "--continue", "R2")
	want := ran{stderr: "agister: the run is refused, and nothing runs:\n  the worktree is not as \"R2/a\" left it\n", code: 1}
	if got != want {
		t.Errorf("ran %+v, want %+v", got, want)
	}
}

// reuse.feature, "A call that failed is made again".
//
// Contract test: the files home holds, as Agister ships them.
func TestACallThatFailedIsMadeAgain(t *testing.T) {
	t.Parallel()
	f := newReuseFixture(t)
	r1 := f.store.kept["R1"]
	class := "rate_limited"
	r1.Calls[1].Result.Status, r1.Calls[1].Result.Class = "failed", &class
	got := f.run(t, "/r", "run", "review", "--param", "q=why", "--reuse", "R1")
	if got.stderr != "" || got.code != 0 {
		t.Fatalf("stderr %q, exit %d; want none, 0", got.stderr, got.code)
	}
	if ran := f.runtimes.codex.ran(); len(ran) != 1 {
		t.Errorf("codex ran %d turns, want one, for b", len(ran))
	}
	if want := map[string]string{"a": "R1/a", "b": "", "judge": ""}; !reflect.DeepEqual(reusing(f.store.last(t)), want) {
		t.Errorf("the record's calls reuse %v, want %v", reusing(f.store.last(t)), want)
	}
}

// reuse.feature, "A call given something else is made".
//
// Contract test: the files home holds, as Agister ships them.
func TestACallGivenSomethingElseIsMade(t *testing.T) {
	t.Parallel()
	for _, c := range []struct {
		given string
		set   func(f *runFixture)
		q     string
	}{
		{"nothing more", func(*runFixture) {}, "other"},
		{`git gives "/r" HEAD "c2"`, func(f *runFixture) { f.holding.head = "c2" }, "why"},
		{`git gives "/r" the content "t2"`, func(f *runFixture) { f.holding.content = "t2" }, "why"},
	} {
		t.Run(c.given, func(t *testing.T) {
			t.Parallel()
			f := newReuseFixture(t)
			c.set(f)
			got := f.run(t, "/r", "run", "review", "--param", "q="+c.q, "--reuse", "R1")
			if got.stderr != "" || got.code != 0 {
				t.Fatalf("stderr %q, exit %d; want none, 0", got.stderr, got.code)
			}
			if ran := f.runtimes.codex.ran(); len(ran) != 2 {
				t.Errorf("codex ran %d turns, want two, for a and b", len(ran))
			}
			if want := map[string]string{"a": "", "b": "", "judge": ""}; !reflect.DeepEqual(reusing(f.store.last(t)), want) {
				t.Errorf("the record's calls reuse %v, want none", reusing(f.store.last(t)))
			}
		})
	}
}

// reuse.feature, "A reuse of a run whose request was another is refused"
// and "A reuse of a run not kept is refused".
//
// Contract test: the files home holds, as Agister ships them.
func TestAReuseThatDoesNotHoldIsRefused(t *testing.T) {
	t.Parallel()
	for _, c := range []struct {
		request string
		run     string
		what    string
	}{
		{"--process ask --agent codex-sol-61 --param q=why", "R1", `"R1" ran the workflow "review"`},
		{"review --param q=why", "R9", `no run "R9" is kept`},
	} {
		t.Run(c.what, func(t *testing.T) {
			t.Parallel()
			f := newReuseFixture(t)
			args := append(append([]string{"run"}, strings.Fields(c.request)...), "--reuse", c.run)
			got := f.run(t, "/r", args...)
			want := ran{stderr: "agister: the run is refused, and nothing runs:\n  " + c.what + "\n", code: 1}
			if got != want {
				t.Errorf("ran %+v, want %+v", got, want)
			}
			if _, records, events := f.store.given(); len(records) > 0 || len(events) > 0 {
				t.Errorf("runstore was given the records %+v and the events %+v, want nothing", records, events)
			}
		})
	}
}
