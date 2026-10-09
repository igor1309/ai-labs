package main

import (
	"context"
	"errors"
	"io"
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
// executor and the clock given, with the clock's timer. The end of the
// test cancels the run and waits for it to return.
func startApplication(t *testing.T, stdout, stderr io.Writer, execute executeFunc, clock *clocktest.Clock, args ...string) *application {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	a := &application{cancel: cancel, returned: make(chan struct{})}
	go func() {
		defer close(a.returned)
		a.code = run(ctx, args, stdout, stderr, execute, clock.Now, clock.Timer)
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

// A command line that enables no valid set of sources is a usage error: a
// message on stderr, exit code 2, nothing on stdout, and nothing started,
// neither a command nor a timer.
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
		{"an unknown flag", []string{"warder", "-claude", "claude-main", "-codex", "codex-main"}, "flag provided but not defined: -codex"},
		{"a stray argument", []string{"warder", "-claude", "claude-main", "claude-side"}, `unexpected argument "claude-side"`},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			clock := clocktest.NewClock(morning())
			stdout, stderr := newLines(), newLines()
			executor := &executorSpy{answer: answerSessions}

			code := run(t.Context(), test.args, stdout, stderr, executor.execute, clock.Now, clock.Timer)

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
			if got := clock.Waits(); len(got) != 0 {
				t.Errorf("got timers of %v, want none", got)
			}
		})
	}
}

// The sources are those of every -claude flag, in the order given.
func TestParseSourcesKeepsTheOrderOfTheFlags(t *testing.T) {
	t.Parallel()
	got, err := parseSources([]string{"warder", "-claude", "claude-side", "--claude=claude-main"})
	if err != nil {
		t.Fatal(err)
	}
	if want := []string{"claude-side", "claude-main"}; !slices.Equal(got, want) {
		t.Errorf("got the sources %q, want %q", got, want)
	}
}

// A missing boundary fails the wiring, with an error that says which.
func TestWireRejectsAMissingBoundary(t *testing.T) {
	t.Parallel()
	clock := clocktest.NewClock(morning())
	executor := &executorSpy{answer: answerSessions}
	tests := []struct {
		name           string
		stdout, stderr io.Writer
		execute        executeFunc
		clock          clockFunc
		timer          timerFunc
		says           string
	}{
		{"no stdout", nil, newLines(), executor.execute, clock.Now, clock.Timer, "no record writer"},
		{"no stderr", newLines(), nil, executor.execute, clock.Now, clock.Timer, "no stderr"},
		{"no executor", newLines(), newLines(), nil, clock.Now, clock.Timer, "no command executor"},
		{"no clock", newLines(), newLines(), executor.execute, nil, clock.Timer, "no clock"},
		{"no timer", newLines(), newLines(), executor.execute, clock.Now, nil, "no timer"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			application, err := wire([]string{"claude-main"}, test.stdout, test.stderr, test.execute, test.clock, test.timer)
			if err == nil || !strings.Contains(err.Error(), test.says) {
				t.Errorf("got the error %v, want one that says %q", err, test.says)
			}
			if application != nil {
				t.Error("got an application, want none")
			}
		})
	}
}

// An application that cannot be wired ends the run with exit code 1 and a
// message on stderr, and starts nothing.
func TestAnApplicationThatCannotBeWiredExitsWithCode1(t *testing.T) {
	t.Parallel()
	clock := clocktest.NewClock(morning())
	stdout, stderr := newLines(), newLines()

	code := run(t.Context(), []string{"warder", "-claude", "claude-main"}, stdout, stderr, nil, clock.Now, clock.Timer)

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
