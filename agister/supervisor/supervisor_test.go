package supervisor_test

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"syscall"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/supervisor"
	"github.com/igor1309/ai-labs/gokit/clocktest"
	group "github.com/igor1309/ai-labs/gokit/supervisor"
)

// helperEnv set makes the test binary the program its value names, in
// place of its tests.
const helperEnv = "AGISTER_SUPERVISOR_HELPER"

func TestMain(m *testing.M) {
	switch os.Getenv(helperEnv) {
	case "":
		os.Exit(m.Run())
	case "escape":
		// Starts the binary as a sleeper in a session of its own, holding
		// stdout and stderr; writes its ID to PID_FILE and "started" to
		// stdout; then exits 0.
		child := exec.Command(os.Args[0])
		child.Env = append(os.Environ(), helperEnv+"=sleep")
		child.Stdout, child.Stderr = os.Stdout, os.Stderr
		child.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
		if err := child.Start(); err != nil {
			os.Exit(2)
		}
		if err := os.WriteFile(os.Getenv("PID_FILE"), []byte(strconv.Itoa(child.Process.Pid)), 0o600); err != nil {
			os.Exit(2)
		}
		os.Stdout.WriteString("started\n")
		os.Stderr.WriteString("diagnostics\n")
		os.Exit(0)
	case "sleep":
		// Never ends by itself: its test kills it.
		for {
			time.Sleep(time.Hour)
		}
	}
}

// goneBound is how long a killed group's processes may take to be reaped
// by the system, which gives no event of it.
const goneBound = 30 * time.Second

// osPrograms starts real programs (ADR-009, rule 3) in the operating
// system's process groups, through gokit, in the supervisor's words.
type osPrograms struct{}

func (osPrograms) CheckExitObservation() error { return group.Exec{}.CheckExitObservation() }

func (osPrograms) Start(program supervisor.Program, stderr *os.File) (supervisor.Process, error) {
	process, err := group.Exec{}.Start(group.Command{Name: program.Name, Args: program.Args, Dir: program.Dir, Env: program.Env, Stderr: stderr})
	if err != nil {
		return nil, err
	}
	return osProcess{process: process}, nil
}

// osProcess is a program osPrograms started; its group's ID is for a test
// to see that the group has ended.
type osProcess struct{ process group.Process }

func (p osProcess) Stdout() io.ReadCloser              { return p.process.Stdout() }
func (p osProcess) Signal(signal syscall.Signal) error { return p.process.Signal(signal) }
func (p osProcess) Exited() error                      { return p.process.Exited() }
func (p osProcess) Group() int                         { return p.process.Group() }

func (p osProcess) Wait() supervisor.Exit {
	exit := p.process.Wait()
	ended := supervisor.Exit{Signal: exit.Signal}
	if exit.Code != nil {
		ended.Code = *exit.Code
	}
	return ended
}

// newSupervisor is a supervisor whose grace runs on the clock it gives.
func newSupervisor(t *testing.T) (*supervisor.Supervisor, *clocktest.Clock) {
	t.Helper()
	clock := clocktest.NewClock(time.Time{})
	s, err := supervisor.New(clock.Timer, osPrograms{}, func(string, int64) {})
	if err != nil {
		t.Fatal(err)
	}
	return s, clock
}

// sh is the program "sh -c script" in dir, with env.
func sh(script, dir string, env ...string) supervisor.Program {
	return supervisor.Program{Name: "sh", Args: []string{"-c", script}, Dir: dir, Env: env}
}

// ran is what a run in the background gave.
type ran struct {
	result supervisor.Result
	err    error
}

// runInBackground runs program on s until ctx ends, and gives what it gave
// once it has returned.
func runInBackground(ctx context.Context, s *supervisor.Supervisor, program supervisor.Program) <-chan ran {
	done := make(chan ran, 1)
	go func() {
		result, err := s.Run(ctx, program)
		done <- ran{result, err}
	}()
	return done
}

