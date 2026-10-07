package system_test

import (
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/adapters/system"
	"github.com/igor1309/ai-labs/agister/internal/app"
)

// A worktree's lock is keyed by its canonical path: taken through a
// symlink, it is the same lock, and is refused while held; released, it is
// free again. Another worktree's lock is its own. Nothing is written in the
// worktree.
//
// Contract test: flock on lock files in a directory of the test's own.
func TestAWorktreeLockIsHeldByItsCanonicalPath(t *testing.T) {
	t.Parallel()
	base, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	worktree, other, link := filepath.Join(base, "worktree"), filepath.Join(base, "other"), filepath.Join(base, "link")
	for _, dir := range []string{worktree, other} {
		if err := os.Mkdir(dir, 0o700); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.Symlink(worktree, link); err != nil {
		t.Fatal(err)
	}
	locks := system.WorktreeLocks{Dir: filepath.Join(base, "state", "locks", "holds")}

	key, unlock, err := locks.Lock(link, true)
	if err == nil {
		t.Cleanup(func() { unlock() })
	}
	if err != nil || key != worktree {
		t.Fatalf("lock = %q, %v", key, err)
	}
	if _, unlockSecond, err := locks.Lock(worktree, true); !errors.Is(err, app.ErrWorktreeLocked) {
		if err == nil {
			t.Cleanup(func() { unlockSecond() })
		}
		t.Fatalf("second lock = %v", err)
	}
	otherKey, unlockOther, err := locks.Lock(other, true)
	if err == nil {
		t.Cleanup(func() { unlockOther() })
	}
	if err != nil || otherKey != other {
		t.Fatalf("other lock = %q, %v", otherKey, err)
	}
	if err := unlockOther(); err != nil {
		t.Fatal(err)
	}
	if err := unlock(); err != nil {
		t.Fatal(err)
	}
	if err := unlock(); err != nil {
		t.Fatalf("a second release = %v", err)
	}
	_, again, err := locks.Lock(worktree, true)
	if err != nil {
		t.Fatalf("lock after release = %v", err)
	}
	t.Cleanup(func() { again() })
	if err := again(); err != nil {
		t.Fatal(err)
	}
	if entries, err := os.ReadDir(worktree); err != nil || len(entries) != 0 {
		t.Fatalf("worktree holds %v, %v", entries, err)
	}
}

// A directory's key is the canonical path its lock is keyed by: asked
// through a symlink, it is the worktree's, whether or not the lock is held,
// and asking takes no lock. A directory that is not there has none.
//
// Contract test: symlinks and flock in a directory of the test's own.
func TestADirectorysKeyIsItsCanonicalPath(t *testing.T) {
	t.Parallel()
	base, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	worktree, link := filepath.Join(base, "worktree"), filepath.Join(base, "link")
	if err := os.Mkdir(worktree, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(worktree, link); err != nil {
		t.Fatal(err)
	}
	locks := system.WorktreeLocks{Dir: filepath.Join(base, "state", "locks", "holds")}

	if key, err := locks.Key(link); err != nil || key != worktree {
		t.Fatalf("key = %q, %v", key, err)
	}
	locked, unlock, err := locks.Lock(worktree, true)
	if err != nil {
		t.Fatalf("lock after asking for the key = %v", err)
	}
	t.Cleanup(func() { unlock() })
	if key, err := locks.Key(link); err != nil || key != locked {
		t.Fatalf("key while locked = %q, %v, want %q", key, err, locked)
	}
	if key, err := locks.Key(filepath.Join(base, "gone")); err != nil || key != "" {
		t.Fatalf("key of a directory that is not there = %q, %v", key, err)
	}
}

// Readers share a worktree's hold and a writer holds it alone: a second
// shared hold is taken while one is held, a hold alone is refused while
// any is, and a shared one while one is held alone.
//
// Contract test: flock on lock files in a directory of the test's own.
func TestReadersShareAWorktreesHoldAndAWriterHoldsItAlone(t *testing.T) {
	t.Parallel()
	base, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	worktree := filepath.Join(base, "worktree")
	if err := os.Mkdir(worktree, 0o700); err != nil {
		t.Fatal(err)
	}
	locks := system.WorktreeLocks{Dir: filepath.Join(base, "state", "locks", "holds")}
	hold := func(alone bool) func() error {
		t.Helper()
		_, release, err := locks.Lock(worktree, alone)
		if err != nil {
			t.Fatalf("hold (alone %t) = %v", alone, err)
		}
		t.Cleanup(func() { release() })
		return release
	}
	refused := func(alone bool) {
		t.Helper()
		_, release, err := locks.Lock(worktree, alone)
		if err == nil {
			release()
		}
		if !errors.Is(err, app.ErrWorktreeLocked) {
			t.Fatalf("hold (alone %t) = %v, want refused", alone, err)
		}
	}

	first, second := hold(false), hold(false)
	refused(true)
	if err := first(); err != nil {
		t.Fatal(err)
	}
	refused(true)
	if err := second(); err != nil {
		t.Fatal(err)
	}
	writer := hold(true)
	refused(false)
	refused(true)
	if err := writer(); err != nil {
		t.Fatal(err)
	}
	hold(false)
}
