package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/contract"
	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
	"github.com/igor1309/ai-labs/agister/internal/domain/prompt"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

// Calls submits and executes agent calls, and workflows of them (ADR-003).
type Calls struct {
	resolver   CallResolver
	runners    CallRunners
	inputs     map[string]InputProvider
	workspaces CallWorkspaces
	changes    CallChanges
	verifier   CallVerifier
	validator  CallValidator
	recorder   RunRecorder
	runs       CallRuns
	clock      CallClock
	ids        IDs
	stateDir   string
	hosted     *Hosted
}

// CallResolver reads the settings a call is resolved from, once, at submit,
// and resolves the call from exactly those.
type CallResolver interface {
	Snapshot(ctx context.Context) CallResolution
}

// CallResolution resolves a call, or a workflow, from the settings it was
// taken over.
type CallResolution interface {
	Resolve(ctx context.Context, processName, agentOverride string, caller overrides) (*resolution, error)
	// Workflow resolves the workflow of that name; found is false when the
	// settings have none, and the name is a process's.
	Workflow(ctx context.Context, name string) (res *workflowResolution, found bool, err error)
}

// Snapshot returns the resolver over the definitions as they are now (see
// Resolver.frozen), as the resolution a call is executed with.
func (r *Resolver) Snapshot(ctx context.Context) CallResolution { return r.frozen(ctx) }

// CallRunners builds the runner of the runtime a call resolved to.
type CallRunners interface {
	Runner(adapter, command string) (TurnRunner, error)
}

// TurnRunner drives one runtime. It knows nothing of permissions, policies
// or processes.
type TurnRunner interface {
	Identity(ctx context.Context) (RuntimeIdentity, error)
	RunTurn(ctx context.Context, request TurnRequest, sink EventSink) run.Turn
}

// EventSink receives a turn's events and raw runtime output.
type EventSink interface {
	Event(source, kind string, data map[string]any)
	// ProcessStarted records the runtime's process as soon as it exists, as
	// a reference only the runtime adapter can read (Processes.Reap takes
	// it back). It may be reported again as more becomes known; the last
	// report stands. An error means the process is not on record, so
	// nobody could find it after a crash: the runtime adapter must end it
	// and fail the turn.
	ProcessStarted(ref string) error
	Raw(line string)
}

// RunHandle writes one run's evidence. Finish releases ownership.
type RunHandle interface {
	Append(event run.Event) error
	Raw(line string) error
	Update(record run.Record) error
	// Artifact stores a file the call produced beside its evidence.
	Artifact(name string, data []byte) (run.Artifact, error)
	Finish(record run.Record) error
}

// CallValidator compiles the output schema before the call and checks its
// output after.
type CallValidator interface {
	Compile(schema []byte) error
	Validate(schema []byte, output json.RawMessage) error
}

// CallRuns reads earlier runs' evidence, only to continue a session: the
// run continued, and every run's record for the session's latest totals. A
// record that is not finished and no longer owned reads as abandoned.
type CallRuns interface {
	Get(ctx context.Context, id string) (run.Record, run.State, error)
	List(ctx context.Context) ([]run.Record, error)
}

// CallClock tells the time of a call's record and events.
type CallClock interface{ Now() time.Time }

// IDs makes the identities a call needs.
type IDs interface {
	RunID(now time.Time) string
}

// InputProvider resolves one kind of input source.
type InputProvider interface {
	Resolve(ctx context.Context, spec InputSpec) (Resolved, error)
}

// CallWorkspaces locates repositories and provides isolated checkouts, to
// prepare where the agent works.
type CallWorkspaces interface {
	Root(ctx context.Context, cwd string) (string, error)
	Checkout(ctx context.Context, repository, revision string) (dir string, release func() error, err error)
}

// CallChanges names the content of a call's checkout and captures what
// changed in it, as evidence. It never writes the checkout's own index.
type CallChanges interface {
	// Identity names the checkout's content: the files of revision as the
	// checkout has them, and its untracked files that are not ignored,
	// whatever is committed.
	Identity(ctx context.Context, dir, revision string) (string, error)
	// Changes returns the patch from one content, a revision or an
	// identity, to another; empty when they are the same.
	Changes(ctx context.Context, dir, from, to string) ([]byte, error)
	// Rebuild applies a patch to revision apart from the checkout and
	// names the content that results.
	Rebuild(ctx context.Context, dir, revision string, patch []byte) (string, error)
}

// CallVerifier runs the verification loop of a call whose process declares
// verify (ADR-002), after its first turn was valid. It returns the content
// a passing run checked, empty when none passed, and the fault that ended
// the loop without a pass.
type CallVerifier interface {
	Verify(ctx context.Context, call VerifyCall) (verified string, fault *run.Error)
}

