package runner_test

import (
	"context"
	"errors"
	"slices"
	"strings"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/igor1309/ai-labs/warder/internal/runner"
)

// events is the returns of the runnables and of Run, in the order they
// happened. The runnables return in goroutines of their own, so it is
// locked.
type events struct {
	mu   sync.Mutex
	seen []string
}

func (e *events) add(event string) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.seen = append(e.seen, event)
}

func (e *events) all() []string {
	e.mu.Lock()
	defer e.mu.Unlock()
	return slices.Clone(e.seen)
}

// runnableStub is a runnable the test drives by hand. Its Run keeps its
// context and reports on started that it began, then blocks until the test
// answers it or its context ends. When its context ends it reports that on
// ended and blocks for the test's answer. It returns the answer, having
// recorded whether its context had ended by then, and never ends by
// itself. A second Run of one stub fails at once, and the end of the test
// fails a Run still held, so no runner outlives its test.
type runnableStub struct {
	name      string
	events    *events
	started   chan struct{}
	ended     chan struct{}
	answer    chan error
	testEnded <-chan struct{}

	runs          atomic.Int32
	ctx           context.Context // the first Run's
	endedAtReturn error           // its error when that Run returned
}

func newStub(t *testing.T, seen *events, name string) *runnableStub {
	return &runnableStub{
		name:      name,
		events:    seen,
		started:   make(chan struct{}),
		ended:     make(chan struct{}),
		answer:    make(chan error),
		testEnded: t.Context().Done(),
	}
}

func (s *runnableStub) Run(ctx context.Context) error {
	if s.runs.Add(1) > 1 {
		return errors.New(s.name + " was run again")
	}
	s.ctx = ctx
	err := s.hold(ctx)
	s.endedAtReturn = ctx.Err()
	s.events.add(s.name + " returned")
	return err
}

func (s *runnableStub) hold(ctx context.Context) error {
	errTestEnded := errors.New("the test ended")
	select {
	case s.started <- struct{}{}:
	case <-s.testEnded:
		return errTestEnded
	}
	select {
	case err := <-s.answer:
		return err
	case <-ctx.Done():
	case <-s.testEnded:
		return errTestEnded
	}
	select {
	case s.ended <- struct{}{}:
	case <-s.testEnded:
		return errTestEnded
	}
	select {
	case err := <-s.answer:
		return err
	case <-s.testEnded:
		return errTestEnded
	}
}

// release answers the runnable with err while its context is live, and
// fails the test when its context ended instead.
func (s *runnableStub) release(t *testing.T, err error) {
	t.Helper()
	select {
	case s.answer <- err:
	case <-s.ended:
		t.Fatalf("the context of %s ended before the test released it", s.name)
	}
}

// finish waits for the runnable's report that its context ended and
// answers it with err.
func (s *runnableStub) finish(err error) {
	<-s.ended
	s.answer <- err
}

func newRunner(t *testing.T, stubs ...*runnableStub) *runner.Runner {
	t.Helper()
	runnables := make([]runner.Runnable, len(stubs))
	for i, stub := range stubs {
		runnables[i] = stub
	}
	r, err := runner.New(runnables...)
	if err != nil {
		t.Fatal(err)
	}
	return r
}

// start runs the runner under ctx in a goroutine and returns the channel
// its result arrives on, having added Run's return to seen. The test does
// not end before Run returned.
func start(t *testing.T, ctx context.Context, r *runner.Runner, seen *events) <-chan error {
	t.Helper()
	result := make(chan error, 1)
	returned := make(chan struct{})
	go func() {
		defer close(returned)
		err := r.Run(ctx)
		seen.add("run returned")
		result <- err
	}()
	t.Cleanup(func() { <-returned })
	return result
}

// assertRunReturnedLast fails unless each of the runnables named returned,
// once, and Run only after all of them.
func assertRunReturnedLast(t *testing.T, seen *events, names ...string) {
	t.Helper()
	got := seen.all()
	last := len(got) - 1
	if last < 0 || got[last] != "run returned" {
		t.Fatalf("got the returns %q, want Run to return last", got)
	}
	var want []string
	for _, name := range names {
		want = append(want, name+" returned")
	}
	slices.Sort(want)
	if returned := slices.Sorted(slices.Values(got[:last])); !slices.Equal(returned, want) {
		t.Errorf("got the returns %q before Run's, want %q", returned, want)
	}
}

// runnableFunc is a runnable made of a function, so a nil one is a typed
// nil.
type runnableFunc func(ctx context.Context) error

