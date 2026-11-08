// Package store writes private JSON files by atomic replacement.
package store

import (
	"encoding/json"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
)

// Load reads the state, or returns empty() when there is no file yet.
func Load[T any](path string, empty func() T) (T, error) {
	data, err := os.ReadFile(path)
	if errors.Is(err, fs.ErrNotExist) {
		return empty(), nil
	}
	var state T
	if err != nil {
		return state, err
	}
	return state, json.Unmarshal(data, &state)
}

type replacementFile interface {
	Name() string
	Write([]byte) (int, error)
	Sync() error
	Close() error
}

type fileOps struct {
	createTemp func(string, string) (replacementFile, error)
	rename     func(string, string) error
	remove     func(string) error
}

// Save writes the state readable by its owner only.
func Save[T any](path string, state T) error {
	return save(path, state, fileOps{
		createTemp: func(dir, pattern string) (replacementFile, error) { return os.CreateTemp(dir, pattern) },
		rename:     os.Rename,
		remove:     os.Remove,
	})
}

func save[T any](path string, state T, ops fileOps) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	data, err := json.Marshal(state)
	if err != nil {
		return err
	}
	f, err := ops.createTemp(filepath.Dir(path), ".state-*")
	if err != nil {
		return err
	}
	name := f.Name()
	defer ops.remove(name)
	if _, err = f.Write(data); err != nil {
		f.Close()
		return err
	}
	if err = f.Sync(); err != nil {
		f.Close()
		return err
	}
	if err = f.Close(); err != nil {
		return err
	}
	return ops.rename(name, path)
}