// RunRecorder creates run records owned by the calling process.
type RunRecorder interface {
	Create(ctx context.Context, record run.Record) (RunHandle, error)
}

// NewCalls returns the use case that submits and executes calls. Every
// collaborator is required. stateDir is Agister's own state, which no agent
// workspace may overlap.
func NewCalls(
	resolver CallResolver,
	runners CallRunners,
	inputs map[string]InputProvider,
	workspaces CallWorkspaces,
	changes CallChanges,
	verifier CallVerifier,
	validator CallValidator,
	recorder RunRecorder,
	runs CallRuns,
	clock CallClock,
	ids IDs,
	stateDir string,
	hosted *Hosted,
) *Calls {
	return &Calls{
		resolver:   resolver,
		runners:    runners,
		inputs:     inputs,
		workspaces: workspaces,
		changes:    changes,
		verifier:   verifier,
		validator:  validator,
		recorder:   recorder,
		runs:       runs,
		clock:      clock,
		ids:        ids,
		stateDir:   stateDir,
		hosted:     hosted,
	}
}

// Hosted tracks calls running in this process so they can be cancelled.
// Each cancel reports whether it took effect: a workflow that already
// finished refuses it (see flow.stop).
type Hosted struct {
	mu      sync.Mutex
	cancels map[string]func() bool
	// captured, when set, runs after a cancel took a run's callback and
	// before it calls it; tests use it to let the run end in between.
	captured func(id string)
}

func NewHosted() *Hosted { return &Hosted{cancels: map[string]func() bool{}} }

// cancelled is a call's cancel, which always takes effect.
func cancelled(cancel context.CancelFunc) func() bool {
	return func() bool {
		cancel()
		return true
	}
}

func (h *Hosted) add(id string, cancel func() bool) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.cancels[id] = cancel
}

func (h *Hosted) remove(id string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.cancels, id)
}

// cancel calls the run's cancel outside the lock: a workflow's takes a lock
// of its own, under which it adds the nodes it starts here.
func (h *Hosted) cancel(id string) bool {
	h.mu.Lock()
	cancel, ok := h.cancels[id]
	h.mu.Unlock()
	if ok && h.captured != nil {
		h.captured(id)
	}
	return ok && cancel()
}

const inlineInputChars = 2000

func (c *Calls) Submit(ctx context.Context, request contract.CallRequest) (string, error) {
	now := c.clock.Now()
	record := run.Record{
		Schema:    run.RecordSchema,
		ID:        c.ids.RunID(now),
		Process:   request.Process,
		CreatedAt: now,
		Request: run.Request{
			Process:    request.Process,
			Params:     request.Params,
			Agent:      request.Agent,
			Timeout:    request.Timeout,
			MaxCostUSD: request.MaxCostUSD,
			Continue:   request.Continue,
			Cwd:        request.Cwd,
		},
	}
	// The settings this call resolves from are read now, before the run is
	// recorded; the call's goroutine, which may open much later, uses this
	// snapshot and never reads the live source. A workflow's nodes use it
	// too.
	resolver := c.resolver.Snapshot(ctx)
	workflow, isWorkflow, workflowErr := resolver.Workflow(ctx, request.Process)
	handle, err := c.recorder.Create(ctx, record)
	if err != nil {
		return "", err
	}
	if isWorkflow {
		runCtx, cancel := context.WithCancel(WithCorrelation(context.WithoutCancel(ctx), "workflow_run", record.ID, "workflow", request.Process))
		// Cancelling the workflow is serialized with starting its nodes.
		flow := &flow{cancel: cancel}
		c.hosted.add(record.ID, flow.stop)
		go func() {
			defer c.hosted.remove(record.ID)
			defer cancel()
			c.runWorkflow(runCtx, handle, record, resolver, workflow, workflowErr, flow)
		}()
		return record.ID, nil
	}
	runCtx, cancel := context.WithCancel(WithCorrelation(context.WithoutCancel(ctx), "run_id", record.ID, "process", request.Process))
	c.hosted.add(record.ID, cancelled(cancel))
	go func() {
		defer c.hosted.remove(record.ID)
		defer cancel()
		c.execute(runCtx, handle, record, resolver, nil)
	}()
	return record.ID, nil
}

