package documents_test

import (
	"slices"
	"testing"

	"github.com/igor1309/ai-labs/agister/settings/documents"
	"github.com/igor1309/ai-labs/gokit/tree"
)

// processFile is the path of the process name's file in the layer whose
// folder is under root.
func processFile(root, name string) string {
	return root + "/.agister/processes/" + name + ".yaml"
}

// homeFiles are the processes given, each by its name and the bytes of its
// home file.
func homeFiles(homes map[string]string) map[string]documents.Document {
	named := map[string]documents.Document{}
	for name, bytes := range homes {
		named[name] = documents.Document{Sources: documents.Sources{Home: source(processFile("/home", name), bytes)}}
	}
	return named
}

// processes is a documents of the processes given, each by its name and
// the bytes of its home file.
func processes(homes map[string]string) *documents.Documents {
	return documents.New(snapshotOf(homeFiles(homes)))
}

// extendsAt is a problem at an extends field, given at line of the file at
// path.
func extendsAt(path string, line int, message string) documents.Problem {
	return documents.Problem{Path: path, Line: line, Place: "extends", Message: message}
}

// atExtends is a problem at the extends of the process name's home file,
// on its first line.
func atExtends(name, message string) documents.Problem {
	return extendsAt(processFile("/home", name), 1, message)
}

// Each field of the extending document is over its base's: maps merge by
// key, and anything else replaces the base's whole.
func TestAnExtendingDocumentIsItsBasesTreeWithItsOwnOverIt(t *testing.T) {
	t.Parallel()
	layers := map[string]string{processFile("/home", "a"): "a", processFile("/home", "base"): "base"}
	cases := []struct {
		name    string
		base, a string
		want    []string
	}{
		{"a field over the base's, a field the base alone holds", "{x: 1, y: 1}", "{extends: base, y: 2}", []string{
			". map a:1", "extends base a:1", "x 1 base:1", "y 2 a:1",
		}},
		{"nothing but extends", "{x: 1, y: 1}", "{extends: base}", []string{
			". map a:1", "extends base a:1", "x 1 base:1", "y 1 base:1",
		}},
		{"a map over a map, a list over a list", "{m: {x: 1, y: 1}, l: [1, 2]}", "{extends: base, m: {y: 2}, l: [3]}", []string{
			". map a:1", "extends base a:1", "l list a:1", "l[0] 3 a:1", "m map a:1", "m.x 1 base:1", "m.y 2 a:1",
		}},
		{"a scalar over a map", "{m: {x: 1}}", "{extends: base, m: 0}", []string{
			". map a:1", "extends base a:1", "m 0 a:1",
		}},
		{"a map over a scalar", "{m: 0}", "{extends: base, m: {y: 2}}", []string{
			". map a:1", "extends base a:1", "m map a:1", "m.y 2 a:1",
		}},
		{"an empty base", "", "{extends: base, x: 1}", []string{
			". map a:1", "extends base a:1", "x 1 a:1",
		}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			got, problems := processes(map[string]string{"base": c.base, "a": c.a}).Tree(documents.Process, "a")
			assertProblems(t, problems, nil)
			if got := subtree(got, layers); !slices.Equal(got, c.want) {
				t.Errorf("tree\n got %q\nwant %q", got, c.want)
			}
		})
	}
}

