package supervisor_test

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"syscall"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/supervisor"
	"github.com/igor1309/ai-labs/gokit/clocktest"
)

// goneBound is how long a killed group's processes may take to be reaped
// by the system, which gives no event of it.
const goneBound = 30 * time.Second

// newSupervisor is a supervisor whose grace runs on the clock it gives.
func newSupervisor(t *testing.T) (*supervisor.Supervisor, *clocktest.Clock) {
	t.Helper()
	clock := clocktest.NewClock(time.Time{})
	s, err := supervisor.New(clock.Timer)
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
// grace timer never fires.
//
// Contract test: the operating system, signalling a real process group.
func TestAnEndedContextEndsTheProgramAndAllItStarted(t *testing.T) {
	t.Parallel()
	s, clock := newSupervisor(t)
	dir := t.TempDir()
	started := fifo(t, dir, "started")
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	child := `trap 'echo SIGTERM > child; exit 0' TERM; sleep 60 & echo $$ > started; wait`
	done := runInBackground(ctx, s, sh(
		`trap 'wait "$child"; trap - TERM; kill -TERM $$' TERM; sh -c "$CHILD" & child=$!; wait`,
		dir, "CHILD="+child))
	group, err := syscall.Getpgid(pidFrom(t, started))
	if err != nil {
		t.Fatal(err)
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
	if waits := clock.Waits(); !slices.Equal(waits, []time.Duration{supervisor.Grace}) || clock.Pending() != 0 {
		t.Errorf("timers started %v, %d pending, want the grace of %s alone, stopped", waits, clock.Pending(), supervisor.Grace)
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

// A supervisor is built with its timer.
func TestASupervisorNeedsATimer(t *testing.T) {
	t.Parallel()
	if _, err := supervisor.New(nil); err == nil {
		t.Error("a supervisor built with no timer, want an error")
	}
}
