package git

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/app"
)

// What runs when is decided by the gate, never by timing: the deadline
// only guards against a hang.
const hangGuard = 10 * time.Second

func emptyRepository(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	for _, args := range [][]string{
		{"init", "--quiet", "--initial-branch=main"},
		{"-c", "user.email=t@example.com", "-c", "user.name=T", "-c", "maintenance.auto=false",
			"commit", "--quiet", "--allow-empty", "-m", "base"},
	} {
		command := exec.Command("git", args...)
		command.Dir = dir
		if out, err := command.CombinedOutput(); err != nil {
			t.Fatalf("git %v: %v\n%s", args, err, out)
		}
	}
	return dir
}

// event is what a worktree command tells the gate: that it found the lock
// held and waits, or that it has the lock and runs in dir.
type event struct {
	waited bool
	dir    string
}

// gate is the worktree runner of a test's own Worktrees: every worktree
// command reports the directory it runs in, and one in the held directory
// (any, when held is empty) then stays under its lock until pass lets it
// run. Workers, checkouts and copies started through the gate are its to
// end: see gated.
type gate struct {
	workspaces Workspaces
	held       string
	events     chan event
	proceed    chan struct{}
	// open, once closed, lets every command through unreported.
	open chan struct{}

	workers   sync.WaitGroup
	checkouts []*checkout
	copies    [][2]string
}

// checkout is a checkout's release, from the moment it succeeds until it
// is run.
type checkout struct {
	mu      sync.Mutex
	release func() error
}

func (c *checkout) made(release func() error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.release = release
}

// run releases the checkout, once: nothing is left to do for one that
// failed or is released already.
func (c *checkout) run() error {
	c.mu.Lock()
	release := c.release
	c.release = nil
	c.mu.Unlock()
	if release == nil {
		return nil
	}
	return release()
}

// gated makes Workspaces whose worktree commands pass through a gate. Its
// cleanup, which runs before the cleanup of every repository made before
// it, opens the gate and joins the workers, and only then releases the
// checkouts not released yet and discards the copies: whatever a failed
// test left running or on disk.
func gated(t *testing.T, held string) *gate {
	t.Helper()
	g := &gate{held: held, events: make(chan event, 16), proceed: make(chan struct{}), open: make(chan struct{})}
	g.workspaces = NewWorkspaces(&Worktrees{
		Git: func(ctx context.Context, dir string, args ...string) (string, error) {
			if g.report(event{dir: dir}) && (g.held == "" || dir == g.held) {
				select {
				case <-g.proceed:
				case <-g.open:
				}
			}
			return run(ctx, dir, args...)
		},
		Waits: func() { g.report(event{waited: true}) },
	})
	t.Cleanup(func() {
		close(g.open)
		joined := make(chan struct{})
		go func() { g.workers.Wait(); close(joined) }()
		select {
		case <-joined:
		case <-time.After(hangGuard):
			t.Error("workers still run with the gate open: their checkouts are not released")
			return
		}
		for _, made := range g.checkouts {
			if err := made.run(); err != nil {
				t.Errorf("releasing a checkout: %v", err)
			}
		}
		for _, copy := range g.copies {
			if err := g.workspaces.Discard(context.Background(), copy[0], copy[1]); err != nil {
				t.Errorf("discarding a copy: %v", err)
			}
		}
	})
	return g
}

// report gives the test an event, unless the gate is open.
func (g *gate) report(e event) bool {
	select {
	case <-g.open:
		return false
	default:
	}
	select {
	case g.events <- e:
		return true
	case <-g.open:
		return false
	}
}

// start runs do aside and gives the channel its error arrives on.
func (g *gate) start(do func() error) <-chan error {
	done := make(chan error, 1)
	g.workers.Add(1)
	go func() {
		defer g.workers.Done()
		done <- do()
	}()
	return done
}

// checkout starts a checkout of main at path aside. From the moment it
// succeeds its release is the gate's to run at cleanup, unless the test
// runs the release it is given first.
func (g *gate) checkout(ctx context.Context, path string) (<-chan error, func() error) {
	made := &checkout{}
	g.checkouts = append(g.checkouts, made)
	return g.start(func() error {
		_, release, err := g.workspaces.Checkout(ctx, path, "main")
		if err == nil {
			made.made(release)
		}
		return err
	}), made.run
}

var places atomic.Int64

// place names the directory of a copy in repository, which the gate
// discards at cleanup.
func (g *gate) place(repository string) string {
	dir := g.workspaces.Place(fmt.Sprintf("serial-%d-%d", os.Getpid(), places.Add(1)))
	g.copies = append(g.copies, [2]string{repository, dir})
	return dir
}

// next is the next event of the gate. A worker (up to three are watched)
// that ends while the event is awaited fails the test at once, with its
// error.
func (g *gate) next(t *testing.T, workers ...<-chan error) event {
	t.Helper()
	var ended [3]<-chan error
	copy(ended[:], workers)
	var err error
	select {
	case e := <-g.events:
		return e
	case err = <-ended[0]:
	case err = <-ended[1]:
	case err = <-ended[2]:
	case <-time.After(hangGuard):
		t.Fatal("no worktree command reached the lock")
	}
	t.Fatalf("a worker ended where its worktree command was awaited: %v", err)
	return event{}
}

// enters fails the test unless the next command has the lock and runs.
func (g *gate) enters(t *testing.T, workers ...<-chan error) {
	t.Helper()
	if g.next(t, workers...).waited {
		t.Fatal("a worktree command waited for a lock that should be free")
	}
}

