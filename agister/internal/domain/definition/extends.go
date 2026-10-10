package definition

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strings"

	"gopkg.in/yaml.v3"
)

// A process may extend one base process of its layer (ADR-030 rule 9): a
// base is a process some process extends, and it extends nothing.

// processReference is how a process names its base: process:<name>.
const processReference = "process:"

// Extends is the base a process's document names in extends: "" where it
// names none, or none as process:<name>, which ParseProcess reports. The
// nearest of its layer files that holds the whole document names its base,
// and only its top-level keys are read: a file with other problems still
// says what it extends.
func Extends(doc Document) string {
	texts := ownTexts(doc)
	named := topLevel(texts[defining(texts)].Bytes)["extends"]
	if len(named) != 1 {
		return ""
	}
	return baseName(named[0])
}

// defining is the index, among a process's layer files nearest first, of
// the nearest that holds the whole document, the one that says what the
// process extends (ADR-030 rule 9). A file holds the whole document when
// it gives the header every process begins with, schema, name and type;
// the farthest does in any case, as the file that defines the process
// (ADR-028 rule 5). Any other file is a layer's partial.
func defining(texts []LayerText) int {
	for i, text := range texts {
		if whole(text) {
			return i
		}
	}
	return len(texts) - 1
}

// whole reports whether a layer's file gives the header of a process.
func whole(text LayerText) bool {
	keys := topLevel(text.Bytes)
	return len(keys["schema"]) > 0 && len(keys["name"]) > 0 && len(keys["type"]) > 0
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
	if name, ok := strings.CutPrefix(node.Value, processReference); ok && ValidName(name) {
		return name
	}
	return ""
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
// it. The base's files are composed first, then the process's over them,
// farthest first: maps merge by key, lists and scalars replace whole
// (ADR-028 rule 4), and name and extends are never the base's. Its layers
// are its own files and then the base's, each with the fields it gave;
// its texts stay its own.
//
// A partial that sets extends, a base that cannot be read, is of another
// layer or names a base of its own are problems of the process: it is
// returned as its own files compose it, with the error.
func Extended(process Document, own func(name string) (Document, error)) (Document, error) {
	texts := ownTexts(process)
	trees, err := layerTrees(texts)
	if err != nil {
		return process, nil // a problem of its own composition, which ParseProcess reports
	}
	at, err := named(texts, trees)
	if err != nil {
		return process, err
	}
	name := Extends(process)
	if name == "" && namesOnce(trees, at) {
		return process, nil
	}
	trees = namedOnce(trees, at)
	var whole *composedNode
	var baseTexts []LayerText
	var baseTrees []*composedNode
	if name != "" {
		base, err := own(name)
		if err != nil {
			return process, fmt.Errorf("extends %s%s: %v", processReference, name, err)
		}
		if baseTexts = ownTexts(base); !holds(baseTexts, texts[at].File.Layer) {
			return process, fmt.Errorf("extends %s%s, which the %s layer of %s does not define: a process extends a base of its own layer (ADR-030 rule 9)", processReference, name, texts[at].File.Layer, texts[at].File.Path)
		}
		if baseTrees, err = layerTrees(baseTexts); err != nil {
			return process, fmt.Errorf("extends %s%s: %v", processReference, name, err)
		}
		baseAt, err := named(baseTexts, baseTrees)
		if err != nil {
			return process, fmt.Errorf("extends %s%s: %v", processReference, name, err)
		}
		if baseTrees[baseAt].entry("extends") != nil {
			return process, fmt.Errorf("extends %s%s, which names extends too: a base extends nothing, one level only (ADR-030 rule 9)", processReference, name)
		}
		baseTrees = namedOnce(baseTrees, -1)
		for i := len(baseTrees) - 1; i >= 0; i-- {
			whole = merged(whole, baseTrees[i])
		}
		whole = without(whole, "name")
	}
	for i := len(trees) - 1; i >= 0; i-- {
		whole = merged(whole, trees[i])
	}
	data, err := rendered(KindProcess, whole)
	if err != nil {
		return process, err
	}
	extended := Document{Source: process.Source, Bytes: data}
	extended.Source.Layers = nil
	all := append(append([]*composedNode(nil), trees...), baseTrees...)
	for i, text := range append(append([]LayerText(nil), texts...), baseTexts...) {
		file := text.File
		file.Fields = given(all[i], whole, nil, []string{})
		extended.Source.Layers = append(extended.Source.Layers, file)
		if i < len(texts) {
			extended.Texts = append(extended.Texts, LayerText{File: file, Bytes: text.Bytes})
		}
	}
	sum := sha256.Sum256(data)
	extended.Source.SHA256 = hex.EncodeToString(sum[:])
	return extended, nil
}

// named is the index of the file that says what the process of texts,
// read as trees, extends; or why it cannot be said: a layer's partial sets
// extends, which only a file that holds the whole document says (ADR-030
// rule 9). A farther whole file may set it, and is not heard.
func named(texts []LayerText, trees []*composedNode) (int, error) {
	at := defining(texts)
	for i, tree := range trees {
		if tree.entry("extends") != nil && i != at && i != len(texts)-1 && !whole(texts[i]) {
			return at, fmt.Errorf("extends: is set in %s, a layer's partial: only the nearest file that holds the whole process, %s, names its base (ADR-030 rule 9)", texts[i].File.Path, texts[at].File.Path)
		}
	}
	return at, nil
}

// namesOnce reports whether no file but the one at at sets extends, so
// that the trees compose to what they composed to without its base.
func namesOnce(trees []*composedNode, at int) bool {
	for i, tree := range trees {
		if i != at && tree.entry("extends") != nil {
			return false
		}
	}
	return true
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

// holds reports whether one of a base's files in layer holds its whole
// document.
func holds(texts []LayerText, layer Layer) bool {
	for i, text := range texts {
		if text.File.Layer == layer && (whole(text) || i == len(texts)-1) {
			return true
		}
	}
	return false
}

// ownTexts are a process document's own layer files, nearest first: its
// one text where it has none, as a store of one file reads it.
func ownTexts(doc Document) []LayerText {
	if len(doc.Texts) > 0 {
		return doc.Texts
	}
	file := LayerFile{Layer: doc.Source.Layer, Path: doc.Source.Path, SHA256: doc.Source.SHA256}
	if len(doc.Source.Layers) > 0 {
		file = doc.Source.Layers[0]
	}
	return []LayerText{{File: file, Bytes: doc.Bytes}}
}

// layerTrees reads each of a process's layer files.
func layerTrees(texts []LayerText) ([]*composedNode, error) {
	trees := make([]*composedNode, len(texts))
	for i, text := range texts {
		tree, err := layerTree(KindProcess, text.Bytes)
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
