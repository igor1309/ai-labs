package runstore

import (
	"bufio"
	"bytes"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"slices"
	"sync"
	"time"
)

const LogSchema = "agister.run/v1"

// ErrNotStarted means the log has no committed start yet.
var ErrNotStarted = errors.New("runstore: log has no committed start")

// Waiting describes an Agister wait independently of process liveness.
type Waiting struct {
	On    string     `json:"on"`
	Since time.Time  `json:"since"`
	Until *time.Time `json:"until"`
}

type ActiveCall struct {
	Step    string    `json:"step"`
	Since   time.Time `json:"since"`
	Waiting *Waiting  `json:"waiting,omitempty"`
}

// Line is one committed fact and the state after that fact. Liveness is
// deliberately external to this durable state.
type Line struct {
	Schema string       `json:"schema"`
	Seq    uint64       `json:"seq"`
	Status string       `json:"status"`
	Active []ActiveCall `json:"active"`
	Event  Event        `json:"event"`
}

// LogWriter serializes producers synchronously. A failed append poisons
// the writer, because the last line may already have reached storage.
type LogWriter struct {
	mu         sync.Mutex
	appendLine func([]byte, bool) error
	line       Line
	failed     error
	terminal   bool
	pendingMu  sync.Mutex
	now        func() time.Time
	pending    map[*byte]time.Time
}

func NewLogWriter(appendLine func([]byte, bool) error) (*LogWriter, error) {
	if appendLine == nil {
		return nil, errors.New("runstore: no log appender")
	}
	return &LogWriter{appendLine: appendLine, line: Line{Schema: LogSchema, Active: []ActiveCall{}}}, nil
}

// NewTimedLogWriter also tracks writes waiting for serialization or storage.
func NewTimedLogWriter(appendLine func([]byte, bool) error, now func() time.Time) (*LogWriter, error) {
	if now == nil {
		return nil, errors.New("runstore: no writer clock")
	}
	w, err := NewLogWriter(appendLine)
	if err != nil {
		return nil, err
	}
	w.now, w.pending = now, make(map[*byte]time.Time)
	return w, nil
}

// PendingSince is independent of the append lock, including during blocked I/O.
func (w *LogWriter) PendingSince() *time.Time {
	w.pendingMu.Lock()
	defer w.pendingMu.Unlock()
	var oldest *time.Time
	for _, at := range w.pending {
		if oldest == nil || at.Before(*oldest) {
			v := at
			oldest = &v
		}
	}
	return oldest
}

func (w *LogWriter) Append(e Event) error {
	if w.now != nil {
		key := new(byte)
		w.pendingMu.Lock()
		w.pending[key] = w.now()
		w.pendingMu.Unlock()
		defer func() { w.pendingMu.Lock(); delete(w.pending, key); w.pendingMu.Unlock() }()
	}
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.failed != nil {
		return w.failed
	}
	if w.terminal {
		return errors.New("runstore: log already ended")
	}
	next := w.line
	next.Active = slices.Clone(next.Active)
	next.Seq++
	if err := advance(&next, e); err != nil {
		w.failed = err
		return err
	}
	if e.Kind == Tool {
		e.Input = fmt.Sprintf("sha256:%x", sha256.Sum256([]byte(e.Input)))[:31]
	}
	next.Event = e
	data, err := json.Marshal(next)
	if err == nil {
		err = w.appendLine(append(data, '\n'), e.Kind == RunEnded)
	}
	if err != nil {
		w.failed = fmt.Errorf("runstore: persist log: %w", err)
		return w.failed
	}
	w.line, w.terminal = next, e.Kind == RunEnded
	return nil
}

func advance(line *Line, e Event) error {
	if line.Seq == 1 && e.Kind != RunStarted {
		return errors.New("runstore: log must start with run_started")
	}
	if line.Seq > 1 && (e.Kind == RunStarted || line.Status != "running" && line.Status != "waiting") {
		return errors.New("runstore: event after terminal or duplicate start")
	}
	switch e.Kind {
	case RunStarted:
		if e.Record == nil || e.Record.ID == "" || e.Record.Schema != Schema || e.Record.Result != nil || e.Record.Ended != nil {
			return errors.New("runstore: invalid initial record")
		}
		line.Status = "running"
	case RunEnded:
		if e.Record == nil || e.Record.Result == nil || e.Record.Ended == nil {
			return errors.New("runstore: missing terminal result")
		}
		switch e.Record.Status {
		case "completed", "failed", "interrupted", "lost":
		default:
			return errors.New("runstore: invalid terminal status")
		}
		if e.Record.Result.Status != e.Record.Status {
			return errors.New("runstore: terminal outcome disagrees")
		}
		line.Status, line.Active = e.Record.Status, []ActiveCall{}
	case Started:
		for _, c := range line.Active {
			if c.Step == e.Step {
				return errors.New("runstore: duplicate active call")
			}
		}
		line.Active = append(line.Active, ActiveCall{Step: e.Step, Since: e.At})
	case Ended, Reused:
		line.Active = slices.DeleteFunc(line.Active, func(c ActiveCall) bool { return c.Step == e.Step })
	case Capacity, Stale, Fallback, Resumed:
		for i := range line.Active {
			if line.Active[i].Step == e.Step {
				line.Active[i].Waiting = nil
				if e.Waiting != nil {
					wait := *e.Waiting
					if wait.Until != nil {
						until := *wait.Until
						wait.Until = &until
					}
					line.Active[i].Waiting = &wait
				}
			}
		}
	}
	if e.Kind != RunEnded {
		line.Status = "running"
		if len(line.Active) > 0 {
			line.Status = "waiting"
			for _, c := range line.Active {
				if c.Waiting == nil {
					line.Status = "running"
				}
			}
		}
	}
	return nil
}

