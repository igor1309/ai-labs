package gittest_test

import (
	"context"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/adapters/git/gittest"
	"github.com/igor1309/ai-labs/agister/internal/app"
)

var ctx = context.Background()

// recorded is a fake over a scratch directory of the test's own, with one
// repository: main {a.txt}, then feature from it.
func recorded(t *testing.T) (*gittest.Fake, *gittest.Repository, string, string, string) {
	t.Helper()
	fake := gittest.New(t.TempDir())
	root := t.TempDir()
	repository := fake.Record(root)
	main := repository.Commit("main", map[string]string{"a.txt": "one\n"})
	feature := repository.Commit("feature", map[string]string{"a.txt": "one\ntwo\n", "dir/b.txt": "no newline"})
	return fake, repository, root, main, feature
}

func left(t *testing.T, fake *gittest.Fake) []string {
	t.Helper()
	left, err := fake.Left()
	if err != nil {
		t.Fatal(err)
	}
	return left
}

// The root, identity and sameness of a directory come from the recorded
// repository it is in; a directory in none is refused.
func TestARecordedRepositoryPlacesItsDirectories(t *testing.T) {
	t.Parallel()
	fake, _, root, _, _ := recorded(t)
	nested := filepath.Join(root, "sub", "dir")
	if got, err := fake.Root(ctx, nested); err != nil || got != root {
		t.Fatalf("root of %s: %q, %v", nested, got, err)
	}
	if got, err := fake.RepositoryIdentity(ctx, nested); err != nil || got != filepath.Join(root, ".git") {
		t.Fatalf("identity: %q, %v", got, err)
	}
	if same, err := fake.SameRepository(ctx, root, nested); err != nil || !same {
		t.Fatalf("same: %t, %v", same, err)
	}
	other := t.TempDir()
	if _, err := fake.Root(ctx, other); err == nil {
		t.Fatal("a directory in no recorded repository has a root")
	}
	if _, err := (&gittest.Fake{}).Root(ctx, root); err == nil {
		t.Fatal("the zero fake knows a repository")
	}
}

// HEAD, a branch and a recorded revision resolve; Commit moves HEAD to its
// branch, and a new branch starts from HEAD.
func TestRevisionsResolveAsRecorded(t *testing.T) {
	t.Parallel()
	fake, repository, root, main, feature := recorded(t)
	revision := func(name string) (string, error) {
		resolved, err := fake.Revision().Resolve(ctx, app.InputSpec{Args: map[string]string{"rev": name}, Cwd: root})
		value, _ := resolved.Value.(string)
		return value, err
	}
	for name, want := range map[string]string{"HEAD": feature, "feature": feature, "main": main, main: main} {
		if got, err := revision(name); err != nil || got != want {
			t.Errorf("%s: %q, %v; want %q", name, got, err, want)
		}
	}
	if _, err := revision("missing"); err == nil {
		t.Error("an unknown name resolves")
	}
	fix := repository.Commit("fix", map[string]string{"a.txt": "fixed\n"})
	if got, err := revision("HEAD"); err != nil || got != fix {
		t.Errorf("HEAD after a commit on a new branch: %q, %v", got, err)
	}
	if got, err := fake.MergeBase().Resolve(ctx, app.InputSpec{Args: map[string]string{"base": "fix", "head": "feature"}, Cwd: root}); err != nil || got.Value != feature {
		t.Errorf("a new branch starts from HEAD, feature: merge base with it %v, %v", got.Value, err)
	}
	if len(main) != 40 || main == feature {
		t.Errorf("revisions %q and %q", main, feature)
	}
}

