package fsexport

import (
	"errors"
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
	folders := Folders{Runs: filepath.Join(t.TempDir(), "runs")}
	if err := folders.Folder(dir); err != nil {
		t.Fatalf("a directory: %v", err)
	}
	for path, want := range map[string]string{filepath.Join(dir, "absent"): "does not exist", file: "is not a directory"} {
		if err := folders.Folder(path); err == nil || err.Error() != want {
			t.Errorf("%s: %v, want %q", path, err, want)
		}
	}
	if err := (Folders{}).Folder(dir); err == nil || err.Error() != "the run store's directory is not configured" {
		t.Errorf("no run store: %v", err)
	}
}

// No directory in the run store takes copies, under any name: the store's
// directory, a run's, or one in a run, named as they are or through a
// link. The directory that holds the store does, and so does one beside
// it.
//
// Contract test: the export folders against the real filesystem.
func TestFolderRefusesTheRunStore(t *testing.T) {
	t.Parallel()
	home := t.TempDir()
	runs := filepath.Join(home, "runs")
	run := filepath.Join(runs, "r1")
	if err := os.MkdirAll(filepath.Join(run, "artifacts"), 0o700); err != nil {
		t.Fatal(err)
	}
	links := t.TempDir()
	for name, target := range map[string]string{"store": runs, "run": run} {
		if err := os.Symlink(target, filepath.Join(links, name)); err != nil {
			t.Fatal(err)
		}
	}
	beside := filepath.Join(home, "audit")
	if err := os.Mkdir(beside, 0o700); err != nil {
		t.Fatal(err)
	}
	folders := Folders{Runs: runs}
	want := "is in the run store " + runs + ": the copies go out of it"
	for _, dir := range []string{
		runs, run, filepath.Join(run, "artifacts"),
		filepath.Join(links, "store"), filepath.Join(links, "run"), filepath.Join(links, "store", "r1", "artifacts"),
		filepath.Join(beside, "..", "runs", "r1"),
	} {
		if err := folders.Folder(dir); err == nil || err.Error() != want {
			t.Errorf("%s: %v, want %q", dir, err, want)
		}
	}
	for _, dir := range []string{home, beside, links} {
		if err := folders.Folder(dir); err != nil {
			t.Errorf("%s: %v", dir, err)
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

// fakeFile records what synced does to it; sync, when set, is what Sync
// returns.
type fakeFile struct {
	sync  error
	calls []string
}

func (f *fakeFile) Write(p []byte) (int, error) { return len(p), nil }

func (f *fakeFile) Sync() error {
	f.calls = append(f.calls, "sync")
	return f.sync
}

func (f *fakeFile) Close() error {
	f.calls = append(f.calls, "close")
	return nil
}

// A staged file is synced to the disk before it is closed, and a sync that
// fails fails the close, which still closes the file.
func TestAStagedFileIsSyncedAsItIsClosed(t *testing.T) {
	t.Parallel()
	t.Run("synced", func(t *testing.T) {
		t.Parallel()
		file := &fakeFile{}
		if err := (synced{file}).Close(); err != nil {
			t.Fatal(err)
		}
		if want := []string{"sync", "close"}; !reflect.DeepEqual(file.calls, want) {
			t.Fatalf("calls = %v, want %v", file.calls, want)
		}
	})
	t.Run("sync fails", func(t *testing.T) {
		t.Parallel()
		failed := errors.New("disk failed")
		file := &fakeFile{sync: failed}
		if err := (synced{file}).Close(); !errors.Is(err, failed) {
			t.Fatalf("close = %v, want %v", err, failed)
		}
		if want := []string{"sync", "close"}; !reflect.DeepEqual(file.calls, want) {
			t.Fatalf("calls = %v, want %v", file.calls, want)
		}
	})
}

// What a stage creates is a file synced as it is closed.
//
// Contract test: the export folders against the real filesystem.
func TestAStageCreatesSyncedFiles(t *testing.T) {
	t.Parallel()
	stage, err := Folders{}.Stage(t.TempDir(), "r1")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = stage.Discard() })
	created, err := stage.Create("record.json")
	if err != nil {
		t.Fatal(err)
	}
	defer created.Close()
	if _, ok := created.(synced); !ok {
		t.Fatalf("created a %T, not a synced file", created)
	}
}
