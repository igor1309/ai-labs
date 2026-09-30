package app_test

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"sort"
	"sync"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

// Spies record every call's payload and answer with a scripted response.

type definitionsSpy struct {
	mu    sync.Mutex
	docs  map[definition.Kind]map[string]string
	reads []string
}

func (s *definitionsSpy) Read(_ context.Context, kind definition.Kind, name string) (definition.Document, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.reads = append(s.reads, string(kind)+"/"+name)
	text, ok := s.docs[kind][name]
	if !ok {
		return definition.Document{}, fmt.Errorf("not found")
	}
	sum := sha256.Sum256([]byte(text))
	return definition.Document{
		Source: definition.Source{Kind: kind, Name: name, Path: "mem/" + string(kind) + "/" + name, SHA256: hex.EncodeToString(sum[:])},
		Bytes:  []byte(text),
	}, nil
}

// set replaces one document of the live settings.
func (s *definitionsSpy) set(kind definition.Kind, name, text string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.docs[kind][name] = text
}

func (s *definitionsSpy) readCount() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return len(s.reads)
}

func (s *definitionsSpy) List(_ context.Context, kind definition.Kind) ([]string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.reads = append(s.reads, "list "+string(kind))
	var names []string
	for name := range s.docs[kind] {
		names = append(names, name)
	}
	sort.Strings(names)
	return names, nil
}

type runnerSpy struct {
	mu          sync.Mutex
	identity    app.RuntimeIdentity
	identityErr error
	turn        run.Turn
	block       bool // wait for cancellation
	requests    []app.TurnRequest
	started     chan struct{}
	startErr    error // what ProcessStarted returned to the last turn
}

func (s *runnerSpy) Identity(context.Context) (app.RuntimeIdentity, error) {
	return s.identity, s.identityErr
}

func (s *runnerSpy) RunTurn(ctx context.Context, request app.TurnRequest, sink app.EventSink) run.Turn {
	s.mu.Lock()
	s.requests = append(s.requests, request)
	s.mu.Unlock()
	startErr := sink.ProcessStarted("ref-4242")
	s.mu.Lock()
	s.startErr = startErr
	s.mu.Unlock()
	if startErr != nil {
		// What a runtime adapter does: the process is ended, the turn fails.
		return run.Turn{Status: run.Failed, Error: run.Fault(run.ClassInternal, "%v", startErr)}
	}
	sink.Event(run.SourceProcess, "PROCESS_STARTED", nil)
	sink.Raw(`{"raw":true}`)
	if s.started != nil {
		close(s.started)
	}
	if s.block {
		<-ctx.Done()
		return run.Turn{Status: run.Interrupted, Error: run.Fault(run.ClassCancelled, "")}
	}
	return s.turn
}

func (s *runnerSpy) calls() []app.TurnRequest {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]app.TurnRequest(nil), s.requests...)
}

type runtimesSpy struct {
	mu     sync.Mutex
	runner *runnerSpy
	asked  []string // adapter|command a runner was built for
	// identified lists the adapter|command each identity was asked of.
	identified []string
	// runnerErr, when set, is why a runner cannot be built.
	runnerErr error
}

func (s *runtimesSpy) Runner(adapter, command string) (app.TurnRunner, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.asked = append(s.asked, adapter+"|"+command)
	if adapter != "spy" {
		return nil, fmt.Errorf("no runtime adapter %q", adapter)
	}
	if s.runnerErr != nil {
		return nil, s.runnerErr
	}
	return s.runner, nil
}

func (s *runtimesSpy) Adapters() []string { return []string{"spy"} }

func (s *runtimesSpy) Identity(ctx context.Context, adapter, command string) (app.RuntimeIdentity, error) {
	s.mu.Lock()
	s.identified = append(s.identified, adapter+"|"+command)
	s.mu.Unlock()
	if adapter != "spy" {
		return app.RuntimeIdentity{}, fmt.Errorf("no runtime adapter %q", adapter)
	}
	return s.runner.Identity(ctx)
}

type inputsSpy struct {
	mu      sync.Mutex
	specs   []app.InputSpec
	respond func(app.InputSpec) (app.Resolved, error)
}

