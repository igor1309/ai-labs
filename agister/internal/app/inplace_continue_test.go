package app_test

import (
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/contract"
	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
	"github.com/igor1309/ai-labs/agister/internal/domain/prompt"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

// resumingInPlace is a harness whose agent resumes sessions, the worktree
// holding content.
func resumingInPlace(content string) *harness {
	h := newHarness()
	h.defs.docs[definition.KindAgent]["a"] += "session = \"resumable\"\n"
	h.changes.identity = content
	return h
}

// workedInPlace records a finished run of p in session prov-0, created and
// finished at those minutes, that worked in the worktree /repo at sha-HEAD,
// left content there and kept patch as its changes; none when patch is
// empty, as a run that changed nothing (NO_CHANGES).
func workedInPlace(h *harness, id, continues string, created, finished int, content, patch string) run.Record {
	at := func(minute int) time.Time { return time.Date(2026, 9, 28, 11, minute, 0, 0, time.UTC) }
	end := at(finished)
	record := run.Record{ID: id, Process: "p", Agent: "a", Runtime: &run.Runtime{Adapter: "spy"},
		Request:   run.Request{Process: "p", Continue: continues, Cwd: "/repo"},
		CreatedAt: at(created), FinishedAt: &end, Workspace: "/repo",
		InPlace:        &run.InPlace{Dir: "/repo", Worktree: "/repo", RepositoryIdentity: "/repo", Revision: "sha-HEAD", Content: content},
		ProcessesEnded: known(true),
		Turn:           &run.Turn{Status: run.Failed, Error: run.Fault(run.ClassRateLimited, "429"), ProviderSessionID: "prov-0"},
		Result: &run.Result{Status: run.Failed, Error: run.Fault(run.ClassRateLimited, "429"),
			Session: &run.Session{ProviderSessionID: "prov-0", Continues: continues}},
	}
	if patch != "" {
		record.Result.Artifacts = []run.Artifact{h.runs.store(id, "changes.patch", []byte(patch))}
	}
	h.runs.records[id], h.runs.states[id] = record, run.StateFinished
	return record
}

// ADR-025 rule 7: a continuation in-place, in the worktree the session's
// latest run left as it recorded, resumes the session there: nothing is
// carried or applied, the prompt says the changes are already there, and
// the call's own patch is still from the revision, the content it was
// taken from on record.
func TestAnInPlaceContinuationResumesInTheSameWorktree(t *testing.T) {
	t.Parallel()
	h := resumingInPlace("left")
	workedInPlace(h, "run-0", "", 0, 1, "left", "diff A\n")
	h.changes.identify = func() string {
		if len(h.runner.calls()) > 0 {
			return "after"
		}
		return "left"
	}
	h.changes.changes = []byte("diff A and the turn's\n")
	record := h.call(t, contract.CallRequest{Continue: "run-0"})

	if record.Result.Status != run.Completed || len(h.runner.calls()) != 1 {
		t.Fatalf("result %+v", record.Result)
	}
	if len(h.changes.applies()) != 0 || len(h.workspaces.checkouts) != 0 || contains(h.recorder.kinds(), "CHANGES_CARRIED") {
		t.Fatalf("applied %+v, checkouts %v, events %v", h.changes.applies(), h.workspaces.checkouts, h.recorder.kinds())
	}
	got := h.runner.calls()[0]
	notice := prompt.ContinuesInPlace("run-0", "run-0", "/repo", "sha-HEAD")
	if got.ResumeSessionID != "prov-0" || got.Cwd != "/repo" || !strings.HasPrefix(got.Prompt, notice+"\n\n## candidate_revision") || strings.Contains(got.Prompt, "gone") {
		t.Fatalf("request %+v", got)
	}
	// The latest run's patch was checked against its digest, under the lock.
	if !reflect.DeepEqual(h.runs.read, []string{"run-0/artifacts/changes.patch"}) || !reflect.DeepEqual(h.locks.locked, []string{"/repo"}) {
		t.Fatalf("read %v, locked %v", h.runs.read, h.locks.locked)
	}
	if !reflect.DeepEqual(h.changes.changed, [][2]string{{"/repo", "sha-HEAD"}}) || string(h.recorder.artifacts["changes.patch"]) != "diff A and the turn's\n" {
		t.Fatalf("changed %v, artifacts %v", h.changes.changed, h.recorder.artifacts)
	}
	if record.InPlace == nil || record.InPlace.Content != "after" || record.Result.Session.Continues != "run-0" {
		t.Fatalf("in place %+v, session %+v", record.InPlace, record.Result.Session)
	}
	if kinds := strings.Join(h.recorder.kinds(), " "); !strings.Contains(kinds, "WORKTREE_LOCKED WORKTREE_ADMITTED") {
		t.Fatalf("events %s", kinds)
	}
}

// ADR-025 rule 7: a latest run that changed nothing (NO_CHANGES) recorded
// the revision's content; a worktree that still holds it is admitted, and
// there is no patch to read.
func TestAnInPlaceContinuationOfARunWithoutChangesIsAdmitted(t *testing.T) {
	t.Parallel()
	h := resumingInPlace("tree")
	workedInPlace(h, "run-0", "", 0, 1, "tree", "")
	record := h.call(t, contract.CallRequest{Continue: "run-0"})

	if record.Result.Status != run.Completed || len(h.runner.calls()) != 1 || h.runner.calls()[0].ResumeSessionID != "prov-0" {
		t.Fatalf("result %+v", record.Result)
	}
	if len(h.runs.read) != 0 || len(h.changes.applies()) != 0 {
		t.Fatalf("read %v, applied %+v", h.runs.read, h.changes.applies())
	}
}

// ADR-025 rule 7: the session's latest run, not the run named, decides the
// content the worktree must hold: continuing the first run after a later
// continuation of it expects what the later one left, and reads its patch.
func TestTheSessionsLatestRunDecidesTheExpectedContent(t *testing.T) {
	t.Parallel()
	for name, c := range map[string]struct {
		content string
		want    string // the refusal; none when empty
	}{
		"what the latest run left": {content: "left-0b"},
		"what the run named left":  {content: "left-0", want: "worktree /repo has content left-0, not left-0b, which run run-0b, the latest run of the session, left there"},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			h := resumingInPlace(c.content)
			workedInPlace(h, "run-0", "", 0, 1, "left-0", "diff A\n")
			workedInPlace(h, "run-0b", "run-0", 2, 3, "left-0b", "diff AB\n")
			record := h.call(t, contract.CallRequest{Continue: "run-0"})

			if !reflect.DeepEqual(h.runs.read, []string{"run-0b/artifacts/changes.patch"}) {
				t.Fatalf("read %v", h.runs.read)
			}
			if c.want != "" {
				if class(record) != run.ClassRefused || !strings.Contains(message(record), c.want) || len(h.runner.calls()) != 0 {
					t.Fatalf("result %s %q, want %q", class(record), message(record), c.want)
				}
				return
			}
			if record.Result.Status != run.Completed {
				t.Fatalf("result %+v", record.Result)
			}
			if notice := prompt.ContinuesInPlace("run-0", "run-0b", "/repo", "sha-HEAD"); !strings.HasPrefix(h.runner.calls()[0].Prompt, notice) {
				t.Fatalf("prompt %q", h.runner.calls()[0].Prompt)
			}
		})
	}
}

