package system

import (
	"path/filepath"
	"syscall"
	"testing"
)

// A released hold is free again while a copy of its descriptor is still
// open, as a process forked while the hold was held keeps one until its
// exec closes it: the release lets the lock go for every copy, and the
// hold is taken alone again.
//
// Contract test: flock on a lock file in a directory of the test's own.
func TestAReleasedHoldIsFreeWhileACopyOfItsDescriptorIsOpen(t *testing.T) {
	t.Parallel()
	worktree := t.TempDir()
	locks := WorktreeLocks{Dir: filepath.Join(t.TempDir(), "locks")}
	_, file, release, err := locks.lock(worktree, true)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { release() })
	copied, err := syscall.Dup(int(file.Fd()))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { syscall.Close(copied) })

	if err := release(); err != nil {
		t.Fatal(err)
	}
	_, again, err := locks.Lock(worktree, true)
	if err != nil {
		t.Fatalf("the hold alone after its release, a copy of its descriptor open = %v", err)
	}
	if err := again(); err != nil {
		t.Fatal(err)
	}
}
