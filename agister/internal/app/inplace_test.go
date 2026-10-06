package app_test

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/adapters/fsruns"
	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/contract"
	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

// inPlaceWorkspace has calls with a checkout work in the caller's worktree,
// with a setup that an in-place call never runs.
const inPlaceWorkspace = `schema: agister.workspace/v1alpha1
mode: in-place
setup: {command: ./link-config.sh, timeout: 2m}
`

// prechecked is inPlaceWorkspace with a precheck.
const prechecked = inPlaceWorkspace + "precheck: {command: make lint, timeout: 30s}\n"

// changedByTheTurn has the harness's worktree hold the revision's content
// until the first turn, and after it content "after", whose patch is
// "the turn's patch".
func changedByTheTurn(h *harness) {
	h.changes.identify = func() string {
		if len(h.runner.calls()) > 0 {
			return "after"
		}
		return "tree"
	}
	h.changes.changes = []byte("the turn's patch")
}

// recorded says whether the harness's call recorded an event of kind.
func recorded(h *harness, kind string) bool { return contains(h.recorder.kinds(), kind) }

// noWorktreeEffect fails unless the record has no checkout, copy or
// unreleased checkout on it: the worktree is no effect (ADR-022 rule 2).
func noWorktreeEffect(t *testing.T, record run.Record) {
	t.Helper()
	if effects := record.Effects; effects != nil && (effects.Checkout != nil || effects.Copy != nil || effects.Unreleased != nil) {
		t.Fatalf("effects %+v", effects)
	}
}

// ADR-022 rules 1, 2, 5, 7 and 9: a call of a process with a checkout,
// in-place by the workspace settings, works in the caller's worktree: no
// checkout is made or released, the setup is skipped and says so, the turn
// runs there, and the changes are captured from the revision, the content
// they came from on record. Nothing in the worktree is undone, and the
// worktree's lock is let go.
func TestAnInPlaceCallWorksInTheCallersWorktree(t *testing.T) {
	t.Parallel()
	h := newHarness()
	withWorkspace(h, inPlaceWorkspace)
	changedByTheTurn(h)
	record := h.call(t, contract.CallRequest{})

	if record.Result.Status != run.Completed {
		t.Fatalf("result %+v", record.Result)
	}
	if len(h.workspaces.checkouts) != 0 || h.workspaces.releases() != 0 || len(h.setup.runs()) != 0 {
		t.Fatalf("checkouts %v, releases %d, setup runs %v", h.workspaces.checkouts, h.workspaces.releases(), h.setup.runs())
	}
	turns := h.runner.calls()
	if len(turns) != 1 || turns[0].Cwd != "/repo" || strings.Contains(turns[0].Instruction, "continu") {
		t.Fatalf("turns %+v", turns)
	}
	want := run.InPlace{Dir: "/repo", Worktree: "/repo", RepositoryIdentity: "/repo", Revision: "sha-HEAD", Content: "after"}
	if record.InPlace == nil || *record.InPlace != want || record.Workspace != "/repo" {
		t.Fatalf("in place %+v, workspace %q", record.InPlace, record.Workspace)
	}
	noWorktreeEffect(t, record)
	if len(record.Result.Artifacts) != 1 || record.Result.Artifacts[0].Name != "changes.patch" || string(h.recorder.artifacts["changes.patch"]) != "the turn's patch" {
		t.Fatalf("artifacts %+v", record.Result.Artifacts)
	}
	if !reflect.DeepEqual(h.changes.changed, [][2]string{{"/repo", "sha-HEAD"}}) || len(h.changes.applies()) != 0 || len(h.workspaces.discarded) != 0 {
		t.Fatalf("changed %v, applied %v, discarded %v", h.changes.changed, h.changes.applies(), h.workspaces.discarded)
	}
	kinds := strings.Join(h.recorder.kinds(), " ")
	if !strings.Contains(kinds, "WORKTREE_LOCKED WORKTREE_ADMITTED SETUP_SKIPPED") || strings.Contains(kinds, "SETUP_STARTED") {
		t.Fatalf("events %s", kinds)
	}
	if h.locks.holds("/repo") || !reflect.DeepEqual(h.locks.unlocked, []string{"/repo"}) || !says(record, true) {
		t.Fatalf("lock held %v, unlocked %v, processes ended %s", h.locks.holds("/repo"), h.locks.unlocked, said(record))
	}
}

// ADR-022 rule 1: the mode is temporary unless the settings or the call
// say in-place, and the call's --workspace overrides the settings either
// way.
func TestTheWorkspaceFlagOverridesTheSettingsMode(t *testing.T) {
	t.Parallel()
	for name, c := range map[string]struct {
		settings, flag string
		inPlace        bool
	}{
		"no mode is temporary":      {settings: workspaceSetup},
		"no settings is temporary":  {},
		"temporary by the settings": {settings: "schema: agister.workspace/v1alpha1\nmode: temporary\n"},
		"in-place by the settings":  {settings: inPlaceWorkspace, inPlace: true},
		"in-place by the flag":      {settings: workspaceSetup, flag: "in-place", inPlace: true},
		"temporary by the flag":     {settings: inPlaceWorkspace, flag: "temporary"},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			h := newHarness()
			if c.settings != "" {
				withWorkspace(h, c.settings)
			}
			record := h.call(t, contract.CallRequest{Workspace: c.flag})

			if record.Result.Status != run.Completed || record.Request.Workspace != c.flag {
				t.Fatalf("result %+v, request %+v", record.Result, record.Request)
			}
			if inPlace := record.InPlace != nil; inPlace != c.inPlace || (len(h.workspaces.checkouts) == 0) != c.inPlace {
				t.Fatalf("in place %+v, checkouts %v", record.InPlace, h.workspaces.checkouts)
			}
		})
	}
}

// ADR-022 rule 1: a process's own setup replaces the workspace's, and the
// workspace's mode and precheck still apply to it.
func TestAProcessesOwnSetupKeepsTheWorkspacesModeAndPrecheck(t *testing.T) {
	t.Parallel()
	h := newHarness()
	withWorkspace(h, prechecked)
	ownSetup(h)
	record := h.call(t, contract.CallRequest{})

	if record.Result.Status != run.Completed || record.InPlace == nil {
		t.Fatalf("result %+v, in place %+v", record.Result, record.InPlace)
	}
	if want := []app.SetupCommandRequest{{Command: "make lint", Dir: "/repo", Timeout: 30 * time.Second, Bound: 8 << 10}}; !reflect.DeepEqual(h.setup.runs(), want) {
		t.Fatalf("command runs %+v", h.setup.runs())
	}
	for _, event := range h.recorder.events {
		if event.Kind == "SETUP_SKIPPED" && event.Data["command"] != "./own.sh" {
			t.Fatalf("skipped %+v", event.Data)
		}
	}
	if !recorded(h, "SETUP_SKIPPED") {
		t.Fatalf("events %v", h.recorder.kinds())
	}
}

