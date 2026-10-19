// Package git is a wrapper over git, in its own types (ADR-001): the root
// of the git worktree that holds a directory, a revision's commit, the
// files changed between two revisions, and a worktree's HEAD, whether its
// content is HEAD's, and its content.
package git

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// Git runs git, as the program it is given.
type Git struct {
	program string
}

// New gives a Git that runs program.
func New(program string) (*Git, error) {
	if program == "" {
		return nil, errors.New("git: no program")
	}
	return &Git{program: program}, nil
}

// Root gives the root of the git worktree that holds dir, or "" and no
// error when none does. The root is spelled as dir is: the nearest of dir
// and the folders above it, by its spelling, that is the root git names,
// so that a walk up from dir meets it, links and all. A root no such
// folder is, as for a dir reached by a link from outside the worktree, is
// given as git spells it.
func (g *Git) Root(ctx context.Context, dir string) (string, error) {
	stdout, stderr, err := g.run(ctx, dir, "rev-parse", "--show-toplevel")
	if err != nil {
		var exit *exec.ExitError
		if errors.As(err, &exit) && strings.Contains(stderr, "not a git repository") {
			return "", nil
		}
		return "", fmt.Errorf("git rev-parse --show-toplevel in %s: %w: %s", dir, err, strings.TrimSpace(stderr))
	}
	named := strings.TrimSuffix(stdout, "\n")
	root, err := os.Stat(named)
	if err != nil {
		return "", fmt.Errorf("git: the worktree root of %s: %w", dir, err)
	}
	for candidate := filepath.Clean(dir); ; candidate = filepath.Dir(candidate) {
		if info, err := os.Stat(candidate); err == nil && os.SameFile(info, root) {
			return candidate, nil
		}
		if candidate == filepath.Dir(candidate) {
			return named, nil
		}
	}
}

// Commit gives the full id of the commit rev names in dir, as git
// rev-parse --verify <rev>^{commit} gives it, or an error naming rev, with
// git's words, where it names none.
func (g *Git) Commit(ctx context.Context, dir, rev string) (string, error) {
	stdout, stderr, err := g.run(ctx, dir, "rev-parse", "--verify", rev+"^{commit}")
	if err != nil {
		return "", fmt.Errorf("git names no commit %q in %s: %w: %s", rev, dir, err, strings.TrimSpace(stderr))
	}
	return strings.TrimSpace(stdout), nil
}

// Changed gives the paths of the files changed in dir from the merge base
// of base and head to head, as git diff --name-only -z lists them: each
// path as it is, spaces and all, in git's order.
func (g *Git) Changed(ctx context.Context, dir, base, head string) ([]string, error) {
	stdout, stderr, err := g.run(ctx, dir, "diff", "--name-only", "-z", base+"..."+head, "--")
	if err != nil {
		return nil, fmt.Errorf("git diff --name-only %s...%s in %s: %w: %s", base, head, dir, err, strings.TrimSpace(stderr))
	}
	return strings.FieldsFunc(stdout, func(r rune) bool { return r == 0 }), nil
}

// Head gives the full id of the commit dir's HEAD is, or an error, with
// git's words, where it is none, as in a repository with no commit yet.
func (g *Git) Head(ctx context.Context, dir string) (string, error) {
	return g.Commit(ctx, dir, "HEAD")
}

// Clean tells whether dir's worktree has no change from its HEAD: none
// staged, unstaged or untracked, as git status --porcelain lists them; an
// ignored file is no change. Git takes no optional lock for it, so that it
// contends with no git the caller runs in the worktree meanwhile.
func (g *Git) Clean(ctx context.Context, dir string) (bool, error) {
	stdout, stderr, err := g.run(ctx, dir, "--no-optional-locks", "status", "--porcelain")
	if err != nil {
		return false, fmt.Errorf("git status --porcelain in %s: %w: %s", dir, err, strings.TrimSpace(stderr))
	}
	return stdout == "", nil
}

// Content gives the id of the tree dir's worktree's files would make, as
// git write-tree gives it: tracked and untracked files as they are now,
// ignored ones not. Git writes it through an index of its own, a copy of
// the worktree's in a temporary folder, removed after: the worktree's
// index is neither changed nor locked, and the copy's stat data spares
// hashing the files unchanged since it was written.
func (g *Git) Content(ctx context.Context, dir string) (string, error) {
	stdout, stderr, err := g.run(ctx, dir, "rev-parse", "--git-path", "index")
	if err != nil {
		return "", fmt.Errorf("git rev-parse --git-path index in %s: %w: %s", dir, err, strings.TrimSpace(stderr))
	}
	index := strings.TrimSuffix(stdout, "\n")
	if !filepath.IsAbs(index) {
		index = filepath.Join(dir, index)
	}
	folder, err := os.MkdirTemp("", "agister-index-")
	if err != nil {
		return "", fmt.Errorf("git: the content of %s: %w", dir, err)
	}
	defer os.RemoveAll(folder)
	own := filepath.Join(folder, "index")
	if err := copyFile(index, own); err != nil {
		return "", fmt.Errorf("git: the content of %s: %w", dir, err)
	}
	env := []string{"GIT_INDEX_FILE=" + own}
	if _, stderr, err := g.runWith(ctx, dir, env, "add", "--all"); err != nil {
		return "", fmt.Errorf("git add --all in %s: %w: %s", dir, err, strings.TrimSpace(stderr))
	}
	stdout, stderr, err = g.runWith(ctx, dir, env, "write-tree")
	if err != nil {
		return "", fmt.Errorf("git write-tree in %s: %w: %s", dir, err, strings.TrimSpace(stderr))
	}
	return strings.TrimSpace(stdout), nil
}

// Changes gives the binary-capable patch from commit to content, both
// objects already in dir's repository.
func (g *Git) Changes(ctx context.Context, dir, commit, content string) (string, error) {
	stdout, stderr, err := g.run(ctx, dir, "diff", "--binary", "--no-ext-diff", "--no-textconv", commit, content, "--")
	if err != nil {
		return "", fmt.Errorf("git diff --binary %s %s in %s: %w: %s", commit, content, dir, err, strings.TrimSpace(stderr))
	}
	return stdout, nil
}

// copyFile copies the file from to the new file to. A from that does not
// exist, as the index of a repository nothing was ever added to, copies
// nothing: git starts an index of its own empty.
func copyFile(from, to string) error {
	source, err := os.Open(from)
	if errors.Is(err, fs.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	defer source.Close()
	copied, err := os.OpenFile(to, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return err
	}
	if _, err := io.Copy(copied, source); err != nil {
		copied.Close()
		return err
	}
	return copied.Close()
}

// run runs git with args in dir, and gives its stdout and stderr.
func (g *Git) run(ctx context.Context, dir string, args ...string) (string, string, error) {
	return g.runWith(ctx, dir, nil, args...)
}

// runWith runs git with args in dir, env added to its environment, and
// gives its stdout and stderr. Git's messages are in the C locale: a
// caller that reads them, or a person, gets the same words in every user's
// language.
func (g *Git) runWith(ctx context.Context, dir string, env []string, args ...string) (string, string, error) {
	command := exec.CommandContext(ctx, g.program, args...)
	command.Dir = dir
	command.Env = append(append(os.Environ(), "LC_ALL=C"), env...)
	var stdout, stderr bytes.Buffer
	command.Stdout, command.Stderr = &stdout, &stderr
	err := command.Run()
	return stdout.String(), stderr.String(), err
}