// Fold ignores only an unterminated tail. ReadBytes has no scanner token
// limit: resolved inputs and full terminal results may exceed 64 KiB.
func Fold(reader io.Reader) (Record, error) {
	record, _, err := FoldState(reader)
	return record, err
}

// FoldState returns the validated last committed header along with its record.
func FoldState(reader io.Reader) (Record, Line, error) {
	var record Record
	state := Line{Active: []ActiveCall{}}
	r := bufio.NewReader(reader)
	for {
		data, err := r.ReadBytes('\n')
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return Record{}, Line{}, err
		}
		var line Line
		if err := json.Unmarshal(data, &line); err != nil {
			return Record{}, Line{}, fmt.Errorf("runstore: corrupt log line: %w", err)
		}
		if line.Schema != LogSchema || line.Seq != state.Seq+1 {
			return Record{}, Line{}, errors.New("runstore: invalid log version or sequence")
		}
		state.Seq++
		if err := advance(&state, line.Event); err != nil {
			return Record{}, Line{}, err
		}
		want, _ := json.Marshal(state.Active)
		got, _ := json.Marshal(line.Active)
		if state.Status != line.Status || !bytes.Equal(want, got) {
			return Record{}, Line{}, errors.New("runstore: inconsistent log header")
		}
		e := line.Event
		switch e.Kind {
		case RunStarted, RunEnded:
			if e.Kind == RunEnded && e.Record.ID != record.ID {
				return Record{}, Line{}, errors.New("runstore: terminal run id disagrees")
			}
			record = *e.Record
		case ChildStarted:
			record.Children = append(record.Children, Child{ID: record.ID + "/" + e.Step, Parent: record.ID, Workflow: e.Workflow, Params: e.Params, Inputs: e.Inputs, Status: "running"})
		case ChildEnded:
			for i := range record.Children {
				c := &record.Children[i]
				if c.ID == record.ID+"/"+e.Step {
					c.Status, c.Output = e.Status, e.Output
					if e.Class != "" {
						class := e.Class
						c.Class = &class
					}
				}
			}
		case InputResolved:
			if e.InputFact == nil {
				return Record{}, Line{}, errors.New("runstore: missing resolved input")
			}
			i := slices.IndexFunc(record.Inputs, func(input Input) bool { return input.Name == e.InputFact.Name })
			if i < 0 {
				record.Inputs = append(record.Inputs, *e.InputFact)
			} else {
				record.Inputs[i] = *e.InputFact
			}
		case CallEnded:
			if e.CallFact == nil {
				return Record{}, Line{}, errors.New("runstore: missing ended call")
			}
			upsertCall(&record, *e.CallFact)
		case Prepared:
			if e.CallFact == nil {
				return Record{}, Line{}, errors.New("runstore: missing prepared call")
			}
			prepared := *e.CallFact
			for _, previous := range record.Calls {
				if previous.ID == prepared.ID {
					// Fallback starts a fresh session on a new agent, while
					// the call retains its earlier spend and starting day.
					prepared.Result.Cost = previous.Result.Cost
					prepared.Result.Timing.Started = previous.Result.Timing.Started
				}
			}
			upsertCall(&record, prepared)
		case Progress:
			for i := range record.Calls {
				c := &record.Calls[i]
				if c.Step != e.Step {
					continue
				}
				if e.Session != "" {
					session := e.Session
					c.Result.Session = &session
				}
				if e.Cost != nil {
					total := *e.Cost
					if c.Result.Cost != nil {
						total += *c.Result.Cost
					}
					c.Result.Cost = &total
				}
			}
		}
		record.Status = line.Status
	}
	if state.Seq == 0 {
		return Record{}, Line{}, ErrNotStarted
	}
	return record, state, nil
}

func upsertCall(record *Record, call Call) {
	for i := range record.Calls {
		if record.Calls[i].ID == call.ID {
			record.Calls[i] = call
			return
		}
	}
	record.Calls = append(record.Calls, call)
}
