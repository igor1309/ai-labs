package main

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
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
func eventually(t testing.TB, what string, check func() bool) {
	t.Helper()
	deadline := time.Now().Add(15 * time.Second)
	for !check() {
		if time.Now().After(deadline) {
			t.Fatalf("timed out waiting for %s", what)
		}
		time.Sleep(50 * time.Millisecond)
	}
}

// canceller cancels a run hosted in the test's process.
type canceller interface {
	Cancel(ctx context.Context, runID string) error
}

// cancelAndWait cancels the run and waits until it is finished; its
// goroutine writes nothing under the home after that. A run already
// finished is no longer hosted, so its cancel fails and only the wait is
// left.
func cancelAndWait(t testing.TB, runs canceller, store fsruns.Store, id string) {
	t.Helper()
	_ = runs.Cancel(context.Background(), id)
	eventually(t, "run "+id+" to finish", func() bool {
		_, state, err := store.Get(context.Background(), id)
		return err == nil && state == domain.StateFinished
	})
}

// cleanupRun makes the test's cleanup cancel the run and wait for it,
// whatever point the test reached. Registered once the run is submitted,
// after its home's tempDir and cleanupRecorded, it runs before both.
func cleanupRun(t testing.TB, runs canceller, store fsruns.Store, id string) {
	t.Cleanup(func() { cancelAndWait(t, runs, store, id) })
}

func groupAlive(group int) bool { return syscall.Kill(-group, 0) == nil }

// endRecorded ends what every run under runs left on record, as it is
// then: each runtime and command group is killed and each checkout and
// clean copy removed, each effect on its own, whatever else a run has or
// lacks. A test's cleanup calls it whatever point the test reached, so a
// group recorded before its token is ended too.
func endRecorded(runs string, kill func(group int), remove func(dir string)) {
	paths, _ := filepath.Glob(filepath.Join(runs, "*", "record.json"))
	for _, path := range paths {
		var left domain.Record
		data, err := os.ReadFile(path)
		if err != nil || json.Unmarshal(data, &left) != nil || left.Effects == nil {
			continue
		}
		for _, process := range []*domain.Process{left.Effects.Process, left.Effects.Command} {
			if process == nil {
				continue
			}
			// Group 1 and below would signal more than the test's own.
			if group, _, err := supervisor.ParseRef(process.Ref); err == nil && group > 1 {
				kill(group)
			}
		}
		for _, checkout := range []*domain.Checkout{left.Effects.Checkout, left.Effects.Copy} {
			if checkout != nil {
				remove(checkout.Dir)
			}
		}
	}
}

// cleanupRecorded makes the test's cleanup end, after its own steps, what
// the runs under home left on record in repo.
func cleanupRecorded(t *testing.T, home, repo string) {
	t.Cleanup(func() {
		endRecorded(filepath.Join(home, "runs"),
			func(group int) { _ = syscall.Kill(-group, syscall.SIGKILL) },
			func(dir string) {
				_ = exec.Command("git", "-C", repo, "worktree", "remove", "--force", dir).Run()
				if parent := filepath.Dir(dir); strings.HasPrefix(filepath.Base(parent), "agister-checkout-") {
					_ = os.RemoveAll(parent)
				}
			})
	})
}

