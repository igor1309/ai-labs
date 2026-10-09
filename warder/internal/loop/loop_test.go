package loop_test

import (
	"context"
	"errors"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/warder/internal/loop"
)

// calls is the calls and returns of the loop's collaborators, in the order
// the loop made them.
type calls struct{ made []string }

func (c *calls) add(call string) { c.made = append(c.made, call) }

// gate holds a collaborator's call until the test answers it: the call
// reports on started that it began, then blocks for the test's answer. It
// never ends by itself. The end of the test fails a call still held, so no
// loop outlives its test.
type gate struct {
	started   chan struct{}
	answer    chan error
	testEnded <-chan struct{}
}

func newGate(t *testing.T) gate {
	return gate{started: make(chan struct{}), answer: make(chan error), testEnded: t.Context().Done()}
}

func (g gate) hold() error {
	select {
	case g.started <- struct{}{}:
	case <-g.testEnded:
		return errors.New("the test ended")
	}
	select {
	case err := <-g.answer:
		return err
	case <-g.testEnded:
		return errors.New("the test ended")
	}
}

// release waits for the next call to begin and answers it with err.
func (g gate) release(err error) {
	<-g.started
	g.answer <- err
}

// attemptSpy is an attempt the test answers by hand: every Run records its
// start and its context, is held at the gate, and records its return.
type attemptSpy struct {
	gate
	calls    *calls
	contexts []context.Context
}

func newAttemptSpy(t *testing.T, made *calls) *attemptSpy {
	return &attemptSpy{gate: newGate(t), calls: made}
}

func (s *attemptSpy) Run(ctx context.Context) error {
	s.calls.add("attempt")
	s.contexts = append(s.contexts, ctx)
	err := s.hold()
	s.calls.add("attempt returned")
	return err
}

// waitStub is a wait the test releases by hand: every Wait records its
// start with the interval asked for, and its context, is held at the gate,
// and records its return. It watches neither time nor its context.
type waitStub struct {
	gate
	calls    *calls
	contexts []context.Context
}

func newWaitStub(t *testing.T, made *calls) *waitStub {
	return &waitStub{gate: newGate(t), calls: made}
}

func (s *waitStub) Wait(ctx context.Context, interval time.Duration) error {
	s.calls.add("wait " + interval.String())
	s.contexts = append(s.contexts, ctx)
	err := s.hold()
	s.calls.add("wait returned")
	return err
}

func newLoop(t *testing.T, attempt loop.Attempt, wait loop.Wait, interval time.Duration) *loop.Loop {
	t.Helper()
	l, err := loop.New(attempt, wait, interval)
	if err != nil {
		t.Fatal(err)
	}
	return l
}

// start runs the loop under ctx in a goroutine and returns the channel its
// result arrives on. The test does not end before Run returned.
func start(t *testing.T, ctx context.Context, l *loop.Loop) <-chan error {
	t.Helper()
	result := make(chan error, 1)
	returned := make(chan struct{})
	go func() {
		defer close(returned)
		result <- l.Run(ctx)
	}()
	t.Cleanup(func() { <-returned })
	return result
}

// assertCalls fails unless the collaborators' calls are exactly want.
func assertCalls(t *testing.T, made *calls, want ...string) {
	t.Helper()
	if !slices.Equal(made.made, want) {
		t.Errorf("got the calls %q, want %q", made.made, want)
	}
}

// attemptFunc is an attempt made of a function, so a nil one is a typed
// nil.
type attemptFunc func(ctx context.Context) error

func (f attemptFunc) Run(ctx context.Context) error { return f(ctx) }

// attemptMap, attemptSlice and attemptChan are attempts of the other kinds
// whose nil is a typed nil.
type attemptMap map[string]error

func (m attemptMap) Run(context.Context) error { return nil }

type attemptSlice []error

func (s attemptSlice) Run(context.Context) error { return nil }

type attemptChan chan error

func (c attemptChan) Run(context.Context) error { return nil }

// waitFunc is a wait made of a function, so a nil one is a typed nil.
type waitFunc func(ctx context.Context, interval time.Duration) error

func (f waitFunc) Wait(ctx context.Context, interval time.Duration) error { return f(ctx, interval) }

// waitMap, waitSlice and waitChan are waits of the other kinds whose nil
// is a typed nil.
type waitMap map[string]error

func (m waitMap) Wait(context.Context, time.Duration) error { return nil }

type waitSlice []error

func (s waitSlice) Wait(context.Context, time.Duration) error { return nil }

type waitChan chan error

func (c waitChan) Wait(context.Context, time.Duration) error { return nil }

// assertNotConstructed fails unless New failed, with an error that says
// what is wrong and no loop.
func assertNotConstructed(t *testing.T, l *loop.Loop, err error, wrong string) {
	t.Helper()
	if err == nil {
		t.Fatal("New returned no error")
	}
	if !strings.Contains(err.Error(), wrong) {
		t.Errorf("got the error %q, want one that says %q", err, wrong)
	}
	if l != nil {
		t.Errorf("New returned a loop: %v", l)
	}
}

