package app_test

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
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
	turns       []run.Turn    // played first, one per turn; then turn
	block       bool          // wait for cancellation
	release     chan struct{} // when set, a blocked turn also ends when it closes
	requests    []app.TurnRequest
	started     chan struct{}
	startErr    error // what ProcessStarted returned to the last turn
	// during, when set, runs while each turn does.
	during func(app.TurnRequest)
	// acting, when set, runs while each turn does, with the turn's context
	// and sink: what the runtime reports of the turn.
	acting func(context.Context, app.EventSink)
}

func (s *runnerSpy) Identity(context.Context) (app.RuntimeIdentity, error) {
	return s.identity, s.identityErr
}

func (s *runnerSpy) RunTurn(ctx context.Context, request app.TurnRequest, sink app.EventSink) run.Turn {
	s.mu.Lock()
	s.requests = append(s.requests, request)
	turn := s.turn
	if n := len(s.requests); n <= len(s.turns) {
		turn = s.turns[n-1]
	}
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
	if s.during != nil {
		s.during(request)
	}
	if s.acting != nil {
		s.acting(ctx, sink)
	}
	if s.block {
		select {
		case <-ctx.Done():
		case <-s.release:
		}
		return run.Turn{Status: run.Interrupted, Error: run.Fault(run.ClassCancelled, "")}
	}
	return turn
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

// changesSpy names a checkout's content and captures what an agent left
// in it. A clean copy (see copiesSpy) has the content the checkout was last
// named with, unless copied says otherwise.
type changesSpy struct {
	mu        sync.Mutex
	changed   [][2]string   // dir, from
	identity  string        // what Identity names; "tree" when empty
	identify  func() string // when set, names the checkout's content instead
	changes   []byte
	changeErr error
	panics    bool // Changes panics
	// copied, when set, names a clean copy's content, given how many times
	// a copy in its directory was named before: 0 before the first
	// attempt's run, 1 after.
	copied func(dir string, named int) string
	named  map[string]int
}

func (s *changesSpy) Identity(_ context.Context, dir, _ string) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if strings.HasPrefix(dir, copyDirs) {
		if s.named == nil {
			s.named = map[string]int{}
		}
		named := s.named[dir]
		s.named[dir]++
		if s.copied != nil {
			return s.copied(dir, named), nil
		}
	} else if s.identify != nil {
		s.identity = s.identify()
	}
	if s.identity == "" {
		return "tree", nil
	}
	return s.identity, nil
}

func (s *changesSpy) Changes(_ context.Context, dir, from, _ string) ([]byte, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.changed = append(s.changed, [2]string{dir, from})
	if s.panics {
		panic("changes exploded")
	}
	return s.changes, s.changeErr
}

// copyDirs is where copiesSpy places the copies of its calls: copy-1,
// copy-2, ...
const copyDirs = "/work/copy-"

// madeCopy is one clean copy copiesSpy made.
type madeCopy struct {
	repository, revision, patch, dir string
}

// copiesSpy places each call's clean copies in a directory of its own,
// makes them there, and removes them. Like the real ones, it makes no copy
// where one is.
type copiesSpy struct {
	mu        sync.Mutex
	placed    []string // the calls whose copies were placed
	made      []madeCopy
	present   map[string]bool
	removed   []string
	err       error // Copy fails with it
	removeErr error // removing fails with it
	// block makes Copy make the copy, then wait for its context to end and
	// fail with why; interrupted is that reason.
	block       bool
	interrupted error
	// copying, when set, runs as a copy is made; removing as one is
	// removed.
	copying  func(dir string)
	removing func(dir string)
}

func (s *copiesSpy) Place(call string) string {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.placed = append(s.placed, call)
	return fmt.Sprintf("%s%d", copyDirs, len(s.placed))
}

func (s *copiesSpy) Copy(ctx context.Context, repository, dir, revision string, patch []byte) error {
	if s.copying != nil {
		s.copying(dir)
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.err != nil {
		return s.err
	}
	if s.present[dir] {
		return fmt.Errorf("%s: %w", dir, app.ErrPlaceTaken)
	}
	if s.present == nil {
		s.present = map[string]bool{}
	}
	s.present[dir] = true
	s.made = append(s.made, madeCopy{repository, revision, string(patch), dir})
	if s.block {
		s.mu.Unlock()
		<-ctx.Done()
		s.mu.Lock()
		s.interrupted = ctx.Err()
		return s.interrupted
	}
	return nil
}

func (s *copiesSpy) Discard(_ context.Context, _, dir string) error {
	if s.removing != nil {
		s.removing(dir)
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.removed = append(s.removed, dir)
	if s.removeErr != nil {
		return s.removeErr
	}
	delete(s.present, dir)
	return nil
}

// left lists the copies made and not removed.
func (s *copiesSpy) left() []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	var left []string
	for dir := range s.present {
		left = append(left, dir)
	}
	sort.Strings(left)
	return left
}

func (s *copiesSpy) copies() []madeCopy {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]madeCopy(nil), s.made...)
}