// ADR-025 rule 7: a continuation is refused, each case with its own
// reason, before any turn, under the worktree's hold, which is let go,
// unless the latest run worked in this worktree, repository and revision,
// its changes were captured and still match their record, and the
// worktree, HEAD at the revision, holds what it left. A latest run that
// worked in a checkout of its own, made before ADR-025, is refused. Nothing
// is applied either way.
func TestAnInPlaceContinuationIsRefusedUnlessTheWorktreeIsAsTheLatestRunLeftIt(t *testing.T) {
	t.Parallel()
	for name, c := range map[string]struct {
		arrange func(h *harness, latest *run.Record)
		want    string
	}{
		"the tree drifted": {
			arrange: func(h *harness, _ *run.Record) { h.changes.identity = "edited" },
			want:    "worktree /repo has content edited, not left, which run run-0, the latest run of the session, left there",
		},
		"another worktree": {
			arrange: func(_ *harness, latest *run.Record) {
				latest.Workspace, latest.InPlace.Dir, latest.InPlace.Worktree = "/other", "/other", "/other"
			},
			want: "run run-0, the latest run of the session, worked in worktree /other, not /repo",
		},
		"another repository": {
			arrange: func(_ *harness, latest *run.Record) { latest.InPlace.RepositoryIdentity = "/other.git" },
			want:    "run run-0, the latest run of the session, worked in repository /other.git, not /repo",
		},
		"another revision": {
			arrange: func(_ *harness, latest *run.Record) { latest.InPlace.Revision = "sha-old" },
			want:    "run run-0, the latest run of the session, worked on revision sha-old, not sha-HEAD",
		},
		"HEAD moved": {
			arrange: func(h *harness, _ *run.Record) {
				h.worktrees.state = func(string, int) app.WorktreeState { return app.WorktreeState{Head: "sha-moved", Tree: "tree"} }
			},
			want: "worktree /repo is at sha-moved, not revision sha-HEAD",
		},
		"a latest run in a checkout of its own": {
			arrange: func(_ *harness, latest *run.Record) {
				latest.Workspace, latest.InPlace = "/work/checkout-run-0", nil
				latest.Effects = &run.Effects{Checkout: &run.Checkout{Repository: "/repo", Dir: "/work/checkout-run-0", Revision: "sha-HEAD"}}
			},
			want: "run run-0, the latest run of the session, worked in a checkout of its own (/work/checkout-run-0), made before ADR-025; it cannot be continued: a call works in the caller's worktree now (ADR-025 rule 7)",
		},
		"a patch that does not match its digest": {
			arrange: func(h *harness, _ *run.Record) {
				h.runs.artifacts["run-0/artifacts/changes.patch"] = []byte("tampered")
			},
			want: "run run-0's changes.patch is sha256:" + sha("tampered") + ", not sha256:" + sha("diff A\n") + " as recorded",
		},
		"a capture that failed": {
			arrange: func(_ *harness, latest *run.Record) { latest.InPlace.Content, latest.Result.Artifacts = "", nil },
			want:    "run run-0, the latest run of the session, recorded no content its changes were captured from: its capture failed",
		},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			h := resumingInPlace("left")
			latest := workedInPlace(h, "run-0", "", 0, 1, "left", "diff A\n")
			c.arrange(h, &latest)
			h.runs.records["run-0"] = latest
			record := h.call(t, contract.CallRequest{Continue: "run-0"})

			if class(record) != run.ClassRefused || !strings.Contains(message(record), c.want) {
				t.Fatalf("result %s %q, want %q", class(record), message(record), c.want)
			}
			if len(h.runner.calls()) != 0 || len(h.changes.applies()) != 0 || len(h.workspaces.checkouts) != 0 {
				t.Fatalf("turns %d, applied %+v, checkouts %v", len(h.runner.calls()), h.changes.applies(), h.workspaces.checkouts)
			}
			if !reflect.DeepEqual(h.locks.locked, []string{"/repo"}) || h.locks.holds("/repo") || !recorded(h, "WORKTREE_NOT_ADMITTED") {
				t.Fatalf("locked %v, held %v, events %v", h.locks.locked, h.locks.holds("/repo"), h.recorder.kinds())
			}
		})
	}
}

