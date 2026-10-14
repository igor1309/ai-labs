// Package attempt is warder's observation attempt: for one source, it
// coordinates one timed read. It limits the capture it is given with the
// deadline it is given, publishes a complete observation and reports a
// read that failed or timed out.
package attempt

import (
	"context"
	"errors"
	"fmt"
	"reflect"
)

// Capturer captures one complete observation, ends the capture when ctx
// is done, and returns the observation or an error.
type Capturer[O any] interface {
	Capture(ctx context.Context) (O, error)
}

// Deadline limits one read: limited is ctx with the read's time limit, so
// it ends when the limit elapses or ctx ends, and release frees what the
// limit holds.
type Deadline interface {
	Limit(ctx context.Context) (limited context.Context, release func())
}

// Publisher publishes one complete observation and returns a write error.
type Publisher[O any] interface {
	Publish(observation O) error
}

// Reporter emits one diagnostic.
type Reporter interface {
	Report(diagnostic error)
}

// Attempt runs the attempts of one source through the capturer, deadline,
// publisher and reporter it is given. It never inspects an observation: it
// publishes what was captured. It starts no timer and writes nothing of
// its own.
type Attempt[O any] struct {
	capturer  Capturer[O]
	deadline  Deadline
	publisher Publisher[O]
	reporter  Reporter
}

// New returns an attempt that captures through capturer under deadline's
// limit, publishes through publisher and reports through reporter. A nil
// one of them, or a nil pointer, map, slice, func or chan carried as one,
// is missing.
func New[O any](capturer Capturer[O], deadline Deadline, publisher Publisher[O], reporter Reporter) (*Attempt[O], error) {
	if capturer == nil || isNil(reflect.ValueOf(capturer)) {
		return nil, errors.New("attempt: no capturer")
	}
	if deadline == nil || isNil(reflect.ValueOf(deadline)) {
		return nil, errors.New("attempt: no deadline")
	}
	if publisher == nil || isNil(reflect.ValueOf(publisher)) {
		return nil, errors.New("attempt: no publisher")
	}
	if reporter == nil || isNil(reflect.ValueOf(reporter)) {
		return nil, errors.New("attempt: no reporter")
	}
	return &Attempt[O]{capturer: capturer, deadline: deadline, publisher: publisher, reporter: reporter}, nil
}

func isNil(value reflect.Value) bool {
	switch value.Kind() {
	case reflect.Pointer, reflect.Map, reflect.Slice, reflect.Func, reflect.Chan, reflect.Interface, reflect.UnsafePointer:
		return value.IsNil()
	}
	return false
}

// Run executes one attempt: it captures once, under the deadline's limit
// of ctx, and releases the deadline once, whatever the outcome. A complete
// observation is published, even when the limit or ctx ended while the
// capture was returning. A capture that failed publishes nothing and is
// reported once, as a read that timed out when the limit had ended and as
// a read that failed otherwise, with the capture's error wrapped. Any
// capture failure while ctx itself has ended is the application stopping
// and is not reported, whatever its cause: the cause of a failure cannot
// be told reliably. The only error Run returns is the publisher's,
// wrapped: a failed read is left to the next attempt.
func (a *Attempt[O]) Run(ctx context.Context) error {
	limited, release := a.deadline.Limit(ctx)
	defer release()

	observation, err := a.capturer.Capture(limited)
	if err == nil {
		if err := a.publisher.Publish(observation); err != nil {
			return fmt.Errorf("attempt: publish observation: %w", err)
		}
		return nil
	}
	// The limit before ctx: ctx's end ends the limit too, and read in the
	// other order an end of ctx between the two would pass for a timeout.
	timedOut := limited.Err() != nil
	if ctx.Err() != nil {
		return nil
	}
	if timedOut {
		a.reporter.Report(fmt.Errorf("attempt: read timed out: %w", err))
		return nil
	}
	a.reporter.Report(fmt.Errorf("attempt: read failed: %w", err))
	return nil
}
