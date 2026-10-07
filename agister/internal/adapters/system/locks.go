package system

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sync"
	"syscall"

	"github.com/igor1309/ai-labs/agister/internal/app"
)

// WorktreeLocks holds one hold per worktree for calls (ADR-025 rule 4): a
// lock file in Dir, named by a digest of the worktree's canonical path,
// empty, which holds no state. The hold is the open file's (flock), taken
// without waiting: readers hold it shared (LOCK_SH), any number together,
// and a writer holds it alone (LOCK_EX), excluding readers and other
// writers. Each Lock opens the file anew, so holders in one process share
// or exclude each other as holders in different processes do. A hold ends
// when it is released or the process that holds it ends. Nothing is
// written in the worktree for it.
type WorktreeLocks struct{ Dir string }

// Lock takes the hold of the worktree at dir, alone or shared, and returns
// its canonical path, symlinks resolved, and the release of the hold. A
// hold that cannot be taken, one held alone already or, taken alone, one
// held at all, is an error that wraps app.ErrWorktreeLocked.
func (l WorktreeLocks) Lock(dir string, alone bool) (string, func() error, error) {
	key, _, release, err := l.lock(dir, alone)
	return key, release, err
}

// lock is Lock, and also returns the open lock file the hold is on.
func (l WorktreeLocks) lock(dir string, alone bool) (string, *os.File, func() error, error) {
	key, err := canonical(dir)
	if err != nil {
		return "", nil, nil, err
	}
	if err := os.MkdirAll(l.Dir, 0o700); err != nil {
		return "", nil, nil, err
	}
	sum := sha256.Sum256([]byte(key))
	file, err := os.OpenFile(filepath.Join(l.Dir, hex.EncodeToString(sum[:])+".lock"), os.O_RDWR|os.O_CREATE, 0o600)
	if err != nil {
		return "", nil, nil, err
	}
	how := syscall.LOCK_SH
	if alone {
		how = syscall.LOCK_EX
	}
	err = flock(file, how|syscall.LOCK_NB)
	switch {
	case errors.Is(err, syscall.EWOULDBLOCK):
		file.Close()
		return "", nil, nil, fmt.Errorf("%s: %w", key, app.ErrWorktreeLocked)
	case err != nil:
		file.Close()
		return "", nil, nil, fmt.Errorf("locking %s: %w", file.Name(), err)
	}
	// The release unlocks before it closes: the lock is the open file
	// description's, and a process forked meanwhile holds a copy of the
	// descriptor until its exec closes it. Closing alone would leave the
	// lock held by that copy; unlocking ends it for every copy. The file
	// stays.
	var once sync.Once
	var released error
	return key, file, func() error {
		once.Do(func() {
			unlocked := flock(file, syscall.LOCK_UN)
			if unlocked != nil {
				unlocked = fmt.Errorf("unlocking %s: %w", file.Name(), unlocked)
			}
			released = errors.Join(unlocked, file.Close())
		})
		return released
	}, nil
}

// flock applies the operation how to file's lock, again while a signal
// interrupts it.
func flock(file *os.File, how int) error {
	for {
		err := syscall.Flock(int(file.Fd()), how)
		if !errors.Is(err, syscall.EINTR) {
			return err
		}
	}
}

// Key returns the canonical path Lock keys the directory at dir by, and
// takes no lock. It is empty for a directory that is not there.
func (WorktreeLocks) Key(dir string) (string, error) {
	key, err := canonical(dir)
	if errors.Is(err, fs.ErrNotExist) {
		return "", nil
	}
	return key, err
}

// canonical is dir's absolute path with its symlinks resolved.
func canonical(dir string) (string, error) {
	absolute, err := filepath.Abs(dir)
	if err != nil {
		return "", err
	}
	return filepath.EvalSymlinks(absolute)
}
