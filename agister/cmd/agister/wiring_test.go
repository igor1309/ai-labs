package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io/fs"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"reflect"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/examples"
	"github.com/igor1309/ai-labs/agister/internal/adapters/fsruns"
	"github.com/igor1309/ai-labs/agister/internal/adapters/git"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/runtimetest"
	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/cli"
	"github.com/igor1309/ai-labs/agister/internal/contract"
	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
	domain "github.com/igor1309/ai-labs/agister/internal/domain/run"
	"github.com/igor1309/ai-labs/gokit/clocktest"
	"github.com/igor1309/ai-labs/gokit/supervisor"
)

// marker is a definitions source told apart from every other by identity,
// and counting what is asked of it. It serves the shipped examples, so the
// use cases that read it get valid settings.
type marker struct {
	name string

	mu    sync.Mutex
	reads map[definition.Kind]int
	lists map[definition.Kind]int
}

func newMarker(name string) *marker {
	return &marker{name: name, reads: map[definition.Kind]int{}, lists: map[definition.Kind]int{}}
}

func (m *marker) Read(_ context.Context, kind definition.Kind, name string) (definition.Document, error) {
	m.mu.Lock()
	m.reads[kind]++
	m.mu.Unlock()
	pattern := string(kind) + "/" + name + ".*"
	if kind == definition.KindService {
		pattern = "service.*"
	}
	matches, _ := fs.Glob(examples.Settings(), pattern)
	if len(matches) != 1 {
		return definition.Document{}, fmt.Errorf("%s has no %s %q", m.name, kind, name)
	}
	data, err := fs.ReadFile(examples.Settings(), matches[0])
	sum := sha256.Sum256(data)
	return definition.Document{
		Source: definition.Source{Kind: kind, Name: name, Path: m.name + "/" + matches[0], SHA256: hex.EncodeToString(sum[:])},
		Bytes:  data,
	}, err
}

func (m *marker) List(_ context.Context, kind definition.Kind) ([]string, error) {
	m.mu.Lock()
	m.lists[kind]++
	m.mu.Unlock()
	entries, _ := fs.ReadDir(examples.Settings(), string(kind))
	var names []string
	for _, entry := range entries {
		names = append(names, strings.TrimSuffix(entry.Name(), path.Ext(entry.Name())))
	}
	return names, nil
}

// asked is how often the source was asked to list or read anything.
func (m *marker) asked() (lists, reads int) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, n := range m.lists {
		lists += n
	}
	for _, n := range m.reads {
		reads += n
	}
	return lists, reads
}

