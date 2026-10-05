package app_test

import (
	"context"
	"encoding/json"
	"fmt"
	"reflect"
	"slices"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/contract"
	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

// Workflow tests (ADR-003, ADR-004). Every node is a real call through Calls, over
// spies: a runner whose turns block on channels the test closes, so what
// runs concurrently and in which order is decided by the test, never by
// timing. A hang is the test binary's -timeout to report.

func nodeProcess(name, instruction string) string {
	return `schema: agister.process/v1alpha1
name: ` + name + `
type: process
uses: agent:a
policy: process-policy:pol
input:
  instruction: ` + instruction + `
  params:
    base: {default: main}
    candidate: {default: HEAD}
  values:
    candidate_revision: {source: git.revision, rev: "${param.candidate}"}
    diff: {source: git.diff, base: "${param.base}", head: "${value.candidate_revision}"}
workspace:
  checkout: candidate_revision
output:
  format: json
  schema: s
  require_valid: true
`
}

const joinProcess = `schema: agister.process/v1alpha1
name: joiner
type: process
uses: agent:a
policy: process-policy:joining
input:
  instruction: Join them.
  values:
    gathered: {source: workflow.collection}
    guide: {source: file, path: guide.md}
output:
  format: json
  schema: s
  require_valid: true
`

const workflowDoc = `schema: agister.workflow/v1alpha1
name: w
type: workflow
input:
  params:
    base: {default: main}
    candidate: {}
  values:
    base: {source: git.revision, rev: "${param.base}"}
    candidate: {source: git.revision, rev: "${param.candidate}"}
fan_out:
  - {node: one, uses: process:first}
  - {node: two, uses: process:second}
join: {node: merge, uses: process:joiner}
`

func workflowDocs() map[definition.Kind]map[string]string {
	docs := settingsDocs()
	docs[definition.KindProcess] = map[string]string{
		"first":  nodeProcess("first", "Work as first."),
		"second": nodeProcess("second", "Work as second."),
		"joiner": joinProcess,
	}
	docs[definition.KindPolicy]["joining"] = `schema: agister.process-policy/v1alpha1
name: joining
timeout: 10m
tools: {allow: [repository.read]}
workspace: {access: read-only, scope: repository}
`
	docs[definition.KindWorkflow] = map[string]string{"w": workflowDoc}
	return docs
}

// script is how one process's turns go.
type script struct {
	turn run.Turn
	// started is closed when a turn starts; release, when set, holds the
	// turn until it is closed or the call is cancelled.
	started chan struct{}
	release chan struct{}
}

// nodeRunner runs every node's turns, by the process's instruction.
type nodeRunner struct {
	mu       sync.Mutex
	scripts  map[string]*script // by instruction
	requests map[string][]app.TurnRequest
	// before, when set, runs as a turn starts, with its instruction.
	before func(instruction string)
	// skills: the adapter gives a call its skills (ADR-021 rule 6).
	skills bool
}

func (r *nodeRunner) Identity(context.Context) (app.RuntimeIdentity, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	return app.RuntimeIdentity{Contract: "spy/1", Version: "1.2.3", Resume: true, CostLimit: true, Skills: r.skills}, nil
}

func (*nodeRunner) Admit(app.TurnStart) *run.Error { return nil }

func (r *nodeRunner) RunTurn(ctx context.Context, request app.TurnRequest, sink app.EventSink) run.Turn {
	instruction, _, _ := strings.Cut(request.Instruction, "\n")
	r.mu.Lock()
	r.requests[instruction] = append(r.requests[instruction], request)
	s := r.scripts[instruction]
	before := r.before
	r.mu.Unlock()
	if before != nil {
		before(instruction)
	}
	if err := sink.ProcessStarted("ref-" + instruction); err != nil {
		return run.Turn{Status: run.Failed, Error: run.Fault(run.ClassInternal, "%v", err)}
	}
	if s == nil {
		return run.Turn{Status: run.Failed, Error: run.Fault(run.ClassRuntimeError, "no script for %q", instruction)}
	}
	if s.started != nil {
		close(s.started)
	}
	if s.release != nil {
		select {
		case <-s.release:
		case <-ctx.Done():
			return run.Turn{Status: run.Interrupted, Error: run.Fault(run.ClassCancelled, "")}
		}
	}
	return s.turn
}

func (r *nodeRunner) turns(instruction string) []app.TurnRequest {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]app.TurnRequest(nil), r.requests[instruction]...)
}

// nodeRuntimes serves the one runner.
type nodeRuntimes struct{ runner *nodeRunner }

func (n nodeRuntimes) Runner(string, string) (app.TurnRunner, error) { return n.runner, nil }
func (n nodeRuntimes) Adapters() []string                            { return []string{"spy"} }
func (n nodeRuntimes) Identity(ctx context.Context, _, _ string) (app.RuntimeIdentity, error) {
	return n.runner.Identity(ctx)
}

// okValidator accepts every schema and output, from any goroutine.
type okValidator struct{}

func (okValidator) Compile([]byte) error                   { return nil }
func (okValidator) Validate([]byte, json.RawMessage) error { return nil }

// seqIDs numbers runs in the order they are recorded.
type seqIDs struct {
	mu sync.Mutex
	n  int
}

func (s *seqIDs) RunID(time.Time) string {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.n++
	return fmt.Sprintf("run-%d", s.n)
}

// storeSpy records every run apart.
type storeSpy struct {
	mu    sync.Mutex
	runs  map[string]*runSpy
	order []string
	// onFinish, when set, runs as a run finishes, before its record is
	// kept; onArtifact as an artifact is stored.
	onFinish   func(record run.Record)
	onArtifact func(id, name string)
	// onEvent, when set, runs after an event is appended to a run.
	onEvent func(id string, event run.Event)
	// failCreate, when set, is asked, by its node's name, whether creating a
	// node's run fails, before anything is recorded.
	failCreate func(node string) error
	// failFinish, when set, is asked, by its node's name, whether saving a
	// node's final record fails; the record kept is then the last one
	// saved before it.
	failFinish func(node string) error
}

type runSpy struct {
	store     *storeSpy
	mu        sync.Mutex
	record    run.Record
	events    []run.Event
	artifacts map[string][]byte
	done      chan struct{}
}

func newStoreSpy() *storeSpy { return &storeSpy{runs: map[string]*runSpy{}} }

func (s *storeSpy) Create(_ context.Context, record run.Record) (app.RunHandle, error) {
	if s.failCreate != nil && record.Parent != nil {
		if err := s.failCreate(record.Parent.Node); err != nil {
			return nil, err
		}
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	handle := s.entry(record.ID)
	handle.mu.Lock()
	handle.record = record
	handle.mu.Unlock()
	s.order = append(s.order, record.ID)
	return handle, nil
}

// entry is the run's, made on first use so a test can wait for a run not
// yet created.
func (s *storeSpy) entry(id string) *runSpy {
	handle, ok := s.runs[id]
	if !ok {
		handle = &runSpy{store: s, artifacts: map[string][]byte{}, done: make(chan struct{})}
		s.runs[id] = handle
	}
	return handle
}

func (s *storeSpy) ids() []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]string(nil), s.order...)
}

func (s *storeSpy) handle(t *testing.T, id string) *runSpy {
	t.Helper()
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.entry(id)
}

// wait returns the run's record once it finished.
func (s *storeSpy) wait(t *testing.T, id string) run.Record {
	t.Helper()
	handle := s.handle(t, id)
	<-handle.done
	handle.mu.Lock()
	defer handle.mu.Unlock()
	return handle.record
}

func (r *runSpy) Append(event run.Event) error {
	r.mu.Lock()
	event.Seq = len(r.events) + 1
	r.events = append(r.events, event)
	id := r.record.ID
	r.mu.Unlock()
	if hook := r.store.onEvent; hook != nil {
		hook(id, event)
	}
	return nil
}

// nodeFinished is closed once the workflow run id records node's end.
func (s *storeSpy) nodeFinished(id, node string) chan struct{} {
	finished := make(chan struct{})
	var once sync.Once
	s.onEvent = func(run string, event run.Event) {
		if run == id && event.Kind == "NODE_FINISHED" && event.Data["node"] == node {
			once.Do(func() { close(finished) })
		}
	}
	return finished
}

