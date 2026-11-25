package folderindex

import (
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
)

type tempFile interface {
	io.Writer
	Close() error
	Name() string
}

// publisher replaces the index whole: it writes a temp file beside it and
// renames that over it, so a failed run leaves the old index as it was.
type publisher struct {
	mkdirAll   func(path string, perm fs.FileMode) error
	createTemp func(dir, pattern string) (tempFile, error)
	rename     func(from, to string) error
	remove     func(path string) error
}

var diskPublisher = publisher{
	mkdirAll: os.MkdirAll,
	createTemp: func(dir, pattern string) (tempFile, error) {
		file, err := os.CreateTemp(dir, pattern)
		if err != nil {
			return nil, err
		}
		return file, nil
	},
	rename: os.Rename,
	remove: os.Remove,
}

func (p publisher) publish(path, data string) error {
	fail := func(err error) error { return fmt.Errorf("write index %q: %w", path, err) }
	dir := filepath.Dir(path)
	if err := p.mkdirAll(dir, 0o755); err != nil {
		return fail(err)
	}
	temp, err := p.createTemp(dir, ".audelin-folder-index-*")
	if err != nil {
		return fail(err)
	}
	_, writeErr := temp.Write([]byte(data))
	if err := temp.Close(); err != nil && writeErr == nil {
		writeErr = err
	}
	if writeErr == nil {
		writeErr = p.rename(temp.Name(), path)
	}
	if writeErr != nil {
		p.remove(temp.Name())
		return fail(writeErr)
	}
	return nil
}
