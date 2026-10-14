package app_test

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"reflect"
	"strings"
	"testing"
	"testing/fstest"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/contract"
	"github.com/igor1309/ai-labs/agister/internal/domain/document"
	"github.com/igor1309/ai-labs/agister/internal/domain/input"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
	"github.com/igor1309/ai-labs/gokit/clocktest"
)

func TestCheckReportsEveryProblemAcrossDocuments(t *testing.T) {
	t.Parallel()
	h := newHarness()
	h.defs.docs[document.KindAgent]["broken"] = "schema = \"agister.agent/v1alpha1\"\nname = \"broken\"\ncolour = \"red\"\n"
	h.defs.docs[document.KindProcess]["q"] = strings.Replace(strings.Replace(h.defs.docs[document.KindProcess]["p"], "name: p", "name: q", 1), "timeout: 20m", "timeout: 2h", 1)
	h.validator.compileErr = errors.New("not a schema")
	checker := app.NewChecker(h.defs, h.validator, h.runtimes, []string{"git.revision", "git.diff"})

	report, err := checker.Check(context.Background(), false)
	if err != nil {
		t.Fatal(err)
	}
	joined := strings.Join(messages(report.Problems), "\n")
	for _, want := range []string{
		"agent broken: colour: unknown field",
		"agent broken: runtime: is required",
		"schema s: not a schema",
		`process p: output schema "s" does not exist`,
		"process q: timeout 2h0m0s exceeds the service limit 1h0m0s",
	} {
		if !strings.Contains(joined, want) {
			t.Errorf("missing %q in:\n%s", want, joined)
		}
	}
	if report.Checked["processes"] != 2 || report.Checked["agents"] != 2 {
		t.Fatalf("checked = %v", report.Checked)
	}
	if len(h.runner.calls()) != 0 || len(h.runtimes.identified) != 0 {
		t.Fatal("check without probe must not touch runtimes")
	}
}

// The report lists every definition read and what each uses, including
// references to definitions that do not exist and what nothing uses.
func TestCheckReportsWhatDefinesWhat(t *testing.T) {
	t.Parallel()
	h := newHarness()
	h.defs.docs[document.KindPrompt]["spare"] = "Nothing names this prompt.\n"
	h.defs.docs[document.KindProcess]["q"] = strings.Replace(strings.Replace(h.defs.docs[document.KindProcess]["p"], "name: p", "name: q", 1), "prompt: inspect", "prompt: ghost", 1)
	h.defs.docs[document.KindAgent]["broken"] = "schema = \"agister.agent/v1alpha1\"\nname = \"broken\"\ncolour = \"red\"\n"
	checker := app.NewChecker(h.defs, h.validator, h.runtimes, []string{"git.revision", "git.diff"})
	report, err := checker.Check(context.Background(), false)
	if err != nil {
		t.Fatal(err)
	}
	ref := func(kind, name string) contract.DefinitionRef { return contract.DefinitionRef{Kind: kind, Name: name} }
	got := map[contract.DefinitionRef]contract.Definition{}
	var order []string
	for _, d := range report.Definitions {
		got[ref(d.Kind, d.Name)] = d
		order = append(order, d.Kind+"/"+d.Name)
	}
	if strings.Join(order, " ") != "service/service runtimes/rt agents/a agents/broken prompts/inspect prompts/spare processes/p processes/q schemas/s workflows/p_a" {
		t.Fatalf("order = %v", order)
	}
	p, a := got[ref("processes", "p")], got[ref("agents", "a")]
	// A process uses no agent: workflow p_a's node binds p to agent a.
	if !reflect.DeepEqual(p.Uses, []contract.DefinitionRef{ref("prompts", "inspect"), ref("schemas", "s")}) || p.Layer != "home" || p.Path != "mem/processes/p" {
		t.Fatalf("p = %+v", p)
	}
	if !reflect.DeepEqual(a.Uses, []contract.DefinitionRef{ref("runtimes", "rt")}) || !reflect.DeepEqual(a.UsedBy, []contract.DefinitionRef{ref("workflows", "p_a")}) {
		t.Fatalf("a = %+v", a)
	}
	// The reference to what does not exist is to a prompt: a process
	// names no agent.
	if q := got[ref("processes", "q")]; q.Uses[0] != ref("prompts", "ghost") {
		t.Fatalf("q = %+v", q)
	}
	if spare := got[ref("prompts", "spare")]; len(spare.UsedBy) != 0 {
		t.Fatalf("spare = %+v", spare)
	}
	if broken := got[ref("agents", "broken")]; !broken.Invalid || len(broken.Uses) != 0 {
		t.Fatalf("broken = %+v", broken)
	}
}

// ADR-036: missing version evidence warns instead of refusing a binding.
func TestCheckProbesEachAgentsRuntime(t *testing.T) {
	t.Parallel()
	h := newHarness()
	checker := app.NewChecker(h.defs, h.validator, h.runtimes, []string{"git.revision", "git.diff"})
	if report, _ := checker.Check(context.Background(), true); len(messages(report.Problems)) != 0 {
		t.Fatalf("problems = %v", messages(report.Problems))
	}
	if !reflect.DeepEqual(h.runtimes.identified, []string{"spy|/bin/spy"}) {
		t.Fatalf("identified = %v", h.runtimes.identified)
	}
	h.runner.identity.Version = "9.0.0"
	report, _ := checker.Check(context.Background(), true)
	if len(report.Problems) != 0 || !strings.Contains(strings.Join(report.Warnings, "\n"), "version 9.0.0 has unverified primitives: Read, Grep") {
		t.Fatalf("report = %+v", report)
	}
}