func (r *runSpy) Raw(string) error { return nil }

func (r *runSpy) Update(record run.Record) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.record = record
	return nil
}

func (r *runSpy) Artifact(name string, data []byte) (run.Artifact, error) {
	if hook := r.store.onArtifact; hook != nil {
		hook(r.record.ID, name)
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	r.artifacts[name] = data
	return run.Artifact{Name: name, Path: "artifacts/" + name, Digest: "sha256:spy", Bytes: int64(len(data))}, nil
}

func (r *runSpy) Finish(record run.Record) error {
	if hook := r.store.onFinish; hook != nil {
		hook(record)
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	defer close(r.done)
	if fail := r.store.failFinish; fail != nil && record.Parent != nil {
		if err := fail(record.Parent.Node); err != nil {
			return err
		}
	}
	r.record = record
	return nil
}

func (r *runSpy) kinds() []string {
	r.mu.Lock()
	defer r.mu.Unlock()
	var kinds []string
	for _, event := range r.events {
		kinds = append(kinds, event.Kind)
	}
	return kinds
}

// flowHarness runs workflows over spies.
type flowHarness struct {
	defs       *definitionsSpy
	runner     *nodeRunner
	inputs     *inputsSpy
	workspaces *workspacesSpy
	store      *storeSpy
	hosted     *app.Hosted
	calls      *app.Calls

	mu       sync.Mutex
	resolved map[string]int // how often each symbolic revision was resolved
}

func completed(output string, cost float64, tokens int64) run.Turn {
	return run.Turn{Status: run.Completed, Output: json.RawMessage(output), ProviderSessionID: "prov", CostUSD: &cost, Usage: &run.Usage{InputTokens: &tokens}}
}

func newFlowHarness() *flowHarness {
	h := &flowHarness{
		defs: &definitionsSpy{docs: workflowDocs()},
		runner: &nodeRunner{
			scripts: map[string]*script{
				"Work as first.":  {turn: completed(`{"from":"first"}`, 0.1, 1)},
				"Work as second.": {turn: completed(`{"from":"second"}`, 0.2, 2)},
				"Join them.":      {turn: completed(`{"joined":true}`, 0.3, 3)},
			},
			requests: map[string][]app.TurnRequest{},
		},
		workspaces: &workspacesSpy{root: "/repo", dir: "/work/checkout"},
		store:      newStoreSpy(),
		hosted:     app.NewHosted(),
		resolved:   map[string]int{},
	}
	// A symbolic revision names the next commit each time it is resolved,
	// so resolving it twice would show; a commit names itself.
	commits := 0
	h.inputs = &inputsSpy{respond: func(spec app.InputSpec) (app.Resolved, error) {
		switch spec.Source {
		case "git.revision":
			rev := spec.Args["rev"]
			if strings.HasPrefix(rev, "sha-") {
				return app.Resolved{Value: rev, Identity: rev, Revision: true}, nil
			}
			h.mu.Lock()
			h.resolved[rev]++
			commits++
			commit := fmt.Sprintf("sha-%s-%d", rev, commits)
			h.mu.Unlock()
			return app.Resolved{Value: commit, Identity: commit, Revision: true}, nil
		case "git.diff":
			text := "diff " + spec.Args["base"] + ".." + spec.Args["head"]
			return app.Resolved{Value: text, Identity: "sha256:" + sha(text)}, nil
		case "file":
			if spec.Args["path"] == "missing.md" {
				return app.Resolved{}, fmt.Errorf("no such file")
			}
			return app.Resolved{Value: "the guide", Identity: "sha256:guide"}, nil
		}
		return app.Resolved{}, fmt.Errorf("no source %s", spec.Source)
	}}
	runtimes := nodeRuntimes{runner: h.runner}
	changes := &changesSpy{}
	h.calls = app.NewCalls(
		app.NewResolver(h.defs, runtimes, okValidator{}, resolverCheckStub{}), runtimes,
		map[string]app.InputProvider{"git.revision": h.inputs, "git.diff": h.inputs, "file": h.inputs},
		h.workspaces, changes, app.NewPreparer(changes, &setupCommandsSpy{}, fixedClock{}), app.NewVerifier(changes, &copiesSpy{}, &commandsSpy{}, fixedClock{}), okValidator{}, h.store,
		&runsSpy{records: map[string]run.Record{}, states: map[string]run.State{}},
		fixedClock{}, unfired, &seqIDs{}, "/state", h.hosted,
	)
	return h
}

func (h *flowHarness) script(instruction string) *script { return h.runner.scripts[instruction] }

func (h *flowHarness) submit(t *testing.T, request contract.CallRequest) string {
	t.Helper()
	if request.Process == "" {
		request.Process = "w"
	}
	if request.Cwd == "" {
		request.Cwd = "/repo"
	}
	if request.Params == nil {
		request.Params = map[string]string{"candidate": "HEAD"}
	}
	id, err := h.calls.Submit(context.Background(), request)
	if err != nil {
		t.Fatal(err)
	}
	return id
}

// stopOnCleanup cancels the workflow id when the test ends, however it
// ends, and waits for it to finish, so a failure leaves no node or workflow
// running. A workflow that already finished refuses the cancel.
func (h *flowHarness) stopOnCleanup(t *testing.T, id string) {
	t.Cleanup(func() {
		_ = app.NewRuns(nil, nil, h.hosted, nil, 0).Cancel(context.Background(), id)
		<-h.store.handle(t, id).done
	})
}

func (h *flowHarness) cancel(t *testing.T, id string) {
	t.Helper()
	if err := app.NewRuns(nil, nil, h.hosted, nil, 0).Cancel(context.Background(), id); err != nil {
		t.Fatal(err)
	}
}

// collection is the join's collection input as the join run recorded it.
func collectionOf(t *testing.T, join run.Record) []map[string]any {
	t.Helper()
	for _, input := range join.Inputs {
		if input.Name == "gathered" {
			var entries []map[string]any
			if err := json.Unmarshal([]byte(input.Value.(string)), &entries); err != nil {
				t.Fatalf("collection %v: %v", input.Value, err)
			}
			return entries
		}
	}
	t.Fatalf("the join has no collection input: %+v", join.Inputs)
	return nil
}

// Two fan-out nodes, then the join, which receives both outputs once each,
// in declaration order; the workflow's result is the join's, with usage and
// cost summed over every node.
func TestWorkflowJoinReceivesEveryFanOutOutputOnce(t *testing.T) {
	t.Parallel()
	h := newFlowHarness()
	id := h.submit(t, contract.CallRequest{})
	record := h.store.wait(t, id)

	result := record.Result
	if result.Status != run.Completed || result.Error != nil || string(result.Output) != `{"joined":true}` {
		t.Fatalf("result = %+v", result)
	}
	if result.Cost.Source != run.CostRuntime || result.Cost.USD == nil || *result.Cost.USD < 0.599 || *result.Cost.USD > 0.601 {
		t.Fatalf("cost = %+v, want 0.6 from every node", result.Cost)
	}
	if result.Usage == nil || result.Usage.InputTokens == nil || *result.Usage.InputTokens != 6 {
		t.Fatalf("usage = %+v, want 6 input tokens from every node", result.Usage)
	}
	if !result.Timing.FinishedAt.Equal(fixedClock{}.Now()) || result.Session != nil || len(result.Artifacts) != 0 {
		t.Fatalf("result = %+v", result)
	}
	if got := h.store.ids(); !reflect.DeepEqual(got, []string{"run-1", "run-2", "run-3", "run-4"}) {
		t.Fatalf("runs = %v", got)
	}

	join := h.store.wait(t, "run-4")
	entries := collectionOf(t, join)
	want := []map[string]any{
		{"node": "one", "process": "first", "run": "run-2", "status": "completed", "output": map[string]any{"from": "first"}},
		{"node": "two", "process": "second", "run": "run-3", "status": "completed", "output": map[string]any{"from": "second"}},
	}
	if !reflect.DeepEqual(entries, want) {
		t.Fatalf("collection = %v", entries)
	}
	// The join's turn received that collection, each output once.
	turns := h.runner.turns("Join them.")
	if len(turns) != 1 {
		t.Fatalf("join turns = %d", len(turns))
	}
	for _, output := range []string{`"from": "first"`, `"from": "second"`} {
		if n := strings.Count(turns[0].Prompt, output); n != 1 {
			t.Fatalf("the join's prompt has %s %d times:\n%s", output, n, turns[0].Prompt)
		}
	}
	// It was stored with the workflow run, as the join received it.
	stored := h.store.handle(t, id).artifacts["collection.json"]
	if record.Workflow.Collection == nil || string(stored) != join.Inputs[0].Value {
		t.Fatalf("collection artifact %+v: %s", record.Workflow.Collection, stored)
	}
}

// The collection follows declaration order, whatever order the fan-out
// nodes complete in.
func TestWorkflowCollectionOrderIgnoresCompletionOrder(t *testing.T) {
	t.Parallel()
	h := newFlowHarness()
	first := h.script("Work as first.")
	first.release = make(chan struct{})
	twoFinished := h.store.nodeFinished("run-1", "two")
	id := h.submit(t, contract.CallRequest{})
	h.stopOnCleanup(t, id)

	// Two completes, and the workflow records it, while one is held; then
	// one is released.
	<-twoFinished // the workflow recording node two's end
	if two := h.store.wait(t, "run-3"); two.Result.Status != run.Completed {
		t.Fatalf("two = %+v", two.Result)
	}
	close(first.release)
	record := h.store.wait(t, id)
	if record.Result.Status != run.Completed {
		t.Fatalf("result = %+v", record.Result)
	}
	var finished []string
	h.store.handle(t, id).mu.Lock()
	for _, event := range h.store.handle(t, id).events {
		if event.Kind == "NODE_FINISHED" && event.Data["node"] != "merge" {
			finished = append(finished, event.Data["node"].(string))
		}
	}
	h.store.handle(t, id).mu.Unlock()
	if !reflect.DeepEqual(finished, []string{"two", "one"}) {
		t.Fatalf("fan-out nodes finished in order %v, want two then one", finished)
	}
	var nodes []string
	for _, entry := range collectionOf(t, h.store.wait(t, "run-4")) {
		nodes = append(nodes, entry["node"].(string))
	}
	if !reflect.DeepEqual(nodes, []string{"one", "two"}) {
		t.Fatalf("collection order = %v", nodes)
	}
}

// The workflow's values are resolved once, before any node starts, and each
// fan-out node gets the same commit as its param; the join gets none.
func TestWorkflowResolvesValuesOnceForEveryFanOutNode(t *testing.T) {
	t.Parallel()
	h := newFlowHarness()
	id := h.submit(t, contract.CallRequest{Params: map[string]string{"candidate": "HEAD"}})
	record := h.store.wait(t, id)
	if record.Result.Status != run.Completed {
		t.Fatalf("result = %+v", record.Result)
	}
	h.mu.Lock()
	resolved := map[string]int{"HEAD": h.resolved["HEAD"], "main": h.resolved["main"]}
	h.mu.Unlock()
	if !reflect.DeepEqual(resolved, map[string]int{"HEAD": 1, "main": 1}) {
		t.Fatalf("symbolic revisions resolved %v times, want once each", resolved)
	}
	identities := map[string]string{}
	for _, input := range record.Inputs {
		identities[input.Name] = input.Identity
	}
	candidate, base := identities["candidate"], identities["base"]
	if !strings.HasPrefix(candidate, "sha-HEAD-") || !strings.HasPrefix(base, "sha-main-") {
		t.Fatalf("workflow inputs = %+v", record.Inputs)
	}
	for _, id := range []string{"run-2", "run-3"} {
		node := h.store.wait(t, id)
		if want := map[string]string{"base": base, "candidate": candidate}; !reflect.DeepEqual(node.Request.Params, want) {
			t.Fatalf("%s params = %v, want %v", id, node.Request.Params, want)
		}
		if node.Inputs[0].Name != "candidate_revision" || node.Inputs[0].Identity != candidate {
			t.Fatalf("%s inputs = %+v", id, node.Inputs)
		}
	}
	h.workspaces.mu.Lock()
	checkouts := append([][2]string(nil), h.workspaces.checkouts...)
	h.workspaces.mu.Unlock()
	if !reflect.DeepEqual(checkouts, [][2]string{{"/repo", candidate}, {"/repo", candidate}}) {
		t.Fatalf("checkouts = %v", checkouts)
	}
	if join := h.store.wait(t, "run-4"); len(join.Request.Params) != 0 {
		t.Fatalf("the join was given params %v", join.Request.Params)
	}
}

// The join starts only once every fan-out node has ended: not while one is
// still running, and when it starts, every fan-out run is finished.
func TestWorkflowJoinWaitsForTheBarrier(t *testing.T) {
	t.Parallel()
	h := newFlowHarness()
	first := h.script("Work as first.")
	first.release = make(chan struct{})
	var unfinished []string
	h.runner.before = func(instruction string) {
		if instruction != "Join them." {
			return
		}
		for _, id := range []string{"run-2", "run-3"} {
			select {
			case <-h.store.handle(t, id).done:
			default:
				unfinished = append(unfinished, id)
			}
		}
	}
	id := h.submit(t, contract.CallRequest{})
	h.store.wait(t, "run-3")
	// One is still held: no join run and no join turn.
	if got := h.store.ids(); len(got) != 3 || len(h.runner.turns("Join them.")) != 0 {
		t.Fatalf("before the barrier: runs %v, join turns %d", got, len(h.runner.turns("Join them.")))
	}
	if state := func() string {
		handle := h.store.handle(t, id)
		handle.mu.Lock()
		defer handle.mu.Unlock()
		return handle.record.Workflow.Barrier.State
	}(); state != run.BarrierWaiting {
		t.Fatalf("barrier = %s while one runs", state)
	}
	close(first.release)
	record := h.store.wait(t, id)
	if record.Result.Status != run.Completed || record.Workflow.Barrier.State != run.BarrierPassed {
		t.Fatalf("result %+v, barrier %+v", record.Result, record.Workflow.Barrier)
	}
	if len(unfinished) != 0 {
		t.Fatalf("the join started while %v had not finished", unfinished)
	}
}

// A fan-out node that did not complete does not keep the join from running
// on the one that did (ADR-004): the join receives the completed node's
// output and the other's status and class, with no output; the workflow's
// result is the join's, and its record names the node that did not
// complete.
func TestWorkflowJoinsWithoutAnUnsuccessfulNode(t *testing.T) {
	t.Parallel()
	for name, tc := range map[string]struct {
		prepare func(h *flowHarness)
		status  run.Status
		class   run.Class
	}{
		"refused": {
			prepare: func(h *flowHarness) {
				h.defs.set(definition.KindProcess, "second", strings.Replace(nodeProcess("second", "Work as second."),
					"workspace:", "    notes: {source: file, path: missing.md}\nworkspace:", 1))
			},
			status: run.Failed, class: run.ClassRefused,
		},
		"failed": {
			prepare: func(h *flowHarness) {
				h.script("Work as second.").turn = run.Turn{Status: run.Failed, Error: run.Fault(run.ClassRuntimeError, "boom"),
					Text: "second's unsuccessful text", Output: json.RawMessage(`{"from":"unsuccessful second"}`)}
			},
			status: run.Failed, class: run.ClassRuntimeError,
		},
		"interrupted": {
			prepare: func(h *flowHarness) {
				h.script("Work as second.").turn = run.Turn{Status: run.Interrupted, Error: run.Fault(run.ClassTimeout, "too slow"),
					Text: "second's unsuccessful text", Output: json.RawMessage(`{"from":"unsuccessful second"}`)}
			},
			status: run.Interrupted, class: run.ClassTimeout,
		},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			h := newFlowHarness()
			tc.prepare(h)
			id := h.submit(t, contract.CallRequest{})
			record := h.store.wait(t, id)
			if record.Result.Status != run.Completed || record.Result.Error != nil || string(record.Result.Output) != `{"joined":true}` {
				t.Fatalf("result = %+v, want the join's", record.Result)
			}
			if barrier := record.Workflow.Barrier; !reflect.DeepEqual(barrier, run.Barrier{State: run.BarrierPassed, Incomplete: []string{"two"}}) {
				t.Fatalf("barrier = %+v", barrier)
			}
			if two := record.Workflow.Nodes[1]; two.Run != "run-3" || two.Status != tc.status || two.Error.Class != tc.class {
				t.Fatalf("node two = %+v", two)
			}
			want := []map[string]any{
				{"node": "one", "process": "first", "run": "run-2", "status": "completed", "output": map[string]any{"from": "first"}},
				{"node": "two", "process": "second", "run": "run-3", "status": string(tc.status), "class": string(tc.class)},
			}
			if entries := collectionOf(t, h.store.wait(t, "run-4")); !reflect.DeepEqual(entries, want) {
				t.Fatalf("collection = %v", entries)
			}
			// What the unsuccessful node's turn produced, which its own record
			// keeps, does not reach the join.
			prompt := h.runner.turns("Join them.")[0].Prompt
			for _, content := range []string{"second's unsuccessful text", "unsuccessful second"} {
				if strings.Contains(prompt, content) {
					t.Fatalf("the join's prompt carries %q:\n%s", content, prompt)
				}
			}
		})
	}
}

