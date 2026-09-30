package main

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/adapters/fsruns"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/supervisor"
	"github.com/igor1309/ai-labs/agister/internal/cli"
	"github.com/igor1309/ai-labs/agister/internal/contract"
	domain "github.com/igor1309/ai-labs/agister/internal/domain/run"
)

// eventually polls until check holds.
func eventually(t *testing.T, what string, check func() bool) {
	t.Helper()
	deadline := time.Now().Add(15 * time.Second)
	for !check() {
		if time.Now().After(deadline) {
			t.Fatalf("timed out waiting for %s", what)
		}
		time.Sleep(50 * time.Millisecond)
	}
}

func groupAlive(group int) bool { return syscall.Kill(-group, 0) == nil }

// A run killed with SIGKILL leaves its runtime and its checkout behind; the
// next call that starts reaps them and finishes the run as lost.
func TestNextCallReapsWhatAKilledRunLeftBehind(t *testing.T) {
	home, repo := setup(t, "hang")
	binary := filepath.Join(t.TempDir(), "agister")
	if out, err := exec.Command("go", "build", "-o", binary, ".").CombinedOutput(); err != nil {
		t.Fatalf("build: %v\n%s", err, out)
	}
	victim := exec.Command(binary, "--home", home, "run", "adversarial_review", "--param", "base=main", "--quiet", "--timeout", "30s")
	victim.Dir = repo
	// Its own process group: only it is killed below, not the test.
	victim.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	if err := victim.Start(); err != nil {
		t.Fatal(err)
	}
	group, checkout := 0, ""
	t.Cleanup(func() {
		_ = victim.Process.Kill()
		_ = victim.Wait()
		if group > 0 {
			_ = syscall.Kill(-group, syscall.SIGKILL)
			if checkout != "" {
				_ = exec.Command("git", "-C", repo, "worktree", "remove", "--force", checkout).Run()
				_ = os.RemoveAll(filepath.Dir(checkout))
			}
			return
		}
		// The poll below failed before the record was read: whatever the
		// record shows is still the test's to end.
		paths, _ := filepath.Glob(filepath.Join(home, "runs", "*", "record.json"))
		for _, path := range paths {
			var left domain.Record
			data, err := os.ReadFile(path)
			if err != nil || json.Unmarshal(data, &left) != nil || left.Effects == nil {
				continue
			}
			if left.Effects.Process != nil {
				if g, _, err := supervisor.ParseRef(left.Effects.Process.Ref); err == nil && g > 1 {
					_ = syscall.Kill(-g, syscall.SIGKILL)
				}
			}
			if left.Effects.Checkout != nil {
				_ = exec.Command("git", "-C", repo, "worktree", "remove", "--force", left.Effects.Checkout.Dir).Run()
			}
		}
	})

	// Wait until the record shows both effects (the group is reported before its token).
	var record domain.Record
	var recordPath string
	eventually(t, "the record to show the process and the checkout", func() bool {
		paths, _ := filepath.Glob(filepath.Join(home, "runs", "*", "record.json"))
		if len(paths) != 1 {
			return false
		}
		data, err := os.ReadFile(paths[0])
		record = domain.Record{}
		if err != nil || json.Unmarshal(data, &record) != nil {
			return false
		}
		recordPath = paths[0]
		if record.Effects == nil || record.Effects.Process == nil || record.Effects.Checkout == nil {
			return false
		}
		_, token, err := supervisor.ParseRef(record.Effects.Process.Ref)
		return err == nil && token != ""
	})
	var err error
	group, _, err = supervisor.ParseRef(record.Effects.Process.Ref)
	if err != nil {
		t.Fatal(err)
	}
	checkout = record.Effects.Checkout.Dir

	if err := victim.Process.Signal(syscall.SIGKILL); err != nil {
		t.Fatal(err)
	}
	_ = victim.Wait()

	// The effects outlive it.
	if !groupAlive(group) {
		t.Fatal("the runtime died with agister")
	}
	if _, err := os.Stat(checkout); err != nil {
		t.Fatal(err)
	}
	if lines := strings.Split(gitCmd(t, repo, "worktree", "list"), "\n"); len(lines) != 2 {
		t.Fatalf("worktrees = %v", lines)
	}

	// Another call starts (and times out on its own hang). It is submitted
	// in process so the reap it starts can be awaited.
	client, background, err := wire(cli.Config{Home: home, Cwd: repo})
	if err != nil {
		t.Fatal(err)
	}
	id, err := client.Submit(context.Background(), contract.CallRequest{
		Process: "adversarial_review", Params: map[string]string{"base": "main"}, Timeout: "1s", Cwd: repo,
	})
	if err != nil {
		t.Fatal(err)
	}
	background.Wait()
	// The new call ends on its own timeout, taking its runtime and checkout.
	store := fsruns.Store{Dir: filepath.Join(home, "runs")}
	eventually(t, "the new call to finish", func() bool {
		_, state, err := store.Get(context.Background(), id)
		return err == nil && state == domain.StateFinished
	})

	eventually(t, "the old runtime to be gone", func() bool { return !groupAlive(group) })
	if _, err := os.Stat(checkout); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("checkout left behind: %v", err)
	}
	if lines := strings.Split(gitCmd(t, repo, "worktree", "list"), "\n"); len(lines) != 1 {
		t.Fatalf("worktrees = %v", lines)
	}
	// Reaping runs beside the call that started it, so the run's end is
	// awaited too.
	var old domain.Record
	eventually(t, "the old run to be finished", func() bool {
		data, err := os.ReadFile(recordPath)
		old = domain.Record{}
		return err == nil && json.Unmarshal(data, &old) == nil && old.FinishedAt != nil
	})
	if old.FinishedAt == nil || old.Result == nil || old.Result.Status != domain.Lost || old.Result.Error.Class != domain.ClassAbandoned {
		t.Fatalf("old run = %+v", old.Result)
	}
	events, _ := os.ReadFile(filepath.Join(filepath.Dir(recordPath), "events.jsonl"))
	if !strings.Contains(string(events), `"EFFECTS_REAPED"`) {
		t.Fatalf("no reap event:\n%s", events)
	}
}

