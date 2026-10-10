package logging_test

import (
	"bytes"
	"compress/gzip"
	"encoding/json"
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

// zipped writes text, gzipped, to the new file at path.
func zipped(t *testing.T, path, text string) {
	t.Helper()
	var buffer bytes.Buffer
	writer := gzip.NewWriter(&buffer)
	if _, err := writer.Write([]byte(text)); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, buffer.Bytes(), 0o600); err != nil {
		t.Fatal(err)
	}
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
	file := logging.File{Path: path, Max: 100, Keep: 3, Append: (*os.File).Write, Rename: os.Rename, Remove: os.Remove}
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

// A record longer than the cap is stored cut to fit, valid JSON marked as
// cut, with its time, level and message and as much of its beginning as
// fits: right after it, the log is within Max. A record that does not fit
// even cut is refused, and the log is left as it was.
//
// Contract test: the real filesystem and the kernel's flock.
func TestARecordLongerThanTheCapIsCutToFit(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	path := filepath.Join(dir, "agister.jsonl")
	file := logging.File{Path: path, Max: 160, Keep: 2, Append: (*os.File).Write, Rename: os.Rename, Remove: os.Remove}
	short := `{"line":"short"}`
	// Quotes take two bytes each once escaped in the cut record's head.
	long := `{"time":"2026-10-10T11:00:00Z","level":"WARN","msg":"runtime.identity_failed","output":"` + strings.Repeat(`\"x`, 200) + `"}`
	if _, err := file.Write([]byte(short + "\n")); err != nil {
		t.Fatal(err)
	}
	if n, err := file.Write([]byte(long + "\n")); err != nil || n != len(long)+1 {
		t.Fatalf("the long write: %d, %v", n, err)
	}
	current, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if int64(len(current)) > file.Max || !bytes.HasSuffix(current, []byte("\n")) || bytes.Count(current, []byte("\n")) != 1 {
		t.Fatalf("the log after the long record, %d bytes: %q", len(current), current)
	}
	var cut map[string]any
	if err := json.Unmarshal(current, &cut); err != nil {
		t.Fatalf("the cut record is not JSON: %v: %q", err, current)
	}
	head, _ := cut["head"].(string)
	if cut["time"] != "2026-10-10T11:00:00Z" || cut["level"] != "WARN" || cut["msg"] != "runtime.identity_failed" ||
		cut["truncated"] != float64(len(long)+1) || head == "" || !strings.HasPrefix(long, head) || len(cut) != 5 {
		t.Fatalf("the cut record = %v", cut)
	}
	// As much as fits: the record with one more character of the long one
	// in its head, encoded as the log encodes it, is past Max.
	cut["head"] = long[:len(head)+1]
	longer, err := json.Marshal(cut)
	if err != nil {
		t.Fatal(err)
	}
	if int64(len(longer)+1) <= file.Max {
		t.Fatalf("the head holds %d bytes of the record and %d fit: the cut record is %d bytes of %d", len(head), len(head)+1, len(current), file.Max)
	}
	if kept := logged(t, path, file.Keep); kept[0] != short || len(kept) != 2 {
		t.Fatalf("kept = %v", kept)
	}

	tiny := logging.File{Path: path, Max: 20, Keep: 2, Append: (*os.File).Write, Rename: os.Rename, Remove: os.Remove}
	if _, err := tiny.Write([]byte(long + "\n")); err == nil || !strings.Contains(err.Error(), "does not fit") {
		t.Fatalf("a record that does not fit even cut: %v", err)
	}
	if after, _ := os.ReadFile(path); !bytes.Equal(after, current) {
		t.Fatalf("the log changed: %q", after)
	}
}

// A rotation whose compression fails, again and again, as on a full disk,
// moves no old file: each write fails, the log and every old file are as
// they were, and the rotation that then succeeds drops only the oldest.
//
// Contract test: the real filesystem, the compressed file's path taken by
// a directory that cannot be removed.
func TestAFailedCompressionKeepsTheOldFiles(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	path := filepath.Join(dir, "agister.jsonl")
	file := logging.File{Path: path, Max: 100, Keep: 3, Append: (*os.File).Write, Rename: os.Rename, Remove: os.Remove}
	full := strings.Repeat(`{"line":"full"}`+"\n", 6)
	if err := os.WriteFile(path, []byte(full), 0o600); err != nil {
		t.Fatal(err)
	}
	for n := 1; n <= file.Keep; n++ {
		zipped(t, fmt.Sprintf("%s.%d.gz", path, n), fmt.Sprintf(`{"old":%d}`+"\n", n))
	}
	obstruction := path + ".1.gz.tmp"
	if err := os.MkdirAll(filepath.Join(obstruction, "full"), 0o700); err != nil {
		t.Fatal(err)
	}
	for attempt := range 3 {
		if _, err := file.Write([]byte(`{"line":"next"}` + "\n")); err == nil || !strings.Contains(err.Error(), "rotating") {
			t.Fatalf("attempt %d: %v", attempt, err)
		}
		for n := 1; n <= file.Keep; n++ {
			if old, err := unzip(fmt.Sprintf("%s.%d.gz", path, n)); err != nil || old != fmt.Sprintf(`{"old":%d}`+"\n", n) {
				t.Fatalf("attempt %d: old file %d = %q, %v", attempt, n, old, err)
			}
		}
		if current, _ := os.ReadFile(path); string(current) != full {
			t.Fatalf("attempt %d: the log = %q", attempt, current)
		}
	}

	if err := os.RemoveAll(obstruction); err != nil {
		t.Fatal(err)
	}
	if _, err := file.Write([]byte(`{"line":"next"}` + "\n")); err != nil {
		t.Fatal(err)
	}
	for n, want := range map[int]string{1: full, 2: `{"old":1}` + "\n", 3: `{"old":2}` + "\n"} {
		if old, err := unzip(fmt.Sprintf("%s.%d.gz", path, n)); err != nil || old != want {
			t.Fatalf("old file %d = %q, %v", n, old, err)
		}
	}
	want := []string{"agister.jsonl", "agister.jsonl.1.gz", "agister.jsonl.2.gz", "agister.jsonl.3.gz"}
	if found := names(t, dir); strings.Join(found, " ") != strings.Join(want, " ") {
		t.Fatalf("files = %v", found)
	}
}

// A rotation that a step of fails, again and again, drops no old file and
// moves none a second time: each write fails, the old files that were to
// stay are each still held once, and the log's lines are in no more than
// one of them. The rotation that then goes through finishes the one cut
// short: the log is the newest old file, once, only the oldest was dropped,
// and nothing else is left in the directory.
//
// Contract test: the real filesystem, the rotation's renames and removals
// failing where the test says.
func TestARotationCutShortIsFinishedOnce(t *testing.T) {
	t.Parallel()
	for name, fails := range map[string]func(path, from, to string) bool{
		"moving the log aside":  func(path, from, _ string) bool { return from == path },
		"moving an old file on": func(path, from, _ string) bool { return from == path+".1.gz" },
		"naming the newest":     func(path, _, to string) bool { return to == path+".1.gz" },
		"the last removal":      func(_, _, to string) bool { return to == "" },
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			dir := t.TempDir()
			path := filepath.Join(dir, "agister.jsonl")
			failure := errors.New("operation not permitted")
			failing := true
			file := logging.File{Path: path, Max: 100, Keep: 3, Append: (*os.File).Write,
				Rename: func(from, to string) error {
					if failing && fails(path, from, to) {
						return failure
					}
					return os.Rename(from, to)
				},
				// A removal moves a file nowhere.
				Remove: func(name string) error {
					if failing && fails(path, name, "") {
						return failure
					}
					return os.Remove(name)
				},
			}
			full := strings.Repeat(`{"line":"full"}`+"\n", 6)
			if err := os.WriteFile(path, []byte(full), 0o600); err != nil {
				t.Fatal(err)
			}
			for n := 1; n <= file.Keep; n++ {
				zipped(t, fmt.Sprintf("%s.%d.gz", path, n), fmt.Sprintf(`{"old":%d}`+"\n", n))
			}
			for attempt := range 3 {
				if _, err := file.Write([]byte(`{"line":"next"}` + "\n")); !errors.Is(err, failure) || !strings.Contains(err.Error(), "rotating") {
					t.Fatalf("attempt %d: %v", attempt, err)
				}
				held := map[string]int{}
				for n := 1; n <= file.Keep; n++ {
					old, err := unzip(fmt.Sprintf("%s.%d.gz", path, n))
					if err != nil && !os.IsNotExist(err) {
						t.Fatalf("attempt %d: old file %d: %v", attempt, n, err)
					}
					held[old]++
				}
				if held[`{"old":1}`+"\n"] != 1 || held[`{"old":2}`+"\n"] != 1 || held[full] > 1 {
					t.Fatalf("attempt %d: the old files hold %v", attempt, held)
				}
			}

			failing = false
			if _, err := file.Write([]byte(`{"line":"next"}` + "\n")); err != nil {
				t.Fatal(err)
			}
			for n, want := range map[int]string{1: full, 2: `{"old":1}` + "\n", 3: `{"old":2}` + "\n"} {
				if old, err := unzip(fmt.Sprintf("%s.%d.gz", path, n)); err != nil || old != want {
					t.Fatalf("old file %d = %q, %v", n, old, err)
				}
			}
			if current, _ := os.ReadFile(path); string(current) != `{"line":"next"}`+"\n" {
				t.Fatalf("the log = %q", current)
			}
			want := []string{"agister.jsonl", "agister.jsonl.1.gz", "agister.jsonl.2.gz", "agister.jsonl.3.gz"}
			if found := names(t, dir); strings.Join(found, " ") != strings.Join(want, " ") {
				t.Fatalf("files = %v", found)
			}
		})
	}
}

