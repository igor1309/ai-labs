// Package runstore keeps runs, in its own types (ADR-001, "Runs"): under
// a folder it is given, each run a folder of its id, holding its record,
// record.json, written whole each time, and its events, events.jsonl, a
// line each.
package runstore

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// Schema is the schema of the record runstore keeps.
const Schema = "agister.record/v1alpha1"

// Record is a run's record: its schema, its id, what was asked, when it
// started and ended, nil while it has not, its status, each of its calls
// ended so far, and its result, nil until it ends.
type Record struct {
	Schema  string     `json:"schema"`
	ID      string     `json:"id"`
	Request Request    `json:"request"`
	Started time.Time  `json:"started"`
	Ended   *time.Time `json:"ended"`
	Status  string     `json:"status"`
	Calls   []Call     `json:"calls"`
	Result  *Result    `json:"result"`
}

// Request is what a run was asked: a workflow, or a process on an agent;
// its params, by name; and the directory it was asked in.
type Request struct {
	Workflow string            `json:"workflow"`
	Process  string            `json:"process"`
	Agent    string            `json:"agent"`
	Params   map[string]string `json:"params"`
	Dir      string            `json:"dir"`
}

// Call is a call of a run, as it ended: its id, its step, process and
// agent; its worktree's root, the commit HEAD was when it was admitted and
// its content at its end, "" where it was refused; and its result.
type Call struct {
	ID      string     `json:"id"`
	Step    string     `json:"step"`
	Process string     `json:"process"`
	Agent   string     `json:"agent"`
	Root    string     `json:"root"`
	Head    string     `json:"head"`
	Content string     `json:"content"`
	Result  CallResult `json:"result"`
}

// Outcome is how a run or a call ended, in the shape Agister prints a
// run's result: a class, a cost, a count of usage and a reason that are
// none are nil.
type Outcome struct {
	Status   string         `json:"status"`
	Class    *string        `json:"class"`
	Output   map[string]any `json:"output"`
	Timing   Timing         `json:"timing"`
	Cost     *float64       `json:"cost"`
	Usage    Usage          `json:"usage"`
	Reason   *string        `json:"reason"`
	Warnings []string       `json:"warnings"`
}

// Result is a run's result, as it is printed: its outcome, each step's
// session by its name, and the run's id.
type Result struct {
	Outcome
	Sessions map[string]string `json:"sessions"`
	RunID    string            `json:"run_id"`
}

// CallResult is a call's result: its outcome and its session, nil for
// none.
type CallResult struct {
	Outcome
	Session *string `json:"session"`
}

// Usage is the tokens used, each nil where it is unknown.
type Usage struct {
	Input      *int64 `json:"input_tokens"`
	Output     *int64 `json:"output_tokens"`
	CacheRead  *int64 `json:"cache_read_tokens"`
	CacheWrite *int64 `json:"cache_write_tokens"`
	Reasoning  *int64 `json:"reasoning_tokens"`
}

// Timing is when a run or a call started and ended, and how long it took,
// in milliseconds.
type Timing struct {
	Started    time.Time `json:"started"`
	Ended      time.Time `json:"ended"`
	DurationMS int64     `json:"duration_ms"`
}

// Kind is what an event tells of a step.
type Kind string

const (
	Started Kind = "started" // the step started, on its agent
	Tool    Kind = "tool"    // the step called a tool
	Ended   Kind = "ended"   // the step ended
)

// Event is what a step did, at a time. Of the rest, each kind has its
// own: a step started its agent; a tool call the tool's name and its
// input; a step ended its status, its class, "" for none, and how long it
// took.
type Event struct {
	At       time.Time
	Step     string
	Kind     Kind
	Agent    string
	Name     string
	Input    string
	Status   string
	Class    string
	Duration time.Duration
}

