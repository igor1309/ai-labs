package main

import (
	"context"
	"reflect"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/core/call"
	"github.com/igor1309/ai-labs/agister/runstore"
	"github.com/igor1309/ai-labs/agister/runtime/claudecode"
	"github.com/igor1309/ai-labs/agister/settings/resolve"
)

// recoverySettings are the settings of recovery.feature: progress.feature's,
// the process "ask" given the staleness limit no_event 1m and a recovery of
// 1 resume, "Go on.".
func recoverySettings(t *testing.T) map[string]string {
	t.Helper()
	return modelSettings(t, map[string]string{"/r/.agister/processes/ask.yaml": askProcess +
		"limits: {stale: {no_event: 1m}}\nrecovery: {resumes: 1, instruction: Go on.}\n"})
}

// recovery.feature, "A process's recovery reaches core's step".
//
// Contract test: the files home holds, as Agister ships them.
func TestAProcesssRecoveryReachesCoresStep(t *testing.T) {
	t.Parallel()
	wrappers, err := newContracts(claudeCodeFacts(newRuntimesSpy(t).claude))
	if err != nil {
		t.Fatal(err)
	}
	read, err := readSettings("/u/.agister", "/r", newFilesystemSpy(recoverySettings(t)), rootSpy{root: "/r"}, wrappers)
	if err != nil {
		t.Fatal(err)
	}
	resolved, faults := read.resolver.Resolve(resolve.Step("ask", "claude-opus").WithParams("q"))
	if len(faults) > 0 {
		t.Fatalf("faults %+v", faults)
	}
	built, unrun, err := planOf("", resolved, read.documents, map[string]call.Inputs{"claude-code/3": call.InMessage})
	if err != nil || len(unrun) > 0 {
		t.Fatalf("not run %q, error %v", unrun, err)
	}
	if got, want := built.calls["ask"].step.Recovery, (call.Recovery{Resumes: 1, Instruction: "Go on."}); got != want {
		t.Errorf("core's step has the recovery %+v, want %+v", got, want)
	}
}

// recovery.feature, "A recovered turn is a progress line and an event":
// the first turn, quiet once it has reported its session, goes stale and
// is ended; the recovery turn resumes that session, its message the
// instruction, a blank line, then what went stale.
//
// Contract test: the files home holds, as Agister ships them.
func TestARecoveredTurnIsAProgressLineAndAnEvent(t *testing.T) {
	t.Parallel()
	f := newRunFixture(t, recoverySettings(t), nil)
	f.runtimes.claude.answer = func(ctx context.Context, turn claudecode.Turn) (claudecode.Result, error) {
		if turn.Session == "" {
			f.clock.Started(time.Minute)
			f.clock.Advance(time.Minute)
			<-ctx.Done()
			return claudecode.Result{Ended: claudecode.Ended{Signal: "SIGTERM"}, Session: "s1"}, nil
		}
		return claudecode.Result{Session: "s1", Reply: &claudecode.Reply{Output: []byte(`{"ok":true}`), Session: "s1"}}, nil
	}
	got := f.run(t, "/r", "run", "--process", "ask", "--agent", "claude-opus", "--param", "q=why")
	if got.stderr != "" || got.code != 0 {
		t.Fatalf("stderr %q, exit %d; want nothing but progress, 0", got.stderr, got.code)
	}
	want := "· ask: started on claude-opus\n" +
		"· ask: stale: no event for 1m; recovering\n" +
		"· ask: ended completed in 1m0s\n"
	if got.progress != want {
		t.Errorf("progress\n%s\nwant\n%s", got.progress, want)
	}
	turns := f.runtimes.claude.ran()
	if len(turns) != 2 || turns[0].Message != askMessage || turns[1].Session != "s1" || turns[1].Message != "Go on.\n\nno event for 1m" {
		t.Errorf("claude-code ran %+v, want the step's turn, then one resuming s1 with the message \"Go on.\\n\\nno event for 1m\"", turns)
	}
	var stale []storedEvent
	_, _, events := f.store.given()
	for _, e := range events {
		if e.event.Kind == runstore.Stale {
			stale = append(stale, e)
		}
	}
	wantStale := []storedEvent{{id: "20261016T100000Z-55fd36", event: runstore.Event{At: runStart.Add(time.Minute), Step: "ask", Kind: runstore.Stale,
		What: "no event for 1m", Recovering: true, Waiting: &runstore.Waiting{On: "recovery", Since: runStart.Add(time.Minute)}}}}
	if !reflect.DeepEqual(stale, wantStale) {
		t.Errorf("runstore was given the stale events\n%+v\nwant\n%+v", stale, wantStale)
	}
	if p := modelPrintedOf(t, got); p.Status != "completed" || !reflect.DeepEqual(p.Output, map[string]any{"output": map[string]any{"ok": true}}) ||
		!reflect.DeepEqual(p.Sessions, map[string]string{"ask": "s1"}) {
		t.Errorf("printed %+v, want completed, its output ok, its session s1", p)
	}
}

// recovery.feature, "home's implement recovers once".
//
// Contract test: the files home holds, as Agister ships them.
func TestHomesImplementRecoversOnce(t *testing.T) {
	t.Parallel()
	read, err := readSettings("/u/.agister", "/r", newFilesystemSpy(shippedHome(t)), rootSpy{root: "/r"}, wrappersSpy{})
	if err != nil {
		t.Fatal(err)
	}
	definition, problems := read.documents.Process("implement")
	if len(problems) > 0 {
		t.Fatalf("problems %+v", problems)
	}
	recovery := definition.Recovery.Value
	got := call.Recovery{Resumes: recovery.Resumes.Value, Instruction: recovery.Instruction.Value}
	want := call.Recovery{Resumes: 1, Instruction: "Your last turn was ended: it stopped making progress, as said below. " +
		"Its work is in the worktree. Go on with the task another way."}
	if !definition.Recovery.Given || got != want {
		t.Errorf("the recovery %+v, given %t; want %+v", got, definition.Recovery.Given, want)
	}
}
