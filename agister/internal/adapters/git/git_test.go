package git_test

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/adapters/git"
	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

func sh(t *testing.T, dir string, args ...string) string {
	t.Helper()
	command := exec.Command("git", args...)
	command.Dir = dir
	out, err := command.CombinedOutput()
	if err != nil {
		t.Fatalf("git %v: %v\n%s", args, err, out)
	}
	return strings.TrimSpace(string(out))
}

func repository(t *testing.T) string {
	dir := t.TempDir()
	sh(t, dir, "init", "--quiet", "--initial-branch=main")
	sh(t, dir, "config", "user.email", "t@example.com")
	sh(t, dir, "config", "user.name", "T")
	// Git >= 2.47 detaches the maintenance a commit triggers; a background
	// writer in .git would race the test's temporary-directory cleanup.
	sh(t, dir, "config", "maintenance.auto", "false")
	os.WriteFile(filepath.Join(dir, "a.txt"), []byte("one\n"), 0o600)
	sh(t, dir, "add", ".")
	sh(t, dir, "commit", "--quiet", "-m", "base")
	sh(t, dir, "checkout", "--quiet", "-b", "feature")
	os.WriteFile(filepath.Join(dir, "a.txt"), []byte("one\ntwo\n"), 0o600)
	os.WriteFile(filepath.Join(dir, "b.txt"), []byte("new\n"), 0o600)
	sh(t, dir, "add", ".")
	sh(t, dir, "commit", "--quiet", "-m", "candidate")
	return dir
}

func resolve(t *testing.T, provider app.InputProvider, dir string, args map[string]string) app.Resolved {
	t.Helper()
	resolved, err := provider.Resolve(context.Background(), app.InputSpec{Args: args, Cwd: dir})
	if err != nil {
		t.Fatal(err)
	}
	return resolved
}

func TestInputsResolveToImmutableIdentities(t *testing.T) {
	dir := repository(t)
	head, base := sh(t, dir, "rev-parse", "HEAD"), sh(t, dir, "rev-parse", "main")

	if r := resolve(t, git.Revision{}, dir, map[string]string{"rev": "feature"}); r.Identity != head || !r.Revision {
		t.Fatalf("revision = %+v", r)
	}
	if r := resolve(t, git.MergeBase{}, dir, map[string]string{"base": "main", "head": "feature"}); r.Identity != base || !r.Revision {
		t.Fatalf("merge base = %+v", r)
	}
	diff := resolve(t, git.Diff{}, dir, map[string]string{"base": "main", "head": "feature"})
	if !strings.Contains(diff.Value.(string), "+two") || !strings.HasPrefix(diff.Identity, "sha256:") || diff.Revision {
		t.Fatalf("diff = %+v", diff)
	}
	// Same commits, same identity, whatever the ref names.
	if again := resolve(t, git.Diff{}, dir, map[string]string{"base": base, "head": head}); again.Identity != diff.Identity {
		t.Fatal("diff identity depends on ref names")
	}
	if files := resolve(t, git.ChangedFiles{}, dir, map[string]string{"base": "main", "head": "feature"}); !reflect.DeepEqual(files.Value, []string{"a.txt", "b.txt"}) {
		t.Fatalf("files = %+v", files)
	}
}

// File names reach the agent as they are: not split on spaces, not quoted.
func TestChangedFilesKeepTheirNames(t *testing.T) {
	dir := repository(t)
	for _, name := range []string{"my notes.md", "café.md"} {
		os.WriteFile(filepath.Join(dir, name), []byte("x\n"), 0o600)
	}
	sh(t, dir, "add", ".")
	sh(t, dir, "commit", "--quiet", "-m", "names")
	files := resolve(t, git.ChangedFiles{}, dir, map[string]string{"base": "main", "head": "feature"})
	if want := []string{"a.txt", "b.txt", "café.md", "my notes.md"}; !reflect.DeepEqual(files.Value, want) {
		t.Fatalf("files = %q, want %q", files.Value, want)
	}
}

