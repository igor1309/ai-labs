//go:build unix

package main

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"syscall"
	"testing"
	"time"
)

// warderProcess is the first argument that makes the test binary run as
// warder, the process of these tests.
const warderProcess = "warder-process"

// runWarderProcess is warder as the process, through serve, over the
// process's own stdout and stderr, the system clock and real timers, with
// every command answered at once by the executor of the scenario args
// names, which also gives what follows it to warder as its command line;
// it returns the exit code.
//
//   - closed-stdout <warder argument>...: answers sessions;
//   - held-stdout <fifo> <warder argument>...: answers a record far larger
//     than a pipe holds, and reports on the FIFO once serve released the
//     signals.
func runWarderProcess(args []string) int {
	if len(args) == 0 {
		return 64
	}
	switch args[0] {
	case "closed-stdout":
		answer := func(context.Context, string, ...string) ([]byte, error) { return []byte(sessions), nil }
		return serve(append([]string{"warder"}, args[1:]...), os.Stdout, os.Stderr, answer, systemClock, osTimers{newTimer: time.NewTimer}.Start, nil)
	case "held-stdout":
		fifo := args[1]
		answer := func(context.Context, string, ...string) ([]byte, error) { return manySessions(4000), nil }
		released := func() { _ = reportStarted(fifo, "released") }
		return serve(append([]string{"warder"}, args[2:]...), os.Stdout, os.Stderr, answer, systemClock, osTimers{newTimer: time.NewTimer}.Start, released)
	}
	return 64
}

// manySessions is an output of `claude agents --json` with n sessions.
func manySessions(n int) []byte {
	var output bytes.Buffer
	output.WriteString("[")
	for i := range n {
		if i > 0 {
			output.WriteString(",")
		}
		fmt.Fprintf(&output, `{"sessionId":"session-%d","status":"busy"}`, i)
	}
	output.WriteString("]")
	return output.Bytes()
}

// processBound guards a warder process that hangs: it is killed then.
const processBound = 30 * time.Second

// startedWarder is warder running as a process.
type startedWarder struct {
	command *exec.Cmd
	stderr  bytes.Buffer
	exited  chan struct{}
}

// startWarder runs the test binary as warder in scenario, with stdout as
// its standard output, which the caller closes on its side once this
// returns. The end of the test, or processBound, kills the process, and
// the test's end waits for it.
func startWarder(t *testing.T, stdout *os.File, scenario ...string) *startedWarder {
	t.Helper()
	ctx, cancel := context.WithTimeout(t.Context(), processBound)
	w := &startedWarder{exited: make(chan struct{})}
	w.command = exec.CommandContext(ctx, testBinary(t), append([]string{warderProcess}, scenario...)...)
	w.command.Stdout = stdout
	w.command.Stderr = &w.stderr
	if err := w.command.Start(); err != nil {
		cancel()
		t.Fatal(err)
	}
	go func() {
		defer close(w.exited)
		defer cancel()
		_ = w.command.Wait()
	}()
	t.Cleanup(func() {
		cancel()
		<-w.exited
	})
	return w
}

// status waits for the process to end and returns how it ended, and what
// it wrote to its standard error.
func (w *startedWarder) status() (syscall.WaitStatus, string) {
	<-w.exited
	return w.command.ProcessState.Sys().(syscall.WaitStatus), w.stderr.String()
}

// Contract test: SIGPIPE of the operating system. Warder as a process,
// whose stdout is a pipe with no reader, writes its first record there:
// the write fails as an output error, and the process exits 1 with a
// message on stderr, instead of being ended by the signal.
func TestAStdoutWithNoReaderEndsTheProcessWithExitCode1(t *testing.T) {
	t.Parallel()
	reader, writer, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	reader.Close()
	process := startWarder(t, writer, "closed-stdout", "-claude", "claude-main")
	writer.Close()

	status, stderr := process.status()

	if !status.Exited() || status.ExitStatus() != 1 {
		t.Errorf("the process ended with the status %#x, want the exit code 1", uint32(status))
	}
	if lines := strings.SplitAfter(stderr, "\n"); len(lines) != 2 || !strings.HasPrefix(stderr, "warder: ") || !strings.HasSuffix(stderr, ": broken pipe\n") {
		t.Errorf("got on stderr %q, want one line `warder: <what failed>: broken pipe`", stderr)
	}
}

// Contract test: SIGINT and SIGTERM of the operating system. Warder as a
// process is held by a write to a stdout whose consumer stopped reading: a
// first signal cancels the run, which waits for that write, and a second
// ends the process by the signal's default behaviour.
func TestASecondSignalEndsAProcessHeldByStdout(t *testing.T) {
	t.Parallel()
	for _, signal := range []syscall.Signal{syscall.SIGINT, syscall.SIGTERM} {
		t.Run(signal.String(), func(t *testing.T) {
			t.Parallel()
			reader, writer, err := os.Pipe()
			if err != nil {
				t.Fatal(err)
			}
			defer reader.Close()
			fifo, released := startedReport(t)
			process := startWarder(t, writer, "held-stdout", fifo, "-claude", "claude-main")
			writer.Close()
			// The first byte of the record: its write is in progress, and,
			// far larger than the pipe holds, stays so once nothing reads.
			if _, err := reader.Read(make([]byte, 1)); err != nil {
				status, stderr := process.status()
				t.Fatalf("no record on stdout: %v; the process ended with the status %#x and wrote on stderr %q", err, uint32(status), stderr)
			}

			if err := process.command.Process.Signal(signal); err != nil {
				t.Fatal(err)
			}
			select {
			case <-released:
			case <-process.exited:
				status, stderr := process.status()
				t.Fatalf("the process ended with the status %#x before it released the signals, and wrote on stderr %q", uint32(status), stderr)
			}
			if err := process.command.Process.Signal(signal); err != nil {
				t.Fatal(err)
			}

			status, stderr := process.status()
			if !status.Signaled() || status.Signal() != signal {
				t.Errorf("the process ended with the status %#x, want ended by %v; it wrote on stderr %q", uint32(status), signal, stderr)
			}
		})
	}
}
