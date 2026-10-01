package git

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sync/atomic"
	"testing"
)

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

// gate is the worktree runner of a test: every worktree command reports the
// directory it runs in on entered, and one in the held directory (any, when
// held is empty) then stays under its lock until proceed lets it run.
type gate struct {
	held    string
	entered chan string
	proceed chan struct{}
	waited  chan struct{}
}

// gated replaces the process's worktree lock with one whose commands pass
// through a gate, for the test.
func gated(t *testing.T, held string) *gate {
	g := &gate{held: held, entered: make(chan string, 16), proceed: make(chan struct{}), waited: make(chan struct{}, 16)}
	real := worktrees
	worktrees = &serial{
		git: func(ctx context.Context, dir string, args ...string) (string, error) {
			g.entered <- dir
			if g.held == "" || dir == g.held {
				<-g.proceed
			}
			return run(ctx, dir, args...)
		},
		waits: func() { g.waited <- struct{}{} },
	}
	t.Cleanup(func() {
		close(g.proceed) // a command a failed test left at the gate
		worktrees = real
	})
	return g
}

// start runs do aside and gives the channel its error arrives on.
func start(do func() error) <-chan error {
	done := make(chan error, 1)
	go func() { done <- do() }()
	return done
}

// queued fails the test unless a command started while another holds the
// lock waits for it: it must report waiting, not enter.
func (g *gate) queued(t *testing.T) {
	t.Helper()
	select {
	case <-g.waited:
	case dir := <-g.entered:
		t.Fatalf("a worktree command in %s ran while another held the lock", dir)
	}
}

var places atomic.Int64

func place() string {
	return Workspaces{}.Place(fmt.Sprintf("serial-%d-%d", os.Getpid(), places.Add(1)))
}

func TestWorktreeCommandsOfOneRepositoryNeverOverlap(t *testing.T) {
	repo := emptyRepository(t)
	g := gated(t, "")
	ctx := context.Background()

	// first is held under the lock; second, started then, has to wait for
	// it, and runs only once first is done.
	inTurn := func(first, second func() error) {
		t.Helper()
		one := start(first)
		<-g.entered
		two := start(second)
		g.queued(t)
		g.proceed <- struct{}{}
		if err := <-one; err != nil {
			t.Fatal(err)
		}
		<-g.entered
		g.proceed <- struct{}{}
		if err := <-two; err != nil {
			t.Fatal(err)
		}
	}

	var release func() error
	checkout := func() (err error) {
		_, release, err = Workspaces{}.Checkout(ctx, repo, "main")
		return err
	}
	dir := place()
	t.Cleanup(func() { os.RemoveAll(filepath.Dir(dir)) })
	copy := func() error { return Workspaces{}.Copy(ctx, repo, dir, "main", nil) }
	discard := func() error { return Workspaces{}.Discard(ctx, repo, dir) }

	inTurn(checkout, copy)
	inTurn(func() error { return release() }, discard)
	inTurn(copy, checkout)
	inTurn(discard, func() error { return release() })
}

func TestDifferentRepositoriesDoNotWaitOnEachOther(t *testing.T) {
	busy, other := emptyRepository(t), emptyRepository(t)
	g := gated(t, busy)

	var release func() error
	held := start(func() (err error) {
		_, release, err = Workspaces{}.Checkout(context.Background(), busy, "main")
		return err
	})
	<-g.entered

	// A command that waited would never get the lock: its wait is cancelled
	// instead, and fails the test.
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	worktrees.waits = cancel
	_, releaseOther, err := Workspaces{}.Checkout(ctx, other, "main")
	if err != nil {
		t.Fatalf("a checkout in another repository, while one is busy: %v", err)
	}
	if err := releaseOther(); err != nil {
		t.Fatal(err)
	}

	g.proceed <- struct{}{}
	if err := <-held; err != nil {
		t.Fatal(err)
	}
	worktrees.git = run
	if err := release(); err != nil {
		t.Fatal(err)
	}
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
	g := gated(t, repo)

	releases := make(chan func() error, 3)
	checkout := func(path string) <-chan error {
		return start(func() error {
			_, release, err := Workspaces{}.Checkout(context.Background(), path, "main")
			releases <- release
			return err
		})
	}
	held := checkout(repo)
	<-g.entered
	fromWorktree := checkout(linked)
	g.queued(t)
	fromLink := checkout(link)
	g.queued(t)

	g.proceed <- struct{}{}
	for _, done := range []<-chan error{held, fromWorktree, fromLink} {
		if err := <-done; err != nil {
			t.Fatal(err)
		}
	}
	worktrees.git = run
	for range 3 {
		if err := (<-releases)(); err != nil {
			t.Fatal(err)
		}
	}
}

func TestACancelledContextStopsTheWait(t *testing.T) {
	repo := emptyRepository(t)
	g := gated(t, "")

	var release func() error
	held := start(func() (err error) {
		_, release, err = Workspaces{}.Checkout(context.Background(), repo, "main")
		return err
	})
	<-g.entered

	ctx, cancel := context.WithCancel(context.Background())
	waiting := start(func() error {
		_, _, err := Workspaces{}.Checkout(ctx, repo, "main")
		return err
	})
	g.queued(t)
	cancel()
	if err := <-waiting; !errors.Is(err, context.Canceled) {
		t.Fatalf("a checkout cancelled while it waited: %v", err)
	}
	if len(g.entered) != 0 {
		t.Fatal("the cancelled checkout ran its worktree command")
	}

	g.proceed <- struct{}{}
	if err := <-held; err != nil {
		t.Fatal(err)
	}
	worktrees.git = run
	if err := release(); err != nil {
		t.Fatal(err)
	}
}
