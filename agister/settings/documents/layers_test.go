package documents_test

import (
	"fmt"
	"reflect"
	"slices"
	"testing"

	"github.com/igor1309/ai-labs/agister/settings/documents"
	"github.com/igor1309/ai-labs/gokit/tree"
)

func TestATreeDocumentIsDecodedInItsKindsFormat(t *testing.T) {
	t.Parallel()
	cases := []struct {
		kind   documents.Kind
		path   string
		format tree.Format
		bytes  string
	}{
		{documents.Agent, "/home/.agister/agents/a.toml", tree.TOML, "x = 1\n[y]\nz = 'w'\n"},
		{documents.Process, "/home/.agister/processes/a.yaml", tree.YAML, "x: 1\ny:\n  z: w\n"},
		{documents.Workflow, "/home/.agister/workflows/a.yaml", tree.YAML, "x: 1\ny:\n  z: w\n"},
		{documents.Runtime, "/home/.agister/runtimes/a.yaml", tree.YAML, "x: 1\ny:\n  z: w\n"},
		{documents.Brief, "/home/.agister/brief-forms/a.yaml", tree.YAML, "x: 1\ny:\n  z: w\n"},
	}
	for _, c := range cases {
		t.Run(string(c.kind), func(t *testing.T) {
			t.Parallel()
			d := documents.New(documents.Snapshot{Documents: map[documents.Kind]map[string]documents.Document{
				c.kind: {"a": {Sources: documents.Sources{Home: source(c.path, c.bytes)}}},
			}})
			got, problems := d.Tree(c.kind, "a")
			assertProblems(t, problems, nil)
			want, decoded := tree.Decode(c.format, []byte(c.bytes), c.path)
			if len(decoded) > 0 {
				t.Fatalf("the case's bytes do not decode in %s: %v", c.format, decoded)
			}
			if !reflect.DeepEqual(got, want) {
				t.Errorf("tree\n got %v\nwant %v", got, want)
			}
		})
	}
}

func TestTheNearerLayerWinsFieldByField(t *testing.T) {
	t.Parallel()
	d := documents.New(snapshotOf(map[string]documents.Document{"a": {Sources: documents.Sources{
		Home:       source(homeProcess, "{x: 1, y: 1, z: 1}"),
		Repository: source(repositoryProcess, "{y: 2, z: 2}"),
		Project:    source(projectProcess, "{z: 3}"),
	}}}))
	got, problems := d.Tree(documents.Process, "a")
	assertProblems(t, problems, nil)
	want := []string{
		"x 1 " + homeProcess,
		"y 2 " + repositoryProcess,
		"z 3 " + projectProcess,
	}
	if got := fields(t, got); !slices.Equal(got, want) {
		t.Errorf("fields\n got %q\nwant %q", got, want)
	}
}

// subtree is every node of n, depth first and map keys sorted, each as
// "<place> <value> <layer>:<line>": the root's place is ".", a value that
// is not a scalar is its kind, and a layer is named by its file's path in
// layers.
func subtree(n tree.Node, layers map[string]string) []string {
	var got []string
	var walk func(place string, n tree.Node)
	walk = func(place string, n tree.Node) {
		origin := n.Origin()
		got = append(got, fmt.Sprintf("%s %s %s:%d", place, scalar(n), layers[origin.Path], origin.Line))
		prefix := place + "."
		if place == "." {
			prefix = ""
		}
		for _, key := range n.Keys() {
			value, _ := n.Get(key)
			walk(prefix+key, value)
		}
		for i, item := range n.Items() {
			walk(fmt.Sprintf("%s[%d]", place, i), item)
		}
	}
	walk(".", n)
	return got
}

