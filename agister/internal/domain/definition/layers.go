package definition

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"path/filepath"
	"sort"
	"strings"

	"github.com/BurntSushi/toml"
	"gopkg.in/yaml.v3"
)

// Settings are layered by field (ADR-028): a document is composed from
// every layer that holds it, the nearest layer winning field by field.

// Layer names a settings layer (ADR-028 rule 1).
type Layer string

const (
	// LayerHome is Agister's home, ~/.agister.
	LayerHome Layer = "home"
	// LayerRepository is the .agister of the worktree's root.
	LayerRepository Layer = "repository"
	// LayerProject is the .agister of the project directory a command is
	// launched in, below the root.
	LayerProject Layer = "project"
)

// LayerFile is one layer's file of a document.
type LayerFile struct {
	Layer  Layer
	Path   string
	SHA256 string
	// Fields are the fields the file gave the composition, in the file's
	// order: each the path of a leaf, its keys joined by "."; a leaf is a
	// scalar, a list or an empty map (ADR-028 rule 11). Never nil on a
	// composed document, empty when the file gave nothing; nil on a
	// document taken whole, which has no fields.
	Fields []string
}

// LayerText is one layer's file of a document, and what it holds.
type LayerText struct {
	File  LayerFile
	Bytes []byte
}

// LayerDir is one layer a command selected: its settings directory, and
// what makes the layer invalid (ADR-028 rules 1 and 7).
type LayerDir struct {
	Layer   Layer
	Dir     string
	Invalid []LayerProblem
}

// LayerProblem is one thing that makes a layer invalid: a problem of the
// layer and of no document in it, so it stops every command launched
// under it (ADR-028 rule 1).
type LayerProblem struct {
	Path   string // at fault
	Reason string
}

// Composed reports whether a document of kind is composed from the layers
// that hold it (ADR-028 rule 4). A prompt, a skill and a schema are taken
// whole from the nearest layer (rule 6), and so are the two singletons no
// call reads: a repository's blocks, which are one layer's alone (rule 7),
// and the obsolete workspace settings.
func Composed(kind Kind) bool {
	switch kind {
	case KindService, KindAgent, KindProcess, KindPolicy, KindRuntime, KindWorkflow, KindVerify, KindBrief:
		return true
	}
	return false
}

// tabled reports whether a document of kind is TOML; the other composed
// kinds are YAML.
func tabled(kind Kind) bool { return kind == KindService || kind == KindAgent }

// Attribute names, in the message of a problem of field, the layer file
// that set the field at fault; a field no layer sets names every layer
// file read (ADR-028 rule 5). A file sets the field when it gave that leaf
// or one below it: a map it gave above the field, such as an empty one,
// sets none of the fields below. The message of a document one file holds
// is unchanged: its subject names that file.
func (s Source) Attribute(field, message string) string {
	if len(s.Layers) < 2 || !Composed(s.Kind) || field == "" {
		return message
	}
	if cut := strings.IndexByte(field, '['); cut >= 0 {
		field = field[:cut] // a list is one field
	}
	var set, read []string
	for _, layer := range s.Layers {
		read = append(read, layer.Path)
		for _, leaf := range layer.Fields {
			if leaf == field || strings.HasPrefix(leaf, field+".") {
				set = append(set, layer.Path)
				break
			}
		}
	}
	if len(set) == 0 {
		return message + " (no layer sets it: " + strings.Join(read, ", ") + ")"
	}
	return message + " (set in " + strings.Join(set, ", ") + ")"
}

// Compose composes a document of kind from the layer files that hold it,
// nearest first, and returns its text and each file with the fields it
// gave (ADR-028 rule 4). The document is composed from the farthest layer
// to the nearest, key by key: a map merges by key at every depth, a key
// only the nearer layer holds added after the parent's; a list or a
// scalar replaces whole, as do unlike values; nothing unsets, and an empty
// map over a map changes nothing.
//
// A document one file holds is that file's text, unchanged, whatever it
// holds: its kind's rules are checked on it as on any composition (rule
// 5). Each of several files must be one YAML document that is a mapping,
// or one TOML table; one that is not breaks the document, and the error
// names it.
func Compose(kind Kind, texts []LayerText) ([]byte, []LayerFile, error) {
	files := make([]LayerFile, len(texts))
	trees := make([]*composedNode, len(texts))
	for i, text := range texts {
		files[i] = text.File
		files[i].Fields = []string{}
	}
	for i, text := range texts {
		tree, err := layerTree(kind, text.Bytes)
		if err != nil && len(texts) > 1 {
			return nil, files, fmt.Errorf("%s: %v", text.File.Path, err)
		}
		trees[i] = tree
	}
	if len(texts) == 0 {
		return nil, nil, ErrNotFound
	}
	var whole *composedNode
	for i := len(trees) - 1; i >= 0; i-- {
		if trees[i] != nil {
			whole = merged(whole, trees[i])
		}
	}
	for i, tree := range trees {
		if tree != nil {
			files[i].Fields = given(tree, whole, nil, []string{})
		}
	}
	if len(texts) == 1 {
		return texts[0].Bytes, files, nil
	}
	data, err := rendered(kind, whole)
	return data, files, err
}

