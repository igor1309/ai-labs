package agister_test

import (
	"os"
	"slices"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/settings/documents"
)

// The runtime mappings Agister ships in home/runtimes each type with no
// problem, in the shape of ADR-012: a select and the options it chooses
// among, by name; bash's offers none.
//
// Contract test: the files home/runtimes holds, as Agister ships them.
func TestTheShippedRuntimeMappingsType(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name    string
		selects string
		options []string
	}{
		{"bash", "", nil},
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

// Every agent, brief, process and workflow Agister ships in home types
// with no problem, extends applied.
//
// Contract test: the files home/agents, home/briefs, home/processes and
// home/workflows hold, as Agister ships them.
func TestTheShippedDocumentsType(t *testing.T) {
	t.Parallel()
	folders := []struct {
		kind      documents.Kind
		folder    string
		extension string
	}{
		{documents.Agent, "home/agents/", ".toml"},
		{documents.Brief, "home/briefs/", ".yaml"},
		{documents.Process, "home/processes/", ".yaml"},
		{documents.Workflow, "home/workflows/", ".yaml"},
	}
	snapshot := documents.Snapshot{Documents: map[documents.Kind]map[string]documents.Document{}}
	for _, f := range folders {
		entries, err := os.ReadDir(f.folder)
		if err != nil {
			t.Fatal(err)
		}
		snapshot.Documents[f.kind] = map[string]documents.Document{}
		for _, entry := range entries {
			name, ok := strings.CutSuffix(entry.Name(), f.extension)
			if !ok {
				t.Fatalf("%s%s is not a %s file", f.folder, entry.Name(), f.extension)
			}
			path := f.folder + entry.Name()
			bytes, err := os.ReadFile(path)
			if err != nil {
				t.Fatal(err)
			}
			snapshot.Documents[f.kind][name] = documents.Document{Sources: documents.Sources{Home: &documents.Source{Path: path, Bytes: bytes}}}
		}
	}
	d := documents.New(snapshot)
	for kind, named := range snapshot.Documents {
		for name := range named {
			t.Run(string(kind)+" "+name, func(t *testing.T) {
				t.Parallel()
				var problems []documents.Problem
				switch kind {
				case documents.Agent:
					_, problems = d.Agent(name)
				case documents.Brief:
					_, problems = d.Brief(name)
				case documents.Process:
					_, problems = d.Process(name)
				case documents.Workflow:
					_, problems = d.Workflow(name)
				}
				if len(problems) > 0 {
					t.Errorf("problems %v", problems)
				}
			})
		}
	}
}
