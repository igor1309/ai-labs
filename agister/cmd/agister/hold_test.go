package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io/fs"
	"maps"
	"reflect"
	"slices"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/core/admit"
	"github.com/igor1309/ai-labs/agister/core/call"
	"github.com/igor1309/ai-labs/agister/core/inputs"
	"github.com/igor1309/ai-labs/agister/core/workflow"
	"github.com/igor1309/ai-labs/agister/files"
	"github.com/igor1309/ai-labs/agister/runstore"
	"github.com/igor1309/ai-labs/agister/runtime/claudecode"
	"github.com/igor1309/ai-labs/gokit/clocktest"
)

// lockOf is the lock file of the worktree whose root's path, links
// resolved, is resolved, under folder.
func lockOf(folder, resolved string) string {
	sum := sha256.Sum256([]byte(resolved))
	return folder + "/" + hex.EncodeToString(sum[:]) + ".lock"
}

// hold.feature, "The lock file is the user's, whatever home is". A
// writer, "say" declaring read-write access, holds alone; home's folder is
// "/h", and the settings are read there.
//
// Contract test: the files home holds, as Agister ships them.
func TestTheLockFileIsTheUsersWhateverHomeIs(t *testing.T) {
	t.Parallel()
	settings := map[string]string{}
	for name, content := range runSettings(t, map[string]string{
		"/u/.agister/processes/say.yaml": fmt.Sprintf(sayProcess, "", "workspace: {access: read-write}\n"),
	}) {
		settings["/h"+strings.TrimPrefix(name, "/u/.agister")] = content
	}
	f := newRunFixture(t, settings, echoes)
	got := f.runWatching(t, f.signals.watch, append(slices.Clone(environ), "AGISTER_HOME=/h"), "/r",
		"run", "--process", "say", "--agent", "bash", "--param", "what=hi")
	if got.stderr != "" || got.code != 0 {
		t.Fatalf("stderr %q, exit %d; want none, 0", got.stderr, got.code)
	}
	asked, alone, shared := f.holding.locks()
	if want := []lockAsked{{file: lockOf("/u/.agister/locks/in-place", "/r"), alone: true}}; !slices.Equal(asked, want) {
		t.Errorf("locks asked %+v, want %+v", asked, want)
	}
	if alone != 0 || shared != 0 {
		t.Errorf("%d held alone, %d shared after the run; want none", alone, shared)
	}
}

// The hold is the lock of the file named by the root's path with its
// links resolved, taken alone or shared as admit asks, and released by
// its release; a lock held is admit's ErrHeld, and any other error, a
// root whose links do not resolve among them, is not.
func TestTheHoldIsTheLockOfTheRootsResolvedPath(t *testing.T) {
	t.Parallel()
	links := &linksSpy{links: map[string]string{"/r": "/x/r"}, missing: []string{"/gone"}}
	for _, alone := range []bool{true, false} {
		spy := &holdingSpy{}
		release, err := worktreeHold{locks: spy, links: links, folder: "/l", root: "/r"}.Take(alone)
		if err != nil {
			t.Fatal(err)
		}
		asked, held, sharing := spy.locks()
		if want := []lockAsked{{file: lockOf("/l", "/x/r"), alone: alone}}; !slices.Equal(asked, want) || held+sharing != 1 {
			t.Errorf("alone %v: locks asked %+v, %d held; want %+v, one held", alone, asked, held+sharing, want)
		}
		release()
		if _, held, sharing := spy.locks(); held+sharing != 0 {
			t.Errorf("alone %v: %d held after the release, want none", alone, held+sharing)
		}
	}
	locked := &holdingSpy{lockErr: fmt.Errorf("/l/k.lock: %w", files.ErrLocked)}
	if _, err := (worktreeHold{locks: locked, links: links, folder: "/l", root: "/r"}).Take(true); !errors.Is(err, admit.ErrHeld) {
		t.Errorf("a lock held: %v, want admit's ErrHeld", err)
	}
	broken := &holdingSpy{lockErr: errors.New("broken")}
	if _, err := (worktreeHold{locks: broken, links: links, folder: "/l", root: "/r"}).Take(true); err == nil || errors.Is(err, admit.ErrHeld) {
		t.Errorf("a lock that fails: %v, want an error that is not ErrHeld", err)
	}
	if _, err := (worktreeHold{locks: &holdingSpy{}, links: links, folder: "/l", root: "/gone"}).Take(true); !errors.Is(err, fs.ErrNotExist) || errors.Is(err, admit.ErrHeld) {
		t.Errorf("a root that does not resolve: %v, want its error, not ErrHeld", err)
	}
}

// implementation is a reply home's schema "implementation" takes.
const implementation = `{"summary":"s","files_changed":[],"checks":[],"notes":"","open":[]}`