// ADR-022 rule 1: a process without a checkout works in the repository and
// takes no mode: an explicit --workspace is refused, and the settings' mode
// does not reach it.
func TestAWorkspaceModeForAProcessWithoutACheckoutIsRefused(t *testing.T) {
	t.Parallel()
	for _, flag := range []string{"in-place", "temporary"} {
		t.Run(flag, func(t *testing.T) {
			t.Parallel()
			h := newHarness()
			inTheRepositoryItself(h)
			record := h.call(t, contract.CallRequest{Workspace: flag})

			if class(record) != run.ClassRefused || !strings.Contains(message(record), "declares no workspace.checkout, so it takes no workspace mode") {
				t.Fatalf("result %s %q", class(record), message(record))
			}
			if len(h.runner.calls()) != 0 {
				t.Fatalf("%d turns", len(h.runner.calls()))
			}
		})
	}
	h := newHarness()
	inTheRepositoryItself(h)
	withWorkspace(h, inPlaceWorkspace)
	if record := h.call(t, contract.CallRequest{}); record.Result.Status != run.Completed || record.InPlace != nil || len(h.locks.locked) != 0 {
		t.Fatalf("result %+v, in place %+v", record.Result, record.InPlace)
	}
}

// inTheRepositoryItself has the harness's process p work in the
// repository, without a checkout.
func inTheRepositoryItself(h *harness) {
	h.defs.docs[definition.KindProcess]["p"] = strings.Replace(h.defs.docs[definition.KindProcess]["p"], "workspace:\n  checkout: candidate_revision\n", "", 1)
	h.defs.docs[definition.KindPolicy]["pol"] = strings.Replace(h.defs.docs[definition.KindPolicy]["pol"], "scope: candidate", "scope: repository", 1)
}

// ADR-022 rule 1: check reports a mode that is neither in-place nor
// temporary, and a precheck without its command or timeout.
func TestCheckReportsABadWorkspaceMode(t *testing.T) {
	t.Parallel()
	h := newHarness()
	checker := app.NewChecker(h.defs, h.validator, h.runtimes, []string{"git.revision", "git.diff"})
	for text, want := range map[string]string{
		"schema: agister.workspace/v1alpha1\nmode: elsewhere\n":                         `workspace workspace: mode: must be "in-place" or "temporary"`,
		"schema: agister.workspace/v1alpha1\nmode: in-place\nprecheck: {timeout: 1m}\n": "workspace workspace: precheck.command: is required",
	} {
		withWorkspace(h, text)
		report, err := checker.Check(context.Background(), false)
		if err != nil {
			t.Fatal(err)
		}
		if !contains(messages(report.Problems), want) {
			t.Fatalf("problems = %v, want %q", messages(report.Problems), want)
		}
	}
}

// ADR-022 rule 4: the worktree is admitted only as the revision left it;
// each way it is not is refused with its own reason, before any turn, and
// the lock is let go.
func TestAWorktreeThatIsNotTheRevisionsIsRefused(t *testing.T) {
	t.Parallel()
	for name, c := range map[string]struct {
		state   func(revision string) app.WorktreeState
		content string
		want    string
	}{
		"HEAD elsewhere": {
			state: func(string) app.WorktreeState { return app.WorktreeState{Head: "sha-other", Tree: "tree"} },
			want:  "is at sha-other, not revision sha-HEAD",
		},
		"staged changes": {
			state: func(r string) app.WorktreeState {
				return app.WorktreeState{Head: r, Tree: "tree", Staged: []string{"a.go"}}
			},
			want: "has staged changes: a.go",
		},
		"a dirty submodule": {
			state: func(r string) app.WorktreeState {
				return app.WorktreeState{Head: r, Tree: "tree", DirtySubmodules: []string{"vendor/lib"}}
			},
			want: "has dirty submodules: vendor/lib",
		},
		"an untracked file": {
			state: func(r string) app.WorktreeState {
				return app.WorktreeState{Head: r, Tree: "tree", Untracked: []string{"notes.md"}}
			},
			want: "has untracked files that are not ignored: notes.md",
		},
		"other content": {
			content: "edited",
			want:    "has content edited, not revision sha-HEAD's tree",
		},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			h := newHarness()
			withWorkspace(h, inPlaceWorkspace)
			if c.state != nil {
				h.worktrees.state = func(revision string, _ int) app.WorktreeState { return c.state(revision) }
			}
			h.changes.identity = c.content
			record := h.call(t, contract.CallRequest{})

			if class(record) != run.ClassRefused || !strings.Contains(message(record), "worktree /repo "+c.want) {
				t.Fatalf("result %s %q, want %q", class(record), message(record), c.want)
			}
			if len(h.runner.calls()) != 0 || len(h.changes.changed) != 0 || len(h.setup.runs()) != 0 {
				t.Fatalf("turns %d, changes %v, runs %v", len(h.runner.calls()), h.changes.changed, h.setup.runs())
			}
			if !recorded(h, "WORKTREE_NOT_ADMITTED") || h.locks.holds("/repo") || record.InPlace == nil {
				t.Fatalf("events %v, lock held %v, in place %+v", h.recorder.kinds(), h.locks.holds("/repo"), record.InPlace)
			}
		})
	}
}

// ADR-022 rule 5: the precheck runs once, in the worktree, before the first
// turn, and is on record: the command, its digest, how it ended and its
// bounded output.
func TestAPassingPrecheckIsRecorded(t *testing.T) {
	t.Parallel()
	h := newHarness()
	withWorkspace(h, prechecked)
	turnsDuringPrecheck := -1
	// The command recorded on the latest record saved while the precheck
	// runs; empty if none.
	commandDuringPrecheck := ""
	h.setup.running = func(app.SetupCommandRequest) {
		turnsDuringPrecheck = len(h.runner.calls())
		h.recorder.mu.Lock()
		defer h.recorder.mu.Unlock()
		if n := len(h.recorder.updates); n > 0 {
			if effects := h.recorder.updates[n-1].Effects; effects != nil && effects.Command != nil {
				commandDuringPrecheck = effects.Command.Ref
			}
		}
	}
	record := h.call(t, contract.CallRequest{})

	if record.Result.Status != run.Completed || turnsDuringPrecheck != 0 {
		t.Fatalf("result %+v, turns during the precheck %d", record.Result, turnsDuringPrecheck)
	}
	precheck := record.Precheck
	if precheck == nil || precheck.Command != "make lint" || precheck.Timeout != 30*time.Second || precheck.SHA256 != sha("make lint") {
		t.Fatalf("precheck %+v", precheck)
	}
	ran := record.PrecheckRun
	if ran == nil || !ran.Passed || ran.Exit.Code == nil || *ran.Exit.Code != 0 || ran.Dir != "/repo" || ran.Output.Head != "exit 0" {
		t.Fatalf("precheck run %+v", ran)
	}
	if kinds := strings.Join(h.recorder.kinds(), " "); !strings.Contains(kinds, "PRECHECK_STARTED PRECHECK_FINISHED WORKTREE_ADMITTED") {
		t.Fatalf("events %s", kinds)
	}
	// The precheck's process group is on record while it runs, as any
	// command's, and the worktree still is no effect.
	if commandDuringPrecheck != "ref-cmd" {
		t.Fatalf("the command on record while the precheck ran = %q", commandDuringPrecheck)
	}
	noWorktreeEffect(t, record)
}

