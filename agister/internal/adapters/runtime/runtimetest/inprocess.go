package runtimetest

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"

	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/runtimetest/fakebash"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/runtimetest/fakeclaude"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/runtimetest/fakecodex"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/runtimetest/fakeopencode"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/runtimetest/fakepi"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/runtimetest/fakeproc"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/supervisor"
)

// Fake is a program run in process: a function of the process it runs as,
// returning the code it exits with.
type Fake func(fakeproc.Process) int

// fakes are the fake runtimes, by the name of the command that starts
// each: the CLI's own name, or the name Binary builds the fake under. With
// them is the bash a setup or verification command runs under.
var fakes = map[string]Fake{
	"bash":         fakebash.Main,
	"claude":       fakeclaude.Main,
	"fakeclaude":   fakeclaude.Main,
	"codex":        fakecodex.Main,
	"fakecodex":    fakecodex.Main,
	"opencode":     fakeopencode.Main,
	"fakeopencode": fakeopencode.Main,
	"pi":           fakepi.Main,
	"fakepi":       fakepi.Main,
}

// InProcess is a supervisor.Starter that starts no process: it runs the
// fake a command names in a goroutine, the fake's stdout a pipe as a real
// process's is. The fakes are the functions Binary builds, so Conformance
// over a built fake proves the protocol a test over InProcess relies on.
//
// The fake is picked by the command: one of Fakes by the command as given
// or by its base name, else the fake runtime of that base name (claude,
// codex, opencode, pi, or fake<name>, as Binary's paths end) or, for bash,
// the fake shell (fakebash). A command that names none fails to start, as
// a program missing from PATH does.
type InProcess struct {
	// Env is the environment every fake inherits, as "KEY=value"; a
	// command's own Env replaces a variable of the same name. The test
	// process's environment is never read.
	Env []string
	// Fakes are the test's own programs, by command.
	Fakes map[string]Fake
	// Reports, when set, receives each fake's start ("started") and the
	// points it then reports ("blocked", once it waits to be ended). A
	// send waits for the test to receive it, or for the fake's group to be
	// signalled.
	Reports chan<- Report
}

// Report is a point a fake started in process has reached.
type Report struct {
	// Command is the command that started the fake, as given.
	Command string
	Point   string
}

// groups numbers the fakes' process groups from above any process ID the
// system gives, so a reference to one names no real group: reaping it or
// signalling it by number finds nothing.
var groups atomic.Int64

func init() { groups.Store(1 << 30) }

func (i InProcess) Start(c supervisor.Command) (supervisor.Process, error) {
	fake, ok := i.fake(c.Name)
	if !ok {
		return nil, fmt.Errorf("runtimetest: no fake is named %q", c.Name)
	}
	dir := c.Dir
	if dir == "" {
		var err error
		if dir, err = os.Getwd(); err != nil {
			return nil, err
		}
	}
	stdout, writer, err := os.Pipe()
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithCancel(context.Background())
	p := &inProcess{stdout: stdout, group: int(groups.Add(1)), token: "in process: " + c.Name, cancel: cancel, exited: make(chan struct{})}
	report := func(point string) {
		if i.Reports == nil {
			return
		}
		select {
		case i.Reports <- Report{Command: c.Name, Point: point}:
		case <-ctx.Done():
		}
	}
	var stdin io.Reader = strings.NewReader("")
	if c.Stdin != nil {
		stdin = c.Stdin
	}
	var stderr io.Writer = writer
	if c.Stderr != nil {
		stderr = c.Stderr
	}
	env := append(append([]string{}, i.Env...), c.Env...)
	go func() {
		report("started")
		code := fake(fakeproc.Process{
			Context: ctx, Dir: dir, Args: c.Args, Getenv: func(name string) string { return lookup(env, name) },
			Stdin: stdin, Stdout: writer, Stderr: stderr, Report: report,
		})
		p.exit(code)
		writer.Close()
		cancel()
		close(p.exited)
	}()
	return p, nil
}

// fake is the fake command starts.
func (i InProcess) fake(command string) (Fake, bool) {
	base := filepath.Base(command)
	for _, name := range []string{command, base} {
		if fake, ok := i.Fakes[name]; ok {
			return fake, true
		}
	}
	fake, ok := fakes[base]
	return fake, ok
}

// lookup is the value of name in env, the last entry that sets it.
func lookup(env []string, name string) string {
	for n := len(env) - 1; n >= 0; n-- {
		if value, ok := strings.CutPrefix(env[n], name+"="); ok {
			return value
		}
	}
	return ""
}

// inProcess is a fake running in a goroutine, as the process and the group
// a starter returns.
type inProcess struct {
	stdout *os.File
	group  int
	token  string
	cancel context.CancelFunc
	exited chan struct{}

	mu sync.Mutex
	// done is set once the fake has returned; code is what it returned,
	// and signal the first signal sent before that.
	done   bool
	code   int
	signal syscall.Signal
}

func (p *inProcess) Stdout() io.ReadCloser { return p.stdout }

func (p *inProcess) Group() int { return p.group }

func (p *inProcess) Token(context.Context) (string, error) { return p.token, nil }

// Signal ends the fake's context, whatever the signal: a fake that waits
// to be ended returns. A fake that has returned is a group with no
// process.
func (p *inProcess) Signal(signal syscall.Signal) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.done {
		return syscall.ESRCH
	}
	if p.signal == 0 {
		p.signal = signal
	}
	p.cancel()
	return nil
}

func (p *inProcess) exit(code int) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.done, p.code = true, code
}

// Wait reports a fake signalled before it returned as ended by the signal,
// as the process would have been.
func (p *inProcess) Wait() supervisor.Exit {
	<-p.exited
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.signal != 0 {
		return supervisor.Exit{Signal: p.signal.String()}
	}
	return supervisor.Exit{Code: &p.code}
}
