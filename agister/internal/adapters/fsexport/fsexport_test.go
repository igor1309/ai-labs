package fsexport

import (
	"io"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

// write writes text to the slash-separated path in stage.
func write(t *testing.T, stage interface {
	Create(string) (io.WriteCloser, error)
}, path, text string) {
	t.Helper()
	file, err := stage.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := io.WriteString(file, text); err != nil {
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}
}

// Folder takes an existing directory, and says why it takes nothing else.
//
// Contract test: the export folders against the real filesystem.
func TestFolderTakesOnlyAnExistingDirectory(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	file := filepath.Join(dir, "file")
	if err := os.WriteFile(file, nil, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := (Folders{}).Folder(dir); err != nil {
		t.Fatalf("a directory: %v", err)
	}
	for path, want := range map[string]string{filepath.Join(dir, "absent"): "does not exist", file: "is not a directory"} {
		if err := (Folders{}).Folder(path); err == nil || err.Error() != want {
			t.Errorf("%s: %v, want %q", path, err, want)
		}
	}
}

// A staged copy is no copy until it is committed: its folder is named
// apart, and discarding it leaves nothing. Committed, it is the copy, as
// written.
//
// Contract test: the export folders against the real filesystem.
func TestAStagedCopyIsACopyOnlyOnceCommitted(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	folders := Folders{}
	stage, err := folders.Stage(dir, "r1")
	if err != nil {
		t.Fatal(err)
	}
	write(t, stage, "record.json", "{}\n")
	write(t, stage, "artifacts/out.txt", "bytes\n")
	if _, ok, err := folders.Copy(dir, "r1"); ok || err != nil {
		t.Fatalf("an uncommitted stage reads as a copy: %v", err)
	}
	if file, err := stage.Open("artifacts/out.txt"); err != nil {
		t.Fatal(err)
	} else {
		data, _ := io.ReadAll(file)
		file.Close()
		if string(data) != "bytes\n" {
			t.Fatalf("staged = %q", data)
		}
	}
	if err := stage.Commit(); err != nil {
		t.Fatal(err)
	}
	if err := stage.Discard(); err != nil {
		t.Fatal(err)
	}
	files, ok, err := folders.Copy(dir, "r1")
	if want := []string{"artifacts/out.txt", "record.json"}; !ok || err != nil || !reflect.DeepEqual(files, want) {
		t.Fatalf("copy = %v %v %v, want %v", files, ok, err, want)
	}
	file, err := folders.OpenCopy(dir, "r1", "record.json")
	if err != nil {
		t.Fatal(err)
	}
	data, _ := io.ReadAll(file)
	file.Close()
	if string(data) != "{}\n" {
		t.Fatalf("copy's record = %q", data)
	}

	discarded, err := folders.Stage(dir, "r2")
	if err != nil {
		t.Fatal(err)
	}
	write(t, discarded, "record.json", "{}\n")
	if err := discarded.Discard(); err != nil {
		t.Fatal(err)
	}
	entries, _ := os.ReadDir(dir)
	if len(entries) != 1 || entries[0].Name() != "r1" {
		t.Fatalf("the folder holds %v", entries)
	}
}

// A commit never replaces what is at its target: a copy that appeared
// meanwhile stays as it is.
//
// Contract test: the export folders against the real filesystem.
func TestACommitReplacesNothing(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	folders := Folders{}
	stage, err := folders.Stage(dir, "r1")
	if err != nil {
		t.Fatal(err)
	}
	write(t, stage, "record.json", "new\n")
	if err := os.Mkdir(filepath.Join(dir, "r1"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := stage.Commit(); err == nil || !strings.Contains(err.Error(), "exists") {
		t.Fatalf("commit over a copy: %v", err)
	}
	if entries, _ := os.ReadDir(filepath.Join(dir, "r1")); len(entries) != 0 {
		t.Fatalf("the copy there holds %v", entries)
	}
	if err := stage.Discard(); err != nil {
		t.Fatal(err)
	}
}

// What is not a copy's directory, or holds what is not a file, is an
// error; no path leads out of a copy.
//
// Contract test: the export folders against the real filesystem.
func TestCopyRefusesWhatIsNotACopy(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	folders := Folders{}
	if err := os.WriteFile(filepath.Join(dir, "r1"), nil, 0o600); err != nil {
		t.Fatal(err)
	}
	if _, _, err := folders.Copy(dir, "r1"); err == nil {
		t.Fatal("a file read as a copy")
	}
	if err := os.MkdirAll(filepath.Join(dir, "r2"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(filepath.Join(dir, "r1"), filepath.Join(dir, "r2", "record.json")); err != nil {
		t.Fatal(err)
	}
	if _, _, err := folders.Copy(dir, "r2"); err == nil {
		t.Fatal("a copy holding a link read as one")
	}
	if file, err := folders.OpenCopy(dir, "r2", "../r1"); err == nil {
		file.Close()
		t.Fatal("opened a path out of the copy")
	}
	stage, err := folders.Stage(dir, "r3")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = stage.Discard() })
	if _, err := stage.Create("../escape"); err == nil {
		t.Fatal("created a file out of the stage")
	}
	if _, err := folders.Stage(dir, "../r4"); err == nil {
		t.Fatal("staged a copy out of the folder")
	}
}