// execute runs one call and returns its record as finished. Every refusal
// happens before the runtime starts and is recorded; every effect is
// released on every path. collection is what a workflow's join receives
// through its collection input; nil for any other call.
func (c *Calls) execute(ctx context.Context, handle RunHandle, record run.Record, resolver CallResolution, collection *Resolved) (final run.Record) {
	event := func(source, kind string, data map[string]any) {
		_ = handle.Append(run.Event{At: c.clock.Now(), Source: source, Kind: kind, Data: data})
	}
	result := run.Result{Cost: run.Cost{Source: run.CostUnknown}, Timing: run.Timing{StartedAt: record.CreatedAt}}
	// Effects end before the record does: the workspace's changes are kept
	// and the workspace released first. A capture that must reproduce
	// verified content and does not fails the call.
	var collect func() *run.Error
	release := func() error { return nil }
	finish := func(fault *run.Error) {
		// Cleared first: if it panics, the recovery calls finish again.
		if pending := collect; pending != nil {
			collect = nil
			if failed := pending(); fault == nil {
				fault = failed
			}
		}
		if err := release(); err != nil {
			event(run.SourceAgister, "WORKSPACE_RELEASE_FAILED", map[string]any{"error": err.Error()})
		}
		release = func() error { return nil }
		now := c.clock.Now()
		record.FinishedAt = &now
		result.Status, result.Error = run.Completed, fault
		if fault != nil {
			result.Status = run.StatusOf(fault.Class)
			result.Output = nil
		}
		result.Timing.FinishedAt = now
		result.Timing.WallMS = now.Sub(result.Timing.StartedAt).Milliseconds()
		record.Result = &result
		final = record
		data := map[string]any{"status": string(result.Status)}
		if fault != nil {
			data["class"], data["message"] = string(fault.Class), fault.Message
		}
		event(run.SourceAgister, "CALL_FINISHED", data)
		// A finished run is no longer cancellable.
		c.hosted.remove(record.ID)
		_ = handle.Finish(record)
	}
	defer func() {
		if recovered := recover(); recovered != nil {
			finish(run.Fault(run.ClassInternal, "%v", recovered))
		}
	}()
	event(run.SourceAgister, "CALL_SUBMITTED", map[string]any{"process": record.Process})

	fail := func(err error) {
		// A cancelled call's probes and git fail as a consequence; the
		// cancellation is what happened.
		if ctx.Err() != nil {
			finish(run.Fault(run.ClassCancelled, "cancelled before the runtime started: %v", err))
			return
		}
		var refusal *Refusal
		if errors.As(err, &refusal) {
			event(run.SourceAgister, "REFUSED", map[string]any{"reason": refusal.Reason})
			finish(run.Fault(run.ClassRefused, "%s", refusal.Reason))
			return
		}
		finish(run.Fault(run.ClassInternal, "%v", err))
	}

	caller := overrides{timeout: record.Request.Timeout, maxCostUSD: record.Request.MaxCostUSD}
	res, err := resolver.Resolve(ctx, record.Request.Process, record.Request.Agent, caller)
	record.Definitions = recordSources(res.sources)
	if err != nil {
		fail(err)
		return
	}
	runner, err := c.runners.Runner(res.mapping.Adapter, res.agent.Command)
	if err != nil {
		fail(refuse("runtime mapping %s: %v", res.mapping.Name, err))
		return
	}
	record.Agent = res.agent.Name
	record.Effective = recordEffective(res.effective)
	record.Verify = recordVerify(res.process.Verify)
	record.Runtime = &run.Runtime{Mapping: res.mapping.Name, Adapter: res.mapping.Adapter, Contract: res.identity.Contract, Version: res.identity.Version}
	record.Plan = recordPlan(res.plan)
	_ = handle.Update(record)
	event(run.SourceAgister, "PLANNED", map[string]any{"primitives": res.plan.Primitives, "granted": res.plan.Granted, "withheld": res.plan.Withheld})
	if len(res.plan.Withheld) > 0 {
		event(run.SourceAgister, "PERMISSIONS_WITHHELD", map[string]any{"permissions": res.plan.Withheld})
	}

	resumeSessionID, sessionBefore, err := c.continuation(ctx, res, record.ID, record.Request.Continue)
	if err != nil {
		fail(err)
		return
	}

	inputs, err := c.resolveValues(ctx, "process "+res.process.Name, res.process.Params, res.process.Values, record.Request, collection)
	if err != nil {
		fail(err)
		return
	}
	record.Inputs = summarize(inputs)
	_ = handle.Update(record)

	workspace, err := c.prepareWorkspace(ctx, res.process, inputs, record.Request.Cwd)
	if err != nil {
		fail(err)
		return
	}
	release = workspace.Release
	record.Workspace = workspace.Dir
	revision, _ := revisionOf(inputs, res.process.Checkout)
	// The content a passing verification run checked, which the captured
	// changes must rebuild (ADR-002 rule 7).
	var verified string
	if workspace.Owned {
		// Recorded before the runtime starts: if this process is killed,
		// a later reap removes the checkout. A checkout that cannot be
		// recorded is one nobody could find, so it is released and the
		// call refused.
		record.Effects = &run.Effects{Checkout: &run.Checkout{Repository: workspace.Repository, Dir: workspace.Dir}}
		if err := handle.Update(record); err != nil {
			record.Effects = nil
			fail(fmt.Errorf("recording the checkout failed: %w", err))
			return
		}
		collect = func() *run.Error {
			artifacts, fault := c.collectChanges(ctx, handle, workspace.Dir, revision, verified, event)
			result.Artifacts = artifacts
			return fault
		}
	}

	request := TurnRequest{
		Prompt:          prompt.Inputs(inputs),
		Instruction:     prompt.Instruction(res.process.Instruction, res.plan.Granted, res.plan.Withheld),
		Cwd:             workspace.Dir,
		ResumeSessionID: resumeSessionID,
		MaxCostUSD:      res.effective.MaxCostUSD,
		Model:           res.agent.Model,
		Effort:          res.agent.Effort,
		Primitives:      res.plan.Primitives,
		Timeout:         res.effective.Timeout,
		OutputSchema:    res.schema,
	}
	_ = handle.Update(record)

	// The call's timeout bounds every turn and every verification run.
	deadline := c.clock.Now().Add(res.effective.Timeout)
	// Usage and cost sum every turn's own; the latest turn's text and
	// output are the call's. before is the resumed session's totals before
	// the turn, recorded with it; nil when unknown.
	var turns []run.Turn
	var turnMS int64
	take := func(request TurnRequest, before *run.SessionTotals) run.Turn {
		turnStart := c.clock.Now()
		turn := runner.RunTurn(ctx, request, &sink{handle: handle, clock: c.clock, record: &record})
		resumed := request.ResumeSessionID != ""
		if resumed {
			turn.SessionBefore = before
		}
		turn = run.Own(turn, resumed)
		turnMS += c.clock.Now().Sub(turnStart).Milliseconds()
		turns = append(turns, turn)
		record.Turn = &turn
		totals := run.Sum(turns)
		spent := turnMS
		result.Timing.TurnMS = &spent
		result.Timing.RuntimeMS = totals.RuntimeMS
		result.Usage, result.Cost = totals.Usage, totals.Cost
		result.Text = turn.Text
		return turn
	}
	conclude := func(turn run.Turn) *run.Error {
		var validation error
		if turn.Status == run.Completed && res.process.Output.Format == "json" {
			validation = c.validator.Validate(res.schema, turn.Output)
		}
		_, fault := run.Conclude(turn, res.process.Output, validation)
		return fault
	}

	turn := take(request, sessionBefore)
	if turn.ProviderSessionID != "" {
		result.Session = &run.Session{ProviderSessionID: turn.ProviderSessionID, Continues: record.Request.Continue}
	}
	fault := conclude(turn)
	if fault == nil && res.process.Verify != nil {
		verified, fault = c.verifier.Verify(ctx, VerifyCall{
			Record: &record, Result: &result, Event: event, Update: handle.Update, Artifact: handle.Artifact,
			Verify: *res.process.Verify, Limit: res.effective.MaxCostUSD, Deadline: deadline,
			Dir: workspace.Dir, Base: revision, Request: request, Session: turn.ProviderSessionID,
			Take: take, Conclude: conclude,
		})
	}
	if fault == nil && res.process.Output.Format == "json" {
		result.Output = record.Turn.Output
	}
	finish(fault)
	return final
}

