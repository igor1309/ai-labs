package app_test

import (
	"context"
	"errors"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/adapters/fsruns"
	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/contract"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

// reapedRun is the record as a reap finishes it: lost, abandoned, and
// saying whether its processes ended.
func reapedRun(record run.Record, ended bool) run.Record {
	at := time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC)
	result := run.AbandonedResult(record.CreatedAt)
	record.FinishedAt, record.Result, record.ProcessesEnded = &at, &result, known(ended)
	return record
}

// completedRun is the record as its own call finishes it, its processes
// ended.
func completedRun(record run.Record) run.Record {
	at := time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC)
	record.FinishedAt, record.Result, record.ProcessesEnded = &at, &run.Result{Status: run.Completed}, known(true)
	return record
}

// dataOf are the data of the events of kind among events, in order.
func dataOf(events []run.Event, kind string) []map[string]any {
	var data []map[string]any
	for _, event := range events {
		if event.Kind == kind {
			data = append(data, event.Data)
		}
	}
	return data
}

// kindsOf are the kinds of events, in order, in one line.
func kindsOf(events []run.Event) string {
	kinds := make([]string, len(events))
	for i, event := range events {
		kinds[i] = event.Kind
	}
	return strings.Join(kinds, " ")
}

// ADR-025 rule 4, LAB-123: a call that meets a writer's unfinished run in a
// directory overlapping its worktree has the run reaped before it decides.
// A run its owner holds may still write, and refuses the call as before.
// One nobody owns is finished by the reap, and the call is admitted, unless
// the reap left a process the call cannot end either, or the run could not
// be reaped. The call's events say what it found of the run, and how the
// run ended. A reader's run, and a run elsewhere, are not asked about.
func TestAnUnfinishedRunNobodyOwnsIsReapedBeforeTheCallIsDecided(t *testing.T) {
	t.Parallel()
	unfinished := inPlaceRun("run-0", "/repo", false, false)
	const refusal = "run run-0 worked in worktree /repo and has not finished: it may still write there"
	for name, c := range map[string]struct {
		other    run.Record
		finished *run.Record     // the run as its reap returns it; its owner holds it when nil
		err      error           // what the reap fails with
		outcome  app.HoldReaping // what ending a process the reap left finds
		asked    []string        // the runs the call asked to have reaped
		event    map[string]any  // what the call says it found; nothing when nil
		ended    []string        // the processes the call asked to end itself
		want     string          // the refusal; none when empty
	}{
		"its owner holds it": {other: unfinished, asked: []string{"run-0"},
			event: map[string]any{"run": "run-0", "outcome": "owned"}, want: refusal},
		"nobody owns it, and the reap ended its processes": {other: unfinished, finished: ptr(reapedRun(unfinished, true)), asked: []string{"run-0"},
			event: map[string]any{"run": "run-0", "outcome": "finished", "status": "lost", "class": "abandoned", "processes_ended": true}},
		"nobody owns it, and the call ends the process the reap left": {other: unfinished, finished: ptr(reapedRun(unfinished, false)), outcome: app.HoldReapKilled, asked: []string{"run-0"},
			event: map[string]any{"run": "run-0", "outcome": "finished", "status": "lost", "class": "abandoned", "processes_ended": false}, ended: []string{"ref-run-0"}},
		"nobody owns it, and the reap left a process": {other: unfinished, finished: ptr(reapedRun(unfinished, false)), outcome: app.HoldReapLeft, asked: []string{"run-0"},
			event: map[string]any{"run": "run-0", "outcome": "finished", "status": "lost", "class": "abandoned", "processes_ended": false}, ended: []string{"ref-run-0"},
			want: `run run-0 worked in worktree /repo, and its runtime process "ref-run-0" may still write there: it could not be ended: it cannot be told apart from another`},
		"its owner finished it meanwhile": {other: unfinished, finished: ptr(completedRun(unfinished)), asked: []string{"run-0"},
			event: map[string]any{"run": "run-0", "outcome": "finished", "status": "completed", "processes_ended": true}},
		"it cannot be reaped": {other: unfinished, err: errors.New("disk full"), asked: []string{"run-0"},
			event: map[string]any{"run": "run-0", "outcome": "unfinished", "error": "disk full"}, want: refusal + ": it could not be reaped: disk full"},
		"its reap leaves it unfinished": {other: unfinished, finished: ptr(unfinished), asked: []string{"run-0"},
			event: map[string]any{"run": "run-0", "outcome": "unfinished", "error": "its record is still unfinished"}, want: refusal + ": it could not be reaped: its record is still unfinished"},
		"a reader's":   {other: readerRun(inPlaceRun("run-0", "/repo", false, false))},
		"elsewhere":    {other: inPlaceRun("run-0", "/elsewhere", false, false)},
		"finished":     {other: inPlaceRun("run-0", "/repo", true, true)},
		"its own call": {other: inPlaceRun("run-1", "/repo", false, false)},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			h := newHarness()
			h.runs.records[c.other.ID] = c.other
			if c.finished != nil {
				h.reaps.finished = map[string]run.Record{"run-0": *c.finished}
			}
			h.reaps.err, h.writers.outcome = c.err, c.outcome
			record := h.call(t, contract.CallRequest{})

			if !reflect.DeepEqual(h.reaps.runs(), c.asked) {
				t.Fatalf("asked to have reaped %v, want %v", h.reaps.runs(), c.asked)
			}
			var said []map[string]any
			if c.event != nil {
				said = []map[string]any{c.event}
			}
			if got := dataOf(eventsOf(h, "WORKTREE_RUN_REAPED"), "WORKTREE_RUN_REAPED"); !reflect.DeepEqual(got, said) {
				t.Fatalf("the call says %v of the run, want %v", got, said)
			}
			if !reflect.DeepEqual(h.writers.refs(), c.ended) {
				t.Fatalf("asked to end %v, want %v", h.writers.refs(), c.ended)
			}
			if c.want == "" {
				if record.Result.Status != run.Completed || len(h.runner.calls()) != 1 {
					t.Fatalf("result %+v, turns %d", record.Result, len(h.runner.calls()))
				}
				return
			}
			// The reason is the whole of it: a run its owner holds is not
			// said to have failed a reap.
			if class(record) != run.ClassRefused || !strings.HasSuffix(message(record), c.want) {
				t.Fatalf("result %s %q, want %q", class(record), message(record), c.want)
			}
			if len(h.runner.calls()) != 0 || h.worktrees.reads != 0 || h.locks.holds("/repo") {
				t.Fatalf("turns %d, reads %d, lock held %v", len(h.runner.calls()), h.worktrees.reads, h.locks.holds("/repo"))
			}
		})
	}
}

