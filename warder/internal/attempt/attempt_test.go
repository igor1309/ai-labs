package attempt_test

import (
	"context"
	"errors"
	"slices"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/warder/internal/attempt"
)

// reading is the observation of these tests. The attempt is generic over
// it and never looks inside: its field only tells one reading from
// another.
type reading struct{ id string }

// capturerStub records the context of every Capture and answers each with
// what the test set: an observation, an error, or both. Before it answers
// it runs returning, when the test set one, so a test can end a context
// while the capture is returning. It fills in nothing else.
type capturerStub struct {
	observation reading
	err         error
	returning   func()
	calls       []context.Context
}

func (s *capturerStub) Capture(ctx context.Context) (reading, error) {
	s.calls = append(s.calls, ctx)
	if s.returning != nil {
		s.returning()
	}
	return s.observation, s.err
}

// blockedCapturer is a capture that never ends by itself: it closes
// started, blocks until its context ends, and fails with the error the
// test set, which is not the context's.
type blockedCapturer struct {
	started chan struct{}
	err     error
}

func (c *blockedCapturer) Capture(ctx context.Context) (reading, error) {
	close(c.started)
	<-ctx.Done()
	return reading{}, c.err
}

// deadlineStub is a deadline whose limit the test ends by hand: the limit
// of a context ends when the test calls end, when that context ends, or
// when it is released, and never by itself. It records the context of
// every Limit and counts the releases.
type deadlineStub struct {
	calls    []context.Context
	limited  context.Context    // the last Limit's
	end      context.CancelFunc // ends it
	releases int
}

func (s *deadlineStub) Limit(ctx context.Context) (context.Context, func()) {
	s.calls = append(s.calls, ctx)
	limited, end := context.WithCancel(ctx)
	s.limited, s.end = limited, end
	return limited, func() {
		s.releases++
		end()
	}
}

// publisherSpy records every observation it is asked to publish and
// answers each with the error the test set.
type publisherSpy struct {
	err       error
	published []reading
}

func (s *publisherSpy) Publish(observation reading) error {
	s.published = append(s.published, observation)
	return s.err
}

// reporterSpy records every diagnostic it is given.
type reporterSpy struct {
	diagnostics []error
}

func (s *reporterSpy) Report(diagnostic error) {
	s.diagnostics = append(s.diagnostics, diagnostic)
}

func newAttempt(t *testing.T, capturer attempt.Capturer[reading], deadline attempt.Deadline, publisher attempt.Publisher[reading], reporter attempt.Reporter) *attempt.Attempt[reading] {
	t.Helper()
	a, err := attempt.New(capturer, deadline, publisher, reporter)
	if err != nil {
		t.Fatal(err)
	}
	return a
}

// start runs one attempt under ctx in a goroutine and returns the channel
// its result arrives on.
func start(ctx context.Context, a *attempt.Attempt[reading]) <-chan error {
	result := make(chan error, 1)
	go func() { result <- a.Run(ctx) }()
	return result
}

// assertOneLimitReleasedOnce fails unless the deadline was asked for one
// limit and released once.
func assertOneLimitReleasedOnce(t *testing.T, deadline *deadlineStub) {
	t.Helper()
	if len(deadline.calls) != 1 {
		t.Errorf("the deadline was asked for %d limits, want 1", len(deadline.calls))
	}
	if deadline.releases != 1 {
		t.Errorf("the deadline was released %d times, want 1", deadline.releases)
	}
}

// assertNothingPublished fails unless the publisher was asked for nothing.
func assertNothingPublished(t *testing.T, publisher *publisherSpy) {
	t.Helper()
	if len(publisher.published) != 0 {
		t.Errorf("got the published observations %v, want none", publisher.published)
	}
}

// assertNothingReported fails unless the reporter was given nothing.
func assertNothingReported(t *testing.T, reporter *reporterSpy) {
	t.Helper()
	if len(reporter.diagnostics) != 0 {
		t.Errorf("got the diagnostics %v, want none", reporter.diagnostics)
	}
}

// captureFunc is a capturer made of a function, so a nil one is a typed
// nil.
type captureFunc func(ctx context.Context) (reading, error)

func (f captureFunc) Capture(ctx context.Context) (reading, error) { return f(ctx) }

