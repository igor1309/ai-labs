package fsdefs

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"slices"
	"sort"
	"strings"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/contract"
	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
)

// kinds is every kind the store holds, in a fixed order.
func kinds() []definition.Kind {
	known := extensions()
	all := make([]definition.Kind, 0, len(known))
	for kind := range known {
		all = append(all, kind)
	}
	sort.Slice(all, func(a, b int) bool { return all[a] < all[b] })
	return all
}

// singleton kinds are one document at the top of the store, not a folder.
func singleton(kind definition.Kind) bool {
	return kind == definition.KindService || kind == definition.KindWorkspace || kind == definition.KindBlocks
}

// Documents reads every settings document of the store: those List names,
// and the service when there is one. A file whose name breaks the naming
// rule is no document, so it is not read. One that cannot be read is in
// unreadable, by its source, with no digest.
func (s Store) Documents(ctx context.Context) (docs []definition.Document, unreadable []definition.Source, err error) {
	docs, err = s.documents(ctx, kinds(), func(doc definition.Document, _ error) error {
		unreadable = append(unreadable, doc.Source)
		return nil
	})
	return docs, unreadable, err
}

// documents reads every settings document of the given kinds, as Documents
// does, and calls unreadable with each one that cannot be read and why; its
// error stops the read.
func (s Store) documents(ctx context.Context, kinds []definition.Kind, unreadable func(definition.Document, error) error) ([]definition.Document, error) {
	var docs []definition.Document
	for _, kind := range kinds {
		var names []string
		if kind == definition.KindService {
			path, _ := s.path(kind, string(kind))
			info, err := os.Stat(path)
			switch {
			case errors.Is(err, fs.ErrNotExist):
			case err != nil:
				return nil, err
			case !info.IsDir():
				names = []string{string(kind)}
			}
		} else {
			var err error
			if names, err = s.List(ctx, kind); err != nil {
				return nil, err
			}
		}
		for _, name := range names {
			if !singleton(kind) && !definition.ValidName(name) {
				continue
			}
			doc, err := s.Read(ctx, kind, name)
			if err != nil {
				if err := unreadable(doc, err); err != nil {
					return nil, err
				}
				continue
			}
			docs = append(docs, doc)
		}
	}
	return docs, nil
}

// installed reports whether install reads a source folder's documents of
// kind: not its blocks, as home has none (ADR-018 rule 6), nor its skills,
// which are not installed (ADR-021).
func installed(kind definition.Kind) bool {
	return kind != definition.KindBlocks && kind != definition.KindSkill
}

// Source reads the settings documents of the folder dir, laid out like the
// store, and names its other files, slash-separated and relative to it; a
// folder that is not a kind's is named once, with a trailing slash, and not
// read. Its blocks.yaml is named, not read: home has no blocks (ADR-018 rule
// 6). Its skills/ is named and not read either (ADR-016 rule 1, ADR-021). A
// symbolic link in it refuses the whole folder, so nothing outside it is
// installed.
func (s Store) Source(ctx context.Context, dir string) ([]definition.Document, []string, error) {
	info, err := os.Stat(dir)
	if errors.Is(err, fs.ErrNotExist) {
		return nil, nil, &contract.InputError{Message: fmt.Sprintf("no folder %s to install", dir)}
	}
	if err != nil {
		return nil, nil, err
	}
	if !info.IsDir() {
		return nil, nil, &contract.InputError{Message: fmt.Sprintf("%s is not a folder of settings", dir)}
	}
	// The folder itself may be reached through a link; what is in it may not.
	root, err := filepath.EvalSymlinks(dir)
	if err != nil {
		return nil, nil, err
	}
	var files []string
	err = filepath.WalkDir(root, func(path string, entry fs.DirEntry, err error) error {
		if err != nil || path == root {
			return err
		}
		rel, err := filepath.Rel(root, path)
		if err != nil || !filepath.IsLocal(rel) {
			return &contract.InputError{Message: fmt.Sprintf("%s leaves %s, so nothing was installed", path, dir)}
		}
		path = filepath.Join(dir, rel)
		if entry.Type()&fs.ModeSymlink != 0 {
			return &contract.InputError{Message: fmt.Sprintf("%s is a symbolic link, so nothing was installed", path)}
		}
		rel = filepath.ToSlash(rel)
		if entry.IsDir() {
			if kind := definition.Kind(rel); extensions()[kind] != "" && !singleton(kind) && installed(kind) {
				return nil
			}
			files = append(files, rel+"/")
			return fs.SkipDir
		}
		files = append(files, rel)
		return nil
	})
	if err != nil {
		return nil, nil, err
	}
	read := slices.DeleteFunc(kinds(), func(kind definition.Kind) bool { return !installed(kind) })
	// A document of the folder that cannot be read refuses it.
	docs, err := Store{Dir: dir}.documents(ctx, read, func(_ definition.Document, err error) error { return err })
	if err != nil {
		return nil, nil, err
	}
	documents := map[string]bool{}
	for _, doc := range docs {
		rel, _ := filepath.Rel(dir, doc.Source.Path)
		documents[filepath.ToSlash(rel)] = true
	}
	var ignored []string
	for _, file := range files {
		if !documents[file] {
			ignored = append(ignored, file)
		}
	}
	return docs, ignored, nil
}

