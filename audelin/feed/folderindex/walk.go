package folderindex

import (
	"io/fs"
	"path"
	"path/filepath"
	"slices"
	"strings"
)

// tree reads one root by slash-separated names relative to it, "." being
// the root itself. A name never resolves outside the root.
type tree interface {
	ReadDir(name string) ([]fs.DirEntry, error)
	ReadFile(name string) ([]byte, error)
}

// catalog walks one root, adding its entries by absolute path.
type catalog struct {
	root    string
	tree    tree
	entries map[string]entry
}

func (c catalog) walk(name string, children []fs.DirEntry) {
	repo := isRepository(children)
	if repo {
		c.add(name, readmeName(children))
	}
	for _, child := range children {
		base := child.Name()
		if !child.IsDir() || base == "node_modules" || strings.HasPrefix(base, ".") {
			continue
		}
		sub := path.Join(name, base)
		files, err := c.tree.ReadDir(sub)
		if err != nil {
			continue
		}
		if !repo {
			c.walk(sub, files)
		} else if readme := readmeName(files); readme != "" || isRepository(files) {
			c.add(sub, readme)
		}
	}
}

// isRepository says whether a folder holds .git, a directory or a file.
func isRepository(children []fs.DirEntry) bool {
	return slices.ContainsFunc(children, func(child fs.DirEntry) bool {
		return child.Name() == ".git" && (child.IsDir() || child.Type().IsRegular())
	})
}

func readmeName(files []fs.DirEntry) string {
	for _, preferred := range [...]string{"README.md", "README", "README.markdown"} {
		for _, file := range files {
			if file.Type().IsRegular() && strings.EqualFold(preferred, file.Name()) {
				return file.Name()
			}
		}
	}
	return ""
}

func (c catalog) add(name, readme string) {
	absolute := filepath.Join(c.root, filepath.FromSlash(name))
	if _, exists := c.entries[absolute]; exists {
		return
	}
	item := entry{summary: "no README"}
	if readme != "" {
		item.readme = filepath.Join(absolute, readme)
		item.summary = "no summary"
		if data, err := c.tree.ReadFile(path.Join(name, readme)); err == nil {
			item.summary = summary(string(data))
		}
	}
	c.entries[absolute] = item
}