// Cleanup ends every recorded group and checkout, a group recorded without
// its token among them, and skips what cannot be read or would signal
// beyond the test.
func TestEndRecordedEndsEveryRecordedEffect(t *testing.T) {
	runs := tempDir(t)
	records := map[string]*domain.Effects{
		// The command's group, recorded before its token lookup failed.
		"verify": {
			Checkout: &domain.Checkout{Dir: "/checkout/verify"},
			Copy:     &domain.Checkout{Dir: "/copy/verify"},
			Command:  &domain.Process{Ref: supervisor.Ref(4242, "")},
		},
		"runtime": {
			Process:  &domain.Process{Ref: supervisor.Ref(4343, "token")},
			Checkout: &domain.Checkout{Dir: "/checkout/runtime"},
		},
		"both": {
			Process: &domain.Process{Ref: supervisor.Ref(4444, "")},
			Command: &domain.Process{Ref: supervisor.Ref(4545, "token")},
		},
		"unsafe":  {Process: &domain.Process{Ref: supervisor.Ref(1, "")}, Command: &domain.Process{Ref: "other:7"}},
		"nothing": nil,
	}
	for name, effects := range records {
		data, err := json.Marshal(domain.Record{Effects: effects})
		if err != nil {
			t.Fatal(err)
		}
		write(t, filepath.Join(runs, name, "record.json"), string(data))
	}
	write(t, filepath.Join(runs, "torn", "record.json"), `{"effects":`)

	var killed []int
	var removed []string
	endRecorded(runs, func(group int) { killed = append(killed, group) }, func(dir string) { removed = append(removed, dir) })
	slices.Sort(killed)
	slices.Sort(removed)
	if want := []int{4242, 4343, 4444, 4545}; !slices.Equal(killed, want) {
		t.Fatalf("killed %v, want %v", killed, want)
	}
	if want := []string{"/checkout/runtime", "/checkout/verify", "/copy/verify"}; !slices.Equal(removed, want) {
		t.Fatalf("removed %v, want %v", removed, want)
	}
}