// runWorkflow runs one workflow and finishes its run. res and resErr are the
// workflow as the settings snapshot resolved it.
func (c *Calls) runWorkflow(ctx context.Context, handle RunHandle, record run.Record, resolver CallResolution, res *workflowResolution, resErr error, flow *flow) {
	event := func(kind string, data map[string]any) {
		_ = handle.Append(run.Event{At: c.clock.Now(), Source: run.SourceAgister, Kind: kind, Data: data})
	}
	result := run.Result{Cost: run.Cost{Source: run.CostUnknown}, Timing: run.Timing{StartedAt: record.CreatedAt}}
	// The results of every node that ran: usage and cost sum them.
	var ran []run.Result
	done := false
	finish := func(status run.Status, fault *run.Error) {
		if done {
			return
		}
		done = true
		// Serialized with a cancel: one that came first wins, whatever the
		// nodes' outcome, which their own records keep; one that comes
		// after is refused, and the run is no longer cancellable.
		flow.finish(func(stopped bool) {
			if stopped && (fault == nil || fault.Class != run.ClassCancelled) {
				ended := string(status)
				if fault != nil {
					ended += "/" + string(fault.Class)
				}
				status, fault = run.Interrupted, run.Fault(run.ClassCancelled, "the workflow was cancelled before it finished; it would have ended %s", ended)
			}
			c.hosted.remove(record.ID)
		})
		if fault != nil {
			result.Output = nil
		}
		now := c.clock.Now()
		record.FinishedAt = &now
		result.Status, result.Error = status, fault
		totals := nodeTotals(ran)
		result.Usage, result.Cost = totals.Usage, totals.Cost
		result.Timing.FinishedAt = now
		result.Timing.WallMS = now.Sub(result.Timing.StartedAt).Milliseconds()
		record.Result = &result
		data := map[string]any{"status": string(status)}
		if fault != nil {
			data["class"], data["message"] = string(fault.Class), fault.Message
		}
		event("WORKFLOW_FINISHED", data)
		_ = handle.Finish(record)
	}
	defer func() {
		if recovered := recover(); recovered != nil {
			finish(run.Failed, run.Fault(run.ClassInternal, "%v", recovered))
		}
	}()
	// Before any node starts, a refusal is the workflow's own.
	refused := func(err error) {
		if ctx.Err() != nil {
			finish(run.Interrupted, run.Fault(run.ClassCancelled, "cancelled before any node started: %v", err))
			return
		}
		var refusal *Refusal
		if errors.As(err, &refusal) {
			event("REFUSED", map[string]any{"reason": refusal.Reason})
			finish(run.Failed, run.Fault(run.ClassRefused, "%s", refusal.Reason))
			return
		}
		finish(run.Failed, run.Fault(run.ClassInternal, "%v", err))
	}
	event("WORKFLOW_SUBMITTED", map[string]any{"workflow": record.Process})

	if res != nil {
		record.Definitions = recordSources(res.sources)
	}
	if resErr != nil {
		refused(resErr)
		return
	}
	if err := workflowRequest(record.Request); err != nil {
		refused(err)
		return
	}
	workflow := res.workflow
	state := &run.Workflow{Barrier: run.Barrier{State: run.BarrierWaiting}}
	for _, node := range workflow.FanOut {
		state.Nodes = append(state.Nodes, run.Node{Name: node.Name, Process: node.Process})
	}
	state.Nodes = append(state.Nodes, run.Node{Name: workflow.Join.Name, Process: workflow.Join.Process, Join: true})
	record.Workflow = state
	_ = handle.Update(record)

	// Resolved once, before any node starts; every fan-out node receives the
	// same values.
	inputs, err := c.resolveValues(ctx, "workflow "+workflow.Name, workflow.Params, workflow.Values, record.Request, nil)
	if err != nil {
		refused(err)
		return
	}
	record.Inputs = summarize(inputs)
	_ = handle.Update(record)
	values, err := passedValues(inputs)
	if err != nil {
		refused(err)
		return
	}

	ends := make(chan nodeEnd, len(workflow.FanOut))
	start := func(index int, node definition.Node, params map[string]string, collection *Resolved) (started bool, err error) {
		started = flow.start(func() {
			state.Nodes[index].Run, err = c.startNode(ctx, record.ID, node, params, collection, record.Request.Cwd, resolver, func(final run.Record) {
				ends <- nodeEnd{index, final}
			})
		})
		switch {
		case !started:
		case err != nil:
			state.Nodes[index].Status, state.Nodes[index].Error = run.Failed, run.Fault(run.ClassInternal, "its run could not be recorded: %v", err)
			event("NODE_NOT_STARTED", map[string]any{"node": node.Name, "process": node.Process, "error": err.Error()})
		default:
			event("NODE_STARTED", map[string]any{"node": node.Name, "process": node.Process, "run": state.Nodes[index].Run})
		}
		_ = handle.Update(record)
		return started, err
	}
	ended := func(end nodeEnd) {
		node := &state.Nodes[end.index]
		node.Status = end.record.Result.Status
		node.Error = end.record.Result.Error
		ran = append(ran, *end.record.Result)
		data := map[string]any{"node": node.Name, "run": node.Run, "status": string(node.Status)}
		if node.Error != nil {
			data["class"] = string(node.Error.Class)
		}
		event("NODE_FINISHED", data)
		_ = handle.Update(record)
	}

	// Fan out: a node that cannot start stops the rest from starting.
	running := 0
	for i, node := range workflow.FanOut {
		params := map[string]string{}
		for _, param := range res.processes[node.Process].Params {
			if value, ok := values[param.Name]; ok {
				params[param.Name] = value
			}
		}
		started, err := start(i, node, params, nil)
		if !started || err != nil {
			break
		}
		running++
	}
	outputs := make([]run.Record, len(workflow.FanOut))
	for ; running > 0; running-- {
		end := <-ends
		outputs[end.index] = end.record
		ended(end)
	}

	// The barrier. Cancellation is terminal: it wins over any node's outcome.
	cancelled := func(message string) {
		state.Barrier = run.Barrier{State: run.BarrierCancelled}
		event("BARRIER", map[string]any{"state": state.Barrier.State})
		finish(run.Interrupted, run.Fault(run.ClassCancelled, "%s", message))
	}
	if flow.cancelled() {
		cancelled("the workflow was cancelled; its join did not start")
		return
	}
	for i := range workflow.FanOut {
		node := state.Nodes[i]
		if node.Status == run.Completed {
			continue
		}
		state.Barrier = run.Barrier{State: run.BarrierBlocked, BlockedBy: node.Name}
		event("BARRIER", map[string]any{"state": state.Barrier.State, "blocked_by": node.Name})
		status, class, reason := node.Status, run.ClassInternal, "it did not start"
		if node.Error != nil {
			class, reason = node.Error.Class, node.Error.String()
		}
		if status == "" {
			status = run.StatusOf(class)
		}
		finish(status, run.Fault(class, "fan-out node %s (run %s) did not complete, so the join did not start: %s", node.Name, or(node.Run, "none"), reason))
		return
	}
	state.Barrier = run.Barrier{State: run.BarrierPassed}
	event("BARRIER", map[string]any{"state": state.Barrier.State})

	collection, data, err := collect(workflow, outputs)
	if err != nil {
		finish(run.Failed, run.Fault(run.ClassInternal, "the collection: %v", err))
		return
	}
	if artifact, err := handle.Artifact("collection.json", data); err == nil {
		state.Collection = &artifact
	} else {
		event("ARTIFACT_FAILED", map[string]any{"name": "collection.json", "error": err.Error()})
	}
	join := len(state.Nodes) - 1
	// The join is a fresh call that receives the collection and no param.
	started, err := start(join, workflow.Join, nil, &collection)
	if !started {
		cancelled("the workflow was cancelled before its join started")
		return
	}
	if err != nil {
		finish(run.Failed, state.Nodes[join].Error)
		return
	}
	end := <-ends
	ended(end)
	joined := end.record.Result
	result.Output, result.Text = joined.Output, joined.Text
	finish(joined.Status, joined.Error)
}

