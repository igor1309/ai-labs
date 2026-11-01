package main

import (
	"context"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/runstore"
	"github.com/igor1309/ai-labs/agister/runtime/claudecode"
	"github.com/igor1309/ai-labs/agister/runtime/codex"
)

// spendCapacity moves f's clock past the four capacity waits of each of
// calls calls, one call after another, each wait once its timer started.
func spendCapacity(f *runFixture, calls int) {
	for range calls {
		for _, wait := range []time.Duration{30 * time.Second, time.Minute, 3 * time.Minute, 5 * time.Minute} {
			f.clock.Started(wait)
			f.clock.Advance(wait)
		}
	}
}

// atCapacity is a codex turn that failed at capacity in session.
func atCapacity(session string) func(context.Context, codex.Turn) (codex.Result, error) {
	return answers[codex.Turn](codex.Result{Session: session, Reply: &codex.Reply{
		Failure: codex.Capacity, Reason: "Selected model is at capacity", Session: session}})
}

// serialReviewWorkflow is reuse.feature's "review", its reviews run one at
// a time, so that a test drives each one's capacity waits in turn.
const serialReviewWorkflow = `schema: agister.workflow/v1alpha1
params:
  q: {}
steps:
  - name: reviews
    parallel:
      max: 1
      steps:
        - {name: a, process: ask, agent: codex-sol-61, inputs: {q: {from: params.q}}}
        - {name: b, process: ask, agent: codex-sol-61, inputs: {q: {from: params.q}}}
  - {name: judge, process: rule, agent: claude-opus, inputs: {reviews: {from: steps.reviews.outputs}}}
outputs:
  judgement: {from: steps.judge.outputs}
`

// capacity.feature, "A reuse takes reviews that fell back": the run the
// reuse names is made by the composition, so that what its record keeps
// is what a reuse reads.
//
// Contract test: the files home holds, as Agister ships them.
func TestAReuseTakesReviewsThatFellBack(t *testing.T) {
	t.Parallel()
	f := newRecordFixture(t, modelSettings(t, map[string]string{
		"/r/.agister/workflows/review.yaml": serialReviewWorkflow,
		"/r/.agister/processes/rule.yaml":   ruleProcess,
	}), nil)
	f.validator = &validatorSpy{}
	f.runtimes.codex.answer = atCapacity("primary-session")
	judgeFails := true
	f.runtimes.claude.answer = func(_ context.Context, turn claudecode.Turn) (claudecode.Result, error) {
		if strings.Contains(turn.Message, "## reviews") && judgeFails {
			return claudecode.Result{Reply: &claudecode.Reply{Failure: claudecode.RateLimited, Reason: "429"}}, nil
		}
		return claudecode.Result{Session: "fallback-session", Reply: &claudecode.Reply{Output: []byte(`{"ok":true}`), Session: "fallback-session"}}, nil
	}
	done := make(chan ran, 1)
	go func() { done <- f.run(t, "/r", "run", "review", "--param", "q=why") }()
	spendCapacity(f, 2)
	<-done
	first := f.store.last(t)
	byStep := map[string]runstore.Call{}
	for _, call := range first.Calls {
		byStep[call.Step] = call
	}
	for _, step := range []string{"a", "b"} {
		if call := byStep[step]; call.Agent != "claude-opus" || call.Primary == nil || call.Primary.Agent != "codex-sol-61" || call.Result.Status != "completed" {
			t.Fatalf("the first run's call %+v, want completed on claude-opus, the fallback of codex-sol-61", call)
		}
	}
	if judge := byStep["judge"]; judge.Result.Status != "failed" {
		t.Fatalf("the first run's judge %+v, want failed", judge)
	}

	judgeFails = false
	f.runtimes.codex.answer = codexReply(codex.Reply{Output: []byte(`{"ok":true}`)})
	codexTurns, claudeTurns := len(f.runtimes.codex.ran()), len(f.runtimes.claude.ran())
	got := f.run(t, "/r", "run", "review", "--param", "q=why", "--reuse", first.ID)
	if got.stderr != "" || got.code != 0 {
		t.Fatalf("stderr %q, exit %d; want none, 0", got.stderr, got.code)
	}
	if ran := f.runtimes.codex.ran(); len(ran) != codexTurns {
		t.Errorf("codex ran %d turns more, want none", len(ran)-codexTurns)
	}
	if ran := f.runtimes.claude.ran(); len(ran) != claudeTurns+1 || !strings.Contains(ran[len(ran)-1].Message, "## reviews") {
		t.Errorf("claude-code ran %d turns more, want the judge's alone", len(ran)-claudeTurns)
	}
	second := f.store.last(t)
	if want := map[string]string{"a": first.ID + "/a", "b": first.ID + "/b", "judge": ""}; second.ID == first.ID || !reflect.DeepEqual(reusing(second), want) {
		t.Fatalf("the run %q's calls reuse %v, want %v", second.ID, reusing(second), want)
	}
	for _, call := range second.Calls[:2] {
		kept := byStep[call.Step]
		if call.Agent != kept.Agent || !reflect.DeepEqual(call.Permissions, kept.Permissions) ||
			!reflect.DeepEqual(call.Primary, kept.Primary) || !reflect.DeepEqual(call.Result, kept.Result) {
			t.Errorf("the reused call %+v, want the answering agent %q, its plan %+v, the primary %+v and the result as kept",
				call, kept.Agent, kept.Permissions, kept.Primary)
		}
	}
}

