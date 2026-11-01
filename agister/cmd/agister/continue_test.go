package main

import (
	"maps"
	"slices"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/runstore"
	"github.com/igor1309/ai-labs/agister/runtime/claudecode"
)

// keptCall is the call runstore keeps as id: of the process "ask" on
// "claude-opus", in "/r", at HEAD "c1", its content content and its
// session session, "" for none.
func keptCall(id, content, session string) runstore.Call {
	call := runstore.Call{ID: id, Step: "ask", Process: "ask", Agent: "claude-opus", Root: "/r", Head: "c1", Content: content,
		Result: runstore.CallResult{Outcome: runstore.Outcome{Status: "completed"}}}
	if session != "" {
		call.Result.Session = &session
	}
	return call
}

// keptRun is the record of the run id, holding calls.
func keptRun(id string, calls ...runstore.Call) runstore.Record {
	return runstore.Record{Schema: runstore.Schema, ID: id, Status: "completed", Calls: calls}
}

// newContinueFixture is the record fixture of continue.feature: the
// settings of record.feature, home's prompt "continuation" "c";
// runstore keeping the run "R1", its one call "R1/ask" of the content
// "t1" and the session "s1"; claude-code completing, its session "s1".
func newContinueFixture(t *testing.T) *runFixture {
	t.Helper()
	f := newRecordFixture(t, modelSettings(t, map[string]string{"/u/.agister/prompts/continuation.md": "c"}), nil)
	f.store.kept = map[string]runstore.Record{"R1": keptRun("R1", keptCall("R1/ask", "t1", "s1"))}
	f.runtimes.claude.answer = claudeReply(claudecode.Reply{Output: []byte(`{"ok":true}`), Session: "s1"})
	f.validator = &validatorSpy{}
	return f
}

// continueArgs is "agister run --process ask --agent claude-opus --param
// q=more --continue R1".
var continueArgs = []string{"run", "--process", "ask", "--agent", "claude-opus", "--param", "q=more", "--continue", "R1"}

// sessionsRan is the session each turn claude-code ran was given, in
// order.
func sessionsRan(f *runFixture) []string {
	var sessions []string
	for _, turn := range f.runtimes.claude.ran() {
		sessions = append(sessions, turn.Session)
	}
	return sessions
}

// continue.feature, "A continuation resumes its call's session".
//
// Contract test: the files home holds, as Agister ships them.
func TestAContinuationResumesItsCallsSession(t *testing.T) {
	t.Parallel()
	f := newContinueFixture(t)
	got := f.run(t, "/r", continueArgs...)
	if got.stderr != "" || got.code != 0 {
		t.Fatalf("stderr %q, exit %d; want none, 0", got.stderr, got.code)
	}
	ran := f.runtimes.claude.ran()
	want := "## q\n\nmore\n\n## continuation\n\nc\n\n## prompt\n\np\n\n## g\n\nrules"
	if len(ran) != 1 || ran[0].Session != "s1" || ran[0].Message != want {
		t.Fatalf("ran %+v, want one turn, its session s1, its message %q", ran, want)
	}
	last := f.store.last(t)
	if c := last.Request.Continue; c == nil || *c != "R1" {
		t.Errorf("the record's request continues %v, want R1", c)
	}
	if len(last.Calls) != 1 || last.Calls[0].Continues == nil || *last.Calls[0].Continues != "R1/ask" {
		t.Errorf("the record's calls %+v, want one, continuing R1/ask", last.Calls)
	}
}

// continue.feature, "A continuation resumes from the session's latest
// call". The ids of the runs in name order are oldest first.
//
// Contract test: the files home holds, as Agister ships them.
func TestAContinuationResumesFromTheSessionsLatestCall(t *testing.T) {
	t.Parallel()
	f := newContinueFixture(t)
	r2 := keptCall("R2/ask", "t2", "s1")
	continues := "R1/ask"
	r2.Continues = &continues
	f.store.kept["R2"] = keptRun("R2", r2)
	f.holding.content = "t2"
	got := f.run(t, "/r", continueArgs...)
	if got.stderr != "" || got.code != 0 {
		t.Fatalf("stderr %q, exit %d; want none, 0", got.stderr, got.code)
	}
	if sessions := sessionsRan(f); !slices.Equal(sessions, []string{"s1"}) {
		t.Errorf("ran turns of the sessions %q, want one of s1", sessions)
	}
	if calls := f.store.last(t).Calls; len(calls) != 1 || calls[0].Continues == nil || *calls[0].Continues != "R2/ask" {
		t.Errorf("the record's calls %+v, want one, continuing R2/ask", calls)
	}
}