// queues fails the test unless a command started while another holds the
// lock waits for it: it must report waiting, not enter.
func (g *gate) queues(t *testing.T, workers ...<-chan error) {
	t.Helper()
	if e := g.next(t, workers...); !e.waited {
		t.Fatalf("a worktree command in %s ran while another held the lock", e.dir)
	}
}

// pass lets the command held at the gate run.
func (g *gate) pass(t *testing.T) {
	t.Helper()
	select {
	case g.proceed <- struct{}{}:
	case <-time.After(hangGuard):
		t.Fatal("no worktree command is held at the gate")
	}
}

// result is the error worker ended with.
func result(t *testing.T, worker <-chan error) error {
	t.Helper()
	select {
	case err := <-worker:
		return err
	case <-time.After(hangGuard):
		t.Fatal("a worker did not end")
		return nil
	}
}

func done(t *testing.T, worker <-chan error) {
	t.Helper()
	if err := result(t, worker); err != nil {
		t.Fatal(err)
	}
}

func TestWorktreeCommandsOfOneRepositoryNeverOverlap(t *testing.T) {
	repo := emptyRepository(t)
	g := gated(t, "")
	ctx := context.Background()

	// first is held under the lock; second, started then, has to wait for
	// it, and runs only once first is done.
	inTurn := func(first, second func() <-chan error) {
		t.Helper()
		one := first()
		g.enters(t, one)
		two := second()
		g.queues(t, one, two)
		g.pass(t)
		done(t, one)
		g.enters(t, two)
		g.pass(t)
		done(t, two)
	}

	var release func() error
	checkout := func() (worker <-chan error) {
		worker, release = g.checkout(ctx, repo)
		return worker
	}
	dir := g.place(repo)
	copy := func() <-chan error {
		return g.start(func() error { return g.workspaces.Copy(ctx, repo, dir, "main", nil) })
	}
	discard := func() <-chan error {
		return g.start(func() error { return g.workspaces.Discard(ctx, repo, dir) })
	}
	released := func() <-chan error { return g.start(release) }

	inTurn(checkout, copy)
	inTurn(released, discard)
	inTurn(copy, checkout)
	inTurn(discard, released)
}

func TestDifferentRepositoriesDoNotWaitOnEachOther(t *testing.T) {
	busy, other := emptyRepository(t), emptyRepository(t)
	g := gated(t, "")

	// Both stay at the gate, each under its repository's lock, until both
	// are seen there: neither worker can end while an event is awaited.
	held, _ := g.checkout(context.Background(), busy)
	g.enters(t, held)

	free, _ := g.checkout(context.Background(), other)
	if g.next(t, held, free).waited {
		t.Fatal("a checkout in another repository waited for the busy one")
	}

	g.pass(t)
	g.pass(t)
	done(t, held)
	done(t, free)
}

func TestTwoPathsOfOneRepositoryShareTheLock(t *testing.T) {
	repo := emptyRepository(t)
	linked := filepath.Join(t.TempDir(), "linked")
	if _, err := run(context.Background(), repo, "worktree", "add", "--detach", "--quiet", linked, "main"); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(t.TempDir(), "link")
	if err := os.Symlink(repo, link); err != nil {
		t.Fatal(err)
	}
	// Between real paths, so each ".." is the parent the kernel sees.
	cwd, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	relative, err := filepath.Rel(resolved(cwd), resolved(repo))
	if err != nil {
		t.Fatal(err)
	}
	absolute, err := filepath.Abs(repo)
	if err != nil {
		t.Fatal(err)
	}
	g := gated(t, absolute)

	held, _ := g.checkout(context.Background(), absolute)
	g.enters(t, held)
	workers := []<-chan error{held}
	for _, path := range []string{relative, linked, link} {
		waiting, _ := g.checkout(context.Background(), path)
		g.queues(t, held, waiting)
		workers = append(workers, waiting)
	}

	g.pass(t)
	for _, worker := range workers {
		done(t, worker)
	}
}

func TestACancelledContextStopsTheWait(t *testing.T) {
	repo := emptyRepository(t)
	g := gated(t, "")

	held, _ := g.checkout(context.Background(), repo)
	g.enters(t, held)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	waiting, _ := g.checkout(ctx, repo)
	g.queues(t, held, waiting)
	dir := g.place(repo)
	copying := g.start(func() error { return g.workspaces.Copy(ctx, repo, dir, "main", nil) })
	g.queues(t, held, waiting, copying)
	cancel()
	if err := result(t, waiting); !errors.Is(err, context.Canceled) {
		t.Fatalf("a checkout cancelled while it waited: %v", err)
	}
	// The copy returns while the lock is still held: it does not wait a
	// second time, without cancellation, to remove what it never added.
	if err := result(t, copying); !errors.Is(err, context.Canceled) || !errors.Is(err, app.ErrCopyNotStarted) {
		t.Fatalf("a copy cancelled while it waited: %v", err)
	}
	if len(g.events) != 0 {
		t.Fatal("a cancelled checkout or copy reached the lock again")
	}
	if _, err := os.Stat(filepath.Dir(dir)); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("the cancelled copy left its directory: %v", err)
	}

	g.pass(t)
	done(t, held)
}

func TestWorkspacesWithoutWorktreesMakeNoWorktreeChange(t *testing.T) {
	repo := emptyRepository(t)
	dir, release, err := Workspaces{}.Checkout(context.Background(), repo, "main")
	if err == nil {
		release()
		t.Fatalf("a checkout outside the process's Worktrees was made at %s", dir)
	}
}
