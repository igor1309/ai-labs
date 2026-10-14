package git_test

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/adapters/git"
	"github.com/igor1309/ai-labs/agister/internal/app"
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

// oldCheckout is a checkout of HEAD in repo as runs made them before ADR-025,
// at <temp>/agister-checkout-<id>/workspace-<id>, left on record for the
// reap to remove; whatever the test leaves of it is removed at its end.
func oldCheckout(t *testing.T, repo string) string {
	t.Helper()
	parent, err := os.MkdirTemp("", "agister-checkout-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(parent) })
	dir := filepath.Join(parent, "workspace-"+strings.TrimPrefix(filepath.Base(parent), "agister-checkout-"))
	sh(t, repo, "worktree", "add", "--detach", "--quiet", dir, "HEAD")
	return dir
}

// linked is a linked worktree of repo, detached at revision.
func linked(t *testing.T, repo, revision string) string {
	t.Helper()
	dir := filepath.Join(t.TempDir(), "linked")
	sh(t, repo, "worktree", "add", "--detach", "--quiet", dir, revision)
	return dir
}

// Contract test: git worktree roots and gitlinks in a real repository's
// index, including staged submodules, independent descendant worktrees and
// roots whose names end in tabs and spaces.
func TestRootsAndTrackedSubmoduleBoundaries(t *testing.T) {
	t.Parallel()
	dir := repository(t)
	root, err := filepath.EvalSymlinks(dir)
	if err != nil {
		t.Fatal(err)
	}
	nested := filepath.Join(root, ".claude", "worktrees", "task")
	sh(t, root, "worktree", "add", "--detach", "--quiet", nested, "HEAD")
	plain := filepath.Join(root, "src")
	inside := filepath.Join(nested, "src")
	for _, path := range []string{plain, inside} {
		if err := os.MkdirAll(path, 0o700); err != nil {
			t.Fatal(err)
		}
	}
	module := filepath.Join(root, "lib \tmodule")
	sh(t, root, "-c", "protocol.file.allow=always", "submodule", "add", "--quiet", repository(t), "lib \tmodule")
	moduleInside := filepath.Join(module, "src")
	if err := os.Mkdir(moduleInside, 0o700); err != nil {
		t.Fatal(err)
	}
	embedded := filepath.Join(module, "nested")
	sh(t, root, "worktree", "add", "--detach", "--quiet", embedded, "HEAD")
	spaceRoot := filepath.Join(root, "task  ")
	tabRoot := filepath.Join(root, "task\t")
	for _, path := range []string{spaceRoot, tabRoot} {
		sh(t, root, "worktree", "add", "--detach", "--quiet", path, "HEAD")
	}
	// Configuration is insufficient: this nested worktree has no gitlink.
	sh(t, root, "config", "submodule.task.path", ".claude/worktrees/task")
	modulesFile, err := os.OpenFile(filepath.Join(root, ".gitmodules"), os.O_APPEND|os.O_WRONLY, 0)
	if err != nil {
		t.Fatal(err)
	}
	_, writeErr := modulesFile.WriteString("\n[submodule \"task\"]\n\tpath = .claude/worktrees/task\n\turl = unused\n")
	closeErr := modulesFile.Close()
	if writeErr != nil || closeErr != nil {
		t.Fatalf(".gitmodules: write %v, close %v", writeErr, closeErr)
	}
	alias := filepath.Join(t.TempDir(), "alias")
	if err := os.Symlink(root, alias); err != nil {
		t.Fatal(err)
	}
	adapter := git.Workspaces{}
	for name, c := range map[string]struct {
		dir, wantRoot string
		tracked       bool
	}{
		"main":                {root, root, false},
		"plain directory":     {plain, root, false},
		"nested worktree":     {nested, nested, false},
		"nested directory":    {inside, nested, false},
		"submodule":           {module, module, true},
		"submodule directory": {moduleInside, module, true},
		// Only the indexed submodule root overlaps, not a descendant root.
		"root inside submodule": {embedded, embedded, false},
		"root ending in spaces": {spaceRoot, spaceRoot, false},
		"root ending in tab":    {tabRoot, tabRoot, false},
		"symlink":               {filepath.Join(alias, "src"), root, false},
	} {
		// Serial: these cases share one repository and its index.
		t.Run(name, func(t *testing.T) {
			got, err := adapter.Root(context.Background(), c.dir)
			if err != nil || got != c.wantRoot {
				t.Fatalf("Root(%q) = %q, %v; want %q", c.dir, got, err, c.wantRoot)
			}
			tracked, err := adapter.IsSubmodule(context.Background(), root, got)
			if err != nil || tracked != c.tracked {
				t.Fatalf("IsSubmodule(%q) = %v, %v; want %v", got, tracked, err, c.tracked)
			}
		})
	}
	// Serial: this case changes the shared repository's index after the reads.
	t.Run("unresolvable gitlink", func(t *testing.T) {
		loop := filepath.Join(root, "loop")
		if err := os.Symlink("loop", loop); err != nil {
			t.Fatal(err)
		}
		sh(t, root, "update-index", "--add", "--cacheinfo", "160000,"+sh(t, root, "rev-parse", "HEAD")+",loop")
		if tracked, err := adapter.IsSubmodule(context.Background(), root, nested); err == nil || tracked {
			t.Fatalf("IsSubmodule(unresolvable gitlink) = %v, %v; want lookup failure", tracked, err)
		}
	})
	t.Run("invalid git boundary", func(t *testing.T) {
		t.Parallel()
		bad := t.TempDir()
		if err := os.WriteFile(filepath.Join(bad, ".git"), []byte("gitdir: missing\n"), 0o600); err != nil {
			t.Fatal(err)
		}
		if root, err := adapter.Root(context.Background(), bad); err == nil || root != "" {
			t.Fatalf("Root(invalid boundary) = %q, %v", root, err)
		}
		if tracked, err := adapter.IsSubmodule(context.Background(), bad, nested); err == nil || tracked {
			t.Fatalf("IsSubmodule(invalid boundary) = %v, %v", tracked, err)
		}
	})
}

// Contract test: the git adapter against real git, in a repository of the
// test's own.
func TestInputsResolveToImmutableIdentities(t *testing.T) {
	t.Parallel()
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
//
// Contract test: the git adapter against real git, in a repository of the
// test's own.
func TestChangedFilesKeepTheirNames(t *testing.T) {
	t.Parallel()
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

// Contract test: the git adapter against real git, in a repository of the
// test's own.
func TestInputErrors(t *testing.T) {
	t.Parallel()
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

// Contract test: the git adapter against real git, in a repository of the
// test's own.
func TestRepositoryEquivalenceUsesCanonicalCommonDirectories(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	repo := repository(t)
	workspaces := git.NewWorkspaces(git.NewWorktrees(t.TempDir()))
	checkout := linked(t, repo, sh(t, repo, "rev-parse", "HEAD"))
	link := filepath.Join(t.TempDir(), "repository")
	if err := os.Symlink(repo, link); err != nil {
		t.Fatal(err)
	}
	other := repository(t)
	clone := filepath.Join(t.TempDir(), "clone")
	sh(t, repo, "clone", "--quiet", "--no-local", repo, clone)
	missing := t.TempDir()
	for _, c := range []struct {
		name, first, second string
		same, fails         bool
	}{
		{"main and worktree", repo, checkout, true, false},
		{"worktree and symlink", checkout, link, true, false},
		{"distinct repositories", repo, other, false, false},
		{"a clone", checkout, clone, false, false},
		{"invalid first", missing, repo, false, true},
		{"invalid second", repo, missing, false, true},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			same, err := workspaces.SameRepository(ctx, c.first, c.second)
			if (err != nil) != c.fails || same != c.same {
				t.Fatalf("SameRepository = %v, %v", same, err)
			}
			// The identity a run records tells the same repositories apart.
			first, firstErr := workspaces.RepositoryIdentity(ctx, c.first)
			second, secondErr := workspaces.RepositoryIdentity(ctx, c.second)
			if (firstErr != nil || secondErr != nil) != c.fails || (!c.fails && (first == second) != c.same) {
				t.Fatalf("RepositoryIdentity = %q, %v and %q, %v", first, firstErr, second, secondErr)
			}
		})
	}
}

// A repository's identity, read from a worktree, outlives that worktree: the
// main checkout and another worktree still name it after its removal, and the
// removed one names nothing.
//
// Contract test: the git adapter against real git, in a repository of the
// test's own.
func TestRepositoryIdentityOutlivesTheWorktreeItWasReadFrom(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	repo := repository(t)
	revision := sh(t, repo, "rev-parse", "HEAD")
	launching := filepath.Join(t.TempDir(), "launching")
	surviving := filepath.Join(t.TempDir(), "surviving")
	sh(t, repo, "worktree", "add", "--detach", "--quiet", launching, revision)
	sh(t, repo, "worktree", "add", "--detach", "--quiet", surviving, revision)
	workspaces := git.NewWorkspaces(git.NewWorktrees(t.TempDir()))
	recorded, err := workspaces.RepositoryIdentity(ctx, launching)
	if err != nil || recorded == "" {
		t.Fatalf("RepositoryIdentity = %q, %v", recorded, err)
	}
	sh(t, repo, "worktree", "remove", launching)
	for _, dir := range []string{repo, surviving} {
		if identity, err := workspaces.RepositoryIdentity(ctx, dir); err != nil || identity != recorded {
			t.Fatalf("RepositoryIdentity(%s) = %q, %v, want %q", dir, identity, err, recorded)
		}
	}
	if identity, err := workspaces.RepositoryIdentity(ctx, launching); err == nil {
		t.Fatalf("removed worktree named %q", identity)
	}
}

// The content identity covers what is committed, edited and untracked, but
// not ignored; the patch from the revision to it, rebuilt on the revision,
// makes that content exactly, and neither touches the worktree's own index.
//
// Contract test: the git adapter against real git, in a repository of the
// test's own.
func TestChangesCoverEverythingSinceTheRevision(t *testing.T) {
	t.Parallel()
	repo := repository(t)
	ctx := context.Background()
	workspaces := git.NewWorkspaces(git.NewWorktrees(t.TempDir()))
	revision := sh(t, repo, "rev-parse", "HEAD")
	dir := linked(t, repo, revision)
	untouched, err := workspaces.Identity(ctx, dir, revision)
	if err != nil || untouched != sh(t, repo, "rev-parse", revision+"^{tree}") {
		t.Fatalf("untouched worktree: %q, %v", untouched, err)
	}
	if patch, err := workspaces.Changes(ctx, dir, revision, untouched); err != nil || len(patch) != 0 {
		t.Fatalf("untouched worktree: %q, %v", patch, err)
	}
	// A commit in the worktree, an edit, an untracked file, a binary one,
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
	if rebuilt, err := workspaces.Rebuild(ctx, repo, revision, patch); err != nil || rebuilt != identity {
		t.Fatalf("rebuilt %q, %v; want %s", rebuilt, err, identity)
	}
	// A patch that leaves something out makes other content.
	if rebuilt, err := workspaces.Rebuild(ctx, repo, revision, nil); err != nil || rebuilt != untouched {
		t.Fatalf("rebuilt %q, %v; want %s", rebuilt, err, untouched)
	}
	// The worktree's own index and the repository are untouched.
	if after := sh(t, dir, "status", "--porcelain"); after != status {
		t.Fatalf("worktree status %q, was %q", after, status)
	}
	if status := sh(t, repo, "status", "--porcelain"); status != "" {
		t.Fatalf("repository changed: %s", status)
	}
}

// Files the revision tracks stay content though they match .gitignore:
// unchanged, they are not in the patch at all, and an edit to one is.
// Untracked files that match stay out.
//
// Contract test: the git adapter against real git, in a repository of the
// test's own.
func TestTrackedIgnoredFilesStayContent(t *testing.T) {
	t.Parallel()
	repo := repository(t)
	ctx := context.Background()
	workspaces := git.NewWorkspaces(git.NewWorktrees(t.TempDir()))
	os.WriteFile(filepath.Join(repo, ".gitignore"), []byte("*.log\n"), 0o600)
	os.WriteFile(filepath.Join(repo, "kept.log"), []byte("kept\n"), 0o600)
	os.WriteFile(filepath.Join(repo, "edited.log"), []byte("before\n"), 0o600)
	sh(t, repo, "add", "--force", ".gitignore", "kept.log", "edited.log")
	sh(t, repo, "commit", "--quiet", "-m", "tracked, though ignored")
	revision := sh(t, repo, "rev-parse", "HEAD")
	dir := linked(t, repo, revision)
	if untouched, err := workspaces.Identity(ctx, dir, revision); err != nil || untouched != sh(t, repo, "rev-parse", revision+"^{tree}") {
		t.Fatalf("untouched worktree: %q, %v", untouched, err)
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
	if rebuilt, err := workspaces.Rebuild(ctx, repo, revision, patch); err != nil || rebuilt != identity {
		t.Fatalf("rebuilt %q, %v; want %s", rebuilt, err, identity)
	}
}

// Rebuild names, without a checkout, the content revision has with a patch
// applied: the worktree's own content for the patch Changes took from it,
// ignored files left out, and the revision's for no patch; a patch that
// does not apply is an error. The worktree, its index and its ignored files
// are as they were.
//
// Contract test: the git adapter against real git, in a repository of the
// test's own.
func TestRebuildNamesTheContentAPatchMakesFromTheRevision(t *testing.T) {
	t.Parallel()
	repo := repository(t)
	ctx := context.Background()
	workspaces := git.NewWorkspaces(git.NewWorktrees(t.TempDir()))
	revision := sh(t, repo, "rev-parse", "HEAD")
	os.WriteFile(filepath.Join(repo, "a.txt"), []byte("edited\n"), 0o600)
	os.WriteFile(filepath.Join(repo, "d.txt"), []byte("untracked\n"), 0o600)
	os.WriteFile(filepath.Join(repo, "e.bin"), []byte{0, 1, 2, 0xff}, 0o600)
	os.WriteFile(filepath.Join(repo, ".gitignore"), []byte("*.log\n"), 0o600)
	os.WriteFile(filepath.Join(repo, "x.log"), []byte("ignored\n"), 0o600)
	status := sh(t, repo, "status", "--porcelain", "--ignored")

	identity, err := workspaces.Identity(ctx, repo, revision)
	if err != nil {
		t.Fatal(err)
	}
	patch, err := workspaces.Changes(ctx, repo, revision, identity)
	if err != nil {
		t.Fatal(err)
	}
	if rebuilt, err := workspaces.Rebuild(ctx, repo, revision, patch); err != nil || rebuilt != identity {
		t.Fatalf("rebuilt %q, %v; want %s", rebuilt, err, identity)
	}
	if rebuilt, err := workspaces.Rebuild(ctx, repo, revision, nil); err != nil || rebuilt != sh(t, repo, "rev-parse", revision+"^{tree}") {
		t.Fatalf("no patch: %q, %v", rebuilt, err)
	}
	if _, err := workspaces.Rebuild(ctx, repo, revision, []byte("diff --git a/nope b/nope\n--- a/nope\n+++ b/nope\n@@ -1 +1 @@\n-x\n+y\n")); err == nil {
		t.Fatal("a patch that does not apply was rebuilt")
	}
	if after := sh(t, repo, "status", "--porcelain", "--ignored"); after != status {
		t.Fatalf("worktree status %q, was %q", after, status)
	}
}

// Rebuild keeps a patch's whitespace as it is, even where the repository
// configures apply.whitespace=fix: an added line with trailing whitespace
// rebuilds to the worktree's own content.
//
// Contract test: the git adapter against real git, in a repository of the
// test's own.
func TestRebuildKeepsThePatchWhitespace(t *testing.T) {
	t.Parallel()
	repo := repository(t)
	ctx := context.Background()
	workspaces := git.NewWorkspaces(git.NewWorktrees(t.TempDir()))
	sh(t, repo, "config", "apply.whitespace", "fix")
	revision := sh(t, repo, "rev-parse", "HEAD")
	os.WriteFile(filepath.Join(repo, "a.txt"), []byte("one\ntwo\nthree  \n"), 0o600)

	identity, err := workspaces.Identity(ctx, repo, revision)
	if err != nil {
		t.Fatal(err)
	}
	patch, err := workspaces.Changes(ctx, repo, revision, identity)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(patch), "+three  \n") {
		t.Fatalf("patch:\n%s", patch)
	}
	if rebuilt, err := workspaces.Rebuild(ctx, repo, revision, patch); err != nil || rebuilt != identity {
		t.Fatalf("rebuilt %q, %v; want %s", rebuilt, err, identity)
	}
}

// A checkout its call never released before ADR-025 (the process was
// killed) is removed from disk and from the repository's worktree list
// (ADR-025 rule 9).
//
// Contract test: the git adapter against real git, in a repository of the
// test's own.
func TestDiscardRemovesAnUnreleasedCheckout(t *testing.T) {
	t.Parallel()
	repo := repository(t)
	ctx := context.Background()
	checkout := oldCheckout(t, repo)
	if err := git.NewWorkspaces(git.NewWorktrees(t.TempDir())).Discard(ctx, repo, checkout); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Dir(checkout)); !os.IsNotExist(err) {
		t.Fatal("checkout left behind")
	}
	if lines := strings.Split(sh(t, repo, "worktree", "list"), "\n"); len(lines) != 1 {
		t.Fatalf("worktrees = %v", lines)
	}
	// Already gone is success.
	if err := git.NewWorkspaces(git.NewWorktrees(t.TempDir())).Discard(ctx, repo, checkout); err != nil {
		t.Fatal(err)
	}
}

// Only a directory Agister could have made for a checkout is ever removed: each case
// breaks exactly one part of the pattern.
//
// Contract test: the git adapter against real git, in a repository of the
// test's own.
func TestDiscardRefusesOtherDirectories(t *testing.T) {
	t.Parallel()
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
		if err := git.NewWorkspaces(git.NewWorktrees(t.TempDir())).Discard(context.Background(), repo, dir); err == nil {
			t.Errorf("%s: discard succeeded", name)
		}
		if _, err := os.Stat(dir); err != nil {
			t.Errorf("%s: removed: %v", name, err)
		}
	}
}

