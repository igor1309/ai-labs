// Package codex is warder's Codex runtime adapter: it reads Codex's active
// sessions from the files of the Codex home, with no command, and
// normalizes them to agent IDs and states.
//
// A session is active while its process holds its thread's writer lock:
// each file thread-writer-locks/<thread-id>.lock that another process
// holds is one agent, whose ID is the thread ID. A lock file nobody holds
// is a stale file, and one that is gone before it is probed is a session
// that ended: neither is an agent. .coordination.lock and a name that
// does not end in .lock are no thread's lock.
//
// An agent's state is that of the last turn marker in its thread's
// rollout file, sessions/YYYY/MM/DD/rollout-<timestamp>-<thread-id>.jsonl:
// the last line {"timestamp","ordinal","type","payload"} whose type is
// event_msg and whose payload.type is task_started, which is working, or
// task_complete or turn_aborted, which are idle. The file is scanned from
// its end backwards, in chunks, up to a cap.
//
// A read that succeeds gives an agent the state unknown when its thread
// has no rollout file, the file found being gone before it is read
// included; when the file has no turn marker; and when the scan reached
// its cap before it found one. A marker found within the cap decides, at
// the cap's last byte too: it is found once the scan has read its line and
// the line break before it, or the file's beginning. A line that is not
// such a JSON object is not a marker, and an unterminated last line is one
// being written: both are passed over.
//
// A missing thread-writer-locks directory, an empty one and one with only
// stale lock files are each a successful read of no agents.
//
// The read fails as a whole, with no agents, on a lock file whose thread
// ID is empty or not valid UTF-8, or that is listed twice; on a thread
// with two rollout files; on any error of the files other than "does not
// exist", from listing, probing, finding or reading, a read that returns
// another number of bytes than asked for included; and when its context
// ends, whatever was read by then: a read whose context is done never
// succeeds, not even one whose last call of the files had answered.
package codex

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"path"
	"reflect"
	"slices"
	"strings"
	"unicode/utf8"
)

// State is what an agent was doing when it was read.
type State string

const (
	Working State = "working"
	Idle    State = "idle"
	// Unknown is the state of a session whose last turn marker was not
	// found.
	Unknown State = "unknown"
)

// Agent is one active Codex session. Its ID is its thread's ID, so a
// session that survives a monitor restart, or is resumed, keeps its
// identity.
type Agent struct {
	ID    string
	State State
}

// Files reads the files of the Codex home. A path is relative to the home,
// with slashes. Each method ends with an error when ctx is done, and fails
// with an error that is fs.ErrNotExist when what it is asked for does not
// exist.
type Files interface {
	// List returns the names of the entries of the directory dir.
	List(ctx context.Context, dir string) (names []string, err error)
	// Locked tells whether another process holds a lock on file, by an
	// attempt to share the lock that does not wait. A lock the attempt
	// acquired is released at once.
	Locked(ctx context.Context, file string) (locked bool, err error)
	// Find returns the paths of the files under dir, at any depth, whose
	// names begin with prefix and end with suffix.
	Find(ctx context.Context, dir, prefix, suffix string) (files []string, err error)
	// Size returns the size of file, in bytes.
	Size(ctx context.Context, file string) (size int64, err error)
	// Read returns the length bytes of file from offset on.
	Read(ctx context.Context, file string, offset, length int64) (data []byte, err error)
}

// Scan bounds the search of one rollout file for its last turn marker.
type Scan struct {
	// Chunk is how many bytes one read of the file asks for, at most.
	Chunk int64
	// Cap is how many bytes of the file are read, at most, from its end
	// backwards.
	Cap int64
}

// Where Codex keeps what the adapter reads, in its home (observed on
// codex-cli 0.162.0).
const (
	locksDir         = "thread-writer-locks"
	lockSuffix       = ".lock"
	coordinationLock = ".coordination.lock"
	sessionsDir      = "sessions"
	rolloutPrefix    = "rollout-"
	rolloutSuffix    = ".jsonl"
)

// Adapter reads Codex's sessions through the files it is given. It opens
// no file and starts nothing of its own, and keeps nothing between reads.
type Adapter struct {
	files Files
	scan  Scan
}