// captureMap, captureSlice and captureChan are capturers of the other
// kinds whose nil is a typed nil.
type captureMap map[string]reading

func (m captureMap) Capture(context.Context) (reading, error) { return reading{}, nil }

type captureSlice []reading

func (s captureSlice) Capture(context.Context) (reading, error) { return reading{}, nil }

type captureChan chan reading

func (c captureChan) Capture(context.Context) (reading, error) { return reading{}, nil }

// limitFunc is a deadline made of a function, so a nil one is a typed nil.
type limitFunc func(ctx context.Context) (context.Context, func())

func (f limitFunc) Limit(ctx context.Context) (context.Context, func()) { return f(ctx) }

// limitMap, limitSlice and limitChan are deadlines of the other kinds
// whose nil is a typed nil.
type limitMap map[string]context.Context

func (m limitMap) Limit(ctx context.Context) (context.Context, func()) { return ctx, func() {} }

type limitSlice []context.Context

func (s limitSlice) Limit(ctx context.Context) (context.Context, func()) { return ctx, func() {} }

type limitChan chan context.Context

func (c limitChan) Limit(ctx context.Context) (context.Context, func()) { return ctx, func() {} }

// publishFunc is a publisher made of a function, so a nil one is a typed
// nil.
type publishFunc func(observation reading) error

func (f publishFunc) Publish(observation reading) error { return f(observation) }

// publishMap, publishSlice and publishChan are publishers of the other
// kinds whose nil is a typed nil.
type publishMap map[string]reading

func (m publishMap) Publish(reading) error { return nil }

type publishSlice []reading

func (s publishSlice) Publish(reading) error { return nil }

type publishChan chan reading

func (c publishChan) Publish(reading) error { return nil }

// reportFunc is a reporter made of a function, so a nil one is a typed
// nil.
type reportFunc func(diagnostic error)

func (f reportFunc) Report(diagnostic error) { f(diagnostic) }

// reportMap, reportSlice and reportChan are reporters of the other kinds
// whose nil is a typed nil.
type reportMap map[string]error

func (m reportMap) Report(error) {}

type reportSlice []error

func (s reportSlice) Report(error) {}

type reportChan chan error

func (c reportChan) Report(error) {}

// assertNotConstructed fails unless New failed, with an error that names
// what is missing and no attempt.
func assertNotConstructed(t *testing.T, a *attempt.Attempt[reading], err error, missing string) {
	t.Helper()
	if err == nil {
		t.Fatal("New returned no error")
	}
	if !strings.Contains(err.Error(), missing) {
		t.Errorf("got the error %q, want one that says %q", err, missing)
	}
	if a != nil {
		t.Errorf("New returned an attempt: %v", a)
	}
}

// A missing capturer, nil or a typed nil carried by Capturer, fails at
// construction.
func TestNewRejectsAMissingCapturer(t *testing.T) {
	t.Parallel()
	for name, capturer := range map[string]attempt.Capturer[reading]{
		"nil":              nil,
		"nil pointer":      (*capturerStub)(nil),
		"nil capture func": captureFunc(nil),
		"nil map":          captureMap(nil),
		"nil slice":        captureSlice(nil),
		"nil chan":         captureChan(nil),
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			a, err := attempt.New(capturer, &deadlineStub{}, &publisherSpy{}, &reporterSpy{})

			assertNotConstructed(t, a, err, "no capturer")
		})
	}
}

// A missing deadline, nil or a typed nil carried by Deadline, fails at
// construction.
func TestNewRejectsAMissingDeadline(t *testing.T) {
	t.Parallel()
	for name, deadline := range map[string]attempt.Deadline{
		"nil":            nil,
		"nil pointer":    (*deadlineStub)(nil),
		"nil limit func": limitFunc(nil),
		"nil map":        limitMap(nil),
		"nil slice":      limitSlice(nil),
		"nil chan":       limitChan(nil),
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			a, err := attempt.New(&capturerStub{}, deadline, &publisherSpy{}, &reporterSpy{})

			assertNotConstructed(t, a, err, "no deadline")
		})
	}
}