// A checkout whose directory is already gone is still dropped from the
// worktree list, and discarding it succeeds.
//
// Contract test: the git adapter against real git, in a repository of the
// test's own.
func TestDiscardDropsACheckoutThatIsGone(t *testing.T) {
	t.Parallel()
	repo := repository(t)
	ctx := context.Background()
	checkout := oldCheckout(t, repo)
	if err := os.RemoveAll(filepath.Dir(checkout)); err != nil {
		t.Fatal(err)
	}
	if err := git.NewWorkspaces(git.NewWorktrees(t.TempDir())).Discard(ctx, repo, checkout); err != nil {
		t.Fatal(err)
	}
	if lines := strings.Split(sh(t, repo, "worktree", "list"), "\n"); len(lines) != 1 {
		t.Fatalf("worktrees = %v", lines)
	}
}

// Discard removes only its own checkout: another worktree's stale record
// in the repository is the repository's, and survives.
//
// Contract test: the git adapter against real git, in a repository of the
// test's own.
func TestDiscardLeavesOtherStaleWorktreesAlone(t *testing.T) {
	t.Parallel()
	repo := repository(t)
	ctx := context.Background()
	other := filepath.Join(t.TempDir(), "other")
	sh(t, repo, "worktree", "add", "--detach", "--quiet", other, "HEAD")
	if err := os.RemoveAll(other); err != nil {
		t.Fatal(err)
	}
	checkout := oldCheckout(t, repo)
	if err := git.NewWorkspaces(git.NewWorktrees(t.TempDir())).Discard(ctx, repo, checkout); err != nil {
		t.Fatal(err)
	}
	list := sh(t, repo, "worktree", "list")
	if lines := strings.Split(list, "\n"); len(lines) != 2 || !strings.HasSuffix(lines[1], "prunable") ||
		!strings.Contains(lines[1], filepath.Base(other)) {
		t.Fatalf("worktrees = %v", lines)
	}
}