// Every use case of the client the gate builds reads only the sources it
// was given: the layered one everywhere, the global-only one for the global
// write scope. Wiring any of them to the live settings would defeat the
// snapshot. Each is exercised by name, and what it asked of each source is
// asserted: a use case or scope added later needs its own row here.
func TestBuiltClientReadsOnlyTheSourcesGiven(t *testing.T) {
	t.Parallel()
	fake, project := fakeRepository(t, "x")
	if err := os.MkdirAll(filepath.Join(project, ".agister"), 0o755); err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	for name, tc := range map[string]struct {
		cwd     string
		project bool // a project settings layer, so a second write scope
	}{
		"global only": {cwd: ""},
		"in project":  {cwd: project, project: true},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			home := tempDir(t)
			gitThrough(t, home, fake)
			config := cli.Config{Home: home, Cwd: tc.cwd}
			// Inspecting an agent asks its runtime's version: of a fake run
			// in process, not of a runtime this machine has.
			composed := inProcess(config)
			client, background, err := composed.wire(config)
			if err != nil {
				t.Fatal(err)
			}
			gated := gatedOf(t, client)
			// Each use case on a client of its own, so what one asked of a
			// source is not taken for another's.
			use := map[string]func(contract.Client) error{
				"settings": func(c contract.Client) error { _, err := c.ListAgents(ctx); return err },
				"check":    func(c contract.Client) error { _, err := c.Check(ctx, false); return err },
				"inspection": func(c contract.Client) error {
					_, err := c.ShowProcess(ctx, "ask", "")
					return err
				},
				"settings workflows": func(c contract.Client) error { _, err := c.ListWorkflows(ctx); return err },
				"inspection workflow": func(c contract.Client) error {
					_, err := c.ShowWorkflow(ctx, "review_panel")
					return err
				},
				// Refused after its settings were read: no such process.
				"calls": func(c contract.Client) error {
					id, err := c.Submit(ctx, contract.CallRequest{Process: "missing", Cwd: home})
					if err != nil {
						return err
					}
					<-composed.hosted.Done(id)
					return nil
				},
			}
			for use, call := range use {
				layered, global := newMarker("layered"), newMarker("global")
				decorated, ok := gated.Build(layered, global).(app.ReapOnSubmit)
				if !ok {
					t.Fatalf("the built client is not %T", app.ReapOnSubmit{})
				}
				if err := call(decorated.Client); err != nil {
					t.Fatalf("%s: %v", use, err)
				}
				background.Wait()
				if lists, reads := layered.asked(); lists+reads == 0 {
					t.Errorf("%s did not read the layered source given", use)
				}
				if lists, reads := global.asked(); lists+reads != 0 {
					t.Errorf("%s read the global-only source: %d lists, %d reads", use, lists, reads)
				}
			}

			// A write must keep settings valid in every scope: the global
			// settings alone, and with the project in view. Only scopes list
			// every kind; the write itself reads a runtime.
			layered, global := newMarker("layered"), newMarker("global")
			decorated := gated.Build(layered, global).(app.ReapOnSubmit)
			agent := contract.Agent{Name: "probe", Runtime: "claude-code"}
			if _, err := decorated.Client.CreateAgent(ctx, agent, false, nil); err != nil {
				t.Fatal(err)
			}
			if global.lists[definition.KindAgent] == 0 {
				t.Error("the global write scope did not check the global-only source")
			}
			if got := layered.lists[definition.KindAgent] > 0; got != tc.project {
				t.Errorf("the project write scope checks the layered source = %v, want %v", got, tc.project)
			}
		})
	}
}

// gatedOf is the client wire built, as the gate it is, to build clients on
// sources of the test's own.
func gatedOf(t *testing.T, client contract.Client) *app.Gated {
	t.Helper()
	gated, ok := client.(*app.Gated)
	if !ok {
		t.Fatalf("the client is a %T, not the gate", client)
	}
	return gated
}

// The built client starts the one background reaper every build shares,
// over the run store, the supervisor's processes and the workspaces.
//
// Contract test: the composition's reaper over the run store on the real
// filesystem, and the kernel's flock on a run's owner.lock.
func TestBuiltClientSharesTheBackgroundReaper(t *testing.T) {
	t.Parallel()
	home := tempDir(t)
	config := cli.Config{Home: home}
	client, background, err := inProcess(config).wire(config)
	if err != nil {
		t.Fatal(err)
	}
	gated := gatedOf(t, client)
	for _, build := range []int{1, 2} {
		decorated, ok := gated.Build(newMarker("layered"), newMarker("global")).(app.ReapOnSubmit)
		if !ok || decorated.Background != background {
			t.Fatalf("build %d does not start the shared reaper: %+v", build, decorated)
		}
	}
	if _, ok := background.Reaper.(*app.Reaper); !ok {
		t.Fatalf("the background reaper runs a %T", background.Reaper)
	}
}

// errorsOf lists the step failures a recorded reap says, as read back from
// the run's events.
func errorsOf(reaped map[string]any) []string {
	var failures []string
	list, _ := reaped["errors"].([]any)
	for _, item := range list {
		text, _ := item.(string)
		failures = append(failures, text)
	}
	return failures
}

