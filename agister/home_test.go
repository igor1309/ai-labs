package agister_test

import (
	"maps"
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
	snapshot := shipped(t)
	d := documents.New(snapshot)
	for kind, named := range snapshot.Documents {
		if kind == documents.Runtime {
			continue
		}
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

// shipped is a snapshot of every document home holds, each as its home
// source.
func shipped(t *testing.T) documents.Snapshot {
	t.Helper()
	folders := []struct {
		kind      documents.Kind
		folder    string
		extension string
	}{
		{documents.Agent, "home/agents/", ".toml"},
		{documents.Brief, "home/briefs/", ".yaml"},
		{documents.Process, "home/processes/", ".yaml"},
		{documents.Runtime, "home/runtimes/", ".yaml"},
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
	return snapshot
}

// The shipped settings say what the old shape said, but what the owner
// dropped: each process's workspace, permissions and output, each review
// workflow's revisions resolved once at its boundary and shared by its
// reviewers (ADR-010, rule 3), and bash granting every permission there is
// to an agent that names only its runtime.
//
// Contract test: the files home holds, as Agister ships them.
func TestTheShippedSettingsSayWhatTheyMean(t *testing.T) {
	t.Parallel()
	d := documents.New(shipped(t))
	every := []string{"repository.read", "repository.search", "repository.diff", "repository.history.read",
		"repository.write", "repository.history.write", "process.execute", "network", "host.read", "host.write"}
	reads := []string{"repository.read", "repository.diff", "repository.search", "repository.history.read", "process.execute", "host.read"}

	processes := []struct {
		name, access, revision, schema string
		require, allow                 []string
	}{
		{"implement", "read-write", "inputs.candidate_revision", "implementation",
			[]string{"repository.read", "repository.write", "process.execute"},
			[]string{"repository.read", "repository.search", "repository.diff", "repository.history.read",
				"repository.write", "repository.history.write", "process.execute", "network", "host.read", "host.write"}},
		{"architecture_review", "read-only", "inputs.candidate_revision", "review-result", []string{"repository.read", "repository.diff"}, reads},
		{"adr_review_codex", "read-only", "inputs.candidate_revision", "review-result", []string{"repository.read", "repository.diff"}, reads},
		{"advisor", "read-only", "inputs.revision", "advice", []string{"repository.read"}, reads},
		{"review_judge", "read-only", "", "judgement", []string{}, []string{}},
	}
	for _, c := range processes {
		t.Run("process "+c.name, func(t *testing.T) {
			t.Parallel()
			p, problems := d.Process(c.name)
			if len(problems) > 0 {
				t.Fatalf("problems %v", problems)
			}
			w := p.Workspace.Value
			if w.Access.Value != c.access || w.Revision.Value != c.revision {
				t.Errorf("workspace %q at %q, want %q at %q", w.Access.Value, w.Revision.Value, c.access, c.revision)
			}
			if w.Clean.Value != (c.access == "read-write") {
				t.Errorf("clean %v, want it only where the process writes", w.Clean.Value)
			}
			if got := p.Output.Value.Schema.Value; got != c.schema {
				t.Errorf("output schema %q, want %q", got, c.schema)
			}
			permissions := p.Permissions.Value
			if !slices.Equal(permissions.Require.Value, c.require) || !slices.Equal(permissions.Allow.Value, c.allow) {
				t.Errorf("permissions require %q allow %q\nwant require %q allow %q", permissions.Require.Value, permissions.Allow.Value, c.require, c.allow)
			}
		})
	}

	for _, name := range []string{"code_review", "adr_review"} {
		t.Run("workflow "+name, func(t *testing.T) {
			t.Parallel()
			w, problems := d.Workflow(name)
			if len(problems) > 0 {
				t.Fatalf("problems %v", problems)
			}
			sources := map[string]string{}
			for _, input := range w.Inputs.Value {
				for _, argument := range input.Value.Arguments {
					sources[input.Value.Name] = input.Value.Source.Value + " " + argument.Value.Value.From
				}
			}
			for _, revision := range []string{"base", "candidate"} {
				if want := "git.revision params." + revision; sources[revision] != want {
					t.Errorf("the input %s is %q, want %q", revision, sources[revision], want)
				}
			}
			reviewers := w.Steps.Value[0].Value.Parallel.Value
			if len(reviewers) == 0 {
				t.Fatal("no reviewer")
			}
			for _, reviewer := range reviewers {
				bound := map[string]string{}
				for _, binding := range reviewer.Value.Inputs.Value {
					bound[binding.Value.Name] = binding.Value.Value.From
				}
				want := map[string]string{"base": "inputs.base", "candidate": "inputs.candidate", "goal": "inputs.goal"}
				if !maps.Equal(bound, want) {
					t.Errorf("the reviewer %s binds %v, want %v", reviewer.Value.Name, bound, want)
				}
			}
		})
	}

	t.Run("bash", func(t *testing.T) {
		t.Parallel()
		runtime, problems := d.Runtime("bash")
		if len(problems) > 0 {
			t.Fatalf("problems %v", problems)
		}
		if !slices.Equal(runtime.Grants.Value, every) || runtime.Select.Given || runtime.Options.Given {
			t.Errorf("bash grants %q, select %v, options %v; want every permission, %q, and no option",
				runtime.Grants.Value, runtime.Select.Given, runtime.Options.Given, every)
		}
		agent, problems := d.Agent("bash")
		if len(problems) > 0 {
			t.Fatalf("problems %v", problems)
		}
		if want := (documents.AgentDefinition{Name: "bash", Runtime: agent.Runtime}); agent != want || agent.Runtime.Value != "bash" {
			t.Errorf("the bash agent %+v, want its runtime bash alone", agent)
		}
	})
}