// Only an adapter the code provides is probed: the identity of one it does
// not is never asked for, and its absence is reported once, as what it is.
func TestCheckProbeAsksNoIdentityOfAnAdapterTheCodeDoesNotProvide(t *testing.T) {
	t.Parallel()
	h := newHarness()
	h.defs.docs[document.KindRuntime]["rt"] = strings.Replace(h.defs.docs[document.KindRuntime]["rt"], "adapter: spy", "adapter: ghost", 1)
	checker := app.NewChecker(h.defs, h.validator, h.runtimes, []string{"git.revision", "git.diff"})
	without, _ := checker.Check(context.Background(), false)
	report, _ := checker.Check(context.Background(), true)
	want := []string{`runtime mapping rt: unknown adapter "ghost" (available: spy)`}
	if !reflect.DeepEqual(messages(without.Problems), want) || !reflect.DeepEqual(messages(report.Problems), messages(without.Problems)) {
		t.Fatalf("problems without probe %q, with %q, want %q", messages(without.Problems), messages(report.Problems), want)
	}
	if len(h.runtimes.identified) != 0 {
		t.Fatalf("identities asked for: %v", h.runtimes.identified)
	}
}

// ADR-036: a required declared primitive remains available when only another
// primitive has evidence for the installed version; the binding warns.
func TestCheckProbePlansEachProcessOnTheInstalledVersion(t *testing.T) {
	t.Parallel()
	h := newHarness()
	h.defs.docs[document.KindRuntime]["rt"] = strings.Replace(h.defs.docs[document.KindRuntime]["rt"], "Read: {grants: [repository.read], verified: [\"1.\"]}", "Read: {grants: [repository.read], verified: [\"2.\"]}", 1)
	h.defs.docs[document.KindProcess]["p"] = strings.Replace(h.defs.docs[document.KindProcess]["p"], "repository.diff]}", "repository.diff], require: [repository.read]}", 1)
	checker := app.NewChecker(h.defs, h.validator, h.runtimes, []string{"git.revision", "git.diff"})
	if report, _ := checker.Check(context.Background(), false); len(messages(report.Problems)) != 0 {
		t.Fatalf("problems = %v", messages(report.Problems))
	}
	report, _ := checker.Check(context.Background(), true)
	if len(report.Problems) != 0 || !strings.Contains(strings.Join(report.Warnings, "\n"), "version 1.2.3 has unverified primitives: Read") {
		t.Fatalf("report = %+v", report)
	}
}

type readerSpy struct {
	calls   []int // afterSeq per call
	batches [][]run.Event
	status  []run.State
	record  run.Record
	state   run.State
}

func (s *readerSpy) Events(_ context.Context, _ string, afterSeq int) ([]run.Event, run.State, error) {
	i := len(s.calls)
	s.calls = append(s.calls, afterSeq)
	return s.batches[i], s.status[i], nil
}

func (s *readerSpy) Get(context.Context, string) (run.Record, run.State, error) {
	return s.record, s.state, nil
}

func (s *readerSpy) List(context.Context) ([]run.Record, error) { return []run.Record{s.record}, nil }

func (s *readerSpy) RunDir(id string) string { return "/home/runs/" + id }

func TestObserveResumesAfterTheLastDeliveredEvent(t *testing.T) {
	t.Parallel()
	reader := &readerSpy{
		batches: [][]run.Event{{{Seq: 4}, {Seq: 5}}, {}, {{Seq: 6}}},
		status:  []run.State{run.StateRunning, run.StateRunning, run.StateFinished},
	}
	var waits []time.Duration
	passed := func(wait time.Duration) (<-chan time.Time, func()) {
		waits = append(waits, wait)
		fired := make(chan time.Time, 1)
		fired <- time.Time{}
		return fired, func() {}
	}
	runs := app.NewRuns(reader, unwritten{}, nil, passed, time.Second)
	var delivered []int
	err := runs.Observe(context.Background(), "r", 3, func(event contract.Event) error {
		delivered = append(delivered, event.Seq)
		return nil
	})
	if err != nil || !reflect.DeepEqual(delivered, []int{4, 5, 6}) || !reflect.DeepEqual(reader.calls, []int{3, 5, 5}) {
		t.Fatalf("delivered %v, asked after %v, err %v", delivered, reader.calls, err)
	}
	if !reflect.DeepEqual(waits, []time.Duration{time.Second, time.Second}) {
		t.Fatalf("waited %v between reads", waits)
	}
}

// unwritten is the append notification of runs this process does not
// write: it has none, so Observe polls.
type unwritten struct{}

func (unwritten) Appended(context.Context, string, int) (<-chan struct{}, bool) { return nil, false }

// appendsSpy is the append notification of runs this process writes: it
// reports each ask's afterSeq and answers the nth ask with wakes[n].
type appendsSpy struct {
	asks  chan int
	wakes []chan struct{}
	asked int
}

func (s *appendsSpy) Appended(_ context.Context, _ string, afterSeq int) (<-chan struct{}, bool) {
	wake := s.wakes[s.asked]
	s.asked++
	s.asks <- afterSeq
	return wake, true
}

// noTimer fails the test if Observe starts a timer.
func noTimer(t *testing.T) app.RunsTimer {
	return func(time.Duration) (<-chan time.Time, func()) {
		t.Error("Observe started a timer for a run this process writes")
		return make(chan time.Time), func() {}
	}
}

// pacedReader reports each read of a run's events, which is running until
// its last batch.
type pacedReader struct {
	readerSpy
	reads chan int
}

func (r *pacedReader) Events(ctx context.Context, id string, afterSeq int) ([]run.Event, run.State, error) {
	events, state, err := r.readerSpy.Events(ctx, id, afterSeq)
	r.reads <- len(r.calls)
	return events, state, err
}

