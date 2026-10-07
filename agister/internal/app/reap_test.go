package app_test

import (
	"context"
	"errors"
	"fmt"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/contract"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

func abandonedRun(id string) run.Record {
	return run.Record{
		Schema:    run.RecordSchema,
		ID:        id,
		Process:   "p",
		CreatedAt: time.Date(2026, 9, 28, 11, 0, 0, 0, time.UTC),
		Effects: &run.Effects{
			Checkout: &run.Checkout{Repository: "/repo", Dir: "/tmp/agister-checkout-1/workspace"},
			Process:  &run.Process{Ref: "ref-777"},
		},
	}
}

// reaper is a Reaper over spies, sharing the harness's workspaces.
type reaper struct {
	*app.Reaper
	adopter   *adopterSpy
	processes *processesSpy
}

func reaping(h *harness, runs ...run.Record) *reaper {
	adopter, processes := &adopterSpy{runs: runs}, &processesSpy{}
	return &reaper{
		Reaper:    app.NewReaper(adopter, processes, h.workspaces, fixedClock{}),
		adopter:   adopter,
		processes: processes,
	}
}

func (r *reaper) reap() error { return r.Reap(context.Background()) }

// The worktree is on record before the runtime starts, and the runtime's
// process as soon as it exists; the worktree is no effect (ADR-025 rule 1).
func TestCallRecordsItsEffectsAsSoonAsTheyExist(t *testing.T) {
	t.Parallel()
	h := newHarness()
	record := h.call(t, contract.CallRequest{})
	if want := (&run.Effects{Process: &run.Process{Ref: "ref-4242"}}); !reflect.DeepEqual(record.Effects, want) {
		t.Fatalf("effects = %+v", record.Effects)
	}
	// The worktree was written down before the runtime started.
	var worktreeOnly bool
	for _, update := range h.recorder.updates {
		if update.InPlace != nil && update.InPlace.Worktree == "/repo" && (update.Effects == nil || update.Effects.Process == nil) {
			worktreeOnly = true
		}
	}
	if !worktreeOnly {
		t.Fatal("no update carried the worktree before the process")
	}
}

// A worktree that cannot be recorded is one no later call could tell a
// leftover writer by: the call fails before the runtime starts, and the
// hold is let go.
func TestAWorktreeThatCannotBeRecordedIsLetGoAndTheCallRefused(t *testing.T) {
	t.Parallel()
	h := newHarness()
	h.recorder.updateErr = func(record run.Record) error {
		if record.InPlace != nil {
			return errors.New("disk full")
		}
		return nil
	}
	record := h.call(t, contract.CallRequest{})
	if h.locks.releases("/repo") != 1 || h.locks.holds("/repo") {
		t.Fatalf("releases = %d", h.locks.releases("/repo"))
	}
	if len(h.runner.calls()) != 0 {
		t.Fatalf("a turn ran: %+v", h.runner.calls())
	}
	if class(record) != run.ClassInternal || record.Result.Status != run.Failed ||
		!strings.Contains(message(record), "recording the worktree failed") || !strings.Contains(message(record), "disk full") {
		t.Fatalf("result = %+v", record.Result)
	}
	// The record does not claim a worktree it could not write down.
	if record.InPlace != nil || record.Effects != nil {
		t.Fatalf("in place %+v, effects = %+v", record.InPlace, record.Effects)
	}
}

// A process that cannot be recorded is reported to the runtime, which ends
// it; the run does not claim it.
func TestProcessThatCannotBeRecordedIsReportedToTheRuntime(t *testing.T) {
	t.Parallel()
	h := newHarness()
	h.recorder.updateErr = func(record run.Record) error {
		if record.Effects != nil && record.Effects.Process != nil {
			return errors.New("disk full")
		}
		return nil
	}
	record := h.call(t, contract.CallRequest{})
	h.runner.mu.Lock()
	startErr := h.runner.startErr
	h.runner.mu.Unlock()
	if startErr == nil || !strings.Contains(startErr.Error(), "recording the process failed") || !strings.Contains(startErr.Error(), "disk full") {
		t.Fatalf("the runtime was told %v", startErr)
	}
	if record.Result.Status != run.Failed || !strings.Contains(message(record), "recording the process failed") {
		t.Fatalf("result = %+v", record.Result)
	}
	if record.Effects != nil && record.Effects.Process != nil {
		t.Fatalf("effects = %+v", record.Effects)
	}
}

func TestAbandonedRunIsReaped(t *testing.T) {
	t.Parallel()
	h := newHarness()
	r := reaping(h, abandonedRun("old"))
	adopter, processes := r.adopter, r.processes
	if err := r.reap(); err != nil {
		t.Fatal(err)
	}

	if !reflect.DeepEqual(processes.reaped, []string{"ref-777"}) {
		t.Fatalf("reaped = %v", processes.reaped)
	}
	if !reflect.DeepEqual(h.workspaces.discarded, [][2]string{{"/repo", "/tmp/agister-checkout-1/workspace"}}) {
		t.Fatalf("discarded = %v", h.workspaces.discarded)
	}
	old := adopter.handles["old"].wait(t)
	if old.FinishedAt == nil || old.Result == nil || old.Result.Status != run.Lost || old.Result.Error.Class != run.ClassAbandoned {
		t.Fatalf("old run = %+v", old.Result)
	}
	if kinds := adopter.handles["old"].kinds(); !reflect.DeepEqual(kinds, []string{"EFFECTS_REAPED"}) {
		t.Fatalf("events = %v", kinds)
	}
	data := adopter.handles["old"].events[0].Data
	if process := data["process"].(map[string]any); process["outcome"] != "killed" || process["ref"] != "ref-777" || len(process) != 2 || data["checkout"].(map[string]any)["removed"] != true {
		t.Fatalf("event data = %v", data)
	}
}

// A run killed while its verification command ran left the command's
// process group on record beside the runtime's: both are reaped.
func TestAbandonedVerifyCommandIsReaped(t *testing.T) {
	t.Parallel()
	h := newHarness()
	abandoned := abandonedRun("old")
	abandoned.Effects.Command = &run.Process{Ref: "ref-888"}
	r := reaping(h, abandoned)
	if err := r.reap(); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(r.processes.reaped, []string{"ref-777", "ref-888"}) {
		t.Fatalf("reaped = %v", r.processes.reaped)
	}
	data := r.adopter.handles["old"].events[0].Data
	if command := data["command"].(map[string]any); command["outcome"] != "killed" || command["ref"] != "ref-888" {
		t.Fatalf("event data = %v", data)
	}
}

// A run killed while verification checked a clean copy left the copy on
// record beside its checkout: both are removed, and a copy a running run
// records is left in place.
func TestAbandonedCleanCopyIsReaped(t *testing.T) {
	t.Parallel()
	h := newHarness()
	abandoned := abandonedRun("old")
	abandoned.Effects.Copy = &run.Checkout{Repository: "/repo", Dir: "/tmp/agister-checkout-2/workspace"}
	r := reaping(h, abandoned)
	if err := r.reap(); err != nil {
		t.Fatal(err)
	}
	want := [][2]string{{"/repo", "/tmp/agister-checkout-1/workspace"}, {"/repo", "/tmp/agister-checkout-2/workspace"}}
	if !reflect.DeepEqual(h.workspaces.discarded, want) {
		t.Fatalf("discarded = %v", h.workspaces.discarded)
	}
	if copied := r.adopter.handles["old"].events[0].Data["copy"].(map[string]any); copied["removed"] != true || copied["dir"] != "/tmp/agister-checkout-2/workspace" {
		t.Fatalf("event data = %v", r.adopter.handles["old"].events[0].Data)
	}

	h = newHarness()
	r = reaping(h, abandoned)
	r.adopter.live = []string{"/tmp/agister-checkout-2/workspace"}
	if err := r.reap(); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(h.workspaces.discarded, want[:1]) {
		t.Fatalf("discarded = %v", h.workspaces.discarded)
	}
	if copied := r.adopter.handles["old"].events[0].Data["copy"].(map[string]any); copied["removed"] != false || copied["skipped"] == nil {
		t.Fatalf("copy = %v", copied)
	}
}

// A run that finished with its clean copy on record, its removal having
// failed, has the copy reaped too (ADR-005 rule 2): only the copy, which
// then leaves the record, while the run keeps its end. A copy that cannot
// be removed stays on record for the next reap.
func TestAFinishedRunsCleanCopyIsReaped(t *testing.T) {
	t.Parallel()
	finishedAt := time.Date(2026, 9, 28, 11, 30, 0, 0, time.UTC)
	finished := abandonedRun("done")
	finished.Effects.Command = &run.Process{Ref: "ref-cmd"}
	finished.Effects.Copy = &run.Checkout{Repository: "/repo", Dir: "/tmp/agister-checkout-2/workspace"}
	finished.FinishedAt = &finishedAt
	finished.Result = &run.Result{Status: run.Completed}

	h := newHarness()
	r := reaping(h, finished)
	if err := r.reap(); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(h.workspaces.discarded, [][2]string{{"/repo", "/tmp/agister-checkout-2/workspace"}}) || len(r.processes.reaped) != 0 {
		t.Fatalf("discarded %v, processes reaped %v", h.workspaces.discarded, r.processes.reaped)
	}
	handle := r.adopter.handles["done"]
	if copied := handle.events[0].Data["copy"].(map[string]any); copied["removed"] != true || handle.events[0].Kind != "EFFECTS_REAPED" {
		t.Fatalf("events = %+v", handle.events)
	}
	record := handle.wait(t)
	if record.Result.Status != run.Completed || !record.FinishedAt.Equal(finishedAt) || record.Effects.Copy != nil ||
		record.Effects.Checkout == nil || record.Effects.Command == nil {
		t.Fatalf("record: result %+v, finished %v, effects %+v", record.Result, record.FinishedAt, record.Effects)
	}

	h = newHarness()
	h.workspaces.discardErr = errors.New("busy")
	r = reaping(h, finished)
	if err := r.reap(); err != nil {
		t.Fatal(err)
	}
	record = r.adopter.handles["done"].wait(t)
	if record.Result.Status != run.Completed || !reflect.DeepEqual(record.Effects.Copy, finished.Effects.Copy) {
		t.Fatalf("record: result %+v, effects %+v", record.Result, record.Effects)
	}
}

// A call made before ADR-025 whose release failed at its cleanup deadline
// left a finished run that names the checkout as unreleased (ADR-008 rule
// 6). A reap leaves it while a running run records the directory, and once
// the lock is free removes it and clears it, while the run keeps its end
// and its Checkout (ADR-025 rule 9).
func TestACheckoutWhoseReleaseHitTheDeadlineIsReapedLater(t *testing.T) {
	t.Parallel()
	h := newHarness()
	checkout := &run.Checkout{Repository: "/repo", RepositoryIdentity: "/repo", Dir: "/work/checkout", Revision: "sha-HEAD"}
	at := time.Date(2026, 9, 28, 11, 30, 0, 0, time.UTC)
	finished := run.Record{Schema: run.RecordSchema, ID: "run-1", Process: "p", CreatedAt: at, FinishedAt: &at,
		Effects: &run.Effects{Checkout: checkout, Process: &run.Process{Ref: "ref-4242"}, Unreleased: checkout},
		Result:  &run.Result{Status: run.Completed}, ProcessesEnded: known(true)}

	r := reaping(h, finished)
	r.adopter.live = []string{checkout.Dir}
	if err := r.reap(); err != nil {
		t.Fatal(err)
	}
	if len(h.workspaces.discarded) != 0 {
		t.Fatalf("discarded %v, which a running run records", h.workspaces.discarded)
	}
	if record := r.adopter.handles[finished.ID].wait(t); !reflect.DeepEqual(record.Effects.Unreleased, checkout) {
		t.Fatalf("effects = %+v", record.Effects)
	}

	r = reaping(h, finished)
	if err := r.reap(); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(h.workspaces.discarded, [][2]string{{"/repo", "/work/checkout"}}) || len(r.processes.reaped) != 0 {
		t.Fatalf("discarded %v, processes reaped %v", h.workspaces.discarded, r.processes.reaped)
	}
	handle := r.adopter.handles[finished.ID]
	if removed := handle.events[0].Data["checkout"].(map[string]any); removed["removed"] != true || removed["dir"] != checkout.Dir {
		t.Fatalf("events = %+v", handle.events)
	}
	record := handle.wait(t)
	if record.Result.Status != finished.Result.Status || !record.FinishedAt.Equal(*finished.FinishedAt) ||
		record.Effects.Unreleased != nil || !reflect.DeepEqual(record.Effects.Checkout, checkout) {
		t.Fatalf("record: result %+v, finished %v, effects %+v", record.Result, record.FinishedAt, record.Effects)
	}
}

// A call works in the caller's worktree and records nothing for a reap to
// remove (ADR-025 rule 1).
func TestACallLeavesNothingForAReap(t *testing.T) {
	t.Parallel()
	h := newHarness()
	if record := h.call(t, contract.CallRequest{}); record.Effects == nil || record.Effects.Unreleased != nil {
		t.Fatalf("effects = %+v", record.Effects)
	}
}

func TestRunsSomeoneElseOwnsAreSkipped(t *testing.T) {
	t.Parallel()
	h := newHarness()
	r := reaping(h, abandonedRun("live"))
	adopter, processes := r.adopter, r.processes
	adopter.adoptErr = map[string]error{"live": errors.New("owned")}
	r.reap()
	if len(processes.reaped) != 0 || len(h.workspaces.discarded) != 0 {
		t.Fatalf("effects of a run that could not be adopted were touched: %v %v", processes.reaped, h.workspaces.discarded)
	}
	if !reflect.DeepEqual(adopter.adopted, []string{"live"}) {
		t.Fatalf("adopted = %v", adopter.adopted)
	}
}

func TestFailedReapStepsStillFinishTheRunWithTheError(t *testing.T) {
	t.Parallel()
	h := newHarness()
	r := reaping(h, abandonedRun("old"))
	adopter, processes := r.adopter, r.processes
	processes.err = errors.New("process 777 is alive")
	h.workspaces.discardErr = errors.New("busy")
	// The run records the failed steps: the reap itself did not fail.
	if err := r.reap(); err != nil {
		t.Fatalf("reap = %v", err)
	}
	// Both steps ran.
	if len(processes.reaped) != 1 || len(h.workspaces.discarded) != 1 {
		t.Fatalf("reaped %v, discarded %v", processes.reaped, h.workspaces.discarded)
	}
	old := adopter.handles["old"].wait(t)
	if old.Result == nil || old.Result.Error.Class != run.ClassAbandoned {
		t.Fatalf("old run = %+v", old.Result)
	}
	data := adopter.handles["old"].events[0].Data
	if errs, _ := data["errors"].([]string); len(errs) != 2 {
		t.Fatalf("errors = %v", data["errors"])
	}
}

// driven returns a reap context the test ends by calling cancel.
func driven(r *reaper) context.CancelFunc {
	var cancel context.CancelFunc
	r.ReapContext = func(ctx context.Context) (context.Context, context.CancelFunc) {
		ctx, cancel = context.WithCancel(ctx)
		return ctx, cancel
	}
	return func() { cancel() }
}

func TestReapingIsBounded(t *testing.T) {
	t.Parallel()
	h := newHarness()
	a, b := abandonedRun("a"), abandonedRun("b")
	a.Effects.Checkout.Dir = "/tmp/agister-checkout-a/workspace"
	r := reaping(h, a, b)
	adopter, processes := r.adopter, r.processes
	deadline := driven(r)
	// The deadline arrives while a's checkout is being removed.
	h.workspaces.discardHook = func(ctx context.Context, dir string) error {
		if dir != a.Effects.Checkout.Dir {
			return nil
		}
		deadline()
		return ctx.Err()
	}
	r.reap()
	// The run being reaped when time ran out is finished with the error;
	// the one not reached is left, unadopted, for the next call.
	if !reflect.DeepEqual(adopter.adopted, []string{"a"}) || len(processes.reaped) != 1 {
		t.Fatalf("adopted %v, reaped %v", adopter.adopted, processes.reaped)
	}
	// b was not even looked at: the loop stopped before reading live runs.
	if r.adopter.liveReads != 1 {
		t.Fatalf("live reads = %d", r.adopter.liveReads)
	}
	finished := adopter.handles["a"].wait(t)
	if finished.Result == nil || finished.Result.Error.Class != run.ClassAbandoned {
		t.Fatalf("run a = %+v", finished.Result)
	}
	errs, _ := adopter.handles["a"].events[0].Data["errors"].([]string)
	if len(errs) != 1 || !strings.Contains(errs[0], context.Canceled.Error()) {
		t.Fatalf("errors = %v", adopter.handles["a"].events[0].Data["errors"])
	}
}

func TestNothingIsAdoptedAfterTheDeadline(t *testing.T) {
	t.Parallel()
	h := newHarness()
	r := reaping(h, abandonedRun("a"))
	adopter, processes := r.adopter, r.processes
	r.adopter.onLive = driven(r)
	r.reap()
	if len(adopter.adopted) != 0 || len(processes.reaped) != 0 || len(h.workspaces.discarded) != 0 {
		t.Fatalf("adopted %v, reaped %v, discarded %v", adopter.adopted, processes.reaped, h.workspaces.discarded)
	}
}

func TestReapingHasADeadlineByDefault(t *testing.T) {
	t.Parallel()
	h := newHarness()
	r := reaping(h, abandonedRun("a"))
	var bounded bool
	h.workspaces.discardHook = func(ctx context.Context, _ string) error {
		deadline, ok := ctx.Deadline()
		bounded = ok && time.Until(deadline) <= 30*time.Second
		return nil
	}
	r.reap()
	if !bounded {
		t.Fatal("reaping ran without a deadline")
	}
}

func TestProcessReapingHasTheReapDeadline(t *testing.T) {
	t.Parallel()
	h := newHarness()
	r := reaping(h, abandonedRun("a"))
	var bounded bool
	r.processes.hook = func(ctx context.Context) {
		deadline, ok := ctx.Deadline()
		bounded = ok && time.Until(deadline) <= 30*time.Second
	}
	r.reap()
	if !bounded {
		t.Fatal("the process port got no reap deadline")
	}
}

func TestACheckoutARunningRunUsesIsNotDiscarded(t *testing.T) {
	t.Parallel()
	h := newHarness()
	r := reaping(h, abandonedRun("old"))
	adopter, processes := r.adopter, r.processes
	r.adopter.live = []string{"/tmp/agister-checkout-1/workspace"}
	r.reap()
	// The process is still ended and the run finished, but the directory stays.
	if len(processes.reaped) != 1 || len(h.workspaces.discarded) != 0 {
		t.Fatalf("reaped %v, discarded %v", processes.reaped, h.workspaces.discarded)
	}
	old := adopter.handles["old"].wait(t)
	if old.Result == nil || old.Result.Error.Class != run.ClassAbandoned {
		t.Fatalf("old run = %+v", old.Result)
	}
	checkout := adopter.handles["old"].events[0].Data["checkout"].(map[string]any)
	if checkout["removed"] != false || checkout["skipped"] == nil {
		t.Fatalf("checkout = %v", checkout)
	}
}

// A checkout whose users cannot be listed is left in place, though the
// reap's context is still active: the run is adopted and finished, its
// record keeping the checkout as unreleased, and a later reap that can list
// them removes it and clears it.
func TestACheckoutLeftWhenRunningRunsCannotBeListedIsReapedLater(t *testing.T) {
	t.Parallel()
	h := newHarness()
	r := reaping(h, abandonedRun("old"))
	r.adopter.liveErr = errors.New("runs unreadable")
	if err := r.reap(); err != nil {
		t.Fatalf("reap = %v", err)
	}
	if !reflect.DeepEqual(r.adopter.adopted, []string{"old"}) || len(h.workspaces.discarded) != 0 {
		t.Fatalf("adopted %v, discarded %v", r.adopter.adopted, h.workspaces.discarded)
	}
	handle := r.adopter.handles["old"]
	if left := handle.events[0].Data["checkout"].(map[string]any); left["removed"] != false || left["skipped"] == nil {
		t.Fatalf("events = %+v", handle.events)
	}
	finished := handle.wait(t)
	checkout := &run.Checkout{Repository: "/repo", Dir: "/tmp/agister-checkout-1/workspace"}
	if finished.FinishedAt == nil || finished.Result == nil || finished.Result.Status != run.Lost ||
		finished.Effects == nil || !reflect.DeepEqual(finished.Effects.Unreleased, checkout) {
		t.Fatalf("finished %v, result %+v, effects %+v", finished.FinishedAt, finished.Result, finished.Effects)
	}

	r = reaping(h, finished)
	if err := r.reap(); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(h.workspaces.discarded, [][2]string{{checkout.Repository, checkout.Dir}}) {
		t.Fatalf("discarded = %v", h.workspaces.discarded)
	}
	record := r.adopter.handles["old"].wait(t)
	if record.Result.Status != run.Lost || !record.FinishedAt.Equal(*finished.FinishedAt) ||
		record.Effects.Unreleased != nil || !reflect.DeepEqual(record.Effects.Checkout, checkout) {
		t.Fatalf("record: result %+v, finished %v, effects %+v", record.Result, record.FinishedAt, record.Effects)
	}
}

// The checkouts running runs use are read before the abandoned run is
// adopted: the adopted run is this process's own and would read as live.
func TestLiveCheckoutsAreReadBeforeTheRunIsAdopted(t *testing.T) {
	t.Parallel()
	h := newHarness()
	r := reaping(h, abandonedRun("old"))
	r.reap()
	if want := []string{"live", "adopt:old"}; !reflect.DeepEqual(r.adopter.order, want) {
		t.Fatalf("adopter asked in the order %v, want %v", r.adopter.order, want)
	}
}

// Runs that cannot be listed leave their effects with nothing recorded
// about the reap: the reap fails.
func TestAReapThatCannotListRunsFails(t *testing.T) {
	t.Parallel()
	h := newHarness()
	r := reaping(h, abandonedRun("old"))
	r.adopter.listErr = errors.New("runs unreadable")
	err := r.reap()
	if !errors.Is(err, r.adopter.listErr) || !strings.Contains(err.Error(), "listing abandoned runs") {
		t.Fatalf("reap = %v", err)
	}
	if len(r.adopter.adopted) != 0 || len(r.processes.reaped) != 0 {
		t.Fatalf("adopted %v, reaped %v", r.adopter.adopted, r.processes.reaped)
	}
}

// A reaped run whose event or end cannot be written has no durable word
// of the reap: the reap fails, naming the run, and the step failures the
// event would have recorded. The other runs are reaped all the same.
func TestAReapThatCannotRecordARunFails(t *testing.T) {
	t.Parallel()
	for name, tc := range map[string]struct {
		fail    func(*recorderSpy)
		failing []string
		want    []string
		blamed  string // a run the error must not name
	}{
		"event": {
			fail:    func(h *recorderSpy) { h.appendErr = errors.New("events full") },
			failing: []string{"a"},
			want:    []string{"reaping run a", "recording the reap: events full", "process 777 is alive"},
			blamed:  "run b",
		},
		"end": {
			fail:    func(h *recorderSpy) { h.finishErr = errors.New("record full") },
			failing: []string{"a"},
			want:    []string{"reaping run a", "finishing the run: record full"},
			blamed:  "run b",
		},
		"several runs": {
			fail:    func(h *recorderSpy) { h.appendErr = errors.New("events full") },
			failing: []string{"a", "b"},
			want:    []string{"reaping run a", "reaping run b"},
		},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			h := newHarness()
			b := abandonedRun("b")
			b.Effects.Checkout.Dir = "/tmp/agister-checkout-b/workspace"
			r := reaping(h, abandonedRun("a"), b)
			r.processes.err = errors.New("process 777 is alive")
			r.adopter.failing = map[string]func(*recorderSpy){}
			for _, id := range tc.failing {
				r.adopter.failing[id] = tc.fail
			}
			err := r.reap()
			if err == nil {
				t.Fatal("the reap did not fail")
			}
			for _, want := range tc.want {
				if !strings.Contains(err.Error(), want) {
					t.Errorf("missing %q in %v", want, err)
				}
			}
			if tc.blamed != "" && strings.Contains(err.Error(), tc.blamed) {
				t.Errorf("%s is blamed: %v", tc.blamed, err)
			}
			if !reflect.DeepEqual(r.adopter.adopted, []string{"a", "b"}) {
				t.Fatalf("adopted = %v", r.adopter.adopted)
			}
			if finished := r.adopter.handles["b"].wait(t); finished.Result == nil || finished.Result.Status != run.Lost {
				t.Fatalf("run b = %+v", finished.Result)
			}
		})
	}
}

