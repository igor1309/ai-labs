package runstore_test

import (
	"bytes"
	"encoding/json"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"sync"
	"testing"

	"github.com/igor1309/ai-labs/agister/runstore"
)

// Contract test: the filesystem layout, legacy reads and native log export.
func TestLogOnlyRunsReadAndExportAlongsideLegacyRuns(t *testing.T) {
	t.Parallel()
	s, folder := store(t)
	initial := *startFact().Record
	if err := s.Begin(initial); err != nil {
		t.Fatal(err)
	}
	if err := s.Write(initial); err == nil {
		t.Fatal("mid-run snapshot accepted")
	}
	if err := s.Write(lost("legacy")); err != nil {
		t.Fatal(err)
	}
	if err := s.Append("x", runstore.Event{Kind: runstore.Started, Step: "a", At: started}); err != nil {
		t.Fatal(err)
	}
	ending := ended("x")
	ending.Result.Status, ending.Result.Class = "completed", nil
	if err := s.Write(ending); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"record.json", "events.jsonl"} {
		if _, err := os.Stat(filepath.Join(folder, "x", name)); !errors.Is(err, fs.ErrNotExist) {
			t.Fatalf("new run has %s: %v", name, err)
		}
	}
	reader, err := runstore.New(folder)
	if err != nil {
		t.Fatal(err)
	}
	ids, err := reader.Runs()
	if err != nil || !slices.Equal(ids, []string{"legacy", "x"}) {
		t.Fatalf("runs %v, %v", ids, err)
	}
	got, err := reader.Record("x")
	if err != nil || !reflect.DeepEqual(got, ending) {
		t.Fatalf("record %+v, %v", got, err)
	}
	old, err := reader.Record("legacy")
	if err != nil || !reflect.DeepEqual(old, lost("legacy")) {
		t.Fatalf("legacy %+v, %v", old, err)
	}
	// A second store must not create another append path for this run.
	if err := reader.Begin(lost("legacy")); err == nil {
		t.Fatal("claimed a legacy run")
	}
	if err := reader.Begin(initial); err == nil {
		t.Fatal("second writer claimed the log")
	}
	if err := reader.Append("x", runstore.Event{Kind: runstore.Tool}); err == nil {
		t.Fatal("unowned append accepted")
	}
	if err := reader.Write(ending); err == nil {
		t.Fatal("unowned snapshot accepted")
	}
	if err := s.Append("x", runstore.Event{Kind: runstore.Tool}); err == nil {
		t.Fatal("terminal append accepted")
	}
	exported := t.TempDir()
	if err := reader.Export("x", exported); err != nil {
		t.Fatal(err)
	}
	copy, err := runstore.New(exported)
	if err != nil {
		t.Fatal(err)
	}
	got, err = copy.Record("x")
	if err != nil || !reflect.DeepEqual(got, ending) {
		t.Fatalf("exported %+v, %v", got, err)
	}
}

// Contract test: corrupt complete files are rejected without falling back to a snapshot.
func TestRecordRejectsCompleteCorruptionAndSkipsATornTail(t *testing.T) {
	t.Parallel()
	var data bytes.Buffer
	w := logWriter(t, func(b []byte, _ bool) error { _, err := data.Write(b); return err })
	if err := w.Append(startFact()); err != nil {
		t.Fatal(err)
	}
	valid := bytes.Clone(data.Bytes())
	line := logLines(t, valid)[0]
	badVersion := line
	badVersion.Schema = "future"
	badSeq := line
	badSeq.Seq = 2
	badHeader := line
	badHeader.Status = "lost"
	badActive := line
	badActive.Active = nil
	encoded := func(v any) []byte {
		b, err := json.Marshal(v)
		if err != nil {
			t.Fatal(err)
		}
		return append(b, '\n')
	}
	for _, c := range []struct {
		name    string
		data    []byte
		wantErr bool
	}{
		{"json", append(bytes.Clone(valid), []byte("{bad}\n")...), true},
		{"version", encoded(badVersion), true},
		{"sequence", encoded(badSeq), true},
		{"header", encoded(badHeader), true},
		{"active", encoded(badActive), true},
		{"unknown fact", append(bytes.Clone(valid), []byte(`{"schema":"agister.run/v1","seq":2,"status":"running","active":[],"event":{"kind":"future"}}`+"\n")...), true},
		{"empty", nil, true},
		{"unterminated start", valid[:len(valid)-1], true},
		{"torn tail", append(bytes.Clone(valid), []byte("{bad}")...), false},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			s, folder := store(t)
			if err := s.Write(lost("x")); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(filepath.Join(folder, "x", "run.jsonl"), c.data, 0600); err != nil {
				t.Fatal(err)
			}
			got, err := s.Record("x")
			if (err != nil) != c.wantErr || !c.wantErr && (got.ID != "x" || got.Status != "running") {
				t.Fatalf("record %+v, %v", got, err)
			}
		})
	}
}

