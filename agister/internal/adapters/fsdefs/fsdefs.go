// Package fsdefs stores definition documents as files under Agister's
// state directory: service.toml, agents/*.toml, processes/*.yaml,
// policies/*.yaml, runtimes/*.yaml, schemas/*.json.
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

	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
)

type Store struct {
	Dir string
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
		return definition.Document{}, fmt.Errorf("not found (expected %s)", path)
	}
	if err != nil {
		return definition.Document{}, err
	}
	sum := sha256.Sum256(data)
	return definition.Document{
		Source: definition.Source{Kind: kind, Name: name, Path: path, SHA256: hex.EncodeToString(sum[:])},
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

func (s Store) Write(_ context.Context, kind definition.Kind, name string, data []byte, overwrite bool) (string, bool, error) {
	path, err := s.path(kind, name)
	if err != nil {
		return "", false, err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return "", false, err
	}
	flags := os.O_WRONLY | os.O_CREATE | os.O_TRUNC
	if !overwrite {
		flags = os.O_WRONLY | os.O_CREATE | os.O_EXCL
	}
	file, err := os.OpenFile(path, flags, 0o600)
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