// Submitting a call on the built client reaps the runs a killed process
// abandoned: here one that recorded a checkout and whose owner is gone.
//
// Contract test: the composition's reaper over the run store on the real
// filesystem, and the kernel's flock on a run's owner.lock.
func TestBuiltClientReapsAbandonedRunsWhenACallIsSubmitted(t *testing.T) {
	t.Parallel()
	home := tempDir(t)
	config := cli.Config{Home: home}
	composed := inProcess(config)
	client, background, err := composed.wire(config)
	if err != nil {
		t.Fatal(err)
	}
	gated := gatedOf(t, client)
	// An unfinished run nobody holds the owner lock of.
	dir := filepath.Join(home, "runs", "old")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		t.Fatal(err)
	}
	record := domain.Record{
		Schema: domain.RecordSchema, ID: "old", Process: "p", CreatedAt: time.Now(),
		Effects: &domain.Effects{
			Checkout: &domain.Checkout{Repository: "/repo", Dir: filepath.Join(tempDir(t), "workspace")},
			Process:  &domain.Process{Ref: "not-a-reference"},
		},
	}
	data, _ := json.Marshal(record)
	if err := os.WriteFile(filepath.Join(dir, "record.json"), data, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "owner.lock"), nil, 0o600); err != nil {
		t.Fatal(err)
	}

	built := gated.Build(newMarker("layered"), newMarker("global"))
	id, err := built.Submit(context.Background(), contract.CallRequest{Process: "p", Cwd: home})
	if err != nil {
		t.Fatal(err)
	}
	background.Wait()

	store := fsruns.Store{Dir: filepath.Join(home, "runs")}
	got, state, err := store.Get(context.Background(), "old")
	if err != nil || state != domain.StateFinished || got.Result == nil || got.Result.Status != domain.Lost {
		t.Fatalf("old run: %+v, %s, %v", got.Result, state, err)
	}
	// Its effects were handed to the supervisor's processes and to the
	// composition's workspaces, which refuse what they did not make; the
	// reap said so.
	events, _, err := store.Events(context.Background(), "old", 0)
	if err != nil {
		t.Fatal(err)
	}
	var reaped map[string]any
	for _, event := range events {
		if event.Kind == "EFFECTS_REAPED" {
			reaped = event.Data
		}
	}
	process, _ := reaped["process"].(map[string]any)
	checkout, _ := reaped["checkout"].(map[string]any)
	if process["outcome"] != "left" || checkout["removed"] != false || !strings.Contains(fmt.Sprint(reaped["errors"]), "is not a checkout Agister made") {
		t.Fatalf("reap of the old run recorded %v", reaped)
	}
	// The supervisor's processes understand the references they made: this
	// one they did not, and say so as ParseRef does.
	_, _, parseErr := supervisor.ParseRef("not-a-reference")
	if parseErr == nil {
		t.Fatal("the supervisor understands the reference the test means it to refuse")
	}
	if want := fmt.Sprintf("process %q: %v", "not-a-reference", parseErr); !slices.Contains(errorsOf(reaped), want) {
		t.Fatalf("reap of the old run recorded errors %q, want %q among them", errorsOf(reaped), want)
	}
	// The call that triggered it is its own run, and finishes on its own.
	<-composed.hosted.Done(id)
}

// The built reaper asks the run store which checkouts runs some process
// still owns use: an abandoned run's checkout that such a run also uses is
// left in place, not discarded from under it.
//
// Contract test: the composition's reaper over the run store on the real
// filesystem, and the kernel's flock on a run's owner.lock.
func TestBuiltReaperLeavesACheckoutARunningRunUses(t *testing.T) {
	t.Parallel()
	home := tempDir(t)
	config := cli.Config{Home: home}
	_, background, err := inProcess(config).wire(config)
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	store := fsruns.Store{Dir: filepath.Join(home, "runs")}
	shared := &domain.Checkout{Repository: "/repo", Dir: filepath.Join(tempDir(t), "workspace")}
	// An unfinished run this test owns, as a running process would.
	owned, err := store.Create(ctx, domain.Record{
		Schema: domain.RecordSchema, ID: "running", Process: "p", CreatedAt: time.Now(),
		Effects: &domain.Effects{Checkout: shared},
	})
	if err != nil {
		t.Fatal(err)
	}
	defer owned.Finish(domain.Record{Schema: domain.RecordSchema, ID: "running", Process: "p", CreatedAt: time.Now(), FinishedAt: new(time.Time)})
	// An unfinished run nobody owns, over the same checkout.
	dir := filepath.Join(home, "runs", "old")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		t.Fatal(err)
	}
	data, _ := json.Marshal(domain.Record{
		Schema: domain.RecordSchema, ID: "old", Process: "p", CreatedAt: time.Now(),
		Effects: &domain.Effects{Checkout: shared},
	})
	if err := os.WriteFile(filepath.Join(dir, "record.json"), data, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "owner.lock"), nil, 0o600); err != nil {
		t.Fatal(err)
	}

	background.Start(ctx)
	background.Wait()

	events, _, err := store.Events(ctx, "old", 0)
	if err != nil {
		t.Fatal(err)
	}
	var reaped map[string]any
	for _, event := range events {
		if event.Kind == "EFFECTS_REAPED" {
			reaped = event.Data
		}
	}
	checkout, _ := reaped["checkout"].(map[string]any)
	if checkout["removed"] != false || checkout["skipped"] != "a running run uses it" {
		t.Fatalf("reap of the old run recorded %v", reaped)
	}
}