// ADR-022 rule 5: a precheck that fails, runs out of time, or leaves the
// worktree other than the revision's refuses the call before any turn.
func TestAPrecheckThatFailsOrChangesTheWorktreeRefusesTheCall(t *testing.T) {
	t.Parallel()
	for name, c := range map[string]struct {
		arrange func(h *harness)
		want    string
	}{
		"a non-zero exit": {
			arrange: func(h *harness) { h.setup.exits = []int{2} },
			want:    "the precheck command exited with code 2",
		},
		"a timeout": {
			arrange: func(h *harness) { h.setup.timedOut = true },
			want:    "the precheck command exceeded its timeout 30s",
		},
		"a tracked file changed": {
			arrange: func(h *harness) {
				ran := false
				h.setup.running = func(app.SetupCommandRequest) { ran = true }
				h.changes.identify = func() string {
					if ran {
						return "formatted"
					}
					return "tree"
				}
			},
			want: "after the precheck, worktree /repo has content formatted",
		},
		"HEAD moved": {
			arrange: func(h *harness) {
				h.worktrees.state = func(revision string, n int) app.WorktreeState {
					if n > 0 {
						return app.WorktreeState{Head: "sha-moved", Tree: "tree"}
					}
					return app.WorktreeState{Head: revision, Tree: "tree"}
				}
			},
			want: "after the precheck, worktree /repo is at sha-moved",
		},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			h := newHarness()
			withWorkspace(h, prechecked)
			c.arrange(h)
			record := h.call(t, contract.CallRequest{})

			if class(record) != run.ClassRefused || !strings.Contains(message(record), c.want) {
				t.Fatalf("result %s %q, want %q", class(record), message(record), c.want)
			}
			if len(h.runner.calls()) != 0 || record.PrecheckRun == nil || h.locks.holds("/repo") {
				t.Fatalf("turns %d, precheck run %+v", len(h.runner.calls()), record.PrecheckRun)
			}
		})
	}
}

// ADR-022 rule 3: a precheck that panics ends the call with the worktree's
// lock let go: the lock is the call's only once the worktree is lent, and
// every other way out of the borrow releases it, not a refusal alone.
func TestAPrecheckThatPanicsLeavesTheWorktreeUnlocked(t *testing.T) {
	t.Parallel()
	h := newHarness()
	withWorkspace(h, prechecked)
	h.setup.running = func(app.SetupCommandRequest) { panic("the precheck exploded") }
	record := h.call(t, contract.CallRequest{})

	if class(record) != run.ClassInternal || message(record) != "the precheck exploded" {
		t.Fatalf("result %+v", record.Result)
	}
	if h.locks.holds("/repo") || !reflect.DeepEqual(h.locks.unlocked, []string{"/repo"}) {
		t.Fatalf("lock held %v, unlocked %v", h.locks.holds("/repo"), h.locks.unlocked)
	}
	if len(h.runner.calls()) != 0 || recorded(h, "WORKTREE_ADMITTED") {
		t.Fatalf("turns %d, events %v", len(h.runner.calls()), h.recorder.kinds())
	}
}

// ADR-022 rule 3: a worktree another in-place call holds is refused, before
// anything is read or run there.
func TestAWorktreeInUseIsRefused(t *testing.T) {
	t.Parallel()
	h := newHarness()
	withWorkspace(h, prechecked)
	h.locks.held = map[string]bool{"/repo": true}
	record := h.call(t, contract.CallRequest{})

	if class(record) != run.ClassRefused || !strings.Contains(message(record), "worktree /repo is in use") {
		t.Fatalf("result %s %q", class(record), message(record))
	}
	if len(h.runner.calls()) != 0 || len(h.setup.runs()) != 0 || h.worktrees.reads != 0 || record.InPlace != nil {
		t.Fatalf("turns %d, precheck runs %d, reads %d, in place %+v", len(h.runner.calls()), len(h.setup.runs()), h.worktrees.reads, record.InPlace)
	}
	if !h.locks.holds("/repo") {
		t.Fatal("the other call's lock was let go")
	}
}

// known is what a record says of its processes: that they are known to have
// ended, or that they are not.
func known(ended bool) *bool { return &ended }

// says tells whether the record itself says its processes are known to have
// ended, or are not; a record that says neither says nothing.
func says(record run.Record, ended bool) bool {
	return record.ProcessesEnded != nil && *record.ProcessesEnded == ended
}

// said is what the record says of its processes, for a failure's message.
func said(record run.Record) string {
	if record.ProcessesEnded == nil {
		return "unsaid"
	}
	return fmt.Sprint(*record.ProcessesEnded)
}

// inPlaceRun is a run that worked in worktree, finished or not, its runtime
// process recorded, and its record saying whether its processes ended.
func inPlaceRun(id, worktree string, finished, ended bool) run.Record {
	record := run.Record{ID: id, InPlace: &run.InPlace{Dir: worktree, Worktree: worktree, Revision: "sha-HEAD"},
		Effects: &run.Effects{Process: &run.Process{Ref: "ref-" + id}}, ProcessesEnded: known(ended)}
	if finished {
		at := time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC)
		record.FinishedAt = &at
	}
	return record
}

// checkoutLessRun is a run that worked in the repository at dir itself,
// without a checkout and not in-place, finished or not, its runtime process
// recorded.
func checkoutLessRun(id, dir string, finished, ended bool) run.Record {
	record := inPlaceRun(id, dir, finished, ended)
	record.InPlace, record.Workspace = nil, dir
	return record
}

// temporaryRun is a finished run that worked in a checkout of its own at
// dir, released, its runtime process recorded and not known to have ended.
func temporaryRun(id, dir string) run.Record {
	record := checkoutLessRun(id, dir, true, false)
	record.Effects.Checkout = &run.Checkout{Repository: "/origin", Dir: dir}
	return record
}

// unsaid is the record as one written before records said whether their
// processes ended: it says nothing of them, and ended with status and
// class; with neither when it is unfinished.
func unsaid(record run.Record, status run.Status, class run.Class) run.Record {
	record.ProcessesEnded = nil
	if status != "" {
		record.Result = &run.Result{Status: status}
		if class != "" {
			record.Result.Error = run.Fault(class, "ended %s", status)
		}
	}
	return record
}

// commandOnly is the record with the process group of a command, such as
// its verification's, as the only process it recorded.
func commandOnly(record run.Record) run.Record {
	record.Effects = &run.Effects{Command: &run.Process{Ref: "cmd-" + record.ID}}
	return record
}