// Of five fan-out nodes, one fails, one is rate-limited and one times out,
// all before the first ends, while the other two complete: the join
// receives the completed outputs and each other node's status and class, in
// declaration order, and the workflow's record and events name the three.
func TestWorkflowJoinsOnTheNodesThatCompleted(t *testing.T) {
	t.Parallel()
	h := newFlowHarness()
	h.defs.set(definition.KindWorkflow, "w", strings.Replace(workflowDoc, "  - {node: two, uses: process:second}\n",
		"  - {node: two, uses: process:second}\n  - {node: three, uses: process:third}\n  - {node: four, uses: process:fourth}\n  - {node: five, uses: process:fifth}\n", 1))
	for _, name := range []string{"third", "fourth", "fifth"} {
		h.defs.set(definition.KindProcess, name, nodeProcess(name, "Work as "+name+"."))
	}
	h.script("Work as second.").turn = run.Turn{Status: run.Failed, Error: run.Fault(run.ClassRuntimeError, "boom"), Text: "second's text", Output: json.RawMessage(`{"from":"second"}`)}
	h.runner.scripts["Work as third."] = &script{turn: run.Turn{Status: run.Failed, Error: run.Fault(run.ClassRateLimited, "slow down"), Text: "third's text"}}
	h.runner.scripts["Work as fourth."] = &script{turn: run.Turn{Status: run.Interrupted, Error: run.Fault(run.ClassTimeout, "too slow"), Text: "fourth's text", Output: json.RawMessage(`{"from":"fourth"}`)}}
	h.runner.scripts["Work as fifth."] = &script{turn: completed(`{"from":"fifth"}`, 0.5, 5)}
	// The first node ends last.
	first := h.script("Work as first.")
	first.release = make(chan struct{})
	id := h.submit(t, contract.CallRequest{})
	h.stopOnCleanup(t, id)
	for _, node := range []string{"run-3", "run-4", "run-5", "run-6"} {
		h.store.wait(t, node)
	}
	close(first.release)
	record := h.store.wait(t, id)

	if record.Result.Status != run.Completed || record.Result.Error != nil || string(record.Result.Output) != `{"joined":true}` {
		t.Fatalf("result = %+v, want the join's", record.Result)
	}
	incomplete := []string{"two", "three", "four"}
	if barrier := record.Workflow.Barrier; !reflect.DeepEqual(barrier, run.Barrier{State: run.BarrierPassed, Incomplete: incomplete}) {
		t.Fatalf("barrier = %+v", barrier)
	}
	handle := h.store.handle(t, id)
	var barrierEvent map[string]any
	handle.mu.Lock()
	for _, event := range handle.events {
		if event.Kind == "BARRIER" {
			barrierEvent = event.Data
		}
	}
	handle.mu.Unlock()
	if !reflect.DeepEqual(barrierEvent, map[string]any{"state": run.BarrierPassed, "incomplete": incomplete}) {
		t.Fatalf("barrier event = %v", barrierEvent)
	}
	if join := record.Workflow.Nodes[5]; !join.Join || join.Run != "run-7" || join.Status != run.Completed {
		t.Fatalf("join node = %+v", join)
	}
	want := []map[string]any{
		{"node": "one", "process": "first", "run": "run-2", "status": "completed", "output": map[string]any{"from": "first"}},
		{"node": "two", "process": "second", "run": "run-3", "status": "failed", "class": "runtime_error"},
		{"node": "three", "process": "third", "run": "run-4", "status": "failed", "class": "rate_limited"},
		{"node": "four", "process": "fourth", "run": "run-5", "status": "interrupted", "class": "timeout"},
		{"node": "five", "process": "fifth", "run": "run-6", "status": "completed", "output": map[string]any{"from": "fifth"}},
	}
	if entries := collectionOf(t, h.store.wait(t, "run-7")); !reflect.DeepEqual(entries, want) {
		t.Fatalf("collection = %v", entries)
	}
	// Cost is unknown when a node's is.
	if record.Result.Cost.Source != run.CostUnknown || record.Result.Cost.USD != nil {
		t.Fatalf("cost = %+v", record.Result.Cost)
	}
}

