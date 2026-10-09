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
// returns an error: the first such error ends the others and is returned,
// wrapped, whether ctx has ended or not: it is a failure the monitor
// cannot recover from. A later error does not replace it. A runnable that
// returns nil ends nothing, so Run returns nil once all returned nil.
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
