package main

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"slices"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/gokit/clocktest"
	"github.com/igor1309/ai-labs/warder/internal/capture"
	"github.com/igor1309/ai-labs/warder/internal/claude"
)

var (
	_ claude.CommandExecutor = executeFunc(nil)
	_ capture.Clock          = clockFunc(nil)
)

// lines is a writer that keeps each Write, and hands them to the test one
// by one, in order. It never blocks a writer and answers every Write with
// success.
type lines struct {
	mu      sync.Mutex
	arrived *sync.Cond
	written []string
	taken   int
}

func newLines() *lines {
	l := &lines{}
	l.arrived = sync.NewCond(&l.mu)
	return l
}

func (l *lines) Write(p []byte) (int, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.written = append(l.written, string(p))
	l.arrived.Broadcast()
	return len(p), nil
}

// next returns the first Write that no earlier call returned, once it has
// arrived. It waits without polling: a Write that never arrives is a hang,
// which the test binary's -timeout reports.
func (l *lines) next() string {
	l.mu.Lock()
	defer l.mu.Unlock()
	for len(l.written) <= l.taken {
		l.arrived.Wait()
	}
	l.taken++
	return l.written[l.taken-1]
}

// all lists every Write so far, in order.
func (l *lines) all() []string {
	l.mu.Lock()
	defer l.mu.Unlock()
	return slices.Clone(l.written)
}

// failingWriter fails every Write with the error the test set.
type failingWriter struct{ err error }

func (w failingWriter) Write([]byte) (int, error) { return 0, w.err }

// executorSpy is the command executor of these tests: it records every
// command, and answers each with what the test's answer gives for it, by
// its number from 1 and under its context. It fills in nothing else.
type executorSpy struct {
	answer func(ctx context.Context, call int) ([]byte, error)

	mu       sync.Mutex
	commands []string
}

func (s *executorSpy) execute(ctx context.Context, name string, args ...string) ([]byte, error) {
	s.mu.Lock()
	s.commands = append(s.commands, strings.Join(append([]string{name}, args...), " "))
	call := len(s.commands)
	s.mu.Unlock()
	return s.answer(ctx, call)
}

// executed lists every command so far, in order.
func (s *executorSpy) executed() []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return slices.Clone(s.commands)
}

// sessions is an output of `claude agents --json` with a session of each
// state, and observationLine the record of it.
const sessions = `[{"sessionId":"session-1","status":"busy"},{"sessionId":"session-2","status":"idle"},{"sessionId":"session-3","state":"blocked"}]`

func observationLine(source, observedAt string) string {
	return `{"source":"` + source + `","observedAt":"` + observedAt + `","agents":[` +
		`{"id":"session-1","state":"working"},{"id":"session-2","state":"idle"},{"id":"session-3","state":"unknown"}]}` + "\n"
}

// answerSessions answers every command with sessions.
func answerSessions(context.Context, int) ([]byte, error) { return []byte(sessions), nil }

// untilEnded is a command that never ends by itself: it blocks until its
// context ends and fails with the context's cause.
func untilEnded(ctx context.Context) ([]byte, error) {
	<-ctx.Done()
	return nil, context.Cause(ctx)
}

// morning is 2026-10-09T08:28:10Z, told in another zone.
func morning() time.Time {
	return time.Date(2026, 10, 9, 11, 28, 10, 0, time.FixedZone("UTC+3", 3*60*60))
}

// application is one run of the whole application, in process.
type application struct {
	cancel   context.CancelFunc
	returned chan struct{}
	code     int
}

// startApplication runs the application with args, over the writers, the
// executor and the clock given, with the clock's timer and no Codex home:
// its sources are Claude Code's. The end of the test cancels the run and
// waits for it to return.
func startApplication(t *testing.T, stdout, stderr io.Writer, execute executeFunc, clock *clocktest.Clock, args ...string) *application {
	t.Helper()
	return startObservedApplication(t, stdout, stderr, execute, codexFiles{}, clock, nil, args...)
}

// startObservedApplication is startApplication over the Codex home that
// files reads, with attempted called as each Write to stderr begins,
// before it waits for its turn.
func startObservedApplication(t *testing.T, stdout, stderr io.Writer, execute executeFunc, files codexFiles, clock *clocktest.Clock, attempted func(), args ...string) *application {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	a := &application{cancel: cancel, returned: make(chan struct{})}
	go func() {
		defer close(a.returned)
		a.code = run(ctx, args, stdout, stderr, execute, files, clock.Now, clock.Timer, attempted)
	}()
	t.Cleanup(func() {
		cancel()
		<-a.returned
	})
	return a
}

// exitCode waits for the run to return and returns its exit code.
func (a *application) exitCode() int {
	<-a.returned
	return a.code
}

// assertNoLines fails unless nothing was written.
func assertNoLines(t *testing.T, name string, l *lines) {
	t.Helper()
	if got := l.all(); len(got) != 0 {
		t.Errorf("got on %s\n%s\nwant nothing", name, strings.Join(got, ""))
	}
}

// heldWriter holds each Write that holds selects until the test releases
// them, passes every other on at once, and keeps each in written. It
// reports each Write that arrives, and through attempt, the hook run
// takes, each that begins at the serial writer before it waits for its
// turn. It does not serialize: it counts each Write that arrives while
// another is in progress as an overlap.
type heldWriter struct {
	holds   func(p []byte) bool
	release chan struct{}
	written *lines

	mu       sync.Mutex
	changed  *sync.Cond
	state    heldState
	inFlight int
}