func TestInputErrors(t *testing.T) {
	dir := repository(t)
	for name, c := range map[string]struct {
		provider app.InputProvider
		args     map[string]string
		want     string
	}{
		"unknown revision": {git.Revision{}, map[string]string{"rev": "nope"}, "not a commit: nope"},
		"empty revision":   {git.Revision{}, map[string]string{}, "empty revision"},
		"no changes":       {git.Diff{}, map[string]string{"base": "HEAD", "head": "HEAD"}, "no changes"},
	} {
		if _, err := c.provider.Resolve(context.Background(), app.InputSpec{Args: c.args, Cwd: dir}); err == nil || !strings.Contains(err.Error(), c.want) {
			t.Errorf("%s: %v", name, err)
		}
	}
}

func TestCheckoutIsDetachedAndReleased(t *testing.T) {
	dir := repository(t)
	base := sh(t, dir, "rev-parse", "main")
	workspaces := git.Workspaces{}
	root, err := workspaces.Root(context.Background(), filepath.Join(dir))
	if err != nil {
		t.Fatal(err)
	}
	checkout, release, err := workspaces.Checkout(context.Background(), root, base)
	if err != nil {
		t.Fatal(err)
	}
	if data, _ := os.ReadFile(filepath.Join(checkout, "a.txt")); string(data) != "one\n" {
		t.Fatalf("checkout content = %q", data)
	}
	if err := release(); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(checkout); !os.IsNotExist(err) {
		t.Fatal("checkout left behind")
	}
	if lines := strings.Split(sh(t, dir, "worktree", "list"), "\n"); len(lines) != 1 {
		t.Fatalf("worktrees = %v", lines)
	}
}

// The content identity covers what is committed, edited and untracked, but
// not ignored; the patch from the revision to it, applied to a copy of the
// revision, makes that content exactly, and neither touches the checkout's
// own index.
func TestChangesCoverEverythingSinceTheRevision(t *testing.T) {
	repo := repository(t)
	ctx := context.Background()
	workspaces := git.Workspaces{}
	revision := sh(t, repo, "rev-parse", "HEAD")
	dir, release, err := workspaces.Checkout(ctx, repo, revision)
	if err != nil {
		t.Fatal(err)
	}
	defer release()
	untouched, err := workspaces.Identity(ctx, dir, revision)
	if err != nil || untouched != sh(t, repo, "rev-parse", revision+"^{tree}") {
		t.Fatalf("untouched checkout: %q, %v", untouched, err)
	}
	if patch, err := workspaces.Changes(ctx, dir, revision, untouched); err != nil || len(patch) != 0 {
		t.Fatalf("untouched checkout: %q, %v", patch, err)
	}
	// A commit in the checkout, an edit, an untracked file, a binary one,
	// an ignored one, and an edit its own index is told to overlook.
	os.WriteFile(filepath.Join(dir, "c.txt"), []byte("committed\n"), 0o600)
	sh(t, dir, "add", "c.txt")
	sh(t, dir, "-c", "user.email=a@example.com", "-c", "user.name=A", "commit", "--quiet", "-m", "agent")
	os.WriteFile(filepath.Join(dir, "a.txt"), []byte("edited\n"), 0o600)
	os.WriteFile(filepath.Join(dir, "d.txt"), []byte("untracked\n"), 0o600)
	os.WriteFile(filepath.Join(dir, "e.bin"), []byte{0, 1, 2, 0xff}, 0o600)
	os.WriteFile(filepath.Join(dir, ".gitignore"), []byte("*.log\n"), 0o600)
	os.WriteFile(filepath.Join(dir, "x.log"), []byte("ignored\n"), 0o600)
	sh(t, dir, "update-index", "--assume-unchanged", "b.txt")
	os.WriteFile(filepath.Join(dir, "b.txt"), []byte("hidden from the index\n"), 0o600)
	status := sh(t, dir, "status", "--porcelain")

	identity, err := workspaces.Identity(ctx, dir, revision)
	if err != nil {
		t.Fatal(err)
	}
	patch, err := workspaces.Changes(ctx, dir, revision, identity)
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"b/a.txt", "b/b.txt", "b/c.txt", "b/d.txt", "b/e.bin", "GIT binary patch", "+edited"} {
		if !strings.Contains(string(patch), want) {
			t.Fatalf("patch misses %s:\n%s", want, patch)
		}
	}
	if strings.Contains(string(patch), "x.log") {
		t.Fatalf("patch has the ignored file:\n%s", patch)
	}
	if copied := copied(t, repo, revision, patch); copied != identity {
		t.Fatalf("the copy has %s; want %s", copied, identity)
	}
	// A patch that leaves something out makes other content.
	if copied := copied(t, repo, revision, nil); copied != untouched {
		t.Fatalf("the copy has %s; want %s", copied, untouched)
	}
	// The checkout's own index and the repository are untouched.
	if after := sh(t, dir, "status", "--porcelain"); after != status {
		t.Fatalf("checkout status %q, was %q", after, status)
	}
	if status := sh(t, repo, "status", "--porcelain"); status != "" {
		t.Fatalf("repository changed: %s", status)
	}
}

