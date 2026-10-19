package main

import (
	"context"
	"maps"
	"slices"
	"testing"

	"github.com/igor1309/ai-labs/agister/core/call"
	"github.com/igor1309/ai-labs/agister/core/inputs"
	"github.com/igor1309/ai-labs/agister/core/workflow"
	"github.com/igor1309/ai-labs/agister/runstore"
	"github.com/igor1309/ai-labs/agister/runtime/claudecode"
	"github.com/igor1309/ai-labs/gokit/clocktest"
)

// talkWorkflow is the workflow "talk" of session.feature: the step
// "first", then "second", continuing "first"'s session, each "ask" on
// "claude-opus" given q; then each of more.
func talkWorkflow(more ...string) string {
	talk := `schema: agister.workflow/v1alpha1
params:
  q: {}
steps:
  - {name: first, process: ask, agent: claude-opus, inputs: {q: {from: params.q}}}
  - {name: second, process: ask, agent: claude-opus, session: {from: steps.first.session}, inputs: {q: {from: params.q}}}
`
	for _, step := range more {
		talk += step + "\n"
	}
	return talk
}

// newSessionFixture is the run fixture of session.feature: the settings
// of record.feature, home's prompt "continuation" "c", and the workflow
// talk; claude-code completing, its session "s1", the turn of no session,
// "first"'s, answered after first.
func newSessionFixture(t *testing.T, talk string, first func()) *runFixture {
	t.Helper()
	f := newRecordFixture(t, modelSettings(t, map[string]string{
		"/u/.agister/prompts/continuation.md": "c",
		"/r/.agister/workflows/talk.yaml":     talk,
	}), nil)
	reply := claudeReply(claudecode.Reply{Output: []byte(`{"ok":true}`), Session: "s1"})
	f.runtimes.claude.answer = func(ctx context.Context, turn claudecode.Turn) (claudecode.Result, error) {
		if turn.Session == "" && first != nil {
			first()
		}
		return reply(ctx, turn)
	}
	f.validator = &validatorSpy{}
	return f
}

// continuesOf is the id of the call each recorded call continues, "" for
// none, by its step.
func continuesOf(calls []runstore.Call) map[string]string {
	continues := map[string]string{}
	for _, c := range calls {
		continues[c.Step] = ""
		if c.Continues != nil {
			continues[c.Step] = *c.Continues
		}
	}
	return continues
}

// session.feature, "A step resumes the session of the step it names".
//
// Contract test: the files home holds, as Agister ships them.
func TestAStepResumesTheSessionOfTheStepItNames(t *testing.T) {
	t.Parallel()
	f := newSessionFixture(t, talkWorkflow(), nil)
	got := f.run(t, "/r", "run", "talk", "--param", "q=why")
	if got.stderr != "" || got.code != 0 {
		t.Fatalf("stderr %q, exit %d; want none, 0", got.stderr, got.code)
	}
	ran := f.runtimes.claude.ran()
	continued := "## q\n\nwhy\n\n## continuation\n\nc\n\n## prompt\n\np\n\n## g\n\nrules"
	if len(ran) != 2 || ran[0].Session != "" || ran[0].Message != askMessage || ran[1].Session != "s1" || ran[1].Message != continued {
		t.Fatalf("ran %+v; want first of no session, then second of s1, its message %q", ran, continued)
	}
	want := map[string]string{"first": "", "second": recordID + "/first"}
	if got := continuesOf(f.store.last(t).Calls); !maps.Equal(got, want) {
		t.Errorf("the record's calls continue %v, want %v", got, want)
	}
}

// session.feature, "The session's latest call is the last that went on in
// it".
//
// Contract test: the files home holds, as Agister ships them.
func TestTheSessionsLatestCallIsTheLastThatWentOnInIt(t *testing.T) {
	t.Parallel()
	f := newSessionFixture(t, talkWorkflow(
		"  - {name: third, process: ask, agent: claude-opus, session: {from: steps.first.session}, inputs: {q: {from: params.q}}}"), nil)
	got := f.run(t, "/r", "run", "talk", "--param", "q=why")
	if got.stderr != "" || got.code != 0 {
		t.Fatalf("stderr %q, exit %d; want none, 0", got.stderr, got.code)
	}
	if sessions := sessionsRan(f); !slices.Equal(sessions, []string{"", "s1", "s1"}) {
		t.Errorf("ran turns of the sessions %q, want none, then s1 twice", sessions)
	}
	want := map[string]string{"first": "", "second": recordID + "/first", "third": recordID + "/second"}
	if got := continuesOf(f.store.last(t).Calls); !maps.Equal(got, want) {
		t.Errorf("the record's calls continue %v, want %v", got, want)
	}
}

// session.feature, "The worktree is checked against what the latest call
// left": a step continuing a session is not asked a clean worktree.
//
// Contract test: the files home holds, as Agister ships them.
func TestTheWorktreeIsCheckedAgainstWhatTheLatestCallLeft(t *testing.T) {
	t.Parallel()
	var f *runFixture
	f = newSessionFixture(t, talkWorkflow(), func() { f.holding.write("t2") })
	f.settings["/r/.agister/processes/ask.yaml"] = askProcess + "workspace:\n  clean: true\n"
	got := f.run(t, "/r", "run", "talk", "--param", "q=why")
	if got.stderr != "" || got.code != 0 {
		t.Fatalf("stderr %q, exit %d; want none, 0", got.stderr, got.code)
	}
	if sessions := sessionsRan(f); !slices.Equal(sessions, []string{"", "s1"}) {
		t.Errorf("ran turns of the sessions %q, want none, then s1", sessions)
	}
}

