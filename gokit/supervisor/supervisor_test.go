package supervisor_test

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/gokit/clocktest"
	"github.com/igor1309/ai-labs/gokit/fakeproc"
	"github.com/igor1309/ai-labs/gokit/supervisor"
)

// The test binary doubles as the runtime's descendants: with helperEnv set
// it plays the role named there instead of running tests.
const helperEnv = "GOKIT_SUPERVISOR_HELPER"

func TestMain(m *testing.M) {
	switch os.Getenv(helperEnv) {
	case "":
		os.Exit(m.Run())
	case "escape":
		// Start a sleeper in its own session, holding stdout, then exit.
		child := exec.Command(os.Args[0])
		child.Env = append(os.Environ(), helperEnv+"=sleep")
		child.Stdout = os.Stdout
		child.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
		if err := child.Start(); err != nil {
			os.Exit(2)
		}
		_ = os.WriteFile(os.Getenv("PID_FILE"), []byte(strconv.Itoa(child.Process.Pid)), 0o600)
		os.Stdout.WriteString("started\n")
		os.Exit(0)
	case "sleep":
		// Never ends on its own: only the test's kill (t.Cleanup) ends it.
		for {
			time.Sleep(time.Hour)
		}
	}
}

type runResult struct {
	evidence supervisor.Evidence
	lines    []string
}

type events struct {
	mu    sync.Mutex
	kinds []string
	// sources are the events' sources, in step with kinds.
	sources []string
	started []string // references, in the order reported
	// failAt, when positive, makes the report with that number (1-based)
	// fail.
	failAt   int
	startErr error
	// onStart, when set, runs with each reference reported (under the lock,
	// so it must not call back into the sink).
	onStart func(ref string)
}

func (e *events) Event(source, kind string, _ map[string]any) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.kinds = append(e.kinds, kind)
	e.sources = append(e.sources, source)
}

func (e *events) ProcessStarted(ref string) error {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.started = append(e.started, ref)
	if e.onStart != nil {
		e.onStart(ref)
	}
	if e.failAt > 0 && len(e.started) == e.failAt {
		return e.startErr
	}
	return nil
}

func (e *events) Raw(string) {}

func (e *events) has(kind string) bool {
	e.mu.Lock()
	defer e.mu.Unlock()
	for _, k := range e.kinds {
		if k == kind {
			return true
		}
	}
	return false
}

// sourcesOf lists the source of each event of kind, in the order reported.
func (e *events) sourcesOf(kind string) []string {
	e.mu.Lock()
	defer e.mu.Unlock()
	var sources []string
	for i, k := range e.kinds {
		if k == kind {
			sources = append(sources, e.sources[i])
		}
	}
	return sources
}

func pidFrom(t *testing.T, path string) int {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	pid, err := strconv.Atoi(strings.TrimSpace(string(data)))
	if err != nil {
		t.Fatal(err)
	}
	return pid
}

func alive(pid int) bool { return syscall.Kill(pid, 0) == nil }

// A process the runtime leaves running in its group ends with the call.
//
// Contract test: the supervisor against a real process: its group, its
// pipes and the signals that end it.
func TestLeftoverProcessesAreKilledWhenTheRuntimeExits(t *testing.T) {
	t.Parallel()
	pidFile := filepath.Join(t.TempDir(), "pid")
	sink := &events{}
	// Killed on every path, including a failed Run: the PID file is read
	// lazily and a missing one is ignored.
	t.Cleanup(func() {
		if data, err := os.ReadFile(pidFile); err == nil {
			if pid, err := strconv.Atoi(strings.TrimSpace(string(data))); err == nil && pid > 1 {
				_ = syscall.Kill(pid, syscall.SIGKILL)
			}
		}
	})
	evidence := supervisor.Runtime{}.Run(context.Background(), supervisor.Spec{
		Command: "/bin/sh",
		Args:    []string{"-c", blocks + ` >/dev/null 2>&1 & echo $! > "$0"; echo done`, pidFile},
		Timeout: 30 * time.Second,
	}, sink, func(string) {})
	if evidence.Exit == nil || evidence.Exit.Code == nil || *evidence.Exit.Code != 0 {
		t.Fatalf("evidence = %+v", evidence)
	}
	pid := pidFrom(t, pidFile)
	deadline := time.Now().Add(10 * time.Second)
	for alive(pid) && time.Now().Before(deadline) {
		time.Sleep(10 * time.Millisecond)
	}
	// A killed child stays a zombie until init reaps it; signal 0 still
	// succeeds on a zombie, so ask ps for its state.
	if out, _ := exec.Command("ps", "-o", "stat=", "-p", strconv.Itoa(pid)).Output(); len(strings.TrimSpace(string(out))) > 0 && !strings.HasPrefix(strings.TrimSpace(string(out)), "Z") {
		t.Fatalf("leftover %d still running (%s)", pid, strings.TrimSpace(string(out)))
	}
	if !sink.has("LEFTOVER_PROCESSES_KILLED") {
		t.Fatalf("events = %v", sink.kinds)
	}
}

