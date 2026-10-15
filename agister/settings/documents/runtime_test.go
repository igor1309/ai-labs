package documents_test

import (
	"reflect"
	"slices"
	"sync"
	"testing"

	"github.com/igor1309/ai-labs/agister/settings/documents"
	"github.com/igor1309/ai-labs/gokit/tree"
)

const (
	homeRuntime       = "/home/.agister/runtimes/a.yaml"
	repositoryRuntime = "/repo/.agister/runtimes/a.yaml"
	// runtimeHeader is a runtime's first four lines: all it must give but
	// its primitives.
	runtimeHeader = "schema: agister.runtime/v1alpha1\nname: a\nadapter: codex\ncontract: codex/2\n"
	// validRuntime is the runtime of runtime.feature's "A runtime's
	// fields".
	validRuntime = runtimeHeader + `efforts: [low, high]
primitives:
  select: one
  items:
    read-only: {grants: [repository.read], verified: ["0.161."]}
    workspace-write: {grants: [repository.read, repository.write]}
`
)

// runtimesOf is a documents of the runtimes given, by name.
func runtimesOf(runtimes map[string]documents.Document) *documents.Documents {
	return documents.New(documents.Snapshot{Documents: map[documents.Kind]map[string]documents.Document{documents.Runtime: runtimes}})
}

// typeRuntime is the runtime a typed from bytes, decoded in YAML as its
// home file.
func typeRuntime(t *testing.T, bytes string) (documents.RuntimeDefinition, []documents.Problem) {
	t.Helper()
	root, decoded := tree.Decode(tree.YAML, []byte(bytes), homeRuntime)
	if len(decoded) > 0 {
		t.Fatalf("%q does not decode: %v", bytes, decoded)
	}
	return documents.TypeRuntime("a", root)
}

func assertRuntime(t *testing.T, got, want documents.RuntimeDefinition) {
	t.Helper()
	if !reflect.DeepEqual(got, want) {
		t.Errorf("runtime\n got %+v\nwant %+v", got, want)
	}
}

func assertNoRuntime(t *testing.T, got documents.RuntimeDefinition) {
	t.Helper()
	if !reflect.DeepEqual(got, documents.RuntimeDefinition{}) {
		t.Errorf("a runtime %+v, want none", got)
	}
}

// texts is a list of strings given by the file at path, on line.
func texts(path string, line int, values ...string) documents.Field[[]string] {
	return documents.Field[[]string]{Value: values, Origin: documents.Origin{Path: path, Line: line}, Given: true}
}

// primitive is the option name, given by the file at path, on line.
func primitive(path string, line int, name string, grants, verified documents.Field[[]string]) documents.Field[documents.Primitive] {
	return documents.Field[documents.Primitive]{
		Value:  documents.Primitive{Name: name, Grants: grants, Verified: verified},
		Origin: documents.Origin{Path: path, Line: line},
		Given:  true,
	}
}

// primitives are a runtime's primitives, given by the file at path, on
// line.
func primitives(path string, line int, selects documents.Field[string], items ...documents.Field[documents.Primitive]) documents.Field[documents.Primitives] {
	return documents.Field[documents.Primitives]{
		Value:  documents.Primitives{Select: selects, Items: items},
		Origin: documents.Origin{Path: path, Line: line},
		Given:  true,
	}
}

// inHomeRuntime is a problem at place of the runtime a's home file, on
// line.
func inHomeRuntime(line int, place, message string) documents.Problem {
	return documents.Problem{Path: homeRuntime, Line: line, Place: place, Message: message}
}

// validRuntimeDefinition is validRuntime typed: every field it gives, each
// with its value and the origin of its home file, on its line.
func validRuntimeDefinition() documents.RuntimeDefinition {
	return documents.RuntimeDefinition{
		Name:     "a",
		Adapter:  text("codex", homeRuntime, 3),
		Contract: text("codex/2", homeRuntime, 4),
		Efforts:  texts(homeRuntime, 5, "low", "high"),
		Primitives: primitives(homeRuntime, 6, text("one", homeRuntime, 7),
			primitive(homeRuntime, 9, "read-only", texts(homeRuntime, 9, "repository.read"), texts(homeRuntime, 9, "0.161.")),
			primitive(homeRuntime, 10, "workspace-write", texts(homeRuntime, 10, "repository.read", "repository.write"), documents.Field[[]string]{}),
		),
	}
}