// A checkout left behind under the name earlier versions gave every
// checkout is still recognised and removed.
//
// Contract test: the git adapter against real git, in a repository of the
// test's own.
func TestDiscardRemovesACheckoutUnderTheOldName(t *testing.T) {
	t.Parallel()
	repo := repository(t)
	parent, err := os.MkdirTemp("", "agister-checkout-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(parent) })
	checkout := filepath.Join(parent, "workspace")
	sh(t, repo, "worktree", "add", "--detach", "--quiet", checkout, "HEAD")
	if err := git.NewWorkspaces(git.NewWorktrees(t.TempDir())).Discard(context.Background(), repo, checkout); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(parent); !os.IsNotExist(err) {
		t.Fatal("checkout left behind")
	}
	if lines := strings.Split(sh(t, repo, "worktree", "list"), "\n"); len(lines) != 1 {
		t.Fatalf("worktrees = %v", lines)
	}
}

// What admits a worktree in-place (ADR-022 rule 4), as git tells it: HEAD,
// the revision's tree, the staged paths, the dirty submodules and the
// untracked files that are not ignored; and the content identity, which a
// tracked file's change moves off the tree, even one the index marks
// unchanged. A path a merge left unmerged is staged, even with its file put
// back as the revision has it: the content identity is the tree's then,
// and tells nothing. Ignored files count for nothing. Reading writes
// nothing in the index.
//
// Contract test: the git adapter against real git, in a repository of the
// test's own.
func TestWorktreeStateTellsWhatAdmitsAWorktree(t *testing.T) {
	t.Parallel()
	for name, c := range map[string]struct {
		change func(t *testing.T, dir string)
		want   func(state app.WorktreeState) bool
		clean  bool // the content is the revision's tree
	}{
		"clean": {
			change: func(*testing.T, string) {},
			want: func(s app.WorktreeState) bool {
				return s.Staged == nil && s.Untracked == nil && s.DirtySubmodules == nil
			},
			clean: true,
		},
		"an ignored file": {
			change: func(t *testing.T, dir string) {
				os.WriteFile(filepath.Join(dir, ".git", "info", "exclude"), []byte("*.log\n"), 0o600)
				os.WriteFile(filepath.Join(dir, "build.log"), []byte("x\n"), 0o600)
			},
			want:  func(s app.WorktreeState) bool { return s.Untracked == nil },
			clean: true,
		},
		"a modified tracked file": {
			change: func(t *testing.T, dir string) { os.WriteFile(filepath.Join(dir, "a.txt"), []byte("edited\n"), 0o600) },
			want:   func(s app.WorktreeState) bool { return s.Staged == nil && s.Untracked == nil },
		},
		"a modification the index marks unchanged": {
			change: func(t *testing.T, dir string) {
				os.WriteFile(filepath.Join(dir, "a.txt"), []byte("hidden\n"), 0o600)
				sh(t, dir, "update-index", "--assume-unchanged", "a.txt")
			},
			want: func(s app.WorktreeState) bool { return s.Staged == nil && s.Untracked == nil },
		},
		"a staged change": {
			change: func(t *testing.T, dir string) {
				os.WriteFile(filepath.Join(dir, "a.txt"), []byte("staged\n"), 0o600)
				sh(t, dir, "add", "a.txt")
			},
			want: func(s app.WorktreeState) bool { return reflect.DeepEqual(s.Staged, []string{"a.txt"}) },
		},
		"an untracked file": {
			change: func(t *testing.T, dir string) { os.WriteFile(filepath.Join(dir, "notes.md"), []byte("x\n"), 0o600) },
			want:   func(s app.WorktreeState) bool { return reflect.DeepEqual(s.Untracked, []string{"notes.md"}) },
		},
		"a conflict left unmerged, its file put back": {
			change: func(t *testing.T, dir string) {
				sh(t, dir, "checkout", "--quiet", "-b", "other", "main")
				os.WriteFile(filepath.Join(dir, "a.txt"), []byte("one\nother\n"), 0o600)
				sh(t, dir, "commit", "--quiet", "-am", "other")
				sh(t, dir, "checkout", "--quiet", "feature")
				merge := exec.Command("git", "merge", "--quiet", "other")
				merge.Dir = dir
				if out, err := merge.CombinedOutput(); err == nil {
					t.Fatalf("the merge left no conflict:\n%s", out)
				}
				if unmerged := sh(t, dir, "ls-files", "--unmerged", "--", "a.txt"); unmerged == "" {
					t.Fatal("the index holds no unmerged entry of a.txt")
				}
				// As HEAD has it, and not staged: the index keeps the conflict.
				os.WriteFile(filepath.Join(dir, "a.txt"), []byte("one\ntwo\n"), 0o600)
			},
			want: func(s app.WorktreeState) bool {
				return reflect.DeepEqual(s.Staged, []string{"a.txt"}) && s.Untracked == nil
			},
			clean: true,
		},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			dir := repository(t)
			revision := sh(t, dir, "rev-parse", "HEAD")
			c.change(t, dir)
			index, _ := os.ReadFile(filepath.Join(dir, ".git", "index"))
			state, err := git.Workspaces{}.State(context.Background(), dir, revision)
			if err != nil {
				t.Fatal(err)
			}
			if state.Head != revision || state.Tree != sh(t, dir, "rev-parse", revision+"^{tree}") || !c.want(state) {
				t.Fatalf("state %+v", state)
			}
			identity, err := git.Workspaces{}.Identity(context.Background(), dir, revision)
			if err != nil {
				t.Fatal(err)
			}
			if (identity == state.Tree) != c.clean {
				t.Fatalf("identity %s, tree %s, want clean %v", identity, state.Tree, c.clean)
			}
			if after, _ := os.ReadFile(filepath.Join(dir, ".git", "index")); string(after) != string(index) {
				t.Fatal("reading the state wrote the index")
			}
		})
	}
}