// start is when the tests' manual clocks start.
var start = time.Date(2026, 10, 3, 12, 0, 0, 0, time.UTC)

// A descendant that leaves the group but keeps stdout open cannot hold the
// call past the grace period, which starts at the exit; until the grace
// has passed, stdout is read.
//
// Serial: t.Setenv, which tells the re-executed test binary its role.
//
// Contract test: the supervisor against a real process: its group, its
// pipes and the signals that end it.
func TestStdoutHeldOutsideTheGroupDoesNotHoldTheCall(t *testing.T) {
	const grace = 3 * time.Second
	// run runs the escaping process over a manual clock, and returns once
	// the stdout grace has started and the process's line is read, with
	// the escaped child's PID.
	run := func(t *testing.T) (*clocktest.Clock, int, *events, <-chan runResult) {
		pidFile := filepath.Join(t.TempDir(), "pid")
		t.Setenv(helperEnv, "escape")
		t.Setenv("PID_FILE", pidFile)
		// Killed on every path, including a failed Run: the PID file is
		// read lazily and a missing one is ignored.
		t.Cleanup(func() {
			if data, err := os.ReadFile(pidFile); err == nil {
				if pid, err := strconv.Atoi(strings.TrimSpace(string(data))); err == nil && pid > 1 {
					_ = syscall.Kill(pid, syscall.SIGKILL)
				}
			}
		})
		clock := clocktest.NewClock(start)
		sink := &events{}
		done, read := make(chan runResult, 1), make(chan struct{}, 1)
		go func() {
			var lines []string
			evidence := supervisor.Runtime{Timer: clock.Timer}.Run(context.Background(), supervisor.Spec{
				Command:   os.Args[0],
				Timeout:   time.Hour,
				KillGrace: grace,
			}, sink, func(line string) {
				lines = append(lines, line)
				select {
				case read <- struct{}{}:
				default:
				}
			})
			done <- runResult{evidence, lines}
		}()
		// The process exits by itself, so the first wait of the grace's
		// length is the one for stdout, started at the exit.
		clock.Started(grace)
		// The line it wrote before its exit is read on a goroutine of its
		// own: the clock moves only once it is.
		<-read
		return clock, pidFrom(t, pidFile), sink, done
	}
	exited := func(t *testing.T, got runResult) {
		t.Helper()
		if got.evidence.Exit == nil || got.evidence.Exit.Code == nil || *got.evidence.Exit.Code != 0 || strings.Join(got.lines, ",") != "started" {
			t.Fatalf("evidence = %+v, lines %v", got.evidence, got.lines)
		}
	}

	t.Run("passed", func(t *testing.T) {
		// The escaped child never exits on its own, so Run returning, with
		// STDOUT_HELD_OPEN, proves the grace ended the wait.
		clock, _, sink, done := run(t)
		clock.Advance(grace)
		exited(t, <-done)
		if !sink.has("STDOUT_HELD_OPEN") {
			t.Fatalf("events = %v", sink.kinds)
		}
	})
	t.Run("not yet passed", func(t *testing.T) {
		// A moment short of the grace stdout is still read: the child's end
		// closes it, and nothing says it was held.
		clock, child, sink, done := run(t)
		clock.Advance(grace - time.Nanosecond)
		if err := syscall.Kill(child, syscall.SIGKILL); err != nil {
			t.Fatal(err)
		}
		exited(t, <-done)
		if sink.has("STDOUT_HELD_OPEN") {
			t.Fatalf("events = %v", sink.kinds)
		}
	})
}

