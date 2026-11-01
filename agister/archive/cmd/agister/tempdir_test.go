package main

import (
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
	"unicode"
	"unicode/utf8"
)

// tempDir replaces t.TempDir: a fresh directory the test owns, removed at
// cleanup. Unlike t.TempDir, a failed removal names what is left.
func tempDir(t testing.TB) string {
	t.Helper()
	return ownedTempDir(t, os.RemoveAll)
}

// shownLeftovers caps the paths a failed removal lists.
const shownLeftovers = 20

var (
	tempRootsMu sync.Mutex
	tempRoots   = map[testing.TB]*tempRoot{}
)

// tempRoot is one test's parent directory, as with t.TempDir: created on
// the first call and removed by the cleanup registered then, so it runs
// after every cleanup the test registers later.
type tempRoot struct {
	dir string
	seq int
}

// ownedTempDir is tempDir with the removal injected: the seam a test uses
// to make removal fail.
func ownedTempDir(t testing.TB, remove func(string) error) string {
	t.Helper()
	tempRootsMu.Lock()
	defer tempRootsMu.Unlock()
	root := tempRoots[t]
	if root == nil {
		// The test name, cut to what is safe in a file name; the directory
		// sits under os.TempDir unresolved (on macOS behind /var), as
		// t.TempDir's does.
		dir, err := os.MkdirTemp("", strings.Map(safeNameRune, t.Name()))
		if err != nil {
			t.Fatalf("tempDir: %v", err)
		}
		root = &tempRoot{dir: dir}
		tempRoots[t] = root
		t.Cleanup(func() {
			tempRootsMu.Lock()
			delete(tempRoots, t)
			tempRootsMu.Unlock()
			if err := remove(dir); err != nil {
				t.Errorf("%s", leftoverReport(t.Name(), dir, err))
			}
		})
	}
	dir, err := os.MkdirTemp(root.dir, fmt.Sprintf("%03d", root.seq))
	if err != nil {
		t.Fatalf("tempDir: %v", err)
	}
	root.seq++
	return dir
}

// safeNameRune keeps the runes t.TempDir keeps in its directory name.
func safeNameRune(r rune) rune {
	if r < utf8.RuneSelf {
		const allowed = "!#$%&()+,-.=@^_{}~ "
		if '0' <= r && r <= '9' || 'a' <= r && r <= 'z' || 'A' <= r && r <= 'Z' || strings.ContainsRune(allowed, r) {
			return r
		}
	} else if unicode.IsLetter(r) || unicode.IsNumber(r) {
		return r
	}
	return -1
}

// leftoverReport names the test and what removal left in dir: up to
// shownLeftovers paths relative to dir, each with its size and
// modification time, and how many more.
func leftoverReport(test, dir string, removeErr error) string {
	var b strings.Builder
	fmt.Fprintf(&b, "%s: removing temporary directory %s: %v", test, dir, removeErr)
	var lines []string
	walkErr := filepath.WalkDir(dir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			lines = append(lines, fmt.Sprintf("%s: %v", path, err))
			return nil
		}
		if path == dir {
			return nil
		}
		rel, _ := filepath.Rel(dir, path)
		if d.IsDir() {
			rel += string(filepath.Separator)
		}
		info, err := d.Info()
		if err != nil {
			lines = append(lines, fmt.Sprintf("%s: %v", rel, err))
			return nil
		}
		lines = append(lines, fmt.Sprintf("%s  %d bytes  modified %s", rel, info.Size(), info.ModTime().Format(time.RFC3339Nano)))
		return nil
	})
	fmt.Fprintf(&b, "\nleft behind (%d):", len(lines))
	for i, line := range lines {
		if i == shownLeftovers {
			fmt.Fprintf(&b, "\n  ... and %d more", len(lines)-shownLeftovers)
			break
		}
		b.WriteString("\n  " + line)
	}
	if walkErr != nil {
		fmt.Fprintf(&b, "\nlisting: %v", walkErr)
	}
	return b.String()
}

// recordingTB is the testing.TB a tempDir test hands the helper: it keeps
// the cleanups and the failures instead of failing the real test.
type recordingTB struct {
	testing.TB
	name     string
	cleanups []func()
	errors   []string
}