// ADR-022 rule 3: a reap records that a run's processes are known to have
// ended only when it ended each one or found it gone; a step that failed,
// or a process left, leaves that unsaid, for an in-place call to ask again.
// An in-place run's worktree is no checkout: the reap leaves it alone.
func TestAReapRecordsWhetherTheRunsProcessesEnded(t *testing.T) {
	t.Parallel()
	for name, c := range map[string]struct {
		outcome app.Reaping
		err     error
		ended   bool
	}{
		"killed":        {outcome: app.ReapKilled, ended: true},
		"gone":          {outcome: app.ReapGone, ended: true},
		"left":          {outcome: app.ReapLeft},
		"a failed step": {outcome: app.ReapKilled, err: errors.New("process 777 is alive")},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			h := newHarness()
			abandoned := abandonedRun("old")
			abandoned.Effects.Checkout = nil
			abandoned.InPlace = &run.InPlace{Dir: "/repo", Worktree: "/repo", Revision: "sha-HEAD"}
			r := reaping(h, abandoned)
			r.processes.outcome, r.processes.err = c.outcome, c.err
			if err := r.reap(); err != nil {
				t.Fatal(err)
			}
			old := r.adopter.handles["old"].wait(t)
			if !says(old, c.ended) || old.FinishedAt == nil {
				t.Fatalf("processes ended %s, want %v", said(old), c.ended)
			}
			if len(h.workspaces.discarded) != 0 || old.InPlace == nil || old.Effects.Unreleased != nil {
				t.Fatalf("discarded %v, in place %+v, effects %+v", h.workspaces.discarded, old.InPlace, old.Effects)
			}
		})
	}
}