// ADR-022 rule 3: under the lock, a run that worked in a directory that
// overlaps the worktree and may still write there refuses the call: one
// unfinished, or one whose runtime or command process is not known to have
// ended and cannot be ended now. One whose process is ended, or is gone,
// does not; nor does a run in a directory apart from the worktree. A record
// that says its processes are not known to have ended is asked about; one
// written before records said so is asked about only when a reap finished
// it. It holds for a run of any kind: in-place, in the repository itself
// without a checkout, or in a checkout of its own; and for a directory that
// is the worktree, holds it or lies in it.
func TestAnotherRunThatMayStillWriteInTheWorktreeRefusesTheCall(t *testing.T) {
	t.Parallel()
	for name, c := range map[string]struct {
		other   run.Record
		outcome app.Reaping
		err     error  // what ending the process fails with
		root    string // the worktree asked for; /repo when empty
		reaped  []string
		process string // the process the call says it asked to end; none when empty
		want    string // the refusal; none when empty
	}{
		"unfinished":                {other: inPlaceRun("run-0", "/repo", false, false), want: "run run-0 worked in worktree /repo and has not finished"},
		"its process left":          {other: inPlaceRun("run-0", "/repo", true, false), outcome: app.ReapLeft, reaped: []string{"ref-run-0"}, process: "runtime", want: `its runtime process "ref-run-0" may still write there`},
		"its process killed":        {other: inPlaceRun("run-0", "/repo", true, false), outcome: app.ReapKilled, reaped: []string{"ref-run-0"}, process: "runtime"},
		"its process gone":          {other: inPlaceRun("run-0", "/repo", true, false), outcome: app.ReapGone, reaped: []string{"ref-run-0"}, process: "runtime"},
		"its processes known ended": {other: inPlaceRun("run-0", "/repo", true, true)},
		"unfinished elsewhere":      {other: inPlaceRun("run-0", "/elsewhere", false, false)},

		// A record written before it said whether its processes ended says
		// it by how the run ended: a call that finished its run ended them,
		// so nothing is asked; a reap that finished it may have left one.
		"says nothing, finished by its call": {other: unsaid(inPlaceRun("run-0", "/repo", true, false), run.Failed, run.ClassRuntimeError)},
		"says nothing, finished by a reap, its process left": {other: unsaid(inPlaceRun("run-0", "/repo", true, false), run.Lost, run.ClassAbandoned), outcome: app.ReapLeft, reaped: []string{"ref-run-0"}, process: "runtime",
			want: `its runtime process "ref-run-0" may still write there`},
		"says nothing, finished by a reap, its process gone": {other: unsaid(inPlaceRun("run-0", "/repo", true, false), run.Lost, run.ClassAbandoned), outcome: app.ReapGone, reaped: []string{"ref-run-0"}, process: "runtime"},
		"says nothing, unfinished":                           {other: unsaid(inPlaceRun("run-0", "/repo", false, false), "", ""), want: "run run-0 worked in worktree /repo and has not finished"},
		"checkout-less, says nothing, finished by its call":  {other: unsaid(checkoutLessRun("run-0", "/repo", true, false), run.Completed, "")},
		"checkout-less, says nothing, finished by a reap, its process left": {other: unsaid(checkoutLessRun("run-0", "/repo", true, false), run.Lost, run.ClassAbandoned), outcome: app.ReapLeft, reaped: []string{"ref-run-0"}, process: "runtime",
			want: `run run-0 worked in worktree /repo, and its runtime process "ref-run-0" may still write there`},

		// A command is a writer as the runtime is: a verification command a
		// killed call left may still run.
		"its command left": {other: commandOnly(inPlaceRun("run-0", "/repo", true, false)), outcome: app.ReapLeft, reaped: []string{"cmd-run-0"}, process: "command",
			want: `run run-0 worked in worktree /repo, and its command process "cmd-run-0" may still write there: it could not be ended: it cannot be told apart from another`},
		"its command not ended": {other: commandOnly(inPlaceRun("run-0", "/repo", true, false)), err: errors.New("no such group"), reaped: []string{"cmd-run-0"}, process: "command",
			want: `its command process "cmd-run-0" may still write there: it could not be ended: no such group`},
		"its command killed":      {other: commandOnly(inPlaceRun("run-0", "/repo", true, false)), outcome: app.ReapKilled, reaped: []string{"cmd-run-0"}, process: "command"},
		"its command gone":        {other: commandOnly(inPlaceRun("run-0", "/repo", true, false)), outcome: app.ReapGone, reaped: []string{"cmd-run-0"}, process: "command"},
		"its command known ended": {other: commandOnly(inPlaceRun("run-0", "/repo", true, true))},

		// A run without a checkout worked in the repository itself.
		"checkout-less, unfinished":                {other: checkoutLessRun("run-0", "/repo", false, false), want: "run run-0 worked in worktree /repo and has not finished"},
		"checkout-less, its process left":          {other: checkoutLessRun("run-0", "/repo", true, false), outcome: app.ReapLeft, reaped: []string{"ref-run-0"}, process: "runtime", want: `run run-0 worked in worktree /repo, and its runtime process "ref-run-0" may still write there`},
		"checkout-less, its command left":          {other: commandOnly(checkoutLessRun("run-0", "/repo", true, false)), outcome: app.ReapLeft, reaped: []string{"cmd-run-0"}, process: "command", want: `its command process "cmd-run-0" may still write there`},
		"checkout-less, its process killed":        {other: checkoutLessRun("run-0", "/repo", true, false), outcome: app.ReapKilled, reaped: []string{"ref-run-0"}, process: "runtime"},
		"checkout-less, its processes known ended": {other: checkoutLessRun("run-0", "/repo", true, true)},
		"checkout-less, unfinished elsewhere":      {other: checkoutLessRun("run-0", "/elsewhere", false, false)},

		// The directories overlap without being one.
		"unfinished in the repository that holds the worktree": {other: checkoutLessRun("run-0", "/repo", false, false), root: "/repo/tool",
			want: "run run-0 worked in /repo (which holds worktree /repo/tool) and has not finished"},
		"unfinished in a repository inside the worktree": {other: inPlaceRun("run-0", "/repo/tool", false, false),
			want: "run run-0 worked in /repo/tool (inside worktree /repo) and has not finished"},
		"its process left in a released checkout that holds the worktree": {other: temporaryRun("run-0", "/made"), root: "/made/tool", outcome: app.ReapLeft, reaped: []string{"ref-run-0"}, process: "runtime",
			want: `run run-0 worked in /made (which holds worktree /made/tool), and its runtime process "ref-run-0" may still write there`},
		// A writer works in its checkout, not in the directory made for it.
		"its process left in a released checkout beside the worktree":           {other: temporaryRun("run-0", "/made/workspace"), root: "/made/tool"},
		"unfinished beside the worktree, its name the start of the worktree's":  {other: checkoutLessRun("run-0", "/rep", false, false)},
		"unfinished beside the worktree, its name starting with the worktree's": {other: checkoutLessRun("run-0", "/repo-2", false, false)},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			h := newHarness()
			withWorkspace(h, inPlaceWorkspace)
			root := "/repo"
			if c.root != "" {
				root = c.root
				h.workspaces.root = root
			}
			h.runs.records[c.other.ID] = c.other
			h.processes.outcome, h.processes.err = c.outcome, c.err
			record := h.call(t, contract.CallRequest{Cwd: root})

			if !reflect.DeepEqual(h.processes.refs(), c.reaped) {
				t.Fatalf("reaped %v, want %v", h.processes.refs(), c.reaped)
			}
			// The call says which of the run's processes it asked to end.
			var asked, want []string
			for _, event := range h.recorder.events {
				if event.Kind == "WORKTREE_WRITER_REAPED" {
					asked = append(asked, event.Data["process"].(string))
				}
			}
			if c.process != "" {
				want = []string{c.process}
			}
			if !reflect.DeepEqual(asked, want) {
				t.Fatalf("asked to end the processes %v, want %v", asked, want)
			}
			if c.want == "" {
				if record.Result.Status != run.Completed {
					t.Fatalf("result %+v", record.Result)
				}
				return
			}
			if class(record) != run.ClassRefused || !strings.Contains(message(record), c.want) {
				t.Fatalf("result %s %q, want %q", class(record), message(record), c.want)
			}
			if len(h.runner.calls()) != 0 || h.worktrees.reads != 0 || h.locks.holds(root) {
				t.Fatalf("turns %d, reads %d", len(h.runner.calls()), h.worktrees.reads)
			}
		})
	}
}

