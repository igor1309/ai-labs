package supervisor_test

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/supervisor"
)

// The test binary doubles as the runtime's descendants: with helperEnv set
// it plays the role named there instead of running tests.
const helperEnv = "AGISTER_SUPERVISOR_HELPER"

func TestMain(m *testing.M) {
	switch os.Getenv(helperEnv) {
	case "":
		os.Exit(m.Run())
	case "escape":
		// Start a sleeper in its own session, holding stdout, then exit.
		child := exec.Command(os.Args[0])
		child.Env = append(os.Environ(), helperEnv+"=sleep")
		child.Stdout = os.Stdout
		child.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
		if err := child.Start(); err != nil {
			os.Exit(2)
		}
		_ = os.WriteFile(os.Getenv("PID_FILE"), []byte(strconv.Itoa(child.Process.Pid)), 0o600)
		os.Stdout.WriteString("started\n")
		os.Exit(0)
	case "sleep":
		// Never ends on its own: only the test's kill (t.Cleanup) ends it.
		for {
			time.Sleep(time.Hour)
		}
	}
}

type runResult struct {
	evidence supervisor.Evidence
	lines    []string
}

type events struct {
	mu      sync.Mutex
	kinds   []string
	started []string // references, in the order reported
	// failAt, when positive, makes the report with that number (1-based)
	// fail.
	failAt   int
	startErr error
	// onStart, when set, runs with each reference reported (under the lock,
	// so it must not call back into the sink).
	onStart func(ref string)
}

func (e *events) Event(_, kind string, _ map[string]any) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.kinds = append(e.kinds, kind)
}

func (e *events) ProcessStarted(ref string) error {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.started = append(e.started, ref)
	if e.onStart != nil {
		e.onStart(ref)
	}
	if e.failAt > 0 && len(e.started) == e.failAt {
		return e.startErr
	}
	return nil
}

func (e *events) Raw(string) {}

func (e *events) has(kind string) bool {
	e.mu.Lock()
	defer e.mu.Unlock()
	for _, k := range e.kinds {
		if k == kind {
			return true
		}
	}
	return false
}

func pidFrom(t *testing.T, path string) int {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	pid, err := strconv.Atoi(strings.TrimSpace(string(data)))
	if err != nil {
		t.Fatal(err)
	}
	return pid
}

func alive(pid int) bool { return syscall.Kill(pid, 0) == nil }

// A process the runtime leaves running in its group ends with the call.
func TestLeftoverProcessesAreKilledWhenTheRuntimeExits(t *testing.T) {
	pidFile := filepath.Join(t.TempDir(), "pid")
	sink := &events{}
	// Killed on every path, including a failed Run: the PID file is read
	// lazily and a missing one is ignored.
	t.Cleanup(func() {
		if data, err := os.ReadFile(pidFile); err == nil {
			if pid, err := strconv.Atoi(strings.TrimSpace(string(data))); err == nil && pid > 1 {
				_ = syscall.Kill(pid, syscall.SIGKILL)
			}
		}
	})
	evidence := supervisor.Run(context.Background(), supervisor.Spec{
		Command: "/bin/sh",
		Args:    []string{"-c", blocks + ` >/dev/null 2>&1 & echo $! > "$0"; echo done`, pidFile},
		Timeout: 30 * time.Second,
	}, sink, func(string) {})
	if evidence.Exit == nil || evidence.Exit.Code == nil || *evidence.Exit.Code != 0 {
		t.Fatalf("evidence = %+v", evidence)
	}
	pid := pidFrom(t, pidFile)
	deadline := time.Now().Add(10 * time.Second)
	for alive(pid) && time.Now().Before(deadline) {
		time.Sleep(10 * time.Millisecond)
	}
	// A killed child stays a zombie until init reaps it; signal 0 still
	// succeeds on a zombie, so ask ps for its state.
	if out, _ := exec.Command("ps", "-o", "stat=", "-p", strconv.Itoa(pid)).Output(); len(strings.TrimSpace(string(out))) > 0 && !strings.HasPrefix(strings.TrimSpace(string(out)), "Z") {
		t.Fatalf("leftover %d still running (%s)", pid, strings.TrimSpace(string(out)))
	}
	if !sink.has("LEFTOVER_PROCESSES_KILLED") {
		t.Fatalf("events = %v", sink.kinds)
	}
}