// The base's layers are merged first, and the extending document's merged
// layers, every one of them, are over the base's nearest. The extending
// document's layers merge among themselves before they are over the base:
// a field whose shape changes across them is the merged one over the
// base's, so a map that a nearer layer gives after a farther one replaced
// the field still merges with the base's map, and no field of a layer
// whose map was replaced comes back.
func TestTheBaseIsComposedFromItsLayersFirst(t *testing.T) {
	t.Parallel()
	layers := map[string]string{
		processFile("/home", "a"): "a home", processFile("/repo", "a"): "a repository", processFile("/repo/p", "a"): "a project",
		processFile("/home", "base"): "base home", processFile("/repo", "base"): "base repository", processFile("/repo/p", "base"): "base project",
	}
	baseHome := func(bytes string) documents.Sources {
		return documents.Sources{Home: source(processFile("/home", "base"), bytes)}
	}
	// a is the extending document's sources, a layer given "" holding none.
	a := func(home, repository, project string) documents.Sources {
		slot := func(root, bytes string) *documents.Source {
			if bytes == "" {
				return nil
			}
			return source(processFile(root, "a"), bytes)
		}
		return documents.Sources{Home: slot("/home", home), Repository: slot("/repo", repository), Project: slot("/repo/p", project)}
	}
	cases := []struct {
		name    string
		base, a documents.Sources
		want    []string
	}{
		{"the base's repository over its home", documents.Sources{
			Home:       source(processFile("/home", "base"), "{x: 1}"),
			Repository: source(processFile("/repo", "base"), "{x: 2}"),
		}, documents.Sources{Home: source(processFile("/home", "a"), "{extends: base}")}, []string{
			". map a home:1", "extends base a home:1", "x 2 base repository:1",
		}},
		{"the extending document's home over the base's project", documents.Sources{
			Home:    source(processFile("/home", "base"), "{x: 1, y: 1, z: 1}"),
			Project: source(processFile("/repo/p", "base"), "{x: 3, y: 3}"),
		}, documents.Sources{
			Home:    source(processFile("/home", "a"), "{extends: base, x: 4}"),
			Project: source(processFile("/repo/p", "a"), "{z: 5}"),
		}, []string{
			". map a project:1", "extends base a home:1", "x 4 a home:1", "y 3 base project:1", "z 5 a project:1",
		}},
		{"a map; a scalar, then a map", baseHome("{m: {x: 1}}"), a("{extends: base, m: 0}", "", "{m: {y: 2}}"), []string{
			". map a project:1", "extends base a home:1", "m map a project:1", "m.x 1 base home:1", "m.y 2 a project:1",
		}},
		{"a map; a list, then a map", baseHome("{m: {x: 1}}"), a("{extends: base, m: [1]}", "", "{m: {y: 2}}"), []string{
			". map a project:1", "extends base a home:1", "m map a project:1", "m.x 1 base home:1", "m.y 2 a project:1",
		}},
		{"a map; a map, a scalar, then a map", baseHome("{m: {x: 1}}"), a("{extends: base, m: {y: 2}}", "{m: 0}", "{m: {z: 3}}"), []string{
			". map a project:1", "extends base a home:1", "m map a project:1", "m.x 1 base home:1", "m.z 3 a project:1",
		}},
		{"a map; a map, a list, then a map", baseHome("{m: {x: 1}}"), a("{extends: base, m: {y: 2}}", "{m: [1]}", "{m: {z: 3}}"), []string{
			". map a project:1", "extends base a home:1", "m map a project:1", "m.x 1 base home:1", "m.z 3 a project:1",
		}},
		{"a map; a map, then a scalar", baseHome("{m: {x: 1}}"), a("{extends: base, m: {y: 2}}", "", "{m: 0}"), []string{
			". map a project:1", "extends base a home:1", "m 0 a project:1",
		}},
		{"a map; a map, then a list", baseHome("{m: {x: 1}}"), a("{extends: base, m: {y: 2}}", "", "{m: [3]}"), []string{
			". map a project:1", "extends base a home:1", "m list a project:1", "m[0] 3 a project:1",
		}},
		{"a scalar; a map, then a map", baseHome("{m: 0}"), a("{extends: base, m: {x: 1}}", "", "{m: {y: 2}}"), []string{
			". map a project:1", "extends base a home:1", "m map a project:1", "m.x 1 a home:1", "m.y 2 a project:1",
		}},
		{"a list; a scalar, then a map", baseHome("{m: [1]}"), a("{extends: base, m: 0}", "", "{m: {y: 2}}"), []string{
			". map a project:1", "extends base a home:1", "m map a project:1", "m.y 2 a project:1",
		}},
		{"a map; a list, then a project silent on it", baseHome("{m: {x: 1}}"), a("{extends: base, m: {y: 2}}", "{m: [1]}", "{z: 1}"), []string{
			". map a project:1", "extends base a home:1", "m list a repository:1", "m[0] 1 a repository:1", "z 1 a project:1",
		}},
		{"a nested map; a scalar, then a map, beside a field the base alone holds", baseHome("{m: {n: {x: 1}, k: 1}}"), a("{extends: base, m: {n: 0}}", "", "{m: {n: {y: 2}}}"), []string{
			". map a project:1", "extends base a home:1", "m map a project:1", "m.k 1 base home:1", "m.n map a project:1", "m.n.x 1 base home:1", "m.n.y 2 a project:1",
		}},
		{"a field that changes shape across the base's layers and the extending document's", documents.Sources{
			Home:       source(processFile("/home", "base"), "{m: {x: 1}}"),
			Repository: source(processFile("/repo", "base"), "{m: 0}"),
			Project:    source(processFile("/repo/p", "base"), "{m: {z: 1}}"),
		}, a("{extends: base, m: 0}", "", "{m: {y: 2}}"), []string{
			". map a project:1", "extends base a home:1", "m map a project:1", "m.y 2 a project:1", "m.z 1 base project:1",
		}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			d := documents.New(snapshotOf(map[string]documents.Document{"base": {Sources: c.base}, "a": {Sources: c.a}}))
			got, problems := d.Tree(documents.Process, "a")
			assertProblems(t, problems, nil)
			if got := subtree(got, layers); !slices.Equal(got, c.want) {
				t.Errorf("tree\n got %q\nwant %q", got, c.want)
			}
		})
	}
}