// cleanUpRun kills, at the test's cleanup, the group the sink was first
// told of.
func cleanUpRun(t *testing.T, sink *events) {
	t.Cleanup(func() {
		sink.mu.Lock()
		defer sink.mu.Unlock()
		if len(sink.started) > 0 {
			if group, _, err := supervisor.ParseRef(sink.started[0]); err == nil && group > 1 {
				_ = syscall.Kill(-group, syscall.SIGKILL)
			}
		}
	})
}

// The turn's timeout is on the runtime's timer: the process is told to end
// once the clock passes the timeout, and not a moment before. Cancelled a
// moment short of it, the call is aborted, not timed out.
//
// Contract test: the supervisor against a real process: its group, its
// pipes and the signals that end it.
func TestTheTimeoutEndsTheProcessOnlyOnceItHasPassed(t *testing.T) {
	t.Parallel()
	const timeout = time.Hour
	run := func(t *testing.T, ctx context.Context) (*clocktest.Clock, *events, <-chan supervisor.Evidence) {
		clock := clocktest.NewClock(start)
		sink := &events{}
		cleanUpRun(t, sink)
		done := make(chan supervisor.Evidence, 1)
		go func() {
			done <- supervisor.Runtime{Timer: clock.Timer}.Run(ctx, supervisor.Spec{
				Command: "/bin/sh",
				Args:    []string{"-c", blocks},
				Timeout: timeout,
			}, sink, func(string) {})
		}()
		clock.Started(timeout)
		return clock, sink, done
	}

	t.Run("passed", func(t *testing.T) {
		t.Parallel()
		clock, sink, done := run(t, context.Background())
		clock.Advance(timeout)
		evidence := <-done
		if !evidence.TimedOut || evidence.Aborted || evidence.Exit == nil || evidence.Exit.Signal != "terminated" || !sink.has("TIMEOUT") {
			t.Fatalf("evidence = %+v, events %v", evidence, sink.kinds)
		}
	})
	t.Run("not yet passed", func(t *testing.T) {
		t.Parallel()
		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()
		clock, sink, done := run(t, ctx)
		clock.Advance(timeout - time.Nanosecond)
		cancel()
		evidence := <-done
		if evidence.TimedOut || !evidence.Aborted || sink.has("TIMEOUT") {
			t.Fatalf("evidence = %+v, events %v", evidence, sink.kinds)
		}
	})
}

// The supervisor's own decisions about a process, its timeout, an abort
// and a group it could not record, are reported with the supervisor as
// their source, not the process: a sink tells them apart by it.
func TestTheSupervisorsDecisionsAreReportedAsItsOwn(t *testing.T) {
	t.Parallel()
	const timeout = time.Hour
	// run runs a runtime that blocks until it is ended, its timers on the
	// clock, and returns once its timeout has started.
	run := func(ctx context.Context, clock *clocktest.Clock, sink *events) <-chan supervisor.Evidence {
		done := make(chan supervisor.Evidence, 1)
		go func() {
			done <- supervisor.Runtime{Starter: program(fakeproc.Process.Block), Timer: clock.Timer}.Run(ctx, supervisor.Spec{
				Command: "runtime",
				Timeout: timeout,
			}, sink, func(string) {})
		}()
		clock.Started(timeout)
		return done
	}
	reported := func(t *testing.T, sink *events, kind string) {
		t.Helper()
		if sources := sink.sourcesOf(kind); !reflect.DeepEqual(sources, []string{supervisor.SourceSupervisor}) {
			t.Fatalf("%s from %q, events %v", kind, sources, sink.kinds)
		}
	}

	t.Run("timeout", func(t *testing.T) {
		t.Parallel()
		clock, sink := clocktest.NewClock(start), &events{}
		done := run(context.Background(), clock, sink)
		clock.Advance(timeout)
		if evidence := <-done; !evidence.TimedOut {
			t.Fatalf("evidence = %+v", evidence)
		}
		reported(t, sink, "TIMEOUT")
	})
	t.Run("abort", func(t *testing.T) {
		t.Parallel()
		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()
		sink := &events{}
		done := run(ctx, clocktest.NewClock(start), sink)
		cancel()
		if evidence := <-done; !evidence.Aborted {
			t.Fatalf("evidence = %+v", evidence)
		}
		reported(t, sink, "ABORT_REQUESTED")
	})
	t.Run("record failed", func(t *testing.T) {
		t.Parallel()
		sink := &events{failAt: 1, startErr: errors.New("disk full")}
		done := run(context.Background(), clocktest.NewClock(start), sink)
		if evidence := <-done; evidence.RecordError != "disk full" {
			t.Fatalf("evidence = %+v", evidence)
		}
		reported(t, sink, "PROCESS_RECORD_FAILED")
	})
}

