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

// File is the log at Path, capped file by file: a write that would take it
// past Max first moves it aside, compressed, as <Path>.1.gz, the one before
// as .2.gz, and so on up to Keep; the oldest is dropped. So the log never
// holds more than Max bytes, and beside it are at most Keep old files,
// compressed, each from a log that held no more. The cap is each file's,
// not the directory's: no budget is kept across the log and its old files.
// A record longer than Max is refused, not cut.
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
// The log is diagnostics, not evidence: a rotation that stops part way is
// not resumed, and may cost an old file.
type File struct {
	Path string
	// Max is the size in bytes the log is kept within.
	Max int64
	// Keep is how many old files are kept, one at least.
	Keep int
	// Append writes line to the open log, while the directory is held:
	// (*os.File).Write. Tests give one that looks at the hold.
	Append func(log *os.File, line []byte) (int, error)
	// Rename moves a file of a rotation to its place, while the directory
	// is held: os.Rename. Tests give one that looks at the hold.
	Rename func(from, to string) error
}

// Usable says whether the log can be written: it was given what it appends
// and rotates by, and it opens the log for appending, creating it, and
// closes it, so a log that cannot be, as one whose path is a directory,
// fails where the log is set up, not silently at its first write.
func (f File) Usable() error {
	if f.Append == nil {
		return fmt.Errorf("writing %s: the log was given no Append", f.Path)
	}
	if f.Rename == nil {
		return fmt.Errorf("writing %s: the log was given no Rename", f.Path)
	}
	file, err := os.OpenFile(f.Path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	return file.Close()
}

// Write appends line, one whole record, rotating first when it would not
// fit.
func (f File) Write(line []byte) (int, error) {
	if int64(len(line)) > f.Max {
		return 0, fmt.Errorf("writing %s: a record of %d bytes is longer than the log's %d", f.Path, len(line), f.Max)
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
	case info.Size()+int64(len(line)) > f.Max:
		if err := f.rotate(); err != nil {
			return 0, fmt.Errorf("rotating %s: %w", f.Path, err)
		}
	}
	file, err := os.OpenFile(f.Path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o600)
	if err != nil {
		return 0, err
	}
	n, err := f.Append(file, line)
	return n, errors.Join(err, file.Close())
}

// old is the path of the n-th old file, the newest being the first.
func (f File) old(n int) string { return fmt.Sprintf("%s.%d.gz", f.Path, n) }

// rotate moves the log aside as the newest old file, each old file one
// place on, and drops the one past Keep. The caller holds the directory.
func (f File) rotate() error {
	// The log is compressed where it is, before anything moves, so a
	// compression that fails, as on a full disk, drops no old file and
	// leaves the log as it was.
	zipped := f.old(1) + ".tmp"
	defer os.Remove(zipped) // left only by a rotation that stops before it is the newest old file
	if err := compress(f.Path, zipped); err != nil {
		return err
	}
	// A rename replaces what it lands on, so the oldest goes first.
	for n := f.Keep; n > 1; n-- {
		if err := f.Rename(f.old(n-1), f.old(n)); err != nil && !errors.Is(err, fs.ErrNotExist) {
			return err
		}
	}
	if err := f.Rename(zipped, f.old(1)); err != nil {
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