// The base is the one the extending document's merged layers name: the
// nearest layer that names one.
func TestExtendsIsReadAfterTheExtendingDocumentsLayersMerge(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name    string
		sources documents.Sources
		want    []string
	}{
		{"the project's over the home's", documents.Sources{
			Home:    source(processFile("/home", "a"), "{extends: b}"),
			Project: source(processFile("/repo/p", "a"), "{extends: c}"),
		}, []string{"extends c " + processFile("/repo/p", "a"), "x c " + processFile("/home", "c")}},
		{"the home's, under a repository silent on it", documents.Sources{
			Home:       source(processFile("/home", "a"), "{extends: b}"),
			Repository: source(processFile("/repo", "a"), "{y: 1}"),
		}, []string{"extends b " + processFile("/home", "a"), "x b " + processFile("/home", "b"), "y 1 " + processFile("/repo", "a")}},
		{"the repository's, over a home silent on it", documents.Sources{
			Home:       source(processFile("/home", "a"), "{y: 1}"),
			Repository: source(processFile("/repo", "a"), "{extends: c}"),
		}, []string{"extends c " + processFile("/repo", "a"), "x c " + processFile("/home", "c"), "y 1 " + processFile("/home", "a")}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			d := documents.New(snapshotOf(map[string]documents.Document{
				"a": {Sources: c.sources},
				"b": {Sources: documents.Sources{Home: source(processFile("/home", "b"), "{x: b}")}},
				"c": {Sources: documents.Sources{Home: source(processFile("/home", "c"), "{x: c}")}},
			}))
			got, problems := d.Tree(documents.Process, "a")
			assertProblems(t, problems, nil)
			if got := fields(t, got); !slices.Equal(got, c.want) {
				t.Errorf("fields\n got %q\nwant %q", got, c.want)
			}
		})
	}
}

func TestABaseMayExtendABase(t *testing.T) {
	t.Parallel()
	d := processes(map[string]string{
		"c": "{x: 1, y: 1, z: 1}",
		"b": "{extends: c, y: 2, z: 2}",
		"a": "{extends: b, z: 3}",
	})
	cases := []struct {
		name string
		want []string
	}{
		{"a", []string{
			"extends b " + processFile("/home", "a"),
			"x 1 " + processFile("/home", "c"),
			"y 2 " + processFile("/home", "b"),
			"z 3 " + processFile("/home", "a"),
		}},
		{"b", []string{
			"extends c " + processFile("/home", "b"),
			"x 1 " + processFile("/home", "c"),
			"y 2 " + processFile("/home", "b"),
			"z 2 " + processFile("/home", "b"),
		}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			got, problems := d.Tree(documents.Process, c.name)
			assertProblems(t, problems, nil)
			if got := fields(t, got); !slices.Equal(got, c.want) {
				t.Errorf("fields\n got %q\nwant %q", got, c.want)
			}
		})
	}
}