// startNode records a node's run, a call of its process that belongs to the
// workflow run parent, and starts it under the workflow's context, so
// cancelling the workflow cancels it. ended receives its record as it
// finished.
func (c *Calls) startNode(ctx context.Context, parent string, node definition.Node, params map[string]string, collection *Resolved, cwd string, resolver CallResolution, ended func(run.Record)) (string, error) {
	now := c.clock.Now()
	record := run.Record{
		Schema:    run.RecordSchema,
		ID:        c.ids.RunID(now),
		Process:   node.Process,
		CreatedAt: now,
		Parent:    &run.Parent{Run: parent, Node: node.Name},
		Request:   run.Request{Process: node.Process, Params: params, Cwd: cwd},
	}
	handle, err := c.recorder.Create(ctx, record)
	if err != nil {
		return "", err
	}
	nodeCtx, cancel := context.WithCancel(WithCorrelation(ctx, "run_id", record.ID, "process", node.Process, "node", node.Name))
	c.hosted.add(record.ID, cancelled(cancel))
	go func() {
		defer c.hosted.remove(record.ID)
		defer cancel()
		ended(c.execute(nodeCtx, handle, record, resolver, collection))
	}()
	return record.ID, nil
}

// continuation checks a request to continue an earlier run's session and
// returns that provider session, which the runtime resumes in place, and
// its totals before the call's first turn. Continuing is deliberate: the
// agent must allow it, the runtime must support it, and the earlier run
// must be finished, by the same agent, with a session. self is the
// asking run.
func (c *Calls) continuation(ctx context.Context, res *resolution, self, runID string) (string, *run.SessionTotals, error) {
	if runID == "" {
		return "", nil, nil
	}
	if res.agent.Session != definition.SessionResumable {
		return "", nil, refuse("agent %s is %s; it cannot continue run %s", res.agent.Name, res.agent.Session, runID)
	}
	if !res.identity.Resume {
		return "", nil, refuse("runtime %s cannot continue sessions", res.mapping.Name)
	}
	prior, state, err := c.runs.Get(ctx, runID)
	if err != nil {
		return "", nil, refuse("run %s: %v", runID, err)
	}
	switch {
	case state != run.StateFinished:
		return "", nil, refuse("run %s is %s, not finished", runID, state)
	case prior.Agent != res.agent.Name:
		return "", nil, refuse("run %s ran agent %s; only agent %s's own runs can be continued by it", runID, prior.Agent, res.agent.Name)
	case prior.Runtime == nil || prior.Runtime.Adapter != res.mapping.Adapter:
		return "", nil, refuse("run %s did not run on %s", runID, res.mapping.Adapter)
	case prior.Result == nil || prior.Result.Session == nil || prior.Result.Session.ProviderSessionID == "":
		return "", nil, refuse("run %s has no provider session", runID)
	}
	session := prior.Result.Session.ProviderSessionID
	// The baseline is the session's latest turn on any run Agister has
	// recorded, which may be a later continuation of the run continued, not
	// that run's own. Turns made on the session outside Agister are not
	// seen: what they cost is counted again. Runs that cannot be read leave
	// it unknown.
	records, err := c.runs.List(ctx)
	if err != nil {
		return session, nil, nil
	}
	return session, run.LatestTotals(records, session, self), nil
}

