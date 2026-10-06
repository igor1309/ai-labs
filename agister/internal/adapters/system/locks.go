package system

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"syscall"

	"github.com/igor1309/ai-labs/agister/internal/app"
)

// WorktreeLocks holds one lock per worktree for in-place calls (ADR-022 rule
// 3): a lock file in Dir, named by a digest of the worktree's canonical
// path, empty, which holds no state. The lock is the open file's (flock),
// taken without waiting: it ends when it is released or the process that
// holds it ends, and two holders in one process exclude each other too.
// Nothing is written in the worktree for it.
type WorktreeLocks struct{ Dir string }

// Lock takes the lock of the worktree at dir and returns its canonical
// path, symlinks resolved, and the release of the lock. A lock held already
// is an error that wraps app.ErrWorktreeLocked.
func (l WorktreeLocks) Lock(dir string) (string, func() error, error) {
	absolute, err := filepath.Abs(dir)
	if err != nil {
		return "", nil, err
	}
	key, err := filepath.EvalSymlinks(absolute)
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
	for {
		err = syscall.Flock(int(file.Fd()), syscall.LOCK_EX|syscall.LOCK_NB)
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
