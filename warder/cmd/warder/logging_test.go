package main

import (
	"context"
	"errors"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/gokit/clocktest"
	"github.com/igor1309/ai-labs/warder/internal/attempt"
	"github.com/igor1309/ai-labs/warder/internal/capture"
	"github.com/igor1309/ai-labs/warder/internal/claude"
	"github.com/igor1309/ai-labs/warder/internal/loop"
)

// Each decorator satisfies the interface of what it wraps.
var (
	_ claude.CommandExecutor                 = (*loggedExecute)(nil)
	_ capture.AgentReader                    = loggedReadAgents{}
	_ attempt.Capturer[capture.Observation]  = loggedCapture{}
	_ attempt.Deadline                       = loggedDeadline{}
	_ attempt.Publisher[capture.Observation] = loggedPublish{}
	_ loop.Wait                              = loggedWait{}
)

// recordedLog is the source log of source over the clock, with logging
// on: its records are written to the lines it returns.
func recordedLog(clock *clocktest.Clock, source string) (sourceLog, *lines) {
	records := newLines()
	return sourceLog{logger: newLogger(records, true), clock: clock.Now, source: source}, records
}

// assertRecords fails unless the records written are want, in order.
func assertRecords(t *testing.T, records *lines, want ...string) {
	t.Helper()
	if got := records.all(); !slices.Equal(got, want) {
		t.Errorf("got the records\n%swant\n%s", strings.Join(got, ""), strings.Join(want, ""))
	}
}

// The command is executed under the caller's context, with its name and
// arguments, and its output returned as it is; the execution is recorded
// with the source, the command's name, its outcome and its duration on the
// clock.
func TestLoggedExecutePassesTheCommandThroughAndRecordsIt(t *testing.T) {
	t.Parallel()
	clock := clocktest.NewClock(morning())
	log, records := recordedLog(clock, "claude-main")
	ctx := context.WithValue(t.Context(), contextKey{}, "the caller's")
	output := []byte(sessions)
	execute := logExecute(func(given context.Context, name string, args ...string) ([]byte, error) {
		if given != ctx {
			t.Error("the execution was not given the caller's context")
		}
		if got := append([]string{name}, args...); !slices.Equal(got, []string{"claude", "agents", "--json"}) {
			t.Errorf("got the command %q, want claude agents --json", got)
		}
		clock.Advance(2 * time.Second)
		return output, nil
	}, log)

	got, err := execute.Execute(ctx, "claude", "agents", "--json")

	if err != nil {
		t.Fatal(err)
	}
	if &got[0] != &output[0] || len(got) != len(output) {
		t.Errorf("got the output %q, want the execution's own", got)
	}
	assertRecords(t, records,
		"time=2026-10-09T11:28:12.000+03:00 level=DEBUG msg=execute source=claude-main command=claude outcome=ok duration=2s\n")
}

// A cancelled context reaches the execution as it is, and the execution's
// error, its cause, is returned as it is and recorded.
func TestLoggedExecutePassesACancellationAndItsErrorThrough(t *testing.T) {
	t.Parallel()
	clock := clocktest.NewClock(morning())
	log, records := recordedLog(clock, "claude-main")
	failure := errors.New("the run is stopping")
	ctx, cancel := context.WithCancelCause(t.Context())
	cancel(failure)
	execute := logExecute(func(given context.Context, _ string, _ ...string) ([]byte, error) {
		if given != ctx {
			t.Error("the execution was not given the caller's context")
		}
		clock.Advance(time.Second)
		return nil, context.Cause(given)
	}, log)

	got, err := execute.Execute(ctx, "claude", "agents", "--json")

	if err != failure || !errors.Is(err, failure) {
		t.Errorf("got the error %v, want %v itself", err, failure)
	}
	if got != nil {
		t.Errorf("got the output %q, want none", got)
	}
	assertRecords(t, records,
		`time=2026-10-09T11:28:11.000+03:00 level=DEBUG msg=execute source=claude-main command=claude outcome=error error="the run is stopping" duration=1s`+"\n")
}

