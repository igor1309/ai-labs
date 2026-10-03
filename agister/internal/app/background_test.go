package app_test

import (
	"context"
	"errors"
	"sync"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/contract"
)

// blockingReap is a reap the test controls: it announces itself on started
// and ends when release is closed.
type blockingReap struct {
	mu       sync.Mutex
	runs     int
	running  int
	peak     int
	ctxErrs  []error
	err      error // what each reap returns
	started  chan struct{}
	release  chan struct{}
	releaser sync.Once
}

func newBlockingReap() *blockingReap {
	return &blockingReap{started: make(chan struct{}, 8), release: make(chan struct{})}
}

func (b *blockingReap) Reap(ctx context.Context) error {
	b.mu.Lock()
	b.runs++
	b.running++
	b.peak = max(b.peak, b.running)
	b.mu.Unlock()
	b.started <- struct{}{}
	<-b.release
	b.mu.Lock()
	b.running--
	b.ctxErrs = append(b.ctxErrs, ctx.Err())
	b.mu.Unlock()
	return b.err
}

func (b *blockingReap) let() { b.releaser.Do(func() { close(b.release) }) }

// submitter is a client whose only working method is Submit.
type submitter struct {
	contract.Client
	submit func(context.Context, contract.CallRequest) (string, error)
}

func (s submitter) Submit(ctx context.Context, request contract.CallRequest) (string, error) {
	return s.submit(ctx, request)
}

func decorated(background *app.BackgroundReaper, submit func(context.Context, contract.CallRequest) (string, error)) app.ReapOnSubmit {
	return app.ReapOnSubmit{Client: submitter{submit: submit}, Background: background}
}

func ok(context.Context, contract.CallRequest) (string, error) { return "run-1", nil }

func awaitStart(t *testing.T, b *blockingReap) {
	t.Helper()
	<-b.started
}

// A reap that is still going never holds up the call: the call completes
// while the reap waits on a channel only the test releases.
func TestABlockedReapDoesNotDelayTheCall(t *testing.T) {
	t.Parallel()
	h := newHarness()
	reap := newBlockingReap()
	t.Cleanup(reap.let)
	background := &app.BackgroundReaper{Reaper: reap}
	client := decorated(background, h.calls.Submit)

	submitted := make(chan error, 1)
	go func() {
		_, err := client.Submit(context.Background(), contract.CallRequest{Process: "p", Cwd: "/repo"})
		submitted <- err
	}()
	// Submit returns while the reap is still blocked.
	if err := <-submitted; err != nil {
		t.Fatal(err)
	}
	awaitStart(t, reap)
	// The call itself runs to its end while the reap is still blocked.
	if record := h.recorder.wait(t); record.Result == nil || record.Result.Status != "completed" {
		t.Fatalf("call = %+v", record.Result)
	}
	reap.mu.Lock()
	still := reap.running
	reap.mu.Unlock()
	if still != 1 {
		t.Fatalf("running reaps = %d, want the blocked one", still)
	}
	reap.let()
	background.Wait()
}

func TestSubmittingStartsAReap(t *testing.T) {
	t.Parallel()
	reap := newBlockingReap()
	reap.let()
	background := &app.BackgroundReaper{Reaper: reap}
	if id, err := decorated(background, ok).Submit(context.Background(), contract.CallRequest{}); err != nil || id != "run-1" {
		t.Fatalf("submit = %q, %v", id, err)
	}
	background.Wait()
	if reap.runs != 1 {
		t.Fatalf("reaps = %d", reap.runs)
	}
}

func TestARefusedSubmitStartsNoReap(t *testing.T) {
	t.Parallel()
	reap := newBlockingReap()
	reap.let()
	background := &app.BackgroundReaper{Reaper: reap}
	refuse := func(context.Context, contract.CallRequest) (string, error) { return "", errors.New("no") }
	if _, err := decorated(background, refuse).Submit(context.Background(), contract.CallRequest{}); err == nil {
		t.Fatal("submit did not fail")
	}
	background.Wait()
	if reap.runs != 0 {
		t.Fatalf("reaps = %d", reap.runs)
	}
}

// A Submit that arrives while a reap runs starts none: at most one reap
// runs at a time, and one that ended lets the next Submit start another.
func TestReapsNeverRunConcurrently(t *testing.T) {
	t.Parallel()
	reap := newBlockingReap()
	t.Cleanup(reap.let)
	background := &app.BackgroundReaper{Reaper: reap}
	client := decorated(background, ok)

	if _, err := client.Submit(context.Background(), contract.CallRequest{}); err != nil {
		t.Fatal(err)
	}
	awaitStart(t, reap)
	if _, err := client.Submit(context.Background(), contract.CallRequest{}); err != nil {
		t.Fatal(err)
	}
	reap.let()
	background.Wait()
	if reap.runs != 1 || reap.peak != 1 {
		t.Fatalf("reaps = %d, peak concurrency = %d", reap.runs, reap.peak)
	}

	// Ended: the next Submit reaps again.
	second := newBlockingReap()
	second.let()
	background.Reaper = second
	if _, err := client.Submit(context.Background(), contract.CallRequest{}); err != nil {
		t.Fatal(err)
	}
	background.Wait()
	if second.runs != 1 {
		t.Fatalf("reaps after the first ended = %d", second.runs)
	}
}

// The reap is detached from the request: a request cancelled before the
// reap ends does not cancel it.
func TestReapOutlivesTheRequestThatStartedIt(t *testing.T) {
	t.Parallel()
	reap := newBlockingReap()
	t.Cleanup(reap.let)
	background := &app.BackgroundReaper{Reaper: reap}
	ctx, cancel := context.WithCancel(context.Background())
	if _, err := decorated(background, ok).Submit(ctx, contract.CallRequest{}); err != nil {
		t.Fatal(err)
	}
	awaitStart(t, reap)
	cancel()
	reap.let()
	background.Wait()
	if len(reap.ctxErrs) != 1 || reap.ctxErrs[0] != nil {
		t.Fatalf("reap context errors = %v", reap.ctxErrs)
	}
}

// Nobody waits for a reap, so the report is where its failure shows: each
// failed reap is reported with its error, and one that succeeds is not.
func TestAFailedReapIsReported(t *testing.T) {
	t.Parallel()
	reap := newBlockingReap()
	reap.let()
	failure := errors.New("listing abandoned runs: disk gone")
	reap.err = failure
	var reported []error
	background := &app.BackgroundReaper{Reaper: reap, Report: func(err error) { reported = append(reported, err) }}
	background.Start(context.Background())
	background.Wait()
	if len(reported) != 1 || reported[0] != failure {
		t.Fatalf("reported = %v", reported)
	}

	reap.err = nil
	background.Start(context.Background())
	background.Wait()
	if reap.runs != 2 || len(reported) != 1 {
		t.Fatalf("reaps = %d, reported = %v", reap.runs, reported)
	}
}
