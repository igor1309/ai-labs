package git_test

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strings"
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

// commitFiles writes each of names in r, holding its name, and commits
// them with the message message.
func commitFiles(t *testing.T, r, message string, names ...string) {
	t.Helper()
	for _, name := range names {
		path := filepath.Join(r, name)
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte(name), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	run(t, r, "add", "--all")
	run(t, r, "commit", "-q", "--allow-empty", "-m", message)
}

// head is the full id of r's HEAD, as the real git gives it.
func head(t *testing.T, r string) string {
	t.Helper()
	out, err := exec.Command("git", "-C", r, "rev-parse", "HEAD").Output()
	if err != nil {
		t.Fatal(err)
	}
	return strings.TrimSpace(string(out))
}

// newGit is a Git over the real git.
func newGit(t *testing.T) *git.Git {
	t.Helper()
	g, err := git.New("git")
	if err != nil {
		t.Fatal(err)
	}
	return g
}

// sources.feature, "A revision names its commit".
//
// Contract test: git.
func TestARevisionNamesItsCommit(t *testing.T) {
	t.Parallel()
	r := repository(t, t.TempDir(), "r", "")
	run(t, r, "checkout", "-q", "-b", "main")
	commitFiles(t, r, "c1")
	got, err := newGit(t).Commit(context.Background(), r, "main")
	if err != nil {
		t.Fatal(err)
	}
	if want := head(t, r); got != want || len(got) < 40 {
		t.Errorf("the commit of main is %q, want the full id %q", got, want)
	}
}

// sources.feature, "A revision that names no commit is an error".
//
// Contract test: git.
func TestARevisionThatNamesNoCommitIsAnError(t *testing.T) {
	t.Parallel()
	r := repository(t, t.TempDir(), "r", "")
	commitFiles(t, r, "first")
	got, err := newGit(t).Commit(context.Background(), r, "nope")
	if err == nil {
		t.Fatalf("the commit of nope is %q, want an error", got)
	}
	// git's words for a name that is no revision.
	for _, want := range []string{`"nope"`, "Needed a single revision"} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("error %q, want it to say %s", err, want)
		}
	}
}

// sources.feature, "The files changed from the merge base to the second
// revision".
//
// Contract test: git.
func TestTheFilesChangedFromTheMergeBaseToTheSecondRevision(t *testing.T) {
	t.Parallel()
	r := repository(t, t.TempDir(), "r", "")
	run(t, r, "checkout", "-q", "-b", "main")
	commitFiles(t, r, "c1", "base.txt")
	run(t, r, "checkout", "-q", "-b", "b")
	commitFiles(t, r, "on b", "a b.txt", filepath.Join("x", "y.go"))
	run(t, r, "checkout", "-q", "main")
	commitFiles(t, r, "on main", "m.txt")
	got, err := newGit(t).Changed(context.Background(), r, "main", "b")
	if err != nil {
		t.Fatal(err)
	}
	if want := []string{"a b.txt", "x/y.go"}; !slices.Equal(got, want) {
		t.Errorf("changed %q, want %q", got, want)
	}
}

// Two revisions of the same commit changed nothing: none, and no error.
//
// Contract test: git.
func TestRevisionsOfOneCommitChangedNothing(t *testing.T) {
	t.Parallel()
	r := repository(t, t.TempDir(), "r", "")
	commitFiles(t, r, "first", "a.txt")
	got, err := newGit(t).Changed(context.Background(), r, "HEAD", "HEAD")
	if err != nil || len(got) != 0 {
		t.Errorf("changed %q, %v; want none, and no error", got, err)
	}
}

// A revision git cannot read is Changed's error, naming both.
//
// Contract test: git.
func TestChangedFromARevisionThatNamesNoCommitIsAnError(t *testing.T) {
	t.Parallel()
	r := repository(t, t.TempDir(), "r", "")
	commitFiles(t, r, "first")
	got, err := newGit(t).Changed(context.Background(), r, "nope", "HEAD")
	if err == nil || !strings.Contains(err.Error(), "nope...HEAD") {
		t.Errorf("changed %q, %v; want an error naming nope...HEAD", got, err)
	}
}

// worktree.feature, "HEAD is its commit".
//
// Contract test: git.
func TestHeadIsItsCommit(t *testing.T) {
	t.Parallel()
	r := repository(t, t.TempDir(), "r", "")
	commitFiles(t, r, "c0", "a.txt")
	commitFiles(t, r, "c1", "b.txt")
	got, err := newGit(t).Head(context.Background(), r)
	if err != nil {
		t.Fatal(err)
	}
	if want := head(t, r); got != want || len(got) < 40 {
		t.Errorf("HEAD is %q, want the full id %q", got, want)
	}
}

// A repository with no commit has a HEAD that is no commit: an error.
//
// Contract test: git.
func TestTheHeadOfARepositoryWithNoCommitIsAnError(t *testing.T) {
	t.Parallel()
	r := repository(t, t.TempDir(), "r", "")
	if got, err := newGit(t).Head(context.Background(), r); err == nil {
		t.Errorf("HEAD is %q and no error, want an error", got)
	}
}

// worktree.feature, "A worktree is clean where nothing differs from HEAD".
// An ignored file is no change.
//
// Contract test: git.
func TestAWorktreeIsCleanWhereNothingDiffersFromHead(t *testing.T) {
	t.Parallel()
	write := func(t *testing.T, r, name, text string) {
		t.Helper()
		if err := os.WriteFile(filepath.Join(r, name), []byte(text), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	cases := []struct {
		change string
		make   func(t *testing.T, r string)
		clean  bool
	}{
		{"nothing changed", func(*testing.T, string) {}, true},
		{"a file ignored", func(t *testing.T, r string) { write(t, r, "x.log", "x") }, true},
		{"a file staged", func(t *testing.T, r string) { write(t, r, "n.txt", "n"); run(t, r, "add", "n.txt") }, false},
		{"a tracked file changed", func(t *testing.T, r string) { write(t, r, "a.txt", "changed") }, false},
		{"an untracked file", func(t *testing.T, r string) { write(t, r, "u.txt", "u") }, false},
	}
	for _, c := range cases {
		t.Run(c.change, func(t *testing.T) {
			t.Parallel()
			r := repository(t, t.TempDir(), "r", "")
			write(t, r, ".gitignore", "*.log\n")
			commitFiles(t, r, "c1", "a.txt")
			c.make(t, r)
			got, err := newGit(t).Clean(context.Background(), r)
			if err != nil {
				t.Fatal(err)
			}
			if got != c.clean {
				t.Errorf("clean %v, want %v", got, c.clean)
			}
		})
	}
}

// A directory git cannot run in is Clean's error, naming it.
//
// Contract test: git.
func TestCleanOutsideAnyWorktreeIsAnError(t *testing.T) {
	t.Parallel()
	o := t.TempDir()
	if got, err := newGit(t).Clean(context.Background(), o); err == nil || !strings.Contains(err.Error(), o) {
		t.Errorf("clean %v, %v; want an error naming %s", got, err, o)
	}
}