// Observe reads a running record another process writes again only once
// its poll interval has passed on the timer Runs takes, and not before.
func TestObserveReadsAgainOnlyOnceTheIntervalHasPassed(t *testing.T) {
	t.Parallel()
	const interval = 7 * time.Second
	reader := &pacedReader{
		readerSpy: readerSpy{
			batches: [][]run.Event{{{Seq: 1}}, {{Seq: 2}}},
			status:  []run.State{run.StateRunning, run.StateFinished},
		},
		reads: make(chan int, 2),
	}
	clock := clocktest.NewClock(time.Date(2026, 10, 3, 12, 0, 0, 0, time.UTC))
	runs := app.NewRuns(reader, unwritten{}, nil, clock.Timer, interval)
	observed := make(chan error, 1)
	go func() {
		observed <- runs.Observe(context.Background(), "r", 0, func(contract.Event) error { return nil })
	}()
	<-reader.reads
	clock.Started(interval)
	clock.Advance(interval - time.Nanosecond)
	select {
	case <-reader.reads:
		t.Fatal("read again before the interval had passed")
	default:
	}
	if clock.Pending() != 1 {
		t.Fatalf("the wait for the next read ended early: %d pending", clock.Pending())
	}
	clock.Advance(time.Nanosecond)
	if read := <-reader.reads; read != 2 {
		t.Fatalf("read %d", read)
	}
	if err := <-observed; err != nil {
		t.Fatal(err)
	}
	if clock.Pending() != 0 {
		t.Fatalf("the wait was not released: %d pending", clock.Pending())
	}
}

// Observe reads a running record this process writes again only once the
// run appends past the last event delivered, never on a timer: each event
// reaches the callback while the run is still going.
func TestObserveOfARunThisProcessWritesWaitsOnItsAppends(t *testing.T) {
	t.Parallel()
	reader := &pacedReader{
		readerSpy: readerSpy{
			batches: [][]run.Event{{{Seq: 1}}, {{Seq: 2}}, {}},
			status:  []run.State{run.StateRunning, run.StateRunning, run.StateFinished},
		},
		reads: make(chan int, 3),
	}
	appends := &appendsSpy{asks: make(chan int, 2), wakes: []chan struct{}{make(chan struct{}), make(chan struct{})}}
	runs := app.NewRuns(reader, appends, nil, noTimer(t), time.Second)
	delivered := make(chan int, 2)
	observed := make(chan error, 1)
	go func() {
		observed <- runs.Observe(context.Background(), "r", 0, func(event contract.Event) error {
			delivered <- event.Seq
			return nil
		})
	}()
	for i, wake := range appends.wakes {
		if read := <-reader.reads; read != i+1 {
			t.Fatalf("read %d, want %d", read, i+1)
		}
		if seq := <-delivered; seq != i+1 {
			t.Fatalf("delivered %d while running, want %d", seq, i+1)
		}
		if after := <-appends.asks; after != i+1 {
			t.Fatalf("asked for events after %d, want %d", after, i+1)
		}
		select {
		case <-reader.reads:
			t.Fatal("read again before the run appended")
		default:
		}
		close(wake)
	}
	if read := <-reader.reads; read != 3 {
		t.Fatalf("read %d", read)
	}
	if err := <-observed; err != nil {
		t.Fatal(err)
	}
}

// Waiting on a run this process writes ends with Observe's context.
func TestObserveOfARunThisProcessWritesEndsWithItsContext(t *testing.T) {
	t.Parallel()
	reader := &readerSpy{batches: [][]run.Event{{}}, status: []run.State{run.StateRunning}}
	appends := &appendsSpy{asks: make(chan int, 1), wakes: []chan struct{}{make(chan struct{})}}
	runs := app.NewRuns(reader, appends, nil, noTimer(t), time.Second)
	ctx, cancel := context.WithCancel(context.Background())
	observed := make(chan error, 1)
	go func() { observed <- runs.Observe(ctx, "r", 0, func(contract.Event) error { return nil }) }()
	<-appends.asks
	cancel()
	if err := <-observed; !errors.Is(err, context.Canceled) {
		t.Fatalf("observe: %v", err)
	}
}

// cancellerSpy is the role Runs cancels through; it takes effect for the
// runs it hosts.
type cancellerSpy struct {
	hosts     map[string]bool
	cancelled []string
}

func (s *cancellerSpy) Cancel(id string) bool {
	s.cancelled = append(s.cancelled, id)
	return s.hosts[id]
}

// Cancelling a run asks the canceller Runs declares; one it does not take
// effect for is refused as not running in this process.
func TestRunsCancelThroughTheCancellerTheyDeclare(t *testing.T) {
	t.Parallel()
	canceller := &cancellerSpy{hosts: map[string]bool{"live": true}}
	runs := app.NewRuns(nil, nil, canceller, nil, 0)
	if err := runs.Cancel(context.Background(), "live"); err != nil {
		t.Fatal(err)
	}
	var input *contract.InputError
	if err := runs.Cancel(context.Background(), "gone"); !errors.As(err, &input) || input.Message != "run gone is not running in this process" {
		t.Fatalf("cancelling a run not hosted: %v", err)
	}
	if want := []string{"live", "gone"}; !reflect.DeepEqual(canceller.cancelled, want) {
		t.Fatalf("cancelled %v, want %v", canceller.cancelled, want)
	}
}

