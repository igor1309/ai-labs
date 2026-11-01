package runstore

import (
	"bytes"
	"errors"
	"io"
	"os"
	"path/filepath"
	"slices"
	"testing"
	"time"
)

type logFileSpy struct {
	data                        bytes.Buffer
	short                       bool
	writeErr, syncErr, closeErr error
	synced, closed              int
	syncData                    []string
}

func (f *logFileSpy) Write(b []byte) (int, error) {
	if f.short {
		b = b[:len(b)/2]
	}
	n, _ := f.data.Write(b)
	return n, f.writeErr
}
func (f *logFileSpy) Sync() error {
	f.synced++
	f.syncData = append(f.syncData, f.data.String())
	return f.syncErr
}
func (f *logFileSpy) Close() error { f.closed++; return f.closeErr }

func TestPersistenceFailuresPoisonTheWriterBelowIOPolicy(t *testing.T) {
	t.Parallel()
	failure := errors.New("storage failed")
	for _, c := range []struct {
		name     string
		file     logFileSpy
		openErr  error
		want     error
		terminal bool
	}{
		{name: "open", openErr: failure, want: failure},
		{name: "short", file: logFileSpy{short: true}, want: io.ErrShortWrite},
		{name: "write", file: logFileSpy{writeErr: failure}, want: failure},
		{name: "sync", file: logFileSpy{syncErr: failure}, terminal: true, want: failure},
		{name: "close", file: logFileSpy{closeErr: failure}, want: failure},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			var opens int
			file := c.file
			appender := fileAppender(func(first bool) (logFile, error) {
				opens++
				if first != (opens == 1) {
					t.Errorf("exclusive create = %v at open %d", first, opens)
				}
				return &file, c.openErr
			})
			w, err := NewLogWriter(appender)
			if err != nil {
				t.Fatal(err)
			}
			r := Record{Schema: Schema, ID: "x", Started: time.Date(2026, 10, 29, 0, 0, 0, 0, time.UTC)}
			if c.terminal {
				if err := w.Append(Event{Kind: RunStarted, Record: &r}); err != nil {
					t.Fatal(err)
				}
				r.Status = "completed"
				r.Ended = &r.Started
				r.Result = &Result{Outcome: Outcome{Status: "completed"}}
				err = w.Append(Event{Kind: RunEnded, Record: &r})
			} else {
				err = w.Append(Event{Kind: RunStarted, Record: &r})
			}
			if !errors.Is(err, c.want) {
				t.Fatalf("error %v, want %v", err, c.want)
			}
			attempts, bytesWritten := opens, file.data.Len()
			for _, e := range []Event{{Kind: Tool}, {Kind: RunEnded, Record: &r}} {
				if again := w.Append(e); again != err {
					t.Fatalf("error changed: %v -> %v", err, again)
				}
			}
			if opens != attempts || file.data.Len() != bytesWritten {
				t.Fatal("appended after failed write")
			}
			if c.openErr == nil && file.closed != opens {
				t.Fatalf("%d closes for %d opens", file.closed, opens)
			}
			if c.terminal && file.synced != 1 {
				t.Fatalf("%d syncs, want terminal only", file.synced)
			}
		})
	}
}

func TestLogRequiresAnAppender(t *testing.T) {
	t.Parallel()
	if _, err := NewLogWriter(nil); err == nil {
		t.Fatal("missing appender accepted")
	}
}

// Contract test: readers skip a terminal whose filesystem sync failed.
func TestSyncFailureLeavesTheTerminalUncommitted(t *testing.T) {
	t.Parallel()
	for _, syncFailure := range []bool{false, true} {
		t.Run(map[bool]string{false: "committed", true: "sync failure"}[syncFailure], func(t *testing.T) {
			t.Parallel()
			file := &logFileSpy{}
			if syncFailure {
				file.syncErr = errors.New("sync failed")
			}
			w, err := NewLogWriter(fileAppender(func(bool) (logFile, error) { return file, nil }))
			if err != nil {
				t.Fatal(err)
			}
			r := Record{Schema: Schema, ID: "x", Status: "running"}
			if err := w.Append(Event{Kind: RunStarted, Record: &r}); err != nil {
				t.Fatal(err)
			}
			r.Status = "completed"
			r.Ended = &r.Started
			r.Result = &Result{Outcome: Outcome{Status: "completed"}, RunID: "x"}
			err = w.Append(Event{Kind: RunEnded, Record: &r})
			if (err != nil) != syncFailure {
				t.Fatalf("append error %v", err)
			}
			path := filepath.Join(t.TempDir(), "run.jsonl")
			if err := os.WriteFile(path, file.data.Bytes(), 0600); err != nil {
				t.Fatal(err)
			}
			reader, err := os.Open(path)
			if err != nil {
				t.Fatal(err)
			}
			defer reader.Close()
			got, err := Fold(reader)
			if err != nil {
				t.Fatal(err)
			}
			if syncFailure {
				if got.Status != "running" || got.Result != nil || got.Ended != nil {
					t.Fatalf("failed sync committed terminal: %+v", got)
				}
			} else if got.Status != "completed" || got.Result == nil || got.Result.RunID != "x" {
				t.Fatalf("terminal not committed: %+v", got)
			}
		})
	}
}

func TestTerminalSyncsItsPublishedNewlineBeforeClosing(t *testing.T) {
	t.Parallel()
	f := &logFileSpy{}
	appendLine := fileAppender(func(bool) (logFile, error) { return f, nil })
	if err := appendLine([]byte("terminal\n"), true); err != nil {
		t.Fatal(err)
	}
	if f.data.String() != "terminal\n" || f.synced != 2 || f.closed != 1 || !slices.Equal(f.syncData, []string{"terminal", "terminal\n"}) {
		t.Fatalf("bytes %q, syncs %d, closes %d", f.data.String(), f.synced, f.closed)
	}
}
