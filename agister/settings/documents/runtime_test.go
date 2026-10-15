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
	runtimeHeader     = "schema: agister.runtime/v1alpha1\nadapter: codex\ncontract: codex/2\n"
	// validRuntime is the runtime of runtime.feature's "A runtime's
	// fields".
	validRuntime = runtimeHeader + `efforts: [low, high]
grants: [host.read]
select: one
options:
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

// option is the option name, given by the file at path, on line.
func option(path string, line int, name string, grants, verified documents.Field[[]string]) documents.Field[documents.Option] {
	return documents.Field[documents.Option]{
		Value:  documents.Option{Name: name, Grants: grants, Verified: verified},
		Origin: documents.Origin{Path: path, Line: line},
		Given:  true,
	}
}

// options are a runtime's options, given by the file at path, on line.
func options(path string, line int, items ...documents.Field[documents.Option]) documents.Field[[]documents.Field[documents.Option]] {
	return documents.Field[[]documents.Field[documents.Option]]{Value: items, Origin: documents.Origin{Path: path, Line: line}, Given: true}
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
		Adapter:  text("codex", homeRuntime, 2),
		Contract: text("codex/2", homeRuntime, 3),
		Efforts:  texts(homeRuntime, 4, "low", "high"),
		Grants:   texts(homeRuntime, 5, "host.read"),
		Select:   text("one", homeRuntime, 6),
		Options: options(homeRuntime, 7,
			option(homeRuntime, 8, "read-only", texts(homeRuntime, 8, "repository.read"), texts(homeRuntime, 8, "0.161.")),
			option(homeRuntime, 9, "workspace-write", texts(homeRuntime, 9, "repository.read", "repository.write"), documents.Field[[]string]{}),
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
		{"its grants", func(r *documents.RuntimeDefinition) { r.Grants.Value[0] = "x" }},
		{"its options", func(r *documents.RuntimeDefinition) { r.Options.Value[0].Value.Name = "x" }},
		{"an option's grants", func(r *documents.RuntimeDefinition) { r.Options.Value[0].Value.Grants.Value[0] = "x" }},
		{"an option's verified versions", func(r *documents.RuntimeDefinition) { r.Options.Value[0].Value.Verified.Value[0] = "x" }},
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

// runtime.feature, "A runtime may offer no option": a runtime of its
// grants alone has no select and no option, and its efforts may be left
// out too.
func TestARuntimeMayOfferNoOption(t *testing.T) {
	t.Parallel()
	got, problems := typeRuntime(t, runtimeHeader+"grants: [process.execute]\n")
	assertProblems(t, problems, nil)
	assertRuntime(t, got, documents.RuntimeDefinition{
		Name:     "a",
		Adapter:  text("codex", homeRuntime, 2),
		Contract: text("codex/2", homeRuntime, 3),
		Grants:   texts(homeRuntime, 4, "process.execute"),
	})
}

// runtime.feature, "A runtime's fields": a select is "any" as it is
// "one", with its origin.
func TestARuntimesSelectIsAnyOrOne(t *testing.T) {
	t.Parallel()
	for _, value := range []string{"any", "one"} {
		t.Run(value, func(t *testing.T) {
			t.Parallel()
			got, problems := typeRuntime(t, runtimeHeader+"select: "+value+"\noptions:\n  x: {grants: [a]}\n")
			assertProblems(t, problems, nil)
			if want := text(value, homeRuntime, 4); got.Select != want {
				t.Errorf("select %+v, want %+v", got.Select, want)
			}
		})
	}
}

// runtime.feature, "A nearer layer drops what the runtime grants with no
// option": lists replace whole (ADR-002, rule 3), so the repository's
// none is the runtime's grants, and its other fields are the home's.
func TestANearerLayerDropsWhatTheRuntimeGrantsWithNoOption(t *testing.T) {
	t.Parallel()
	got, problems := runtimesOf(map[string]documents.Document{"a": {Sources: documents.Sources{
		Home:       source(homeRuntime, validRuntime),
		Repository: source(repositoryRuntime, "grants: []\n"),
	}}}).Runtime("a")
	assertProblems(t, problems, nil)
	want := validRuntimeDefinition()
	want.Grants = texts(repositoryRuntime, 1, []string{}...)
	assertRuntime(t, got, want)
}

// runtime.feature, "A runtime needs its adapter and its contract": each
// missing one is in no file.
func TestARuntimeNeedsItsAdapterAndItsContract(t *testing.T) {
	t.Parallel()
	got, problems := typeRuntime(t, "schema: agister.runtime/v1alpha1\n")
	assertNoRuntime(t, got)
	assertProblems(t, problems, []documents.Problem{missing("adapter"), missing("contract")})
}

// runtime.feature, "A runtime's options are chosen one or any, and each
// grants something": a nested field's problem is at its place in the
// tree, in the file and on the line that gave it; a missing one is in no
// file.
func TestARuntimesOptionsAreChosenOneOrAnyAndEachGrantsSomething(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name  string
		bytes string
		want  documents.Problem
	}{
		{"the select some", runtimeHeader + "select: some\noptions:\n  x: {grants: [a]}\n",
			inHomeRuntime(4, "select", `it is "any" or "one"`)},
		{"options with no select", runtimeHeader + "options:\n  x: {grants: [a]}\n", missing("select")},
		{"a select with no options", runtimeHeader + "select: one\n", missing("options")},
		{"the options {}", runtimeHeader + "select: one\noptions: {}\n", inHomeRuntime(5, "options", "it names an option")},
		{"an option that is no map", runtimeHeader + "select: one\noptions:\n  x: read\n",
			inHomeRuntime(6, "options.x", "it is a map, not a string")},
		{"an option with no grants", runtimeHeader + "select: one\noptions:\n  x: {verified: ['0.1.']}\n",
			missing("options.x.grants")},
		{"an option granting nothing", runtimeHeader + "select: one\noptions:\n  x: {grants: []}\n",
			inHomeRuntime(6, "options.x.grants", "it grants a permission")},
		// A value of the wrong type, once for each typing a runtime alone
		// reads: a list, a choice and a map of entries.
		{"efforts that are no list", runtimeHeader + "efforts: high\n", inHomeRuntime(4, "efforts", "it is a list, not a string")},
		{"a select that is no string", runtimeHeader + "select: 1\noptions:\n  x: {grants: [a]}\n",
			inHomeRuntime(4, "select", "it is a string, not an integer")},
		{"options that are no map", runtimeHeader + "select: one\noptions: [x]\n", inHomeRuntime(5, "options", "it is a map, not a list")},
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
// order its fields are read: each bad item of a list, whatever lies
// between them, and the fields no kind knows of a map after that map's
// own.
func TestEveryRuntimeFieldProblemIsReported(t *testing.T) {
	t.Parallel()
	got, problems := typeRuntime(t, `schema: agister.runtime/v1alpha1
