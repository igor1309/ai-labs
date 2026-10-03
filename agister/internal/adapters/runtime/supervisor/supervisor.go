// Package supervisor runs one runtime CLI process and collects transport
// evidence. It owns the process group: on timeout or cancellation the whole
// group is terminated, then killed after a grace period.
package supervisor

import (
	"bufio"
	"context"
	"errors"
	"io"
	"os"
	"os/exec"
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

// Run starts the process, feeds stdin, passes each stdout line to onLine and
// the raw sink, and returns once the process has exited. Whatever the
// process leaves running in its group is killed then, and stdout is read
// for at most the grace period after the exit, so a descendant that keeps
// it open cannot hold the call. Its timeout and both graces are on
// r.Timer.
func (r Runtime) Run(ctx context.Context, spec Spec, events Sink, onLine func(string)) Evidence {
	// The watcher and the reader both report; the sink sees one at a time.
	sink := &serialSink{inner: events}
	var evidence Evidence
	grace := spec.KillGrace
	if grace == 0 {
		grace = defaultKillGrace
	}

	// A plain pipe, not StdoutPipe: Wait then returns when the process
	// exits, not when every holder of stdout has closed it.
	stdout, stdoutWriter, err := os.Pipe()
	if err != nil {
		evidence.SpawnError = err.Error()
		return evidence
	}
	defer stdout.Close()
	command := exec.Command(spec.Command, spec.Args...)
	command.Dir = spec.Dir
	if len(spec.Env) > 0 {
		command.Env = append(command.Environ(), spec.Env...)
	}
	command.Stdin = strings.NewReader(spec.Stdin)
	command.Stdout = stdoutWriter
	stderr := &tail{limit: stderrTailBytes}
	command.Stderr = stderr
	command.WaitDelay = grace // bounds stdin and stderr copying after the exit
	command.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}

	err = command.Start()
	stdoutWriter.Close()
	if err != nil {
		evidence.SpawnError = err.Error()
		sink.Event(SourceProcess, "SPAWN_FAILED", map[string]any{"error": err.Error()})
		return evidence
	}
	pid := command.Process.Pid
	// Recorded before anything else: from here on the group can outlive us.
	// Looking up the token takes a moment, so the group is reported first;
	// a kill in between leaves a record that reaping refuses to act on
	// blindly, but that still names the group. A group that cannot be
	// recorded is killed at once: it is not yet waited for, so its ID is
	// still ours, and nothing may run that no record could lead back to.
	recorded := sink.ProcessStarted(Ref(pid, ""))
	if recorded == nil {
		if token, err := Token(ctx, pid); err == nil {
			recorded = sink.ProcessStarted(Ref(pid, token))
		}
	}
	sink.Event(SourceProcess, "PROCESS_STARTED", map[string]any{"pid": pid, "command": spec.Command, "args": spec.Args})
	if recorded != nil {
		evidence.RecordError = recorded.Error()
		_ = syscall.Kill(-pid, syscall.SIGKILL)
		sink.Event(SourceAgister, "PROCESS_RECORD_FAILED", map[string]any{"group": pid, "error": recorded.Error(), "killed": true})
	}

	// Signals go to the group only while it is known to exist: once the
	// process has been waited for, its group ID may be reused.
	var mu sync.Mutex
	var once sync.Once
	stopKill := func() {}
	reaped := false
	exited := make(chan struct{})
	terminate := func() {
		once.Do(func() {
			mu.Lock()
			defer mu.Unlock()
			if reaped {
				return
			}
			_ = syscall.Kill(-pid, syscall.SIGTERM)
			var killed <-chan time.Time
			killed, stopKill = r.timer(grace)
			go func() {
				select {
				case <-exited:
				case <-killed:
					mu.Lock()
					defer mu.Unlock()
					if !reaped {
						_ = syscall.Kill(-pid, syscall.SIGKILL)
					}
				}
			}()
		})
	}
	go func() {
		timedOut, stop := r.timer(spec.Timeout)
		defer stop()
		select {
		case <-exited:
		case <-timedOut:
			mu.Lock()
			evidence.TimedOut = true
			mu.Unlock()
			sink.Event(SourceAgister, "TIMEOUT", map[string]any{"timeout": spec.Timeout.String()})
			terminate()
		case <-ctx.Done():
			mu.Lock()
			evidence.Aborted = true
			mu.Unlock()
			sink.Event(SourceAgister, "ABORT_REQUESTED", nil)
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

	waitErr := command.Wait()
	close(exited)

	mu.Lock()
	reaped = true
	stopKill()
	// The group outlives its leader while members remain, and its ID is
	// not reused while it exists; an empty group fails with ESRCH.
	leftovers := syscall.Kill(-pid, syscall.SIGKILL) == nil
	mu.Unlock()
	if leftovers {
		sink.Event(SourceProcess, "LEFTOVER_PROCESSES_KILLED", map[string]any{"group": pid})
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

	mu.Lock()
	defer mu.Unlock()
	exit := &Exit{}
	if state := command.ProcessState; state != nil {
		if status, ok := state.Sys().(syscall.WaitStatus); ok && status.Signaled() {
			exit.Signal = status.Signal().String()
		} else {
			code := state.ExitCode()
			exit.Code = &code
		}
	} else if waitErr != nil {
		exit.Signal = waitErr.Error()
	}
	evidence.Exit = exit
	evidence.StderrTail, evidence.StderrOmitted = stderr.kept()
	sink.Event(SourceProcess, "PROCESS_EXITED", map[string]any{"code": exit.Code, "signal": exit.Signal})
	return evidence
}

// Version runs `<command> --version` and returns its output.
func (Runtime) Version(ctx context.Context, command string) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, command, "--version").Output()
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(out)), nil
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