func TestInspectShowsTheNodeResultAsRecorded(t *testing.T) {
	t.Parallel()
	cost, ms, tokens := 0.1, int64(5), int64(3)
	result := &run.Result{
		Status: run.Failed, Error: run.Fault(run.ClassBudgetExhausted, "limit"), Text: "t",
		Usage: &run.Usage{InputTokens: &tokens, ReasoningTokens: &tokens}, Cost: run.Cost{USD: &cost, Source: run.CostRuntime},
		Timing:    run.Timing{StartedAt: time.Unix(1, 0).UTC(), FinishedAt: time.Unix(2, 0).UTC(), WallMS: 1000, TurnMS: &ms, RuntimeMS: &ms},
		Artifacts: []run.Artifact{{Name: "changes.patch", Path: "artifacts/changes.patch", Digest: "sha256:x", Bytes: 1}},
		Session:   &run.Session{ProviderSessionID: "prov-1", Continues: "run-0"},
	}
	trail := &run.Trail{
		Touched: []run.Touched{{Path: "b.go", Tool: "Write"}, {Path: "a.go", Tool: "Edit"}},
		Denied:  []run.Denial{{Tool: "Write"}, {Tool: "Bash", Input: `{"command":"git push"}`}},
	}
	reader := &readerSpy{state: run.StateFinished, record: run.Record{ID: "r", Result: result, Turn: &run.Turn{StderrTail: "boom"}, Trail: trail}}
	view, err := (app.NewRuns(reader, nil, nil, nil, 0)).Inspect(context.Background(), "r")
	if err != nil || view.State != "finished" || view.StderrTail != "boom" || view.Dir != "/home/runs/r" {
		t.Fatalf("view = %+v, %v", view, err)
	}
	// The contract carries every field of the domain result.
	want, _ := json.Marshal(result)
	got, _ := json.Marshal(view.Result)
	if string(got) != string(want) {
		t.Fatalf("contract result\n%s\nwant\n%s", got, want)
	}
	// The record it carries, which `runs show` prints, holds the trail.
	var shown run.Record
	if err := json.Unmarshal(view.Record, &shown); err != nil || !reflect.DeepEqual(shown.Trail, trail) {
		t.Fatalf("trail of the record shown = %+v, %v\n%s", shown.Trail, err, view.Record)
	}
}

func TestAnAbandonedRunIsALostNode(t *testing.T) {
	t.Parallel()
	reader := &readerSpy{state: run.StateAbandoned, record: run.Record{ID: "r", CreatedAt: time.Unix(1, 0)}}
	view, err := (app.NewRuns(reader, nil, nil, nil, 0)).Inspect(context.Background(), "r")
	if err != nil || view.State != "abandoned" || view.Result == nil || view.Result.Status != "lost" || view.Result.Error.Class != "abandoned" || view.Result.Cost.Source != "unknown" {
		t.Fatalf("view = %+v, %v", view.Result, err)
	}
}

type writerSpy struct {
	writes  []string
	stored  []string // what each write stored, in order
	existed map[string]bool
}

func (s *writerSpy) Current(_ context.Context, kind document.Kind, name string) (string, string, error) {
	key := string(kind) + "/" + name
	if s.existed[key] {
		return key, "d-" + key, nil
	}
	return key, "", nil
}

// initNow and createNow approve their own plan, as a user typing yes does.
func initNow(settings *app.Settings, overwrite bool) (contract.InitResult, error) {
	plan, err := settings.Init(context.Background(), overwrite, nil)
	if err != nil {
		return plan, err
	}
	return settings.Init(context.Background(), overwrite, &plan)
}

func createNow(settings *app.Settings, spec contract.Agent, overwrite bool) (contract.AgentWrite, error) {
	plan, err := settings.CreateAgent(context.Background(), spec, overwrite, nil)
	if err != nil {
		return plan, err
	}
	return settings.CreateAgent(context.Background(), spec, overwrite, &plan)
}

func (s *writerSpy) Write(ctx context.Context, kind document.Kind, name string, data []byte, expected string) (string, bool, error) {
	s.writes = append(s.writes, string(kind)+"/"+name)
	s.stored = append(s.stored, string(data))
	key, current, _ := s.Current(ctx, kind, name)
	return key, current == expected, nil
}

func TestInitWritesEachExampleWithoutOverwriting(t *testing.T) {
	t.Parallel()
	writer := &writerSpy{existed: map[string]bool{"agents/a": true}}
	examples := fstest.MapFS{
		"service.toml":   {Data: []byte("x")},
		"agents/a.toml":  {Data: []byte("x")},
		"schemas/s.json": {Data: []byte("x")},
	}
	result, err := initNow(app.NewSettings(nil, writer, examples, nil, settingsCheckStub{}), false)
	if err != nil {
		t.Fatal(err)
	}
	// A kept file is not written at all.
	if !reflect.DeepEqual(writer.writes, []string{"schemas/s", "service/service"}) ||
		!reflect.DeepEqual(result.Kept, []string{"agents/a"}) || len(result.Created) != 2 {
		t.Fatalf("writes %v, result %+v", writer.writes, result)
	}
}

// A dry run reports what a real run would write and writes nothing; with
// overwrite, existing files are reported as replaced, not created.
func TestInitDryRunAndReplacement(t *testing.T) {
	t.Parallel()
	examples := fstest.MapFS{
		"service.toml":  {Data: []byte("x")},
		"agents/a.toml": {Data: []byte("x")},
	}
	for _, overwrite := range []bool{false, true} {
		writer := &writerSpy{existed: map[string]bool{"agents/a": true}}
		settings := app.NewSettings(nil, writer, examples, nil, settingsCheckStub{})
		plan, err := settings.Init(context.Background(), overwrite, nil)
		if err != nil || len(writer.writes) != 0 {
			t.Fatalf("overwrite %v: dry run wrote %v, %v", overwrite, writer.writes, err)
		}
		result, err := settings.Init(context.Background(), overwrite, &plan)
		if err != nil || !reflect.DeepEqual(plan, result) {
			t.Fatalf("overwrite %v: plan %+v, result %+v, %v", overwrite, plan, result, err)
		}
		digests := map[string]string{"agents/a": "d-agents/a", "service/service": ""}
		sum := sha256.Sum256([]byte("x"))
		contents := map[string]string{"agents/a": hex.EncodeToString(sum[:]), "service/service": hex.EncodeToString(sum[:])}
		want := contract.InitResult{Created: []string{"service/service"}, Kept: []string{"agents/a"}, Digests: digests, Contents: contents}
		if overwrite {
			want = contract.InitResult{Created: []string{"service/service"}, Replaced: []string{"agents/a"}, Digests: digests, Contents: contents}
		}
		if !reflect.DeepEqual(result, want) {
			t.Fatalf("overwrite %v: result %+v", overwrite, result)
		}
	}
}