// heldState is what a heldWriter has seen so far.
type heldState struct {
	// arrived counts the Writes that reached the writer, attempted those
	// that began at the serial writer, held those held, and overlaps those
	// that arrived while another was in progress.
	arrived, attempted, held, overlaps int
}

// newHeldWriter is a heldWriter that holds each Write holds selects.
func newHeldWriter(holds func(p []byte) bool) *heldWriter {
	w := &heldWriter{holds: holds, release: make(chan struct{}), written: newLines()}
	w.changed = sync.NewCond(&w.mu)
	return w
}

// holdEvery selects every Write.
func holdEvery([]byte) bool { return true }

func (w *heldWriter) Write(p []byte) (int, error) {
	held := w.holds(p)
	w.mu.Lock()
	w.state.arrived++
	if w.inFlight > 0 {
		w.state.overlaps++
	}
	w.inFlight++
	if held {
		w.state.held++
	}
	w.changed.Broadcast()
	w.mu.Unlock()

	if held {
		<-w.release
	}
	n, err := w.written.Write(p)

	w.mu.Lock()
	w.inFlight--
	w.mu.Unlock()
	return n, err
}

// attempt reports a Write that began at the serial writer.
func (w *heldWriter) attempt() {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.state.attempted++
	w.changed.Broadcast()
}

// waitUntil returns what the writer has seen once reached holds of it. It
// waits without polling: a state never reached is a hang, which the test
// binary's -timeout reports.
func (w *heldWriter) waitUntil(reached func(seen heldState) bool) heldState {
	w.mu.Lock()
	defer w.mu.Unlock()
	for !reached(w.state) {
		w.changed.Wait()
	}
	return w.state
}

// seen is what the writer has seen so far.
func (w *heldWriter) seen() heldState {
	return w.waitUntil(func(heldState) bool { return true })
}

// The first read happens at once and its observation is one JSONL line on
// stdout: the contract's fields, the source ID given and the clock's time
// in UTC. The source then waits 5 seconds, and reads again only once that
// timer fired.
func TestASourceIsReadAtOnceAndAgainAfterItsWait(t *testing.T) {
	t.Parallel()
	clock := clocktest.NewClock(morning())
	stdout, stderr := newLines(), newLines()
	executor := &executorSpy{answer: answerSessions}
	startApplication(t, stdout, stderr, executor.execute, clock, "warder", "-claude", "claude-main")

	if got, want := stdout.next(), observationLine("claude-main", "2026-10-09T08:28:10Z"); got != want {
		t.Errorf("got the first record\n%swant\n%s", got, want)
	}
	// The read's deadline, then the wait after the attempt: both 5 seconds.
	clock.Started(5 * time.Second)
	clock.Started(5 * time.Second)
	if got, want := executor.executed(), []string{"claude agents --json"}; !slices.Equal(got, want) {
		t.Errorf("while the source waits, got the commands %q, want %q", got, want)
	}

	clock.Advance(5 * time.Second)

	if got, want := stdout.next(), observationLine("claude-main", "2026-10-09T08:28:15Z"); got != want {
		t.Errorf("got the second record\n%swant\n%s", got, want)
	}
	if got, want := executor.executed(), []string{"claude agents --json", "claude agents --json"}; !slices.Equal(got, want) {
		t.Errorf("got the commands %q, want %q", got, want)
	}
	assertNoLines(t, "stderr", stderr)
}

// Two sources both publish, each under its own ID, on the one stdout.
func TestTwoSourcesPublishEachUnderItsOwnID(t *testing.T) {
	t.Parallel()
	clock := clocktest.NewClock(morning())
	stdout, stderr := newLines(), newLines()
	executor := &executorSpy{answer: answerSessions}
	startApplication(t, stdout, stderr, executor.execute, clock, "warder", "-claude", "claude-main", "-claude", "claude-side")

	got := []string{stdout.next(), stdout.next()}
	slices.Sort(got)
	want := []string{
		observationLine("claude-main", "2026-10-09T08:28:10Z"),
		observationLine("claude-side", "2026-10-09T08:28:10Z"),
	}
	if !slices.Equal(got, want) {
		t.Errorf("got the records\n%swant\n%s", strings.Join(got, ""), strings.Join(want, ""))
	}
	assertNoLines(t, "stderr", stderr)
}

// A source whose executor blocks does not keep the other from publishing:
// the first command blocks until its context ends, and the other source's
// record arrives while it does.
func TestABlockedSourceDoesNotKeepAnotherFromPublishing(t *testing.T) {
	t.Parallel()
	clock := clocktest.NewClock(morning())
	stdout, stderr := newLines(), newLines()
	blocked := make(chan struct{})
	executor := &executorSpy{answer: func(ctx context.Context, call int) ([]byte, error) {
		if call == 1 {
			close(blocked)
			return untilEnded(ctx)
		}
		return []byte(sessions), nil
	}}
	startApplication(t, stdout, stderr, executor.execute, clock, "warder", "-claude", "claude-main", "-claude", "claude-side")

	<-blocked
	got := stdout.next()
	if got != observationLine("claude-main", "2026-10-09T08:28:10Z") && got != observationLine("claude-side", "2026-10-09T08:28:10Z") {
		t.Errorf("got the record\n%swant that of one of the two sources", got)
	}
}

