// Package git provides repository workspaces and git input sources.
// Every input is resolved to an immutable identity: revisions to commits,
// derived content to a digest over the commits it came from.
package git

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"

	"github.com/igor1309/ai-labs/agister/internal/app"
)

func run(ctx context.Context, dir string, args ...string) (string, error) {
	return runWith(ctx, dir, nil, nil, args...)
}

// runWith runs git with extra environment and stdin.
func runWith(ctx context.Context, dir string, env []string, stdin []byte, args ...string) (string, error) {
	command := exec.CommandContext(ctx, "git", args...)
	command.Dir = dir
	if env != nil {
		command.Env = append(os.Environ(), env...)
	}
	if stdin != nil {
		command.Stdin = bytes.NewReader(stdin)
	}
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

// worktrees runs Agister's worktree changes in one repository one at a
// time, for every Workspaces value of the process: git worktree add reads
// each .git/worktrees/*/commondir, and dies on one a parallel add has
// created and not yet written. Only this process is held back, and nothing
// is written to the repository for it.
var worktrees = &serial{git: run}

// serial holds one lock per repository, keyed by its git common directory:
// two paths into a repository, or two of its worktrees, share one.
type serial struct {
	// git runs the worktree command, under the repository's lock.
	git func(ctx context.Context, dir string, args ...string) (string, error)
	// waits, when set, is told that a command found the lock held, before
	// it waits.
	waits func()

	mu    sync.Mutex
	locks map[string]chan struct{}
}

// worktree runs git worktree args in repository once no other worktree
// command of the repository runs. A context that ends while it waits ends
// the wait with the context's error.
func (s *serial) worktree(ctx context.Context, repository string, args ...string) (string, error) {
	out, err := run(ctx, repository, "rev-parse", "--git-common-dir")
	if err != nil {
		if ctx.Err() != nil {
			return "", ctx.Err()
		}
		return "", err
	}
	common := strings.TrimSpace(out)
	if !filepath.IsAbs(common) {
		common = filepath.Join(repository, common)
	}
	lock := s.lock(resolved(common))
	select {
	case lock <- struct{}{}:
	default:
		if s.waits != nil {
			s.waits()
		}
		select {
		case lock <- struct{}{}:
		case <-ctx.Done():
			return "", ctx.Err()
		}
	}
	defer func() { <-lock }()
	return s.git(ctx, repository, append([]string{"worktree"}, args...)...)
}

func (s *serial) lock(common string) chan struct{} {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.locks == nil {
		s.locks = map[string]chan struct{}{}
	}
	if s.locks[common] == nil {
		s.locks[common] = make(chan struct{}, 1)
	}
	return s.locks[common]
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
	dir := filepath.Join(parent, workspace(filepath.Base(parent)))
	if _, err := worktrees.worktree(ctx, repository, "add", "--detach", "--quiet", dir, revision); err != nil {
		os.RemoveAll(parent)
		return "", nil, err
	}
	release := func() error {
		_, err := worktrees.worktree(context.WithoutCancel(ctx), repository, "remove", "--force", dir)
		if removeErr := os.RemoveAll(parent); err == nil {
			err = removeErr
		}
		return err
	}
	return dir, release, nil
}

// Place names the directory the clean copies of call are made in: the
// same for every attempt of the call, one no other call's copies use, and
// shaped as Discard removes it. Nothing is made there: the call records it
// first, so a copy is never on disk before it is on record.
func (Workspaces) Place(call string) string {
	parent := "agister-checkout-" + call + "-copy"
	return filepath.Join(os.TempDir(), parent, workspace(parent))
}

// workspace names the checkout in parent after parent's own unique part:
// git names a worktree's admin directory after its basename, so checkouts
// made at the same time in one repository never race on one name.
func workspace(parent string) string {
	return "workspace-" + strings.TrimPrefix(parent, "agister-checkout-")
}

// Copy checks revision out at dir, a directory Place named, as Checkout
// does, and applies patch to its files, not its index: where a
// verification run checks exactly what the patch delivers. Whatever is at
// dir already is not this copy's, so Copy refuses without touching it
// (app.ErrPlaceTaken); a copy it cannot finish, it removes.
func (w Workspaces) Copy(ctx context.Context, repository, dir, revision string, patch []byte) error {
	if err := made(dir); err != nil {
		return err
	}
	if err := os.Mkdir(filepath.Dir(dir), 0o700); errors.Is(err, fs.ErrExist) {
		return fmt.Errorf("%s: %w", filepath.Dir(dir), app.ErrPlaceTaken)
	} else if err != nil {
		return err
	}
	_, err := worktrees.worktree(ctx, repository, "add", "--detach", "--quiet", dir, revision)
	if err == nil && len(patch) > 0 {
		_, err = runWith(ctx, dir, nil, patch, "apply", "--binary", "--whitespace=nowarn", "-")
	}
	if err != nil {
		_ = w.Discard(context.WithoutCancel(ctx), repository, dir)
		return err
	}
	return nil
}

// Discard removes a checkout whose call ended without releasing it, or a
// clean copy. Only a directory Checkout or Copy could have made is touched:
// <temp>/agister-checkout-<id>/workspace-<id>, or <temp>/agister-checkout-*/workspace
// as earlier versions made them.
func (Workspaces) Discard(ctx context.Context, repository, dir string) error {
	if err := made(dir); err != nil {
		return err
	}
	parent := filepath.Dir(dir)
	// Removes this checkout's record even when its directory is already
	// gone; a checkout with no record left is already discarded. Other
	// worktrees' records are the repository's, never pruned here. Git
	// records the real path, and cannot resolve a symlinked temp directory
	// (/var on macOS) under a parent that is gone, so it is given resolved.
	recorded := filepath.Join(resolved(filepath.Dir(parent)), filepath.Base(parent), filepath.Base(dir))
	_, err := worktrees.worktree(ctx, repository, "remove", "--force", recorded)
	if err != nil && strings.Contains(err.Error(), "is not a working tree") {
		err = nil
	}
	if removeErr := os.RemoveAll(parent); err == nil {
		err = removeErr
	}
	return err
}

// made refuses a directory Checkout, Place and Copy could not have made, now
// or under the name "workspace" earlier versions gave every checkout.
func made(dir string) error {
	parent := filepath.Dir(dir)
	if base := filepath.Base(dir); base != "workspace" && base != workspace(filepath.Base(parent)) ||
		!strings.HasPrefix(filepath.Base(parent), "agister-checkout-") ||
		resolved(filepath.Dir(parent)) != resolved(os.TempDir()) {
		return fmt.Errorf("%s is not a checkout Agister made", dir)
	}
	return nil
}

func resolved(path string) string {
	if real, err := filepath.EvalSymlinks(path); err == nil {
		path = real
	}
	return filepath.Clean(path)
}

// Identity writes the checkout's content as a tree through an index of its
// own, and returns the tree: the files of revision as the checkout has them
// now, whatever is committed, and its untracked files that are not ignored.
// The checkout's own index is neither read nor written: its flags
// (assume-unchanged, skip-worktree) could hide content.
func (Workspaces) Identity(ctx context.Context, dir, revision string) (string, error) {
	var tree string
	err := scratchIndex(func(env []string) error {
		// Seeded from revision, the files it tracks stay tracked whatever the
		// ignore rules say.
		if _, err := runWith(ctx, dir, env, nil, "read-tree", revision); err != nil {
			return err
		}
		if _, err := runWith(ctx, dir, env, nil, "add", "--all", "--", "."); err != nil {
			return err
		}
		out, err := runWith(ctx, dir, env, nil, "write-tree")
		tree = strings.TrimSpace(out)
		return err
	})
	return tree, err
}

// Changes is the binary patch from one tree or commit to another, as plain
// git would apply it: no external diff, text conversion or colour, and the
// standard prefixes, whatever the configuration says.
func (Workspaces) Changes(ctx context.Context, dir, from, to string) ([]byte, error) {
	out, err := run(ctx, dir, "diff", "--binary", "--no-ext-diff", "--no-textconv", "--no-color",
		"--src-prefix=a/", "--dst-prefix=b/", from, to, "--")
	return []byte(out), err
}

// scratchIndex gives do the environment of a temporary index, removed after.
func scratchIndex(do func(env []string) error) error {
	scratch, err := os.MkdirTemp("", "agister-index-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(scratch)
	return do([]string{"GIT_INDEX_FILE=" + filepath.Join(scratch, "index")})
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
