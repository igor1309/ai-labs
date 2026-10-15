package documents_test

import (
	"reflect"
	"testing"

	"github.com/igor1309/ai-labs/agister/settings/documents"
	"github.com/igor1309/ai-labs/gokit/tree"
)

const (
	homeAgent  = "/home/.agister/agents/a.toml"
	validAgent = "schema = 'agister.agent/v1alpha1'\nname = 'a'\nruntime = 'codex'\n"
)

// typeAgent is the agent a typed from bytes, decoded in TOML as its home
// file.
func typeAgent(t *testing.T, bytes string) (documents.AgentDefinition, []documents.Problem) {
	t.Helper()
	root, decoded := tree.Decode(tree.TOML, []byte(bytes), homeAgent)
	if len(decoded) > 0 {
		t.Fatalf("%q does not decode: %v", bytes, decoded)
	}
	return documents.TypeAgent("a", root)
}

func assertNoAgent(t *testing.T, got documents.AgentDefinition) {
	t.Helper()
	if !reflect.DeepEqual(got, documents.AgentDefinition{}) {
		t.Errorf("an agent %+v, want none", got)
	}
}

func assertAgent(t *testing.T, got, want documents.AgentDefinition) {
	t.Helper()
	if !reflect.DeepEqual(got, want) {
		t.Errorf("agent\n got %+v\nwant %+v", got, want)
	}
}

// text is a string field given by the file at path, on line.
func text(value, path string, line int) documents.Field[string] {
	return documents.Field[string]{Value: value, Origin: documents.Origin{Path: path, Line: line}, Given: true}
}

func missing(place string) documents.Problem {
	return documents.Problem{Place: place, Message: "it is missing"}
}

// inHome is a problem at place of the agent a's home file, which gives no
// line.
func inHome(place, message string) documents.Problem {
	return documents.Problem{Path: homeAgent, Place: place, Message: message}
}

// A tree document's schema is its kind's, a schema of another tree kind is
// not its kind's, any other is not known; its name is the document's. A
// missing one is in no file.
func TestEveryTreeDocumentNamesItsSchemaAndItsName(t *testing.T) {
	t.Parallel()
	notTheAgents := "an agent's schema is \"agister.agent/v1alpha1\""
	cases := []struct {
		name  string
		bytes string
		want  documents.Problem
	}{
		{"no schema", "name = 'a'\nruntime = 'codex'\n", missing("schema")},
		{"a later version", "schema = 'agister.agent/v2'\nname = 'a'\nruntime = 'codex'\n",
			inHome("schema", `the schema "agister.agent/v2" is not known`)},
		{"no Agister schema", "schema = 'x'\nname = 'a'\nruntime = 'codex'\n",
			inHome("schema", `the schema "x" is not known`)},
		{"a blob's kind", "schema = 'agister.prompt/v1alpha1'\nname = 'a'\nruntime = 'codex'\n",
			inHome("schema", `the schema "agister.prompt/v1alpha1" is not known`)},
		{"the process's", "schema = 'agister.process/v1alpha1'\nname = 'a'\nruntime = 'codex'\n", inHome("schema", notTheAgents)},
		{"the workflow's", "schema = 'agister.workflow/v1alpha1'\nname = 'a'\nruntime = 'codex'\n", inHome("schema", notTheAgents)},
		{"the runtime's", "schema = 'agister.runtime/v1alpha1'\nname = 'a'\nruntime = 'codex'\n", inHome("schema", notTheAgents)},
		{"the brief's", "schema = 'agister.brief/v1alpha1'\nname = 'a'\nruntime = 'codex'\n", inHome("schema", notTheAgents)},
		{"a schema that is no string", "schema = 1\nname = 'a'\nruntime = 'codex'\n",
			inHome("schema", "it is a string, not an integer")},
		{"no name", "schema = 'agister.agent/v1alpha1'\nruntime = 'codex'\n", missing("name")},
		{"another name", "schema = 'agister.agent/v1alpha1'\nname = 'b'\nruntime = 'codex'\n",
			inHome("name", `it is "a", the document's name`)},
		{"a name that is no string", "schema = 'agister.agent/v1alpha1'\nname = ['a']\nruntime = 'codex'\n",
			inHome("name", "it is a string, not a list")},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			got, problems := typeAgent(t, c.bytes)
			assertNoAgent(t, got)
			assertProblems(t, problems, []documents.Problem{c.want})
		})
	}
}