// runtime.feature, "A runtime's fields": every field the runtime gives,
// each with its value and the origin of its home file, on its line.
func TestARuntimesFields(t *testing.T) {
	t.Parallel()
	d := runtimesOf(map[string]documents.Document{"a": {Sources: documents.Sources{Home: source(homeRuntime, validRuntime)}}})
	got, problems := d.Runtime("a")
	assertProblems(t, problems, nil)
	assertRuntime(t, got, validRuntimeDefinition())
}

// A runtime given is the caller's own: changing any slice of it changes
// nothing the documents hold, and the next call gives the runtime as typed.
func TestARuntimeGivenIsTheCallersOwn(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name   string
		change func(*documents.RuntimeDefinition)
	}{
		{"its efforts", func(r *documents.RuntimeDefinition) { r.Efforts.Value[0] = "x" }},
		{"its primitives' items", func(r *documents.RuntimeDefinition) { r.Primitives.Value.Items[0].Value.Name = "x" }},
		{"a primitive's grants", func(r *documents.RuntimeDefinition) { r.Primitives.Value.Items[0].Value.Grants.Value[0] = "x" }},
		{"a primitive's verified versions", func(r *documents.RuntimeDefinition) { r.Primitives.Value.Items[0].Value.Verified.Value[0] = "x" }},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			d := runtimesOf(map[string]documents.Document{"a": {Sources: documents.Sources{Home: source(homeRuntime, validRuntime)}}})
			given, _ := d.Runtime("a")
			c.change(&given)
			got, problems := d.Runtime("a")
			assertProblems(t, problems, nil)
			assertRuntime(t, got, validRuntimeDefinition())
		})
	}
}

// A runtime's efforts may be left out; its adapter, its contract and its
// primitives may not, and each missing one is in no file.
func TestARuntimeNeedsItsAdapterItsContractAndItsPrimitives(t *testing.T) {
	t.Parallel()
	got, problems := typeRuntime(t, "schema: agister.runtime/v1alpha1\nname: a\nefforts: [low]\n")
	assertNoRuntime(t, got)
	assertProblems(t, problems, []documents.Problem{missing("adapter"), missing("contract"), missing("primitives")})

	got, problems = typeRuntime(t, runtimeHeader+"primitives:\n  select: any\n  items:\n    x: {grants: [a]}\n")
	assertProblems(t, problems, nil)
	assertRuntime(t, got, documents.RuntimeDefinition{
		Name:     "a",
		Adapter:  text("codex", homeRuntime, 3),
		Contract: text("codex/2", homeRuntime, 4),
		Primitives: primitives(homeRuntime, 5, text("any", homeRuntime, 6),
			primitive(homeRuntime, 8, "x", texts(homeRuntime, 8, "a"), documents.Field[[]string]{})),
	})
}

