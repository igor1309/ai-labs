package documents_test

import (
	"slices"
	"sync"
	"testing"

	"github.com/igor1309/ai-labs/agister/settings/documents"
	"github.com/igor1309/ai-labs/gokit/tree"
)

// agentFile is the path of the agent name's file in the layer whose folder
// is under root.
func agentFile(root, name string) string {
	return root + "/.agister/agents/" + name + ".toml"
}

// agentsOf is a documents of the agents given, by name.
func agentsOf(agents map[string]documents.Document) *documents.Documents {
	return documents.New(documents.Snapshot{Documents: map[documents.Kind]map[string]documents.Document{documents.Agent: agents}})
}

// agent.feature, "An agent's fields": every field the agent gives, each
// with its value and the origin of its home file, which in TOML gives no
// line.
func TestAnAgentsFields(t *testing.T) {
	t.Parallel()
	d := agentsOf(map[string]documents.Document{"a": {Sources: documents.Sources{Home: source(homeAgent, `schema = "agister.agent/v1alpha1"
runtime = "claude-code"
model = "opus"
model_family = "anthropic"
effort = "high"
command = "/usr/local/bin/claude"
`)}}})
	got, problems := d.Agent("a")
	assertProblems(t, problems, nil)
	assertAgent(t, got, documents.AgentDefinition{
		Name:        "a",
		Runtime:     text("claude-code", homeAgent, 0),
		Model:       text("opus", homeAgent, 0),
		ModelFamily: text("anthropic", homeAgent, 0),
		Effort:      text("high", homeAgent, 0),
		Command:     text("/usr/local/bin/claude", homeAgent, 0),
	})
}

// agent.feature, "An agent names its runtime, with its kind or without":
// an agent's runtime is a reference: given bare or with "runtime" before
// it, the agent holds the name, of the file that gave it; with another kind
// before it, it is a problem in that file.
func TestAnAgentsRuntimeIsGivenWithItsKindOrWithout(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name, layer, runtime string
		want                 documents.AgentDefinition
		problems             []documents.Problem
	}{
		{"bare", "/home", "codex", documents.AgentDefinition{Name: "a", Runtime: text("codex", agentFile("/home", "a"), 0)}, nil},
		{"with its kind", "/home", "runtime:codex", documents.AgentDefinition{Name: "a", Runtime: text("codex", agentFile("/home", "a"), 0)}, nil},
		{"with its kind, in the repository", "/repo", "runtime:claude-code",
			documents.AgentDefinition{Name: "a", Runtime: text("claude-code", agentFile("/repo", "a"), 0)}, nil},
		{"with another kind", "/home", "agent:codex", documents.AgentDefinition{},
			[]documents.Problem{{Path: agentFile("/home", "a"), Place: "runtime", Message: "it names a runtime"}}},
		{"with another kind, in the repository", "/repo", "prompt:codex", documents.AgentDefinition{},
			[]documents.Problem{{Path: agentFile("/repo", "a"), Place: "runtime", Message: "it names a runtime"}}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			runtime := "runtime = '" + c.runtime + "'\n"
			sources := documents.Sources{Home: source(agentFile("/home", "a"), "schema = 'agister.agent/v1alpha1'\n"+runtime)}
			if c.layer == "/repo" {
				sources.Home = source(agentFile("/home", "a"), validAgent)
				sources.Repository = source(agentFile("/repo", "a"), runtime)
			}
			got, problems := agentsOf(map[string]documents.Document{"a": {Sources: sources}}).Agent("a")
			assertProblems(t, problems, c.problems)
			assertAgent(t, got, c.want)
		})
	}
}

// The composed document is what is typed: an empty file's is the empty
// tree, which misses every field it needs, each in no file.
func TestADocumentWhoseOnlyFileIsEmptyMissesEveryFieldItNeeds(t *testing.T) {
	t.Parallel()
	d := agentsOf(map[string]documents.Document{"a": {Sources: documents.Sources{Home: source(agentFile("/home", "a"), "")}}})
	got, problems := d.Agent("a")
	assertNoAgent(t, got)
	assertProblems(t, problems, []documents.Problem{missing("schema"), missing("runtime")})
}

