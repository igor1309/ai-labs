package runstore_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/igor1309/ai-labs/agister/runstore"
)

func emptyPermissions() runstore.Permissions {
	return runstore.Permissions{Options: []string{}, Required: []string{}, Allowed: []string{},
		Granted: []string{}, Extra: []string{}, Withheld: []string{}}
}

// plan.feature, "A call's permissions and environment are written and given back".
// Contract test: permissions and environment persisted in record.json.
func TestCallPlansAreWrittenAndGivenBack(t *testing.T) {
	t.Parallel()
	for _, kind := range []string{"some", "all", "none"} {
		t.Run(kind, func(t *testing.T) {
			t.Parallel()
			s, runs := store(t)
			record := ended("x")
			p := runstore.Permissions{}
			var env []runstore.Variable
			want := map[string]any{"options": []any{}, "required": []any{}, "allowed": []any{},
				"granted": []any{}, "extra": []any{}, "withheld": []any{}}
			wantEnv := []any{}
			if kind != "none" {
				p.Granted, p.Withheld = []string{"repository.read"}, []string{"network"}
				env = []runstore.Variable{{Name: "A", Value: "1"}}
				want["granted"], want["withheld"] = []any{"repository.read"}, []any{"network"}
				wantEnv = []any{map[string]any{"name": "A", "value": "1"}}
			}
			if kind == "all" {
				p.Options, p.Required = []string{"Read", "Glob"}, []string{"repository.read"}
				p.Allowed, p.Extra = []string{"repository.read", "network"}, []string{"host.read"}
				env = []runstore.Variable{{Name: "B", Value: "\n<whole>\n"}, {Name: "A", Value: ""}}
				want["options"], want["required"] = []any{"Read", "Glob"}, []any{"repository.read"}
				want["allowed"], want["extra"] = []any{"repository.read", "network"}, []any{"host.read"}
				wantEnv = []any{map[string]any{"name": "B", "value": "\n<whole>\n"}, map[string]any{"name": "A", "value": ""}}
			}
			record.Calls[0].Permissions, record.Calls[0].Environment = p, env
			if err := s.Write(record); err != nil {
				t.Fatal(err)
			}
			data, err := os.ReadFile(filepath.Join(runs, "x", "record.json"))
			if err != nil {
				t.Fatal(err)
			}
			var written struct {
				Calls []map[string]any `json:"calls"`
			}
			if err := json.Unmarshal(data, &written); err != nil {
				t.Fatal(err)
			}
			call := written.Calls[0]
			if !reflect.DeepEqual(call["permissions"], want) || !reflect.DeepEqual(call["environment"], wantEnv) {
				t.Fatalf("permissions %v, environment %v; want %v, %v", call["permissions"], call["environment"], want, wantEnv)
			}
			kept, err := s.Record("x")
			if err != nil {
				t.Fatal(err)
			}
			var expected runstore.Call
			encoded, err := json.Marshal(map[string]any{"permissions": want, "environment": wantEnv})
			if err != nil {
				t.Fatal(err)
			}
			if err := json.Unmarshal(encoded, &expected); err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(kept.Calls[0].Permissions, expected.Permissions) || !reflect.DeepEqual(kept.Calls[0].Environment, expected.Environment) {
				t.Errorf("given back %+v, want permissions %+v and environment %+v", kept.Calls[0], expected.Permissions, expected.Environment)
			}
		})
	}
}

// plan.feature, "An entry from before is read as having none".
// Contract test: a record.json without permissions or environment.
func TestLegacyCallHasNoPlan(t *testing.T) {
	t.Parallel()
	s, runs := store(t)
	if err := os.MkdirAll(filepath.Join(runs, "x"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(runs, "x", "record.json"), []byte(`{"id":"x","calls":[{"id":"x/a"}]}`), 0o600); err != nil {
		t.Fatal(err)
	}
	record, err := s.Record("x")
	if err != nil {
		t.Fatal(err)
	}
	if len(record.Calls) != 1 {
		t.Fatalf("calls %+v", record.Calls)
	}
	call := record.Calls[0]
	for name, list := range map[string][]string{"options": call.Permissions.Options, "required": call.Permissions.Required,
		"allowed": call.Permissions.Allowed, "granted": call.Permissions.Granted, "extra": call.Permissions.Extra, "withheld": call.Permissions.Withheld} {
		if len(list) != 0 {
			t.Errorf("legacy %s %q, want none", name, list)
		}
	}
	if len(call.Environment) != 0 {
		t.Errorf("legacy environment %+v, want none", call.Environment)
	}
}
