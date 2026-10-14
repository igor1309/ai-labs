// Package fsdefs stores definition documents as files under Agister's
// state directory: service.toml, workspace.yaml, blocks.yaml, agents/*.toml,
// processes/*.yaml, runtimes/*.yaml, schemas/*.json,
// workflows/*.yaml, verifies/*.yaml, prompts/*.md, skills/*/SKILL.md,
// briefs/*.yaml. Layered
// reads the layers a command selected, composing each document from the
// layer files that hold it (ADR-028).
package fsdefs

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"syscall"

	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
	"github.com/igor1309/ai-labs/agister/internal/domain/document"
)

var errNotFound = document.ErrNotFound

type Store struct {
	Dir      string
	readFile func(string) ([]byte, error)

	// at, when set, is called at the steps of Write that the lock must
	// cover, and between listing a skill's folder and opening its file;
	// tests use it to observe the lock there, or to change the file.
	at func(point string)
	// temp, when set, is the folder Stage makes its stages in, in place of
	// the system's temporary folder.
	temp string
}

// lockName is the writers' lock file, in Dir itself. Documents live in a
// subdirectory per kind and List reads only those, so it is never listed
// and never checked.
const lockName = ".write.lock"

func (s Store) point(name string) {
	if s.at != nil {
		s.at(name)
	}
}

// lock takes the exclusive write lock of the store and returns its release,
// which may be called more than once.
func (s Store) lock() (func(), error) {
	if err := os.MkdirAll(s.Dir, 0o700); err != nil {
		return nil, err
	}
	file, err := os.OpenFile(filepath.Join(s.Dir, lockName), os.O_RDWR|os.O_CREATE, 0o600)
	if err != nil {
		return nil, err
	}
	for {
		err = syscall.Flock(int(file.Fd()), syscall.LOCK_EX)
		if err != syscall.EINTR {
			break
		}
	}
	if err != nil {
		file.Close()
		return nil, err
	}
	released := false
	return func() {
		if !released {
			released = true
			file.Close() // closing the descriptor drops the lock
		}
	}, nil
}

// extensions is the file extension of each kind the store holds. Each call
// returns a new map.
func extensions() map[document.Kind]string {
	return map[document.Kind]string{
		document.KindService:  ".toml",
		document.KindAgent:    ".toml",
		document.KindProcess:  ".yaml",
		document.KindRuntime:  ".yaml",
		document.KindSchema:   ".json",
		document.KindWorkflow: ".yaml",
		document.KindVerify:   ".yaml",
		document.KindPrompt:   ".md",
		document.KindBrief:    ".yaml",
		// A folder each, holding the one file skillFile (ADR-021 rule 1).
		document.KindSkill: ".md",
		// Singletons, like the service.
		document.KindWorkspace: ".yaml",
		document.KindBlocks:    ".yaml",
	}
}

// skillFile is the one file a skill's folder holds, the skill's document
// (ADR-021 rule 1).
const skillFile = "SKILL.md"

func (s Store) path(kind document.Kind, name string) (string, error) {
	extension, ok := extensions()[kind]
	if !ok {
		return "", fmt.Errorf("unknown definition kind %q", kind)
	}
	if singleton(kind) {
		return filepath.Join(s.Dir, string(kind)+extension), nil
	}
	if !document.ValidName(name) {
		return "", fmt.Errorf("invalid name %q", name)
	}
	if kind == document.KindSkill {
		return filepath.Join(s.Dir, string(kind), name, skillFile), nil
	}
	return filepath.Join(s.Dir, string(kind), name+extension), nil
}

// readSkill reads the skill whose document is path: its folder holds
// exactly one entry, the regular file skillFile. A folder that holds
// anything else, or no such file, is not read: a skill's other files are
// not given to a call, so one that relies on them would break unseen
// (ADR-021 rule 1). No folder there is no skill.
func (s Store) readSkill(path string) ([]byte, error) {
	file, others, err := skillFolder(path)
	if err != nil {
		return nil, err
	}
	switch {
	case file == nil:
		return nil, fmt.Errorf("%s has no %s", filepath.Dir(path), skillFile)
	case file.Type()&fs.ModeSymlink != 0:
		return nil, fmt.Errorf("%s is a symbolic link: a skill's %s is a regular file", path, skillFile)
	case file.IsDir():
		return nil, fmt.Errorf("%s is a folder: a skill's %s is a regular file", path, skillFile)
	case !file.Type().IsRegular():
		return nil, fmt.Errorf("%s is not a regular file", path)
	case len(others) > 0:
		return nil, skillBeside(path, others)
	}
	// The entry may have changed since it was listed: what is opened is
	// checked again, and read through the handle checked.
	s.point("open")
	return readSkillFile(path)
}