// runtime.feature, "A runtime's primitives are a choice of options, each
// granting something": a nested field's problem is at its place in the
// tree, in the file and on the line that gave it; a missing one is in no
// file.
func TestARuntimesPrimitivesAreAChoiceOfOptionsEachGrantingSomething(t *testing.T) {
	t.Parallel()
	// withPrimitives is a runtime whose primitives, from line 5, are lines.
	withPrimitives := func(lines string) string { return runtimeHeader + "primitives:\n" + lines }
	cases := []struct {
		name  string
		bytes string
		want  documents.Problem
	}{
		{"the select some", withPrimitives("  select: some\n  items:\n    x: {grants: [a]}\n"),
			inHomeRuntime(6, "primitives.select", `it is "any" or "one"`)},
		{"no select", withPrimitives("  items:\n    x: {grants: [a]}\n"), missing("primitives.select")},
		{"a select that is no string", withPrimitives("  select: 1\n  items:\n    x: {grants: [a]}\n"),
			inHomeRuntime(6, "primitives.select", "it is a string, not an integer")},
		{"no items", withPrimitives("  select: one\n"), missing("primitives.items")},
		{"the items {}", withPrimitives("  select: one\n  items: {}\n"),
			inHomeRuntime(7, "primitives.items", "it names a primitive")},
		{"items that are no map", withPrimitives("  select: one\n  items: [x]\n"),
			inHomeRuntime(7, "primitives.items", "it is a map, not a list")},
		{"an item that is no map", withPrimitives("  select: one\n  items:\n    x: read\n"),
			inHomeRuntime(8, "primitives.items.x", "it is a map, not a string")},
		{"an item with no grants", withPrimitives("  select: one\n  items:\n    x: {verified: ['0.1.']}\n"),
			missing("primitives.items.x.grants")},
		{"an item granting nothing", withPrimitives("  select: one\n  items:\n    x: {grants: []}\n"),
			inHomeRuntime(8, "primitives.items.x.grants", "it grants a permission")},
		{"grants that are no list", withPrimitives("  select: one\n  items:\n    x: {grants: a}\n"),
			inHomeRuntime(8, "primitives.items.x.grants", "it is a list, not a string")},
		{"a grant that is no string", withPrimitives("  select: one\n  items:\n    x:\n      grants:\n        - a\n        - 2\n"),
			inHomeRuntime(11, "primitives.items.x.grants[1]", "it is a string, not an integer")},
		{"a verified version that is no string", withPrimitives("  select: one\n  items:\n    x: {grants: [a], verified: [true]}\n"),
			inHomeRuntime(8, "primitives.items.x.verified[0]", "it is a string, not a boolean")},
		{"a field of an item no kind knows", withPrimitives("  select: one\n  items:\n    x: {grants: [a], y: 1}\n"),
			inHomeRuntime(8, "primitives.items.x.y", "the field is not known")},
		{"a field of the primitives no kind knows", withPrimitives("  select: one\n  colour: red\n  items:\n    x: {grants: [a]}\n"),
			inHomeRuntime(7, "primitives.colour", "the field is not known")},
		{"primitives that are no map", runtimeHeader + "primitives: [x]\n",
			inHomeRuntime(5, "primitives", "it is a map, not a list")},
		{"the efforts [1]", runtimeHeader + "efforts: [1]\nprimitives:\n  select: one\n  items:\n    x: {grants: [a]}\n",
			inHomeRuntime(5, "efforts[0]", "it is a string, not an integer")},
		{"efforts that are no list", runtimeHeader + "efforts: high\nprimitives:\n  select: one\n  items:\n    x: {grants: [a]}\n",
			inHomeRuntime(5, "efforts", "it is a list, not a string")},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			got, problems := typeRuntime(t, c.bytes)
			assertNoRuntime(t, got)
			assertProblems(t, problems, []documents.Problem{c.want})
		})
	}
}

// Every problem of a runtime's fields is reported, nested or not, in the
// order its fields are read: the fields no kind knows of a map after that
// map's own.
func TestEveryRuntimeFieldProblemIsReported(t *testing.T) {
	t.Parallel()
	got, problems := typeRuntime(t, `schema: agister.runtime/v1alpha1
name: a
adapter: codex
efforts: [1]
colour: red
primitives:
  select: some
  items:
    x: {grants: []}
    y: {grants: [a], z: 1}
`)
	assertNoRuntime(t, got)
	assertProblems(t, problems, []documents.Problem{
		missing("contract"),
		inHomeRuntime(4, "efforts[0]", "it is a string, not an integer"),
		inHomeRuntime(7, "primitives.select", `it is "any" or "one"`),
		inHomeRuntime(9, "primitives.items.x.grants", "it grants a permission"),
		inHomeRuntime(10, "primitives.items.y.z", "the field is not known"),
		inHomeRuntime(5, "colour", "the field is not known"),
	})
}

// runtime.feature, "A runtime's fields": a runtime's primitives are in
// the order of their names, whatever order, lines or format the file gives
// them in.
func TestARuntimesPrimitivesAreByName(t *testing.T) {
	t.Parallel()
	yaml := func(items string) tree.Node {
		root, decoded := tree.Decode(tree.YAML, []byte(runtimeHeader+"primitives:\n  select: any\n  items:\n"+items), homeRuntime)
		if len(decoded) > 0 {
			t.Fatalf("the runtime does not decode: %v", decoded)
		}
		return root
	}
	toml, decoded := tree.Decode(tree.TOML, []byte(`schema = "agister.runtime/v1alpha1"
name = "a"
adapter = "codex"
contract = "codex/2"
[primitives]
select = "any"
[primitives.items.z]
grants = ["a"]
[primitives.items.b]
grants = ["a"]
`), "/home/.agister/runtimes/a.toml")
	if len(decoded) > 0 {
		t.Fatalf("the runtime does not decode: %v", decoded)
	}
	cases := []struct {
		name string
		root tree.Node
		want []string
	}{
		{"each on a line of its own", yaml("    z: {grants: [a]}\n    b: {grants: [a]}\n    m: {grants: [a]}\n"), []string{"b", "m", "z"}},
		{"each over lines of its own", yaml("    z:\n      grants: [a]\n    b:\n      grants: [a]\n"), []string{"b", "z"}},
		{"on one line", yaml("    {z: {grants: [a]}, b: {grants: [a]}}\n"), []string{"b", "z"}},
		{"of a format that gives no line", toml, []string{"b", "z"}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			got, problems := documents.TypeRuntime("a", c.root)
			assertProblems(t, problems, nil)
			var names []string
			for _, item := range got.Primitives.Value.Items {
				names = append(names, item.Value.Name)
			}
			if !slices.Equal(names, c.want) {
				t.Errorf("primitives %q, want %q", names, c.want)
			}
		})
	}
}

