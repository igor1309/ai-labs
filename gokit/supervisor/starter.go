package supervisor

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"sync"
	"syscall"
	"time"
)

// Starter starts a process as the leader of a process group of its own.
// Exec is the operating system's; a test starts its fakes in process
// instead, so the supervisor's timeout, termination, leftover and output
// logic runs over them as it does over a real process.
type Starter interface {
	Start(Command) (Process, error)
}

// Command is a process to start.
type Command struct {
	// Name is the program: a path, or a name looked up on PATH.
	Name string
	Args []string
	// Dir is its working directory; empty is the starter's own.
	Dir string
	// Env is added to the environment the process inherits, as "KEY=value";
	// an entry replaces an inherited variable of the same name.
	Env []string
	// Stdin is what it reads on stdin; nil is nothing.
	Stdin io.Reader
	// Stderr is where its stderr goes; nil sends it where its stdout goes.
	Stderr io.Writer
	// WaitDelay bounds the copying of Stdin and Stderr after the exit;
	// zero does not bound it.
	WaitDelay time.Duration
}

// Process is a started process and the group it leads.
type Process interface {
	// Stdout reads what the process writes to stdout. It ends once every
	// holder of the writing end has closed it, which a descendant may keep
	// from happening after the exit; closing it ends a read in progress.
	Stdout() io.ReadCloser
	// Group is the ID of the process group.
	Group() int
	// Token identifies the process instance that leads the group (see
	// Token).
	Token(ctx context.Context) (string, error)
	// Signal signals every process of the group, and fails with ESRCH when
	// the group has none. Once Exited has returned the exited leader is not
	// counted: a group with nothing else left has none, and any other error
	// says it cannot be told. Once Wait has returned the group's ID may be
	// reused: the caller signals only before.
	Signal(syscall.Signal) error
	// Exited returns once the process has exited, without reaping it: until
	// Wait, its ID, and so the group's, stays reserved. An error means the
	// exit could not be observed; Wait still reaps the process.
	Exited() error
	// Wait reaps the process, waiting for its exit if Exited has not
	// returned, and says how it exited.
	Wait() Exit
}

// Exec starts processes with the operating system: the program found on
// PATH, in a process group of its own, its token from ps. Its process
// signals nothing once Wait has begun, as the group's ID may then be
// reused at any moment.
type Exec struct{}

func (Exec) Start(c Command) (Process, error) {
	// A plain pipe, not StdoutPipe: Wait then returns when the process
	// exits, not when every holder of stdout has closed it.
	stdout, writer, err := os.Pipe()
	if err != nil {
		return nil, err
	}
	command := exec.Command(c.Name, c.Args...)
	command.Dir = c.Dir
	if len(c.Env) > 0 {
		command.Env = append(command.Environ(), c.Env...)
	}
	if c.Stdin != nil {
		command.Stdin = c.Stdin
	}
	command.Stdout = writer
	if c.Stderr != nil {
		command.Stderr = c.Stderr
	} else {
		command.Stderr = writer
	}
	command.WaitDelay = c.WaitDelay
	command.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	err = command.Start()
	writer.Close()
	if err != nil {
		stdout.Close()
		return nil, err
	}
	pid := command.Process.Pid
	p := &execProcess{command: command, stdout: stdout}
	p.leader = &leader{pid: pid, kill: syscall.Kill, observe: exited, others: others, alone: zombieAlone(), reap: p.reap}
	return p, nil
}

// execProcess is a process Exec started: its group's signals and its reap
// are its leader's.
type execProcess struct {
	*leader
	command *exec.Cmd
	stdout  *os.File
}

func (p *execProcess) Stdout() io.ReadCloser { return p.stdout }

func (p *execProcess) Group() int { return p.command.Process.Pid }

func (p *execProcess) Token(ctx context.Context) (string, error) {
	return Token(ctx, p.command.Process.Pid)
}

func (p *execProcess) reap() Exit {
	waitErr := p.command.Wait()
	var exit Exit
	if state := p.command.ProcessState; state != nil {
		if status, ok := state.Sys().(syscall.WaitStatus); ok && status.Signaled() {
			exit.Signal = status.Signal().String()
		} else {
			code := state.ExitCode()
			exit.Code = &code
		}
	} else if waitErr != nil {
		exit.Signal = waitErr.Error()
	}
	return exit
}

// errReaped is what Signal answers once Wait has begun: the leader is
// reaped, or about to be, and its group's ID may be another's.
var errReaped = errors.New("supervisor: the group's leader is reaped: its ID may be another's")

// errChanged is what Signal answers when the group's processes changed
// while they were listed: whether the kill reached leftovers cannot be
// told.
var errChanged = errors.New("supervisor: the group's processes changed while they were listed")

// leader is a child of this process that leads its group: the group is
// signalled only while the leader, running or exited and not yet reaped,
// keeps its ID reserved. Its system calls are given, so a test drives it
// with no process.
type leader struct {
	pid int
	// kill is kill(2); observe returns once pid has exited, without
	// reaping it; others says whether the group has a process other than
	// its leader that has not exited; alone is what kill answers for the
	// group of an exited leader alone; reap reaps the leader.
	kill    func(pid int, signal syscall.Signal) error
	observe func(pid int) error
	others  func(group int) (bool, error)
	alone   error
	reap    func() Exit

	mu sync.Mutex
	// exited is set once observe has seen the exit, reaping once Wait has
	// begun: nothing is signalled from then.
	exited, reaping bool
	once            sync.Once
	exit            Exit
}

// Signal signals the group, until Wait has begun. Once the leader has
// exited, the kernel's answer does not tell leftovers from the exited
// leader alone, whom Linux signals and macOS refuses (EPERM): the group's
// processes are listed to tell. The kill is sent whatever the listing
// finds; one that failed, or that the group changed under, leaves the
// result unknown, an error other than ESRCH.
func (l *leader) Signal(signal syscall.Signal) error {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.reaping {
		return errReaped
	}
	if !l.exited {
		return l.kill(-l.pid, signal)
	}
	live, listed := l.others(l.pid)
	killed := l.kill(-l.pid, signal)
	switch {
	case errors.Is(killed, syscall.ESRCH):
		return killed
	case listed != nil:
		return fmt.Errorf("listing the group's processes: %w", listed)
	case live:
		return killed
	case !errors.Is(killed, l.alone):
		// None was listed, yet the kill was answered as for one.
		return errChanged
	}
	// One that joined while the group was listed is there still.
	if live, listed := l.others(l.pid); listed != nil {
		return fmt.Errorf("listing the group's processes: %w", listed)
	} else if live {
		return errChanged
	}
	return syscall.ESRCH
}

func (l *leader) Exited() error {
	if err := l.observe(l.pid); err != nil {
		return err
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	l.exited = true
	return nil
}

// Wait ends the group's signals, then reaps the leader; a later call says
// the same and reaps nothing.
func (l *leader) Wait() Exit {
	l.mu.Lock()
	l.reaping = true
	l.mu.Unlock()
	l.once.Do(func() { l.exit = l.reap() })
	return l.exit
}

// starter is s, or the operating system's when s is nil.
func starter(s Starter) Starter {
	if s != nil {
		return s
	}
	return Exec{}
}