func ptr[T any](value T) *T { return &value }

// killedAtItsAbort is a run store whose call is killed right after its
// abort is on record, as an owner is that a SIGKILL takes while it waits
// for its runtime to end: the run is left as a killed owner leaves it, and
// nothing the call does after is saved.
type killedAtItsAbort struct{ fsruns.Store }

func (s killedAtItsAbort) Create(ctx context.Context, record run.Record) (app.RunHandle, error) {
	handle, err := s.Store.Create(ctx, record)
	if err != nil {
		return nil, err
	}
	return &abortedHandle{RunHandle: handle, store: s.Store, id: record.ID}, nil
}

type abortedHandle struct {
	app.RunHandle
	store fsruns.Store
	id    string
}

func (h *abortedHandle) Append(event run.Event) error {
	if err := h.RunHandle.Append(event); err != nil || event.Kind != "ABORT_REQUESTED" {
		return err
	}
	return h.store.Abandon(h.id)
}

// LAB-123, ADR-025 rule 4: a writer killed after its abort was requested
// leaves its run unfinished, with its runtime's process on record. The next
// writer call into the same worktree does not wait for a reap beside the
// calls, which there is none of here: it reaps the run itself, by the
// reaper's own step, and is admitted. The killed run's record carries the
// reap's end, lost and abandoned, and its events the reap; the call's
// events say it had the run reaped, before it was admitted.
//
// Integration test: the calls, the holder and the reaper over the run store
// on the filesystem; git, the worktree's hold and the runtime are spies.
func TestAWriterCallReapsTheRunAKilledWriterLeftInItsWorktree(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	h := newHarness()
	writing(h)
	store := fsruns.Store{Dir: t.TempDir(), Appends: fsruns.NewAppends()}
	h.reaper = storedReaper(t, h, store)
	h.calls = h.callsRecordedWith(h.defs, h.workspaces, h.changes, store, killedAtItsAbort{store}, &seqIDs{})
	// The first call's turn runs until it is aborted, which it reports as
	// the supervisor of its process does; the next call's turn completes.
	turning := make(chan struct{})
	h.runner.acting = func(ctx context.Context, sink app.EventSink) {
		if len(h.runner.calls()) > 1 {
			return
		}
		close(turning)
		<-ctx.Done()
		sink.Event(run.SourceAgister, "ABORT_REQUESTED", nil)
	}
	killed, err := h.calls.Submit(ctx, contract.CallRequest{Process: "p", Cwd: "/repo"})
	if err != nil {
		t.Fatal(err)
	}
	<-turning
	if !h.hosted.Cancel(killed) {
		t.Fatalf("run %s is not hosted", killed)
	}
	<-h.hosted.Done(killed)
	// As the kill leaves it: nobody's, unfinished, a writer's in the
	// worktree, its process on record, its abort its last event, and the
	// worktree's hold let go.
	left, state, err := store.Get(ctx, killed)
	if err != nil || state != run.StateAbandoned || left.FinishedAt != nil || left.Result != nil || left.InPlace == nil || left.InPlace.Worktree != "/repo" || !left.InPlace.HeldAlone() ||
		left.Effects == nil || left.Effects.Process == nil || left.Effects.Process.Ref != "ref-4242" {
		t.Fatalf("the killed run %+v, in place %+v, effects %+v, state %s, %v", left, left.InPlace, left.Effects, state, err)
	}
	events, _, err := store.Events(ctx, killed, 0)
	if err != nil || !strings.HasSuffix(kindsOf(events), " ABORT_REQUESTED") || h.locks.holds("/repo") {
		t.Fatalf("the killed run's events %s, %v; lock held %v", kindsOf(events), err, h.locks.holds("/repo"))
	}

	next, err := h.calls.Submit(ctx, contract.CallRequest{Process: "p", Cwd: "/repo"})
	if err != nil {
		t.Fatal(err)
	}
	<-h.hosted.Done(next)

	admitted, state, err := store.Get(ctx, next)
	if err != nil || state != run.StateFinished || admitted.Result == nil || admitted.Result.Status != run.Completed || admitted.InPlace == nil || !admitted.InPlace.HeldAlone() {
		t.Fatalf("the next call %s: %+v, in place %+v, %v", state, admitted.Result, admitted.InPlace, err)
	}
	if turns := h.runner.calls(); len(turns) != 2 || turns[1].Cwd != "/repo" {
		t.Fatalf("turns %+v", turns)
	}
	// The call says it had the run reaped, and how the run ended, before it
	// was admitted.
	events, _, err = store.Events(ctx, next, 0)
	if err != nil || !strings.Contains(kindsOf(events), "WORKTREE_LOCKED WORKTREE_RUN_REAPED WORKTREE_ADMITTED") {
		t.Fatalf("the next call's events %s, %v", kindsOf(events), err)
	}
	if got, want := dataOf(events, "WORKTREE_RUN_REAPED"), []map[string]any{{"run": killed, "outcome": "finished", "status": "lost", "class": "abandoned", "processes_ended": true}}; !reflect.DeepEqual(got, want) {
		t.Fatalf("the next call says %v of the killed run, want %v", got, want)
	}
	// The killed run's record carries the reap's end, and its events the
	// reap, which ended its process: the hold had none left to ask about.
	reaped, state, err := store.Get(ctx, killed)
	if err != nil || state != run.StateFinished || reaped.FinishedAt == nil || reaped.Result == nil || reaped.Result.Status != run.Lost || class(reaped) != run.ClassAbandoned || !says(reaped, true) {
		t.Fatalf("the killed run %s: %+v, processes ended %s, %v", state, reaped.Result, said(reaped), err)
	}
	events, _, err = store.Events(ctx, killed, 0)
	if err != nil || !strings.HasSuffix(kindsOf(events), " ABORT_REQUESTED EFFECTS_REAPED") {
		t.Fatalf("the killed run's events %s, %v", kindsOf(events), err)
	}
	if got, want := dataOf(events, "EFFECTS_REAPED"), []map[string]any{{"process": map[string]any{"ref": "ref-4242", "outcome": "killed"}}}; !reflect.DeepEqual(got, want) {
		t.Fatalf("the reap recorded %v, want %v", got, want)
	}
	if want := []string{"ref-4242"}; !reflect.DeepEqual(h.processes.refs(), want) || len(h.writers.refs()) != 0 {
		t.Fatalf("the reap asked to end %v, want %v; the hold %v", h.processes.refs(), want, h.writers.refs())
	}
}

