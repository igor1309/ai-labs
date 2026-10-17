package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"path/filepath"

	"github.com/igor1309/ai-labs/agister/core/admit"
	"github.com/igor1309/ai-labs/agister/files"
)

// worktreeFacts is what core/admit's worktree asks of git.
type worktreeFacts interface {
	Head(ctx context.Context, dir string) (string, error)
	Clean(ctx context.Context, dir string) (bool, error)
}

// lockFiles is what core/admit's hold asks of files.
type lockFiles interface {
	Lock(file string, alone bool) (release func() error, err error)
}

// holding is what a run admits a call against and holds its worktree by
// (docs/run-implementation.md, "A step in a held worktree"): a worktree's
// HEAD and whether it is clean, of git; and the lock files under folder,
// of files.
type holding struct {
	facts  worktreeFacts
	locks  lockFiles
	folder string
}

// check is an error where a port of h is missing.
func (h holding) check() error {
	switch {
	case h.facts == nil:
		return errors.New("no worktree facts")
	case h.locks == nil:
		return errors.New("no locks")
	case h.folder == "":
		return errors.New("no lock folder")
	}
	return nil
}

// lockFolder is the folder of the worktrees' lock files for the user whose
// home directory is user: the archive's, under the user's ".agister"
// whatever AGISTER_HOME says, so that the two Agisters exclude each other
// on a worktree.
func lockFolder(user string) string { return filepath.Join(user, ".agister", "locks", "in-place") }

// worktreeAt answers core/admit's worktree from git, in root, the
// worktree's root.
type worktreeAt struct {
	facts worktreeFacts
	root  string
}

func (w worktreeAt) Head(ctx context.Context) (string, error) { return w.facts.Head(ctx, w.root) }
func (w worktreeAt) Clean(ctx context.Context) (bool, error)  { return w.facts.Clean(ctx, w.root) }

// worktreeHold answers core/admit's hold from files' lock: the lock file
// under folder named by the SHA-256 of root's path, its links resolved
// through links, and ".lock", as the archive names it. A lock held is
// admit's ErrHeld.
type worktreeHold struct {
	locks  lockFiles
	links  links
	folder string
	root   string
}

func (h worktreeHold) Take(alone bool) (func(), error) {
	resolved, err := h.links.Resolved(h.root)
	if err != nil {
		return nil, fmt.Errorf("the worktree root %s: %w", h.root, err)
	}
	sum := sha256.Sum256([]byte(resolved))
	release, err := h.locks.Lock(filepath.Join(h.folder, hex.EncodeToString(sum[:])+".lock"), alone)
	if errors.Is(err, files.ErrLocked) {
		return nil, fmt.Errorf("%w: %w", admit.ErrHeld, err)
	}
	if err != nil {
		return nil, err
	}
	// A lock that fails to release ends with the process that holds it,
	// and the call it held has ended already: nothing waits on the error.
	return func() { _ = release() }, nil
}