// A failing executor gives no line on stdout and one on stderr, which
// names its source; the next attempt follows after the wait.
func TestAFailedReadIsReportedAndTheNextAttemptFollows(t *testing.T) {
	t.Parallel()
	clock := clocktest.NewClock(morning())
	stdout, stderr := newLines(), newLines()
	executor := &executorSpy{answer: func(_ context.Context, call int) ([]byte, error) {
		if call == 1 {
			return nil, errors.New("exit status 1: not logged in")
		}
		return []byte(sessions), nil
	}}
	startApplication(t, stdout, stderr, executor.execute, clock, "warder", "-claude", "claude-main")

	diagnostic := stderr.next()
	if !strings.HasPrefix(diagnostic, "warder: claude-main: ") || !strings.HasSuffix(diagnostic, ": exit status 1: not logged in\n") || !strings.Contains(diagnostic, "read failed") {
		t.Errorf("got the diagnostic %q, want `warder: claude-main: <a read that failed>: exit status 1: not logged in`", diagnostic)
	}
	// The read's deadline, then the wait after the attempt.
	clock.Started(5 * time.Second)
	clock.Started(5 * time.Second)
	assertNoLines(t, "stdout", stdout)

	clock.Advance(5 * time.Second)

	if got, want := stdout.next(), observationLine("claude-main", "2026-10-09T08:28:15Z"); got != want {
		t.Errorf("got the record of the next attempt\n%swant\n%s", got, want)
	}
	if got := stderr.all(); len(got) != 1 {
		t.Errorf("got %d lines on stderr, want 1:\n%s", len(got), strings.Join(got, ""))
	}
}

// An executor that blocks until its context ends is ended by the 5-second
// deadline, and the read is reported on stderr as one that timed out.
func TestABlockedReadIsEndedByItsDeadlineAndReportedAsATimeout(t *testing.T) {
	t.Parallel()
	clock := clocktest.NewClock(morning())
	stdout, stderr := newLines(), newLines()
	executor := &executorSpy{answer: func(ctx context.Context, _ int) ([]byte, error) { return untilEnded(ctx) }}
	startApplication(t, stdout, stderr, executor.execute, clock, "warder", "-claude", "claude-main")

	clock.Started(5 * time.Second)
	assertNoLines(t, "stderr", stderr)

	clock.Advance(5 * time.Second)

	diagnostic := stderr.next()
	if !strings.HasPrefix(diagnostic, "warder: claude-main: ") || !strings.Contains(diagnostic, "read timed out") || !strings.HasSuffix(diagnostic, ": context deadline exceeded\n") {
		t.Errorf("got the diagnostic %q, want `warder: claude-main: <a read that timed out>: context deadline exceeded`", diagnostic)
	}
	// The wait after the attempt: the attempt has returned.
	clock.Started(5 * time.Second)
	assertNoLines(t, "stdout", stdout)
}

// A stdout that fails ends the run with exit code 1 and a message on
// stderr.
func TestAFailingStdoutEndsTheRunWithExitCode1(t *testing.T) {
	t.Parallel()
	clock := clocktest.NewClock(morning())
	stderr := newLines()
	executor := &executorSpy{answer: answerSessions}
	app := startApplication(t, failingWriter{err: errors.New("the pipe is closed")}, stderr, executor.execute, clock, "warder", "-claude", "claude-main")

	if got := app.exitCode(); got != 1 {
		t.Errorf("got the exit code %d, want 1", got)
	}
	got := stderr.all()
	if len(got) != 1 || !strings.HasPrefix(got[0], "warder: ") || !strings.HasSuffix(got[0], ": the pipe is closed\n") {
		t.Errorf("got on stderr %q, want one line `warder: <what failed>: the pipe is closed`", got)
	}
}

// A stdout whose write fails after the run's context ended still ends the
// run with exit code 1 and the output error on stderr: the read succeeded,
// its observation is published, and the cancellation silences only
// diagnostics, never a fatal output error.
func TestAFailingStdoutAfterCancellationEndsTheRunWithExitCode1(t *testing.T) {
	t.Parallel()
	clock := clocktest.NewClock(morning())
	stderr := newLines()
	executor := &executorSpy{answer: answerSessions}
	ctx, cancel := context.WithCancel(t.Context())
	defer cancel()
	stdout := &writeSpy{answer: func([]byte) (int, error) {
		cancel()
		return 0, errors.New("the pipe is closed")
	}}

	code := run(ctx, []string{"warder", "-claude", "claude-main"}, stdout, stderr, executor.execute, codexFiles{}, clock.Now, clock.Timer, nil)

	if code != 1 {
		t.Errorf("got the exit code %d, want 1", code)
	}
	if len(stdout.writes) != 1 {
		t.Errorf("got %d writes to stdout, want 1:\n%s", len(stdout.writes), strings.Join(stdout.writes, ""))
	}
	got := stderr.all()
	if len(got) != 1 || !strings.HasPrefix(got[0], "warder: ") || !strings.HasSuffix(got[0], ": the pipe is closed\n") {
		t.Errorf("got on stderr %q, want one line `warder: <what failed>: the pipe is closed`", got)
	}
}

// The two sources publish through one publisher: both reads succeed, held
// by the executor until both commands arrived, the first record's write to
// stdout fails, and the other source's record is never written. The run
// exits 1.
func TestTwoSourcesShareOnePublisherThatAFailedWriteBreaks(t *testing.T) {
	t.Parallel()
	clock := clocktest.NewClock(morning())
	stdout := &writeSpy{answer: func([]byte) (int, error) { return 0, errors.New("the pipe is closed") }}
	stderr := newLines()
	var arrived sync.WaitGroup
	arrived.Add(2)
	executor := &executorSpy{answer: func(context.Context, int) ([]byte, error) {
		arrived.Done()
		arrived.Wait()
		return []byte(sessions), nil
	}}
	app := startApplication(t, stdout, stderr, executor.execute, clock, "warder", "-claude", "claude-main", "-claude", "claude-side")

	if got := app.exitCode(); got != 1 {
		t.Errorf("got the exit code %d, want 1", got)
	}
	// The run returned after both loops did, each after its publish.
	if len(stdout.writes) != 1 {
		t.Errorf("got %d writes to stdout, want 1:\n%s", len(stdout.writes), strings.Join(stdout.writes, ""))
	}
	got := stderr.all()
	if len(got) != 1 || !strings.HasPrefix(got[0], "warder: ") || !strings.HasSuffix(got[0], ": the pipe is closed\n") {
		t.Errorf("got on stderr %q, want one line `warder: <what failed>: the pipe is closed`", got)
	}
}