func (r *recordingTB) Helper()                   {}
func (r *recordingTB) Name() string              { return r.name }
func (r *recordingTB) Cleanup(f func())          { r.cleanups = append(r.cleanups, f) }
func (r *recordingTB) Errorf(f string, a ...any) { r.errors = append(r.errors, fmt.Sprintf(f, a...)) }
func (r *recordingTB) Fatalf(f string, a ...any) {
	r.errors = append(r.errors, fmt.Sprintf(f, a...))
	panic("recordingTB.Fatalf: " + r.errors[len(r.errors)-1])
}

// runCleanups runs the cleanups last first, each once: a cleanup is
// dropped before it runs, so a second drain runs only what the first left.
func (r *recordingTB) runCleanups() {
	for len(r.cleanups) > 0 {
		last := r.cleanups[len(r.cleanups)-1]
		r.cleanups = r.cleanups[:len(r.cleanups)-1]
		last()
	}
}

// Contract test: the real filesystem: what removing a test's directory
// removes, and what a failed removal leaves.
func TestTempDirReportsWhatAFailedRemovalLeaves(t *testing.T) {
	t.Parallel()
	fake := &recordingTB{name: "TestSomething/sub"}
	var root string
	t.Cleanup(func() {
		if root != "" {
			os.RemoveAll(root)
		}
	})
	// The leftover's modification time; the report prints it local.
	mtime := time.Date(2024, 5, 6, 7, 8, 9, 0, time.UTC)
	// Removes the test's directories, then something drops a file.
	leaveFile := func(dir string) error {
		root = dir
		entries, err := os.ReadDir(dir)
		if err != nil {
			t.Fatal(err)
		}
		for _, e := range entries {
			if err := os.RemoveAll(filepath.Join(dir, e.Name())); err != nil {
				t.Fatal(err)
			}
		}
		leftover := filepath.Join(dir, ".DS_Store")
		if err := os.WriteFile(leftover, []byte("finder"), 0o644); err != nil {
			t.Fatal(err)
		}
		if err := os.Chtimes(leftover, mtime, mtime); err != nil {
			t.Fatal(err)
		}
		return fmt.Errorf("unlinkat %s: directory not empty", dir)
	}
	// A failed assertion before the drain below still removes the
	// directories; this cleanup runs before the one removing root.
	t.Cleanup(fake.runCleanups)
	dir := ownedTempDir(fake, leaveFile)
	if !strings.HasPrefix(dir, os.TempDir()) {
		t.Errorf("dir %s is not under %s", dir, os.TempDir())
	}
	fake.runCleanups()

	if len(fake.errors) != 1 {
		t.Fatalf("errors = %q, want one report", fake.errors)
	}
	report := fake.errors[0]
	for _, want := range []string{"TestSomething/sub: ", "directory not empty", "\n  .DS_Store  6 bytes  modified " + mtime.Local().Format(time.RFC3339Nano), "left behind (1):"} {
		if !strings.Contains(report, want) {
			t.Errorf("report lacks %q:\n%s", want, report)
		}
	}
}

// Contract test: the real filesystem: what removing a test's directory
// removes, and what a failed removal leaves.
func TestTempDirRemovesItsDirectory(t *testing.T) {
	t.Parallel()
	fake := &recordingTB{name: "TestSomething"}
	t.Cleanup(fake.runCleanups)
	first, second := ownedTempDir(fake, os.RemoveAll), ownedTempDir(fake, os.RemoveAll)
	if filepath.Dir(first) != filepath.Dir(second) || first == second {
		t.Fatalf("dirs %s and %s: want two under one test directory", first, second)
	}
	fake.runCleanups()
	if len(fake.errors) != 0 {
		t.Fatalf("errors = %q", fake.errors)
	}
	if _, err := os.Stat(filepath.Dir(first)); !os.IsNotExist(err) {
		t.Fatalf("test directory still there: %v", err)
	}
}

func TestLeftoverReportCountsWhatItDoesNotShow(t *testing.T) {
	t.Parallel()
	dir := tempDir(t)
	for i := range shownLeftovers + 5 {
		write(t, filepath.Join(dir, fmt.Sprintf("f%02d", i)), "x")
	}
	report := leftoverReport("TestX", dir, fmt.Errorf("boom"))
	if !strings.Contains(report, "left behind (25):") || !strings.Contains(report, "... and 5 more") {
		t.Fatalf("report:\n%s", report)
	}
	if strings.Contains(report, "f20") || !strings.Contains(report, "f19  1 bytes") {
		t.Fatalf("report shows the wrong paths:\n%s", report)
	}
}
