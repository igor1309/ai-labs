// Package runner is warder's application runner: it runs the runnables it
// is given concurrently, ends them when its context ends or one of them
// fails, and returns once all of them returned.
package runner

import (
	"context"
	"errors"
	"fmt"
	"reflect"
	"slices"
	"sync"
)

// Runnable runs under ctx until ctx ends or it ends by itself, and returns
// an error only for a failure the monitor cannot recover from.
type Runnable interface {
	Run(ctx context.Context) error
}

// Runner runs the runnables it is given. It never looks at what a runnable
// does.
type Runner struct {
	runnables []Runnable
	// handled, when set, is called with a runnable's index once the runner
	// has handled that runnable's return: its error recorded, and the
	// others' context ended or left live. New leaves it unset; it is the
	// event the package's tests wait for.
	handled func(index int)
}

// New returns a runner of runnables, which it copies. None is no runner,
// and a nil one, or a nil pointer, map, slice, func or chan carried as
// one, is missing.
func New(runnables ...Runnable) (*Runner, error) {
	if len(runnables) == 0 {
		return nil, errors.New("runner: no runnables")
	}
	for i, runnable := range runnables {
		if runnable == nil || isNil(reflect.ValueOf(runnable)) {
			return nil, fmt.Errorf("runner: no runnable at index %d", i)
		}
	}
	return &Runner{runnables: slices.Clone(runnables)}, nil
}

func isNil(value reflect.Value) bool {
	switch value.Kind() {
	case reflect.Pointer, reflect.Map, reflect.Slice, reflect.Func, reflect.Chan, reflect.Interface, reflect.UnsafePointer:
		return value.IsNil()
	}
	return false
}

// Run starts every runnable at once, each once in a goroutine of its own
// and under one context derived from ctx, and returns only after all of
// them returned. That context ends when ctx ends and when a runnable
// returns an error; a runnable that returns nil ends nothing.
//
// Run returns the first error a runnable returned, wrapped, whether or not
// ctx has ended: an error is a failure the monitor cannot recover from, so
// it is surfaced on shutdown too, and a later error does not replace it.
// Run returns nil when every runnable returned nil, on cancellation too:
// the end of ctx is no error of Run's.
func (r *Runner) Run(ctx context.Context) error {
	ctx, stop := context.WithCancel(ctx)
	defer stop()

	var (
		running sync.WaitGroup
		failed  sync.Once
		first   error
	)
	for i, runnable := range r.runnables {
		running.Add(1)
		go func() {
			defer running.Done()
			// Deferred before the return is handled, so it runs after
			// all of that.
			defer r.reportHandled(i)
			if err := runnable.Run(ctx); err != nil {
				failed.Do(func() {
					first = fmt.Errorf("runner: runnable %d: %w", i, err)
					stop()
				})
			}
		}()
	}
	running.Wait()
	return first
}

// reportHandled reports that the runner has handled the return of the
// runnable at index, when the event is asked for.
func (r *Runner) reportHandled(index int) {
	if r.handled != nil {
		r.handled(index)
	}
}