// Cancelling the context ends the run with exit code 0, after every loop
// returned: the one whose read was in progress, which the cancellation
// ends, and the one that was waiting, whose timer is stopped. A read ended
// by the cancellation is not reported.
func TestCancellationEndsTheRunWithExitCode0AfterEveryLoopReturned(t *testing.T) {
	t.Parallel()
	clock := clocktest.NewClock(morning())
	stdout, stderr := newLines(), newLines()
	blocked := make(chan struct{})
	var ended atomic.Bool
	executor := &executorSpy{answer: func(ctx context.Context, call int) ([]byte, error) {
		if call == 1 {
			close(blocked)
			defer ended.Store(true)
			return untilEnded(ctx)
		}
		return []byte(sessions), nil
	}}
	app := startApplication(t, stdout, stderr, executor.execute, clock, "warder", "-claude", "claude-main", "-claude", "claude-side")
	<-blocked
	stdout.next()
	// Each source's deadline, then the wait of the one that published.
	clock.Started(5 * time.Second)
	clock.Started(5 * time.Second)
	clock.Started(5 * time.Second)

	app.cancel()

	if got := app.exitCode(); got != 0 {
		t.Errorf("got the exit code %d, want 0", got)
	}
	if !ended.Load() {
		t.Error("the run returned before the read in progress ended")
	}
	if got := clock.Pending(); got != 0 {
		t.Errorf("%d timers are left running, want none", got)
	}
	assertNoLines(t, "stderr", stderr)
}

// With no -verbose, logging is off: a read that fails, then one that
// succeeds, write on stdout exactly the second's record and on stderr
// exactly the first's diagnostic, nothing else, through the second
// attempt's release and into its wait.
func TestWithoutVerboseStdoutAndStderrCarryNoLog(t *testing.T) {
	t.Parallel()
	clock := clocktest.NewClock(morning())
	stdout, stderr := newLines(), newLines()
	executor := &executorSpy{answer: func(_ context.Context, call int) ([]byte, error) {
		if call == 1 {
			return nil, errors.New("exit status 1: not logged in")
		}
		return []byte(sessions), nil
	}}
	startApplication(t, stdout, stderr, executor.execute, clock, "warder", "-claude", "claude-main")
	stderr.next()
	clock.Started(5 * time.Second)
	clock.Started(5 * time.Second)
	clock.Advance(5 * time.Second)
	stdout.next()
	// The second attempt's deadline and wait: it released its limit.
	clock.Started(5 * time.Second)
	clock.Started(5 * time.Second)

	if got, want := stdout.all(), []string{observationLine("claude-main", "2026-10-09T08:28:15Z")}; !slices.Equal(got, want) {
		t.Errorf("got on stdout\n%swant\n%s", strings.Join(got, ""), strings.Join(want, ""))
	}
	want := []string{"warder: claude-main: attempt: read failed: capture: read agents: claude: execute claude agents --json: exit status 1: not logged in\n"}
	if got := stderr.all(); !slices.Equal(got, want) {
		t.Errorf("got on stderr\n%swant\n%s", strings.Join(got, ""), strings.Join(want, ""))
	}
}

// With -verbose, each step of a source's attempt is one slog text record
// on stderr, at Debug, with the source ID, its outcome and its duration on
// the clock: the execution, the read, the capture, the publish, the
// deadline once released, and the wait once it ended. stdout carries the
// same records as without -verbose.
func TestVerboseRecordsEachStepOfASourceOnStderr(t *testing.T) {
	t.Parallel()
	clock := clocktest.NewClock(morning())
	stdout, stderr := newLines(), newLines()
	executor := &executorSpy{answer: answerSessions}
	startApplication(t, stdout, stderr, executor.execute, clock, "warder", "-verbose", "-claude", "claude-main")

	if got, want := stdout.next(), observationLine("claude-main", "2026-10-09T08:28:10Z"); got != want {
		t.Errorf("got the first record\n%swant\n%s", got, want)
	}
	first := "time=2026-10-09T11:28:10.000+03:00 level=DEBUG "
	for _, want := range []string{
		first + "msg=execute source=claude-main command=claude outcome=ok duration=0s\n",
		first + `msg="read agents" source=claude-main outcome=ok duration=0s` + "\n",
		first + "msg=capture source=claude-main outcome=ok duration=0s\n",
		first + "msg=publish source=claude-main outcome=ok duration=0s\n",
		first + "msg=deadline source=claude-main limit=5s expired=false outcome=ok duration=0s\n",
	} {
		if got := stderr.next(); got != want {
			t.Errorf("got on stderr\n%swant\n%s", got, want)
		}
	}
	clock.Started(5 * time.Second)
	clock.Started(5 * time.Second)

	clock.Advance(5 * time.Second)

	if got, want := stderr.next(), "time=2026-10-09T11:28:15.000+03:00 level=DEBUG msg=wait source=claude-main interval=5s outcome=ok duration=5s\n"; got != want {
		t.Errorf("got on stderr\n%swant\n%s", got, want)
	}
	if got, want := stdout.next(), observationLine("claude-main", "2026-10-09T08:28:15Z"); got != want {
		t.Errorf("got the second record\n%swant\n%s", got, want)
	}
}

