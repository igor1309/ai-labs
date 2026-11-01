package definition

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strings"

	"gopkg.in/yaml.v3"

	"github.com/igor1309/ai-labs/agister/internal/domain/document"
)

// A process may extend one base process of its layer (ADR-030 rule 9): a
// base is a process some process extends, and it extends nothing.

// processReference is how a process names its base: process:<name>.
const processReference = "process:"

// Extends is the base a process's document names in extends: "" where it
// names none, or none as process:<name>, which ParseProcess reports. own
// reads a base as its own layer files compose it. The nearest of the
// process's layer files that holds the whole document names its base, and
// only its top-level keys are read: a file with other problems still says
// what it extends. A process none of whose files holds the whole document
// is broken, which Extended reports; the base its farthest file names is
// still named, so that a broken process does not make its base work.
func Extends(doc document.Document, own func(name string) (document.Document, error)) string {
	return NewExtender(own).Extends(doc)
}

// Extender says what processes extend, as Extends does, reading and
// composing each base once for all of them.
type Extender struct {
	own   func(name string) (document.Document, error)
	bases map[string]composedBase
}

// NewExtender returns an Extender whose bases own reads.
func NewExtender(own func(name string) (document.Document, error)) *Extender {
	return &Extender{own: own, bases: map[string]composedBase{}}
}

// Extends is the base doc names, as Extends says.
func (e *Extender) Extends(doc document.Document) string {
	texts := ownTexts(doc)
	files := newProcessFiles(doc.Source.Name, texts, e.own)
	files.bases = e.bases
	at := files.defining()
	if at < 0 {
		at = len(texts) - 1
	}
	return extendsOf(texts[at])
}

// extendsOf is the base a layer's file names, when it names one, once, as
// process:<name>; "" otherwise.
func extendsOf(text document.LayerText) string {
	named := topLevel(text.Bytes)["extends"]
	if len(named) != 1 {
		return ""
	}
	return baseName(named[0])
}

// processFiles are a process's own layer files, nearest first, read for
// which of them holds its whole document.
type processFiles struct {
	name  string
	texts []document.LayerText
	own   func(name string) (document.Document, error)
	// bases are the bases read, by name.
	bases map[string]composedBase
	// wholes are what whole has said of each file, by its index.
	wholes map[int]bool
}

func newProcessFiles(name string, texts []document.LayerText, own func(name string) (document.Document, error)) *processFiles {
	return &processFiles{name: name, texts: texts, own: own, bases: map[string]composedBase{}, wholes: map[int]bool{}}
}

// defining is the index of the nearest file that holds the whole
// document, the one that says what the process extends (ADR-030 rule 9);
// -1 where none does.
func (f *processFiles) defining() int {
	for i := range f.texts {
		if f.whole(i) {
			return i
		}
	}
	return -1
}

// whole reports whether the file at i holds the whole document: it is
// complete, so that it is a process on its own (ADR-028 rule 5), or
// complete over the base it names, which may leave out what the process
// sets as the process may leave out what the base gives (ADR-030 rule 9).
// Nothing in a file marks it whole: every layer's file is a partial, and
// a whole one is only the case that sets every field (ADR-028 rule 4).
func (f *processFiles) whole(i int) bool {
	if whole, ok := f.wholes[i]; ok {
		return whole
	}
	unset, ok := f.unset(i)
	f.wholes[i] = ok && len(unset) == 0
	return f.wholes[i]
}

// unset are the fields a process requires that the file at i leaves out,
// alone or over the base it names, whichever leaves out fewer; ok is false
// for a file that is not one YAML mapping.
func (f *processFiles) unset(i int) (fields []string, ok bool) {
	tree := looseTree(f.texts[i].Bytes)
	if tree == nil {
		return nil, false
	}
	fields = unsetFields(f.name, tree)
	if base := extendsOf(f.texts[i]); base != "" && len(fields) > 0 {
		if composed := f.base(base); composed.err == nil {
			if over := unsetFields(f.name, merged(composed.tree, tree)); len(over) < len(fields) {
				fields = over
			}
		}
	}
	return fields, true
}

