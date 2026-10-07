package supervisor_test

import (
	"bufio"
	"errors"
	"io"
	"runtime"
	"syscall"
	"testing"

	"github.com/igor1309/ai-labs/gokit/supervisor"
)

// started starts script under bash on Exec and ends its group with the
// test, whatever the test did.
func started(t *testing.T, script string) supervisor.Process {
	t.Helper()
	process, err := supervisor.Exec{}.Start(supervisor.Command{Name: "bash", Args: []string{"-c", script}, Dir: t.TempDir()})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { process.Stdout().Close() })
	cleanUpGroup(t, supervisor.Ref(process.Group(), ""))
	return process
}

// The exit is observed without reaping the leader: its group is still
// there, holding the exited leader alone, until Wait reaps it. What the
// kernel answers a kill of that group is the platform's, and pinned here:
// Linux signals the zombie leader (success), macOS finds no process it may
// signal (EPERM). Neither is leftovers, so Exec's Signal does not count
// the leader and answers ESRCH.
//
// Contract test: Exec against a real process: its group, the exit
// observed without reaping it, and the kernel's answer to a kill.
func TestExecObservesTheExitWithoutReapingTheLeader(t *testing.T) {
	t.Parallel()
	var zombieAlone error
	switch runtime.GOOS {
	case "linux":
		zombieAlone = nil
	case "darwin":
		zombieAlone = syscall.EPERM
	default:
		t.Skipf("no answer is pinned for %s", runtime.GOOS)
	}
	process := started(t, "exit 3")
	group := process.Group()
	if err := process.Exited(); err != nil {
		t.Fatal(err)
	}
	if err := syscall.Kill(-group, 0); err != zombieAlone {
		t.Fatalf("a kill of the group of an exited leader alone: %v, want %v", err, zombieAlone)
	}
	if err := process.Signal(syscall.SIGKILL); !errors.Is(err, syscall.ESRCH) {
		t.Fatalf("Signal to the group of an exited leader alone: %v, want ESRCH", err)
	}
	exit := process.Wait()
	if exit.Code == nil || *exit.Code != 3 || exit.Signal != "" {
		t.Fatalf("exit %+v, want code 3", exit)
	}
	if err := syscall.Kill(-group, 0); !errors.Is(err, syscall.ESRCH) {
		t.Fatalf("a kill of the group once the leader is reaped: %v, want ESRCH", err)
	}
}

// Once the leader has exited, a kill of its group reaches the descendant
// it left there, and finds nothing in a group it left empty.
//
// Contract test: Exec against a real process: its group, the exit
// observed without reaping it, and the kernel's answer to a kill.
func TestExecKillsWhatTheExitedLeaderLeftInItsGroup(t *testing.T) {
	t.Parallel()
	for _, c := range []struct {
		name   string
		script string
		want   error
	}{
		// The descendant holds stdout open, so stdout ends once it is
		// killed.
		{"a descendant", blocks + " & echo started", nil},
		{"none", "echo started", syscall.ESRCH},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			process := started(t, c.script)
			stdout := bufio.NewReader(process.Stdout())
			if line, err := stdout.ReadString('\n'); err != nil || line != "started\n" {
				t.Fatalf("read %q, %v", line, err)
			}
			if err := process.Exited(); err != nil {
				t.Fatal(err)
			}
			if err := process.Signal(syscall.SIGKILL); err != c.want {
				t.Fatalf("Signal after the exit: %v, want %v", err, c.want)
			}
			// Ends only once nothing holds stdout: the descendant was
			// killed. A kill that missed it is a hang the binary's
			// -timeout names.
			if rest, err := io.ReadAll(stdout); err != nil || len(rest) != 0 {
				t.Fatalf("read %q, %v", rest, err)
			}
			if exit := process.Wait(); exit.Code == nil || *exit.Code != 0 {
				t.Fatalf("exit %+v, want code 0", exit)
			}
		})
	}
}
