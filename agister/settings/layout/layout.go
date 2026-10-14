// Package layout reads the settings files of the layer folders it is
// given, home's, the repository's and the project's, into a snapshot: each
// document's sources by kind and name, and the problems met on the way.
// It knows folders and file names; no content, no precedence and no run.
// It searches for nothing: the composition finds the folders.
package layout

import (
	"errors"
	"path/filepath"
	"strings"
)

// FileSystem is what layout asks of the files: a folder's entries, each
// with what it is, and the bytes of a regular file.
type FileSystem interface {
	Entries(folder string) ([]Entry, error)
	Bytes(file string) ([]byte, error)
}

// Entry is a name in a folder and what is there.
type Entry struct {
	Name string
	Kind EntryKind
}

type EntryKind int

const (
	Other       EntryKind = iota // neither a regular file nor a folder
	RegularFile                  // a regular file
	Folder                       // a folder
)

// Folders are the layers' folders; an empty one is a layer not given.
type Folders struct {
	Home, Repository, Project string
}

// Kind is a kind of document.
type Kind string

const (
	Agent    Kind = "agent"
	Process  Kind = "process"
	Workflow Kind = "workflow"
	Runtime  Kind = "runtime"
	Verify   Kind = "verify"
	Brief    Kind = "brief"
	Schema   Kind = "schema"
	Prompt   Kind = "prompt"
)

// Snapshot is what the layer folders held when layout read them.
type Snapshot struct {
	// Documents are each document's sources, by kind and name.
	Documents map[Kind]map[string]Sources
	// Blocks are the repository folder's blocks file; nil where it holds
	// none, or it cannot be read. They are no document: no kind, no name,
	// no other layer.
	Blocks   *Source
	Problems []Problem
}

// Sources are a document's files, one slot per layer; nil where the
// layer holds none.
type Sources struct {
	Home, Repository, Project *Source
}

// Source is one layer's file of a document: its path, its identity, and
// its bytes.
type Source struct {
	Path  string
	Bytes []byte
}

// Problem is a path the filesystem could not list or read, or a file in a
// wrong place, and why.
type Problem struct {
	Path string
	Err  error
}

// ErrBlocksOutsideRepository is the problem of a blocks file in the home or
// the project folder.
var ErrBlocksOutsideRepository = errors.New("blocks belong to the repository folder alone")

// blocksFile is the blocks file's name in a layer folder.
const blocksFile = "blocks.yaml"

type Layout struct {
	files FileSystem
}

// New gives a layout reading files.
func New(files FileSystem) (*Layout, error) {
	if files == nil {
		return nil, errors.New("layout: no filesystem")
	}
	return &Layout{files: files}, nil
}

type layer int

const (
	home layer = iota
	repository
	project
)

// Read reads every layer folder given, whole.
func (l *Layout) Read(folders Folders) Snapshot {
	snapshot := Snapshot{Documents: map[Kind]map[string]Sources{}}
	given := [...]string{home: folders.Home, repository: folders.Repository, project: folders.Project}
	for at, folder := range given {
		if folder != "" {
			l.readLayer(&snapshot, layer(at), folder)
		}
	}
	return snapshot
}

func (l *Layout) readLayer(snapshot *Snapshot, at layer, folder string) {
	entries, err := l.files.Entries(folder)
	if err != nil {
		snapshot.Problems = append(snapshot.Problems, Problem{Path: folder, Err: err})
		return
	}
	for _, entry := range entries {
		switch {
		case entry.Kind == RegularFile && entry.Name == blocksFile:
			l.readBlocks(snapshot, at, filepath.Join(folder, entry.Name))
		case entry.Kind == Folder:
			if files, ok := kindOfFolder(entry.Name); ok {
				l.readKind(snapshot, at, filepath.Join(folder, entry.Name), files)
			}
		}
	}
}

// readBlocks reads the repository folder's blocks; a blocks file in another
// layer is a problem, and is not read.
func (l *Layout) readBlocks(snapshot *Snapshot, at layer, path string) {
	if at != repository {
		snapshot.Problems = append(snapshot.Problems, Problem{Path: path, Err: ErrBlocksOutsideRepository})
		return
	}
	bytes, err := l.files.Bytes(path)
	if err != nil {
		snapshot.Problems = append(snapshot.Problems, Problem{Path: path, Err: err})
		return
	}
	snapshot.Blocks = &Source{Path: path, Bytes: bytes}
}

func (l *Layout) readKind(snapshot *Snapshot, at layer, folder string, files kindFiles) {
	entries, err := l.files.Entries(folder)
	if err != nil {
		snapshot.Problems = append(snapshot.Problems, Problem{Path: folder, Err: err})
		return
	}
	for _, entry := range entries {
		name, ok := strings.CutSuffix(entry.Name, files.extension)
		if entry.Kind != RegularFile || !ok {
			continue
		}
		path := filepath.Join(folder, entry.Name)
		bytes, err := l.files.Bytes(path)
		if err != nil {
			snapshot.Problems = append(snapshot.Problems, Problem{Path: path, Err: err})
			continue
		}
		named := snapshot.Documents[files.kind]
		if named == nil {
			named = map[string]Sources{}
			snapshot.Documents[files.kind] = named
		}
		sources := named[name]
		sources.set(at, &Source{Path: path, Bytes: bytes})
		named[name] = sources
	}
}

func (s *Sources) set(at layer, source *Source) {
	switch at {
	case home:
		s.Home = source
	case repository:
		s.Repository = source
	case project:
		s.Project = source
	}
}

// kindFiles is where a kind's documents are in a layer: the folder, and
// each name's file extension.
type kindFiles struct {
	kind      Kind
	folder    string
	extension string
}

func kindOfFolder(folder string) (kindFiles, bool) {
	for _, files := range []kindFiles{
		{Agent, "agents", ".toml"},
		{Process, "processes", ".yaml"},
		{Workflow, "workflows", ".yaml"},
		{Runtime, "runtimes", ".yaml"},
		{Verify, "verifies", ".yaml"},
		{Brief, "briefs", ".yaml"},
		{Schema, "schemas", ".json"},
		{Prompt, "prompts", ".md"},
	} {
		if files.folder == folder {
			return files, true
		}
	}
	return kindFiles{}, false
}
