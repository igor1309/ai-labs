// Package documents gives one document of the snapshot it is given, by
// kind and name, or its problems: a tree, its layers' sources decoded in
// its kind's format and composed, the nearer layer over the farther, and
// then over the tree of the document of its kind it extends, and typed as
// a definition of its kind; or a blob, the nearest layer's bytes whole. It
// is pure: it reads no file, and knows no folder; the composition maps
// layout's snapshot to its own.
package documents

import (
	"bytes"
	"crypto/sha256"
	"fmt"
	"slices"
	"strconv"
	"strings"

	"github.com/igor1309/ai-labs/gokit/tree"
)

// Kind is a kind of document.
type Kind string

const (
	Agent    Kind = "agent"
	Process  Kind = "process"
	Workflow Kind = "workflow"
	Runtime  Kind = "runtime"
	Brief    Kind = "brief"
	Schema   Kind = "schema"
	Prompt   Kind = "prompt"
)

// Snapshot is each document, by kind and name.
type Snapshot struct {
	Documents map[Kind]map[string]Document
}

// Document is a document's sources and the problems of its files. A
// document may have problems and no source.
type Document struct {
	Sources  Sources
	Problems []Problem
}

// Sources are a document's files, one slot per layer; nil where the layer
// holds none.
type Sources struct {
	Home, Repository, Project *Source
}

// Source is one layer's file of a document: its path and its bytes.
type Source struct {
	Path  string
	Bytes []byte
}

// Problem is one thing wrong with a document: the path of the file it is
// in, "" for none; the line there, 0 for none; the place in the document's
// tree, as "a.b[0]", "" for the file or the document as a whole; and what
// is wrong.
type Problem struct {
	Path    string
	Line    int
	Place   string
	Message string
}

// String is the problem as "[<path>[:<line>]: ][<place>: ]<message>".
func (p Problem) String() string {
	var at string
	if p.Path != "" {
		at = p.Path
		if p.Line > 0 {
			at = fmt.Sprintf("%s:%d", at, p.Line)
		}
		at += ": "
	}
	if p.Place != "" {
		at += p.Place + ": "
	}
	return at + p.Message
}

// Documents is each document of a snapshot, derived once, when it is
// built: nothing changes it after, so concurrent callers need no lock.
type Documents struct {
	trees    map[Kind]map[string]treeResult
	blobs    map[Kind]map[string]blobResult
	agents   map[string]definition[AgentDefinition]
	runtimes map[string]definition[RuntimeDefinition]
	briefs   map[string]definition[BriefDefinition]
	// processes are each process typed.
	processes map[string]definition[ProcessDefinition]
	// workflows are each workflow typed.
	workflows map[string]definition[WorkflowDefinition]
}

type treeResult struct {
	tree     tree.Node
	problems []Problem
}

type blobResult struct {
	blob     Blob
	problems []Problem
}

// decoder decodes one layer's bytes: tree.Decode, or a test's spy over it.
type decoder func(format tree.Format, data []byte, path string) (tree.Node, []tree.Problem)

// typer types the composed tree of the document name of one kind: the
// kind's own typer, or a test's spy over it.
type typer[T any] func(name string, root tree.Node) (T, []Problem)

// typers are the typer of each kind that is typed.
type typers struct {
	agent    typer[AgentDefinition]
	runtime  typer[RuntimeDefinition]
	brief    typer[BriefDefinition]
	process  typer[ProcessDefinition]
	workflow typer[WorkflowDefinition]
}

// definition is a document typed as a definition of its kind, or its
// problems.
type definition[T any] struct {
	value    T
	problems []Problem
}

// New gives the documents of snapshot.
func New(snapshot Snapshot) *Documents {
	return newDocuments(snapshot, tree.Decode, typers{agent: typeAgent, runtime: typeRuntime, brief: typeBrief, process: typeProcess, workflow: typeWorkflow})
}

func newDocuments(snapshot Snapshot, decode decoder, typers typers) *Documents {
	d := &Documents{trees: map[Kind]map[string]treeResult{}, blobs: map[Kind]map[string]blobResult{}}
	for kind, named := range snapshot.Documents {
		format, isTree, known := shapeOf(kind)
		if !known {
			continue
		}
		if !isTree {
			d.blobs[kind] = map[string]blobResult{}
			for name, document := range named {
				d.blobs[kind][name] = nearest(kind, name, document)
			}
			continue
		}
		d.trees[kind] = map[string]treeResult{}
		e := extender{kind: kind, merged: map[string]treeResult{}, results: d.trees[kind]}
		for name, document := range named {
			// A document with neither a file nor a problem is held by no
			// layer, and is no base.
			if document.Sources == (Sources{}) && len(document.Problems) == 0 {
				d.trees[kind][name] = treeResult{problems: []Problem{noLayer(kind, name)}}
				continue
			}
			e.merged[name] = compose(format, document, decode)
		}
		for name := range e.merged {
			e.result(name, nil)
		}
	}
	d.agents = typeEach(d.trees[Agent], typers.agent)
	d.runtimes = typeEach(d.trees[Runtime], typers.runtime)
	d.briefs = typeEach(d.trees[Brief], typers.brief)
	d.processes = typeEach(d.trees[Process], typers.process)
	d.workflows = typeEach(d.trees[Workflow], typers.workflow)
	return d
}