// A run killed with SIGKILL while its verification command runs leaves the
// command's process group behind, on record; the next call that starts
// reaps it with the checkout and finishes the run as lost.
func TestNextCallReapsAKilledRunsVerifyCommand(t *testing.T) {
	home, repo := setup(t, "approve")
	groupFile := filepath.Join(t.TempDir(), "group")
	shipped := read(t, filepath.Join(home, "processes", "adversarial_review.yaml"))
	write(t, filepath.Join(home, "processes", "verified.yaml"), strings.Replace(shipped, "name: adversarial_review", "name: verified", 1)+`
verify:
  command: `+strconv.Quote("sleep 50 & echo $$ > "+groupFile+"; wait")+`
  timeout: 40s
  max_attempts: 1
  instruction: The verification command failed.
`)
	binary := filepath.Join(t.TempDir(), "agister")
	if out, err := exec.Command("go", "build", "-o", binary, ".").CombinedOutput(); err != nil {
		t.Fatalf("build: %v\n%s", err, out)
	}
	victim := exec.Command(binary, "--home", home, "run", "verified", "--param", "base=main", "--quiet", "--timeout", "45s")
	victim.Dir = repo
	victim.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	if err := victim.Start(); err != nil {
		t.Fatal(err)
	}
	group := 0
	t.Cleanup(func() {
		_ = victim.Process.Kill()
		_ = victim.Wait()
		if group > 1 {
			_ = syscall.Kill(-group, syscall.SIGKILL)
		}
		paths, _ := filepath.Glob(filepath.Join(home, "runs", "*", "record.json"))
		for _, path := range paths {
			var left domain.Record
			if data, err := os.ReadFile(path); err == nil && json.Unmarshal(data, &left) == nil && left.Effects != nil && left.Effects.Checkout != nil {
				_ = exec.Command("git", "-C", repo, "worktree", "remove", "--force", left.Effects.Checkout.Dir).Run()
			}
		}
	})

	// Wait until the record names the command's group with its token.
	var record domain.Record
	var recordPath string
	eventually(t, "the record to show the command's group", func() bool {
		paths, _ := filepath.Glob(filepath.Join(home, "runs", "*", "record.json"))
		if len(paths) != 1 {
			return false
		}
		data, err := os.ReadFile(paths[0])
		record = domain.Record{}
		if err != nil || json.Unmarshal(data, &record) != nil || record.Effects == nil || record.Effects.Command == nil {
			return false
		}
		recordPath = paths[0]
		_, token, err := supervisor.ParseRef(record.Effects.Command.Ref)
		return err == nil && token != ""
	})
	var err error
	if group, _, err = supervisor.ParseRef(record.Effects.Command.Ref); err != nil {
		t.Fatal(err)
	}
	checkout := record.Effects.Checkout.Dir
	eventually(t, "the command to write its group", func() bool {
		data, err := os.ReadFile(groupFile)
		return err == nil && strings.TrimSpace(string(data)) == strconv.Itoa(group)
	})

	if err := victim.Process.Signal(syscall.SIGKILL); err != nil {
		t.Fatal(err)
	}
	_ = victim.Wait()
	if !groupAlive(group) {
		t.Fatal("the command died with agister")
	}

	client, background, err := wire(cli.Config{Home: home, Cwd: repo})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := client.Submit(context.Background(), contract.CallRequest{
		Process: "adversarial_review", Params: map[string]string{"base": "main"}, Timeout: "30s", Cwd: repo,
	}); err != nil {
		t.Fatal(err)
	}
	background.Wait()
	eventually(t, "the command's group to be gone", func() bool { return !groupAlive(group) })
	if _, err := os.Stat(checkout); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("checkout left behind: %v", err)
	}
	var old domain.Record
	eventually(t, "the old run to be finished", func() bool {
		data, err := os.ReadFile(recordPath)
		old = domain.Record{}
		return err == nil && json.Unmarshal(data, &old) == nil && old.FinishedAt != nil
	})
	if old.Result == nil || old.Result.Status != domain.Lost || old.Result.Error.Class != domain.ClassAbandoned {
		t.Fatalf("old run = %+v", old.Result)
	}
	events, _ := os.ReadFile(filepath.Join(filepath.Dir(recordPath), "events.jsonl"))
	if !strings.Contains(string(events), `"EFFECTS_REAPED"`) || !strings.Contains(string(events), `"command":{"outcome":"killed"`) {
		t.Fatalf("no reap of the command:\n%s", events)
	}
	// The new call ends too, and its checkout goes with it.
	eventually(t, "every checkout to be released", func() bool {
		return len(strings.Split(gitCmd(t, repo, "worktree", "list"), "\n")) == 1
	})
}
