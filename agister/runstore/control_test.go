package runstore_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/runstore"
)

// Contract test: the events.jsonl format and the file system.
func TestControlEventsAreKeptBesideTheRecord(t *testing.T) {
	t.Parallel()
	s, runs := store(t)
	at := time.Date(2026, 10, 23, 10, 0, 0, 0, time.UTC)
	if err := s.Write(lost("x")); err != nil {
		t.Fatal(err)
	}
	conditions := []runstore.Condition{{Arm: "passed", Holds: false, Read: map[string]any{"steps.test.outputs.exit_code": 1}}}
	for _, event := range []runstore.Event{
		{At: at, Step: "fix", Kind: runstore.Branch, Arm: "repair", Conditions: conditions},
		{At: at, Step: "repair/2", Kind: runstore.Pass, Pass: 1, State: map[string]any{"code": 0, "tail": ""}},
		{At: at, Step: "repair/2", Kind: runstore.Stopped, Stopped: "until", Passes: 1},
	} {
		if err := s.Append("x", event); err != nil {
			t.Fatal(err)
		}
	}
	data, err := os.ReadFile(filepath.Join(runs, "x", "events.jsonl"))
	if err != nil {
		t.Fatal(err)
	}
	want := []string{
		`{"at":"2026-10-23T10:00:00Z","step":"fix","kind":"branch","arm":"repair","conditions":[{"arm":"passed","holds":false,"read":{"steps.test.outputs.exit_code":1}}]}`,
		`{"at":"2026-10-23T10:00:00Z","step":"repair/2","kind":"pass","pass":1,"state":{"code":0,"tail":""}}`,
		`{"at":"2026-10-23T10:00:00Z","step":"repair/2","kind":"stopped","stopped":"until","passes":1}`,
	}
	lines := strings.Split(strings.TrimSuffix(string(data), "\n"), "\n")
	if len(lines) != len(want) {
		t.Fatalf("events %s", data)
	}
	for i, line := range lines {
		var actual, expected map[string]any
		if err := json.Unmarshal([]byte(line), &actual); err != nil {
			t.Fatal(err)
		}
		if err := json.Unmarshal([]byte(want[i]), &expected); err != nil {
			t.Fatal(err)
		}
		if !reflect.DeepEqual(actual, expected) {
			t.Errorf("event %v, want %v", actual, expected)
		}
	}
}
