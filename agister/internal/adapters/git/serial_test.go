package git

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
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
		locks: t.TempDir(),
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

// turns records the worktree commands of coordinators that stand for
// processes of their own, each over its own Worktrees and one lock
// directory: every command logs that it entered git, says so on entered,
// stays there until release is closed, and logs that it left. Workers
// started through it are its to end: see newTurns.
type turns struct {
	locks   string
	release chan struct{}
	entered chan string
	freed   sync.Once

	workers sync.WaitGroup
	mu      sync.Mutex
	log     []string
	cancels []context.CancelFunc
}

// newTurns makes the turns of a test. Its cleanup, registered before any
// worker starts and run before its lock directory is removed, cancels the
// workers' contexts, closes release and joins the workers: whatever a
// failed test left running.
func newTurns(t *testing.T) *turns {
	t.Helper()
	l := &turns{locks: t.TempDir(), release: make(chan struct{}), entered: make(chan string, 4)}
	t.Cleanup(func() {
		l.mu.Lock()
		for _, cancel := range l.cancels {
			cancel()
		}
		l.mu.Unlock()
		l.free()
		joined := make(chan struct{})
		go func() { l.workers.Wait(); close(joined) }()
		select {
		case <-joined:
		case <-time.After(hangGuard):
			t.Error("workers still run with their contexts cancelled and release closed")
		}
	})
	return l
}

// free closes release, once.
func (l *turns) free() { l.freed.Do(func() { close(l.release) }) }

// start runs do aside, under a context of ctx that the cleanup cancels,
// and gives the channel its error arrives on.
func (l *turns) start(ctx context.Context, do func(ctx context.Context) error) <-chan error {
	ctx, cancel := context.WithCancel(ctx)
	l.mu.Lock()
	l.cancels = append(l.cancels, cancel)
	l.mu.Unlock()
	done := make(chan error, 1)
	l.workers.Add(1)
	go func() {
		defer l.workers.Done()
		done <- do(ctx)
	}()
	return done
}

func (l *turns) add(entry string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.log = append(l.log, entry)
}

func (l *turns) entries() []string {
	l.mu.Lock()
	defer l.mu.Unlock()
	return append([]string(nil), l.log...)
}

// coordinator is the Worktrees of the process named name: its waits get a
// value each time a command finds a lock held, and pauses counts the waits
// between attempts at a lock file, which are immediate.
type coordinator struct {
	*Worktrees
	waits  chan struct{}
	pauses atomic.Int64
}

func (l *turns) coordinator(name string) *coordinator {
	c := &coordinator{Worktrees: NewWorktrees(l.locks), waits: make(chan struct{}, 4)}
	c.Git = func(ctx context.Context, dir string, args ...string) (string, error) {
		l.add(name + " in")
		select {
		case l.entered <- name:
		case <-ctx.Done():
		}
		<-l.release
		l.add(name + " out")
		return "", nil
	}
	c.Waits = func() { c.waits <- struct{}{} }
	c.Pause = func(context.Context) { c.pauses.Add(1); runtime.Gosched() }
	return c
}

// command runs a worktree command of c in repository aside, as a worker
// of l.
func (l *turns) command(ctx context.Context, c *coordinator, repository string) <-chan error {
	return l.start(ctx, func(ctx context.Context) error {
		started, err := c.worktree(ctx, repository, "list")
		if err == nil && !started {
			err = errors.New("the command did not start")
		}
		return err
	})
}

// receive is the next value of ch, or fails the test after the hang guard.
func receive[T any](t *testing.T, ch <-chan T, what string) T {
	t.Helper()
	select {
	case v := <-ch:
		return v
	case <-time.After(hangGuard):
		t.Fatalf("%s did not happen", what)
		var zero T
		return zero
	}
}

func TestWorktreeCommandsOfTwoProcessesInOneRepositoryNeverOverlap(t *testing.T) {
	repo := emptyRepository(t)
	l := newTurns(t)
	one, two := l.coordinator("one"), l.coordinator("two")
	ctx := context.Background()

	ones, twos := l.command(ctx, one, repo), l.command(ctx, two, repo)
	// One holds the repository in git; the other has found its lock file
	// held: neither process's own lock stands in its way.
	first := receive(t, l.entered, "a command entering git")
	waiting := two
	if first == "two" {
		waiting = one
	}
	receive(t, waiting.waits, "the other command waiting")
	l.free()
	if err := receive(t, ones, "the first process's command ending"); err != nil {
		t.Fatal(err)
	}
	if err := receive(t, twos, "the second process's command ending"); err != nil {
		t.Fatal(err)
	}

	second := map[string]string{"one": "two", "two": "one"}[first]
	want := []string{first + " in", first + " out", second + " in", second + " out"}
	if got := l.entries(); fmt.Sprint(got) != fmt.Sprint(want) {
		t.Fatalf("commands ran as %v, not %v", got, want)
	}
	if waiting.pauses.Load() == 0 {
		t.Fatal("the waiting command never paused between attempts at the lock file")
	}
	if len(one.waits)+len(two.waits) != 0 {
		t.Fatal("a command was told to wait more than once")
	}
	entries, err := os.ReadDir(l.locks)
	if err != nil || len(entries) != 1 {
		t.Fatalf("lock files = %v, %v", entries, err)
	}
}

