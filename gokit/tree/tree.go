// Package tree is a value tree whose every node keeps its origin: maps,
// lists, strings, integers, numbers and booleans, each with the path it was
// decoded from and its line. A tree is merged over another: maps merge by
// key at every depth, lists and scalars replace whole, nothing unsets.
//
// A node is a value: nothing changes it once it is made, so trees share
// nodes freely and merging changes neither tree.
package tree

import (
	"slices"
	"sort"
)

// Origin is where a node came from: the path its bytes were decoded from,
// and its line, 1 the first. The line is optional: 0 is none, as for a
// node decoded from a format that gives no line.
type Origin struct {
	Path string
	Line int
}

// Kind is what a node holds.
type Kind int

const (
	// Empty is the kind of a tree that holds no value, as decode gives for
	// bytes with none; the zero node.
	Empty Kind = iota
	Map
	List
	String
	Integer
	Number
	Boolean
)

func (k Kind) String() string {
	switch k {
	case Empty:
		return "empty"
	case Map:
		return "map"
	case List:
		return "list"
	case String:
		return "string"
	case Integer:
		return "integer"
	case Number:
		return "number"
	case Boolean:
		return "boolean"
	}
	return "unknown"
}

// Node is a value with its origin. The zero node is the empty tree.
type Node struct {
	kind    Kind
	origin  Origin
	text    string
	integer int64
	number  float64
	boolean bool
	items   []Node
	entries map[string]Node
}

// NewMap is a map of entries, from origin. The map is copied.
func NewMap(entries map[string]Node, origin Origin) Node {
	copied := make(map[string]Node, len(entries))
	for key, value := range entries {
		copied[key] = value
	}
	return Node{kind: Map, origin: origin, entries: copied}
}

// NewList is a list of items, from origin. The items are copied.
func NewList(items []Node, origin Origin) Node {
	return Node{kind: List, origin: origin, items: slices.Clone(items)}
}

// NewString is the string s, from origin.
func NewString(s string, origin Origin) Node {
	return Node{kind: String, origin: origin, text: s}
}

// NewInteger is the integer i, from origin.
func NewInteger(i int64, origin Origin) Node {
	return Node{kind: Integer, origin: origin, integer: i}
}

// NewNumber is the number f, from origin.
func NewNumber(f float64, origin Origin) Node {
	return Node{kind: Number, origin: origin, number: f}
}

// NewBoolean is the boolean b, from origin.
func NewBoolean(b bool, origin Origin) Node {
	return Node{kind: Boolean, origin: origin, boolean: b}
}

// Kind is what the node holds.
func (n Node) Kind() Kind { return n.kind }

// Origin is where the node came from; the empty tree has none.
func (n Node) Origin() Origin { return n.origin }

// Keys are a map's keys, sorted; none for any other node.
func (n Node) Keys() []string {
	keys := make([]string, 0, len(n.entries))
	for key := range n.entries {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

// Get is a map's value of key, and whether it has one.
func (n Node) Get(key string) (Node, bool) {
	value, ok := n.entries[key]
	return value, ok
}

// Items are a list's items; none for any other node.
func (n Node) Items() []Node { return slices.Clone(n.items) }

// Text is a string's text, and whether the node is a string.
func (n Node) Text() (string, bool) { return n.text, n.kind == String }

// Integer is an integer's value, and whether the node is an integer.
func (n Node) Integer() (int64, bool) { return n.integer, n.kind == Integer }

// Number is a number's value, and whether the node is a number.
func (n Node) Number() (float64, bool) { return n.number, n.kind == Number }

// Boolean is a boolean's value, and whether the node is a boolean.
func (n Node) Boolean() (bool, bool) { return n.boolean, n.kind == Boolean }