// ADR-025 rule 4: an unfinished run its owner holds may still write, so it
// refuses the call as before, with the reason as before; nothing of the run
// is touched, and its owner writes on.
//
// Integration test: the holder and the reaper over the run store on the
// filesystem, whose owner lock tells the run is owned.
func TestAnUnfinishedRunItsOwnerHoldsStillRefusesTheCall(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	h := newHarness()
	store, hold := storedHolds(t, h)
	owner, err := store.Create(ctx, inPlaceRun("run-0", "/repo", false, false))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Abandon("run-0") })

	holding, err := hold("run-1", "/repo", saved)

	var refusal *app.Refusal
	if want := "run run-0 worked in worktree /repo and has not finished: it may still write there"; !errors.As(err, &refusal) || refusal.Reason != want {
		t.Fatalf("the hold = %v, want the refusal %q", err, want)
	}
	if holding != nil || h.locks.holds("/repo") || h.worktrees.reads != 0 {
		t.Fatalf("holding %+v, lock held %v, reads %d", holding, h.locks.holds("/repo"), h.worktrees.reads)
	}
	if got, want := dataOf(eventsOf(h, "WORKTREE_RUN_REAPED"), "WORKTREE_RUN_REAPED"), []map[string]any{{"run": "run-0", "outcome": "owned"}}; !reflect.DeepEqual(got, want) {
		t.Fatalf("the call says %v of the run, want %v", got, want)
	}
	// The run is as its owner has it, no process of it was asked about, and
	// the owner still writes to it.
	owned, state, err := store.Get(ctx, "run-0")
	if err != nil || state != run.StateRunning || owned.FinishedAt != nil || owned.Result != nil {
		t.Fatalf("the owned run %s: %+v, %v", state, owned, err)
	}
	if len(h.processes.refs()) != 0 || len(h.writers.refs()) != 0 {
		t.Fatalf("the reap asked to end %v, the hold %v", h.processes.refs(), h.writers.refs())
	}
	if err := owner.Append(run.Event{Source: run.SourceAgister, Kind: "STILL_WRITING"}); err != nil {
		t.Fatalf("the owner's next event: %v", err)
	}
	if events, _, err := store.Events(ctx, "run-0", 0); err != nil || kindsOf(events) != "STILL_WRITING" {
		t.Fatalf("the owned run's events %s, %v", kindsOf(events), err)
	}
}

