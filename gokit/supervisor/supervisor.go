// Package supervisor runs processes as the leaders of process groups of
// their own and owns those groups. Runtime runs one CLI process and
// collects its transport evidence: on timeout or cancellation the whole
// group is terminated, then killed after a grace period. Commands runs
// `bash -c` commands the same way, and Processes reaps a group a process
// that was killed left behind, by the reference Ref gives it. Each starts
// its process through a Starter, so a test can run its program in process
// (see supervisortest) and its timers on a manual clock.
package supervisor

import (
	"bufio"
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
	"unicode/utf8"
)

const (
	defaultKillGrace = 5 * time.Second
	stderrTailBytes  = 4096
	// versionTimeout is how long a runtime may take to print its version.
	versionTimeout = 20 * time.Second
)

type Spec struct {
	Command string
	Args    []string
	Dir     string
	// Env is added to the environment the process inherits, as "KEY=value";
	// an entry replaces an inherited variable of the same name.
	Env       []string
	Stdin     string
	Timeout   time.Duration
	KillGrace time.Duration
}

type Evidence struct {
	Exit       *Exit
	SpawnError string
	TimedOut   bool
	Aborted    bool
	// StderrTail is the end of what the process wrote to stderr, at most
	// stderrTailBytes of it; StderrOmitted counts the bytes cut before it,
	// and a cut tail starts with a line that says so.
	StderrTail    string
	StderrOmitted int64
	// RecordError is why the process could not be recorded; it was killed
	// at once.
	RecordError string
}

// Sink is what Run reports to: the process's events, its reference as soon
// as it exists (an error means it is not on record, and Run kills it), and
// each line of its stdout.
type Sink interface {
	Event(source, kind string, data map[string]any)
	ProcessStarted(ref string) error
	Raw(line string)
}

