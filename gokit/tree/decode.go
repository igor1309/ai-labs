package tree

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"maps"
	"slices"
	"time"

	"github.com/BurntSushi/toml"
	"gopkg.in/yaml.v3"
)

// Format is the format of the bytes decode reads.
type Format int

const (
	YAML Format = iota + 1
	TOML
)

func (f Format) String() string {
	switch f {
	case YAML:
		return "YAML"
	case TOML:
		return "TOML"
	}
	return "unknown"
}

// Problem is one thing wrong with the bytes decode was given: the place of
// the node it is at, as "a.b[0]", "" for the bytes as a whole; where that
// node came from; and what is wrong.
type Problem struct {
	Place   string
	Origin  Origin
	Message string
}

// String is the problem as "<path>[:<line>]: [<place>: ]<message>".
func (p Problem) String() string {
	at := p.Origin.Path
	if p.Origin.Line > 0 {
		at = fmt.Sprintf("%s:%d", at, p.Origin.Line)
	}
	if p.Place != "" {
		at += ": " + p.Place
	}
	return at + ": " + p.Message
}

// Decode is the tree data holds in format, every node from path, which is
// kept as given and never read. Bytes that hold no value are the empty
// tree; YAML bytes hold one document at most. Bytes with a problem give no
// tree: the node is the empty one, and the problems say why, every bad
// value one.
func Decode(format Format, data []byte, path string) (Node, []Problem) {
	var d decoder
	var top Node
	switch format {
	case YAML:
		top = d.yaml(data, path)
	case TOML:
		top = d.toml(data, path)
	default:
		d.add("", Origin{Path: path}, "the format %s is unknown", format)
	}
	if len(d.problems) > 0 {
		return Node{}, d.problems
	}
	return top, nil
}

// decoder gathers the problems of one decode.
type decoder struct {
	problems []Problem
}

func (d *decoder) add(place string, origin Origin, format string, args ...any) {
	d.problems = append(d.problems, Problem{Place: place, Origin: origin, Message: fmt.Sprintf(format, args...)})
}

func key(place, k string) string {
	if place == "" {
		return k
	}
	return place + "." + k
}

func item(place string, i int) string { return fmt.Sprintf("%s[%d]", place, i) }

func (d *decoder) yaml(data []byte, path string) Node {
	// A decoder, not Unmarshal: Unmarshal reads the first document and
	// passes over any after it.
	documents := yaml.NewDecoder(bytes.NewReader(data))
	var document yaml.Node
	if err := documents.Decode(&document); errors.Is(err, io.EOF) {
		return Node{}
	} else if err != nil {
		d.add("", Origin{Path: path}, "%v", err)
		return Node{}
	}
	if err := documents.Decode(&yaml.Node{}); err == nil {
		d.add("", Origin{Path: path}, "the bytes hold more than one document")
		return Node{}
	} else if !errors.Is(err, io.EOF) {
		d.add("", Origin{Path: path}, "%v", err)
		return Node{}
	}
	if len(document.Content) == 0 {
		return Node{}
	}
	top := document.Content[0]
	// A null at the top is bytes that hold no value, not a key without one.
	if top.Kind == yaml.ScalarNode && top.ShortTag() == "!!null" {
		return Node{}
	}
	// The top's line is 1 whatever the line its value starts on: the top is
	// the bytes as a whole.
	return d.yamlNode(top, "", Origin{Path: path, Line: 1}, "the item")
}

// yamlNode is n at place, from origin. what names n in a problem with no
// value: the key or the item.
func (d *decoder) yamlNode(n *yaml.Node, place string, origin Origin, what string) Node {
	switch n.Kind {
	case yaml.MappingNode:
		entries := make(map[string]Node, len(n.Content)/2)
		for i := 0; i+1 < len(n.Content); i += 2 {
			name, value := n.Content[i], n.Content[i+1]
			at := Origin{Path: origin.Path, Line: name.Line}
			if name.Kind != yaml.ScalarNode || name.ShortTag() != "!!str" {
				d.add(place, at, "a key must be a string")
				continue
			}
			if _, seen := entries[name.Value]; seen {
				d.add(key(place, name.Value), at, "the key is given more than once")
				continue
			}
			entries[name.Value] = d.yamlNode(value, key(place, name.Value), at, "the key")
		}
		return NewMap(entries, origin)
	case yaml.SequenceNode:
		items := make([]Node, 0, len(n.Content))
		for i, inner := range n.Content {
			items = append(items, d.yamlNode(inner, item(place, i), Origin{Path: origin.Path, Line: inner.Line}, "the item"))
		}
		return NewList(items, origin)
	case yaml.ScalarNode:
		return d.yamlScalar(n, place, origin, what)
	case yaml.AliasNode:
		// Every value is where its bytes give it, so its origin is its own.
		d.add(place, origin, "an alias is no value of a tree")
		return Node{}
	}
	d.add(place, origin, "a YAML node of kind %d is no value of a tree", n.Kind)
	return Node{}
}

func (d *decoder) yamlScalar(n *yaml.Node, place string, origin Origin, what string) Node {
	var err error
	switch tag := n.ShortTag(); tag {
	case "!!str":
		return NewString(n.Value, origin)
	case "!!int":
		var i int64
		if err = n.Decode(&i); err == nil {
			return NewInteger(i, origin)
		}
	case "!!float":
		var f float64
		if err = n.Decode(&f); err == nil {
			return NewNumber(f, origin)
		}
	case "!!bool":
		var b bool
		if err = n.Decode(&b); err == nil {
			return NewBoolean(b, origin)
		}
	case "!!null":
		d.add(place, origin, "%s has no value", what)
		return Node{}
	case "!!timestamp":
		d.add(place, origin, "a date is no value of a tree")
		return Node{}
	default:
		d.add(place, origin, "a value tagged %s is no value of a tree", tag)
		return Node{}
	}
	d.add(place, origin, "%v", err)
	return Node{}
}

func (d *decoder) toml(data []byte, path string) Node {
	table := map[string]any{}
	if _, err := toml.Decode(string(data), &table); err != nil {
		d.add("", Origin{Path: path}, "%v", err)
		return Node{}
	}
	// TOML's top is always a table: one with no key is bytes that hold no
	// value.
	if len(table) == 0 {
		return Node{}
	}
	return d.tomlValue(table, "", Origin{Path: path})
}

// tomlValue is v at place, from origin. TOML gives no line, so every
// node's origin is the path alone.
func (d *decoder) tomlValue(v any, place string, origin Origin) Node {
	switch v := v.(type) {
	case map[string]any:
		entries := make(map[string]Node, len(v))
		// In the order of their keys, so a table's problems come in the
		// same order every time.
		for _, k := range slices.Sorted(maps.Keys(v)) {
			entries[k] = d.tomlValue(v[k], key(place, k), origin)
		}
		return NewMap(entries, origin)
	case []map[string]any:
		items := make([]Node, 0, len(v))
		for i, table := range v {
			items = append(items, d.tomlValue(table, item(place, i), origin))
		}
		return NewList(items, origin)
	case []any:
		items := make([]Node, 0, len(v))
		for i, inner := range v {
			items = append(items, d.tomlValue(inner, item(place, i), origin))
		}
		return NewList(items, origin)
	case string:
		return NewString(v, origin)
	case int64:
		return NewInteger(v, origin)
	case float64:
		return NewNumber(v, origin)
	case bool:
		return NewBoolean(v, origin)
	case time.Time:
		d.add(place, origin, "a date is no value of a tree")
		return Node{}
	}
	d.add(place, origin, "a TOML %T is no value of a tree", v)
	return Node{}
}