// When no fan-out node completed, no join starts, and the workflow takes the
// status and class of the first node in declaration order, even when it
// ends last; the record names every node.
func TestWorkflowNoJoinWhenNoNodeCompleted(t *testing.T) {
	t.Parallel()
	h := newFlowHarness()
	first := h.script("Work as first.")
	first.turn = run.Turn{Status: run.Failed, Error: run.Fault(run.ClassRateLimited, "slow down")}
	first.release = make(chan struct{})
	h.script("Work as second.").turn = run.Turn{Status: run.Interrupted, Error: run.Fault(run.ClassTimeout, "too slow")}
	id := h.submit(t, contract.CallRequest{})
	h.stopOnCleanup(t, id)
	h.store.wait(t, "run-3")
	close(first.release)
	record := h.store.wait(t, id)
	if record.Result.Status != run.Failed || class(record) != run.ClassRateLimited || !strings.Contains(message(record), "fan-out node one (run run-2)") {
		t.Fatalf("result = %+v", record.Result)
	}
	if barrier := record.Workflow.Barrier; !reflect.DeepEqual(barrier, run.Barrier{State: run.BarrierBlocked, BlockedBy: "one", Incomplete: []string{"one", "two"}}) {
		t.Fatalf("barrier = %+v", barrier)
	}
	join := record.Workflow.Nodes[2]
	if join.Run != "" || join.Status != "" || len(h.runner.turns("Join them.")) != 0 || len(h.store.ids()) != 3 || record.Workflow.Collection != nil {
		t.Fatalf("a join ran: node %+v, runs %v", join, h.store.ids())
	}
	// Output is only a completed join's.
	if len(record.Result.Output) != 0 {
		t.Fatalf("output = %s", record.Result.Output)
	}
}

// threeNodes makes the workflow fan out to three nodes, the third a process
// of its own.
func threeNodes(h *flowHarness) {
	h.defs.set(definition.KindWorkflow, "w", strings.Replace(workflowDoc, "  - {node: two, uses: process:second}\n",
		"  - {node: two, uses: process:second}\n  - {node: three, uses: process:third}\n", 1))
	h.defs.set(definition.KindProcess, "third", nodeProcess("third", "Work as third."))
	h.runner.scripts["Work as third."] = &script{turn: completed(`{"from":"third"}`, 0.3, 3)}
}

// failCreating makes recording the named node's run fail.
func failCreating(h *flowHarness, node string) {
	h.store.failCreate = func(name string) error {
		if name == node {
			return fmt.Errorf("the disk is full")
		}
		return nil
	}
}

