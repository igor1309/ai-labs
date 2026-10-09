package main

import (
	"context"
	"errors"
	"slices"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/gokit/clocktest"
	"github.com/igor1309/ai-labs/warder/internal/attempt"
	"github.com/igor1309/ai-labs/warder/internal/loop"
)

var (
	_ loop.Wait        = timerWait{}
	_ attempt.Deadline = timerDeadline{}
)

// startWait waits interval under ctx in a goroutine and returns the
// channel its result arrives on.
func startWait(ctx context.Context, wait timerWait, interval time.Duration) <-chan error {
	result := make(chan error, 1)
	go func() { result <- wait.Wait(ctx, interval) }()
	return result
}

// The wait starts one timer of the interval and returns nil when it fires.
func TestWaitReturnsNilWhenItsTimerFires(t *testing.T) {
	t.Parallel()
	clock := clocktest.NewClock(morning())
	result := startWait(t.Context(), timerWait{timer: clock.Timer}, 3*time.Second)
	clock.Started(3 * time.Second)

	clock.Advance(3 * time.Second)

	if err := <-result; err != nil {
		t.Errorf("got the error %v, want none", err)
	}
	if got, want := clock.Waits(), []time.Duration{3 * time.Second}; !slices.Equal(got, want) {
		t.Errorf("got timers of %v, want %v", got, want)
	}
}

// When the context ends first, the wait returns the context's error and
// stops its timer.
func TestWaitReturnsTheContextsErrorAndStopsItsTimerWhenTheContextEndsFirst(t *testing.T) {
	t.Parallel()
	clock := clocktest.NewClock(morning())
	ctx, cancel := context.WithCancel(t.Context())
	defer cancel()
	result := startWait(ctx, timerWait{timer: clock.Timer}, 3*time.Second)
	clock.Started(3 * time.Second)

	cancel()

	if err := <-result; !errors.Is(err, context.Canceled) {
		t.Errorf("got the error %v, want %v", err, context.Canceled)
	}
	if got := clock.Pending(); got != 0 {
		t.Errorf("%d timers are left running, want none", got)
	}
}

// watchedDeadline is a deadline of limit over the clock's timer, and
// whether the goroutine that watches a limit's timer has ended. That is
// written without a lock: release returns only after the goroutine ended,
// so under -race a release that returns earlier also fails as a data race.
func watchedDeadline(clock *clocktest.Clock, limit time.Duration) (timerDeadline, *bool) {
	ended := new(bool)
	return timerDeadline{timer: clock.Timer, limit: limit, watched: func() { *ended = true }}, ended
}

// assertReleased releases the limit and fails unless that left neither a
// timer nor the watching goroutine behind.
func assertReleased(t *testing.T, clock *clocktest.Clock, release func(), ended *bool) {
	t.Helper()
	release()
	if !*ended {
		t.Error("release returned before the goroutine that watches the timer ended")
	}
	if got := clock.Pending(); got != 0 {
		t.Errorf("%d timers are left running after the release, want none", got)
	}
}

// The limited context is the parent's, live until the limit's timer fires,
// and then ended as a deadline that passed. The parent stays live.
func TestTheLimitEndsWhenItsTimerFires(t *testing.T) {
	t.Parallel()
	clock := clocktest.NewClock(morning())
	deadline, ended := watchedDeadline(clock, 3*time.Second)
	parent := context.WithValue(t.Context(), contextKey{}, "the caller's")

	limited, release := deadline.Limit(parent)

	if got, want := clock.Waits(), []time.Duration{3 * time.Second}; !slices.Equal(got, want) {
		t.Errorf("got timers of %v, want %v", got, want)
	}
	if limited.Value(contextKey{}) != "the caller's" {
		t.Error("the limited context is not derived from the parent")
	}
	if err := limited.Err(); err != nil {
		t.Fatalf("the limited context ended before its timer fired: %v", err)
	}

	clock.Advance(3 * time.Second)

	<-limited.Done()
	if got := context.Cause(limited); got != context.DeadlineExceeded {
		t.Errorf("got the cause %v, want %v", got, context.DeadlineExceeded)
	}
	if err := parent.Err(); err != nil {
		t.Errorf("the parent ended: %v", err)
	}
	assertReleased(t, clock, release, ended)
}

// The limited context ends when the parent ends, with the timer not fired.
func TestTheLimitEndsWhenTheParentEnds(t *testing.T) {
	t.Parallel()
	clock := clocktest.NewClock(morning())
	deadline, ended := watchedDeadline(clock, 3*time.Second)
	stopped := errors.New("the application is stopping")
	parent, cancel := context.WithCancelCause(t.Context())
	defer cancel(nil)
	limited, release := deadline.Limit(parent)

	cancel(stopped)

	<-limited.Done()
	if got := context.Cause(limited); got != stopped {
		t.Errorf("got the cause %v, want %v", got, stopped)
	}
	assertReleased(t, clock, release, ended)
}

// Releasing a limit whose timer has not fired stops the timer and ends the
// limited context, and leaves no goroutine behind. The parent stays live.
func TestReleaseStopsTheTimerAndEndsTheLimit(t *testing.T) {
	t.Parallel()
	clock := clocktest.NewClock(morning())
	deadline, ended := watchedDeadline(clock, 3*time.Second)
	limited, release := deadline.Limit(t.Context())
	if got := clock.Pending(); got != 1 {
		t.Fatalf("%d timers are running under the limit, want 1", got)
	}

	assertReleased(t, clock, release, ended)

	if err := limited.Err(); !errors.Is(err, context.Canceled) {
		t.Errorf("got the limited context's error %v, want %v", err, context.Canceled)
	}
	if err := t.Context().Err(); err != nil {
		t.Errorf("the parent ended: %v", err)
	}
}

// The OS timers construct one timer of the wait asked for, and deliver its
// channel as fired. The spy's timer is never started, so it is not
// stopped either: Stop panics on a timer that time.NewTimer did not make.
func TestOSTimersConstructATimerOfTheWaitAskedFor(t *testing.T) {
	t.Parallel()
	channel := make(chan time.Time)
	var waits []time.Duration
	timers := osTimers{newTimer: func(wait time.Duration) *time.Timer {
		waits = append(waits, wait)
		return &time.Timer{C: channel}
	}}

	fired, _ := timers.Start(3 * time.Second)

	if got, want := waits, []time.Duration{3 * time.Second}; !slices.Equal(got, want) {
		t.Errorf("got timers of %v, want %v", got, want)
	}
	if fired != (<-chan time.Time)(channel) {
		t.Error("fired is not the constructed timer's channel")
	}
}

// Contract test: the operating system's timer, which fires by itself once
// its wait has passed.
func TestRealTimerFires(t *testing.T) {
	t.Parallel()
	before := time.Now()
	fired, stop := osTimers{newTimer: time.NewTimer}.Start(time.Millisecond)
	defer stop()

	at := <-fired

	if at.Before(before) {
		t.Errorf("the timer fired at %v, before it was started at %v", at, before)
	}
}

// Contract test: the system's wall clock, which tells a time between two
// readings of it.
func TestSystemClockTellsTheWallClocksTime(t *testing.T) {
	t.Parallel()
	before := time.Now()
	got := systemClock()
	after := time.Now()

	if got.Before(before) || got.After(after) {
		t.Errorf("got the time %v, want one from %v to %v", got, before, after)
	}
}
