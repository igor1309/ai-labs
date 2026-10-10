package logging_test

import (
	"compress/gzip"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"syscall"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/adapters/logging"
)

// logged is every line in the log at path and its old files, oldest first.
func logged(t *testing.T, path string, keep int) []string {
	t.Helper()
	var text strings.Builder
	for n := keep; n >= 1; n-- {
		old, err := unzip(fmt.Sprintf("%s.%d.gz", path, n))
		if os.IsNotExist(err) {
			continue
		}
		if err != nil {
			t.Fatal(err)
		}
		text.WriteString(old)
	}
	current, err := os.ReadFile(path)
	if err != nil && !os.IsNotExist(err) {
		t.Fatal(err)
	}
	text.Write(current)
	if text.Len() == 0 {
		return nil
	}
	return strings.Split(strings.TrimSuffix(text.String(), "\n"), "\n")
}

// unzip is what the old file at path holds, the file closed on every path.
func unzip(path string) (string, error) {
	file, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer file.Close()
	unzipped, err := gzip.NewReader(file)
	if err != nil {
		return "", err
	}
	text, err := io.ReadAll(unzipped)
	return string(text), errors.Join(err, unzipped.Close())
}

// read is what the file at path holds.
func read(t *testing.T, path string) string {
	t.Helper()
	text, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return string(text)
}

// names is what the directory holds.
func names(t *testing.T, dir string) []string {
	t.Helper()
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	var found []string
	for _, entry := range entries {
		found = append(found, entry.Name())
	}
	return found
}

// The log driven far past its cap: after every write it is within Max and
// has no more than Keep old files, compressed, and what is kept is the
// newest lines, in the order written. A record longer than Max is refused,
// and the log is left as it was.
//
// Contract test: the real filesystem and the kernel's flock.
func TestTheLogStaysWithinItsCap(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	path := filepath.Join(dir, "agister.jsonl")
	file := logging.File{Path: path, Max: 100, Keep: 3, Append: (*os.File).Write}
	var written []string
	for i := range 200 {
		line := fmt.Sprintf(`{"line":%03d}`, i)
		written = append(written, line)
		if n, err := file.Write([]byte(line + "\n")); err != nil || n != len(line)+1 {
			t.Fatalf("write %d: %d, %v", i, n, err)
		}
		info, err := os.Stat(path)
		if err != nil {
			t.Fatal(err)
		}
		if found := names(t, dir); info.Size() > file.Max || len(found) > file.Keep+1 {
			t.Fatalf("after line %d: %d bytes, %v", i, info.Size(), found)
		}
	}
	want := []string{"agister.jsonl", "agister.jsonl.1.gz", "agister.jsonl.2.gz", "agister.jsonl.3.gz"}
	if found := names(t, dir); strings.Join(found, " ") != strings.Join(want, " ") {
		t.Fatalf("files = %v", found)
	}
	kept := logged(t, path, file.Keep)
	if len(kept) == 0 || len(kept) >= len(written) || strings.Join(kept, "\n") != strings.Join(written[len(written)-len(kept):], "\n") {
		t.Fatalf("kept %d of %d lines: %v", len(kept), len(written), kept)
	}
	current := read(t, path)
	if _, err := file.Write([]byte(strings.Repeat("x", int(file.Max)) + "\n")); err == nil || !strings.Contains(err.Error(), "longer than") {
		t.Fatalf("a record longer than the cap: %v", err)
	}
	if after := read(t, path); after != current {
		t.Fatalf("the log changed: %q", after)
	}
}

