// Package runstore keeps runs, in its own types (ADR-001, "Runs"): under
// a folder it is given, each run a folder of its id, holding its record,
// record.json, written whole each time, and its events, events.jsonl, a
// line each. A run kept is exported as a copy of its folder.
package runstore

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// Schema is the schema of the record runstore keeps.
const Schema = "agister.record/v1alpha1"

// Record is a run's record: its schema, its id, what was asked, the
// workflow's inputs as resolved, when it started and ended, nil while it
// has not, its status, each of its calls ended so far, and its result, nil
// until it ends.
type Record struct {
	Schema  string     `json:"schema"`
	ID      string     `json:"id"`
	Request Request    `json:"request"`
	Inputs  []Input    `json:"inputs"`
	Started time.Time  `json:"started"`
	Ended   *time.Time `json:"ended"`
	Status  string     `json:"status"`
	Calls   []Call     `json:"calls"`
	Result  *Result    `json:"result"`
}

// Request is what a run was asked: a workflow, or a process on an agent;
// its params, by name; the directory it was asked in; the id of the run it
// continues, nil for none; and the id of the run whose calls it reuses,
// nil for none.
type Request struct {
	Definitions []Definition      `json:"definitions"`
	Workflow    string            `json:"workflow"`
	Process     string            `json:"process"`
	Agent       string            `json:"agent"`
	Params      map[string]string `json:"params"`
	Dir         string            `json:"dir"`
	Continue    *string           `json:"continue"`
	Reuse       *string           `json:"reuse"`
}

// Call is a call of a run, as it ended: its id, its step, process and
// agent, the one that answered; its worktree's root, HEAD when admitted and at its end, and its
// final content, empty where refused; its patch's path, nil for none; the id of the call
// whose session it continues, nil for none; the id of the call it reuses,
// nil for none; its permission plan and resolved process environment;
// the inputs it was given, as resolved; its result; and its primary,
// where it was made again on its agent's fallback, nil where it was not.
// EndHead is nil only for a record from before end_head was kept.
type Call struct {
	Definitions []Definition `json:"definitions"`
	Permissions Permissions  `json:"permissions"`
	Environment []Variable   `json:"environment"`
	ID          string       `json:"id"`
	Step        string       `json:"step"`
	Process     string       `json:"process"`
	Agent       string       `json:"agent"`
	Root        string       `json:"root"`
	Head        string       `json:"head"`
	EndHead     *string      `json:"end_head,omitempty"`
	Patch       *string      `json:"patch"`
	Content     string       `json:"content"`
	Continues   *string      `json:"continues"`
	Reuses      *string      `json:"reuses"`
	Inputs      []Input      `json:"inputs"`
	Result      CallResult   `json:"result"`
	Primary     *Primary     `json:"primary"`
}

// Primary is how a call ended on its step's agent before it was made
// again on the agent's fallback (ADR-004, rule 8): the agent, its
// permission plan, and its result, its turns at capacity spent.
type Primary struct {
	Agent       string      `json:"agent"`
	Permissions Permissions `json:"permissions"`
	Result      CallResult  `json:"result"`
}

// Permissions is the permission plan of a step, in resolve's meanings:
// options taken, permissions required, allowed, granted, granted beyond
// the allowed, and withheld. Each list is empty for none.
type Permissions struct {
	Options  []string `json:"options"`
	Required []string `json:"required"`
	Allowed  []string `json:"allowed"`
	Granted  []string `json:"granted"`
	Extra    []string `json:"extra"`
	Withheld []string `json:"withheld"`
}

// Variable is a process's environment variable as resolved for a call.
// A call keeps its variables in the order its process declares them.
type Variable struct {
	Name  string `json:"name"`
	Value string `json:"value"`
}

// Definition identifies a document read by the plan, with its files in
// composition order. Definitions are ordered by kind, then name.
type Definition struct {
	Kind  string `json:"kind"`
	Name  string `json:"name"`
	Files []File `json:"files"`
}

// File identifies a source's layer, path and SHA-256 digest as lowercase hex.
type File struct {
	Layer  string `json:"layer"`
	Path   string `json:"path"`
	Digest string `json:"digest"`
}