// unbounded has the reaper's reaps bounded by their caller's context
// alone, which the test ends: no real timer runs.
func unbounded(r *reaper) {
	r.ReapContext = func(ctx context.Context) (context.Context, context.CancelFunc) { return context.WithCancel(ctx) }
}

// deadlined is a context that says it has a deadline at, and is never done
// by it: what a reap passes on of its deadline is told without a timer.
type deadlined struct {
	context.Context
	at time.Time
}

func (c deadlined) Deadline() (time.Time, bool) { return c.at, true }

// blocked is the gate a goroutine of the test waits at until the test
// lets it go (release), as often as it likes.
type blocked struct {
	gate chan struct{}
	once sync.Once
}

func newBlocked() *blocked { return &blocked{gate: make(chan struct{})} }

func (b *blocked) release() { b.once.Do(func() { close(b.gate) }) }

// started runs work in a goroutine, once the test's cleanup is set to open
// the gate and join it: on every path, failures included, the goroutine
// ends with its test.
func started(t *testing.T, gate *blocked, work func()) {
	t.Helper()
	ended := make(chan struct{})
	t.Cleanup(func() {
		gate.release()
		<-ended
	})
	go func() {
		defer close(ended)
		work()
	}()
}

// LAB-123: a reap of one run takes that run alone, by the step a reap of
// all takes each run by: the live checkouts are read before the run is
// adopted, its effects are ended under the reap deadline, and it is
// finished as lost and abandoned, which is the record the reap returns.
func TestAReapOfOneRunIsTheReapersStepForThatRun(t *testing.T) {
	t.Parallel()
	h := newHarness()
	r := reaping(h, abandonedRun("a"), abandonedRun("b"))
	deadline := time.Date(2026, 10, 1, 0, 0, 30, 0, time.UTC)
	r.ReapContext = func(ctx context.Context) (context.Context, context.CancelFunc) {
		return deadlined{Context: ctx, at: deadline}, func() {}
	}
	var bounded time.Time
	r.processes.hook = func(ctx context.Context) { bounded, _ = ctx.Deadline() }

	finished, owned, err := r.ReapRun(context.Background(), "b")

	if err != nil || owned || finished.ID != "b" || finished.FinishedAt == nil || finished.Result == nil || finished.Result.Status != run.Lost || class(finished) != run.ClassAbandoned || !says(finished, true) {
		t.Fatalf("the reap of b = %+v, result %+v, owned %v, %v", finished, finished.Result, owned, err)
	}
	if want := []string{"live", "adopt:b"}; !reflect.DeepEqual(r.adopter.order, want) {
		t.Fatalf("adopter asked in the order %v, want %v", r.adopter.order, want)
	}
	// The record it returns is the one it finished the run with.
	handle := r.adopter.handles["b"]
	if written := handle.wait(t); !reflect.DeepEqual(written, finished) || !reflect.DeepEqual(handle.kinds(), []string{"EFFECTS_REAPED"}) {
		t.Fatalf("b was finished as %+v, returned as %+v; its events %v", written, finished, handle.kinds())
	}
	if _, taken := r.adopter.handles["a"]; taken {
		t.Fatal("a was adopted by the reap of b")
	}
	if !bounded.Equal(deadline) || !reflect.DeepEqual(r.processes.refs(), []string{"ref-777"}) || !reflect.DeepEqual(h.workspaces.discarded, [][2]string{{"/repo", "/tmp/agister-checkout-1/workspace"}}) {
		t.Fatalf("the process was ended by %v, want the reap deadline %v; reaped %v, discarded %v", bounded, deadline, r.processes.refs(), h.workspaces.discarded)
	}
}

