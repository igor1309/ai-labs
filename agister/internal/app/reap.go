package app

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"strings"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

// defaultReapTimeout bounds reaping when Reaper.ReapTimeout is zero.
const defaultReapTimeout = 30 * time.Second

// Reaper undoes the effects of runs whose process was killed before they
// finished, then finishes them, and removes the clean copies (ADR-005 rule
// 2) and the unreleased checkouts (ADR-008 rule 6) finished runs left on
// record. It is not part of any call: whoever composes the client starts
// it (see BackgroundReaper). A call asks it only for the one run that
// keeps its worktree from it (ReapRun).
type Reaper struct {
	adopter   RunAdopter
	processes Processes
	discarder CheckoutDiscarder
	clock     ReapClock
	// turn is held while the reaper lists the abandoned runs or takes one
	// (take): a Reap and a ReapRun of one process never meet each other at
	// a run's owner lock.
	turn chan struct{}
	// waiting, when set, is called when the turn is taken, before the wait
	// for it. Tests take it there.
	waiting func()
	// ReapTimeout bounds one Reap; zero means 30s.
	ReapTimeout time.Duration
	// ReapContext, when set, replaces the timeout: it returns the context
	// that bounds reaping. Tests use it to drive the deadline.
	ReapContext func(context.Context) (context.Context, context.CancelFunc)
}

// CheckoutDiscarder removes checkouts whose owner ended without releasing
// them.
type CheckoutDiscarder interface {
	// Discard removes a checkout that Checkout made. A checkout already
	// gone is success; a directory Checkout could not have made is refused.
	Discard(ctx context.Context, repository, dir string) error
}

// Reaping is what Reap found of a process.
type Reaping string

const (
	ReapKilled Reaping = "killed" // the process was killed
	ReapGone   Reaping = "gone"   // no such process
	ReapLeft   Reaping = "left"   // not killed: it is not known to be the recorded one, or the reference is not understood
)

// Processes ends the runtime processes a dead owner left behind. What a
// reference means is the adapter's own: the core only stores and returns it.
type Processes interface {
	// Reap ends the process the reference names, unless it may be another
	// one by now. A reference the adapter did not make is ReapLeft, with an
	// error.
	Reap(ctx context.Context, ref string) (Reaping, error)
}

// RunAdopter takes over runs whose owner ended.
type RunAdopter interface {
	// Abandoned lists the unfinished runs nobody owns that recorded effects,
	// and the finished runs whose record still names a clean copy or an
	// unreleased checkout.
	Abandoned(ctx context.Context) ([]run.Record, error)
	// LiveCheckouts lists the checkout directories, workspaces and clean
	// copies, that runs some process still owns record, so nobody removes
	// them from under those runs. Read
	// before Adopt: the run adopted is owned by this process and would read
	// as live.
	LiveCheckouts(ctx context.Context) ([]string, error)
	// Adopt takes ownership of a run Abandoned lists, as its record is now.
	// It fails if the run is owned by another process, with an error that
	// wraps ErrRunOwned, or finished with no clean copy or unreleased
	// checkout on record, with one that wraps ErrRunFinished and the
	// record as it finished.
	Adopt(ctx context.Context, id string) (ReapHandle, run.Record, error)
}

var (
	// ErrRunOwned is what a run is not adopted with while another holds
	// its owner lock.
	ErrRunOwned = errors.New("it is owned")
	// ErrRunFinished is what a run is not adopted with once it finished
	// and left nothing to remove.
	ErrRunFinished = errors.New("it is finished")
)

// ReapHandle records the end of an adopted run. Finish releases ownership.
type ReapHandle interface {
	Append(event run.Event) error
	Finish(record run.Record) error
}

// ReapClock tells the time of a reap's events and of the end it records.
type ReapClock interface{ Now() time.Time }

// NewReaper returns the use case that reaps abandoned runs. Every
// collaborator is required; ReapTimeout and ReapContext are optional.
func NewReaper(adopter RunAdopter, processes Processes, discarder CheckoutDiscarder, clock ReapClock) *Reaper {
	return &Reaper{adopter: adopter, processes: processes, discarder: discarder, clock: clock, turn: make(chan struct{}, 1)}
}

