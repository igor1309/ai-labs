package app

import (
	"context"
	"fmt"

	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

// reapAbandoned undoes the effects of runs whose process was killed before
// they finished, then finishes them. It runs when a call starts, never
// blocks or fails that call, and leaves runs some process still owns alone.
func (c *Calls) reapAbandoned(ctx context.Context) {
	if c.Adopter == nil || c.Processes == nil {
		return
	}
	// A cancelled call still leaves what it found in order.
	ctx = context.WithoutCancel(ctx)
	abandoned, err := c.Adopter.Abandoned(ctx)
	if err != nil {
		return
	}
	for _, listed := range abandoned {
		if listed.Effects == nil {
			continue
		}
		// Someone else adopting it first is fine: they reap it.
		handle, record, err := c.Adopter.Adopt(ctx, listed.ID)
		if err != nil {
			continue
		}
		c.reap(ctx, handle, record)
	}
}

// reap ends one adopted run's effects and finishes it as lost. A step that
// fails is recorded and does not stop the rest, so a run is reaped once.
func (c *Calls) reap(ctx context.Context, handle RunHandle, record run.Record) {
	data := map[string]any{}
	var failures []string
	var effects run.Effects
	if record.Effects != nil {
		effects = *record.Effects
	}
	if process := effects.Process; process != nil {
		reaping, err := c.Processes.Reap(process.Group, process.Token)
		data["process"] = map[string]any{"group": process.Group, "outcome": string(reaping)}
		if err != nil {
			failures = append(failures, fmt.Sprintf("process group %d: %v", process.Group, err))
		}
	}
	if checkout := effects.Checkout; checkout != nil {
		err := c.Workspaces.Discard(ctx, checkout.Repository, checkout.Dir)
		data["checkout"] = map[string]any{"dir": checkout.Dir, "removed": err == nil}
		if err != nil {
			failures = append(failures, fmt.Sprintf("checkout %s: %v", checkout.Dir, err))
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
