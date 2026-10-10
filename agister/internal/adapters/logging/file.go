package logging

import (
	"bytes"
	"compress/gzip"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"syscall"
)

// File is the log at Path, capped file by file: a write that would take it
// past Max first moves it aside, compressed, as <Path>.1.gz, the one before
// as .2.gz, and so on up to Keep; the oldest is dropped. So the log never
// holds more than Max bytes, and beside it are at most Keep old files,
// compressed, each from a log that held no more. The cap is each file's,
// not the directory's: no budget is kept across the log and its old files.
//
// A record longer than Max is cut to fit: what is stored in its place is a
// record of its time, level and message, marked "truncated" with the
// record's size in bytes, and as much of its beginning as fits, in "head".
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
//
// A rotation that fails or stops part way drops no old file, however often
// it is tried again: the next write finishes it from where it stopped, and
// no step of it is done twice.
type File struct {
	Path string
	// Max is the size in bytes the log is kept within. A line longer than
	// Max is cut to fit.
	Max int64
	// Keep is how many old files are kept.
	Keep int
	// Append writes line to the open log: (*os.File).Write. Tests give one
	// that stops part way.
	Append func(log *os.File, line []byte) (int, error)
	// Rename and Remove are what a rotation moves and removes files by:
	// os.Rename and os.Remove. Tests give ones that fail.
	Rename func(from, to string) error
	Remove func(path string) error
}

// given says which of what the log writes by it was not given.
func (f File) given() error {
	missing := ""
	switch {
	case f.Append == nil:
		missing = "Append"
	case f.Rename == nil:
		missing = "Rename"
	case f.Remove == nil:
		missing = "Remove"
	default:
		return nil
	}
	return fmt.Errorf("writing %s: the log was given no %s", f.Path, missing)
}

// Usable says whether the log can be written: it was given what it writes
// by, and it opens the log for appending, creating it, and closes it, so a
// log that cannot be, as one whose path is a directory, fails where the log
// is set up, not silently at its first write.
func (f File) Usable() error {
	if err := f.given(); err != nil {
		return err
	}
	file, err := os.OpenFile(f.Path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	return file.Close()
}

// Write appends line, one whole record, rotating first when it would not
// fit. A line longer than Max is stored cut to fit, and its writer is told
// the whole line was written.
func (f File) Write(line []byte) (int, error) {
	if err := f.given(); err != nil {
		return 0, err
	}
	whole := len(line)
	if int64(whole) > f.Max {
		cut, err := truncate(line, f.Max)
		if err != nil {
			return 0, fmt.Errorf("writing %s: %w", f.Path, err)
		}
		line = cut
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

	// A rotation an earlier write left part way is finished before the log
	// is looked at.
	if err := f.settle(); err != nil {
		return 0, fmt.Errorf("rotating %s: %w", f.Path, err)
	}
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
	if err := file.Close(); err != nil {
		return 0, err
	}
	return whole, nil
}

// truncated is what is stored in place of a record longer than the log's
// Max.
type truncated struct {
	Time  string `json:"time,omitempty"`
	Level string `json:"level,omitempty"`
	Msg   string `json:"msg,omitempty"`
	// Truncated is the size of the whole record in bytes.
	Truncated int `json:"truncated"`
	// Head is as much of the record's beginning as fits.
	Head string `json:"head"`
}

// truncate is line, a record longer than max, cut to a record of max bytes
// at most, newline included: its time, level and message, the mark and its
// beginning. A record whose time, level and message alone do not fit is
// refused.
func truncate(line []byte, max int64) ([]byte, error) {
	record := bytes.TrimSuffix(line, []byte("\n"))
	var cut truncated
	// A record that is not JSON, or not an object, keeps only its head.
	_ = json.Unmarshal(record, &cut)
	cut.Truncated = len(line)
	encode := func(head int) []byte {
		cut.Head = strings.ToValidUTF8(string(record[:head]), "")
		encoded, _ := json.Marshal(cut)
		return append(encoded, '\n')
	}
	if int64(len(encode(0))) > max {
		return nil, fmt.Errorf("a record of %d bytes does not fit within %d even cut", len(line), max)
	}
	// The longest beginning whose encoding fits: an escaped character
	// takes more than its byte.
	head := sort.Search(len(record)+1, func(n int) bool { return int64(len(encode(n))) > max }) - 1
	return encode(head), nil
}

// old is the path of the n-th old file, the newest being the first.
func (f File) old(n int) string { return fmt.Sprintf("%s.%d.gz", f.Path, n) }

// aside is where the log is from the moment it leaves its path until it is
// the newest old file.
func (f File) aside() string { return f.Path + ".rotating" }

// zipped is the log's compressed copy until it takes the newest old file's
// name.
func (f File) zipped() string { return f.old(1) + ".tmp" }

// rotate moves the log aside as the newest old file, each old file one
// place on, and drops the one past Keep. The caller holds the directory
// and has settled the rotation before.
func (f File) rotate() error {
	if f.Keep < 1 {
		return f.Remove(f.Path)
	}
	// The log is compressed where it is, before anything moves, so a
	// compression that fails, again and again, as on a full disk, drops no
	// old file and leaves the log as it was.
	if err := compress(f.Path, f.zipped()); err != nil {
		f.Remove(f.zipped())
		return err
	}
	// The log leaves its path in one step, and only once its compressed
	// copy is whole. From here the rotation is settled, now or by the next
	// write: a log moved aside says its copy, while there is one, is whole
	// and not yet an old file.
	if err := f.Rename(f.Path, f.aside()); err != nil {
		f.Remove(f.zipped())
		return err
	}
	return f.settle()
}

// settle finishes the rotation of a log moved aside, from where it
// stopped: its compressed copy, while there is one, becomes the newest old
// file, and then the log moved aside goes. Each step is done once however
// often settle runs, so a step that fails again and again, as the last
// removal, moves no old file a second time. The caller holds the directory.
func (f File) settle() error {
	if _, err := os.Lstat(f.aside()); err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return nil
		}
		return err
	}
	switch _, err := os.Lstat(f.zipped()); {
	case errors.Is(err, fs.ErrNotExist):
		// The copy is an old file already.
	case err != nil:
		return err
	default:
		if err := f.room(); err != nil {
			return err
		}
		if err := f.Rename(f.zipped(), f.old(1)); err != nil {
			return err
		}
	}
	return f.Remove(f.aside())
}

// room frees the newest old file's place: the old files before the first
// free place move one place on, and with no place free the one at Keep is
// dropped. Once the newest's place is free nothing moves, so making room
// again drops nothing more.
func (f File) room() error {
	free := 1
	for ; free < f.Keep; free++ {
		if _, err := os.Lstat(f.old(free)); errors.Is(err, fs.ErrNotExist) {
			break
		} else if err != nil {
			return err
		}
	}
	// A rename replaces what it lands on, so the oldest goes first.
	for n := free; n > 1; n-- {
		if err := f.Rename(f.old(n-1), f.old(n)); err != nil {
			return err
		}
	}
	return nil
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
