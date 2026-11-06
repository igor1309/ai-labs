// Package store keeps the bot's state in one JSON file; a rename keeps it
// whole on a crash.
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

// Save writes the state readable by its owner only.
func Save[T any](path string, state T) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	data, err := json.Marshal(state)
	if err != nil {
		return err
	}
	temp := path + ".tmp"
	if err := os.WriteFile(temp, data, 0o600); err != nil {
		return err
	}
	return os.Rename(temp, path)
}