// Contract test: concurrent filesystem readers see the committed prefix during an append.
func TestReadersCanFoldWhileTheWriterHasOnlyWrittenHalfALine(t *testing.T) {
	t.Parallel()
	s, folder := store(t)
	if err := os.MkdirAll(filepath.Join(folder, "x"), 0755); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(folder, "x", "run.jsonl")
	file, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { file.Close() })
	partial, release, finished := make(chan struct{}), make(chan struct{}), make(chan struct{})
	var unblock sync.Once
	appends := 0
	w := logWriter(t, func(data []byte, _ bool) error {
		appends++
		if appends == 1 {
			_, err := file.Write(data)
			return err
		}
		middle := len(data) / 2
		if _, err := file.Write(data[:middle]); err != nil {
			return err
		}
		close(partial)
		<-release
		_, err := file.Write(data[middle:])
		return err
	})
	if err := w.Append(startFact()); err != nil {
		t.Fatal(err)
	}
	cost := 0.5
	call := callForLog("a")
	call.Result.Cost = &cost
	go func() {
		defer close(finished)
		if err := w.Append(runstore.Event{Kind: runstore.Prepared, CallFact: &call}); err != nil {
			t.Error(err)
		}
	}()
	t.Cleanup(func() { unblock.Do(func() { close(release) }); <-finished })
	<-partial
	var readers sync.WaitGroup
	for range 8 {
		readers.Add(1)
		go func() {
			defer readers.Done()
			got, err := s.Record("x")
			if err != nil || got.ID != "x" || got.Status != "running" || len(got.Calls) != 0 {
				t.Errorf("partial record %+v, %v", got, err)
			}
		}()
	}
	readers.Wait()
	exported := t.TempDir()
	if err := s.Export("x", exported); err != nil {
		t.Fatal(err)
	}
	copy, err := runstore.New(exported)
	if err != nil {
		t.Fatal(err)
	}
	got, err := copy.Record("x")
	if err != nil || len(got.Calls) != 0 {
		t.Fatalf("exported prefix %+v, %v", got, err)
	}
	unblock.Do(func() { close(release) })
	<-finished
	got, err = s.Record("x")
	if err != nil || len(got.Calls) != 1 || got.Calls[0].Result.Cost == nil || *got.Calls[0].Result.Cost != cost {
		t.Fatalf("committed record %+v, %v", got, err)
	}
}

// Contract test: log identities agree with the containing folder and start line.
func TestRecordRejectsConflictingRunIDs(t *testing.T) {
	t.Parallel()
	for _, conflict := range []string{"folder", "start"} {
		t.Run(conflict, func(t *testing.T) {
			t.Parallel()
			s, folder := store(t)
			var data bytes.Buffer
			w := logWriter(t, func(b []byte, _ bool) error { _, err := data.Write(b); return err })
			if err := w.Append(startFact()); err != nil {
				t.Fatal(err)
			}
			terminal := ended("x")
			terminal.Result.Status, terminal.Result.Class = terminal.Status, nil
			id := "x"
			if conflict == "folder" {
				id = "other"
			} else {
				terminal.ID, terminal.Result.RunID = "other", "other"
			}
			if err := w.Append(runstore.Event{Kind: runstore.RunEnded, Record: &terminal}); err != nil {
				t.Fatal(err)
			}
			if err := os.MkdirAll(filepath.Join(folder, id), 0755); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(filepath.Join(folder, id, "run.jsonl"), data.Bytes(), 0600); err != nil {
				t.Fatal(err)
			}
			_, err := s.Record(id)
			want := "runstore: log id disagrees with folder"
			if conflict == "start" {
				want = "runstore: terminal run id disagrees"
			}
			if err == nil || err.Error() != want {
				t.Fatalf("error %v, want %s", err, want)
			}
		})
	}
}
