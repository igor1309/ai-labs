// Package fsruns stores run evidence under <dir>/<run-id>/:
//
//	record.json     the run record, replaced atomically
//	events.jsonl    ordered events, appended
//	provider.jsonl  raw runtime output, appended
//	owner.lock      held (flock) by the process running the call
//	artifacts/      files the call produced
//
// A record that is not finished and whose lock nobody holds is abandoned.
//
// In this process, the store also says when a run whose handle it holds
// appends an event, finishes or is abandoned (Appended), so the run is
// followed without polling. A run it holds can be abandoned as a killed
// owner leaves it (Abandon). Both go through the Appends the Store was
// given: Stores given the same one share its handles.
package fsruns

import (
	"bufio"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"syscall"

	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/contract"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

type Store struct {
	Dir string
	// Appends is where the handles this Store creates or adopts signal, and
	// what Appended and Abandon ask. Stores given the same value share its
	// handles, as they share the files: the composition root gives one to
	// every Store it builds. A Store without one signals nothing: a run it
	// holds is followed as one another process runs, and it has none to
	// abandon.
	Appends *Appends
}

var _ app.RunRecorder = Store{}
var _ app.RunsReader = Store{}
var _ app.RunsAppends = Store{}
var _ app.RunAdopter = Store{}
var _ app.CallRuns = Store{}
var _ app.ExportRuns = Store{}

func (s Store) runDir(id string) string { return filepath.Join(s.Dir, id) }

// RunDir is the directory run id's record and artifacts are kept in.
func (s Store) RunDir(id string) string { return s.runDir(id) }

// A run ID names one directory under Dir; anything else, such as a path
// out of it, is refused before it reaches the filesystem.
var idPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_-]*$`)

func checkID(id string) error {
	if !idPattern.MatchString(id) {
		return &contract.InputError{Message: fmt.Sprintf("%q is not a run ID", id)}
	}
	return nil
}

func (s Store) Create(_ context.Context, record run.Record) (app.RunHandle, error) {
	if err := checkID(record.ID); err != nil {
		return nil, err
	}
	dir := s.runDir(record.ID)
	if err := os.MkdirAll(s.Dir, 0o700); err != nil {
		return nil, err
	}
	if err := os.Mkdir(dir, 0o700); err != nil {
		return nil, err
	}
	lock, err := os.OpenFile(filepath.Join(dir, ownerLock), os.O_CREATE|os.O_RDWR, 0o600)
	if err != nil {
		return nil, err
	}
	if err := syscall.Flock(int(lock.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		lock.Close()
		return nil, err
	}
	h := &handle{dir: dir, lock: lock, appends: s.Appends}
	if err := h.writeRecord(record); err != nil {
		lock.Close()
		return nil, err
	}
	s.Appends.hold(dir, 0, h)
	return h, nil
}

// Abandoned lists the unfinished runs nobody owns that recorded effects,
// and the finished runs whose record still names a clean copy or an
// unreleased checkout.
func (s Store) Abandoned(ctx context.Context) ([]run.Record, error) {
	records, err := s.List(ctx)
	if err != nil {
		return nil, err
	}
	var abandoned []run.Record
	for _, record := range records {
		if record.Effects == nil {
			continue
		}
		if record.FinishedAt != nil {
			if reapable(record.Effects) {
				abandoned = append(abandoned, record)
			}
			continue
		}
		if _, state, err := s.Get(ctx, record.ID); err == nil && state == run.StateAbandoned {
			abandoned = append(abandoned, record)
		}
	}
	return abandoned, nil
}

// LiveCheckouts lists the checkout directories, workspaces and clean
// copies, of unfinished runs that some process still owns.
func (s Store) LiveCheckouts(ctx context.Context) ([]string, error) {
	records, err := s.List(ctx)
	if err != nil {
		return nil, err
	}
	var dirs []string
	for _, record := range records {
		effects := record.Effects
		if effects == nil || (effects.Checkout == nil && effects.Copy == nil) || record.FinishedAt != nil {
			continue
		}
		if _, state, err := s.Get(ctx, record.ID); err != nil || state == run.StateRunning {
			for _, checkout := range []*run.Checkout{effects.Checkout, effects.Copy} {
				if checkout != nil {
					dirs = append(dirs, checkout.Dir)
				}
			}
		}
	}
	return dirs, nil
}

// Adopt takes the owner lock of an unfinished run, or of a finished one
// whose record still names a clean copy or an unreleased checkout, so
// exactly one process ends what its dead owner left. A run whose lock
// another holds is app.ErrRunOwned; one finished with neither on record,
// app.ErrRunFinished, with its record. Under the lock, it cuts off an
// event the dead owner did not finish appending, so the adopter's events
// read.
func (s Store) Adopt(ctx context.Context, id string) (app.ReapHandle, run.Record, error) {
	var record run.Record
	if err := checkID(id); err != nil {
		return nil, record, err
	}
	lock, err := os.OpenFile(filepath.Join(s.runDir(id), ownerLock), os.O_RDWR, 0)
	if errors.Is(err, fs.ErrNotExist) {
		return nil, record, fmt.Errorf("run %s: %w", id, contract.ErrNotFound)
	}
	if err != nil {
		return nil, record, err
	}
	if err := syscall.Flock(int(lock.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		lock.Close()
		// Only a lock another holds says the run is owned.
		if errors.Is(err, syscall.EWOULDBLOCK) {
			return nil, record, fmt.Errorf("run %s: %w", id, app.ErrRunOwned)
		}
		return nil, record, fmt.Errorf("run %s: taking its owner lock: %w", id, err)
	}
	// Read under the lock: the owner may have finished before it was released.
	record, _, err = s.Get(ctx, id)
	if err == nil && record.FinishedAt != nil && !reapable(record.Effects) {
		err = fmt.Errorf("run %s: %w", id, app.ErrRunFinished)
	}
	if err != nil {
		lock.Close()
		return nil, record, err
	}
	// An owner killed while it appended an event left half a line: the
	// adopter's events would follow it on that line, and read as torn too.
	if err := cutTornTail(filepath.Join(s.runDir(id), "events.jsonl")); err != nil {
		lock.Close()
		return nil, record, fmt.Errorf("run %s: repairing its events: %w", id, err)
	}
	seq := 0
	if events, _, err := s.Events(ctx, id, 0); err == nil && len(events) > 0 {
		seq = events[len(events)-1].Seq
	}
	h := &handle{dir: s.runDir(id), lock: lock, seq: seq, appends: s.Appends}
	s.Appends.hold(h.dir, seq, h)
	return h, record, nil
}

// Abandon leaves run id, whose handle this process holds, as a killed owner
// leaves it: the owner lock is released over the record as last saved,
// unfinished, and the handle refuses every later write. Appended's channel
// closes, so whoever follows the run reads it as abandoned. A test abandons
// a run in place of killing the process that runs it. A run no handle in
// the Store's Appends holds is an error.
func (s Store) Abandon(id string) error {
	if err := checkID(id); err != nil {
		return err
	}
	if holder, ok := s.Appends.holder(s.runDir(id)); ok && holder.abandon() {
		return nil
	}
	return fmt.Errorf("run %s: no handle in this process holds it", id)
}

// cutTornTail cuts the events file at path after its last whole line: what
// follows is an event its writer did not finish appending. The whole lines,
// every complete event, stay. A run with no events file has none to cut.
// Only the run's owner may cut it: an owner still appending would lose its
// event.
func cutTornTail(path string) error {
	data, err := os.ReadFile(path)
	if errors.Is(err, fs.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	whole := bytes.LastIndexByte(data, '\n') + 1
	if whole == len(data) {
		return nil
	}
	return os.Truncate(path, int64(whole))
}

// reapable says a finished run's effects leave something to remove: a
// clean copy or an unreleased checkout. Its Checkout alone does not, as
// every finished record before Unreleased keeps it.
func reapable(effects *run.Effects) bool {
	return effects != nil && (effects.Copy != nil || effects.Unreleased != nil)
}

type handle struct {
	mu   sync.Mutex
	dir  string
	lock *os.File
	seq  int
	done bool
	// abandoned is set once the handle was abandoned: it writes nothing
	// after that.
	abandoned bool
	// appends is where the handle signals; nil, it signals nothing.
	appends *Appends
}

// errAbandoned is what an abandoned handle refuses a write with.
var errAbandoned = errors.New("the run was abandoned: its handle writes no more")

// abandon releases ownership without finishing, and reports whether it
// did: a handle that finished, or was abandoned before, has none to
// release.
func (h *handle) abandon() bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.done || h.abandoned {
		return false
	}
	h.abandoned = true
	h.disown()
	return true
}

// disown gives up the run: the owner lock, then the signal, so whoever the
// signal wakes reads the run unowned. Between the two another handle may
// take the run, and its signal is not this handle's to end (release).
func (h *handle) disown() {
	h.lock.Close()
	h.appends.handoff(h.dir)
	h.appends.release(h.dir, h)
}

func (h *handle) Append(event run.Event) error {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.abandoned {
		return errAbandoned
	}
	h.seq++
	event.Seq = h.seq
	if err := appendLine(filepath.Join(h.dir, "events.jsonl"), event); err != nil {
		return err
	}
	h.appends.appended(h.dir, event.Seq)
	return nil
}

func (h *handle) Raw(line string) error {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.abandoned {
		return errAbandoned
	}
	return appendText(filepath.Join(h.dir, "provider.jsonl"), line)
}

func (h *handle) Update(record run.Record) error {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.abandoned {
		return errAbandoned
	}
	return h.writeRecord(record)
}

func (h *handle) Artifact(name string, data []byte) (run.Artifact, error) {
	if name == "" || name != filepath.Base(name) || strings.HasPrefix(name, ".") {
		return run.Artifact{}, fmt.Errorf("invalid artifact name %q", name)
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.abandoned {
		return run.Artifact{}, errAbandoned
	}
	dir := filepath.Join(h.dir, "artifacts")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return run.Artifact{}, err
	}
	if err := os.WriteFile(filepath.Join(dir, name), data, 0o600); err != nil {
		return run.Artifact{}, err
	}
	sum := sha256.Sum256(data)
	return run.Artifact{Name: name, Path: "artifacts/" + name, Digest: "sha256:" + hex.EncodeToString(sum[:]), Bytes: int64(len(data))}, nil
}

func (h *handle) Finish(record run.Record) error {
	h.mu.Lock()
	defer h.mu.Unlock()
	// The lock is gone already, and another handle may hold the run by
	// now: nothing of it is this handle's to write or release.
	if h.abandoned {
		return errAbandoned
	}
	if h.done {
		return nil
	}
	h.done = true
	err := h.writeRecord(record)
	h.disown()
	return err
}

func (h *handle) writeRecord(record run.Record) error {
	data, err := json.MarshalIndent(record, "", "  ")
	if err != nil {
		return err
	}
	temporary := filepath.Join(h.dir, "record.json.tmp")
	if err := os.WriteFile(temporary, append(data, '\n'), 0o600); err != nil {
		return err
	}
	return os.Rename(temporary, filepath.Join(h.dir, "record.json"))
}

func (s Store) Get(_ context.Context, id string) (run.Record, run.State, error) {
	var record run.Record
	if err := checkID(id); err != nil {
		return record, "", err
	}
	data, err := os.ReadFile(filepath.Join(s.runDir(id), "record.json"))
	if errors.Is(err, fs.ErrNotExist) {
		return record, "", fmt.Errorf("run %s: %w", id, contract.ErrNotFound)
	}
	if err != nil {
		return record, "", err
	}
	if err := json.Unmarshal(data, &record); err != nil {
		return record, "", fmt.Errorf("run %s: %w", id, err)
	}
	return record, s.status(id, record), nil
}

// Artifact reads back the bytes of an artifact run id stored, as its record
// names it: only a file in the run's artifacts directory is read.
func (s Store) Artifact(_ context.Context, id string, artifact run.Artifact) ([]byte, error) {
	if err := checkID(id); err != nil {
		return nil, err
	}
	name, ok := strings.CutPrefix(artifact.Path, "artifacts/")
	if !ok || name == "" || name != filepath.Base(name) || strings.HasPrefix(name, ".") {
		return nil, fmt.Errorf("run %s: invalid artifact path %q", id, artifact.Path)
	}
	data, err := os.ReadFile(filepath.Join(s.runDir(id), "artifacts", name))
	if errors.Is(err, fs.ErrNotExist) {
		return nil, fmt.Errorf("run %s: artifact %s: %w", id, name, contract.ErrNotFound)
	}
	return data, err
}

// ownerLock is the name of the run's owner lock: the store's own state, not
// evidence.
const ownerLock = "owner.lock"

// Hold takes a stable read of run id, for an export: a shared hold of its
// owner lock, which keeps out both its owner and a process adopting it to
// recover what it left, each of which takes the lock alone. Its record is
// read once held, and its state told from that record: finished, or
// abandoned. A run whose lock another process holds is not held
// (app.RunOwnedError). A run with no owner lock has none to take: nothing
// can own it, so it is read as it is.
func (s Store) Hold(ctx context.Context, id string) (app.ExportRead, error) {
	if err := checkID(id); err != nil {
		return nil, err
	}
	dir := s.runDir(id)
	lock, err := os.Open(filepath.Join(dir, ownerLock))
	switch {
	case errors.Is(err, fs.ErrNotExist):
		lock = nil
	case err != nil:
		return nil, err
	default:
		if err := syscall.Flock(int(lock.Fd()), syscall.LOCK_SH|syscall.LOCK_NB); err != nil {
			lock.Close()
			if !errors.Is(err, syscall.EWOULDBLOCK) {
				return nil, fmt.Errorf("run %s: %w", id, err)
			}
			record, _, err := s.Get(ctx, id)
			if err != nil {
				return nil, err
			}
			return nil, &app.RunOwnedError{ID: id, Finished: record.FinishedAt != nil}
		}
	}
	read := &held{id: id, dir: dir, lock: lock, state: run.StateAbandoned}
	data, err := os.ReadFile(filepath.Join(dir, "record.json"))
	if errors.Is(err, fs.ErrNotExist) {
		err = fmt.Errorf("run %s: %w", id, contract.ErrNotFound)
	}
	if err == nil {
		if err = json.Unmarshal(data, &read.record); err != nil {
			err = fmt.Errorf("run %s: %w", id, err)
		}
	}
	if err != nil {
		read.Release()
		return nil, err
	}
	if read.record.FinishedAt != nil {
		read.state = run.StateFinished
	}
	return read, nil
}

// held is a stable read of the run in dir, holding its owner lock shared
// until it is released; lock is nil for a run that has none.
type held struct {
	id, dir string
	lock    *os.File
	record  run.Record
	state   run.State
}

func (h *held) Record() run.Record { return h.record }

func (h *held) State() run.State { return h.state }

// Files lists the files of the run's directory by slash-separated path
// relative to it, sorted: its record, events, provider log and artifacts.
// The owner lock is the store's own state, not evidence, and is not
// listed. Anything there that is neither a file nor a directory fails the
// listing.
func (h *held) Files() ([]string, error) {
	var files []string
	err := filepath.WalkDir(h.dir, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() {
			return nil
		}
		relative, err := filepath.Rel(h.dir, path)
		if err != nil {
			return err
		}
		relative = filepath.ToSlash(relative)
		if !entry.Type().IsRegular() {
			return fmt.Errorf("run %s: %s is not a regular file", h.id, relative)
		}
		if relative != ownerLock {
			files = append(files, relative)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	sort.Strings(files)
	return files, nil
}

// Open opens the run's file at the slash-separated path, as Files lists it:
// only a file inside the run's directory, and never its owner lock.
func (h *held) Open(path string) (io.ReadCloser, error) {
	local := filepath.FromSlash(path)
	if !filepath.IsLocal(local) || path == ownerLock {
		return nil, fmt.Errorf("run %s: invalid file path %q", h.id, path)
	}
	return os.Open(filepath.Join(h.dir, local))
}

// Release lets go of the owner lock; once released, the read holds
// nothing.
func (h *held) Release() {
	if h.lock != nil {
		h.lock.Close()
		h.lock = nil
	}
}

func (s Store) Events(ctx context.Context, id string, afterSeq int) ([]run.Event, run.State, error) {
	// Status first: events written before the run finished are then all on disk.
	_, status, err := s.Get(ctx, id)
	if err != nil {
		return nil, "", err
	}
	file, err := os.Open(filepath.Join(s.runDir(id), "events.jsonl"))
	if errors.Is(err, fs.ErrNotExist) {
		return nil, status, nil
	}
	if err != nil {
		return nil, "", err
	}
	defer file.Close()
	var events []run.Event
	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, 64*1024), 16*1024*1024)
	for scanner.Scan() {
		var event run.Event
		if err := json.Unmarshal(scanner.Bytes(), &event); err != nil {
			break // a torn final line from a crashed writer
		}
		if event.Seq > afterSeq {
			events = append(events, event)
		}
	}
	return events, status, scanner.Err()
}

// Appended returns a channel closed once run id, whose handle the Store's
// Appends holds, has an event after afterSeq, has finished, is abandoned or
// has passed to another handle; it is closed already if it has such an
// event. A run no handle there holds that is not running, finished or
// abandoned, has ended: its channel is closed already. For a run that is
// running and no handle there holds, as one another process runs, ok is
// false.
func (s Store) Appended(ctx context.Context, id string, afterSeq int) (<-chan struct{}, bool) {
	if checkID(id) != nil {
		return nil, false
	}
	if appended, ok := s.Appends.after(s.runDir(id), afterSeq); ok {
		return appended, true
	}
	// Released handles have written their record first, so a run this
	// process finished reads finished here.
	if _, state, err := s.Get(ctx, id); err != nil || state == run.StateRunning {
		return nil, false
	}
	ended := make(chan struct{})
	close(ended)
	return ended, true
}

// Appends is what the handles of the Stores given it have appended, by run
// directory: it signals the waiters of each run one of those handles holds.
// A process has one, built in its composition root (NewAppends); a test
// builds its own. A nil one holds nothing and signals nothing.
type Appends struct {
	mu   sync.Mutex
	runs map[string]*appended
	// unlocked, when set, is called once a handle has released its owner
	// lock and before it stops signalling its run: the moment another
	// handle can take the run. Tests take it there.
	unlocked func(dir string)
}

// NewAppends returns an Appends that holds no run yet.
func NewAppends() *Appends {
	return &Appends{runs: map[string]*appended{}}
}

// appended is a held run's last event written, the channel its next
// event, its finish or its abandonment closes, and the handle that holds
// it.
type appended struct {
	seq    int
	next   chan struct{}
	holder *handle
}

// hold starts signalling the run in dir, which holder holds and whose last
// event written is seq. Whoever waits on the handle that held it before,
// which has let go of the run but not yet released its signal, is woken:
// that signal's channel is not closed otherwise.
func (a *Appends) hold(dir string, seq int, holder *handle) {
	if a == nil {
		return
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	if held, ok := a.runs[dir]; ok {
		close(held.next)
	}
	a.runs[dir] = &appended{seq: seq, next: make(chan struct{}), holder: holder}
}

// holder is the handle that holds the run in dir; ok is false if none here
// does.
func (a *Appends) holder(dir string) (holder *handle, ok bool) {
	if a == nil {
		return nil, false
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	if held, ok := a.runs[dir]; ok {
		return held.holder, true
	}
	return nil, false
}

// appended records that the run in dir has written event seq, and wakes
// its waiters.
func (a *Appends) appended(dir string, seq int) {
	if a == nil {
		return
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	if held, ok := a.runs[dir]; ok {
		held.seq = seq
		close(held.next)
		held.next = make(chan struct{})
	}
}

// handoff says the run in dir has no owner lock any more and is still
// signalled: see unlocked.
func (a *Appends) handoff(dir string) {
	if a != nil && a.unlocked != nil {
		a.unlocked(dir)
	}
}

// release wakes the waiters of the run in dir a last time and stops
// signalling it, if holder still holds it: a run another handle took since
// is that handle's to signal.
func (a *Appends) release(dir string, holder *handle) {
	if a == nil {
		return
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	if held, ok := a.runs[dir]; ok && held.holder == holder {
		close(held.next)
		delete(a.runs, dir)
	}
}

// after is the channel closed once the run in dir has an event after seq,
// closed already if it has; ok is false if no handle here holds it.
func (a *Appends) after(dir string, seq int) (<-chan struct{}, bool) {
	if a == nil {
		return nil, false
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	held, ok := a.runs[dir]
	if !ok {
		return nil, false
	}
	if held.seq > seq {
		ended := make(chan struct{})
		close(ended)
		return ended, true
	}
	return held.next, true
}

func (s Store) List(ctx context.Context) ([]run.Record, error) {
	return s.list(ctx, false)
}

// ListStrict returns every run's record or an error: a partial listing
// cannot establish which run last changed a continued session. A run
// whose directory holds no record.json yet is being created (Create makes
// the directory before it writes the record): it has recorded nothing, so
// nothing of it is on record, and it is left out. A record that exists but
// cannot be read or parsed fails the listing.
func (s Store) ListStrict(ctx context.Context) ([]run.Record, error) {
	return s.list(ctx, true)
}

func (s Store) list(ctx context.Context, strict bool) ([]run.Record, error) {
	entries, err := os.ReadDir(s.Dir)
	if errors.Is(err, fs.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var ids []string
	for _, entry := range entries {
		if entry.IsDir() {
			ids = append(ids, entry.Name())
		}
	}
	sort.Strings(ids)
	records := make([]run.Record, 0, len(ids))
	for _, id := range ids {
		record, _, err := s.Get(ctx, id)
		if err != nil {
			if strict && !errors.Is(err, contract.ErrNotFound) {
				return nil, fmt.Errorf("listing run %s: %w", id, err)
			}
			continue
		}
		records = append(records, record)
	}
	return records, nil
}

// status: finished if the record says so; otherwise running while some
// process holds the owner lock, and abandoned once nobody does.
func (s Store) status(id string, record run.Record) run.State {
	if record.FinishedAt != nil {
		return run.StateFinished
	}
	lock, err := os.Open(filepath.Join(s.runDir(id), ownerLock))
	if err != nil {
		return run.StateAbandoned
	}
	defer lock.Close()
	if err := syscall.Flock(int(lock.Fd()), syscall.LOCK_SH|syscall.LOCK_NB); err != nil {
		return run.StateRunning
	}
	_ = syscall.Flock(int(lock.Fd()), syscall.LOCK_UN)
	// Re-read: the owner may have finished between the two checks.
	if data, err := os.ReadFile(filepath.Join(s.runDir(id), "record.json")); err == nil {
		var latest run.Record
		if json.Unmarshal(data, &latest) == nil && latest.FinishedAt != nil {
			return run.StateFinished
		}
	}
	return run.StateAbandoned
}

func appendLine(path string, value any) error {
	data, err := json.Marshal(value)
	if err != nil {
		return err
	}
	return appendText(path, string(data))
}

func appendText(path, line string) error {
	file, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	defer file.Close()
	_, err = file.WriteString(line + "\n")
	return err
}