// Reap leaves runs some process still owns alone. Runs not reached by the
// reap deadline are not adopted and wait for the next reap, and the run
// being reaped when time runs out is finished with the steps that failed
// recorded. The process and git steps honour the deadline: os.RemoveAll in
// Discard does not, so a reap can run past it.
//
// A step that fails is recorded in its run, not returned. Reap returns what
// no run records: that the abandoned runs could not be listed, or that a
// reaped run's event or end could not be written.
func (c *Reaper) Reap(ctx context.Context) error {
	ctx, cancel := c.reapContext(ctx)
	defer cancel()
	abandoned, err := c.abandoned(ctx)
	if err != nil {
		return fmt.Errorf("listing abandoned runs: %w", err)
	}
	var errs []error
	for _, listed := range abandoned {
		if listed.Effects == nil {
			continue
		}
		if ctx.Err() != nil {
			break
		}
		// Someone else adopting it first is fine: they reap it.
		if _, adopted, err := c.step(ctx, listed.ID); adopted && err != nil {
			errs = append(errs, err)
		}
	}
	return errors.Join(errs...)
}

// ReapRun reaps run id alone, by the step Reap takes for each run it
// lists, for a call that the run keeps from its worktree: nobody waits for
// a Reap beside the calls. A run nobody owns has its effects ended and is
// finished as lost; it is returned as finished, and so is one that
// finished meanwhile, by another reap or by its owner. A run a process
// owns is left alone, and owned is true. The reap deadline bounds it, as
// it bounds a Reap.
func (c *Reaper) ReapRun(ctx context.Context, id string) (finished run.Record, owned bool, err error) {
	ctx, cancel := c.reapContext(ctx)
	defer cancel()
	record, adopted, err := c.step(ctx, id)
	switch {
	case adopted:
		return record, false, err
	case errors.Is(err, ErrRunOwned):
		return run.Record{}, true, nil
	case errors.Is(err, ErrRunFinished):
		return record, false, nil
	}
	return run.Record{}, false, err
}

// abandoned lists the abandoned runs, in the reaper's turn.
func (c *Reaper) abandoned(ctx context.Context) ([]run.Record, error) {
	release, err := c.take(ctx)
	if err != nil {
		return nil, err
	}
	defer release()
	return c.adopter.Abandoned(ctx)
}

// step adopts run id and reaps it, in the reaper's turn. adopted is false
// for a run it did not take, with why: the deadline arrived, or the
// adoption failed, the record with it when the run is finished.
func (c *Reaper) step(ctx context.Context, id string) (record run.Record, adopted bool, err error) {
	release, err := c.take(ctx)
	if err != nil {
		return record, false, err
	}
	defer release()
	// Read before adopting: the run adopted next is owned by this
	// process and would read as live.
	live, liveErr := c.adopter.LiveCheckouts(ctx)
	// The deadline may have arrived meanwhile: never adopt after it.
	if err := ctx.Err(); err != nil {
		return record, false, err
	}
	handle, record, err := c.adopter.Adopt(ctx, id)
	if err != nil {
		return record, false, err
	}
	record, err = c.reap(ctx, handle, record, live, liveErr)
	return record, true, err
}