// Stage writes docs into a new temporary folder laid out like the store.
// What is read from it is described as the store's: each document's path
// is the store's. What the store lists that the stage lacks, a file whose
// name breaks the naming rule or a document that cannot be read, is listed
// and read from the store, so a check of the stage finds it as a check of
// the store does.
func (s Store) Stage(ctx context.Context, docs []definition.Document) (Staged, func(), error) {
	dir, err := os.MkdirTemp(s.temp, "agister-install-")
	if err != nil {
		return Staged{}, nil, err
	}
	remove := func() { os.RemoveAll(dir) }
	stage := Store{Dir: dir}
	for _, doc := range docs {
		if _, written, err := stage.Write(ctx, doc.Source.Kind, doc.Source.Name, doc.Bytes, ""); err != nil || !written {
			remove()
			return Staged{}, nil, fmt.Errorf("staging %s %s: written %v: %v", doc.Source.Kind.Singular(), doc.Source.Name, written, err)
		}
	}
	return Staged{stage: stage, home: s}, remove, nil
}

// StagingIn returns the store with its stages made in root, in place of the
// system's temporary folder.
func (s Store) StagingIn(root string) Store {
	s.temp = root
	return s
}

// Staged is a stage, described as the store it stages.
type Staged struct {
	stage Store
	home  Store
}

func (s Staged) Read(ctx context.Context, kind definition.Kind, name string) (definition.Document, error) {
	doc, err := s.stage.Read(ctx, kind, name)
	if errors.Is(err, errNotFound) {
		return s.home.Read(ctx, kind, name)
	}
	if err == nil {
		doc.Source.Path, _ = s.home.path(kind, name)
	}
	return doc, err
}

func (s Staged) List(ctx context.Context, kind definition.Kind) ([]string, error) {
	staged, err := s.stage.List(ctx, kind)
	if err != nil {
		return nil, err
	}
	home, err := s.home.List(ctx, kind)
	if err != nil {
		return nil, err
	}
	names := append(staged, home...)
	sort.Strings(names)
	return slices.Compact(names), nil
}

// Lock takes the store's write lock, the one Write takes, and returns its
// release.
func (s Store) Lock(context.Context) (func(), error) {
	return s.lock()
}

// Put writes data as the document atomically: a temporary file in the same
// folder, synced, then renamed into place. It takes no lock: the caller
// holds it.
func (s Store) Put(_ context.Context, kind definition.Kind, name string, data []byte) error {
	path, err := s.path(kind, name)
	if err != nil {
		return err
	}
	return writeFile(path, data)
}

// Remove removes the document; none there is no error. It takes no lock:
// the caller holds it.
func (s Store) Remove(_ context.Context, kind definition.Kind, name string) error {
	path, err := s.path(kind, name)
	if err != nil {
		return err
	}
	if err := os.Remove(path); err != nil && !errors.Is(err, fs.ErrNotExist) {
		return err
	}
	return syncDir(filepath.Dir(path))
}

// writeFile writes data at path atomically and durably: a temporary file
// beside it, synced, renamed into place, and the folder synced.
func writeFile(path string, data []byte) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	temp, err := os.CreateTemp(filepath.Dir(path), "."+filepath.Base(path)+".*")
	if err != nil {
		return err
	}
	defer os.Remove(temp.Name())
	if _, err := temp.Write(data); err != nil {
		temp.Close()
		return err
	}
	if err := temp.Sync(); err != nil {
		temp.Close()
		return err
	}
	if err := temp.Close(); err != nil {
		return err
	}
	if err := os.Rename(temp.Name(), path); err != nil {
		return err
	}
	return syncDir(filepath.Dir(path))
}

