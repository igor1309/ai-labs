// Package layout finds the layers from home's folder and the launch
// directory, and reads their settings files into a snapshot: each
// document's sources by kind and name, and the problems met on the way.
// It knows where layers are, folders and file names; no content, no
// precedence and no run. It knows no git: the root of the worktree holding
// a directory is a port, which the composition answers.
package layout

import (
	"errors"
	"fmt"
	"io/fs"
	"path/filepath"
	"strings"
)

// FileSystem is what layout asks of the files: a folder's entries, each
// with what it is, and the bytes of a regular file. Entries' error for a
// folder that does not exist is fs.ErrNotExist, or wraps it.
type FileSystem interface {
	Entries(folder string) ([]Entry, error)
	Bytes(file string) ([]byte, error)
}

// WorktreeRoot is what layout asks of git: the root of the git worktree
// that holds a directory, or "" when none does.
type WorktreeRoot interface {
	Root(dir string) (string, error)
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
	Brief    Kind = "brief"
	Schema   Kind = "schema"
	Prompt   Kind = "prompt"
)

// Snapshot is what the layer folders held when layout read them.
type Snapshot struct {
	// Layers are the layers' folders layout found and read.
	Layers Folders
	// Documents are each document, by kind and name.
	Documents map[Kind]map[string]Document
	// Blocks are the repository folder's blocks file; nil where it holds
	// none, or it cannot be read. They are no document: no kind, no name,
	// no other layer.
	Blocks *Source
	// Problems are those of no document, each of its layer: a layer folder
	// or a kind's folder that cannot be listed, a layer folder that does
	// not exist, blocks, a file whose name is no name, a folder in a
	// kind's folder.
	Problems []Problem
}

