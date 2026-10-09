package main

import (
	"context"
	"time"
)

// timerFunc starts a timer: fired delivers once wait has elapsed, and stop
// releases a timer that is no longer waited for. Every wait of the
// application goes through the one it is given.
type timerFunc = func(wait time.Duration) (fired <-chan time.Time, stop func())

// realTimer starts a timer of the operating system. With systemClock it is
// the only real time in the module.
func realTimer(wait time.Duration) (fired <-chan time.Time, stop func()) {
	timer := time.NewTimer(wait)
	return timer.C, func() { timer.Stop() }
}

// systemClock is the system's wall clock.
func systemClock() time.Time { return time.Now() }

// timerWait waits through the timer it is given, as a loop's wait.
type timerWait struct {
	timer timerFunc
}

// Wait starts a timer of interval and returns nil when it fires. When ctx
// ends first it stops the timer and returns ctx's error.
func (w timerWait) Wait(ctx context.Context, interval time.Duration) error {
	fired, stop := w.timer(interval)
	select {
	case <-fired:
		return nil
	case <-ctx.Done():
		stop()
		return ctx.Err()
	}
}

// timerDeadline limits each read to limit through the timer it is given,
// as an attempt's deadline.
type timerDeadline struct {
	timer timerFunc
	limit time.Duration
	// watched, when set, is called once the goroutine that watches a
	// limit's timer has ended. wire leaves it unset; it is the event the
	// package's tests wait for.
	watched func()
}

// Limit starts a timer of the limit and returns a context that ends when
// the timer fires, with context.DeadlineExceeded as its cause, or when ctx
// ends. release stops the timer and ends that context, and returns only
// once the goroutine that watched the timer has ended.
func (d timerDeadline) Limit(ctx context.Context) (limited context.Context, release func()) {
	limited, end := context.WithCancelCause(ctx)
	fired, stop := d.timer(d.limit)
	watching := make(chan struct{})
	go func() {
		defer close(watching)
		defer d.reportWatched()
		select {
		case <-fired:
			end(context.DeadlineExceeded)
		case <-limited.Done():
		}
	}()
	return limited, func() {
		stop()
		end(context.Canceled)
		<-watching
	}
}

// reportWatched reports that the goroutine watching a limit's timer has
// ended, when the event is asked for.
func (d timerDeadline) reportWatched() {
	if d.watched != nil {
		d.watched()
	}
}
