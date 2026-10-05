package app_test

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"sync/atomic"
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

// A run records the identity of the repository it was launched in; a
// continuation from another worktree of it carries the run's changes after
// the launching worktree is removed. An older record, which names only that
// worktree, cannot be compared with it any more.
func TestContinuationAfterRemovingTheLaunchingWorktree(t *testing.T) {
	t.Parallel()
	identities := map[string]string{"/launching": "/repo/.git", "/surviving": "/repo/.git"}
	for _, recorded := range []bool{true, false} {
		t.Run(map[bool]string{true: "stored identity", false: "older record"}[recorded], func(t *testing.T) {
			t.Parallel()
			ctx := context.Background()
			store := fsruns.Store{Dir: t.TempDir()}
			newCall := func(id, root string, removed ...string) (*harness, *[]string) {
				h, order := carrying()
				h.workspaces.root, h.workspaces.identities, h.workspaces.removed = root, identities, removed
				h.runner.turn.ProviderSessionID = "prov-0"
				h.calls = h.callsRecordedWith(h.defs, h.workspaces, h.changes, store,
					observedStore{store, h.recorder}, continuationID(id))
				return h, order
			}
			first, _ := newCall("run-0", "/launching")
			// The turn edits the checkout: its content is the revision's until then.
			var edited atomic.Bool
			first.runner.during = func(app.TurnRequest) { edited.Store(true) }
			first.changes.identify = func() string { return map[bool]string{false: "tree", true: "edited"}[edited.Load()] }
			first.changes.patch = func(from, to string) []byte {
				if to == "edited" {
					return []byte("diff A\n")
				}
				return nil
			}
			if _, err := first.calls.Submit(ctx, contract.CallRequest{Process: "p", Cwd: "/launching"}); err != nil {
				t.Fatal(err)
			}
			prior := first.recorder.wait(t)
			if prior.Result.Status != run.Completed || prior.Effects == nil || prior.Effects.Checkout == nil ||
				prior.Effects.Checkout.Repository != "/launching" || prior.Effects.Checkout.RepositoryIdentity != "/repo/.git" {
				t.Fatalf("prior %+v, effects %+v", prior.Result, prior.Effects)
			}
			if !recorded {
				prior.Effects.Checkout.RepositoryIdentity = ""
				data, err := json.Marshal(prior)
				if err != nil {
					t.Fatal(err)
				}
				if err := os.WriteFile(filepath.Join(store.Dir, "run-0", "record.json"), data, 0o600); err != nil {
					t.Fatal(err)
				}
			}
			second, order := newCall("run-1", "/surviving", "/launching")
			record := second.call(t, contract.CallRequest{Continue: "run-0", Cwd: "/surviving"})
			if !recorded {
				if class(record) != run.ClassRefused || !strings.Contains(message(record), "repository cannot be compared with /surviving: not a git repository: /launching") {
					t.Fatalf("result %+v", record.Result)
				}
				if len(second.runner.calls()) != 0 || len(*order) != 0 {
					t.Fatalf("turns %d, order %v", len(second.runner.calls()), *order)
				}
				return
			}
			if record.Result.Status != run.Completed || len(second.runner.calls()) != 1 || !contains(second.recorder.kinds(), "CHANGES_CARRIED") {
				t.Fatalf("result %+v, events %v", record.Result, second.recorder.kinds())
			}
			if want := []string{"check", "setup", "apply", "turn"}; !reflect.DeepEqual(*order, want) {
				t.Fatalf("order %v, want %v", *order, want)
			}
			if want := []appliedPatch{{"/work/checkout", "diff A\n", true}, {"/work/checkout", "diff A\n", false}}; !reflect.DeepEqual(second.changes.applies(), want) {
				t.Fatalf("applied %+v", second.changes.applies())
			}
			if got := second.runner.calls()[0]; got.ResumeSessionID != "prov-0" {
				t.Fatalf("resumed %q", got.ResumeSessionID)
			}
		})
	}
}

// skilledCarrying is carrying with process p naming the skill review, on a
// runtime whose adapter gives skills, and run-0 to continue.
func skilledCarrying() (*harness, *[]string) {
	h, order := carrying()
	h.defs.docs[definition.KindProcess]["p"] = withSkills(h.defs.docs[definition.KindProcess]["p"], "review")
	h.defs.docs[definition.KindSkill] = map[string]string{"review": skillDoc("review")}
	h.runner.identity.Skills = true
	patchedRun(h, "run-0", "", 0, 1, "diff A\n")
	return h, order
}

// A continued call's first turn is put to its runner before the call
// checks out, carries changes or runs its setup: one the runner refuses
// costs none of them, and no turn runs (D-15). Any other fault the runner
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
			h, order := skilledCarrying()
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

// A continued call's first turn its runner admits is made ready and run as
// before: checked out, its changes carried, its setup run.
func TestAFirstTurnTheRunnerAdmitsRuns(t *testing.T) {
	t.Parallel()
	h, order := skilledCarrying()
	record := h.call(t, contract.CallRequest{Continue: "run-0"})
	if record.Result.Status != run.Completed || len(h.runner.calls()) != 1 || len(h.workspaces.checkouts) != 1 || len(h.setup.runs()) != 1 {
		t.Fatalf("result %+v, turns %d, checkouts %v, setup %v", record.Result, len(h.runner.calls()), h.workspaces.checkouts, h.setup.runs())
	}
	if want := []string{"check", "setup", "apply", "turn"}; !reflect.DeepEqual(*order, want) {
		t.Fatalf("order %v, want %v", *order, want)
	}
	admitted, turn := h.runner.admitted(), h.runner.calls()[0]
	if want := []app.TurnStart{{ResumeSessionID: turn.ResumeSessionID, Skills: turn.Skills}}; turn.ResumeSessionID != "prov-0" || len(turn.Skills) != 1 || !reflect.DeepEqual(admitted, want) {
		t.Fatalf("admitted %+v, turn %+v", admitted, turn)
	}
}