// readSkillFile reads the regular file path, a skill's document, without
// following a link there or waiting on a special file: either is an error,
// and so is a folder. It is read through the handle checked.
func readSkillFile(path string) ([]byte, error) {
	handle, err := os.OpenFile(path, os.O_RDONLY|syscall.O_NOFOLLOW|syscall.O_NONBLOCK, 0)
	if errors.Is(err, syscall.ELOOP) {
		return nil, fmt.Errorf("%s is a symbolic link: a skill's %s is a regular file", path, skillFile)
	}
	if err != nil {
		return nil, err
	}
	defer handle.Close()
	opened, err := handle.Stat()
	switch {
	case err != nil:
		return nil, err
	case opened.IsDir():
		return nil, fmt.Errorf("%s is a folder: a skill's %s is a regular file", path, skillFile)
	case !opened.Mode().IsRegular():
		return nil, fmt.Errorf("%s is not a regular file", path)
	}
	return io.ReadAll(handle)
}

// skillFolderLinked fails for a skill's folder that is a symbolic link, or
// that is in a skills/ that is one: what is reached through either is not
// the store's. No folder there is no failure.
func skillFolderLinked(folder string) error {
	skills := filepath.Dir(folder)
	for _, path := range []string{skills, folder} {
		info, err := os.Lstat(path)
		switch {
		case errors.Is(err, fs.ErrNotExist):
			return nil
		case err != nil:
			return err
		case info.Mode()&fs.ModeSymlink != 0 && path == skills:
			return fmt.Errorf("%s is a symbolic link: a skill is a folder in the settings' own %s/", skills, document.KindSkill)
		case info.Mode()&fs.ModeSymlink != 0:
			return skillLinked(folder)
		}
	}
	return nil
}

// skillLinked is the problem of the skill whose folder is a symbolic link.
func skillLinked(folder string) error {
	return fmt.Errorf("%s is a symbolic link: a skill is a folder holding its %s", folder, skillFile)
}

// skillFolder lists the folder of the skill whose document is path: its
// entry skillFile, nil when it holds none, and the names of its other
// entries. No folder there, or a file, is no skill; a symbolic link is
// not a skill's folder.
func skillFolder(path string) (file fs.DirEntry, others []string, err error) {
	folder := filepath.Dir(path)
	info, err := os.Lstat(folder)
	switch {
	case errors.Is(err, fs.ErrNotExist):
		return nil, nil, fmt.Errorf("%w (expected %s)", errNotFound, path)
	case err != nil:
		return nil, nil, err
	case info.Mode()&fs.ModeSymlink != 0:
		return nil, nil, skillLinked(folder)
	case !info.IsDir():
		// Not listed either: a file in skills/ is no skill.
		return nil, nil, fmt.Errorf("%w (expected %s)", errNotFound, path)
	}
	entries, err := os.ReadDir(folder)
	if err != nil {
		return nil, nil, err
	}
	for _, entry := range entries {
		if entry.Name() == skillFile {
			file = entry
		} else {
			others = append(others, entry.Name())
		}
	}
	return file, others, nil
}

// skillBeside is the problem of the skill whose document is path, whose
// folder holds others beside it.
func skillBeside(path string, others []string) error {
	return fmt.Errorf("%s holds %s beside %s: a skill is its %s alone, and its other files are not given to a call", filepath.Dir(path), strings.Join(others, ", "), skillFile, skillFile)
}

// Read reads the document as home's settings alone: a store by itself is
// one layer, home.
func (s Store) Read(ctx context.Context, kind document.Kind, name string) (document.Document, error) {
	return Layered{Home: s}.Read(ctx, kind, name)
}

// ReadListed reads the document as Read does: home lists no folders.
func (s Store) ReadListed(ctx context.Context, kind document.Kind, name string) (document.Document, error) {
	return Layered{Home: s}.ReadListed(ctx, kind, name)
}

// Layers is the one layer a store by itself is, home.
func (s Store) Layers(ctx context.Context) []document.LayerDir {
	return Layered{Home: s}.Layers(ctx)
}

// File reads the store's own file of the document, as written: a process
// without the base it extends (ADR-030 rule 9), and one of a retired kind
// where the store kept it, which a restore reads.
func (s Store) File(_ context.Context, kind document.Kind, name string) ([]byte, error) {
	doc, err := s.readBackedUp(kind, name)
	return doc.Bytes, err
}

// read reads the store's own file of the document.
func (s Store) read(kind document.Kind, name string) (document.Document, error) {
	path, err := s.path(kind, name)
	if err != nil {
		return document.Document{}, err
	}
	return s.readAt(kind, name, path)
}