// A worktree whose HEAD moved past the revision says so.
//
// Contract test: the git adapter against real git, in a repository of the
// test's own.
func TestWorktreeStateTellsAMovedHead(t *testing.T) {
	t.Parallel()
	dir := repository(t)
	revision := sh(t, dir, "rev-parse", "HEAD")
	sh(t, dir, "commit", "--quiet", "--allow-empty", "-m", "after")
	state, err := git.Workspaces{}.State(context.Background(), dir, revision)
	if err != nil {
		t.Fatal(err)
	}
	if head := sh(t, dir, "rev-parse", "HEAD"); state.Head != head || head == revision {
		t.Fatalf("state %+v", state)
	}
}

// A submodule with changes of its own is dirty, even one the repository's
// configuration has status ignore (submodule.<name>.ignore); a clean one is
// not.
//
// Contract test: the git adapter against real git, in repositories of the
// test's own.
func TestWorktreeStateTellsADirtySubmodule(t *testing.T) {
	t.Parallel()
	library, dir := repository(t), repository(t)
	sh(t, dir, "-c", "protocol.file.allow=always", "submodule", "add", "--quiet", library, "lib")
	sh(t, dir, "commit", "--quiet", "-m", "submodule")
	revision := sh(t, dir, "rev-parse", "HEAD")
	state, err := git.Workspaces{}.State(context.Background(), dir, revision)
	if err != nil || state.DirtySubmodules != nil || state.Staged != nil {
		t.Fatalf("clean: state %+v, %v", state, err)
	}
	sh(t, dir, "config", "submodule.lib.ignore", "all")
	os.WriteFile(filepath.Join(dir, "lib", "a.txt"), []byte("edited\n"), 0o600)
	state, err = git.Workspaces{}.State(context.Background(), dir, revision)
	if err != nil || !reflect.DeepEqual(state.DirtySubmodules, []string{"lib"}) || state.Staged != nil {
		t.Fatalf("dirty: state %+v, %v", state, err)
	}
}