// A missing publisher, nil or a typed nil carried by Publisher, fails at
// construction.
func TestNewRejectsAMissingPublisher(t *testing.T) {
	t.Parallel()
	for name, publisher := range map[string]attempt.Publisher[reading]{
		"nil":              nil,
		"nil pointer":      (*publisherSpy)(nil),
		"nil publish func": publishFunc(nil),
		"nil map":          publishMap(nil),
		"nil slice":        publishSlice(nil),
		"nil chan":         publishChan(nil),
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			a, err := attempt.New(&capturerStub{}, &deadlineStub{}, publisher, &reporterSpy{})

			assertNotConstructed(t, a, err, "no publisher")
		})
	}
}

// A missing reporter, nil or a typed nil carried by Reporter, fails at
// construction.
func TestNewRejectsAMissingReporter(t *testing.T) {
	t.Parallel()
	for name, reporter := range map[string]attempt.Reporter{
		"nil":             nil,
		"nil pointer":     (*reporterSpy)(nil),
		"nil report func": reportFunc(nil),
		"nil map":         reportMap(nil),
		"nil slice":       reportSlice(nil),
		"nil chan":        reportChan(nil),
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			a, err := attempt.New(&capturerStub{}, &deadlineStub{}, &publisherSpy{}, reporter)

			assertNotConstructed(t, a, err, "no reporter")
		})
	}
}

// An attempt asks the deadline once, for the limit of its own context,
// and captures once, under that limit.
func TestRunCapturesOnceUnderTheDeadlinesLimitOfItsContext(t *testing.T) {
	t.Parallel()
	capturer := &capturerStub{observation: reading{id: "first"}}
	deadline := &deadlineStub{}
	a := newAttempt(t, capturer, deadline, &publisherSpy{}, &reporterSpy{})
	type attemptKey struct{}
	ctx := context.WithValue(t.Context(), attemptKey{}, "this attempt")

	if err := a.Run(ctx); err != nil {
		t.Fatal(err)
	}

	if len(deadline.calls) != 1 {
		t.Fatalf("the deadline was asked for %d limits, want 1", len(deadline.calls))
	}
	if deadline.calls[0] != ctx {
		t.Errorf("the deadline limited the context %v, want the attempt's %v", deadline.calls[0], ctx)
	}
	if len(capturer.calls) != 1 {
		t.Fatalf("got %d captures, want 1", len(capturer.calls))
	}
	if capturer.calls[0] != deadline.limited {
		t.Errorf("captured under the context %v, want the deadline's limit %v", capturer.calls[0], deadline.limited)
	}
}

// The deadline is released after the capture returned, not before: the
// limit holds for the whole read.
func TestRunReleasesTheDeadlineAfterTheCapture(t *testing.T) {
	t.Parallel()
	var calls []string
	deadline := limitFunc(func(ctx context.Context) (context.Context, func()) {
		calls = append(calls, "limit")
		return ctx, func() { calls = append(calls, "release") }
	})
	capturer := captureFunc(func(context.Context) (reading, error) {
		calls = append(calls, "capture")
		return reading{id: "first"}, nil
	})
	a := newAttempt(t, capturer, deadline, &publisherSpy{}, &reporterSpy{})

	if err := a.Run(t.Context()); err != nil {
		t.Fatal(err)
	}

	if want := []string{"limit", "capture", "release"}; !slices.Equal(calls, want) {
		t.Errorf("got the calls %v, want %v", calls, want)
	}
}

// A successful capture is published once, with exactly the observation
// captured, nothing is reported, and the deadline is released once.
func TestACapturedObservationIsPublishedOnceAndNothingIsReported(t *testing.T) {
	t.Parallel()
	capturer := &capturerStub{observation: reading{id: "captured"}}
	deadline := &deadlineStub{}
	publisher := &publisherSpy{}
	reporter := &reporterSpy{}
	a := newAttempt(t, capturer, deadline, publisher, reporter)

	if err := a.Run(t.Context()); err != nil {
		t.Errorf("Run returned the error %v, want none", err)
	}

	if want := []reading{{id: "captured"}}; !slices.Equal(publisher.published, want) {
		t.Errorf("got the published observations %v, want %v", publisher.published, want)
	}
	assertNothingReported(t, reporter)
	assertOneLimitReleasedOnce(t, deadline)
}