// Where a field is a map in one layer and a scalar or a list in another,
// the nearer layer's value replaces the farther's whole, and a map merges
// only with the map right under it: no farther layer's field comes back
// through a layer that replaced its map.
func TestAFieldThatChangesShapeAcrossThreeLayers(t *testing.T) {
	t.Parallel()
	layers := map[string]string{homeProcess: "home", repositoryProcess: "repository", projectProcess: "project"}
	cases := []struct {
		name                      string
		home, repository, project string
		want                      []string
	}{
		{"map, scalar, map", "{a: {x: 1}}", "{a: 0}", "{a: {y: 2}}", []string{
			". map project:1", "a map project:1", "a.y 2 project:1",
		}},
		{"scalar, map, scalar", "{a: 0}", "{a: {x: 1}}", "{a: 2}", []string{
			". map project:1", "a 2 project:1",
		}},
		{"map, list, map", "{a: {x: 1}}", "{a: [1]}", "{a: {y: 2}}", []string{
			". map project:1", "a map project:1", "a.y 2 project:1",
		}},
		{"list, map, list", "{a: [1, 2]}", "{a: {x: 1}}", "{a: [3]}", []string{
			". map project:1", "a list project:1", "a[0] 3 project:1",
		}},
		{"map, map, scalar", "{a: {x: 1}}", "{a: {y: 2}}", "{a: 0}", []string{
			". map project:1", "a 0 project:1",
		}},
		{"map, map, list", "{a: {x: 1}}", "{a: {y: 2}}", "{a: [3]}", []string{
			". map project:1", "a list project:1", "a[0] 3 project:1",
		}},
		{"scalar, map, map", "{a: 0}", "{a: {x: 1}}", "{a: {y: 2}}", []string{
			". map project:1", "a map project:1", "a.x 1 repository:1", "a.y 2 project:1",
		}},
		{"list, map, map", "{a: [1]}", "{a: {x: 1}}", "{a: {y: 2}}", []string{
			". map project:1", "a map project:1", "a.x 1 repository:1", "a.y 2 project:1",
		}},
		{"map, scalar, and a project silent on it", "{a: {x: 1}}", "{a: 0}", "{b: 1}", []string{
			". map project:1", "a 0 repository:1", "b 1 project:1",
		}},
		{"scalar, map, and a project silent on it", "{a: 0}", "{a: {x: 1}}", "{b: 1}", []string{
			". map project:1", "a map repository:1", "a.x 1 repository:1", "b 1 project:1",
		}},
		{"map, list, and a project silent on it", "{a: {x: 1}}", "{a: [1]}", "{b: 1}", []string{
			". map project:1", "a list repository:1", "a[0] 1 repository:1", "b 1 project:1",
		}},
		{"list, map, and a project silent on it", "{a: [1]}", "{a: {x: 1}}", "{b: 1}", []string{
			". map project:1", "a map repository:1", "a.x 1 repository:1", "b 1 project:1",
		}},
		{"a nested map, scalar, map, beside a field home alone holds", "{a: {b: {x: 1}, c: 1}}", "{a: {b: 0}}", "{a: {b: {y: 2}}}", []string{
			". map project:1", "a map project:1", "a.b map project:1", "a.b.y 2 project:1", "a.c 1 home:1",
		}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			d := documents.New(snapshotOf(map[string]documents.Document{"a": {Sources: documents.Sources{
				Home:       source(homeProcess, c.home),
				Repository: source(repositoryProcess, c.repository),
				Project:    source(projectProcess, c.project),
			}}}))
			got, problems := d.Tree(documents.Process, "a")
			assertProblems(t, problems, nil)
			if got := subtree(got, layers); !slices.Equal(got, c.want) {
				t.Errorf("tree\n got %q\nwant %q", got, c.want)
			}
		})
	}
}

func TestALayerThatDoesNotHoldTheDocumentIsPassedOver(t *testing.T) {
	t.Parallel()
	home := source(homeProcess, "{x: 1}")
	cases := []struct {
		name    string
		sources documents.Sources
	}{
		{"the repository is absent", documents.Sources{Home: home, Project: source(projectProcess, "{}")}},
		{"the project is absent", documents.Sources{Home: home, Repository: source(repositoryProcess, "{}")}},
		{"the repository's file has no bytes", documents.Sources{Home: home, Repository: source(repositoryProcess, "")}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			d := documents.New(snapshotOf(map[string]documents.Document{"a": {Sources: c.sources}}))
			got, problems := d.Tree(documents.Process, "a")
			assertProblems(t, problems, nil)
			if got := fields(t, got); !slices.Equal(got, []string{"x 1 " + homeProcess}) {
				t.Errorf("fields %q, want x 1 from home", got)
			}
		})
	}
}