// ADR-022 rules 2 and 3: a directory a run that may still write recorded,
// which cannot be told apart from the worktree, refuses the call: nothing
// says the run works elsewhere. No process is ended for it, and nothing is
// read or run in the worktree.
func TestARecordedDirectoryThatCannotBeToldApartRefusesTheCall(t *testing.T) {
	t.Parallel()
	h := newHarness()
	withWorkspace(h, inPlaceWorkspace)
	h.runs.records["run-0"] = checkoutLessRun("run-0", "/sealed", true, false)
	h.locks.unreadable = map[string]error{"/sealed": errors.New("permission denied")}
	record := h.call(t, contract.CallRequest{})

	if want := "worktree /repo cannot be told apart from /sealed, which run run-0 recorded: permission denied"; class(record) != run.ClassRefused || !strings.Contains(message(record), want) {
		t.Fatalf("result %s %q, want %q", class(record), message(record), want)
	}
	if len(h.processes.refs()) != 0 || len(h.runner.calls()) != 0 || h.worktrees.reads != 0 || h.locks.holds("/repo") {
		t.Fatalf("reaped %v, turns %d, reads %d, lock held %v", h.processes.refs(), len(h.runner.calls()), h.worktrees.reads, h.locks.holds("/repo"))
	}
}

// storedBorrows returns a run store in a directory of the test's own and a
// borrow that creates run id there and asks a Borrower on that store, over
// the harness's spies, for the worktree at dir, with a precheck; update
// saves the run's record. What a borrow leaves held, the run's ownership
// and a lock lent, is let go when the test ends.
func storedBorrows(t *testing.T, h *harness) (fsruns.Store, func(id, dir string, update func(app.RunHandle, run.Record) error) (*app.Borrowed, error)) {
	t.Helper()
	ctx := context.Background()
	store := fsruns.Store{Dir: t.TempDir(), Appends: fsruns.NewAppends()}
	borrower := app.NewBorrower(h.locks, h.worktrees, h.changes, store, h.processes, app.NewPreparer(h.changes, h.setup, h.clock))
	return store, func(id, dir string, update func(app.RunHandle, run.Record) error) (*app.Borrowed, error) {
		t.Helper()
		record := run.Record{ID: id}
		handle, err := store.Create(ctx, record)
		if err != nil {
			t.Fatal(err)
		}
		// An error is a run that is not held any more: the test gave it up,
		// or a reap finished it.
		t.Cleanup(func() { _ = store.Abandon(id) })
		borrowed, err := borrower.Borrow(ctx, app.BorrowCall{
			Record: &record,
			Event: func(source, kind string, data map[string]any) {
				_ = h.recorder.Append(run.Event{Source: source, Kind: kind, Data: data})
			},
			Update: func(record run.Record) error { return update(handle, record) },
			Dir:    dir, RepositoryIdentity: "/repo", Revision: "sha-HEAD",
			Precheck: &app.SetupCommand{Command: "make lint", Timeout: 30 * time.Second},
		})
		if err == nil {
			t.Cleanup(func() { _ = borrowed.Release() })
		}
		return borrowed, err
	}
}

// saved saves the record through the run's handle.
func saved(handle app.RunHandle, record run.Record) error { return handle.Update(record) }

// ADR-022 rule 3: a record that cannot be read leaves the runs that may
// still write in the worktree unknown, so the call is refused, before
// anything is read or run in the worktree and before any process is ended
// for it, and its lock is let go.
func TestARunRecordThatCannotBeReadRefusesTheCall(t *testing.T) {
	t.Parallel()
	h := newHarness()
	store, borrow := storedBorrows(t, h)
	unreadable := filepath.Join(store.Dir, "run-0")
	if err := os.Mkdir(unreadable, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(unreadable, "record.json"), []byte("{"), 0o600); err != nil {
		t.Fatal(err)
	}

	borrowed, err := borrow("run-1", "/repo", saved)

	var refusal *app.Refusal
	if want := "the runs that may still write in worktree /repo cannot be read: listing run run-0"; !errors.As(err, &refusal) || !strings.Contains(refusal.Reason, want) {
		t.Fatalf("the borrow = %v, want a refusal with %q", err, want)
	}
	if h.worktrees.reads != 0 || len(h.setup.runs()) != 0 || len(h.processes.refs()) != 0 {
		t.Fatalf("reads %d, precheck runs %v, reaped %v", h.worktrees.reads, h.setup.runs(), h.processes.refs())
	}
	if borrowed != nil || h.locks.holds("/repo") || !reflect.DeepEqual(h.locks.unlocked, []string{"/repo"}) {
		t.Fatalf("borrowed %+v, lock held %v, unlocked %v", borrowed, h.locks.holds("/repo"), h.locks.unlocked)
	}
}

// ADR-001 invariant 11, ADR-022 rule 3: a call killed right after its
// worktree went on record, before it ran anything there, leaves a run a
// reap finishes, and the worktree is lent to the next call; the worktree
// is still no effect.
func TestACallKilledOnceItsWorktreeIsOnRecordIsReaped(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	h := newHarness()
	store, borrow := storedBorrows(t, h)
	killed := errors.New("killed")
	if _, err := borrow("run-0", "/repo", func(handle app.RunHandle, record run.Record) error {
		if err := handle.Update(record); err != nil {
			return err
		}
		if err := store.Abandon(record.ID); err != nil {
			return err
		}
		return killed
	}); !errors.Is(err, killed) {
		t.Fatalf("the first borrow = %v", err)
	}

	reaper := app.NewReaper(store, h.processes, h.workspaces, fixedClock{})
	reaper.ReapContext = func(ctx context.Context) (context.Context, context.CancelFunc) { return context.WithCancel(ctx) }
	if err := reaper.Reap(ctx); err != nil {
		t.Fatal(err)
	}
	reaped, _, err := store.Get(ctx, "run-0")
	if err != nil || reaped.FinishedAt == nil || !says(reaped, true) || reaped.InPlace == nil || reaped.InPlace.Worktree != "/repo" {
		t.Fatalf("reaped %+v, %v", reaped, err)
	}
	noWorktreeEffect(t, reaped)
	borrowed, err := borrow("run-1", "/repo", saved)
	if err != nil {
		t.Fatalf("the next borrow = %v", err)
	}
	if err := borrowed.Release(); err != nil {
		t.Fatal(err)
	}
}