func TestTwoProcessesInDifferentRepositoriesDoNotShareALockFile(t *testing.T) {
	busy, other := emptyRepository(t), emptyRepository(t)
	l := newTurns(t)
	one, two := l.coordinator("one"), l.coordinator("two")
	ctx := context.Background()

	held := l.command(ctx, one, busy)
	receive(t, l.entered, "the held command entering git")
	free := l.command(ctx, two, other)
	if got := receive(t, l.entered, "the other repository's command entering git"); got != "two" {
		t.Fatalf("%s entered git", got)
	}
	l.free()
	for _, worker := range []<-chan error{held, free} {
		if err := receive(t, worker, "a command ending"); err != nil {
			t.Fatal(err)
		}
	}
	if len(two.waits) != 0 || two.pauses.Load() != 0 {
		t.Fatal("a command in another repository waited for the busy one")
	}
}

func TestACancelledContextStopsTheWaitForTheLockFile(t *testing.T) {
	repo := emptyRepository(t)
	l := newTurns(t)
	one, two := l.coordinator("one"), l.coordinator("two")

	held := l.command(context.Background(), one, repo)
	receive(t, l.entered, "the held command entering git")
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	var started bool
	waiting := l.start(ctx, func(ctx context.Context) error {
		var err error
		started, err = two.worktree(ctx, repo, "list")
		return err
	})
	receive(t, two.waits, "the second process's command waiting")
	cancel()
	if err := receive(t, waiting, "the cancelled command ending"); !errors.Is(err, context.Canceled) || started {
		t.Fatalf("a command cancelled while it waited: started %v, %v", started, err)
	}

	l.free()
	if err := receive(t, held, "the held command ending"); err != nil {
		t.Fatal(err)
	}
	if got, want := l.entries(), []string{"one in", "one out"}; fmt.Sprint(got) != fmt.Sprint(want) {
		t.Fatalf("commands ran as %v, not %v", got, want)
	}
}

// expiry is a cleanup context whose deadline passes when the test closes
// passed.
type expiry struct {
	context.Context
	passed chan struct{}
}

func (e *expiry) Done() <-chan struct{} { return e.passed }

func (e *expiry) Err() error {
	select {
	case <-e.passed:
		return context.DeadlineExceeded
	default:
		return nil
	}
}

func TestACheckoutReleaseStopsWaitingForTheLockFileAtTheCleanupDeadline(t *testing.T) {
	repo := emptyRepository(t)
	l := newTurns(t)
	one, two := l.coordinator("one"), l.coordinator("two")
	// The second process's checkout is real: its release has a worktree to
	// remove.
	two.Git = nil
	deadline := &expiry{passed: make(chan struct{})}
	workspaces := NewWorkspaces(two.Worktrees)
	workspaces.Cleanup = func(ctx context.Context) (context.Context, context.CancelFunc) {
		deadline.Context = ctx
		return deadline, func() {}
	}
	_, release, err := workspaces.Checkout(context.Background(), repo, "main")
	if err != nil {
		t.Fatal(err)
	}

	held := l.command(context.Background(), one, repo)
	receive(t, l.entered, "the held command entering git")
	released := l.start(context.Background(), func(context.Context) error { return release() })
	receive(t, two.waits, "the release waiting for the lock file")
	close(deadline.passed)
	if err := receive(t, released, "the release ending at its deadline"); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("a release whose cleanup deadline passed while it waited: %v", err)
	}
	select {
	case err := <-held:
		t.Fatalf("the holder ended before the release returned: %v", err)
	default:
	}
	if got, want := l.entries(), []string{"one in"}; fmt.Sprint(got) != fmt.Sprint(want) {
		t.Fatalf("commands ran as %v, not %v", got, want)
	}

	l.free()
	if err := receive(t, held, "the held command ending"); err != nil {
		t.Fatal(err)
	}
}