// Run starts the process on r.Starter, feeds stdin, passes each stdout line
// to onLine and the raw sink, and returns once the process has exited.
// Whatever the process leaves running in its group is killed then, and
// stdout is read for at most the grace period after the exit, so a
// descendant that keeps it open cannot hold the call. Its timeout and both
// graces are on r.Timer. Nothing reports to events once it has returned.
func (r Runtime) Run(ctx context.Context, spec Spec, events Sink, onLine func(string)) Evidence {
	// The watcher and the reader both report; the sink sees one at a time.
	sink := &serialSink{inner: events}
	var evidence Evidence
	grace := spec.KillGrace
	if grace == 0 {
		grace = defaultKillGrace
	}

	stderr := &tail{limit: stderrTailBytes}
	process, err := starter(r.Starter).Start(Command{
		Name: spec.Command, Args: spec.Args, Dir: spec.Dir, Env: spec.Env,
		Stdin: strings.NewReader(spec.Stdin), Stderr: stderr,
		WaitDelay: grace, // bounds stdin and stderr copying after the exit
	})
	if err != nil {
		evidence.SpawnError = err.Error()
		sink.Event(SourceProcess, "SPAWN_FAILED", map[string]any{"error": err.Error()})
		return evidence
	}
	stdout := process.Stdout()
	defer stdout.Close()
	pid := process.Group()
	// Recorded before anything else: from here on the group can outlive us.
	// Looking up the token takes a moment, so the group is reported first;
	// a kill in between leaves a record that reaping refuses to act on
	// blindly, but that still names the group. A group that cannot be
	// recorded is killed at once: it is not yet waited for, so its ID is
	// still ours, and nothing may run that no record could lead back to.
	recorded := sink.ProcessStarted(Ref(pid, ""))
	if recorded == nil {
		if token, err := process.Token(ctx); err == nil {
			recorded = sink.ProcessStarted(Ref(pid, token))
		}
	}
	sink.Event(SourceProcess, "PROCESS_STARTED", map[string]any{"pid": pid, "command": spec.Command, "args": spec.Args})
	if recorded != nil {
		evidence.RecordError = recorded.Error()
		_ = process.Signal(syscall.SIGKILL)
		sink.Event(SourceSupervisor, "PROCESS_RECORD_FAILED", map[string]any{"group": pid, "error": recorded.Error(), "killed": true})
	}

	// Signals go to the group only while the unreaped leader keeps its ID
	// reserved: reaping is set, under mu, before the process is reaped,
	// once the ID may be reused.
	var mu sync.Mutex
	var once sync.Once
	stopKill := func() {}
	reaping := false
	exited := make(chan struct{})
	terminate := func() {
		once.Do(func() {
			mu.Lock()
			defer mu.Unlock()
			if reaping {
				return
			}
			_ = process.Signal(syscall.SIGTERM)
			var killed <-chan time.Time
			killed, stopKill = r.timer(grace)
			go func() {
				select {
				case <-exited:
				case <-killed:
					mu.Lock()
					defer mu.Unlock()
					if !reaping {
						_ = process.Signal(syscall.SIGKILL)
					}
				}
			}()
		})
	}
	// The watcher has ended, its timer stopped and its reports made, once
	// watched is closed; Run waits for that before it returns, so nothing
	// it reports comes after the call. timedOut and aborted are its
	// decisions, read once it has ended.
	var timedOut, aborted bool
	watched := make(chan struct{})
	go func() {
		defer close(watched)
		if r.watcherEnding != nil {
			defer r.watcherEnding()
		}
		late, stop := r.timer(spec.Timeout)
		defer stop()
		select {
		case <-exited:
		case <-late:
			timedOut = true
			sink.Event(SourceSupervisor, "TIMEOUT", map[string]any{"timeout": spec.Timeout.String()})
			terminate()
		case <-ctx.Done():
			aborted = true
			sink.Event(SourceSupervisor, "ABORT_REQUESTED", nil)
			terminate()
		}
	}()

	read := make(chan struct{})
	go func() {
		defer close(read)
		reader := bufio.NewReaderSize(stdout, 64*1024)
		for {
			line, err := reader.ReadString('\n')
			if line = strings.TrimRight(line, "\r\n"); line != "" {
				sink.line(line, onLine)
			}
			if err != nil {
				if !errors.Is(err, io.EOF) && !errors.Is(err, os.ErrClosed) {
					sink.Event(SourceProcess, "STDOUT_READ_FAILED", map[string]any{"error": err.Error()})
				}
				return
			}
		}
	}()

	// What the process left running in its group is killed while the
	// leader, exited but not reaped, keeps the group's ID from reuse; only
	// then is it reaped. An exit that cannot be observed so leaves the
	// leader, perhaps still running, to the same kill: the watcher's
	// signals end before the reap, as the ID may be reused from then, and
	// nothing would end it otherwise. What that kill reached cannot be
	// told, whatever the observation's error says: the cleanup is unknown,
	// with that error.
	observed := process.Exited()
	mu.Lock()
	killed := process.Signal(syscall.SIGKILL)
	reaping = true
	stopKill()
	mu.Unlock()
	exit := process.Wait()
	close(exited)
	switch {
	case observed != nil:
		sink.Event(SourceProcess, "LEFTOVER_CLEANUP_UNKNOWN", map[string]any{"group": pid, "error": observed.Error()})
	case killed == nil:
		sink.Event(SourceProcess, "LEFTOVER_PROCESSES_KILLED", map[string]any{"group": pid})
	case !errors.Is(killed, syscall.ESRCH):
		// Neither leftovers killed nor none left: it cannot be told.
		sink.Event(SourceProcess, "LEFTOVER_CLEANUP_UNKNOWN", map[string]any{"group": pid, "error": killed.Error()})
	}

	held, stopHeld := r.timer(grace)
	select {
	case <-read:
	case <-held:
		// Something outside the group still holds stdout open.
		sink.Event(SourceProcess, "STDOUT_HELD_OPEN", map[string]any{"grace": grace.String()})
		stdout.Close()
		<-read
	}
	stopHeld()
	// joining is nil but in tests, so its case is never taken otherwise.
	select {
	case <-watched:
	case r.joining <- struct{}{}:
		<-watched
	}

	evidence.TimedOut, evidence.Aborted = timedOut, aborted
	evidence.Exit = &exit
	evidence.StderrTail, evidence.StderrOmitted = stderr.kept()
	sink.Event(SourceProcess, "PROCESS_EXITED", map[string]any{"code": exit.Code, "signal": exit.Signal})
	return evidence
}