// collectChanges keeps a call's changes to its own workspace as an
// artifact: the patch from revision to the checkout's content. A failure is
// recorded; it does not change the call's status, unless verified names the
// content a verification run passed on: the patch must then rebuild exactly
// that content from revision (ADR-002 rule 7), or the call fails.
func (c *Calls) collectChanges(ctx context.Context, handle RunHandle, dir, revision, verified string, event func(string, string, map[string]any)) ([]run.Artifact, *run.Error) {
	ctx = context.WithoutCancel(ctx)
	identity := verified
	var err error
	if identity == "" {
		identity, err = c.changes.Identity(ctx, dir, revision)
	}
	var patch []byte
	if err == nil {
		patch, err = c.changes.Changes(ctx, dir, revision, identity)
	}
	if err == nil && verified != "" {
		var rebuilt string
		if rebuilt, err = c.changes.Rebuild(ctx, dir, revision, patch); err == nil && rebuilt != verified {
			err = fmt.Errorf("applied to %s it rebuilds %s, not %s", revision, rebuilt, verified)
		}
	}
	var artifacts []run.Artifact
	if err == nil && len(patch) > 0 {
		var artifact run.Artifact
		if artifact, err = handle.Artifact("changes.patch", patch); err == nil {
			event(run.SourceAgister, "ARTIFACT_STORED", map[string]any{"name": artifact.Name, "digest": artifact.Digest, "bytes": artifact.Bytes})
			artifacts = []run.Artifact{artifact}
		}
	}
	if err != nil {
		event(run.SourceAgister, "ARTIFACT_FAILED", map[string]any{"name": "changes.patch", "error": err.Error()})
		if verified != "" {
			return nil, run.Fault(run.ClassInternal, "the captured changes do not reproduce the content that passed verification: %v", err)
		}
		return nil, nil
	}
	return artifacts, nil
}