// worktree writes files, by slash-separated path, into a directory of the
// test's own and returns it: a worktree as a call finds it.
func worktree(t *testing.T, files map[string]string) string {
	t.Helper()
	dir := t.TempDir()
	for path, text := range files {
		full := filepath.Join(dir, filepath.FromSlash(path))
		if err := os.MkdirAll(filepath.Dir(full), 0o700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(full, []byte(text), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	return dir
}

// A worktree's identity is its content; a change to its files, a new file
// included, changes it, and Changes is the patch between them, empty for
// the same content.
func TestIdentityNamesEveryFileAndChangesDiffsContents(t *testing.T) {
	t.Parallel()
	fake, _, root, main, feature := recorded(t)
	dir := worktree(t, map[string]string{"a.txt": "one\ntwo\n", "dir/b.txt": "no newline"})
	before, err := fake.Identity(ctx, dir, feature)
	if err != nil {
		t.Fatal(err)
	}
	if patch, err := fake.Changes(ctx, root, feature, before); err != nil || len(patch) != 0 {
		t.Fatalf("the worktree's content differs from its revision: %q, %v", patch, err)
	}
	if err := os.WriteFile(filepath.Join(dir, "new.log"), []byte("made\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	after, err := fake.Identity(ctx, dir, feature)
	if err != nil || after == before {
		t.Fatalf("a new file left the identity %q: %v", after, err)
	}
	patch, err := fake.Changes(ctx, root, main, after)
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"+++ b/a.txt", "+two", "+++ b/dir/b.txt", "+++ b/new.log", "+made"} {
		if !strings.Contains(string(patch), want) {
			t.Errorf("patch lacks %q:\n%s", want, patch)
		}
	}
	if _, err := fake.Changes(ctx, root, main, "unknown"); err == nil {
		t.Error("diffed an unknown content")
	}
}

// A patch Changes made, rebuilt on the revision it was made from, names
// the other content: files changed, added, removed, and ending with no
// newline.
func TestRebuildRebuildsWhatChangesDiffed(t *testing.T) {
	t.Parallel()
	fake, _, root, _, feature := recorded(t)
	dir := worktree(t, map[string]string{"dir/b.txt": "changed\n\nlast", "c/d.txt": "", "e.txt": "+--\n"})
	identity, err := fake.Identity(ctx, dir, feature)
	if err != nil {
		t.Fatal(err)
	}
	patch, err := fake.Changes(ctx, root, feature, identity)
	if err != nil {
		t.Fatal(err)
	}
	if rebuilt, err := fake.Rebuild(ctx, root, feature, patch); err != nil || rebuilt != identity {
		t.Fatalf("rebuilt %q, %v; want %s", rebuilt, err, identity)
	}
}

// Rebuild names what a revision with a patch applied holds, as Identity
// names a directory with those files, without writing anything; no patch
// rebuilds the revision, and one that does not apply, or is no patch, is an
// error.
func TestRebuildNamesTheContentAPatchMakesFromARevision(t *testing.T) {
	t.Parallel()
	fake, _, root, main, feature := recorded(t)
	want, err := fake.Identity(ctx, worktree(t, map[string]string{"a.txt": "one\n"}), main)
	if err != nil {
		t.Fatal(err)
	}
	patch, err := fake.Changes(ctx, root, main, feature)
	if err != nil {
		t.Fatal(err)
	}
	if rebuilt, err := fake.Rebuild(ctx, root, main, nil); err != nil || rebuilt != want {
		t.Fatalf("no patch rebuilt %q, %v; want %s", rebuilt, err, want)
	}
	rebuilt, err := fake.Rebuild(ctx, root, main, patch)
	if err != nil {
		t.Fatal(err)
	}
	if again, err := fake.Changes(ctx, root, rebuilt, feature); err != nil || len(again) != 0 {
		t.Fatalf("the rebuilt content differs from feature's: %q, %v", again, err)
	}
	// feature's tree already has dir/b.txt, which the patch adds.
	if _, err := fake.Rebuild(ctx, root, feature, patch); err == nil {
		t.Fatal("a patch that does not apply was rebuilt")
	}
	if _, err := fake.Rebuild(ctx, root, main, []byte("not a patch\n")); err == nil {
		t.Fatal("rebuilt what is not a patch")
	}
}

// A patch Changes made between revisions where a file and a directory
// trade places rebuilds the second from the first, both ways; a patch that
// would leave a path both a file and a directory does not apply.
func TestRebuildReplacesAFileWithADirectoryAndBack(t *testing.T) {
	t.Parallel()
	fake := gittest.New(t.TempDir())
	root := t.TempDir()
	repository := fake.Record(root)
	file := map[string]string{"node": "a file\n", "other.txt": "kept\n"}
	directory := map[string]string{"node/child.txt": "a child\n", "node/deep/leaf.txt": "a leaf\n", "other.txt": "kept\n"}
	fileRevision := repository.Commit("main", file)
	directoryRevision := repository.Commit("feature", directory)
	for _, c := range []struct {
		name     string
		from, to string
	}{
		{"file to directory", fileRevision, directoryRevision},
		{"directory to file", directoryRevision, fileRevision},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			patch, err := fake.Changes(ctx, root, c.from, c.to)
			if err != nil {
				t.Fatal(err)
			}
			rebuilt, err := fake.Rebuild(ctx, root, c.from, patch)
			if err != nil {
				t.Fatal(err)
			}
			if rest, err := fake.Changes(ctx, root, c.to, rebuilt); err != nil || len(rest) != 0 {
				t.Fatalf("the rebuilt content differs from its target: %q, %v", rest, err)
			}
		})
	}
	t.Run("both a file and a directory", func(t *testing.T) {
		t.Parallel()
		// It adds node/child.txt and leaves node a file.
		patch := []byte("diff --git a/node/child.txt b/node/child.txt\n--- /dev/null\n+++ b/node/child.txt\n@@ -0,0 +1,1 @@\n+a child\n")
		if _, err := fake.Rebuild(ctx, root, fileRevision, patch); err == nil || !strings.Contains(err.Error(), "both a file and a directory") {
			t.Fatalf("a patch made node both a file and a directory: %v", err)
		}
	})
}

// A checkout or clean copy a run made before ADR-025 is a directory under
// the scratch directory: Discard removes it, takes one gone as success and
// refuses a directory the fake did not make (ADR-025 rule 9).
func TestDiscardRemovesAnOldCheckoutOrCopy(t *testing.T) {
	t.Parallel()
	scratch := t.TempDir()
	fake := gittest.New(scratch)
	root := t.TempDir()
	fake.Record(root)
	for _, name := range []string{"checkout-1", "copy-1"} {
		dir := filepath.Join(scratch, name, "workspace")
		if err := os.MkdirAll(dir, 0o700); err != nil {
			t.Fatal(err)
		}
		if err := fake.Discard(ctx, root, dir); err != nil {
			t.Fatal(err)
		}
		if err := fake.Discard(ctx, root, dir); err != nil {
			t.Fatalf("discarding %s already gone: %v", name, err)
		}
	}
	if got := left(t, fake); len(got) != 0 {
		t.Fatalf("left: %v", got)
	}
	foreign := filepath.Join(t.TempDir(), "workspace")
	if err := os.Mkdir(foreign, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := fake.Discard(ctx, root, foreign); err == nil || !strings.Contains(err.Error(), "is not a checkout Agister made") {
		t.Fatalf("discarding a directory the fake did not make: %v", err)
	}
	if _, err := os.Stat(foreign); err != nil {
		t.Fatalf("the refused directory: %v", err)
	}
}

// The git inputs resolve from the recorded revisions, in the repository of
// the call's directory.
func TestTheGitInputsResolveFromTheRecordedRevisions(t *testing.T) {
	t.Parallel()
	fake, repository, root, main, feature := recorded(t)
	resolve := func(source app.InputProvider, args map[string]string) app.Resolved {
		t.Helper()
		resolved, err := source.Resolve(ctx, app.InputSpec{Args: args, Cwd: root})
		if err != nil {
			t.Fatal(err)
		}
		return resolved
	}
	if got := resolve(fake.Revision(), map[string]string{"rev": "main"}); got.Value != main || got.Identity != main || !got.Revision {
		t.Errorf("revision: %+v", got)
	}
	pair := map[string]string{"base": "main", "head": "feature"}
	if got := resolve(fake.MergeBase(), pair); got.Value != main || !got.Revision {
		t.Errorf("merge base: %+v", got)
	}
	repository.Commit("main", map[string]string{"a.txt": "other\n"})
	if got := resolve(fake.MergeBase(), pair); got.Value != main {
		t.Errorf("merge base after main moved on: %+v", got)
	}
	diff := resolve(fake.Diff(), pair)
	if patch, _ := diff.Value.(string); !strings.Contains(patch, "+two") || strings.Contains(patch, "other") || !strings.HasPrefix(diff.Identity, "sha256:") {
		t.Errorf("diff: %+v", diff)
	}
	if got := resolve(fake.ChangedFiles(), pair); !reflect.DeepEqual(got.Value, []string{"a.txt", "dir/b.txt"}) || !strings.HasPrefix(got.Identity, "sha256:") {
		t.Errorf("changed files: %+v", got)
	}
	same := map[string]string{"base": feature, "head": "feature"}
	if _, err := fake.Diff().Resolve(ctx, app.InputSpec{Args: same, Cwd: root}); err == nil || !strings.Contains(err.Error(), "no changes between") {
		t.Errorf("an empty diff: %v", err)
	}
	if _, err := fake.Revision().Resolve(ctx, app.InputSpec{Args: map[string]string{"rev": "main"}, Cwd: t.TempDir()}); err == nil {
		t.Error("resolved outside every recorded repository")
	}
}