// Files the revision tracks stay content though they match .gitignore:
// unchanged, they are not in the patch at all, and an edit to one is.
// Untracked files that match stay out.
func TestTrackedIgnoredFilesStayContent(t *testing.T) {
	repo := repository(t)
	ctx := context.Background()
	workspaces := git.Workspaces{}
	os.WriteFile(filepath.Join(repo, ".gitignore"), []byte("*.log\n"), 0o600)
	os.WriteFile(filepath.Join(repo, "kept.log"), []byte("kept\n"), 0o600)
	os.WriteFile(filepath.Join(repo, "edited.log"), []byte("before\n"), 0o600)
	sh(t, repo, "add", "--force", ".gitignore", "kept.log", "edited.log")
	sh(t, repo, "commit", "--quiet", "-m", "tracked, though ignored")
	revision := sh(t, repo, "rev-parse", "HEAD")
	dir, release, err := workspaces.Checkout(ctx, repo, revision)
	if err != nil {
		t.Fatal(err)
	}
	defer release()
	if untouched, err := workspaces.Identity(ctx, dir, revision); err != nil || untouched != sh(t, repo, "rev-parse", revision+"^{tree}") {
		t.Fatalf("untouched checkout: %q, %v", untouched, err)
	}

	os.WriteFile(filepath.Join(dir, "edited.log"), []byte("after\n"), 0o600)
	os.WriteFile(filepath.Join(dir, "new.log"), []byte("untracked\n"), 0o600)
	identity, err := workspaces.Identity(ctx, dir, revision)
	if err != nil {
		t.Fatal(err)
	}
	patch, err := workspaces.Changes(ctx, dir, revision, identity)
	if err != nil {
		t.Fatal(err)
	}
	if text := string(patch); !strings.Contains(text, "+++ b/edited.log") || !strings.Contains(text, "+after") ||
		strings.Contains(text, "kept.log") || strings.Contains(text, "new.log") || strings.Contains(text, "deleted file") {
		t.Fatalf("patch:\n%s", patch)
	}
	if copied := copied(t, repo, revision, patch); copied != identity {
		t.Fatalf("the copy has %s; want %s", copied, identity)
	}
}

// copied names the content of a copy of revision with patch applied, and
// removes the copy, as a verification attempt does.
func copied(t *testing.T, repo, revision string, patch []byte) string {
	t.Helper()
	ctx := context.Background()
	workspaces := git.Workspaces{}
	dir := workspaces.Place(call())
	if err := workspaces.Copy(ctx, repo, dir, revision, patch); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = workspaces.Discard(context.Background(), repo, dir) })
	identity, err := workspaces.Identity(ctx, dir, revision)
	if err != nil {
		t.Fatal(err)
	}
	if err := workspaces.Discard(ctx, repo, dir); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Dir(dir)); !os.IsNotExist(err) {
		t.Fatalf("copy %s left behind", dir)
	}
	if lines := strings.Split(sh(t, repo, "worktree", "list"), "\n"); len(lines) != 2 {
		t.Fatalf("worktrees = %v", lines)
	}
	return identity
}

