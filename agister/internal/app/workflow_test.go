package app_test

import (
	"context"
	"encoding/json"
	"fmt"
	"reflect"
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

// Workflow tests (ADR-003). Every node is a real call through Calls, over
// spies: a runner whose turns block on channels the test closes, so what
// runs concurrently and in which order is decided by the test, never by
// timing. Deadlines only guard against a hang.

const hangGuard = 10 * time.Second

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
}

func (r *nodeRunner) Identity(context.Context) (app.RuntimeIdentity, error) {
	return app.RuntimeIdentity{Contract: "spy/1", Version: "1.2.3", Resume: true, CostLimit: true}, nil
}

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
	select {
	case <-handle.done:
	case <-time.After(hangGuard):
		t.Fatalf("run %s never finished", id)
	}
	handle.mu.Lock()
	defer handle.mu.Unlock()
	return handle.record
}

func (r *runSpy) Append(event run.Event) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	event.Seq = len(r.events) + 1
	r.events = append(r.events, event)
	return nil
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
	r.record = record
	close(r.done)
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
		app.NewResolver(h.defs, runtimes, okValidator{}), runtimes,
		map[string]app.InputProvider{"git.revision": h.inputs, "git.diff": h.inputs, "file": h.inputs},
		h.workspaces, changes, app.NewVerifier(changes, &commandsSpy{}, fixedClock{}), okValidator{}, h.store,
		&runsSpy{records: map[string]run.Record{}, states: map[string]run.State{}},
		fixedClock{}, &seqIDs{}, "/state", h.hosted,
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

func (h *flowHarness) cancel(t *testing.T, id string) {
	t.Helper()
	if err := app.NewRuns(nil, h.hosted, 0).Cancel(context.Background(), id); err != nil {
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

func wait(t *testing.T, ch chan struct{}, what string) {
	t.Helper()
	select {
	case <-ch:
	case <-time.After(hangGuard):
		t.Fatalf("%s never happened", what)
	}
}

// Two fan-out nodes, then the join, which receives both outputs once each,
// in declaration order; the workflow's result is the join's, with usage and
// cost summed over every node.
func TestWorkflowJoinReceivesEveryFanOutOutputOnce(t *testing.T) {
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
		{"node": "one", "process": "first", "run": "run-2", "output": map[string]any{"from": "first"}},
		{"node": "two", "process": "second", "run": "run-3", "output": map[string]any{"from": "second"}},
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
	h := newFlowHarness()
	first := h.script("Work as first.")
	first.release = make(chan struct{})
	id := h.submit(t, contract.CallRequest{})

	// Two completes while one is held; then one is released.
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

// A fan-out node that did not complete blocks the join: the workflow takes
// its status and class, and names it.
func TestWorkflowNoJoinAfterAnUnsuccessfulNode(t *testing.T) {
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
				h.script("Work as second.").turn = run.Turn{Status: run.Failed, Error: run.Fault(run.ClassRuntimeError, "boom")}
			},
			status: run.Failed, class: run.ClassRuntimeError,
		},
		"interrupted": {
			prepare: func(h *flowHarness) {
				h.script("Work as second.").turn = run.Turn{Status: run.Interrupted, Error: run.Fault(run.ClassTimeout, "too slow")}
			},
			status: run.Interrupted, class: run.ClassTimeout,
		},
	} {
		t.Run(name, func(t *testing.T) {
			h := newFlowHarness()
			tc.prepare(h)
			id := h.submit(t, contract.CallRequest{})
			record := h.store.wait(t, id)
			if record.Result.Status != tc.status || class(record) != tc.class {
				t.Fatalf("result = %+v, want %s/%s", record.Result, tc.status, tc.class)
			}
			if !strings.Contains(message(record), "fan-out node two (run run-3) did not complete") {
				t.Fatalf("message = %q", message(record))
			}
			if barrier := record.Workflow.Barrier; barrier.State != run.BarrierBlocked || barrier.BlockedBy != "two" {
				t.Fatalf("barrier = %+v", barrier)
			}
			join := record.Workflow.Nodes[2]
			if join.Run != "" || join.Status != "" || len(h.runner.turns("Join them.")) != 0 || len(h.store.ids()) != 3 {
				t.Fatalf("a join ran: node %+v, runs %v", join, h.store.ids())
			}
			if two := record.Workflow.Nodes[1]; two.Run != "run-3" || two.Status != tc.status || two.Error.Class != tc.class {
				t.Fatalf("node two = %+v", two)
			}
			// Output is only a completed join's.
			if len(record.Result.Output) != 0 {
				t.Fatalf("output = %s", record.Result.Output)
			}
		})
	}
}

// With several unsuccessful nodes, the first in declaration order blocks
// the join, even when it ends last.
func TestWorkflowBlockedByTheFirstUnsuccessfulNodeInDeclarationOrder(t *testing.T) {
	h := newFlowHarness()
	first := h.script("Work as first.")
	first.turn = run.Turn{Status: run.Failed, Error: run.Fault(run.ClassRateLimited, "slow down")}
	first.release = make(chan struct{})
	h.script("Work as second.").turn = run.Turn{Status: run.Failed, Error: run.Fault(run.ClassAuth, "denied")}
	id := h.submit(t, contract.CallRequest{})
	h.store.wait(t, "run-3")
	close(first.release)
	record := h.store.wait(t, id)
	if class(record) != run.ClassRateLimited || record.Workflow.Barrier.BlockedBy != "one" || !strings.Contains(message(record), "fan-out node one (run run-2)") {
		t.Fatalf("result = %+v, barrier %+v", record.Result, record.Workflow.Barrier)
	}
	// Cost is unknown when a node's is.
	if record.Result.Cost.Source != run.CostUnknown || record.Result.Cost.USD != nil {
		t.Fatalf("cost = %+v", record.Result.Cost)
	}
}

// The join receives the collection and the fixed values its own process
// declares, and nothing from the caller: no param, no workflow value.
func TestWorkflowJoinReceivesNothingButTheCollection(t *testing.T) {
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
	limit := 1.0
	for name, request := range map[string]contract.CallRequest{
		"agent":    {Agent: "a"},
		"timeout":  {Timeout: "1m"},
		"cost":     {MaxCostUSD: &limit},
		"continue": {Continue: "run-0"},
	} {
		t.Run(name, func(t *testing.T) {
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
			for _, node := range record.Workflow.Nodes[:2] {
				if node.Status != run.Completed {
					t.Fatalf("fan-out node %+v did not complete", node)
				}
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
	h := newFlowHarness()
	for _, instruction := range []string{"Work as first.", "Work as second."} {
		s := h.script(instruction)
		s.started, s.release = make(chan struct{}), make(chan struct{})
	}
	id := h.submit(t, contract.CallRequest{})
	wait(t, h.script("Work as first.").started, "the first node's turn")
	wait(t, h.script("Work as second.").started, "the second node's turn")
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
			joined := strings.Join(report.Problems, "\n")
			if tc.want == "" {
				if len(report.Problems) != 0 {
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
	h := newFlowHarness()
	inspection := app.NewInspection(app.NewResolver(h.defs, nodeRuntimes{runner: h.runner}, okValidator{}))
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
