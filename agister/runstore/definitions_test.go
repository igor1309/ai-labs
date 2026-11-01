package runstore_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/igor1309/ai-labs/agister/runstore"
)

// runstore.feature, "A call's definitions are written and given back".
// Contract test: definition identities persisted in record.json.
func TestDefinitionsAreWrittenAndGivenBack(t *testing.T) {
	t.Parallel()
	s, runs := store(t)
	record := ended("x")
	record.Request.Definitions = []runstore.Definition{{Kind: "workflow", Name: "pair", Files: []runstore.File{{Layer: "repository", Path: "/r/pair.yaml", Digest: "d0"}}}}
	record.Calls[0].Definitions = []runstore.Definition{{Kind: "process", Name: "p", Files: []runstore.File{{Layer: "home", Path: "/h/p.yaml", Digest: "d1"}}}}
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
	want := []any{map[string]any{"kind": "process", "name": "p", "files": []any{map[string]any{"layer": "home", "path": "/h/p.yaml", "digest": "d1"}}}}
	if defs := got["calls"].([]any)[0].(map[string]any)["definitions"]; !reflect.DeepEqual(defs, want) {
		t.Errorf("definitions %v, want %v", defs, want)
	}
	kept, err := s.Record("x")
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(kept, record) {
		t.Errorf("record %+v, want %+v", kept, record)
	}
}