// ADR-025 rule 4: the reap a call asks for finishes a run nobody owns
// whatever it finds, but a process it leaves may still write: the call is
// refused with the reason as before, the run's record saying its processes
// are not known to have ended. Once the process can be ended, the worktree
// is lent.
//
// Integration test: the holder and the reaper over the run store on the
// filesystem; the processes are spies.
func TestAReapThatLeavesAProcessStillRefusesTheCall(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	h := newHarness()
	store, hold := storedHolds(t, h)
	if _, err := store.Create(ctx, inPlaceRun("run-0", "/repo", false, false)); err != nil {
		t.Fatal(err)
	}
	if err := store.Abandon("run-0"); err != nil {
		t.Fatal(err)
	}
	h.processes.outcome, h.writers.outcome = app.ReapLeft, app.HoldReapLeft

	// The refused call's own run, which it finishes as any call does.
	var refused app.RunHandle
	var last run.Record
	holding, err := hold("run-1", "/repo", func(handle app.RunHandle, record run.Record) error {
		refused, last = handle, record
		return handle.Update(record)
	})

	var refusal *app.Refusal
	if want := `run run-0 worked in worktree /repo, and its runtime process "ref-run-0" may still write there: it could not be ended: it cannot be told apart from another`; !errors.As(err, &refusal) || refusal.Reason != want {
		t.Fatalf("the hold = %v, want the refusal %q", err, want)
	}
	if holding != nil || h.locks.holds("/repo") || h.worktrees.reads != 0 {
		t.Fatalf("holding %+v, lock held %v, reads %d", holding, h.locks.holds("/repo"), h.worktrees.reads)
	}
	reaped, state, err := store.Get(ctx, "run-0")
	if err != nil || state != run.StateFinished || reaped.Result == nil || reaped.Result.Status != run.Lost || class(reaped) != run.ClassAbandoned || !says(reaped, false) {
		t.Fatalf("the reaped run %s: %+v, processes ended %s, %v", state, reaped.Result, said(reaped), err)
	}
	events, _, err := store.Events(ctx, "run-0", 0)
	if got, want := dataOf(events, "EFFECTS_REAPED"), []map[string]any{{"process": map[string]any{"ref": "ref-run-0", "outcome": "left"}}}; err != nil || !reflect.DeepEqual(got, want) {
		t.Fatalf("the reap recorded %v, want %v: %v", got, want, err)
	}
	if got, want := dataOf(eventsOf(h, "WORKTREE_RUN_REAPED"), "WORKTREE_RUN_REAPED"), []map[string]any{{"run": "run-0", "outcome": "finished", "status": "lost", "class": "abandoned", "processes_ended": false}}; !reflect.DeepEqual(got, want) {
		t.Fatalf("the call says %v of the run, want %v", got, want)
	}
	// The reap, then the hold: each asked to end the process it left.
	if want := []string{"ref-run-0"}; !reflect.DeepEqual(h.processes.refs(), want) || !reflect.DeepEqual(h.writers.refs(), want) {
		t.Fatalf("the reap asked to end %v, the hold %v, want %v of each", h.processes.refs(), h.writers.refs(), want)
	}

	at := time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC)
	last.FinishedAt, last.ProcessesEnded = &at, known(true)
	if err := refused.Finish(last); err != nil {
		t.Fatal(err)
	}
	h.writers.outcome = app.HoldReapKilled
	if _, err := hold("run-2", "/repo", saved); err != nil || !h.locks.holds("/repo") {
		t.Fatalf("the hold once the process is ended = %v, lock held %v", err, h.locks.holds("/repo"))
	}
}

