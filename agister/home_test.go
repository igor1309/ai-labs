package agister_test

import (
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"strconv"
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
// Contract test: the files home/agents, home/brief-forms, home/processes and
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
		{documents.Brief, "home/brief-forms/", ".yaml"},
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

// The shipped settings say what they mean: each process's workspace,
// permissions and output, each review workflow's revisions resolved once
// at its boundary and shared by its reviewers (ADR-010, rule 3), and bash
// granting every permission there is to an agent that names only its
// runtime.
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
		{"implement", "read-write", "candidate_revision", "implementation",
			[]string{"repository.read", "repository.write", "process.execute"},
			[]string{"repository.read", "repository.search", "repository.diff", "repository.history.read",
				"repository.write", "repository.history.write", "process.execute", "network", "host.read", "host.write"}},
		{"review", "read-only", "candidate_revision", "review-result", []string{"repository.read", "repository.diff"}, reads},
		{"adr_review_codex", "read-only", "candidate_revision", "review-result", []string{"repository.read", "repository.diff"}, reads},
		{"adversarial_review", "read-only", "candidate_revision", "review-result", []string{"repository.read", "repository.diff"}, reads},
		{"architecture_review", "read-only", "candidate_revision", "review-result", []string{"repository.read", "repository.diff"}, reads},
		{"clarity_review", "read-only", "candidate_revision", "review-result", []string{"repository.read", "repository.diff"}, reads},
		{"intent_review", "read-only", "candidate_revision", "review-result", []string{"repository.read", "repository.diff"}, reads},
		{"tests_review", "read-only", "candidate_revision", "review-result", []string{"repository.read", "repository.diff"}, reads},
		{"advisor", "read-only", "revision", "advice", []string{"repository.read"}, reads},
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
			revision := documents.Reference{Root: documents.ReadsInput, Name: c.revision}
			if c.revision == "" {
				revision = documents.Reference{}
			}
			if w.Access.Value != c.access || !reflect.DeepEqual(w.Revision.Value, revision) {
				t.Errorf("workspace %q at %+v, want %q at %+v", w.Access.Value, w.Revision.Value, c.access, revision)
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
			inputs := map[string]documents.Input{}
			for _, input := range w.Inputs.Value {
				inputs[input.Value.Name] = input.Value
			}
			for _, revision := range []string{"base", "candidate"} {
				input := inputs[revision]
				arguments := map[string]documents.Value{}
				for _, argument := range input.Arguments {
					arguments[argument.Value.Name] = argument.Value.Value
				}
				want := map[string]documents.Value{"rev": {From: documents.Reference{Root: documents.ReadsParam, Name: revision}}}
				if input.Source.Value != "git.revision" || !reflect.DeepEqual(arguments, want) {
					t.Errorf("the input %s is %q of %v, want git.revision of %v", revision, input.Source.Value, arguments, want)
				}
			}
			reviewers := w.Steps.Value[0].Value.Parallel.Value
			if len(reviewers) == 0 {
				t.Fatal("no reviewer")
			}
			for _, reviewer := range reviewers {
				bound := map[string]documents.Reference{}
				for _, binding := range reviewer.Value.Inputs.Value {
					bound[binding.Value.Name] = binding.Value.Value.From
				}
				want := map[string]documents.Reference{}
				for _, name := range []string{"base", "candidate", "goal"} {
					want[name] = documents.Reference{Root: documents.ReadsInput, Name: name}
				}
				if !reflect.DeepEqual(bound, want) {
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

// The numbered code-review DoDs cover the obligations their prose assigns
// to each reviewer and to the judge.
//
// Contract test: the code-review prompt DoDs shipped under home/prompts.
func TestCodeReviewPromptDoDsCoverTheirReviewObligations(t *testing.T) {
	t.Parallel()
	cases := []struct {
		prompt string
		item   int
		needs  []string
	}{
		{"code-review-architecture.md", 8, []string{"inspection cue, not a finding by itself", "File length alone"}},
		{"code-review-architecture.md", 10, []string{"relevant ADRs", "quote both the decision and the code", "one owner"}},
		{"code-review-architecture.md", 11, []string{"goal-required scenario", "outside the diff", "in `coverage`"}},
		{"code-review-adversarial.md", 9, []string{"goal-required scenario", "changed or unchanged", "in `coverage`"}},
		{"code-review-clarity.md", 3, []string{"inspection cue, not a finding by itself", "File length alone"}},
		{"code-review-clarity.md", 7, []string{"Repeated definitions relevant to the change", "including CSS", "concrete change"}},
		{"code-review-clarity.md", 10, []string{"goal-required scenario", "outside the diff", "clarity defect"}},
		{"code-review-tests.md", 1, []string{"names the class of inputs", "concrete case as a witness", "test of that class"}},
		{"code-review-judge.md", 1, []string{"Merge findings making the same claim", "highest supported severity", "sort items by severity"}},
		{"code-review-judge.md", 5, []string{"presented evidence", "Add no finding or evidence of your own"}},
		{"code-review-judge.md", 6, []string{
			"reject unsupported claims and every minor finding",
			"defer an outside finding",
			"a goal finding barred by an explicit scope exclusion",
			"fix blockers",
			"fix majors unless the presented cost is grossly disproportionate",
			"waive nits unless the presented benefit exceeds the cost",
			"weigh the presented benefit and cost",
		}},
	}
	for _, c := range cases {
		c := c
		t.Run(c.prompt+"/item "+strconv.Itoa(c.item), func(t *testing.T) {
			t.Parallel()
			items := readReviewDoDItems(t, "home/prompts/"+c.prompt)
			if !reviewDoDItemHas(items, c.item, c.needs) {
				t.Errorf("item %d in %s must contain %q; got %q", c.item, c.prompt, c.needs, items[c.item])
			}
		})
	}
}

func TestReviewDoDRequirementMustBeInItsNumberedItem(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name  string
		text  string
		item  int
		wants bool
	}{
		{"present", "Definition of done:\n\n1. Waive nits unless the presented benefit exceeds the cost.\n2. Check the outcome.\n", 1, true},
		{"missing", "Definition of done:\n\n1. Check the outcome.\n2. Check the calls.\n", 1, false},
		{"misplaced", "Definition of done:\n\n1. Check the outcome.\n2. Waive nits unless the presented benefit exceeds the cost.\n", 1, false},
	}
	for _, c := range cases {
		c := c
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			path := filepath.Join(t.TempDir(), "prompt.md")
			if err := os.WriteFile(path, []byte(c.text), 0o600); err != nil {
				t.Fatal(err)
			}
			items := readReviewDoDItems(t, path)
			got := reviewDoDItemHas(items, c.item, []string{"Waive nits unless the presented benefit exceeds the cost"})
			if got != c.wants {
				t.Errorf("requirement in item %d = %v, want %v; items: %v", c.item, got, c.wants, items)
			}
		})
	}
}

func readReviewDoDItems(t *testing.T, path string) map[int]string {
	t.Helper()
	prompt, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	items := map[int]string{}
	started, hasItems, current := false, false, 0
	for _, line := range strings.Split(string(prompt), "\n") {
		if !started {
			definition := strings.TrimSpace(line)
			started = definition == "Definition of done:" || definition == "Definition of done"
			continue
		}
		trimmed := strings.TrimSpace(line)
		if split := strings.Index(trimmed, ". "); split > 0 {
			if n, err := strconv.Atoi(trimmed[:split]); err == nil {
				current = n
				items[current] = trimmed[split+2:]
				hasItems = true
				continue
			}
		}
		if !hasItems {
			continue
		}
		if trimmed != "" && line != "" && line[0] != ' ' && line[0] != '\t' {
			break
		}
		if current != 0 {
			items[current] += "\n" + line
		}
	}
	return items
}

func reviewDoDItemHas(items map[int]string, item int, required []string) bool {
	text, ok := items[item]
	if !ok {
		return false
	}
	text = strings.Join(strings.Fields(text), " ")
	for _, phrase := range required {
		if !strings.Contains(text, phrase) {
			return false
		}
	}
	return true
}