// A rotation whose compression fails, as on a full disk, moves no old
// file: the write fails, the log and every old file are as they were, and
// the rotation that then succeeds drops only the oldest.
//
// Contract test: the real filesystem, the compressed file's path taken by
// a directory that cannot be removed.
func TestAFailedCompressionKeepsTheOldFiles(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	path := filepath.Join(dir, "agister.jsonl")
	file := logging.File{Path: path, Max: 100, Keep: 3, Append: (*os.File).Write}
	full := strings.Repeat(`{"line":"full"}`+"\n", 6)
	if err := os.WriteFile(path, []byte(full), 0o600); err != nil {
		t.Fatal(err)
	}
	for n := 1; n <= file.Keep; n++ {
		if err := os.WriteFile(fmt.Sprintf("%s.%d.gz", path, n), fmt.Appendf(nil, "old %d", n), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	obstruction := path + ".1.gz.tmp"
	if err := os.MkdirAll(filepath.Join(obstruction, "full"), 0o700); err != nil {
		t.Fatal(err)
	}
	if _, err := file.Write([]byte(`{"line":"next"}` + "\n")); err == nil || !strings.Contains(err.Error(), "rotating") {
		t.Fatalf("the write: %v", err)
	}
	for n := 1; n <= file.Keep; n++ {
		if old := read(t, fmt.Sprintf("%s.%d.gz", path, n)); old != fmt.Sprintf("old %d", n) {
			t.Fatalf("old file %d = %q", n, old)
		}
	}
	if current := read(t, path); current != full {
		t.Fatalf("the log = %q", current)
	}

	if err := os.RemoveAll(obstruction); err != nil {
		t.Fatal(err)
	}
	if _, err := file.Write([]byte(`{"line":"next"}` + "\n")); err != nil {
		t.Fatal(err)
	}
	if newest, err := unzip(path + ".1.gz"); err != nil || newest != full || read(t, path+".2.gz") != "old 1" || read(t, path+".3.gz") != "old 2" {
		t.Fatalf("the newest old file = %q, %v, then %q and %q", newest, err, read(t, path+".2.gz"), read(t, path+".3.gz"))
	}
	want := []string{"agister.jsonl", "agister.jsonl.1.gz", "agister.jsonl.2.gz", "agister.jsonl.3.gz"}
	if found := names(t, dir); strings.Join(found, " ") != strings.Join(want, " ") {
		t.Fatalf("files = %v", found)
	}
}

// A log not given what it appends by is not usable, and says so.
func TestALogNotGivenItsAppendIsNotUsable(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	file := logging.File{Path: filepath.Join(dir, "agister.jsonl"), Max: 100, Keep: 1}
	if err := file.Usable(); err == nil || !strings.Contains(err.Error(), "no Append") {
		t.Fatalf("Usable: %v", err)
	}
	if found := names(t, dir); len(found) != 0 {
		t.Fatalf("files = %v", found)
	}
}

// Two writers append across many rotations, each opening the log for
// itself as two processes do: every line of both is kept whole, once, and
// each writer's lines stay in its order.
//
// While a writer appends, the directory is held by the kernel's lock, not
// only within the process: another open of it, as another process's, is
// refused the lock.
//
// Contract test: the real filesystem and the kernel's flock, which holds
// between two opens of the directory as it does between two processes.
func TestTwoWritersLoseNoLineAcrossRotations(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	path := filepath.Join(dir, "agister.jsonl")
	const lines, keep = 300, 1000
	var wait sync.WaitGroup
	failures := make(chan error, 4*lines)
	// held appends line once it finds the directory held: an open of its
	// own cannot take the lock, even without waiting.
	held := func(log *os.File, line []byte) (int, error) {
		other, err := os.Open(dir)
		if err != nil {
			return 0, err
		}
		defer other.Close()
		if err := syscall.Flock(int(other.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); !errors.Is(err, syscall.EWOULDBLOCK) {
			failures <- fmt.Errorf("another open of the directory locked it while a writer appended: %v", err)
		}
		return log.Write(line)
	}
	for _, writer := range []string{"a", "b"} {
		wait.Add(1)
		go func() {
			defer wait.Done()
			file := logging.File{Path: path, Max: 200, Keep: keep, Append: held}
			for i := range lines {
				if _, err := file.Write([]byte(fmt.Sprintf(`{"writer":"%s","line":%03d}`+"\n", writer, i))); err != nil {
					failures <- err
				}
			}
		}()
	}
	wait.Wait()
	close(failures)
	for err := range failures {
		t.Fatal(err)
	}

	kept := logged(t, path, keep)
	if _, err := os.Stat(path + ".2.gz"); err != nil {
		t.Fatalf("the log was not rotated: %v", err)
	}
	var want []string
	for _, writer := range []string{"a", "b"} {
		var own []string
		for _, line := range kept {
			if strings.Contains(line, `"writer":"`+writer+`"`) {
				own = append(own, line)
			}
		}
		if !sort.StringsAreSorted(own) {
			t.Fatalf("writer %s's lines are out of order", writer)
		}
		for i := range lines {
			want = append(want, fmt.Sprintf(`{"writer":"%s","line":%03d}`, writer, i))
		}
	}
	sort.Strings(kept)
	if strings.Join(kept, "\n") != strings.Join(want, "\n") {
		t.Fatalf("kept %d lines, want %d:\n%s", len(kept), len(want), strings.Join(kept, "\n"))
	}
}
