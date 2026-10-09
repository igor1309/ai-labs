// Command warder is the coding agent monitor: it reads the state of the
// coding agents of each enabled source at an interval and writes every
// complete observation as one JSON line on stdout.
//
// This package is warder's composition root. It selects the enabled
// sources, constructs every component and connects them through the
// adapters it owns; it holds no observation logic.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"log/slog"
	"os"
	"os/signal"
	"reflect"
	"syscall"
	"time"
	"unicode/utf8"

	"github.com/igor1309/ai-labs/warder/internal/attempt"
	"github.com/igor1309/ai-labs/warder/internal/capture"
	"github.com/igor1309/ai-labs/warder/internal/claude"
	"github.com/igor1309/ai-labs/warder/internal/codex"
	"github.com/igor1309/ai-labs/warder/internal/jsonl"
	"github.com/igor1309/ai-labs/warder/internal/loop"
	"github.com/igor1309/ai-labs/warder/internal/runner"
)

// The settings of a Claude Code source.
const (
	// claudeReadTimeout limits one read.
	claudeReadTimeout = 5 * time.Second
	// claudePostAttemptWait is waited after each attempt, before the next.
	claudePostAttemptWait = 5 * time.Second
)

// The settings of a Codex source.
const (
	// codexReadTimeout limits one read.
	codexReadTimeout = 5 * time.Second
	// codexPostAttemptWait is waited after each attempt, before the next.
	codexPostAttemptWait = 5 * time.Second
	// codexScanChunk is how many bytes of a rollout file one read of it
	// asks for.
	codexScanChunk = 1 << 20
	// codexScanCap is how many bytes of one rollout file are read, from
	// its end, for the session's last turn marker: twice the largest
	// rollout file observed. A session whose marker is before that reads
	// as unknown.
	codexScanCap = 32 << 20
)

// processWaitDelay is how long a command that exited or was killed is
// waited for to release its output, before the output is taken as it is.
const processWaitDelay = time.Second

// The exit codes.
const (
	// exitStopped: the run was cancelled, and every source loop returned.
	exitStopped = 0
	// exitFailed: a failure the monitor cannot recover from, as an output
	// error is.
	exitFailed = 1
	// exitUsage: the command line enables no valid set of sources; nothing
	// was started.
	exitUsage = 2
)

const usage = "usage: warder [-verbose] {-claude|-codex} <source-id> [{-claude|-codex} <source-id> ...]"

func main() {
	files := osFiles{root: codexHome(os.Getenv, os.UserHomeDir), readDir: os.ReadDir}.codexFiles()
	os.Exit(serve(os.Args, os.Stdout, os.Stderr, osProcesses{waitDelay: processWaitDelay}.Execute, files, systemClock, osTimers{newTimer: time.NewTimer}.Start, nil))
}

// serve is the application as the process: it runs until SIGINT or
// SIGTERM cancels the run, and returns the exit code. SIGPIPE is ignored,
// so a write to a stdout or stderr whose reader is gone returns EPIPE, an
// output error, instead of ending the process.
//
// A first signal waits for a write to stdout in progress: its consumer
// may hold the run. So once that signal has cancelled the run, the default
// behaviour of both signals is restored, and a second ends the process.
// released, when set, is called once it is restored; main leaves it
// unset, it is the event the package's tests wait for.
func serve(args []string, stdout, stderr io.Writer, execute executeFunc, files codexFiles, clock clockFunc, timer timerFunc, released func()) int {
	signal.Ignore(syscall.SIGPIPE)
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	context.AfterFunc(ctx, func() {
		stop()
		if released != nil {
			released()
		}
	})
	return run(ctx, args, stdout, stderr, execute, files, clock, timer, nil)
}

// executeFunc executes a command, ends it when ctx is done, and returns
// what the command wrote to its standard output, or an error. It is the
// boundary to the processes of the operating system, as the Claude Code
// adapter's executor.
type executeFunc func(ctx context.Context, name string, args ...string) (stdout []byte, err error)

func (execute executeFunc) Execute(ctx context.Context, name string, args ...string) ([]byte, error) {
	return execute(ctx, name, args...)
}

// codexFiles reads the files of the Codex home, by their paths from it:
// the names in a directory, whether another process holds a lock on a
// file, the files under a directory whose names begin and end as asked, a
// file's size, and a range of its bytes. Each ends with an error when ctx
// is done. It is the boundary to the file system, as the Codex adapter's
// files; one with a function missing is missing.
type codexFiles struct {
	list   func(ctx context.Context, dir string) (names []string, err error)
	locked func(ctx context.Context, file string) (locked bool, err error)
	find   func(ctx context.Context, dir, prefix, suffix string) (files []string, err error)
	size   func(ctx context.Context, file string) (size int64, err error)
	read   func(ctx context.Context, file string, offset, length int64) (data []byte, err error)
}

