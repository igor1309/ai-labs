// Package files is the operating system's filesystem, in its own types
// (ADR-001): a folder's entries, each with what it is, a file's bytes,
// and a folder's path with its links resolved.
package files

import (
	"os"
	"path/filepath"
)

// Entry is a name in a folder and what is there.
type Entry struct {
	Name string
	Kind Kind
}

// Kind is what an entry is, as the folder holds it: a link is neither a
// regular file nor a folder, wherever it leads.
type Kind int

const (
	Other       Kind = iota // neither a regular file nor a folder
	RegularFile             // a regular file
	Folder                  // a folder
)

// Files reads the operating system's filesystem.
type Files struct{}

// New gives the operating system's filesystem.
func New() *Files { return &Files{} }

// Entries gives folder's entries, by name. Its error for a folder that
// does not exist is, or wraps, fs.ErrNotExist.
func (*Files) Entries(folder string) ([]Entry, error) {
	read, err := os.ReadDir(folder)
	if err != nil {
		return nil, err
	}
	entries := make([]Entry, 0, len(read))
	for _, entry := range read {
		kind := Other
		switch {
		case entry.Type().IsRegular():
			kind = RegularFile
		case entry.IsDir():
			kind = Folder
		}
		entries = append(entries, Entry{Name: entry.Name(), Kind: kind})
	}
	return entries, nil
}

// Bytes gives file's bytes.
func (*Files) Bytes(file string) ([]byte, error) { return os.ReadFile(file) }

// Resolved gives folder's path with each link in it replaced by where it
// leads.
func (*Files) Resolved(folder string) (string, error) { return filepath.EvalSymlinks(folder) }