// composedBase is a base as its layers compose it, without name and
// extends, which are never taken from it; or why it cannot be read or
// composed.
type composedBase struct {
	tree *composedNode
	err  error
}

// base is the base name as its layers compose it.
func (f *processFiles) base(name string) composedBase {
	if composed, ok := f.bases[name]; ok {
		return composed
	}
	var composed composedBase
	doc, err := f.own(name)
	var trees []*composedNode
	if err == nil {
		trees, err = layerTrees(ownTexts(doc))
	}
	if err != nil {
		composed.err = fmt.Errorf("extends %s%s: %v", processReference, name, err)
	} else {
		for i := len(trees) - 1; i >= 0; i-- {
			composed.tree = merged(composed.tree, trees[i])
		}
		composed.tree = without(without(composed.tree, "name"), "extends")
	}
	f.bases[name] = composed
	return composed
}

// named is the index of the file that says what the process, its files
// read as trees, extends: the nearest that holds its whole document, or
// -1 where none does. It fails where a file names a base other than as
// process:<name>, or where a layer's partial sets extends, which only
// that file says (ADR-030 rule 9): so -1 comes with an error unless no
// file sets extends.
func (f *processFiles) named(trees []*composedNode) (int, error) {
	for i, tree := range trees {
		if node := tree.entry("extends"); node != nil && extendsOf(f.texts[i]) == "" {
			return -1, fmt.Errorf(`extends: must be "process:<name>" (set in %s)`, f.texts[i].File.Path)
		}
	}
	at := f.defining()
	for i, tree := range trees {
		if tree.entry("extends") == nil || f.whole(i) {
			continue
		}
		if at >= 0 {
			return at, fmt.Errorf("extends: is set in %s, a layer's partial: only the nearest file that holds the whole process, %s, names its base (ADR-030 rule 9)", f.texts[i].File.Path, f.texts[at].File.Path)
		}
		// What it is not whole for is said: a base that cannot be read, or
		// what it leaves out.
		if err := f.base(extendsOf(f.texts[i])).err; err != nil {
			return at, err
		}
		unset, _ := f.unset(i)
		return at, fmt.Errorf("extends: is set in %s, which leaves out %s even over the base it names, and so is a layer's partial: only a file that holds the whole process names its base, and none of its files does (ADR-030 rule 9)", f.texts[i].File.Path, strings.Join(unset, ", "))
	}
	return at, nil
}