// A base is looked up among the documents of the extending document's
// kind alone; one with neither a file nor a problem is held by no layer.
// The problem is at the extends field: the file and line the merged layers
// took it from, not the document's root.
func TestABaseOfAnotherKindIsNotReached(t *testing.T) {
	t.Parallel()
	const agent = "/home/.agister/agents/a.toml"
	agentBase := map[string]documents.Document{"base": {Sources: documents.Sources{Home: source("/home/.agister/agents/base.toml", "x = 1")}}}
	cases := []struct {
		name     string
		kind     documents.Kind
		snapshot map[documents.Kind]map[string]documents.Document
		want     documents.Problem
	}{
		{"a process extending an agent", documents.Process, map[documents.Kind]map[string]documents.Document{
			documents.Agent:   {"base": {Sources: documents.Sources{Home: source("/home/.agister/agents/base.toml", "x = 1")}}},
			documents.Process: {"a": {Sources: documents.Sources{Home: source(processFile("/home", "a"), "{extends: base}")}}},
		}, atExtends("a", `no layer holds the process "base"`)},
		{"an agent extending a process", documents.Agent, map[documents.Kind]map[string]documents.Document{
			documents.Process: {"base": {Sources: documents.Sources{Home: source(processFile("/home", "base"), "{x: 1}")}}},
			documents.Agent:   {"a": {Sources: documents.Sources{Home: source(agent, "extends = 'base'")}}},
		}, documents.Problem{Path: agent, Place: "extends", Message: `no layer holds the agent "base"`}},
		{"a process extending a process with no source", documents.Process, map[documents.Kind]map[string]documents.Document{
			documents.Process: {
				"base": {},
				"a":    {Sources: documents.Sources{Home: source(processFile("/home", "a"), "{extends: base}")}},
			},
		}, atExtends("a", `no layer holds the process "base"`)},
		{"a process extending an agent, its extends on a later line", documents.Process, map[documents.Kind]map[string]documents.Document{
			documents.Agent:   agentBase,
			documents.Process: {"a": {Sources: documents.Sources{Home: source(processFile("/home", "a"), "x: 1\ny: 2\nextends: base\n")}}},
		}, extendsAt(processFile("/home", "a"), 3, `no layer holds the process "base"`)},
		{"a process extending a process with no source, its extends from the repository under a project", documents.Process, map[documents.Kind]map[string]documents.Document{
			documents.Process: {
				"base": {},
				"a": {Sources: documents.Sources{
					Repository: source(processFile("/repo", "a"), "y: 1\nextends: base\n"),
					Project:    source(processFile("/repo/p", "a"), "{x: 1}"),
				}},
			},
		}, extendsAt(processFile("/repo", "a"), 2, `no layer holds the process "base"`)},
		{"an agent extending a process, its extends from home under a project", documents.Agent, map[documents.Kind]map[string]documents.Document{
			documents.Process: {"base": {Sources: documents.Sources{Home: source(processFile("/home", "base"), "{x: 1}")}}},
			documents.Agent: {"a": {Sources: documents.Sources{
				Home:    source(agent, "x = 1\nextends = 'base'\n"),
				Project: source("/repo/p/.agister/agents/a.toml", "y = 2\n"),
			}}},
		}, documents.Problem{Path: agent, Place: "extends", Message: `no layer holds the agent "base"`}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			got, problems := documents.New(documents.Snapshot{Documents: c.snapshot}).Tree(c.kind, "a")
			assertNoTree(t, got)
			assertProblems(t, problems, []documents.Problem{c.want})
		})
	}
}

