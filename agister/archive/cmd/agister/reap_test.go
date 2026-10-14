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
	"sync"
	"syscall"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/adapters/fsruns"
	"github.com/igor1309/ai-labs/agister/internal/adapters/system"
	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/cli"
	"github.com/igor1309/ai-labs/agister/internal/contract"
	domain "github.com/igor1309/ai-labs/agister/internal/domain/run"
	"github.com/igor1309/ai-labs/gokit/clocktest"
	"github.com/igor1309/ai-labs/gokit/supervisor"
)

// eventually polls until check holds. Only the test that SIGKILLs a real
// CLI uses it, for what that other process and the group it leaves do;
// a call hosted in the test's process is awaited on its Done.
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

// cancelAndWait cancels the run hosted in hosted and waits on its Done;
// its goroutine writes nothing under the home after that. A run already
// finished is no longer hosted, so its cancel fails and its Done is
// closed.
func cancelAndWait(runs canceller, hosted *app.Hosted, id string) {
	_ = runs.Cancel(context.Background(), id)
	<-hosted.Done(id)
}

// cleanupRun makes the test's cleanup cancel the run and wait for it,
// whatever point the test reached. Registered once the run is submitted,
// after its home's tempDir and any cleanupRecorded, it runs before both.
func cleanupRun(t testing.TB, runs canceller, hosted *app.Hosted, id string) {
	t.Cleanup(func() { cancelAndWait(runs, hosted, id) })
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
	t.Parallel()
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

// A run killed with SIGKILL leaves its runtime behind, and its record of
// the worktree it worked in (ADR-025); the next call that starts reaps the
// runtime and finishes the run as lost. No checkout is made, before or
// after.
//
// Contract test: the kernel, at a SIGKILL of the CLI. It releases the
// run's owner lock and leaves the runtime's process group running, which
// the next call's reap then kills by its recorded reference. It is the one
// test that kills a real CLI: the others abandon a run in process (abandon).
func TestNextCallReapsWhatAKilledRunLeftBehind(t *testing.T) {
	t.Parallel()
	home, repo := setupBuilt(t, "hang")
	binary := agisterBinary(t)
	victim := exec.Command(binary, "--home", home, "run", "adversarial_review_reviewer", "--param", "base=main", "--quiet", "--timeout", "30s")
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
	eventually(t, "the record to show the process and the worktree", func() bool {
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
		if record.InPlace == nil || record.Effects == nil || record.Effects.Process == nil {
			return false
		}
		_, token, err := supervisor.ParseRef(record.Effects.Process.Ref)
		return err == nil && token != ""
	})
	group, _, err := supervisor.ParseRef(record.Effects.Process.Ref)
	if err != nil {
		t.Fatal(err)
	}

	if err := victim.Process.Signal(syscall.SIGKILL); err != nil {
		t.Fatal(err)
	}
	_ = victim.Wait()

	// The effects outlive it.
	if !groupAlive(group) {
		t.Fatal("the runtime died with agister")
	}
	if lines := strings.Split(gitCmd(t, repo, "worktree", "list"), "\n"); len(lines) != 1 {
		t.Fatalf("worktrees = %v", lines)
	}

	// Another call starts (and times out on its own hang, once the test
	// passes its timeout). It is submitted in process so the reap it starts
	// can be awaited.
	const timeout = 7 * time.Minute
	clock := clocktest.NewClock(time.Date(2026, 10, 3, 12, 0, 0, 0, time.UTC))
	config := cli.Config{Home: home, Cwd: repo}
	composed := on(config, timeoutOn(clock, timeout))
	client, background, err := composed.wire(config)
	if err != nil {
		t.Fatal(err)
	}
	id, err := client.Submit(context.Background(), contract.CallRequest{
		Process: "adversarial_review_reviewer", Params: map[string]string{"base": "main"}, Timeout: "7m", Cwd: repo,
	})
	if err != nil {
		t.Fatal(err)
	}
	background.Wait()
	clock.Started(timeout)
	clock.Advance(timeout)
	// The new call ends on its own timeout, taking its runtime.
	<-composed.hosted.Done(id)

	eventually(t, "the old runtime to be gone", func() bool { return !groupAlive(group) })
	if lines := strings.Split(gitCmd(t, repo, "worktree", "list"), "\n"); len(lines) != 1 {
		t.Fatalf("worktrees = %v", lines)
	}
	// Reaping runs beside the call that started it, and has ended.
	var old domain.Record
	readJSON(t, recordPath, &old)
	if old.FinishedAt == nil || old.Result == nil || old.Result.Status != domain.Lost || old.Result.Error.Class != domain.ClassAbandoned {
		t.Fatalf("old run = %+v", old.Result)
	}
	events, _ := os.ReadFile(filepath.Join(filepath.Dir(recordPath), "events.jsonl"))
	if !strings.Contains(string(events), `"EFFECTS_REAPED"`) {
		t.Fatalf("no reap event:\n%s", events)
	}
}

// orphans are the process groups a killed owner left running, by the
// reference its run recorded: what the kernel keeps after the kill. As the
// composition's reaper of processes it ends an orphan, once, and finds any
// other reference gone; that a real group is killed by its reference is
// the supervisor's contract (processes_test.go).
type orphans struct {
	mu   sync.Mutex
	left map[string]bool
}

// leave leaves the group ref names running, with nobody to end it.
func (o *orphans) leave(ref string) {
	o.mu.Lock()
	defer o.mu.Unlock()
	if o.left == nil {
		o.left = map[string]bool{}
	}
	o.left[ref] = true
}

// alive says the group ref names was left and not reaped yet.
func (o *orphans) alive(ref string) bool {
	o.mu.Lock()
	defer o.mu.Unlock()
	return o.left[ref]
}

func (o *orphans) Reap(_ context.Context, ref string) (supervisor.Reaping, error) {
	o.mu.Lock()
	defer o.mu.Unlock()
	if !o.left[ref] {
		return supervisor.ReapGone, nil
	}
	delete(o.left, ref)
	return supervisor.ReapKilled, nil
}

// errSeen ends an Observe at the event the test waited for.
var errSeen = errors.New("the event the test waited for")

// until follows run id through client, as it appends, up to the first
// event that holds: the run is still running then.
func until(t *testing.T, client contract.Client, id string, holds func(contract.Event) bool) {
	t.Helper()
	err := client.Observe(context.Background(), id, 0, func(event contract.Event) error {
		if holds(event) {
			return errSeen
		}
		return nil
	})
	if !errors.Is(err, errSeen) {
		t.Fatalf("run %s ended without the event the test waits for: %v", id, err)
	}
}

// abandon leaves run id of the composition killed as a kill of its process
// leaves it: unowned and unfinished, with what its call started still
// running. The call itself is not ended here: the test's cleanup ends it
// (cleanupRun).
func abandon(t *testing.T, killed composition, id string) {
	t.Helper()
	if err := killed.runs.Abandon(id); err != nil {
		t.Fatal(err)
	}
	if _, state, err := killed.runs.Get(context.Background(), id); err != nil || state != domain.StateAbandoned {
		t.Fatalf("the abandoned run %s reads %s, %v", id, state, err)
	}
	select {
	case <-killed.hosted.Done(id):
		t.Fatalf("run %s ended when it was abandoned", id)
	default:
	}
}

// A run killed while its verification command runs in its worktree
// (ADR-025 rule 5) leaves the command's process group behind, on record;
// the next call that starts reaps it and finishes the run as lost. The run
// is abandoned in process, as the kill leaves it, with its command
// blocked; that a SIGKILL leaves a run so is
// TestNextCallReapsWhatAKilledRunLeftBehind's. The abandoned run's hold on
// its worktree is still its open file's in the test's process, where a
// kill would have let it go, so the next call works in a repository of its
// own.
//
// Contract test: the composition's reap over a real git repository and the
// run store on the filesystem; what is reaped is a fake run in process.
//
// Serial: a run's owner lock is its open file's (flock). A process another
// test starts holds a copy from its fork to its exec, and the lock an
// abandoned run gave up would read as held.
func TestNextCallReapsAKilledRunsVerifyCommand(t *testing.T) {
	home, repo := setupGit(t, "approve")
	shipped := read(t, filepath.Join(home, "processes", "adversarial_review.yaml"))
	shipped = strings.Replace(shipped, "  revision: candidate_revision\n", "  revision: candidate_revision\n  clean: true\n", 1)
	write(t, filepath.Join(home, "processes", "verified.yaml"), strings.Replace(shipped, "name: adversarial_review", "name: verified", 1)+`
verify:
  command: `+strconv.Quote(blocks+" & wait")+`
  timeout: 40s
  max_attempts: 1
  instruction: The verification command failed.
`)
	// The process that is killed: its command's timeout is on a clock that
	// never moves, so only the test ends the command.
	const timeout = 40 * time.Second
	clock := clocktest.NewClock(time.Date(2026, 10, 3, 12, 0, 0, 0, time.UTC))
	config := cli.Config{Home: home, Cwd: repo}
	killed := on(config, timeoutOn(clock, timeout))
	victim, _, err := killed.wire(config)
	if err != nil {
		t.Fatal(err)
	}
	id, err := victim.Submit(context.Background(), contract.CallRequest{Process: bound(t, home, "verified", "reviewer"), Params: map[string]string{"base": "main"}, Cwd: repo})
	if err != nil {
		t.Fatal(err)
	}
	// The cleanup ends the call, and its command with it, whatever point
	// the test reached.
	cleanupRun(t, victim, killed.hosted, id)

	// The command's timeout starts once the record names its group with
	// its token.
	clock.Started(timeout)
	record, _, err := killed.runs.Get(context.Background(), id)
	if err != nil || record.InPlace == nil || record.Effects == nil || record.Effects.Command == nil || record.Effects.Checkout != nil || record.Effects.Copy != nil {
		t.Fatalf("in place %+v, effects %+v, %v", record.InPlace, record.Effects, err)
	}
	command := record.Effects.Command.Ref
	if _, token, err := supervisor.ParseRef(command); err != nil || token == "" {
		t.Fatalf("the command's group on record = %q: %v", command, err)
	}
	// The kill: the run is nobody's, and its command's group runs on.
	abandon(t, killed, id)
	left := &orphans{}
	left.leave(command)

	other := repository(t, "approve")
	config = cli.Config{Home: home, Cwd: other}
	composed := inProcess(config)
	composed.processes = left
	client, background, err := composed.wire(config)
	if err != nil {
		t.Fatal(err)
	}
	next, err := client.Submit(context.Background(), contract.CallRequest{
		Process: "adversarial_review_reviewer", Params: map[string]string{"base": "main"}, Timeout: "30s", Cwd: other,
	})
	if err != nil {
		t.Fatal(err)
	}
	// Should the test fail while the new call runs, the cleanup ends it
	// before the home is removed.
	cleanupRun(t, client, composed.hosted, next)
	background.Wait()
	if left.alive(command) {
		t.Fatal("the command's group was not reaped")
	}
	old, state, err := composed.runs.Get(context.Background(), id)
	if err != nil || state != domain.StateFinished || old.Result == nil || old.Result.Status != domain.Lost || old.Result.Error.Class != domain.ClassAbandoned {
		t.Fatalf("old run = %s %+v, %v", state, old.Result, err)
	}
	events, _ := os.ReadFile(filepath.Join(home, "runs", id, "events.jsonl"))
	if !strings.Contains(string(events), `"EFFECTS_REAPED"`) || !strings.Contains(string(events), `"command":{"outcome":"killed"`) {
		t.Fatalf("no reap of the command:\n%s", events)
	}
	// The new call ends too. Until it ends, it would take its turn under
	// the home while the test's cleanup removes it. Neither call made a
	// checkout.
	<-composed.hosted.Done(next)
	for _, dir := range []string{repo, other} {
		if lines := strings.Split(gitCmd(t, dir, "worktree", "list"), "\n"); len(lines) != 1 {
			t.Fatalf("worktrees of %s = %v", dir, lines)
		}
	}
}

// killedAtItsAbort is the run store of a process a SIGKILL takes right
// after its call's abort is on record, while it waits for its runtime to
// end: the run is left as the kill leaves it (Store.Abandon), and nothing
// the call does after is saved. The call itself winds down in the test's
// process, which lets its hold of the worktree go, as the kill would.
type killedAtItsAbort struct{ fsruns.Store }

func (s killedAtItsAbort) Create(ctx context.Context, record domain.Record) (app.RunHandle, error) {
	handle, err := s.Store.Create(ctx, record)
	if err != nil {
		return nil, err
	}
	return abortedRun{RunHandle: handle, store: s.Store, id: record.ID}, nil
}

type abortedRun struct {
	app.RunHandle
	store fsruns.Store
	id    string
}

func (r abortedRun) Append(event domain.Event) error {
	if err := r.RunHandle.Append(event); err != nil || event.Kind != "ABORT_REQUESTED" {
		return err
	}
	return r.store.Abandon(r.id)
}

// LAB-123, ADR-025 rule 4: a writer whose owner is killed after its abort
// was requested leaves its run unfinished, its runtime's process on record.
// The next writer call into the same worktree is not refused by it: the
// call has the composition's reaper finish the run, as lost and abandoned,
// and end its process, and is then admitted. The reap beside the calls is
// left out of both processes, so only the call can have reaped the run:
// nobody waits for that reap, and a call must not depend on it.
//
// Contract test: the composition's hold and reap over the run store on the
// filesystem, the kernel's flock on a run's owner.lock and on the
// worktree's lock file; git and the runtime are fakes run in process.
//
// Serial: a run's owner lock is its open file's (flock). A process another
// test starts holds a copy from its fork to its exec, and the lock an
// abandoned run gave up would read as held.
func TestAWriterCallIsAdmittedWhereAKilledWriterLeftItsRun(t *testing.T) {
	home, repo := setup(t, "hang")
	// The brief is kept out of the worktree, which the process takes as
	// its HEAD has it; it tells the fake runtime to hang.
	brief := filepath.Join(tempDir(t), "b.md")
	write(t, brief, "Do it. SCENARIO:hang\n")
	ctx := context.Background()
	config := cli.Config{Home: home, Cwd: repo}
	request := contract.CallRequest{Process: "implement_assistant", Params: map[string]string{"candidate": "HEAD", "brief": brief}, Cwd: repo}

	// The process that is killed, at its call's abort. A killed process
	// reaps nothing: its reap beside the calls is left out too.
	killed := inProcess(config)
	killed.adjust = func(infra *app.Infrastructure) {
		infra.Calls.Recorder = killedAtItsAbort{killed.runs}
		infra.Decorate = func(client contract.Client) contract.Client { return client }
	}
	victim, _, err := killed.wire(config)
	if err != nil {
		t.Fatal(err)
	}
	id, err := victim.Submit(ctx, request)
	if err != nil {
		t.Fatal(err)
	}
	cleanupRun(t, victim, killed.hosted, id)
	until(t, victim, id, func(event contract.Event) bool { return event.Kind == "PROCESS_STARTED" })
	cancelAndWait(victim, killed.hosted, id)
	// As the kill leaves it: nobody's, unfinished, a writer's in the
	// worktree, its runtime's process on record, its abort its last event.
	left, state, err := killed.runs.Get(ctx, id)
	if err != nil || state != domain.StateAbandoned || left.FinishedAt != nil || left.InPlace == nil || left.InPlace.Worktree != repo || !left.InPlace.HeldAlone() ||
		left.Effects == nil || left.Effects.Process == nil {
		t.Fatalf("the killed run %s: in place %+v, effects %+v, finished %v, %v", state, left.InPlace, left.Effects, left.FinishedAt, err)
	}
	if kinds := readRun(t, filepath.Join(home, "runs", id)).kinds(); kinds[len(kinds)-1] != "ABORT_REQUESTED" {
		t.Fatalf("the killed run's events %v", kinds)
	}
	orphaned := &orphans{}
	orphaned.leave(left.Effects.Process.Ref)

	// The next process: its composition's holder and its reap beside the
	// calls share one reaper, and here only the holder asks it.
	composed := inProcess(config)
	composed.processes = orphaned
	var holders app.HoldReaper
	composed.adjust = func(infra *app.Infrastructure) {
		holders = infra.Holder.Reaper
		infra.Decorate = func(client contract.Client) contract.Client { return client }
	}
	client, background, err := composed.wire(config)
	if err != nil {
		t.Fatal(err)
	}
	if any(holders) != any(background.Reaper) {
		t.Fatalf("the holder's reaper %p is not the background reaper's %p", holders, background.Reaper)
	}
	// The reaps are bounded by the test, not by the reap deadline's real
	// timer: a hang is the test binary's to report.
	reaper, ok := background.Reaper.(*app.Reaper)
	if !ok {
		t.Fatalf("the background reaper is a %T", background.Reaper)
	}
	reaper.ReapContext = func(ctx context.Context) (context.Context, context.CancelFunc) { return context.WithCancel(ctx) }
	next, err := client.Submit(ctx, request)
	if err != nil {
		t.Fatal(err)
	}
	cleanupRun(t, client, composed.hosted, next)
	// The call is admitted and starts its runtime, where it hangs.
	until(t, client, next, func(event contract.Event) bool { return event.Kind == "PROCESS_STARTED" })
	cancelAndWait(client, composed.hosted, next)

	events := readRun(t, filepath.Join(home, "runs", next))
	if kinds := strings.Join(events.kinds(), " "); !strings.Contains(kinds, "WORKTREE_LOCKED WORKTREE_RUN_REAPED WORKTREE_ADMITTED") {
		t.Fatalf("the next call's events %s", kinds)
	}
	for _, event := range events.events {
		if data, _ := event["data"].(map[string]any); event["kind"] == "WORKTREE_RUN_REAPED" &&
			(data["run"] != id || data["outcome"] != "finished" || data["status"] != "lost" || data["class"] != "abandoned" || data["processes_ended"] != true) {
			t.Fatalf("the next call says %v of the killed run", data)
		}
	}
	old, state, err := composed.runs.Get(ctx, id)
	if err != nil || state != domain.StateFinished || old.Result == nil || old.Result.Status != domain.Lost || old.Result.Error.Class != domain.ClassAbandoned ||
		old.ProcessesEnded == nil || !*old.ProcessesEnded {
		t.Fatalf("the killed run = %s %+v, processes ended %v, %v", state, old.Result, old.ProcessesEnded, err)
	}
	if kinds := strings.Join(readRun(t, filepath.Join(home, "runs", id)).kinds(), " "); !strings.HasSuffix(kinds, " ABORT_REQUESTED EFFECTS_REAPED") {
		t.Fatalf("the killed run's events %s", kinds)
	}
	if orphaned.alive(left.Effects.Process.Ref) {
		t.Fatal("the killed run's process was not reaped")
	}
}

// A call still running when its test ends is cancelled and drained by the
// cleanup registered for it: the call here blocks in its verification
// command until cancelled, and the test never ends it otherwise. Once the
// cleanup returns, the run is finished, its command has seen its context
// end, and its hold on the worktree is released: a writer takes it again.
//
// Contract test: the worktree's hold is the composition's lock file's
// (flock), taken again here as a writer would.
func TestCleanupRunCancelsAndDrainsABlockedCall(t *testing.T) {
	t.Parallel()
	command := newBlockedCommand()
	h := newLoopWith(t, seams{commands: command}, verifySettings{}, state("one"))
	id := h.submit(contract.CallRequest{})
	// The cleanup is registered on a recording TB, drained below; should
	// the test fail first, the real one drains what is left.
	fake := &recordingTB{TB: t, name: t.Name()}
	t.Cleanup(fake.runCleanups)
	cleanupRun(fake, h.runs, h.hosted, id)

	<-command.started
	running, _, err := h.store.Get(context.Background(), id)
	if err != nil || running.InPlace == nil || running.Effects == nil || running.Effects.Command == nil {
		t.Fatalf("in place %+v, record effects %+v, %v", running.InPlace, running.Effects, err)
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
	<-command.cancelled
	_, release, err := system.WorktreeLocks{Dir: filepath.Join(h.home, "locks", "in-place")}.Lock(h.repo, true)
	if err != nil {
		t.Fatalf("the worktree is still held: %v", err)
	}
	if err := release(); err != nil {
		t.Fatal(err)
	}
	if left := h.left(); len(left) != 0 {
		t.Fatalf("checkouts left: %v", left)
	}
}
