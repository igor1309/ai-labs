package call_test

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"slices"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/core/call"
	"github.com/igor1309/ai-labs/gokit/clocktest"
)

// runtimeSpy answers the runtime protocol: it keeps each turn it is given
// and answers it by its test's turn, run with the turn's context.
type runtimeSpy struct {
	turn  func(ctx context.Context) (call.Ended, error)
	given []call.Turn
}

func (s *runtimeSpy) Turn(ctx context.Context, turn call.Turn) (call.Ended, error) {
	s.given = append(s.given, turn)
	return s.turn(ctx)
}

// exits is a turn that exits with ended at once.
func exits(ended call.Ended) func(context.Context) (call.Ended, error) {
	return func(context.Context) (call.Ended, error) { return ended, nil }
}

// untilEnded is a turn that exits 0 once its context ends, and only then.
func untilEnded(ctx context.Context) (call.Ended, error) {
	<-ctx.Done()
	return call.Ended{Code: 0}, nil
}

var start = time.Date(2026, 10, 16, 10, 0, 0, 0, time.UTC)

// caller is a caller over spy in dir, over env, its timing and time limits
// on clock.
func caller(t *testing.T, spy *runtimeSpy, clock *clocktest.Clock, dir string, env ...string) *call.Caller {
	t.Helper()
	c, err := call.New(spy, clock, clock.Timer, dir, env)
	if err != nil {
		t.Fatal(err)
	}
	return c
}

// A caller takes each of its collaborators, and fails without one.
func TestNewFailsWithoutACollaborator(t *testing.T) {
	t.Parallel()
	clock := clocktest.NewClock(start)
	cases := []struct {
		name    string
		runtime call.Runtime
		clock   call.Clock
		timer   call.Timer
	}{
		{"runtime", nil, clock, clock.Timer},
		{"clock", &runtimeSpy{}, nil, clock.Timer},
		{"timer", &runtimeSpy{}, clock, nil},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			if _, err := call.New(c.runtime, c.clock, c.timer, "/r", nil); err == nil || err.Error() != "call: no "+c.name {
				t.Errorf("New without a %s: %v, want call: no %s", c.name, err, c.name)
			}
		})
	}
}

// call.feature, "The turn is given the script, the directory and the
// environment, each input by its name".
func TestTheTurnIsGivenTheScriptTheDirectoryAndTheEnvironment(t *testing.T) {
	t.Parallel()
	spy := &runtimeSpy{turn: exits(call.Ended{})}
	c := caller(t, spy, clocktest.NewClock(start), "/r", "PATH=/bin", "A=0")
	c.Call(context.Background(), call.Step{
		Prompt:      "s",
		Environment: map[string]string{"A": "1", "B": "2"},
		Inputs:      map[string]string{"B": "3"},
	})
	want := []call.Turn{{Prompt: "s", Dir: "/r", Env: []string{"PATH=/bin", "A=1", "B=3"}}}
	if !reflect.DeepEqual(spy.given, want) {
		t.Errorf("turns\n got %+v\nwant %+v", spy.given, want)
	}
}

// call.feature, "How the turn ended decides the status and class", the
// step's warnings given whatever its status.
func TestHowTheTurnEndedDecidesTheStatusAndClass(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name string
		// turn is the turn's answer, given cancel, which cancels the call's
		// context as its caller would.
		turn   func(cancel context.CancelFunc) func(context.Context) (call.Ended, error)
		status call.Status
		class  call.Class
	}{
		{"exits with code 0", func(context.CancelFunc) func(context.Context) (call.Ended, error) {
			return exits(call.Ended{Code: 0})
		}, call.Completed, ""},
		{"exits with code 4", func(context.CancelFunc) func(context.Context) (call.Ended, error) {
			return exits(call.Ended{Code: 4})
		}, call.Completed, ""},
		{"cannot start its program", func(context.CancelFunc) func(context.Context) (call.Ended, error) {
			return func(context.Context) (call.Ended, error) {
				return call.Ended{}, fmt.Errorf("bash: %w", call.ErrNotStarted)
			}
		}, call.Failed, call.RuntimeUnavailable},
		{"gives another error", func(context.CancelFunc) func(context.Context) (call.Ended, error) {
			return func(context.Context) (call.Ended, error) { return call.Ended{}, errors.New("broken pipe") }
		}, call.Failed, call.RuntimeError},
		{"is cancelled by the caller, then exits 0", func(cancel context.CancelFunc) func(context.Context) (call.Ended, error) {
			return func(ctx context.Context) (call.Ended, error) {
				cancel()
				return untilEnded(ctx)
			}
		}, call.Interrupted, call.Cancelled},
		{"is ended by a signal Agister did not send", func(context.CancelFunc) func(context.Context) (call.Ended, error) {
			return exits(call.Ended{Signal: "terminated"})
		}, call.Failed, call.Killed},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			ctx, cancel := context.WithCancel(context.Background())
			t.Cleanup(cancel)
			spy := &runtimeSpy{turn: c.turn(cancel)}
			got := caller(t, spy, clocktest.NewClock(start), "/r").Call(ctx, call.Step{Prompt: "s", Warnings: []string{"w"}})
			if got.Status != c.status || got.Class != c.class {
				t.Errorf("ended %q, class %q; want %q, class %q", got.Status, got.Class, c.status, c.class)
			}
			if c.status != call.Completed && got.Output != nil {
				t.Errorf("output of a call ended %q: %v, want none", got.Status, got.Output)
			}
			if !slices.Equal(got.Warnings, []string{"w"}) {
				t.Errorf("warnings %q, want [w]", got.Warnings)
			}
		})
	}
}

