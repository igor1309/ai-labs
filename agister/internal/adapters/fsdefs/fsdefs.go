// Package fsdefs stores definition documents as files under Agister's
// state directory: service.toml, agents/*.toml, processes/*.yaml,
// policies/*.yaml, runtimes/*.yaml, schemas/*.json. Layered reads a
// project's own settings over the global ones.
package fsdefs

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"syscall"

	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
)

var errNotFound = errors.New("not found")

type Store struct {
	Dir string

	// at, when set, is called at the steps of Write that the lock must
	// cover; tests use it to observe the lock there.
	at func(point string)
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

var extensions = map[definition.Kind]string{
	definition.KindService: ".toml",
	definition.KindAgent:   ".toml",
	definition.KindProcess: ".yaml",
	definition.KindPolicy:  ".yaml",
	definition.KindRuntime: ".yaml",
	definition.KindSchema:  ".json",
}

func (s Store) path(kind definition.Kind, name string) (string, error) {
	extension, ok := extensions[kind]
	if !ok {
		return "", fmt.Errorf("unknown definition kind %q", kind)
	}
	if kind == definition.KindService {
		return filepath.Join(s.Dir, "service"+extension), nil
	}
	if !definition.ValidName(name) {
		return "", fmt.Errorf("invalid name %q", name)
	}
	return filepath.Join(s.Dir, string(kind), name+extension), nil
}

func (s Store) Read(_ context.Context, kind definition.Kind, name string) (definition.Document, error) {
	path, err := s.path(kind, name)
	if err != nil {
		return definition.Document{}, err
	}
	data, err := os.ReadFile(path)
	if errors.Is(err, fs.ErrNotExist) {
		return definition.Document{}, fmt.Errorf("%w (expected %s)", errNotFound, path)
	}
	if err != nil {
		return definition.Document{}, err
	}
	return definition.Document{
		Source: definition.Source{Kind: kind, Name: name, Path: path, SHA256: digest(data)},
		Bytes:  data,
	}, nil
}

func (s Store) List(_ context.Context, kind definition.Kind) ([]string, error) {
	entries, err := os.ReadDir(filepath.Join(s.Dir, string(kind)))
	if errors.Is(err, fs.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var names []string
	for _, entry := range entries {
		if name, ok := strings.CutSuffix(entry.Name(), extensions[kind]); ok && !entry.IsDir() {
			names = append(names, name)
		}
	}
	sort.Strings(names)
	return names, nil
}

func (s Store) Current(_ context.Context, kind definition.Kind, name string) (string, string, error) {
	path, err := s.path(kind, name)
	if err != nil {
		return "", "", err
	}
	data, err := os.ReadFile(path)
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
// between the compare and the rename can still be lost.
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

func digest(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

// Layered reads a project's settings over the global ones: a project
// document takes priority over the global document of the same kind and
// name, and says which one it overrides. Checking the composed result is
// the core's job, not the store's.
type Layered struct {
	Global  Store
	Project *Store // nil outside a project
}

func (l Layered) Read(ctx context.Context, kind definition.Kind, name string) (definition.Document, error) {
	if l.Project == nil {
		return l.Global.Read(ctx, kind, name)
	}
	doc, err := l.Project.Read(ctx, kind, name)
	if errors.Is(err, errNotFound) {
		doc, err = l.Global.Read(ctx, kind, name)
		if errors.Is(err, errNotFound) {
			projectPath, _ := l.Project.path(kind, name)
			globalPath, _ := l.Global.path(kind, name)
			return doc, fmt.Errorf("%w (expected %s or %s)", errNotFound, projectPath, globalPath)
		}
		return doc, err
	}
	if err != nil {
		return doc, err
	}
	doc.Source.Project = true
	if globalPath, err := l.Global.path(kind, name); err == nil {
		if _, err := os.Stat(globalPath); err == nil {
			doc.Source.Overrides = globalPath
		}
	}
	return doc, nil
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
