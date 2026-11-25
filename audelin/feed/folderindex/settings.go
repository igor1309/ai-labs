package folderindex

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"path/filepath"
	"slices"
	"strings"
)

// settingsReader reads the roots from the settings file, {"roots": [...]},
// and checks each is a folder.
type settingsReader struct {
	readFile func(path string) ([]byte, error)
	lstat    func(path string) (fs.FileInfo, error)
}

func (s settingsReader) roots(path, home string) ([]string, error) {
	data, err := s.readFile(path)
	if err != nil {
		return nil, fmt.Errorf("settings %s: %w", path, err)
	}
	configured, err := parseSettings(data)
	if err != nil {
		return nil, fmt.Errorf("settings %s: %w", path, err)
	}
	roots := make([]string, 0, len(configured))
	for _, root := range configured {
		if slices.Contains(strings.Split(filepath.ToSlash(root), "/"), "..") {
			return nil, fmt.Errorf("settings %s: root %q: expected a path with no .. part", path, root)
		}
		if strings.HasPrefix(root, "~/") {
			root = filepath.Join(home, root[2:])
		}
		if !filepath.IsAbs(root) {
			return nil, fmt.Errorf("settings %s: root %q: expected an absolute path or one starting with ~/", path, root)
		}
		root = filepath.Clean(root)
		info, err := s.lstat(root)
		if err == nil && !info.IsDir() {
			err = errors.New("expected a directory")
		}
		if err != nil {
			return nil, fmt.Errorf("root %q: %w", root, err)
		}
		roots = append(roots, root)
	}
	return roots, nil
}

const settingsShape = `expected {"roots": ["<folder>", ...]}`

func parseSettings(data []byte) ([]string, error) {
	decoder := json.NewDecoder(bytes.NewReader(data))
	var document map[string]json.RawMessage
	if err := decoder.Decode(&document); err != nil {
		return nil, fmt.Errorf("%s: %w", settingsShape, err)
	}
	if _, err := decoder.Token(); err != io.EOF {
		return nil, fmt.Errorf("%s: data after the object", settingsShape)
	}
	if members, err := topLevelMembers(data); err != nil {
		return nil, fmt.Errorf("%s: %w", settingsShape, err)
	} else if members != 1 {
		return nil, fmt.Errorf(`%s: "roots" given more than once`, settingsShape)
	}
	raw, ok := document["roots"]
	if !ok || len(document) != 1 {
		return nil, errors.New(settingsShape)
	}
	var roots []string
	if err := json.Unmarshal(raw, &roots); err != nil {
		return nil, fmt.Errorf("%s: %w", settingsShape, err)
	}
	if len(roots) == 0 {
		return nil, errors.New(`"roots" names no folder`)
	}
	return roots, nil
}

// topLevelMembers counts the object's members as written, so a repeated
// key, which decoding into a map silently merges, is seen.
func topLevelMembers(data []byte) (int, error) {
	decoder := json.NewDecoder(bytes.NewReader(data))
	if _, err := decoder.Token(); err != nil {
		return 0, err
	}
	members := 0
	for decoder.More() {
		if _, err := decoder.Token(); err != nil {
			return 0, err
		}
		var value json.RawMessage
		if err := decoder.Decode(&value); err != nil {
			return 0, err
		}
		members++
	}
	return members, nil
}