// readAt reads the document from path, the store's own file of it.
func (s Store) readAt(kind document.Kind, name, path string) (document.Document, error) {
	var err error
	doc := document.Document{Source: document.Source{Kind: kind, Name: name, Path: path}}
	var data []byte
	if kind == document.KindSkill {
		// A skill that is there and broken is not absent: reading it fails
		// with what is wrong.
		if data, err = s.readSkill(path); err != nil {
			return doc, err
		}
	} else {
		data, err = s.readBytes(path)
	}
	if errors.Is(err, fs.ErrNotExist) {
		// A file that exists but cannot be resolved, a dangling symlink, is
		// not absent: reading it fails, with no fallback to a farther
		// layer's. Blocks would be home's (ADR-018 rule 5), and a layer's
		// fields would silently stop applying (ADR-028 rule 5).
		if _, lerr := os.Lstat(path); lerr == nil {
			return doc, fmt.Errorf("cannot be resolved: %v", err)
		}
		// Nor is a prompt whose folder is a dangling symlink: a farther
		// layer's would be given in place of the layer's (D-11 of
		// ADR-019). Nor a brief's form: home's would check the text in
		// place of the project's (ADR-015).
		if kind == document.KindPrompt || kind == document.KindBrief {
			if err := resolvable(filepath.Dir(path)); err != nil {
				return doc, err
			}
		}
		return doc, fmt.Errorf("%w (expected %s)", errNotFound, path)
	}
	if err != nil {
		return doc, err
	}
	return document.Document{
		Source: document.Source{Kind: kind, Name: name, Path: path, SHA256: digest(data)},
		Bytes:  data,
	}, nil
}

