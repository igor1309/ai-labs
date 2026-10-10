package logging_test

import (
	"compress/gzip"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/adapters/logging"
)

// logged is every line in the log at path and its old files, oldest first.
func logged(t *testing.T, path string, keep int) []string {
	t.Helper()
	var text strings.Builder
	for n := keep; n >= 1; n-- {
		file, err := os.Open(fmt.Sprintf("%s.%d.gz", path, n))
		if os.IsNotExist(err) {
			continue
		}
		if err != nil {
			t.Fatal(err)
		}
		unzipped, err := gzip.NewReader(file)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := io.Copy(&text, unzipped); err != nil {
			t.Fatal(err)
		}
		file.Close()
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
// newest lines, in the order written.
//
// Contract test: the real filesystem and the kernel's flock.
func TestTheLogStaysWithinItsCap(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	path := filepath.Join(dir, "agister.jsonl")
	file := logging.File{Path: path, Max: 100, Keep: 3}
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
}

// A line longer than the cap is still written, alone.
//
// Contract test: the real filesystem and the kernel's flock.
func TestALineLongerThanTheCapIsWrittenAlone(t *testing.T) {
	t.Parallel()
	path := filepath.Join(t.TempDir(), "agister.jsonl")
	file := logging.File{Path: path, Max: 10, Keep: 2}
	long := strings.Repeat("x", 40)
	for _, line := range []string{"short", long, "after"} {
		if _, err := file.Write([]byte(line + "\n")); err != nil {
			t.Fatal(err)
		}
	}
	if current, _ := os.ReadFile(path); string(current) != "after\n" {
		t.Fatalf("log = %q", current)
	}
	if kept := logged(t, path, file.Keep); strings.Join(kept, " ") != "short "+long+" after" {
		t.Fatalf("kept = %v", kept)
	}
}

// Two writers append across many rotations, each opening the log for
// itself as two processes do: every line of both is kept whole, once, and
// each writer's lines stay in its order.
//
// Contract test: the real filesystem and the kernel's flock, which holds
// between two opens of the directory as it does between two processes.
func TestTwoWritersLoseNoLineAcrossRotations(t *testing.T) {
	t.Parallel()
	path := filepath.Join(t.TempDir(), "agister.jsonl")
	const lines, keep = 300, 1000
	var wait sync.WaitGroup
	failures := make(chan error, 2*lines)
	for _, writer := range []string{"a", "b"} {
		wait.Add(1)
		go func() {
			defer wait.Done()
			file := logging.File{Path: path, Max: 200, Keep: keep}
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
