package files_test

import (
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"slices"
	"testing"

	"github.com/igor1309/ai-labs/agister/files"
)

// files.feature, "A folder's entries, with what each is".
//
// Contract test: the operating system's filesystem.
func TestAFoldersEntriesWithWhatEachIs(t *testing.T) {
	t.Parallel()
	d := filepath.Join(t.TempDir(), "d")
	if err := os.MkdirAll(filepath.Join(d, "s"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(d, "f"), nil, 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink("f", filepath.Join(d, "l")); err != nil {
		t.Fatal(err)
	}
	got, err := files.New().Entries(d)
	if err != nil {
		t.Fatal(err)
	}
	want := []files.Entry{{Name: "f", Kind: files.RegularFile}, {Name: "l", Kind: files.Other}, {Name: "s", Kind: files.Folder}}
	if !slices.Equal(got, want) {
		t.Errorf("entries %+v, want %+v", got, want)
	}
}

// files.feature, "A folder that does not exist".
//
// Contract test: the operating system's filesystem.
func TestAFolderThatDoesNotExist(t *testing.T) {
	t.Parallel()
	_, err := files.New().Entries(filepath.Join(t.TempDir(), "missing"))
	if !errors.Is(err, fs.ErrNotExist) {
		t.Errorf("error %v, want one that is, or wraps, fs.ErrNotExist", err)
	}
}

// files.feature, "A file's bytes".
//
// Contract test: the operating system's filesystem.
func TestAFilesBytes(t *testing.T) {
	t.Parallel()
	f := filepath.Join(t.TempDir(), "f")
	if err := os.WriteFile(f, []byte("abc"), 0o644); err != nil {
		t.Fatal(err)
	}
	got, err := files.New().Bytes(f)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != "abc" {
		t.Errorf("bytes %q, want %q", got, "abc")
	}
}

// files.feature, "A folder's path, with its links resolved". The
// temporary folder's own path may hold a link, as macOS's /var does: the
// path of "r/a" is the one with the temporary folder's links resolved.
//
// Contract test: the operating system's filesystem.
func TestAFoldersPathWithItsLinksResolved(t *testing.T) {
	t.Parallel()
	root, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	a := filepath.Join(root, "r", "a")
	if err := os.MkdirAll(a, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(filepath.Join(root, "o"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(a, filepath.Join(root, "o", "x")); err != nil {
		t.Fatal(err)
	}
	got, err := files.New().Resolved(filepath.Join(root, "o", "x"))
	if err != nil {
		t.Fatal(err)
	}
	if got != a {
		t.Errorf("resolved %q, want %q", got, a)
	}
}