// A run another holds is its owner's: the reap of it says so and touches
// nothing of it. One that finished meanwhile, with nothing left to remove,
// is returned as it finished. Neither is an error; any other reason the run
// was not adopted is.
func TestAReapOfOneRunTellsAnOwnedRunFromOneItCannotReap(t *testing.T) {
	t.Parallel()
	done := completedRun(abandonedRun("a"))
	for name, c := range map[string]struct {
		adoptErr error
		declined run.Record // what the adoption returns beside its error
		finished run.Record
		owned    bool
		err      string
	}{
		"owned":      {adoptErr: fmt.Errorf("run a: %w", app.ErrRunOwned), owned: true},
		"finished":   {adoptErr: fmt.Errorf("run a: %w", app.ErrRunFinished), declined: done, finished: done},
		"unreadable": {adoptErr: errors.New("run a: reading its record: bad disk"), err: "run a: reading its record: bad disk"},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			h := newHarness()
			r := reaping(h, abandonedRun("a"))
			unbounded(r)
			r.adopter.adoptErr, r.adopter.declined = map[string]error{"a": c.adoptErr}, map[string]run.Record{"a": c.declined}

			finished, owned, err := r.ReapRun(context.Background(), "a")

			if !reflect.DeepEqual(finished, c.finished) || owned != c.owned || (err == nil) != (c.err == "") || err != nil && err.Error() != c.err {
				t.Fatalf("the reap of a = %+v, owned %v, %v; want %+v, owned %v, %q", finished, owned, err, c.finished, c.owned, c.err)
			}
			if want := []string{"a"}; !reflect.DeepEqual(r.adopter.adopted, want) || len(r.processes.refs()) != 0 || len(h.workspaces.discarded) != 0 {
				t.Fatalf("adopted %v, want %v; reaped %v, discarded %v", r.adopter.adopted, want, r.processes.refs(), h.workspaces.discarded)
			}
		})
	}
}

