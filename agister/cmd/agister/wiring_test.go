package main

import (
	"bytes"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"reflect"
	"slices"
	"strings"
	"sync"
	"syscall"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/examples"
	"github.com/igor1309/ai-labs/agister/internal/adapters/fsruns"
	"github.com/igor1309/ai-labs/agister/internal/adapters/git"
	"github.com/igor1309/ai-labs/agister/internal/adapters/logging"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/runtimetest"
	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/cli"
	"github.com/igor1309/ai-labs/agister/internal/contract"
	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
	domain "github.com/igor1309/ai-labs/agister/internal/domain/run"
	"github.com/igor1309/ai-labs/gokit/clocktest"
	"github.com/igor1309/ai-labs/gokit/supervisor"
	"github.com/igor1309/ai-labs/gokit/supervisor/supervisortest"
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
		Source: definition.Source{Kind: kind, Name: name, Path: m.name + "/" + matches[0], Layer: definition.LayerHome, SHA256: hex.EncodeToString(sum[:])},
		Bytes:  data,
	}, err
}

// ReadListed reads as Read does: home lists no folders.
func (m *marker) ReadListed(ctx context.Context, kind definition.Kind, name string) (definition.Document, error) {
	return m.Read(ctx, kind, name)
}

// Layers are home alone, which the marker stands for.
func (m *marker) Layers(context.Context) []definition.LayerDir {
	return []definition.LayerDir{{Layer: definition.LayerHome, Dir: m.name}}
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

// gatedOf is the client wire built, as the gate it decorates with the log,
// to build clients on sources of the test's own.
func gatedOf(t *testing.T, client contract.Client) *app.Gated {
	t.Helper()
	logged, ok := client.(logging.Client)
	if !ok {
		t.Fatalf("the client is a %T, not the gate logged", client)
	}
	gated, ok := logged.Inner.(*app.Gated)
	if !ok {
		t.Fatalf("the logged client is a %T, not the gate", logged.Inner)
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

// oldCheckout is a checkout of main in repo as runs made them before
// ADR-025, at <temp>/agister-checkout-<id>/workspace-<id>, left on record
// for the reap to remove; whatever the test leaves of it is removed at its
// end.
func oldCheckout(t *testing.T, repo string) string {
	t.Helper()
	parent, err := os.MkdirTemp("", "agister-checkout-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(parent) })
	dir := filepath.Join(parent, "workspace-"+strings.TrimPrefix(filepath.Base(parent), "agister-checkout-"))
	gitCmd(t, repo, "worktree", "add", "--detach", "--quiet", dir, "main")
	return dir
}

// The reaper's discard the composition builds takes its turn in the
// process's worktree coordinator: while one removal of an old checkout
// holds a repository, the others there wait for it (ADR-025 rule 9). What
// waits is decided by the held command, never by timing.
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
	discard := func(dir string) <-chan error {
		return start(func() error { return adapters.discarder.Discard(ctx, repo, dir) })
	}
	// reports fails the test unless worker's worktree command reports want
	// next; a worker that ends first did not meet the held removal.
	reports := func(worker <-chan error, want, what string) {
		t.Helper()
		select {
		case got := <-events:
			if got != want {
				t.Fatalf("%s %s, not %s", what, got, want)
			}
		case err := <-worker:
			t.Fatalf("%s ended without meeting the held removal: %v", what, err)
		}
	}
	// Whatever point the test reached: the held command is let through and
	// every worker joined.
	pass := sync.OnceFunc(func() { close(released) })
	t.Cleanup(func() {
		pass()
		workers.Wait()
	})

	held := discard(oldCheckout(t, repo))
	reports(held, runs, "the held discard")
	waiting := discard(oldCheckout(t, repo))
	reports(waiting, waits, "the next discard")
	// A checkout already gone is discarded as success, once it had its turn.
	name := fmt.Sprintf("wiring-%d-gone", os.Getpid())
	gone := discard(filepath.Join(os.TempDir(), "agister-checkout-"+name, "workspace-"+name))
	reports(gone, waits, "the discard of one gone")

	pass()
	for what, worker := range map[string]<-chan error{
		"the held discard": held, "the next discard": waiting, "the discard of one gone": gone,
	} {
		if err := <-worker; err != nil {
			t.Errorf("%s: %v", what, err)
		}
	}
	if list := gitCmd(t, repo, "worktree", "list"); strings.Count(list, "\n") != 0 {
		t.Fatalf("worktrees left:\n%s", list)
	}
}

// The process's worktree coordinator keeps its lock files under the home:
// the removal of an old checkout leaves one there, empty.
//
// Contract test: the composition's worktree coordinator over real git and
// its lock files.
func TestTheProcessWorktreeCoordinatorLocksUnderTheHome(t *testing.T) {
	t.Parallel()
	home, repo := tempDir(t), repository(t, "x")
	adapters := process(cli.Config{Home: home}, fsruns.NewAppends()).git
	if err := adapters.discarder.Discard(context.Background(), repo, oldCheckout(t, repo)); err != nil {
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

// The process tells the user's CODEX_HOME from the environment and home
// it runs in: $CODEX_HOME when it is set, else .codex in the user's home.
func TestTheProcessTellsTheUsersCodexHomeFromItsEnvironment(t *testing.T) {
	t.Parallel()
	for name, c := range map[string]struct{ env, want string }{
		"set":   {"/elsewhere/codex", "/elsewhere/codex"},
		"unset": {"", filepath.Join("/users/me", ".codex")},
	} {
		getenv := func(key string) string {
			if key == "CODEX_HOME" {
				return c.env
			}
			return "/wrong"
		}
		composed := processIn(cli.Config{Home: tempDir(t)}, fsruns.NewAppends(), getenv, func() (string, error) { return "/users/me", nil })
		if composed.codexHome == nil {
			t.Fatalf("%s: the process tells no CODEX_HOME", name)
		}
		if home, err := composed.codexHome(); err != nil || home != c.want {
			t.Errorf("%s: CODEX_HOME %q, %v, want %q", name, home, err, c.want)
		}
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
	for name, timer := range map[string]timer{"its turns and commands": c.timer, "its observing": c.poll, "its reaps' waits for readers": c.readers} {
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
	starter := &started{InProcess: runtimetest.InProcess{Groups: supervisortest.NewGroups()}}
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
// over a starter of the test's asks it for bash once, for the
// verification, and for no runtime. The workspace.yaml's setup, obsolete
// (ADR-025 rule 3), is never started.
func TestTheCompositionStartsItsCommandsThroughItsStarter(t *testing.T) {
	t.Parallel()
	home, repo := setup(t, "approve")
	write(t, filepath.Join(home, "workspace.yaml"), "schema: agister.workspace/v1alpha1\nsetup:\n  command: echo prepared\n  timeout: 20s\n")
	shipped := read(t, filepath.Join(home, "processes", "adversarial_review.yaml"))
	shipped = strings.Replace(shipped, "  revision: candidate_revision\n", "  revision: candidate_revision\n  clean: true\n", 1)
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
	groups := supervisortest.NewGroups()
	starter := &started{InProcess: runtimetest.InProcess{Groups: groups}}
	composed.starter, composed.commands = runtimetest.InProcess{Groups: groups}, starter
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
	if want := [][]string{{"bash", "-c", "test -f a.txt"}}; !reflect.DeepEqual(starter.commands, want) {
		t.Fatalf("started %q, want %q", starter.commands, want)
	}
}

// The process holds the caller's worktree for a call through the holder
// it composes (ADR-025): a call through the CLI completes, its turn in the
// worktree it was launched from, with the worktree on its record by the
// lock's canonical path, the review on record as a reader, the lock taken
// under the home, and no checkout made for it.
func TestTheCompositionLendsAnInPlaceCallTheCallersWorktree(t *testing.T) {
	t.Parallel()
	home, repo := setup(t, "approve")
	r := agister(t, home, repo, "run", "adversarial_review", "--param", "base=main", "--timeout", "1m")
	if r.code != cli.ExitCompleted {
		t.Fatalf("exit %d\n%s", r.code, r.stderr)
	}

	last := lastRun(t, home)
	record := last.record
	if result := record["result"].(map[string]any); result["status"] != "completed" || result["output"].(map[string]any)["verdict"] != "approve" {
		t.Fatalf("record = %v", record)
	}
	// The review changed nothing: the content its changes were captured
	// from is the revision's.
	head := revision(t, home, repo, "HEAD")
	content, err := gitOf(t, home).Identity(context.Background(), repo, head)
	if err != nil || content == "" {
		t.Fatalf("the worktree's content = %q, %v", content, err)
	}
	want := map[string]any{"dir": repo, "worktree": repo, "repository_identity": filepath.Join(repo, ".git"), "revision": head, "writer": false, "content": content}
	if !reflect.DeepEqual(record["in_place"], want) || record["workspace"] != repo || record["processes_ended"] != true {
		t.Fatalf("in place %v, want %v; workspace %v, processes ended %v", record["in_place"], want, record["workspace"], record["processes_ended"])
	}
	if effects, _ := record["effects"].(map[string]any); effects["checkout"] != nil || effects["copy"] != nil || effects["unreleased"] != nil {
		t.Fatalf("effects %v", effects)
	}
	noCheckoutLeft(t, home)
	if last.first["cwd"] != repo {
		t.Fatalf("the turn ran in %v, not %s", last.first["cwd"], repo)
	}
	if kinds := strings.Join(last.kinds(), " "); !strings.Contains(kinds, "WORKTREE_LOCKED WORKTREE_ADMITTED") {
		t.Fatalf("events %s", kinds)
	}
	// The lock is the home's, in the namespace of the holds.
	if locks, err := os.ReadDir(filepath.Join(home, "locks", "in-place")); err != nil || len(locks) != 1 {
		t.Fatalf("locks %v, %v", locks, err)
	}
}

// A hold a binary from before ADR-025 takes, still running, excludes the
// composition's writer (ADR-025 rule 4): with the worktree's lock file in
// locks/in-place held shared, as an older reader holds it, a writer call
// is refused before any turn, and nothing is changed in the worktree.
//
// Contract test: the kernel's flock on the composition's lock file, taken
// here as an older binary takes it.
func TestAnOlderBinarysHoldExcludesTheCompositionsWriter(t *testing.T) {
	t.Parallel()
	home, repo := setup(t, "approve")
	write(t, filepath.Join(repo, "b.md"), "Do it.\n")
	key, err := filepath.EvalSymlinks(repo)
	if err != nil {
		t.Fatal(err)
	}
	// The older binary's lock file: under the home's locks/in-place, named
	// by a digest of the worktree's canonical path.
	sum := sha256.Sum256([]byte(key))
	path := filepath.Join(home, "locks", "in-place", hex.EncodeToString(sum[:])+".lock")
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		t.Fatal(err)
	}
	held, err := os.OpenFile(path, os.O_RDWR|os.O_CREATE, 0o600)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { held.Close() })
	if err := syscall.Flock(int(held.Fd()), syscall.LOCK_SH|syscall.LOCK_NB); err != nil {
		t.Fatal(err)
	}

	r := agister(t, home, repo, "run", "implement", "--quiet", "--param", "candidate=HEAD", "--param", "brief=b.md")
	if want := "worktree " + repo + " is in use: another call holds it, and a writer holds it alone"; r.code != cli.ExitRefused || !strings.Contains(r.stderr, want) {
		t.Fatalf("run: %d, want %q\n%s%s", r.code, want, r.stdout, r.stderr)
	}
	if kinds := strings.Join(lastRun(t, home).kinds(), " "); strings.Contains(kinds, "WORKTREE_LOCKED") || strings.Contains(kinds, "PROCESS_STARTED") {
		t.Fatalf("events %s", kinds)
	}
}

// The composition gives the recoverer what it recovers on (ADR-024): a
// call through the composed client whose turn goes without an event for
// the policy's stale.no_event is resumed in the session that turn
// reported, with the policy's instruction and the evidence, and completes
// with the recovery on its record.
func TestTheCompositionRecoversAStaleTurn(t *testing.T) {
	t.Parallel()
	const noEvent = 7 * time.Second
	home, repo := setup(t, "approve")
	policy := filepath.Join(home, "policies", "read-only.yaml")
	write(t, policy, read(t, policy)+"\nstale: {no_event: 7s, recover: {max_resumes: 1, instruction: Go on.}}\n")
	config := cli.Config{Home: home, Cwd: repo}
	clock := clocktest.NewClock(stillAt)
	composed := on(config, clock.Timer)
	client, _, err := composed.wire(config)
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	// The question makes the fake's first turn hang; the recovery's message
	// does not carry it, so that turn ends.
	id, err := client.Submit(ctx, contract.CallRequest{Process: "ask", Params: map[string]string{"question": "SCENARIO:hang"}, Timeout: "1m", Cwd: repo})
	if err != nil {
		t.Fatal(err)
	}
	cleanupRun(t, client, composed.hosted, id)
	// The first turn's wait for an event starts four times: at the turn's
	// start, at its process's start, at the line the fake prints before it
	// hangs and at the event the adapter reports for that line. Then
	// nothing comes for the whole limit.
	for range 4 {
		clock.Started(noEvent)
	}
	clock.Advance(noEvent)
	<-composed.hosted.Done(id)

	record, stored, err := composed.runs.Get(ctx, id)
	if err != nil || stored != domain.StateFinished || record.Result == nil || record.Result.Status != domain.Completed {
		t.Fatalf("run %s: %s, %+v, %v", id, stored, record.Result, err)
	}
	const session = "00000000-0000-4000-8000-000000000000"
	digest := sha256.Sum256([]byte("Go on.\n\n## stale limit\n\nstale.no_event: the turn was interrupted after 7s without an event from the runtime."))
	if len(record.Recoveries) != 1 {
		t.Fatalf("recoveries = %+v", record.Recoveries)
	}
	got := record.Recoveries[0]
	if got.Number != 1 || got.Follows != 1 || got.Stale.Limit != domain.StaleNoEvent || got.Stale.After != noEvent ||
		got.MessageSHA256 != hex.EncodeToString(digest[:]) || got.Resumed != session || got.Session != session ||
		got.Outcome != domain.RecoveryCompleted || got.Error != nil {
		t.Fatalf("recovery = %+v", got)
	}
	// The recovery is timed on the clock the composition gave.
	if got.StartedAt.IsZero() || got.FinishedAt.Before(got.StartedAt) {
		t.Fatalf("recovery from %v to %v", got.StartedAt, got.FinishedAt)
	}
	// The runtime was started again, to resume the session.
	started, _ := json.Marshal(processesStarted(filepath.Join(home, "runs", id)))
	if !strings.Contains(string(started), `"--resume","`+session+`"`) {
		t.Fatalf("the processes started:\n%s", started)
	}
}

// The log keeps what no run's record holds and none of what a turn did: a
// warning reaches <home>/logs/agister.jsonl and a turn's record does not.
// With --debug both are on the terminal, the turn's under its run's ID.
//
// Contract test: the composition's diagnostics over the log on the real
// filesystem.
func TestDiagnosticsKeepTurnsOutOfTheLog(t *testing.T) {
	t.Parallel()
	ctx := app.WithCorrelation(context.Background(), "run_id", "run-1")
	for _, debug := range []bool{false, true} {
		home := tempDir(t)
		var terminal bytes.Buffer
		config := cli.Config{Home: home}
		if debug {
			config.Debug = &terminal
		}
		log, turns, err := diagnostics(config)
		if err != nil {
			t.Fatal(err)
		}
		log.WarnContext(ctx, "runtime.not_admitted", "error", "no home")
		turns.InfoContext(ctx, "turn.started")
		turns.WarnContext(ctx, "turn.finished", "status", "failed")

		kept := read(t, filepath.Join(home, "logs", "agister.jsonl"))
		if strings.Count(kept, "\n") != 1 || !strings.Contains(kept, `"msg":"runtime.not_admitted"`) || !strings.Contains(kept, `"run_id":"run-1"`) {
			t.Fatalf("debug %v: the log = %s", debug, kept)
		}
		shown := terminal.String()
		if !debug && shown != "" {
			t.Fatalf("on the terminal without --debug: %s", shown)
		}
		if debug && (strings.Count(shown, "\n") != 3 || !strings.Contains(shown, `"msg":"runtime.not_admitted"`) || !strings.Contains(shown, `"msg":"turn.started"`) ||
			!strings.Contains(shown, `"msg":"turn.finished","status":"failed","run_id":"run-1"`)) {
			t.Fatalf("on the terminal with --debug: %s", shown)
		}
	}
}

// A log that cannot be written, its path a directory, fails the setup of
// diagnostics and so every command, instead of losing each warning later
// in silence.
//
// Contract test: the composition's diagnostics over the log on the real
// filesystem.
func TestAnUnusableLogFailsAtSetup(t *testing.T) {
	t.Parallel()
	home := tempDir(t)
	path := filepath.Join(home, "logs", "agister.jsonl")
	if err := os.MkdirAll(path, 0o700); err != nil {
		t.Fatal(err)
	}
	config := cli.Config{Home: home}
	if _, _, err := diagnostics(config); err == nil || !strings.Contains(err.Error(), path) {
		t.Fatalf("diagnostics: %v", err)
	}
	if client, _, err := inProcess(config).wire(config); err == nil || client != nil || !strings.Contains(err.Error(), path) {
		t.Fatalf("wire: %v, %v", client, err)
	}
}

// The log as shipped rotates once it would pass 5 MB, not before, and
// keeps three old files, compressed: the oldest of three is dropped and no
// fourth is kept.
//
// Contract test: the composition's diagnostics over the log on the real
// filesystem.
func TestTheLogIsKeptWithinTheShippedCap(t *testing.T) {
	t.Parallel()
	home := tempDir(t)
	dir := filepath.Join(home, "logs")
	path := filepath.Join(dir, "agister.jsonl")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		t.Fatal(err)
	}
	// The log 1000 bytes short of its cap, and three old files.
	seed := strings.Repeat("x", 5<<20-1001) + "\n"
	if err := os.WriteFile(path, []byte(seed), 0o600); err != nil {
		t.Fatal(err)
	}
	for n := 1; n <= 3; n++ {
		var zipped bytes.Buffer
		writer := gzip.NewWriter(&zipped)
		fmt.Fprintf(writer, `{"old":%d}`+"\n", n)
		if err := writer.Close(); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(fmt.Sprintf("%s.%d.gz", path, n), zipped.Bytes(), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	log, _, err := diagnostics(cli.Config{Home: home})
	if err != nil {
		t.Fatal(err)
	}

	log.Warn("within the cap")
	if kept := read(t, path); !strings.HasPrefix(kept, seed) || !strings.Contains(kept[len(seed):], `"msg":"within the cap"`) {
		t.Fatalf("the log was rotated before its cap, %d bytes", len(kept))
	}
	log.Warn("past the cap", "padding", strings.Repeat("p", 1000))
	if kept := read(t, path); strings.Count(kept, "\n") != 1 || !strings.Contains(kept, `"msg":"past the cap"`) {
		t.Fatalf("the log after its cap, %d bytes: %.200s", len(kept), kept)
	}
	unzipped := func(n int) string {
		file, err := os.Open(fmt.Sprintf("%s.%d.gz", path, n))
		if err != nil {
			t.Fatal(err)
		}
		defer file.Close()
		reader, err := gzip.NewReader(file)
		if err != nil {
			t.Fatal(err)
		}
		defer reader.Close()
		text, err := io.ReadAll(reader)
		if err != nil {
			t.Fatal(err)
		}
		return string(text)
	}
	if newest := unzipped(1); !strings.HasPrefix(newest, seed) || !strings.Contains(newest[len(seed):], `"msg":"within the cap"`) {
		t.Fatalf("the newest old file, %d bytes, is not the log", len(newest))
	}
	if second, third := unzipped(2), unzipped(3); second != `{"old":1}`+"\n" || third != `{"old":2}`+"\n" {
		t.Fatalf("old files 2 and 3 = %q, %q", second, third)
	}
	want := []string{"agister.jsonl", "agister.jsonl.1.gz", "agister.jsonl.2.gz", "agister.jsonl.3.gz"}
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	var found []string
	for _, entry := range entries {
		found = append(found, entry.Name())
	}
	if !slices.Equal(found, want) {
		t.Fatalf("the log's folder = %v", found)
	}
}