// Input is an input as it was resolved: its name, its value whole, and
// its identity. A value is kept as JSON keeps text: bytes that are not
// UTF-8 are replaced, the identity the original's.
type Input struct {
	Name     string `json:"name"`
	Value    string `json:"value"`
	Identity string `json:"identity"`
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

// CallResult is a call's result: its outcome, its session, nil for none,
// the last turn's reported session cost in US dollars, nil where unknown,
// and whose price its cost is, nil where its cost is unknown.
type CallResult struct {
	Outcome
	Session     *string  `json:"session"`
	SessionCost *float64 `json:"session_cost"`
	CostSource  *string  `json:"cost_source"`
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
	Started  Kind = "started"  // the step started, on its agent
	Reused   Kind = "reused"   // the step took an earlier call in place of making one
	Tool     Kind = "tool"     // the step called a tool
	Stale    Kind = "stale"    // the step's turn went stale
	Capacity Kind = "capacity" // the step's turn failed at capacity
	Fallback Kind = "fallback" // the step's call is made again on its agent's fallback
	Branch   Kind = "branch"   // a branch selected an arm
	Pass     Kind = "pass"     // a repeat bound its next state
	Stopped  Kind = "stopped"  // a repeat stopped
	Ended    Kind = "ended"    // the step ended
)

// Event is what a step did, at a time. Of the rest, each kind has its
// own: a step started its agent; a step reused the id of the call it
// took; a tool call the tool's name and its input; a stale turn what went
// stale and whether a recovery turn follows; a turn at capacity its reason
// and whether the turn is made again; a fallback the agent the call is
// made again on; a step ended its status, its class,
// "" for none, and how long it took. Branch, pass and stopped events keep
// the chosen arm and condition reads, next state, and stopping reason.
type Event struct {
	At         time.Time
	Step       string
	Kind       Kind
	Agent      string
	Call       string
	Name       string
	Input      string
	What       string
	Recovering bool
	Reason     string
	Retrying   bool
	Status     string
	Class      string
	Duration   time.Duration
	Arm        string
	Conditions []Condition
	Pass       int
	State      map[string]any
	Stopped    string
	Passes     int
}

// Condition is an evaluated branch arm and the values it read.
type Condition struct {
	Arm   string         `json:"arm"`
	Holds bool           `json:"holds"`
	Read  map[string]any `json:"read"`
}

// MarshalJSON writes e as events.jsonl holds it: the fields of its kind
// alone, a class that is none as null.
func (e Event) MarshalJSON() ([]byte, error) {
	switch e.Kind {
	case Branch:
		return json.Marshal(struct {
			At         time.Time   `json:"at"`
			Step       string      `json:"step"`
			Kind       Kind        `json:"kind"`
			Arm        string      `json:"arm"`
			Conditions []Condition `json:"conditions"`
		}{e.At, e.Step, e.Kind, e.Arm, e.Conditions})
	case Pass:
		return json.Marshal(struct {
			At    time.Time      `json:"at"`
			Step  string         `json:"step"`
			Kind  Kind           `json:"kind"`
			Pass  int            `json:"pass"`
			State map[string]any `json:"state"`
		}{e.At, e.Step, e.Kind, e.Pass, e.State})
	case Stopped:
		return json.Marshal(struct {
			At      time.Time `json:"at"`
			Step    string    `json:"step"`
			Kind    Kind      `json:"kind"`
			Stopped string    `json:"stopped"`
			Passes  int       `json:"passes"`
		}{e.At, e.Step, e.Kind, e.Stopped, e.Passes})
	case Started:
		return json.Marshal(struct {
			At    time.Time `json:"at"`
			Step  string    `json:"step"`
			Kind  Kind      `json:"kind"`
			Agent string    `json:"agent"`
		}{e.At, e.Step, e.Kind, e.Agent})
	case Reused:
		return json.Marshal(struct {
			At   time.Time `json:"at"`
			Step string    `json:"step"`
			Kind Kind      `json:"kind"`
			Call string    `json:"call"`
		}{e.At, e.Step, e.Kind, e.Call})
	case Tool:
		return json.Marshal(struct {
			At    time.Time `json:"at"`
			Step  string    `json:"step"`
			Kind  Kind      `json:"kind"`
			Name  string    `json:"name"`
			Input string    `json:"input"`
		}{e.At, e.Step, e.Kind, e.Name, e.Input})
	case Stale:
		return json.Marshal(struct {
			At         time.Time `json:"at"`
			Step       string    `json:"step"`
			Kind       Kind      `json:"kind"`
			What       string    `json:"what"`
			Recovering bool      `json:"recovering"`
		}{e.At, e.Step, e.Kind, e.What, e.Recovering})
	case Capacity:
		return json.Marshal(struct {
			At       time.Time `json:"at"`
			Step     string    `json:"step"`
			Kind     Kind      `json:"kind"`
			Reason   string    `json:"reason"`
			Retrying bool      `json:"retrying"`
		}{e.At, e.Step, e.Kind, e.Reason, e.Retrying})
	case Fallback:
		return json.Marshal(struct {
			At    time.Time `json:"at"`
			Step  string    `json:"step"`
			Kind  Kind      `json:"kind"`
			Agent string    `json:"agent"`
		}{e.At, e.Step, e.Kind, e.Agent})
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
// temporary file is left behind. Calls, params and inputs that are none
// are written as empty, as are a call's permission lists, its primary's
// too, and its environment.
func (s *Store) Write(record Record) error {
	folder, err := s.run(record.ID)
	if err != nil {
		return err
	}
	record.Calls = append([]Call{}, record.Calls...)
	for i, call := range record.Calls {
		if call.Inputs == nil {
			record.Calls[i].Inputs = []Input{}
		}
		if call.Environment == nil {
			record.Calls[i].Environment = []Variable{}
		}
		emptyPermissions(&record.Calls[i].Permissions)
		if primary := call.Primary; primary != nil {
			written := *primary
			emptyPermissions(&written.Permissions)
			record.Calls[i].Primary = &written
		}
	}
	if record.Inputs == nil {
		record.Inputs = []Input{}
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
	if err := writeWhole(filepath.Join(folder, "record.json"), data.Bytes()); err != nil {
		return fmt.Errorf("runstore: the record of %q: %w", record.ID, err)
	}
	return nil
}

// emptyPermissions makes each list of p that is none empty.
func emptyPermissions(p *Permissions) {
	for _, list := range []*[]string{&p.Options, &p.Required, &p.Allowed, &p.Granted, &p.Extra, &p.Withheld} {
		if *list == nil {
			*list = []string{}
		}
	}
}

// writeWhole replaces path atomically, leaving no temporary file behind.
func writeWhole(path string, data []byte) error {
	folder := filepath.Dir(path)
	if err := os.MkdirAll(folder, 0o755); err != nil {
		return err
	}
	temp, err := os.CreateTemp(folder, ".write-*")
	if err != nil {
		return err
	}
	defer os.Remove(temp.Name())
	_, err = temp.Write(data)
	err = errors.Join(err, temp.Close())
	if err != nil {
		return err
	}
	return os.Rename(temp.Name(), path)
}

// WritePatch writes the step's patch whole and gives its path under the
// runs folder, suitable for a call's record and for Patch.
func (s *Store) WritePatch(id, step string, patch []byte) (string, error) {
	folder, err := s.run(id)
	if err != nil {
		return "", err
	}
	parts := strings.Split(step, "/")
	for i, part := range parts {
		if part == "" || part == "." || part == ".." || strings.ContainsAny(part, `\`) {
			return "", fmt.Errorf("runstore: %q is no step's name", step)
		}
		if i > 0 {
			for _, digit := range part {
				if digit < '0' || digit > '9' {
					return "", fmt.Errorf("runstore: %q is no step's pass", step)
				}
			}
			if part[0] == '0' {
				return "", fmt.Errorf("runstore: %q is no step's pass", step)
			}
		}
	}
	path := filepath.Join("patches", step+".patch")
	if err := writeWhole(filepath.Join(folder, path), patch); err != nil {
		return "", fmt.Errorf("runstore: the patch of %q of %q: %w", step, id, err)
	}
	return filepath.ToSlash(filepath.Join(id, path)), nil
}

// WriteDefinition writes a definition's bytes whole under its digest in
// the run's definitions folder, replacing any bytes written there before.
func (s *Store) WriteDefinition(id, digest string, data []byte) error {
	folder, err := s.run(id)
	if err != nil {
		return err
	}
	if digest == "" || digest == "." || digest == ".." || strings.ContainsAny(digest, `/\`) {
		return fmt.Errorf("runstore: %q is no definition's digest", digest)
	}
	if err := writeWhole(filepath.Join(folder, "definitions", digest), data); err != nil {
		return fmt.Errorf("runstore: the definition %q of %q: %w", digest, id, err)
	}
	return nil
}

// Patch reads a patch by its path under the runs folder.
func (s *Store) Patch(path string) ([]byte, error) {
	if !filepath.IsLocal(path) {
		return nil, fmt.Errorf("runstore: %q is no patch's path", path)
	}
	data, err := os.ReadFile(filepath.Join(s.folder, path))
	if err != nil {
		return nil, fmt.Errorf("runstore: the patch %q: %w", path, err)
	}
	return data, nil
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

// Runs gives the ids of the runs kept, each a folder holding its record,
// in name order; none where the store's folder is not there yet.
func (s *Store) Runs() ([]string, error) {
	entries, err := os.ReadDir(s.folder)
	if errors.Is(err, fs.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("runstore: the runs kept: %w", err)
	}
	var ids []string
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		info, err := os.Stat(filepath.Join(s.folder, entry.Name(), "record.json"))
		if errors.Is(err, fs.ErrNotExist) {
			continue
		}
		if err != nil {
			return nil, fmt.Errorf("runstore: the runs kept: %w", err)
		}
		if info.Mode().IsRegular() {
			ids = append(ids, entry.Name())
		}
	}
	return ids, nil
}

// Export copies the run id names into a folder of its id under folder:
// its record.json, events.jsonl, patches and definitions where present, each folder made
// where missing and a copy already there written over. A run not kept is
// an error that is, or wraps, fs.ErrNotExist, and nothing is copied. Each
// file is read whole before anything is written: a record is as it was
// last written, an event line being appended may be cut.
func (s *Store) Export(id, folder string) error {
	from, err := s.run(id)
	if err != nil {
		return err
	}
	record, err := os.ReadFile(filepath.Join(from, "record.json"))
	if err != nil {
		return fmt.Errorf("runstore: the export of %q: %w", id, err)
	}
	events, err := os.ReadFile(filepath.Join(from, "events.jsonl"))
	hasEvents := err == nil
	if err != nil && !errors.Is(err, fs.ErrNotExist) {
		return fmt.Errorf("runstore: the export of %q: %w", id, err)
	}
	artifacts := map[string][]byte{}
	for _, directory := range []string{"patches", "definitions"} {
		err := fs.WalkDir(os.DirFS(from), directory, func(path string, entry fs.DirEntry, err error) error {
			if path == directory && errors.Is(err, fs.ErrNotExist) {
				return nil
			}
			if err != nil {
				return err
			}
			if entry.IsDir() {
				return nil
			}
			data, err := os.ReadFile(filepath.Join(from, path))
			if err != nil {
				return err
			}
			artifacts[path] = data
			return nil
		})
		if err != nil {
			return fmt.Errorf("runstore: the export of %q: %w", id, err)
		}
	}
	to := filepath.Join(folder, id)
	if err := os.MkdirAll(to, 0o755); err != nil {
		return fmt.Errorf("runstore: the export of %q: %w", id, err)
	}
	if err := os.WriteFile(filepath.Join(to, "record.json"), record, 0o600); err != nil {
		return fmt.Errorf("runstore: the export of %q: %w", id, err)
	}
	if hasEvents {
		if err := os.WriteFile(filepath.Join(to, "events.jsonl"), events, 0o600); err != nil {
			return fmt.Errorf("runstore: the export of %q: %w", id, err)
		}
	}
	for path, data := range artifacts {
		if err := writeWhole(filepath.Join(to, path), data); err != nil {
			return fmt.Errorf("runstore: the export of %q: %w", id, err)
		}
	}
	return nil
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