// LAB-123, ADR-025 rule 4: a writer killed once its worktree is on record,
// before its runtime's process is, leaves its run unfinished with no
// process on record. The next writer call into the worktree does not wait
// for a reap beside the calls, which there is none of here: it has the run
// reaped, and is admitted. The killed run's record carries the reap's end,
// lost and abandoned, and its events the reap; the call's events say it
// had the run reaped, and how the run ended.
//
// Integration test: the holder and the reaper over the run store on the
// filesystem; the processes are spies.
func TestAWriterKilledBeforeItsRuntimeStartedIsReapedByTheNextCall(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	h := newHarness()
	store, hold := storedHolds(t, h)
	killed := errors.New("killed")
	if _, err := hold("run-0", "/repo", func(handle app.RunHandle, record run.Record) error {
		if err := handle.Update(record); err != nil {
			return err
		}
		if err := store.Abandon(record.ID); err != nil {
			return err
		}
		return killed
	}); !errors.Is(err, killed) {
		t.Fatalf("the first hold = %v", err)
	}
	// As the kill leaves it: nobody's, unfinished, a writer's in the
	// worktree, with no effect on record.
	left, state, err := store.Get(ctx, "run-0")
	if err != nil || state != run.StateAbandoned || left.FinishedAt != nil || left.InPlace == nil || left.InPlace.Worktree != "/repo" || !left.InPlace.HeldAlone() ||
		left.Effects == nil || !reflect.DeepEqual(*left.Effects, run.Effects{}) {
		t.Fatalf("the killed run %s: in place %+v, effects %+v, %v", state, left.InPlace, left.Effects, err)
	}

	holding, err := hold("run-1", "/repo", saved)

	if err != nil || holding == nil || !h.locks.holds("/repo") {
		t.Fatalf("the next hold = %+v, %v; lock held %v", holding, err, h.locks.holds("/repo"))
	}
	reaped, state, err := store.Get(ctx, "run-0")
	if err != nil || state != run.StateFinished || reaped.Result == nil || reaped.Result.Status != run.Lost || class(reaped) != run.ClassAbandoned || !says(reaped, true) {
		t.Fatalf("the killed run %s: %+v, processes ended %s, %v", state, reaped.Result, said(reaped), err)
	}
	if events, _, err := store.Events(ctx, "run-0", 0); err != nil || kindsOf(events) != "EFFECTS_REAPED" {
		t.Fatalf("the killed run's events %s, %v", kindsOf(events), err)
	}
	if got, want := dataOf(eventsOf(h, "WORKTREE_RUN_REAPED"), "WORKTREE_RUN_REAPED"), []map[string]any{{"run": "run-0", "outcome": "finished", "status": "lost", "class": "abandoned", "processes_ended": true}}; !reflect.DeepEqual(got, want) {
		t.Fatalf("the call says %v of the run, want %v", got, want)
	}
	// No process was on record for the reap or the hold to end.
	if len(h.processes.refs()) != 0 || len(h.writers.refs()) != 0 {
		t.Fatalf("the reap asked to end %v, the hold %v", h.processes.refs(), h.writers.refs())
	}
}

