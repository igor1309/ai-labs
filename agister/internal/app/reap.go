package app

import (
	"context"
	"fmt"
	"slices"
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

// Reap leaves runs some process still owns alone and never fails. Runs
// not reached by the reap deadline are not adopted and wait for the next
// reap, and the run being reaped when time runs out is finished with the
// steps that failed recorded. Only the git steps honour the deadline:
// os.RemoveAll in Discard does not, so a reap can run past it.
func (c *Reaper) Reap(ctx context.Context) {
	ctx, cancel := c.reapContext(ctx)
	defer cancel()
	abandoned, err := c.Adopter.Abandoned(ctx)
	if err != nil {
		return
	}
	for _, listed := range abandoned {
		if listed.Effects == nil {
			continue
		}
		if ctx.Err() != nil {
			return
		}
		// Read before adopting: the run adopted next is owned by this
		// process and would read as live.
		live, liveErr := c.Adopter.LiveCheckouts(ctx)
		// The deadline may have arrived meanwhile: never adopt after it.
		if ctx.Err() != nil {
			return
		}
		// Someone else adopting it first is fine: they reap it.
		handle, record, err := c.Adopter.Adopt(ctx, listed.ID)
		if err != nil {
			continue
		}
		c.reap(ctx, handle, record, live, liveErr)
	}
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
// so is one whose users could not be listed.
func (c *Reaper) reap(ctx context.Context, handle RunHandle, record run.Record, live []string, liveErr error) {
	data := map[string]any{}
	var failures []string
	var effects run.Effects
	if record.Effects != nil {
		effects = *record.Effects
	}
	if process := effects.Process; process != nil {
		reaping, err := c.Processes.Reap(process.Ref)
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
	now := c.Clock.Now()
	_ = handle.Append(run.Event{At: now, Source: run.SourceAgister, Kind: "EFFECTS_REAPED", Data: data})
	result := run.AbandonedResult(record.CreatedAt)
	result.Timing.FinishedAt = now
	result.Timing.WallMS = now.Sub(record.CreatedAt).Milliseconds()
	record.FinishedAt = &now
	record.Result = &result
	_ = handle.Finish(record)
}