func (s *inputsSpy) Resolve(_ context.Context, spec app.InputSpec) (app.Resolved, error) {
	s.mu.Lock()
	s.specs = append(s.specs, spec)
	s.mu.Unlock()
	return s.respond(spec)
}

type workspacesSpy struct {
	mu          sync.Mutex
	root        string
	dir         string
	checkouts   [][2]string
	released    int
	discarded   [][2]string // repository, dir
	discardErr  error
	discardHook func(ctx context.Context, dir string) error // runs first; a non-nil result is returned
}

func (s *workspacesSpy) Discard(ctx context.Context, repository, dir string) error {
	if s.discardHook != nil {
		if err := s.discardHook(ctx, dir); err != nil {
			return err
		}
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.discarded = append(s.discarded, [2]string{repository, dir})
	return s.discardErr
}

func (s *workspacesSpy) Root(context.Context, string) (string, error) { return s.root, nil }

func (s *workspacesSpy) Checkout(_ context.Context, repository, revision string) (string, func() error, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.checkouts = append(s.checkouts, [2]string{repository, revision})
	return s.dir, func() error {
		s.mu.Lock()
		defer s.mu.Unlock()
		s.released++
		return nil
	}, nil
}

func (s *workspacesSpy) releases() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.released
}

// changesSpy captures what an agent left in its checkout.
type changesSpy struct {
	mu        sync.Mutex
	changed   [][2]string // dir, revision
	changes   []byte
	changeErr error
	panics    bool // Changes panics
}

func (s *changesSpy) Changes(_ context.Context, dir, revision string) ([]byte, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.changed = append(s.changed, [2]string{dir, revision})
	if s.panics {
		panic("changes exploded")
	}
	return s.changes, s.changeErr
}

type validatorSpy struct {
	compileErr, validateErr error
	compiled                [][]byte
	validated               []json.RawMessage
}

func (s *validatorSpy) Compile(schema []byte) error {
	s.compiled = append(s.compiled, schema)
	return s.compileErr
}

func (s *validatorSpy) Validate(_ []byte, output json.RawMessage) error {
	s.validated = append(s.validated, output)
	return s.validateErr
}

type recorderSpy struct {
	mu        sync.Mutex
	created   []run.Record
	updates   []run.Record
	events    []run.Event
	raw       []string
	artifacts map[string][]byte
	finished  chan run.Record

	// updateErr, when set, is asked about each Update; a non-nil result
	// fails it and the record is not kept.
	updateErr        func(record run.Record) error
	appendErr        error         // when set, Append fails with it
	finishErr        error         // when set, Finish fails with it
	onCreate         func()        // runs first in Create
	hold             chan struct{} // when set, the first Append waits for it to close
	onFinish         func() int    // observed state at finish time
	releasedAtFinish int
}

func newRecorderSpy() *recorderSpy { return &recorderSpy{finished: make(chan run.Record, 1)} }

func (s *recorderSpy) Create(_ context.Context, record run.Record) (app.RunHandle, error) {
	if s.onCreate != nil {
		s.onCreate()
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.created = append(s.created, record)
	return s, nil
}

func (s *recorderSpy) Append(event run.Event) error {
	if s.hold != nil {
		<-s.hold
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.appendErr != nil {
		return s.appendErr
	}
	s.events = append(s.events, event)
	return nil
}

func (s *recorderSpy) Raw(line string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.raw = append(s.raw, line)
	return nil
}

func (s *recorderSpy) Update(record run.Record) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.updateErr != nil {
		if err := s.updateErr(record); err != nil {
			return err
		}
	}
	s.updates = append(s.updates, record)
	return nil
}

func (s *recorderSpy) Artifact(name string, data []byte) (run.Artifact, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.artifacts == nil {
		s.artifacts = map[string][]byte{}
	}
	s.artifacts[name] = data
	return run.Artifact{Name: name, Path: "artifacts/" + name, Digest: "sha256:spy", Bytes: int64(len(data))}, nil
}

func (s *recorderSpy) Finish(record run.Record) error {
	if s.finishErr != nil {
		return s.finishErr
	}
	if s.onFinish != nil {
		s.releasedAtFinish = s.onFinish()
	}
	s.finished <- record
	return nil
}

func (s *recorderSpy) kinds() []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	var kinds []string
	for _, event := range s.events {
		kinds = append(kinds, event.Kind)
	}
	return kinds
}