// session.feature, "A worktree changed since the latest call refuses the
// step".
//
// Contract test: the files home holds, as Agister ships them.
func TestAWorktreeChangedSinceTheLatestCallRefusesTheStep(t *testing.T) {
	t.Parallel()
	f := newSessionFixture(t, talkWorkflow(), nil)
	f.holding.contents = []string{"t1", "t2"}
	got := f.run(t, "/r", "run", "talk", "--param", "q=why")
	p := modelPrintedOf(t, got)
	const why = "the worktree is not as the session's latest call left it"
	if got.code != 1 || p.Status != "failed" || p.Class == nil || *p.Class != "refused" || p.Reason == nil || *p.Reason != why {
		t.Errorf("printed %+v, exit %d; want failed, refused, %q, and 1", p, got.code, why)
	}
	if sessions := sessionsRan(f); !slices.Equal(sessions, []string{""}) {
		t.Errorf("ran turns of the sessions %q, want first's alone", sessions)
	}
}

// session.feature, "A session's steps are not taken by a reuse".
//
// Contract test: the files home holds, as Agister ships them.
func TestASessionsStepsAreNotTakenByAReuse(t *testing.T) {
	t.Parallel()
	f := newSessionFixture(t, talkWorkflow(), nil)
	kept := func(step string) runstore.Call {
		call := keptCall("R1/"+step, "t1", "s1")
		call.Step, call.Inputs = step, []runstore.Input{{Name: "q", Value: "why", Identity: identity("why")}}
		return call
	}
	f.store.kept = map[string]runstore.Record{"R1": {Schema: runstore.Schema, ID: "R1", Status: "completed",
		Request: runstore.Request{Workflow: "talk", Params: map[string]string{"q": "why"}, Dir: "/r"},
		Calls:   []runstore.Call{kept("first"), kept("second")}}}
	got := f.run(t, "/r", "run", "talk", "--param", "q=why", "--reuse", "R1")
	if got.stderr != "" || got.code != 0 {
		t.Fatalf("stderr %q, exit %d; want none, 0", got.stderr, got.code)
	}
	if sessions := sessionsRan(f); !slices.Equal(sessions, []string{"", "s1"}) {
		t.Errorf("ran turns of the sessions %q, want none, then s1", sessions)
	}
	calls := f.store.last(t).Calls
	for _, c := range calls {
		if c.Reuses != nil {
			t.Errorf("the record's call %q reuses %q, want made", c.ID, *c.Reuses)
		}
	}
	want := map[string]string{"first": "", "second": recordID + "/first"}
	if got := continuesOf(calls); !maps.Equal(got, want) {
		t.Errorf("the record's calls continue %v, want %v", got, want)
	}
}

// session.feature, "A run whose prompt "continuation" does not resolve is
// refused"; a workflow none of whose steps continues a session runs
// without it.
//
// Contract test: the files home holds, as Agister ships them.
func TestARunWhosePromptContinuationDoesNotResolveIsRefused(t *testing.T) {
	t.Parallel()
	t.Run("a step continuing a session", func(t *testing.T) {
		t.Parallel()
		f := newSessionFixture(t, talkWorkflow(), nil)
		f.runtimes.claude.answer = nil
		delete(f.settings, "/u/.agister/prompts/continuation.md")
		got := f.run(t, "/r", "run", "talk", "--param", "q=why")
		want := ran{stderr: "agister: the run is refused, and nothing runs:\n  " +
			`the prompt "continuation" does not resolve: no layer holds the prompt "continuation"` + "\n", code: 1}
		if got != want {
			t.Errorf("ran %+v, want %+v", got, want)
		}
		if _, records, events := f.store.given(); len(records) > 0 || len(events) > 0 {
			t.Errorf("runstore was given the records %+v and the events %+v, want nothing", records, events)
		}
	})
	t.Run("no step continuing a session", func(t *testing.T) {
		t.Parallel()
		f := newSessionFixture(t, `schema: agister.workflow/v1alpha1
params:
  q: {}
steps:
  - {name: first, process: ask, agent: claude-opus, inputs: {q: {from: params.q}}}
`, nil)
		delete(f.settings, "/u/.agister/prompts/continuation.md")
		if got := f.run(t, "/r", "run", "talk", "--param", "q=why"); got.stderr != "" || got.code != 0 {
			t.Errorf("stderr %q, exit %d; want none, 0", got.stderr, got.code)
		}
	})
}

// A step's call given a session no call of the run went on in is refused,
// not admitted.
func TestAStepGivenASessionNoCallWentOnInIsRefused(t *testing.T) {
	t.Parallel()
	resolver, err := inputs.New(map[string]inputs.Source{"param": inputs.ParamSource{}}, briefPaths{paths: &sourcesSpy{}})
	if err != nil {
		t.Fatal(err)
	}
	admits := &admissionSpy{}
	steps, err := newStepCalls(resolver, admits, map[string]turnCaller{"bash/1": &turnSpy{result: call.Result{Status: call.Completed}}},
		clocktest.NewClock(runStart), map[string]plannedCall{"b": sayCall("x")}, &callsSpy{})
	if err != nil {
		t.Fatal(err)
	}
	got := steps.Call(context.Background(), "b", map[string]string{"what": "hi"}, "s9", func(workflow.Report) {})
	if got.Class != workflow.Refused || got.Reason != `no call of the run went on in the session "s9"` || len(admits.asked()) > 0 {
		t.Errorf("ended %q, %q, admission asked %+v; want refused, no call of the run went on in the session \"s9\", none asked",
			got.Class, got.Reason, admits.asked())
	}
}