// A reap that fails is logged: nobody waits for it, and no run record says
// so. Here the run store cannot be listed.
//
// Contract test: the composition's reaper over the run store on the real
// filesystem, and the kernel's flock on a run's owner.lock.
func TestBuiltReaperLogsAFailedReap(t *testing.T) {
	t.Parallel()
	home := tempDir(t)
	if err := os.WriteFile(filepath.Join(home, "runs"), nil, 0o600); err != nil {
		t.Fatal(err)
	}
	config := cli.Config{Home: home}
	_, background, err := inProcess(config).wire(config)
	if err != nil {
		t.Fatal(err)
	}
	background.Start(context.Background())
	background.Wait()

	data, err := os.ReadFile(filepath.Join(home, "logs", "agister.jsonl"))
	if err != nil {
		t.Fatal(err)
	}
	var logged []map[string]any
	for _, line := range strings.Split(strings.TrimSpace(string(data)), "\n") {
		var entry map[string]any
		if err := json.Unmarshal([]byte(line), &entry); err != nil {
			t.Fatalf("log line %q: %v", line, err)
		}
		if entry["msg"] == "reaping abandoned runs failed" {
			logged = append(logged, entry)
		}
	}
	if len(logged) != 1 {
		t.Fatalf("reap failures logged = %d in:\n%s", len(logged), data)
	}
	message, _ := logged[0]["error"].(string)
	if logged[0]["level"] != "ERROR" || !strings.Contains(message, "listing abandoned runs") || !strings.Contains(message, "not a directory") {
		t.Fatalf("logged = %v", logged[0])
	}
}

// The adapters the composition builds share its worktree coordinator:
// while a caller's checkout holds a repository, the verifier's copy and the
// reaper's discard there wait for it. What waits is decided by the held
// command, never by timing.
//
// Contract test: the composition's worktree coordinator over real git and
// its lock files.
func TestBuiltWorkspaceAdaptersShareTheWorktreeCoordinator(t *testing.T) {
	t.Parallel()
	repo := repository(t, "x")
	const runs, waits = "runs", "waits"
	// Until released, every worktree command reports that it runs, and
	// stays there under its repository's lock, or that it waits for it.
	events, released := make(chan string, 3), make(chan struct{})
	worktrees := git.NewWorktrees(tempDir(t))
	worktrees.Git = func(ctx context.Context, dir string, lock *os.File, args ...string) (string, error) {
		select {
		case <-released:
		default:
			events <- runs
			<-released
		}
		command := exec.CommandContext(ctx, "git", args...)
		command.Dir, command.ExtraFiles = dir, []*os.File{lock}
		out, err := command.CombinedOutput()
		if err != nil {
			return "", fmt.Errorf("git %v: %s", args, out)
		}
		return string(out), nil
	}
	worktrees.Waits = func() {
		select {
		case <-released:
		default:
			events <- waits
		}
	}
	adapters := gitBacked(worktrees)

	ctx := context.Background()
	var workers sync.WaitGroup
	start := func(do func() error) <-chan error {
		done := make(chan error, 1)
		workers.Add(1)
		go func() {
			defer workers.Done()
			done <- do()
		}()
		return done
	}
	// reports fails the test unless worker's worktree command reports want
	// next; a worker that ends first did not meet the held checkout.
	reports := func(worker <-chan error, want, what string) {
		t.Helper()
		select {
		case got := <-events:
			if got != want {
				t.Fatalf("%s %s, not %s", what, got, want)
			}
		case err := <-worker:
			t.Fatalf("%s ended without meeting the held checkout: %v", what, err)
		}
	}
	var release func() error
	copied := adapters.copies.Place(fmt.Sprintf("wiring-%d", os.Getpid()))
	// Whatever point the test reached: the held command is let through and
	// every worker joined, then the checkout and the copy are removed.
	pass := sync.OnceFunc(func() { close(released) })
	t.Cleanup(func() {
		pass()
		workers.Wait()
		if release != nil {
			if err := release(); err != nil {
				t.Errorf("releasing the checkout: %v", err)
			}
		}
		if err := adapters.discarder.Discard(ctx, repo, copied); err != nil {
			t.Errorf("discarding the copy: %v", err)
		}
	})

	checkout := start(func() (err error) {
		_, release, err = adapters.calls.Checkout(ctx, repo, "main")
		return err
	})
	reports(checkout, runs, "the caller's checkout")
	copying := start(func() error { return adapters.copies.Copy(ctx, repo, copied, "main", nil) })
	reports(copying, waits, "the verifier's copy")
	// A checkout already gone is discarded as success, once it had its turn.
	gone := adapters.copies.Place(fmt.Sprintf("wiring-%d-gone", os.Getpid()))
	discarding := start(func() error { return adapters.discarder.Discard(ctx, repo, gone) })
	reports(discarding, waits, "the reaper's discard")

	pass()
	for what, worker := range map[string]<-chan error{
		"the caller's checkout": checkout, "the verifier's copy": copying, "the reaper's discard": discarding,
	} {
		if err := <-worker; err != nil {
			t.Errorf("%s: %v", what, err)
		}
	}
}

