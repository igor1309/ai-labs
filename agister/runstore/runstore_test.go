package runstore_test

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/runstore"
)

// store is a store over the folder "runs" in a temporary folder, and that
// folder's path.
func store(t *testing.T) (*runstore.Store, string) {
	t.Helper()
	runs := filepath.Join(t.TempDir(), "runs")
	s, err := runstore.New(runs)
	if err != nil {
		t.Fatal(err)
	}
	return s, runs
}

// started is when the records of these tests started.
var started = time.Date(2026, 10, 17, 7, 16, 18, 0, time.UTC)

// lost is the record of the run id, lost, no call ended.
func lost(id string) runstore.Record {
	return runstore.Record{Schema: runstore.Schema, ID: id,
		Request: runstore.Request{Workflow: "pair", Params: map[string]string{}, Dir: "/r"},
		Started: started, Status: "lost", Calls: []runstore.Call{}}
}

// ended is the record of the run id, completed, its call "a" kept.
func ended(id string) runstore.Record {
	end := started.Add(3 * time.Second)
	class, session := "refused", "s1"
	outcome := runstore.Outcome{Status: "completed", Output: map[string]any{"q": "<why>"},
		Timing: runstore.Timing{Started: started, Ended: end, DurationMS: 3000}, Warnings: []string{"w"}}
	record := lost(id)
	record.Ended, record.Status = &end, "completed"
	record.Calls = []runstore.Call{{ID: id + "/a", Step: "a", Process: "ask", Agent: "claude-opus", Root: "/r",
		Head: "c1", Content: "t1", Result: runstore.CallResult{Outcome: outcome, Session: &session}}}
	failed := outcome
	failed.Status, failed.Class = "failed", &class
	record.Result = &runstore.Result{Outcome: failed, Sessions: map[string]string{"a": "s1"}, RunID: id}
	return record
}

// held is the record in file, decoded.
func held(t *testing.T, file string) runstore.Record {
	t.Helper()
	data, err := os.ReadFile(file)
	if err != nil {
		t.Fatal(err)
	}
	var record runstore.Record
	if err := json.Unmarshal(data, &record); err != nil {
		t.Fatal(err)
	}
	return record
}

// runstore.feature, "A record written is given back by its run's id".
//
// Contract test: the operating system's filesystem.
func TestARecordWrittenIsGivenBackByItsRunsID(t *testing.T) {
	t.Parallel()
	s, runs := store(t)
	for _, record := range []runstore.Record{lost("x"), ended("x")} {
		if err := s.Write(record); err != nil {
			t.Fatal(err)
		}
	}
	if got, want := held(t, filepath.Join(runs, "x", "record.json")), ended("x"); !reflect.DeepEqual(got, want) {
		t.Errorf("record.json holds %+v, want %+v", got, want)
	}
	got, err := s.Record("x")
	if err != nil {
		t.Fatal(err)
	}
	if want := ended("x"); !reflect.DeepEqual(got, want) {
		t.Errorf("record %+v, want %+v", got, want)
	}
}

// runstore.feature, "A record is written whole, no temporary file left".
//
// Contract test: the operating system's filesystem.
func TestARecordIsWrittenWholeNoTemporaryFileLeft(t *testing.T) {
	t.Parallel()
	s, runs := store(t)
	for _, record := range []runstore.Record{lost("x"), ended("x")} {
		if err := s.Write(record); err != nil {
			t.Fatal(err)
		}
	}
	entries, err := os.ReadDir(filepath.Join(runs, "x"))
	if err != nil {
		t.Fatal(err)
	}
	var names []string
	for _, entry := range entries {
		names = append(names, entry.Name())
	}
	if want := []string{"record.json"}; !slices.Equal(names, want) {
		t.Errorf("runs/x holds %q, want %q", names, want)
	}
	if got, want := held(t, filepath.Join(runs, "x", "record.json")), ended("x"); !reflect.DeepEqual(got, want) {
		t.Errorf("record.json holds %+v, want %+v", got, want)
	}
}

// A record is written in the shape of its schema: a run not ended has
// its end and result null, and calls and params that are none are empty.
//
// Contract test: the operating system's filesystem.
func TestARecordIsWrittenInTheShapeOfItsSchema(t *testing.T) {
	t.Parallel()
	s, runs := store(t)
	record := lost("x")
	record.Calls, record.Request.Params = nil, nil
	if err := s.Write(record); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(filepath.Join(runs, "x", "record.json"))
	if err != nil {
		t.Fatal(err)
	}
	var got map[string]any
	if err := json.Unmarshal(data, &got); err != nil {
		t.Fatal(err)
	}
	want := map[string]any{"schema": "agister.record/v1alpha1", "id": "x",
		"request": map[string]any{"workflow": "pair", "process": "", "agent": "", "params": map[string]any{}, "dir": "/r"},
		"started": "2026-10-17T07:16:18Z", "ended": nil, "status": "lost", "calls": []any{}, "result": nil}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("record.json holds\n %v\nwant\n %v", got, want)
	}
}

// lines is the lines of file, each decoded.
func lines(t *testing.T, file string) []map[string]any {
	t.Helper()
	data, err := os.ReadFile(file)
	if err != nil {
		t.Fatal(err)
	}
	var decoded []map[string]any
	for _, line := range strings.SplitAfter(string(data), "\n") {
		if line == "" {
			continue
		}
		if !strings.HasSuffix(line, "\n") {
			t.Fatalf("the line %q does not end", line)
		}
		var event map[string]any
		if err := json.Unmarshal([]byte(line), &event); err != nil {
			t.Fatalf("the line %q: %v", line, err)
		}
		decoded = append(decoded, event)
	}
	return decoded
}

