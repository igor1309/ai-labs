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
// empty, which holds no state. The hold is the open file's (flock), shared
// by readers and held alone by a writer, taken without waiting: it ends
// when it is released or the process that holds it ends, and two holders
// in one process exclude each other too. Nothing is written in the
// worktree for it.
type WorktreeLocks struct{ Dir string }

// Lock takes the hold of the worktree at dir, alone or shared, and returns
// its canonical path, symlinks resolved, and the release of the hold. A
// hold that cannot be taken, one held alone already or, taken alone, one
// held at all, is an error that wraps app.ErrWorktreeLocked.
func (l WorktreeLocks) Lock(dir string, alone bool) (string, func() error, error) {
	key, err := canonical(dir)
	if err != nil {
		return "", nil, err
	}
	if err := os.MkdirAll(l.Dir, 0o700); err != nil {
		return "", nil, err
	}
	sum := sha256.Sum256([]byte(key))
	file, err := os.OpenFile(filepath.Join(l.Dir, hex.EncodeToString(sum[:])+".lock"), os.O_RDWR|os.O_CREATE, 0o600)
	if err != nil {
		return "", nil, err
	}
	how := syscall.LOCK_SH
	if alone {
		how = syscall.LOCK_EX
	}
	for {
		err = syscall.Flock(int(file.Fd()), how|syscall.LOCK_NB)
		if !errors.Is(err, syscall.EINTR) {
			break
		}
	}
	switch {
	case errors.Is(err, syscall.EWOULDBLOCK):
		file.Close()
		return "", nil, fmt.Errorf("%s: %w", key, app.ErrWorktreeLocked)
	case err != nil:
		file.Close()
		return "", nil, fmt.Errorf("locking %s: %w", file.Name(), err)
	}
	// Closing the descriptor lets the lock go; the file stays.
	var once sync.Once
	var closed error
	return key, func() error {
		once.Do(func() { closed = file.Close() })
		return closed
	}, nil
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
