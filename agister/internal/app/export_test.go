package app

import (
	"context"

	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

// OnCaptured sets the hook that runs between a cancel taking a run's
// callback and calling it. Set it before any run is cancelled.
func (h *Hosted) OnCaptured(hook func(id string)) { h.captured = hook }

// OnWaiting sets the hook that runs when the reaper finds its turn taken,
// before it waits for it. Set it before the reaper is used.
func (c *Reaper) OnWaiting(hook func()) { c.waiting = hook }

// TurnWatch is the watcher of one turn.
type TurnWatch = turnWatch

// WatchTurn starts the watcher of a turn on its own: over the sink, timer
// and clock given, ending the turn by cancel.
func WatchTurn(inner turnSink, limits CallStale, timer CallTimer, clock staleClock, cancel context.CancelFunc) *TurnWatch {
	return watchTurn(inner, limits, timer, clock, cancel)
}

// End is the watcher's end: the turn returned.
func (w *turnWatch) End() *run.Stale { return w.end() }

// UnifiedDiff is the unified diff an install or a restore plan shows.
var UnifiedDiff = unifiedDiff