// A reap of one run that waits for the step holding that run waits no
// longer than its caller: once the caller's context ends, it gives up with
// the context's error, and adopts nothing.
func TestAReapOfOneRunThatWaitsEndsWithItsCaller(t *testing.T) {
	t.Parallel()
	h := newHarness()
	r := reaping(h, abandonedRun("a"))
	unbounded(r)
	inFlight, step := make(chan struct{}), newBlocked()
	r.processes.hook = func(context.Context) {
		close(inFlight)
		<-step.gate
	}
	first := make(chan error, 1)
	started(t, step, func() {
		_, _, err := r.ReapRun(context.Background(), "a")
		first <- err
	})
	<-inFlight
	ctx, cancel := context.WithCancel(context.Background())
	r.OnWaiting(cancel)

	_, owned, err := r.ReapRun(ctx, "a")

	if !errors.Is(err, context.Canceled) || owned {
		t.Fatalf("the second reap of a = owned %v, %v; want the caller's cancellation", owned, err)
	}
	step.release()
	if err := <-first; err != nil {
		t.Fatal(err)
	}
	if want := []string{"a"}; !reflect.DeepEqual(r.adopter.adopted, want) {
		t.Fatalf("adopted %v, want %v", r.adopter.adopted, want)
	}
}

// LAB-123: a step that ends one run's effects holds that run alone. A reap
// of another run, asked for meanwhile, adopts and finishes it without
// waiting for the first, whose removal of a directory may run past any
// deadline; the first then finishes its own run.
func TestAReapOfOneRunDoesNotWaitForAStepOfAnother(t *testing.T) {
	t.Parallel()
	h := newHarness()
	a, b := abandonedRun("a"), abandonedRun("b")
	a.Effects.Checkout.Dir = "/tmp/agister-checkout-a/workspace"
	r := reaping(h, a, b)
	unbounded(r)
	removing, removal := make(chan struct{}), newBlocked()
	// A wait would last as long as the removal: it is let go, and the test
	// fails.
	r.OnWaiting(func() {
		t.Error("the reap of b waited for the step of a")
		removal.release()
	})
	h.workspaces.discardHook = func(_ context.Context, dir string) error {
		if dir == a.Effects.Checkout.Dir {
			close(removing)
			<-removal.gate
		}
		return nil
	}
	first := make(chan error, 1)
	started(t, removal, func() {
		_, _, err := r.ReapRun(context.Background(), "a")
		first <- err
	})
	<-removing

	finished, owned, err := r.ReapRun(context.Background(), "b")

	if err != nil || owned || finished.ID != "b" || finished.Result == nil || finished.Result.Status != run.Lost {
		t.Fatalf("the reap of b while a's checkout is removed = %+v, owned %v, %v", finished.Result, owned, err)
	}
	removal.release()
	if err := <-first; err != nil {
		t.Fatal(err)
	}
	if reaped := r.adopter.handles["a"].wait(t); reaped.Result == nil || reaped.Result.Status != run.Lost {
		t.Fatalf("run a = %+v", reaped.Result)
	}
	if want := []string{"a", "b"}; !reflect.DeepEqual(r.adopter.adopted, want) {
		t.Fatalf("adopted %v, want %v", r.adopter.adopted, want)
	}
}

