package supervisor_test

import (
	"context"
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
		time.Sleep(time.Minute)
		os.Exit(0)
	}
}

type events struct {
	mu    sync.Mutex
	kinds []string
}

func (e *events) Event(_, kind string, _ map[string]any) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.kinds = append(e.kinds, kind)
}

func (e *events) ProcessStarted(int, string) {}

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
	evidence := supervisor.Run(context.Background(), supervisor.Spec{
		Command: "/bin/sh",
		Args:    []string{"-c", `sleep 60 >/dev/null 2>&1 & echo $! > "$0"; echo done`, pidFile},
		Timeout: time.Hour,
	}, sink, func(string) {})
	if evidence.Exit == nil || evidence.Exit.Code == nil || *evidence.Exit.Code != 0 {
		t.Fatalf("evidence = %+v", evidence)
	}
	pid := pidFrom(t, pidFile)
	t.Cleanup(func() { _ = syscall.Kill(pid, syscall.SIGKILL) })
	deadline := time.Now().Add(2 * time.Second)
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
	var lines []string
	start := time.Now()
	evidence := supervisor.Run(context.Background(), supervisor.Spec{
		Command:   os.Args[0],
		Timeout:   time.Hour,
		KillGrace: 200 * time.Millisecond,
	}, sink, func(line string) { lines = append(lines, line) })
	elapsed := time.Since(start)
	pid := pidFrom(t, pidFile)
	t.Cleanup(func() { _ = syscall.Kill(pid, syscall.SIGKILL) })
	if elapsed > 10*time.Second {
		t.Fatalf("Run took %s", elapsed)
	}
	if evidence.Exit == nil || evidence.Exit.Code == nil || *evidence.Exit.Code != 0 || strings.Join(lines, ",") != "started" {
		t.Fatalf("evidence = %+v, lines %v", evidence, lines)
	}
	if !sink.has("STDOUT_HELD_OPEN") {
		t.Fatalf("events = %v", sink.kinds)
	}
}
