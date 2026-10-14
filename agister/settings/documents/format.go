package documents

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"slices"
	"strings"

	"github.com/BurntSushi/toml"
	"gopkg.in/yaml.v3"
)

// Format reads one file of a document into a tree: a map of keys, in the
// order the file wrote them, over values. A list is a value whole, the
// maps in it included.

type format int

const (
	yamlFormat format = iota
	tomlFormat
)

// node is a value of a tree: a map with its entries in order, or a leaf.
type node struct {
	isMap   bool
	entries []entry
	// value is a leaf's: a scalar as its file's parser read it, or a list
	// as []any, whose maps are map[string]any.
	value  any
	origin Origin
}

type entry struct {
	key   string
	value *node
}

func (n *node) entry(key string) *node {
	if n == nil {
		return nil
	}
	for _, entry := range n.entries {
		if entry.key == key {
			return entry.value
		}
	}
	return nil
}

// stamp gives n and everything under it origin.
func (n *node) stamp(origin Origin) {
	n.origin = origin
	for _, entry := range n.entries {
		entry.value.stamp(origin)
	}
}

// parse reads data, one file in f, into a tree. The file must hold one
// document that is a map whose keys are strings.
func parse(f format, data []byte) (*node, error) {
	if f == tomlFormat {
		return parseTOML(data)
	}
	return parseYAML(data)
}

func parseYAML(data []byte) (*node, error) {
	decoder := yaml.NewDecoder(bytes.NewReader(data))
	var document yaml.Node
	if err := decoder.Decode(&document); err != nil {
		if errors.Is(err, io.EOF) {
			return nil, errors.New("the file holds no document")
		}
		return nil, err
	}
	var next yaml.Node
	if err := decoder.Decode(&next); !errors.Is(err, io.EOF) {
		if err != nil {
			return nil, err
		}
		return nil, errors.New("the file holds more than one document")
	}
	root := document.Content[0]
	if root.Kind != yaml.MappingNode {
		return nil, fmt.Errorf("line %d: the document is not a map", root.Line)
	}
	return yamlMap(root)
}

func yamlMap(mapping *yaml.Node) (*node, error) {
	tree := &node{isMap: true}
	for i := 0; i < len(mapping.Content); i += 2 {
		key, value := mapping.Content[i], mapping.Content[i+1]
		if key.Kind != yaml.ScalarNode || key.Tag != "!!str" {
			return nil, fmt.Errorf("line %d: a key is not a string", key.Line)
		}
		if tree.entry(key.Value) != nil {
			return nil, fmt.Errorf("line %d: %s is given twice", key.Line, key.Value)
		}
		child, err := yamlValue(value)
		if err != nil {
			return nil, err
		}
		tree.entries = append(tree.entries, entry{key: key.Value, value: child})
	}
	return tree, nil
}

func yamlValue(value *yaml.Node) (*node, error) {
	if value.Kind == yaml.MappingNode {
		return yamlMap(value)
	}
	if value.Kind == yaml.AliasNode {
		return nil, fmt.Errorf("line %d: an alias is not read", value.Line)
	}
	var leaf any
	if err := value.Decode(&leaf); err != nil {
		return nil, err
	}
	return &node{value: leaf}, nil
}

func parseTOML(data []byte) (*node, error) {
	table := map[string]any{}
	meta, err := toml.Decode(string(data), &table)
	if err != nil {
		return nil, err
	}
	order := map[string]int{}
	for i, key := range meta.Keys() {
		if _, seen := order[key.String()]; !seen {
			order[key.String()] = i
		}
	}
	return tomlMap(table, nil, order), nil
}

// tomlMap is table, at path, with its keys in order, where each full key
// is placed by its first place in the file.
func tomlMap(table map[string]any, path []string, order map[string]int) *node {
	keys := make([]string, 0, len(table))
	for key := range table {
		keys = append(keys, key)
	}
	at := func(key string) int { return order[toml.Key(append(slices.Clone(path), key)).String()] }
	slices.SortFunc(keys, func(a, b string) int {
		if c := at(a) - at(b); c != 0 {
			return c
		}
		return strings.Compare(a, b)
	})
	tree := &node{isMap: true}
	for _, key := range keys {
		var child *node
		if inner, ok := table[key].(map[string]any); ok {
			child = tomlMap(inner, append(slices.Clone(path), key), order)
		} else {
			child = &node{value: tomlLeaf(table[key])}
		}
		tree.entries = append(tree.entries, entry{key: key, value: child})
	}
	return tree
}

// tomlLeaf is value with an array of tables as a list of maps.
func tomlLeaf(value any) any {
	tables, ok := value.([]map[string]any)
	if !ok {
		return value
	}
	list := make([]any, len(tables))
	for i, table := range tables {
		list[i] = table
	}
	return list
}