// Of three fan-out nodes, the first completes, the second's run cannot be
// recorded, and the third therefore never starts: the workflow records the
// third failed, internal, with no run, and the join runs once, on the first,
// receiving the other two's status and class with no run and no output.
func TestWorkflowJoinsWithoutNodesThatNeverStarted(t *testing.T) {
	t.Parallel()
	h := newFlowHarness()
	threeNodes(h)
	failCreating(h, "two")
	id := h.submit(t, contract.CallRequest{})
	record := h.store.wait(t, id)

	if record.Result.Status != run.Completed || record.Result.Error != nil || string(record.Result.Output) != `{"joined":true}` {
		t.Fatalf("result = %+v, want the join's", record.Result)
	}
	incomplete := []string{"two", "three"}
	if barrier := record.Workflow.Barrier; !reflect.DeepEqual(barrier, run.Barrier{State: run.BarrierPassed, Incomplete: incomplete}) {
		t.Fatalf("barrier = %+v", barrier)
	}
	nodes := record.Workflow.Nodes
	if one := nodes[0]; one.Run != "run-2" || one.Status != run.Completed || one.Error != nil {
		t.Fatalf("node one = %+v", one)
	}
	if two := nodes[1]; two.Run != "" || two.Status != run.Failed || two.Error == nil || two.Error.Class != run.ClassInternal ||
		!strings.Contains(two.Error.Message, "its run could not be recorded: the disk is full") {
		t.Fatalf("node two = %+v", two)
	}
	if three := nodes[2]; three.Run != "" || three.Status != run.Failed ||
		!reflect.DeepEqual(three.Error, run.Fault(run.ClassInternal, "it did not start: an earlier node could not")) {
		t.Fatalf("node three = %+v", three)
	}
	// Run-3 was the id given to two's run, which was never recorded; the
	// join is the only run after it.
	if got := h.store.ids(); !reflect.DeepEqual(got, []string{"run-1", "run-2", "run-4"}) {
		t.Fatalf("runs = %v", got)
	}
	if join := nodes[3]; !join.Join || join.Run != "run-4" || join.Status != run.Completed || len(h.runner.turns("Join them.")) != 1 {
		t.Fatalf("join node = %+v, join turns %d", join, len(h.runner.turns("Join them.")))
	}
	if n := len(h.runner.turns("Work as second.")) + len(h.runner.turns("Work as third.")); n != 0 {
		t.Fatalf("%d turns ran for nodes that never started", n)
	}
	want := []map[string]any{
		{"node": "one", "process": "first", "run": "run-2", "status": "completed", "output": map[string]any{"from": "first"}},
		{"node": "two", "process": "second", "status": "failed", "class": "internal"},
		{"node": "three", "process": "third", "status": "failed", "class": "internal"},
	}
	if entries := collectionOf(t, h.store.wait(t, "run-4")); !reflect.DeepEqual(entries, want) {
		t.Fatalf("collection = %v", entries)
	}
	var kinds []string
	for _, kind := range h.store.handle(t, id).kinds() {
		if strings.HasPrefix(kind, "NODE_") {
			kinds = append(kinds, kind)
		}
	}
	if want := []string{"NODE_STARTED", "NODE_NOT_STARTED", "NODE_FINISHED", "NODE_STARTED", "NODE_FINISHED"}; !reflect.DeepEqual(kinds, want) {
		t.Fatalf("node events = %v, want %v", kinds, want)
	}
}

// failFinishing makes saving the named nodes' final records fail.
func failFinishing(h *flowHarness, nodes ...string) {
	h.store.failFinish = func(name string) error {
		if slices.Contains(nodes, name) {
			return fmt.Errorf("the run directory is read-only")
		}
		return nil
	}
}

// A fan-out node that completed but whose final record could not be saved
// did not complete: the workflow records it failed, internal, with its run,
// and the join runs without its output, on the node that did complete.
func TestWorkflowJoinsWithoutANodeWhoseFinalRecordWasNotSaved(t *testing.T) {
	t.Parallel()
	h := newFlowHarness()
	failFinishing(h, "two")
	id := h.submit(t, contract.CallRequest{})
	record := h.store.wait(t, id)

	if record.Result.Status != run.Completed || record.Result.Error != nil || string(record.Result.Output) != `{"joined":true}` {
		t.Fatalf("result = %+v, want the join's", record.Result)
	}
	if barrier := record.Workflow.Barrier; !reflect.DeepEqual(barrier, run.Barrier{State: run.BarrierPassed, Incomplete: []string{"two"}}) {
		t.Fatalf("barrier = %+v", barrier)
	}
	if two := record.Workflow.Nodes[1]; two.Run != "run-3" || two.Status != run.Failed || two.Error == nil || two.Error.Class != run.ClassInternal ||
		!strings.Contains(two.Error.Message, "its final record could not be saved: the run directory is read-only; it would have ended completed") {
		t.Fatalf("node two = %+v", two)
	}
	// The record kept is two's last before it finished.
	if kept := h.store.wait(t, "run-3"); kept.FinishedAt != nil || kept.Result != nil {
		t.Fatalf("node two's record = %+v, want its last unfinished one", kept)
	}
	want := []map[string]any{
		{"node": "one", "process": "first", "run": "run-2", "status": "completed", "output": map[string]any{"from": "first"}},
		{"node": "two", "process": "second", "run": "run-3", "status": "failed", "class": "internal"},
	}
	if entries := collectionOf(t, h.store.wait(t, "run-4")); !reflect.DeepEqual(entries, want) {
		t.Fatalf("collection = %v", entries)
	}
	// What two spent still counts.
	if record.Result.Cost.USD == nil || *record.Result.Cost.USD < 0.599 || *record.Result.Cost.USD > 0.601 {
		t.Fatalf("cost = %+v, want every node's", record.Result.Cost)
	}
}

// When no fan-out node's final record was saved, none completed: the barrier
// blocks, no join starts, and the workflow fails, internal.
func TestWorkflowNoJoinWhenNoNodesFinalRecordWasSaved(t *testing.T) {
	t.Parallel()
	h := newFlowHarness()
	failFinishing(h, "one", "two")
	id := h.submit(t, contract.CallRequest{})
	record := h.store.wait(t, id)

	if record.Result.Status != run.Failed || class(record) != run.ClassInternal ||
		!strings.Contains(message(record), "fan-out node one (run run-2)") || !strings.Contains(message(record), "its final record could not be saved") {
		t.Fatalf("result = %+v", record.Result)
	}
	if barrier := record.Workflow.Barrier; !reflect.DeepEqual(barrier, run.Barrier{State: run.BarrierBlocked, BlockedBy: "one", Incomplete: []string{"one", "two"}}) {
		t.Fatalf("barrier = %+v", barrier)
	}
	if join := record.Workflow.Nodes[2]; join.Run != "" || len(h.runner.turns("Join them.")) != 0 || record.Workflow.Collection != nil {
		t.Fatalf("a join ran: node %+v, runs %v", join, h.store.ids())
	}
}

// A join whose final record could not be saved did not complete: the
// workflow fails, internal, with no output.
func TestWorkflowFailsWhenTheJoinsFinalRecordWasNotSaved(t *testing.T) {
	t.Parallel()
	h := newFlowHarness()
	failFinishing(h, "merge")
	id := h.submit(t, contract.CallRequest{})
	record := h.store.wait(t, id)

	if record.Result.Status != run.Failed || class(record) != run.ClassInternal || len(record.Result.Output) != 0 ||
		!strings.Contains(message(record), "its final record could not be saved") {
		t.Fatalf("result = %+v", record.Result)
	}
	if join := record.Workflow.Nodes[2]; join.Run != "run-4" || join.Status != run.Failed || join.Error == nil || join.Error.Class != run.ClassInternal {
		t.Fatalf("join node = %+v", join)
	}
}