// commandsSpy runs verification commands: each passes unless exits, in
// order, or exitIn, by the directory it runs in, says otherwise.
type commandsSpy struct {
	mu       sync.Mutex
	requests []app.CommandRequest
	exits    []int
	exitIn   func(dir string) int
	// running, when set, runs while the command does.
	running func(app.CommandRequest)
	// stale, when set, ends each run as one killed for its silence.
	stale bool
}

func (s *commandsSpy) Run(_ context.Context, request app.CommandRequest, started func(string) error) app.CommandResult {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.requests = append(s.requests, request)
	if err := started("ref-cmd"); err != nil {
		return app.CommandResult{Error: err.Error()}
	}
	if s.running != nil {
		s.running(request)
	}
	if s.stale {
		return app.CommandResult{Stale: true, Signal: "killed"}
	}
	code := 0
	if len(s.exits) > 0 {
		code, s.exits = s.exits[0], s.exits[1:]
	}
	if s.exitIn != nil {
		code = s.exitIn(request.Dir)
	}
	return app.CommandResult{ExitCode: &code, Head: []byte(fmt.Sprintf("exit %d", code)), Bytes: 6, SHA256: fmt.Sprintf("sha-%d-%d", code, len(s.requests))}
}

func (s *commandsSpy) runs() []app.CommandRequest {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]app.CommandRequest(nil), s.requests...)
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
	taken     int // finished records wait returned

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
		s.mu.Lock()
		s.taken++
		s.mu.Unlock()
		return record
	case <-time.After(5 * time.Second):
		t.Fatal("the call never finished")
		return run.Record{}
	}
}

// running is whether a run was created whose finished record wait has not
// returned.
func (s *recorderSpy) running() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return len(s.created) > s.taken
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

func (s *runsSpy) List(context.Context) ([]run.Record, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	records := make([]run.Record, 0, len(s.records))
	for _, record := range s.records {
		records = append(records, record)
	}
	sort.Slice(records, func(i, j int) bool { return records[i].ID < records[j].ID })
	return records, nil
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

// settableClock tells the time it was last set to.
type settableClock struct {
	mu  sync.Mutex
	now time.Time
}

func (c *settableClock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.now
}

func (c *settableClock) advance(by time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.now = c.now.Add(by)
}

// unfired is a timer whose wait never passes.
func unfired(time.Duration) (<-chan time.Time, func()) { return nil, func() {} }

// timersSpy starts waits on a settableClock: a wait passes when the clock
// is advanced to its end, never by wall time. A wait's stop is its
// watcher's word that nothing more comes of it.
type timersSpy struct {
	t     *testing.T
	clock *settableClock
	mu    sync.Mutex
	waits []*timerWait
	// started lists every wait asked for, in order.
	started []time.Duration
}

type timerWait struct {
	until   time.Time
	fired   chan time.Time
	settled bool // fired or stopped
	// stopped closes when the wait is stopped.
	stopped chan struct{}
	once    sync.Once
}

func (s *timersSpy) start(wait time.Duration) (<-chan time.Time, func()) {
	s.mu.Lock()
	defer s.mu.Unlock()
	w := &timerWait{until: s.clock.Now().Add(wait), fired: make(chan time.Time, 1), stopped: make(chan struct{})}
	s.waits = append(s.waits, w)
	s.started = append(s.started, wait)
	return w.fired, func() {
		s.mu.Lock()
		defer s.mu.Unlock()
		w.settled = true
		w.once.Do(func() { close(w.stopped) })
	}
}

// advance moves the clock on and passes every wait that ends by then, and
// returns once the watcher of each has dealt with it: what a passed wait
// ends has ended.
func (s *timersSpy) advance(by time.Duration) {
	s.clock.advance(by)
	now := s.clock.Now()
	s.mu.Lock()
	var passed []*timerWait
	for _, w := range s.waits {
		if !w.settled && !w.until.After(now) {
			w.settled = true
			w.fired <- now
			passed = append(passed, w)
		}
	}
	s.mu.Unlock()
	s.stopped(passed, "a wait that passed was never dealt with")
}

// released fails the test unless every wait asked for is stopped.
func (s *timersSpy) released() {
	s.mu.Lock()
	waits := append([]*timerWait(nil), s.waits...)
	s.mu.Unlock()
	s.stopped(waits, "a wait was never released")
}

// stopped waits for each wait's stop.
func (s *timersSpy) stopped(waits []*timerWait, otherwise string) {
	for _, w := range waits {
		select {
		case <-w.stopped:
		case <-time.After(hangGuard):
			s.t.Error(otherwise)
			return
		}
	}
}

func (s *timersSpy) asked() []time.Duration {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]time.Duration(nil), s.started...)
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
