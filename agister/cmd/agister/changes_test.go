package main

import (
	"context"
	"errors"
	"slices"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/runstore"
	"github.com/igor1309/ai-labs/agister/runtime/claudecode"
)

const fixProcess = `schema: agister.process/v1alpha1
prompt: ask
params:
  base: {}
inputs:
  base: {source: git.revision, rev: {from: params.base}}
workspace:
  access: read-write
  revision: {from: inputs.base}
`

// newChangesFixture is changes.feature's composition with wrapper spies.
func newChangesFixture(t *testing.T) *runFixture {
	t.Helper()
	f := newRecordFixture(t, modelSettings(t, map[string]string{
		"/r/.agister/processes/fix.yaml":      fixProcess,
		"/u/.agister/prompts/continuation.md": "c",
	}), nil)
	f.sources.commits = map[string]string{"main": "c1"}
	f.holding.patch = "d1"
	f.runtimes.claude.answer = func(ctx context.Context, turn claudecode.Turn) (claudecode.Result, error) {
		f.holding.mu.Lock()
		f.holding.head, f.holding.content = "c2", "t2"
		f.holding.mu.Unlock()
		return claudeReply(claudecode.Reply{Text: "done", Session: "s1"})(ctx, turn)
	}
	return f
}

func fixArgs() []string {
	return []string{"run", "--process", "fix", "--agent", "claude-opus", "--param", "base=main"}
}

// changes.feature, "A pinned call's patch is written, and named in its
// entry", and "An empty change is an empty patch".
// Contract test: the files home holds, as Agister ships them.
func TestAPinnedCallsChangesAreRecorded(t *testing.T) {
	t.Parallel()
	for _, patch := range []string{"d1", ""} {
		t.Run("patch="+patch, func(t *testing.T) {
			t.Parallel()
			f := newChangesFixture(t)
			f.holding.patch = patch
			got := f.run(t, "/r", fixArgs()...)
			if got.code != 0 || got.stderr != "" {
				t.Fatalf("ran %+v", got)
			}
			c := f.store.last(t).Calls[0]
			path := recordID + "/patches/fix.patch"
			if c.Head != "c1" || c.EndHead == nil || *c.EndHead != "c2" || c.Content != "t2" || c.Patch == nil || *c.Patch != path {
				t.Fatalf("call %+v", c)
			}
			if data, ok := f.store.patches[path]; !ok || data != patch {
				t.Errorf("patch %q, present %v; want %q", data, ok, patch)
			}
			if !slices.Equal(f.holding.changesAsked, []string{"/r c1 t2"}) {
				t.Errorf("changes asked %q", f.holding.changesAsked)
			}
			if len(f.store.patchesMissingAtWrite) != 0 {
				t.Errorf("record named unwritten patches %q", f.store.patchesMissingAtWrite)
			}
			if !slices.Equal(f.store.patchWrites, []string{path}) {
				t.Errorf("patch writes %q", f.store.patchWrites)
			}
		})
	}
}

// changes.feature, "An unpinned call keeps no patch".
// Contract test: the files home holds, as Agister ships them.
func TestAnUnpinnedCallKeepsNoPatch(t *testing.T) {
	t.Parallel()
	f := newChangesFixture(t)
	f.runtimes.claude.answer = func(ctx context.Context, turn claudecode.Turn) (claudecode.Result, error) {
		f.holding.mu.Lock()
		f.holding.head, f.holding.content = "c2", "t2"
		f.holding.mu.Unlock()
		return claudeReply(claudecode.Reply{Output: []byte(`{"ok":true}`), Session: "s1"})(ctx, turn)
	}
	got := f.run(t, "/r", "run", "--process", "ask", "--agent", "claude-opus", "--param", "q=why")
	if got.code != 0 || got.stderr != "" {
		t.Fatalf("ran %+v", got)
	}
	c := f.store.last(t).Calls[0]
	if c.EndHead == nil || *c.EndHead != "c2" || c.Patch != nil || len(f.holding.changesAsked) != 0 || len(f.store.patchWrites) != 0 {
		t.Errorf("call %+v, changes %q, writes %q", c, f.holding.changesAsked, f.store.patchWrites)
	}
}

