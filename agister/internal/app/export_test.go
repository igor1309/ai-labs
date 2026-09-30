package app

import (
	"context"
	"sync"
)

// OnCaptured sets the hook that runs between a cancel taking a run's
// callback and calling it. Set it before any run is cancelled.
func (h *Hosted) OnCaptured(hook func(id string)) { h.captured = hook }

// SnapshotCounter is a CallResolver that is not a Resolver: it resolves
// every call to a refusal, and counts the snapshots it was asked for and the
// resolutions made from them.
type SnapshotCounter struct {
	mu        sync.Mutex
	Reason    string
	Snapshots int
	Resolved  []string // process names
}

func (c *SnapshotCounter) Snapshot(context.Context) CallResolution {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.Snapshots++
	return counted{c}
}

type counted struct{ counter *SnapshotCounter }

func (r counted) Resolve(_ context.Context, process, _ string, _ overrides) (*resolution, error) {
	r.counter.mu.Lock()
	defer r.counter.mu.Unlock()
	r.counter.Resolved = append(r.counter.Resolved, process)
	return &resolution{}, refuse("%s", r.counter.Reason)
}

// Workflow finds none: every name is a process's.
func (r counted) Workflow(context.Context, string) (*workflowResolution, bool, error) {
	return nil, false, nil
}

// Count returns the snapshots taken and the processes resolved.
func (c *SnapshotCounter) Count() (int, []string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.Snapshots, append([]string(nil), c.Resolved...)
}