// call.feature, "A completed call's output is the exit code and both
// streams".
func TestACompletedCallsOutputIsTheExitCodeAndBothStreams(t *testing.T) {
	t.Parallel()
	spy := &runtimeSpy{turn: exits(call.Ended{
		Code:   4,
		Stdout: call.Stream{Head: "o", Tail: "o", Size: 1, Digest: "od"},
		Stderr: call.Stream{Head: "e", Tail: "e", Size: 1, Digest: "ed"},
	})}
	got := caller(t, spy, clocktest.NewClock(start), "/r").Call(context.Background(), call.Step{Prompt: "s"})
	want := map[string]any{
		"exit_code": 4,
		"stdout":    map[string]any{"head": "o", "tail": "o", "size": int64(1), "digest": "od"},
		"stderr":    map[string]any{"head": "e", "tail": "e", "size": int64(1), "digest": "ed"},
	}
	if got.Status != call.Completed || !reflect.DeepEqual(got.Output, want) {
		t.Errorf("ended %q, output\n got %v\nwant %v", got.Status, got.Output, want)
	}
}

// call.feature, "A time limit ends the turn".
func TestATimeLimitEndsTheTurn(t *testing.T) {
	t.Parallel()
	clock := clocktest.NewClock(start)
	ended := make(chan error, 1)
	spy := &runtimeSpy{turn: func(ctx context.Context) (call.Ended, error) {
		answer, err := untilEnded(ctx)
		ended <- ctx.Err()
		return answer, err
	}}
	c := caller(t, spy, clock, "/r")
	done := make(chan call.Result, 1)
	go func() { done <- c.Call(context.Background(), call.Step{Prompt: "s", TimeLimit: time.Second}) }()
	clock.Started(time.Second)
	clock.Advance(time.Second)
	if err := <-ended; !errors.Is(err, context.Canceled) {
		t.Errorf("the turn's context: %v, want it ended", err)
	}
	if got := <-done; got.Status != call.Interrupted || got.Class != call.Timeout {
		t.Errorf("ended %q, class %q; want interrupted, class timeout", got.Status, got.Class)
	}
}

// A time limit that has not passed when the turn returns ends nothing, and
// is released.
func TestATimeLimitNotPassedEndsNothing(t *testing.T) {
	t.Parallel()
	clock := clocktest.NewClock(start)
	spy := &runtimeSpy{turn: exits(call.Ended{Code: 0})}
	got := caller(t, spy, clock, "/r").Call(context.Background(), call.Step{Prompt: "s", TimeLimit: time.Second})
	if got.Status != call.Completed {
		t.Errorf("ended %q, class %q; want completed", got.Status, got.Class)
	}
	if waits, pending := clock.Waits(), clock.Pending(); !slices.Equal(waits, []time.Duration{time.Second}) || pending != 0 {
		t.Errorf("timers %v, %d pending; want [1s], none pending", waits, pending)
	}
}

// call.feature, "Timing is measured, and the cost is unknown".
func TestTimingIsMeasuredAndTheCostIsUnknown(t *testing.T) {
	t.Parallel()
	clock := clocktest.NewClock(start)
	spy := &runtimeSpy{turn: func(context.Context) (call.Ended, error) {
		clock.Advance(5 * time.Second)
		return call.Ended{}, nil
	}}
	got := caller(t, spy, clock, "/r").Call(context.Background(), call.Step{Prompt: "s"})
	want := call.Timing{Started: start, Ended: start.Add(5 * time.Second), Duration: 5 * time.Second}
	if got.Timing != want {
		t.Errorf("timing %+v, want %+v", got.Timing, want)
	}
	printed, err := json.Marshal(got.Cost)
	if err != nil {
		t.Fatal(err)
	}
	if got.Cost != nil || string(printed) != "null" {
		t.Errorf("cost %v, printed %s; want unknown, printed null", got.Cost, printed)
	}
}

// call.feature, "The step's warnings are the call's, whatever its status".
func TestTheStepsWarningsAreTheCallsWhateverItsStatus(t *testing.T) {
	t.Parallel()
	clock := clocktest.NewClock(start)
	c := caller(t, &runtimeSpy{turn: untilEnded}, clock, "/r")
	warnings := []string{"grants network beyond what it allows"}
	done := make(chan call.Result, 1)
	go func() {
		done <- c.Call(context.Background(), call.Step{Prompt: "s", TimeLimit: time.Second, Warnings: warnings})
	}()
	clock.Started(time.Second)
	clock.Advance(time.Second)
	got := <-done
	if got.Status != call.Interrupted || !slices.Equal(got.Warnings, warnings) {
		t.Errorf("ended %q, warnings %q; want interrupted, %q", got.Status, got.Warnings, warnings)
	}
}