// A reap of one run asked for while the reap beside the calls holds that
// run waits for it, and returns the run as that reap finished it. Without
// the wait it would find the run's owner lock taken, by its own process,
// and read the run as owned, which refuses the call that asked.
//
// Integration test: the reaper over the run store on the filesystem, whose
// owner lock is the kernel's; the processes are a spy that holds the reap
// beside the calls in its step.
func TestAReapOfOneRunWaitsForTheReapersStepInFlight(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	h := newHarness()
	store := fsruns.Store{Dir: t.TempDir(), Appends: fsruns.NewAppends()}
	if _, err := store.Create(ctx, inPlaceRun("run-0", "/repo", false, false)); err != nil {
		t.Fatal(err)
	}
	if err := store.Abandon("run-0"); err != nil {
		t.Fatal(err)
	}
	reaper := storedReaper(t, h, store)
	// The reap beside the calls stops while it ends the run's process: it
	// holds the run.
	inFlight, step := make(chan struct{}), newBlocked()
	h.processes.hook = func(context.Context) {
		close(inFlight)
		<-step.gate
	}
	waiting := make(chan struct{})
	reaper.OnWaiting(func() { close(waiting) })
	beside := make(chan error, 1)
	started(t, step, func() { beside <- reaper.Reap(ctx) })
	<-inFlight

	type answer struct {
		finished run.Record
		owned    bool
		err      error
	}
	asked := make(chan answer, 1)
	started(t, step, func() {
		finished, owned, err := reaper.ReapRun(ctx, "run-0")
		asked <- answer{finished, owned, err}
	})
	select {
	case <-waiting:
	case got := <-asked:
		t.Fatalf("the run was asked for while the reap beside the calls held it: owned %v, %v", got.owned, got.err)
	}
	step.release()

	got := <-asked
	if got.err != nil || got.owned || got.finished.FinishedAt == nil || class(got.finished) != run.ClassAbandoned || !says(got.finished, true) {
		t.Fatalf("the run asked for = %+v, owned %v, %v", got.finished.Result, got.owned, got.err)
	}
	if err := <-beside; err != nil {
		t.Fatal(err)
	}
	// It was reaped once, by the reap that held it.
	events, _, err := store.Events(ctx, "run-0", 0)
	if err != nil || kindsOf(events) != "EFFECTS_REAPED" || !reflect.DeepEqual(h.processes.refs(), []string{"ref-run-0"}) {
		t.Fatalf("the run's events %s, %v; asked to end %v", kindsOf(events), err, h.processes.refs())
	}
}