// continue.feature, "A continuation is not asked a clean worktree".
//
// Contract test: the files home holds, as Agister ships them.
func TestAContinuationIsNotAskedACleanWorktree(t *testing.T) {
	t.Parallel()
	f := newContinueFixture(t)
	f.settings["/r/.agister/processes/ask.yaml"] = askProcess + "workspace:\n  clean: true\n"
	f.holding.clean = false
	got := f.run(t, "/r", continueArgs...)
	if got.stderr != "" || got.code != 0 {
		t.Fatalf("stderr %q, exit %d; want none, 0", got.stderr, got.code)
	}
	if sessions := sessionsRan(f); !slices.Equal(sessions, []string{"s1"}) {
		t.Errorf("ran turns of the sessions %q, want one of s1", sessions)
	}
}

// rootsSpy is a spy of layout's worktree root over each of its roots, as
// rootSpy is over one.
type rootsSpy []rootSpy

func (s rootsSpy) Root(dir string) (string, error) {
	for _, spy := range s {
		if root, _ := spy.Root(dir); root != "" {
			return root, nil
		}
	}
	return "", nil
}

// continue.feature, "A continuation that does not hold is refused". A
// request of "ask" gives q, which it has no default for; the settings of
// "/r" are those of "/s" too, where git gives "/s" its root.
//
// Contract test: the files home holds, as Agister ships them.
func TestAContinuationThatDoesNotHoldIsRefused(t *testing.T) {
	t.Parallel()
	for _, c := range []struct {
		name    string
		given   func(f *runFixture)
		request string
		run     string
		dir     string
		what    string
	}{
		{"a workflow of two steps", func(f *runFixture) { maps.Copy(f.settings, runSettings(t, nil)) },
			"pair", "R1", "/r", "a continuation runs one step, not 2"},
		{"a run not kept", func(*runFixture) {},
			"--process ask --agent claude-opus --param q=more", "R9", "/r", `no run "R9" is kept`},
		{"a run of two calls", func(f *runFixture) {
			f.store.kept["R1"] = keptRun("R1", keptCall("R1/ask", "t1", "s1"), keptCall("R1/more", "t1", "s2"))
		}, "--process ask --agent claude-opus --param q=more", "R1", "/r", `"R1" is not a run of one call`},
		{"a call of no session", func(f *runFixture) { f.store.kept["R1"] = keptRun("R1", keptCall("R1/ask", "t1", "")) },
			"--process ask --agent claude-opus --param q=more", "R1", "/r", `"R1/ask" has no session`},
		{"another agent", func(*runFixture) {},
			"--process ask --agent codex-sol-61 --param q=more", "R1", "/r", `"R1/ask" ran on "claude-opus"`},
		{"another worktree", func(f *runFixture) {
			f.roots = rootsSpy{{root: "/r"}, {root: "/s"}}
			for name, content := range f.settings {
				if rest, ok := strings.CutPrefix(name, "/r/"); ok {
					f.settings["/s/"+rest] = content
				}
			}
		}, "--process ask --agent claude-opus --param q=more", "R1", "/s", `"R1/ask" worked in "/r"`},
		{"another HEAD", func(f *runFixture) { f.holding.head = "c2" },
			"--process ask --agent claude-opus --param q=more", "R1", "/r", `HEAD is "c2", not "R1/ask"'s "c1"`},
		{"another content", func(f *runFixture) { f.holding.content = "t2" },
			"--process ask --agent claude-opus --param q=more", "R1", "/r", `the worktree is not as "R1/ask" left it`},
		{"a content not recorded", func(f *runFixture) {
			f.store.kept["R1"] = keptRun("R1", keptCall("R1/ask", "", "s1"))
			f.holding.content = ""
		}, "--process ask --agent claude-opus --param q=more", "R1", "/r", `the worktree is not as "R1/ask" left it`},
		{"no prompt continuation", func(f *runFixture) { delete(f.settings, "/u/.agister/prompts/continuation.md") },
			"--process ask --agent claude-opus --param q=more", "R1", "/r", `the prompt "continuation" does not resolve: no layer holds the prompt "continuation"`},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			f := newContinueFixture(t)
			f.runtimes.claude.answer = nil
			c.given(f)
			args := append(append([]string{"run"}, strings.Fields(c.request)...), "--continue", c.run)
			got := f.run(t, c.dir, args...)
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