// When the first fan-out node's run cannot be recorded, no later node
// starts, each is recorded failed, internal, as one that did not start, and
// no join starts: the workflow takes the first node's status and class.
func TestWorkflowNoJoinWhenTheFirstNodeCannotStart(t *testing.T) {
	t.Parallel()
	h := newFlowHarness()
	threeNodes(h)
	failCreating(h, "one")
	id := h.submit(t, contract.CallRequest{})
	record := h.store.wait(t, id)

	if record.Result.Status != run.Failed || class(record) != run.ClassInternal ||
		!strings.Contains(message(record), "fan-out node one (run none): internal: its run could not be recorded: the disk is full") {
		t.Fatalf("result = %+v", record.Result)
	}
	if barrier := record.Workflow.Barrier; !reflect.DeepEqual(barrier, run.Barrier{State: run.BarrierBlocked, BlockedBy: "one", Incomplete: []string{"one", "two", "three"}}) {
		t.Fatalf("barrier = %+v", barrier)
	}
	for _, node := range record.Workflow.Nodes[1:3] {
		if node.Run != "" || node.Status != run.Failed ||
			!reflect.DeepEqual(node.Error, run.Fault(run.ClassInternal, "it did not start: an earlier node could not")) {
			t.Fatalf("node %s = %+v", node.Name, node)
		}
	}
	join := record.Workflow.Nodes[3]
	if join.Run != "" || join.Status != "" || len(h.runner.turns("Join them.")) != 0 || record.Workflow.Collection != nil {
		t.Fatalf("a join ran: node %+v", join)
	}
	if got := h.store.ids(); !reflect.DeepEqual(got, []string{"run-1"}) {
		t.Fatalf("runs = %v", got)
	}
}

// The join receives the collection and the fixed values its own process
// declares, and nothing from the caller: no param, no workflow value.
func TestWorkflowJoinReceivesNothingButTheCollection(t *testing.T) {
	t.Parallel()
	h := newFlowHarness()
	id := h.submit(t, contract.CallRequest{Params: map[string]string{"base": "trunk", "candidate": "HEAD"}})
	record := h.store.wait(t, id)
	if record.Result.Status != run.Completed {
		t.Fatalf("result = %+v", record.Result)
	}
	join := h.store.wait(t, "run-4")
	var names []string
	for _, input := range join.Inputs {
		names = append(names, input.Name+"<-"+input.Source)
	}
	if !reflect.DeepEqual(names, []string{"gathered<-workflow.collection", "guide<-file"}) || len(join.Request.Params) != 0 {
		t.Fatalf("join inputs %v, params %v", names, join.Request.Params)
	}
	if join.Parent == nil || join.Parent.Node != "merge" || join.Request.Continue != "" || join.Result.Session.Continues != "" {
		t.Fatalf("join record = %+v", join)
	}
	// Its fixed file input was resolved with no param at all.
	h.inputs.mu.Lock()
	for _, spec := range h.inputs.specs {
		if spec.Source == "file" && len(spec.Params) != 0 {
			t.Errorf("the join's file input saw params %v", spec.Params)
		}
	}
	h.inputs.mu.Unlock()
	// Nothing the caller gave, nor any value resolved from it, reaches the
	// join's turn.
	prompt := h.runner.turns("Join them.")[0].Prompt
	for _, value := range record.Inputs {
		if strings.Contains(prompt, value.Identity) {
			t.Fatalf("the join's prompt carries workflow input %s (%s):\n%s", value.Name, value.Identity, prompt)
		}
	}
	if strings.Contains(prompt, "trunk") {
		t.Fatalf("the join's prompt carries a caller param:\n%s", prompt)
	}
}

// A caller cannot give a workflow an agent, limits or a run to continue:
// the workflow is refused and no node starts.
func TestWorkflowRefusesCallerOverrides(t *testing.T) {
	t.Parallel()
	limit := 1.0
	for name, request := range map[string]contract.CallRequest{
		"agent":    {Agent: "a"},
		"timeout":  {Timeout: "1m"},
		"cost":     {MaxCostUSD: &limit},
		"continue": {Continue: "run-0"},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			h := newFlowHarness()
			id := h.submit(t, request)
			record := h.store.wait(t, id)
			if class(record) != run.ClassRefused || !strings.Contains(message(record), "takes params only") || len(h.store.ids()) != 1 {
				t.Fatalf("result %+v, runs %v", record.Result, h.store.ids())
			}
		})
	}
}

// A workflow whose join cannot receive the collection is refused before
// any node starts, even where no check ran first.
func TestWorkflowWithAnInvalidJoinIsRefused(t *testing.T) {
	t.Parallel()
	h := newFlowHarness()
	h.defs.set(definition.KindWorkflow, "w", strings.Replace(workflowDoc, "process:joiner", "process:first", 1))
	id := h.submit(t, contract.CallRequest{})
	record := h.store.wait(t, id)
	if class(record) != run.ClassRefused || !strings.Contains(message(record), "cannot receive the collection") || len(h.store.ids()) != 1 {
		t.Fatalf("result %+v, runs %v", record.Result, h.store.ids())
	}
	if len(record.Definitions) != 1 || record.Definitions[0].Kind != "workflows" || record.Definitions[0].SHA256 != sha(strings.Replace(workflowDoc, "process:joiner", "process:first", 1)) {
		t.Fatalf("definitions = %+v", record.Definitions)
	}
}

// A process that takes the collection, called on its own, is refused: only
// a join is given one.
func TestCollectionInputOutsideAJoinIsRefused(t *testing.T) {
	t.Parallel()
	h := newFlowHarness()
	id := h.submit(t, contract.CallRequest{Process: "joiner", Params: map[string]string{}})
	record := h.store.wait(t, id)
	if class(record) != run.ClassRefused || !strings.Contains(message(record), "workflow.collection is given only to a workflow's join") {
		t.Fatalf("result = %+v", record.Result)
	}
	if len(h.runner.turns("Join them.")) != 0 {
		t.Fatal("the process ran")
	}
}

// Cancelled once every fan-out node completed, before the join starts: the
// join never starts, and the workflow ends interrupted, cancelled.
func TestWorkflowCancelledBeforeTheJoinStarts(t *testing.T) {
	t.Parallel()
	// Each arms a cancellation of the workflow run-1, before it is submitted.
	for name, arm := range map[string]func(h *flowHarness, t *testing.T){
		// As the last fan-out node (two, held until one finished) finishes.
		"at the last fan-out node's end": func(h *flowHarness, t *testing.T) {
			h.store.onFinish = func(record run.Record) {
				if record.ID == "run-3" {
					h.cancel(t, "run-1")
				}
			}
		},
		// As the last fan-out node (two, held until one finished)
		// finishes, when one did not complete: still no join.
		"at the last fan-out node's end, after one failed": func(h *flowHarness, t *testing.T) {
			h.script("Work as first.").turn = run.Turn{Status: run.Failed, Error: run.Fault(run.ClassRuntimeError, "boom")}
			h.store.onFinish = func(record run.Record) {
				if record.ID == "run-3" {
					h.cancel(t, "run-1")
				}
			}
		},
		// After the barrier passed, as the collection is stored.
		"after the barrier passed": func(h *flowHarness, t *testing.T) {
			h.store.onArtifact = func(_, name string) {
				if name == "collection.json" {
					h.cancel(t, "run-1")
				}
			}
		},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			h := newFlowHarness()
			hold := make(chan struct{})
			h.script("Work as second.").release = hold
			arm(h, t)
			id := h.submit(t, contract.CallRequest{})
			h.store.wait(t, "run-2")
			close(hold)
			record := h.store.wait(t, id)
			if record.Result.Status != run.Interrupted || class(record) != run.ClassCancelled {
				t.Fatalf("result = %+v", record.Result)
			}
			if two := record.Workflow.Nodes[1]; two.Status != run.Completed {
				t.Fatalf("fan-out node %+v did not complete", two)
			}
			if join := record.Workflow.Nodes[2]; join.Run != "" || len(h.runner.turns("Join them.")) != 0 || len(h.store.ids()) != 3 {
				t.Fatalf("the join started: %+v, runs %v", join, h.store.ids())
			}
			if record.Workflow.Barrier.State != run.BarrierCancelled {
				t.Fatalf("barrier = %+v", record.Workflow.Barrier)
			}
		})
	}
}