// A missing execution stays missing: the decorator of it is nil, which the
// adapter rejects.
func TestLogExecuteOfNoExecutionIsNil(t *testing.T) {
	t.Parallel()
	log, _ := recordedLog(clocktest.NewClock(morning()), "claude-main")
	if got := logExecute(nil, log); got != nil {
		t.Errorf("got the decorator %v, want nil", got)
	}
}

// The agents are read under the caller's context and returned as they
// are; the read is recorded.
func TestLoggedReadAgentsPassesTheReadThroughAndRecordsIt(t *testing.T) {
	t.Parallel()
	clock := clocktest.NewClock(morning())
	log, records := recordedLog(clock, "claude-main")
	ctx := context.WithValue(t.Context(), contextKey{}, "the caller's")
	agents := []capture.Agent{{ID: "session-1", State: capture.Working}}
	read := loggedReadAgents{read: func(given context.Context) ([]capture.Agent, error) {
		if given != ctx {
			t.Error("the read was not given the caller's context")
		}
		clock.Advance(3 * time.Second)
		return agents, nil
	}, log: log}

	got, err := read.ReadAgents(ctx)

	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || &got[0] != &agents[0] {
		t.Errorf("got the agents %v, want the read's own", got)
	}
	assertRecords(t, records,
		`time=2026-10-09T11:28:13.000+03:00 level=DEBUG msg="read agents" source=claude-main outcome=ok duration=3s`+"\n")
}

// A cancelled context reaches the read as it is, and the read's error is
// returned as it is, with what the read returned, and recorded.
func TestLoggedReadAgentsPassesACancellationAndItsErrorThrough(t *testing.T) {
	t.Parallel()
	clock := clocktest.NewClock(morning())
	log, records := recordedLog(clock, "claude-main")
	failure := errors.New("the run is stopping")
	ctx, cancel := context.WithCancelCause(t.Context())
	cancel(failure)
	read := loggedReadAgents{read: func(given context.Context) ([]capture.Agent, error) {
		if given != ctx {
			t.Error("the read was not given the caller's context")
		}
		return nil, context.Cause(given)
	}, log: log}

	got, err := read.ReadAgents(ctx)

	if err != failure || !errors.Is(err, failure) {
		t.Errorf("got the error %v, want %v itself", err, failure)
	}
	if got != nil {
		t.Errorf("got the agents %v, want none", got)
	}
	assertRecords(t, records,
		`time=2026-10-09T11:28:10.000+03:00 level=DEBUG msg="read agents" source=claude-main outcome=error error="the run is stopping" duration=0s`+"\n")
}

// The capture is made under the caller's context and its observation
// returned as it is; the capture is recorded.
func TestLoggedCapturePassesTheCaptureThroughAndRecordsIt(t *testing.T) {
	t.Parallel()
	clock := clocktest.NewClock(morning())
	log, records := recordedLog(clock, "claude-main")
	ctx := context.WithValue(t.Context(), contextKey{}, "the caller's")
	observation := capture.Observation{
		Source:     "claude-main",
		ObservedAt: morning().UTC(),
		Agents:     []capture.Agent{{ID: "session-1", State: capture.Idle}},
	}
	capturer := loggedCapture{capture: func(given context.Context) (capture.Observation, error) {
		if given != ctx {
			t.Error("the capture was not given the caller's context")
		}
		clock.Advance(time.Second)
		return observation, nil
	}, ending: &readEnd{}, log: log}

	got, err := capturer.Capture(ctx)

	if err != nil {
		t.Fatal(err)
	}
	if got.Source != observation.Source || got.ObservedAt != observation.ObservedAt || len(got.Agents) != 1 || &got.Agents[0] != &observation.Agents[0] {
		t.Errorf("got the observation %v, want the capture's own %v", got, observation)
	}
	assertRecords(t, records,
		"time=2026-10-09T11:28:11.000+03:00 level=DEBUG msg=capture source=claude-main outcome=ok duration=1s\n")
}