func (f runnableFunc) Run(ctx context.Context) error { return f(ctx) }

// runnableMap, runnableSlice and runnableChan are runnables of the other
// kinds whose nil is a typed nil.
type runnableMap map[string]error

func (m runnableMap) Run(context.Context) error { return nil }

type runnableSlice []error

func (s runnableSlice) Run(context.Context) error { return nil }

type runnableChan chan error

func (c runnableChan) Run(context.Context) error { return nil }

// assertNotConstructed fails unless New failed, with an error that says
// what is wrong and no runner.
func assertNotConstructed(t *testing.T, r *runner.Runner, err error, wrong string) {
	t.Helper()
	if err == nil {
		t.Fatal("New returned no error")
	}
	if !strings.Contains(err.Error(), wrong) {
		t.Errorf("got the error %q, want one that says %q", err, wrong)
	}
	if r != nil {
		t.Errorf("New returned a runner: %v", r)
	}
}

// No runnables, none given or an empty slice of them, fails at
// construction.
func TestNewRejectsNoRunnables(t *testing.T) {
	t.Parallel()
	for name, runnables := range map[string][]runner.Runnable{
		"none":           nil,
		"an empty slice": {},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			r, err := runner.New(runnables...)

			assertNotConstructed(t, r, err, "no runnables")
		})
	}
}

// A missing runnable among the given ones, nil or a typed nil carried by
// Runnable, fails at construction, with an error that says which it is.
func TestNewRejectsAMissingRunnable(t *testing.T) {
	t.Parallel()
	for name, missing := range map[string]runner.Runnable{
		"nil":               nil,
		"nil pointer":       (*runnableStub)(nil),
		"nil runnable func": runnableFunc(nil),
		"nil map":           runnableMap(nil),
		"nil slice":         runnableSlice(nil),
		"nil chan":          runnableChan(nil),
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			r, err := runner.New(&runnableStub{}, missing, &runnableStub{})

			assertNotConstructed(t, r, err, "no runnable at index 1")
		})
	}
}

// The runner runs the runnables it was constructed with: a slice changed
// after New does not change them.
func TestTheRunnerKeepsTheRunnablesItWasConstructedWith(t *testing.T) {
	t.Parallel()
	seen := &events{}
	a, b, late := newStub(t, seen, "a"), newStub(t, seen, "b"), newStub(t, seen, "late")
	given := []runner.Runnable{a, b}
	r, err := runner.New(given...)
	if err != nil {
		t.Fatal(err)
	}
	given[1] = late
	ctx, stop := context.WithCancel(t.Context())
	defer stop()

	result := start(t, ctx, r, seen)
	<-a.started
	select {
	case <-b.started:
	case <-late.started:
		t.Fatal("the runner ran a runnable put in the slice after New")
	}
	stop()
	a.finish(nil)
	b.finish(nil)
	err = <-result

	if err != nil {
		t.Errorf("Run returned the error %v, want none", err)
	}
	assertRunReturnedLast(t, seen, "a", "b")
}

// Run starts every runnable, each once and under a context derived from
// its own. None of the runnables returns before the test has seen all of
// them start, so none waited for another: they run concurrently.
func TestRunStartsEveryRunnableConcurrentlyOnceUnderItsContext(t *testing.T) {
	t.Parallel()
	seen := &events{}
	stubs := []*runnableStub{newStub(t, seen, "a"), newStub(t, seen, "b"), newStub(t, seen, "c")}
	r := newRunner(t, stubs...)
	type runKey struct{}
	ctx, stop := context.WithCancel(context.WithValue(t.Context(), runKey{}, "this run"))
	defer stop()

	result := start(t, ctx, r, seen)
	for _, stub := range slices.Backward(stubs) {
		<-stub.started
	}
	stop()
	for _, stub := range stubs {
		stub.finish(nil)
	}
	err := <-result

	if err != nil {
		t.Errorf("Run returned the error %v, want none", err)
	}
	for _, stub := range stubs {
		if runs := stub.runs.Load(); runs != 1 {
			t.Errorf("%s was run %d times, want once", stub.name, runs)
		}
		if under := stub.ctx.Value(runKey{}); under != "this run" {
			t.Errorf("%s ran under a context of %v, want one derived from Run's", stub.name, under)
		}
	}
	assertRunReturnedLast(t, seen, "a", "b", "c")
}