// The process's worktree coordinator keeps its lock files under the home:
// a checkout and its release leave one there, empty.
//
// Contract test: the composition's worktree coordinator over real git and
// its lock files.
func TestTheProcessWorktreeCoordinatorLocksUnderTheHome(t *testing.T) {
	t.Parallel()
	home, repo := tempDir(t), repository(t, "x")
	adapters := process(cli.Config{Home: home}, fsruns.NewAppends()).git
	_, release, err := adapters.calls.Checkout(context.Background(), repo, "main")
	if err != nil {
		t.Fatal(err)
	}
	if err := release(); err != nil {
		t.Fatal(err)
	}
	locks := filepath.Join(home, "locks", "worktrees")
	entries, err := os.ReadDir(locks)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 {
		t.Fatalf("lock files under %s = %v", locks, entries)
	}
	if info, err := entries[0].Info(); err != nil || !info.Mode().IsRegular() || info.Size() != 0 {
		t.Fatalf("lock file %s: %v, %v", entries[0].Name(), info, err)
	}
}

// started is a starter that keeps the command of each process it is asked
// to start, with its arguments, and starts it in process.
type started struct {
	runtimetest.InProcess

	mu       sync.Mutex
	commands [][]string
}

func (s *started) Start(command supervisor.Command) (supervisor.Process, error) {
	s.mu.Lock()
	s.commands = append(s.commands, append([]string{command.Name}, command.Args...))
	s.mu.Unlock()
	return s.InProcess.Start(command)
}

// The composition the tests run in process waits on no wall clock: a wait
// of zero on its timer, or on its poll, has passed at the time its clock
// that never moves is set to, which the wall clock does not tell.
func TestTheInProcessCompositionWaitsOnAClockThatNeverMoves(t *testing.T) {
	t.Parallel()
	c := inProcess(cli.Config{Home: tempDir(t)})
	for name, timer := range map[string]timer{"its turns and commands": c.timer, "its observing": c.poll} {
		fired, stop := timer(0)
		if at := <-fired; !at.Equal(stillAt) {
			t.Errorf("%s wait on a clock that tells %v, want %v", name, at, stillAt)
		}
		stop()
	}
}