// A write carries the plan the user approved: a file that changed since,
// including one created since, stops it before anything is written.
func TestWritesRefuseFilesChangedSinceTheApprovedPlan(t *testing.T) {
	t.Parallel()
	examples := fstest.MapFS{"service.toml": {Data: []byte("x")}, "agents/a.toml": {Data: []byte("x")}}
	writer := &writerSpy{existed: map[string]bool{}}
	settings := app.NewSettings(nil, writer, examples, nil, settingsCheckStub{})
	plan, err := settings.Init(context.Background(), true, nil)
	if err != nil {
		t.Fatal(err)
	}
	writer.existed["agents/a"] = true // created while the user read the plan
	var input *contract.InputError
	if _, err := settings.Init(context.Background(), true, &plan); !errors.As(err, &input) || !strings.Contains(err.Error(), "changed since you confirmed") || len(writer.writes) != 0 {
		t.Fatalf("init: %v, writes %v", err, writer.writes)
	}

	h := newHarness()
	settings = app.NewSettings(h.defs, writer, nil, nil, settingsCheckStub{})
	agent, err := settings.CreateAgent(context.Background(), contract.Agent{Name: "b", Runtime: "rt"}, true, nil)
	if err != nil {
		t.Fatal(err)
	}
	writer.existed["agents/b"] = true
	if _, err := settings.CreateAgent(context.Background(), contract.Agent{Name: "b", Runtime: "rt"}, true, &agent); !errors.As(err, &input) || len(writer.writes) != 0 {
		t.Fatalf("agent: %v, writes %v", err, writer.writes)
	}
}

// An approval is for the plan shown: a request that now plans something
// else, such as another agent, other content, or replacing a file shown as
// kept, writes nothing.
func TestWritesRefuseAnythingButTheApprovedPlan(t *testing.T) {
	t.Parallel()
	examples := fstest.MapFS{"service.toml": {Data: []byte("x")}, "agents/a.toml": {Data: []byte("x")}}
	writer := &writerSpy{existed: map[string]bool{"agents/a": true}}
	settings := app.NewSettings(nil, writer, examples, nil, settingsCheckStub{})
	keep, err := settings.Init(context.Background(), false, nil)
	if err != nil {
		t.Fatal(err)
	}
	var input *contract.InputError
	if _, err := settings.Init(context.Background(), true, &keep); !errors.As(err, &input) || !strings.Contains(err.Error(), "not the plan you confirmed, so nothing was written: agents/a") || len(writer.writes) != 0 {
		t.Fatalf("init: %v, writes %v", err, writer.writes)
	}

	examples["service.toml"] = &fstest.MapFile{Data: []byte("different")}
	create, err := settings.Init(context.Background(), false, nil)
	if err != nil {
		t.Fatal(err)
	}
	examples["service.toml"] = &fstest.MapFile{Data: []byte("changed after the preview")}
	if _, err := settings.Init(context.Background(), false, &create); !errors.As(err, &input) || !strings.Contains(err.Error(), "not the plan you confirmed, so nothing was written: service/service") || len(writer.writes) != 0 {
		t.Fatalf("init content: %v, writes %v", err, writer.writes)
	}

	h := newHarness()
	settings = app.NewSettings(h.defs, writer, nil, nil, settingsCheckStub{})
	plan, err := settings.CreateAgent(context.Background(), contract.Agent{Name: "b", Runtime: "rt"}, false, nil)
	if err != nil {
		t.Fatal(err)
	}
	for _, other := range []contract.Agent{{Name: "b", Runtime: "rt", Model: "other"}, {Name: "c", Runtime: "rt"}} {
		if _, err := settings.CreateAgent(context.Background(), other, false, &plan); !errors.As(err, &input) || !strings.Contains(err.Error(), "not the plan you confirmed") || len(writer.writes) != 0 {
			t.Fatalf("agent %+v: %v, writes %v", other, err, writer.writes)
		}
	}
}

func TestInitSkipsHiddenFilesAndRejectsStrayRootFiles(t *testing.T) {
	t.Parallel()
	writer := &writerSpy{}
	examples := fstest.MapFS{
		".DS_Store":        {Data: []byte("Bud1")},
		"agents/.DS_Store": {Data: []byte("Bud1")},
		"agents/a.toml":    {Data: []byte("x")},
		"service.toml":     {Data: []byte("x")},
	}
	if _, err := initNow(app.NewSettings(nil, writer, examples, nil, settingsCheckStub{}), false); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(writer.writes, []string{"agents/a", "service/service"}) {
		t.Fatalf("writes %v", writer.writes)
	}
	stray := fstest.MapFS{"notes.txt": {Data: []byte("x")}}
	if _, err := initNow(app.NewSettings(nil, &writerSpy{}, stray, nil, settingsCheckStub{}), false); err == nil {
		t.Fatal("a stray root file was accepted")
	}
}

