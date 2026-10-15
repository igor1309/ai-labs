package documents

import (
	"fmt"
	"slices"
	"strconv"
	"strings"

	"github.com/igor1309/ai-labs/gokit/tree"
)

// Origin is where a definition's field came from: the path of the file
// that gave it, and its line there, 0 for none.
type Origin struct {
	Path string
	Line int
}

// Field is a field of a definition: its value and the origin of the file
// that gave it; the zero field, not given, where no layer gives it.
type Field[T any] struct {
	Value  T
	Origin Origin
	Given  bool
}

// need is whether a kind's field must be given.
type need bool

const (
	required need = true
	optional need = false
)

// typing reads a composed tree, extends applied, as the definition of a
// kind: the rules every kind shares are here, and each kind's typer says
// which fields it has and of what type. Its problems are in the order the
// fields are read, the fields no kind knows of a map after that map's own.
type typing struct {
	problems []Problem
}

// fields reads one map of a typing's tree, at place, its keys as the
// fields of what the map is; the root's place is "".
type fields struct {
	typing *typing
	node   tree.Node
	place  string
	// known are the fields read; extends among the root's, as every tree
	// kind's is read by layering before typing.
	known map[string]bool
}

// entry is one entry of a map of items: its key, and its map's fields.
type entry struct {
	name   string
	fields *fields
}

// newTyping begins typing root as the document of kind and name: a tree
// document is a map, or the empty tree of an empty file, and names its
// kind's schema and its own name.
func newTyping(kind Kind, name string, root tree.Node) *fields {
	t := &fields{typing: &typing{}, node: root, known: map[string]bool{"extends": true}}
	if k := root.Kind(); k != tree.Map && k != tree.Empty {
		t.typing.problems = append(t.typing.problems, at(root, "", notA(tree.Map, k)))
		return t
	}
	if schema := t.text("schema", required); schema.Given {
		switch want := schemaOf(kind); {
		case schema.Value == want:
		case knownSchema(schema.Value):
			t.problem(schema.Origin, "schema", fmt.Sprintf("%s %s's schema is %q", article(kind), kind, want))
		default:
			t.problem(schema.Origin, "schema", fmt.Sprintf("the schema %q is not known", schema.Value))
		}
	}
	if named := t.text("name", required); named.Given && named.Value != name {
		t.problem(named.Origin, "name", fmt.Sprintf("it is %q, the document's name", name))
	}
	return t
}

// text is the string field key, as need says it must be given or may not
// be.
func (f *fields) text(key string, need need) Field[string] {
	node, ok := f.field(key, tree.String, need)
	if !ok {
		return Field[string]{}
	}
	value, _ := node.Text()
	return Field[string]{Value: value, Origin: originOf(node), Given: true}
}

// oneOf is the string field key, which is one of values.
func (f *fields) oneOf(key string, need need, values ...string) Field[string] {
	field := f.text(key, need)
	if !field.Given || slices.Contains(values, field.Value) {
		return field
	}
	quoted := make([]string, len(values))
	for i, value := range values {
		quoted[i] = strconv.Quote(value)
	}
	last := len(quoted) - 1
	message := "it is " + quoted[last]
	if last > 0 {
		message = "it is " + strings.Join(quoted[:last], ", ") + " or " + quoted[last]
	}
	f.problem(field.Origin, f.at(key), message)
	return Field[string]{}
}

// boolean is the boolean field key.
func (f *fields) boolean(key string, need need) Field[bool] {
	node, ok := f.field(key, tree.Boolean, need)
	if !ok {
		return Field[bool]{}
	}
	value, _ := node.Boolean()
	return Field[bool]{Value: value, Origin: originOf(node), Given: true}
}

// reference is the string field key, the name of a document of kind, given
// bare or with kind before it; the field holds the name.
func (f *fields) reference(key string, need need, kind Kind) Field[string] {
	field := f.text(key, need)
	if !field.Given {
		return field
	}
	name, ok := nameOf(kind, field.Value)
	if !ok {
		f.problem(field.Origin, f.at(key), namesA(kind))
		return Field[string]{}
	}
	field.Value = name
	return field
}

// texts is the field key, a list of strings: none given where an item is
// of another type, each such item a problem at its place in the list.
func (f *fields) texts(key string, need need) Field[[]string] {
	node, ok := f.field(key, tree.List, need)
	if !ok {
		return Field[[]string]{}
	}
	values := []string{}
	allText := true
	for i, item := range node.Items() {
		value, isText := item.Text()
		if !isText {
			f.typing.problems = append(f.typing.problems, at(item, f.item(key, i), notA(tree.String, item.Kind())))
			allText = false
			continue
		}
		values = append(values, value)
	}
	if !allText {
		return Field[[]string]{}
	}
	return Field[[]string]{Value: values, Origin: originOf(node), Given: true}
}

// list is the field key, a list of maps in the file's order, whose
// fields the kind's typer reads and then ends each with done; an item that
// is no map is a problem, and no item.
func (f *fields) list(key string, need need) Field[[]*fields] {
	node, ok := f.field(key, tree.List, need)
	if !ok {
		return Field[[]*fields]{}
	}
	items := []*fields{}
	for i, item := range node.Items() {
		if item.Kind() != tree.Map {
			f.typing.problems = append(f.typing.problems, at(item, f.item(key, i), notA(tree.Map, item.Kind())))
			continue
		}
		items = append(items, &fields{typing: f.typing, node: item, place: f.item(key, i), known: map[string]bool{}})
	}
	return Field[[]*fields]{Value: items, Origin: originOf(node), Given: true}
}

