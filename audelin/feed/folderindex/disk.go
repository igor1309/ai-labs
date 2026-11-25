package folderindex

import (
	"fmt"
	"io"
	"os"
)

// diskJob binds a generation to the files: the settings file, the roots and
// the index.
func diskJob(settingsPath, home, destination string) job {
	settings := settingsReader{readFile: os.ReadFile, lstat: os.Lstat}
	return job{
		load:    func() ([]string, error) { return settings.roots(settingsPath, home) },
		collect: collectFromDisk,
		publish: func(index string) error { return diskPublisher.publish(destination, index) },
	}
}

// collectFromDisk walks each root through an os.Root, so a folder swapped
// for a symlink after it was listed cannot lead the walk outside its root.
func collectFromDisk(roots []string) (map[string]entry, error) {
	entries := make(map[string]entry)
	for _, root := range roots {
		if err := collectRoot(root, entries); err != nil {
			return nil, err
		}
	}
	return entries, nil
}

func collectRoot(root string, entries map[string]entry) error {
	opened, err := os.OpenRoot(root)
	if err != nil {
		return fmt.Errorf("root %q: %w", root, err)
	}
	defer opened.Close()
	return collectTree(root, rootTree{opened}, entries)
}

func collectTree(root string, t tree, entries map[string]entry) error {
	children, err := t.ReadDir(".")
	if err != nil {
		return fmt.Errorf("root %q: %w", root, err)
	}
	catalog{root: root, tree: t, entries: entries}.walk(".", children)
	return nil
}

type rootTree struct{ root *os.Root }

func (t rootTree) ReadDir(name string) ([]os.DirEntry, error) {
	file, err := t.root.Open(name)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	return file.ReadDir(-1)
}

func (t rootTree) ReadFile(name string) ([]byte, error) {
	file, err := t.root.Open(name)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	return io.ReadAll(file)
}