// A field no kind knows is a problem wherever it is in the document's
// root; extends is read by layering, and known.
func TestAFieldNoKindKnowsIsAProblem(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name  string
		bytes string
		want  []documents.Problem
	}{
		{"a string", validAgent + "colour = 'red'\n", []documents.Problem{inHome("colour", "the field is not known")}},
		{"a table", validAgent + "[colour]\nx = 1\n", []documents.Problem{inHome("colour", "the field is not known")}},
		{"two, by name", validAgent + "size = 1\ncolour = 'red'\n", []documents.Problem{
			inHome("colour", "the field is not known"),
			inHome("size", "the field is not known"),
		}},
		{"extends", validAgent + "extends = 'base'\n", nil},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			got, problems := typeAgent(t, c.bytes)
			assertProblems(t, problems, c.want)
			if c.want == nil {
				assertAgent(t, got, documents.AgentDefinition{Name: "a", Runtime: text("codex", homeAgent, 0)})
				return
			}
			assertNoAgent(t, got)
		})
	}
}

// Each of an agent's fields is a string, and a value of any other type in
// it is a problem at that field.
func TestAFieldOfTheWrongTypeIsAProblem(t *testing.T) {
	t.Parallel()
	values := []struct {
		toml, message string
	}{
		{"3", "it is a string, not an integer"},
		{"1.5", "it is a string, not a number"},
		{"true", "it is a string, not a boolean"},
		{"['x']", "it is a string, not a list"},
		{"{ x = 1 }", "it is a string, not a map"},
	}
	for _, field := range []string{"runtime", "model", "model_family", "effort", "command"} {
		for _, v := range values {
			t.Run(field+" "+v.toml, func(t *testing.T) {
				t.Parallel()
				bytes := "schema = 'agister.agent/v1alpha1'\nname = 'a'\n" + field + " = " + v.toml + "\n"
				if field != "runtime" {
					bytes += "runtime = 'codex'\n"
				}
				got, problems := typeAgent(t, bytes)
				assertNoAgent(t, got)
				assertProblems(t, problems, []documents.Problem{inHome(field, v.message)})
			})
		}
	}
}

func TestEveryFieldProblemIsReported(t *testing.T) {
	t.Parallel()
	got, problems := typeAgent(t, "schema = 'agister.agent/v1alpha1'\nname = 'a'\nmodel = 3\ncolour = 'red'\n")
	assertNoAgent(t, got)
	assertProblems(t, problems, []documents.Problem{
		missing("runtime"),
		inHome("model", "it is a string, not an integer"),
		inHome("colour", "the field is not known"),
	})
}

// A tree document is a map: a tree of any other kind is a problem of its
// own, and its fields are not looked for.
func TestATreeDocumentThatIsNoMapIsAProblem(t *testing.T) {
	t.Parallel()
	origin := tree.Origin{Path: "/home/.agister/agents/a.toml", Line: 2}
	cases := []struct {
		name string
		root tree.Node
		want string
	}{
		{"a list", tree.NewList([]tree.Node{tree.NewString("a", origin)}, origin), "it is a map, not a list"},
		{"a string", tree.NewString("a", origin), "it is a map, not a string"},
		{"an integer", tree.NewInteger(1, origin), "it is a map, not an integer"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			got, problems := documents.TypeAgent("a", c.root)
			assertNoAgent(t, got)
			assertProblems(t, problems, []documents.Problem{{Path: origin.Path, Line: origin.Line, Message: c.want}})
		})
	}
}

// Each field keeps the line of the node that gave it where the format
// gives one: the typer reads a tree, whatever format it came from. The
// agent's own format, TOML, gives none, and is proved through Agent.
func TestAnAgentsFieldKeepsTheLineItsFormatGives(t *testing.T) {
	t.Parallel()
	const yamlAgent = "/home/.agister/agents/a.yaml"
	root, decoded := tree.Decode(tree.YAML, []byte(`schema: agister.agent/v1alpha1
name: a
runtime: claude-code
model: opus
model_family: anthropic
effort: high
command: /usr/local/bin/claude
`), yamlAgent)
	if len(decoded) > 0 {
		t.Fatalf("the agent does not decode: %v", decoded)
	}
	got, problems := documents.TypeAgent("a", root)
	assertProblems(t, problems, nil)
	assertAgent(t, got, documents.AgentDefinition{
		Name:        "a",
		Runtime:     text("claude-code", yamlAgent, 3),
		Model:       text("opus", yamlAgent, 4),
		ModelFamily: text("anthropic", yamlAgent, 5),
		Effort:      text("high", yamlAgent, 6),
		Command:     text("/usr/local/bin/claude", yamlAgent, 7),
	})
}

func TestAnAgentNeedsOnlyItsRuntime(t *testing.T) {
	t.Parallel()
	got, problems := typeAgent(t, validAgent)
	assertProblems(t, problems, nil)
	assertAgent(t, got, documents.AgentDefinition{Name: "a", Runtime: text("codex", homeAgent, 0)})
}

func TestAnAgentWithNoRuntimeIsAProblem(t *testing.T) {
	t.Parallel()
	got, problems := typeAgent(t, "schema = 'agister.agent/v1alpha1'\nname = 'a'\nmodel = 'opus'\n")
	assertNoAgent(t, got)
	assertProblems(t, problems, []documents.Problem{missing("runtime")})
}
