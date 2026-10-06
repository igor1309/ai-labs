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
	"syscall"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/app"
)

func run(ctx context.Context, dir string, args ...string) (string, error) {
	return runWith(ctx, dir, nil, nil, args...)
}

// runWith runs git with extra environment and stdin.
func runWith(ctx context.Context, dir string, env []string, stdin []byte, args ...string) (string, error) {
	return runCommand(exec.CommandContext(ctx, "git", args...), dir, env, stdin, nil)
}

// runHolding runs command, git or what stands in for it, holding lock, a
// locked lock file: the command shares its descriptor, so the lock lasts
// until both this process and the command have exited.
func runHolding(command *exec.Cmd, dir string, lock *os.File) (string, error) {
	return runCommand(command, dir, nil, nil, []*os.File{lock})
}

// runCommand runs command in dir with extra environment, stdin and open
// files.
func runCommand(command *exec.Cmd, dir string, env []string, stdin []byte, files []*os.File) (string, error) {
	command.Dir = dir
	command.ExtraFiles = files
	if env != nil {
		command.Env = append(os.Environ(), env...)
	}
	if stdin != nil {
		command.Stdin = bytes.NewReader(stdin)
	}
	var stdout, stderr bytes.Buffer
	command.Stdout, command.Stderr = &stdout, &stderr
	if err := command.Run(); err != nil {
		return "", fmt.Errorf("%s: %s", strings.Join(command.Args, " "), strings.TrimSpace(stderr.String()))
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

// Worktrees runs Agister's worktree changes in one repository one at a
// time: git worktree add reads each .git/worktrees/*/commondir, and dies on
// one a parallel add has created and not yet written. It holds one lock per
// repository, keyed by its git common directory: two paths into a
// repository, or two of its worktrees, share one. A process builds one and
// gives it to every Workspaces value it makes. Other processes are held
// back too, through a lock file per repository in Agister's own state
// directory, named by a digest of the same key: empty, it holds no state.
// git shares the locked descriptor, so a process killed while git runs
// leaves the lock held until git exits. Nothing is written to the
// repository for it.
type Worktrees struct {
	// Git, when set, runs the worktree command in place of git, under the
	// repository's locks: tests hold a command there. lock is the locked
	// lock file: a command started with it (exec.Cmd.ExtraFiles) keeps the
	// lock while it runs, should this process be killed first.
	Git func(ctx context.Context, dir string, lock *os.File, args ...string) (string, error)
	// Command, when set, makes the command the default Git runs for git
	// args, in place of git: it is run as git is, holding the lock. Tests
	// run a process of their own there.
	Command func(ctx context.Context, args ...string) *exec.Cmd
	// Waits, when set, is told that a command found a lock held, before it
	// waits: once per command, whichever lock it is.
	Waits func()
	// Timer starts the wait of retry between attempts at a lock file
	// another process holds: the next attempt is due when fired delivers,
	// and stop releases the wait. Nil means the wall clock.
	Timer func(wait time.Duration) (fired <-chan time.Time, stop func())
	// Clock tells the time a release or removal's cleanup deadline is
	// counted from. Nil means the wall clock.
	Clock interface{ Now() time.Time }

	locks string
	mu    sync.Mutex
	held  map[string]chan struct{}
}

// NewWorktrees makes the process's Worktrees, which keeps its lock files in
// locks, made when missing.
func NewWorktrees(locks string) *Worktrees { return &Worktrees{locks: locks} }

// retry is the default wait between attempts at a lock file.
const retry = 20 * time.Millisecond

// worktree runs git worktree args in repository once no other worktree
// command of the repository runs, in this process or another. A context
// that ends while it waits ends the wait with the context's error. started
// says the command was run: one that was not has changed nothing in the
// repository.
func (s *Worktrees) worktree(ctx context.Context, repository string, args ...string) (started bool, err error) {
	if s == nil || s.locks == "" {
		return false, errNoWorktrees
	}
	out, err := run(ctx, repository, "rev-parse", "--git-common-dir")
	if err != nil {
		if ctx.Err() != nil {
			return false, ctx.Err()
		}
		return false, err
	}
	common := strings.TrimSpace(out)
	if !filepath.IsAbs(common) {
		common = filepath.Join(repository, common)
	}
	// A relative repository gives a relative common directory: made
	// absolute, it is the key an absolute path to the repository gives.
	common, err = filepath.Abs(common)
	if err != nil {
		return false, err
	}
	common = resolved(common)
	waited := false
	waits := func() {
		if !waited && s.Waits != nil {
			s.Waits()
		}
		waited = true
	}
	lock := s.lock(common)
	select {
	case lock <- struct{}{}:
	default:
		waits()
		select {
		case lock <- struct{}{}:
		case <-ctx.Done():
			return false, ctx.Err()
		}
	}
	defer func() { <-lock }()
	file, err := s.lockFile(ctx, common, waits)
	if err != nil {
		return false, err
	}
	// Closing the descriptor drops this process's hold; the file stays.
	defer file.Close()
	git := s.Git
	if git == nil {
		git = s.holding
	}
	_, err = git(ctx, repository, file, append([]string{"worktree"}, args...)...)
	return true, err
}

// lockFile takes the exclusive lock on the lock file of the repository
// whose git common directory is common, trying again after each pause
// while another process holds it and ctx lasts, and returns the file
// locked. The lock is the open file's: it lasts until every descriptor of
// it, this process's and any a child shares, is closed.
func (s *Worktrees) lockFile(ctx context.Context, common string, waits func()) (*os.File, error) {
	if err := os.MkdirAll(s.locks, 0o700); err != nil {
		return nil, err
	}
	sum := sha256.Sum256([]byte(common))
	file, err := os.OpenFile(filepath.Join(s.locks, hex.EncodeToString(sum[:])+".lock"), os.O_RDWR|os.O_CREATE, 0o600)
	if err != nil {
		return nil, err
	}
	pause := func(ctx context.Context) {
		fired, stop := s.timer(retry)
		defer stop()
		select {
		case <-fired:
		case <-ctx.Done():
		}
	}
	for {
		err := syscall.Flock(int(file.Fd()), syscall.LOCK_EX|syscall.LOCK_NB)
		if err == nil {
			break
		}
		if !errors.Is(err, syscall.EWOULDBLOCK) && !errors.Is(err, syscall.EINTR) {
			file.Close()
			return nil, fmt.Errorf("locking %s: %w", file.Name(), err)
		}
		if errors.Is(err, syscall.EWOULDBLOCK) {
			waits()
			pause(ctx)
		}
		if ctx.Err() != nil {
			file.Close()
			return nil, ctx.Err()
		}
	}
	return file, nil
}

// timer starts a wait on the Timer, or on the wall clock without one.
func (s *Worktrees) timer(wait time.Duration) (<-chan time.Time, func()) {
	if s.Timer != nil {
		return s.Timer(wait)
	}
	timer := time.NewTimer(wait)
	return timer.C, func() { timer.Stop() }
}

// now is the time on the Clock, or on the wall clock without one.
func (s *Worktrees) now() time.Time {
	if s == nil || s.Clock == nil {
		return time.Now()
	}
	return s.Clock.Now()
}

// holding is the default Git: it runs git args, or the command Command
// makes for them, in dir holding lock.
func (s *Worktrees) holding(ctx context.Context, dir string, lock *os.File, args ...string) (string, error) {
	command := s.Command
	if command == nil {
		command = func(ctx context.Context, args ...string) *exec.Cmd { return exec.CommandContext(ctx, "git", args...) }
	}
	return runHolding(command(ctx, args...), dir, lock)
}

func (s *Worktrees) lock(common string) chan struct{} {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.held == nil {
		s.held = map[string]chan struct{}{}
	}
	if s.held[common] == nil {
		s.held[common] = make(chan struct{}, 1)
	}
	return s.held[common]
}

// worktreeCommands is what Workspaces needs to change a repository's
// worktrees: git worktree args run in repository, in its turn among the
// repository's worktree commands. started says the command was run. now
// is the time a cleanup deadline is counted from.
type worktreeCommands interface {
	worktree(ctx context.Context, repository string, args ...string) (started bool, err error)
	now() time.Time
}

var errNoWorktrees = errors.New("git worktree: Workspaces built without NewWorkspaces over NewWorktrees")

// Workspaces locates repositories and makes detached checkouts. Its
// worktree changes go through worktrees: the zero value makes none.
type Workspaces struct {
	// Cleanup, when set, gives the bounded context a checkout's release or
	// a removal runs under, in place of a deadline of cleanupDeadline from
	// now on the worktrees' clock: tests make it pass at will.
	Cleanup func(ctx context.Context) (context.Context, context.CancelFunc)

	worktrees worktreeCommands
}

// cleanupDeadline bounds a release or removal, waits for the lock another
// process holds included.
const cleanupDeadline = time.Minute

// cleanup bounds ctx for a release or removal.
func (w Workspaces) cleanup(ctx context.Context) (context.Context, context.CancelFunc) {
	if w.Cleanup != nil {
		return w.Cleanup(ctx)
	}
	now := time.Now()
	if w.worktrees != nil {
		now = w.worktrees.now()
	}
	return context.WithDeadline(ctx, now.Add(cleanupDeadline))
}

// NewWorkspaces makes Workspaces whose worktree changes take their turn in
// worktrees, the one of the process.
func NewWorkspaces(worktrees worktreeCommands) Workspaces { return Workspaces{worktrees: worktrees} }

// worktree runs a worktree command in its turn; the zero value runs none.
func (w Workspaces) worktree(ctx context.Context, repository string, args ...string) (started bool, err error) {
	if w.worktrees == nil {
		return false, errNoWorktrees
	}
	return w.worktrees.worktree(ctx, repository, args...)
}

func (Workspaces) Root(ctx context.Context, cwd string) (string, error) {
	out, err := run(ctx, cwd, "rev-parse", "--show-toplevel")
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(out), nil
}

// SameRepository compares the canonical Git common directories, shared
// by all worktrees of a repository.
func (Workspaces) SameRepository(ctx context.Context, first, second string) (bool, error) {
	a, err := commonDirectory(ctx, first)
	if err != nil {
		return false, err
	}
	b, err := commonDirectory(ctx, second)
	return a == b, err
}

// RepositoryIdentity names a repository independently of its worktrees.
func (Workspaces) RepositoryIdentity(ctx context.Context, repository string) (string, error) {
	return commonDirectory(ctx, repository)
}

func commonDirectory(ctx context.Context, repository string) (string, error) {
	out, err := run(ctx, repository, "rev-parse", "--git-common-dir")
	if err != nil {
		return "", err
	}
	common := strings.TrimSpace(out)
	if !filepath.IsAbs(common) {
		common = filepath.Join(repository, common)
	}
	common, err = filepath.Abs(common)
	if err != nil {
		return "", err
	}
	return filepath.EvalSymlinks(common)
}

func (w Workspaces) Checkout(ctx context.Context, repository, revision string) (string, func() error, error) {
	parent, err := os.MkdirTemp("", "agister-checkout-")
	if err != nil {
		return "", nil, err
	}
	dir := filepath.Join(parent, workspace(filepath.Base(parent)))
	if _, err := w.worktree(ctx, repository, "add", "--detach", "--quiet", dir, revision); err != nil {
		os.RemoveAll(parent)
		return "", nil, err
	}
	release := func() error {
		// Independent of the call's cancellation, but bounded.
		ctx, cancel := w.cleanup(context.WithoutCancel(ctx))
		defer cancel()
		_, err := w.worktree(ctx, repository, "remove", "--force", dir)
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
// (app.ErrPlaceTaken); a copy it cannot finish, it removes. A copy whose
// worktree add never started, as when ctx ends while it waits its turn,
// left nothing in the repository: only the directory made for it is
// removed, with no second wait, and the error says that nothing is left
// to discard (app.ErrCopyNotStarted).
func (w Workspaces) Copy(ctx context.Context, repository, dir, revision string, patch []byte) error {
	if err := made(dir); err != nil {
		return err
	}
	if err := os.Mkdir(filepath.Dir(dir), 0o700); errors.Is(err, fs.ErrExist) {
		return fmt.Errorf("%s: %w", filepath.Dir(dir), app.ErrPlaceTaken)
	} else if err != nil {
		return err
	}
	started, err := w.worktree(ctx, repository, "add", "--detach", "--quiet", dir, revision)
	if !started {
		if removeErr := os.Remove(filepath.Dir(dir)); removeErr != nil {
			return errors.Join(err, removeErr)
		}
		return fmt.Errorf("%w: %w", app.ErrCopyNotStarted, err)
	}
	if err == nil && len(patch) > 0 {
		err = w.Apply(ctx, dir, patch, false)
	}
	if err != nil {
		_ = w.Discard(context.WithoutCancel(ctx), repository, dir)
		return err
	}
	return nil
}

// Apply applies patch, as Changes makes it, to dir's files, not its index;
// with check, it only checks that the whole patch applies and changes
// nothing. A patch that does not apply changes nothing either.
func (Workspaces) Apply(ctx context.Context, dir string, patch []byte, check bool) error {
	args := []string{"apply", "--binary", "--whitespace=nowarn"}
	if check {
		args = append(args, "--check")
	}
	_, err := runWith(ctx, dir, nil, patch, append(args, "-")...)
	return err
}

// Discard removes a checkout whose call ended without releasing it, or a
// clean copy. Only a directory Checkout or Copy could have made is touched:
// <temp>/agister-checkout-<id>/workspace-<id>, or <temp>/agister-checkout-*/workspace
// as earlier versions made them. The removal is bounded by a deadline of
// its own, as well as by ctx.
func (w Workspaces) Discard(ctx context.Context, repository, dir string) error {
	if err := made(dir); err != nil {
		return err
	}
	ctx, cancel := w.cleanup(ctx)
	defer cancel()
	parent := filepath.Dir(dir)
	// Removes this checkout's record even when its directory is already
	// gone; a checkout with no record left is already discarded. Other
	// worktrees' records are the repository's, never pruned here. Git
	// records the real path, and cannot resolve a symlinked temp directory
	// (/var on macOS) under a parent that is gone, so it is given resolved.
	recorded := filepath.Join(resolved(filepath.Dir(parent)), filepath.Base(parent), filepath.Base(dir))
	_, err := w.worktree(ctx, repository, "remove", "--force", recorded)
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

// State reads what decides whether the worktree at dir is still as
// revision left it, besides its content: the commit HEAD names, revision's
// tree, and, as status reports them whatever the configuration says, the
// staged paths, the dirty submodules and the untracked files that are not
// ignored. It writes nothing in the worktree, its index included.
func (Workspaces) State(ctx context.Context, dir, revision string) (app.WorktreeState, error) {
	var state app.WorktreeState
	head, err := run(ctx, dir, "rev-parse", "--verify", "HEAD")
	if err != nil {
		return state, err
	}
	state.Head = strings.TrimSpace(head)
	tree, err := run(ctx, dir, "rev-parse", "--verify", revision+"^{tree}")
	if err != nil {
		return state, err
	}
	state.Tree = strings.TrimSpace(tree)
	status, err := run(ctx, dir, "--no-optional-locks", "status", "--porcelain=v2", "-z", "--untracked-files=normal", "--ignore-submodules=none")
	if err != nil {
		return state, err
	}
	fields := strings.Split(status, "\x00")
	for i := 0; i < len(fields); i++ {
		entry := fields[i]
		kind, rest, _ := strings.Cut(entry, " ")
		switch kind {
		case "?":
			state.Untracked = append(state.Untracked, rest)
		case "1", "2", "u":
			// <XY> <sub> ... <path>; a rename's original path follows in a
			// field of its own.
			parts := strings.SplitN(rest, " ", map[string]int{"1": 8, "2": 9, "u": 10}[kind])
			if kind == "2" {
				i++
			}
			if len(parts) < 3 {
				return state, fmt.Errorf("git status: unexpected entry %q", entry)
			}
			xy, sub, path := parts[0], parts[1], parts[len(parts)-1]
			if kind == "u" || xy[0] != '.' {
				state.Staged = append(state.Staged, path)
			}
			if strings.HasPrefix(sub, "S") && sub != "S..." {
				state.DirtySubmodules = append(state.DirtySubmodules, path)
			}
		}
	}
	return state, nil
}

// Changes is the binary patch from one tree or commit to another, as plain
// git would apply it: no external diff, text conversion or colour, and the
// standard prefixes, whatever the configuration says.
func (Workspaces) Changes(ctx context.Context, dir, from, to string) ([]byte, error) {
	out, err := run(ctx, dir, "diff", "--binary", "--no-ext-diff", "--no-textconv", "--no-color",
		"--src-prefix=a/", "--dst-prefix=b/", from, to, "--")
	return []byte(out), err
}

// Rebuild names the content revision has with patch applied, as Identity
// names a checkout: the tree it writes through an index of its own, seeded
// from revision, with the patch applied there. No checkout is made, and
// nothing in dir, its index included, is read or written but the
// repository's objects.
func (Workspaces) Rebuild(ctx context.Context, dir, revision string, patch []byte) (string, error) {
	var tree string
	err := scratchIndex(func(env []string) error {
		if _, err := runWith(ctx, dir, env, nil, "read-tree", revision); err != nil {
			return err
		}
		// An empty patch is no change, which apply would refuse.
		if len(patch) > 0 {
			if _, err := runWith(ctx, dir, env, patch, "apply", "--cached", "--binary", "-"); err != nil {
				return err
			}
		}
		out, err := runWith(ctx, dir, env, nil, "write-tree")
		tree = strings.TrimSpace(out)
		return err
	})
	return tree, err
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