// call names a call no other test's copies use.
func call() string { return fmt.Sprintf("test-%d-%d", os.Getpid(), calls.Add(1)) }

var calls atomic.Int64

// A patch that does not apply fails the copy with git's error, and leaves
// neither a directory nor a worktree registration behind.
func TestACopyWhosePatchDoesNotApplyLeavesNothing(t *testing.T) {
	repo := repository(t)
	ctx := context.Background()
	workspaces := git.Workspaces{}
	dir := workspaces.Place(call())
	err := workspaces.Copy(ctx, repo, dir, sh(t, repo, "rev-parse", "HEAD"), []byte("not a git patch\n"))
	t.Cleanup(func() { _ = workspaces.Discard(context.Background(), repo, dir) })
	if err == nil || !strings.Contains(err.Error(), "git apply") {
		t.Fatalf("copy = %v", err)
	}
	if _, err := os.Stat(filepath.Dir(dir)); !os.IsNotExist(err) {
		t.Fatalf("copy %s left behind: %v", dir, err)
	}
	if lines := strings.Split(sh(t, repo, "worktree", "list"), "\n"); len(lines) != 1 {
		t.Fatalf("worktrees = %v", lines)
	}
}

// A copy is never made over what is at its path already, which stays as
// it was.
func TestACopyIsNotMadeWhereSomethingIs(t *testing.T) {
	repo := repository(t)
	workspaces := git.Workspaces{}
	dir := workspaces.Place(call())
	if err := os.MkdirAll(dir, 0o700); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(filepath.Dir(dir)) })
	kept := filepath.Join(dir, "kept.txt")
	if err := os.WriteFile(kept, []byte("kept\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := workspaces.Copy(context.Background(), repo, dir, sh(t, repo, "rev-parse", "HEAD"), nil); !errors.Is(err, app.ErrPlaceTaken) {
		t.Fatalf("copy over an existing directory = %v", err)
	}
	if data, err := os.ReadFile(kept); err != nil || string(data) != "kept\n" {
		t.Fatalf("kept.txt = %q, %v", data, err)
	}
	if lines := strings.Split(sh(t, repo, "worktree", "list"), "\n"); len(lines) != 1 {
		t.Fatalf("worktrees = %v", lines)
	}
}

