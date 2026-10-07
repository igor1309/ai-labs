// Package fsdefs stores definition documents as files under Agister's
// state directory: service.toml, workspace.yaml, blocks.yaml, agents/*.toml,
// processes/*.yaml, policies/*.yaml, runtimes/*.yaml, schemas/*.json,
// workflows/*.yaml, verifies/*.yaml, prompts/*.md, skills/*/SKILL.md,
// briefs/*.yaml. Layered
// reads a project's own settings over the global ones.
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
)

var errNotFound = definition.ErrNotFound

type Store struct {
	Dir string

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
func extensions() map[definition.Kind]string {
	return map[definition.Kind]string{
		definition.KindService:  ".toml",
		definition.KindAgent:    ".toml",
		definition.KindProcess:  ".yaml",
		definition.KindPolicy:   ".yaml",
		definition.KindRuntime:  ".yaml",
		definition.KindSchema:   ".json",
		definition.KindWorkflow: ".yaml",
		definition.KindVerify:   ".yaml",
		definition.KindPrompt:   ".md",
		definition.KindBrief:    ".yaml",
		// A folder each, holding the one file skillFile (ADR-021 rule 1).
		definition.KindSkill: ".md",
		// Singletons, like the service.
		definition.KindWorkspace: ".yaml",
		definition.KindBlocks:    ".yaml",
	}
}

// skillFile is the one file a skill's folder holds, the skill's document
// (ADR-021 rule 1).
const skillFile = "SKILL.md"

func (s Store) path(kind definition.Kind, name string) (string, error) {
	extension, ok := extensions()[kind]
	if !ok {
		return "", fmt.Errorf("unknown definition kind %q", kind)
	}
	if singleton(kind) {
		return filepath.Join(s.Dir, string(kind)+extension), nil
	}
	if !definition.ValidName(name) {
		return "", fmt.Errorf("invalid name %q", name)
	}
	if kind == definition.KindSkill {
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
			return fmt.Errorf("%s is a symbolic link: a skill is a folder in the settings' own %s/", skills, definition.KindSkill)
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

func (s Store) Read(_ context.Context, kind definition.Kind, name string) (definition.Document, error) {
	path, err := s.path(kind, name)
	if err != nil {
		return definition.Document{}, err
	}
	doc := definition.Document{Source: definition.Source{Kind: kind, Name: name, Path: path}}
	var data []byte
	if kind == definition.KindSkill {
		// A skill that is there and broken is not absent: reading it fails
		// with what is wrong.
		if data, err = s.readSkill(path); err != nil {
			return doc, err
		}
	} else {
		data, err = os.ReadFile(path)
	}
	if errors.Is(err, fs.ErrNotExist) {
		// Blocks that exist but cannot be resolved, a dangling symlink, are
		// not absent: reading them fails, with no fallback to home's
		// (ADR-018 rule 5).
		if kind == definition.KindBlocks {
			if _, lerr := os.Lstat(path); lerr == nil {
				return doc, fmt.Errorf("cannot be resolved: %v", err)
			}
		}
		// Nor is a prompt whose file or folder is a dangling symlink: an
		// optional one would be left out of the call where the settings
		// are broken (ADR-019 rule 1, D-11). Nor a brief's form: home's
		// would check the text in place of the project's (ADR-015).
		if kind == definition.KindPrompt || kind == definition.KindBrief {
			if _, lerr := os.Lstat(path); lerr == nil {
				return doc, fmt.Errorf("cannot be resolved: %v", err)
			}
			if err := resolvable(filepath.Dir(path)); err != nil {
				return doc, err
			}
		}
		return doc, fmt.Errorf("%w (expected %s)", errNotFound, path)
	}
	if err != nil {
		return doc, err
	}
	return definition.Document{
		Source: definition.Source{Kind: kind, Name: name, Path: path, SHA256: digest(data)},
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
func (s Store) List(_ context.Context, kind definition.Kind) ([]string, error) {
	if kind == definition.KindBlocks {
		path, _ := s.path(kind, string(kind))
		if _, err := os.Lstat(path); errors.Is(err, fs.ErrNotExist) {
			return nil, nil
		} else if err != nil {
			return nil, err
		}
		return []string{string(kind)}, nil
	}
	if kind == definition.KindWorkspace {
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
		if kind == definition.KindPrompt || kind == definition.KindBrief {
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
		if kind == definition.KindSkill {
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
		if kind == definition.KindPrompt && !definition.ValidName(name) {
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
// store for the skill (ADR-027 rule 8).
func (s Store) Current(_ context.Context, kind definition.Kind, name string) (string, string, error) {
	path, err := s.path(kind, name)
	if err != nil {
		return "", "", err
	}
	var data []byte
	if kind == definition.KindSkill {
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
func (s Store) Write(_ context.Context, kind definition.Kind, name string, data []byte, expected string) (string, bool, error) {
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

// Layered reads a project's settings over the global ones: a project
// document takes priority over the global document of the same kind and
// name, and says which one it overrides. Checking the composed result is
// the core's job, not the store's.
//
// Blocks are read the same way, and only a project's block anything
// (ADR-018 rule 1): Source.Project says whose they are. Home's are still
// read, where the project has none, so check reports them.
type Layered struct {
	Global  Store
	Project *Store // nil outside a project
	// Absent, when Project is nil, is the settings directory of the
	// repository that has none: a document found in neither layer names
	// where it was expected there too.
	Absent string
}

func (l Layered) Read(ctx context.Context, kind definition.Kind, name string) (definition.Document, error) {
	if l.Project == nil {
		doc, err := l.Global.Read(ctx, kind, name)
		if errors.Is(err, errNotFound) && l.Absent != "" {
			return doc, l.notFound(Store{Dir: l.Absent}, kind, name)
		}
		return doc, err
	}
	doc, err := l.Project.Read(ctx, kind, name)
	if errors.Is(err, errNotFound) {
		doc, err = l.Global.Read(ctx, kind, name)
		if errors.Is(err, errNotFound) {
			return doc, l.notFound(*l.Project, kind, name)
		}
		return doc, err
	}
	doc.Source.Project = true
	if err != nil {
		return doc, err
	}
	if globalPath, err := l.Global.path(kind, name); err == nil {
		if _, err := os.Stat(globalPath); err == nil {
			doc.Source.Overrides = globalPath
		}
	}
	return doc, nil
}

// notFound says that a document is in neither project nor the global store,
// and where each would hold it.
func (l Layered) notFound(project Store, kind definition.Kind, name string) error {
	projectPath, _ := project.path(kind, name)
	globalPath, _ := l.Global.path(kind, name)
	return fmt.Errorf("%w (expected %s or %s)", errNotFound, projectPath, globalPath)
}

// List names every document of kind in either layer.
func (l Layered) List(ctx context.Context, kind definition.Kind) ([]string, error) {
	names, err := l.Global.List(ctx, kind)
	if err != nil || l.Project == nil {
		return names, err
	}
	project, err := l.Project.List(ctx, kind)
	if err != nil {
		return nil, err
	}
	seen := map[string]bool{}
	var all []string
	for _, name := range append(names, project...) {
		if !seen[name] {
			seen[name] = true
			all = append(all, name)
		}
	}
	sort.Strings(all)
	return all, nil
}