// killedOnceItWorks is a run store whose call is killed right after the
// save that first has its workspace on record: the run is left as a killed
// owner leaves it, and what the call does after is not saved.
type killedOnceItWorks struct{ fsruns.Store }

func (s killedOnceItWorks) Create(ctx context.Context, record run.Record) (app.RunHandle, error) {
	handle, err := s.Store.Create(ctx, record)
	if err != nil {
		return nil, err
	}
	return &killedHandle{RunHandle: handle, store: s.Store}, nil
}

type killedHandle struct {
	app.RunHandle
	store  fsruns.Store
	killed bool
}

func (h *killedHandle) Update(record run.Record) error {
	if err := h.RunHandle.Update(record); err != nil || h.killed || record.Workspace == "" {
		return err
	}
	h.killed = true
	return h.store.Abandon(record.ID)
}

// ADR-001 invariant 11, ADR-022 rule 3: a call without a checkout, killed
// once its workspace is on record and before its runtime's process is,
// leaves a run a reap finishes: it does not keep the worktree from the
// in-place calls after it for good.
func TestACheckoutLessCallKilledOnceItsWorkspaceIsOnRecordIsReaped(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	h := newHarness()
	inTheRepositoryItself(h)
	store, borrow := storedBorrows(t, h)
	h.calls = h.callsRecordedWith(h.defs, h.workspaces, h.changes, store, killedOnceItWorks{store}, fixedIDs{})
	id, err := h.calls.Submit(ctx, contract.CallRequest{Process: "p", Cwd: "/repo"})
	if err != nil {
		t.Fatal(err)
	}
	<-h.hosted.Done(id)
	killed, state, err := store.Get(ctx, id)
	if err != nil || state != run.StateAbandoned || killed.Workspace != "/repo" || killed.InPlace != nil || (killed.Effects != nil && killed.Effects.Process != nil) {
		t.Fatalf("the killed run %+v, effects %+v, state %s, %v", killed, killed.Effects, state, err)
	}

	reaper := app.NewReaper(store, h.processes, h.workspaces, fixedClock{})
	reaper.ReapContext = func(ctx context.Context) (context.Context, context.CancelFunc) { return context.WithCancel(ctx) }
	if err := reaper.Reap(ctx); err != nil {
		t.Fatal(err)
	}
	reaped, _, err := store.Get(ctx, id)
	if err != nil || reaped.FinishedAt == nil || !says(reaped, true) || class(reaped) != run.ClassAbandoned {
		t.Fatalf("reaped %+v, %v", reaped, err)
	}
	noWorktreeEffect(t, reaped)
	if _, err := borrow("run-2", "/repo", saved); err != nil || !h.locks.holds("/repo") {
		t.Fatalf("the borrow after the reap = %v, lock held %v", err, h.locks.holds("/repo"))
	}
	if len(h.processes.refs()) != 0 {
		t.Fatalf("asked to end %v", h.processes.refs())
	}
}

// ADR-022 rule 3: a run without a checkout, which worked in the repository
// itself, is a writer there as an in-place run is. Its CLI killed and its
// runtime's process not ended by the reap that finished it, the run's
// record says its processes are not known to have ended, and the worktree
// is not lent while that process cannot be ended; once it can, it is.
func TestACheckoutLessRunWhoseReapLeftItsWriterRefusesTheCall(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	h := newHarness()
	store, borrow := storedBorrows(t, h)
	writer := run.Record{ID: "run-0", Workspace: "/repo", Effects: &run.Effects{Process: &run.Process{Ref: "ref-run-0"}}}
	if _, err := store.Create(ctx, writer); err != nil {
		t.Fatal(err)
	}
	if err := store.Abandon(writer.ID); err != nil {
		t.Fatal(err)
	}
	h.processes.outcome = app.ReapLeft
	reaper := app.NewReaper(store, h.processes, h.workspaces, fixedClock{})
	reaper.ReapContext = func(ctx context.Context) (context.Context, context.CancelFunc) { return context.WithCancel(ctx) }
	if err := reaper.Reap(ctx); err != nil {
		t.Fatal(err)
	}
	reaped, _, err := store.Get(ctx, writer.ID)
	if err != nil || reaped.FinishedAt == nil || !says(reaped, false) || reaped.InPlace != nil || reaped.Workspace != "/repo" {
		t.Fatalf("reaped %+v, %v", reaped, err)
	}

	// The refused call's own run, which it finishes as any call does.
	var refused app.RunHandle
	var last run.Record
	borrowed, err := borrow("run-1", "/repo", func(handle app.RunHandle, record run.Record) error {
		refused, last = handle, record
		return handle.Update(record)
	})

	var refusal *app.Refusal
	if want := `run run-0 worked in worktree /repo, and its runtime process "ref-run-0" may still write there`; !errors.As(err, &refusal) || !strings.Contains(refusal.Reason, want) {
		t.Fatalf("the borrow = %v, want a refusal with %q", err, want)
	}
	if borrowed != nil || h.locks.holds("/repo") || h.worktrees.reads != 0 {
		t.Fatalf("borrowed %+v, lock held %v, reads %d", borrowed, h.locks.holds("/repo"), h.worktrees.reads)
	}
	if want := []string{"ref-run-0", "ref-run-0"}; !reflect.DeepEqual(h.processes.refs(), want) {
		t.Fatalf("asked to end %v, want %v: the reap, then the borrow", h.processes.refs(), want)
	}

	at := time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC)
	last.FinishedAt, last.ProcessesEnded = &at, known(true)
	if err := refused.Finish(last); err != nil {
		t.Fatal(err)
	}
	h.processes.outcome = app.ReapKilled
	if _, err := borrow("run-2", "/repo", saved); err != nil || !h.locks.holds("/repo") {
		t.Fatalf("the borrow once the writer is ended = %v, lock held %v", err, h.locks.holds("/repo"))
	}
}