// Run returns only once its watcher has ended: the timeout it reported is
// in the evidence and before the exit, and its timer is stopped, so a run
// released when the call returns is not reported to after. The watcher is
// held at its end until Run is seen waiting for it, so a Run that did not
// wait for it returns while it is held.
func TestRunReturnsOnlyOnceItsWatcherHasEnded(t *testing.T) {
	t.Parallel()
	const timeout, grace = time.Hour, time.Minute
	clock, sink := clocktest.NewClock(start), &events{}
	held, release, joining := make(chan struct{}), make(chan struct{}), make(chan struct{})
	free := sync.OnceFunc(func() { close(release) })
	t.Cleanup(free)
	runtime := supervisor.WithJoin(supervisor.Runtime{Starter: program(fakeproc.Process.Block), Timer: clock.Timer}, func() {
		close(held)
		<-release
	}, joining)
	done := make(chan supervisor.Evidence, 1)
	go func() {
		done <- runtime.Run(context.Background(), supervisor.Spec{
			Command: "runtime", Timeout: timeout, KillGrace: grace,
		}, sink, func(string) {})
	}()
	clock.Started(timeout)
	clock.Advance(timeout)

	<-held
	select {
	case <-joining:
	case <-done:
		t.Fatal("Run returned while its watcher was held at its end")
	}
	free()
	evidence := <-done
	if !evidence.TimedOut {
		t.Fatalf("evidence = %+v", evidence)
	}
	sink.mu.Lock()
	kinds := append([]string(nil), sink.kinds...)
	sink.mu.Unlock()
	if !reflect.DeepEqual(kinds, []string{"PROCESS_STARTED", "TIMEOUT", "PROCESS_EXITED"}) {
		t.Fatalf("events %v", kinds)
	}
	if pending := clock.Pending(); pending != 0 {
		t.Fatalf("%d timers still pending", pending)
	}
}

// A group told to end that ignores it is killed once the kill grace has
// passed on the runtime's timer, and not a moment before: a moment short
// of it, the process still ends by itself.
//
// Contract test: the supervisor against a real process: its group, its
// pipes and the signals that end it.
func TestAGroupThatIgnoresTheTerminationIsKilledOnceTheGraceHasPassed(t *testing.T) {
	t.Parallel()
	const timeout, grace = time.Hour, 3 * time.Second
	// run starts a process that ignores SIGTERM and exits 3 once it reads
	// a line from the gate, and returns once its timeout has passed and the
	// grace has started; the gate is the test's to write to.
	run := func(t *testing.T) (*clocktest.Clock, *os.File, <-chan supervisor.Evidence) {
		gate := filepath.Join(t.TempDir(), "gate")
		if err := syscall.Mkfifo(gate, 0o600); err != nil {
			t.Fatal(err)
		}
		// Held for reading and writing, the FIFO opens at once for both
		// ends, and a line written stays until the process reads it.
		fifo, err := os.OpenFile(gate, os.O_RDWR, 0)
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { _ = fifo.Close() })
		clock := clocktest.NewClock(start)
		sink := &events{}
		cleanUpRun(t, sink)
		ready := make(chan struct{})
		done := make(chan supervisor.Evidence, 1)
		go func() {
			done <- supervisor.Runtime{Timer: clock.Timer}.Run(context.Background(), supervisor.Spec{
				Command:   "/bin/sh",
				Args:      []string{"-c", `trap '' TERM; echo ready; read line < "$0"; exit 3`, gate},
				Timeout:   timeout,
				KillGrace: grace,
			}, sink, func(line string) {
				if line == "ready" {
					close(ready)
				}
			})
		}()
		// SIGTERM is ignored only once the trap is set.
		<-ready
		clock.Started(timeout)
		clock.Advance(timeout)
		clock.Started(grace)
		return clock, fifo, done
	}

	t.Run("passed", func(t *testing.T) {
		t.Parallel()
		clock, _, done := run(t)
		clock.Advance(grace)
		evidence := <-done
		if !evidence.TimedOut || evidence.Exit == nil || evidence.Exit.Signal != "killed" {
			t.Fatalf("evidence = %+v", evidence)
		}
	})
	t.Run("not yet passed", func(t *testing.T) {
		t.Parallel()
		clock, gate, done := run(t)
		clock.Advance(grace - time.Nanosecond)
		if _, err := gate.WriteString("go\n"); err != nil {
			t.Fatal(err)
		}
		evidence := <-done
		if !evidence.TimedOut || evidence.Exit == nil || evidence.Exit.Code == nil || *evidence.Exit.Code != 3 {
			t.Fatalf("evidence = %+v", evidence)
		}
	})
}