// Each problem of the base, its own base's among them, is a problem of the
// extending document at its extends, naming the base, in the base's order:
// its file problems, then each layer's decode problems, the farthest
// layer's first. Through another base each is that base's problem in turn.
// Each is at the extends field: the file and line the merged layers took
// it from, not the document's root.
func TestABaseWithAProblemIsAProblemOfTheExtendingDocument(t *testing.T) {
	t.Parallel()
	var decoded []string
	for _, p := range decodeProblems(t, tree.YAML, "x: [1", processFile("/home", "base")) {
		decoded = append(decoded, p.String())
	}
	process := func(root, name, bytes string) *documents.Source { return source(processFile(root, name), bytes) }
	denied := documents.Problem{Path: processFile("/repo", "base"), Message: "permission denied"}
	// bases are the base's documents, each with its problems as they read.
	bases := []struct {
		name     string
		base     documents.Document
		problems []string
	}{
		{"bytes that do not decode", documents.Document{Sources: documents.Sources{
			Home: process("/home", "base", "x: [1"),
		}}, decoded},
		{"several decode problems in one file", documents.Document{Sources: documents.Sources{
			Home: process("/home", "base", "x:\ny:\n"),
		}}, []string{
			"/home/.agister/processes/base.yaml:1: x: the key has no value",
			"/home/.agister/processes/base.yaml:2: y: the key has no value",
		}},
		{"decode problems in several layers", documents.Document{Sources: documents.Sources{
			Home:       process("/home", "base", "x:\n"),
			Repository: process("/repo", "base", "{w: 1}"),
			Project:    process("/repo/p", "base", "z: [1, ~]\n"),
		}}, []string{
			"/home/.agister/processes/base.yaml:1: x: the key has no value",
			"/repo/p/.agister/processes/base.yaml:1: z[1]: the item has no value",
		}},
		{"a file problem", documents.Document{
			Sources:  documents.Sources{Home: process("/home", "base", "{x: 1}")},
			Problems: []documents.Problem{denied},
		}, []string{
			"/repo/.agister/processes/base.yaml: permission denied",
		}},
		{"several file problems", documents.Document{
			Sources: documents.Sources{Home: process("/home", "base", "{x: 1}")},
			Problems: []documents.Problem{
				denied,
				{Path: processFile("/repo/p", "base"), Line: 4, Place: "x.y[0]", Message: "too large"},
			},
		}, []string{
			"/repo/.agister/processes/base.yaml: permission denied",
			"/repo/p/.agister/processes/base.yaml:4: x.y[0]: too large",
		}},
		{"file and decode problems", documents.Document{
			Sources: documents.Sources{
				Home:    process("/home", "base", "x:\ny: [1, ~]\n"),
				Project: process("/repo/p", "base", "z:\n"),
			},
			Problems: []documents.Problem{denied},
		}, []string{
			"/repo/.agister/processes/base.yaml: permission denied",
			"/home/.agister/processes/base.yaml:1: x: the key has no value",
			"/home/.agister/processes/base.yaml:2: y[1]: the item has no value",
			"/repo/p/.agister/processes/base.yaml:1: z: the key has no value",
		}},
		{"a base no layer holds", documents.Document{Sources: documents.Sources{
			Home: process("/home", "base", "{extends: c}"),
		}}, []string{
			`/home/.agister/processes/base.yaml:1: extends: no layer holds the process "c"`,
		}},
	}
	// extending are the documents that extend the base, "a" among them, and
	// the problem a's is for each of the base's.
	extending := []struct {
		name      string
		documents map[string]documents.Document
		want      func(problem string) documents.Problem
	}{
		{"directly", homeFiles(map[string]string{"a": "{extends: base}"}), func(p string) documents.Problem {
			return atExtends("a", `the process "base": `+p)
		}},
		{"directly, its extends on a later line", homeFiles(map[string]string{"a": "x: 1\nextends: base\n"}), func(p string) documents.Problem {
			return extendsAt(processFile("/home", "a"), 2, `the process "base": `+p)
		}},
		{"directly, its extends from the repository under a project", map[string]documents.Document{"a": {Sources: documents.Sources{
			Repository: process("/repo", "a", "y: 1\nextends: base\n"),
			Project:    process("/repo/p", "a", "{x: 1}"),
		}}}, func(p string) documents.Problem {
			return extendsAt(processFile("/repo", "a"), 2, `the process "base": `+p)
		}},
		{"through another base", homeFiles(map[string]string{"a": "{extends: b}", "b": "{extends: base}"}), func(p string) documents.Problem {
			return atExtends("a", `the process "b": /home/.agister/processes/b.yaml:1: extends: the process "base": `+p)
		}},
		{"through another base, whose extends is on a later line of its repository under a project", map[string]documents.Document{
			"a": {Sources: documents.Sources{Home: process("/home", "a", "x: 1\nextends: b\n")}},
			"b": {Sources: documents.Sources{
				Repository: process("/repo", "b", "y: 1\nextends: base\n"),
				Project:    process("/repo/p", "b", "{z: 1}"),
			}},
		}, func(p string) documents.Problem {
			return extendsAt(processFile("/home", "a"), 2, `the process "b": /repo/.agister/processes/b.yaml:2: extends: the process "base": `+p)
		}},
	}
	for _, b := range bases {
		for _, e := range extending {
			t.Run(b.name+" "+e.name, func(t *testing.T) {
				t.Parallel()
				named := map[string]documents.Document{"base": b.base}
				for name, document := range e.documents {
					named[name] = document
				}
				got, problems := documents.New(snapshotOf(named)).Tree(documents.Process, "a")
				assertNoTree(t, got)
				var want []documents.Problem
				for _, p := range b.problems {
					want = append(want, e.want(p))
				}
				assertProblems(t, problems, want)
			})
		}
	}
}