// hold.feature, "home's implement runs on claude-code, admitted and
// held": it pins its candidate, HEAD by default, asks a clean worktree
// and writes, so it holds the worktree alone while its turn runs.
//
// Contract test: the files home holds, as Agister ships them.
func TestHomesImplementRunsOnClaudeCodeAdmittedAndHeld(t *testing.T) {
	t.Parallel()
	f := newRunFixture(t, shippedHome(t), nil)
	f.sources.commits = map[string]string{"HEAD": "c1"}
	f.sources.files = map[string]string{"/r/s.md": stepBrief}
	f.sources.exist = []string{"/r/g.md"}
	var during []lockAsked
	var alone, shared int
	f.runtimes.claude.answer = func(context.Context, claudecode.Turn) (claudecode.Result, error) {
		during, alone, shared = f.holding.locks()
		return claudecode.Result{Reply: &claudecode.Reply{Output: []byte(implementation)}}, nil
	}
	got := f.run(t, "/r", "run", "--process", "implement", "--agent", "claude-opus", "--param", "brief=s.md")
	if got.stderr != "" || got.code != 0 {
		t.Fatalf("stderr %q, exit %d; want none, 0", got.stderr, got.code)
	}
	if ran := f.runtimes.claude.ran(); len(ran) != 1 || ran[0].Dir != "/r" {
		t.Errorf("claude-code ran %+v, want one turn in /r", ran)
	}
	want := []lockAsked{{file: lockOf("/u/.agister/locks/in-place", "/r"), alone: true}}
	if !slices.Equal(during, want) || alone != 1 || shared != 0 {
		t.Errorf("while the turn ran: locks asked %+v, %d held alone, %d shared; want %+v, one alone", during, alone, shared, want)
	}
	if asked, alone, shared := f.holding.locks(); !slices.Equal(asked, want) || alone != 0 || shared != 0 {
		t.Errorf("after the run: locks asked %+v, %d held alone, %d shared; want %+v, none held", asked, alone, shared, want)
	}
	if p := modelPrintedOf(t, got); p.Status != "completed" || !reflect.DeepEqual(p.Output["output"], map[string]any{
		"summary": "s", "files_changed": []any{}, "checks": []any{}, "notes": "", "open": []any{},
	}) {
		t.Errorf("printed %+v, want completed, the reply's output", p)
	}
}

// A step's call is admitted by what its process declares of the worktree,
// its pin the commit its git.revision input gives, and is made through
// admit; a pin from another source gives no commit. A call admit refuses
// ends failed, class "refused", its reason admit's, with its plan's
// warnings, and its turn is not taken. Each call is told to the records
// as it ends: its step, process and agent, its inputs, in the order its
// process declares them, the facts admit told of it, none for a call
// refused, and its result.
func TestAStepsCallIsAdmittedBeforeItIsMade(t *testing.T) {
	t.Parallel()
	sources := &sourcesSpy{root: "/r", commits: map[string]string{"main": "c1"}}
	resolver, err := inputs.New(sources.sourcing().sources("/r", "/r"), briefPaths{paths: sources})
	if err != nil {
		t.Fatal(err)
	}
	pinned := sayCall("x")
	pinned.process, pinned.agent = "say", "bash"
	pinned.declared.Inputs = append(pinned.declared.Inputs, inputs.Input{Name: "rev", Source: "git.revision", Arguments: map[string]inputs.Value{"rev": {Text: "main"}}})
	pinned.admission = admit.Request{Pin: &admit.Pin{Input: "rev", Source: "git.revision"}, Clean: true, Writer: true}
	byParam := sayCall("x")
	byParam.admission = admit.Request{Pin: &admit.Pin{Input: "what", Source: "param"}}
	calls := map[string]plannedCall{"pinned": pinned, "by param": byParam, "nothing": sayCall("x")}
	wants := map[string]admit.Request{
		"pinned":   {Pin: &admit.Pin{Input: "rev", Source: "git.revision", Commit: "c1"}, Clean: true, Writer: true},
		"by param": {Pin: &admit.Pin{Input: "what", Source: "param"}},
		"nothing":  {},
	}
	what := givenInput{name: "what", Fixed: inputs.Fixed{Value: "hi", Identity: identityOf("hi")}}
	given := map[string][]givenInput{
		"pinned":   {what, {name: "rev", Fixed: inputs.Fixed{Value: "c1", Identity: "c1"}}},
		"by param": {what},
		"nothing":  {what},
	}
	for _, name := range slices.Sorted(maps.Keys(calls)) {
		admits := &admissionSpy{facts: admit.Facts{Head: "c1", Content: "t1"}}
		spy := &turnSpy{result: call.Result{Status: call.Completed}}
		records := &callsSpy{}
		steps, err := newStepCalls(resolver, admits, map[string]turnCaller{"bash/1": spy}, clocktest.NewClock(runStart), calls, records, noDailyBudget)
		if err != nil {
			t.Fatal(err)
		}
		got := steps.Call(context.Background(), name, map[string]string{"what": "hi"}, "", discard)
		if got.Status != workflow.Completed || len(spy.steps) != 1 {
			t.Errorf("%s: gave %+v, called %d times; want completed, called once", name, got, len(spy.steps))
		}
		want := []endedCall{{step: name, process: calls[name].process, agent: calls[name].agent, inputs: given[name], environment: []runstore.Variable{}, facts: admits.facts, result: got}}
		if told := records.told(); !reflect.DeepEqual(told, want) {
			t.Errorf("%s: told the records %+v, want %+v", name, told, want)
		}
		if asked := admits.asked(); len(asked) != 1 || !reflect.DeepEqual(asked[0], wants[name]) {
			t.Errorf("%s: admit asked %+v, want %+v", name, asked, wants[name])
		}
	}

	admits := &admissionSpy{err: errors.New(`HEAD is "c0", not the pinned "c1"`), facts: admit.Facts{Head: "c1", Content: "t1"}}
	spy := &turnSpy{}
	records := &callsSpy{}
	steps, err := newStepCalls(resolver, admits, map[string]turnCaller{"bash/1": spy}, clocktest.NewClock(runStart), calls, records, noDailyBudget)
	if err != nil {
		t.Fatal(err)
	}
	got := steps.Call(context.Background(), "pinned", map[string]string{"what": "hi"}, "", discard)
	want := workflow.Result{Status: workflow.Failed, Class: workflow.Refused, Timing: workflow.Timing{Started: runStart, Ended: runStart},
		Reason: `HEAD is "c0", not the pinned "c1"`, Warnings: []string{"w"}}
	if !reflect.DeepEqual(got, want) || len(spy.steps) > 0 {
		t.Errorf("refused: gave %+v, called %+v; want %+v, no turn taken", got, spy.steps, want)
	}
	if told, want := records.told(), []endedCall{{step: "pinned", process: "say", agent: "bash", inputs: given["pinned"], environment: []runstore.Variable{}, result: want}}; !reflect.DeepEqual(told, want) {
		t.Errorf("refused: told the records %+v, want %+v, no facts", told, want)
	}
	if _, err := newStepCalls(resolver, nil, map[string]turnCaller{"bash/1": spy}, clocktest.NewClock(runStart), calls, &callsSpy{}, noDailyBudget); err == nil {
		t.Error("step calls built with no admission, want an error")
	}
	if _, err := newStepCalls(resolver, admits, map[string]turnCaller{"bash/1": spy}, clocktest.NewClock(runStart), calls, nil, noDailyBudget); err == nil {
		t.Error("step calls built with no records, want an error")
	}
}

