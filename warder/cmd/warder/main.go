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
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/igor1309/ai-labs/warder/internal/attempt"
	"github.com/igor1309/ai-labs/warder/internal/capture"
	"github.com/igor1309/ai-labs/warder/internal/claude"
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

const usage = "usage: warder -claude <source-id> [-claude <source-id> ...]"

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	code := run(ctx, os.Args, os.Stdout, os.Stderr, osProcesses{waitDelay: processWaitDelay}.Execute, systemClock, realTimer)
	stop()
	os.Exit(code)
}

// executeFunc executes a command, ends it when ctx is done, and returns
// what the command wrote to its standard output, or an error. It is the
// boundary to the processes of the operating system, as the Claude Code
// adapter's executor.
type executeFunc func(ctx context.Context, name string, args ...string) (stdout []byte, err error)

func (execute executeFunc) Execute(ctx context.Context, name string, args ...string) ([]byte, error) {
	return execute(ctx, name, args...)
}

// clockFunc tells the current wall-clock time. It is the boundary to the
// clock, as a capture's clock.
type clockFunc func() time.Time

func (now clockFunc) Now() time.Time { return now() }

// run is the application: it enables the sources args asks for, args[0]
// being the program's name, runs them until ctx ends or one of them fails,
// and returns the exit code. It reaches nothing but what it is given:
// observations go to stdout, diagnostics and its own messages to stderr,
// commands through execute, the time comes from clock and every wait from
// timer.
func run(ctx context.Context, args []string, stdout, stderr io.Writer, execute executeFunc, clock clockFunc, timer timerFunc) int {
	sources, err := parseSources(args)
	if err != nil {
		fmt.Fprintf(stderr, "warder: %v\n%s\n", err, usage)
		return exitUsage
	}
	application, err := wire(sources, stdout, stderr, execute, clock, timer)
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

// parseSources reads the command line, args[0] being the program's name,
// and returns the IDs of the Claude Code sources it enables, in its order:
// one for each -claude <source-id>. No source, an empty ID, an ID given
// twice, an unknown flag and a stray argument are errors.
func parseSources(args []string) ([]string, error) {
	flags := flag.NewFlagSet("warder", flag.ContinueOnError)
	// The caller reports the error, once.
	flags.SetOutput(io.Discard)
	var sources []string
	enabled := map[string]bool{}
	flags.Func("claude", "enable a Claude Code source with this source ID", func(id string) error {
		if id == "" {
			return errors.New("empty source ID")
		}
		if enabled[id] {
			return fmt.Errorf("source ID %q is given twice", id)
		}
		enabled[id] = true
		sources = append(sources, id)
		return nil
	})
	if len(args) > 0 {
		args = args[1:]
	}
	if err := flags.Parse(args); err != nil {
		return nil, err
	}
	if flags.NArg() > 0 {
		return nil, fmt.Errorf("unexpected argument %q", flags.Arg(0))
	}
	if len(sources) == 0 {
		return nil, errors.New("no source enabled")
	}
	return sources, nil
}

// wire constructs the application: one source loop for each Claude Code
// source, all of them publishing through one JSONL publisher over stdout
// and reporting through one serialized stderr, under one runner. A missing
// boundary fails here; nothing is started.
func wire(claudeSources []string, stdout, stderr io.Writer, execute executeFunc, clock clockFunc, timer timerFunc) (*runner.Runner, error) {
	if stderr == nil {
		return nil, errors.New("no stderr")
	}
	if timer == nil {
		return nil, errors.New("no timer")
	}
	publisher, err := jsonl.New(stdout)
	if err != nil {
		return nil, err
	}
	diagnostics := &serialWriter{writer: stderr}

	loops := argumentsOf(runner.New)
	for _, source := range claudeSources {
		sourceLoop, err := wireClaudeSource(source, publisher.Publish, diagnostics, execute, clock, timer)
		if err != nil {
			return nil, fmt.Errorf("source %q: %w", source, err)
		}
		loops = append(loops, sourceLoop)
	}
	return runner.New(loops...)
}

// wireClaudeSource constructs the loop of one Claude Code source: its
// adapter over execute, its capture, its attempt and its loop, with the
// Claude settings.
func wireClaudeSource(source string, publish publishJSONL, diagnostics io.Writer, execute executeFunc, clock clockFunc, timer timerFunc) (*loop.Loop, error) {
	adapter, err := claude.New(execute)
	if err != nil {
		return nil, err
	}
	capturer, err := capture.New(source, readClaudeAgents(adapter.ReadAgents), clock)
	if err != nil {
		return nil, err
	}
	read, err := attempt.New[capture.Observation](
		capturer,
		timerDeadline{timer: timer, limit: claudeReadTimeout},
		publish,
		sourceReporter{source: source, writer: diagnostics},
	)
	if err != nil {
		return nil, err
	}
	return loop.New(read, timerWait{timer: timer}, claudePostAttemptWait)
}

// argumentsOf is an empty list of what a variadic constructor takes. A
// component's interface is named only in the file that declares it
// (warder/arch_test.go), so the root takes the element type from the
// constructor; the compiler still checks each value appended.
func argumentsOf[E, R any](func(...E) (R, error)) []E { return nil }