// capacity.feature, "A continuation goes on from a call that fell back":
// R1 leaves the content "t1" in codex's session "S"; R2 continues R1, its
// turns on codex at capacity in "S", and falls back to claude-opus, which
// leaves "t2"; a continuation of R1 then goes on from R2, the latest call
// that went on in "S".
//
// Contract test: the files home holds, as Agister ships them.
func TestAContinuationGoesOnFromACallThatFellBack(t *testing.T) {
	t.Parallel()
	f := newRecordFixture(t, modelSettings(t, map[string]string{"/u/.agister/prompts/continuation.md": "c"}), nil)
	f.validator = &validatorSpy{}
	completes := answers[codex.Turn](codex.Result{Session: "S", Reply: &codex.Reply{Output: []byte(`{"ok":true}`), Session: "S"}})
	f.runtimes.codex.answer = completes
	request := []string{"run", "--process", "ask", "--agent", "codex-sol-61", "--param", "q=why"}
	if got := f.run(t, "/r", request...); got.stderr != "" || got.code != 0 {
		t.Fatalf("R1: stderr %q, exit %d; want none, 0", got.stderr, got.code)
	}
	r1 := f.store.last(t).ID

	f.clock.Advance(time.Minute)
	f.runtimes.codex.answer = atCapacity("S")
	f.runtimes.claude.answer = func(context.Context, claudecode.Turn) (claudecode.Result, error) {
		f.holding.write("t2")
		return claudecode.Result{Session: "F", Reply: &claudecode.Reply{Output: []byte(`{"ok":true}`), Session: "F"}}, nil
	}
	done := make(chan ran, 1)
	go func() { done <- f.run(t, "/r", append(request, "--continue", r1)...) }()
	spendCapacity(f, 1)
	if got := <-done; got.stderr != "" || got.code != 0 {
		t.Fatalf("R2: stderr %q, exit %d; want none, 0", got.stderr, got.code)
	}
	r2 := f.store.last(t)
	if call := r2.Calls[0]; call.Agent != "claude-opus" || call.Primary == nil || call.Primary.Result.Session == nil ||
		*call.Primary.Result.Session != "S" || call.Content != "t2" {
		t.Fatalf("R2's call %+v, want made again on claude-opus, its primary in S, leaving t2", call)
	}

	f.clock.Advance(time.Minute)
	f.runtimes.codex.answer = completes
	got := f.run(t, "/r", append(request, "--continue", r1)...)
	if got.stderr != "" || got.code != 0 {
		t.Fatalf("R3: stderr %q, exit %d; want none, 0", got.stderr, got.code)
	}
	if turns := f.runtimes.codex.ran(); len(turns) != 7 || turns[6].Session != "S" {
		t.Errorf("codex ran %+v, want R3's one turn, the seventh, in S", turns)
	}
	if call := f.store.last(t).Calls[0]; call.Agent != "codex-sol-61" || call.Continues == nil || *call.Continues != r2.ID+"/ask" {
		t.Errorf("R3's call %+v, want on codex-sol-61, continuing %s/ask", call, r2.ID)
	}
}

// A call whose primary went on in a session before it fell back is that
// session's latest call, on the primary's agent, plan and result, so its
// session cost; a reused one never is.
func TestALatestCallIsOneWhosePrimaryWentOnInTheSession(t *testing.T) {
	t.Parallel()
	session, fallback, cost, primaryCost := "S", "F", 0.5, 0.2
	r1 := keptCall("R1/ask", "t1", session)
	r1.Agent = "codex-sol-61"
	fellBack := keptCall("R2/ask", "t2", fallback)
	fellBack.Result.SessionCost = &cost
	fellBack.Permissions = runstore.Permissions{Options: []string{"Glob"}}
	class := "capacity"
	primary := runstore.Primary{Agent: "codex-sol-61", Permissions: runstore.Permissions{Options: []string{"read-only"}},
		Result: runstore.CallResult{Session: &session, SessionCost: &primaryCost,
			Outcome: runstore.Outcome{Status: "failed", Class: &class}}}
	fellBack.Primary = &primary
	asPrimary := fellBack
	asPrimary.Agent, asPrimary.Permissions, asPrimary.Result = primary.Agent, primary.Permissions, primary.Result
	reused := fellBack
	reused.Reuses = &r1.ID
	for _, c := range []struct {
		name  string
		later runstore.Call
		want  runstore.Call
	}{
		{"made", fellBack, asPrimary},
		{"reused", reused, r1},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			kept := &storeSpy{kept: map[string]runstore.Record{"R1": keptRun("R1", r1), "R2": keptRun("R2", c.later)}}
			got, err := latestCall(kept, "R1", r1, session)
			if err != nil || !reflect.DeepEqual(got, c.want) {
				t.Errorf("latest call %+v, error %v; want %+v", got, err, c.want)
			}
		})
	}
}