// New returns an adapter that reads through files and scans each rollout
// file within scan. A nil files, or a nil pointer, map, slice, func or
// chan carried as one, is missing, and a chunk or a cap that is not
// positive is no bound.
func New(files Files, scan Scan) (*Adapter, error) {
	if files == nil || isNil(reflect.ValueOf(files)) {
		return nil, errors.New("codex: no files")
	}
	if scan.Chunk <= 0 {
		return nil, fmt.Errorf("codex: scan chunk of %d bytes is not positive", scan.Chunk)
	}
	if scan.Cap <= 0 {
		return nil, fmt.Errorf("codex: scan cap of %d bytes is not positive", scan.Cap)
	}
	return &Adapter{files: files, scan: scan}, nil
}

func isNil(value reflect.Value) bool {
	switch value.Kind() {
	case reflect.Pointer, reflect.Map, reflect.Slice, reflect.Func, reflect.Chan, reflect.Interface, reflect.UnsafePointer:
		return value.IsNil()
	}
	return false
}

// ReadAgents reads the lock files once, under ctx, and returns one agent
// per thread whose lock another process holds, in the order listed: the
// complete set, empty and never nil when no session is active. Every call
// of the files is given ctx, and before each lock file and before it
// returns a set, the empty one included, the read stops with the cause of
// a ctx that is done. The package comment says which conditions read as
// unknown and which fail the read, as a whole and with no agents.
func (a *Adapter) ReadAgents(ctx context.Context) ([]Agent, error) {
	names, err := a.files.List(ctx, locksDir)
	if errors.Is(err, fs.ErrNotExist) {
		if err := ended(ctx); err != nil {
			return nil, err
		}
		// Codex has not run here, or not yet: no session.
		return []Agent{}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("codex: list %s: %w", locksDir, err)
	}
	// Never nil, so a read of no sessions is an empty set.
	agents := make([]Agent, 0, len(names))
	listed := map[string]bool{}
	for _, name := range names {
		if err := ended(ctx); err != nil {
			return nil, err
		}
		id, ok := strings.CutSuffix(name, lockSuffix)
		if !ok || name == coordinationLock {
			continue
		}
		if id == "" {
			return nil, fmt.Errorf("codex: lock file %q has an empty thread ID", name)
		}
		if !utf8.ValidString(id) {
			return nil, fmt.Errorf("codex: lock file %q has a thread ID that is not valid UTF-8", name)
		}
		if listed[id] {
			return nil, fmt.Errorf("codex: lock file %q is listed twice", name)
		}
		listed[id] = true

		lock := path.Join(locksDir, name)
		held, err := a.files.Locked(ctx, lock)
		if errors.Is(err, fs.ErrNotExist) {
			// Gone since the listing: its session ended.
			continue
		}
		if err != nil {
			return nil, fmt.Errorf("codex: probe %s: %w", lock, err)
		}
		if !held {
			continue
		}
		state, err := a.stateOf(ctx, id)
		if err != nil {
			return nil, err
		}
		agents = append(agents, Agent{ID: id, State: state})
	}
	// The last call of the files may have answered as ctx ended.
	if err := ended(ctx); err != nil {
		return nil, err
	}
	return agents, nil
}

// ended is the error of a read whose ctx is done, with ctx's cause, and
// nil while it is not.
func ended(ctx context.Context) error {
	if ctx.Err() == nil {
		return nil
	}
	return fmt.Errorf("codex: read %s: %w", locksDir, context.Cause(ctx))
}

// stateOf is the state of the thread with the ID id, from its rollout
// file: unknown when it has none.
func (a *Adapter) stateOf(ctx context.Context, id string) (State, error) {
	rollouts, err := a.files.Find(ctx, sessionsDir, rolloutPrefix, "-"+id+rolloutSuffix)
	if errors.Is(err, fs.ErrNotExist) {
		return Unknown, nil
	}
	if err != nil {
		return "", fmt.Errorf("codex: find the rollout file of thread %q: %w", id, err)
	}
	switch len(rollouts) {
	case 0:
		return Unknown, nil
	case 1:
		return a.lastTurn(ctx, rollouts[0])
	}
	return "", fmt.Errorf("codex: thread %q has %d rollout files: %s", id, len(rollouts), strings.Join(rollouts, ", "))
}

