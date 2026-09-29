package supervisor_test

import (
	"os/exec"
	"syscall"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/supervisor"
	"github.com/igor1309/ai-labs/agister/internal/app"
)

// sleeper starts a process leading its own group and returns a channel
// closed when it has been reaped by its parent.
func sleeper(t *testing.T) (pid int, gone <-chan struct{}) {
	t.Helper()
	command := exec.Command("sleep", "60")
	command.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	if err := command.Start(); err != nil {
		t.Fatal(err)
	}
	done := make(chan struct{})
	go func() { _ = command.Wait(); close(done) }()
	t.Cleanup(func() { _ = syscall.Kill(-command.Process.Pid, syscall.SIGKILL); <-done })
	return command.Process.Pid, done
}

func TestReapKillsTheGroupOfTheRecordedProcess(t *testing.T) {
	pid, gone := sleeper(t)
	token, err := supervisor.Token(pid)
	if err != nil || token == "" {
		t.Fatalf("token = %q, %v", token, err)
	}
	reaping, err := supervisor.Processes{}.Reap(pid, token)
	if err != nil || reaping != app.ReapKilled {
		t.Fatalf("reap = %s, %v", reaping, err)
	}
	select {
	case <-gone:
	case <-time.After(5 * time.Second):
		t.Fatal("the group survived")
	}
	// Nothing left: the group is simply gone.
	if reaping, err := (supervisor.Processes{}).Reap(pid, token); err != nil || reaping != app.ReapGone {
		t.Fatalf("reap of a dead group = %s, %v", reaping, err)
	}
}

// The ID may belong to another process by now: a different or unknown
// token is never enough to kill.
func TestReapLeavesAProcessItCannotIdentify(t *testing.T) {
	pid, gone := sleeper(t)
	for name, token := range map[string]string{"another token": "Thu Jan  1 00:00:00 1970", "no token": ""} {
		reaping, err := supervisor.Processes{}.Reap(pid, token)
		if err == nil || reaping != app.ReapLeft {
			t.Fatalf("%s: reap = %s, %v", name, reaping, err)
		}
	}
	select {
	case <-gone:
		t.Fatal("a process that could not be identified was killed")
	case <-time.After(300 * time.Millisecond):
	}
}
