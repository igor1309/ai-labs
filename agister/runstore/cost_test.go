package runstore_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

// cost.feature: session cost is written explicitly, including null, and
// returned on read.
// Contract test: the operating system's filesystem.
func TestACallsSessionCostIsWrittenAndGivenBack(t *testing.T) {
	t.Parallel()
	cost, sessionCost := 0.5, 1.25
	for _, c := range []struct {
		name    string
		session *float64
		json    any
	}{
		{"known", &sessionCost, 1.25}, {"unknown", nil, nil},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			s, runs := store(t)
			record := ended("x")
			record.Calls[0].Result.Cost = &cost
			record.Calls[0].Result.SessionCost = c.session
			if err := s.Write(record); err != nil {
				t.Fatal(err)
			}
			data, err := os.ReadFile(filepath.Join(runs, "x", "record.json"))
			if err != nil {
				t.Fatal(err)
			}
			var raw struct {
				Calls []struct{ Result map[string]any }
			}
			if err := json.Unmarshal(data, &raw); err != nil {
				t.Fatal(err)
			}
			got, ok := raw.Calls[0].Result["session_cost"]
			if !ok || got != c.json {
				t.Fatalf("session_cost %v, present %v, want %v", got, ok, c.json)
			}
			read, err := s.Record("x")
			if err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(read.Calls[0].Result.SessionCost, c.session) || read.Calls[0].Result.Cost == nil || *read.Calls[0].Result.Cost != 0.5 {
				t.Fatalf("read result %+v", read.Calls[0].Result)
			}
		})
	}
}

// cost.feature, "An entry from before reads as no session cost".
// Contract test: the operating system's filesystem.
func TestAnEntryFromBeforeReadsAsNoSessionCost(t *testing.T) {
	t.Parallel()
	s, runs := store(t)
	folder := filepath.Join(runs, "x")
	if err := os.MkdirAll(folder, 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(folder, "record.json"), []byte(`{"schema":"agister.record/v1alpha1","id":"x","calls":[{"id":"x/a","result":{"cost":0.5}}]}`), 0600); err != nil {
		t.Fatal(err)
	}
	got, err := s.Record("x")
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Calls) != 1 || got.Calls[0].Result.SessionCost != nil || got.Calls[0].Result.Cost == nil || *got.Calls[0].Result.Cost != 0.5 {
		t.Fatalf("calls %+v, want cost 0.5 and unknown session cost", got.Calls)
	}
}

// cost.feature, "A call's cost source is written and given back": null
// where the cost is unknown.
// Contract test: the operating system's filesystem.
func TestACallsCostSourceIsWrittenAndGivenBack(t *testing.T) {
	t.Parallel()
	cost, source := 0.25, "ccusage"
	for _, c := range []struct {
		name   string
		cost   *float64
		source *string
		json   any
	}{
		{"known", &cost, &source, "ccusage"}, {"unknown", nil, nil, nil},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			s, runs := store(t)
			record := ended("x")
			record.Calls[0].Result.Cost = c.cost
			record.Calls[0].Result.CostSource = c.source
			if err := s.Write(record); err != nil {
				t.Fatal(err)
			}
			data, err := os.ReadFile(filepath.Join(runs, "x", "record.json"))
			if err != nil {
				t.Fatal(err)
			}
			var raw struct {
				Calls []struct{ Result map[string]any }
			}
			if err := json.Unmarshal(data, &raw); err != nil {
				t.Fatal(err)
			}
			got, ok := raw.Calls[0].Result["cost_source"]
			if !ok || got != c.json {
				t.Fatalf("cost_source %v, present %v, want %v", got, ok, c.json)
			}
			read, err := s.Record("x")
			if err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(read.Calls[0].Result.CostSource, c.source) || !reflect.DeepEqual(read.Calls[0].Result.Cost, c.cost) {
				t.Fatalf("read result %+v, want the cost %v from %v", read.Calls[0].Result, c.cost, c.source)
			}
		})
	}
}

// cost.feature, "An entry from before reads as no cost source".
// Contract test: the operating system's filesystem.
func TestAnEntryFromBeforeReadsAsNoCostSource(t *testing.T) {
	t.Parallel()
	s, runs := store(t)
	folder := filepath.Join(runs, "x")
	if err := os.MkdirAll(folder, 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(folder, "record.json"), []byte(`{"schema":"agister.record/v1alpha1","id":"x","calls":[{"id":"x/a","result":{"cost":0.5}}]}`), 0600); err != nil {
		t.Fatal(err)
	}
	got, err := s.Record("x")
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Calls) != 1 || got.Calls[0].Result.CostSource != nil {
		t.Fatalf("calls %+v, want no cost source", got.Calls)
	}
}