// A cancelled context reaches the capture as it is, and the capture's
// error is returned as it is and recorded.
func TestLoggedCapturePassesACancellationAndItsErrorThrough(t *testing.T) {
	t.Parallel()
	clock := clocktest.NewClock(morning())
	log, records := recordedLog(clock, "claude-main")
	failure := errors.New("the run is stopping")
	ctx, cancel := context.WithCancelCause(t.Context())
	cancel(failure)
	capturer := loggedCapture{capture: func(given context.Context) (capture.Observation, error) {
		if given != ctx {
			t.Error("the capture was not given the caller's context")
		}
		return capture.Observation{}, context.Cause(given)
	}, ending: &readEnd{}, log: log}

	_, err := capturer.Capture(ctx)

	if err != failure || !errors.Is(err, failure) {
		t.Errorf("got the error %v, want %v itself", err, failure)
	}
	assertRecords(t, records,
		`time=2026-10-09T11:28:10.000+03:00 level=DEBUG msg=capture source=claude-main outcome=error error="the run is stopping" duration=0s`+"\n")
}

// deadlineStandIn is a deadline whose limit the test ends: it records the
// context it was given and counts its releases.
type deadlineStandIn struct {
	given    context.Context
	limited  context.Context
	end      context.CancelCauseFunc
	releases int
}

func (d *deadlineStandIn) limit(ctx context.Context) (context.Context, func()) {
	d.given = ctx
	d.limited, d.end = context.WithCancelCause(ctx)
	return d.limited, func() {
		d.releases++
		d.end(context.Canceled)
	}
}

// The limit is set on the caller's context and its context returned as it
// is; the release releases it once and records the limit given, that it
// did not end the read, and how long it was held.
func TestLoggedDeadlinePassesTheLimitThroughAndRecordsItsRelease(t *testing.T) {
	t.Parallel()
	clock := clocktest.NewClock(morning())
	log, records := recordedLog(clock, "claude-main")
	ctx := context.WithValue(t.Context(), contextKey{}, "the caller's")
	standIn := &deadlineStandIn{}
	deadline := loggedDeadline{limit: standIn.limit, given: 5 * time.Second, ending: &readEnd{}, log: log}

	limited, release := deadline.Limit(ctx)

	if standIn.given != ctx {
		t.Error("the deadline was not given the caller's context")
	}
	if limited != standIn.limited {
		t.Error("got a limited context other than the deadline's")
	}
	assertRecords(t, records)
	clock.Advance(2 * time.Second)
	release()
	if standIn.releases != 1 {
		t.Errorf("released the limit %d times, want 1", standIn.releases)
	}
	assertRecords(t, records,
		"time=2026-10-09T11:28:12.000+03:00 level=DEBUG msg=deadline source=claude-main limit=5s expired=false outcome=ok duration=2s\n")
}