// WithHome is doc, a composed kind's document, as writing home to the home
// layer would make it: composed from the files of doc's nearer layers as
// doc has them, with home in place of home's file, or beneath them where
// the home layer holds none (ADR-028 rule 4). A nearer file that does not
// compose with home breaks it, as Compose says.
func WithHome(doc Document, home LayerText) (Document, error) {
	texts := make([]LayerText, 0, len(doc.Texts)+1)
	for _, text := range doc.Texts {
		if text.File.Layer != LayerHome {
			texts = append(texts, text)
		}
	}
	texts = append(texts, home)
	data, files, err := Compose(doc.Source.Kind, texts)
	source := Source{Kind: doc.Source.Kind, Name: doc.Source.Name, Layer: texts[0].File.Layer, Path: texts[0].File.Path, Layers: files}
	if err != nil {
		return Document{Source: source}, err
	}
	for i := range texts {
		texts[i].File = files[i]
	}
	sum := sha256.Sum256(data)
	source.SHA256 = hex.EncodeToString(sum[:])
	return Document{Source: source, Bytes: data, Texts: texts}, nil
}

// composedNode is a value of a layer's file or of the composition: a map,
// with its entries in order, or a leaf.
type composedNode struct {
	// entries are a map's; nil on a scalar and a list.
	entries []composedEntry
	isMap   bool
	// value is the value as its file's parser read it: a *yaml.Node, or
	// what a TOML key decodes to.
	value any
}

type composedEntry struct {
	key string
	// name is the key as its YAML file wrote it; nil in a TOML table.
	name  *yaml.Node
	value *composedNode
}

func (n *composedNode) entry(key string) *composedNode {
	for _, entry := range n.entries {
		if entry.key == key {
			return entry.value
		}
	}
	return nil
}

// merged is over composed onto base, which may be nil. It changes neither:
// what both leave unchanged is shared.
func merged(base, over *composedNode) *composedNode {
	if base == nil || !base.isMap || !over.isMap {
		return over // unlike values, a list and a scalar replace whole
	}
	if len(over.entries) == 0 {
		return base // an empty map over a map changes nothing
	}
	result := &composedNode{isMap: true, value: base.value, entries: append([]composedEntry(nil), base.entries...)}
	for _, entry := range over.entries {
		at := -1
		for i := range result.entries {
			if result.entries[i].key == entry.key {
				at = i
			}
		}
		if at < 0 {
			result.entries = append(result.entries, entry)
			continue
		}
		result.entries[at].value = merged(result.entries[at].value, entry.value)
	}
	return result
}

// given appends to fields the leaves of tree, a layer's file, that the
// composition whole holds as that file gave them, in the file's order.
func given(tree, whole *composedNode, path []string, fields []string) []string {
	if tree == whole && (!tree.isMap || len(tree.entries) == 0) {
		return append(fields, strings.Join(path, "."))
	}
	if whole == nil || !tree.isMap || !whole.isMap {
		return fields
	}
	for _, entry := range tree.entries {
		fields = given(entry.value, whole.entry(entry.key), append(path, entry.key), fields)
	}
	return fields
}

// layerTree reads one layer's file of a document of kind.
func layerTree(kind Kind, data []byte) (*composedNode, error) {
	p := &problems{}
	if tabled(kind) {
		if !readable(data, p) {
			return nil, fmt.Errorf("%s", p.list[0].Message)
		}
		table := map[string]any{}
		meta, err := toml.Decode(string(data), &table)
		if err != nil {
			return nil, err
		}
		order := map[string]int{}
		for i, key := range meta.Keys() {
			if _, seen := order[strings.Join(key, "\x00")]; !seen {
				order[strings.Join(key, "\x00")] = i
			}
		}
		return tableTree(table, nil, order), nil
	}
	root := parseOneYAML(data, p)
	if root == nil {
		return nil, fmt.Errorf("%s", p.list[0].Message)
	}
	if root.Kind != yaml.MappingNode {
		return nil, fmt.Errorf("a layer's file must be a mapping")
	}
	if err := plain(root); err != nil {
		return nil, err
	}
	return mappingTree(root, "")
}

// mappingTree reads a YAML value. A layer's file names each key once.
func mappingTree(node *yaml.Node, field string) (*composedNode, error) {
	if node.Kind != yaml.MappingNode {
		return &composedNode{value: node}, nil
	}
	tree := &composedNode{isMap: true, value: node}
	for i := 0; i+1 < len(node.Content); i += 2 {
		name := node.Content[i]
		if name.Kind != yaml.ScalarNode {
			return nil, fmt.Errorf("%s", fieldMessage(field, "a key must be a scalar"))
		}
		if tree.entry(name.Value) != nil {
			return nil, fmt.Errorf("%s", fieldMessage(join(field, name.Value), "is declared more than once"))
		}
		value, err := mappingTree(node.Content[i+1], join(field, name.Value))
		if err != nil {
			return nil, err
		}
		tree.entries = append(tree.entries, composedEntry{key: name.Value, name: name, value: value})
	}
	return tree, nil
}