// A nested field is typed from the layer whose value the composed tree
// holds: its origin, or its problem, is that layer's file.
func TestANestedFieldIsOfTheFileThatGaveIt(t *testing.T) {
	t.Parallel()
	runtime := func(repository string) (documents.RuntimeDefinition, []documents.Problem) {
		return runtimesOf(map[string]documents.Document{"a": {Sources: documents.Sources{
			Home:       source(homeRuntime, validRuntime),
			Repository: source(repositoryRuntime, repository),
		}}}).Runtime("a")
	}

	got, problems := runtime("primitives:\n  items:\n    read-only: {verified: ['0.162.']}\n")
	assertProblems(t, problems, nil)
	if want := primitive(repositoryRuntime, 3, "read-only", texts(homeRuntime, 9, "repository.read"), texts(repositoryRuntime, 3, "0.162.")); !reflect.DeepEqual(got.Primitives.Value.Items[0], want) {
		t.Errorf("the primitive read-only\n got %+v\nwant %+v", got.Primitives.Value.Items[0], want)
	}

	got, problems = runtime("primitives:\n  items:\n    read-only: {grants: []}\n")
	assertNoRuntime(t, got)
	assertProblems(t, problems, []documents.Problem{
		{Path: repositoryRuntime, Line: 3, Place: "primitives.items.read-only.grants", Message: "it grants a permission"},
	})
}

// Each runtime whose tree has no problem is typed once, when the documents
// are built, and never again however often it is asked for; one whose
// tree has problems is not typed, and has its tree's.
func TestEachRuntimeIsTypedOnce(t *testing.T) {
	t.Parallel()
	var mu sync.Mutex
	var typed []string
	typeRuntime := func(name string, root tree.Node) (documents.RuntimeDefinition, []documents.Problem) {
		mu.Lock()
		typed = append(typed, name)
		mu.Unlock()
		return documents.TypeRuntime(name, root)
	}
	runtime := func(name, bytes string) documents.Document {
		return documents.Document{Sources: documents.Sources{Home: source("/home/.agister/runtimes/"+name+".yaml", bytes)}}
	}
	d := documents.NewTypingWith(documents.Snapshot{Documents: map[documents.Kind]map[string]documents.Document{
		documents.Runtime: {
			"a": runtime("a", validRuntime),
			"b": runtime("b", "schema: agister.runtime/v1alpha1\nname: b\n"),
			"c": runtime("c", "x: [1"),
		},
		documents.Agent: {"a": {Sources: documents.Sources{Home: source(homeAgent, validAgent)}}},
	}}, documents.Typers{Agent: documents.TypeAgent, Runtime: typeRuntime, Brief: documents.TypeBrief})
	for range 3 {
		for _, name := range []string{"a", "b", "c", "z"} {
			d.Runtime(name)
		}
	}
	mu.Lock()
	got := slices.Sorted(slices.Values(typed))
	mu.Unlock()
	if want := []string{"a", "b"}; !slices.Equal(got, want) {
		t.Errorf("typed\n got %q\nwant %q", got, want)
	}
	if _, problems := d.Runtime("b"); !slices.Equal(problems, []documents.Problem{missing("adapter"), missing("contract"), missing("primitives")}) {
		t.Errorf("runtime b's problems %q, want its adapter, contract and primitives missing", problems)
	}
	_, want := d.Tree(documents.Runtime, "c")
	if len(want) == 0 {
		t.Fatal("the runtime c's tree has no problem")
	}
	c, problems := d.Runtime("c")
	assertNoRuntime(t, c)
	assertProblems(t, problems, want)
	if _, problems := d.Runtime("z"); !slices.Equal(problems, []documents.Problem{{Message: `no layer holds the runtime "z"`}}) {
		t.Errorf("runtime z's problems %q, want no layer holding it", problems)
	}
}
