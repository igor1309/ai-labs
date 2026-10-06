package gittest_test

import (
	"context"
	"errors"
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

// files reads every file under dir, by slash-separated path.
func files(t *testing.T, dir string) map[string]string {
	t.Helper()
	found := map[string]string{}
	err := filepath.WalkDir(dir, func(path string, entry os.DirEntry, err error) error {
		if err != nil || entry.IsDir() {
			return err
		}
		data, err := os.ReadFile(path)
		rel, _ := filepath.Rel(dir, path)
		found[filepath.ToSlash(rel)] = string(data)
		return err
	})
	if err != nil {
		t.Fatal(err)
	}
	return found
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

// A checkout holds the revision's tree in a directory of its own, which
// its release removes.
func TestACheckoutHoldsTheRevisionUntilReleased(t *testing.T) {
	t.Parallel()
	fake, _, root, main, _ := recorded(t)
	dir, release, err := fake.Checkout(ctx, root, main)
	if err != nil {
		t.Fatal(err)
	}
	if got := files(t, dir); !reflect.DeepEqual(got, map[string]string{"a.txt": "one\n"}) {
		t.Fatalf("checkout holds %v", got)
	}
	if got := left(t, fake); len(got) != 1 || got[0] != filepath.Dir(dir) {
		t.Fatalf("left %v", got)
	}
	if err := release(); err != nil {
		t.Fatal(err)
	}
	if got := left(t, fake); len(got) != 0 {
		t.Fatalf("left after release: %v", got)
	}
	if _, _, err := fake.Checkout(ctx, root, "missing"); err == nil {
		t.Fatal("checked out an unknown revision")
	}
}

// A checkout's identity is its revision's content; a change to its files,
// a new file included, changes it, and Changes is the patch between them,
// empty for the same content.
func TestIdentityNamesEveryFileAndChangesDiffsContents(t *testing.T) {
	t.Parallel()
	fake, _, root, main, feature := recorded(t)
	dir, release, err := fake.Checkout(ctx, root, feature)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = release() })
	before, err := fake.Identity(ctx, dir, feature)
	if err != nil {
		t.Fatal(err)
	}
	if patch, err := fake.Changes(ctx, dir, feature, before); err != nil || len(patch) != 0 {
		t.Fatalf("the checkout's own content differs from its revision: %q, %v", patch, err)
	}
	if err := os.WriteFile(filepath.Join(dir, "new.log"), []byte("made\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	after, err := fake.Identity(ctx, dir, feature)
	if err != nil || after == before {
		t.Fatalf("a new file left the identity %q: %v", after, err)
	}
	patch, err := fake.Changes(ctx, dir, main, after)
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"+++ b/a.txt", "+two", "+++ b/dir/b.txt", "+++ b/new.log", "+made"} {
		if !strings.Contains(string(patch), want) {
			t.Errorf("patch lacks %q:\n%s", want, patch)
		}
	}
	if _, err := fake.Changes(ctx, dir, main, "unknown"); err == nil {
		t.Error("diffed an unknown content")
	}
}

// A patch Changes made, applied to the content it was made from, rebuilds
// the other: files changed, added, removed, and ending with no newline.
func TestApplyRebuildsWhatChangesDiffed(t *testing.T) {
	t.Parallel()
	fake, _, root, _, feature := recorded(t)
	dir, release, err := fake.Checkout(ctx, root, feature)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = release() })
	if err := os.Remove(filepath.Join(dir, "a.txt")); err != nil {
		t.Fatal(err)
	}
	for path, text := range map[string]string{"dir/b.txt": "changed\n\nlast", "c/d.txt": "", "e.txt": "+--\n"} {
		if err := os.MkdirAll(filepath.Dir(filepath.Join(dir, path)), 0o700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(dir, path), []byte(text), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	want := files(t, dir)
	identity, err := fake.Identity(ctx, dir, feature)
	if err != nil {
		t.Fatal(err)
	}
	patch, err := fake.Changes(ctx, dir, feature, identity)
	if err != nil {
		t.Fatal(err)
	}
	copied, discard, err := fake.Checkout(ctx, root, feature)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = discard() })
	if err := fake.Apply(ctx, copied, patch, true); err != nil {
		t.Fatal(err)
	}
	if got := files(t, copied); got["a.txt"] != "one\ntwo\n" {
		t.Fatalf("a check changed the files: %v", got)
	}
	if err := fake.Apply(ctx, copied, patch, false); err != nil {
		t.Fatal(err)
	}
	if got := files(t, copied); !reflect.DeepEqual(got, want) {
		t.Fatalf("applied:\n%v\nwant:\n%v", got, want)
	}
}

// Rebuild names what a revision with a patch applied holds, as Identity
// names a directory with those files, without writing anything; no patch
// rebuilds the revision, and one that does not apply is an error.
func TestRebuildNamesTheContentAPatchMakesFromARevision(t *testing.T) {
	t.Parallel()
	fake, _, root, main, feature := recorded(t)
	dir, release, err := fake.Checkout(ctx, root, main)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = release() })
	want, err := fake.Identity(ctx, dir, main)
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
	if err := fake.Apply(ctx, dir, patch, false); err != nil {
		t.Fatal(err)
	}
	if applied, err := fake.Identity(ctx, dir, main); err != nil || rebuilt != applied {
		t.Fatalf("rebuilt %s, applied %s, %v", rebuilt, applied, err)
	}
	if again, err := fake.Changes(ctx, root, rebuilt, feature); err != nil || len(again) != 0 {
		t.Fatalf("the rebuilt content differs from feature's: %q, %v", again, err)
	}
	if _, err := fake.Rebuild(ctx, root, feature, patch); err == nil {
		t.Fatal("a patch that does not apply was rebuilt")
	}
}

