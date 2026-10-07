// Package fsexport keeps the copies an export makes of runs in a folder
// the caller names (ADR-026 rule 7): the copy of a run is <dir>/<run-id>/,
// laid out as the run store lays out the run.
//
// A copy is written into a folder of its own beside it,
// <dir>/<run-id>.partial-<random>, its files synced, and renamed to
// <dir>/<run-id> only once every file is written and checked. An export
// interrupted before that leaves only the partial folder, which no export
// takes for a copy: a run ID has no dot.
//
// No folder in the run store takes copies: one there would write into the
// runs it copies, or beside them.
package fsexport

import (
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"sort"

	"github.com/igor1309/ai-labs/agister/internal/app"
)

// Folders keeps copies in the folders the caller names, out of the run
// store at Runs, the directory the copies are made from.
type Folders struct {
	Runs string
}

var _ app.ExportFolders = Folders{}

// Folder says why dir cannot take copies: it does not exist, is not a
// directory, or is in the run store, under any name the filesystem gives
// it: the store's directory or a run's, or a directory in either.
func (f Folders) Folder(dir string) error {
	if f.Runs == "" {
		return errors.New("the run store's directory is not configured")
	}
	info, err := os.Stat(dir)
	switch {
	case errors.Is(err, fs.ErrNotExist):
		return errors.New("does not exist")
	case err != nil:
		return err
	case !info.IsDir():
		return errors.New("is not a directory")
	}
	inStore, err := f.inStore(dir)
	if err != nil {
		return err
	}
	if inStore {
		return fmt.Errorf("is in the run store %s: the copies go out of it", f.Runs)
	}
	return nil
}

// inStore says whether the directory dir is the run store's directory or
// one in it. Each directory from dir, its links resolved, up to the root
// is compared with the store's as a file, so a link, a mount or a name
// differing only in case does not hide the store.
func (f Folders) inStore(dir string) (bool, error) {
	store, err := os.Stat(f.Runs)
	if errors.Is(err, fs.ErrNotExist) {
		return false, nil // no store, no run in it
	}
	if err != nil {
		return false, err
	}
	path, err := filepath.EvalSymlinks(dir)
	if err != nil {
		return false, err
	}
	if path, err = filepath.Abs(path); err != nil {
		return false, err
	}
	for {
		info, err := os.Stat(path)
		if err != nil {
			return false, err
		}
		if os.SameFile(info, store) {
			return true, nil
		}
		parent := filepath.Dir(path)
		if parent == path {
			return false, nil
		}
		path = parent
	}
}

// Copy lists the files of the copy of run id in dir by slash-separated path
// relative to it, sorted; ok is false when there is none. A copy that is
// not a directory, or holds anything that is neither a file nor a
// directory, is an error.
func (Folders) Copy(dir, id string) ([]string, bool, error) {
	root := filepath.Join(dir, id)
	info, err := os.Lstat(root)
	switch {
	case errors.Is(err, fs.ErrNotExist):
		return nil, false, nil
	case err != nil:
		return nil, false, err
	case !info.IsDir():
		return nil, false, fmt.Errorf("%s is not a directory", root)
	}
	var files []string
	err = filepath.WalkDir(root, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() {
			return nil
		}
		relative, err := filepath.Rel(root, path)
		if err != nil {
			return err
		}
		if !entry.Type().IsRegular() {
			return fmt.Errorf("%s is not a regular file", path)
		}
		files = append(files, filepath.ToSlash(relative))
		return nil
	})
	if err != nil {
		return nil, false, err
	}
	sort.Strings(files)
	return files, true, nil
}

// OpenCopy opens the file at the slash-separated path in the copy of run
// id in dir.
func (Folders) OpenCopy(dir, id, path string) (io.ReadCloser, error) {
	return open(filepath.Join(dir, id), path)
}

// Stage starts a new copy of run id in a folder of its own in dir.
func (Folders) Stage(dir, id string) (app.ExportStage, error) {
	if id == "" || id != filepath.Base(id) || filepath.Ext(id) != "" {
		return nil, fmt.Errorf("%q is not a run ID", id)
	}
	staged, err := os.MkdirTemp(dir, id+".partial-")
	if err != nil {
		return nil, err
	}
	return &stage{dir: staged, target: filepath.Join(dir, id)}, nil
}

// stage is a copy being written in dir, to be renamed to target.
type stage struct {
	dir, target string
	committed   bool
}

func (s *stage) Create(path string) (io.WriteCloser, error) {
	local, err := localPath(path)
	if err != nil {
		return nil, err
	}
	file := filepath.Join(s.dir, local)
	if err := os.MkdirAll(filepath.Dir(file), 0o700); err != nil {
		return nil, err
	}
	created, err := os.OpenFile(file, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		return nil, err
	}
	return synced{created}, nil
}

func (s *stage) Open(path string) (io.ReadCloser, error) { return open(s.dir, path) }

// Commit renames the copy into place. It refuses when anything is at the
// target by then: a copy is never replaced.
func (s *stage) Commit() error {
	if _, err := os.Lstat(s.target); !errors.Is(err, fs.ErrNotExist) {
		if err == nil {
			return fmt.Errorf("%s exists", s.target)
		}
		return err
	}
	if err := os.Rename(s.dir, s.target); err != nil {
		return err
	}
	s.committed = true
	return nil
}

func (s *stage) Discard() error {
	if s.committed {
		return nil
	}
	return os.RemoveAll(s.dir)
}

// synced is a file of a copy, synced to the disk as it is closed: a copy
// renamed into place holds its files' bytes.
type synced struct{ *os.File }

func (f synced) Close() error {
	err := f.Sync()
	if closeErr := f.File.Close(); err == nil {
		err = closeErr
	}
	return err
}

// open opens the file at the slash-separated path inside root.
func open(root, path string) (io.ReadCloser, error) {
	local, err := localPath(path)
	if err != nil {
		return nil, err
	}
	return os.Open(filepath.Join(root, local))
}

// localPath is the slash-separated path as a path inside a copy; a path out
// of it is an error.
func localPath(path string) (string, error) {
	local := filepath.FromSlash(path)
	if !filepath.IsLocal(local) {
		return "", fmt.Errorf("invalid file path %q", path)
	}
	return local, nil
}
