package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"syscall"
)

// codexHome is the Codex home, as Codex finds it: $CODEX_HOME when it is
// set, else .codex in the user's home directory. It is "" when neither is
// known. main gives os.Getenv and os.UserHomeDir.
func codexHome(getenv func(name string) string, userHome func() (string, error)) string {
	if home := getenv("CODEX_HOME"); home != "" {
		return home
	}
	home, err := userHome()
	if err != nil || home == "" {
		return ""
	}
	return filepath.Join(home, ".codex")
}

// osFiles reads the files under one directory of the operating system, by
// their paths from it, with slashes. It is the only place the module reads
// a file, and it writes none. Every method fails under a ctx that is done,
// with ctx's cause, and with an error that is fs.ErrNotExist when what it
// is asked for does not exist. Its lock probe is flock, so it is Unix
// only.
type osFiles struct {
	// root is the directory: main gives the Codex home. With no root every
	// method fails.
	root string
	// readDir reads a directory's entries, sorted by name: main gives
	// os.ReadDir.
	readDir func(name string) ([]fs.DirEntry, error)
}

// codexFiles is these files, as the boundary run is given.
func (o osFiles) codexFiles() codexFiles {
	return codexFiles{list: o.List, locked: o.Locked, find: o.Find, size: o.Size, read: o.Read}
}

// path is where the path from the root is in the file system. It fails
// under a ctx that is done, with no root, and for a path that leaves the
// root.
func (o osFiles) path(ctx context.Context, path string) (string, error) {
	if ctx.Err() != nil {
		return "", context.Cause(ctx)
	}
	if o.root == "" {
		return "", errors.New("no Codex home: $CODEX_HOME is not set and the user's home directory is not known")
	}
	local := filepath.FromSlash(path)
	if !filepath.IsLocal(local) {
		return "", fmt.Errorf("the path %q is not one inside %s", path, o.root)
	}
	return filepath.Join(o.root, local), nil
}

// List returns the names of the entries of the directory dir, sorted. A
// ctx that ended while the directory was read fails it too.
func (o osFiles) List(ctx context.Context, dir string) ([]string, error) {
	full, err := o.path(ctx, dir)
	if err != nil {
		return nil, err
	}
	entries, err := o.readDir(full)
	if err != nil {
		return nil, err
	}
	if ctx.Err() != nil {
		return nil, context.Cause(ctx)
	}
	names := make([]string, 0, len(entries))
	for _, entry := range entries {
		names = append(names, entry.Name())
	}
	return names, nil
}

// Locked tells whether another open file, of this process or another,
// holds an exclusive flock on file: it tries to take a shared one without
// waiting, and the lock is held when that would block. A lock it took is
// released at once: while it has it, the file's owner cannot lock the
// file. What is no regular file fails the probe: see openRegular.
func (o osFiles) Locked(ctx context.Context, file string) (bool, error) {
	full, err := o.path(ctx, file)
	if err != nil {
		return false, err
	}
	opened, err := openRegular(full)
	if err != nil {
		return false, err
	}
	defer opened.Close()
	descriptor := int(opened.Fd())
	err = flock(descriptor, syscall.LOCK_SH|syscall.LOCK_NB)
	if errors.Is(err, syscall.EWOULDBLOCK) {
		return true, nil
	}
	if err != nil {
		return false, &fs.PathError{Op: "flock", Path: full, Err: err}
	}
	if err := flock(descriptor, syscall.LOCK_UN); err != nil {
		return false, &fs.PathError{Op: "flock", Path: full, Err: err}
	}
	return false, nil
}

// openRegular opens the regular file at full, to read. It opens without
// blocking and tells what it opened by the opened descriptor, so what is
// no regular file, as a FIFO nobody writes to is, fails at once instead of
// holding its caller, whatever the file was when it was last looked at.
// Its caller closes the file.
func openRegular(full string) (*os.File, error) {
	opened, err := os.OpenFile(full, os.O_RDONLY|syscall.O_NONBLOCK, 0)
	if err != nil {
		return nil, err
	}
	info, err := opened.Stat()
	if err == nil && !info.Mode().IsRegular() {
		err = notRegular(full)
	}
	if err != nil {
		opened.Close()
		return nil, err
	}
	return opened, nil
}

// notRegular is the error of the file at full, which is no regular file.
func notRegular(full string) error {
	return fmt.Errorf("%s is not a regular file", full)
}

// flock is syscall.Flock, made again when a signal interrupted it.
func flock(descriptor, how int) error {
	for {
		if err := syscall.Flock(descriptor, how); !errors.Is(err, syscall.EINTR) {
			return err
		}
	}
}

// Find returns the paths, from the root, of the files under dir, at any
// depth, whose names begin with prefix and end with suffix, each directory
// in the order of its names. A directory under dir that is gone before it
// is read has no files. Between two directories it stops with the cause of
// a ctx that is done.
func (o osFiles) Find(ctx context.Context, dir, prefix, suffix string) ([]string, error) {
	var found []string
	if err := o.find(ctx, dir, prefix, suffix, &found); err != nil {
		return nil, err
	}
	return found, nil
}

// find adds to found the files under dir that Find asks for.
func (o osFiles) find(ctx context.Context, dir, prefix, suffix string, found *[]string) error {
	full, err := o.path(ctx, dir)
	if err != nil {
		return err
	}
	entries, err := o.readDir(full)
	if err != nil {
		return err
	}
	for _, entry := range entries {
		name := entry.Name()
		if !entry.IsDir() {
			if strings.HasPrefix(name, prefix) && strings.HasSuffix(name, suffix) {
				*found = append(*found, dir+"/"+name)
			}
			continue
		}
		if err := o.find(ctx, dir+"/"+name, prefix, suffix, found); err != nil && !errors.Is(err, fs.ErrNotExist) {
			return err
		}
	}
	return nil
}

// Size returns the size of file, in bytes. What is no regular file has
// none, and fails: a FIFO's size of 0 would read as an empty file.
func (o osFiles) Size(ctx context.Context, file string) (int64, error) {
	full, err := o.path(ctx, file)
	if err != nil {
		return 0, err
	}
	info, err := os.Stat(full)
	if err != nil {
		return 0, err
	}
	if !info.Mode().IsRegular() {
		return 0, notRegular(full)
	}
	return info.Size(), nil
}

// Read returns the length bytes of file from offset on, and fewer when
// the file ends before. What is no regular file fails the read: see
// openRegular.
func (o osFiles) Read(ctx context.Context, file string, offset, length int64) ([]byte, error) {
	full, err := o.path(ctx, file)
	if err != nil {
		return nil, err
	}
	if offset < 0 || length < 0 {
		return nil, fmt.Errorf("read %s: no %d bytes at offset %d", full, length, offset)
	}
	opened, err := openRegular(full)
	if err != nil {
		return nil, err
	}
	defer opened.Close()
	data := make([]byte, length)
	n, err := opened.ReadAt(data, offset)
	if err != nil && !errors.Is(err, io.EOF) {
		return nil, err
	}
	return data[:n], nil
}
