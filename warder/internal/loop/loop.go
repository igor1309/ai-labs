// Package loop is warder's source loop: for one source, it runs the
// attempts it is given one after another, and waits its interval, through
// the wait it is given, after each.
package loop

import (
	"context"
	"errors"
	"fmt"
	"reflect"
	"time"
)

// Attempt executes one attempt, ends it when ctx is done, and returns an
// error only for a failure the monitor cannot recover from.
type Attempt interface {
	Run(ctx context.Context) error
}

// Wait waits interval: it returns nil when the interval elapsed, and an
// error when ctx ended first or it cannot wait.
type Wait interface {
	Wait(ctx context.Context, interval time.Duration) error
}

// Loop runs the attempts of one source through the attempt and the wait it
// is given. It starts no timer of its own and never looks at what an
// attempt did.
type Loop struct {
	attempt  Attempt
	wait     Wait
	interval time.Duration
}

// New returns a loop that attempts through attempt and waits interval
// through wait after each attempt. A nil one of them, or a nil pointer,
// map, slice, func or chan carried as one, is missing, and an interval
// that is not positive is no interval.
func New(attempt Attempt, wait Wait, interval time.Duration) (*Loop, error) {
	if attempt == nil || isNil(reflect.ValueOf(attempt)) {
		return nil, errors.New("loop: no attempt")
	}
	if wait == nil || isNil(reflect.ValueOf(wait)) {
		return nil, errors.New("loop: no wait")
	}
	if interval <= 0 {
		return nil, fmt.Errorf("loop: interval %v is not positive", interval)
	}
	return &Loop{attempt: attempt, wait: wait, interval: interval}, nil
}

func isNil(value reflect.Value) bool {
	switch value.Kind() {
	case reflect.Pointer, reflect.Map, reflect.Slice, reflect.Func, reflect.Chan, reflect.Interface, reflect.UnsafePointer:
		return value.IsNil()
	}
	return false
}

// Run attempts at once, then waits the interval after each attempt that
// returned nil and attempts again, each step under ctx and only after the
// one before it returned, until ctx ends or a step fails. An attempt's
// error ends the loop and is returned, wrapped, whether ctx has ended or
// not: it is a failure the monitor cannot recover from. A wait's error
// while ctx is live ends the loop and is returned, wrapped. Once ctx has
// ended the application is stopping: Run starts no further attempt or
// wait and returns nil, and so it does for any wait's error then, whatever
// its cause: the cause of a failure cannot be told reliably.
func (l *Loop) Run(ctx context.Context) error {
	for ctx.Err() == nil {
		if err := l.attempt.Run(ctx); err != nil {
			return fmt.Errorf("loop: attempt: %w", err)
		}
		if ctx.Err() != nil {
			break
		}
		if err := l.wait.Wait(ctx, l.interval); err != nil {
			if ctx.Err() != nil {
				break
			}
			return fmt.Errorf("loop: wait: %w", err)
		}
	}
	return nil
}
