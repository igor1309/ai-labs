// Package supervisor is a wrapper (ADR-001; ADR-012, rule 6), in its own
// types: it starts a program in a directory with an environment, the
// program leading a process group of its own; keeps the ends of its stdout
// and stderr, with their size and digest; and ends all the group started,
// when its context ends and when the program exits. Output held open by a
// process that left the group is read no longer than the grace.
package supervisor

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"hash"
	"io"
	"os"
	"path/filepath"
	"sync"
	"syscall"
	"time"

	group "github.com/igor1309/ai-labs/gokit/supervisor"
)

const (
	// Kept is how much of each end of a stream is kept, in bytes.
	Kept = 16 << 10
	// Grace is how long a program told to end by SIGTERM has before its
	// group is killed, and how long its streams are read once it and its
	// group have ended.
	Grace = 2 * time.Second
)

// ErrNotStarted is the error of a program that could not start.
var ErrNotStarted = errors.New("the program could not start")

// Program is a program to run: its name, a path or a name looked up on
// PATH; its arguments; its directory; and its environment, as
// "KEY=value", over the supervisor's own: an entry replaces a variable of
// the same name.
type Program struct {
	Name string
	Args []string
	Dir  string
	Env  []string
}

// Result is how a program ended, and what it wrote.
type Result struct {
	// Code is the code it exited with, when Signal is empty.
	Code int
	// Signal is the name of the signal that ended it, as "terminated".
	Signal         string
	Stdout, Stderr Stream
}

// Stream is what is kept of one of a program's streams: its first and its
// last Kept bytes, which overlap when it is shorter than twice that, its
// size and the hex SHA-256 digest of the whole. A stream not read to its
// end is Incomplete: what was read of it is kept so.
type Stream struct {
	Head, Tail string
	Size       int64
	Digest     string
	Incomplete bool
}

// Timer starts a wait: fired delivers once it has passed, and stop
// releases it.
type Timer func(wait time.Duration) (fired <-chan time.Time, stop func())

// Supervisor runs programs, the grace before a kill kept on its timer.
type Supervisor struct {
	timer Timer
}

// New gives a supervisor whose grace runs on timer.
func New(timer Timer) (*Supervisor, error) {
	if timer == nil {
		return nil, errors.New("supervisor: no timer")
	}
	return &Supervisor{timer: timer}, nil
}

// Run runs program and gives how it ended once it and all its group have
// ended. The directory is given with its links resolved, so the program's
// working directory and its PWD name the same path. When ctx ends, the
// group is sent SIGTERM, then SIGKILL once Grace has passed; when the
// program exits, what it left running in its group is killed. A stream
// held open once the group has ended, by a process that left it, is read
// no longer than Grace on the timer, and is then incomplete. A program
// that cannot start is an error wrapping ErrNotStarted.
func (s *Supervisor) Run(ctx context.Context, program Program) (Result, error) {
	dir := program.Dir
	if dir != "" {
		resolved, err := filepath.EvalSymlinks(dir)
		if err != nil {
			return Result{}, notStarted(program, err)
		}
		dir = resolved
	}
	// stderr is a pipe of its own, given to the program as a file: Wait
	// then copies nothing, and returns once the program exits.
	stderr, stderrWriter, err := os.Pipe()
	if err != nil {
		return Result{}, notStarted(program, err)
	}
	process, err := group.Exec{}.Start(group.Command{
		Name: program.Name, Args: program.Args, Dir: dir, Env: program.Env, Stderr: stderrWriter,
	})
	stderrWriter.Close()
	if err != nil {
		stderr.Close()
		return Result{}, notStarted(program, err)
	}
	stdout := process.Stdout()
	defer stdout.Close()
	defer stderr.Close()
	out, errs := newStream(), newStream()
	var reading sync.WaitGroup
	reading.Add(2)
	for _, copied := range []struct {
		to   *stream
		from io.Reader
	}{{out, stdout}, {errs, stderr}} {
		go func() {
			defer reading.Done()
			if _, err := io.Copy(copied.to, copied.from); err != nil {
				copied.to.incomplete = true
			}
		}()
	}
	read := make(chan struct{})
	go func() { reading.Wait(); close(read) }()

	// The group is signalled only while the unreaped program keeps its ID
	// reserved: reaping is set, under mu, before the program is reaped,
	// once the ID may be another's.
	var mu sync.Mutex
	reaping := false
	signal := func(sig syscall.Signal) bool {
		mu.Lock()
		defer mu.Unlock()
		if reaping {
			return false
		}
		_ = process.Signal(sig)
		return true
	}
	exited, watched := make(chan struct{}), make(chan struct{})
	go func() {
		defer close(watched)
		select {
		case <-exited:
			return
		case <-ctx.Done():
		}
		if !signal(syscall.SIGTERM) {
			return
		}
		killed, stop := s.timer(Grace)
		defer stop()
		select {
		case <-exited:
		case <-killed:
			signal(syscall.SIGKILL)
		}
	}()

	// What the program left running in its group is killed while the
	// exited program, not yet reaped, keeps the group's ID; only then is
	// it reaped. An exit that cannot be observed so, as on a platform
	// other than macOS, leaves the program to the same kill.
	_ = process.Exited()
	mu.Lock()
	_ = process.Signal(syscall.SIGKILL)
	reaping = true
	mu.Unlock()
	exit := process.Wait()
	close(exited)
	<-watched
	// What the group held of the pipes is closed by now; a process that left
	// the group may hold them still, for as long as it runs.
	held, stopHeld := s.timer(Grace)
	select {
	case <-read:
	case <-held:
		stdout.Close()
		stderr.Close()
		<-read
	}
	stopHeld()

	result := Result{Signal: exit.Signal, Stdout: out.kept(), Stderr: errs.kept()}
	if exit.Code != nil {
		result.Code = *exit.Code
	}
	return result, nil
}

func notStarted(program Program, err error) error {
	return fmt.Errorf("%w: %s: %w", ErrNotStarted, program.Name, err)
}

// stream keeps what is written to it as a Stream does.
type stream struct {
	head, tail []byte
	size       int64
	digest     hash.Hash
	incomplete bool
}

func newStream() *stream { return &stream{digest: sha256.New()} }

func (s *stream) Write(p []byte) (int, error) {
	s.size += int64(len(p))
	s.digest.Write(p)
	if room := Kept - len(s.head); room > 0 {
		s.head = append(s.head, p[:min(room, len(p))]...)
	}
	s.tail = append(s.tail, p...)
	if over := len(s.tail) - Kept; over > 0 {
		s.tail = append(s.tail[:0], s.tail[over:]...)
	}
	return len(p), nil
}

func (s *stream) kept() Stream {
	return Stream{
		Head: string(s.head), Tail: string(s.tail), Size: s.size,
		Digest: hex.EncodeToString(s.digest.Sum(nil)), Incomplete: s.incomplete,
	}
}