// A reap of one run that cannot write the run's event or its end has no
// durable word of the reap: the failure reaches its caller, naming the run,
// and the run is not read as owned.
func TestAReapOfOneRunThatCannotRecordTheRunFails(t *testing.T) {
	t.Parallel()
	eventsFull, recordFull := errors.New("events full"), errors.New("record full")
	for name, c := range map[string]struct {
		fail func(*recorderSpy)
		err  error
		want string
	}{
		"event": {fail: func(h *recorderSpy) { h.appendErr = eventsFull }, err: eventsFull, want: "reaping run a: recording the reap: events full"},
		"end":   {fail: func(h *recorderSpy) { h.finishErr = recordFull }, err: recordFull, want: "reaping run a: finishing the run: record full"},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			h := newHarness()
			r := reaping(h, abandonedRun("a"))
			unbounded(r)
			r.adopter.failing = map[string]func(*recorderSpy){"a": c.fail}

			_, owned, err := r.ReapRun(context.Background(), "a")

			if !errors.Is(err, c.err) || err.Error() != c.want || owned {
				t.Fatalf("the reap of a = owned %v, %v; want %q", owned, err, c.want)
			}
			if want := []string{"a"}; !reflect.DeepEqual(r.adopter.adopted, want) {
				t.Fatalf("adopted %v, want %v", r.adopter.adopted, want)
			}
		})
	}
}