// ADR-025 rule 7: a runtime that resumes a session only in the directory it
// ran in continues an in-place run in the same worktree, and refuses one
// that worked in another directory, before the worktree is locked.
func TestARuntimeThatResumesOnlyWhereItRanContinuesInTheSameWorktree(t *testing.T) {
	t.Parallel()
	for name, c := range map[string]struct {
		dir  string
		want string // the refusal; none when empty
	}{
		"the same worktree": {dir: "/repo"},
		"another directory": {dir: "/elsewhere", want: "runtime rt resumes a session only in the directory it ran in: run run-0 worked in /elsewhere, not /repo"},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			h := resumingInPlace("left")
			h.runner.identity.ResumeWhereItRan = true
			latest := workedInPlace(h, "run-0", "", 0, 1, "left", "diff A\n")
			latest.Workspace, latest.InPlace.Dir, latest.InPlace.Worktree = c.dir, c.dir, c.dir
			h.runs.records["run-0"] = latest
			record := h.call(t, contract.CallRequest{Continue: "run-0"})

			if c.want == "" {
				if record.Result.Status != run.Completed || len(h.runner.calls()) != 1 || h.runner.calls()[0].Cwd != "/repo" {
					t.Fatalf("result %+v", record.Result)
				}
				return
			}
			if class(record) != run.ClassRefused || !strings.Contains(message(record), c.want) {
				t.Fatalf("result %s %q, want %q", class(record), message(record), c.want)
			}
			if len(h.runner.calls()) != 0 || len(h.locks.locked) != 0 {
				t.Fatalf("turns %d, locked %v", len(h.runner.calls()), h.locks.locked)
			}
		})
	}
}

