//go:build unix

package main

import (
	"context"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"syscall"
	"testing"

	"github.com/igor1309/ai-labs/warder/internal/codex"
)

var _ codex.Files = osFiles{}

// filesAt is the files under root, over the operating system's
// directories, as main constructs them.
func filesAt(root string) osFiles { return osFiles{root: root, readDir: os.ReadDir} }

// writeFile writes the file at the path from root, with slashes, and the
// directories it is in, and returns where it is.
func writeFile(t *testing.T, root, path, content string) string {
	t.Helper()
	full := filepath.Join(root, filepath.FromSlash(path))
	if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(full, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
	return full
}

// openFile opens the file, until the end of the test.
func openFile(t *testing.T, full string) *os.File {
	t.Helper()
	opened, err := os.Open(full)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { opened.Close() })
	return opened
}

// holdLock takes an exclusive flock on the file, as the process that owns
// a Codex thread does, until the end of the test. A flock belongs to the
// open file that took it, so another open file of this process is refused
// as another process's is.
func holdLock(t *testing.T, full string) {
	t.Helper()
	if err := syscall.Flock(int(openFile(t, full).Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		t.Fatalf("hold the lock on %s: %v", full, err)
	}
}

// tryLock tries to take an exclusive flock on the file through another
// open file, without waiting, and returns the kernel's answer.
func tryLock(t *testing.T, full string) error {
	t.Helper()
	return syscall.Flock(int(openFile(t, full).Fd()), syscall.LOCK_EX|syscall.LOCK_NB)
}

// assertGoneFile fails unless err is that of what does not exist.
func assertGoneFile(t *testing.T, what string, err error) {
	t.Helper()
	if !errors.Is(err, fs.ErrNotExist) {
		t.Errorf("%s: got the error %v, want one that is fs.ErrNotExist", what, err)
	}
}

// The Codex home is $CODEX_HOME when it is set, else .codex in the user's
// home directory, and unknown when neither is known.
func TestCodexHomeIsTheOneOfTheEnvironmentElseTheUsers(t *testing.T) {
	t.Parallel()
	unset := func(string) string { return "" }
	set := func(name string) string {
		if name == "CODEX_HOME" {
			return "/srv/codex"
		}
		return ""
	}
	users := func() (string, error) { return "/Users/dev", nil }
	tests := []struct {
		name     string
		getenv   func(string) string
		userHome func() (string, error)
		want     string
	}{
		{"$CODEX_HOME is set", set, users, "/srv/codex"},
		{"$CODEX_HOME is set and the user's home is not known", set, func() (string, error) { return "", errors.New("$HOME is not defined") }, "/srv/codex"},
		{"$CODEX_HOME is not set", unset, users, filepath.Join("/Users/dev", ".codex")},
		{"neither is known", unset, func() (string, error) { return "", errors.New("$HOME is not defined") }, ""},
		{"the user's home is empty", unset, func() (string, error) { return "", nil }, ""},
	}
	for _, test := range tests {
		if got := codexHome(test.getenv, test.userHome); got != test.want {
			t.Errorf("%s: got the home %q, want %q", test.name, got, test.want)
		}
	}
}

// Contract test: a real directory: List returns the names of its entries,
// files and directories, sorted, and the error of one that does not exist
// is fs.ErrNotExist.
func TestListReturnsTheNamesInADirectory(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	writeFile(t, root, "thread-writer-locks/b.lock", "")
	writeFile(t, root, "thread-writer-locks/.coordination.lock", "")
	writeFile(t, root, "thread-writer-locks/a.lock", "")
	writeFile(t, root, "thread-writer-locks/nested/c.lock", "")
	if err := os.Mkdir(filepath.Join(root, "empty"), 0o755); err != nil {
		t.Fatal(err)
	}
	files := filesAt(root)

	names, err := files.List(t.Context(), "thread-writer-locks")

	if err != nil {
		t.Fatal(err)
	}
	if want := []string{".coordination.lock", "a.lock", "b.lock", "nested"}; !slices.Equal(names, want) {
		t.Errorf("got the names %q, want %q", names, want)
	}
	names, err = files.List(t.Context(), "empty")
	if err != nil || names == nil || len(names) != 0 {
		t.Errorf("an empty directory: got the names %#v and the error %v, want an empty list", names, err)
	}
	_, err = files.List(t.Context(), "sessions")
	assertGoneFile(t, "a directory that does not exist", err)
}

// Contract test: a real flock of the kernel: a file on which another open
// file holds an exclusive lock is locked, and the probe leaves that lock
// held.
func TestLockedTellsALockThatIsHeld(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	full := writeFile(t, root, "thread-writer-locks/thread-1.lock", "")
	holdLock(t, full)
	files := filesAt(root)

	for range 2 {
		locked, err := files.Locked(t.Context(), "thread-writer-locks/thread-1.lock")
		if err != nil {
			t.Fatal(err)
		}
		if !locked {
			t.Error("got a lock that is not held, want a held one")
		}
	}
	if err := tryLock(t, full); !errors.Is(err, syscall.EWOULDBLOCK) {
		t.Errorf("after the probe, another lock got %v, want it refused: the lock is still held", err)
	}
}

// Contract test: a real flock of the kernel: a lock file nobody holds, a
// stale one, is not locked, and the probe's own lock is released at once,
// so the file can be locked right after.
func TestLockedTellsAStaleLockAndReleasesItsOwn(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	full := writeFile(t, root, "thread-writer-locks/thread-1.lock", "")
	files := filesAt(root)

	locked, err := files.Locked(t.Context(), "thread-writer-locks/thread-1.lock")

	if err != nil {
		t.Fatal(err)
	}
	if locked {
		t.Error("got a held lock, want one that is not held")
	}
	if err := tryLock(t, full); err != nil {
		t.Errorf("after the probe, another lock got %v, want it taken: the probe released its own", err)
	}
	// Now it is held, and the same probe says so.
	if locked, err := files.Locked(t.Context(), "thread-writer-locks/thread-1.lock"); err != nil || !locked {
		t.Errorf("once the lock is taken, got locked %v and the error %v, want true", locked, err)
	}
}

// Contract test: a real directory: the error of the probe of a lock file
// that does not exist, as one removed since it was listed, is
// fs.ErrNotExist.
func TestLockedOfAFileThatIsGoneIsNotExist(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	writeFile(t, root, "thread-writer-locks/thread-1.lock", "")

	locked, err := filesAt(root).Locked(t.Context(), "thread-writer-locks/thread-2.lock")

	assertGoneFile(t, "a lock file that does not exist", err)
	if locked {
		t.Error("got a held lock, want none")
	}
}

// Contract test: a real directory tree: Find returns the files under the
// directory, at any depth, whose names begin with the prefix and end with
// the suffix, by their paths from the root, with slashes; a directory is
// no file, and the error of a directory that does not exist is
// fs.ErrNotExist.
func TestFindReturnsTheFilesUnderADirectoryByTheirNames(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	writeFile(t, root, "sessions/2026/10/09/rollout-2026-10-09T21-38-57-thread-1.jsonl", "")
	writeFile(t, root, "sessions/2026/10/08/rollout-2026-10-08T09-00-00-thread-1.jsonl", "")
	writeFile(t, root, "sessions/2026/10/09/rollout-2026-10-09T21-40-00-thread-2.jsonl", "")
	writeFile(t, root, "sessions/2026/10/09/rollout-2026-10-09T21-38-57-thread-1.jsonl.zst", "")
	writeFile(t, root, "sessions/2026/10/09/notes-thread-1.jsonl", "")
	writeFile(t, root, "sessions/2026/10/09/.DS_Store", "")
	writeFile(t, root, "sessions/rollout-top-thread-1.jsonl", "")
	writeFile(t, root, "archived_sessions/rollout-2026-10-01T00-00-00-thread-1.jsonl", "")
	// A directory with a matching name, and a matching file in it.
	writeFile(t, root, "sessions/2026/rollout-dir-thread-1.jsonl/rollout-inside-thread-1.jsonl", "")
	files := filesAt(root)

	found, err := files.Find(t.Context(), "sessions", "rollout-", "-thread-1.jsonl")

	if err != nil {
		t.Fatal(err)
	}
	want := []string{
		"sessions/2026/10/08/rollout-2026-10-08T09-00-00-thread-1.jsonl",
		"sessions/2026/10/09/rollout-2026-10-09T21-38-57-thread-1.jsonl",
		"sessions/2026/rollout-dir-thread-1.jsonl/rollout-inside-thread-1.jsonl",
		"sessions/rollout-top-thread-1.jsonl",
	}
	if !slices.Equal(found, want) {
		t.Errorf("got the files\n%s\nwant\n%s", strings.Join(found, "\n"), strings.Join(want, "\n"))
	}
	found, err = files.Find(t.Context(), "sessions", "rollout-", "-thread-3.jsonl")
	if err != nil || len(found) != 0 {
		t.Errorf("a thread with no file: got the files %q and the error %v, want none", found, err)
	}
	_, err = files.Find(t.Context(), "logs", "rollout-", ".jsonl")
	assertGoneFile(t, "a directory that does not exist", err)
}

// Contract test: a real file: Size returns its size in bytes, and the
// error of a file that does not exist is fs.ErrNotExist.
func TestSizeReturnsTheSizeOfAFile(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	writeFile(t, root, "sessions/rollout.jsonl", turnStarted+turnCompleted)
	writeFile(t, root, "sessions/empty.jsonl", "")
	files := filesAt(root)

	size, err := files.Size(t.Context(), "sessions/rollout.jsonl")

	if err != nil {
		t.Fatal(err)
	}
	if want := int64(len(turnStarted) + len(turnCompleted)); size != want {
		t.Errorf("got the size %d, want %d", size, want)
	}
	if size, err := files.Size(t.Context(), "sessions/empty.jsonl"); err != nil || size != 0 {
		t.Errorf("an empty file: got the size %d and the error %v, want 0", size, err)
	}
	_, err = files.Size(t.Context(), "sessions/gone.jsonl")
	assertGoneFile(t, "a file that does not exist", err)
}

// Contract test: a real file: Read returns the bytes of the range asked
// for, fewer when the file ends before and none past its end; a range
// that is not one is an error, and the error of a file that does not exist
// is fs.ErrNotExist.
func TestReadReturnsARangeOfAFilesBytes(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	writeFile(t, root, "sessions/rollout.jsonl", "0123456789")
	files := filesAt(root)
	tests := []struct {
		offset, length int64
		want           string
	}{
		{0, 10, "0123456789"},
		{3, 4, "3456"},
		{0, 0, ""},
		{7, 3, "789"},
		{7, 10, "789"},
		{10, 4, ""},
		{12, 4, ""},
	}
	for _, test := range tests {
		data, err := files.Read(t.Context(), "sessions/rollout.jsonl", test.offset, test.length)
		if err != nil || string(data) != test.want {
			t.Errorf("%d bytes at %d: got %q and the error %v, want %q", test.length, test.offset, data, err, test.want)
		}
	}
	if data, err := files.Read(t.Context(), "sessions/rollout.jsonl", -1, 4); err == nil || data != nil {
		t.Errorf("a negative offset: got %q and the error %v, want an error", data, err)
	}
	if data, err := files.Read(t.Context(), "sessions/rollout.jsonl", 0, -4); err == nil || data != nil {
		t.Errorf("a negative length: got %q and the error %v, want an error", data, err)
	}
	_, err := files.Read(t.Context(), "sessions/gone.jsonl", 0, 4)
	assertGoneFile(t, "a file that does not exist", err)
}

// eachOperation calls every operation of files, under ctx, on the path,
// and returns their errors by name.
func eachOperation(ctx context.Context, files osFiles, path string) map[string]error {
	_, listErr := files.List(ctx, path)
	_, lockedErr := files.Locked(ctx, path)
	_, findErr := files.Find(ctx, path, "", "")
	_, sizeErr := files.Size(ctx, path)
	_, readErr := files.Read(ctx, path, 0, 1)
	return map[string]error{"List": listErr, "Locked": lockedErr, "Find": findErr, "Size": sizeErr, "Read": readErr}
}

// Contract test: a real directory, with what each operation is asked for:
// under a context that is done, each fails with the context's cause.
func TestEachOperationFailsWithTheCauseOfAContextThatIsDone(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	writeFile(t, root, "sessions/rollout.jsonl", turnStarted)
	stopping := errors.New("the run is stopping")
	ctx, cancel := context.WithCancelCause(t.Context())
	cancel(stopping)
	files := filesAt(root)

	for _, path := range []string{"sessions", "sessions/rollout.jsonl"} {
		for operation, err := range eachOperation(ctx, files, path) {
			if err != stopping {
				t.Errorf("%s of %s: got the error %v, want the context's cause", operation, path, err)
			}
		}
	}
}

// Contract test: a real directory tree: when its context ends while Find
// reads, here as it reads the second directory, Find reads no directory
// after that one, and fails with the context's cause and no files.
func TestFindStopsBetweenDirectoriesWhenItsContextEnds(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	writeFile(t, root, "sessions/2026/10/08/rollout-1-thread-1.jsonl", "")
	writeFile(t, root, "sessions/2026/10/09/rollout-2-thread-1.jsonl", "")
	stopping := errors.New("the run is stopping")
	ctx, cancel := context.WithCancelCause(t.Context())
	var read []string
	files := osFiles{root: root, readDir: func(name string) ([]fs.DirEntry, error) {
		read = append(read, filepath.ToSlash(strings.TrimPrefix(name, root)))
		if len(read) == 2 {
			cancel(stopping)
		}
		return os.ReadDir(name)
	}}

	found, err := files.Find(ctx, "sessions", "rollout-", ".jsonl")

	if err != stopping {
		t.Errorf("got the error %v, want the context's cause", err)
	}
	if found != nil {
		t.Errorf("got the files %q, want none", found)
	}
	if want := []string{"/sessions", "/sessions/2026"}; !slices.Equal(read, want) {
		t.Errorf("got the directories read %q, want %q", read, want)
	}
}

// Contract test: a real directory tree: a directory that is gone when
// Find comes to read it, as one removed meanwhile, has no files, and the
// files of the others are found; any other error of a directory fails the
// search.
func TestFindPassesOverADirectoryThatIsGone(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	writeFile(t, root, "sessions/2026/10/08/rollout-1-thread-1.jsonl", "")
	writeFile(t, root, "sessions/2026/10/09/rollout-2-thread-1.jsonl", "")
	failing := func(failure error) osFiles {
		return osFiles{root: root, readDir: func(name string) ([]fs.DirEntry, error) {
			if filepath.Base(name) == "08" {
				return nil, failure
			}
			return os.ReadDir(name)
		}}
	}

	found, err := failing(&fs.PathError{Op: "open", Path: "08", Err: fs.ErrNotExist}).Find(t.Context(), "sessions", "rollout-", ".jsonl")

	if want := []string{"sessions/2026/10/09/rollout-2-thread-1.jsonl"}; err != nil || !slices.Equal(found, want) {
		t.Errorf("a directory that is gone: got the files %q and the error %v, want %q", found, err, want)
	}
	denied := &fs.PathError{Op: "open", Path: "08", Err: fs.ErrPermission}
	found, err = failing(denied).Find(t.Context(), "sessions", "rollout-", ".jsonl")
	if !errors.Is(err, fs.ErrPermission) || found != nil {
		t.Errorf("a directory that cannot be read: got the files %q and the error %v, want the directory's error", found, err)
	}
}

// Contract test: a real directory beside the root: a path that leaves the
// root is refused by every operation, and nothing outside is read.
func TestEachOperationRefusesAPathThatLeavesTheRoot(t *testing.T) {
	t.Parallel()
	parent := t.TempDir()
	outside := writeFile(t, parent, "outside/secret.jsonl", turnStarted)
	root := filepath.Join(parent, "home")
	if err := os.Mkdir(root, 0o755); err != nil {
		t.Fatal(err)
	}
	files := filesAt(root)

	for _, path := range []string{"../outside", "../outside/secret.jsonl", "sessions/../../outside/secret.jsonl", outside, ""} {
		for operation, err := range eachOperation(t.Context(), files, path) {
			if err == nil || errors.Is(err, fs.ErrNotExist) || !strings.Contains(err.Error(), "is not one inside") {
				t.Errorf("%s of %q: got the error %v, want the path refused", operation, path, err)
			}
		}
	}
}

// With no root, as when the Codex home is not known, every operation
// fails with an error that says so, and is no "does not exist": a source
// without a home is a failed read, not an empty set.
func TestEachOperationFailsWithNoRoot(t *testing.T) {
	t.Parallel()
	for operation, err := range eachOperation(t.Context(), osFiles{readDir: os.ReadDir}, "thread-writer-locks") {
		if err == nil || errors.Is(err, fs.ErrNotExist) || !strings.Contains(err.Error(), "no Codex home") {
			t.Errorf("%s: got the error %v, want one that says there is no Codex home", operation, err)
		}
	}
}

// Contract test: a real Codex home on disk, with the kernel's flock, read
// by the Codex adapter through these files as the boundary run is given:
// the threads whose locks are held are its agents, each with the state of
// its rollout file's last turn marker; the stale lock file and the
// coordination lock, held too, are none.
func TestTheCodexAdapterReadsAHomeOnDisk(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	holdLock(t, writeFile(t, root, lockOf(threadWorking), ""))
	holdLock(t, writeFile(t, root, lockOf(threadIdle), ""))
	holdLock(t, writeFile(t, root, lockOf(threadUnknown), ""))
	writeFile(t, root, lockOf(threadStale), "")
	holdLock(t, writeFile(t, root, "thread-writer-locks/.coordination.lock", ""))
	writeFile(t, root, rolloutOf(threadWorking), turnStarted+tokensCounted)
	writeFile(t, root, rolloutOf(threadIdle), turnStarted+tokensCounted+turnCompleted)
	writeFile(t, root, rolloutOf(threadStale), turnStarted)
	writeFile(t, root, "sessions/2026/10/09/.DS_Store", "")
	log := sourceLog{logger: newLogger(newLines(), false), clock: morning, source: "codex-main"}
	// A chunk smaller than a line: every line spans reads of the file.
	adapter, err := codex.New(logCodexFiles(filesAt(root).codexFiles(), log), codex.Scan{Chunk: 64, Cap: codexScanCap})
	if err != nil {
		t.Fatal(err)
	}

	agents, err := adapter.ReadAgents(t.Context())

	if err != nil {
		t.Fatal(err)
	}
	want := []codex.Agent{
		{ID: threadWorking, State: codex.Working},
		{ID: threadIdle, State: codex.Idle},
		{ID: threadUnknown, State: codex.Unknown},
	}
	if !slices.Equal(agents, want) {
		t.Errorf("got the agents %v, want %v", agents, want)
	}
}

// Contract test: a real directory that is no Codex home, and one that
// does not exist: Codex has not run there, and the Codex adapter reads
// each as no agents, an empty set, not a failure.
func TestTheCodexAdapterReadsAHomeWithoutLocksAsNoAgents(t *testing.T) {
	t.Parallel()
	empty := t.TempDir()
	for name, root := range map[string]string{"an empty home": empty, "a home that does not exist": filepath.Join(empty, "gone")} {
		adapter, err := codex.New(filesAt(root), codex.Scan{Chunk: codexScanChunk, Cap: codexScanCap})
		if err != nil {
			t.Fatal(err)
		}
		agents, err := adapter.ReadAgents(t.Context())
		if err != nil || agents == nil || len(agents) != 0 {
			t.Errorf("%s: got the agents %#v and the error %v, want an empty set", name, agents, err)
		}
	}
}