// With -verbose, a read that its deadline ended is recorded with its
// errors and the deadline as expired, and its diagnostic is still one
// line of its own: every write to stderr is one whole line, a record or
// the diagnostic. Nothing goes to stdout.
func TestVerboseRecordsATimedOutReadBesideItsDiagnostic(t *testing.T) {
	t.Parallel()
	clock := clocktest.NewClock(morning())
	stdout, stderr := newLines(), newLines()
	blocked := make(chan struct{})
	executor := &executorSpy{answer: func(ctx context.Context, call int) ([]byte, error) {
		if call == 1 {
			close(blocked)
		}
		return untilEnded(ctx)
	}}
	startApplication(t, stdout, stderr, executor.execute, clock, "warder", "-verbose", "-claude", "claude-main")
	clock.Started(5 * time.Second)
	// The deadline's timer starts before the capture, the read and the
	// execution begin: the command has arrived once each has read the time
	// it began at.
	<-blocked

	clock.Advance(5 * time.Second)

	at := "time=2026-10-09T11:28:15.000+03:00 level=DEBUG "
	for _, want := range []string{
		at + `msg=execute source=claude-main command=claude outcome=error error="context deadline exceeded" duration=5s` + "\n",
		at + `msg="read agents" source=claude-main outcome=error error="claude: execute claude agents --json: context deadline exceeded" duration=5s` + "\n",
		at + `msg=capture source=claude-main outcome=error error="capture: read agents: claude: execute claude agents --json: context deadline exceeded" duration=5s` + "\n",
		"warder: claude-main: attempt: read timed out: capture: read agents: claude: execute claude agents --json: context deadline exceeded\n",
		at + "msg=deadline source=claude-main limit=5s expired=true outcome=ok duration=5s\n",
	} {
		if got := stderr.next(); got != want {
			t.Errorf("got on stderr\n%swant\n%s", got, want)
		}
	}
	// The wait after the attempt: the attempt has returned.
	clock.Started(5 * time.Second)
	assertNoLines(t, "stdout", stdout)
}

// With -verbose, a deadline that fires after the read succeeded, while
// the observation's write to stdout is held, ended nothing: the deadline
// is recorded as not expired, with the source ID given.
func TestVerboseRecordsADeadlineThatFiredDuringThePublishAsNotExpired(t *testing.T) {
	t.Parallel()
	clock := clocktest.NewClock(morning())
	stdout, stderr := newHeldWriter(holdEvery), newLines()
	read := make(chan context.Context, 1)
	executor := &executorSpy{answer: func(ctx context.Context, _ int) ([]byte, error) {
		read <- ctx
		return []byte(sessions), nil
	}}
	startApplication(t, stdout, stderr, executor.execute, clock, "warder", "-verbose", "-claude", "claude-side")
	limited := <-read
	stdout.waitUntil(func(seen heldState) bool { return seen.held == 1 })
	clock.Started(5 * time.Second)

	clock.Advance(5 * time.Second)
	<-limited.Done()
	if cause := context.Cause(limited); !errors.Is(cause, context.DeadlineExceeded) {
		t.Fatalf("the read's context ended with %v, want the deadline", cause)
	}
	close(stdout.release)

	if got, want := stdout.written.next(), observationLine("claude-side", "2026-10-09T08:28:10Z"); got != want {
		t.Errorf("got the record\n%swant\n%s", got, want)
	}
	read10 := "time=2026-10-09T11:28:10.000+03:00 level=DEBUG "
	released15 := "time=2026-10-09T11:28:15.000+03:00 level=DEBUG "
	for _, want := range []string{
		read10 + "msg=execute source=claude-side command=claude outcome=ok duration=0s\n",
		read10 + `msg="read agents" source=claude-side outcome=ok duration=0s` + "\n",
		read10 + "msg=capture source=claude-side outcome=ok duration=0s\n",
		released15 + "msg=publish source=claude-side outcome=ok duration=5s\n",
		released15 + "msg=deadline source=claude-side limit=5s expired=false outcome=ok duration=5s\n",
	} {
		if got := stderr.next(); got != want {
			t.Errorf("got on stderr\n%swant\n%s", got, want)
		}
	}
}