// LAB-123: the reap beside the calls holds only the run whose effects it
// ends. A writer call that meets, meanwhile, the run a dead owner left
// unfinished in its worktree has that run reaped by the same reaper
// without waiting for the reap beside the calls, whose removal of another
// run's clean copy may run past any deadline: the call is admitted while
// the removal still runs. That reap then finishes its own run, and finds
// the call's finished.
//
// Integration test: the holder and the reap beside the calls, by one
// reaper, over the run store on the filesystem, whose owner lock is the
// kernel's; the removal and the processes are spies.
func TestAWriterCallDoesNotWaitForTheReapOfAnotherRun(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	h := newHarness()
	store := fsruns.Store{Dir: t.TempDir(), Appends: fsruns.NewAppends()}
	reaper := storedReaper(t, h, store)
	hold := storedHoldsBy(t, h, store, reaper)
	// A finished run whose clean copy is still on record, listed before
	// the killed writer: the reap beside the calls takes it first.
	copied := &run.Checkout{Repository: "/origin", Dir: "/made/copy"}
	finished, err := store.Create(ctx, run.Record{ID: "legacy-0"})
	if err != nil {
		t.Fatal(err)
	}
	if err := finished.Finish(completedRun(run.Record{ID: "legacy-0", Effects: &run.Effects{Copy: copied}})); err != nil {
		t.Fatal(err)
	}
	if _, err := store.Create(ctx, inPlaceRun("run-0", "/repo", false, false)); err != nil {
		t.Fatal(err)
	}
	if err := store.Abandon("run-0"); err != nil {
		t.Fatal(err)
	}
	// The copy's removal runs until the test lets it go.
	removing, removal := make(chan struct{}), newBlocked()
	h.workspaces.discardHook = func(_ context.Context, dir string) error {
		if dir == copied.Dir {
			close(removing)
			<-removal.gate
		}
		return nil
	}
	// A wait would last as long as the removal: it is let go, and the test
	// fails.
	reaper.OnWaiting(func() {
		t.Error("the call waited for the reap beside the calls")
		removal.release()
	})
	beside := make(chan error, 1)
	started(t, removal, func() { beside <- reaper.Reap(ctx) })
	<-removing

	holding, err := hold("run-1", "/repo", saved)

	if err != nil || holding == nil || !h.locks.holds("/repo") {
		t.Fatalf("the hold while another run's copy is removed = %+v, %v; lock held %v", holding, err, h.locks.holds("/repo"))
	}
	reaped, state, err := store.Get(ctx, "run-0")
	if err != nil || state != run.StateFinished || reaped.Result == nil || reaped.Result.Status != run.Lost || class(reaped) != run.ClassAbandoned || !says(reaped, true) {
		t.Fatalf("the killed run %s: %+v, processes ended %s, %v", state, reaped.Result, said(reaped), err)
	}
	if got, want := dataOf(eventsOf(h, "WORKTREE_RUN_REAPED"), "WORKTREE_RUN_REAPED"), []map[string]any{{"run": "run-0", "outcome": "finished", "status": "lost", "class": "abandoned", "processes_ended": true}}; !reflect.DeepEqual(got, want) {
		t.Fatalf("the call says %v of the run, want %v", got, want)
	}
	if legacy, _, err := store.Get(ctx, "legacy-0"); err != nil || legacy.Effects == nil || !reflect.DeepEqual(legacy.Effects.Copy, copied) {
		t.Fatalf("the copy left the record before its removal ended: %+v, %v", legacy.Effects, err)
	}

	removal.release()
	if err := <-beside; err != nil {
		t.Fatal(err)
	}
	if legacy, _, err := store.Get(ctx, "legacy-0"); err != nil || legacy.Effects == nil || legacy.Effects.Copy != nil || legacy.Result == nil || legacy.Result.Status != run.Completed {
		t.Fatalf("the finished run once its copy is removed: effects %+v, result %+v, %v", legacy.Effects, legacy.Result, err)
	}
	// The killed run was reaped once, by the call's reap.
	events, _, err := store.Events(ctx, "run-0", 0)
	if err != nil || kindsOf(events) != "EFFECTS_REAPED" || !reflect.DeepEqual(h.processes.refs(), []string{"ref-run-0"}) {
		t.Fatalf("the killed run's events %s, %v; asked to end %v", kindsOf(events), err, h.processes.refs())
	}
}
