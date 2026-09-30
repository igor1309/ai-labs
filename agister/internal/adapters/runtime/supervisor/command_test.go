package supervisor_test

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/supervisor"
	"github.com/igor1309/ai-labs/agister/internal/app"
)

// runCommand runs a command in dir and returns its result and the
// references it reported.
func runCommand(ctx context.Context, t *testing.T, dir, command string, timeout time.Duration, bound int) (app.CommandResult, []string) {
	t.Helper()
	var refs []string
	result := supervisor.Commands{}.Run(ctx, app.CommandRequest{Command: command, Dir: dir, Timeout: timeout, Bound: bound}, func(ref string) error {
		refs = append(refs, ref)
		return nil
	})
	return result, refs
}

// A command runs with bash in its directory; its combined output is kept
// as a head and a tail with the size and digest of the whole, and its exit
// code is reported. Its group is on record, with the leader's token.
func TestCommandRunsWithBoundedOutput(t *testing.T) {
	dir := t.TempDir()
	whole := "out:" + strings.Repeat("x", 30) + "err:" + strings.Repeat("y", 30) + "end\n"
	result, refs := runCommand(context.Background(), t, dir,
		`printf 'out:%s' "$(printf 'x%.0s' {1..30})"; printf 'err:%s' "$(printf 'y%.0s' {1..30})" >&2; echo end; pwd > where; exit 3`,
		10*time.Second, 8)
	sum := sha256.Sum256([]byte(whole))
	if result.Error != "" || result.ExitCode == nil || *result.ExitCode != 3 || result.TimedOut || result.Cancelled {
		t.Fatalf("result = %+v", result)
	}
	if string(result.Head) != whole[:8] || string(result.Tail) != whole[len(whole)-8:] || result.Bytes != int64(len(whole)) || result.SHA256 != hex.EncodeToString(sum[:]) {
		t.Fatalf("head %q, tail %q, bytes %d, sha %s", result.Head, result.Tail, result.Bytes, result.SHA256)
	}
	if where, _ := os.ReadFile(filepath.Join(dir, "where")); !strings.HasSuffix(strings.TrimSpace(string(where)), filepath.Base(dir)) {
		t.Fatalf("ran in %q", where)
	}
	if len(refs) != 2 || !strings.HasPrefix(refs[1], refs[0]+":") {
		t.Fatalf("refs = %q", refs)
	}

	// Output within twice the bound is kept whole, head then tail.
	result, _ = runCommand(context.Background(), t, dir, "printf abcdefghij", 10*time.Second, 8)
	if string(result.Head)+string(result.Tail) != "abcdefghij" || string(result.Head) != "abcdefgh" || result.Bytes != 10 || *result.ExitCode != 0 {
		t.Fatalf("result = %+v", result)
	}
}

// groupOf reads the group a command wrote as $$ (bash leads its group).
func groupOf(t *testing.T, path string) int {
	t.Helper()
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		if data, err := os.ReadFile(path); err == nil && strings.HasSuffix(string(data), "\n") {
			group, err := strconv.Atoi(strings.TrimSpace(string(data)))
			if err == nil {
				return group
			}
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatal("the command never wrote its group")
	return 0
}

// A timeout, or the caller's cancellation, kills the whole group, children
// included; so does an exit that leaves children behind.
func TestCommandGroupIsKilled(t *testing.T) {
	for _, c := range []struct {
		name    string
		command string
		timeout time.Duration
		cancel  bool
	}{
		{"timeout", "sleep 30 & echo $$ > group; wait", 300 * time.Millisecond, false},
		{"cancellation", "sleep 30 & echo $$ > group; wait", 30 * time.Second, true},
		{"exit", "sleep 30 & echo $$ > group; exit 0", 30 * time.Second, false},
	} {
		t.Run(c.name, func(t *testing.T) {
			dir := t.TempDir()
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			if c.cancel {
				go func() { groupOf(t, filepath.Join(dir, "group")); cancel() }()
			}
			started := time.Now()
			result, _ := runCommand(ctx, t, dir, c.command, c.timeout, 64)
			if result.TimedOut != (c.name == "timeout") || result.Cancelled != c.cancel || time.Since(started) > 20*time.Second {
				t.Fatalf("result %+v after %s", result, time.Since(started))
			}
			// A killed child is gone once its new parent has reaped it.
			group := groupOf(t, filepath.Join(dir, "group"))
			deadline := time.Now().Add(5 * time.Second)
			for !errors.Is(syscall.Kill(-group, 0), syscall.ESRCH) {
				if time.Now().After(deadline) {
					t.Fatalf("group %d is still there", group)
				}
				time.Sleep(20 * time.Millisecond)
			}
		})
	}
}

// A group that cannot be recorded is killed at once and the run fails.
func TestUnrecordedCommandIsKilled(t *testing.T) {
	dir := t.TempDir()
	started := time.Now()
	result := supervisor.Commands{}.Run(context.Background(), app.CommandRequest{Command: "sleep 30", Dir: dir, Timeout: 30 * time.Second, Bound: 64}, func(string) error {
		return errors.New("disk full")
	})
	if result.Error != "disk full" || result.ExitCode != nil || time.Since(started) > 10*time.Second {
		t.Fatalf("result %+v after %s", result, time.Since(started))
	}
}