// A dry run validates and reports a replacement without writing; the real
// run writes and reports the same.
func TestCreateAgentDryRun(t *testing.T) {
	t.Parallel()
	h := newHarness()
	writer := &writerSpy{existed: map[string]bool{"agents/b": true}}
	settings := app.NewSettings(h.defs, writer, nil, nil, settingsCheckStub{})
	spec := contract.Agent{Name: "b", Runtime: "rt"}
	var input *contract.InputError
	if _, err := settings.CreateAgent(context.Background(), spec, false, nil); !errors.As(err, &input) {
		t.Fatalf("existing without overwrite: %v", err)
	}
	if _, err := settings.CreateAgent(context.Background(), contract.Agent{Name: "b", Runtime: "nope"}, true, nil); !errors.As(err, &input) {
		t.Fatalf("invalid in a dry run: %v", err)
	}
	plan, err := settings.CreateAgent(context.Background(), spec, true, nil)
	if err != nil || plan.Content == "" || plan != (contract.AgentWrite{Path: "agents/b", Replaces: true, Digest: "d-agents/b", Content: plan.Content}) || len(writer.writes) != 0 {
		t.Fatalf("plan %+v, writes %v, %v", plan, writer.writes, err)
	}
	if written, err := settings.CreateAgent(context.Background(), spec, true, &plan); err != nil || written != plan || !reflect.DeepEqual(writer.writes, []string{"agents/b"}) {
		t.Fatalf("written %+v, writes %v, %v", written, writer.writes, err)
	}
}

// The agent is written as its settings document: the schema, then each
// value the request gives, in the document's order, and no key for one it
// does not give. The plan's content is the digest of those bytes.
func TestCreateAgentWritesTheAgentAsItsSettingsDocument(t *testing.T) {
	t.Parallel()
	for name, c := range map[string]struct {
		spec contract.Agent
		want string
	}{
		"every value": {
			spec: contract.Agent{Name: "b", Runtime: "rt", Model: "m1", ModelFamily: "fam", Effort: "high", Command: "/bin/spy"},
			want: "schema = \"agister.agent/v1alpha1\"\nname = \"b\"\nruntime = \"rt\"\nmodel = \"m1\"\nmodel_family = \"fam\"\n" +
				"effort = \"high\"\ncommand = \"/bin/spy\"\n",
		},
		"only what is required": {
			spec: contract.Agent{Name: "b", Runtime: "rt"},
			want: "schema = \"agister.agent/v1alpha1\"\nname = \"b\"\nruntime = \"rt\"\n",
		},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			writer := &writerSpy{}
			settings := app.NewSettings(newHarness().defs, writer, nil, nil, settingsCheckStub{})
			written, err := createNow(settings, c.spec, false)
			if err != nil || !reflect.DeepEqual(writer.writes, []string{"agents/b"}) || !reflect.DeepEqual(writer.stored, []string{c.want}) {
				t.Fatalf("writes %v stored %q, %v; want %q", writer.writes, writer.stored, err, c.want)
			}
			sum := sha256.Sum256([]byte(c.want))
			if want := (contract.AgentWrite{Path: "agents/b", Content: hex.EncodeToString(sum[:])}); written != want {
				t.Fatalf("written = %+v, want %+v", written, want)
			}
		})
	}
}

// narrowRuntime is a runtime mapping an agent can use alone, but on which
// process p cannot run: its one primitive grants state-reaching host.read.
const narrowRuntime = `schema: agister.runtime/v1alpha1
name: narrow
adapter: spy
contract: spy/1
efforts: [high]
primitives:
  select: one
  items:
    Bash: {grants: [process.execute, repository.read, host.read], verified: ["1."]}
`

// An agent that is valid alone but breaks the settings is refused before
// anything is written or asked; problems it did not add do not block it.
func TestCreateAgentKeepsSettingsValid(t *testing.T) {
	t.Parallel()
	h := newHarness()
	h.defs.docs[document.KindRuntime]["narrow"] = narrowRuntime
	writer := &writerSpy{existed: map[string]bool{"agents/a": true}}
	checker := app.NewChecker(h.defs, h.validator, h.runtimes, []string{"git.revision", "git.diff"})
	settings := app.NewSettings(h.defs, writer, nil, []app.Scope{{Name: "global settings", Check: checker}}, settingsCheckStub{})
	var input *contract.InputError
	for _, approved := range []*contract.AgentWrite{nil, {Path: "agents/a", Replaces: true, Digest: "d-agents/a"}} {
		// Process p uses agent a, and cannot run on runtime narrow.
		_, err := settings.CreateAgent(context.Background(), contract.Agent{Name: "a", Runtime: "narrow"}, true, approved)
		if !errors.As(err, &input) || !strings.Contains(err.Error(), "agent a would break the global settings") || !strings.Contains(err.Error(), "cannot run on agent a's runtime narrow") {
			t.Fatalf("approved %v: %v", approved, err)
		}
	}
	if len(writer.writes) != 0 {
		t.Fatalf("writes = %v", writer.writes)
	}
	if _, err := createNow(settings, contract.Agent{Name: "a", Runtime: "rt", ModelFamily: "other"}, true); err != nil {
		t.Fatalf("valid replacement: %v", err)
	}
	h.defs.docs[document.KindAgent]["broken"] = "schema = \"agister.agent/v1alpha1\"\nname = \"broken\"\n"
	if _, err := createNow(settings, contract.Agent{Name: "c", Runtime: "rt"}, false); err != nil {
		t.Fatalf("an existing problem blocked a valid new agent: %v", err)
	}
}

func TestCreateAgentValidatesAgainstTheRuntimeMapping(t *testing.T) {
	t.Parallel()
	h := newHarness()
	writer := &writerSpy{}
	settings := app.NewSettings(h.defs, writer, nil, nil, settingsCheckStub{})
	var input *contract.InputError
	if _, err := createNow(settings, contract.Agent{Name: "b", Runtime: "nope"}, false); !errors.As(err, &input) {
		t.Fatalf("unknown runtime: %v", err)
	}
	if _, err := createNow(settings, contract.Agent{Name: "b", Runtime: "rt", Effort: "max"}, false); !errors.As(err, &input) {
		t.Fatalf("unsupported effort: %v", err)
	}
	if len(writer.writes) != 0 {
		t.Fatal("invalid agents were written")
	}
	if _, err := createNow(settings, contract.Agent{Name: "b", Runtime: "rt", Effort: "high"}, false); err != nil || !reflect.DeepEqual(writer.writes, []string{"agents/b"}) {
		t.Fatalf("writes %v, %v", writer.writes, err)
	}
}