// ADR-025 rule 7: a continuation of a run that pinned no revision is
// checked for the worktree only: whatever HEAD and the content are, it is
// admitted in the worktree the run worked in, and refused in another.
func TestAContinuationWithoutARevisionIsCheckedForTheWorktreeOnly(t *testing.T) {
	t.Parallel()
	for name, c := range map[string]struct {
		worktree string
		want     string // the refusal; none when empty
	}{
		"the same worktree": {worktree: "/repo"},
		"another worktree":  {worktree: "/other", want: "run run-0, the latest run of the session, worked in worktree /other, not /repo"},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			h := resumingInPlace("edited")
			inTheRepositoryItself(h)
			h.worktrees.state = func(string, int) app.WorktreeState { return app.WorktreeState{Head: "sha-moved", Tree: "tree"} }
			latest := workedInPlace(h, "run-0", "", 0, 1, "", "")
			latest.Workspace, latest.InPlace = c.worktree, &run.InPlace{Dir: c.worktree, Worktree: c.worktree}
			h.runs.records["run-0"] = latest
			record := h.call(t, contract.CallRequest{Continue: "run-0"})

			if c.want == "" {
				if record.Result.Status != run.Completed || len(h.runner.calls()) != 1 || h.worktrees.reads != 0 {
					t.Fatalf("result %+v, reads %d", record.Result, h.worktrees.reads)
				}
				return
			}
			if class(record) != run.ClassRefused || !strings.Contains(message(record), c.want) || len(h.runner.calls()) != 0 {
				t.Fatalf("result %s %q, want %q", class(record), message(record), c.want)
			}
		})
	}
}

// ADR-025 rules 3 and 7: a continuation of a process that declares
// workspace.clean is not checked against HEAD's content: its worktree holds
// the session's changes, staged, untracked or not, and it is admitted when
// it holds what the latest run left.
func TestACleanProcessesContinuationIsNotCheckedAgainstHEAD(t *testing.T) {
	t.Parallel()
	h := resumingInPlace("left")
	cleanly(h)
	h.worktrees.state = func(revision string, _ int) app.WorktreeState {
		return app.WorktreeState{Head: revision, Tree: "tree", Staged: []string{"a.go"}, Untracked: []string{"notes.md"}}
	}
	workedInPlace(h, "run-0", "", 0, 1, "left", "diff A\n")
	record := h.call(t, contract.CallRequest{Continue: "run-0"})

	if record.Result.Status != run.Completed || len(h.runner.calls()) != 1 || h.runner.calls()[0].ResumeSessionID != "prov-0" {
		t.Fatalf("result %+v: %s", record.Result, message(record))
	}
}