// A verifying call whose copy's place is taken fails, and leaves what is
// there as it was: it is not the call's, so nothing removes it, and the
// record no longer names it as the call's copy.
func TestAVerifierLeavesAnOccupiedPlaceAlone(t *testing.T) {
	repo := repository(t)
	ctx := context.Background()
	workspaces := git.Workspaces{}
	base := sh(t, repo, "rev-parse", "HEAD")
	checkout, release, err := workspaces.Checkout(ctx, repo, base)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = release() })
	record := run.Record{ID: call(), Turn: &run.Turn{Status: run.Completed, ProviderSessionID: "session"}}
	dir := workspaces.Place(record.ID)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(filepath.Dir(dir)) })
	kept := filepath.Join(dir, "kept.txt")
	if err := os.WriteFile(kept, []byte("kept\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	var copies []*run.Checkout // the copy on record at each update
	var turns int
	_, fault := app.NewVerifier(workspaces, workspaces, noCommands{t}, wallClock{}).Verify(ctx, app.VerifyCall{
		Record: &record, Result: &run.Result{},
		Event: func(string, string, map[string]any) {},
		Update: func(updated run.Record) error {
			var copy *run.Checkout
			if updated.Effects != nil {
				copy = updated.Effects.Copy
			}
			copies = append(copies, copy)
			return nil
		},
		Artifact: func(name string, data []byte) (run.Artifact, error) { return run.Artifact{Name: name}, nil },
		Verify:   definition.Verify{Command: "true", Timeout: time.Minute, MaxAttempts: 2},
		Deadline: time.Now().Add(time.Minute), Dir: checkout, Base: base, Repository: repo, Session: "session",
		Take:     func(app.TurnRequest, *run.SessionTotals) run.Turn { turns++; return run.Turn{} },
		Conclude: func(run.Turn) *run.Error { return nil },
	})
	if fault == nil || fault.Class != run.ClassInternal || !strings.Contains(fault.Message, "attempt 1 cannot make its clean copy") || turns != 0 {
		t.Fatalf("fault %v, repair turns %d", fault, turns)
	}
	if data, err := os.ReadFile(kept); err != nil || string(data) != "kept\n" {
		t.Fatalf("kept.txt = %q, %v", data, err)
	}
	if len(copies) < 2 || !reflect.DeepEqual(copies[0], &run.Checkout{Repository: repo, Dir: dir}) || copies[len(copies)-1] != nil {
		t.Fatalf("copies on record = %v", copies)
	}
	if record.Effects != nil && record.Effects.Copy != nil {
		t.Fatalf("effects = %+v", record.Effects)
	}
}

// noCommands fails a test that runs a verification command.
type noCommands struct{ t *testing.T }

func (c noCommands) Run(context.Context, app.CommandRequest, func(string) error) app.CommandResult {
	c.t.Error("the verification command ran")
	return app.CommandResult{Error: "not run"}
}

type wallClock struct{}

func (wallClock) Now() time.Time { return time.Now() }

// A checkout its call never released (the process was killed) is removed
// from disk and from the repository's worktree list.
func TestDiscardRemovesAnUnreleasedCheckout(t *testing.T) {
	repo := repository(t)
	ctx := context.Background()
	checkout, _, err := git.Workspaces{}.Checkout(ctx, repo, sh(t, repo, "rev-parse", "HEAD"))
	if err != nil {
		t.Fatal(err)
	}
	if err := (git.Workspaces{}).Discard(ctx, repo, checkout); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Dir(checkout)); !os.IsNotExist(err) {
		t.Fatal("checkout left behind")
	}
	if lines := strings.Split(sh(t, repo, "worktree", "list"), "\n"); len(lines) != 1 {
		t.Fatalf("worktrees = %v", lines)
	}
	// Already gone is success.
	if err := (git.Workspaces{}).Discard(ctx, repo, checkout); err != nil {
		t.Fatal(err)
	}
}

// Only a directory Checkout could have made is ever removed: each case
// breaks exactly one part of the pattern.
func TestDiscardRefusesOtherDirectories(t *testing.T) {
	repo := repository(t)
	parent, err := os.MkdirTemp("", "agister-checkout-")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(parent)
	otherParent, err := os.MkdirTemp("", "other-")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(otherParent)
	for name, dir := range map[string]string{
		"wrong name":           filepath.Join(parent, "other"),
		"another's name":       filepath.Join(parent, "workspace-other"),
		"wrong parent":         filepath.Join(otherParent, "workspace"),
		"outside the temp dir": filepath.Join(t.TempDir(), "agister-checkout-x", "workspace"),
		"the repository":       repo,
	} {
		os.MkdirAll(dir, 0o700)
		if err := (git.Workspaces{}).Discard(context.Background(), repo, dir); err == nil {
			t.Errorf("%s: discard succeeded", name)
		}
		if _, err := os.Stat(dir); err != nil {
			t.Errorf("%s: removed: %v", name, err)
		}
	}
}

// A checkout whose directory is already gone is still dropped from the
// worktree list, and discarding it succeeds.
func TestDiscardDropsACheckoutThatIsGone(t *testing.T) {
	repo := repository(t)
	ctx := context.Background()
	checkout, _, err := git.Workspaces{}.Checkout(ctx, repo, sh(t, repo, "rev-parse", "HEAD"))
	if err != nil {
		t.Fatal(err)
	}
	if err := os.RemoveAll(filepath.Dir(checkout)); err != nil {
		t.Fatal(err)
	}
	if err := (git.Workspaces{}).Discard(ctx, repo, checkout); err != nil {
		t.Fatal(err)
	}
	if lines := strings.Split(sh(t, repo, "worktree", "list"), "\n"); len(lines) != 1 {
		t.Fatalf("worktrees = %v", lines)
	}
}

