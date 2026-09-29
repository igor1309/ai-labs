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
	Adopter   RunAdopter
	Processes Processes
	Discarder CheckoutDiscarder
	Clock     Clock
	// ReapTimeout bounds one Reap; zero means 30s.
	ReapTimeout time.Duration
	// ReapContext, when set, replaces the timeout: it returns the context
	// that bounds reaping. Tests use it to drive the deadline.
	ReapContext func(context.Context) (context.Context, context.CancelFunc)
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
	abandoned, err := c.Adopter.Abandoned(ctx)
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
		live, liveErr := c.Adopter.LiveCheckouts(ctx)
		// The deadline may have arrived meanwhile: never adopt after it.
		if ctx.Err() != nil {
			break
		}
		// Someone else adopting it first is fine: they reap it.
		handle, record, err := c.Adopter.Adopt(ctx, listed.ID)
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
func (c *Reaper) reap(ctx context.Context, handle RunHandle, record run.Record, live []string, liveErr error) error {
	data := map[string]any{}
	var failures []string
	var effects run.Effects
	if record.Effects != nil {
		effects = *record.Effects
	}
	if process := effects.Process; process != nil {
		reaping, err := c.Processes.Reap(ctx, process.Ref)
		data["process"] = map[string]any{"ref": process.Ref, "outcome": string(reaping)}
		if err != nil {
			failures = append(failures, fmt.Sprintf("process %q: %v", process.Ref, err))
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
			err := c.Discarder.Discard(ctx, checkout.Repository, checkout.Dir)
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
	now := c.Clock.Now()
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