// List names the documents of kind. The workspace settings are listed when
// the one document exists, so a missing one reads as none. One that exists
// but cannot be followed, such as a symlink loop, is listed, so reading it
// fails as that document's problem.
//
// The blocks are listed whenever their entry exists: only one that does not
// exist means no blocks. One that is a directory, a dangling symlink or a
// symlink loop is listed, so reading it fails and stops every command
// (ADR-018 rule 5), where reading it as none would admit what it blocks.
//
// A skill is a folder of skills/, whatever it holds: a broken one is
// listed, so reading it fails as that skill's problem (ADR-021 rule 1).
func (s Store) List(_ context.Context, kind document.Kind) ([]string, error) {
	if kind == document.KindBlocks {
		path, _ := s.path(kind, string(kind))
		if _, err := os.Lstat(path); errors.Is(err, fs.ErrNotExist) {
			return nil, nil
		} else if err != nil {
			return nil, err
		}
		return []string{string(kind)}, nil
	}
	if kind == document.KindWorkspace {
		path, _ := s.path(kind, string(kind))
		if _, err := os.Lstat(path); errors.Is(err, fs.ErrNotExist) {
			return nil, nil
		} else if err != nil {
			return nil, err
		}
		info, err := os.Stat(path)
		if errors.Is(err, fs.ErrNotExist) || err == nil && info.IsDir() {
			return nil, nil
		}
		return []string{string(kind)}, nil
	}
	folder := filepath.Join(s.Dir, string(kind))
	entries, err := os.ReadDir(folder)
	if errors.Is(err, fs.ErrNotExist) {
		// A prompts folder that is a dangling symlink cannot be listed:
		// read as none, it would make every optional prompt absent. Nor a
		// briefs folder: home's forms would stand in for the project's.
		if kind == document.KindPrompt || kind == document.KindBrief {
			if err := resolvable(folder); err != nil {
				return nil, err
			}
		}
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var names []string
	for _, entry := range entries {
		if kind == document.KindSkill {
			// A symbolic link there may be meant as a skill's folder, which
			// it is not; a file is no skill.
			if entry.IsDir() || entry.Type()&fs.ModeSymlink != 0 {
				names = append(names, entry.Name())
			}
			continue
		}
		name, ok := strings.CutSuffix(entry.Name(), extensions()[kind])
		if !ok || entry.IsDir() {
			continue
		}
		// A file in prompts/ whose name breaks the naming rule is not a
		// prompt: settings may still read it through source: file (ADR-014
		// rule 5).
		if kind == document.KindPrompt && !document.ValidName(name) {
			continue
		}
		names = append(names, name)
	}
	sort.Strings(names)
	return names, nil
}

// Current reports where the document is stored and the digest of the one
// there, empty when there is none. A skill's SKILL.md is opened as Read
// opens it, without following a link or waiting on a special file, and
// not through a folder, or a skills/, that is a symbolic link: each is an
// error, so a restore neither hangs on one nor takes a file outside the
// store for the skill (ADR-027 rule 8). A restore finds one of a retired
// kind where the store kept it.
func (s Store) Current(_ context.Context, kind document.Kind, name string) (string, string, error) {
	path, err := s.backedUp(kind, name)
	if err != nil {
		return "", "", err
	}
	var data []byte
	if kind == document.KindSkill {
		if err := skillFolderLinked(filepath.Dir(path)); err != nil {
			return "", "", err
		}
		data, err = readSkillFile(path)
	} else {
		data, err = os.ReadFile(path)
	}
	if errors.Is(err, fs.ErrNotExist) {
		return path, "", nil
	}
	if err != nil {
		return "", "", err
	}
	return path, digest(data), nil
}

// Write stores data over the document with digest expected, or where there
// is none when expected is empty. A new document is created exclusively. A
// replacement is written beside the document and renamed over it, so it is
// never seen half-written.
//
// An exclusive lock on a file in Dir is held across the whole write, the
// digest compare and the rename (or the exclusive create) included, so
// Agister's own writers, in this process or another, are serialized. The
// lock binds only them: a hand edit or another program's write landing
// between the compare and the rename can still be lost. Guarding against
// that is outside Agister's responsibility (README, Settings).
func (s Store) Write(_ context.Context, kind document.Kind, name string, data []byte, expected string) (string, bool, error) {
	path, err := s.path(kind, name)
	if err != nil {
		return "", false, err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return "", false, err
	}
	unlock, err := s.lock()
	if err != nil {
		return "", false, err
	}
	defer unlock()
	if expected == "" {
		s.point("create")
		file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
		if errors.Is(err, fs.ErrExist) {
			return path, false, nil
		}
		if err != nil {
			return "", false, err
		}
		defer file.Close()
		if _, err := file.Write(data); err != nil {
			return "", false, err
		}
		return path, true, file.Close()
	}
	s.point("compare")
	current, err := os.ReadFile(path)
	if errors.Is(err, fs.ErrNotExist) {
		return path, false, nil
	}
	if err != nil {
		return "", false, err
	}
	if digest(current) != expected {
		return path, false, nil
	}
	temp, err := os.CreateTemp(filepath.Dir(path), "."+filepath.Base(path)+".*")
	if err != nil {
		return "", false, err
	}
	defer os.Remove(temp.Name())
	if _, err := temp.Write(data); err != nil {
		temp.Close()
		return "", false, err
	}
	if err := temp.Close(); err != nil {
		return "", false, err
	}
	s.point("rename")
	if err := os.Rename(temp.Name(), path); err != nil {
		return "", false, err
	}
	return path, true, nil
}

// resolvable fails for a folder that exists as an entry but cannot be
// followed, a dangling symlink; a folder that does not exist at all is no
// failure.
func resolvable(folder string) error {
	if _, err := os.Lstat(folder); err != nil {
		return nil
	}
	if _, err := os.Stat(folder); errors.Is(err, fs.ErrNotExist) {
		return fmt.Errorf("%s cannot be resolved: %v", folder, err)
	}
	return nil
}

func digest(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

// Layered reads the settings of the layers a command selected (ADR-028
// rule 1): home, the repository's .agister and the .agister of the project
// directory the command is launched in. A document of a composed kind is
// composed from every layer file that holds it, the nearest layer winning
// field by field (rule 4); a prompt, a skill and a schema are taken whole
// from the nearest layer that holds them (rule 6). Checking the composed
// result is the core's job, not the store's.
//
// Blocks are never composed, and the project layer's are not read (rule
// 7): only a repository's block anything (ADR-018 rule 1), and
// Source.Layer says whose they are. Home's are still read, so check
// reports them.
type Layered struct {
	Home       Store
	Repository *Store // nil outside a repository, and in one without .agister
	Project    *Store // nil for a command launched under no project directory
	// Nested are the .agister directories between the project layer's and
	// the root, nearest first: any makes the project layer invalid (rule
	// 1).
	Nested []string
	// Absent, when Repository is nil, is the settings directory of the
	// repository that has none: a document found in no layer names where
	// it was expected there too.
	Absent string
}

// Inspect selects the layers as Select does for a viewer of the settings,
// home's alone where root is "" (no worktree), and reads every document and
// layer.yaml with read. Listing, selection and composition are the
// binary's; skills keep their checked reads. read may return
// document.ErrNotFound for a file the viewer leaves out, such as one over
// its size limit.
func Inspect(home, root, launch string, read func(string) ([]byte, error)) (Layered, error) {
	if read == nil {
		return Layered{}, errors.New("fsdefs: no reader to inspect the settings with")
	}
	selected := Layered{Home: Store{Dir: home}}
	if root != "" {
		var err error
		if selected, err = Select(selected.Home, root, launch); err != nil {
			return Layered{}, err
		}
	}
	return selected.withReadFile(read), nil
}

// withReadFile is a copy of the store reading document and layer.yaml
// contents with read.
func (l Layered) withReadFile(read func(string) ([]byte, error)) Layered {
	l.Home.readFile = read
	if l.Repository != nil {
		store := *l.Repository
		store.readFile = read
		l.Repository = &store
	}
	if l.Project != nil {
		store := *l.Project
		store.readFile = read
		l.Project = &store
	}
	return l
}

func (s Store) readBytes(path string) ([]byte, error) {
	if s.readFile != nil {
		return s.readFile(path)
	}
	return os.ReadFile(path)
}

type layerStore struct {
	layer document.Layer
	store Store
}

// read reads the layer's file of the document. With folders, a prompt the
// layer's own prompts/ does not hold is looked for in each folder its
// layer.yaml lists, in order, and the first found is the layer's (ADR-028
// rule 9). A layer.yaml that cannot be used breaks the read: which prompt
// the layer was meant to give cannot be known.
func (l layerStore) read(kind document.Kind, name string, folders bool) (document.Document, error) {
	doc, err := l.store.read(kind, name)
	if !folders || !l.listsFolders(kind) || !errors.Is(err, errNotFound) {
		return doc, err
	}
	listed, invalid := l.store.promptFolders()
	if len(invalid) > 0 {
		doc.Source.Path = invalid[0].Path
		return doc, fmt.Errorf("%s: %s", invalid[0].Path, invalid[0].Reason)
	}
	for _, folder := range listed {
		path := filepath.Join(folder, name+extensions()[kind])
		data, ferr := l.store.readBytes(path)
		if errors.Is(ferr, errNotFound) {
			continue
		}
		if errors.Is(ferr, fs.ErrNotExist) {
			if _, lerr := os.Lstat(path); lerr != nil {
				continue
			}
			ferr = fmt.Errorf("cannot be resolved: %v", ferr)
		}
		source := document.Source{Kind: kind, Name: name, Path: path}
		if ferr != nil {
			return document.Document{Source: source}, ferr
		}
		source.SHA256 = digest(data)
		return document.Document{Source: source, Bytes: data}, nil
	}
	return doc, err
}

// readRegular reads the layer's own file of the document when it is a
// regular file: it is opened without waiting on a special file, and read
// through the handle checked. A viewer's reader, where one is given, reads
// it in its place, as it reads every file.
func (l layerStore) readRegular(kind document.Kind, name string) (document.Document, error) {
	path, err := l.store.path(kind, name)
	if err != nil {
		return document.Document{}, err
	}
	var data []byte
	if l.store.readFile != nil {
		data, err = l.store.readFile(path)
	} else {
		data, err = readRegularFile(path)
	}
	source := document.Source{Kind: kind, Name: name, Path: path}
	if err != nil {
		return document.Document{Source: source}, err
	}
	source.SHA256 = digest(data)
	return document.Document{Source: source, Bytes: data}, nil
}

// readRegularFile reads path, links followed, only when what is opened is
// a regular file; it never waits on a special file, such as a FIFO with no
// writer.
func readRegularFile(path string) ([]byte, error) {
	handle, err := os.OpenFile(path, os.O_RDONLY|syscall.O_NONBLOCK, 0)
	if err != nil {
		return nil, err
	}
	defer handle.Close()
	opened, err := handle.Stat()
	if err != nil {
		return nil, err
	}
	if !opened.Mode().IsRegular() {
		return nil, fmt.Errorf("%s is not a regular file", path)
	}
	return io.ReadAll(handle)
}

// locate is the path of the layer's file of the document, found as read
// finds it, folders included, but without opening it: empty where the
// layer holds none. A farther layer's file gives nothing, so it is only
// named, and one that a read would wait on, such as a FIFO, does not hang
// the command (ADR-028 rule 6). A layer.yaml that cannot be used lists no
// folder here: it makes the layer invalid, which Layers reports.
func (l layerStore) locate(kind document.Kind, name string, folders bool) string {
	path, err := l.store.path(kind, name)
	if err != nil {
		return ""
	}
	if exists(path) {
		return path
	}
	if !folders || !l.listsFolders(kind) {
		return ""
	}
	listed, _ := l.store.promptFolders()
	for _, folder := range listed {
		if path := filepath.Join(folder, name+extensions()[kind]); exists(path) {
			return path
		}
	}
	return ""
}

// listsFolders reports whether the layer's layer.yaml may list folders
// that hold a document of kind: a prompt's, in a layer other than home
// (ADR-028 rule 9).
func (l layerStore) listsFolders(kind document.Kind) bool {
	return kind == document.KindPrompt && l.layer != document.LayerHome
}

// expected are the paths where the layer would hold the document, the
// folders its layer.yaml lists among them with folders.
func (l layerStore) expected(kind document.Kind, name string, folders bool) []string {
	path, _ := l.store.path(kind, name)
	paths := []string{path}
	if folders && l.listsFolders(kind) {
		listed, _ := l.store.promptFolders()
		for _, folder := range listed {
			paths = append(paths, filepath.Join(folder, name+extensions()[kind]))
		}
	}
	return paths
}

// layerFile is the document a repository or project layer says of itself
// in its settings directory (ADR-028 rule 9).
const layerFile = "layer.yaml"

// policiesDir is where a layer held its policies, which are no kind of
// settings: a layer holds none (ADR-030 rule 4).
const policiesDir = "policies"

// policies are what makes the layer invalid in its policies/: each entry
// it holds, or itself when it cannot be listed, such as a file of that
// name. None when there is no policies/, or it is empty.
func (s Store) policies() []document.LayerProblem {
	dir := filepath.Join(s.Dir, policiesDir)
	if !exists(dir) {
		return nil
	}
	const reason = "a layer holds no policies (ADR-030 rule 4): set the policy's fields on each process that names it, then remove it"
	entries, err := os.ReadDir(dir)
	if err != nil {
		return []document.LayerProblem{{Path: dir, Reason: fmt.Sprintf("%s (cannot be listed: %v)", reason, err)}}
	}
	var problems []document.LayerProblem
	for _, entry := range entries {
		problems = append(problems, document.LayerProblem{Path: filepath.Join(dir, entry.Name()), Reason: reason})
	}
	return problems
}

// promptFolders are the folders the layer's layer.yaml lists, each joined
// to the directory that holds the layer's settings directory; none when it
// holds no layer.yaml. A layer.yaml that cannot be read or is invalid, or
// that lists a folder that does not exist or that a link leads out of that
// directory, makes the layer invalid, each such a problem (ADR-028 rule 9).
func (s Store) promptFolders() ([]string, []document.LayerProblem) {
	path := filepath.Join(s.Dir, layerFile)
	if _, err := os.Lstat(path); errors.Is(err, fs.ErrNotExist) {
		return nil, nil
	}
	invalid := func(format string, args ...any) []document.LayerProblem {
		return []document.LayerProblem{{Path: path, Reason: fmt.Sprintf(format, args...)}}
	}
	data, err := s.readBytes(path)
	if err != nil {
		return nil, invalid("cannot be read: %v; so which prompts the layer gives cannot be known", err)
	}
	settings, err := definition.ParseLayer(data)
	var parsed *document.InvalidError
	if errors.As(err, &parsed) {
		return nil, invalid("is invalid: %s; so which prompts the layer gives cannot be known", strings.Join(parsed.Messages(), "; "))
	}
	base := filepath.Dir(s.Dir)
	var folders []string
	var problems []document.LayerProblem
	for _, folder := range settings.Prompts {
		full := filepath.Join(base, folder)
		info, err := os.Stat(full)
		var reason string
		switch {
		case errors.Is(err, fs.ErrNotExist):
			reason = "lists prompts folder " + folder + ", which does not exist in " + base
		case err != nil:
			reason = fmt.Sprintf("lists prompts folder %s, which cannot be read: %v", folder, err)
		case !info.IsDir():
			reason = "lists prompts folder " + folder + ", which is not a folder"
		case !within(base, full):
			reason = "lists prompts folder " + folder + ", which a link leads out of " + base
		}
		if reason != "" {
			problems = append(problems, document.LayerProblem{Path: path, Reason: reason + "; so which prompts the layer gives cannot be known"})
			continue
		}
		folders = append(folders, full)
	}
	if len(problems) > 0 {
		return nil, problems
	}
	return folders, nil
}

// within reports whether path, its links followed, is base or inside it,
// base's links followed too.
func within(base, path string) bool {
	real, err := filepath.EvalSymlinks(path)
	if err != nil {
		return false
	}
	rel, err := filepath.Rel(resolved(base), real)
	return err == nil && filepath.IsLocal(rel)
}

// stores are the layers a document of kind is read from, nearest first.
func (l Layered) stores(kind document.Kind) []layerStore {
	var stores []layerStore
	if l.Project != nil && kind != document.KindBlocks {
		stores = append(stores, layerStore{document.LayerProject, *l.Project})
	}
	if l.Repository != nil {
		stores = append(stores, layerStore{document.LayerRepository, *l.Repository})
	}
	return append(stores, layerStore{document.LayerHome, l.Home})
}

// Read reads the document a definition names, as a call reads it: a prompt
// is also looked for in the folders each layer's layer.yaml lists (ADR-028
// rule 9).
func (l Layered) Read(_ context.Context, kind document.Kind, name string) (document.Document, error) {
	return l.read(kind, name, true)
}

// ReadListed reads the document as the settings list it: a prompt from
// each layer's own prompts/ alone. A folder a layer.yaml lists is read only
// for a name a process gives, and is not otherwise settings (ADR-028 rule
// 9). Any other kind is read as Read reads it.
func (l Layered) ReadListed(_ context.Context, kind document.Kind, name string) (document.Document, error) {
	return l.read(kind, name, false)
}

// read reads the document from the layers, a prompt also from the folders
// each layer lists with folders. A process is laid over the base it
// extends, which is composed from its own layers first (ADR-030 rule 9).
func (l Layered) read(kind document.Kind, name string, folders bool) (document.Document, error) {
	doc, err := l.own(kind, name, folders)
	if kind != document.KindProcess || err != nil {
		return doc, err
	}
	return definition.Extended(doc, func(base string) (document.Document, error) {
		return l.own(kind, base, folders)
	})
}

// own reads the document from its own layers.
func (l Layered) own(kind document.Kind, name string, folders bool) (document.Document, error) {
	source := document.Source{Kind: kind, Name: name}
	stores := l.stores(kind)
	var texts []document.LayerText
	var missing *document.LayerFile
	for i, layer := range stores {
		doc, err := layer.read(kind, name, folders)
		if errors.Is(err, errNotFound) {
			if missing == nil {
				missing = &document.LayerFile{Layer: layer.layer, Path: doc.Source.Path}
			}
			continue
		}
		file := document.LayerFile{Layer: layer.layer, Path: doc.Source.Path, SHA256: doc.Source.SHA256}
		if len(texts) == 0 {
			source.Layer, source.Path = file.Layer, file.Path
		}
		source.Layers = append(source.Layers, file)
		if err != nil {
			// A layer's file that is there and cannot be read breaks the
			// document: it is not skipped in favour of the parent's
			// (ADR-028 rule 5). The texts of the farther ones still say
			// what it is: a process's base is named in the nearest file
			// that holds its whole document (ADR-030 rule 9). They are
			// read only to say so, so one that is not a regular file is
			// passed over, and one that a read would wait on, such as a
			// FIFO, does not hang the command.
			for _, farther := range stores[i+1:] {
				if kind != document.KindProcess {
					break
				}
				if doc, err := farther.readRegular(kind, name); err == nil {
					texts = append(texts, document.LayerText{File: document.LayerFile{Layer: farther.layer, Path: doc.Source.Path, SHA256: doc.Source.SHA256}, Bytes: doc.Bytes})
				}
			}
			return document.Document{Source: source, Texts: texts}, err
		}
		if !document.Composed(kind) {
			source.SHA256 = file.SHA256
			for _, farther := range stores[i+1:] {
				if path := farther.locate(kind, name, folders); path != "" {
					source.Layers = append(source.Layers, document.LayerFile{Layer: farther.layer, Path: path})
				}
			}
			return document.Document{Source: source, Bytes: doc.Bytes}, nil
		}
		texts = append(texts, document.LayerText{File: file, Bytes: doc.Bytes})
	}
	if len(texts) == 0 {
		// A document no layer holds is expected in the nearest: its check
		// names that layer and where its file would be.
		source.Layer, source.Path = missing.Layer, missing.Path
		return document.Document{Source: source}, l.notFound(kind, name, folders)
	}
	data, files, err := definition.Compose(kind, texts)
	source.Layers = files
	if err != nil {
		return document.Document{Source: source, Texts: texts}, err
	}
	for i := range texts {
		texts[i].File = files[i]
	}
	source.SHA256 = digest(data)
	return document.Document{Source: source, Bytes: data, Texts: texts}, nil
}

// notFound says that a document is in no layer, and where each would hold
// it, in the folders each lists too with folders.
func (l Layered) notFound(kind document.Kind, name string, folders bool) error {
	var expected []string
	for _, layer := range l.stores(kind) {
		if layer.layer == document.LayerHome && l.Repository == nil && l.Absent != "" {
			path, _ := Store{Dir: l.Absent}.path(kind, name)
			expected = append(expected, path)
		}
		expected = append(expected, layer.expected(kind, name, folders)...)
	}
	return fmt.Errorf("%w (expected %s)", errNotFound, strings.Join(expected, " or "))
}

// List names every document of kind in any layer.
func (l Layered) List(ctx context.Context, kind document.Kind) ([]string, error) {
	seen := map[string]bool{}
	var all []string
	for _, layer := range l.stores(kind) {
		names, err := layer.store.List(ctx, kind)
		if err != nil {
			return nil, err
		}
		for _, name := range names {
			if !seen[name] {
				seen[name] = true
				all = append(all, name)
			}
		}
	}
	sort.Strings(all)
	return all, nil
}

// Layers are the layers selected, nearest first, each with what makes it
// invalid: a project layer below another .agister (ADR-028 rule 1), or one
// that holds a blocks.yaml (rule 7); a layer.yaml that cannot be used
// (rule 9), and one in home, which has none; a file in any layer's
// policies/ (ADR-030 rule 4).
func (l Layered) Layers(context.Context) []document.LayerDir {
	var layers []document.LayerDir
	if l.Project != nil {
		project := document.LayerDir{Layer: document.LayerProject, Dir: l.Project.Dir}
		for _, nested := range l.Nested {
			project.Invalid = append(project.Invalid, document.LayerProblem{
				Path:   nested,
				Reason: fmt.Sprintf("a second .agister between %s and the worktree's root: there is no fourth layer, so no command would read it; keep one of the two", l.Project.Dir),
			})
		}
		blocks, _ := l.Project.path(document.KindBlocks, string(document.KindBlocks))
		if _, err := os.Lstat(blocks); !errors.Is(err, fs.ErrNotExist) {
			project.Invalid = append(project.Invalid, document.LayerProblem{
				Path:   blocks,
				Reason: "a project layer holds no blocks.yaml: blocks are the repository layer's alone (ADR-018), and what this one lists would run; move it to the repository's .agister or remove it",
			})
		}
		_, invalid := l.Project.promptFolders()
		project.Invalid = append(project.Invalid, invalid...)
		project.Invalid = append(project.Invalid, l.Project.policies()...)
		layers = append(layers, project)
	}
	if l.Repository != nil {
		_, invalid := l.Repository.promptFolders()
		invalid = append(invalid, l.Repository.policies()...)
		layers = append(layers, document.LayerDir{Layer: document.LayerRepository, Dir: l.Repository.Dir, Invalid: invalid})
	}
	home := document.LayerDir{Layer: document.LayerHome, Dir: l.Home.Dir}
	if path := filepath.Join(l.Home.Dir, layerFile); exists(path) {
		home.Invalid = append(home.Invalid, document.LayerProblem{
			Path:   path,
			Reason: "home holds no layer.yaml: home is one folder and names no path (ADR-027 rule 4); remove it",
		})
	}
	home.Invalid = append(home.Invalid, l.Home.policies()...)
	return append(layers, home)
}

// exists reports whether there is an entry at path, whatever it is.
func exists(path string) bool {
	_, err := os.Lstat(path)
	return !errors.Is(err, fs.ErrNotExist)
}

// Select selects the layers of a command launched in the directory launch
// of the git worktree whose root is root (ADR-028 rule 1): the
// repository's is <root>/.agister, and the project's the .agister of the
// nearest directory that holds one, from launch upward and below root. A
// .agister that is home itself is no layer. One that exists but cannot be
// used is an error, so a layer's settings never silently stop applying.
func Select(home Store, root, launch string) (Layered, error) {
	selected := Layered{Home: home}
	settings := func(dir string) (string, bool, error) {
		path := filepath.Join(dir, settingsDir)
		info, err := os.Stat(path)
		if errors.Is(err, fs.ErrNotExist) {
			// Only no entry there is no layer: one that cannot be
			// resolved, a dangling symlink, is a layer that cannot be used.
			if _, lerr := os.Lstat(path); errors.Is(lerr, fs.ErrNotExist) {
				return path, false, nil
			}
		}
		switch {
		case err != nil:
			return path, false, fmt.Errorf("settings %s: %w", path, err)
		case !info.IsDir():
			return path, false, fmt.Errorf("settings %s: not a directory", path)
		}
		return path, !sameDir(path, home.Dir), nil
	}
	// The directories from launch up to root, below it, named from root as
	// it was given, wherever links lead.
	var below []string
	if rel, err := filepath.Rel(resolved(root), resolved(launch)); err == nil && rel != "." && filepath.IsLocal(rel) {
		for dir := rel; dir != "."; dir = filepath.Dir(dir) {
			path, layer, err := settings(filepath.Join(root, dir))
			if err != nil {
				return Layered{}, err
			}
			if layer {
				below = append(below, path)
			}
		}
	}
	if len(below) > 0 {
		selected.Project, selected.Nested = &Store{Dir: below[0]}, below[1:]
	}
	path, layer, err := settings(root)
	switch {
	case err != nil:
		return Layered{}, err
	case layer:
		selected.Repository = &Store{Dir: path}
	case !sameDir(path, home.Dir):
		selected.Absent = path
	}
	return selected, nil
}

// settingsDir is the name of a layer's settings directory in the
// directory that holds it.
const settingsDir = ".agister"

// resolved is dir with its links followed, or dir itself where that fails.
func resolved(dir string) string {
	if path, err := filepath.EvalSymlinks(dir); err == nil {
		return path
	}
	return dir
}

func sameDir(a, b string) bool {
	infoA, errA := os.Stat(a)
	infoB, errB := os.Stat(b)
	return errA == nil && errB == nil && os.SameFile(infoA, infoB)
}
