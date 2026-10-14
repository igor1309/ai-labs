// Package fakeskills reads, for the fake runtimes, the folders a turn's
// skills are given in, so a fake can echo what it was given while it runs.
package fakeskills

import (
	"io/fs"
	"os"
	"path/filepath"
)

// Files are the regular files under dir, by their slash-separated path
// within it, with their text; empty when dir holds none or does not exist.
func Files(dir string) map[string]string {
	files := map[string]string{}
	_ = filepath.WalkDir(dir, func(path string, entry fs.DirEntry, err error) error {
		if err != nil || !entry.Type().IsRegular() {
			return nil
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return nil
		}
		rel, _ := filepath.Rel(dir, path)
		files[filepath.ToSlash(rel)] = string(data)
		return nil
	})
	return files
}

// Given is Files of each folder, by the folder as it was given.
func Given(dirs []string) map[string]map[string]string {
	given := map[string]map[string]string{}
	for _, dir := range dirs {
		given[dir] = Files(dir)
	}
	return given
}
