package supervisor_test

import (
	"context"
	"os/exec"
	"strconv"
	"strings"
	"syscall"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/supervisor"
)

// sleeper starts a process leading its own group, one that never ends on
// its own, and returns a channel closed when it has been reaped by its
// parent.
func sleeper(t *testing.T) (pid int, gone <-chan struct{}) {
	t.Helper()
	command := exec.Command("tail", "-f", "/dev/null")
	command.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	if err := command.Start(); err != nil {
		t.Fatal(err)
	}
	done := make(chan struct{})
	go func() { _ = command.Wait(); close(done) }()
	t.Cleanup(func() { _ = syscall.Kill(-command.Process.Pid, syscall.SIGKILL); <-done })
	return command.Process.Pid, done
}

// Contract test: the reaper against a real process group and its token from
// ps.
func TestReapKillsTheGroupOfTheRecordedProcess(t *testing.T) {
	t.Parallel()
	pid, gone := sleeper(t)
	token, err := supervisor.Token(context.Background(), pid)
	if err != nil || token == "" {
		t.Fatalf("token = %q, %v", token, err)
	}
	// The command name is part of it: the same start second is not enough.
	if !strings.Contains(token, "tail") {
		t.Fatalf("token %q does not name the command", token)
	}
	reaping, err := supervisor.Processes{}.Reap(context.Background(), supervisor.Ref(pid, token))
	if err != nil || reaping != supervisor.ReapKilled {
		t.Fatalf("reap = %s, %v", reaping, err)
	}
	// The process never ends on its own, so its end is the kill's; the bound
	// is only a guard against a hang.
	select {
	case <-gone:
	case <-time.After(20 * time.Second):
		t.Fatal("the group survived")
	}
	// Nothing left: the group is simply gone, also for a reference that
	// never learned the token (no process holds the ID, so nothing to spare).
	if reaping, err := (supervisor.Processes{}).Reap(context.Background(), supervisor.Ref(pid, "")); err != nil || reaping != supervisor.ReapGone {
		t.Fatalf("reap of a dead group without a token = %s, %v", reaping, err)
	}
	if reaping, err := (supervisor.Processes{}).Reap(context.Background(), supervisor.Ref(pid, token)); err != nil || reaping != supervisor.ReapGone {
		t.Fatalf("reap of a dead group = %s, %v", reaping, err)
	}
}

// The ID may belong to another process by now: a different or unknown
// token is never enough to kill.
//
// Contract test: the reaper against a real process group and its token from
// ps.
func TestReapLeavesAProcessItCannotIdentify(t *testing.T) {
	t.Parallel()
	pid, _ := sleeper(t)
	for name, token := range map[string]string{"another token": "Thu Jan  1 00:00:00 1970", "no token": ""} {
		reaping, err := supervisor.Processes{}.Reap(context.Background(), supervisor.Ref(pid, token))
		if err == nil || reaping != supervisor.ReapLeft {
			t.Fatalf("%s: reap = %s, %v", name, reaping, err)
		}
	}
	// Reap signals synchronously, so a kill would already have been sent;
	// a killed child is a zombie or gone, never running.
	out, _ := exec.Command("ps", "-o", "stat=", "-p", strconv.Itoa(pid)).Output()
	if stat := strings.TrimSpace(string(out)); stat == "" || strings.HasPrefix(stat, "Z") {
		t.Fatalf("a process that could not be identified was killed (state %q)", stat)
	}
}

// The reference is the supervisor's own: it carries the group and token and
// reads them back, tokens with colons and spaces included.
func TestRefRoundTrips(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		group int
		token string
	}{{4242, ""}, {4242, "Mon Sep 28 11:00:00 2026 sleep"}, {7, "a:b:c"}} {
		ref := supervisor.Ref(tc.group, tc.token)
		group, token, err := supervisor.ParseRef(ref)
		if err != nil || group != tc.group || token != tc.token {
			t.Errorf("%q -> %d, %q, %v", ref, group, token, err)
		}
	}
}

// A reference the supervisor did not make is refused as left, and no
// group is signalled: the number in it is not taken for one.
//
// Contract test: the reaper against a real process group and its token from
// ps.
func TestReapLeavesAReferenceItDoesNotUnderstand(t *testing.T) {
	t.Parallel()
	pid, _ := sleeper(t)
	token, err := supervisor.Token(context.Background(), pid)
	if err != nil {
		t.Fatal(err)
	}
	for name, ref := range map[string]string{
		"empty (a v1alpha2 record)": "",
		"the right numbers, no tag": strconv.Itoa(pid) + ":" + token,
		"another adapter's":         "container:" + strconv.Itoa(pid),
		"a bare number":             strconv.Itoa(pid),
		"no group number":           "pgid:",
		"not a number":              "pgid:abc:token",
	} {
		reaping, err := supervisor.Processes{}.Reap(context.Background(), ref)
		if err == nil || reaping != supervisor.ReapLeft {
			t.Fatalf("%s: reap = %s, %v", name, reaping, err)
		}
	}
	out, _ := exec.Command("ps", "-o", "stat=", "-p", strconv.Itoa(pid)).Output()
	if stat := strings.TrimSpace(string(out)); stat == "" || strings.HasPrefix(stat, "Z") {
		t.Fatalf("a process named by a reference nobody understood was killed (state %q)", stat)
	}
}
