package documents

import (
	"fmt"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/igor1309/ai-labs/gokit/tree"
)

// Origin is where a definition's field came from: the path of the file
// that gave it, its line there, 0 for none, and its place in the
// document, spelled as a problem's place is.
type Origin struct {
	Path  string
	Line  int
	Place string
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

// newTyping begins typing root as the document of kind: a tree document is
// a map, or the empty tree of an empty file, and names its kind's schema.
// It states no name: its file gives it (ADR-002, rule 1).
func newTyping(kind Kind, root tree.Node) *fields {
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
	return Field[string]{Value: value, Origin: originOf(node, f.at(key)), Given: true}
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
	f.problem(field.Origin, f.at(key), "it is "+either(quoted))
	return Field[string]{}
}

// either is choices, "a", "a or b", "a, b or c".
func either(choices []string) string {
	last := len(choices) - 1
	if last == 0 {
		return choices[0]
	}
	return strings.Join(choices[:last], ", ") + " or " + choices[last]
}

// boolean is the boolean field key.
func (f *fields) boolean(key string, need need) Field[bool] {
	node, ok := f.field(key, tree.Boolean, need)
	if !ok {
		return Field[bool]{}
	}
	value, _ := node.Boolean()
	return Field[bool]{Value: value, Origin: originOf(node, f.at(key)), Given: true}
}

// integer is the integer field key, least or more.
func (f *fields) integer(key string, need need, least int) Field[int] {
	node, ok := f.field(key, tree.Integer, need)
	if !ok {
		return Field[int]{}
	}
	value, _ := node.Integer()
	if value < int64(least) {
		f.typing.problems = append(f.typing.problems, at(node, f.at(key), fmt.Sprintf("it is at least %d", least)))
		return Field[int]{}
	}
	return Field[int]{Value: int(value), Origin: originOf(node, f.at(key)), Given: true}
}

// duration is the string field key, a duration in the form of Go's
// time.ParseDuration, as "5m" or "1h30m", more than zero: each duration a
// document gives is a limit, and one of no time allows nothing.
func (f *fields) duration(key string, need need) Field[time.Duration] {
	field := f.text(key, need)
	if !field.Given {
		return Field[time.Duration]{}
	}
	value, err := time.ParseDuration(field.Value)
	if err != nil {
		f.problem(field.Origin, f.at(key), `it is a duration, as "5m"`)
		return Field[time.Duration]{}
	}
	if value <= 0 {
		f.problem(field.Origin, f.at(key), "it is more than zero")
		return Field[time.Duration]{}
	}
	return Field[time.Duration]{Value: value, Origin: field.Origin, Given: true}
}

// amount is the field key, a number, whole or not, more than zero: a
// limit, and one of nothing allows nothing.
func (f *fields) amount(key string, need need) Field[float64] {
	node, ok := f.given(key, need)
	if !ok {
		return Field[float64]{}
	}
	var value float64
	switch node.Kind() {
	case tree.Integer:
		whole, _ := node.Integer()
		value = float64(whole)
	case tree.Number:
		value, _ = node.Number()
	default:
		f.typing.problems = append(f.typing.problems, at(node, f.at(key), notA(tree.Number, node.Kind())))
		return Field[float64]{}
	}
	if value <= 0 {
		f.typing.problems = append(f.typing.problems, at(node, f.at(key), "it is more than zero"))
		return Field[float64]{}
	}
	return Field[float64]{Value: value, Origin: originOf(node, f.at(key)), Given: true}
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

// references is the field key, a list of names of documents of kind, each
// given bare or with kind before it, and with its origin: none given where
// an item names another kind, each such item a problem at its place in the
// list.
func (f *fields) references(key string, need need, kind Kind) Field[[]Field[string]] {
	list := f.texts(key, need)
	if !list.Given {
		return Field[[]Field[string]]{}
	}
	node, _ := f.node.Get(key)
	names := []Field[string]{}
	for i, item := range node.Items() {
		value, _ := item.Text()
		name, ok := nameOf(kind, value)
		if !ok {
			f.typing.problems = append(f.typing.problems, at(item, f.item(key, i), namesA(kind)))
			continue
		}
		names = append(names, Field[string]{Value: name, Origin: originOf(item, f.item(key, i)), Given: true})
	}
	if len(names) < len(list.Value) {
		return Field[[]Field[string]]{}
	}
	return Field[[]Field[string]]{Value: names, Origin: list.Origin, Given: true}
}

// Value is a value a document gives: a text, or a reference, which holds
// what it reads in From, the zero reference for a text.
type Value struct {
	Text string
	From Reference
}

// Reference is what a reference reads (ADR-011, rules 3 and 4), typed
// whole, so no reader of a document parses its text: a param or an input,
// by Name; a repeat's state, by Name, or one Field of it; an item's
// outputs, by the item's Name, or one Field of them, and in Path the
// fields read within that Field, in order, as "stdout.head" reads the head
// of a bash call's stdout; an item's session; or the item of an all or any
// query, or one Field of it.
type Reference struct {
	Root  Root
	Name  string
	Field string
	Path  []string
}

// clone is the reference with a path of its own.
func (r Reference) clone() Reference {
	r.Path = slices.Clone(r.Path)
	return r
}

// Root is what a reference reads of.
type Root string

const (
	ReadsParam   Root = "param"
	ReadsInput   Root = "input"
	ReadsState   Root = "state"
	ReadsOutputs Root = "outputs"
	ReadsSession Root = "session"
	ReadsItem    Root = "item"
)

// readable is what the references of a place may read: the roots, as a
// reference spells them, in the order a problem names them; and whether
// the place is a workflow's, where the item of a query is read in the
// query's where alone.
type readable struct {
	roots    []string
	workflow bool
}

// formOf is how a reference spells what it reads of root.
func formOf(root string) string {
	switch root {
	case "state":
		return "state.<name>[.<field>]"
	case "steps":
		return "steps.<name>.<part>"
	case "item":
		return "item[.<field>]"
	}
	return root + ".<name>"
}

// referenceOf is what text reads, a reference's from: its root, the word
// before the first ".", and what it reads, false where it is none of its
// root's forms.
func referenceOf(text string) (string, Reference, bool) {
	parts := strings.Split(text, ".")
	root := parts[0]
	if slices.Contains(parts, "") {
		return root, Reference{}, false
	}
	switch n := len(parts); {
	case root == "params" && n == 2:
		return root, Reference{Root: ReadsParam, Name: parts[1]}, true
	case root == "inputs" && n == 2:
		return root, Reference{Root: ReadsInput, Name: parts[1]}, true
	case root == "state" && (n == 2 || n == 3):
		return root, Reference{Root: ReadsState, Name: parts[1], Field: fieldOf(parts, 2)}, true
	case root == "steps" && n == 3 && parts[2] == "session":
		return root, Reference{Root: ReadsSession, Name: parts[1]}, true
	case root == "steps" && n >= 3 && parts[2] == "outputs":
		reference := Reference{Root: ReadsOutputs, Name: parts[1], Field: fieldOf(parts, 3)}
		if n > 4 {
			reference.Path = parts[4:]
		}
		return root, reference, true
	case root == "item" && n <= 2:
		return root, Reference{Root: ReadsItem, Field: fieldOf(parts, 1)}, true
	}
	return root, Reference{}, false
}

// fieldOf is the part i of a reference, its field, "" where it has none.
func fieldOf(parts []string, i int) string {
	if i < len(parts) {
		return parts[i]
	}
	return ""
}

// value is the field key, a string, or a reference that reads what
// readable says.
func (f *fields) value(key string, need need, readable readable) Field[Value] {
	node, ok := f.given(key, need)
	if !ok {
		return Field[Value]{}
	}
	switch node.Kind() {
	case tree.String:
		text, _ := node.Text()
		return Field[Value]{Value: Value{Text: text}, Origin: originOf(node, f.at(key)), Given: true}
	case tree.Map:
		from := f.from(key, need, readable)
		if !from.Given {
			return Field[Value]{}
		}
		return Field[Value]{Value: Value{From: from.Value}, Origin: from.Origin, Given: true}
	}
	f.typing.problems = append(f.typing.problems, at(node, f.at(key), "it is a string, or a reference"))
	return Field[Value]{}
}

// from is the field key, a reference, {from: <what it reads>}, that reads
// what readable says. The field holds what it reads.
func (f *fields) from(key string, need need, readable readable) Field[Reference] {
	reference := f.mapping(key, need)
	if !reference.Given {
		return Field[Reference]{}
	}
	return reference.Value.reads(readable)
}

// reads is what the reference f reads, its one field from, in the form of
// one of readable's roots; a problem at the reference where it reads none
// of them.
func (f *fields) reads(readable readable) Field[Reference] {
	read := f.text("from", required)
	f.done()
	if !read.Given {
		return Field[Reference]{}
	}
	root, reference, typed := referenceOf(read.Value)
	switch {
	case root == "item" && readable.workflow && !slices.Contains(readable.roots, root):
		f.problem(originOf(f.node, f.place), f.place, "item is read in the where of all or any")
		return Field[Reference]{}
	case !typed || !slices.Contains(readable.roots, root):
		spelled := make([]string, len(readable.roots))
		for i, root := range readable.roots {
			spelled[i] = formOf(root)
		}
		f.problem(originOf(f.node, f.place), f.place, "it reads "+either(spelled))
		return Field[Reference]{}
	}
	return Field[Reference]{Value: reference, Origin: originOf(f.node, f.place), Given: true}
}

// Binding is a value given by name: a text, or what a reference reads.
type Binding struct {
	Name  string
	Value Value
}

// bindings is the field key, a map of values by name, each a string or a
// reference that reads what readable says, in the order of their names.
func (f *fields) bindings(key string, need need, readable readable) Field[[]Field[Binding]] {
	mapping := f.mapping(key, need)
	if !mapping.Given {
		return Field[[]Field[Binding]]{}
	}
	m := mapping.Value
	typed := []Field[Binding]{}
	for _, name := range m.node.Keys() {
		if value := m.value(name, required, readable); value.Given {
			typed = append(typed, Field[Binding]{Value: Binding{Name: name, Value: value.Value}, Origin: value.Origin, Given: true})
		}
	}
	return Field[[]Field[Binding]]{Value: typed, Origin: mapping.Origin, Given: true}
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
	return Field[[]string]{Value: values, Origin: originOf(node, f.at(key)), Given: true}
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
	return Field[[]*fields]{Value: items, Origin: originOf(node, f.at(key)), Given: true}
}

// mapping is the field key, a map, whose fields the kind's typer reads and
// then ends with done.
func (f *fields) mapping(key string, need need) Field[*fields] {
	node, ok := f.field(key, tree.Map, need)
	if !ok {
		return Field[*fields]{}
	}
	return Field[*fields]{Value: f.inner(key, node), Origin: originOf(node, f.at(key)), Given: true}
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
	return Field[[]entry]{Value: entries, Origin: originOf(node, f.at(key)), Given: true}
}

// inner is the fields of node, the map at key.
func (f *fields) inner(key string, node tree.Node) *fields {
	return &fields{typing: f.typing, node: node, place: f.at(key), known: map[string]bool{}}
}

// field is the field key, if it is given and of kind.
func (f *fields) field(key string, kind tree.Kind, need need) (tree.Node, bool) {
	node, ok := f.given(key, need)
	if !ok {
		return tree.Node{}, false
	}
	if node.Kind() != kind {
		f.typing.problems = append(f.typing.problems, at(node, f.at(key), notA(kind, node.Kind())))
		return tree.Node{}, false
	}
	return node, true
}

// given is the field key, of any type, if it is given; a field that must
// be given and is not is in no file.
func (f *fields) given(key string, need need) (tree.Node, bool) {
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

// originOf is the origin of node, the value at place.
func originOf(node tree.Node, place string) Origin {
	return Origin{Path: node.Origin().Path, Line: node.Origin().Line, Place: place}
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