// Each document of a cycle has the cycle read from itself as its problem;
// a document that extends one of a cycle has that one's problem as its
// base's. Each is at the document's extends field: the file and line the
// merged layers took it from, not the document's root.
func TestExtendsThatComesBackToTheDocumentIsAProblem(t *testing.T) {
	t.Parallel()
	// layered is the process name held by a repository file of bytes under
	// a project file that is silent on extends.
	layered := func(name, bytes string) documents.Document {
		return documents.Document{Sources: documents.Sources{
			Repository: source(processFile("/repo", name), bytes),
			Project:    source(processFile("/repo/p", name), "{z: 1}"),
		}}
	}
	cases := []struct {
		name      string
		documents map[string]documents.Document
		want      map[string]documents.Problem
	}{
		{"a document extending itself", homeFiles(map[string]string{"a": "{extends: a}"}), map[string]documents.Problem{
			"a": atExtends("a", `"a" extends "a"`),
		}},
		{"two", homeFiles(map[string]string{"a": "{extends: b}", "b": "{extends: a}"}), map[string]documents.Problem{
			"a": atExtends("a", `"a" extends "b" extends "a"`),
			"b": atExtends("b", `"b" extends "a" extends "b"`),
		}},
		{"three", homeFiles(map[string]string{"a": "{extends: b}", "b": "{extends: c}", "c": "{extends: a}"}), map[string]documents.Problem{
			"a": atExtends("a", `"a" extends "b" extends "c" extends "a"`),
			"b": atExtends("b", `"b" extends "c" extends "a" extends "b"`),
			"c": atExtends("c", `"c" extends "a" extends "b" extends "c"`),
		}},
		{"documents leading into a cycle", homeFiles(map[string]string{"e": "{extends: d}", "d": "{extends: a}", "a": "{extends: b}", "b": "{extends: a}"}), map[string]documents.Problem{
			"a": atExtends("a", `"a" extends "b" extends "a"`),
			"b": atExtends("b", `"b" extends "a" extends "b"`),
			"d": atExtends("d", `the process "a": /home/.agister/processes/a.yaml:1: extends: "a" extends "b" extends "a"`),
			"e": atExtends("e", `the process "d": /home/.agister/processes/d.yaml:1: extends: the process "a": /home/.agister/processes/a.yaml:1: extends: "a" extends "b" extends "a"`),
		}},
		{"a document extending itself, its extends on a later line", homeFiles(map[string]string{"a": "x: 1\ny: 2\nextends: a\n"}), map[string]documents.Problem{
			"a": extendsAt(processFile("/home", "a"), 3, `"a" extends "a"`),
		}},
		{"a document extending itself, its extends from the repository under a project", map[string]documents.Document{
			"a": layered("a", "y: 1\nextends: a\n"),
		}, map[string]documents.Problem{
			"a": extendsAt(processFile("/repo", "a"), 2, `"a" extends "a"`),
		}},
		{"two, one's extends on a later line, the other's from the repository under a project", map[string]documents.Document{
			"a": {Sources: documents.Sources{Home: source(processFile("/home", "a"), "x: 1\nextends: b\n")}},
			"b": layered("b", "y: 1\ny2: 2\nextends: a\n"),
		}, map[string]documents.Problem{
			"a": extendsAt(processFile("/home", "a"), 2, `"a" extends "b" extends "a"`),
			"b": extendsAt(processFile("/repo", "b"), 3, `"b" extends "a" extends "b"`),
		}},
		{"documents leading into a cycle, extends on later lines and from farther layers", map[string]documents.Document{
			"e": {Sources: documents.Sources{Home: source(processFile("/home", "e"), "x: 1\nextends: d\n")}},
			"d": layered("d", "y: 1\nextends: a\n"),
			"a": layered("a", "y: 1\ny2: 2\nextends: b\n"),
			"b": {Sources: documents.Sources{Home: source(processFile("/home", "b"), "x: 1\ny: 2\ny3: 3\nextends: a\n")}},
		}, map[string]documents.Problem{
			"a": extendsAt(processFile("/repo", "a"), 3, `"a" extends "b" extends "a"`),
			"b": extendsAt(processFile("/home", "b"), 4, `"b" extends "a" extends "b"`),
			"d": extendsAt(processFile("/repo", "d"), 2, `the process "a": /repo/.agister/processes/a.yaml:3: extends: "a" extends "b" extends "a"`),
			"e": extendsAt(processFile("/home", "e"), 2, `the process "d": /repo/.agister/processes/d.yaml:2: extends: the process "a": /repo/.agister/processes/a.yaml:3: extends: "a" extends "b" extends "a"`),
		}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			d := documents.New(snapshotOf(c.documents))
			for name, want := range c.want {
				got, problems := d.Tree(documents.Process, name)
				assertNoTree(t, got)
				assertProblems(t, problems, []documents.Problem{want})
			}
		})
	}
}

