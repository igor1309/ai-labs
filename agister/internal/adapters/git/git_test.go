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