// Extended is process, composed from its own layer files, laid over the
// base it names in extends (ADR-030 rule 9); a process that names none,
// in any of its files, is returned as it is. own reads a process as its
// own layer files compose it.
//
// The nearest of the process's files that holds the whole document says
// what it extends: the extends of a farther whole file is not composed,
// and a layer's partial that sets it is a problem of the process. The
// base must hold the whole document in the layer of the file that names
// it: its file there, under that one, is complete. The base's files are
// composed first, then the process's over them, farthest first: maps
// merge by key, lists and scalars replace whole (ADR-028 rule 4), and
// name and extends are never the base's. Its layers are its own files and
// then the base's, each with the fields it gave and the process whose file
// it is; its texts stay its own.
//
// A partial that sets extends, a base that cannot be read, is of another
// layer or names a base of its own are problems of the process: it is
// returned as its own files compose it, with the error. So is a file of a
// process that declares extends and does not compose: read whole, it
// would run without the base it names, or past the rules on it.
func Extended(process document.Document, own func(name string) (document.Document, error)) (document.Document, error) {
	texts := ownTexts(process)
	if !declares(texts) {
		return process, nil
	}
	trees, err := layerTrees(texts)
	if err != nil {
		return process, err
	}
	at, err := newProcessFiles(process.Source.Name, texts, own).named(trees)
	if err != nil || at < 0 {
		return process, err // at < 0: no file sets extends
	}
	name := extendsOf(texts[at])
	var whole *composedNode
	var baseTexts []document.LayerText
	var baseTrees []*composedNode
	if name != "" {
		base, err := own(name)
		if err != nil {
			return process, fmt.Errorf("extends %s%s: %v", processReference, name, err)
		}
		baseTexts = ownTexts(base)
		if baseTrees, err = layerTrees(baseTexts); err != nil {
			return process, fmt.Errorf("extends %s%s: %v", processReference, name, err)
		}
		if declares(baseTexts) {
			baseAt, err := newProcessFiles(name, baseTexts, own).named(baseTrees)
			if err != nil {
				return process, fmt.Errorf("extends %s%s: %v", processReference, name, err)
			}
			if baseAt < 0 || extendsOf(baseTexts[baseAt]) != "" {
				return process, fmt.Errorf("extends %s%s, which names extends too: a base extends nothing, one level only (ADR-030 rule 9)", processReference, name)
			}
		}
		if !holds(process.Source.Name, baseTexts, baseTrees, texts[at].File.Layer, trees[at]) {
			return process, fmt.Errorf("extends %s%s, which the %s layer of %s does not define: a process extends a base of its own layer (ADR-030 rule 9)", processReference, name, texts[at].File.Layer, texts[at].File.Path)
		}
		baseTrees = namedOnce(baseTrees, -1)
		for i := len(baseTrees) - 1; i >= 0; i-- {
			whole = merged(whole, baseTrees[i])
		}
		whole = without(whole, "name")
	}
	trees = namedOnce(trees, at)
	for i := len(trees) - 1; i >= 0; i-- {
		whole = merged(whole, trees[i])
	}
	data, err := rendered(document.KindProcess, whole)
	if err != nil {
		return process, err
	}
	extended := document.Document{Source: process.Source, Bytes: data}
	extended.Source.Layers = nil
	all := append(append([]*composedNode(nil), trees...), baseTrees...)
	for i, text := range append(append([]document.LayerText(nil), texts...), baseTexts...) {
		file := text.File
		file.Fields = given(all[i], whole, nil, []string{})
		file.Process = process.Source.Name
		if i >= len(texts) {
			file.Process = name
		}
		extended.Source.Layers = append(extended.Source.Layers, file)
		if i < len(texts) {
			extended.Texts = append(extended.Texts, document.LayerText{File: file, Bytes: text.Bytes})
		}
	}
	sum := sha256.Sum256(data)
	extended.Source.SHA256 = hex.EncodeToString(sum[:])
	return extended, nil
}

// namedOnce are trees without extends, but in the tree at at: a farther
// file that holds the whole document says nothing of the base (ADR-030
// rule 9).
func namedOnce(trees []*composedNode, at int) []*composedNode {
	kept := make([]*composedNode, len(trees))
	for i, tree := range trees {
		kept[i] = tree
		if i != at && tree.entry("extends") != nil {
			kept[i] = without(tree, "extends")
		}
	}
	return kept
}

// declares reports whether any of a process's files sets extends.
func declares(texts []document.LayerText) bool {
	for _, text := range texts {
		if len(topLevel(text.Bytes)["extends"]) > 0 {
			return true
		}
	}
	return false
}

// holds reports whether the base, its files texts read as trees, holds its
// whole document in layer for the process name, whose file there is over:
// the base's file in layer, under over, is complete (ADR-030 rule 9).
func holds(name string, texts []document.LayerText, trees []*composedNode, layer document.Layer, over *composedNode) bool {
	for i, text := range texts {
		if text.File.Layer == layer && len(unsetFields(name, merged(without(without(trees[i], "name"), "extends"), over))) == 0 {
			return true
		}
	}
	return false
}