// A command line that enables no valid set of sources is a usage error: a
// message on stderr, exit code 2, nothing on stdout, and nothing started
// or read, neither a command nor a timer nor a file of the Codex home.
// The ID rules are the same for both runtimes, and one ID is one source,
// whichever flags give it.
func TestAUsageErrorExitsWithCode2AndStartsNothing(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name string
		args []string
		says string
	}{
		{"no source", []string{"warder"}, "no source enabled"},
		{"no arguments at all", nil, "no source enabled"},
		{"an empty ID", []string{"warder", "-claude", ""}, "empty source ID"},
		{"an ID that is not UTF-8", []string{"warder", "-claude", "\xff"}, `source ID "\xff" is not valid UTF-8`},
		{"an ID cut inside a character", []string{"warder", "-claude", "claude-\xc3"}, `source ID "claude-\xc3" is not valid UTF-8`},
		{"an invalid ID after a valid one", []string{"warder", "-claude", "claude-main", "-claude", "claude-\xed\xa0\x80"}, `source ID "claude-\xed\xa0\x80" is not valid UTF-8`},
		{"a flag with no ID", []string{"warder", "-claude"}, "flag needs an argument: -claude"},
		{"a duplicate ID", []string{"warder", "-claude", "claude-main", "-claude", "claude-main"}, `source ID "claude-main" is given twice`},
		// -codex is a flag since LAB-158, so the unknown flag is another.
		{"an unknown flag", []string{"warder", "-claude", "claude-main", "-gemini", "gemini-main"}, "flag provided but not defined: -gemini"},
		{"an empty Codex ID", []string{"warder", "-codex", ""}, "empty source ID"},
		{"a Codex ID that is not UTF-8", []string{"warder", "-codex", "\xff"}, `source ID "\xff" is not valid UTF-8`},
		{"an invalid Codex ID after a valid one", []string{"warder", "-claude", "claude-main", "-codex", "codex-\xc3"}, `source ID "codex-\xc3" is not valid UTF-8`},
		{"a Codex flag with no ID", []string{"warder", "-codex"}, "flag needs an argument: -codex"},
		{"a duplicate Codex ID", []string{"warder", "-codex", "codex-main", "-codex", "codex-main"}, `source ID "codex-main" is given twice`},
		{"an ID given to both runtimes", []string{"warder", "-claude", "main", "-codex", "main"}, `source ID "main" is given twice`},
		{"an ID given to both runtimes, Codex first", []string{"warder", "-codex", "main", "-claude", "main"}, `source ID "main" is given twice`},
		{"a stray argument after a Codex source", []string{"warder", "-codex", "codex-main", "codex-side"}, `unexpected argument "codex-side"`},
		{"a stray argument", []string{"warder", "-claude", "claude-main", "claude-side"}, `unexpected argument "claude-side"`},
		{"a -verbose that is not a boolean", []string{"warder", "-verbose=loud", "-claude", "claude-main"}, `invalid boolean value "loud" for -verbose`},
		{"-verbose with no source", []string{"warder", "-verbose"}, "no source enabled"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			clock := clocktest.NewClock(morning())
			stdout, stderr := newLines(), newLines()
			executor := &executorSpy{answer: answerSessions}
			home := &codexHomeFake{sessions: threeSessions()}

			code := run(t.Context(), test.args, stdout, stderr, executor.execute, home.files(), clock.Now, clock.Timer, nil)

			if code != 2 {
				t.Errorf("got the exit code %d, want 2", code)
			}
			message := strings.Join(stderr.all(), "")
			if !strings.HasPrefix(message, "warder: ") || !strings.Contains(message, test.says) || !strings.HasSuffix(message, "\n"+usage+"\n") {
				t.Errorf("got on stderr %q, want `warder: ` with %q, then the usage", message, test.says)
			}
			assertNoLines(t, "stdout", stdout)
			if got := executor.executed(); len(got) != 0 {
				t.Errorf("got the commands %q, want none", got)
			}
			if got := home.asked(); len(got) != 0 {
				t.Errorf("got the file operations %q, want none", got)
			}
			if got := clock.Waits(); len(got) != 0 {
				t.Errorf("got timers of %v, want none", got)
			}
		})
	}
}

// The sources of each runtime are those of every flag of it, in the order
// given, whatever the order of the two flags among themselves.
func TestParseCommandLineKeepsTheOrderOfTheFlags(t *testing.T) {
	t.Parallel()
	got, err := parseCommandLine([]string{"warder", "-codex", "codex-side", "-claude", "claude-side", "--codex=codex-main", "--claude=claude-main"})
	if err != nil {
		t.Fatal(err)
	}
	if want := []string{"claude-side", "claude-main"}; !slices.Equal(got.claudeSources, want) {
		t.Errorf("got the Claude Code sources %q, want %q", got.claudeSources, want)
	}
	if want := []string{"codex-side", "codex-main"}; !slices.Equal(got.codexSources, want) {
		t.Errorf("got the Codex sources %q, want %q", got.codexSources, want)
	}
}

// One source is enough, of either runtime: a command line with only Codex
// sources enables no Claude Code source, and the other way round.
func TestParseCommandLineAcceptsTheSourcesOfOneRuntime(t *testing.T) {
	t.Parallel()
	got, err := parseCommandLine([]string{"warder", "-codex", "codex-main"})
	if err != nil {
		t.Fatal(err)
	}
	if len(got.claudeSources) != 0 || !slices.Equal(got.codexSources, []string{"codex-main"}) {
		t.Errorf("got the Claude Code sources %q and the Codex sources %q, want none and codex-main", got.claudeSources, got.codexSources)
	}
	got, err = parseCommandLine([]string{"warder", "-claude", "claude-main"})
	if err != nil {
		t.Fatal(err)
	}
	if len(got.codexSources) != 0 || !slices.Equal(got.claudeSources, []string{"claude-main"}) {
		t.Errorf("got the Claude Code sources %q and the Codex sources %q, want claude-main and none", got.claudeSources, got.codexSources)
	}
}

// Logging is off unless -verbose is given, in any of the flag's forms and
// anywhere among the sources.
func TestParseCommandLineTurnsLoggingOnOnlyWithVerbose(t *testing.T) {
	t.Parallel()
	tests := []struct {
		args    []string
		verbose bool
	}{
		{[]string{"warder", "-claude", "claude-main"}, false},
		{[]string{"warder", "-verbose", "-claude", "claude-main"}, true},
		{[]string{"warder", "-claude", "claude-main", "--verbose"}, true},
		{[]string{"warder", "-verbose=true", "-claude", "claude-main"}, true},
		{[]string{"warder", "-verbose=false", "-claude", "claude-main"}, false},
	}
	for _, test := range tests {
		got, err := parseCommandLine(test.args)
		if err != nil {
			t.Fatalf("%q: %v", test.args, err)
		}
		if got.verbose != test.verbose {
			t.Errorf("%q: got verbose %v, want %v", test.args, got.verbose, test.verbose)
		}
		if want := []string{"claude-main"}; !slices.Equal(got.claudeSources, want) {
			t.Errorf("%q: got the sources %q, want %q", test.args, got.claudeSources, want)
		}
	}
}