// The group is reported the moment it exists, before the slower lookup of
// its token, so a kill in between still leaves the group on record.
//
// Contract test: the supervisor against a real process: its group, its
// pipes and the signals that end it.
func TestGroupIsReportedBeforeItsTokenIsKnown(t *testing.T) {
	t.Parallel()
	// The child outlives the test's need of it; the run ends when the sink
	// sees the token-bearing report, so no delay orders anything.
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	sink := &events{onStart: func(ref string) {
		if _, token, err := supervisor.ParseRef(ref); err == nil && token != "" {
			cancel()
		}
	}}
	t.Cleanup(func() {
		sink.mu.Lock()
		defer sink.mu.Unlock()
		if len(sink.started) > 0 {
			if group, _, err := supervisor.ParseRef(sink.started[0]); err == nil && group > 1 {
				_ = syscall.Kill(-group, syscall.SIGKILL)
			}
		}
	})
	supervisor.Runtime{}.Run(ctx, supervisor.Spec{
		Command: "/bin/sh",
		Args:    []string{"-c", blocks},
		Timeout: 30 * time.Second,
	}, sink, func(string) {})
	sink.mu.Lock()
	defer sink.mu.Unlock()
	if len(sink.started) < 2 {
		t.Fatalf("reports = %+v", sink.started)
	}
	firstGroup, firstToken, err := supervisor.ParseRef(sink.started[0])
	if err != nil {
		t.Fatal(err)
	}
	lastGroup, lastToken, err := supervisor.ParseRef(sink.started[len(sink.started)-1])
	if err != nil {
		t.Fatal(err)
	}
	if firstGroup <= 1 || firstToken != "" || lastGroup != firstGroup || lastToken == "" {
		t.Fatalf("reports = %+v", sink.started)
	}
}

// A group that cannot be recorded is killed at once, and the evidence says
// why, whichever of the two reports failed: no started group is ever left
// that no record leads back to.
//
// Contract test: the supervisor against a real process: its group, its
// pipes and the signals that end it.
func TestGroupThatCannotBeRecordedIsKilled(t *testing.T) {
	t.Parallel()
	for name, failAt := range map[string]int{"the group report": 1, "the token report": 2} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			sink := &events{failAt: failAt, startErr: errors.New("disk full")}
			evidence := supervisor.Runtime{}.Run(context.Background(), supervisor.Spec{
				Command: "/bin/sh",
				Args:    []string{"-c", blocks},
				// Only a failure of the kill would ever reach it, and the
				// evidence would then say it timed out.
				Timeout: 30 * time.Second,
			}, sink, func(string) {})

			if evidence.RecordError != "disk full" || evidence.TimedOut {
				t.Fatalf("evidence = %+v", evidence)
			}
			if evidence.Exit == nil || evidence.Exit.Signal != "killed" {
				t.Fatalf("the process was not killed: %+v", evidence.Exit)
			}
			if !sink.has("PROCESS_RECORD_FAILED") {
				t.Fatalf("events = %v", sink.kinds)
			}
			sink.mu.Lock()
			ref := sink.started[0]
			sink.mu.Unlock()
			group, _, err := supervisor.ParseRef(ref)
			if err != nil {
				t.Fatal(err)
			}
			t.Cleanup(func() { _ = syscall.Kill(-group, syscall.SIGKILL) })
			// Run waited for the leader, so it is gone, not a zombie.
			if out, _ := exec.Command("ps", "-o", "stat=", "-p", strconv.Itoa(group)).Output(); strings.TrimSpace(string(out)) != "" {
				t.Fatalf("the group's leader %d is still there (%s)", group, strings.TrimSpace(string(out)))
			}
			if syscall.Kill(-group, 0) == nil {
				t.Fatalf("group %d still has members", group)
			}

			if evidence.RecordError != "disk full" {
				t.Fatalf("evidence = %+v", evidence)
			}
		})
	}
}