// Each attempt is a capture and a publication of its own: nothing of an
// earlier one is kept.
func TestEachAttemptCapturesAndPublishesAgain(t *testing.T) {
	t.Parallel()
	capturer := &capturerStub{observation: reading{id: "first"}}
	publisher := &publisherSpy{}
	a := newAttempt(t, capturer, &deadlineStub{}, publisher, &reporterSpy{})

	if err := a.Run(t.Context()); err != nil {
		t.Fatal(err)
	}
	capturer.observation = reading{id: "second"}
	if err := a.Run(t.Context()); err != nil {
		t.Fatal(err)
	}

	if want := []reading{{id: "first"}, {id: "second"}}; !slices.Equal(publisher.published, want) {
		t.Errorf("got the published observations %v, want %v", publisher.published, want)
	}
}

// A complete read is published even when the limit or the caller's
// context ended while the capture was returning: the capture's answer
// decides, not the contexts.
func TestACompleteReadIsPublishedThoughAContextEndedWhileItReturned(t *testing.T) {
	t.Parallel()
	for name, ends := range map[string]func(deadline *deadlineStub, stop context.CancelFunc){
		"the limit":            func(deadline *deadlineStub, _ context.CancelFunc) { deadline.end() },
		"the caller's context": func(_ *deadlineStub, stop context.CancelFunc) { stop() },
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			ctx, stop := context.WithCancel(t.Context())
			defer stop()
			deadline := &deadlineStub{}
			capturer := &capturerStub{observation: reading{id: "captured"}}
			capturer.returning = func() { ends(deadline, stop) }
			publisher := &publisherSpy{}
			reporter := &reporterSpy{}
			a := newAttempt(t, capturer, deadline, publisher, reporter)

			if err := a.Run(ctx); err != nil {
				t.Errorf("Run returned the error %v, want none", err)
			}

			if deadline.limited.Err() == nil {
				t.Fatal("the limit is still live: the test ended nothing")
			}
			if want := []reading{{id: "captured"}}; !slices.Equal(publisher.published, want) {
				t.Errorf("got the published observations %v, want %v", publisher.published, want)
			}
			assertNothingReported(t, reporter)
			assertOneLimitReleasedOnce(t, deadline)
		})
	}
}

// A publish error is the attempt's own failure: Run returns it, wrapped,
// and nothing is reported for it. The deadline is released once.
func TestAPublishErrorIsReturnedWrappedAndNotReported(t *testing.T) {
	t.Parallel()
	errWrite := errors.New("stdout closed")
	deadline := &deadlineStub{}
	publisher := &publisherSpy{err: errWrite}
	reporter := &reporterSpy{}
	a := newAttempt(t, &capturerStub{observation: reading{id: "captured"}}, deadline, publisher, reporter)

	err := a.Run(t.Context())

	if !errors.Is(err, errWrite) {
		t.Fatalf("Run returned the error %v, want one that wraps %v", err, errWrite)
	}
	if !strings.Contains(err.Error(), "publish observation") {
		t.Errorf("got the error %q, want one that says publish observation", err)
	}
	if want := []reading{{id: "captured"}}; !slices.Equal(publisher.published, want) {
		t.Errorf("got the published observations %v, want %v", publisher.published, want)
	}
	assertNothingReported(t, reporter)
	assertOneLimitReleasedOnce(t, deadline)
}

// A failed capture publishes nothing, whatever observation came with its
// error, and is reported once, as a read that failed, not one that timed
// out, by a diagnostic that wraps the capture's error. Run returns nil:
// the next attempt reads again. The deadline is released once.
func TestAFailedCaptureIsReportedOnceAndPublishesNothing(t *testing.T) {
	t.Parallel()
	errRead := errors.New("runtime unreachable")
	for name, observation := range map[string]reading{
		"alone":               {},
		"with an observation": {id: "partial"},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			deadline := &deadlineStub{}
			publisher := &publisherSpy{}
			reporter := &reporterSpy{}
			a := newAttempt(t, &capturerStub{observation: observation, err: errRead}, deadline, publisher, reporter)

			if err := a.Run(t.Context()); err != nil {
				t.Errorf("Run returned the error %v, want none", err)
			}

			assertNothingPublished(t, publisher)
			if len(reporter.diagnostics) != 1 {
				t.Fatalf("got the diagnostics %v, want one", reporter.diagnostics)
			}
			diagnostic := reporter.diagnostics[0]
			if !errors.Is(diagnostic, errRead) {
				t.Errorf("got the diagnostic %v, want one that wraps %v", diagnostic, errRead)
			}
			if !strings.Contains(diagnostic.Error(), "read failed") {
				t.Errorf("got the diagnostic %q, want one that says read failed", diagnostic)
			}
			if strings.Contains(diagnostic.Error(), "timed out") {
				t.Errorf("got the diagnostic %q, want none that says timed out", diagnostic)
			}
			assertOneLimitReleasedOnce(t, deadline)
		})
	}
}