// probingAdopter lists the abandoned runs as the run store does, by
// probing each run's owner lock: while the listing holds its probe, an
// adoption finds the lock taken and fails with ErrRunOwned. The listing
// says when it holds the probe (probing) and holds it until the test lets
// it go (probe). A run it adopted and that finished is declined after as
// finished, with its end, as the store declines it.
type probingAdopter struct {
	*adopterSpy
	probing chan struct{}
	probe   *blocked

	mu    sync.Mutex
	held  bool
	ends  map[string]run.Record
	taken []string // the runs it adopted
}

func newProbingAdopter(runs ...run.Record) *probingAdopter {
	return &probingAdopter{adopterSpy: &adopterSpy{runs: runs}, probing: make(chan struct{}), probe: newBlocked(), ends: map[string]run.Record{}}
}

func (a *probingAdopter) Abandoned(ctx context.Context) ([]run.Record, error) {
	a.mu.Lock()
	a.held = true
	a.mu.Unlock()
	close(a.probing)
	<-a.probe.gate
	a.mu.Lock()
	a.held = false
	a.mu.Unlock()
	return a.adopterSpy.Abandoned(ctx)
}

func (a *probingAdopter) Adopt(ctx context.Context, id string) (app.ReapHandle, run.Record, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.held {
		return nil, run.Record{}, fmt.Errorf("run %s: %w", id, app.ErrRunOwned)
	}
	if end, ok := a.ends[id]; ok {
		return nil, end, fmt.Errorf("run %s: %w", id, app.ErrRunFinished)
	}
	handle, record, err := a.adopterSpy.Adopt(ctx, id)
	if err != nil {
		return nil, record, err
	}
	a.taken = append(a.taken, id)
	return endedHandle{ReapHandle: handle, ended: func(end run.Record) {
		a.mu.Lock()
		defer a.mu.Unlock()
		a.ends[id] = end
	}}, record, nil
}

