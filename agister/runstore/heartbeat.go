package runstore

import (
	"errors"
	"sync"
	"time"
)

// Heartbeat is disposable evidence about the process and the independent writer.
// ProcessStart identifies an instance of a pid, rather than the reusable number.
type Heartbeat struct {
	PID          int        `json:"pid"`
	ProcessStart string     `json:"process_start"`
	Beat         time.Time  `json:"last_beat"`
	PendingSince *time.Time `json:"pending_since"`
	PendingAgeMS int64      `json:"pending_age_ms"`
}

// Pulse owns the heartbeat until Stop has joined the ticker and removed it.
type Pulse struct {
	stop   chan struct{}
	done   chan struct{}
	once   sync.Once
	mu     sync.Mutex
	err    error
	remove func() error
}

// NewPulse writes immediately, then independently of the log writer. Write must
// replace the heartbeat atomically so readers never observe a partial update.
func NewPulse(pid int, start string, now func() time.Time, timer func(time.Duration) (<-chan time.Time, func()), interval time.Duration, pending func() *time.Time, write func(Heartbeat) error, remove func() error) (*Pulse, error) {
	if pid <= 0 || start == "" || now == nil || timer == nil || interval <= 0 || pending == nil || write == nil || remove == nil {
		return nil, errors.New("runstore: missing heartbeat collaborator or identity")
	}
	p := &Pulse{stop: make(chan struct{}), done: make(chan struct{}), remove: remove}
	beat := func() error {
		oldest := pending()
		at := now()
		h := Heartbeat{PID: pid, ProcessStart: start, Beat: at, PendingSince: oldest}
		if oldest != nil {
			h.PendingAgeMS = at.Sub(*oldest).Milliseconds()
		}
		return write(h)
	}
	if err := beat(); err != nil {
		return nil, errors.Join(err, remove())
	}
	go func() {
		defer close(p.done)
		for {
			fired, stop := timer(interval)
			select {
			case <-p.stop:
				stop()
				return
			case <-fired:
				stop()
			}
			if err := beat(); err != nil {
				p.mu.Lock()
				p.err = err
				p.mu.Unlock()
				return
			}
		}
	}()
	return p, nil
}

// Stop is idempotent and returns only after no beat can recreate the file.
func (p *Pulse) Stop() error {
	p.once.Do(func() {
		close(p.stop)
		<-p.done
		p.mu.Lock()
		p.err = errors.Join(p.err, p.remove())
		p.mu.Unlock()
	})
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.err
}