// Cancelled while fan-out nodes run: each is cancelled, no join starts, and
// the workflow ends interrupted, cancelled, its nodes' workspaces released.
func TestWorkflowCancelledDuringFanOut(t *testing.T) {
	t.Parallel()
	h := newFlowHarness()
	for _, instruction := range []string{"Work as first.", "Work as second."} {
		s := h.script(instruction)
		s.started, s.release = make(chan struct{}), make(chan struct{})
	}
	id := h.submit(t, contract.CallRequest{})
	<-h.script("Work as first.").started  // the first node's turn
	<-h.script("Work as second.").started // the second node's turn
	h.cancel(t, id)
	record := h.store.wait(t, id)
	if record.Result.Status != run.Interrupted || class(record) != run.ClassCancelled || record.Workflow.Barrier.State != run.BarrierCancelled {
		t.Fatalf("result %+v, barrier %+v", record.Result, record.Workflow.Barrier)
	}
	for _, node := range record.Workflow.Nodes[:2] {
		if node.Status != run.Interrupted || node.Error.Class != run.ClassCancelled {
			t.Fatalf("node %+v", node)
		}
	}
	if len(h.store.ids()) != 3 || len(h.runner.turns("Join them.")) != 0 {
		t.Fatalf("runs %v", h.store.ids())
	}
	if released := h.workspaces.releases(); released != 2 {
		t.Fatalf("workspaces released %d, want 2", released)
	}
}

// Cancelled before any node starts: none does.
func TestWorkflowCancelledBeforeAnyNodeStarts(t *testing.T) {
	t.Parallel()
	h := newFlowHarness()
	respond := h.inputs.respond
	h.inputs.respond = func(spec app.InputSpec) (app.Resolved, error) {
		if spec.Args["rev"] == "HEAD" {
			h.cancel(t, "run-1")
		}
		return respond(spec)
	}
	id := h.submit(t, contract.CallRequest{})
	record := h.store.wait(t, id)
	if record.Result.Status != run.Interrupted || class(record) != run.ClassCancelled {
		t.Fatalf("result = %+v", record.Result)
	}
	if len(h.store.ids()) != 1 {
		t.Fatalf("nodes started after the cancellation: %v", h.store.ids())
	}
	for _, node := range record.Workflow.Nodes {
		if node.Run != "" {
			t.Fatalf("node %+v", node)
		}
	}
}

// The workflow run names each node's run, its definition and inputs with
// their digests; each node's run names the workflow run and its node.
func TestWorkflowRecordLinksParentAndChildren(t *testing.T) {
	t.Parallel()
	h := newFlowHarness()
	id := h.submit(t, contract.CallRequest{})
	record := h.store.wait(t, id)
	if record.Process != "w" || record.Parent != nil || record.Agent != "" {
		t.Fatalf("record = %+v", record)
	}
	if len(record.Definitions) != 1 || record.Definitions[0].Kind != "workflows" || record.Definitions[0].Name != "w" || record.Definitions[0].SHA256 != sha(workflowDoc) {
		t.Fatalf("definitions = %+v", record.Definitions)
	}
	if len(record.Inputs) != 2 || record.Inputs[0].Name != "base" || !record.Inputs[1].Revision {
		t.Fatalf("inputs = %+v", record.Inputs)
	}
	want := []run.Node{
		{Name: "one", Process: "first", Run: "run-2", Status: run.Completed},
		{Name: "two", Process: "second", Run: "run-3", Status: run.Completed},
		{Name: "merge", Process: "joiner", Join: true, Run: "run-4", Status: run.Completed},
	}
	if !reflect.DeepEqual(record.Workflow.Nodes, want) {
		t.Fatalf("nodes = %+v", record.Workflow.Nodes)
	}
	for _, node := range want {
		child := h.store.wait(t, node.Run)
		if child.Parent == nil || *child.Parent != (run.Parent{Run: id, Node: node.Name}) || child.Process != node.Process || child.Workflow != nil {
			t.Fatalf("%s: parent %+v, process %s", node.Run, child.Parent, child.Process)
		}
	}
	kinds := h.store.handle(t, id).kinds()
	sort.Strings(kinds[1:5]) // the fan-out nodes start and finish concurrently
	if strings.Join(kinds, " ") != "WORKFLOW_SUBMITTED NODE_FINISHED NODE_FINISHED NODE_STARTED NODE_STARTED BARRIER NODE_STARTED NODE_FINISHED WORKFLOW_FINISHED" {
		t.Fatalf("events = %v", kinds)
	}
}

// Each check rejection of ADR-003 rules 1 and 4, and what else keeps a
// workflow's nodes from running.
func TestCheckRejectsWorkflowsThatCannotRun(t *testing.T) {
	t.Parallel()
	joinWithParam := strings.Replace(joinProcess, "  values:\n", "  params:\n    extra: {default: x}\n  values:\n", 1)
	joinWithParamSource := strings.Replace(joinProcess, "  values:\n", "  params:\n    extra: {}\n  values:\n    extra: {source: param, name: extra}\n", 1)
	for name, tc := range map[string]struct {
		workflow string
		process  map[string]string
		want     string
	}{
		"valid": {workflow: workflowDoc},
		"no fan-out node": {
			workflow: strings.Replace(strings.Replace(workflowDoc, "  - {node: one, uses: process:first}\n  - {node: two, uses: process:second}\n", "", 1), "fan_out:\n", "fan_out: []\n", 1),
			want:     "workflow w: fan_out: must list at least one node",
		},
		"fan-out missing": {
			workflow: strings.Replace(strings.Replace(workflowDoc, "  - {node: one, uses: process:first}\n  - {node: two, uses: process:second}\n", "", 1), "fan_out:\n", "", 1),
			want:     "workflow w: fan_out: is required",
		},
		"missing node name": {
			workflow: strings.Replace(workflowDoc, "{node: two, uses: process:second}", "{uses: process:second}", 1),
			want:     "workflow w: fan_out[1].node: is required",
		},
		"missing join node name": {
			workflow: strings.Replace(workflowDoc, "{node: merge, uses: process:joiner}", "{uses: process:joiner}", 1),
			want:     "workflow w: join.node: is required",
		},
		"duplicate node name": {
			workflow: strings.Replace(workflowDoc, "{node: two,", "{node: one,", 1),
			want:     `workflow w: fan_out[1].node: duplicate node name "one" (also fan_out[0])`,
		},
		"join named like a fan-out node": {
			workflow: strings.Replace(workflowDoc, "{node: merge,", "{node: two,", 1),
			want:     `workflow w: join.node: duplicate node name "two" (also fan_out[1])`,
		},
		"unknown fan-out process": {
			workflow: strings.Replace(workflowDoc, "process:second", "process:nowhere", 1),
			want:     `workflow w: fan-out node two: process "nowhere" does not exist`,
		},
		"unknown join process": {
			workflow: strings.Replace(workflowDoc, "process:joiner", "process:nowhere", 1),
			want:     `workflow w: join node merge: process "nowhere" does not exist`,
		},
		"join cannot receive the collection": {
			workflow: strings.Replace(workflowDoc, "process:joiner", "process:first", 1),
			want:     "workflow w: join node merge: process first cannot receive the collection: it declares no input with source workflow.collection",
		},
		"join takes a caller param": {
			workflow: workflowDoc,
			process:  map[string]string{"joiner": joinWithParam},
			want:     "workflow w: join node merge: process joiner takes caller-supplied params (param extra); a join receives only the collection and fixed values",
		},
		"join takes a caller param through its source": {
			workflow: workflowDoc,
			process:  map[string]string{"joiner": joinWithParamSource},
			want:     "process joiner takes caller-supplied params (param extra, input extra (source param))",
		},
		"fan-out takes the collection": {
			workflow: strings.Replace(workflowDoc, "process:second", "process:joiner", 1),
			want:     "workflow w: fan-out node two: process joiner takes the collection (input gathered), which only a join receives",
		},
		"fan-out needs a param the workflow does not pass": {
			workflow: strings.Replace(workflowDoc, "    candidate: {source: git.revision, rev: \"${param.candidate}\"}\n", "", 1),
			process:  map[string]string{"first": strings.Replace(nodeProcess("first", "Work as first."), "candidate: {default: HEAD}", "candidate: {}", 1)},
			want:     "workflow w: fan-out node one: process first needs param candidate, which the workflow does not pass",
		},
		"a process of the same name": {
			workflow: workflowDoc,
			process:  map[string]string{"w": nodeProcess("w", "Work.")},
			want:     "workflow w: a process has the same name",
		},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			h := newFlowHarness()
			h.defs.set(definition.KindWorkflow, "w", tc.workflow)
			for process, text := range tc.process {
				h.defs.set(definition.KindProcess, process, text)
			}
			checker := app.NewChecker(h.defs, okValidator{}, nodeRuntimes{runner: h.runner}, []string{"git.revision", "git.diff", "file", "param"})
			report, err := checker.Check(context.Background(), false)
			if err != nil {
				t.Fatal(err)
			}
			joined := strings.Join(messages(report.Problems), "\n")
			if tc.want == "" {
				if len(messages(report.Problems)) != 0 {
					t.Fatalf("problems:\n%s", joined)
				}
				if report.Checked["workflows"] != 1 {
					t.Fatalf("checked = %v", report.Checked)
				}
				return
			}
			if !strings.Contains(joined, tc.want) {
				t.Fatalf("missing %q in:\n%s", tc.want, joined)
			}
		})
	}
}