func syncDir(dir string) error {
	folder, err := os.Open(dir)
	if err != nil {
		return err
	}
	defer folder.Close()
	return folder.Sync()
}

// Backups keeps install backups (ADR-016), a folder each, named by its
// stamp: the bytes of each document the install replaced, laid out like
// the store, and its manifest.
type Backups struct {
	Dir string

	// write, when set, writes each file of a backup in writeFile's place;
	// tests use it to fail a write.
	write func(path string, data []byte) error
}

const manifestName = "manifest.json"

// Manifest is a backup's manifest.json: what one install changes, recorded
// before it changes anything.
type Manifest struct {
	Stamp     string          `json:"stamp"`
	Source    string          `json:"source"`
	Installed time.Time       `json:"installed"`
	Documents []ManifestEntry `json:"documents"`
}

// ManifestEntry is one document an install creates or replaces.
type ManifestEntry struct {
	Path   string `json:"path"`
	Kind   string `json:"kind"`
	Name   string `json:"name"`
	Action string `json:"action"`           // create | replace
	Before string `json:"before,omitempty"` // digest; empty for a create, or a replace of one that could not be read
	After  string `json:"after"`            // digest
}

func (b Backups) writeFile(path string, data []byte) error {
	if b.write != nil {
		return b.write(path, data)
	}
	return writeFile(path, data)
}

// folder is the backup's folder; a stamp that is not one name is refused.
func (b Backups) folder(stamp string) (string, error) {
	if stamp == "" || stamp != filepath.Base(stamp) || strings.HasPrefix(stamp, ".") || !filepath.IsLocal(stamp) {
		return "", fmt.Errorf("invalid backup stamp %q", stamp)
	}
	return filepath.Join(b.Dir, stamp), nil
}

// Save writes each saved document, then the manifest, each durably. The
// backup's folder is new: Save never writes into another backup, and
// removes its own when it fails.
func (b Backups) Save(_ context.Context, stamp string, manifest Manifest, saved []definition.Document) (err error) {
	dir, err := b.folder(stamp)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(b.Dir, 0o700); err != nil {
		return err
	}
	if err := os.Mkdir(dir, 0o700); err != nil {
		return err
	}
	defer func() {
		if err != nil {
			os.RemoveAll(dir)
		}
	}()
	backup := Store{Dir: dir}
	for _, doc := range saved {
		path, err := backup.path(doc.Source.Kind, doc.Source.Name)
		if err != nil {
			return err
		}
		if err := b.writeFile(path, doc.Bytes); err != nil {
			return err
		}
	}
	data, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return err
	}
	if err := b.writeFile(filepath.Join(dir, manifestName), append(data, '\n')); err != nil {
		return err
	}
	return syncDir(b.Dir)
}

// List names the backups kept, in order.
func (b Backups) List(context.Context) ([]string, error) {
	entries, err := os.ReadDir(b.Dir)
	if errors.Is(err, fs.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var stamps []string
	for _, entry := range entries {
		if entry.IsDir() && !strings.HasPrefix(entry.Name(), ".") {
			stamps = append(stamps, entry.Name())
		}
	}
	return stamps, nil
}

func (b Backups) Manifest(_ context.Context, stamp string) (Manifest, error) {
	dir, err := b.folder(stamp)
	if err != nil {
		return Manifest{}, err
	}
	data, err := os.ReadFile(filepath.Join(dir, manifestName))
	if err != nil {
		return Manifest{}, err
	}
	var manifest Manifest
	if err := json.Unmarshal(data, &manifest); err != nil {
		return Manifest{}, fmt.Errorf("%s: %w", filepath.Join(dir, manifestName), err)
	}
	return manifest, nil
}

func (b Backups) Saved(ctx context.Context, stamp string, kind definition.Kind, name string) ([]byte, error) {
	dir, err := b.folder(stamp)
	if err != nil {
		return nil, err
	}
	doc, err := Store{Dir: dir}.Read(ctx, kind, name)
	return doc.Bytes, err
}

func (b Backups) Remove(_ context.Context, stamp string) error {
	dir, err := b.folder(stamp)
	if err != nil {
		return err
	}
	return os.RemoveAll(dir)
}