// A missing boundary fails the wiring of a source of each runtime, with an
// error that says which.
func TestWireRejectsAMissingBoundary(t *testing.T) {
	t.Parallel()
	clock := clocktest.NewClock(morning())
	executor := &executorSpy{answer: answerSessions}
	home := &codexHomeFake{sessions: threeSessions()}
	logger := newLogger(newLines(), true)
	withoutRead := home.files()
	withoutRead.read = nil
	tests := []struct {
		name           string
		stdout, stderr io.Writer
		logger         *slog.Logger
		execute        executeFunc
		files          codexFiles
		clock          clockFunc
		timer          timerFunc
		says           string
	}{
		{"no stdout", nil, newLines(), logger, executor.execute, home.files(), clock.Now, clock.Timer, "no record writer"},
		{"no stderr", newLines(), nil, logger, executor.execute, home.files(), clock.Now, clock.Timer, "no stderr"},
		{"a nil stderr carried as a writer", newLines(), (*lines)(nil), logger, executor.execute, home.files(), clock.Now, clock.Timer, "no stderr"},
		{"no logger", newLines(), newLines(), nil, executor.execute, home.files(), clock.Now, clock.Timer, "no logger"},
		{"no executor", newLines(), newLines(), logger, nil, home.files(), clock.Now, clock.Timer, `source "claude-main": claude: no command executor`},
		{"no files", newLines(), newLines(), logger, executor.execute, codexFiles{}, clock.Now, clock.Timer, `source "codex-main": codex: no files`},
		{"files with a function missing", newLines(), newLines(), logger, executor.execute, withoutRead, clock.Now, clock.Timer, `source "codex-main": codex: no files`},
		{"no clock", newLines(), newLines(), logger, executor.execute, home.files(), nil, clock.Timer, "no clock"},
		{"no timer", newLines(), newLines(), logger, executor.execute, home.files(), clock.Now, nil, "no timer"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			application, err := wire([]string{"claude-main"}, []string{"codex-main"}, test.stdout, test.stderr, test.logger, test.execute, test.files, test.clock, test.timer)
			if err == nil || !strings.Contains(err.Error(), test.says) {
				t.Errorf("got the error %v, want one that says %q", err, test.says)
			}
			if application != nil {
				t.Error("got an application, want none")
			}
		})
	}
}

// A boundary that only one runtime reaches is missed only by a source of
// that runtime: Claude Code sources are wired with no Codex files, and
// Codex sources with no command executor. A clock and a timer are missed
// by a source of either. Wiring reads nothing.
func TestWireMissesABoundaryOnlyForASourceThatReachesIt(t *testing.T) {
	t.Parallel()
	clock := clocktest.NewClock(morning())
	executor := &executorSpy{answer: answerSessions}
	home := &codexHomeFake{sessions: threeSessions()}
	logger := newLogger(newLines(), false)

	if _, err := wire([]string{"claude-main"}, nil, newLines(), newLines(), logger, executor.execute, codexFiles{}, clock.Now, clock.Timer); err != nil {
		t.Errorf("Claude Code sources with no Codex files: got the error %v, want none", err)
	}
	if _, err := wire(nil, []string{"codex-main"}, newLines(), newLines(), logger, nil, home.files(), clock.Now, clock.Timer); err != nil {
		t.Errorf("Codex sources with no command executor: got the error %v, want none", err)
	}
	if _, err := wire(nil, []string{"codex-main"}, newLines(), newLines(), logger, nil, home.files(), nil, clock.Timer); err == nil || !strings.Contains(err.Error(), "no clock") {
		t.Errorf("a Codex source with no clock: got the error %v, want one that says no clock", err)
	}
	if _, err := wire(nil, []string{"codex-main"}, newLines(), newLines(), logger, nil, home.files(), clock.Now, nil); err == nil || !strings.Contains(err.Error(), "no timer") {
		t.Errorf("a Codex source with no timer: got the error %v, want one that says no timer", err)
	}
	if got := home.asked(); len(got) != 0 {
		t.Errorf("got the file operations %q, want none", got)
	}
	if got := executor.executed(); len(got) != 0 {
		t.Errorf("got the commands %q, want none", got)
	}
}

// An application that cannot be wired ends the run with exit code 1 and a
// message on stderr, and starts nothing.
func TestAnApplicationThatCannotBeWiredExitsWithCode1(t *testing.T) {
	t.Parallel()
	clock := clocktest.NewClock(morning())
	stdout, stderr := newLines(), newLines()

	code := run(t.Context(), []string{"warder", "-claude", "claude-main"}, stdout, stderr, nil, codexFiles{}, clock.Now, clock.Timer, nil)

	if code != 1 {
		t.Errorf("got the exit code %d, want 1", code)
	}
	if got, want := strings.Join(stderr.all(), ""), "warder: source \"claude-main\": claude: no command executor\n"; got != want {
		t.Errorf("got on stderr %q, want %q", got, want)
	}
	assertNoLines(t, "stdout", stdout)
	if got := clock.Waits(); len(got) != 0 {
		t.Errorf("got timers of %v, want none", got)
	}
}