// plain fails for a YAML value that holds an alias: a composition reads
// each value where its layer wrote it. It drops what a composition does
// not carry: the anchors nothing may refer to, and the comments.
func plain(node *yaml.Node) error {
	if node.Kind == yaml.AliasNode {
		return fmt.Errorf("holds a YAML alias (*%s), which a layer's file cannot", node.Value)
	}
	node.Anchor, node.HeadComment, node.LineComment, node.FootComment = "", "", "", ""
	for _, inner := range node.Content {
		if err := plain(inner); err != nil {
			return err
		}
	}
	return nil
}

// tableTree reads a TOML value: a table is a map, and an array a list, an
// array of tables included. order is where each key stands in the file.
func tableTree(value any, path []string, order map[string]int) *composedNode {
	table, ok := value.(map[string]any)
	if !ok {
		return &composedNode{value: value}
	}
	tree := &composedNode{isMap: true, value: value}
	keys := make([]string, 0, len(table))
	for key := range table {
		keys = append(keys, key)
	}
	at := func(key string) int {
		if i, ok := order[strings.Join(append(append([]string(nil), path...), key), "\x00")]; ok {
			return i
		}
		return len(order)
	}
	sort.Slice(keys, func(i, j int) bool {
		if at(keys[i]) != at(keys[j]) {
			return at(keys[i]) < at(keys[j])
		}
		return keys[i] < keys[j]
	})
	for _, key := range keys {
		tree.entries = append(tree.entries, composedEntry{key: key, value: tableTree(table[key], append(append([]string(nil), path...), key), order)})
	}
	return tree
}

// rendered is the composition as the text of a document of kind, which
// its kind's parser reads as it reads a file.
func rendered(kind Kind, whole *composedNode) ([]byte, error) {
	var buffer bytes.Buffer
	if tabled(kind) {
		if err := toml.NewEncoder(&buffer).Encode(tableValue(whole)); err != nil {
			return nil, err
		}
		return buffer.Bytes(), nil
	}
	encoder := yaml.NewEncoder(&buffer)
	encoder.SetIndent(2)
	if err := encoder.Encode(mappingValue(whole)); err != nil {
		return nil, err
	}
	if err := encoder.Close(); err != nil {
		return nil, err
	}
	return buffer.Bytes(), nil
}

func mappingValue(tree *composedNode) *yaml.Node {
	if !tree.isMap || len(tree.entries) == 0 {
		return tree.value.(*yaml.Node)
	}
	node := &yaml.Node{Kind: yaml.MappingNode, Tag: "!!map"}
	for _, entry := range tree.entries {
		node.Content = append(node.Content, entry.name, mappingValue(entry.value))
	}
	return node
}

func tableValue(tree *composedNode) any {
	if !tree.isMap {
		return tree.value
	}
	table := make(map[string]any, len(tree.entries))
	for _, entry := range tree.entries {
		table[entry.key] = tableValue(entry.value)
	}
	return table
}

// LayerSchema is the schema of a layer's layer.yaml (ADR-028 rule 9).
const LayerSchema = "agister.layer/v1alpha1"

// LayerSettings is what a repository or project layer's layer.yaml says
// of the layer itself (ADR-028 rule 9). It is read for its own layer only
// (rule 7).
type LayerSettings struct {
	// Prompts are the folders its prompts are also found in, in order,
	// each relative to the directory that holds the layer's .agister.
	Prompts []string
}

// ParseLayer reads a layer's layer.yaml. Each folder it lists must be a
// relative path that stays inside the directory it is relative to: not
// absolute and with no "..". Whether it exists, and where its links lead,
// is the reader's to check.
func ParseLayer(data []byte) (LayerSettings, error) {
	p := &problems{}
	var settings LayerSettings
	root := parseOneYAML(data, p)
	if root == nil {
		return settings, p.err("layer.yaml")
	}
	unique(root, "", p)
	values := fields(root, "", []string{"schema", "prompts"}, p)
	if _, ok := values["schema"]; !ok {
		p.add("schema", "is required")
	} else if value, ok := scalar(values["schema"], "schema", p); ok {
		checkSchema(value, LayerSchema, p)
	}
	for i, folder := range stringList(values["prompts"], "prompts", p) {
		at := fieldIndex("prompts", i)
		switch {
		case folder == "":
			p.add(at, "must not be empty")
		case !filepath.IsLocal(folder):
			p.add(at, "%q is not inside the directory that holds .agister: name a folder there by a relative path with no ..", folder)
		case contains(settings.Prompts, filepath.Clean(folder)):
			p.add(at, "%q is listed twice", folder)
		default:
			settings.Prompts = append(settings.Prompts, filepath.Clean(folder))
		}
	}
	return settings, p.err("layer.yaml")
}
