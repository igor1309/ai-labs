package git_test

import (
	"bytes"
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// worktree.feature, "The changes from a commit to a tree are a patch".
// Contract test: git, including applying a binary patch in another worktree.
func TestTheChangesFromACommitToATreeAreAPatch(t *testing.T) {
	t.Parallel()
	r := repository(t, t.TempDir(), "r", "")
	write := func(name, text string) {
		t.Helper()
		if err := os.WriteFile(filepath.Join(r, name), []byte(text), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	write("tracked", "before\n")
	write("binary", "before\x00\xff")
	run(t, r, "add", "--all")
	run(t, r, "commit", "-qm", "first")
	c1 := head(t, r)
	write("tracked", "committed\n")
	run(t, r, "add", "tracked")
	run(t, r, "commit", "-qm", "second")
	write("untracked", "new\n")
	write("binary", "after\x00\xfe")
	g := newGit(t)
	tree, err := g.Content(context.Background(), r)
	if err != nil {
		t.Fatal(err)
	}
	patch, err := g.Changes(context.Background(), r, c1, tree)
	if err != nil {
		t.Fatal(err)
	}
	clone := filepath.Join(t.TempDir(), "clone")
	run(t, r, "clone", "-q", r, clone)
	run(t, clone, "checkout", "-q", c1)
	command := exec.Command("git", "apply", "--index", "--binary", "-")
	command.Dir, command.Stdin = clone, strings.NewReader(patch)
	if out, err := command.CombinedOutput(); err != nil {
		t.Fatalf("apply: %v: %s", err, out)
	}
	got, err := g.Content(context.Background(), clone)
	if err != nil || got != tree {
		t.Fatalf("tree %q, error %v; want %q", got, err, tree)
	}
	if !strings.Contains(patch, "GIT binary patch") {
		t.Fatal("no binary patch")
	}
	// The original index still describes the second commit, with no staged change.
	command = exec.Command("git", "diff", "--cached", "--exit-code")
	command.Dir = r
	if out, err := command.CombinedOutput(); err != nil || !bytes.Equal(out, nil) {
		t.Fatalf("index changed: %v: %s", err, out)
	}
	empty, err := g.Changes(context.Background(), r, tree, tree)
	if err != nil || empty != "" {
		t.Fatalf("empty patch %q, error %v", empty, err)
	}
	if _, err := g.Changes(context.Background(), r, "missing", tree); err == nil {
		t.Fatal("missing commit accepted")
	}
}
