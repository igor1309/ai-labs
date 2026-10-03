package git

import (
	"bufio"
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sync"
	"sync/atomic"
	"syscall"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/gokit/clocktest"
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
	worktrees := NewWorktrees(t.TempDir())
	worktrees.Git = func(ctx context.Context, dir string, lock *os.File, args ...string) (string, error) {
		if g.report(event{dir: dir}) && (g.held == "" || dir == g.held) {
			select {
			case <-g.proceed:
			case <-g.open:
			}
		}
		return worktrees.holding(ctx, dir, lock, args...)
	}
	worktrees.Waits = func() { g.report(event{waited: true}) }
	g.workspaces = NewWorkspaces(worktrees)
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

// Contract test: the worktree coordinator over real git and its real lock
// files. The timers only guard a hang.
//
// Serial: a lock is its open file's (flock). A process another test starts
// holds a copy from its fork to its exec, and a lock just released would
// read as held.
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

// Contract test: the worktree coordinator over real git and its real lock
// files. The timers only guard a hang.
//
// Serial: a lock is its open file's (flock). A process another test starts
// holds a copy from its fork to its exec, and a lock just released would
// read as held.
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

// Contract test: the worktree coordinator over real git and its real lock
// files. The timers only guard a hang.
//
// Serial: a lock is its open file's (flock). A process another test starts
// holds a copy from its fork to its exec, and a lock just released would
// read as held.
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

// Contract test: the worktree coordinator over real git and its real lock
// files. The timers only guard a hang.
//
// Serial: a lock is its open file's (flock). A process another test starts
// holds a copy from its fork to its exec, and a lock just released would
// read as held.
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

// Contract test: real git, in a repository of the test's own.
func TestWorkspacesWithoutWorktreesMakeNoWorktreeChange(t *testing.T) {
	t.Parallel()
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
// worker starts and run before its lock directory is removed, ends the
// workers: whatever a failed test left running.
func newTurns(t *testing.T) *turns {
	t.Helper()
	l := &turns{locks: t.TempDir(), release: make(chan struct{}), entered: make(chan string, 4)}
	t.Cleanup(func() { l.end(t) })
	return l
}

// end cancels the workers' contexts, closes release and joins the workers.
func (l *turns) end(t *testing.T) {
	t.Helper()
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
	c.Git = func(ctx context.Context, dir string, lock *os.File, args ...string) (string, error) {
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
	c.Timer = func(time.Duration) (<-chan time.Time, func()) {
		c.pauses.Add(1)
		runtime.Gosched()
		return passed()
	}
	return c
}

// passed is a wait that has passed already.
func passed() (<-chan time.Time, func()) {
	fired := make(chan time.Time, 1)
	fired <- time.Time{}
	return fired, func() {}
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

// Contract test: the lock files two coordinators share as two processes do,
// the kernel's flock. The timers only guard a hang.
//
// Serial: a lock is its open file's (flock). A process another test starts
// holds a copy from its fork to its exec, and a lock just released would
// read as held.
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
	// Until the other command says it waits, a second entry or a command
	// that ends is a failure, seen as it happens.
	select {
	case <-waiting.waits:
	case name := <-l.entered:
		t.Fatalf("%s entered git while %s held it", name, first)
	case err := <-ones:
		t.Fatalf("the first process's command ended while one held git: %v", err)
	case err := <-twos:
		t.Fatalf("the second process's command ended while one held git: %v", err)
	case <-time.After(hangGuard):
		t.Fatal("the other command did not wait")
	}
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

// Contract test: the lock files two coordinators share as two processes do,
// the kernel's flock. The timers only guard a hang.
//
// Serial: a lock is its open file's (flock). A process another test starts
// holds a copy from its fork to its exec, and a lock just released would
// read as held.
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

// Contract test: the lock files two coordinators share as two processes do,
// the kernel's flock. The timers only guard a hang.
//
// Serial: a lock is its open file's (flock). A process another test starts
// holds a copy from its fork to its exec, and a lock just released would
// read as held.
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

// expiry is a cleanup context whose deadline passes when the test calls
// pass.
type expiry struct {
	context.Context
	passed chan struct{}
	once   sync.Once
}

// expiring makes an expiry whose deadline passes at the test's cleanup at
// the latest, before the turns' workers are joined: a worker that waits
// under it ends.
func expiring(t *testing.T) *expiry {
	t.Helper()
	e := &expiry{passed: make(chan struct{})}
	t.Cleanup(e.pass)
	return e
}

// pass lets the deadline pass, once.
func (e *expiry) pass() { e.once.Do(func() { close(e.passed) }) }

func (e *expiry) Done() <-chan struct{} { return e.passed }

func (e *expiry) Err() error {
	select {
	case <-e.passed:
		return context.DeadlineExceeded
	default:
		return nil
	}
}

// Contract test: the lock files two coordinators share as two processes do,
// the kernel's flock. The timers only guard a hang.
//
// Serial: a lock is its open file's (flock). A process another test starts
// holds a copy from its fork to its exec, and a lock just released would
// read as held.
func TestACheckoutReleaseStopsWaitingForTheLockFileAtTheCleanupDeadline(t *testing.T) {
	repo := emptyRepository(t)
	l := newTurns(t)
	one, two := l.coordinator("one"), l.coordinator("two")
	// The second process's checkout is real: its release has a worktree to
	// remove.
	two.Git = nil
	deadline := expiring(t)
	workspaces := NewWorkspaces(two.Worktrees)
	workspaces.Cleanup = func(ctx context.Context) (context.Context, context.CancelFunc) {
		deadline.Context = ctx
		return deadline, func() {}
	}
	dir, release, err := workspaces.Checkout(context.Background(), repo, "main")
	if err != nil {
		t.Fatal(err)
	}
	// However the test ends, the deadline passes and the holders end
	// first, and the checkout is then discarded under a fresh cleanup
	// context, not the one that passed.
	t.Cleanup(func() {
		deadline.pass()
		l.end(t)
		if err := NewWorkspaces(two.Worktrees).Discard(context.Background(), repo, dir); err != nil {
			t.Errorf("discarding the checkout: %v", err)
		}
	})

	held := l.command(context.Background(), one, repo)
	receive(t, l.entered, "the held command entering git")
	released := l.start(context.Background(), func(context.Context) error { return release() })
	receive(t, two.waits, "the release waiting for the lock file")
	deadline.pass()
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

// Contract test: the lock files two coordinators share as two processes do,
// the kernel's flock. The timers only guard a hang.
//
// Serial: a lock is its open file's (flock). A process another test starts
// holds a copy from its fork to its exec, and a lock just released would
// read as held.
func TestDiscardStopsWaitingForTheLockFileAtTheCleanupDeadline(t *testing.T) {
	repo := emptyRepository(t)
	l := newTurns(t)
	one, two := l.coordinator("one"), l.coordinator("two")
	deadline := expiring(t)
	workspaces := NewWorkspaces(two.Worktrees)
	workspaces.Cleanup = func(ctx context.Context) (context.Context, context.CancelFunc) {
		deadline.Context = ctx
		return deadline, func() {}
	}
	dir := workspaces.Place(fmt.Sprintf("serial-%d-%d", os.Getpid(), places.Add(1)))

	held := l.command(context.Background(), one, repo)
	receive(t, l.entered, "the held command entering git")
	// Unbounded but for the cleanup deadline Discard sets itself.
	discarded := l.start(context.Background(), func(context.Context) error {
		return workspaces.Discard(context.Background(), repo, dir)
	})
	receive(t, two.waits, "the discard waiting for the lock file")
	select {
	case err := <-discarded:
		t.Fatalf("the discard ended before its deadline: %v", err)
	default:
	}
	deadline.pass()
	if err := receive(t, discarded, "the discard ending at its deadline"); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("a discard whose cleanup deadline passed while it waited: %v", err)
	}
	if got, want := l.entries(), []string{"one in"}; fmt.Sprint(got) != fmt.Sprint(want) {
		t.Fatalf("commands ran as %v, not %v", got, want)
	}

	l.free()
	if err := receive(t, held, "the held command ending"); err != nil {
		t.Fatal(err)
	}
}

func TestTheDefaultCleanupContextHasADeadlineOfOneMinute(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 10, 3, 12, 0, 0, 0, time.UTC)
	worktrees := NewWorktrees(t.TempDir())
	worktrees.Clock = clocktest.NewClock(now)
	ctx, cancel := NewWorkspaces(worktrees).cleanup(context.Background())
	defer cancel()
	if deadline, ok := ctx.Deadline(); !ok || !deadline.Equal(now.Add(time.Minute)) {
		t.Fatalf("deadline %v (set %v), want one minute from %v", deadline, ok, now)
	}
}

// A command that found the lock file held tries again only once the retry
// wait has passed on its timer, and not before, however soon the lock is
// freed.
//
// Contract test: the lock files two coordinators share as two processes do,
// the kernel's flock. The timers only guard a hang.
//
// Serial: a lock is its open file's (flock). A process another test starts
// holds a copy from its fork to its exec, and a lock just released would
// read as held.
func TestALockFileHeldIsTriedAgainOnlyOnceTheRetryHasPassed(t *testing.T) {
	repo := emptyRepository(t)
	l := newTurns(t)
	one, two := l.coordinator("one"), l.coordinator("two")
	clock := clocktest.NewClock(time.Date(2026, 10, 3, 12, 0, 0, 0, time.UTC))
	two.Timer = clock.Timer
	ctx := context.Background()

	ones := l.command(ctx, one, repo)
	receive(t, l.entered, "the first command entering git")
	twos := l.command(ctx, two, repo)
	receive(t, two.waits, "the second command finding the lock file held")
	clock.Started(retry)
	l.free()
	if err := receive(t, ones, "the first command ending"); err != nil {
		t.Fatal(err)
	}
	clock.Advance(retry - time.Nanosecond)
	select {
	case name := <-l.entered:
		t.Fatalf("%s entered git before the retry had passed", name)
	default:
	}
	if clock.Pending() != 1 || len(clock.Waits()) != 1 {
		t.Fatalf("the retry ended early: %d pending of %v", clock.Pending(), clock.Waits())
	}
	clock.Advance(time.Nanosecond)
	if name := receive(t, l.entered, "the second command entering git"); name != "two" {
		t.Fatalf("%s entered git", name)
	}
	if err := receive(t, twos, "the second command ending"); err != nil {
		t.Fatal(err)
	}
}

// The environment of a test binary re-executed as one of
// TestAKilledHoldersLockLastsAsLongAsItsGitChild's processes: its role,
// and the holder's lock directory and repository.
const (
	helperRole  = "AGISTER_GIT_HELPER_ROLE"
	helperLocks = "AGISTER_GIT_HELPER_LOCKS"
	helperRepo  = "AGISTER_GIT_HELPER_REPO"
)

// helper is the test binary re-executed in role.
func helper(role string, env ...string) *exec.Cmd {
	command := exec.Command(os.Args[0], "-test.run=^TestHelperProcess$")
	command.Env = append(append(os.Environ(), helperRole+"="+role), env...)
	return command
}

// TestHelperProcess is no test but a process of another: in a re-executed
// test binary, the holder of a repository's lock or its held git child.
//
// Contract test: no test of its own, but the real processes of
// TestAKilledHoldersLockLastsAsLongAsItsGitChild.
//
// Serial: it is the body of a re-executed test binary, which runs nothing
// else.
func TestHelperProcess(t *testing.T) {
	switch os.Getenv(helperRole) {
	case "holder":
		holdTheLock()
	case "child":
		// The lock is fd 3, if git is given it. Its stdin is the test's
		// socket: it says it runs there, and reads until the test closes it.
		if _, err := os.Stdin.WriteString("held\n"); err != nil {
			os.Exit(1)
		}
		io.Copy(io.Discard, os.Stdin)
	default:
		return
	}
	os.Exit(0)
}

// holdTheLock takes the repository's lock and runs its worktree command as
// git is run, holding the lock: in place of git, the child, whose stdin is
// the test's socket (fd 3 here).
func holdTheLock() {
	worktrees := NewWorktrees(os.Getenv(helperLocks))
	worktrees.Command = func(ctx context.Context, args ...string) *exec.Cmd {
		child := helper("child")
		child.Stdin = os.NewFile(3, "socket")
		return child
	}
	_, err := worktrees.worktree(context.Background(), os.Getenv(helperRepo), "list")
	fmt.Fprintln(os.Stderr, "the holder's command ended:", err)
	os.Exit(1)
}

// socketPair is a connected pair of sockets, neither inherited by a
// process started but as one of its files.
func socketPair(t *testing.T) (*os.File, *os.File) {
	t.Helper()
	syscall.ForkLock.RLock()
	fds, err := syscall.Socketpair(syscall.AF_UNIX, syscall.SOCK_STREAM, 0)
	if err == nil {
		syscall.CloseOnExec(fds[0])
		syscall.CloseOnExec(fds[1])
	}
	syscall.ForkLock.RUnlock()
	if err != nil {
		t.Fatal(err)
	}
	return os.NewFile(uintptr(fds[0]), "test"), os.NewFile(uintptr(fds[1]), "child")
}

// A process killed while its git command runs leaves the lock to git: a
// command of another process waits for it until git exits. The held
// command is started as production starts git, the lock handed to it.
//
// Contract test: the kernel's flock across real processes: a re-executed
// test binary that is killed, and the child it handed the lock to. The
// timers only guard a hang.
//
// Serial: a lock is its open file's (flock). A process another test starts
// holds a copy from its fork to its exec, and a lock just released would
// read as held.
func TestAKilledHoldersLockLastsAsLongAsItsGitChild(t *testing.T) {
	repo, locks := emptyRepository(t), t.TempDir()
	// The child ends when the test closes its end: the other end is the
	// child's alone once the holder is killed.
	socket, child := socketPair(t)
	t.Cleanup(func() { socket.Close() })
	holder := helper("holder", helperLocks+"="+locks, helperRepo+"="+repo)
	holder.ExtraFiles = []*os.File{child}
	var stderr bytes.Buffer
	holder.Stderr = &stderr
	if err := holder.Start(); err != nil {
		t.Fatal(err)
	}
	child.Close()
	var killed sync.Once
	kill := func() {
		killed.Do(func() {
			holder.Process.Kill()
			holder.Wait()
		})
	}
	t.Cleanup(kill)

	said := make(chan string, 1)
	go func() {
		line, _ := bufio.NewReader(socket).ReadString('\n')
		said <- line
	}()
	if line := receive(t, said, "the holder's child starting"); line != "held\n" {
		kill()
		t.Fatalf("the child said %q: %s", line, stderr.String())
	}
	kill()

	second := NewWorktrees(locks)
	waited, entered := make(chan struct{}), make(chan struct{}, 1)
	second.Waits = func() { close(waited) }
	second.Timer = func(time.Duration) (<-chan time.Time, func()) {
		runtime.Gosched()
		return passed()
	}
	second.Git = func(ctx context.Context, dir string, lock *os.File, args ...string) (string, error) {
		entered <- struct{}{}
		return "", nil
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	done := make(chan error, 1)
	joined := make(chan struct{})
	go func() {
		defer close(joined)
		_, err := second.worktree(ctx, repo, "list")
		done <- err
	}()
	// However the test ends, the worker is cancelled and joined.
	t.Cleanup(func() {
		cancel()
		select {
		case <-joined:
		case <-time.After(hangGuard):
			t.Error("another process's command still runs with its context cancelled")
		}
	})
	select {
	case <-waited:
	case <-entered:
		t.Fatal("another process got the lock while the killed holder's git child ran")
	case err := <-done:
		t.Fatalf("another process's command ended while the child ran: %v", err)
	case <-time.After(hangGuard):
		t.Fatal("another process's command did not wait")
	}
	socket.Close()
	receive(t, entered, "another process's command getting the lock once the child exited")
	if err := receive(t, done, "another process's command ending"); err != nil {
		t.Fatal(err)
	}
}
