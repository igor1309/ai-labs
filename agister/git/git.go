// Package git is a wrapper over git, in its own types (ADR-001): the root
// of the git worktree that holds a directory.
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
	command := exec.CommandContext(ctx, g.program, "rev-parse", "--show-toplevel")
	command.Dir = dir
	// Git's messages in the C locale: "not a git repository" tells no
	// worktree from a failure, in every user's language.
	command.Env = append(os.Environ(), "LC_ALL=C")
	var stdout, stderr bytes.Buffer
	command.Stdout, command.Stderr = &stdout, &stderr
	if err := command.Run(); err != nil {
		var exit *exec.ExitError
		if errors.As(err, &exit) && strings.Contains(stderr.String(), "not a git repository") {
			return "", nil
		}
		return "", fmt.Errorf("git rev-parse --show-toplevel in %s: %w: %s", dir, err, strings.TrimSpace(stderr.String()))
	}
	named := strings.TrimSuffix(stdout.String(), "\n")
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
