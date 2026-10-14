package main

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/gokit/clocktest"
	"github.com/igor1309/ai-labs/warder/internal/attempt"
	"github.com/igor1309/ai-labs/warder/internal/capture"
	"github.com/igor1309/ai-labs/warder/internal/claude"
	"github.com/igor1309/ai-labs/warder/internal/codex"
	"github.com/igor1309/ai-labs/warder/internal/loop"
)

// Each decorator satisfies the interface of what it wraps.
var (
	_ claude.CommandExecutor                 = (*loggedExecute)(nil)
	_ codex.Files                            = (*loggedCodexFiles)(nil)
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

// filesStandIn is the files a decorator of them wraps: each operation
// checks that it was given the caller's context, advances the clock by a
// second, and returns the answer the test set, or failure.
type filesStandIn struct {
	t       *testing.T
	ctx     context.Context
	clock   *clocktest.Clock
	failure error

	names  []string
	locked bool
	found  []string
	size   int64
	data   []byte
	// asked is every operation, with what it was asked for.
	asked []string
}

func (f *filesStandIn) files() codexFiles {
	return codexFiles{
		list: func(given context.Context, dir string) ([]string, error) {
			f.ask(given, "list "+dir)
			return f.names, f.failure
		},
		locked: func(given context.Context, file string) (bool, error) {
			f.ask(given, "locked "+file)
			return f.locked, f.failure
		},
		find: func(given context.Context, dir, prefix, suffix string) ([]string, error) {
			f.ask(given, "find "+dir+" "+prefix+" "+suffix)
			return f.found, f.failure
		},
		size: func(given context.Context, file string) (int64, error) {
			f.ask(given, "size "+file)
			return f.size, f.failure
		},
		read: func(given context.Context, file string, offset, length int64) ([]byte, error) {
			f.ask(given, fmt.Sprintf("read %s %d %d", file, offset, length))
			return f.data, f.failure
		},
	}
}

func (f *filesStandIn) ask(given context.Context, asked string) {
	f.t.Helper()
	if given != f.ctx {
		f.t.Errorf("%s: the operation was not given the caller's context", asked)
	}
	f.asked = append(f.asked, asked)
	f.clock.Advance(time.Second)
}

// Each operation on the files is made under the caller's context, with
// what it was asked for, and its answer returned as it is; each is
// recorded with the source, the path, its outcome and its duration on the
// clock.
func TestLoggedCodexFilesPassEachOperationThroughAndRecordIt(t *testing.T) {
	t.Parallel()
	clock := clocktest.NewClock(morning())
	log, records := recordedLog(clock, "codex-main")
	ctx := context.WithValue(t.Context(), contextKey{}, "the caller's")
	standIn := &filesStandIn{
		t: t, ctx: ctx, clock: clock,
		names:  []string{".coordination.lock", "thread-1.lock"},
		locked: true,
		found:  []string{"sessions/2026/10/09/rollout-1-thread-1.jsonl"},
		size:   16 << 20,
		data:   []byte(turnStarted),
	}
	files := logCodexFiles(standIn.files(), log)

	names, err := files.List(ctx, "thread-writer-locks")
	if err != nil || len(names) != 2 || &names[0] != &standIn.names[0] {
		t.Errorf("got the names %q and the error %v, want the listing's own", names, err)
	}
	locked, err := files.Locked(ctx, "thread-writer-locks/thread-1.lock")
	if err != nil || !locked {
		t.Errorf("got locked %v and the error %v, want true", locked, err)
	}
	found, err := files.Find(ctx, "sessions", "rollout-", "-thread-1.jsonl")
	if err != nil || len(found) != 1 || &found[0] != &standIn.found[0] {
		t.Errorf("got the files %q and the error %v, want the search's own", found, err)
	}
	size, err := files.Size(ctx, "sessions/2026/10/09/rollout-1-thread-1.jsonl")
	if err != nil || size != 16<<20 {
		t.Errorf("got the size %d and the error %v, want %d", size, err, 16<<20)
	}
	data, err := files.Read(ctx, "sessions/2026/10/09/rollout-1-thread-1.jsonl", 15<<20, 1<<20)
	if err != nil || len(data) != len(standIn.data) || &data[0] != &standIn.data[0] {
		t.Errorf("got the data %q and the error %v, want the read's own", data, err)
	}

	asked := []string{
		"list thread-writer-locks",
		"locked thread-writer-locks/thread-1.lock",
		"find sessions rollout- -thread-1.jsonl",
		"size sessions/2026/10/09/rollout-1-thread-1.jsonl",
		"read sessions/2026/10/09/rollout-1-thread-1.jsonl 15728640 1048576",
	}
	if !slices.Equal(standIn.asked, asked) {
		t.Errorf("got the operations %q, want %q", standIn.asked, asked)
	}
	assertRecords(t, records,
		`time=2026-10-09T11:28:11.000+03:00 level=DEBUG msg="list directory" source=codex-main path=thread-writer-locks outcome=ok duration=1s`+"\n",
		`time=2026-10-09T11:28:12.000+03:00 level=DEBUG msg="probe lock" source=codex-main path=thread-writer-locks/thread-1.lock outcome=ok duration=1s`+"\n",
		`time=2026-10-09T11:28:13.000+03:00 level=DEBUG msg="find files" source=codex-main path=sessions prefix=rollout- suffix=-thread-1.jsonl outcome=ok duration=1s`+"\n",
		`time=2026-10-09T11:28:14.000+03:00 level=DEBUG msg="file size" source=codex-main path=sessions/2026/10/09/rollout-1-thread-1.jsonl outcome=ok duration=1s`+"\n",
		`time=2026-10-09T11:28:15.000+03:00 level=DEBUG msg="read file" source=codex-main path=sessions/2026/10/09/rollout-1-thread-1.jsonl offset=15728640 length=1048576 outcome=ok duration=1s`+"\n")
}

// A cancelled context reaches each operation as it is, and the
// operation's error is returned as it is, with what the operation
// returned, and recorded.
func TestLoggedCodexFilesPassACancellationAndEachErrorThrough(t *testing.T) {
	t.Parallel()
	clock := clocktest.NewClock(morning())
	log, records := recordedLog(clock, "codex-main")
	failure := errors.New("the run is stopping")
	ctx, cancel := context.WithCancelCause(t.Context())
	cancel(failure)
	standIn := &filesStandIn{t: t, ctx: ctx, clock: clock, failure: failure}
	files := logCodexFiles(standIn.files(), log)

	names, listErr := files.List(ctx, "thread-writer-locks")
	locked, lockedErr := files.Locked(ctx, "thread-writer-locks/thread-1.lock")
	found, findErr := files.Find(ctx, "sessions", "rollout-", "-thread-1.jsonl")
	size, sizeErr := files.Size(ctx, "sessions/rollout-1-thread-1.jsonl")
	data, readErr := files.Read(ctx, "sessions/rollout-1-thread-1.jsonl", 0, 64)

	for operation, err := range map[string]error{"list": listErr, "locked": lockedErr, "find": findErr, "size": sizeErr, "read": readErr} {
		if err != failure {
			t.Errorf("%s: got the error %v, want %v itself", operation, err, failure)
		}
	}
	if names != nil || locked || found != nil || size != 0 || data != nil {
		t.Errorf("got the answers %q, %v, %q, %d and %q, want none", names, locked, found, size, data)
	}
	at := func(second int) string {
		return fmt.Sprintf("time=2026-10-09T11:28:1%d.000+03:00 level=DEBUG ", second)
	}
	ended := ` outcome=error error="the run is stopping" duration=1s` + "\n"
	assertRecords(t, records,
		at(1)+`msg="list directory" source=codex-main path=thread-writer-locks`+ended,
		at(2)+`msg="probe lock" source=codex-main path=thread-writer-locks/thread-1.lock`+ended,
		at(3)+`msg="find files" source=codex-main path=sessions prefix=rollout- suffix=-thread-1.jsonl`+ended,
		at(4)+`msg="file size" source=codex-main path=sessions/rollout-1-thread-1.jsonl`+ended,
		at(5)+`msg="read file" source=codex-main path=sessions/rollout-1-thread-1.jsonl offset=0 length=64`+ended)
}

// Missing files stay missing: the decorator of files with no function, or
// with one function missing, is nil, which the adapter rejects.
func TestLogCodexFilesOfMissingFilesIsNil(t *testing.T) {
	t.Parallel()
	clock := clocktest.NewClock(morning())
	log, _ := recordedLog(clock, "codex-main")
	whole := (&filesStandIn{t: t, ctx: t.Context(), clock: clock}).files()
	tests := map[string]func(files *codexFiles){
		"no function": func(files *codexFiles) { *files = codexFiles{} },
		"no list":     func(files *codexFiles) { files.list = nil },
		"no locked":   func(files *codexFiles) { files.locked = nil },
		"no find":     func(files *codexFiles) { files.find = nil },
		"no size":     func(files *codexFiles) { files.size = nil },
		"no read":     func(files *codexFiles) { files.read = nil },
	}
	for name, remove := range tests {
		files := whole
		remove(&files)
		if got := logCodexFiles(files, log); got != nil {
			t.Errorf("%s: got the decorator %v, want nil", name, got)
		}
		if _, err := codex.New(logCodexFiles(files, log), codex.Scan{Chunk: 1, Cap: 1}); err == nil || err.Error() != "codex: no files" {
			t.Errorf("%s: the adapter over the decorator: got the error %v, want codex: no files", name, err)
		}
	}
	if got := logCodexFiles(whole, log); got == nil {
		t.Error("got no decorator of files with every function, want one")
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