// A missing attempt, nil or a typed nil carried by Attempt, fails at
// construction.
func TestNewRejectsAMissingAttempt(t *testing.T) {
	t.Parallel()
	for name, attempt := range map[string]loop.Attempt{
		"nil":              nil,
		"nil pointer":      (*attemptSpy)(nil),
		"nil attempt func": attemptFunc(nil),
		"nil map":          attemptMap(nil),
		"nil slice":        attemptSlice(nil),
		"nil chan":         attemptChan(nil),
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			l, err := loop.New(attempt, &waitStub{}, 7*time.Second)

			assertNotConstructed(t, l, err, "no attempt")
		})
	}
}

// A missing wait, nil or a typed nil carried by Wait, fails at
// construction.
func TestNewRejectsAMissingWait(t *testing.T) {
	t.Parallel()
	for name, wait := range map[string]loop.Wait{
		"nil":           nil,
		"nil pointer":   (*waitStub)(nil),
		"nil wait func": waitFunc(nil),
		"nil map":       waitMap(nil),
		"nil slice":     waitSlice(nil),
		"nil chan":      waitChan(nil),
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			l, err := loop.New(&attemptSpy{}, wait, 7*time.Second)

			assertNotConstructed(t, l, err, "no wait")
		})
	}
}

// An interval that is not positive, zero or negative, fails at
// construction.
func TestNewRejectsAnIntervalThatIsNotPositive(t *testing.T) {
	t.Parallel()
	for name, interval := range map[string]time.Duration{
		"zero":     0,
		"negative": -7 * time.Second,
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			l, err := loop.New(&attemptSpy{}, &waitStub{}, interval)

			assertNotConstructed(t, l, err, "not positive")
		})
	}
}

// The first attempt starts at once, with no wait before it. After each
// attempt that returns nil the loop asks the wait for its own interval,
// only once the attempt returned, and attempts again only once the wait
// returned. The test ends the context during the third attempt.
func TestTheLoopAttemptsAtOnceAndWaitsItsIntervalAfterEachAttempt(t *testing.T) {
	t.Parallel()
	for name, interval := range map[string]time.Duration{
		"seven seconds":    7 * time.Second,
		"a quarter second": 250 * time.Millisecond,
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			made := &calls{}
			attempt := newAttemptSpy(t, made)
			wait := newWaitStub(t, made)
			l := newLoop(t, attempt, wait, interval)
			ctx, stop := context.WithCancel(t.Context())
			defer stop()

			result := start(t, ctx, l)
			attempt.release(nil)
			wait.release(nil)
			attempt.release(nil)
			wait.release(nil)
			<-attempt.started
			stop()
			attempt.answer <- nil
			err := <-result

			if err != nil {
				t.Errorf("Run returned the error %v, want none", err)
			}
			asked := "wait " + interval.String()
			assertCalls(t, made,
				"attempt", "attempt returned", asked, "wait returned",
				"attempt", "attempt returned", asked, "wait returned",
				"attempt", "attempt returned",
			)
		})
	}
}

// Every attempt and every wait runs under the context Run was given, so
// its end reaches the step in progress.
func TestEveryAttemptAndWaitRunsUnderTheLoopsContext(t *testing.T) {
	t.Parallel()
	made := &calls{}
	attempt := newAttemptSpy(t, made)
	wait := newWaitStub(t, made)
	l := newLoop(t, attempt, wait, 7*time.Second)
	type loopKey struct{}
	ctx, stop := context.WithCancel(context.WithValue(t.Context(), loopKey{}, "this loop"))
	defer stop()

	result := start(t, ctx, l)
	attempt.release(nil)
	wait.release(nil)
	attempt.release(nil)
	<-wait.started
	stop()
	wait.answer <- ctx.Err()
	if err := <-result; err != nil {
		t.Fatalf("Run returned the error %v, want none", err)
	}

	if len(attempt.contexts) != 2 || attempt.contexts[0] != ctx || attempt.contexts[1] != ctx {
		t.Errorf("attempted under the contexts %v, want two attempts under the loop's %v", attempt.contexts, ctx)
	}
	if len(wait.contexts) != 2 || wait.contexts[0] != ctx || wait.contexts[1] != ctx {
		t.Errorf("waited under the contexts %v, want two waits under the loop's %v", wait.contexts, ctx)
	}
}

// An attempt's error ends the loop: Run returns it, wrapped, and neither
// waits nor attempts again. It does so after the context ended too: the
// failure is one the monitor cannot recover from.
func TestAnAttemptsErrorEndsTheLoopWithoutAnotherWaitOrAttempt(t *testing.T) {
	t.Parallel()
	for name, ends := range map[string]func(stop context.CancelFunc){
		"while the context is live": func(context.CancelFunc) {},
		"after the context ended":   func(stop context.CancelFunc) { stop() },
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			errFatal := errors.New("stdout closed")
			made := &calls{}
			attempt := newAttemptSpy(t, made)
			wait := newWaitStub(t, made)
			l := newLoop(t, attempt, wait, 7*time.Second)
			ctx, stop := context.WithCancel(t.Context())
			defer stop()

			result := start(t, ctx, l)
			attempt.release(nil)
			wait.release(nil)
			<-attempt.started
			ends(stop)
			attempt.answer <- errFatal
			err := <-result

			if !errors.Is(err, errFatal) {
				t.Fatalf("Run returned the error %v, want one that wraps %v", err, errFatal)
			}
			if !strings.Contains(err.Error(), "loop: attempt") {
				t.Errorf("got the error %q, want one that says loop: attempt", err)
			}
			assertCalls(t, made,
				"attempt", "attempt returned", "wait 7s", "wait returned",
				"attempt", "attempt returned",
			)
		})
	}
}