// A write that stops part way, failing as on a full disk or short without
// an error, fails and leaves no part of its line: the line before it and
// the one after are whole, one to a line.
//
// Contract test: the real filesystem cut back after the write the test
// stops.
func TestAWriteThatStopsPartWayLeavesNoPartialLine(t *testing.T) {
	t.Parallel()
	for name, stop := range map[string]error{"failing": syscall.ENOSPC, "short": nil} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			path := filepath.Join(t.TempDir(), "agister.jsonl")
			file := logging.File{Path: path, Max: 1 << 20, Keep: 1, Append: (*os.File).Write, Rename: os.Rename, Remove: os.Remove}
			partWay := file
			partWay.Append = func(log *os.File, line []byte) (int, error) {
				n, err := log.Write(line[:len(line)/2])
				if err != nil {
					t.Fatal(err)
				}
				return n, stop
			}
			if _, err := file.Write([]byte(`{"line":"before"}` + "\n")); err != nil {
				t.Fatal(err)
			}
			want := stop
			if want == nil {
				want = io.ErrShortWrite
			}
			if n, err := partWay.Write([]byte(`{"line":"cut short"}` + "\n")); n != 0 || !errors.Is(err, want) {
				t.Fatalf("the write that stopped: %d, %v", n, err)
			}
			if _, err := file.Write([]byte(`{"line":"after"}` + "\n")); err != nil {
				t.Fatal(err)
			}
			if current, _ := os.ReadFile(path); string(current) != `{"line":"before"}`+"\n"+`{"line":"after"}`+"\n" {
				t.Fatalf("log = %q", current)
			}
		})
	}
}

// A log not given what it writes by, its Append, Rename or Remove, is not
// usable, writes nothing and says which it lacks.
func TestALogNotGivenWhatItWritesByFails(t *testing.T) {
	t.Parallel()
	for missing, file := range map[string]logging.File{
		"Append": {Rename: os.Rename, Remove: os.Remove},
		"Rename": {Append: (*os.File).Write, Remove: os.Remove},
		"Remove": {Append: (*os.File).Write, Rename: os.Rename},
	} {
		t.Run(missing, func(t *testing.T) {
			t.Parallel()
			dir := t.TempDir()
			file.Path, file.Max, file.Keep = filepath.Join(dir, "agister.jsonl"), 100, 1
			if err := file.Usable(); err == nil || !strings.Contains(err.Error(), "no "+missing) {
				t.Fatalf("Usable: %v", err)
			}
			if _, err := file.Write([]byte("x\n")); err == nil || !strings.Contains(err.Error(), "no "+missing) {
				t.Fatalf("Write: %v", err)
			}
			if found := names(t, dir); len(found) != 0 {
				t.Fatalf("files = %v", found)
			}
		})
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
			file := logging.File{Path: path, Max: 200, Keep: keep, Append: held, Rename: os.Rename, Remove: os.Remove}
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
