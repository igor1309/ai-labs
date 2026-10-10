package logging

import (
	"compress/gzip"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"syscall"
)

// File is the log at Path, capped by size: a write that would take it past
// Max first moves it aside, compressed, as <Path>.1.gz, the one before as
// .2.gz, and so on up to Keep; the oldest is dropped. So the log and its
// old files never hold more than Max bytes and Keep compressed files.
//
// Any number of processes append to one log. Each write holds the log's
// directory alone (flock) while it looks at the size, rotates and appends,
// and opens the log anew by its path, so no writer appends to a file
// another has moved aside and no line is lost or torn across a rotation.
// The hold is the log's own, not home's write lock: that one is held
// while an install waits for its answer, and a warning must not wait for
// it. The directory is locked, not a file in it, so the log leaves nothing
// in it but itself.
//
// A write that fails or stops part way, as on a full disk, is cut back
// off the log, so no partial line is left for the next one to run into.
type File struct {
	Path string
	// Max is the size in bytes the log is kept within. A line longer than
	// Max is written alone, to a log of its own.
	Max int64
	// Keep is how many old files are kept.
	Keep int
	// Append writes line to the open log: (*os.File).Write. Tests give one
	// that stops part way.
	Append func(log *os.File, line []byte) (int, error)
}

// Write appends line, one whole record, rotating first when it would not
// fit.
func (f File) Write(line []byte) (int, error) {
	if f.Append == nil {
		return 0, fmt.Errorf("writing %s: the log was given no Append", f.Path)
	}
	dir, err := os.Open(filepath.Dir(f.Path))
	if err != nil {
		return 0, err
	}
	defer dir.Close()
	if err := flock(dir, syscall.LOCK_EX); err != nil {
		return 0, fmt.Errorf("locking %s: %w", dir.Name(), err)
	}
	// Unlocked before it is closed: the lock is the open file
	// description's, and a process forked meanwhile holds a copy of the
	// descriptor until its exec closes it.
	defer flock(dir, syscall.LOCK_UN)

	info, err := os.Stat(f.Path)
	switch {
	case errors.Is(err, fs.ErrNotExist):
	case err != nil:
		return 0, err
	case info.Size() > 0 && info.Size()+int64(len(line)) > f.Max:
		if err := f.rotate(); err != nil {
			return 0, fmt.Errorf("rotating %s: %w", f.Path, err)
		}
	}
	file, err := os.OpenFile(f.Path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o600)
	if err != nil {
		return 0, err
	}
	defer file.Close()
	// The size before the write, which no other writer changes while the
	// directory is held.
	before, err := file.Stat()
	if err != nil {
		return 0, err
	}
	n, err := f.Append(file, line)
	if err == nil && n < len(line) {
		err = io.ErrShortWrite
	}
	if err != nil {
		return 0, errors.Join(err, file.Truncate(before.Size()))
	}
	return n, file.Close()
}

// old is the path of the n-th old file, the newest being the first.
func (f File) old(n int) string { return fmt.Sprintf("%s.%d.gz", f.Path, n) }

// rotate moves the log aside as the newest old file, each old file one
// place on, and drops the one past Keep. The caller holds the directory.
func (f File) rotate() error {
	if f.Keep < 1 {
		return os.Remove(f.Path)
	}
	// A rename replaces what it lands on, so the oldest goes first.
	for n := f.Keep; n > 1; n-- {
		if err := os.Rename(f.old(n-1), f.old(n)); err != nil && !errors.Is(err, fs.ErrNotExist) {
			return err
		}
	}
	// The compressed file takes its name only once it is whole, and the
	// log goes only after that: a rotation cut short loses no line.
	partial := f.old(1) + ".tmp"
	if err := compress(f.Path, partial); err != nil {
		os.Remove(partial)
		return err
	}
	if err := os.Rename(partial, f.old(1)); err != nil {
		return err
	}
	return os.Remove(f.Path)
}

// compress writes from, gzipped, to the new file to.
func compress(from, to string) error {
	source, err := os.Open(from)
	if err != nil {
		return err
	}
	defer source.Close()
	target, err := os.OpenFile(to, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	zipped := gzip.NewWriter(target)
	_, err = io.Copy(zipped, source)
	return errors.Join(err, zipped.Close(), target.Close())
}

// flock applies the operation how to file's lock, again while a signal
// interrupts it.
func flock(file *os.File, how int) error {
	for {
		err := syscall.Flock(int(file.Fd()), how)
		if !errors.Is(err, syscall.EINTR) {
			return err
		}
	}
}