// A run killed with SIGKILL leaves its runtime and its checkout behind; the
// next call that starts reaps them and finishes the run as lost.
func TestNextCallReapsWhatAKilledRunLeftBehind(t *testing.T) {
	home, repo := setup(t, "hang")
	binary := filepath.Join(tempDir(t), "agister")
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
	// Should the test fail first, the cleanup ends what the runs left on
	// record, whatever point the test reached.
	cleanupRecorded(t, home, repo)
	t.Cleanup(func() {
		_ = victim.Process.Kill()
		_ = victim.Wait()
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
	group, _, err := supervisor.ParseRef(record.Effects.Process.Ref)
	if err != nil {
		t.Fatal(err)
	}
	checkout := record.Effects.Checkout.Dir

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
// command's process group and the clean copy it runs in behind, on record;
// the next call that starts reaps them with the checkout and finishes the
// run as lost.
func TestNextCallReapsAKilledRunsVerifyCommand(t *testing.T) {
	home, repo := setup(t, "approve")
	groupFile := filepath.Join(tempDir(t), "group")
	shipped := read(t, filepath.Join(home, "processes", "adversarial_review.yaml"))
	write(t, filepath.Join(home, "processes", "verified.yaml"), strings.Replace(shipped, "name: adversarial_review", "name: verified", 1)+`
verify:
  command: `+strconv.Quote(blocks+" & echo $$ > "+groupFile+"; wait")+`
  timeout: 40s
  max_attempts: 1
  instruction: The verification command failed.
`)
	binary := filepath.Join(tempDir(t), "agister")
	if out, err := exec.Command("go", "build", "-o", binary, ".").CombinedOutput(); err != nil {
		t.Fatalf("build: %v\n%s", err, out)
	}
	victim := exec.Command(binary, "--home", home, "run", "verified", "--param", "base=main", "--quiet", "--timeout", "45s")
	victim.Dir = repo
	victim.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	if err := victim.Start(); err != nil {
		t.Fatal(err)
	}
	// Should the test fail first, the cleanup ends what the runs left on
	// record, the command's group among them, whatever point the test
	// reached.
	cleanupRecorded(t, home, repo)
	t.Cleanup(func() {
		_ = victim.Process.Kill()
		_ = victim.Wait()
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
	group, _, err := supervisor.ParseRef(record.Effects.Command.Ref)
	if err != nil {
		t.Fatal(err)
	}
	checkout := record.Effects.Checkout.Dir
	if record.Effects.Copy == nil {
		t.Fatalf("effects = %+v", record.Effects)
	}
	copied := record.Effects.Copy.Dir
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
	id, err := client.Submit(context.Background(), contract.CallRequest{
		Process: "adversarial_review", Params: map[string]string{"base": "main"}, Timeout: "30s", Cwd: repo,
	})
	if err != nil {
		t.Fatal(err)
	}
	// Should the test fail while the new call runs, the cleanup ends it
	// before the recorded effects and the home are removed.
	store := fsruns.Store{Dir: filepath.Join(home, "runs")}
	cleanupRun(t, client, store, id)
	background.Wait()
	eventually(t, "the command's group to be gone", func() bool { return !groupAlive(group) })
	if _, err := os.Stat(checkout); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("checkout left behind: %v", err)
	}
	if _, err := os.Stat(copied); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("clean copy left behind: %v", err)
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
	// The new call ends too, and its checkout goes with it. Until it ends,
	// it may not have made its checkout yet, and would take its worktree
	// turn under the home while the test's cleanup removes it.
	eventually(t, "the new call to finish", func() bool {
		_, state, err := store.Get(context.Background(), id)
		return err == nil && state == domain.StateFinished
	})
	eventually(t, "every checkout to be released", func() bool {
		return len(strings.Split(gitCmd(t, repo, "worktree", "list"), "\n")) == 1
	})
}

// A call still running when its test ends is cancelled and drained by the
// cleanup registered for it: the call here blocks in its verification
// command until released, and the test never releases it. Once the
// cleanup returns, the run is finished and its command, checkout and clean
// copy are gone.
func TestCleanupRunCancelsAndDrainsABlockedCall(t *testing.T) {
	release := filepath.Join(tempDir(t), "release")
	if err := syscall.Mkfifo(release, 0o600); err != nil {
		t.Fatal(err)
	}
	// Opening the fifo blocks until a writer releases it.
	h := newLoop(t, verifySettings{command: "cat " + strconv.Quote(release)}, state("one"))
	cleanupRecorded(t, h.home, h.repo)
	id := h.submit(contract.CallRequest{})
	// The cleanup is registered on a recording TB, drained below; should
	// the test fail first, the real one drains what is left.
	fake := &recordingTB{TB: t, name: t.Name()}
	t.Cleanup(fake.runCleanups)
	cleanupRun(fake, h.runs, h.store, id)

	var running domain.Record
	eventually(t, "the call to block in its command", func() bool {
		var err error
		running, _, err = h.store.Get(context.Background(), id)
		if err != nil || running.Effects == nil || running.Effects.Command == nil || running.Effects.Checkout == nil || running.Effects.Copy == nil {
			return false
		}
		_, token, err := supervisor.ParseRef(running.Effects.Command.Ref)
		return err == nil && token != ""
	})
	group, _, err := supervisor.ParseRef(running.Effects.Command.Ref)
	if err != nil {
		t.Fatal(err)
	}

	fake.runCleanups()
	if len(fake.errors) != 0 {
		t.Fatalf("cleanup: %q", fake.errors)
	}
	record, state, err := h.store.Get(context.Background(), id)
	if err != nil || state != domain.StateFinished {
		t.Fatalf("run %s: %s, %v", id, state, err)
	}
	expect(t, record, domain.Interrupted, domain.ClassCancelled, "cancelled during attempt 1's run")
	eventually(t, "the command's group to be gone", func() bool { return !groupAlive(group) })
	for _, dir := range []string{running.Effects.Checkout.Dir, running.Effects.Copy.Dir} {
		if _, err := os.Stat(dir); !errors.Is(err, os.ErrNotExist) {
			t.Fatalf("%s left behind: %v", dir, err)
		}
	}
	if lines := strings.Split(gitCmd(t, h.repo, "worktree", "list"), "\n"); len(lines) != 1 {
		t.Fatalf("worktrees = %v", lines)
	}
}