// ADR-022 rules 2 and 7: a directory Agister made and still removes is not
// lent, before anything is read or run there: the checkout of another run
// that has not finished, killed or still running, which its release or a
// reap removes with the call's work in it, and a clean copy or an
// unreleased checkout a finished run still has on record. Nor is a
// worktree in such a directory, as a repository nested in a checkout is,
// which the removal takes with it; nor one such a directory lies in. The
// directories are told apart by their canonical paths, not their names.
// The directory made to hold such a checkout or copy, its parent, is
// removed with it, so a clean repository beside the checkout is not lent
// either. The checkout a finished run released, a checkout elsewhere, and
// one that is gone with its directory refuse nothing.
func TestADirectoryAgisterStillRemovesIsNotLent(t *testing.T) {
	t.Parallel()
	const killed, running, finished = "killed", "running", "finished"
	checkout := func(dir string) *run.Checkout { return &run.Checkout{Repository: "/origin", Dir: dir} }
	for name, c := range map[string]struct {
		effects   run.Effects       // what run-0 has on record
		end       string            // how run-0 was left
		worktree  string            // the directory asked for; /repo when empty
		canonical map[string]string // the directories with another canonical path
		want      string            // the refusal; none when empty
	}{
		"a repository nested in a killed run's checkout": {effects: run.Effects{Checkout: checkout("/made")}, end: killed, worktree: "/made/tool",
			want: "worktree /made/tool is inside the checkout of run run-0, which has not finished (/made)"},
		"a repository nested in a running run's checkout": {effects: run.Effects{Checkout: checkout("/made")}, end: running, worktree: "/made/tool",
			want: "worktree /made/tool is inside the checkout of run run-0, which has not finished (/made)"},
		"a repository nested deep in a clean copy": {effects: run.Effects{Checkout: checkout("/gone"), Copy: checkout("/made")}, end: finished, worktree: "/made/vendor/tool",
			want: "worktree /made/vendor/tool is inside a clean copy run run-0 still has on record (/made)"},
		"a repository nested in an unreleased checkout": {effects: run.Effects{Checkout: checkout("/made"), Unreleased: checkout("/made")}, end: finished, worktree: "/made/tool",
			want: "worktree /made/tool is inside a checkout run run-0 could not release (/made)"},
		"a killed run's checkout inside the worktree": {effects: run.Effects{Checkout: checkout("/repo/made")}, end: killed,
			want: "worktree /repo contains the checkout of run run-0, which has not finished (/repo/made)"},
		"nested by its canonical path, not by its name": {effects: run.Effects{Checkout: checkout("/made")}, end: killed, worktree: "/link",
			canonical: map[string]string{"/link": "/made/tool"},
			want:      "worktree /link is inside the checkout of run run-0, which has not finished (/made)"},
		"nested in a checkout recorded by another name": {effects: run.Effects{Checkout: checkout("/var/made")}, end: killed, worktree: "/private/var/made/tool",
			canonical: map[string]string{"/var/made": "/private/var/made"},
			want:      "worktree /private/var/made/tool is inside the checkout of run run-0, which has not finished (/var/made)"},
		// The removal takes the directory made for the checkout, with a
		// clean repository that lies beside the checkout in it.
		"a repository beside a killed run's checkout": {effects: run.Effects{Checkout: checkout("/made/workspace")}, end: killed, worktree: "/made/tool",
			want: "worktree /made/tool is inside the directory made for the checkout of run run-0, which has not finished (/made)"},
		"a repository beside a running run's checkout": {effects: run.Effects{Checkout: checkout("/made/workspace")}, end: running, worktree: "/made/tool",
			want: "worktree /made/tool is inside the directory made for the checkout of run run-0, which has not finished (/made)"},
		"a repository beside a clean copy": {effects: run.Effects{Checkout: checkout("/gone/workspace"), Copy: checkout("/made/workspace")}, end: finished, worktree: "/made/tool",
			want: "worktree /made/tool is inside the directory made for a clean copy run run-0 still has on record (/made)"},
		"a repository beside an unreleased checkout": {effects: run.Effects{Checkout: checkout("/made/workspace"), Unreleased: checkout("/made/workspace")}, end: finished, worktree: "/made/tool",
			want: "worktree /made/tool is inside the directory made for a checkout run run-0 could not release (/made)"},
		"a repository beside a killed run's checkout that is gone": {effects: run.Effects{Checkout: checkout("/made/workspace")}, end: killed, worktree: "/made/tool",
			canonical: map[string]string{"/made/workspace": ""},
			want:      "worktree /made/tool is inside the directory made for the checkout of run run-0, which has not finished (/made)"},
		"beside a checkout whose directory is recorded by another name": {effects: run.Effects{Checkout: checkout("/var/made/workspace")}, end: killed, worktree: "/private/var/made/tool",
			canonical: map[string]string{"/var/made/workspace": "/private/var/made/workspace", "/var/made": "/private/var/made"},
			want:      "worktree /private/var/made/tool is inside the directory made for the checkout of run run-0, which has not finished (/var/made)"},
		"a repository beside a finished run's released checkout": {effects: run.Effects{Checkout: checkout("/made/workspace")}, end: finished, worktree: "/made/tool"},
		// The cases that refuse nothing give the checkout a directory made
		// for it, as every checkout has: one at the root would have the root
		// removed with it, which holds every worktree.
		"nested by its name, a link out of the checkout": {effects: run.Effects{Checkout: checkout("/made/workspace")}, end: killed, worktree: "/made/workspace/out",
			canonical: map[string]string{"/made/workspace/out": "/elsewhere"}},
		"a repository nested in a finished run's released checkout": {effects: run.Effects{Checkout: checkout("/made")}, end: finished, worktree: "/made/tool"},
		"a killed run's checkout that is gone": {effects: run.Effects{Checkout: checkout("/gone/workspace")}, end: killed,
			canonical: map[string]string{"/gone/workspace": "", "/gone": ""}},
		"a killed run's checkout beside, its name the start of the worktree's":  {effects: run.Effects{Checkout: checkout("/rep/workspace")}, end: killed},
		"a killed run's checkout beside, its name starting with the worktree's": {effects: run.Effects{Checkout: checkout("/repo-2/workspace")}, end: killed},
		"a killed run's checkout":             {effects: run.Effects{Checkout: checkout("/repo")}, end: killed, want: "worktree /repo is the checkout of run run-0, which has not finished"},
		"a running run's checkout":            {effects: run.Effects{Checkout: checkout("/repo")}, end: running, want: "worktree /repo is the checkout of run run-0, which has not finished"},
		"a clean copy still on record":        {effects: run.Effects{Checkout: checkout("/gone"), Copy: checkout("/repo")}, end: finished, want: "worktree /repo is a clean copy run run-0 still has on record"},
		"an unreleased checkout":              {effects: run.Effects{Checkout: checkout("/repo"), Unreleased: checkout("/repo")}, end: finished, want: "worktree /repo is a checkout run run-0 could not release"},
		"a finished run's released checkout":  {effects: run.Effects{Checkout: checkout("/repo")}, end: finished},
		"a killed run's checkout elsewhere":   {effects: run.Effects{Checkout: checkout("/elsewhere/workspace")}, end: killed},
		"an unreleased checkout elsewhere":    {effects: run.Effects{Checkout: checkout("/elsewhere/workspace"), Unreleased: checkout("/elsewhere/workspace")}, end: finished},
		"a clean copy on record at elsewhere": {effects: run.Effects{Copy: checkout("/elsewhere/workspace")}, end: finished},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			ctx := context.Background()
			h := newHarness()
			h.locks.canonical = c.canonical
			worktree := "/repo"
			if c.worktree != "" {
				worktree = c.worktree
			}
			store, borrow := storedBorrows(t, h)
			owner := run.Record{ID: "run-0", Effects: &c.effects}
			handle, err := store.Create(ctx, owner)
			if err != nil {
				t.Fatal(err)
			}
			t.Cleanup(func() { _ = store.Abandon(owner.ID) })
			switch c.end {
			case killed:
				err = store.Abandon(owner.ID)
			case finished:
				at := time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC)
				owner.FinishedAt, owner.ProcessesEnded = &at, known(true)
				err = handle.Finish(owner)
			}
			if err != nil {
				t.Fatal(err)
			}

			borrowed, err := borrow("run-1", worktree, saved)

			if c.want == "" {
				if err != nil || !h.locks.holds(worktree) {
					t.Fatalf("the borrow = %v, lock held %v", err, h.locks.holds(worktree))
				}
				return
			}
			var refusal *app.Refusal
			if !errors.As(err, &refusal) || !strings.Contains(refusal.Reason, c.want) || !strings.Contains(refusal.Reason, "ADR-022 rule 2") {
				t.Fatalf("the borrow = %v, want a refusal with %q", err, c.want)
			}
			if borrowed != nil || h.locks.holds(worktree) || !reflect.DeepEqual(h.locks.unlocked, []string{worktree}) {
				t.Fatalf("borrowed %+v, lock held %v, unlocked %v", borrowed, h.locks.holds(worktree), h.locks.unlocked)
			}
			if h.worktrees.reads != 0 || len(h.processes.refs()) != 0 || len(h.setup.runs()) != 0 || !recorded(h, "WORKTREE_NOT_ADMITTED") {
				t.Fatalf("reads %d, reaped %v, precheck runs %v, events %v", h.worktrees.reads, h.processes.refs(), h.setup.runs(), h.recorder.kinds())
			}
		})
	}
}