// A limit that had ended the read when the capture under it returned, its
// context ended with context.DeadlineExceeded, is recorded as expired; one
// whose context ended with the caller's, whatever the caller's cause, or
// that ended only after the capture returned, is not.
func TestLoggedDeadlineRecordsWhetherTheLimitEndedTheRead(t *testing.T) {
	t.Parallel()
	limitEnds := func(standIn *deadlineStandIn, _ context.CancelCauseFunc) { standIn.end(context.DeadlineExceeded) }
	tests := []struct {
		name                  string
		duringRead, afterRead func(standIn *deadlineStandIn, cancel context.CancelCauseFunc)
		expired               string
	}{
		{"the limit ended the read", limitEnds, nil, "true"},
		{"the limit ended after the read returned", nil, limitEnds, "false"},
		{"the caller cancelled", func(_ *deadlineStandIn, cancel context.CancelCauseFunc) {
			cancel(context.Canceled)
		}, nil, "false"},
		{"the caller's own deadline", func(_ *deadlineStandIn, cancel context.CancelCauseFunc) {
			cancel(context.DeadlineExceeded)
		}, nil, "false"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			clock := clocktest.NewClock(morning())
			log, records := recordedLog(clock, "claude-side")
			ctx, cancel := context.WithCancelCause(t.Context())
			defer cancel(nil)
			standIn := &deadlineStandIn{}
			ending := &readEnd{}
			capturer := loggedCapture{capture: func(context.Context) (capture.Observation, error) {
				clock.Advance(5 * time.Second)
				if test.duringRead != nil {
					test.duringRead(standIn, cancel)
				}
				return capture.Observation{Source: "claude-side"}, nil
			}, ending: ending, log: log}
			limited, release := loggedDeadline{limit: standIn.limit, given: 5 * time.Second, ending: ending, log: log}.Limit(ctx)
			if _, err := capturer.Capture(limited); err != nil {
				t.Fatal(err)
			}
			if test.afterRead != nil {
				test.afterRead(standIn, cancel)
			}

			release()

			assertRecords(t, records,
				"time=2026-10-09T11:28:15.000+03:00 level=DEBUG msg=capture source=claude-side outcome=ok duration=5s\n",
				"time=2026-10-09T11:28:15.000+03:00 level=DEBUG msg=deadline source=claude-side limit=5s expired="+test.expired+" outcome=ok duration=5s\n")
		})
	}
}

// Each limit is recorded by what ended its own read: a limit that ended
// one attempt's read leaves the next attempt's deadline not expired.
func TestLoggedDeadlineRecordsEachLimitOnItsOwn(t *testing.T) {
	t.Parallel()
	clock := clocktest.NewClock(morning())
	log, records := recordedLog(clock, "claude-main")
	ending := &readEnd{}
	standIn := &deadlineStandIn{}
	deadline := loggedDeadline{limit: standIn.limit, given: 5 * time.Second, ending: ending, log: log}
	capturer := loggedCapture{capture: func(ctx context.Context) (capture.Observation, error) {
		return capture.Observation{}, context.Cause(ctx)
	}, ending: ending, log: log}

	limited, release := deadline.Limit(t.Context())
	standIn.end(context.DeadlineExceeded)
	_, _ = capturer.Capture(limited)
	release()
	limited, release = deadline.Limit(t.Context())
	_, _ = capturer.Capture(limited)
	release()

	at := "time=2026-10-09T11:28:10.000+03:00 level=DEBUG "
	assertRecords(t, records,
		at+`msg=capture source=claude-main outcome=error error="context deadline exceeded" duration=0s`+"\n",
		at+"msg=deadline source=claude-main limit=5s expired=true outcome=ok duration=0s\n",
		at+"msg=capture source=claude-main outcome=ok duration=0s\n",
		at+"msg=deadline source=claude-main limit=5s expired=false outcome=ok duration=0s\n")
}

// The observation is published as it is, and the publisher's error
// returned as it is; the publish is recorded.
func TestLoggedPublishPassesTheObservationAndItsErrorThrough(t *testing.T) {
	t.Parallel()
	clock := clocktest.NewClock(morning())
	log, records := recordedLog(clock, "claude-main")
	failure := errors.New("jsonl: write record: the pipe is closed")
	observation := capture.Observation{
		Source:     "claude-main",
		ObservedAt: morning().UTC(),
		Agents:     []capture.Agent{{ID: "session-1", State: capture.Working}},
	}
	var published []capture.Observation
	publish := loggedPublish{publish: func(given capture.Observation) error {
		published = append(published, given)
		clock.Advance(4 * time.Second)
		return failure
	}, log: log}

	err := publish.Publish(observation)

	if err != failure || !errors.Is(err, failure) {
		t.Errorf("got the error %v, want %v itself", err, failure)
	}
	if len(published) != 1 {
		t.Fatalf("published %d observations, want 1", len(published))
	}
	if got := published[0]; got.Source != observation.Source || got.ObservedAt != observation.ObservedAt || len(got.Agents) != 1 || &got.Agents[0] != &observation.Agents[0] {
		t.Errorf("published %v, want the observation given, %v", got, observation)
	}
	assertRecords(t, records,
		`time=2026-10-09T11:28:14.000+03:00 level=DEBUG msg=publish source=claude-main outcome=error error="jsonl: write record: the pipe is closed" duration=4s`+"\n")
}