// A runtime's stderr is kept to its last 4096 bytes, cut on a whole rune;
// the tail's first line and the count say how much was cut, and the reason
// after the flood is still quoted.
//
// Contract test: the supervisor against a real process: its group, its
// pipes and the signals that end it.
func TestStderrBeyondTheBoundIsCutAndMarked(t *testing.T) {
	t.Parallel()
	// 5000 two-byte runes, then the reason: its odd length puts the cut
	// inside a rune.
	evidence := supervisor.Runtime{}.Run(context.Background(), supervisor.Spec{
		Command: "/bin/sh",
		Args:    []string{"-c", `printf 'é%.0s' $(seq 5000) >&2; printf '\nError: too large!\n' >&2; exit 1`},
		Timeout: 30 * time.Second,
	}, &events{}, func(string) {})
	marker, kept, _ := strings.Cut(evidence.StderrTail, "\n")
	written := int64(5000*2 + len("\nError: too large!\n"))
	if evidence.StderrOmitted != written-int64(len(kept))-1 || marker != "["+strconv.FormatInt(evidence.StderrOmitted, 10)+" earlier bytes of stderr cut]" {
		t.Fatalf("omitted %d, marker %q, %d bytes kept", evidence.StderrOmitted, marker, len(kept))
	}
	if !strings.HasPrefix(kept, "é") || len(kept) != 4096-1-1 || !strings.HasSuffix(kept, "é\nError: too large!") {
		t.Fatalf("kept %d bytes: %q…", len(kept), kept[:10])
	}
}

// A runtime that prints nothing to stderr leaves no tail and no cut.
//
// Contract test: the supervisor against a real process: its group, its
// pipes and the signals that end it.
func TestASilentExitLeavesNoTail(t *testing.T) {
	t.Parallel()
	evidence := supervisor.Runtime{}.Run(context.Background(), supervisor.Spec{
		Command: "/bin/sh",
		Args:    []string{"-c", "exit 2"},
		Timeout: 30 * time.Second,
	}, &events{}, func(string) {})
	if evidence.StderrTail != "" || evidence.StderrOmitted != 0 {
		t.Fatalf("evidence = %+v", evidence)
	}
}

// Spec.Env is added to the inherited environment, and replaces an inherited
// variable of the same name.
//
// Serial: t.Setenv, for the environment the runtime inherits.
//
// Contract test: the supervisor against a real process: its group, its
// pipes and the signals that end it.
func TestEnvIsAddedToTheInheritedEnvironment(t *testing.T) {
	t.Setenv("GOKIT_SUPERVISOR_KEPT", "kept")
	t.Setenv("GOKIT_SUPERVISOR_REPLACED", "inherited")
	var lines []string
	evidence := supervisor.Runtime{}.Run(context.Background(), supervisor.Spec{
		Command: "/bin/sh",
		Args:    []string{"-c", `echo "$GOKIT_SUPERVISOR_KEPT $GOKIT_SUPERVISOR_REPLACED $GOKIT_SUPERVISOR_ADDED"`},
		Env:     []string{"GOKIT_SUPERVISOR_REPLACED=replaced", "GOKIT_SUPERVISOR_ADDED=added"},
		Timeout: 30 * time.Second,
	}, &events{}, func(line string) { lines = append(lines, line) })
	if evidence.Exit == nil || evidence.Exit.Code == nil || *evidence.Exit.Code != 0 || len(lines) != 1 || lines[0] != "kept replaced added" {
		t.Fatalf("evidence = %+v, lines %q", evidence, lines)
	}
}