// resolveValues binds caller params to the params declared and resolves
// every input value to an immutable value through its source, in order: a
// value's arguments may use the text of the values resolved before it,
// such as a commit hash. subject names the definition, e.g. "process p".
// Only a join has a collection to receive; a collection input of any other
// call is refused.
func (c *Calls) resolveValues(ctx context.Context, subject string, declared []definition.Param, values []definition.Value, request run.Request, collection *Resolved) ([]run.Input, error) {
	params := map[string]string{}
	var unknown []string
	for name := range request.Params {
		if !hasParam(declared, name) {
			unknown = append(unknown, name)
		}
	}
	if len(unknown) > 0 {
		sort.Strings(unknown)
		return nil, refuse("%s takes no params: %s", subject, strings.Join(unknown, ", "))
	}
	var missing []string
	for _, param := range declared {
		value, ok := request.Params[param.Name]
		switch {
		case ok:
			params[param.Name] = value
		case param.HasDefault:
			params[param.Name] = param.Default
		default:
			missing = append(missing, param.Name)
		}
	}
	if len(missing) > 0 {
		return nil, refuse("%s is missing params: %s", subject, strings.Join(missing, ", "))
	}

	inputs := make([]run.Input, 0, len(values))
	texts := map[string]string{}
	for _, value := range values {
		if value.Source == definition.CollectionSource {
			if collection == nil {
				return nil, refuse("input %s: %s is given only to a workflow's join", value.Name, definition.CollectionSource)
			}
			if text, ok := collection.Value.(string); ok {
				texts[value.Name] = text
			}
			inputs = append(inputs, run.Input{Name: value.Name, Source: value.Source, Identity: collection.Identity, Value: collection.Value})
			continue
		}
		provider, ok := c.inputs[value.Source]
		if !ok {
			return nil, refuse("input %s: unknown source %q", value.Name, value.Source)
		}
		args, err := value.Bind(params, texts)
		if err != nil {
			return nil, refuse("input %s: %v", value.Name, err)
		}
		resolved, err := provider.Resolve(ctx, InputSpec{Source: value.Source, Args: args, Params: params, Cwd: request.Cwd})
		if err != nil {
			return nil, refuse("input %s: %v", value.Name, err)
		}
		if text, ok := resolved.Value.(string); ok {
			texts[value.Name] = text
		}
		inputs = append(inputs, run.Input{Name: value.Name, Source: value.Source, Identity: resolved.Identity, Revision: resolved.Revision, Value: resolved.Value})
	}
	return inputs, nil
}