// Whichever layers hold a tree document, home among them or not, its tree
// is theirs composed, and it has no problem.
func TestEveryCombinationOfLayersComposes(t *testing.T) {
	t.Parallel()
	layers := map[string]string{homeProcess: "home", repositoryProcess: "repository", projectProcess: "project"}
	home := source(homeProcess, "{h: 1, w: 1}")
	repository := source(repositoryProcess, "{r: 2, w: 2}")
	project := source(projectProcess, "{p: 3, w: 3}")
	cases := []struct {
		name    string
		sources documents.Sources
		want    []string
	}{
		{"home alone", documents.Sources{Home: home}, []string{
			". map home:1", "h 1 home:1", "w 1 home:1",
		}},
		{"repository alone", documents.Sources{Repository: repository}, []string{
			". map repository:1", "r 2 repository:1", "w 2 repository:1",
		}},
		{"project alone", documents.Sources{Project: project}, []string{
			". map project:1", "p 3 project:1", "w 3 project:1",
		}},
		{"home and repository", documents.Sources{Home: home, Repository: repository}, []string{
			". map repository:1", "h 1 home:1", "r 2 repository:1", "w 2 repository:1",
		}},
		{"home and project", documents.Sources{Home: home, Project: project}, []string{
			". map project:1", "h 1 home:1", "p 3 project:1", "w 3 project:1",
		}},
		{"repository and project", documents.Sources{Repository: repository, Project: project}, []string{
			". map project:1", "p 3 project:1", "r 2 repository:1", "w 3 project:1",
		}},
		{"every layer", documents.Sources{Home: home, Repository: repository, Project: project}, []string{
			". map project:1", "h 1 home:1", "p 3 project:1", "r 2 repository:1", "w 3 project:1",
		}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			d := documents.New(snapshotOf(map[string]documents.Document{"a": {Sources: c.sources}}))
			got, problems := d.Tree(documents.Process, "a")
			assertProblems(t, problems, nil)
			if got := subtree(got, layers); !slices.Equal(got, c.want) {
				t.Errorf("tree\n got %q\nwant %q", got, c.want)
			}
		})
	}
}

// An empty file holds the document: its tree is the empty tree, and no
// problem says no layer holds it.
func TestADocumentWhoseOnlyFileIsEmptyIsTheEmptyTree(t *testing.T) {
	t.Parallel()
	cases := []struct {
		kind documents.Kind
		path string
	}{
		{documents.Agent, "/home/.agister/agents/a.toml"},
		{documents.Process, homeProcess},
	}
	for _, c := range cases {
		t.Run(string(c.kind), func(t *testing.T) {
			t.Parallel()
			d := documents.New(documents.Snapshot{Documents: map[documents.Kind]map[string]documents.Document{
				c.kind: {"a": {Sources: documents.Sources{Home: source(c.path, "")}}},
			}})
			got, problems := d.Tree(c.kind, "a")
			assertProblems(t, problems, nil)
			if got.Kind() != tree.Empty {
				t.Errorf("a tree of kind %s, want the empty tree", got.Kind())
			}
		})
	}
}

func TestADocumentNoLayerHoldsIsAProblem(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name     string
		snapshot documents.Snapshot
	}{
		{"no document", documents.Snapshot{}},
		{"no process", documents.Snapshot{Documents: map[documents.Kind]map[string]documents.Document{
			documents.Agent: {"a": {Sources: documents.Sources{Home: source("/home/.agister/agents/a.toml", "x = 1")}}},
		}}},
		{"no process a", snapshotOf(map[string]documents.Document{"b": {Sources: documents.Sources{Home: source(homeProcess, "{x: 1}")}}})},
		{"a process a with no source", snapshotOf(map[string]documents.Document{"a": {}})},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			got, problems := documents.New(c.snapshot).Tree(documents.Process, "a")
			assertNoTree(t, got)
			assertProblems(t, problems, []documents.Problem{{Message: `no layer holds the process "a"`}})
		})
	}
}

func TestALayersFileThatDoesNotDecodeIsAProblemAndNoFallBack(t *testing.T) {
	t.Parallel()
	d := documents.New(snapshotOf(map[string]documents.Document{"a": {Sources: documents.Sources{
		Home:       source(homeProcess, "{x: 1}"),
		Repository: source(repositoryProcess, "x: [1"),
	}}}))
	got, problems := d.Tree(documents.Process, "a")
	assertNoTree(t, got)
	assertProblems(t, problems, decodeProblems(t, tree.YAML, "x: [1", repositoryProcess))
}

func TestEveryLayersDecodeProblemsAreTheDocuments(t *testing.T) {
	t.Parallel()
	d := documents.New(snapshotOf(map[string]documents.Document{"a": {Sources: documents.Sources{
		Home:       source(homeProcess, "x: [1"),
		Repository: source(repositoryProcess, "{x: 1}"),
		Project:    source(projectProcess, "y: [1"),
	}}}))
	got, problems := d.Tree(documents.Process, "a")
	assertNoTree(t, got)
	want := append(decodeProblems(t, tree.YAML, "x: [1", homeProcess), decodeProblems(t, tree.YAML, "y: [1", projectProcess)...)
	assertProblems(t, problems, want)
}

