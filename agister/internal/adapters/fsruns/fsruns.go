// Package fsruns stores run evidence under <dir>/<run-id>/:
//
//	record.json     the run record, replaced atomically
//	events.jsonl    ordered events, appended
//	provider.jsonl  raw runtime output, appended
//	owner.lock      held (flock) by the process running the call
//	artifacts/      files the call produced
//
// A record that is not finished and whose lock nobody holds is abandoned.
package fsruns

import (
	"bufio"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
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
}

var _ app.RunRecorder = Store{}
var _ app.RunsReader = Store{}
var _ app.RunAdopter = Store{}

func (s Store) runDir(id string) string { return filepath.Join(s.Dir, id) }

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
	lock, err := os.OpenFile(filepath.Join(dir, "owner.lock"), os.O_CREATE|os.O_RDWR, 0o600)
	if err != nil {
		return nil, err
	}
	if err := syscall.Flock(int(lock.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		lock.Close()
		return nil, err
	}
	h := &handle{dir: dir, lock: lock}
	if err := h.writeRecord(record); err != nil {
		lock.Close()
		return nil, err
	}
	return h, nil
}

// Abandoned lists the unfinished runs nobody owns that recorded effects.
func (s Store) Abandoned(ctx context.Context) ([]run.Record, error) {
	records, err := s.List(ctx)
	if err != nil {
		return nil, err
	}
	var abandoned []run.Record
	for _, record := range records {
		if record.Effects == nil || record.FinishedAt != nil {
			continue
		}
		if _, state, err := s.Get(ctx, record.ID); err == nil && state == run.StateAbandoned {
			abandoned = append(abandoned, record)
		}
	}
	return abandoned, nil
}

// LiveCheckouts lists the checkout directories of unfinished runs that
// some process still owns.
func (s Store) LiveCheckouts(ctx context.Context) ([]string, error) {
	records, err := s.List(ctx)
	if err != nil {
		return nil, err
	}
	var dirs []string
	for _, record := range records {
		if record.Effects == nil || record.Effects.Checkout == nil || record.FinishedAt != nil {
			continue
		}
		if _, state, err := s.Get(ctx, record.ID); err != nil || state == run.StateRunning {
			dirs = append(dirs, record.Effects.Checkout.Dir)
		}
	}
	return dirs, nil
}

// Adopt takes the owner lock of an unfinished run, so exactly one process
// ends what its dead owner left.
func (s Store) Adopt(ctx context.Context, id string) (app.RunHandle, run.Record, error) {
	var record run.Record
	if err := checkID(id); err != nil {
		return nil, record, err
	}
	lock, err := os.OpenFile(filepath.Join(s.runDir(id), "owner.lock"), os.O_RDWR, 0)
	if errors.Is(err, fs.ErrNotExist) {
		return nil, record, fmt.Errorf("run %s: %w", id, contract.ErrNotFound)
	}
	if err != nil {
		return nil, record, err
	}
	if err := syscall.Flock(int(lock.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		lock.Close()
		return nil, record, fmt.Errorf("run %s is owned: %w", id, err)
	}
	// Read under the lock: the owner may have finished before it was released.
	record, _, err = s.Get(ctx, id)
	if err == nil && record.FinishedAt != nil {
		err = fmt.Errorf("run %s is finished", id)
	}
	if err != nil {
		lock.Close()
		return nil, record, err
	}
	seq := 0
	if events, _, err := s.Events(ctx, id, 0); err == nil && len(events) > 0 {
		seq = events[len(events)-1].Seq
	}
	return &handle{dir: s.runDir(id), lock: lock, seq: seq}, record, nil
}

type handle struct {
	mu   sync.Mutex
	dir  string
	lock *os.File
	seq  int
	done bool
}

func (h *handle) Append(event run.Event) error {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.seq++
	event.Seq = h.seq
	return appendLine(filepath.Join(h.dir, "events.jsonl"), event)
}

func (h *handle) Raw(line string) error {
	h.mu.Lock()
	defer h.mu.Unlock()
	return appendText(filepath.Join(h.dir, "provider.jsonl"), line)
}

func (h *handle) Update(record run.Record) error {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.writeRecord(record)
}

func (h *handle) Artifact(name string, data []byte) (run.Artifact, error) {
	if name == "" || name != filepath.Base(name) || strings.HasPrefix(name, ".") {
		return run.Artifact{}, fmt.Errorf("invalid artifact name %q", name)
	}
	h.mu.Lock()
	defer h.mu.Unlock()
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
	if h.done {
		return nil
	}
	h.done = true
	err := h.writeRecord(record)
	h.lock.Close() // releases ownership
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

func (s Store) List(ctx context.Context) ([]run.Record, error) {
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
	lock, err := os.Open(filepath.Join(s.runDir(id), "owner.lock"))
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