// Version runs `<command> --version` on r.Starter and returns its output.
// Its group is killed when ctx ends or versionTimeout passes on r.Timer; a
// ctx that has ended already starts nothing.
func (r Runtime) Version(ctx context.Context, command string) (string, error) {
	// The starter takes no context: what it starts would run before the
	// watcher below could end it.
	if err := ctx.Err(); err != nil {
		return "", err
	}
	process, err := starter(r.Starter).Start(Command{Name: command, Args: []string{"--version"}, Stderr: io.Discard})
	if err != nil {
		return "", err
	}
	stdout := process.Stdout()
	defer stdout.Close()
	var out bytes.Buffer
	read := make(chan struct{})
	go func() {
		defer close(read)
		_, _ = io.Copy(&out, stdout)
	}()

	// The group is killed only while the unreaped leader keeps its ID
	// reserved: reaping is set, under mu, before the process is reaped,
	// once the ID may be reused.
	var mu sync.Mutex
	reaping := false
	var ended error
	exited, watched := make(chan struct{}), make(chan struct{})
	go func() {
		defer close(watched)
		late, stop := r.timer(versionTimeout)
		defer stop()
		select {
		case <-exited:
			return
		case <-late:
			ended = fmt.Errorf("%s --version did not end within %s", command, versionTimeout)
		case <-ctx.Done():
			ended = ctx.Err()
		}
		mu.Lock()
		defer mu.Unlock()
		if !reaping {
			_ = process.Signal(syscall.SIGKILL)
		}
	}()
	// What the process left running in its group is killed once its exit
	// is observed, before the reap: a descendant holding stderr would hold
	// the reap, which waits for stderr's copy. An exit that cannot be
	// observed so leaves the process, perhaps still running, to the same
	// kill: the watcher's kill ends before the reap, and nothing would end
	// it otherwise.
	_ = process.Exited()
	mu.Lock()
	_ = process.Signal(syscall.SIGKILL)
	reaping = true
	mu.Unlock()
	exit := process.Wait()
	close(exited)
	<-watched
	if ended != nil {
		// A descendant that outlived the kill may hold stdout: the read
		// ends here, not when it lets go.
		stdout.Close()
	}
	<-read
	switch {
	case ended != nil:
		return "", ended
	case exit.Signal != "":
		return "", fmt.Errorf("signal: %s", exit.Signal)
	case exit.Code == nil || *exit.Code != 0:
		return "", fmt.Errorf("exit status %d", code(exit))
	}
	return strings.TrimSpace(out.String()), nil
}

// code is the code a process exited with, or -1 when it has none.
func code(exit Exit) int {
	if exit.Code == nil {
		return -1
	}
	return *exit.Code
}

// timer starts wait on r.Timer, or on the wall clock.
func (r Runtime) timer(wait time.Duration) (<-chan time.Time, func()) {
	return start(r.Timer, wait)
}

// start starts wait on timer, or on the wall clock when timer is nil.
func start(timer func(time.Duration) (<-chan time.Time, func()), wait time.Duration) (<-chan time.Time, func()) {
	if timer != nil {
		return timer(wait)
	}
	wall := time.NewTimer(wait)
	return wall.C, func() { wall.Stop() }
}

// serialSink makes concurrent reports sequential, including the events
// onLine produces for a line.
type serialSink struct {
	mu    sync.Mutex
	inner Sink
}

func (s *serialSink) Event(source, kind string, data map[string]any) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.inner.Event(source, kind, data)
}

func (s *serialSink) ProcessStarted(ref string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.inner.ProcessStarted(ref)
}

func (s *serialSink) line(line string, onLine func(string)) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.inner.Raw(line)
	onLine(line)
}

// tail keeps the last limit bytes written to it and counts the rest.
type tail struct {
	mu    sync.Mutex
	limit int
	data  []byte
	cut   int64
}

func (t *tail) Write(p []byte) (int, error) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.data = append(t.data, p...)
	if len(t.data) > t.limit {
		t.cut += int64(len(t.data) - t.limit)
		t.data = t.data[len(t.data)-t.limit:]
	}
	return len(p), nil
}

// kept is the tail trimmed of surrounding space, and the bytes cut before
// it. A cut tail starts on a whole rune, after a line that says what was
// cut.
func (t *tail) kept() (string, int64) {
	t.mu.Lock()
	defer t.mu.Unlock()
	data, cut := t.data, t.cut
	if cut > 0 {
		for len(data) > 0 && !utf8.RuneStart(data[0]) {
			data, cut = data[1:], cut+1
		}
	}
	text := strings.TrimSpace(string(data))
	if cut == 0 || text == "" {
		return text, cut
	}
	return "[" + strconv.FormatInt(cut, 10) + " earlier bytes of stderr cut]\n" + text, cut
}
