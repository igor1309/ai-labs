package runstore

import (
	"encoding/json"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"time"
)

// Liveness supplies the clock and process probe explicitly. Probe returns the
// process start identity, whether it is alive, and failures to inspect it.
type Liveness struct {
	PID      int
	Probe    func(int) (string, bool, error)
	Now      func() time.Time
	Timer    func(time.Duration) (<-chan time.Time, func())
	Interval time.Duration
}

func NewLive(folder string, live Liveness) (*Store, error) {
	if live.PID <= 0 || live.Probe == nil || live.Now == nil || live.Timer == nil || live.Interval <= 0 {
		return nil, errors.New("runstore: missing liveness collaborator or interval")
	}
	s, err := New(folder)
	if err != nil {
		return nil, err
	}
	s.live = &live
	return s, nil
}

func (s *Store) startPulse(id string, w *LogWriter) (*Pulse, error) {
	l := s.live
	start, alive, err := l.Probe(l.PID)
	if err != nil {
		return nil, err
	}
	if !alive || start == "" {
		return nil, errors.New("runstore: cannot identify heartbeat owner")
	}
	path := filepath.Join(s.folder, id, id+".heartbeat")
	return NewPulse(l.PID, start, l.Now, l.Timer, l.Interval, w.PendingSince, func(h Heartbeat) error {
		data, err := json.Marshal(h)
		if err != nil {
			return err
		}
		return writeWhole(path, data)
	}, func() error {
		err := os.Remove(path)
		if errors.Is(err, fs.ErrNotExist) {
			return nil
		}
		return err
	})
}

func (s *Store) stopPulse(id string) error {
	s.appending.Lock()
	p := s.pulses[id]
	s.appending.Unlock()
	if p == nil {
		return nil
	}
	return p.Stop()
}
