package app

import (
	"context"
	"sync"

	"github.com/igor1309/ai-labs/agister/internal/contract"
)

// RunReaper is what BackgroundReaper starts; Reaper is one. A reap
// returns what failed in recovery itself, which no run record says.
type RunReaper interface {
	Reap(ctx context.Context) error
}

// BackgroundReaper runs a reap beside the calls, never inside one: it does
// not delay the caller, is detached from the caller's cancellation (the
// reap's own deadline still bounds it), and runs at most one reap at a
// time in this process. One is shared by every client built.
type BackgroundReaper struct {
	Reaper RunReaper
	// Report, when set, is given the error of each reap that fails. Nobody
	// waits for a reap, so this is the only place its failure shows.
	Report func(error)

	mu      sync.Mutex
	running bool
	pending sync.WaitGroup
}

// Start begins a reap and returns at once. While one is running, it starts
// nothing: a run abandoned after that reap's scan waits for a later Submit
// (see LAB-69).
func (b *BackgroundReaper) Start(ctx context.Context) {
	b.mu.Lock()
	if b.running {
		b.mu.Unlock()
		return
	}
	b.running = true
	b.pending.Add(1)
	b.mu.Unlock()
	ctx = context.WithoutCancel(ctx)
	go func() {
		defer b.pending.Done()
		defer func() {
			b.mu.Lock()
			b.running = false
			b.mu.Unlock()
		}()
		if err := b.Reaper.Reap(ctx); err != nil && b.Report != nil {
			b.Report(err)
		}
	}()
}

// Wait returns when every reap started so far has ended.
func (b *BackgroundReaper) Wait() { b.pending.Wait() }

// ReapOnSubmit is a client that starts a reap of abandoned runs whenever a
// call is submitted. The new run is recorded, and so owned, by then: it
// reads as live and is never reaped.
type ReapOnSubmit struct {
	contract.Client
	Background *BackgroundReaper
}

func (r ReapOnSubmit) Submit(ctx context.Context, request contract.CallRequest) (string, error) {
	id, err := r.Client.Submit(ctx, request)
	if err == nil {
		r.Background.Start(ctx)
	}
	return id, err
}