// A process view says where each definition comes from as data, not text.
func TestShowProcessSourcesAreStructured(t *testing.T) {
	t.Parallel()
	h := newHarness()
	// The resolver behind it is given nothing that can start a turn.
	identities := struct{ app.ResolverIdentities }{h.runtimes}
	view, err := callShown((app.NewInspection(app.NewResolver(h.defs, identities, h.validator, resolverCheckStub{}))), "p_a")
	if err != nil {
		t.Fatal(err)
	}
	want := contract.DefinitionOrigin{
		Kind: "processes", Name: "p", Layer: "home", Path: "mem/processes/p",
		Layers: []contract.DefinitionLayer{{Layer: "home", Path: "mem/processes/p"}},
	}
	if len(view.Sources) < 2 || !reflect.DeepEqual(view.Sources[1], want) {
		t.Fatalf("sources = %+v", view.Sources)
	}
	if len(h.runtimes.asked) != 0 || len(h.runner.calls()) != 0 {
		t.Fatalf("showing a process built runners %v and ran turns %v", h.runtimes.asked, h.runner.calls())
	}
}

// A process view shows the limits the resolver composes for the process:
// its own timeout and permissions, and what its runtime grants of them.
func TestShowProcessLimitsThroughTheResolver(t *testing.T) {
	t.Parallel()
	h := newHarness()
	identities := struct{ app.ResolverIdentities }{h.runtimes}
	view, err := callShown(app.NewInspection(app.NewResolver(h.defs, identities, h.validator, resolverCheckStub{})), "p_a")
	if err != nil {
		t.Fatal(err)
	}
	if view.Timeout != 20*time.Minute {
		t.Fatalf("timeout = %v", view.Timeout)
	}
	if want := []string{"repository.read", "repository.search", "repository.diff"}; !reflect.DeepEqual(view.Permissions, want) {
		t.Fatalf("permissions = %v, want %v", view.Permissions, want)
	}
	// Read and Grep grant repository.read and repository.search; Bash,
	// which would grant repository.diff, also grants what is not allowed.
	if want := []string{"Read", "Grep"}; !reflect.DeepEqual(view.Primitives, want) {
		t.Fatalf("primitives = %v, want %v", view.Primitives, want)
	}
	if want := []string{"repository.diff"}; !reflect.DeepEqual(view.Withheld, want) {
		t.Fatalf("withheld = %v, want %v", view.Withheld, want)
	}
}

// Inspection shows what the InspectionResolver it declares resolves: a
// process, which no caller gives an agent, and a workflow with each node's
// process on the agent the node binds.
func TestInspectionShowsThroughTheResolverItDeclares(t *testing.T) {
	t.Parallel()
	cost := 0.5
	source := func(kind document.Kind, name string) app.InspectedSource {
		return app.InspectedSource{Kind: string(kind), Name: name, Layer: "project", Path: "/project/" + string(kind) + "/" + name}
	}
	origin := func(kind document.Kind, name string) contract.DefinitionOrigin {
		return contract.DefinitionOrigin{Kind: string(kind), Name: name, Layer: "project", Path: "/project/" + string(kind) + "/" + name}
	}
	review := &app.InspectedProcess{
		Process: app.InspectedDefinition{
			Name:         "review",
			Params:       []app.InspectedParam{{Name: "diff"}},
			Values:       []app.InspectedValue{{Name: "diff", Source: "param"}},
			OutputFormat: "json", OutputSchema: "s",
			Verify: &app.InspectedVerify{Command: "go test ./...", Timeout: time.Minute, MaxAttempts: 2, Instruction: "fix it"},
		},
		Agent:   "b",
		Runtime: "rt",
		Effective: app.InspectedLimits{
			Timeout: 5 * time.Minute, MaxAttempts: 2, MaxCostUSD: &cost,
			Allow: []string{"repository.read", "repository.diff"}, Deny: []string{"repository.diff"}, Permissions: []string{"repository.read"},
			Access: "read", Scope: "repository",
		},
		Primitives: []string{"Read"}, Withheld: []string{"repository.search"},
		Sources: []app.InspectedSource{source(document.KindAgent, "b"), source(document.KindProcess, "review")},
	}
	summarize := &app.InspectedProcess{
		Process: app.InspectedDefinition{
			Name:         "summarize",
			Values:       []app.InspectedValue{{Name: "findings", Source: input.CollectionSource}},
			OutputFormat: "text",
		},
		Agent:   "a",
		Runtime: "rt",
	}
	resolver := &inspectionDouble{
		processes: map[string]*app.InspectedProcess{"review": review, "summarize": summarize},
		workflow: &app.InspectedWorkflow{
			Workflow: app.InspectedWorkflowDefinition{
				Name:   "w",
				Params: []app.InspectedParam{{Name: "base", Default: "main", HasDefault: true}},
				Values: []app.InspectedValue{{Name: "diff", Source: "git.diff"}},
				FanOut: []app.InspectedNode{{Name: "n1", Process: "review", Agent: "b"}},
				Join:   app.InspectedNode{Name: "j", Process: "summarize"},
			},
			NodeProcesses: map[string]app.InspectedNodeProcess{
				"review":    {Params: []string{"diff"}},
				"summarize": {Collects: []string{"findings"}},
			},
			Sources: []app.InspectedSource{source(document.KindWorkflow, "w")},
		},
	}
	inspection := app.NewInspection(resolver)

	reviewView := contract.ProcessView{
		Name: "review", Agent: "b", Runtime: "rt",
		Params: []contract.Param{{Name: "diff", Required: true}}, Inputs: []string{"diff <- param"},
		Output: "json:s", Timeout: 5 * time.Minute, MaxAttempts: 2, MaxCostUSD: &cost,
		Allowed: []string{"repository.read", "repository.diff"}, Denied: []string{"repository.diff"}, Permissions: []string{"repository.read"},
		Access: "read", Scope: "repository",
		Primitives: []string{"Read"}, Withheld: []string{"repository.search"},
		Verify:   &contract.Verify{Command: "go test ./...", Timeout: time.Minute, MaxAttempts: 2, Instruction: "fix it"},
		Warnings: []string{app.VerifyWarning},
		Sources:  []contract.DefinitionOrigin{origin(document.KindAgent, "b"), origin(document.KindProcess, "review")},
	}
	view, err := inspection.ShowProcess(context.Background(), "review")
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(view, reviewView) {
		t.Fatalf("process view\n got %+v\nwant %+v", view, reviewView)
	}
	if want := []string{"process review"}; !reflect.DeepEqual(resolver.asked, want) {
		t.Fatalf("asked %v, want %v", resolver.asked, want)
	}

	resolver.asked = nil
	workflowView, err := inspection.ShowWorkflow(context.Background(), "w")
	if err != nil {
		t.Fatal(err)
	}
	want := contract.WorkflowView{
		Name:   "w",
		Params: []contract.Param{{Name: "base", Default: "main"}},
		Inputs: []string{"diff <- git.diff"},
		FanOut: []contract.WorkflowNode{{Name: "n1", Process: reviewView, Params: []string{"diff"}}},
		Join: contract.WorkflowNode{Name: "j", Process: contract.ProcessView{
			Name: "summarize", Agent: "a", Runtime: "rt", Output: "text", Inputs: []string{"findings <- " + input.CollectionSource},
		}},
		Collection: "findings",
		Warnings:   []string{"node n1: " + app.VerifyWarning},
		Sources:    []contract.DefinitionOrigin{origin(document.KindWorkflow, "w")},
	}
	if !reflect.DeepEqual(workflowView, want) {
		t.Fatalf("workflow view\n got %+v\nwant %+v", workflowView, want)
	}
	// Each node's process is resolved as its node's call, on the agent the
	// node binds (ADR-030 rule 5), no longer as the process on its own: n1
	// names b, the join none.
	if want := []string{"workflow w", "node n1 review|b", "node j summarize|"}; !reflect.DeepEqual(resolver.asked, want) {
		t.Fatalf("asked %v, want %v", resolver.asked, want)
	}
}