// changes.feature, "A patch not made is a warning, the call kept".
// Contract test: the files home holds, as Agister ships them.
func TestAPatchNotMadeIsAWarningTheCallKept(t *testing.T) {
	t.Parallel()
	for _, fault := range []string{"changes", "content", "write"} {
		t.Run(fault, func(t *testing.T) {
			t.Parallel()
			f := newChangesFixture(t)
			broken := errors.New("broken " + fault)
			switch fault {
			case "changes":
				f.holding.changesErr = broken
			case "content":
				f.holding.contentErr = broken
			case "write":
				f.store.failPatch = broken
			}
			got := f.run(t, "/r", fixArgs()...)
			if got.code != 0 || got.stderr != "" {
				t.Fatalf("ran %+v", got)
			}
			record := f.store.last(t)
			if record.Calls[0].Patch != nil || record.Calls[0].Result.Status != "completed" {
				t.Errorf("call %+v", record.Calls[0])
			}
			for _, warnings := range [][]string{record.Result.Warnings, printedOf(t, got).Warnings} {
				if len(warnings) != 1 || !strings.Contains(warnings[0], `patch of "fix"`) || !strings.Contains(warnings[0], broken.Error()) {
					t.Errorf("warnings %q", warnings)
				}
			}
		})
	}
}

// changes.feature, "A step that commits is continued".
// Contract test: the files home holds, as Agister ships them.
func TestAStepThatCommitsIsContinued(t *testing.T) {
	t.Parallel()
	f := newChangesFixture(t)
	f.settings["/r/.agister/workflows/pair.yaml"] = `schema: agister.workflow/v1alpha1
params:
  base: {}
  q: {}
steps:
  - {name: fix, process: fix, agent: claude-opus, inputs: {base: {from: params.base}}}
  - {name: check, process: ask, agent: claude-opus, session: {from: steps.fix.session}, inputs: {q: {from: params.q}}}
`
	reply := f.runtimes.claude.answer
	f.runtimes.claude.answer = func(ctx context.Context, turn claudecode.Turn) (claudecode.Result, error) {
		if turn.Session != "" {
			return claudeReply(claudecode.Reply{Output: []byte(`{"ok":true}`), Session: turn.Session})(ctx, turn)
		}
		return reply(ctx, turn)
	}
	got := f.run(t, "/r", "run", "pair", "--param", "base=main", "--param", "q=why")
	if got.code != 0 || got.stderr != "" {
		t.Fatalf("ran %+v", got)
	}
	if sessions := sessionsRan(f); !slices.Equal(sessions, []string{"", "s1"}) {
		t.Errorf("sessions %q", sessions)
	}
	calls := f.store.last(t).Calls
	if len(calls) != 2 || calls[1].Head != "c2" || calls[1].Content != "t2" || calls[1].Continues == nil || *calls[1].Continues != recordID+"/fix" {
		t.Errorf("calls %+v", calls)
	}
}

// changes.feature, "A continuation is checked against the HEAD left".
// Contract test: the files home holds, as Agister ships them.
func TestAContinuationIsCheckedAgainstTheHeadLeft(t *testing.T) {
	t.Parallel()
	for _, endHead := range []*string{nil, textPointer("c2"), textPointer("")} {
		t.Run("end_head="+headLabel(endHead), func(t *testing.T) {
			t.Parallel()
			f := newContinueFixture(t)
			kept := keptCall("R1/ask", "t2", "s1")
			kept.Head, kept.EndHead = "c1", endHead
			if endHead == nil {
				kept.Head = "c2"
			}
			f.store.kept["R1"] = keptRun("R1", kept)
			f.holding.head, f.holding.content = "c2", "t2"
			got := f.run(t, "/r", continueArgs...)
			if endHead != nil && *endHead == "" {
				if got.code != 1 || len(sessionsRan(f)) != 0 {
					t.Fatalf("ran %+v", got)
				}
				return
			}
			if got.code != 0 || got.stderr != "" || !slices.Equal(sessionsRan(f), []string{"s1"}) {
				t.Fatalf("ran %+v, sessions %q", got, sessionsRan(f))
			}
		})
	}
}

func textPointer(text string) *string { return &text }
func headLabel(head *string) string {
	if head == nil {
		return "absent"
	}
	return *head
}