func (s *recorderSpy) wait(t *testing.T) run.Record {
	t.Helper()
	select {
	case record := <-s.finished:
		return record
	case <-time.After(5 * time.Second):
		t.Fatal("the call never finished")
		return run.Record{}
	}
}

// runsSpy answers lookups of earlier runs.
type runsSpy struct {
	mu      sync.Mutex
	records map[string]run.Record
	states  map[string]run.State
	asked   []string
}

func (s *runsSpy) Get(_ context.Context, id string) (run.Record, run.State, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.asked = append(s.asked, id)
	record, ok := s.records[id]
	if !ok {
		return run.Record{}, "", fmt.Errorf("not found")
	}
	return record, s.states[id], nil
}

// steppingClock advances a second on every reading.
type steppingClock struct {
	mu  sync.Mutex
	now time.Time
}

func (c *steppingClock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.now = c.now.Add(time.Second)
	return c.now
}

type fixedClock struct{}

func (fixedClock) Now() time.Time { return time.Date(2026, 9, 28, 12, 0, 0, 0, time.UTC) }

type fixedIDs struct{}

func (fixedIDs) RunID(time.Time) string { return "run-1" }

type processesSpy struct {
	mu     sync.Mutex
	reaped []string // references
	err    error
	// hook, when set, sees the context each Reap receives.
	hook func(context.Context)
}

func (s *processesSpy) Reap(ctx context.Context, ref string) (app.Reaping, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.hook != nil {
		s.hook(ctx)
	}
	s.reaped = append(s.reaped, ref)
	return app.ReapKilled, s.err
}

// reapHandle is all a reap has of an adopted run: it appends and finishes,
// and can do nothing else with it.
type reapHandle struct{ spy *recorderSpy }

var _ app.ReapHandle = reapHandle{}

func (h reapHandle) Append(event run.Event) error   { return h.spy.Append(event) }
func (h reapHandle) Finish(record run.Record) error { return h.spy.Finish(record) }

// adopterSpy offers abandoned runs; each adoption hands out its own handle.
// It also tells which checkouts runs some process still owns use.
type adopterSpy struct {
	mu        sync.Mutex
	runs      []run.Record
	live      []string
	liveReads int
	onLive    func() // runs during LiveCheckouts
	// order lists LiveCheckouts as "live" and each Adopt as "adopt:<id>".
	order    []string
	adoptErr map[string]error
	handles  map[string]*recorderSpy
	adopted  []string
	// listErr fails Abandoned; failing hands out, by run, handles set up
	// to fail.
	listErr error
	failing map[string]func(*recorderSpy)
}

func (s *adopterSpy) Abandoned(context.Context) ([]run.Record, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.listErr != nil {
		return nil, s.listErr
	}
	return append([]run.Record(nil), s.runs...), nil
}

func (s *adopterSpy) LiveCheckouts(context.Context) ([]string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.liveReads++
	s.order = append(s.order, "live")
	if s.onLive != nil {
		s.onLive()
	}
	return s.live, nil
}

func (s *adopterSpy) Adopt(_ context.Context, id string) (app.ReapHandle, run.Record, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.order = append(s.order, "adopt:"+id)
	s.adopted = append(s.adopted, id)
	if err := s.adoptErr[id]; err != nil {
		return nil, run.Record{}, err
	}
	if s.handles == nil {
		s.handles = map[string]*recorderSpy{}
	}
	handle := newRecorderSpy()
	if fail := s.failing[id]; fail != nil {
		fail(handle)
	}
	s.handles[id] = handle
	for _, record := range s.runs {
		if record.ID == id {
			return reapHandle{handle}, record, nil
		}
	}
	return nil, run.Record{}, fmt.Errorf("no run %s", id)
}

func sha(text string) string {
	sum := sha256.Sum256([]byte(text))
	return hex.EncodeToString(sum[:])
}