// inspectionDouble is an InspectionResolver that is not a Resolver: it
// gives the resolutions it was set up with, and records what it was asked.
type inspectionDouble struct {
	processes map[string]*app.InspectedProcess
	workflow  *app.InspectedWorkflow
	// "process <name>", "node <node> <process>|<agent>" or
	// "workflow <name>"
	asked []string
}

func (d *inspectionDouble) InspectProcess(_ context.Context, name string) (*app.InspectedProcess, error) {
	d.asked = append(d.asked, "process "+name)
	return d.process(name)
}

func (d *inspectionDouble) InspectNode(_ context.Context, node app.InspectedNode) (*app.InspectedProcess, error) {
	d.asked = append(d.asked, "node "+node.Name+" "+node.Process+"|"+node.Agent)
	return d.process(node.Process)
}

func (d *inspectionDouble) process(name string) (*app.InspectedProcess, error) {
	if res, ok := d.processes[name]; ok {
		return res, nil
	}
	return &app.InspectedProcess{}, &app.Refusal{Reason: "no process " + name}
}

func (d *inspectionDouble) InspectWorkflow(_ context.Context, name string) (*app.InspectedWorkflow, bool, error) {
	d.asked = append(d.asked, "workflow "+name)
	if d.workflow == nil || d.workflow.Workflow.Name != name {
		return nil, false, nil
	}
	return d.workflow, true, nil
}

// proposedCheckSpy reports scripted problems and records what it was asked.
type proposedCheckSpy struct {
	added []string
	docs  []document.Document
}

func (s *proposedCheckSpy) ProblemsAdded(_ context.Context, doc document.Document) ([]string, error) {
	s.docs = append(s.docs, doc)
	return s.added, nil
}

// Settings asks every scope about the agent as it would be written, and the
// first scope it would break refuses the write, by name.
func TestCreateAgentAsksEveryScope(t *testing.T) {
	t.Parallel()
	h := newHarness()
	writer := &writerSpy{}
	global, project := &proposedCheckSpy{}, &proposedCheckSpy{added: []string{"agent b: bad"}}
	settings := app.NewSettings(h.defs, writer, nil, []app.Scope{{Name: "global settings", Check: global}, {Name: "project settings", Check: project}}, settingsCheckStub{})
	var input *contract.InputError
	if _, err := settings.CreateAgent(context.Background(), contract.Agent{Name: "b", Runtime: "rt"}, false, nil); !errors.As(err, &input) || !strings.Contains(err.Error(), "agent b would break the project settings") || !strings.Contains(err.Error(), "agent b: bad") {
		t.Fatalf("err = %v", err)
	}
	for _, spy := range []*proposedCheckSpy{global, project} {
		if len(spy.docs) != 1 || spy.docs[0].Source.Kind != document.KindAgent || spy.docs[0].Source.Name != "b" || spy.docs[0].Source.Path != "agents/b" || !strings.Contains(string(spy.docs[0].Bytes), `name = "b"`) {
			t.Fatalf("asked about %+v", spy.docs)
		}
	}
	project.added = nil
	if _, err := createNow(settings, contract.Agent{Name: "b", Runtime: "rt"}, false); err != nil || !reflect.DeepEqual(writer.writes, []string{"agents/b"}) {
		t.Fatalf("writes %v, %v", writer.writes, err)
	}
}
