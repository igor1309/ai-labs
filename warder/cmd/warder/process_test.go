//go:build unix

package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"testing"
	"time"
)

// fakeProcess is the first argument that makes the test binary run as the
// fake process of these tests.
const fakeProcess = "fake-process"

// fakeHang is how long a fake process that hangs sleeps: longer than the
// test binary runs, so within a test being ended is its only way out, and
// one that a failed test left behind still ends by itself.
const fakeHang = 5 * time.Minute

// TestMain runs the tests, or, started as `<test binary> fake-process
// <scenario> ...`, the fake process of the executor's contract tests: the
// test binary is their one build.
func TestMain(m *testing.M) {
	if len(os.Args) > 1 && os.Args[1] == fakeProcess {
		os.Exit(runFakeProcess(os.Args[2:]))
	}
	os.Exit(m.Run())
}

// runFakeProcess is the fake process: the scenario args names, and its
// exit code.
//
//   - succeed: writes to both its outputs and exits 0;
//   - fail: writes to both its outputs and exits 3;
//   - hang <fifo>: reports on the FIFO that it started, and hangs;
//   - hang-with-child <fifo>: starts a child that holds its standard
//     output and hangs, reports the child's process ID on the FIFO, and
//     hangs;
//   - sleep: hangs.
func runFakeProcess(args []string) int {
	if len(args) == 0 {
		return 64
	}
	switch args[0] {
	case "succeed":
		fmt.Fprint(os.Stdout, "what the command printed\n")
		fmt.Fprint(os.Stderr, "a warning\n")
		return 0
	case "fail":
		fmt.Fprint(os.Stdout, "a partial answer\n")
		fmt.Fprint(os.Stderr, "fake: no session store\n")
		return 3
	case "hang":
		if err := reportStarted(args[1], "started"); err != nil {
			return 1
		}
		time.Sleep(fakeHang)
		return 0
	case "hang-with-child":
		child := exec.Command(os.Args[0], fakeProcess, "sleep")
		child.Stdout = os.Stdout
		if err := child.Start(); err != nil {
			return 1
		}
		if err := reportStarted(args[1], strconv.Itoa(child.Process.Pid)); err != nil {
			return 1
		}
		time.Sleep(fakeHang)
		return 0
	case "sleep":
		time.Sleep(fakeHang)
		return 0
	}
	return 64
}

// reportStarted writes report on the FIFO, once the test reads it.
func reportStarted(fifo, report string) error {
	return os.WriteFile(fifo, []byte(report), 0)
}

// testBinary is the path of the test binary.
func testBinary(t *testing.T) string {
	t.Helper()
	path, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	return path
}

// startedReport makes a FIFO for a fake process to report on, and returns
// its path and the channel the report arrives on: an event of the
// operating system, so no test polls for a process that started.
func startedReport(t *testing.T) (fifo string, started <-chan string) {
	t.Helper()
	fifo = filepath.Join(t.TempDir(), "started")
	if err := syscall.Mkfifo(fifo, 0o600); err != nil {
		t.Fatal(err)
	}
	reports := make(chan string, 1)
	go func() {
		// Blocks until the fake process opens the FIFO to write.
		report, _ := os.ReadFile(fifo)
		reports <- string(report)
	}()
	t.Cleanup(func() {
		// After a test that failed before its process reported, the reader
		// still waits: opening the FIFO to write ends it.
		if fd, err := syscall.Open(fifo, syscall.O_WRONLY|syscall.O_NONBLOCK, 0); err == nil {
			syscall.Close(fd)
		}
	})
	return fifo, reports
}

// startExecute executes the test binary as the fake process of scenario in
// a goroutine and returns the channel its error arrives on.
func startExecute(ctx context.Context, t *testing.T, processes osProcesses, scenario ...string) <-chan error {
	t.Helper()
	binary := testBinary(t)
	result := make(chan error, 1)
	go func() {
		_, err := processes.Execute(ctx, binary, append([]string{fakeProcess}, scenario...)...)
		result <- err
	}()
	return result
}

// awaitStarted returns the fake process's report, and fails the test if
// the execution returned before the process reported.
func awaitStarted(t *testing.T, started <-chan string, result <-chan error) string {
	t.Helper()
	select {
	case report := <-started:
		return report
	case err := <-result:
		t.Fatalf("Execute returned before the process reported that it started, with the error %v", err)
		return ""
	}
}