// lastTurn is the state the last turn marker of the rollout file gives its
// thread: unknown when the file is gone, has none, or has none within the
// scan's cap. It reads the file from its end backwards, a chunk at a time,
// and decides each line once it has all of it: a marker can be megabytes
// from the end, and one line can span chunks.
func (a *Adapter) lastTurn(ctx context.Context, file string) (State, error) {
	size, err := a.files.Size(ctx, file)
	if errors.Is(err, fs.ErrNotExist) {
		return Unknown, nil
	}
	if err != nil {
		return "", fmt.Errorf("codex: size of %s: %w", file, err)
	}
	var (
		// start is where what was read so far begins, and scanned how many
		// bytes that is.
		start, scanned = size, int64(0)
		// ended is whether a line break was read: the bytes after the last
		// one are an unterminated line, which is being written.
		ended bool
		// tail is what was read of the line that begins before start, its
		// line break included, in pieces from its end backwards.
		tail [][]byte
	)
	for start > 0 && scanned < a.scan.Cap {
		length := min(a.scan.Chunk, start, a.scan.Cap-scanned)
		chunk, err := a.files.Read(ctx, file, start-length, length)
		if errors.Is(err, fs.ErrNotExist) {
			return Unknown, nil
		}
		if err != nil {
			return "", fmt.Errorf("codex: read %s: %w", file, err)
		}
		if int64(len(chunk)) != length {
			return "", fmt.Errorf("codex: read %s: got %d bytes at offset %d, not the %d asked for", file, len(chunk), start-length, length)
		}
		start -= length
		scanned += length

		if !ended {
			last := bytes.LastIndexByte(chunk, '\n')
			if last < 0 {
				continue
			}
			chunk, ended = chunk[:last+1], true
		}
		// The chunk's first line begins before it, unless the chunk is the
		// file's beginning.
		first := 0
		if start > 0 {
			end := bytes.IndexByte(chunk, '\n')
			if end < 0 {
				tail = append(tail, chunk)
				continue
			}
			first = end + 1
		}
		// The chunk's last line ends in the tail; the lines before it are
		// whole in the chunk.
		last := bytes.LastIndexByte(chunk, '\n') + 1
		if state, ok := turnState(joined(chunk[last:], tail)); ok {
			return state, nil
		}
		for end := last; end > first; {
			begin := bytes.LastIndexByte(chunk[:end-1], '\n') + 1
			if state, ok := turnState(chunk[begin:end]); ok {
				return state, nil
			}
			end = begin
		}
		tail = [][]byte{chunk[:first]}
	}
	return Unknown, nil
}

// joined is one line of its pieces: its beginning, then the pieces of its
// tail, which are kept from its end backwards.
func joined(beginning []byte, tail [][]byte) []byte {
	if len(tail) == 0 {
		return beginning
	}
	pieces := [][]byte{beginning}
	for _, piece := range slices.Backward(tail) {
		pieces = append(pieces, piece)
	}
	return slices.Concat(pieces...)
}

// turnState is the state a rollout line gives its thread, and whether the
// line is a turn marker: an event_msg whose payload's type is one of the
// three observed. Any other line is none: another event, another type of
// record, an empty line, and what is not such a JSON object.
func turnState(line []byte) (State, bool) {
	// Codex writes these names as they are, with no escape (observed), so
	// a line without them is not decoded: one line reaches megabytes, and
	// most events are no marker.
	if !bytes.Contains(line, []byte(`"event_msg"`)) {
		return "", false
	}
	if !bytes.Contains(line, []byte(`"task_started"`)) && !bytes.Contains(line, []byte(`"task_complete"`)) && !bytes.Contains(line, []byte(`"turn_aborted"`)) {
		return "", false
	}
	var record struct {
		Type    string `json:"type"`
		Payload struct {
			Type string `json:"type"`
		} `json:"payload"`
	}
	if err := json.Unmarshal(line, &record); err != nil || record.Type != "event_msg" {
		return "", false
	}
	switch record.Payload.Type {
	case "task_started":
		return Working, true
	case "task_complete", "turn_aborted":
		return Idle, true
	}
	return "", false
}
