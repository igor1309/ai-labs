package app_test

import (
	"context"
	"errors"
	"reflect"
	"strings"
	"testing"
	"time"

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
			Process:  &run.Process{Group: 777, Token: "Mon Sep 28 11:00:00 2026"},
		},
	}
}

func reaping(h *harness, runs ...run.Record) (*adopterSpy, *processesSpy) {
	adopter, processes := &adopterSpy{runs: runs}, &processesSpy{}
	h.calls.Adopter, h.calls.Processes = adopter, processes
	return adopter, processes
}

func TestCallRecordsItsEffectsAsSoonAsTheyExist(t *testing.T) {
	h := newHarness()
	record := h.call(t, contract.CallRequest{})
	if want := (&run.Effects{Checkout: &run.Checkout{Repository: "/repo", Dir: "/work/checkout"}, Process: &run.Process{Group: 4242, Token: "token-4242"}}); !reflect.DeepEqual(record.Effects, want) {
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

func TestAbandonedRunIsReapedWhenACallStarts(t *testing.T) {
	h := newHarness()
	adopter, processes := reaping(h, abandonedRun("old"))
	h.call(t, contract.CallRequest{})

	if !reflect.DeepEqual(processes.reaped, [][2]any{{777, "Mon Sep 28 11:00:00 2026"}}) {
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
	if data["process"].(map[string]any)["outcome"] != "killed" || data["checkout"].(map[string]any)["removed"] != true {
		t.Fatalf("event data = %v", data)
	}
	// The new call's own run is untouched by any of it.
	if len(h.recorder.created) != 1 || h.recorder.created[0].ID != "run-1" {
		t.Fatalf("created = %+v", h.recorder.created)
	}
}

func TestRunsSomeoneElseOwnsAreSkipped(t *testing.T) {
	h := newHarness()
	adopter, processes := reaping(h, abandonedRun("live"))
	adopter.adoptErr = map[string]error{"live": errors.New("owned")}
	h.call(t, contract.CallRequest{})
	if len(processes.reaped) != 0 || len(h.workspaces.discarded) != 0 {
		t.Fatalf("effects of a run that could not be adopted were touched: %v %v", processes.reaped, h.workspaces.discarded)
	}
	if !reflect.DeepEqual(adopter.adopted, []string{"live"}) {
		t.Fatalf("adopted = %v", adopter.adopted)
	}
}

func TestFailedReapStepsStillFinishTheRunWithTheError(t *testing.T) {
	h := newHarness()
	adopter, processes := reaping(h, abandonedRun("old"))
	processes.err = errors.New("process 777 is alive")
	h.workspaces.discardErr = errors.New("busy")
	record := h.call(t, contract.CallRequest{})
	// Both steps ran, and the new call went on.
	if len(processes.reaped) != 1 || len(h.workspaces.discarded) != 1 || record.Result.Status != run.Completed {
		t.Fatalf("reaped %v, discarded %v, new call %+v", processes.reaped, h.workspaces.discarded, record.Result)
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
func driven(h *harness) context.CancelFunc {
	var cancel context.CancelFunc
	h.calls.ReapContext = func(ctx context.Context) (context.Context, context.CancelFunc) {
		ctx, cancel = context.WithCancel(ctx)
		return ctx, cancel
	}
	return func() { cancel() }
}

func TestReapingIsBoundedAndTheCallStillRuns(t *testing.T) {
	h := newHarness()
	a, b := abandonedRun("a"), abandonedRun("b")
	a.Effects.Checkout.Dir = "/tmp/agister-checkout-a/workspace"
	adopter, processes := reaping(h, a, b)
	deadline := driven(h)
	// The deadline arrives while a's checkout is being removed.
	h.workspaces.discardHook = func(ctx context.Context, dir string) error {
		if dir != a.Effects.Checkout.Dir {
			return nil
		}
		deadline()
		return ctx.Err()
	}
	record := h.call(t, contract.CallRequest{})
	if record.Result == nil || record.Result.Status != run.Completed {
		t.Fatalf("new call = %+v", record.Result)
	}
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
	adopter, processes := reaping(h, abandonedRun("a"))
	adopter.onLive = driven(h)
	record := h.call(t, contract.CallRequest{})
	if record.Result == nil || record.Result.Status != run.Completed {
		t.Fatalf("new call = %+v", record.Result)
	}
	if len(adopter.adopted) != 0 || len(processes.reaped) != 0 || len(h.workspaces.discarded) != 0 {
		t.Fatalf("adopted %v, reaped %v, discarded %v", adopter.adopted, processes.reaped, h.workspaces.discarded)
	}
}

func TestReapingHasADeadlineByDefault(t *testing.T) {
	h := newHarness()
	reaping(h, abandonedRun("a"))
	h.calls.ReapTimeout = time.Minute
	var bounded bool
	h.workspaces.discardHook = func(ctx context.Context, _ string) error {
		deadline, ok := ctx.Deadline()
		bounded = ok && time.Until(deadline) <= time.Minute
		return nil
	}
	h.call(t, contract.CallRequest{})
	if !bounded {
		t.Fatal("reaping ran without a deadline")
	}
}

func TestACheckoutARunningRunUsesIsNotDiscarded(t *testing.T) {
	h := newHarness()
	adopter, processes := reaping(h, abandonedRun("old"))
	adopter.live = []string{"/tmp/agister-checkout-1/workspace"}
	h.call(t, contract.CallRequest{})
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