// A field's problem is in the file of the layer whose value the composed
// tree holds, whichever layer that is.
func TestAFieldProblemNamesTheFileThatGaveTheField(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name                string
		repository, project string
		want                documents.Problem
	}{
		{"a field of the wrong type in the repository", "model = 3", "", documents.Problem{
			Path: agentFile("/repo", "a"), Place: "model", Message: "it is a string, not an integer",
		}},
		{"a field of the wrong type in the project, over the repository's", "model = 'opus'", "model = 3", documents.Problem{
			Path: agentFile("/repo/p", "a"), Place: "model", Message: "it is a string, not an integer",
		}},
		{"a field no kind knows in the project", "", "colour = 'red'", documents.Problem{
			Path: agentFile("/repo/p", "a"), Place: "colour", Message: "the field is not known",
		}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			sources := documents.Sources{Home: source(agentFile("/home", "a"), validAgent)}
			if c.repository != "" {
				sources.Repository = source(agentFile("/repo", "a"), c.repository)
			}
			if c.project != "" {
				sources.Project = source(agentFile("/repo/p", "a"), c.project)
			}
			got, problems := agentsOf(map[string]documents.Document{"a": {Sources: sources}}).Agent("a")
			assertNoAgent(t, got)
			assertProblems(t, problems, []documents.Problem{c.want})
		})
	}
}

// What the extending document leaves to its base is typed from the base,
// with the base's file as its origin; what it gives is its own.
func TestAFieldTheExtendingDocumentLeavesToItsBaseIsTypedFromTheBase(t *testing.T) {
	t.Parallel()
	d := agentsOf(map[string]documents.Document{
		"base": {Sources: documents.Sources{Home: source(agentFile("/home", "base"),
			"schema = 'agister.agent/v1alpha1'\nruntime = 'codex'\nmodel = 'o3'\n")}},
		"a": {Sources: documents.Sources{Home: source(agentFile("/home", "a"),
			"schema = 'agister.agent/v1alpha1'\nextends = 'base'\neffort = 'high'\n")}},
	})
	got, problems := d.Agent("a")
	assertProblems(t, problems, nil)
	assertAgent(t, got, documents.AgentDefinition{
		Name:    "a",
		Runtime: text("codex", agentFile("/home", "base"), 0),
		Model:   text("o3", agentFile("/home", "base"), 0),
		Effort:  text("high", agentFile("/home", "a"), 0),
	})
}

// An agent whose tree has problems is not typed: its problems are its
// tree's, as Tree gives them.
func TestAnAgentsTreeProblemsAreItsProblems(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name     string
		snapshot documents.Snapshot
	}{
		{"no document", documents.Snapshot{}},
		{"no agent a", documents.Snapshot{Documents: map[documents.Kind]map[string]documents.Document{
			documents.Process: {"a": {Sources: documents.Sources{Home: source(homeProcess, "{x: 1}")}}},
		}}},
		{"an agent a with no source", documents.Snapshot{Documents: map[documents.Kind]map[string]documents.Document{
			documents.Agent: {"a": {}},
		}}},
		{"bytes that do not decode", documents.Snapshot{Documents: map[documents.Kind]map[string]documents.Document{
			documents.Agent: {"a": {Sources: documents.Sources{
				Home:       source(agentFile("/home", "a"), validAgent),
				Repository: source(agentFile("/repo", "a"), "model = [1"),
			}}},
		}}},
		{"a file problem", documents.Snapshot{Documents: map[documents.Kind]map[string]documents.Document{
			documents.Agent: {"a": {
				Sources:  documents.Sources{Home: source(agentFile("/home", "a"), validAgent)},
				Problems: []documents.Problem{{Path: agentFile("/repo", "a"), Message: "permission denied"}},
			}},
		}}},
		{"a base whose bytes do not decode", documents.Snapshot{Documents: map[documents.Kind]map[string]documents.Document{
			documents.Agent: {
				"a":    {Sources: documents.Sources{Home: source(agentFile("/home", "a"), validAgent+"extends = 'base'\n")}},
				"base": {Sources: documents.Sources{Home: source(agentFile("/home", "base"), "model = [1")}},
			},
		}}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			d := documents.New(c.snapshot)
			_, want := d.Tree(documents.Agent, "a")
			if len(want) == 0 {
				t.Fatal("the agent's tree has no problem")
			}
			got, problems := d.Agent("a")
			assertNoAgent(t, got)
			assertProblems(t, problems, want)
		})
	}
}

