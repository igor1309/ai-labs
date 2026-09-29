// Package git provides repository workspaces and git input sources.
// Every input is resolved to an immutable identity: revisions to commits,
// derived content to a digest over the commits it came from.
package git

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/igor1309/ai-labs/agister/internal/app"
)

func run(ctx context.Context, dir string, args ...string) (string, error) {
	command := exec.CommandContext(ctx, "git", args...)
	command.Dir = dir
	var stdout, stderr bytes.Buffer
	command.Stdout, command.Stderr = &stdout, &stderr
	if err := command.Run(); err != nil {
		return "", fmt.Errorf("git %s: %s", strings.Join(args, " "), strings.TrimSpace(stderr.String()))
	}
	return stdout.String(), nil
}

func commit(ctx context.Context, dir, revision string) (string, error) {
	if revision == "" {
		return "", fmt.Errorf("empty revision")
	}
	out, err := run(ctx, dir, "rev-parse", "--verify", "--quiet", revision+"^{commit}")
	if err != nil {
		return "", fmt.Errorf("not a commit: %s", revision)
	}
	return strings.TrimSpace(out), nil
}

// Workspaces locates repositories and makes detached checkouts.
type Workspaces struct{}

func (Workspaces) Root(ctx context.Context, cwd string) (string, error) {
	out, err := run(ctx, cwd, "rev-parse", "--show-toplevel")
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(out), nil
}

func (Workspaces) Checkout(ctx context.Context, repository, revision string) (string, func() error, error) {
	parent, err := os.MkdirTemp("", "agister-checkout-")
	if err != nil {
		return "", nil, err
	}
	dir := filepath.Join(parent, "workspace")
	if _, err := run(ctx, repository, "worktree", "add", "--detach", "--quiet", dir, revision); err != nil {
		os.RemoveAll(parent)
		return "", nil, err
	}
	release := func() error {
		_, err := run(context.WithoutCancel(ctx), repository, "worktree", "remove", "--force", dir)
		if removeErr := os.RemoveAll(parent); err == nil {
			err = removeErr
		}
		return err
	}
	return dir, release, nil
}

// Discard removes a checkout whose call ended without releasing it. Only a
// directory Checkout could have made is touched: <temp>/agister-checkout-*/workspace.
func (Workspaces) Discard(ctx context.Context, repository, dir string) error {
	parent := filepath.Dir(dir)
	if filepath.Base(dir) != "workspace" || !strings.HasPrefix(filepath.Base(parent), "agister-checkout-") ||
		resolved(filepath.Dir(parent)) != resolved(os.TempDir()) {
		return fmt.Errorf("%s is not a checkout Agister made", dir)
	}
	_, err := run(ctx, repository, "worktree", "remove", "--force", dir)
	if err != nil && strings.Contains(err.Error(), "is not a working tree") {
		err = nil
	}
	if removeErr := os.RemoveAll(parent); err == nil {
		err = removeErr
	}
	// Drops the record of a checkout whose directory was already gone.
	if _, pruneErr := run(ctx, repository, "worktree", "prune"); err == nil {
		err = pruneErr
	}
	return err
}

func resolved(path string) string {
	if real, err := filepath.EvalSymlinks(path); err == nil {
		path = real
	}
	return filepath.Clean(path)
}

// Changes stages everything in the checkout, in its own index, and diffs
// it against revision.
func (Workspaces) Changes(ctx context.Context, dir, revision string) ([]byte, error) {
	if _, err := run(ctx, dir, "add", "--all"); err != nil {
		return nil, err
	}
	out, err := run(ctx, dir, "diff", "--cached", "--binary", revision)
	return []byte(out), err
}

// Revision resolves {rev} to a commit.
type Revision struct{}

func (Revision) Resolve(ctx context.Context, spec app.InputSpec) (app.Resolved, error) {
	sha, err := commit(ctx, spec.Cwd, spec.Args["rev"])
	if err != nil {
		return app.Resolved{}, err
	}
	return app.Resolved{Value: sha, Identity: sha, Revision: true}, nil
}

// MergeBase resolves {base, head} to their merge-base commit.
type MergeBase struct{}

func (MergeBase) Resolve(ctx context.Context, spec app.InputSpec) (app.Resolved, error) {
	base, head, err := pair(ctx, spec)
	if err != nil {
		return app.Resolved{}, err
	}
	out, err := run(ctx, spec.Cwd, "merge-base", base, head)
	if err != nil {
		return app.Resolved{}, err
	}
	sha := strings.TrimSpace(out)
	return app.Resolved{Value: sha, Identity: sha, Revision: true}, nil
}

// Diff is the change from merge-base(base, head) to head.
type Diff struct{}

func (Diff) Resolve(ctx context.Context, spec app.InputSpec) (app.Resolved, error) {
	from, head, err := range_(ctx, spec)
	if err != nil {
		return app.Resolved{}, err
	}
	out, err := run(ctx, spec.Cwd, "diff", from, head)
	if err != nil {
		return app.Resolved{}, err
	}
	if out == "" {
		return app.Resolved{}, fmt.Errorf("no changes between %s and %s", spec.Args["base"], spec.Args["head"])
	}
	return app.Resolved{Value: out, Identity: digest(out)}, nil
}

// ChangedFiles lists files changed from merge-base(base, head) to head.
type ChangedFiles struct{}

func (ChangedFiles) Resolve(ctx context.Context, spec app.InputSpec) (app.Resolved, error) {
	from, head, err := range_(ctx, spec)
	if err != nil {
		return app.Resolved{}, err
	}
	// -z: names as they are, NUL-separated; not split on spaces, not quoted.
	out, err := run(ctx, spec.Cwd, "diff", "--name-only", "-z", from, head)
	if err != nil {
		return app.Resolved{}, err
	}
	files := strings.FieldsFunc(out, func(r rune) bool { return r == 0 })
	if len(files) == 0 {
		return app.Resolved{}, fmt.Errorf("no changes between %s and %s", spec.Args["base"], spec.Args["head"])
	}
	return app.Resolved{Value: files, Identity: digest(strings.Join(files, "\n"))}, nil
}

func pair(ctx context.Context, spec app.InputSpec) (string, string, error) {
	base, err := commit(ctx, spec.Cwd, spec.Args["base"])
	if err != nil {
		return "", "", err
	}
	head, err := commit(ctx, spec.Cwd, spec.Args["head"])
	if err != nil {
		return "", "", err
	}
	return base, head, nil
}

func range_(ctx context.Context, spec app.InputSpec) (string, string, error) {
	base, head, err := pair(ctx, spec)
	if err != nil {
		return "", "", err
	}
	out, err := run(ctx, spec.Cwd, "merge-base", base, head)
	if err != nil {
		return "", "", err
	}
	return strings.TrimSpace(out), head, nil
}

func digest(text string) string {
	sum := sha256.Sum256([]byte(text))
	return "sha256:" + hex.EncodeToString(sum[:])
}
