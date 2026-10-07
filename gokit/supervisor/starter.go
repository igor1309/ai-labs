package supervisor

import (
	"context"
	"io"
	"os"
	"os/exec"
	"sync/atomic"
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
	// counted: a group with nothing else left has none. Once Wait has
	// returned the group's ID may be reused: the caller signals only before.
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
// PATH, in a process group of its own, its token from ps.
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
	return &execProcess{command: command, stdout: stdout}, nil
}

type execProcess struct {
	command *exec.Cmd
	stdout  *os.File
	// exited is set once Exited has observed the exit.
	exited atomic.Bool
}

func (p *execProcess) Stdout() io.ReadCloser { return p.stdout }

func (p *execProcess) Group() int { return p.command.Process.Pid }

func (p *execProcess) Token(ctx context.Context) (string, error) {
	return Token(ctx, p.command.Process.Pid)
}

// Signal signals the group. Once the leader has exited, whether the kernel
// counts it, a zombie until Wait, differs by platform: Linux signals it,
// macOS answers EPERM for a group with nothing else. So the group is
// signalled only when it has a member that has not exited, and with none
// it has no process (ESRCH): none can join it after, as no process of the
// group is left to start one.
func (p *execProcess) Signal(signal syscall.Signal) error {
	group := p.command.Process.Pid
	if p.exited.Load() {
		live, err := others(group)
		if err != nil {
			return err
		}
		if !live {
			return syscall.ESRCH
		}
	}
	return syscall.Kill(-group, signal)
}

func (p *execProcess) Exited() error {
	if err := exited(p.command.Process.Pid); err != nil {
		return err
	}
	p.exited.Store(true)
	return nil
}

func (p *execProcess) Wait() Exit {
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

// starter is s, or the operating system's when s is nil.
func starter(s Starter) Starter {
	if s != nil {
		return s
	}
	return Exec{}
}
