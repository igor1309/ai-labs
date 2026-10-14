// Package documents turns the bytes of settings files into documents
// composed from their layers, with the file each field came from
// (ADR-001, settings; ADR-002). It is pure: it reads no file and is handed
// the files' bytes.
//
// Inside it, format reads one file into a tree of its kind's fields, and
// layering composes the trees of a document's files and of what it
// extends.
package documents

import (
	"errors"
	"fmt"
	"slices"
)

// Kind is a kind of document that is composed from its layers (ADR-002,
// rules 1 and 3).
type Kind int

const (
	Agent Kind = iota
	Process
	Workflow
	Runtime
	Verify
	Brief
)

// Layer is a layer of settings, from the farthest to the nearest (ADR-002,
// rule 2).
type Layer int

const (
	Home Layer = iota
	Repository
	Project
)

// File is one layer's file of a document.
type File struct {
	Layer Layer
	Path  string
	Data  []byte
}

// Document is a document's kind, its name, and the files of the layers
// that hold it.
type Document struct {
	Kind  Kind
	Name  string
	Files []File
}

// Origin is where a field came from: the document whose file gave it, that
// file's layer and its path.
type Origin struct {
	Document string
	Layer    Layer
	Path     string
}

// Field is a field of a composed document: its path of keys, its value and
// where it came from. A field is a scalar, a list, or a map with no keys.
type Field struct {
	Path   []string
	Value  any
	Origin Origin
}

// Composed is a document composed from its files, and from what it extends
// once Extend has put it over its base.
type Composed struct {
	root *node
}

// Compose composes doc from its files, from home toward the launch
// directory whatever their order in doc: maps merge by key at every depth,
// a key only a nearer file holds coming after the farther file's keys, and
// lists and scalars replace whole. Nothing unsets. Every file is read in
// its kind's format, holding only its kind's fields, and the schema, which
// some file must give, is its kind's. The error names each problem with
// its file.
func Compose(doc Document) (Composed, error) {
	if len(doc.Files) == 0 {
		return Composed{}, fmt.Errorf("no file holds %s", doc.Name)
	}
	files := slices.Clone(doc.Files)
	slices.SortStableFunc(files, func(a, b File) int { return int(a.Layer) - int(b.Layer) })
	var root *node
	var problems []error
	for _, file := range files {
		tree, found := read(doc.Kind, file.Data)
		for _, problem := range found {
			problems = append(problems, fmt.Errorf("%s: %w", file.Path, problem))
		}
		if len(found) > 0 {
			continue
		}
		tree.stamp(Origin{Document: doc.Name, Layer: file.Layer, Path: file.Path})
		root = merged(root, tree)
	}
	if len(problems) > 0 {
		return Composed{}, errors.Join(problems...)
	}
	if root.entry("schema") == nil {
		return Composed{}, fmt.Errorf("no file of %s gives its schema, %q", doc.Name, doc.Kind.written().schema)
	}
	return Composed{root: root}, nil
}

// Extend composes over onto base, a document it extends, as one layer onto
// another (ADR-002, rule 4). Each field keeps where it came from. It
// changes neither.
func Extend(base, over Composed) Composed {
	return Composed{root: merged(base.root, over.root)}
}

// Extends is the name of the document c extends, or "" if it extends none.
// A value of extends that is not a name is an error naming its file.
func (c Composed) Extends() (string, error) {
	value := c.root.entry("extends")
	if value == nil {
		return "", nil
	}
	if name, ok := value.value.(string); ok && !value.isMap && name != "" {
		return name, nil
	}
	return "", fmt.Errorf("%s: extends must name a document of its kind", value.origin.Path)
}

// Fields lists c's fields, depth first, in the order of its keys.
func (c Composed) Fields() []Field {
	return c.root.fields(nil, nil)
}