// A patch Changes made between revisions where a file and a directory
// trade places applies to a checkout of the first and rebuilds the second,
// both ways; a patch that would leave a path both a file and a directory
// does not apply.
func TestApplyReplacesAFileWithADirectoryAndBack(t *testing.T) {
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
		want     map[string]string
	}{
		{"file to directory", fileRevision, directoryRevision, directory},
		{"directory to file", directoryRevision, fileRevision, file},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			patch, err := fake.Changes(ctx, root, c.from, c.to)
			if err != nil {
				t.Fatal(err)
			}
			dir, release, err := fake.Checkout(ctx, root, c.from)
			if err != nil {
				t.Fatal(err)
			}
			t.Cleanup(func() { _ = release() })
			if err := fake.Apply(ctx, dir, patch, true); err != nil {
				t.Fatalf("check: %v", err)
			}
			if err := fake.Apply(ctx, dir, patch, false); err != nil {
				t.Fatal(err)
			}
			if got := files(t, dir); !reflect.DeepEqual(got, c.want) {
				t.Fatalf("applied:\n%v\nwant:\n%v", got, c.want)
			}
			if identity, err := fake.Identity(ctx, dir, c.to); err != nil {
				t.Fatal(err)
			} else if rest, err := fake.Changes(ctx, root, c.to, identity); err != nil || len(rest) != 0 {
				t.Fatalf("the applied checkout differs from its target: %q, %v", rest, err)
			}
		})
	}
	t.Run("both a file and a directory", func(t *testing.T) {
		t.Parallel()
		dir, release, err := fake.Checkout(ctx, root, fileRevision)
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { _ = release() })
		// It adds node/child.txt and leaves node a file.
		patch := []byte("diff --git a/node/child.txt b/node/child.txt\n--- /dev/null\n+++ b/node/child.txt\n@@ -0,0 +1,1 @@\n+a child\n")
		for _, check := range []bool{true, false} {
			if err := fake.Apply(ctx, dir, patch, check); err == nil || !strings.Contains(err.Error(), "both a file and a directory") {
				t.Fatalf("check %t: a patch made node both a file and a directory: %v", check, err)
			}
		}
		if got := files(t, dir); !reflect.DeepEqual(got, file) {
			t.Fatalf("a failed apply changed the files: %v", got)
		}
	})
}

// A patch that does not apply, whole, changes nothing.
func TestAPatchThatDoesNotApplyChangesNothing(t *testing.T) {
	t.Parallel()
	fake, _, root, main, feature := recorded(t)
	patch, err := fake.Changes(ctx, root, main, feature)
	if err != nil {
		t.Fatal(err)
	}
	// feature's tree already has dir/b.txt, which the patch adds: only
	// a.txt would apply.
	dir, release, err := fake.Checkout(ctx, root, feature)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = release() })
	if err := os.WriteFile(filepath.Join(dir, "a.txt"), []byte("one\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := fake.Apply(ctx, dir, patch, false); err == nil {
		t.Fatal("a patch applied over a file it adds")
	}
	if got := files(t, dir); !reflect.DeepEqual(got, map[string]string{"a.txt": "one\n", "dir/b.txt": "no newline"}) {
		t.Fatalf("a failed apply changed the files: %v", got)
	}
	if err := fake.Apply(ctx, dir, []byte("not a patch\n"), true); err == nil {
		t.Fatal("applied what is not a patch")
	}
}

// A clean copy is the revision with the patch applied at the place named
// for its call. A taken place is refused; a copy that cannot be finished
// is removed; discard removes it, takes one gone as success and refuses a
// directory the fake did not make.
func TestACleanCopyIsMadeAtItsPlaceAndDiscarded(t *testing.T) {
	t.Parallel()
	fake, _, root, main, feature := recorded(t)
	patch, err := fake.Changes(ctx, root, main, feature)
	if err != nil {
		t.Fatal(err)
	}
	place := fake.Place("call-1")
	if _, err := os.Stat(place); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("Place made %s: %v", place, err)
	}
	if err := fake.Copy(ctx, root, place, main, patch); err != nil {
		t.Fatal(err)
	}
	if got := files(t, place); !reflect.DeepEqual(got, map[string]string{"a.txt": "one\ntwo\n", "dir/b.txt": "no newline"}) {
		t.Fatalf("copy holds %v", got)
	}
	if err := fake.Copy(ctx, root, place, main, nil); !errors.Is(err, app.ErrPlaceTaken) {
		t.Fatalf("copy over a taken place: %v", err)
	}
	if err := fake.Discard(ctx, root, place); err != nil {
		t.Fatal(err)
	}
	if err := fake.Discard(ctx, root, place); err != nil {
		t.Fatalf("discarding a copy already gone: %v", err)
	}
	unfinished := fake.Place("call-2")
	if err := fake.Copy(ctx, root, unfinished, feature, patch); err == nil {
		t.Fatal("a copy whose patch does not apply was made")
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