func TestExtendsThatIsNoStringIsAProblem(t *testing.T) {
	t.Parallel()
	const agent = "/home/.agister/agents/a.toml"
	process := func(bytes string) documents.Document {
		return documents.Document{Sources: documents.Sources{Home: source(processFile("/home", "a"), bytes)}}
	}
	notAProcess := atExtends("a", "it is the name of a process")
	cases := []struct {
		name     string
		kind     documents.Kind
		document documents.Document
		want     documents.Problem
	}{
		{"a list", documents.Process, process("{extends: [b]}"), notAProcess},
		{"a map", documents.Process, process("{extends: {b: 1}}"), notAProcess},
		{"an integer", documents.Process, process("{extends: 1}"), notAProcess},
		{"a boolean", documents.Process, process("{extends: true}"), notAProcess},
		{"an agent's list", documents.Agent, documents.Document{Sources: documents.Sources{Home: source(agent, "extends = ['b']")}},
			documents.Problem{Path: agent, Place: "extends", Message: "it is the name of an agent"}},
		{"a list on a later line", documents.Process, process("x: 1\ny: 2\nextends: [b]\n"),
			extendsAt(processFile("/home", "a"), 3, "it is the name of a process")},
		{"an integer from the repository under a project", documents.Process, documents.Document{Sources: documents.Sources{
			Repository: source(processFile("/repo", "a"), "y: 1\nextends: 1\n"),
			Project:    source(processFile("/repo/p", "a"), "{x: 1}"),
		}}, extendsAt(processFile("/repo", "a"), 2, "it is the name of a process")},
		{"an agent's list from home under a project", documents.Agent, documents.Document{Sources: documents.Sources{
			Home:    source(agent, "x = 1\nextends = ['b']\n"),
			Project: source("/repo/p/.agister/agents/a.toml", "y = 2\n"),
		}}, documents.Problem{Path: agent, Place: "extends", Message: "it is the name of an agent"}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			b := map[documents.Kind]string{documents.Process: processFile("/home", "b"), documents.Agent: "/home/.agister/agents/b.toml"}[c.kind]
			d := documents.New(documents.Snapshot{Documents: map[documents.Kind]map[string]documents.Document{c.kind: {
				"a": c.document,
				"b": {Sources: documents.Sources{Home: source(b, "")}},
			}}})
			got, problems := d.Tree(c.kind, "a")
			assertNoTree(t, got)
			assertProblems(t, problems, []documents.Problem{c.want})
		})
	}
}

// extends.feature, "Extends names the base, with its kind or without":
// either form looks up the same base, of the extending document's kind,
// and the tree keeps extends as its file gives it.
func TestExtendsNamesTheBaseWithItsKindOrWithout(t *testing.T) {
	t.Parallel()
	const (
		agent  = "/home/.agister/agents/a.toml"
		review = "/home/.agister/agents/review.toml"
	)
	cases := []struct {
		name     string
		kind     documents.Kind
		snapshot map[documents.Kind]map[string]documents.Document
		want     []string
	}{
		{"a process, bare", documents.Process, map[documents.Kind]map[string]documents.Document{
			documents.Process: homeFiles(map[string]string{"review": "{x: 1}", "a": "{extends: review}"}),
		}, []string{"extends review " + processFile("/home", "a"), "x 1 " + processFile("/home", "review")}},
		{"a process, with its kind", documents.Process, map[documents.Kind]map[string]documents.Document{
			documents.Process: homeFiles(map[string]string{"review": "{x: 1}", "a": "{extends: process:review}"}),
		}, []string{"extends process:review " + processFile("/home", "a"), "x 1 " + processFile("/home", "review")}},
		{"a process, with its kind, quoted", documents.Process, map[documents.Kind]map[string]documents.Document{
			documents.Process: homeFiles(map[string]string{"review": "{x: 1}", "a": "{extends: 'process:review'}"}),
		}, []string{"extends process:review " + processFile("/home", "a"), "x 1 " + processFile("/home", "review")}},
		{"an agent, with its kind", documents.Agent, map[documents.Kind]map[string]documents.Document{
			documents.Agent: {
				"review": {Sources: documents.Sources{Home: source(review, "x = 1")}},
				"a":      {Sources: documents.Sources{Home: source(agent, "extends = 'agent:review'")}},
			},
		}, []string{"extends agent:review " + agent, "x 1 " + review}},
		{"a process, with its kind, through a base named bare", documents.Process, map[documents.Kind]map[string]documents.Document{
			documents.Process: homeFiles(map[string]string{"c": "{x: 1}", "review": "{extends: c}", "a": "{extends: process:review}"}),
		}, []string{"extends process:review " + processFile("/home", "a"), "x 1 " + processFile("/home", "c")}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			got, problems := documents.New(documents.Snapshot{Documents: c.snapshot}).Tree(c.kind, "a")
			assertProblems(t, problems, nil)
			if got := fields(t, got); !slices.Equal(got, c.want) {
				t.Errorf("fields\n got %q\nwant %q", got, c.want)
			}
		})
	}
}

