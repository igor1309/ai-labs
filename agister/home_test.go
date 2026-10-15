package agister_test

import (
	"os"
	"slices"
	"testing"

	"github.com/igor1309/ai-labs/agister/settings/documents"
)

// The runtime mappings Agister ships in home/runtimes each type with no
// problem, in the shape of ADR-012: a select and the options it chooses
// among, by name.
//
// Contract test: the files home/runtimes holds, as Agister ships them.
func TestTheShippedRuntimeMappingsType(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name    string
		selects string
		options []string
	}{
		{"claude-code", "any", []string{"Bash", "Edit", "Glob", "Grep", "NotebookEdit", "Read", "WebFetch", "WebSearch", "Write"}},
		{"codex", "one", []string{"read-only", "workspace-write"}},
		{"pi", "any", []string{"bash", "edit", "find", "grep", "ls", "read", "write"}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			path := "home/runtimes/" + c.name + ".yaml"
			bytes, err := os.ReadFile(path)
			if err != nil {
				t.Fatal(err)
			}
			d := documents.New(documents.Snapshot{Documents: map[documents.Kind]map[string]documents.Document{
				documents.Runtime: {c.name: {Sources: documents.Sources{Home: &documents.Source{Path: path, Bytes: bytes}}}},
			}})
			got, problems := d.Runtime(c.name)
			if len(problems) > 0 {
				t.Fatalf("problems %v", problems)
			}
			if got.Select.Value != c.selects {
				t.Errorf("select %q, want %q", got.Select.Value, c.selects)
			}
			var names []string
			for _, option := range got.Options.Value {
				names = append(names, option.Value.Name)
				if len(option.Value.Grants.Value) == 0 {
					t.Errorf("the option %s grants nothing", option.Value.Name)
				}
			}
			if !slices.Equal(names, c.options) {
				t.Errorf("options %q, want %q", names, c.options)
			}
		})
	}
}
