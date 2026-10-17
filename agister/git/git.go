// Package git is a wrapper over git, in its own types (ADR-001): the root
// of the git worktree that holds a directory, a revision's commit, the
// files changed between two revisions, and a worktree's HEAD and whether
// its content is HEAD's.
package git

import (
	"bytes"
	"context"
	"errors"
	"fmt"
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

// run runs git with args in dir, and gives its stdout and stderr. Git's
// messages are in the C locale: a caller that reads them, or a person,
// gets the same words in every user's language.
func (g *Git) run(ctx context.Context, dir string, args ...string) (string, string, error) {
	command := exec.CommandContext(ctx, g.program, args...)
	command.Dir = dir
	command.Env = append(os.Environ(), "LC_ALL=C")
	var stdout, stderr bytes.Buffer
	command.Stdout, command.Stderr = &stdout, &stderr
	err := command.Run()
	return stdout.String(), stderr.String(), err
}