// ADR-022 rule 7: a commit the agent made in the worktree fails the call,
// and stays: the changes are still captured from the revision, and nothing
// is undone.
func TestAnAgentsCommitFailsTheCall(t *testing.T) {
	t.Parallel()
	h := newHarness()
	withWorkspace(h, inPlaceWorkspace)
	changedByTheTurn(h)
	h.worktrees.state = func(revision string, _ int) app.WorktreeState {
		if len(h.runner.calls()) > 0 {
			return app.WorktreeState{Head: "sha-agent", Tree: "tree"}
		}
		return app.WorktreeState{Head: revision, Tree: "tree"}
	}
	record := h.call(t, contract.CallRequest{})

	if class(record) != run.ClassCommitted || !strings.Contains(message(record), "the worktree's HEAD is sha-agent, not revision sha-HEAD") {
		t.Fatalf("result %s %q", class(record), message(record))
	}
	if !recorded(h, "WORKTREE_COMMITTED") || string(h.recorder.artifacts["changes.patch"]) != "the turn's patch" || record.InPlace.Content != "after" {
		t.Fatalf("events %v, artifacts %v", h.recorder.kinds(), h.recorder.artifacts)
	}
	if len(h.changes.applies()) != 0 || len(h.workspaces.discarded) != 0 || h.locks.holds("/repo") {
		t.Fatal("the worktree was changed or kept locked")
	}
}

// ADR-022 rule 7: a capture that fails leaves an in-place call without a
// provenance claim: its record names no content its changes were captured
// from, which a continuation in-place would resume from (rule 8), and no
// changes.patch is kept. The call's status is the turn's.
func TestAFailedCaptureLeavesAnInPlaceCallWithoutAProvenanceClaim(t *testing.T) {
	t.Parallel()
	h := newHarness()
	withWorkspace(h, inPlaceWorkspace)
	changedByTheTurn(h)
	h.changes.changeErr = errors.New("git broke")
	record := h.call(t, contract.CallRequest{})

	if record.Result.Status != run.Completed {
		t.Fatalf("result %+v", record.Result)
	}
	if record.InPlace == nil || record.InPlace.Content != "" {
		t.Fatalf("in place %+v", record.InPlace)
	}
	if len(record.Result.Artifacts) != 0 || len(h.recorder.artifacts) != 0 || !recorded(h, "ARTIFACT_FAILED") || recorded(h, "NO_CHANGES") {
		t.Fatalf("artifacts %+v, stored %v, events %v", record.Result.Artifacts, h.recorder.artifacts, h.recorder.kinds())
	}
	if h.locks.holds("/repo") {
		t.Fatal("the worktree's lock was kept")
	}
}

// ADR-022 rule 7: a turn that fails leaves its changes in the worktree, and
// they are captured all the same.
func TestAFailedInPlaceTurnLeavesItsChanges(t *testing.T) {
	t.Parallel()
	h := newHarness()
	withWorkspace(h, inPlaceWorkspace)
	changedByTheTurn(h)
	h.runner.turn = run.Turn{Status: run.Failed, Error: run.Fault(run.ClassRuntimeError, "the runtime fell over")}
	record := h.call(t, contract.CallRequest{})

	if class(record) != run.ClassRuntimeError {
		t.Fatalf("result %+v", record.Result)
	}
	if string(h.recorder.artifacts["changes.patch"]) != "the turn's patch" || len(h.changes.applies()) != 0 || len(h.workspaces.discarded) != 0 {
		t.Fatalf("artifacts %v, applied %v, discarded %v", h.recorder.artifacts, h.changes.applies(), h.workspaces.discarded)
	}
	noWorktreeEffect(t, record)
}

// ADR-022 rule 3: an in-place call that panics once its runtime's process
// is on record does not know that process ended: its record says so, and
// the next call to borrow the worktree asks about the process again.
func TestAnInPlaceCallThatPanicsLeavesItsProcessesNotKnownToHaveEnded(t *testing.T) {
	t.Parallel()
	h := newHarness()
	withWorkspace(h, inPlaceWorkspace)
	h.runner.acting = func(context.Context, app.EventSink) { panic("the runner exploded") }
	record := h.call(t, contract.CallRequest{})

	if class(record) != run.ClassInternal || message(record) != "the runner exploded" {
		t.Fatalf("result %+v", record.Result)
	}
	if record.Effects == nil || record.Effects.Process == nil || record.Effects.Process.Ref != "ref-4242" || !says(record, false) {
		t.Fatalf("effects %+v, processes ended %s", record.Effects, said(record))
	}
}

// An in-place call that verifies still verifies on a clean copy of the
// revision with its patch, never in the worktree.
func TestAnInPlaceCallVerifiesOnACleanCopy(t *testing.T) {
	t.Parallel()
	h := newHarness()
	verifying(h)
	withWorkspace(h, inPlaceWorkspace)
	changedByTheTurn(h)
	h.changes.copied = func(string, int) string { return "after" }
	record := h.call(t, contract.CallRequest{})

	if record.Result.Status != run.Completed || record.InPlace == nil || record.InPlace.Verify != run.VerifyOnCopy {
		t.Fatalf("result %+v, in place %+v", record.Result, record.InPlace)
	}
	if len(h.copies.made) != 1 || h.copies.made[0].revision != "sha-HEAD" || h.copies.made[0].patch != "the turn's patch" {
		t.Fatalf("copies %+v", h.copies.made)
	}
	for _, ran := range h.commands.runs() {
		if !strings.HasPrefix(ran.Dir, copyDirs) {
			t.Fatalf("verified in %s", ran.Dir)
		}
	}
	if len(h.commands.runs()) == 0 {
		t.Fatal("no verification ran")
	}
}