// unsetFields are the fields a process named name requires that tree, a
// mapping, leaves out.
func unsetFields(name string, tree *composedNode) []string {
	data, err := rendered(document.KindProcess, tree)
	if err != nil {
		return []string{"(unreadable)"}
	}
	source := document.Source{Kind: document.KindProcess, Name: name}
	p := problemsOf(source)
	parseProcess(document.Document{Source: source, Bytes: data}, p)
	return p.absent
}

// looseTree reads a process's layer file as ParseProcess reads its keys,
// so that a file with other problems still says what it sets: a key
// declared more than once is its last. Nil for a file that is not one YAML
// mapping, or that holds an alias.
func looseTree(data []byte) *composedNode {
	root := parseOneYAML(data, &problems{})
	if root == nil || root.Kind != yaml.MappingNode || plain(root) != nil {
		return nil
	}
	return looseNode(root)
}

func looseNode(node *yaml.Node) *composedNode {
	if node.Kind != yaml.MappingNode {
		return &composedNode{value: node}
	}
	tree := &composedNode{isMap: true, value: node}
	for i := 0; i+1 < len(node.Content); i += 2 {
		name, value := node.Content[i], looseNode(node.Content[i+1])
		at := -1
		for j := range tree.entries {
			if tree.entries[j].key == name.Value {
				at = j
			}
		}
		if at >= 0 {
			tree.entries[at].value = value
			continue
		}
		tree.entries = append(tree.entries, composedEntry{key: name.Value, name: name, value: value})
	}
	return tree
}

// topLevel are the values of a YAML mapping's top-level keys, each key's
// in the file's order; none for a text that is not one mapping.
func topLevel(data []byte) map[string][]*yaml.Node {
	var root yaml.Node
	if yaml.Unmarshal(data, &root) != nil || len(root.Content) == 0 || root.Content[0].Kind != yaml.MappingNode {
		return nil
	}
	keys := map[string][]*yaml.Node{}
	content := root.Content[0].Content
	for i := 0; i+1 < len(content); i += 2 {
		keys[content[i].Value] = append(keys[content[i].Value], content[i+1])
	}
	return keys
}

// baseName is the base node names as process:<name>; "" for any other
// value.
func baseName(node *yaml.Node) string {
	if node.Kind != yaml.ScalarNode {
		return ""
	}
	if name, ok := strings.CutPrefix(node.Value, processReference); ok && document.ValidName(name) {
		return name
	}
	return ""
}

// ownTexts are a process document's own layer files, nearest first: its
// one text where it has none, as a store of one file reads it.
func ownTexts(doc document.Document) []document.LayerText {
	if len(doc.Texts) > 0 {
		return doc.Texts
	}
	file := document.LayerFile{Layer: doc.Source.Layer, Path: doc.Source.Path, SHA256: doc.Source.SHA256}
	if len(doc.Source.Layers) > 0 {
		file = doc.Source.Layers[0]
	}
	return []document.LayerText{{File: file, Bytes: doc.Bytes}}
}

// layerTrees reads each of a process's layer files.
func layerTrees(texts []document.LayerText) ([]*composedNode, error) {
	trees := make([]*composedNode, len(texts))
	for i, text := range texts {
		tree, err := layerTree(document.KindProcess, text.Bytes)
		if err != nil {
			return nil, fmt.Errorf("%s: %v", text.File.Path, err)
		}
		trees[i] = tree
	}
	return trees, nil
}

// without is the map tree without its top-level key. It changes neither:
// its value is a new mapping, so nothing renders the key from it.
func without(tree *composedNode, key string) *composedNode {
	kept := &composedNode{isMap: true, value: &yaml.Node{Kind: yaml.MappingNode, Tag: "!!map"}}
	for _, entry := range tree.entries {
		if entry.key != key {
			kept.entries = append(kept.entries, entry)
		}
	}
	return kept
}
