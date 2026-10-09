//go:build unix

package main

import (
	"context"
	"errors"
	"fmt"
	"io"
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

// TestMain runs the tests, or, started as `<test binary> fake-process
// <scenario> ...`, the fake process of the executor's contract tests, or,
// started as `<test binary> warder-process <scenario> ...`, warder as the
// process of the process boundary's contract tests: the test binary is
// their one build.
func TestMain(m *testing.M) {
	if len(os.Args) > 1 {
		switch os.Args[1] {
		case fakeProcess:
			os.Exit(runFakeProcess(os.Args[2:]))
		case warderProcess:
			os.Exit(runWarderProcess(os.Args[2:]))
		}
	}
	os.Exit(m.Run())
}

// runFakeProcess is the fake process: the scenario args names, and its
// exit code.
//
//   - succeed: writes to both its outputs and exits 0;
//   - fail: writes to both its outputs and exits 3;
//   - hang <fifo> <held>: reports its process ID on the FIFO, and hangs;
//   - hang-with-child <fifo> <held>: starts a child that holds its
//     standard output and hangs, reports its own process ID and the
//     child's on the FIFO, and hangs;
//   - hold: the child, which hangs on the held FIFO it inherits as file
//     descriptor 3.
//
// One that hangs reads the held FIFO, which the test holds open, until it
// is closed: it lives on no clock of its own, and is killed or ends with
// the test that holds the FIFO, whichever way that test ends.
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
		held, err := os.Open(args[2])
		if err != nil {
			return 1
		}
		if err := reportStarted(args[1], strconv.Itoa(os.Getpid())); err != nil {
			return 1
		}
		_, _ = io.Copy(io.Discard, held)
		return 0
	case "hang-with-child":
		held, err := os.Open(args[2])
		if err != nil {
			return 1
		}
		child := exec.Command(os.Args[0], fakeProcess, "hold")
		child.Stdout = os.Stdout
		child.ExtraFiles = []*os.File{held}
		if err := child.Start(); err != nil {
			return 1
		}
		if err := reportStarted(args[1], fmt.Sprintf("%d %d", os.Getpid(), child.Process.Pid)); err != nil {
			return 1
		}
		_, _ = io.Copy(io.Discard, held)
		return 0
	case "hold":
		_, _ = io.Copy(io.Discard, os.NewFile(3, "held"))
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

// heldFIFO makes a FIFO for a fake process to hang on, and holds it open
// to write until the test ends: the process reads it until then, so it
// ends with the test however the test ends.
func heldFIFO(t *testing.T) string {
	t.Helper()
	fifo := filepath.Join(t.TempDir(), "held")
	if err := syscall.Mkfifo(fifo, 0o600); err != nil {
		t.Fatal(err)
	}
	held := make(chan *os.File, 1)
	go func() {
		// Blocks until the fake process opens the FIFO to read. A FIFO
		// that cannot be opened leaves nil, and nothing to close.
		writer, _ := os.OpenFile(fifo, os.O_WRONLY, 0)
		held <- writer
	}()
	t.Cleanup(func() {
		// After a test that failed before its process opened the FIFO, the
		// opening still waits: opening the FIFO to read ends it.
		if fd, err := syscall.Open(fifo, syscall.O_RDONLY|syscall.O_NONBLOCK, 0); err == nil {
			defer syscall.Close(fd)
		}
		if writer := <-held; writer != nil {
			writer.Close()
		}
	})
	return fifo
}

// processIDs reads the process IDs a fake process reported, and kills
// each of them when the test ends, whatever the executor did.
func processIDs(t *testing.T, report string) []int {
	t.Helper()
	var pids []int
	for _, field := range strings.Fields(report) {
		pid, err := strconv.Atoi(field)
		if err != nil || pid <= 1 {
			t.Fatalf("the process reported %q, not process IDs", report)
		}
		pids = append(pids, pid)
		t.Cleanup(func() { _ = syscall.Kill(pid, syscall.SIGKILL) })
	}
	return pids
}

// assertGone fails unless no process has the ID pid any more: Execute
// returns after the process it ran was waited for, and so reaped.
func assertGone(t *testing.T, pid int) {
	t.Helper()
	if err := syscall.Kill(pid, 0); !errors.Is(err, syscall.ESRCH) {
		t.Errorf("the process %d is not gone: signalling it gave %v, want %v", pid, err, syscall.ESRCH)
	}
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
// hangs until the test ends: once its context ends it is killed and gone,
// and Execute returns an error that wraps the context's cause.
func TestExecuteKillsAProcessWhoseContextEnds(t *testing.T) {
	t.Parallel()
	processes := osProcesses{waitDelay: processWaitDelay}
	fifo, started := startedReport(t)
	stopped := errors.New("the read timed out")
	ctx, cancel := context.WithCancelCause(t.Context())
	defer cancel(nil)
	result := startExecute(ctx, t, processes, "hang", fifo, heldFIFO(t))
	pids := processIDs(t, awaitStarted(t, started, result))
	if len(pids) != 1 {
		t.Fatalf("the process reported %d process IDs, want its own", len(pids))
	}

	cancel(stopped)

	if err := <-result; !errors.Is(err, stopped) {
		t.Errorf("got the error %v, want one that wraps %v", err, stopped)
	}
	assertGone(t, pids[0])
}

// Contract test: a real process, the test binary run as the fake one, with
// a child that holds its standard output, both hanging until the test
// ends: once the context ends the process is killed and gone, and Execute
// returns, after its wait delay, while the child still holds the pipe.
func TestExecuteReturnsWhileAChildOfTheKilledProcessHoldsItsOutput(t *testing.T) {
	t.Parallel()
	// Short: the test waits it out, and nothing rests on its length.
	processes := osProcesses{waitDelay: 10 * time.Millisecond}
	fifo, started := startedReport(t)
	ctx, cancel := context.WithCancel(t.Context())
	defer cancel()
	result := startExecute(ctx, t, processes, "hang-with-child", fifo, heldFIFO(t))
	pids := processIDs(t, awaitStarted(t, started, result))
	if len(pids) != 2 {
		t.Fatalf("the process reported %d process IDs, want its own and its child's", len(pids))
	}
	killed, child := pids[0], pids[1]

	cancel()

	if err := <-result; !errors.Is(err, context.Canceled) {
		t.Errorf("got the error %v, want one that wraps %v", err, context.Canceled)
	}
	assertGone(t, killed)
	if err := syscall.Kill(child, 0); err != nil {
		t.Errorf("the child no longer runs, so it did not hold the output: %v", err)
	}
}