// The process's starter is the operating system's, and a composition
// starts its runtimes through the one it holds: a call over a starter of
// the test's asks it for the agent's runtime, its version and its turn.
func TestTheCompositionStartsItsRuntimesThroughItsStarter(t *testing.T) {
	t.Parallel()
	home, repo := setup(t, "approve")
	config := cli.Config{Home: home, Cwd: repo}
	composed := process(config, fsruns.NewAppends())
	if composed.starter != (supervisor.Exec{}) {
		t.Fatalf("the process starts its runtimes with a %T", composed.starter)
	}
	starter := &started{}
	composed.starter = starter
	composed.git = fakeGit(gitOf(t, home))
	// The call waits on a clock that never moves, not on the process's.
	composed.timer = clocktest.NewClock(stillAt).Timer
	client, _, err := composed.wire(config)
	if err != nil {
		t.Fatal(err)
	}
	id, err := client.Submit(context.Background(), contract.CallRequest{
		Process: "adversarial_review", Params: map[string]string{"base": "main"}, Timeout: "1m", Cwd: repo,
	})
	if err != nil {
		t.Fatal(err)
	}
	<-composed.hosted.Done(id)
	if record := lastRun(t, home).record; record["result"].(map[string]any)["status"] != "completed" {
		t.Fatalf("record = %v", record)
	}
	starter.mu.Lock()
	defer starter.mu.Unlock()
	var version, turn bool
	for _, command := range starter.commands {
		if command[0] != "claude" {
			t.Fatalf("started %q, not the agent's runtime", command)
		}
		if len(command) == 2 && command[1] == "--version" {
			version = true
		} else {
			turn = true
		}
	}
	if !version || !turn {
		t.Fatalf("started %q, want the runtime's version and its turn", starter.commands)
	}
}

// The process's commands start through the operating system, which also
// reaps what its runs left, over the run store under its home; and a
// composition starts its commands through the starter it holds: a call
// over a starter of the test's asks it for bash, once for the checkout's
// setup and once for the verification, and for no runtime.
func TestTheCompositionStartsItsCommandsThroughItsStarter(t *testing.T) {
	t.Parallel()
	home, repo := setup(t, "approve")
	write(t, filepath.Join(home, "workspace.yaml"), "schema: agister.workspace/v1alpha1\nsetup:\n  command: echo prepared\n  timeout: 20s\n")
	shipped := read(t, filepath.Join(home, "processes", "adversarial_review.yaml"))
	write(t, filepath.Join(home, "processes", "verified.yaml"), strings.Replace(shipped, "name: adversarial_review", "name: verified", 1)+`
verify:
  command: test -f a.txt
  timeout: 20s
  max_attempts: 1
  instruction: The verification command failed.
`)
	config := cli.Config{Home: home, Cwd: repo}
	appends := fsruns.NewAppends()
	composed := process(config, appends)
	if composed.commands != (supervisor.Exec{}) || composed.processes != (supervisor.Processes{}) {
		t.Fatalf("the process starts its commands with a %T and reaps with a %T", composed.commands, composed.processes)
	}
	// Its run store signals through the appends the process was given.
	if want := (fsruns.Store{Dir: filepath.Join(home, "runs"), Appends: appends}); composed.runs != want {
		t.Fatalf("the process's run store = %+v, want %+v", composed.runs, want)
	}
	starter := &started{}
	composed.starter, composed.commands = runtimetest.InProcess{}, starter
	composed.git = fakeGit(gitOf(t, home))
	// The call waits on a clock that never moves, not on the process's.
	composed.timer = clocktest.NewClock(stillAt).Timer
	client, _, err := composed.wire(config)
	if err != nil {
		t.Fatal(err)
	}
	id, err := client.Submit(context.Background(), contract.CallRequest{
		Process: "verified", Params: map[string]string{"base": "main"}, Timeout: "1m", Cwd: repo,
	})
	if err != nil {
		t.Fatal(err)
	}
	<-composed.hosted.Done(id)
	if record := lastRun(t, home).record; record["result"].(map[string]any)["status"] != "completed" {
		t.Fatalf("record = %v", record)
	}
	starter.mu.Lock()
	defer starter.mu.Unlock()
	if want := [][]string{{"bash", "-c", "echo prepared"}, {"bash", "-c", "test -f a.txt"}}; !reflect.DeepEqual(starter.commands, want) {
		t.Fatalf("started %q, want %q", starter.commands, want)
	}
}