// A context that ends during a wait ends the loop: the wait returns an
// error, Run returns nil and attempts nothing more. Any error of the wait
// counts then, the context's or one of its own.
func TestRunReturnsNilWhenItsContextEndsDuringAWait(t *testing.T) {
	t.Parallel()
	for name, interrupted := range map[string]func(ctx context.Context) error{
		"the context's error": func(ctx context.Context) error { return ctx.Err() },
		"an error of its own": func(context.Context) error { return errors.New("timer stopped") },
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			made := &calls{}
			attempt := newAttemptSpy(t, made)
			wait := newWaitStub(t, made)
			l := newLoop(t, attempt, wait, 7*time.Second)
			ctx, stop := context.WithCancel(t.Context())
			defer stop()

			result := start(t, ctx, l)
			attempt.release(nil)
			<-wait.started
			stop()
			answer := interrupted(ctx)
			if answer == nil {
				t.Fatal("the wait has no error to return: the test ended nothing")
			}
			wait.answer <- answer
			err := <-result

			if err != nil {
				t.Errorf("Run returned the error %v, want none", err)
			}
			assertCalls(t, made, "attempt", "attempt returned", "wait 7s", "wait returned")
		})
	}
}

// A context that ends during an attempt that then returns nil ends the
// loop between steps: no wait is started and Run returns nil.
func TestNoWaitIsStartedOnceTheContextEndedDuringAnAttempt(t *testing.T) {
	t.Parallel()
	made := &calls{}
	attempt := newAttemptSpy(t, made)
	wait := newWaitStub(t, made)
	l := newLoop(t, attempt, wait, 7*time.Second)
	ctx, stop := context.WithCancel(t.Context())
	defer stop()

	result := start(t, ctx, l)
	<-attempt.started
	stop()
	attempt.answer <- nil
	err := <-result

	if err != nil {
		t.Errorf("Run returned the error %v, want none", err)
	}
	assertCalls(t, made, "attempt", "attempt returned")
}

// A context that ends as a wait elapses, so that the wait still returns
// nil, ends the loop between steps: no attempt is started and Run returns
// nil.
func TestNoAttemptIsStartedOnceTheContextEndedAsAWaitElapsed(t *testing.T) {
	t.Parallel()
	made := &calls{}
	attempt := newAttemptSpy(t, made)
	wait := newWaitStub(t, made)
	l := newLoop(t, attempt, wait, 7*time.Second)
	ctx, stop := context.WithCancel(t.Context())
	defer stop()

	result := start(t, ctx, l)
	attempt.release(nil)
	<-wait.started
	stop()
	wait.answer <- nil
	err := <-result

	if err != nil {
		t.Errorf("Run returned the error %v, want none", err)
	}
	assertCalls(t, made, "attempt", "attempt returned", "wait 7s", "wait returned")
}

// Run under a context that has already ended starts nothing, not even the
// first attempt, and returns nil.
func TestRunUnderAnEndedContextStartsNothing(t *testing.T) {
	t.Parallel()
	made := &calls{}
	attempt := newAttemptSpy(t, made)
	wait := newWaitStub(t, made)
	l := newLoop(t, attempt, wait, 7*time.Second)
	ctx, stop := context.WithCancel(t.Context())
	stop()

	err := <-start(t, ctx, l)

	if err != nil {
		t.Errorf("Run returned the error %v, want none", err)
	}
	assertCalls(t, made)
}

// A wait that fails while the context is still live ends the loop: Run
// returns its error, wrapped, and attempts nothing more.
func TestAWaitThatFailsWhileTheContextIsLiveEndsTheLoop(t *testing.T) {
	t.Parallel()
	errTimer := errors.New("timer stopped")
	made := &calls{}
	attempt := newAttemptSpy(t, made)
	wait := newWaitStub(t, made)
	l := newLoop(t, attempt, wait, 7*time.Second)
	ctx := t.Context()

	result := start(t, ctx, l)
	attempt.release(nil)
	wait.release(errTimer)
	err := <-result

	if !errors.Is(err, errTimer) {
		t.Fatalf("Run returned the error %v, want one that wraps %v", err, errTimer)
	}
	if !strings.Contains(err.Error(), "loop: wait") {
		t.Errorf("got the error %q, want one that says loop: wait", err)
	}
	if ctx.Err() != nil {
		t.Fatalf("the context ended: %v", ctx.Err())
	}
	assertCalls(t, made, "attempt", "attempt returned", "wait 7s", "wait returned")
}