// MarshalJSON writes e as events.jsonl holds it: the fields of its kind
// alone, a class that is none as null.
func (e Event) MarshalJSON() ([]byte, error) {
	switch e.Kind {
	case Started:
		return json.Marshal(struct {
			At    time.Time `json:"at"`
			Step  string    `json:"step"`
			Kind  Kind      `json:"kind"`
			Agent string    `json:"agent"`
		}{e.At, e.Step, e.Kind, e.Agent})
	case Tool:
		return json.Marshal(struct {
			At    time.Time `json:"at"`
			Step  string    `json:"step"`
			Kind  Kind      `json:"kind"`
			Name  string    `json:"name"`
			Input string    `json:"input"`
		}{e.At, e.Step, e.Kind, e.Name, e.Input})
	case Ended:
		var class *string
		if e.Class != "" {
			class = &e.Class
		}
		return json.Marshal(struct {
			At         time.Time `json:"at"`
			Step       string    `json:"step"`
			Kind       Kind      `json:"kind"`
			Status     string    `json:"status"`
			Class      *string   `json:"class"`
			DurationMS int64     `json:"duration_ms"`
		}{e.At, e.Step, e.Kind, e.Status, class, e.Duration.Milliseconds()})
	}
	return nil, fmt.Errorf("runstore: no kind of event %q", e.Kind)
}

// Store keeps runs under its folder.
type Store struct {
	folder string
	// appending is held for each append, so that events appended side by
	// side are one whole line each.
	appending sync.Mutex
}

// New gives a store that keeps runs under folder.
func New(folder string) (*Store, error) {
	if folder == "" {
		return nil, errors.New("runstore: no folder")
	}
	return &Store{folder: folder}, nil
}

// Write writes record as the record of the run its id names, in place of
// any written before: whole, to a temporary file in the run's folder,
// then renamed, so that a reader meets the one or the other, and no
// temporary file is left behind. Calls and params that are none are
// written as empty.
func (s *Store) Write(record Record) error {
	folder, err := s.run(record.ID)
	if err != nil {
		return err
	}
	if record.Calls == nil {
		record.Calls = []Call{}
	}
	if record.Request.Params == nil {
		record.Request.Params = map[string]string{}
	}
	var data bytes.Buffer
	encoder := json.NewEncoder(&data)
	encoder.SetEscapeHTML(false)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(record); err != nil {
		return fmt.Errorf("runstore: the record of %q: %w", record.ID, err)
	}
	if err := os.MkdirAll(folder, 0o755); err != nil {
		return fmt.Errorf("runstore: the record of %q: %w", record.ID, err)
	}
	temp, err := os.CreateTemp(folder, ".record-*.json")
	if err != nil {
		return fmt.Errorf("runstore: the record of %q: %w", record.ID, err)
	}
	_, err = temp.Write(data.Bytes())
	err = errors.Join(err, temp.Close())
	if err == nil {
		err = os.Rename(temp.Name(), filepath.Join(folder, "record.json"))
	}
	if err != nil {
		_ = os.Remove(temp.Name())
		return fmt.Errorf("runstore: the record of %q: %w", record.ID, err)
	}
	return nil
}

// Record gives the record of the run id names. Its error for a run not
// kept is, or wraps, fs.ErrNotExist.
func (s *Store) Record(id string) (Record, error) {
	folder, err := s.run(id)
	if err != nil {
		return Record{}, err
	}
	data, err := os.ReadFile(filepath.Join(folder, "record.json"))
	if err != nil {
		return Record{}, fmt.Errorf("runstore: the record of %q: %w", id, err)
	}
	var record Record
	if err := json.Unmarshal(data, &record); err != nil {
		return Record{}, fmt.Errorf("runstore: the record of %q: %w", id, err)
	}
	return record, nil
}

// Append appends event to the events of the run id names, as a line of
// its own, one append at a time.
func (s *Store) Append(id string, event Event) error {
	folder, err := s.run(id)
	if err != nil {
		return err
	}
	line, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("runstore: an event of %q: %w", id, err)
	}
	line = append(line, '\n')
	s.appending.Lock()
	defer s.appending.Unlock()
	if err := os.MkdirAll(folder, 0o755); err != nil {
		return fmt.Errorf("runstore: an event of %q: %w", id, err)
	}
	events, err := os.OpenFile(filepath.Join(folder, "events.jsonl"), os.O_WRONLY|os.O_CREATE|os.O_APPEND, 0o600)
	if err != nil {
		return fmt.Errorf("runstore: an event of %q: %w", id, err)
	}
	_, err = events.Write(line)
	if err = errors.Join(err, events.Close()); err != nil {
		return fmt.Errorf("runstore: an event of %q: %w", id, err)
	}
	return nil
}

// run is the folder of the run id names, or an error where id names no
// folder of its own under the store's.
func (s *Store) run(id string) (string, error) {
	if id == "" || id == "." || id == ".." || strings.ContainsAny(id, `/\`) {
		return "", fmt.Errorf("runstore: %q is no run's id", id)
	}
	return filepath.Join(s.folder, id), nil
}