// Each agent whose tree has no problem is typed once, when the documents
// are built, and never again however often and from however many callers
// it is asked for.
func TestEachAgentIsTypedOnce(t *testing.T) {
	t.Parallel()
	var mu sync.Mutex
	var typed []string
	typeAgent := func(name string, root tree.Node) (documents.AgentDefinition, []documents.Problem) {
		mu.Lock()
		typed = append(typed, name)
		mu.Unlock()
		return documents.TypeAgent(name, root)
	}
	agent := func(name, bytes string) documents.Document {
		return documents.Document{Sources: documents.Sources{Home: source(agentFile("/home", name), bytes)}}
	}
	d := documents.NewTypingWith(documents.Snapshot{Documents: map[documents.Kind]map[string]documents.Document{
		documents.Agent: {
			"a":    agent("a", validAgent+"extends = 'base'\n"),
			"base": agent("base", "schema = 'agister.agent/v1alpha1'\nruntime = 'codex'\n"),
			"c":    agent("c", "schema = 'agister.agent/v1alpha1'\n"),
			"d":    agent("d", "model = [1"),
		},
		documents.Process: {"a": {Sources: documents.Sources{Home: source(homeProcess, "{x: 1}")}}},
	}}, documents.Typers{Agent: typeAgent, Runtime: documents.TypeRuntime, Brief: documents.TypeBrief})
	want := []string{"a", "base", "c"}
	assertTyped := func(when string) {
		t.Helper()
		mu.Lock()
		got := slices.Sorted(slices.Values(typed))
		mu.Unlock()
		if !slices.Equal(got, want) {
			t.Errorf("%s, typed\n got %q\nwant %q", when, got, want)
		}
	}
	assertTyped("built")
	var callers sync.WaitGroup
	for range 8 {
		callers.Add(1)
		go func() {
			defer callers.Done()
			for range 3 {
				for _, name := range []string{"a", "base", "c", "d", "z"} {
					d.Agent(name)
				}
			}
		}()
	}
	callers.Wait()
	assertTyped("asked for each agent many times")
	got, problems := d.Agent("a")
	assertProblems(t, problems, nil)
	assertAgent(t, got, documents.AgentDefinition{Name: "a", Runtime: text("codex", agentFile("/home", "a"), 0)})
	if _, problems := d.Agent("c"); !slices.Equal(problems, []documents.Problem{missing("runtime")}) {
		t.Errorf("agent c's problems %q, want its runtime missing", problems)
	}
}

// What a caller does with the problems it is given leaves the next
// caller's as they were.
func TestAnAgentsProblemsAreTheCallersOwn(t *testing.T) {
	t.Parallel()
	d := agentsOf(map[string]documents.Document{
		"a": {Sources: documents.Sources{Home: source(agentFile("/home", "a"), "")}},
		"b": {Problems: []documents.Problem{{Path: agentFile("/repo", "b"), Message: "permission denied"}}},
	})
	cases := map[string][]documents.Problem{
		"a": {missing("schema"), missing("runtime")},
		"b": {{Path: agentFile("/repo", "b"), Message: "permission denied"}},
	}
	for name, want := range cases {
		_, first := d.Agent(name)
		first[0].Message = "changed"
		_, problems := d.Agent(name)
		assertProblems(t, problems, want)
	}
}
