package app_test

import (
	"context"
	"errors"
	"reflect"
	"strings"
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

func TestCallRecordsItsEffectsAsSoonAsTheyExist(t *testing.T) {
	h := newHarness()
	record := h.call(t, contract.CallRequest{})
	if want := (&run.Effects{Checkout: &run.Checkout{Repository: "/repo", Dir: "/work/checkout"}, Process: &run.Process{Ref: "ref-4242"}}); !reflect.DeepEqual(record.Effects, want) {
		t.Fatalf("effects = %+v", record.Effects)
	}
	// The checkout was written down before the runtime started.
	var checkoutOnly bool
	for _, update := range h.recorder.updates {
		if e := update.Effects; e != nil && e.Checkout != nil && e.Process == nil {
			checkoutOnly = true
		}
	}
	if !checkoutOnly {
		t.Fatal("no update carried the checkout before the process")
	}
}

// A checkout that cannot be recorded is one no reap could find: the call is
// refused before the runtime starts, and the checkout is released.
func TestCheckoutThatCannotBeRecordedIsReleasedAndTheCallRefused(t *testing.T) {
	h := newHarness()
	h.recorder.updateErr = func(record run.Record) error {
		if record.Effects != nil && record.Effects.Checkout != nil {
			return errors.New("disk full")
		}
		return nil
	}
	record := h.call(t, contract.CallRequest{})
	if h.workspaces.releases() != 1 {
		t.Fatalf("releases = %d", h.workspaces.releases())
	}
	if len(h.runner.calls()) != 0 {
		t.Fatalf("a turn ran: %+v", h.runner.calls())
	}
	if class(record) != run.ClassInternal || record.Result.Status != run.Failed ||
		!strings.Contains(message(record), "recording the checkout failed") || !strings.Contains(message(record), "disk full") {
		t.Fatalf("result = %+v", record.Result)
	}
	// The record does not claim a checkout it could not write down.
	if record.Effects != nil {
		t.Fatalf("effects = %+v", record.Effects)
	}
}

// A process that cannot be recorded is reported to the runtime, which ends
// it; the run does not claim it.
func TestProcessThatCannotBeRecordedIsReportedToTheRuntime(t *testing.T) {
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
	if record.Effects == nil || record.Effects.Process != nil || record.Effects.Checkout == nil {
		t.Fatalf("effects = %+v", record.Effects)
	}
}

func TestAbandonedRunIsReaped(t *testing.T) {
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

func TestRunsSomeoneElseOwnsAreSkipped(t *testing.T) {
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
	if adopter.liveReads != 1 {
		t.Fatalf("live reads = %d", adopter.liveReads)
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
	h := newHarness()
	r := reaping(h, abandonedRun("a"))
	adopter, processes := r.adopter, r.processes
	adopter.onLive = driven(r)
	r.reap()
	if len(adopter.adopted) != 0 || len(processes.reaped) != 0 || len(h.workspaces.discarded) != 0 {
		t.Fatalf("adopted %v, reaped %v, discarded %v", adopter.adopted, processes.reaped, h.workspaces.discarded)
	}
}

func TestReapingHasADeadlineByDefault(t *testing.T) {
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
	h := newHarness()
	r := reaping(h, abandonedRun("old"))
	adopter, processes := r.adopter, r.processes
	adopter.live = []string{"/tmp/agister-checkout-1/workspace"}
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

// Runs that cannot be listed leave their effects with nothing recorded
// about the reap: the reap fails.
func TestAReapThatCannotListRunsFails(t *testing.T) {
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