// A value that is no value of a tree is a problem with the path of its
// file, its line there where the format gives one (TOML gives none), and
// its place in the document's tree; every such value is one.
func TestADecodeProblemKeepsItsLineAndPlace(t *testing.T) {
	t.Parallel()
	const agent = "/repo/.agister/agents/a.toml"
	process := func(line int, place, message string) documents.Problem {
		return documents.Problem{Path: repositoryProcess, Line: line, Place: place, Message: message}
	}
	date := "a date is no value of a tree"
	cases := []struct {
		name  string
		kind  documents.Kind
		path  string
		bytes string
		want  []documents.Problem
	}{
		{"a key with no value", documents.Process, repositoryProcess, "a: {b: }", []documents.Problem{
			process(1, "a.b", "the key has no value"),
		}},
		{"a key given twice", documents.Process, repositoryProcess, "a: 1\na: 2", []documents.Problem{
			process(2, "a", "the key is given more than once"),
		}},
		{"two keys with no value", documents.Process, repositoryProcess, "a:\nb:\n", []documents.Problem{
			process(1, "a", "the key has no value"),
			process(2, "b", "the key has no value"),
		}},
		{"bad values at every depth, between good ones", documents.Process, repositoryProcess, "a:\n  b:\n  c: [1, ~, 2026-10-14]\nd: x\ne: ~\n", []documents.Problem{
			process(2, "a.b", "the key has no value"),
			process(3, "a.c[1]", "the item has no value"),
			process(3, "a.c[2]", date),
			process(5, "e", "the key has no value"),
		}},
		{"TOML dates", documents.Agent, agent, "z = 2026-10-14\n[a]\nx = 2026-10-14\n", []documents.Problem{
			{Path: agent, Place: "a.x", Message: date},
			{Path: agent, Place: "z", Message: date},
		}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			d := documents.New(documents.Snapshot{Documents: map[documents.Kind]map[string]documents.Document{
				c.kind: {"a": {Sources: documents.Sources{Repository: source(c.path, c.bytes)}}},
			}})
			got, problems := d.Tree(c.kind, "a")
			assertNoTree(t, got)
			assertProblems(t, problems, c.want)
		})
	}
}

func TestTheProblemsOfADocumentsFilesAreItsProblems(t *testing.T) {
	t.Parallel()
	denied := documents.Problem{Path: repositoryProcess, Message: "permission denied"}
	cases := []struct {
		name string
		home *documents.Source
		want []documents.Problem
	}{
		{"beside a source that decodes", source(homeProcess, "{x: 1}"), []documents.Problem{denied}},
		{"with no source", nil, []documents.Problem{denied}},
		{"beside a source that does not decode", source(homeProcess, "x: [1"),
			append([]documents.Problem{denied}, decodeProblems(t, tree.YAML, "x: [1", homeProcess)...)},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			d := documents.New(snapshotOf(map[string]documents.Document{"a": {
				Sources:  documents.Sources{Home: c.home},
				Problems: []documents.Problem{denied},
			}}))
			got, problems := d.Tree(documents.Process, "a")
			assertNoTree(t, got)
			assertProblems(t, problems, c.want)
			if problems[0].String() != repositoryProcess+": permission denied" {
				t.Errorf("the problem reads %q", problems[0].String())
			}
		})
	}
}

func TestOneDocumentsProblemsAreNoOthers(t *testing.T) {
	t.Parallel()
	d := documents.New(snapshotOf(map[string]documents.Document{
		"a": {
			Sources:  documents.Sources{Home: source(homeProcess, "x: [1")},
			Problems: []documents.Problem{{Path: repositoryProcess, Message: "permission denied"}},
		},
		"b": {Sources: documents.Sources{Home: source("/home/.agister/processes/b.yaml", "{x: 1}")}},
	}))
	got, problems := d.Tree(documents.Process, "b")
	assertProblems(t, problems, nil)
	if got := fields(t, got); !slices.Equal(got, []string{"x 1 /home/.agister/processes/b.yaml"}) {
		t.Errorf("fields %q, want x 1 from b's home file", got)
	}
}

func TestAKindThatIsNoTreeIsAProblem(t *testing.T) {
	t.Parallel()
	cases := []struct {
		kind documents.Kind
		want string
	}{
		{documents.Schema, "a schema is a blob, not a tree"},
		{documents.Prompt, "a prompt is a blob, not a tree"},
		{"skill", `the kind "skill" is not known`},
		{"verify", `the kind "verify" is not known`},
	}
	for _, c := range cases {
		t.Run(string(c.kind), func(t *testing.T) {
			t.Parallel()
			d := documents.New(documents.Snapshot{Documents: map[documents.Kind]map[string]documents.Document{
				c.kind: {"a": {Sources: documents.Sources{Home: source("/home/.agister/a", "{x: 1}")}}},
			}})
			got, problems := d.Tree(c.kind, "a")
			assertNoTree(t, got)
			assertProblems(t, problems, []documents.Problem{{Message: c.want}})
		})
	}
}
