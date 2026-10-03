package app_test

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/adapters/fsruns"
	"github.com/igor1309/ai-labs/agister/internal/adapters/git"
	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/contract"
	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

func TestAContinuationWithAnUnreadableLaterRecordIsRefused(t *testing.T) {
	t.Parallel()
	h, order := carrying()
	store := fsruns.Store{Dir: t.TempDir()}
	ctx := context.Background()
	for _, id := range []string{"run-0", "run-0b"} {
		prior := patchedRun(h, id, "", 0, 1, "diff A\n")
		if id == "run-0b" {
			prior = patchedRun(h, id, "run-0", 2, 3, "diff AB\n")
		}
		handle, err := store.Create(ctx, prior)
		if err != nil {
			t.Fatal(err)
		}
		artifact, err := handle.Artifact("changes.patch", h.runs.artifacts[id+"/artifacts/changes.patch"])
		if err != nil {
			t.Fatal(err)
		}
		prior.Result.Artifacts = []run.Artifact{artifact}
		if err := handle.Finish(prior); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.WriteFile(filepath.Join(store.Dir, "run-0b", "record.json"), []byte("{"), 0o600); err != nil {
		t.Fatal(err)
	}
	h.calls = h.callsWith(h.defs, h.workspaces, h.changes, store)
	record := h.call(t, contract.CallRequest{Continue: "run-0"})
	if class(record) != run.ClassRefused || !strings.Contains(message(record), "listing run run-0b") || !contains(h.recorder.kinds(), "REFUSED") {
		t.Fatalf("result %+v, events %v", record.Result, h.recorder.kinds())
	}
	if len(h.runner.calls()) != 0 || len(h.workspaces.checkouts) != 0 || len(*order) != 0 || len(h.changes.applies()) != 0 {
		t.Fatalf("turns %d, checkouts %v, order %v, applied %v", len(h.runner.calls()), h.workspaces.checkouts, *order, h.changes.applies())
	}
}

func TestAContinuationWhenSessionListingFails(t *testing.T) {
	t.Parallel()
	for _, checkout := range []bool{true, false} {
		t.Run(map[bool]string{true: "checkout", false: "no checkout"}[checkout], func(t *testing.T) {
			t.Parallel()
			h, order := carrying()
			prior := patchedRun(h, "run-0", "", 0, 1, "diff A\n")
			cost := 7.75
			prior.Turn.Session = &run.SessionTotals{CostUSD: &cost}
			h.runs.records["run-0"] = prior
			h.runs.listErr = errors.New("records unavailable")
			if !checkout {
				withoutCheckout(h)
			}
			record := h.call(t, contract.CallRequest{Continue: "run-0"})
			if len(h.workspaces.checkouts) != 0 || len(h.changes.applies()) != 0 {
				t.Fatalf("checkouts %v, applied %v", h.workspaces.checkouts, h.changes.applies())
			}
			if class(record) != run.ClassRefused || !strings.Contains(message(record), "records unavailable") || !contains(h.recorder.kinds(), "REFUSED") {
				t.Fatalf("result %+v, events %v", record.Result, h.recorder.kinds())
			}
			if len(h.runner.calls()) != 0 || len(*order) != 0 {
				t.Fatalf("turns %d, order %v", len(h.runner.calls()), *order)
			}
		})
	}
}

func TestALegacyContinuationRequiresTheSameProcessDefinition(t *testing.T) {
	t.Parallel()
	for _, identity := range []string{"changed selector", "missing recorded identity", "missing current identity"} {
		t.Run(identity, func(t *testing.T) {
			t.Parallel()
			h, order := carrying()
			h.defs.docs[definition.KindProcess]["p"] = strings.Replace(h.defs.docs[definition.KindProcess]["p"],
				"    diff:", "    other_revision: {source: git.revision, rev: main}\n    diff:", 1)
			prior := patchedRun(h, "run-0", "", 0, 1, "diff A\n")
			prior.Effects.Checkout.Revision = ""
			prior.Inputs = append(prior.Inputs, run.Input{Name: "other_revision", Source: "git.revision", Identity: "sha-main", Revision: true})
			switch identity {
			case "changed selector":
				h.defs.docs[definition.KindProcess]["p"] = strings.Replace(h.defs.docs[definition.KindProcess]["p"], "checkout: candidate_revision", "checkout: other_revision", 1)
			case "missing recorded identity":
				prior.Definitions = nil
			case "missing current identity":
				// The document still resolves, but its source has no digest.
				h.calls = h.callsOn(&withoutProcessDigest{h.defs})
			}
			h.runs.records["run-0"] = prior
			record := h.call(t, contract.CallRequest{Continue: "run-0"})
			if class(record) != run.ClassRefused || !strings.Contains(message(record), "process definition cannot be matched") || !contains(h.recorder.kinds(), "REFUSED") {
				t.Fatalf("result %+v, events %v", record.Result, h.recorder.kinds())
			}
			if len(h.runner.calls()) != 0 || len(h.workspaces.checkouts) != 0 || len(*order) != 0 {
				t.Fatalf("turns %d, checkouts %v, order %v", len(h.runner.calls()), h.workspaces.checkouts, *order)
			}
		})
	}
}

type withoutProcessDigest struct{ *definitionsSpy }

func (s *withoutProcessDigest) Read(ctx context.Context, kind definition.Kind, name string) (definition.Document, error) {
	doc, err := s.definitionsSpy.Read(ctx, kind, name)
	if kind == definition.KindProcess {
		doc.Source.SHA256 = ""
	}
	return doc, err
}

func continuationGit(t *testing.T, dir string, args ...string) string {
	t.Helper()
	command := exec.Command("git", args...)
	command.Dir = dir
	out, err := command.CombinedOutput()
	if err != nil {
		t.Fatalf("git %v: %v\n%s", args, err, out)
	}
	return strings.TrimSpace(string(out))
}

// observedStore keeps real records and artifacts in the temp store, and exposes
// the finished record and events through the harness's existing recorder seam.
type observedStore struct {
	fsruns.Store
	observer *recorderSpy
}

func (s observedStore) Create(ctx context.Context, record run.Record) (app.RunHandle, error) {
	handle, err := s.Store.Create(ctx, record)
	if err != nil {
		return nil, err
	}
	return observedHandle{RunHandle: handle, observer: s.observer}, nil
}

type observedHandle struct {
	app.RunHandle
	observer *recorderSpy
}

func (h observedHandle) Append(event run.Event) error {
	if err := h.RunHandle.Append(event); err != nil {
		return err
	}
	return h.observer.Append(event)
}

func (h observedHandle) Finish(record run.Record) error {
	if err := h.RunHandle.Finish(record); err != nil {
		return err
	}
	return h.observer.Finish(record)
}

type continuationID string

func (id continuationID) RunID(time.Time) string { return string(id) }

func storePatchedRun(t *testing.T, h *harness, store fsruns.Store) {
	t.Helper()
	prior := patchedRun(h, "run-0", "", 0, 1, "diff A\n")
	handle, err := store.Create(context.Background(), prior)
	if err != nil {
		t.Fatal(err)
	}
	artifact, err := handle.Artifact("changes.patch", []byte("diff A\n"))
	if err != nil {
		t.Fatal(err)
	}
	prior.Result.Artifacts = []run.Artifact{artifact}
	if err := handle.Finish(prior); err != nil {
		t.Fatal(err)
	}
}

func withoutCheckout(h *harness) {
	h.defs.docs[definition.KindProcess]["p"] = strings.Replace(h.defs.docs[definition.KindProcess]["p"],
		"workspace:\n  checkout: candidate_revision\n  setup: {command: ./own.sh, timeout: 30s}\n", "", 1)
	h.defs.docs[definition.KindPolicy]["pol"] = strings.Replace(h.defs.docs[definition.KindPolicy]["pol"], "scope: candidate", "scope: repository", 1)
}

func TestANoCheckoutContinuationCannotAdvanceTheSessionDuringCheckoutSetup(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	store := fsruns.Store{Dir: t.TempDir()}
	first, _ := carrying()
	storePatchedRun(t, first, store)
	first.runner.turn.ProviderSessionID = "prov-0"
	started, resume := make(chan struct{}), make(chan struct{})
	first.setup.running = func(app.SetupCommandRequest) {
		close(started)
		<-resume
	}
	first.calls = first.callsRecordedWith(first.defs, first.workspaces, first.changes, store,
		observedStore{store, first.recorder}, continuationID("run-1"))
	if _, err := first.calls.Submit(ctx, contract.CallRequest{Process: "p", Continue: "run-0", Cwd: "/repo"}); err != nil {
		t.Fatal(err)
	}
	select {
	case <-started:
	case record := <-first.recorder.finished:
		t.Fatalf("first call ended before setup: %+v", record.Result)
	}
	second, order := carrying()
	withoutCheckout(second)
	second.calls = second.callsRecordedWith(second.defs, second.workspaces, second.changes, store,
		observedStore{store, second.recorder}, continuationID("run-2"))
	_, err := second.calls.Submit(ctx, contract.CallRequest{Process: "p", Continue: "run-0", Cwd: "/repo"})
	if err != nil {
		close(resume)
		first.recorder.wait(t)
		t.Fatal(err)
	}
	refused := second.recorder.wait(t)
	close(resume)
	completed := first.recorder.wait(t)
	if class(refused) != run.ClassRefused || !strings.Contains(message(refused), "one has not finished") || !contains(second.recorder.kinds(), "REFUSED") {
		t.Fatalf("second result %+v, events %v", refused.Result, second.recorder.kinds())
	}
	if len(second.runner.calls()) != 0 || len(second.workspaces.checkouts) != 0 || len(second.setup.runs()) != 0 || len(*order) != 0 {
		t.Fatalf("second turns %d, checkouts %v, setup %v, order %v", len(second.runner.calls()), second.workspaces.checkouts, second.setup.runs(), *order)
	}
	if completed.Result.Status != run.Completed || len(first.runner.calls()) != 1 || len(first.changes.applies()) != 2 {
		t.Fatalf("first result %+v, turns %d, applied %v", completed.Result, len(first.runner.calls()), first.changes.applies())
	}
}

func TestAContinuationRechecksItsSelectionAfterSetup(t *testing.T) {
	t.Parallel()
	for _, patch := range []string{"diff A\n", ""} {
		t.Run(map[bool]string{true: "patch", false: "no patch"}[patch != ""], func(t *testing.T) {
			t.Parallel()
			h, _ := carrying()
			patchedRun(h, "run-0", "", 0, 1, patch)
			// The setup seam introduces a later completed run after selection.
			h.setup.running = func(app.SetupCommandRequest) {
				patchedRun(h, "run-0b", "run-0", 2, 3, "diff AB\n")
			}
			record := h.call(t, contract.CallRequest{Continue: "run-0"})
			if class(record) != run.ClassRefused || !strings.Contains(message(record), "advanced from run run-0 to run run-0b") || !contains(h.recorder.kinds(), "REFUSED") {
				t.Fatalf("result %+v, events %v", record.Result, h.recorder.kinds())
			}
			if len(h.runner.calls()) != 0 || contains(h.recorder.kinds(), "CHANGES_CARRIED") || h.workspaces.releases() != 1 {
				t.Fatalf("turns %d, events %v, releases %d", len(h.runner.calls()), h.recorder.kinds(), h.workspaces.releases())
			}
			for _, applied := range h.changes.applies() {
				if !applied.check {
					t.Fatalf("stale patch applied: %+v", applied)
				}
			}
		})
	}
}

// Contract test: the core over the git adapter and real git: the
// repository's identity outlives the worktree a run was launched from.
func TestContinuationAfterRemovingTheLaunchingWorktree(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	repo := t.TempDir()
	continuationGit(t, repo, "init", "--quiet", "--initial-branch=main")
	continuationGit(t, repo, "config", "user.email", "t@example.com")
	continuationGit(t, repo, "config", "user.name", "T")
	continuationGit(t, repo, "config", "maintenance.auto", "false")
	if err := os.WriteFile(filepath.Join(repo, "a.txt"), []byte("base\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	continuationGit(t, repo, "add", ".")
	continuationGit(t, repo, "commit", "--quiet", "-m", "base")
	revision := continuationGit(t, repo, "rev-parse", "HEAD")
	launching := filepath.Join(t.TempDir(), "launching")
	surviving := filepath.Join(t.TempDir(), "surviving")
	continuationGit(t, repo, "worktree", "add", "--detach", "--quiet", launching, revision)
	continuationGit(t, repo, "worktree", "add", "--detach", "--quiet", surviving, revision)
	store := fsruns.Store{Dir: t.TempDir()}
	workspaces := git.NewWorkspaces(git.NewWorktrees(t.TempDir()))
	newCall := func(id string) *harness {
		h, _ := carrying()
		h.runner.turn.ProviderSessionID = "prov-0"
		h.inputs.respond = func(app.InputSpec) (app.Resolved, error) {
			return app.Resolved{Value: revision, Identity: revision, Revision: true}, nil
		}
		h.calls = h.callsRecordedWith(h.defs, workspaces, workspaces, store,
			observedStore{store, h.recorder}, continuationID(id))
		return h
	}
	first := newCall("run-0")
	first.runner.during = func(request app.TurnRequest) {
		if err := os.WriteFile(filepath.Join(request.Cwd, "a.txt"), []byte("base\nA\n"), 0o600); err != nil {
			t.Error(err)
		}
	}
	if _, err := first.calls.Submit(ctx, contract.CallRequest{Process: "p", Cwd: launching}); err != nil {
		t.Fatal(err)
	}
	prior := first.recorder.wait(t)
	identity, err := workspaces.RepositoryIdentity(ctx, surviving)
	if err != nil {
		t.Fatal(err)
	}
	launchingRoot, err := workspaces.Root(ctx, launching)
	if err != nil {
		t.Fatal(err)
	}
	if prior.Result.Status != run.Completed || prior.Effects == nil || prior.Effects.Checkout == nil || prior.Effects.Checkout.RepositoryIdentity != identity || identity == "" || prior.Effects.Checkout.Repository != launchingRoot {
		t.Fatalf("identity %q, %v, prior %+v", identity, err, prior)
	}
	continuationGit(t, repo, "worktree", "remove", launching)
	second := newCall("run-1")
	second.runner.during = func(request app.TurnRequest) {
		data, err := os.ReadFile(filepath.Join(request.Cwd, "a.txt"))
		if err != nil || string(data) != "base\nA\n" || request.ResumeSessionID != "prov-0" {
			t.Errorf("content %q, %v, session %q", data, err, request.ResumeSessionID)
		}
	}
	if _, err := second.calls.Submit(ctx, contract.CallRequest{Process: "p", Continue: "run-0", Cwd: surviving}); err != nil {
		t.Fatal(err)
	}
	record := second.recorder.wait(t)
	if record.Result.Status != run.Completed || len(second.runner.calls()) != 1 || !contains(second.recorder.kinds(), "CHANGES_CARRIED") {
		t.Fatalf("result %+v, events %v", record.Result, second.recorder.kinds())
	}
}