// A stderr that is a nil pointer carried as a writer ends the run with
// exit code 1, and nothing is started, neither a command nor a timer.
func TestARunWithANilStderrExitsWithCode1AndStartsNothing(t *testing.T) {
	t.Parallel()
	clock := clocktest.NewClock(morning())
	stdout := newLines()
	executor := &executorSpy{answer: answerSessions}

	code := run(t.Context(), []string{"warder", "-verbose", "-claude", "claude-main"}, stdout, (*lines)(nil), executor.execute, codexFiles{}, clock.Now, clock.Timer, nil)

	if code != 1 {
		t.Errorf("got the exit code %d, want 1", code)
	}
	assertNoLines(t, "stdout", stdout)
	if got := executor.executed(); len(got) != 0 {
		t.Errorf("got the commands %q, want none", got)
	}
	if got := clock.Waits(); len(got) != 0 {
		t.Errorf("got timers of %v, want none", got)
	}
}

// With -verbose, the records and the diagnostics of several sources share
// one serialized writer over stderr. The first source to read fails, and
// its diagnostic is held at stderr while the other sources' reads are
// held; once those are let go, the test waits until another Write has
// begun at the serial writer, or reached stderr past it, then releases
// stderr. No Write reaches stderr while another is in progress, and each
// record and diagnostic is one whole Write.
func TestVerboseRecordsAndDiagnosticsOfSeveralSourcesShareOneSerialWriter(t *testing.T) {
	t.Parallel()
	clock := clocktest.NewClock(morning())
	stdout := newLines()
	stderr := newHeldWriter(func(p []byte) bool { return strings.HasPrefix(string(p), "warder: ") })
	proceed := make(chan struct{})
	executor := &executorSpy{answer: func(_ context.Context, call int) ([]byte, error) {
		if call == 1 {
			return nil, errors.New("exit status 1: not logged in")
		}
		<-proceed
		return []byte(sessions), nil
	}}
	sources := []string{"claude-main", "claude-side", "claude-third"}
	startObservedApplication(t, stdout, stderr, executor.execute, codexFiles{}, clock, stderr.attempt,
		"warder", "-verbose", "-claude", sources[0], "-claude", sources[1], "-claude", sources[2])

	// The diagnostic is held; every other source is held in its read, so
	// nothing else writes meanwhile.
	atHold := stderr.waitUntil(func(seen heldState) bool { return seen.held == 1 })
	close(proceed)
	stderr.waitUntil(func(seen heldState) bool {
		return seen.attempted > atHold.attempted || seen.arrived > atHold.arrived
	})
	close(stderr.release)
	// Each source's deadline, then its wait: every attempt has returned.
	for range 2 * len(sources) {
		clock.Started(5 * time.Second)
	}

	if n := stderr.seen().overlaps; n != 0 {
		t.Errorf("%d writes reached stderr while another was in progress", n)
	}
	got := stderr.written.all()
	failed := ""
	for _, line := range got {
		if rest, ok := strings.CutPrefix(line, "warder: "); ok {
			failed, _, _ = strings.Cut(rest, ":")
		}
	}
	if !slices.Contains(sources, failed) {
		t.Fatalf("got on stderr\n%sno diagnostic of a source", strings.Join(got, ""))
	}
	at := "time=2026-10-09T11:28:10.000+03:00 level=DEBUG "
	failure := "claude: execute claude agents --json: exit status 1: not logged in"
	var want []string
	for _, source := range sources {
		if source == failed {
			want = append(want,
				at+"msg=execute source="+source+` command=claude outcome=error error="exit status 1: not logged in" duration=0s`+"\n",
				at+`msg="read agents" source=`+source+` outcome=error error="`+failure+`" duration=0s`+"\n",
				at+"msg=capture source="+source+` outcome=error error="capture: read agents: `+failure+`" duration=0s`+"\n",
				"warder: "+source+": attempt: read failed: capture: read agents: "+failure+"\n",
				at+"msg=deadline source="+source+" limit=5s expired=false outcome=ok duration=0s\n")
			continue
		}
		want = append(want,
			at+"msg=execute source="+source+" command=claude outcome=ok duration=0s\n",
			at+`msg="read agents" source=`+source+" outcome=ok duration=0s\n",
			at+"msg=capture source="+source+" outcome=ok duration=0s\n",
			at+"msg=publish source="+source+" outcome=ok duration=0s\n",
			at+"msg=deadline source="+source+" limit=5s expired=false outcome=ok duration=0s\n")
	}
	slices.Sort(got)
	slices.Sort(want)
	if !slices.Equal(got, want) {
		t.Errorf("got on stderr\n%swant\n%s", strings.Join(got, ""), strings.Join(want, ""))
	}
}

type contextKey struct{}

// An executeFunc executes through its function: the context, the command
// and its arguments as given, the output and the error as returned.
func TestExecuteFuncExecutesThroughItsFunction(t *testing.T) {
	t.Parallel()
	ctx := context.WithValue(t.Context(), contextKey{}, "the caller's")
	failure := errors.New("exit status 1")
	executor := &executorSpy{answer: func(ctx context.Context, _ int) ([]byte, error) {
		if ctx.Value(contextKey{}) != "the caller's" {
			t.Error("the function was not given the caller's context")
		}
		return []byte("output"), failure
	}}

	output, err := executeFunc(executor.execute).Execute(ctx, "claude", "agents", "--json")

	if string(output) != "output" || err != failure {
		t.Errorf("got %q and the error %v, want %q and the error %v", output, err, "output", failure)
	}
	if got, want := executor.executed(), []string{"claude agents --json"}; !slices.Equal(got, want) {
		t.Errorf("got the commands %q, want %q", got, want)
	}
}

// A clockFunc tells its function's time.
func TestClockFuncTellsItsFunctionsTime(t *testing.T) {
	t.Parallel()
	clock := clocktest.NewClock(morning())
	if got := clockFunc(clock.Now).Now(); !got.Equal(morning()) {
		t.Errorf("got the time %v, want %v", got, morning())
	}
}