adapter: codex
efforts: [1, high, true]
colour: red
select: some
options:
  x: {grants: []}
  y: {grants: [a, 2, b, 3], verified: [true, "0.1.", false], z: 1}
`)
	assertNoRuntime(t, got)
	assertProblems(t, problems, []documents.Problem{
		missing("contract"),
		inHomeRuntime(3, "efforts[0]", "it is a string, not an integer"),
		inHomeRuntime(3, "efforts[2]", "it is a string, not a boolean"),
		inHomeRuntime(5, "select", `it is "any" or "one"`),
		inHomeRuntime(7, "options.x.grants", "it grants a permission"),
		inHomeRuntime(8, "options.y.grants[1]", "it is a string, not an integer"),
		inHomeRuntime(8, "options.y.grants[3]", "it is a string, not an integer"),
		inHomeRuntime(8, "options.y.verified[0]", "it is a string, not a boolean"),
		inHomeRuntime(8, "options.y.verified[2]", "it is a string, not a boolean"),
		inHomeRuntime(8, "options.y.z", "the field is not known"),
		inHomeRuntime(4, "colour", "the field is not known"),
	})
}

// runtime.feature, "A runtime's fields": a runtime's options are in
// the order of their names, whatever order, lines or format the file gives
// them in.
func TestARuntimesOptionsAreByName(t *testing.T) {
	t.Parallel()
	yaml := func(items string) tree.Node {
		root, decoded := tree.Decode(tree.YAML, []byte(runtimeHeader+"select: any\noptions:\n"+items), homeRuntime)
		if len(decoded) > 0 {
			t.Fatalf("the runtime does not decode: %v", decoded)
		}
		return root
	}
	toml, decoded := tree.Decode(tree.TOML, []byte(`schema = "agister.runtime/v1alpha1"
adapter = "codex"
contract = "codex/2"
select = "any"
[options.z]
grants = ["a"]
[options.b]
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
		{"each on a line of its own", yaml("  z: {grants: [a]}\n  b: {grants: [a]}\n  m: {grants: [a]}\n"), []string{"b", "m", "z"}},
		{"each over lines of its own", yaml("  z:\n    grants: [a]\n  b:\n    grants: [a]\n"), []string{"b", "z"}},
		{"on one line", yaml("  {z: {grants: [a]}, b: {grants: [a]}}\n"), []string{"b", "z"}},
		{"of a format that gives no line", toml, []string{"b", "z"}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			got, problems := documents.TypeRuntime("a", c.root)
			assertProblems(t, problems, nil)
			var names []string
			for _, item := range got.Options.Value {
				names = append(names, item.Value.Name)
			}
			if !slices.Equal(names, c.want) {
				t.Errorf("options %q, want %q", names, c.want)
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

	got, problems := runtime("options:\n  read-only: {verified: ['0.162.']}\n")
	assertProblems(t, problems, nil)
	if want := option(repositoryRuntime, 2, "read-only", texts(homeRuntime, 8, "repository.read"), texts(repositoryRuntime, 2, "0.162.")); !reflect.DeepEqual(got.Options.Value[0], want) {
		t.Errorf("the option read-only\n got %+v\nwant %+v", got.Options.Value[0], want)
	}

	got, problems = runtime("options:\n  read-only: {grants: []}\n")
	assertNoRuntime(t, got)
	assertProblems(t, problems, []documents.Problem{
		{Path: repositoryRuntime, Line: 2, Place: "options.read-only.grants", Message: "it grants a permission"},
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
			"b": runtime("b", "schema: agister.runtime/v1alpha1\n"),
			"c": runtime("c", "x: [1"),
		},
		documents.Agent: {"a": {Sources: documents.Sources{Home: source(homeAgent, validAgent)}}},
	}}, documents.Typers{Agent: documents.TypeAgent, Runtime: typeRuntime, Brief: documents.TypeBrief, Process: documents.TypeProcess, Workflow: documents.TypeWorkflow})
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
	if _, problems := d.Runtime("b"); !slices.Equal(problems, []documents.Problem{missing("adapter"), missing("contract")}) {
		t.Errorf("runtime b's problems %q, want its adapter and contract missing", problems)
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