// Contract test: a real process, the test binary run as the fake one, that
// exits 0: Execute returns what it wrote to its standard output, and only
// that.
func TestExecuteReturnsTheStandardOutputOfACommandThatSucceeds(t *testing.T) {
	t.Parallel()
	processes := osProcesses{waitDelay: processWaitDelay}

	output, err := processes.Execute(t.Context(), testBinary(t), fakeProcess, "succeed")

	if err != nil {
		t.Fatal(err)
	}
	if got, want := string(output), "what the command printed\n"; got != want {
		t.Errorf("got the output %q, want %q", got, want)
	}
}

// Contract test: a real process, the test binary run as the fake one, that
// exits 3: Execute returns no output and an error that carries the exit
// status and what the process wrote to its standard error.
func TestExecuteReturnsTheExitStatusAndStandardErrorOfACommandThatFails(t *testing.T) {
	t.Parallel()
	processes := osProcesses{waitDelay: processWaitDelay}

	output, err := processes.Execute(t.Context(), testBinary(t), fakeProcess, "fail")

	if err == nil {
		t.Fatalf("Execute returned no error, and the output %q", output)
	}
	if got, want := err.Error(), "exit status 3: fake: no session store"; got != want {
		t.Errorf("got the error %q, want %q", got, want)
	}
	var exit *exec.ExitError
	if !errors.As(err, &exit) || exit.ExitCode() != 3 {
		t.Errorf("got the error %#v, want one that wraps an exit with the status 3", err)
	}
	if output != nil {
		t.Errorf("got the output %q, want none", output)
	}
}

// Contract test: a command the operating system cannot start: Execute
// returns its error.
func TestExecuteReturnsTheErrorOfACommandThatCannotStart(t *testing.T) {
	t.Parallel()
	processes := osProcesses{waitDelay: processWaitDelay}
	missing := filepath.Join(t.TempDir(), "no-such-command")

	output, err := processes.Execute(t.Context(), missing)

	if !errors.Is(err, os.ErrNotExist) {
		t.Errorf("got the error %v, want one that wraps %v", err, os.ErrNotExist)
	}
	if output != nil {
		t.Errorf("got the output %q, want none", output)
	}
}

// Contract test: a real process, the test binary run as the fake one, that
// would hang for minutes: once its context ends it is killed, and Execute
// returns an error that wraps the context's cause.
func TestExecuteKillsAProcessWhoseContextEnds(t *testing.T) {
	t.Parallel()
	processes := osProcesses{waitDelay: processWaitDelay}
	fifo, started := startedReport(t)
	stopped := errors.New("the read timed out")
	ctx, cancel := context.WithCancelCause(t.Context())
	defer cancel(nil)
	result := startExecute(ctx, t, processes, "hang", fifo)
	awaitStarted(t, started, result)

	cancel(stopped)

	// Execute returns only once the process has ended.
	if err := <-result; !errors.Is(err, stopped) {
		t.Errorf("got the error %v, want one that wraps %v", err, stopped)
	}
}

// Contract test: a real process, the test binary run as the fake one, with
// a child that holds its standard output and hangs for minutes: once the
// context ends Execute returns, after its wait delay, while the child still
// holds the pipe.
func TestExecuteReturnsWhileAChildOfTheKilledProcessHoldsItsOutput(t *testing.T) {
	t.Parallel()
	// Short: the test waits it out, and nothing rests on its length.
	processes := osProcesses{waitDelay: 10 * time.Millisecond}
	fifo, started := startedReport(t)
	ctx, cancel := context.WithCancel(t.Context())
	defer cancel()
	result := startExecute(ctx, t, processes, "hang-with-child", fifo)
	child, err := strconv.Atoi(strings.TrimSpace(awaitStarted(t, started, result)))
	if err != nil || child <= 1 {
		t.Fatalf("the process reported no child process ID: %v", err)
	}
	t.Cleanup(func() { _ = syscall.Kill(child, syscall.SIGKILL) })

	cancel()

	if err := <-result; !errors.Is(err, context.Canceled) {
		t.Errorf("got the error %v, want one that wraps %v", err, context.Canceled)
	}
	if err := syscall.Kill(child, 0); err != nil {
		t.Errorf("the child no longer runs, so it did not hold the output: %v", err)
	}
}