// adopted are the runs it adopted, in order.
func (a *probingAdopter) adopted() []string {
	a.mu.Lock()
	defer a.mu.Unlock()
	return append([]string(nil), a.taken...)
}

// endedHandle tells ended the end its run was finished with.
type endedHandle struct {
	app.ReapHandle
	ended func(run.Record)
}

func (h endedHandle) Finish(record run.Record) error {
	if err := h.ReapHandle.Finish(record); err != nil {
		return err
	}
	h.ended(record)
	return nil
}

// LAB-123: the reaper lists the abandoned runs in its turn. The run store
// lists them by probing each run's owner lock, which an adoption meanwhile
// would read as the run's owner. A reap of one run asked for while the
// listing probes waits for the turn, then has the run finished as lost and
// abandoned: it does not read the run as owned. The run is reaped once,
// by whichever step takes it first.
func TestAReapOfOneRunWaitsForTheListingOfAbandonedRuns(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	h := newHarness()
	adopter, processes := newProbingAdopter(abandonedRun("a")), &processesSpy{}
	r := app.NewReaper(adopter, processes, h.workspaces, fixedClock{})
	r.ReapContext = func(ctx context.Context) (context.Context, context.CancelFunc) { return context.WithCancel(ctx) }
	// The reap of a waits for the turn: the listing lets its probe go then.
	r.OnWaiting(adopter.probe.release)
	beside := make(chan error, 1)
	started(t, adopter.probe, func() { beside <- r.Reap(ctx) })
	<-adopter.probing

	finished, owned, err := r.ReapRun(ctx, "a")

	if err != nil || owned || finished.ID != "a" || finished.Result == nil || finished.Result.Status != run.Lost || class(finished) != run.ClassAbandoned || !says(finished, true) {
		t.Fatalf("the reap of a while the abandoned runs are listed = %+v, owned %v, %v", finished.Result, owned, err)
	}
	if err := <-beside; err != nil {
		t.Fatal(err)
	}
	if adopted := adopter.adopted(); !reflect.DeepEqual(adopted, []string{"a"}) || !reflect.DeepEqual(processes.refs(), []string{"ref-777"}) {
		t.Fatalf("adopted %v, asked to end %v; want a once", adopted, processes.refs())
	}
}