// mapping is the field key, a map, whose fields the kind's typer reads and
// then ends with done.
func (f *fields) mapping(key string, need need) Field[*fields] {
	node, ok := f.field(key, tree.Map, need)
	if !ok {
		return Field[*fields]{}
	}
	return Field[*fields]{Value: f.inner(key, node), Origin: originOf(node), Given: true}
}

// entries is the field key, a map of items, each a map whose fields the
// kind's typer reads and then ends with done; an item that is no map is a
// problem, and no entry. The entries are in the order of their keys, as
// the tree gives them: it keeps no order of a map's keys.
func (f *fields) entries(key string, need need) Field[[]entry] {
	node, ok := f.field(key, tree.Map, need)
	if !ok {
		return Field[[]entry]{}
	}
	inner := f.inner(key, node)
	entries := []entry{}
	for _, name := range node.Keys() {
		if item, ok := inner.field(name, tree.Map, required); ok {
			entries = append(entries, entry{name: name, fields: inner.inner(name, item)})
		}
	}
	return Field[[]entry]{Value: entries, Origin: originOf(node), Given: true}
}

// inner is the fields of node, the map at key.
func (f *fields) inner(key string, node tree.Node) *fields {
	return &fields{typing: f.typing, node: node, place: f.at(key), known: map[string]bool{}}
}

// field is the field key, if it is given and of kind; a field that must be
// given and is not is in no file.
func (f *fields) field(key string, kind tree.Kind, need need) (tree.Node, bool) {
	f.known[key] = true
	// A root that is no map has been reported, and has no field.
	if k := f.node.Kind(); k != tree.Map && k != tree.Empty {
		return tree.Node{}, false
	}
	node, given := f.node.Get(key)
	if !given {
		if need == required {
			f.typing.problems = append(f.typing.problems, Problem{Place: f.at(key), Message: "it is missing"})
		}
		return tree.Node{}, false
	}
	if node.Kind() != kind {
		f.typing.problems = append(f.typing.problems, at(node, f.at(key), notA(kind, node.Kind())))
		return tree.Node{}, false
	}
	return node, true
}

// done ends the reading of a map: each of its fields no kind knows is a
// problem.
func (f *fields) done() {
	for _, key := range f.node.Keys() {
		if !f.known[key] {
			value, _ := f.node.Get(key)
			f.typing.problems = append(f.typing.problems, at(value, f.at(key), "the field is not known"))
		}
	}
}

// end is the problems of the typing, the root's fields no kind knows
// among them.
func (f *fields) end() []Problem {
	f.done()
	return f.typing.problems
}

func (f *fields) problem(origin Origin, place, message string) {
	f.typing.problems = append(f.typing.problems, Problem{Path: origin.Path, Line: origin.Line, Place: place, Message: message})
}

// at is the place of the field key, in tree's form: the keys from the
// root joined by ".".
func (f *fields) at(key string) string {
	if f.place == "" {
		return key
	}
	return f.place + "." + key
}

// item is the place of the item i of the list at key, in tree's form:
// the list's place and the item's index in brackets.
func (f *fields) item(key string, i int) string {
	return fmt.Sprintf("%s[%d]", f.at(key), i)
}

// at is a problem at place, in the file and on the line node came from.
func at(node tree.Node, place, message string) Problem {
	origin := node.Origin()
	return Problem{Path: origin.Path, Line: origin.Line, Place: place, Message: message}
}

func originOf(node tree.Node) Origin {
	return Origin{Path: node.Origin().Path, Line: node.Origin().Line}
}

// notA is the message of a value of kind got where one of want is due.
func notA(want, got tree.Kind) string {
	return fmt.Sprintf("it is %s, not %s", withArticle(want), withArticle(got))
}

func withArticle(kind tree.Kind) string {
	if kind == tree.Integer {
		return "an integer"
	}
	return "a " + kind.String()
}

// nameOf is the name of a document of kind that value gives: the name
// bare, or with kind and ":" before it, as the shipped settings write some
// references; false where anything else is before a ":", as a reference
// that names a document of another kind.
func nameOf(kind Kind, value string) (string, bool) {
	prefix, name, prefixed := strings.Cut(value, ":")
	if !prefixed {
		return value, true
	}
	return name, Kind(prefix) == kind
}

// namesA is the message of a reference that names no document of kind.
func namesA(kind Kind) string {
	return fmt.Sprintf("it names %s %s", article(kind), kind)
}

// schemaOf is the schema a tree document of kind names.
func schemaOf(kind Kind) string {
	return "agister." + string(kind) + "/v1alpha1"
}

// knownSchema is whether schema is the schema of a tree kind.
func knownSchema(schema string) bool {
	kind, prefixed := strings.CutPrefix(schema, "agister.")
	kind, suffixed := strings.CutSuffix(kind, "/v1alpha1")
	_, isTree, _ := shapeOf(Kind(kind))
	return prefixed && suffixed && isTree
}