// Discard removes only its own checkout: another worktree's stale record
// in the repository is the repository's, and survives.
func TestDiscardLeavesOtherStaleWorktreesAlone(t *testing.T) {
	repo := repository(t)
	ctx := context.Background()
	other := filepath.Join(t.TempDir(), "other")
	sh(t, repo, "worktree", "add", "--detach", "--quiet", other, "HEAD")
	if err := os.RemoveAll(other); err != nil {
		t.Fatal(err)
	}
	checkout, _, err := git.Workspaces{}.Checkout(ctx, repo, sh(t, repo, "rev-parse", "HEAD"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(filepath.Dir(checkout)) })
	if err := (git.Workspaces{}).Discard(ctx, repo, checkout); err != nil {
		t.Fatal(err)
	}
	list := sh(t, repo, "worktree", "list")
	if lines := strings.Split(list, "\n"); len(lines) != 2 || !strings.HasSuffix(lines[1], "prunable") ||
		!strings.Contains(lines[1], filepath.Base(other)) {
		t.Fatalf("worktrees = %v", lines)
	}
}

// Checkouts and copies made at the same time in one repository each get a
// worktree admin directory of their own, named after their own path.
func TestConcurrentCheckoutsAndCopiesHaveTheirOwnWorktrees(t *testing.T) {
	repo := repository(t)
	ctx := context.Background()
	workspaces := git.Workspaces{}
	revision := sh(t, repo, "rev-parse", "HEAD")
	const each = 4
	dirs := make([]string, 2*each)
	errs := make([]error, 2*each)
	var wg sync.WaitGroup
	for i := range each {
		dirs[each+i] = workspaces.Place(call())
		wg.Add(2)
		go func() {
			defer wg.Done()
			var release func() error
			dirs[i], release, errs[i] = workspaces.Checkout(ctx, repo, revision)
			if release != nil {
				t.Cleanup(func() { _ = release() })
			}
		}()
		go func() {
			defer wg.Done()
			errs[each+i] = workspaces.Copy(ctx, repo, dirs[each+i], revision, nil)
			t.Cleanup(func() { _ = workspaces.Discard(context.Background(), repo, dirs[each+i]) })
		}()
	}
	wg.Wait()
	admins := map[string]bool{}
	for i, dir := range dirs {
		if errs[i] != nil {
			t.Fatalf("%s: %v", dir, errs[i])
		}
		admin := filepath.Base(sh(t, dir, "rev-parse", "--git-dir"))
		if admin != filepath.Base(dir) || admins[admin] {
			t.Fatalf("%s has admin directory %s; others have %v", dir, admin, admins)
		}
		admins[admin] = true
	}
	if lines := strings.Split(sh(t, repo, "worktree", "list"), "\n"); len(lines) != 1+len(dirs) {
		t.Fatalf("worktrees = %v", lines)
	}
}

// A checkout left behind under the name earlier versions gave every
// checkout is still recognised and removed.
func TestDiscardRemovesACheckoutUnderTheOldName(t *testing.T) {
	repo := repository(t)
	parent, err := os.MkdirTemp("", "agister-checkout-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(parent) })
	checkout := filepath.Join(parent, "workspace")
	sh(t, repo, "worktree", "add", "--detach", "--quiet", checkout, "HEAD")
	if err := (git.Workspaces{}).Discard(context.Background(), repo, checkout); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(parent); !os.IsNotExist(err) {
		t.Fatal("checkout left behind")
	}
	if lines := strings.Split(sh(t, repo, "worktree", "list"), "\n"); len(lines) != 1 {
		t.Fatalf("worktrees = %v", lines)
	}
}