// process show's workflow equivalent: the nodes, each process as a call of
// it would see it, what each receives, and where the workflow comes from.
func TestShowWorkflow(t *testing.T) {
	t.Parallel()
	h := newFlowHarness()
	inspection := app.NewInspection(app.NewResolver(h.defs, nodeRuntimes{runner: h.runner}, okValidator{}, resolverCheckStub{}))
	view, err := inspection.ShowWorkflow(context.Background(), "w")
	if err != nil {
		t.Fatal(err)
	}
	if view.Name != "w" || view.Refusal != "" || view.Collection != "gathered" ||
		!reflect.DeepEqual(view.Inputs, []string{"base <- git.revision", "candidate <- git.revision"}) ||
		!reflect.DeepEqual(view.Params, []contract.Param{{Name: "base", Default: "main"}, {Name: "candidate", Required: true}}) {
		t.Fatalf("view = %+v", view)
	}
	if len(view.FanOut) != 2 || view.FanOut[1].Name != "two" || view.FanOut[1].Process.Name != "second" || view.FanOut[1].Process.Agent != "a" ||
		!reflect.DeepEqual(view.FanOut[0].Params, []string{"base", "candidate"}) || view.Join.Name != "merge" || len(view.Join.Params) != 0 {
		t.Fatalf("nodes = %+v / %+v", view.FanOut, view.Join)
	}
	if len(view.Sources) != 1 || view.Sources[0].Kind != "workflows" {
		t.Fatalf("sources = %+v", view.Sources)
	}
	if _, err := inspection.ShowWorkflow(context.Background(), "nope"); err == nil {
		t.Fatal("an unknown workflow was shown")
	}
	h.defs.set(definition.KindWorkflow, "w", strings.Replace(workflowDoc, "process:joiner", "process:first", 1))
	if view, err := inspection.ShowWorkflow(context.Background(), "w"); err != nil || !strings.Contains(view.Refusal, "cannot receive the collection") {
		t.Fatalf("view %+v, %v", view, err)
	}
}

// A cancel that comes while the join finishes wins: the workflow ends
// interrupted, cancelled, though the join completed, and the join's run and
// node keep its own outcome. Once the workflow ended, a cancel is refused.
func TestWorkflowCancelledAsTheJoinFinishes(t *testing.T) {
	t.Parallel()
	h := newFlowHarness()
	var mu sync.Mutex
	var cancelErr error
	cancelled := false
	h.store.onFinish = func(record run.Record) {
		if record.ID != "run-4" {
			return
		}
		err := app.NewRuns(nil, nil, h.hosted, nil, 0).Cancel(context.Background(), "run-1")
		mu.Lock()
		cancelErr, cancelled = err, true
		mu.Unlock()
	}
	id := h.submit(t, contract.CallRequest{})
	record := h.store.wait(t, id)
	mu.Lock()
	if !cancelled || cancelErr != nil {
		t.Fatalf("the cancel as the join finished: made %v, %v", cancelled, cancelErr)
	}
	mu.Unlock()
	if record.Result.Status != run.Interrupted || class(record) != run.ClassCancelled || len(record.Result.Output) != 0 ||
		!strings.Contains(message(record), "it would have ended completed") {
		t.Fatalf("result = %+v", record.Result)
	}
	if join := record.Workflow.Nodes[2]; join.Run != "run-4" || join.Status != run.Completed || join.Error != nil {
		t.Fatalf("join node = %+v", join)
	}
	if join := h.store.wait(t, "run-4"); join.Result.Status != run.Completed || string(join.Result.Output) != `{"joined":true}` {
		t.Fatalf("join run = %+v", join.Result)
	}
	if err := app.NewRuns(nil, nil, h.hosted, nil, 0).Cancel(context.Background(), id); err == nil {
		t.Fatal("a finished workflow accepted a cancel")
	}
}

// A join that did not complete gives the workflow its status and class.
func TestWorkflowTakesAnUnsuccessfulJoinsResult(t *testing.T) {
	t.Parallel()
	for name, turn := range map[string]run.Turn{
		"failed":      {Status: run.Failed, Error: run.Fault(run.ClassRuntimeError, "boom")},
		"interrupted": {Status: run.Interrupted, Error: run.Fault(run.ClassTimeout, "too slow")},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			h := newFlowHarness()
			h.script("Join them.").turn = turn
			id := h.submit(t, contract.CallRequest{})
			record := h.store.wait(t, id)
			if record.Result.Status != turn.Status || class(record) != turn.Error.Class || message(record) != turn.Error.Message || len(record.Result.Output) != 0 {
				t.Fatalf("result = %+v, want %s/%s", record.Result, turn.Status, turn.Error.Class)
			}
			if record.Workflow.Barrier.State != run.BarrierPassed {
				t.Fatalf("barrier = %+v", record.Workflow.Barrier)
			}
			join := h.store.wait(t, "run-4")
			if node := record.Workflow.Nodes[2]; node.Run != "run-4" || node.Status != join.Result.Status || node.Error.Class != join.Result.Error.Class {
				t.Fatalf("join node %+v, join run %+v", node, join.Result)
			}
		})
	}
}

// A cancel that took the workflow's callback before the workflow ended,
// but calls it only after, is refused, and the workflow's outcome stays as
// it ended.
func TestWorkflowRefusesACancelCapturedBeforeItEnded(t *testing.T) {
	t.Parallel()
	h := newFlowHarness()
	join := h.script("Join them.")
	join.started, join.release = make(chan struct{}), make(chan struct{})
	captured, resume := make(chan struct{}), make(chan struct{})
	var capture, resumed sync.Once
	h.hosted.OnCaptured(func(id string) {
		if id == "run-1" {
			capture.Do(func() { close(captured) })
			<-resume
		}
	})
	id := h.submit(t, contract.CallRequest{})
	h.stopOnCleanup(t, id)
	// Registered last, so it runs first: nothing waits on resume after.
	t.Cleanup(func() { resumed.Do(func() { close(resume) }) })

	<-join.started // the join's turn
	result := make(chan error, 1)
	go func() { result <- app.NewRuns(nil, nil, h.hosted, nil, 0).Cancel(context.Background(), id) }()
	<-captured // the cancel taking the workflow's callback
	// The workflow ends while the cancel holds its callback.
	close(join.release)
	ended := h.store.wait(t, id)
	if ended.Result.Status != run.Completed || string(ended.Result.Output) != `{"joined":true}` {
		t.Fatalf("result = %+v", ended.Result)
	}
	eventsAtEnd := len(h.store.handle(t, id).kinds())
	resumed.Do(func() { close(resume) })
	if err := <-result; err == nil {
		t.Fatal("a cancel called after the workflow ended was accepted")
	}
	handle := h.store.handle(t, id)
	handle.mu.Lock()
	after := handle.record
	handle.mu.Unlock()
	if !reflect.DeepEqual(after, ended) || len(h.store.handle(t, id).kinds()) != eventsAtEnd {
		t.Fatalf("the refused cancel changed the workflow: %+v", after.Result)
	}
}