// runstore.feature, "Appends side by side are each a whole line": each
// event's tool input long enough that a write is no single block.
//
// Contract test: the operating system's filesystem.
func TestAppendsSideBySideAreEachAWholeLine(t *testing.T) {
	t.Parallel()
	s, runs := store(t)
	input := strings.Repeat("i", 64<<10)
	var wg sync.WaitGroup
	start := make(chan struct{})
	for i := range 50 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			event := runstore.Event{At: started, Step: fmt.Sprintf("s%02d", i), Kind: runstore.Tool, Name: "Bash", Input: input}
			if err := s.Append("x", event); err != nil {
				t.Error(err)
			}
		}()
	}
	close(start)
	wg.Wait()
	var steps []string
	for _, event := range lines(t, filepath.Join(runs, "x", "events.jsonl")) {
		if event["input"] != input {
			t.Errorf("the event of %v holds another input", event["step"])
		}
		steps = append(steps, fmt.Sprint(event["step"]))
	}
	slices.Sort(steps)
	if len(slices.Compact(slices.Clone(steps))) != 50 || len(steps) != 50 {
		t.Errorf("events.jsonl holds the steps %q, want s00 to s49, once each", steps)
	}
}

// runstore.feature, "Events are appended, a line each, in order".
//
// Contract test: the operating system's filesystem.
func TestEventsAreAppendedALineEachInOrder(t *testing.T) {
	t.Parallel()
	s, runs := store(t)
	for _, step := range []string{"a", "b", "c"} {
		if err := s.Append("x", runstore.Event{At: started, Step: step, Kind: runstore.Started, Agent: "bash"}); err != nil {
			t.Fatal(err)
		}
	}
	var steps []string
	for _, event := range lines(t, filepath.Join(runs, "x", "events.jsonl")) {
		steps = append(steps, fmt.Sprint(event["step"]))
	}
	if want := []string{"a", "b", "c"}; !slices.Equal(steps, want) {
		t.Errorf("events.jsonl holds %q, want %q", steps, want)
	}
}

// runstore.feature, "A run not kept is an error".
//
// Contract test: the operating system's filesystem.
func TestARunNotKeptIsAnError(t *testing.T) {
	t.Parallel()
	s, _ := store(t)
	if got, err := s.Record("y"); !errors.Is(err, fs.ErrNotExist) {
		t.Errorf("record %+v, %v; want an error that is fs.ErrNotExist", got, err)
	}
}

// An event is the line of its kind: the fields of that kind alone, a
// class that is none null.
func TestAnEventIsTheLineOfItsKind(t *testing.T) {
	t.Parallel()
	at := "2026-10-17T07:16:18Z"
	for _, c := range []struct {
		event runstore.Event
		want  string
	}{
		{runstore.Event{At: started, Step: "a", Kind: runstore.Started, Agent: "bash", Name: "x"},
			`{"at":"` + at + `","step":"a","kind":"started","agent":"bash"}`},
		{runstore.Event{At: started, Step: "a", Kind: runstore.Tool, Name: "Bash", Input: "ls", Agent: "x"},
			`{"at":"` + at + `","step":"a","kind":"tool","name":"Bash","input":"ls"}`},
		{runstore.Event{At: started, Step: "a", Kind: runstore.Ended, Status: "completed", Duration: 1500 * time.Millisecond},
			`{"at":"` + at + `","step":"a","kind":"ended","status":"completed","class":null,"duration_ms":1500}`},
		{runstore.Event{At: started, Step: "a", Kind: runstore.Ended, Status: "failed", Class: "refused"},
			`{"at":"` + at + `","step":"a","kind":"ended","status":"failed","class":"refused","duration_ms":0}`},
	} {
		t.Run(c.want, func(t *testing.T) {
			t.Parallel()
			got, err := json.Marshal(c.event)
			if err != nil {
				t.Fatal(err)
			}
			if string(got) != c.want {
				t.Errorf("event\n %s\nwant\n %s", got, c.want)
			}
		})
	}
	if got, err := json.Marshal(runstore.Event{Kind: "nope"}); err == nil {
		t.Errorf("an event of no kind is %s and no error, want an error", got)
	}
}

// An id that names no folder of its own under the store's is an error,
// for each of what the store does, and nothing is kept outside it.
//
// Contract test: the operating system's filesystem.
func TestAnIDThatNamesNoRunsFolderIsAnError(t *testing.T) {
	t.Parallel()
	for _, id := range []string{"", ".", "..", "a/b", `a\b`, "../x"} {
		t.Run(id, func(t *testing.T) {
			t.Parallel()
			s, runs := store(t)
			if err := s.Write(lost(id)); err == nil {
				t.Error("Write gave no error")
			}
			if err := s.Append(id, runstore.Event{Kind: runstore.Started}); err == nil {
				t.Error("Append gave no error")
			}
			if _, err := s.Record(id); err == nil {
				t.Error("Record gave no error")
			}
			if entries, err := os.ReadDir(filepath.Dir(runs)); err != nil || len(entries) > 0 {
				t.Errorf("the store's parent holds %v, %v; want nothing", entries, err)
			}
		})
	}
}

// A store is given its folder; none fails at construction.
func TestNewFailsWithNoFolder(t *testing.T) {
	t.Parallel()
	if _, err := runstore.New(""); err == nil {
		t.Error("New with no folder gave no error")
	}
}