// A descendant that leaves the group but keeps stdout open cannot hold the
// call past the grace period.
func TestStdoutHeldOutsideTheGroupDoesNotHoldTheCall(t *testing.T) {
	pidFile := filepath.Join(t.TempDir(), "pid")
	t.Setenv(helperEnv, "escape")
	t.Setenv("PID_FILE", pidFile)
	sink := &events{}
	// Killed on every path, including a failed or hung Run: the PID file is
	// read lazily and a missing one is ignored.
	t.Cleanup(func() {
		if data, err := os.ReadFile(pidFile); err == nil {
			if pid, err := strconv.Atoi(strings.TrimSpace(string(data))); err == nil && pid > 1 {
				_ = syscall.Kill(pid, syscall.SIGKILL)
			}
		}
	})
	// The escaped child never exits on its own, so Run returning, with
	// STDOUT_HELD_OPEN, proves the grace ended the wait; without the grace
	// only Run's minute timeout would end it. The bound below is only a
	// guard against a hang.
	done := make(chan runResult, 1)
	go func() {
		var lines []string
		evidence := supervisor.Run(context.Background(), supervisor.Spec{
			Command:   os.Args[0],
			Timeout:   time.Minute,
			KillGrace: 200 * time.Millisecond,
		}, sink, func(line string) { lines = append(lines, line) })
		done <- runResult{evidence, lines}
	}()
	var got runResult
	select {
	case got = <-done:
	case <-time.After(30 * time.Second):
		t.Fatal("Run did not return: stdout held outside the group held the call")
	}
	evidence, lines := got.evidence, got.lines
	if evidence.Exit == nil || evidence.Exit.Code == nil || *evidence.Exit.Code != 0 || strings.Join(lines, ",") != "started" {
		t.Fatalf("evidence = %+v, lines %v", evidence, lines)
	}
	if !sink.has("STDOUT_HELD_OPEN") {
		t.Fatalf("events = %v", sink.kinds)
	}
}

// The group is reported the moment it exists, before the slower lookup of
// its token, so a kill in between still leaves the group on record.
func TestGroupIsReportedBeforeItsTokenIsKnown(t *testing.T) {
	// The child outlives the test's need of it; the run ends when the sink
	// sees the token-bearing report, so no delay orders anything.
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	sink := &events{onStart: func(ref string) {
		if _, token, err := supervisor.ParseRef(ref); err == nil && token != "" {
			cancel()
		}
	}}
	t.Cleanup(func() {
		sink.mu.Lock()
		defer sink.mu.Unlock()
		if len(sink.started) > 0 {
			if group, _, err := supervisor.ParseRef(sink.started[0]); err == nil && group > 1 {
				_ = syscall.Kill(-group, syscall.SIGKILL)
			}
		}
	})
	supervisor.Run(ctx, supervisor.Spec{
		Command: "/bin/sh",
		Args:    []string{"-c", blocks},
		Timeout: 30 * time.Second,
	}, sink, func(string) {})
	sink.mu.Lock()
	defer sink.mu.Unlock()
	if len(sink.started) < 2 {
		t.Fatalf("reports = %+v", sink.started)
	}
	firstGroup, firstToken, err := supervisor.ParseRef(sink.started[0])
	if err != nil {
		t.Fatal(err)
	}
	lastGroup, lastToken, err := supervisor.ParseRef(sink.started[len(sink.started)-1])
	if err != nil {
		t.Fatal(err)
	}
	if firstGroup <= 1 || firstToken != "" || lastGroup != firstGroup || lastToken == "" {
		t.Fatalf("reports = %+v", sink.started)
	}
}