// A publish that succeeds is recorded as ok.
func TestLoggedPublishRecordsASuccessfulPublish(t *testing.T) {
	t.Parallel()
	clock := clocktest.NewClock(morning())
	log, records := recordedLog(clock, "claude-main")
	publish := loggedPublish{publish: func(capture.Observation) error { return nil }, log: log}

	if err := publish.Publish(capture.Observation{Source: "claude-main"}); err != nil {
		t.Fatal(err)
	}
	assertRecords(t, records,
		"time=2026-10-09T11:28:10.000+03:00 level=DEBUG msg=publish source=claude-main outcome=ok duration=0s\n")
}

// The wait is waited under the caller's context with the interval given;
// it is recorded with its interval and how long it took on the clock.
func TestLoggedWaitPassesTheWaitThroughAndRecordsIt(t *testing.T) {
	t.Parallel()
	clock := clocktest.NewClock(morning())
	log, records := recordedLog(clock, "claude-main")
	ctx := context.WithValue(t.Context(), contextKey{}, "the caller's")
	wait := loggedWait{wait: func(given context.Context, interval time.Duration) error {
		if given != ctx {
			t.Error("the wait was not given the caller's context")
		}
		clock.Advance(interval)
		return nil
	}, log: log}

	if err := wait.Wait(ctx, 5*time.Second); err != nil {
		t.Fatal(err)
	}
	assertRecords(t, records,
		"time=2026-10-09T11:28:15.000+03:00 level=DEBUG msg=wait source=claude-main interval=5s outcome=ok duration=5s\n")
}

// A cancelled context reaches the wait as it is, and the wait's error is
// returned as it is and recorded.
func TestLoggedWaitPassesACancellationAndItsErrorThrough(t *testing.T) {
	t.Parallel()
	clock := clocktest.NewClock(morning())
	log, records := recordedLog(clock, "claude-main")
	ctx, cancel := context.WithCancel(t.Context())
	cancel()
	var waitErr error
	wait := loggedWait{wait: func(given context.Context, _ time.Duration) error {
		if given != ctx {
			t.Error("the wait was not given the caller's context")
		}
		waitErr = given.Err()
		return waitErr
	}, log: log}

	err := wait.Wait(ctx, 5*time.Second)

	if err != waitErr || !errors.Is(err, context.Canceled) {
		t.Errorf("got the error %v, want the wait's own, %v", err, waitErr)
	}
	assertRecords(t, records,
		`time=2026-10-09T11:28:10.000+03:00 level=DEBUG msg=wait source=claude-main interval=5s outcome=error error="context canceled" duration=0s`+"\n")
}

// A logger above Debug, the default, takes no record: the decorated call
// still happens and returns as it is.
func TestTheDecoratorsRecordNothingByDefault(t *testing.T) {
	t.Parallel()
	clock := clocktest.NewClock(morning())
	records := newLines()
	log := sourceLog{logger: newLogger(records, false), clock: clock.Now, source: "claude-main"}
	failure := errors.New("jsonl: write record: the pipe is closed")
	publish := loggedPublish{publish: func(capture.Observation) error { return failure }, log: log}

	if err := publish.Publish(capture.Observation{Source: "claude-main"}); err != failure {
		t.Errorf("got the error %v, want %v itself", err, failure)
	}
	assertNoLines(t, "the log", records)
}
