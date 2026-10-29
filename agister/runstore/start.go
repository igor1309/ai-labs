package runstore

import (
	"errors"
	"io"
	"io/fs"
	"os"
	"path/filepath"
)

func (s *Store) writer(id string) *LogWriter {
	s.appending.Lock()
	defer s.appending.Unlock()
	return s.writers[id]
}

// Begin claims a new log exclusively. The same writer owns all subsequent
// facts and the terminal result supplied by the record adapter.
func (s *Store) Begin(record Record) error {
	folder, err := s.run(record.ID)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(folder, 0755); err != nil {
		return err
	}
	if _, err := os.Stat(filepath.Join(folder, "record.json")); !errors.Is(err, fs.ErrNotExist) {
		return errors.New("runstore: legacy run already exists")
	}

	s.appending.Lock()
	defer s.appending.Unlock()
	if s.writers[record.ID] != nil {
		return errors.New("runstore: run already has a writer")
	}
	w, err := NewLogWriter(fileAppender(func(first bool) (logFile, error) {
		flags := os.O_WRONLY | os.O_APPEND
		if first {
			flags |= os.O_CREATE | os.O_EXCL
		}
		return os.OpenFile(filepath.Join(folder, "run.jsonl"), flags, 0600)
	}))
	if err != nil {
		return err
	}
	s.writers[record.ID] = w
	return w.Append(Event{At: record.Started, Kind: RunStarted, Record: &record})
}

// logFile is the opened destination of one append, kept below short-write,
// durability and cleanup policy so each can be driven independently.
type logFile interface {
	Write([]byte) (int, error)
	Sync() error
	Close() error
}

func fileAppender(open func(first bool) (logFile, error)) func([]byte, bool) error {
	first := true
	return func(data []byte, terminal bool) error {
		f, err := open(first)
		first = false
		if err != nil {
			return err
		}
		payload := data
		if terminal {
			// A failed sync leaves an unterminated tail, which readers skip.
			// The newline publishes the terminal only after its bytes are durable.
			payload = data[:len(data)-1]
		}
		n, err := f.Write(payload)
		if n != len(payload) {
			err = errors.Join(err, io.ErrShortWrite)
		}
		if err == nil && terminal {
			err = f.Sync()
			if err == nil {
				n, err = f.Write(data[len(data)-1:])
				if n != 1 {
					err = errors.Join(err, io.ErrShortWrite)
				}
			}
		}
		return errors.Join(err, f.Close())
	}
}
