// Package files is the operating system's filesystem, in its own types
// (ADR-001): a folder's entries, each with what it is, a file's bytes,
// whether a path exists, a folder's path with its links resolved, and a
// lock file held shared or alone.
package files

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sync"
	"syscall"
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

// Exists tells whether something is at path, a link by where it leads: a
// link that leads nowhere is nothing. An error is one that tells neither.
func (*Files) Exists(path string) (bool, error) {
	_, err := os.Stat(path)
	switch {
	case err == nil:
		return true, nil
	case errors.Is(err, fs.ErrNotExist):
		return false, nil
	}
	return false, err
}

// Resolved gives folder's path with each link in it replaced by where it
// leads.
func (*Files) Resolved(folder string) (string, error) { return filepath.EvalSymlinks(folder) }

// ErrLocked is what Lock's error wraps when the lock is held already, alone,
// or, asked alone, at all.
var ErrLocked = errors.New("the lock is held")

// Lock takes the lock of file, alone or shared, without waiting, and gives
// its release: flock on the file, made empty where it is not there, in a
// folder made where it is not there. Each Lock opens the file anew, so
// holders in one process share or exclude each other as holders in two
// processes do. A lock ends when it is released or when the process that
// holds it ends.
func (*Files) Lock(file string, alone bool) (release func() error, err error) {
	if err := os.MkdirAll(filepath.Dir(file), 0o700); err != nil {
		return nil, err
	}
	f, err := os.OpenFile(file, os.O_RDWR|os.O_CREATE, 0o600)
	if err != nil {
		return nil, err
	}
	how := syscall.LOCK_SH
	if alone {
		how = syscall.LOCK_EX
	}
	err = flock(f, how|syscall.LOCK_NB)
	switch {
	case errors.Is(err, syscall.EWOULDBLOCK):
		_ = f.Close()
		return nil, fmt.Errorf("%s: %w", file, ErrLocked)
	case err != nil:
		_ = f.Close()
		return nil, fmt.Errorf("locking %s: %w", file, err)
	}
	// The release unlocks before it closes: the lock is the open file
	// description's, which a program started meanwhile shares until its
	// exec closes it. Unlocking ends it for every copy.
	var once sync.Once
	var released error
	return func() error {
		once.Do(func() {
			unlocked := flock(f, syscall.LOCK_UN)
			if unlocked != nil {
				unlocked = fmt.Errorf("unlocking %s: %w", file, unlocked)
			}
			released = errors.Join(unlocked, f.Close())
		})
		return released
	}, nil
}

// flock applies how to f's lock, again while a signal interrupts it.
func flock(f *os.File, how int) error {
	for {
		err := syscall.Flock(int(f.Fd()), how)
		if !errors.Is(err, syscall.EINTR) {
			return err
		}
	}
}