// fifo makes a named pipe in dir and gives its path.
func fifo(t *testing.T, dir, name string) string {
	t.Helper()
	path := filepath.Join(dir, name)
	if err := syscall.Mkfifo(path, 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

// pidFrom reads the named pipe at path once a program writes to it, and
// gives the process ID it wrote.
func pidFrom(t *testing.T, path string) int {
	t.Helper()
	written, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	pid, err := strconv.Atoi(strings.TrimSpace(string(written)))
	if err != nil {
		t.Fatal(err)
	}
	return pid
}

// gone fails t unless the process group has no process left within
// goneBound: a killed process is reaped by the system, which gives no
// event of it.
func gone(t *testing.T, group int) {
	t.Helper()
	deadline := time.Now().Add(goneBound)
	for {
		err := syscall.Kill(-group, 0)
		if errors.Is(err, syscall.ESRCH) {
			return
		}
		if time.Now().After(deadline) {
			t.Errorf("group %d still had a process after %s: %v", group, goneBound, err)
			_ = syscall.Kill(-group, syscall.SIGKILL)
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
}

// supervisor.feature, "A program runs in its directory with its
// environment".
//
// Contract test: the operating system, starting a real program.
func TestAProgramRunsInItsDirectoryWithItsEnvironment(t *testing.T) {
	t.Parallel()
	s, _ := newSupervisor(t)
	d := t.TempDir()
	resolved, err := filepath.EvalSymlinks(d)
	if err != nil {
		t.Fatal(err)
	}
	result, err := s.Run(context.Background(), sh(`pwd; echo "$X"`, d, "X=1"))
	if err != nil {
		t.Fatal(err)
	}
	if want := resolved + "\n1\n"; result.Stdout.Head != want {
		t.Errorf("stdout %q, want %q", result.Stdout.Head, want)
	}
	if result.Code != 0 || result.Signal != "" {
		t.Errorf("ended with code %d, signal %q, want code 0", result.Code, result.Signal)
	}
}

// supervisor.feature, "The exit code is kept".
//
// Contract test: the operating system, starting a real program.
func TestTheExitCodeIsKept(t *testing.T) {
	t.Parallel()
	s, _ := newSupervisor(t)
	result, err := s.Run(context.Background(), sh("exit 3", t.TempDir()))
	if err != nil {
		t.Fatal(err)
	}
	if result.Code != 3 || result.Signal != "" {
		t.Errorf("ended with code %d, signal %q, want code 3", result.Code, result.Signal)
	}
}

// supervisor.feature, "Each stream keeps its first and last 16 KiB, size
// and digest". Stdout is numbered lines, so its head, its tail and the
// parts between differ.
//
// Contract test: the operating system, starting a real program.
func TestEachStreamKeepsItsFirstAndLast16KiBSizeAndDigest(t *testing.T) {
	t.Parallel()
	s, _ := newSupervisor(t)
	dir := t.TempDir()
	var printed []byte
	for i := range 100 << 10 / 8 {
		printed = fmt.Appendf(printed, "%07d\n", i)
	}
	if err := os.WriteFile(filepath.Join(dir, "out"), printed, 0o600); err != nil {
		t.Fatal(err)
	}
	result, err := s.Run(context.Background(), sh("cat out; printf e >&2", dir))
	if err != nil {
		t.Fatal(err)
	}
	digest := func(b []byte) string { sum := sha256.Sum256(b); return hex.EncodeToString(sum[:]) }
	wantOut := supervisor.Stream{
		Head: string(printed[:16<<10]), Tail: string(printed[len(printed)-16<<10:]),
		Size: 102400, Digest: digest(printed),
	}
	if result.Stdout != wantOut {
		t.Errorf("stdout: head %d bytes, tail %d bytes, size %d, digest %s; want the first and last 16 KiB, size %d, digest %s",
			len(result.Stdout.Head), len(result.Stdout.Tail), result.Stdout.Size, result.Stdout.Digest, wantOut.Size, wantOut.Digest)
	}
	if want := (supervisor.Stream{Head: "e", Tail: "e", Size: 1, Digest: digest([]byte("e"))}); result.Stderr != want {
		t.Errorf("stderr %+v, want %+v", result.Stderr, want)
	}
}

// supervisor.feature, "A program that cannot start is an error that says
// so".
//
// Contract test: the operating system, looking a program up on PATH.
func TestAProgramThatCannotStartIsAnErrorThatSaysSo(t *testing.T) {
	t.Parallel()
	s, _ := newSupervisor(t)
	_, err := s.Run(context.Background(), supervisor.Program{Name: "no-such-program-xyz", Dir: t.TempDir()})
	if !errors.Is(err, supervisor.ErrNotStarted) || !strings.Contains(err.Error(), "no-such-program-xyz") {
		t.Errorf("error %v, want %v naming no-such-program-xyz", err, supervisor.ErrNotStarted)
	}
}

// supervisor.feature, "An ended context ends the program and all it
// started". The child writes the signal it traps to the file "child", and
// the program, trapping SIGTERM, waits for the child to end before it
// ends itself by the signal: so each shows it was sent SIGTERM, and the
// grace timer never fires. Each says it is ready, the program once it
// holds the child's ID, before the context ends.
//
// Contract test: the operating system, signalling a real process group.
func TestAnEndedContextEndsTheProgramAndAllItStarted(t *testing.T) {
	t.Parallel()
	s, clock := newSupervisor(t)
	dir := t.TempDir()
	started, ready := fifo(t, dir, "started"), fifo(t, dir, "ready")
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	child := `trap 'echo SIGTERM > child; exit 0' TERM; sleep 60 & echo $$ > started; wait`
	done := runInBackground(ctx, s, sh(
		`trap 'wait "$child"; trap - TERM; kill -TERM $$' TERM; sh -c "$CHILD" & child=$!; echo $$ > ready; wait`,
		dir, "CHILD="+child))
	group, err := syscall.Getpgid(pidFrom(t, started))
	if err != nil {
		t.Fatal(err)
	}
	if program := pidFrom(t, ready); program != group {
		t.Fatalf("the program %d leads no group of the child's %d", program, group)
	}
	cancel()
	got := <-done
	if got.err != nil {
		t.Fatal(got.err)
	}
	if got.result.Signal != "terminated" {
		t.Errorf("ended with code %d, signal %q, want the signal %q", got.result.Code, got.result.Signal, "terminated")
	}
	if trapped, err := os.ReadFile(filepath.Join(dir, "child")); err != nil || string(trapped) != "SIGTERM\n" {
		t.Errorf("the child trapped %q, %v, want SIGTERM", trapped, err)
	}
	// The second grace is the streams': it is started once the group has
	// ended, whatever holds them.
	if waits := clock.Waits(); !slices.Equal(waits, []time.Duration{supervisor.Grace, supervisor.Grace}) || clock.Pending() != 0 {
		t.Errorf("timers started %v, %d pending, want the grace of %s for the kill, then the streams', each stopped", waits, clock.Pending(), supervisor.Grace)
	}
	gone(t, group)
}

// supervisor.feature, "A program that ignores SIGTERM is killed when the
// grace passes".
//
// Contract test: the operating system, signalling a real process group.
func TestAProgramThatIgnoresSIGTERMIsKilledWhenTheGracePasses(t *testing.T) {
	t.Parallel()
	s, clock := newSupervisor(t)
	dir := t.TempDir()
	trapped := fifo(t, dir, "trapped")
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	done := runInBackground(ctx, s, sh(`trap '' TERM; echo $$ > trapped; sleep 60`, dir))
	group := pidFrom(t, trapped)
	cancel()
	clock.Started(supervisor.Grace)
	clock.Advance(supervisor.Grace)
	got := <-done
	if got.err != nil {
		t.Fatal(got.err)
	}
	if got.result.Signal != "killed" {
		t.Errorf("ended with code %d, signal %q, want the signal %q", got.result.Code, got.result.Signal, "killed")
	}
	gone(t, group)
}

// supervisor.feature, "What a program leaves running is ended when it
// exits". The child holds stdout open: the run returns only once it is
// ended.
//
// Contract test: the operating system, signalling a real process group.
func TestWhatAProgramLeavesRunningIsEndedWhenItExits(t *testing.T) {
	t.Parallel()
	s, _ := newSupervisor(t)
	result, err := s.Run(context.Background(), sh(`sleep 60 & echo $$; exit 0`, t.TempDir()))
	if err != nil {
		t.Fatal(err)
	}
	if result.Code != 0 || result.Signal != "" {
		t.Errorf("ended with code %d, signal %q, want code 0", result.Code, result.Signal)
	}
	group, err := strconv.Atoi(strings.TrimSpace(result.Stdout.Head))
	if err != nil {
		t.Fatal(err)
	}
	gone(t, group)
}

// supervisor.feature, "Output held open by what left the group is not
// waited on". The program is the test binary, which starts itself as a
// sleeper in a session of its own, holding stdout and stderr, and exits:
// the sleeper never ends by itself, so a run that returns was ended by the
// grace. Both streams report captured bytes before the timer advances;
// those bytes, their size and digest must survive the cutoff.
//
// Contract test: the operating system, a process that leaves its group
// holding the pipes.
func TestOutputHeldOpenByWhatLeftTheGroupIsNotWaitedOn(t *testing.T) {
	t.Parallel()
	clock := clocktest.NewClock(time.Time{})
	captured := make(chan string, 2)
	s, err := supervisor.New(clock.Timer, osPrograms{}, func(name string, size int64) {
		want := map[string]int64{"stdout": int64(len("started\n")), "stderr": int64(len("diagnostics\n"))}
		if size == want[name] {
			captured <- name
		}
	})
	if err != nil {
		t.Fatal(err)
	}
	pidFile := filepath.Join(t.TempDir(), "pid")
	t.Cleanup(func() {
		if pid, err := strconv.Atoi(readText(pidFile)); err == nil && pid > 1 {
			_ = syscall.Kill(pid, syscall.SIGKILL)
		}
	})
	done := runInBackground(context.Background(), s, supervisor.Program{
		Name: os.Args[0], Dir: t.TempDir(), Env: []string{helperEnv + "=escape", "PID_FILE=" + pidFile},
	})
	seen := map[string]bool{}
	for len(seen) < 2 {
		seen[<-captured] = true
	}
	// The program exits by itself: the one grace is the streams'.
	clock.Started(supervisor.Grace)
	clock.Advance(supervisor.Grace)
	got := <-done
	if got.err != nil {
		t.Fatal(got.err)
	}
	if got.result.Code != 0 || got.result.Signal != "" {
		t.Errorf("ended with code %d, signal %q, want code 0", got.result.Code, got.result.Signal)
	}
	for name, kept := range map[string]struct {
		stream  supervisor.Stream
		written string
	}{"stdout": {got.result.Stdout, "started\n"}, "stderr": {got.result.Stderr, "diagnostics\n"}} {
		read := kept.written
		sum := sha256.Sum256([]byte(read))
		want := supervisor.Stream{Head: read, Tail: read, Size: int64(len(read)), Digest: hex.EncodeToString(sum[:]), Incomplete: true}
		if kept.stream != want {
			t.Errorf("%s %+v, want what was read of %q, kept, and marked incomplete", name, kept.stream, kept.written)
		}
	}
}

// readText is the text of the file at path, spaces trimmed; "" when it
// cannot be read.
func readText(path string) string {
	written, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(written))
}

// supervisor.feature, "A signal from elsewhere is given by name".
//
// Contract test: the operating system, signalling a real process.
func TestASignalFromElsewhereIsGivenByName(t *testing.T) {
	t.Parallel()
	s, _ := newSupervisor(t)
	result, err := s.Run(context.Background(), sh(`kill -KILL $$`, t.TempDir()))
	if err != nil {
		t.Fatal(err)
	}
	if result.Signal != "killed" {
		t.Errorf("ended with code %d, signal %q, want the signal %q", result.Code, result.Signal, "killed")
	}
}

// A supervisor requires all its collaborators at construction.
func TestASupervisorNeedsItsCollaborators(t *testing.T) {
	t.Parallel()
	clock := clocktest.NewClock(time.Time{})
	progress := func(string, int64) {}
	if _, err := supervisor.New(nil, osPrograms{}, progress); err == nil {
		t.Error("a supervisor built with no timer")
	}
	if _, err := supervisor.New(clock.Timer, nil, progress); err == nil {
		t.Error("a supervisor built with no programs")
	}
	if _, err := supervisor.New(clock.Timer, osPrograms{}, nil); err == nil {
		t.Error("a supervisor built with no read progress")
	}
}

// unsupportedPrograms refuses exit observation; any start is a test failure.
type unsupportedPrograms struct{ t *testing.T }

func (unsupportedPrograms) CheckExitObservation() error { return errors.ErrUnsupported }
func (s unsupportedPrograms) Start(supervisor.Program, *os.File) (supervisor.Process, error) {
	s.t.Error("started a program without exit observation")
	return nil, errors.New("unexpected start")
}

// supervisor.feature, "Where a program's exit cannot be observed, nothing starts".
func TestUnsupportedExitObservationStartsNothing(t *testing.T) {
	t.Parallel()
	clock := clocktest.NewClock(time.Time{})
	s, err := supervisor.New(clock.Timer, unsupportedPrograms{t}, func(string, int64) {})
	if err != nil {
		t.Fatal(err)
	}
	_, err = s.Run(context.Background(), supervisor.Program{Name: "sh", Args: []string{"-c", "exit 0"}})
	if !errors.Is(err, supervisor.ErrNotStarted) || !errors.Is(err, errors.ErrUnsupported) {
		t.Errorf("error %v, want not started and unsupported", err)
	}
}

// observationFailure starts real programs but cannot observe their exits.
type observationFailure struct {
	osPrograms
	err     error
	process supervisor.Process
}

func (s *observationFailure) Start(program supervisor.Program, stderr *os.File) (supervisor.Process, error) {
	p, err := s.osPrograms.Start(program, stderr)
	if err != nil {
		return nil, err
	}
	s.process = p
	return failedObservation{Process: p, err: s.err}, nil
}

type failedObservation struct {
	supervisor.Process
	err error
}

func (p failedObservation) Exited() error { return p.err }

// A failed observation still cleans up the program, and keeps the cause
// instead of presenting the supervisor's kill as an external signal.
//
// Contract test: the operating system, killing and reaping after observation fails.
func TestAnObservationErrorIsKeptAfterCleanup(t *testing.T) {
	t.Parallel()
	clock := clocktest.NewClock(time.Time{})
	cause := errors.New("cannot observe exit")
	programs := &observationFailure{err: cause}
	s, err := supervisor.New(clock.Timer, programs, func(string, int64) {})
	if err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	fifo(t, dir, "blocked")
	_, err = s.Run(context.Background(), sh(`read ignored < blocked`, dir))
	if !errors.Is(err, cause) || errors.Is(err, supervisor.ErrNotStarted) {
		t.Errorf("error %v, want observation failure after start", err)
	}
	if programs.process != nil {
		gone(t, programs.process.(osProcess).Group())
	}
}