// take takes the reaper's turn, and returns its release. The reaper reads
// and takes the runs' owner locks only in its turn: the flock one of its
// reaps holds, or holds for the moment it reads a run's state, would read
// to another of this process as the run's owner. A turn that is free is
// taken whatever ctx says; the wait for one that is taken ends with ctx.
func (c *Reaper) take(ctx context.Context) (release func(), err error) {
	select {
	case c.turn <- struct{}{}:
	default:
		if c.waiting != nil {
			c.waiting()
		}
		select {
		case c.turn <- struct{}{}:
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}
	return func() { <-c.turn }, nil
}

// reapContext bounds reaping: Reaper.ReapContext when set, else the reap
// timeout.
func (c *Reaper) reapContext(ctx context.Context) (context.Context, context.CancelFunc) {
	if c.ReapContext != nil {
		return c.ReapContext(ctx)
	}
	timeout := c.ReapTimeout
	if timeout <= 0 {
		timeout = defaultReapTimeout
	}
	return context.WithTimeout(ctx, timeout)
}

// reap ends one adopted run's effects and finishes it as lost; of a run
// that finished, it removes only the clean copy and the unreleased
// checkout its record names, and the run keeps its end. A step that fails
// is recorded and does not stop the rest, so a run is reaped once. A
// checkout, the call's own or verification's clean copy, that a run still
// owned records as its own is left in place, and so is one whose users
// could not be listed. A copy or unreleased checkout removed is no longer
// on record; the checkout of an unfinished run that could not be removed
// is put on record as unreleased. It returns the record as it finished the
// run with, and the failure to record the reap or finish the run; with the
// event unrecorded, the error carries the steps that failed.
func (c *Reaper) reap(ctx context.Context, handle ReapHandle, record run.Record, live []string, liveErr error) (run.Record, error) {
	data := map[string]any{}
	var failures []string
	var effects run.Effects
	if record.Effects != nil {
		effects = *record.Effects
	}
	// A finished run ended its processes: only a checkout whose release
	// failed and a copy it could not remove are left. Its Checkout stays
	// on record whether released or not.
	finished := record.FinishedAt != nil
	processes := []struct {
		name    string
		process *run.Process
	}{{"process", effects.Process}, {"command", effects.Command}}
	// forget, when set, drops a removed checkout from the record: else
	// every reap would find the run again. keep, when set, puts one that
	// could not be removed on record as unreleased: else no reap would
	// find the finished run again.
	checkouts := []struct {
		name         string
		checkout     *run.Checkout
		forget, keep func()
	}{
		{"checkout", effects.Checkout, nil, func() { effects.Unreleased = effects.Checkout }},
		{"copy", effects.Copy, func() { effects.Copy = nil }, nil},
	}
	if finished {
		processes = nil
		checkouts[0].checkout, checkouts[0].forget, checkouts[0].keep = effects.Unreleased, func() { effects.Unreleased = nil }, nil
	}
	// The runtime's process and the verification command's (ADR-002 rule
	// 10), each by the reference its runner recorded. Only a reap that
	// ended every one, or found it gone, knows they ended (ADR-022 rule 3):
	// a step that failed leaves the run's processes not known to have
	// ended, and an in-place call asks about them again.
	ended := true
	for _, group := range processes {
		if group.process == nil {
			continue
		}
		reaping, err := c.processes.Reap(ctx, group.process.Ref)
		data[group.name] = map[string]any{"ref": group.process.Ref, "outcome": string(reaping)}
		if err != nil {
			failures = append(failures, fmt.Sprintf("%s %q: %v", group.name, group.process.Ref, err))
		}
		if err != nil || reaping != ReapKilled && reaping != ReapGone {
			ended = false
		}
	}
	// The call's checkout (ADR-002 rule 10; ADR-008 rule 6 once finished)
	// and the clean copy a verification run checked (ADR-005 rule 2).
	for _, dir := range checkouts {
		checkout := dir.checkout
		if checkout == nil {
			continue
		}
		left := false
		switch {
		case liveErr != nil:
			data[dir.name] = map[string]any{"dir": checkout.Dir, "removed": false, "skipped": "could not tell whether a running run uses it"}
			failures = append(failures, fmt.Sprintf("%s %s left: listing running runs: %v", dir.name, checkout.Dir, liveErr))
			left = true
		case slices.Contains(live, checkout.Dir):
			data[dir.name] = map[string]any{"dir": checkout.Dir, "removed": false, "skipped": "a running run uses it"}
		default:
			err := c.discarder.Discard(ctx, checkout.Repository, checkout.Dir)
			data[dir.name] = map[string]any{"dir": checkout.Dir, "removed": err == nil}
			if err != nil {
				failures = append(failures, fmt.Sprintf("%s %s: %v", dir.name, checkout.Dir, err))
				left = true
			} else if dir.forget != nil {
				dir.forget()
				record.Effects = &effects
			}
		}
		// A checkout that could not be removed, as when the cleanup deadline
		// passes while another process holds the worktree lock, stays for a
		// later reap (ADR-008 rule 6).
		if left && dir.keep != nil {
			dir.keep()
			record.Effects = &effects
		}
	}
	if len(failures) > 0 {
		data["errors"] = failures
	}
	var errs []error
	now := c.clock.Now()
	if err := handle.Append(run.Event{At: now, Source: run.SourceAgister, Kind: "EFFECTS_REAPED", Data: data}); err != nil {
		if len(failures) > 0 {
			err = fmt.Errorf("%w (unrecorded step failures: %s)", err, strings.Join(failures, "; "))
		}
		errs = append(errs, fmt.Errorf("recording the reap: %w", err))
	}
	if !finished {
		record.ProcessesEnded = &ended
		result := run.AbandonedResult(record.CreatedAt)
		result.Timing.FinishedAt = now
		result.Timing.WallMS = now.Sub(record.CreatedAt).Milliseconds()
		record.FinishedAt = &now
		record.Result = &result
	}
	if err := handle.Finish(record); err != nil {
		errs = append(errs, fmt.Errorf("finishing the run: %w", err))
	}
	if len(errs) > 0 {
		return record, fmt.Errorf("reaping run %s: %w", record.ID, errors.Join(errs...))
	}
	return record, nil
}
