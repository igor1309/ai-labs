package documents

import (
	"bytes"
	"encoding/json"
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
// maps in it included. The file holds only fields its kind knows, and the
// schema it names, if any, is its kind's (ADR-001, settings). A file taken
// whole is only read in its kind's format.

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

// read reads data, one file of a document of kind k, into a tree: in its
// kind's format, holding only its kind's fields, and naming its kind's
// schema if it names one. A file need not name it: a layer sets the fields
// it changes. Each problem is one error.
func read(k Kind, data []byte) (*node, []error) {
	written := k.written()
	tree, err := parse(written.format, data)
	if err != nil {
		return nil, []error{err}
	}
	var problems []error
	written.fields.check("", tree, &problems)
	if schema := tree.entry("schema"); schema != nil && (schema.isMap || schema.value != written.schema) {
		problems = append(problems, fmt.Errorf("schema: must be %q", written.schema))
	}
	return tree, problems
}

// readWhole reads data, the file of a document of kind k taken whole, in
// its kind's format: a schema is one JSON document, and a prompt or a
// skill is Markdown, which any text is.
func readWhole(k Kind, data []byte) error {
	if k != Schema {
		return nil
	}
	var document any
	if err := json.Unmarshal(data, &document); err != nil {
		return fmt.Errorf("the file is not one JSON document: %w", err)
	}
	return nil
}

// parse reads data, one file in f, into a tree. The file must hold one
// document that is a map whose keys are strings, as must every map in it.
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
	err := yamlEntries(mapping, func(key string) bool { return tree.entry(key) != nil }, func(key string, value *yaml.Node) error {
		var child *node
		if value.Kind == yaml.MappingNode {
			var err error
			if child, err = yamlMap(value); err != nil {
				return err
			}
		} else {
			leaf, err := yamlLeaf(value)
			if err != nil {
				return err
			}
			child = &node{value: leaf}
		}
		tree.entries = append(tree.entries, entry{key: key, value: child})
		return nil
	})
	return tree, err
}

// yamlEntries calls add for each entry of mapping, in order, once its key
// is known to be a string that given does not hold yet.
func yamlEntries(mapping *yaml.Node, given func(key string) bool, add func(key string, value *yaml.Node) error) error {
	for i := 0; i < len(mapping.Content); i += 2 {
		key, value := mapping.Content[i], mapping.Content[i+1]
		if key.Kind != yaml.ScalarNode || key.Tag != "!!str" {
			return fmt.Errorf("line %d: a key is not a string", key.Line)
		}
		if given(key.Value) {
			return fmt.Errorf("line %d: %s is given twice", key.Line, key.Value)
		}
		if err := add(key.Value, value); err != nil {
			return err
		}
	}
	return nil
}

// yamlLeaf is a value that is not a map of the tree: a scalar, or a list
// as []any whose maps are map[string]any, held to the tree's rules.
func yamlLeaf(value *yaml.Node) (any, error) {
	switch value.Kind {
	case yaml.AliasNode:
		return nil, fmt.Errorf("line %d: an alias is not read", value.Line)
	case yaml.SequenceNode:
		list := make([]any, len(value.Content))
		for i, item := range value.Content {
			var err error
			if list[i], err = yamlLeaf(item); err != nil {
				return nil, err
			}
		}
		return list, nil
	case yaml.MappingNode:
		table := map[string]any{}
		err := yamlEntries(value, func(key string) bool { _, ok := table[key]; return ok }, func(key string, value *yaml.Node) error {
			leaf, err := yamlLeaf(value)
			table[key] = leaf
			return err
		})
		return table, err
	}
	var leaf any
	if err := value.Decode(&leaf); err != nil {
		return nil, err
	}
	return leaf, nil
}

func parseTOML(data []byte) (*node, error) {
	table := map[string]any{}
	meta, err := toml.Decode(string(data), &table)
	if err != nil {
		return nil, err
	}
	// A table a dotted key or a header implies has no key of its own: it
	// takes the place of the first key under it.
	order := map[string]int{}
	for i, key := range meta.Keys() {
		for n := 1; n <= len(key); n++ {
			if _, seen := order[key[:n].String()]; !seen {
				order[key[:n].String()] = i
			}
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

// tomlLeaf is value with every array of tables in it, at any depth, as a
// list of maps.
func tomlLeaf(value any) any {
	switch value := value.(type) {
	case []map[string]any:
		list := make([]any, len(value))
		for i, table := range value {
			list[i] = tomlLeaf(table)
		}
		return list
	case []any:
		list := make([]any, len(value))
		for i, item := range value {
			list[i] = tomlLeaf(item)
		}
		return list
	case map[string]any:
		table := make(map[string]any, len(value))
		for key, item := range value {
			table[key] = tomlLeaf(item)
		}
		return table
	}
	return value
}