// extends.feature, "Extends that names another kind is a problem": a
// prefix that is not the extending document's kind names no base of it,
// though one of the name is there; one that is, named with its kind, is
// still looked up as a bare name is, its cycles among it.
func TestExtendsThatNamesAnotherKindIsAProblem(t *testing.T) {
	t.Parallel()
	const agent = "/home/.agister/agents/a.toml"
	cases := []struct {
		name     string
		kind     documents.Kind
		snapshot map[documents.Kind]map[string]documents.Document
		want     documents.Problem
	}{
		{"a process naming an agent", documents.Process, map[documents.Kind]map[string]documents.Document{
			documents.Process: homeFiles(map[string]string{"x": "{y: 1}", "a": "{extends: 'agent:x'}"}),
			documents.Agent:   {"x": {Sources: documents.Sources{Home: source("/home/.agister/agents/x.toml", "y = 1")}}},
		}, atExtends("a", "it names a process")},
		{"a process naming a blob's kind", documents.Process, map[documents.Kind]map[string]documents.Document{
			documents.Process: homeFiles(map[string]string{"x": "{y: 1}", "a": "{extends: 'prompt:x'}"}),
		}, atExtends("a", "it names a process")},
		{"a process naming no kind", documents.Process, map[documents.Kind]map[string]documents.Document{
			documents.Process: homeFiles(map[string]string{"x": "{y: 1}", "a": "{extends: 'processes:x'}"}),
		}, atExtends("a", "it names a process")},
		{"an agent naming a process", documents.Agent, map[documents.Kind]map[string]documents.Document{
			documents.Agent:   {"a": {Sources: documents.Sources{Home: source(agent, "extends = 'process:x'")}}},
			documents.Process: homeFiles(map[string]string{"x": "{y: 1}"}),
		}, documents.Problem{Path: agent, Place: "extends", Message: "it names an agent"}},
		{"a process naming another kind on a later line", documents.Process, map[documents.Kind]map[string]documents.Document{
			documents.Process: homeFiles(map[string]string{"a": "x: 1\nextends: 'agent:x'\n"}),
		}, extendsAt(processFile("/home", "a"), 2, "it names a process")},
		{"a process naming itself with its kind", documents.Process, map[documents.Kind]map[string]documents.Document{
			documents.Process: homeFiles(map[string]string{"a": "{extends: 'process:a'}"}),
		}, atExtends("a", `"a" extends "a"`)},
		{"a process naming with its kind a base no layer holds", documents.Process, map[documents.Kind]map[string]documents.Document{
			documents.Process: homeFiles(map[string]string{"a": "{extends: 'process:z'}"}),
		}, atExtends("a", `no layer holds the process "z"`)},
		{"a process whose base names another kind", documents.Process, map[documents.Kind]map[string]documents.Document{
			documents.Process: homeFiles(map[string]string{"b": "{extends: 'agent:x'}", "a": "{extends: 'process:b'}"}),
		}, atExtends("a", `the process "b": /home/.agister/processes/b.yaml:1: extends: it names a process`)},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			got, problems := documents.New(documents.Snapshot{Documents: c.snapshot}).Tree(c.kind, "a")
			assertNoTree(t, got)
			assertProblems(t, problems, []documents.Problem{c.want})
		})
	}
}

// A base's files are decoded once however many documents extend it,
// directly or through another base, and each extending document holds its
// base's fields.
func TestABaseIsComposedOnce(t *testing.T) {
	t.Parallel()
	decoded := map[string]int{}
	decode := func(format tree.Format, data []byte, path string) (tree.Node, []tree.Problem) {
		decoded[path]++
		return tree.Decode(format, data, path)
	}
	homes := map[string]string{"c": "{x: 1}", "b": "{extends: c}", "a1": "{extends: b}", "a2": "{extends: b}", "a3": "{extends: c}"}
	named := map[string]documents.Document{}
	for name, bytes := range homes {
		named[name] = documents.Document{Sources: documents.Sources{
			Home:       source(processFile("/home", name), bytes),
			Repository: source(processFile("/repo", name), "{}"),
		}}
	}
	d := documents.NewDecodingWith(snapshotOf(named), decode)
	for name := range homes {
		for _, root := range []string{"/home", "/repo"} {
			if got := decoded[processFile(root, name)]; got != 1 {
				t.Errorf("%s decoded %d times, want once", processFile(root, name), got)
			}
		}
		got, problems := d.Tree(documents.Process, name)
		assertProblems(t, problems, nil)
		if x, _ := got.Get("x"); x.Origin().Path != processFile("/home", "c") {
			t.Errorf("process %s holds x from %q, want from c's home file", name, x.Origin().Path)
		}
	}
}
