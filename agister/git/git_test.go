package git_test

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"testing"

	"github.com/igor1309/ai-labs/agister/git"
)

// run runs the real git in dir, apart from the user's and the system's
// configuration, and fails t if it fails.
func run(t *testing.T, dir string, args ...string) {
	t.Helper()
	command := exec.Command("git", args...)
	command.Dir = dir
	command.Env = append(os.Environ(),
		"GIT_CONFIG_GLOBAL="+os.DevNull, "GIT_CONFIG_NOSYSTEM=1",
		"GIT_AUTHOR_NAME=a", "GIT_AUTHOR_EMAIL=a@example.com",
		"GIT_COMMITTER_NAME=a", "GIT_COMMITTER_EMAIL=a@example.com")
	if out, err := command.CombinedOutput(); err != nil {
		t.Fatalf("git %q: %v\n%s", args, err, out)
	}
}

// repository makes a git repository at r in folder, with the folder
// r/sub, and gives r's path.
func repository(t *testing.T, folder, r, sub string) string {
	t.Helper()
	path := filepath.Join(folder, r)
	if err := os.MkdirAll(filepath.Join(path, sub), 0o755); err != nil {
		t.Fatal(err)
	}
	run(t, path, "init", "-q")
	return path
}

// root asks the real git the root of dir, and fails t on an error.
func root(t *testing.T, dir string) string {
	t.Helper()
	g, err := git.New("git")
	if err != nil {
		t.Fatal(err)
	}
	got, err := g.Root(context.Background(), dir)
	if err != nil {
		t.Fatal(err)
	}
	return got
}

// root.feature, "A directory inside a worktree". The temporary folder may
// be reached through a link, as on macOS, which git resolves: the root is
// still spelled as asked.
//
// Contract test: git.
func TestADirectoryInsideAWorktree(t *testing.T) {
	t.Parallel()
	folder := t.TempDir()
	r := repository(t, folder, "r", filepath.Join("a", "b"))
	if got := root(t, filepath.Join(r, "a", "b")); got != r {
		t.Errorf("root %q, want %q", got, r)
	}
}

// root.feature, "A directory in a linked worktree".
//
// Contract test: git.
func TestADirectoryInALinkedWorktree(t *testing.T) {
	t.Parallel()
	folder := t.TempDir()
	r := repository(t, folder, "r", "")
	run(t, r, "commit", "-q", "--allow-empty", "-m", "first")
	w := filepath.Join(folder, "w")
	run(t, r, "worktree", "add", "-q", "--detach", w)
	if got := root(t, w); got != w {
		t.Errorf("root %q, want %q", got, w)
	}
}

// root.feature, "A directory outside any worktree".
//
// Contract test: git.
func TestADirectoryOutsideAnyWorktree(t *testing.T) {
	t.Parallel()
	o := filepath.Join(t.TempDir(), "o")
	if err := os.Mkdir(o, 0o755); err != nil {
		t.Fatal(err)
	}
	if got := root(t, o); got != "" {
		t.Errorf("root %q, want none", got)
	}
}

// root.feature, "A directory asked through a link keeps its spelling".
//
// Contract test: git.
func TestADirectoryAskedThroughALinkKeepsItsSpelling(t *testing.T) {
	t.Parallel()
	folder := t.TempDir()
	r := repository(t, folder, "r", "a")
	l := filepath.Join(folder, "l")
	if err := os.Symlink(r, l); err != nil {
		t.Fatal(err)
	}
	if got := root(t, filepath.Join(l, "a")); got != l {
		t.Errorf("root %q, want %q", got, l)
	}
}

// A directory reached by a link from outside its worktree has no folder
// above it, by its spelling, that is the root: the root is given as git
// spells it.
//
// Contract test: git.
func TestADirectoryLinkedFromOutsideGivesTheRootAsGitSpellsIt(t *testing.T) {
	t.Parallel()
	folder := t.TempDir()
	r := repository(t, folder, "r", "a")
	o := filepath.Join(folder, "o")
	if err := os.Mkdir(o, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(filepath.Join(r, "a"), filepath.Join(o, "x")); err != nil {
		t.Fatal(err)
	}
	want, err := filepath.EvalSymlinks(r)
	if err != nil {
		t.Fatal(err)
	}
	if got := root(t, filepath.Join(o, "x")); got != want {
		t.Errorf("root %q, want %q", got, want)
	}
}

// A directory git cannot run in is an error, not a directory outside any
// worktree.
//
// Contract test: git.
func TestADirectoryThatDoesNotExistIsAnError(t *testing.T) {
	t.Parallel()
	g, err := git.New("git")
	if err != nil {
		t.Fatal(err)
	}
	got, err := g.Root(context.Background(), filepath.Join(t.TempDir(), "missing"))
	if err == nil {
		t.Errorf("root %q and no error, want an error", got)
	}
}

// A Git is given its program; none fails at construction.
func TestNewFailsWithNoProgram(t *testing.T) {
	t.Parallel()
	if _, err := git.New(""); err == nil {
		t.Error("New with no program gave no error")
	}
}
