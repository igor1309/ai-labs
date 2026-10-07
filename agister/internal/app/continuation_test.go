package app_test

import (
	"context"
	"errors"
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

func TestAContinuationWithAnUnreadableLaterRecordIsRefused(t *testing.T) {
	t.Parallel()
	h, order := resuming()
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
			h, order := resuming()
			prior := patchedRun(h, "run-0", "", 0, 1, "diff A\n")
			cost := 7.75
			prior.Turn.Session = &run.SessionTotals{CostUSD: &cost}
			h.runs.records["run-0"] = prior
			h.runs.listErr = errors.New("records unavailable")
			if !checkout {
				inTheRepositoryItself(h)
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

// A continuation is refused while another of its session is under way,
// even one of a process without a checkout: the session's latest run is
// unknown until it finishes.
func TestAContinuationCannotAdvanceTheSessionWhileAnotherIsUnderWay(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	store := fsruns.Store{Dir: t.TempDir()}
	first, _ := resuming()
	storePatchedRun(t, first, store)
	first.runner.turn.ProviderSessionID = "prov-0"
	started, resume := make(chan struct{}), make(chan struct{})
	first.runner.during = func(app.TurnRequest) {
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
		t.Fatalf("first call ended before its turn: %+v", record.Result)
	}
	second, order := resuming()
	inTheRepositoryItself(second)
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
	if len(second.runner.calls()) != 0 || len(*order) != 0 {
		t.Fatalf("second turns %d, order %v", len(second.runner.calls()), *order)
	}
	if completed.Result.Status != run.Completed || len(first.runner.calls()) != 1 || len(first.changes.applies()) != 0 {
		t.Fatalf("first result %+v, turns %d, applied %v", completed.Result, len(first.runner.calls()), first.changes.applies())
	}
}

// A continuation checks its session's latest run again under its hold:
// one that finished since it was selected refuses the call before any
// turn, and the hold is let go.
func TestAContinuationRechecksItsSelectionUnderItsHold(t *testing.T) {
	t.Parallel()
	for _, patch := range []string{"diff A\n", ""} {
		t.Run(map[bool]string{true: "patch", false: "no patch"}[patch != ""], func(t *testing.T) {
			t.Parallel()
			h, order := resuming()
			patchedRun(h, "run-0", "", 0, 1, patch)
			// Reading the worktree, under the hold, finds a later run finished.
			h.worktrees.state = func(revision string, n int) app.WorktreeState {
				if n == 0 {
					patchedRun(h, "run-0b", "run-0", 2, 3, "diff AB\n")
				}
				return app.WorktreeState{Head: revision, Tree: "tree"}
			}
			record := h.call(t, contract.CallRequest{Continue: "run-0"})
			if class(record) != run.ClassRefused || !strings.Contains(message(record), "advanced from run run-0 to run run-0b") || !contains(h.recorder.kinds(), "REFUSED") {
				t.Fatalf("result %+v, events %v", record.Result, h.recorder.kinds())
			}
			if len(h.runner.calls()) != 0 || len(*order) != 0 || h.locks.holds("/repo") {
				t.Fatalf("turns %d, order %v, held %t", len(h.runner.calls()), *order, h.locks.holds("/repo"))
			}
		})
	}
}

// skilledResuming is resuming with process p naming the skill review, on a
// runtime whose adapter gives skills, and run-0 to continue.
func skilledResuming() (*harness, *[]string) {
	h, order := resuming()
	h.defs.docs[definition.KindProcess]["p"] = withSkills(h.defs.docs[definition.KindProcess]["p"], "review")
	h.defs.docs[definition.KindSkill] = map[string]string{"review": skillDoc("review")}
	h.runner.identity.Skills = true
	patchedRun(h, "run-0", "", 0, 1, "diff A\n")
	return h, order
}

// A continued call's first turn is put to its runner before the call
// takes its worktree: one the runner refuses costs no hold, and no turn
// runs (D-15). Any other fault the runner
// answers with is the call's, as it is.
func TestAFirstTurnTheRunnerRefusesHasNoEffect(t *testing.T) {
	t.Parallel()
	start := app.TurnStart{ResumeSessionID: "prov-0", Skills: []app.TurnSkill{{Name: "review", Bytes: []byte(skillDoc("review"))}}}
	for _, c := range []struct {
		name    string
		fault   *run.Error
		refused bool
	}{
		{"refused", run.Fault(run.ClassRefused, "thread prov-0 ran in the user's CODEX_HOME"), true},
		{"another fault", run.Fault(run.ClassInternal, "the home cannot be read"), false},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			h, order := skilledResuming()
			h.runner.refusal = c.fault
			record := h.call(t, contract.CallRequest{Continue: "run-0"})
			if class(record) != c.fault.Class || message(record) != c.fault.Message || contains(h.recorder.kinds(), "REFUSED") != c.refused {
				t.Fatalf("result %+v, events %v", record.Result, h.recorder.kinds())
			}
			if got := h.runner.admitted(); !reflect.DeepEqual(got, []app.TurnStart{start}) {
				t.Fatalf("admitted %+v, want %+v", got, start)
			}
			if len(h.runner.calls()) != 0 || len(h.workspaces.checkouts) != 0 || len(h.setup.runs()) != 0 || len(h.changes.applies()) != 0 || len(*order) != 0 {
				t.Fatalf("turns %d, checkouts %v, setup %v, applied %v, order %v",
					len(h.runner.calls()), h.workspaces.checkouts, h.setup.runs(), h.changes.applies(), *order)
			}
		})
	}
}

// A continued call's first turn its runner admits runs as before, in the
// caller's worktree, which is let go once the call ends (ADR-025 rule 1).
func TestAFirstTurnTheRunnerAdmitsRuns(t *testing.T) {
	t.Parallel()
	h, order := skilledResuming()
	record := h.call(t, contract.CallRequest{Continue: "run-0"})
	if record.Result.Status != run.Completed || len(h.runner.calls()) != 1 || h.runner.calls()[0].Cwd != "/repo" || h.locks.holds("/repo") {
		t.Fatalf("result %+v, turns %+v, held %t", record.Result, h.runner.calls(), h.locks.holds("/repo"))
	}
	if want := []string{"turn"}; !reflect.DeepEqual(*order, want) {
		t.Fatalf("order %v, want %v", *order, want)
	}
	admitted, turn := h.runner.admitted(), h.runner.calls()[0]
	if want := []app.TurnStart{{ResumeSessionID: turn.ResumeSessionID, Skills: turn.Skills}}; turn.ResumeSessionID != "prov-0" || len(turn.Skills) != 1 || !reflect.DeepEqual(admitted, want) {
		t.Fatalf("admitted %+v, turn %+v", admitted, turn)
	}
}