// Document is a document's sources and the problems of its files: a file
// that cannot be read, or one with another extension than its kind's. A
// document may have problems and no source.
type Document struct {
	Sources  Sources
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

// Problem is a path the filesystem could not list or read, a layer folder
// that is not there, or a file or folder in a wrong place or with no name,
// and why.
type Problem struct {
	Path string
	Err  error
}

// ErrBlocksOutsideRepository is the problem of a blocks file in the home or
// the project folder.
var ErrBlocksOutsideRepository = errors.New("blocks belong to the repository folder alone")

// ErrNoLayerFolder is the problem of a layer folder given that does not
// exist.
var ErrNoLayerFolder = errors.New("the layer's folder does not exist")

// ErrFolderInKindFolder is the problem of a folder in a kind's folder.
var ErrFolderInKindFolder = errors.New("a kind's folder holds files alone")

// ExtensionError is the problem of a file in a kind's folder whose
// extension is not its kind's.
type ExtensionError struct {
	Kind      Kind
	Extension string
}

func (e ExtensionError) Error() string {
	return fmt.Sprintf("a %s is a %q file", e.Kind, e.Extension)
}

// NameError is the problem of a file in a kind's folder whose name, its
// file name without the extension, is no name: a lowercase letter, then
// lowercase letters, digits, "_" and "-".
type NameError struct {
	Name string
}

func (e NameError) Error() string {
	return fmt.Sprintf("%q is no name", e.Name)
}

// blocksFile is the blocks file's name in a layer folder.
const blocksFile = "blocks.yaml"

// layerFolder is a layer's folder's name in its directory.
const layerFolder = ".agister"

type Layout struct {
	files FileSystem
	roots WorktreeRoot
}

// New gives a layout reading files, asking roots for a directory's
// worktree root.
func New(files FileSystem, roots WorktreeRoot) (*Layout, error) {
	if files == nil {
		return nil, errors.New("layout: no filesystem")
	}
	if roots == nil {
		return nil, errors.New("layout: no worktree root")
	}
	return &Layout{files: files, roots: roots}, nil
}

type layer int

const (
	home layer = iota
	repository
	project
)

// Read finds the layers of home's folder and the launch directory, and
// reads them whole (ADR-002, rule 2).
func (l *Layout) Read(home, launch string) Snapshot {
	folders, problems := l.find(home, launch)
	snapshot := l.readFolders(folders)
	snapshot.Layers = folders
	snapshot.Problems = append(problems, snapshot.Problems...)
	return snapshot
}

// find gives home's folder; the repository's, .agister at the root of the
// git worktree holding launch; and the project's, the nearest .agister
// below that root, from launch upward. Outside a git worktree, home's
// alone. A root that cannot be found, or a directory that cannot be listed,
// is a problem of no layer.
func (l *Layout) find(home, launch string) (Folders, []Problem) {
	folders := Folders{Home: home}
	root, err := l.roots.Root(launch)
	if err != nil {
		return folders, []Problem{{Path: launch, Err: err}}
	}
	if root == "" {
		return folders, nil
	}
	root, launch = filepath.Clean(root), filepath.Clean(launch)
	var problems []Problem
	for dir := launch; dir != root && dir != filepath.Dir(dir); dir = filepath.Dir(dir) {
		found, err := l.holdsLayer(dir)
		if err != nil {
			problems = append(problems, Problem{Path: dir, Err: err})
			break
		}
		if found {
			folders.Project = filepath.Join(dir, layerFolder)
			break
		}
	}
	found, err := l.holdsLayer(root)
	if err != nil {
		problems = append(problems, Problem{Path: root, Err: err})
	} else if found {
		folders.Repository = filepath.Join(root, layerFolder)
	}
	return folders, problems
}

// holdsLayer tells whether dir holds a layer folder; a dir that does not
// exist holds none.
func (l *Layout) holdsLayer(dir string) (bool, error) {
	entries, err := l.files.Entries(dir)
	if errors.Is(err, fs.ErrNotExist) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	for _, entry := range entries {
		if entry.Name == layerFolder && entry.Kind == Folder {
			return true, nil
		}
	}
	return false, nil
}

// readFolders reads every layer folder given, whole.
func (l *Layout) readFolders(folders Folders) Snapshot {
	snapshot := Snapshot{Documents: map[Kind]map[string]Document{}}
	given := [...]string{home: folders.Home, repository: folders.Repository, project: folders.Project}
	for at, folder := range given {
		if folder != "" {
			l.readLayer(&snapshot, layer(at), folder)
		}
	}
	return snapshot
}

// readLayer reads a layer folder's blocks and kinds' folders. Anything else
// there, hidden or not, is no settings, and is neither listed nor read.
func (l *Layout) readLayer(snapshot *Snapshot, at layer, folder string) {
	entries, err := l.files.Entries(folder)
	if errors.Is(err, fs.ErrNotExist) {
		err = ErrNoLayerFolder
	}
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

// readKind reads a kind's folder of a layer. A hidden entry is no
// settings; a folder in it is a problem, and nothing in it is read.
func (l *Layout) readKind(snapshot *Snapshot, at layer, folder string, files kindFiles) {
	entries, err := l.files.Entries(folder)
	if err != nil {
		snapshot.Problems = append(snapshot.Problems, Problem{Path: folder, Err: err})
		return
	}
	for _, entry := range entries {
		path := filepath.Join(folder, entry.Name)
		switch {
		case strings.HasPrefix(entry.Name, "."):
		case entry.Kind == Folder:
			snapshot.Problems = append(snapshot.Problems, Problem{Path: path, Err: ErrFolderInKindFolder})
		case entry.Kind == RegularFile:
			l.readDocument(snapshot, at, path, files)
		}
	}
}

// readDocument reads a layer's file of a document. A file whose name is no
// name is of no document; one with another extension is its document's
// problem. Neither is read.
func (l *Layout) readDocument(snapshot *Snapshot, at layer, path string, files kindFiles) {
	extension := filepath.Ext(path)
	name := strings.TrimSuffix(filepath.Base(path), extension)
	if !isName(name) {
		snapshot.Problems = append(snapshot.Problems, Problem{Path: path, Err: NameError{Name: name}})
		return
	}
	named := snapshot.Documents[files.kind]
	if named == nil {
		named = map[string]Document{}
		snapshot.Documents[files.kind] = named
	}
	document := named[name]
	defer func() { named[name] = document }()
	if extension != files.extension {
		document.Problems = append(document.Problems, Problem{Path: path, Err: ExtensionError{Kind: files.kind, Extension: files.extension}})
		return
	}
	bytes, err := l.files.Bytes(path)
	if err != nil {
		document.Problems = append(document.Problems, Problem{Path: path, Err: err})
		return
	}
	document.Sources.set(at, &Source{Path: path, Bytes: bytes})
}

// isName tells a name: a lowercase letter, then lowercase letters, digits,
// "_" and "-", as the archive's names are.
func isName(name string) bool {
	for i, r := range name {
		switch {
		case 'a' <= r && r <= 'z':
		case i > 0 && ('0' <= r && r <= '9' || r == '_' || r == '-'):
		default:
			return false
		}
	}
	return name != ""
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
		{Brief, "brief-forms", ".yaml"},
		{Schema, "schemas", ".json"},
		{Prompt, "prompts", ".md"},
	} {
		if files.folder == folder {
			return files, true
		}
	}
	return kindFiles{}, false
}