// changes.feature, "A call taken by a reuse keeps its earlier patch,
// copied". A patch that cannot be copied warns and leaves no foreign path.
// Contract test: the files home holds, as Agister ships them.
func TestAReusedCallsPatchIsCopied(t *testing.T) {
	t.Parallel()
	for _, fault := range []string{"", "read", "write"} {
		t.Run("fault="+fault, func(t *testing.T) {
			t.Parallel()
			f := newChangesFixture(t)
			f.holding.head, f.holding.content = "c2", "t2"
			earlier := keptCall("R1/fix", "t2", "s1")
			earlier.Step, earlier.Process, earlier.EndHead, earlier.Patch = "fix", "fix", textPointer("c2"), textPointer("R1/patches/fix.patch")
			earlier.Inputs = []runstore.Input{{Name: "base", Value: "c1", Identity: "c1"}}
			earlier.Definitions = []runstore.Definition{
				definitionAt(f.settings, "agent", "claude-opus", "home", "/u/.agister/agents/claude-opus.toml"),
				definitionAt(f.settings, "process", "fix", "repository", "/r/.agister/processes/fix.yaml"),
				definitionAt(f.settings, "prompt", "ask", "repository", "/r/.agister/prompts/ask.md"),
				definitionAt(f.settings, "runtime", "claude-code", "home", "/u/.agister/runtimes/claude-code.yaml"),
			}
			f.store.kept = map[string]runstore.Record{"R1": keptRun("R1", earlier)}
			record := f.store.kept["R1"]
			record.Request.Process, record.Request.Agent = "fix", "claude-opus"
			f.store.kept["R1"] = record
			f.store.patches = map[string]string{"R1/patches/fix.patch": "earlier patch"}
			if fault == "read" {
				delete(f.store.patches, "R1/patches/fix.patch")
			}
			if fault == "write" {
				f.store.failPatch = errors.New("disk full")
			}
			got := f.run(t, "/r", append(fixArgs(), "--reuse", "R1")...)
			if got.code != 0 || got.stderr != "" {
				t.Fatalf("ran %+v", got)
			}
			c := f.store.last(t).Calls[0]
			if c.Reuses == nil || *c.Reuses != "R1/fix" || len(f.runtimes.claude.ran()) != 0 || len(f.holding.changesAsked) != 0 {
				t.Fatalf("call %+v, turns %v, changes %q", c, f.runtimes.claude.ran(), f.holding.changesAsked)
			}
			path := recordID + "/patches/fix.patch"
			if fault == "" {
				if c.Patch == nil || *c.Patch != path || f.store.patches[path] != "earlier patch" {
					t.Errorf("call %+v, patches %q", c, f.store.patches)
				}
			} else if c.Patch != nil || len(printedOf(t, got).Warnings) != 1 {
				t.Errorf("call %+v, warnings %q", c, printedOf(t, got).Warnings)
			}
		})
	}
}

// A reuse checks the end HEAD, falling back only for a legacy entry.
func TestReuseChecksTheHeadLeft(t *testing.T) {
	t.Parallel()
	for _, c := range []struct {
		name, head string
		endHead    *string
		reused     bool
	}{
		{"committed", "c0", textPointer("c1"), true},
		{"legacy", "c1", nil, true},
		{"unreadable", "c1", textPointer(""), false},
		{"changed", "c1", textPointer("c2"), false},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			earlier := keptCall("R1/fix", "t1", "s1")
			earlier.Step, earlier.Process = "fix", "fix"
			earlier.Head, earlier.EndHead = c.head, c.endHead
			earlier.Definitions = []runstore.Definition{{Kind: "process", Name: "fix", Files: []runstore.File{{Layer: "home", Path: "/h/fix.yaml", Digest: "d1"}}}}
			reuse := reusable{calls: []runstore.Call{earlier}, root: "/r",
				facts: &holdingSpy{root: "/r", head: "c1", content: "t1"}}
			got, taken, err := reuse.taken(context.Background(), endedCall{step: "fix", process: "fix", agent: "claude-opus", definitions: earlier.Definitions})
			if err != nil || taken != c.reused || taken && got.ID != "R1/fix" {
				t.Errorf("call %+v, taken %v, error %v; want taken %v", got, taken, err, c.reused)
			}
		})
	}
}