// A group that cannot be recorded is killed at once, and the evidence says
// why, whichever of the two reports failed: no started group is ever left
// that no record leads back to.
func TestGroupThatCannotBeRecordedIsKilled(t *testing.T) {
	for name, failAt := range map[string]int{"the group report": 1, "the token report": 2} {
		t.Run(name, func(t *testing.T) {
			sink := &events{failAt: failAt, startErr: errors.New("disk full")}
			evidence := supervisor.Run(context.Background(), supervisor.Spec{
				Command: "/bin/sh",
				Args:    []string{"-c", blocks},
				// Only a failure of the kill would ever reach it, and the
				// evidence would then say it timed out.
				Timeout: 30 * time.Second,
			}, sink, func(string) {})

			if evidence.RecordError != "disk full" || evidence.TimedOut {
				t.Fatalf("evidence = %+v", evidence)
			}
			if evidence.Exit == nil || evidence.Exit.Signal != "killed" {
				t.Fatalf("the process was not killed: %+v", evidence.Exit)
			}
			if !sink.has("PROCESS_RECORD_FAILED") {
				t.Fatalf("events = %v", sink.kinds)
			}
			sink.mu.Lock()
			ref := sink.started[0]
			sink.mu.Unlock()
			group, _, err := supervisor.ParseRef(ref)
			if err != nil {
				t.Fatal(err)
			}
			t.Cleanup(func() { _ = syscall.Kill(-group, syscall.SIGKILL) })
			// Run waited for the leader, so it is gone, not a zombie.
			if out, _ := exec.Command("ps", "-o", "stat=", "-p", strconv.Itoa(group)).Output(); strings.TrimSpace(string(out)) != "" {
				t.Fatalf("the group's leader %d is still there (%s)", group, strings.TrimSpace(string(out)))
			}
			if syscall.Kill(-group, 0) == nil {
				t.Fatalf("group %d still has members", group)
			}

			if evidence.RecordError != "disk full" {
				t.Fatalf("evidence = %+v", evidence)
			}
		})
	}
}

// A runtime's stderr is kept to its last 4096 bytes, cut on a whole rune;
// the tail's first line and the count say how much was cut, and the reason
// after the flood is still quoted.
func TestStderrBeyondTheBoundIsCutAndMarked(t *testing.T) {
	// 5000 two-byte runes, then the reason: its odd length puts the cut
	// inside a rune.
	evidence := supervisor.Run(context.Background(), supervisor.Spec{
		Command: "/bin/sh",
		Args:    []string{"-c", `printf 'é%.0s' $(seq 5000) >&2; printf '\nError: too large!\n' >&2; exit 1`},
		Timeout: 30 * time.Second,
	}, &events{}, func(string) {})
	marker, kept, _ := strings.Cut(evidence.StderrTail, "\n")
	written := int64(5000*2 + len("\nError: too large!\n"))
	if evidence.StderrOmitted != written-int64(len(kept))-1 || marker != "["+strconv.FormatInt(evidence.StderrOmitted, 10)+" earlier bytes of stderr cut]" {
		t.Fatalf("omitted %d, marker %q, %d bytes kept", evidence.StderrOmitted, marker, len(kept))
	}
	if !strings.HasPrefix(kept, "é") || len(kept) != 4096-1-1 || !strings.HasSuffix(kept, "é\nError: too large!") {
		t.Fatalf("kept %d bytes: %q…", len(kept), kept[:10])
	}
}

// A runtime that prints nothing to stderr leaves no tail and no cut.
func TestASilentExitLeavesNoTail(t *testing.T) {
	evidence := supervisor.Run(context.Background(), supervisor.Spec{
		Command: "/bin/sh",
		Args:    []string{"-c", "exit 2"},
		Timeout: 30 * time.Second,
	}, &events{}, func(string) {})
	if evidence.StderrTail != "" || evidence.StderrOmitted != 0 {
		t.Fatalf("evidence = %+v", evidence)
	}
}

// Spec.Env is added to the inherited environment, and replaces an inherited
// variable of the same name.
func TestEnvIsAddedToTheInheritedEnvironment(t *testing.T) {
	t.Setenv("AGISTER_SUPERVISOR_KEPT", "kept")
	t.Setenv("AGISTER_SUPERVISOR_REPLACED", "inherited")
	var lines []string
	evidence := supervisor.Run(context.Background(), supervisor.Spec{
		Command: "/bin/sh",
		Args:    []string{"-c", `echo "$AGISTER_SUPERVISOR_KEPT $AGISTER_SUPERVISOR_REPLACED $AGISTER_SUPERVISOR_ADDED"`},
		Env:     []string{"AGISTER_SUPERVISOR_REPLACED=replaced", "AGISTER_SUPERVISOR_ADDED=added"},
		Timeout: 30 * time.Second,
	}, &events{}, func(line string) { lines = append(lines, line) })
	if evidence.Exit == nil || evidence.Exit.Code == nil || *evidence.Exit.Code != 0 || len(lines) != 1 || lines[0] != "kept replaced added" {
		t.Fatalf("evidence = %+v, lines %q", evidence, lines)
	}
}