// missing tells whether one of the functions is missing.
func (f codexFiles) missing() bool {
	return f.list == nil || f.locked == nil || f.find == nil || f.size == nil || f.read == nil
}

// clockFunc tells the current wall-clock time. It is the boundary to the
// clock, as a capture's clock.
type clockFunc func() time.Time

func (now clockFunc) Now() time.Time { return now() }

// run is the application: it enables the sources args asks for, args[0]
// being the program's name, runs them until ctx ends or one of them fails,
// and returns the exit code. It reaches nothing but what it is given:
// observations go to stdout, diagnostics, the logs -verbose asks for and
// its own messages to stderr, commands through execute, the Codex home is
// read through files, the time comes from clock and every wait from
// timer. A missing stderr, or one that is a nil pointer, map, slice, func
// or chan carried as a writer, exits 1 with nothing started: there is
// nowhere to say why. attempted, when set, is called as each Write to
// stderr begins, before it waits for its turn; serve leaves it unset, it
// is the event the package's tests wait for.
func run(ctx context.Context, args []string, stdout, stderr io.Writer, execute executeFunc, files codexFiles, clock clockFunc, timer timerFunc, attempted func()) int {
	if missingWriter(stderr) {
		return exitFailed
	}
	command, err := parseCommandLine(args)
	if err != nil {
		fmt.Fprintf(stderr, "warder: %v\n%s\n", err, usage)
		return exitUsage
	}
	diagnostics := &serialWriter{writer: stderr, attempted: attempted}
	application, err := wire(command.claudeSources, command.codexSources, stdout, diagnostics, newLogger(diagnostics, command.verbose), execute, files, clock, timer)
	if err != nil {
		fmt.Fprintf(stderr, "warder: %v\n", err)
		return exitFailed
	}
	if err := application.Run(ctx); err != nil {
		fmt.Fprintf(stderr, "warder: %v\n", err)
		return exitFailed
	}
	return exitStopped
}

// commandLine is what the command line asks for.
type commandLine struct {
	// claudeSources are the IDs of the Claude Code sources enabled, in the
	// order given.
	claudeSources []string
	// codexSources are the IDs of the Codex sources enabled, in the order
	// given.
	codexSources []string
	// verbose turns the decorators' logs on.
	verbose bool
}

// parseCommandLine reads the command line, args[0] being the program's
// name: the IDs of the sources it enables, in its order, one Claude Code
// source for each -claude <source-id> and one Codex source for each
// -codex <source-id>, and whether -verbose is given. No source of either
// runtime, an empty ID, an ID that is not valid UTF-8, an ID given twice,
// by one flag or by both, an unknown flag, a -verbose that is not a
// boolean and a stray argument are errors.
func parseCommandLine(args []string) (commandLine, error) {
	flags := flag.NewFlagSet("warder", flag.ContinueOnError)
	// The caller reports the error, once.
	flags.SetOutput(io.Discard)
	var command commandLine
	enabled := map[string]bool{}
	// enable is a flag's function that adds each valid ID to sources.
	enable := func(sources *[]string) func(id string) error {
		return func(id string) error {
			if id == "" {
				return errors.New("empty source ID")
			}
			if !utf8.ValidString(id) {
				return fmt.Errorf("source ID %q is not valid UTF-8", id)
			}
			if enabled[id] {
				return fmt.Errorf("source ID %q is given twice", id)
			}
			enabled[id] = true
			*sources = append(*sources, id)
			return nil
		}
	}
	flags.Func("claude", "enable a Claude Code source with this source ID", enable(&command.claudeSources))
	flags.Func("codex", "enable a Codex source with this source ID", enable(&command.codexSources))
	verbose := flags.Bool("verbose", false, "log each read, capture, deadline, publish and wait on stderr")
	if len(args) > 0 {
		args = args[1:]
	}
	if err := flags.Parse(args); err != nil {
		return commandLine{}, err
	}
	if flags.NArg() > 0 {
		return commandLine{}, fmt.Errorf("unexpected argument %q", flags.Arg(0))
	}
	if len(enabled) == 0 {
		return commandLine{}, errors.New("no source enabled")
	}
	command.verbose = *verbose
	return command, nil
}