// When the caller's context ends, the context of every runnable ends. Run
// returns nil, and only after every runnable returned, however late.
func TestTheEndOfTheCallersContextEndsEveryRunnable(t *testing.T) {
	t.Parallel()
	seen := &events{}
	a, b, c := newStub(t, seen, "a"), newStub(t, seen, "b"), newStub(t, seen, "c")
	r := newRunner(t, a, b, c)
	ctx, stop := context.WithCancel(t.Context())
	defer stop()

	result := start(t, ctx, r, seen)
	<-a.started
	<-b.started
	<-c.started
	stop()
	<-a.ended
	<-b.ended
	<-c.ended
	c.answer <- nil
	a.answer <- nil
	b.answer <- nil
	err := <-result

	if err != nil {
		t.Errorf("Run returned the error %v, want none", err)
	}
	assertRunReturnedLast(t, seen, "a", "b", "c")
}

// The first runnable to return an error ends the context of the others
// while the caller's is live. Run waits for all of them and returns that
// error, wrapped. An error another runnable returns later does not replace
// it.
func TestTheFirstErrorEndsTheOthersAndIsTheOneReturned(t *testing.T) {
	t.Parallel()
	errFatal := errors.New("stdout closed")
	errLater := errors.New("stopped")
	seen := &events{}
	a, b, c := newStub(t, seen, "a"), newStub(t, seen, "b"), newStub(t, seen, "c")
	r := newRunner(t, a, b, c)
	ctx := t.Context()

	result := start(t, ctx, r, seen)
	<-a.started
	<-b.started
	<-c.started
	b.release(t, errFatal)
	<-a.ended
	<-c.ended
	a.answer <- errLater
	c.answer <- nil
	err := <-result

	if !errors.Is(err, errFatal) {
		t.Fatalf("Run returned the error %v, want one that wraps %v", err, errFatal)
	}
	if errors.Is(err, errLater) {
		t.Errorf("Run returned the error %v, which wraps the later %v", err, errLater)
	}
	if !strings.Contains(err.Error(), "runner: runnable 1") {
		t.Errorf("got the error %q, want one that says runner: runnable 1", err)
	}
	if ctx.Err() != nil {
		t.Fatalf("the caller's context ended: %v", ctx.Err())
	}
	assertRunReturnedLast(t, seen, "a", "b", "c")
}

// A runnable's error is returned, wrapped, after the caller's context
// ended too: the failure is one the monitor cannot recover from.
func TestAnErrorAfterTheCallersContextEndedIsReturned(t *testing.T) {
	t.Parallel()
	errFatal := errors.New("stdout closed")
	seen := &events{}
	a, b := newStub(t, seen, "a"), newStub(t, seen, "b")
	r := newRunner(t, a, b)
	ctx, stop := context.WithCancel(t.Context())
	defer stop()

	result := start(t, ctx, r, seen)
	<-a.started
	<-b.started
	stop()
	a.finish(errFatal)
	b.finish(nil)
	err := <-result

	if !errors.Is(err, errFatal) {
		t.Fatalf("Run returned the error %v, want one that wraps %v", err, errFatal)
	}
	if !strings.Contains(err.Error(), "runner: runnable 0") {
		t.Errorf("got the error %q, want one that says runner: runnable 0", err)
	}
	assertRunReturnedLast(t, seen, "a", "b")
}

// A runnable that returns nil while the context is live does not stop the
// others: each of them, released after it, returns with its context still
// live, and Run returns nil once all returned. The runner handles a return
// out of the test's sight, so the test sees a stop only when it reaches a
// runnable before the test releases it.
func TestARunnableThatReturnsNilDoesNotStopTheOthers(t *testing.T) {
	t.Parallel()
	seen := &events{}
	a, b, c := newStub(t, seen, "a"), newStub(t, seen, "b"), newStub(t, seen, "c")
	r := newRunner(t, a, b, c)
	ctx := t.Context()

	result := start(t, ctx, r, seen)
	<-a.started
	<-b.started
	<-c.started
	a.release(t, nil)
	b.release(t, nil)
	c.release(t, nil)
	err := <-result

	if err != nil {
		t.Errorf("Run returned the error %v, want none", err)
	}
	for _, stub := range []*runnableStub{b, c} {
		if stub.endedAtReturn != nil {
			t.Errorf("the context of %s had ended when it returned: %v", stub.name, stub.endedAtReturn)
		}
	}
	if ctx.Err() != nil {
		t.Fatalf("the caller's context ended: %v", ctx.Err())
	}
	assertRunReturnedLast(t, seen, "a", "b", "c")
}
