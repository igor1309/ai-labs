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
// finished, then finishes them. It is not part of any call: whoever
// composes the client starts it (see BackgroundReaper).
type Reaper struct {
	adopter   RunAdopter
	processes Processes
	discarder CheckoutDiscarder
	clock     ReapClock
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
	// Abandoned lists the unfinished runs nobody owns that recorded effects.
	Abandoned(ctx context.Context) ([]run.Record, error)
	// LiveCheckouts lists the checkout directories that runs some process
	// still owns record, so nobody removes them from under those runs. Read
	// before Adopt: the run adopted is owned by this process and would read
	// as live.
	LiveCheckouts(ctx context.Context) ([]string, error)
	// Adopt takes ownership of an abandoned run, as its record is now. It
	// fails if the run is owned by another process or finished.
	Adopt(ctx context.Context, id string) (ReapHandle, run.Record, error)
}

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
	return &Reaper{adopter: adopter, processes: processes, discarder: discarder, clock: clock}
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
	abandoned, err := c.adopter.Abandoned(ctx)
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
		// Read before adopting: the run adopted next is owned by this
		// process and would read as live.
		live, liveErr := c.adopter.LiveCheckouts(ctx)
		// The deadline may have arrived meanwhile: never adopt after it.
		if ctx.Err() != nil {
			break
		}
		// Someone else adopting it first is fine: they reap it.
		handle, record, err := c.adopter.Adopt(ctx, listed.ID)
		if err != nil {
			continue
		}
		if err := c.reap(ctx, handle, record, live, liveErr); err != nil {
			errs = append(errs, err)
		}
	}
	return errors.Join(errs...)
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

// reap ends one adopted run's effects and finishes it as lost. A step that
// fails is recorded and does not stop the rest, so a run is reaped once. A
// checkout that a run still owned records as its own is left in place, and
// so is one whose users could not be listed. It returns the failure to
// record the reap or finish the run; with the event unrecorded, the error
// carries the steps that failed.
func (c *Reaper) reap(ctx context.Context, handle ReapHandle, record run.Record, live []string, liveErr error) error {
	data := map[string]any{}
	var failures []string
	var effects run.Effects
	if record.Effects != nil {
		effects = *record.Effects
	}
	// The runtime's process and the verification command's (ADR-002 rule
	// 10), each by the reference its runner recorded.
	for _, group := range []struct {
		name    string
		process *run.Process
	}{{"process", effects.Process}, {"command", effects.Command}} {
		if group.process == nil {
			continue
		}
		reaping, err := c.processes.Reap(ctx, group.process.Ref)
		data[group.name] = map[string]any{"ref": group.process.Ref, "outcome": string(reaping)}
		if err != nil {
			failures = append(failures, fmt.Sprintf("%s %q: %v", group.name, group.process.Ref, err))
		}
	}
	if checkout := effects.Checkout; checkout != nil {
		switch {
		case liveErr != nil:
			data["checkout"] = map[string]any{"dir": checkout.Dir, "removed": false, "skipped": "could not tell whether a running run uses it"}
			failures = append(failures, fmt.Sprintf("checkout %s left: listing running runs: %v", checkout.Dir, liveErr))
		case slices.Contains(live, checkout.Dir):
			data["checkout"] = map[string]any{"dir": checkout.Dir, "removed": false, "skipped": "a running run uses it"}
		default:
			err := c.discarder.Discard(ctx, checkout.Repository, checkout.Dir)
			data["checkout"] = map[string]any{"dir": checkout.Dir, "removed": err == nil}
			if err != nil {
				failures = append(failures, fmt.Sprintf("checkout %s: %v", checkout.Dir, err))
			}
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
	result := run.AbandonedResult(record.CreatedAt)
	result.Timing.FinishedAt = now
	result.Timing.WallMS = now.Sub(record.CreatedAt).Milliseconds()
	record.FinishedAt = &now
	record.Result = &result
	if err := handle.Finish(record); err != nil {
		errs = append(errs, fmt.Errorf("finishing the run: %w", err))
	}
	if len(errs) > 0 {
		return fmt.Errorf("reaping run %s: %w", record.ID, errors.Join(errs...))
	}
	return nil
}