// wire constructs the application: one source loop for each Claude Code
// source and each Codex source, all of them publishing through one JSONL
// publisher over stdout and reporting through stderr, under one runner.
// stderr is written by every source at once, so the caller gives it
// serialized, as the writer logger writes to: run gives a serialWriter.
// Each source's collaborators are wrapped in the decorators that log
// through logger, timed by clock.
// A missing boundary, or a stderr that is a nil pointer, map, slice, func
// or chan carried as a writer, fails here; nothing is started. A boundary
// only one runtime reaches, execute for Claude Code and files for Codex,
// is missed only by a source of that runtime.
func wire(claudeSources, codexSources []string, stdout, stderr io.Writer, logger *slog.Logger, execute executeFunc, files codexFiles, clock clockFunc, timer timerFunc) (*runner.Runner, error) {
	if missingWriter(stderr) {
		return nil, errors.New("no stderr")
	}
	if logger == nil {
		return nil, errors.New("no logger")
	}
	if timer == nil {
		return nil, errors.New("no timer")
	}
	publisher, err := jsonl.New(stdout)
	if err != nil {
		return nil, err
	}

	loops := argumentsOf(runner.New)
	for _, source := range claudeSources {
		log := sourceLog{logger: logger, clock: clock, source: source}
		sourceLoop, err := wireClaudeSource(source, publisher.Publish, stderr, log, execute, clock, timer)
		if err != nil {
			return nil, fmt.Errorf("source %q: %w", source, err)
		}
		loops = append(loops, sourceLoop)
	}
	for _, source := range codexSources {
		log := sourceLog{logger: logger, clock: clock, source: source}
		sourceLoop, err := wireCodexSource(source, publisher.Publish, stderr, log, files, clock, timer)
		if err != nil {
			return nil, fmt.Errorf("source %q: %w", source, err)
		}
		loops = append(loops, sourceLoop)
	}
	return runner.New(loops...)
}

// wireClaudeSource constructs the loop of one Claude Code source: its
// adapter over execute, whose every execution is wrapped in the decorator
// that records it through log, and its loop over that adapter's read, with
// the Claude settings.
func wireClaudeSource(source string, publish publishJSONL, diagnostics io.Writer, log sourceLog, execute executeFunc, clock clockFunc, timer timerFunc) (*loop.Loop, error) {
	adapter, err := claude.New(logExecute(execute, log))
	if err != nil {
		return nil, err
	}
	return wireSource(source, readClaudeAgents(adapter.ReadAgents).ReadAgents, claudeReadTimeout, claudePostAttemptWait, publish, diagnostics, log, clock, timer)
}

// wireCodexSource constructs the loop of one Codex source: its adapter
// over files, whose every operation is wrapped in the decorator that
// records it through log, and its loop over that adapter's read, with the
// Codex settings.
func wireCodexSource(source string, publish publishJSONL, diagnostics io.Writer, log sourceLog, files codexFiles, clock clockFunc, timer timerFunc) (*loop.Loop, error) {
	adapter, err := codex.New(logCodexFiles(files, log), codex.Scan{Chunk: codexScanChunk, Cap: codexScanCap})
	if err != nil {
		return nil, err
	}
	return wireSource(source, readCodexAgents(adapter.ReadAgents).ReadAgents, codexReadTimeout, codexPostAttemptWait, publish, diagnostics, log, clock, timer)
}

// wireSource constructs the loop of one source over read, its runtime
// adapter's read as a capture's: its capture, its attempt, limited to
// readTimeout, and its loop, which waits postAttemptWait after each
// attempt. Its read, capture, deadline, publish and wait are each wrapped
// in the decorator that records it through log; the capture's decorator
// tells the deadline's whether the limit ended the read.
func wireSource(source string, read func(ctx context.Context) ([]capture.Agent, error), readTimeout, postAttemptWait time.Duration, publish publishJSONL, diagnostics io.Writer, log sourceLog, clock clockFunc, timer timerFunc) (*loop.Loop, error) {
	capturer, err := capture.New(source, loggedReadAgents{read: read, log: log}, clock)
	if err != nil {
		return nil, err
	}
	deadline := timerDeadline{timer: timer, limit: readTimeout}
	ending := &readEnd{}
	attempts, err := attempt.New[capture.Observation](
		loggedCapture{capture: capturer.Capture, ending: ending, log: log},
		loggedDeadline{limit: deadline.Limit, given: deadline.limit, ending: ending, log: log},
		loggedPublish{publish: publish.Publish, log: log},
		sourceReporter{source: source, writer: diagnostics},
	)
	if err != nil {
		return nil, err
	}
	return loop.New(attempts, loggedWait{wait: timerWait{timer: timer}.Wait, log: log}, postAttemptWait)
}

// argumentsOf is an empty list of what a variadic constructor takes. A
// component's interface is named only in the file that declares it
// (warder/arch_test.go), so the root takes the element type from the
// constructor; the compiler still checks each value appended.
func argumentsOf[E, R any](func(...E) (R, error)) []E { return nil }

// missingWriter tells whether writer is missing: nil, or a nil pointer,
// map, slice, func or chan carried as a writer.
func missingWriter(writer io.Writer) bool {
	return writer == nil || isNil(reflect.ValueOf(writer))
}

func isNil(value reflect.Value) bool {
	switch value.Kind() {
	case reflect.Pointer, reflect.Map, reflect.Slice, reflect.Func, reflect.Chan, reflect.Interface, reflect.UnsafePointer:
		return value.IsNil()
	}
	return false
}
