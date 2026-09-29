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

	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

const (
	defaultKillGrace = 5 * time.Second
	stderrTailBytes  = 4096
)

type Spec struct {
	Command   string
	Args      []string
	Dir       string
	Stdin     string
	Timeout   time.Duration
	KillGrace time.Duration
}

type Evidence struct {
	Exit       *run.Exit
	SpawnError string
	TimedOut   bool
	Aborted    bool
	StderrTail string
}

// Run starts the process, feeds stdin, passes each stdout line to onLine and
// the raw sink, and returns once the process has exited. Whatever the
// process leaves running in its group is killed then, and stdout is read
// for at most the grace period after the exit, so a descendant that keeps
// it open cannot hold the call.
func Run(ctx context.Context, spec Spec, events app.EventSink, onLine func(string)) Evidence {
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
		sink.Event(run.SourceProcess, "SPAWN_FAILED", map[string]any{"error": err.Error()})
		return evidence
	}
	pid := command.Process.Pid
	// Recorded before anything else: from here on the group can outlive us.
	token, _ := Token(pid)
	sink.ProcessStarted(pid, token)
	sink.Event(run.SourceProcess, "PROCESS_STARTED", map[string]any{"pid": pid, "command": spec.Command, "args": spec.Args})

	// Signals go to the group only while it is known to exist: once the
	// process has been waited for, its group ID may be reused.
	var mu sync.Mutex
	var once sync.Once
	var killTimer *time.Timer
	reaped := false
	terminate := func() {
		once.Do(func() {
			mu.Lock()
			defer mu.Unlock()
			if reaped {
				return
			}
			_ = syscall.Kill(-pid, syscall.SIGTERM)
			killTimer = time.AfterFunc(grace, func() {
				mu.Lock()
				defer mu.Unlock()
				if !reaped {
					_ = syscall.Kill(-pid, syscall.SIGKILL)
				}
			})
		})
	}
	exited := make(chan struct{})
	go func() {
		timer := time.NewTimer(spec.Timeout)
		defer timer.Stop()
		select {
		case <-exited:
		case <-timer.C:
			mu.Lock()
			evidence.TimedOut = true
			mu.Unlock()
			sink.Event(run.SourceAgister, "TIMEOUT", map[string]any{"timeout": spec.Timeout.String()})
			terminate()
		case <-ctx.Done():
			mu.Lock()
			evidence.Aborted = true
			mu.Unlock()
			sink.Event(run.SourceAgister, "ABORT_REQUESTED", nil)
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
					sink.Event(run.SourceProcess, "STDOUT_READ_FAILED", map[string]any{"error": err.Error()})
				}
				return
			}
		}
	}()

	waitErr := command.Wait()
	close(exited)

	mu.Lock()
	reaped = true
	if killTimer != nil {
		killTimer.Stop()
	}
	// The group outlives its leader while members remain, and its ID is
	// not reused while it exists; an empty group fails with ESRCH.
	leftovers := syscall.Kill(-pid, syscall.SIGKILL) == nil
	mu.Unlock()
	if leftovers {
		sink.Event(run.SourceProcess, "LEFTOVER_PROCESSES_KILLED", map[string]any{"group": pid})
	}

	select {
	case <-read:
	case <-time.After(grace):
		// Something outside the group still holds stdout open.
		sink.Event(run.SourceProcess, "STDOUT_HELD_OPEN", map[string]any{"grace": grace.String()})
		stdout.Close()
		<-read
	}

	mu.Lock()
	defer mu.Unlock()
	exit := &run.Exit{}
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
	evidence.StderrTail = strings.TrimSpace(stderr.String())
	sink.Event(run.SourceProcess, "PROCESS_EXITED", map[string]any{"code": exit.Code, "signal": exit.Signal})
	return evidence
}

// Base is a turn carrying only transport evidence.
func Base(evidence Evidence) run.Turn {
	return run.Turn{Status: run.Lost, Exit: evidence.Exit, StderrTail: evidence.StderrTail}
}

// WithoutTerminal decides a turn for which the runtime reported no terminal
// event: Agister's own timeout or cancellation first, then spawn failure,
// then the exit. A clean exit without a terminal event is lost.
func WithoutTerminal(turn run.Turn, evidence Evidence, lastError string) run.Turn {
	detail := ""
	if lastError != "" {
		detail = ": " + lastError
	}
	var fault *run.Error
	switch {
	case evidence.TimedOut:
		fault = run.Fault(run.ClassTimeout, "")
	case evidence.Aborted:
		fault = run.Fault(run.ClassCancelled, "")
	case evidence.SpawnError != "":
		fault = run.Fault(run.ClassRuntimeUnavailable, "%s", evidence.SpawnError)
	case evidence.Exit != nil && evidence.Exit.Code != nil && *evidence.Exit.Code != 0:
		fault = run.Fault(run.ClassRuntimeError, "exit code %s%s", strconv.Itoa(*evidence.Exit.Code), detail)
	case evidence.Exit != nil && evidence.Exit.Signal != "":
		fault = run.Fault(run.ClassKilled, "%s%s", evidence.Exit.Signal, detail)
	default:
		fault = run.Fault(run.ClassNoResult, "exited without a result%s", detail)
	}
	turn.Status, turn.Error = run.StatusOf(fault.Class), fault
	return turn
}

// Failed is a turn that could not be attempted.
func Failed(class run.Class, err error) run.Turn {
	return run.Turn{Status: run.StatusOf(class), Error: run.Fault(class, "%v", err)}
}

// Version runs `<command> --version` and returns its output.
func Version(ctx context.Context, command string) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, command, "--version").Output()
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(out)), nil
}

// serialSink makes concurrent reports sequential, including the events
// onLine produces for a line.
type serialSink struct {
	mu    sync.Mutex
	inner app.EventSink
}

func (s *serialSink) Event(source, kind string, data map[string]any) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.inner.Event(source, kind, data)
}

func (s *serialSink) ProcessStarted(group int, token string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.inner.ProcessStarted(group, token)
}

func (s *serialSink) line(line string, onLine func(string)) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.inner.Raw(line)
	onLine(line)
}

type tail struct {
	mu    sync.Mutex
	limit int
	data  []byte
}

func (t *tail) Write(p []byte) (int, error) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.data = append(t.data, p...)
	if len(t.data) > t.limit {
		t.data = t.data[len(t.data)-t.limit:]
	}
	return len(p), nil
}

func (t *tail) String() string {
	t.mu.Lock()
	defer t.mu.Unlock()
	return string(t.data)
}