// typeEach is each document of trees, one kind's, typed by typeOf; a
// document whose tree has problems is not typed, and has its tree's.
func typeEach[T any](trees map[string]treeResult, typeOf typer[T]) map[string]definition[T] {
	definitions := make(map[string]definition[T], len(trees))
	for name, result := range trees {
		if len(result.problems) > 0 {
			definitions[name] = definition[T]{problems: result.problems}
			continue
		}
		value, problems := typeOf(name, result.tree)
		definitions[name] = definition[T]{value: value, problems: problems}
	}
	return definitions
}

// definitionOf is the definition of the document of kind and name, or its
// problems, and then the zero definition. The problems are the caller's
// own.
func definitionOf[T any](definitions map[string]definition[T], kind Kind, name string) (T, []Problem) {
	result, held := definitions[name]
	if !held {
		var none T
		return none, []Problem{noLayer(kind, name)}
	}
	return result.value, slices.Clone(result.problems)
}

// Tree is the composed tree of the document of kind and name, or its
// problems, and then no tree: those of its files, and those of every
// layer's bytes that do not decode. A layer that does not hold the
// document, or holds a file with no bytes, is passed over. A document
// whose merged layers name a base in "extends" is that base's tree, its
// own extends applied, with the document's merged tree over it. Extends
// gives the base's name bare or with the document's kind before it; a base
// no layer holds, a base with problems, an extends that comes back to the
// document, an extends that is no name and one that names another kind
// are problems at "extends".
func (d *Documents) Tree(kind Kind, name string) (tree.Node, []Problem) {
	_, isTree, known := shapeOf(kind)
	if !known {
		return tree.Node{}, []Problem{unknown(kind)}
	}
	if !isTree {
		return tree.Node{}, []Problem{{Message: fmt.Sprintf("%s %s is a blob, not a tree", article(kind), kind)}}
	}
	result, held := d.trees[kind][name]
	if !held {
		return tree.Node{}, []Problem{noLayer(kind, name)}
	}
	// A tree is a value no caller can change; a slice is not.
	return result.tree, slices.Clone(result.problems)
}

// compose is the document's layers merged, before extends: those its
// layers hold, the nearer over the farther, or the problems of its files
// and of every layer's bytes that do not decode.
func compose(format tree.Format, document Document, decode decoder) treeResult {
	problems := slices.Clone(document.Problems)
	sources := document.Sources
	// From the farthest layer to the nearest, so each is over the ones
	// before it.
	var composed tree.Node
	for _, source := range []*Source{sources.Home, sources.Repository, sources.Project} {
		if source == nil {
			continue
		}
		layer, decoded := decode(format, source.Bytes, source.Path)
		for _, p := range decoded {
			problems = append(problems, Problem{Path: p.Origin.Path, Line: p.Origin.Line, Place: p.Place, Message: p.Message})
		}
		composed = layer.Over(composed)
	}
	if len(problems) > 0 {
		return treeResult{problems: problems}
	}
	return treeResult{tree: composed}
}

// extender applies extends to the documents of one kind: each document's
// result is its base's result with its own merged tree over it. A base is
// looked up among the documents of its extender's kind alone.
type extender struct {
	kind Kind
	// merged is each document of the kind that a layer holds, its layers
	// merged.
	merged map[string]treeResult
	// results is each document's result, once it is derived; a base's is
	// derived once, however many documents extend it.
	results map[string]treeResult
}

// result is the result of the document name, which a layer holds.
// chain is the documents being derived that extend it, the farthest
// first.
func (e *extender) result(name string, chain []string) treeResult {
	if result, done := e.results[name]; done {
		return result
	}
	result := e.derive(name, chain)
	// A document of a cycle is given its problem where the cycle is found,
	// which may be under its own derive.
	if cycled, done := e.results[name]; done {
		return cycled
	}
	e.results[name] = result
	return result
}