// A capture that outlasts its limit, while the caller's context is still
// live, is reported once as a timeout: the diagnostic says the read timed
// out and wraps the capture's error, which is not a context's. Nothing is
// published, Run returns nil and the deadline is released once. The
// capture never ends by itself and the test ends the limit by hand.
func TestACaptureThatOutlastsItsLimitIsReportedAsATimeout(t *testing.T) {
	t.Parallel()
	errInterrupted := errors.New("read interrupted")
	capturer := &blockedCapturer{started: make(chan struct{}), err: errInterrupted}
	deadline := &deadlineStub{}
	publisher := &publisherSpy{}
	reporter := &reporterSpy{}
	a := newAttempt(t, capturer, deadline, publisher, reporter)
	ctx := t.Context()

	result := start(ctx, a)
	<-capturer.started
	deadline.end()
	err := <-result

	if err != nil {
		t.Errorf("Run returned the error %v, want none", err)
	}
	if ctx.Err() != nil {
		t.Fatalf("the caller's context ended: %v", ctx.Err())
	}
	assertNothingPublished(t, publisher)
	if len(reporter.diagnostics) != 1 {
		t.Fatalf("got the diagnostics %v, want one", reporter.diagnostics)
	}
	diagnostic := reporter.diagnostics[0]
	if !strings.Contains(diagnostic.Error(), "read timed out") {
		t.Errorf("got the diagnostic %q, want one that says read timed out", diagnostic)
	}
	if !errors.Is(diagnostic, errInterrupted) {
		t.Errorf("got the diagnostic %v, want one that wraps %v", diagnostic, errInterrupted)
	}
	assertOneLimitReleasedOnce(t, deadline)
}

// A capture that fails because the caller's context ended is the
// application stopping, not a timeout, though the limit ended with the
// context: nothing is published, nothing is reported, Run returns nil and
// the deadline is released once. The capture never ends by itself and the
// test ends the caller's context by hand.
func TestACaptureEndedByTheCallersContextIsNotReported(t *testing.T) {
	t.Parallel()
	capturer := &blockedCapturer{started: make(chan struct{}), err: errors.New("read interrupted")}
	deadline := &deadlineStub{}
	publisher := &publisherSpy{}
	reporter := &reporterSpy{}
	a := newAttempt(t, capturer, deadline, publisher, reporter)
	ctx, stop := context.WithCancel(t.Context())
	defer stop()

	result := start(ctx, a)
	<-capturer.started
	stop()
	err := <-result

	if err != nil {
		t.Errorf("Run returned the error %v, want none", err)
	}
	assertNothingPublished(t, publisher)
	assertNothingReported(t, reporter)
	assertOneLimitReleasedOnce(t, deadline)
}

// An attempt under a caller's context that has already ended still
// captures once, under the limit, and its failure is not reported either.
func TestAFailedCaptureUnderAnEndedCallersContextIsNotReported(t *testing.T) {
	t.Parallel()
	capturer := &capturerStub{err: errors.New("runtime unreachable")}
	deadline := &deadlineStub{}
	publisher := &publisherSpy{}
	reporter := &reporterSpy{}
	a := newAttempt(t, capturer, deadline, publisher, reporter)
	ctx, stop := context.WithCancel(t.Context())
	stop()

	if err := a.Run(ctx); err != nil {
		t.Errorf("Run returned the error %v, want none", err)
	}

	if len(capturer.calls) != 1 || capturer.calls[0] != deadline.limited {
		t.Errorf("got the captures %v, want one under the deadline's limit", capturer.calls)
	}
	assertNothingPublished(t, publisher)
	assertNothingReported(t, reporter)
	assertOneLimitReleasedOnce(t, deadline)
}