// preparedWorkspace is where a call's agent works.
type preparedWorkspace struct {
	Dir string
	// Repository is the one Dir belongs to, or is.
	Repository string
	// Release ends what preparing created; a no-op when it created nothing.
	Release func() error
	// Owned is true for a checkout the call created in Repository.
	Owned bool
}

// prepareWorkspace returns the agent's working directory: a checkout of the
// declared revision, or the repository. It must not overlap Agister's state.
func (c *Calls) prepareWorkspace(ctx context.Context, process definition.Process, inputs []run.Input, cwd string) (preparedWorkspace, error) {
	noop := func() error { return nil }
	root, err := c.workspaces.Root(ctx, cwd)
	if err != nil {
		root = cwd
	}
	if overlaps(root, c.stateDir) {
		return preparedWorkspace{}, refuse("workspace %s overlaps Agister's state %s", root, c.stateDir)
	}
	if process.Checkout == "" {
		return preparedWorkspace{Dir: root, Repository: root, Release: noop}, nil
	}
	var revision string
	for _, input := range inputs {
		if input.Name == process.Checkout && input.Revision {
			revision = input.Identity
		}
	}
	if revision == "" {
		return preparedWorkspace{}, refuse("workspace.checkout: input %s is not a revision", process.Checkout)
	}
	dir, release, err := c.workspaces.Checkout(ctx, root, revision)
	if err != nil {
		return preparedWorkspace{}, err
	}
	if overlaps(dir, c.stateDir) {
		_ = release()
		return preparedWorkspace{}, refuse("workspace %s overlaps Agister's state %s", dir, c.stateDir)
	}
	return preparedWorkspace{Dir: dir, Repository: root, Release: release, Owned: true}, nil
}

// sink records a turn's events, and its process as an effect on record,
// which the turn's caller leaves alone while the turn runs.
type sink struct {
	handle RunHandle
	clock  sinkClock
	record *run.Record
}

// sinkClock tells the time of a turn's events.
type sinkClock interface{ Now() time.Time }

// ProcessStarted records the process on the run. A process that cannot be
// recorded is not claimed by the record, and the error goes back to the
// runtime, which ends it.
func (s *sink) ProcessStarted(ref string) error {
	previous := s.record.Effects
	effects := run.Effects{}
	if previous != nil {
		effects = *previous
	}
	effects.Process = &run.Process{Ref: ref}
	s.record.Effects = &effects
	if err := s.handle.Update(*s.record); err != nil {
		s.record.Effects = previous
		return fmt.Errorf("recording the process failed: %w", err)
	}
	return nil
}

func (s *sink) Event(source, kind string, data map[string]any) {
	_ = s.handle.Append(run.Event{At: s.clock.Now(), Source: source, Kind: kind, Data: data})
}

func (s *sink) Raw(line string) { _ = s.handle.Raw(line) }

func summarize(inputs []run.Input) []run.Input {
	out := make([]run.Input, len(inputs))
	for i, input := range inputs {
		out[i] = input
		if text, ok := input.Value.(string); ok && len(text) > inlineInputChars {
			out[i].Value = nil
		}
	}
	return out
}

func revisionOf(inputs []run.Input, name string) (string, bool) {
	for _, input := range inputs {
		if input.Name == name && input.Revision {
			return input.Identity, true
		}
	}
	return "", false
}

func hasParam(params []definition.Param, name string) bool {
	for _, param := range params {
		if param.Name == name {
			return true
		}
	}
	return false
}

// overlaps reports whether either directory contains the other.
func overlaps(a, b string) bool {
	a, b = clean(a), clean(b)
	return a == b || within(a, b) || within(b, a)
}

func within(path, dir string) bool {
	rel, err := filepath.Rel(dir, path)
	return err == nil && rel != "." && !strings.HasPrefix(rel, "..")
}

func clean(path string) string {
	if resolved, err := filepath.EvalSymlinks(path); err == nil {
		path = resolved
	}
	absolute, _ := filepath.Abs(path)
	return absolute
}