func (e *extender) derive(name string, chain []string) treeResult {
	merged := e.merged[name]
	field, extends := merged.tree.Get("extends")
	if len(merged.problems) > 0 || !extends {
		return merged
	}
	at := func(message string) Problem {
		return Problem{Path: field.Origin().Path, Line: field.Origin().Line, Place: "extends", Message: message}
	}
	value, named := field.Text()
	if !named {
		return treeResult{problems: []Problem{at(fmt.Sprintf("it is the name of %s %s", article(e.kind), e.kind))}}
	}
	base, ofKind := nameOf(e.kind, value)
	if !ofKind {
		return treeResult{problems: []Problem{at(namesA(e.kind))}}
	}
	if _, held := e.merged[base]; !held {
		return treeResult{problems: []Problem{at(noLayer(e.kind, base).Message)}}
	}
	chain = append(slices.Clip(chain), name)
	if i := slices.Index(chain, base); i >= 0 {
		e.cycle(chain[i:])
		return treeResult{}
	}
	under := e.result(base, chain)
	if len(under.problems) > 0 {
		problems := make([]Problem, 0, len(under.problems))
		for _, p := range under.problems {
			problems = append(problems, at(fmt.Sprintf("the %s %q: %s", e.kind, base, p)))
		}
		return treeResult{problems: problems}
	}
	return treeResult{tree: merged.tree.Over(under.tree)}
}

// cycle gives each document of cycle, where each extends the next and the
// last the first, the problem that its extends comes back to it, the
// cycle read from that document.
func (e *extender) cycle(cycle []string) {
	for i, name := range cycle {
		var reads []string
		for _, named := range append(slices.Concat(cycle[i:], cycle[:i]), name) {
			reads = append(reads, strconv.Quote(named))
		}
		field, _ := e.merged[name].tree.Get("extends")
		origin := field.Origin()
		e.results[name] = treeResult{problems: []Problem{{Path: origin.Path, Line: origin.Line, Place: "extends", Message: strings.Join(reads, " extends ")}}}
	}
}

// Blob is a blob document: the bytes of its file, whole, that file's path
// and the bytes' SHA-256 digest.
type Blob struct {
	Path   string
	Bytes  []byte
	Digest [sha256.Size]byte
}

// Blob is the blob of kind and name, taken from the nearest layer that
// holds a file of it, or its problems, and then no blob: those of its
// files, as no farther layer stands in for a file that cannot be read.
// The bytes are the caller's own, so what one caller does with them no
// other sees.
func (d *Documents) Blob(kind Kind, name string) (Blob, []Problem) {
	_, isTree, known := shapeOf(kind)
	if !known {
		return Blob{}, []Problem{unknown(kind)}
	}
	if isTree {
		return Blob{}, []Problem{{Message: fmt.Sprintf("%s %s is a tree, not a blob", article(kind), kind)}}
	}
	result, held := d.blobs[kind][name]
	if !held {
		return Blob{}, []Problem{noLayer(kind, name)}
	}
	if len(result.problems) > 0 {
		return Blob{}, slices.Clone(result.problems)
	}
	blob := result.blob
	blob.Bytes = bytes.Clone(blob.Bytes)
	return blob, nil
}

// nearest is the blob of the nearest layer's file. Its bytes are a copy,
// so the digest stays theirs whatever the snapshot's caller does after.
func nearest(kind Kind, name string, document Document) blobResult {
	if len(document.Problems) > 0 {
		return blobResult{problems: slices.Clone(document.Problems)}
	}
	sources := document.Sources
	for _, source := range []*Source{sources.Project, sources.Repository, sources.Home} {
		if source != nil {
			held := bytes.Clone(source.Bytes)
			return blobResult{blob: Blob{Path: source.Path, Bytes: held, Digest: sha256.Sum256(held)}}
		}
	}
	return blobResult{problems: []Problem{noLayer(kind, name)}}
}

// shapeOf is whether kind is known, and whether its documents are trees,
// and then the format they are decoded in, or blobs.
func shapeOf(kind Kind) (format tree.Format, isTree, known bool) {
	switch kind {
	case Agent:
		return tree.TOML, true, true
	case Process, Workflow, Runtime, Brief:
		return tree.YAML, true, true
	case Schema, Prompt:
		return 0, false, true
	}
	return 0, false, false
}

func noLayer(kind Kind, name string) Problem {
	return Problem{Message: fmt.Sprintf("no layer holds the %s %q", kind, name)}
}

func unknown(kind Kind) Problem {
	return Problem{Message: fmt.Sprintf("the kind %q is not known", kind)}
}

// article is "a" or "an", as the kind's name reads after it.
func article(kind Kind) string {
	if kind == Agent {
		return "an"
	}
	return "a"
}
