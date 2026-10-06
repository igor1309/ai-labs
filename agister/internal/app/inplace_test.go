package app_test

import (
	"context"
	"reflect"
	"strings"
	"testing"
	"time"

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
	if h.locks.holds("/repo") || !reflect.DeepEqual(h.locks.unlocked, []string{"/repo"}) || !record.ProcessesEnded {
		t.Fatalf("lock held %v, unlocked %v, processes ended %v", h.locks.holds("/repo"), h.locks.unlocked, record.ProcessesEnded)
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
	h.setup.running = func(app.SetupCommandRequest) { turnsDuringPrecheck = len(h.runner.calls()) }
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

// inPlaceRun is a run that worked in worktree, finished or not, its runtime
// process recorded.
func inPlaceRun(id, worktree string, finished, ended bool) run.Record {
	record := run.Record{ID: id, InPlace: &run.InPlace{Dir: worktree, Worktree: worktree, Revision: "sha-HEAD"},
		Effects: &run.Effects{Process: &run.Process{Ref: "ref-" + id}}, ProcessesEnded: ended}
	if finished {
		at := time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC)
		record.FinishedAt = &at
	}
	return record
}

// ADR-022 rule 3: under the lock, a run that worked in the worktree and may
// still write there refuses the call: one unfinished, or one whose process
// is not known to have ended and cannot be ended now. One whose process is
// ended, or is gone, does not; nor does a run in another worktree.
func TestAnotherRunThatMayStillWriteInTheWorktreeRefusesTheCall(t *testing.T) {
	t.Parallel()
	for name, c := range map[string]struct {
		other   run.Record
		outcome app.Reaping
		reaped  []string
		want    string // the refusal; none when empty
	}{
		"unfinished":                {other: inPlaceRun("run-0", "/repo", false, false), want: "run run-0 worked in worktree /repo and has not finished"},
		"its process left":          {other: inPlaceRun("run-0", "/repo", true, false), outcome: app.ReapLeft, reaped: []string{"ref-run-0"}, want: `its runtime process "ref-run-0" may still write there`},
		"its process killed":        {other: inPlaceRun("run-0", "/repo", true, false), outcome: app.ReapKilled, reaped: []string{"ref-run-0"}},
		"its process gone":          {other: inPlaceRun("run-0", "/repo", true, false), outcome: app.ReapGone, reaped: []string{"ref-run-0"}},
		"its processes known ended": {other: inPlaceRun("run-0", "/repo", true, true)},
		"unfinished elsewhere":      {other: inPlaceRun("run-0", "/elsewhere", false, false)},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			h := newHarness()
			withWorkspace(h, inPlaceWorkspace)
			h.runs.records[c.other.ID] = c.other
			h.processes.outcome = c.outcome
			record := h.call(t, contract.CallRequest{})

			if !reflect.DeepEqual(h.processes.refs(), c.reaped) {
				t.Fatalf("reaped %v, want %v", h.processes.refs(), c.reaped)
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
			if len(h.runner.calls()) != 0 || h.worktrees.reads != 0 || h.locks.holds("/repo") {
				t.Fatalf("turns %d, reads %d", len(h.runner.calls()), h.worktrees.reads)
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

// ADR-022 rule 8 is not implemented yet: continuing a run in-place is
// refused, and says so, before any turn or lock.
func TestContinuingInPlaceIsRefused(t *testing.T) {
	t.Parallel()
	h := newHarness()
	record := h.call(t, contract.CallRequest{Continue: "run-0", Workspace: "in-place"})

	if class(record) != run.ClassRefused || !strings.Contains(message(record), "continuing a run in-place is not supported yet") {
		t.Fatalf("result %s %q", class(record), message(record))
	}
	if len(h.runner.calls()) != 0 || len(h.locks.locked) != 0 {
		t.Fatalf("turns %d, locks %v", len(h.runner.calls()), h.locks.locked)
	}
}