// A process's workspace reaches admit as it declares it: read-write
// access holds alone and read-only shares; a clean worktree asked refuses
// a worktree that is not; and a revision pinned to a git.revision input
// refuses a HEAD that is not its commit.
//
// Contract test: the files home holds, as Agister ships them.
func TestAProcesssWorkspaceIsItsCallsAdmission(t *testing.T) {
	t.Parallel()
	const pinned = "  rev: {source: git.revision, rev: main}\nworkspace: {revision: {from: inputs.rev}}\n"
	cases := []struct {
		name, workspace string
		dirty           bool
		reason          string
		want            []lockAsked
	}{
		{name: "read-write", workspace: "workspace: {access: read-write}\n",
			want: []lockAsked{{file: lockOf("/u/.agister/locks/in-place", "/r"), alone: true}}},
		{name: "read-only", workspace: "workspace: {access: read-only, clean: false}\n",
			want: []lockAsked{{file: lockOf("/u/.agister/locks/in-place", "/r"), alone: false}}},
		{name: "clean asked of a dirty worktree", workspace: "workspace: {clean: true}\n", dirty: true,
			reason: "the worktree is not clean"},
		{name: "clean not asked of a dirty worktree", workspace: "", dirty: true,
			want: []lockAsked{{file: lockOf("/u/.agister/locks/in-place", "/r"), alone: false}}},
		{name: "pinned to HEAD's commit", workspace: pinned,
			want: []lockAsked{{file: lockOf("/u/.agister/locks/in-place", "/r"), alone: false}}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			f := newRunFixture(t, runSettings(t, map[string]string{
				"/u/.agister/processes/say.yaml": fmt.Sprintf(sayProcess, "", c.workspace),
			}), echoes)
			f.sources.commits = map[string]string{"main": "c1"}
			f.holding.clean = !c.dirty
			got := f.run(t, "/r", "run", "--process", "say", "--agent", "bash", "--param", "what=hi")
			if c.reason != "" {
				refusedRun(t, f, got, c.reason)
			} else if got.code != 0 || got.stderr != "" {
				t.Errorf("stderr %q, exit %d; want none, 0", got.stderr, got.code)
			}
			if asked, _, _ := f.holding.locks(); !slices.Equal(asked, c.want) {
				t.Errorf("locks asked %+v, want %+v", asked, c.want)
			}
		})
	}
	t.Run("pinned to another commit", func(t *testing.T) {
		t.Parallel()
		f := newRunFixture(t, runSettings(t, map[string]string{
			"/u/.agister/processes/say.yaml": fmt.Sprintf(sayProcess, "", pinned),
		}), echoes)
		f.sources.commits = map[string]string{"main": "c2"}
		refusedRun(t, f, f.run(t, "/r", "run", "--process", "say", "--agent", "bash", "--param", "what=hi"),
			`HEAD is "c1", not the pinned "c2"`)
		if asked, _, _ := f.holding.locks(); len(asked) > 0 {
			t.Errorf("locks asked %+v, want none", asked)
		}
	})
}
