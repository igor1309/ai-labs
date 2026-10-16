// Package supervisor is a wrapper (ADR-001; ADR-012, rule 6), in its own
// types: it starts a program in a directory with an environment, the
// program leading a process group of its own; writes its stdin; gives each
// line of its stdout as it is read; keeps the ends of its stdout and
// stderr, with their size and digest; and ends all the group started,
// when its context ends and when the program exits. Output held open by a
// process that left the group is read no longer than the grace.
package supervisor

import (
	"bytes"
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
)

const (
	// Kept is how much of each end of a stream is kept, in bytes.
	Kept = 16 << 10
	// Grace is how long a program told to end by SIGTERM has before its
	// group is killed, and how long its streams are read once it and its
	// group have ended.
	Grace = 2 * time.Second
	// LongestLine is the longest line of stdout given, in bytes, its newline
	// not counted: a longer one is skipped, so a program cannot make the
	// supervisor hold all it writes.
	LongestLine = 8 << 20
)

// ErrNotStarted is the error of a program that could not start.
var ErrNotStarted = errors.New("the program could not start")

// Program is a program to run: its name, a path or a name looked up on
// PATH; its arguments; its directory; its environment, as "KEY=value",
// over the supervisor's own: an entry replaces a variable of the same
// name; the text written to its stdin; and the function given each line of
// its stdout, nil for none.
type Program struct {
	Name  string
	Args  []string
	Dir   string
	Env   []string
	Stdin string
	Line  func(line string)
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

// Starter starts programs, each the leader of a process group of its own.
type Starter interface {
	// CheckExitObservation fails where a program's exit cannot be observed
	// before it is reaped.
	CheckExitObservation() error
	// Start starts program as it is given, its stdin read from the file
	// stdin and its stderr written to the file stderr: no copy of either
	// outlives the program's exit.
	Start(program Program, stdin, stderr *os.File) (Process, error)
}

// Process is a started program and the group it leads.
type Process interface {
	// Stdout reads what the program writes to stdout. It ends once every
	// holder of the writing end has closed it; closing it ends a read in
	// progress.
	Stdout() io.ReadCloser
	// Signal signals every process of the group. Once Wait has begun, the
	// group's ID may be another's.
	Signal(syscall.Signal) error
	// Exited returns once the program has exited, without reaping it: until
	// Wait, its ID, and so the group's, stays reserved. An error means the
	// exit could not be observed: Signal still reaches the group, and Wait
	// still reaps the program.
	Exited() error
	// Wait reaps the program and says how it exited.
	Wait() Exit
}

// Exit is how a program exited: the code it exited with, when Signal, the
// name of the signal that ended it, is empty.
type Exit struct {
	Code   int
	Signal string
}

// Captured reports the stream name (stdout or stderr) and total bytes read
// after a read has been accumulated. Calls for the two streams may overlap.
type Captured func(name string, size int64)

// Supervisor runs programs, the grace before a kill kept on its timer.
type Supervisor struct {
	timer    Timer
	programs Starter
	captured Captured
}

// New gives a supervisor over programs, its grace on timer and read progress on captured.
func New(timer Timer, programs Starter, captured Captured) (*Supervisor, error) {
	if timer == nil {
		return nil, errors.New("supervisor: no timer")
	}
	if programs == nil {
		return nil, errors.New("supervisor: no programs")
	}
	if captured == nil {
		return nil, errors.New("supervisor: no read progress")
	}
	return &Supervisor{timer: timer, programs: programs, captured: captured}, nil
}

// Run runs program and gives how it ended once it and all its group have
// ended. The directory is given with its links resolved, so the program's
// working directory and its PWD name the same path. Its stdin is written
// as its stdout is read, then closed; what it does not read is dropped.
// Each line of stdout, its newline removed, is given to program.Line as it
// is read, and a last line with no newline once stdout has been read to
// its end; a line longer than LongestLine is skipped. When ctx ends, the
// group is sent SIGTERM, then SIGKILL once Grace has passed; when the
// program exits, what it left running in its group is killed. A stream
// held open once the group has ended, by a process that left it, is read
// no longer than Grace on the timer, and is then incomplete. A program
// that cannot start is an error wrapping ErrNotStarted.
func (s *Supervisor) Run(ctx context.Context, program Program) (Result, error) {
	if err := s.programs.CheckExitObservation(); err != nil {
		return Result{}, notStarted(program, err)
	}
	if program.Dir != "" {
		resolved, err := filepath.EvalSymlinks(program.Dir)
		if err != nil {
			return Result{}, notStarted(program, err)
		}
		program.Dir = resolved
	}
	// stdin and stderr are pipes of their own, given to the program as
	// files: Wait then copies nothing, and returns once the program exits.
	stdinReader, stdin, err := os.Pipe()
	if err != nil {
		return Result{}, notStarted(program, err)
	}
	stderr, stderrWriter, err := os.Pipe()
	if err != nil {
		stdinReader.Close()
		stdin.Close()
		return Result{}, notStarted(program, err)
	}
	process, err := s.programs.Start(program, stdinReader, stderrWriter)
	stdinReader.Close()
	stderrWriter.Close()
	if err != nil {
		stdin.Close()
		stderr.Close()
		return Result{}, notStarted(program, err)
	}
	// Once the program and all who hold stdin are gone, a write fails and
	// what is left of the text is dropped; closing stdin ends a write in
	// progress.
	written := make(chan struct{})
	go func() {
		defer close(written)
		_, _ = io.WriteString(stdin, program.Stdin)
		stdin.Close()
	}()
	defer func() { stdin.Close(); <-written }()
	stdout := process.Stdout()
	defer stdout.Close()
	defer stderr.Close()
	out, errs := newStream(), newStream()
	var outWriter io.Writer = capturedStream{stream: out, name: "stdout", captured: s.captured}
	outEnded := func() {}
	if program.Line != nil {
		outLines := &lines{give: program.Line}
		outWriter, outEnded = io.MultiWriter(outWriter, outLines), outLines.end
	}
	var reading sync.WaitGroup
	reading.Add(2)
	for _, copied := range []struct {
		to     *stream
		writer io.Writer
		from   io.Reader
		ended  func()
	}{
		{out, outWriter, stdout, outEnded},
		{errs, capturedStream{stream: errs, name: "stderr", captured: s.captured}, stderr, func() {}},
	} {
		go func() {
			defer reading.Done()
			if _, err := io.Copy(copied.writer, copied.from); err != nil {
				copied.to.incomplete = true
				return
			}
			copied.ended()
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
	// it reaped. If observation fails, cleanup still owns the group, but
	// the failure is returned instead of attributing its kill to the program.
	observationErr := process.Exited()
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

	result := Result{Code: exit.Code, Signal: exit.Signal, Stdout: out.kept(), Stderr: errs.kept()}
	if observationErr != nil {
		return result, fmt.Errorf("observing %s exiting: %w", program.Name, observationErr)
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

// lines gives each line written to it, its newline removed, once the line
// is whole, skipping one longer than LongestLine.
type lines struct {
	give    func(line string)
	held    []byte
	tooLong bool
}

func (l *lines) Write(p []byte) (int, error) {
	n := len(p)
	for {
		i := bytes.IndexByte(p, '\n')
		if i < 0 {
			l.hold(p)
			return n, nil
		}
		l.hold(p[:i])
		if !l.tooLong {
			l.give(string(l.held))
		}
		l.held, l.tooLong = l.held[:0], false
		p = p[i+1:]
	}
}

func (l *lines) hold(p []byte) {
	if l.tooLong {
		return
	}
	if len(l.held)+len(p) > LongestLine {
		l.held, l.tooLong = l.held[:0], true
		return
	}
	l.held = append(l.held, p...)
}

// end gives the last line of a stream read to its end, written with no
// newline.
func (l *lines) end() {
	if len(l.held) > 0 && !l.tooLong {
		l.give(string(l.held))
	}
}

// capturedStream publishes progress only after the bytes belong to the stream.
type capturedStream struct {
	*stream
	name     string
	captured Captured
}

func (s capturedStream) Write(p []byte) (int, error) {
	n, err := s.stream.Write(p)
	s.captured(s.name, s.size)
	return n, err
}
