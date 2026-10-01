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
	"github.com/igor1309/ai-labs/agister/internal/domain/policy"
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
	timer      CallTimer
	ids        IDs
	stateDir   string
	cancels    CallCancels
}

// CallResolver reads the settings a call is resolved from, once, at submit,
// and resolves the call from exactly those.
type CallResolver interface {
	Snapshot(ctx context.Context) CallResolution
}

// CallResolution resolves a call, or a workflow, from the settings it was
// taken over.
type CallResolution interface {
	// Resolve resolves a call's process. A refused call's resolution has
	// what was resolved before the refusal, never nil.
	Resolve(ctx context.Context, request CallResolveRequest) (*ResolvedCall, error)
	// Workflow resolves the workflow of that name; found is false when the
	// settings have none, and the name is a process's.
	Workflow(ctx context.Context, name string) (res *ResolvedWorkflow, found bool, err error)
}

// CallResolveRequest is what a call is resolved from: its process, the
// agent that overrides the process's, and the caller's narrowing limits.
type CallResolveRequest struct {
	Process    string
	Agent      string
	Timeout    string
	MaxCostUSD *float64
}

// ResolvedCall is everything a call needs before inputs and effects.
type ResolvedCall struct {
	Process   CallProcess
	Agent     CallAgent
	Mapping   CallMapping
	Schema    []byte
	Sources   []CallSource
	Effective CallLimits
	Identity  CallRuntime
	Plan      CallPlan
}

// CallProcess is what a call reads of its process's definition.
type CallProcess struct {
	Name        string
	Instruction string
	Params      []CallParam
	Values      []CallValue
	Checkout    string      // name of the input whose revision is checked out
	Output      string      // the output format, "json" or "text"
	Verify      *CallVerify // unset: no verification
}

// CallParam is a param a process or workflow declares.
type CallParam struct {
	Name       string
	Default    string
	HasDefault bool
}

// CallValue is an input a process or workflow declares, and where it comes
// from: its source kind and the source's arguments, which may reference
// ${param.<name>} and ${value.<name>}.
type CallValue struct {
	Name   string
	Source string
	Args   map[string]string
}

// CallVerify is a process's verification command (ADR-002).
type CallVerify struct {
	Command     string
	Timeout     time.Duration // per run
	MaxAttempts int           // runs, the first included
	Instruction string        // what the agent is told when a run fails
}

// CallAgent is the runtime profile a call runs as.
type CallAgent struct {
	Name    string
	Command string
	Model   string
	Effort  string
	Session string // definition.SessionFresh or definition.SessionResumable
}

// CallMapping is the runtime permission mapping a call runs on.
type CallMapping struct {
	Name    string
	Adapter string
}

// CallSource is where a definition a call resolved came from.
type CallSource struct {
	Kind      string
	Name      string
	Path      string
	SHA256    string
	Project   bool
	Overrides string // the global definition this project one takes priority over
}

// CallLimits are a call's composed limits.
type CallLimits struct {
	Timeout     time.Duration
	MaxAttempts int
	MaxCostUSD  *float64 // unset: no cost limit
	Allow       []string
	Deny        []string
	Permissions []string // allowed and not denied
	Require     []string
	Access      string
	Scope       string
	Stale       CallStale
}

// CallRuntime is what a call reads of what its runtime reported about
// itself.
type CallRuntime struct {
	Contract string
	Version  string
	Resume   bool // a turn may resume an earlier provider session in place
	// A session resumes only in the working directory it ran in.
	ResumeWhereItRan bool
}

// CallPlan is what a call grants on its runtime.
type CallPlan struct {
	Primitives []string
	Granted    []string // permissions the primitives provide
	Withheld   []string // allowed but not provided
}

// ResolvedWorkflow is a workflow and its nodes' processes, as a run of it
// uses them. Each node's call resolves its own process again, fully.
type ResolvedWorkflow struct {
	Workflow      CallWorkflow
	NodeProcesses map[string]CallNodeProcess // by name
	Sources       []CallSource               // the workflow's document
}

// CallWorkflow is what a run reads of its workflow's definition.
type CallWorkflow struct {
	Name   string
	Params []CallParam
	Values []CallValue
	FanOut []CallNode
	Join   CallNode
}

// CallNode is one node of a workflow and the process it calls.
type CallNode struct {
	Name    string
	Process string
}

// CallNodeProcess is what a run of a workflow reads of a node's process:
// the names of the params it declares.
type CallNodeProcess struct {
	Params []string
}

// Snapshot returns the resolver over the definitions as they are now (see
// Resolver.frozen), as the resolution a call is executed with.
func (r *Resolver) Snapshot(ctx context.Context) CallResolution {
	return callResolution{resolver: r.frozen(ctx)}
}

// callResolution is a Resolver in the role a call resolves through: it
// translates the Resolver's results into the call's own.
type callResolution struct{ resolver *Resolver }

func (c callResolution) Resolve(ctx context.Context, request CallResolveRequest) (*ResolvedCall, error) {
	res, err := c.resolver.resolve(ctx, request.Process, request.Agent, overrides{timeout: request.Timeout, maxCostUSD: request.MaxCostUSD})
	process, agent, effective := res.process, res.agent, res.effective
	resolved := &ResolvedCall{
		Process: CallProcess{
			Name: process.Name, Instruction: process.Instruction,
			Params: callParams(process.Params), Values: callValues(process.Values),
			Checkout: process.Checkout, Output: process.Output.Format,
		},
		Agent:   CallAgent{Name: agent.Name, Command: agent.Command, Model: agent.Model, Effort: agent.Effort, Session: agent.Session},
		Mapping: CallMapping{Name: res.mapping.Name, Adapter: res.mapping.Adapter},
		Schema:  res.schema,
		Sources: callSources(res.sources),
		Effective: CallLimits{
			Timeout: effective.Timeout, MaxAttempts: effective.MaxAttempts, MaxCostUSD: effective.MaxCostUSD,
			Allow: effective.Allow, Deny: effective.Deny, Permissions: effective.Permissions, Require: effective.Require,
			Access: effective.Access, Scope: effective.Scope, Stale: callStale(effective.Stale),
		},
		Identity: CallRuntime{Contract: res.identity.Contract, Version: res.identity.Version, Resume: res.identity.Resume, ResumeWhereItRan: res.identity.ResumeWhereItRan},
		Plan:     CallPlan{Primitives: res.plan.Primitives, Granted: res.plan.Granted, Withheld: res.plan.Withheld},
	}
	if verify := process.Verify; verify != nil {
		resolved.Process.Verify = &CallVerify{Command: verify.Command, Timeout: verify.Timeout, MaxAttempts: verify.MaxAttempts, Instruction: verify.Instruction}
	}
	return resolved, err
}

func (c callResolution) Workflow(ctx context.Context, name string) (*ResolvedWorkflow, bool, error) {
	res, found, err := c.resolver.workflow(ctx, name)
	if res == nil {
		return nil, found, err
	}
	workflow := res.workflow
	node := func(node definition.Node) CallNode { return CallNode{Name: node.Name, Process: node.Process} }
	resolved := &ResolvedWorkflow{
		Workflow: CallWorkflow{
			Name: workflow.Name, Params: callParams(workflow.Params), Values: callValues(workflow.Values),
			FanOut: translated(workflow.FanOut, node), Join: node(workflow.Join),
		},
		NodeProcesses: make(map[string]CallNodeProcess, len(res.processes)),
		Sources:       callSources(res.sources),
	}
	for name, process := range res.processes {
		resolved.NodeProcesses[name] = CallNodeProcess{
			Params: translated(process.Params, func(param definition.Param) string { return param.Name }),
		}
	}
	return resolved, found, err
}

// callStale is the composed staleness limits as a call reads them: a zero
// one was not set.
func callStale(stale policy.Stale) CallStale {
	var limits CallStale
	for _, limit := range []struct {
		to   *time.Duration
		from *time.Duration
	}{{&limits.NoEvent, stale.NoEvent}, {&limits.NoOutput, stale.NoOutput}, {&limits.ToolCommand, stale.ToolCommand}} {
		if limit.from != nil {
			*limit.to = *limit.from
		}
	}
	if stale.RepeatedToolCalls != nil {
		limits.RepeatedToolCalls = *stale.RepeatedToolCalls
	}
	return limits
}

func callParams(params []definition.Param) []CallParam {
	return translated(params, func(param definition.Param) CallParam {
		return CallParam{Name: param.Name, Default: param.Default, HasDefault: param.HasDefault}
	})
}

func callValues(values []definition.Value) []CallValue {
	return translated(values, func(value definition.Value) CallValue {
		return CallValue{Name: value.Name, Source: value.Source, Args: value.Args}
	})
}

func callSources(sources []definition.Source) []CallSource {
	return translated(sources, func(source definition.Source) CallSource {
		return CallSource{
			Kind: string(source.Kind), Name: source.Name, Path: source.Path, SHA256: source.SHA256,
			Project: source.Project, Overrides: source.Overrides,
		}
	})
}

// translated is items, each translated; nil when items is.
func translated[T, U any](items []T, translate func(T) U) []U {
	if items == nil {
		return nil
	}
	out := make([]U, len(items))
	for i, item := range items {
		out[i] = translate(item)
	}
	return out
}

// CallCancels holds the cancellation of every call running in this
// process, so it can be cancelled from outside the call (Hosted is one).
// The cancel added reports whether it took effect.
type CallCancels interface {
	Add(id string, cancel func() bool)
	Remove(id string)
}

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

// EventSink receives a turn's events, the agent's tool calls and raw runtime
// output.
type EventSink interface {
	Event(source, kind string, data map[string]any)
	// ToolStarted reports a tool call the agent started, and ToolFinished
	// the end of the call of that ID, each beside the event that records it.
	// An adapter that reports them says so in its identity
	// (RuntimeIdentity.ToolCalls).
	ToolStarted(call ToolCall)
	ToolFinished(id string)
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
}

// CallVerifier runs the verification loop of a call whose process declares
// verify (ADR-002; where the command runs, ADR-005), after its first turn
// was valid. It returns the content a passing run checked, on a clean copy
// of the base with the patch to that content applied, empty when none
// passed, and the fault that ended the loop without a pass.
type CallVerifier interface {
	Verify(ctx context.Context, call VerifyCall) (verified string, fault *run.Error)
}

// RunRecorder creates run records owned by the calling process.
type RunRecorder interface {
	Create(ctx context.Context, record run.Record) (RunHandle, error)
}

// CallAdapters are what Calls run on besides their resolver, verifier and
// cancellations. StateDir is Agister's own state, which no agent workspace
// may overlap.
type CallAdapters struct {
	Runners    CallRunners
	Inputs     map[string]InputProvider
	Workspaces CallWorkspaces
	Changes    CallChanges
	Validator  CallValidator
	Recorder   RunRecorder
	Runs       CallRuns
	Clock      CallClock
	Timer      CallTimer
	IDs        IDs
	StateDir   string
}

// NewCalls returns the use case that submits and executes calls. Every
// collaborator is required. timer starts the waits of a call's staleness
// limits. stateDir is Agister's own state, which no agent workspace may
// overlap. cancels is where each running call's cancellation is held.
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
	timer CallTimer,
	ids IDs,
	stateDir string,
	cancels CallCancels,
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
		timer:      timer,
		ids:        ids,
		stateDir:   stateDir,
		cancels:    cancels,
	}
}

// Hosted tracks calls running in this process so they can be cancelled.
// Each cancel reports whether it took effect: a workflow that already
// finished refuses it (see flow.stop).
// It is attached at composition as the CallCancels of Calls and the
// RunsCanceller of Runs.
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

func (h *Hosted) Add(id string, cancel func() bool) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.cancels[id] = cancel
}

func (h *Hosted) Remove(id string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.cancels, id)
}

// Cancel calls the run's cancel outside the lock: a workflow's takes a lock
// of its own, under which it adds the nodes it starts here. It reports
// whether the run was hosted and the cancel took effect.
func (h *Hosted) Cancel(id string) bool {
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
		c.cancels.Add(record.ID, flow.stop)
		go func() {
			defer c.cancels.Remove(record.ID)
			defer cancel()
			c.runWorkflow(runCtx, handle, record, resolver, workflow, workflowErr, flow)
		}()
		return record.ID, nil
	}
	runCtx, cancel := context.WithCancel(WithCorrelation(context.WithoutCancel(ctx), "run_id", record.ID, "process", request.Process))
	c.cancels.Add(record.ID, cancelled(cancel))
	go func() {
		defer c.cancels.Remove(record.ID)
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
	// and the workspace released first. Verified changes that cannot be
	// kept fail the call.
	var collect func() *run.Error
	release := func() error { return nil }
	// owned is the checkout the call made, whether or not its record took
	// it: a failed release leaves it for a reap either way.
	var owned *run.Checkout
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
			// The finished run names the checkout for a later reap to
			// remove (ADR-008 rule 6).
			if owned != nil {
				var unreleased run.Effects
				if record.Effects != nil {
					unreleased = *record.Effects
				}
				unreleased.Unreleased = owned
				record.Effects = &unreleased
			}
		}
		release = func() error { return nil }
		now := c.clock.Now()
		record.FinishedAt = &now
		result.Status, result.Error = run.Completed, fault
		if fault != nil {
			result.Status = run.StatusOf(fault.Class)
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
		c.cancels.Remove(record.ID)
		if err := handle.Finish(record); err != nil {
			// The record kept is not this one: ownership is released over
			// the last one saved, unfinished, which reads as abandoned. The
			// caller, a workflow, takes the call as failed, internal, as it
			// takes any record that could not be saved.
			ended := string(result.Status)
			if fault != nil {
				ended += "/" + string(fault.Class)
			}
			failed := result
			failed.Status, failed.Output = run.Failed, nil
			failed.Error = run.Fault(run.ClassInternal, "its final record could not be saved: %v; it would have ended %s", err, ended)
			final.Result = &failed
		}
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

	res, err := resolver.Resolve(ctx, CallResolveRequest{
		Process: record.Request.Process, Agent: record.Request.Agent,
		Timeout: record.Request.Timeout, MaxCostUSD: record.Request.MaxCostUSD,
	})
	record.Definitions = recordSources(res.Sources)
	if err != nil {
		fail(err)
		return
	}
	runner, err := c.runners.Runner(res.Mapping.Adapter, res.Agent.Command)
	if err != nil {
		fail(refuse("runtime mapping %s: %v", res.Mapping.Name, err))
		return
	}
	record.Agent = res.Agent.Name
	record.Profile = &run.Profile{Model: res.Agent.Model, Effort: res.Agent.Effort, Session: res.Agent.Session}
	record.Effective = recordEffective(res.Effective)
	record.Verify = recordVerify(res.Process.Verify)
	record.Runtime = &run.Runtime{Mapping: res.Mapping.Name, Adapter: res.Mapping.Adapter, Contract: res.Identity.Contract, Version: res.Identity.Version}
	record.Plan = recordPlan(res.Plan)
	_ = handle.Update(record)
	event(run.SourceAgister, "PLANNED", map[string]any{"primitives": res.Plan.Primitives, "granted": res.Plan.Granted, "withheld": res.Plan.Withheld})
	if len(res.Plan.Withheld) > 0 {
		event(run.SourceAgister, "PERMISSIONS_WITHHELD", map[string]any{"permissions": res.Plan.Withheld})
	}

	resumeSessionID, sessionBefore, err := c.continuation(ctx, res, record.ID, record.Request.Continue, record.Request.Cwd)
	if err != nil {
		fail(err)
		return
	}

	inputs, err := c.resolveValues(ctx, "process "+res.Process.Name, res.Process.Params, res.Process.Values, record.Request, collection)
	if err != nil {
		fail(err)
		return
	}
	record.Inputs = summarize(inputs)
	_ = handle.Update(record)

	workspace, err := c.prepareWorkspace(ctx, res.Process.Checkout, inputs, record.Request.Cwd)
	if err != nil {
		fail(err)
		return
	}
	release = workspace.Release
	record.Workspace = workspace.Dir
	revision, _ := revisionOf(inputs, res.Process.Checkout)
	// The content a passing verification run checked, whose patch is what
	// the call delivers (ADR-005 rule 1).
	var verified string
	if workspace.Owned {
		// Recorded before the runtime starts: if this process is killed,
		// a later reap removes the checkout. A checkout that cannot be
		// recorded is one nobody could find, so it is released and the
		// call refused.
		owned = &run.Checkout{Repository: workspace.Repository, Dir: workspace.Dir}
		record.Effects = &run.Effects{Checkout: owned}
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
		Instruction:     prompt.Instruction(res.Process.Instruction, res.Plan.Granted, res.Plan.Withheld),
		Cwd:             workspace.Dir,
		ResumeSessionID: resumeSessionID,
		MaxCostUSD:      res.Effective.MaxCostUSD,
		Model:           res.Agent.Model,
		Effort:          res.Agent.Effort,
		Primitives:      res.Plan.Primitives,
		Timeout:         res.Effective.Timeout,
		OutputSchema:    res.Schema,
	}
	_ = handle.Update(record)

	// The call's timeout bounds every turn and every verification run.
	deadline := c.clock.Now().Add(res.Effective.Timeout)
	// Usage and cost sum every turn's own; the latest turn's text and
	// output are the call's. before is the resumed session's totals before
	// the turn, recorded with it; nil when unknown.
	var turns []run.Turn
	var turnMS int64
	take := func(request TurnRequest, before *run.SessionTotals) run.Turn {
		// Whatever output an earlier turn had is not the call's any more.
		result.Output = nil
		turnStart := c.clock.Now()
		// The turn runs under a context of its own, which a staleness limit
		// cancels: the runtime ends as on any cancellation, and the turn is
		// decided as stale only if that is what ended it.
		// Both are ended however the turn returns, a panic included: nothing
		// is watched, and nothing recorded, once it has.
		turnCtx, end := context.WithCancel(ctx)
		defer end()
		watch := watchTurn(&sink{handle: handle, clock: c.clock, record: &record}, res.Effective.Stale, c.timer, c.clock, end)
		defer watch.end()
		turn := runner.RunTurn(turnCtx, request, watch)
		if stale := watch.end(); stale != nil {
			turn.Stale = stale
			if ctx.Err() == nil && turn.Error != nil && turn.Error.Class == run.ClassCancelled {
				turn.Error = staleFault(*stale)
				turn.Status = run.StatusOf(turn.Error.Class)
			}
		}
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
		if turn.Status == run.Completed && res.Process.Output == "json" {
			validation = c.validator.Validate(res.Schema, turn.Output)
		}
		_, fault := run.Conclude(turn, definition.Output{Format: res.Process.Output}, validation)
		// A contract-valid output is kept whatever then ends the call: a
		// failed verification is still the call's status and class.
		if fault == nil && res.Process.Output == "json" {
			result.Output = turn.Output
		}
		return fault
	}

	turn := take(request, sessionBefore)
	if turn.ProviderSessionID != "" {
		result.Session = &run.Session{ProviderSessionID: turn.ProviderSessionID, Continues: record.Request.Continue}
	}
	fault := conclude(turn)
	if verify := res.Process.Verify; fault == nil && verify != nil {
		verified, fault = c.verifier.Verify(ctx, VerifyCall{
			Record: &record, Result: &result, Event: event, Update: handle.Update, Artifact: handle.Artifact,
			Verify: definition.Verify{Command: verify.Command, Timeout: verify.Timeout, MaxAttempts: verify.MaxAttempts, Instruction: verify.Instruction}, Limit: res.Effective.MaxCostUSD, Deadline: deadline, NoOutput: res.Effective.Stale.NoOutput,
			Dir: workspace.Dir, Base: revision, Repository: workspace.Repository, Request: request, Session: turn.ProviderSessionID,
			Take: take, Conclude: conclude,
		})
	}
	finish(fault)
	return final
}

// runWorkflow runs one workflow and finishes its run. res and resErr are the
// workflow as the settings snapshot resolved it.
func (c *Calls) runWorkflow(ctx context.Context, handle RunHandle, record run.Record, resolver CallResolution, res *ResolvedWorkflow, resErr error, flow *flow) {
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
			c.cancels.Remove(record.ID)
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
		record.Definitions = recordSources(res.Sources)
	}
	if resErr != nil {
		refused(resErr)
		return
	}
	if err := workflowRequest(record.Request); err != nil {
		refused(err)
		return
	}
	workflow := res.Workflow
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
	start := func(index int, node CallNode, params map[string]string, collection *Resolved) (started bool, err error) {
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
		for _, param := range res.NodeProcesses[node.Process].Params {
			if value, ok := values[param]; ok {
				params[param] = value
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
	// The join runs on the fan-out nodes that completed (ADR-004); the record
	// names each that did not.
	var incomplete []string
	for i := range workflow.FanOut {
		node := &state.Nodes[i]
		if node.Status == "" {
			node.Status, node.Error = run.Failed, run.Fault(run.ClassInternal, "it did not start: an earlier node could not")
		}
		if node.Status != run.Completed {
			incomplete = append(incomplete, node.Name)
		}
	}
	if len(incomplete) == len(workflow.FanOut) {
		first := state.Nodes[0]
		state.Barrier = run.Barrier{State: run.BarrierBlocked, BlockedBy: first.Name, Incomplete: incomplete}
		event("BARRIER", map[string]any{"state": state.Barrier.State, "blocked_by": first.Name, "incomplete": incomplete})
		class, reason := run.ClassInternal, string(first.Status)
		if first.Error != nil {
			class, reason = first.Error.Class, first.Error.String()
		}
		finish(first.Status, run.Fault(class, "no fan-out node completed, so the join did not start; the first, fan-out node %s (run %s): %s", first.Name, or(first.Run, "none"), reason))
		return
	}
	state.Barrier = run.Barrier{State: run.BarrierPassed, Incomplete: incomplete}
	passed := map[string]any{"state": state.Barrier.State}
	if len(incomplete) > 0 {
		passed["incomplete"] = incomplete
	}
	event("BARRIER", passed)

	collection, data, err := collect(workflow, state.Nodes, outputs)
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
func (c *Calls) startNode(ctx context.Context, parent string, node CallNode, params map[string]string, collection *Resolved, cwd string, resolver CallResolution, ended func(run.Record)) (string, error) {
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
	c.cancels.Add(record.ID, cancelled(cancel))
	go func() {
		defer c.cancels.Remove(record.ID)
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
func (c *Calls) continuation(ctx context.Context, res *ResolvedCall, self, runID, cwd string) (string, *run.SessionTotals, error) {
	if runID == "" {
		return "", nil, nil
	}
	if res.Agent.Session != definition.SessionResumable {
		return "", nil, refuse("agent %s is %s; it cannot continue run %s", res.Agent.Name, res.Agent.Session, runID)
	}
	if !res.Identity.Resume {
		return "", nil, refuse("runtime %s cannot continue sessions", res.Mapping.Name)
	}
	prior, state, err := c.runs.Get(ctx, runID)
	if err != nil {
		return "", nil, refuse("run %s: %v", runID, err)
	}
	switch {
	case state != run.StateFinished:
		return "", nil, refuse("run %s is %s, not finished", runID, state)
	case prior.Agent != res.Agent.Name:
		return "", nil, refuse("run %s ran agent %s; only agent %s's own runs can be continued by it", runID, prior.Agent, res.Agent.Name)
	case prior.Runtime == nil || prior.Runtime.Adapter != res.Mapping.Adapter:
		return "", nil, refuse("run %s did not run on %s", runID, res.Mapping.Adapter)
	case prior.Result == nil || prior.Result.Session == nil || prior.Result.Session.ProviderSessionID == "":
		return "", nil, refuse("run %s has no provider session", runID)
	}
	if res.Identity.ResumeWhereItRan {
		if err := c.whereItRan(ctx, res, prior, cwd); err != nil {
			return "", nil, err
		}
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

// whereItRan refuses a continuation of run prior, on a runtime that
// resumes a session only in the directory it ran in, that would work
// anywhere else: in a checkout of its own, made for the call, or in
// another directory than prior worked in. It makes no workspace.
func (c *Calls) whereItRan(ctx context.Context, res *ResolvedCall, prior run.Record, cwd string) error {
	if res.Process.Checkout != "" {
		return refuse("runtime %s resumes a session only in the directory it ran in, and process %s works in a checkout of its own; it cannot continue run %s",
			res.Mapping.Name, res.Process.Name, prior.ID)
	}
	if prior.Workspace == "" {
		return refuse("runtime %s resumes a session only in the directory it ran in, and run %s recorded none", res.Mapping.Name, prior.ID)
	}
	if here := c.workspaceRoot(ctx, cwd); filepath.Clean(here) != filepath.Clean(prior.Workspace) {
		return refuse("runtime %s resumes a session only in the directory it ran in: run %s worked in %s, not %s", res.Mapping.Name, prior.ID, prior.Workspace, here)
	}
	return nil
}

// collectChanges keeps a call's changes to its own workspace as an
// artifact: the patch from revision to the checkout's content, or to
// verified when it names the content a verification run passed on. That
// run checked a clean copy of revision with this very patch applied, so the
// patch delivers exactly what passed (ADR-005 rule 1). A failure is
// recorded; it does not change the call's status, unless the changes were
// verified: then the call fails.
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
			return nil, run.Fault(run.ClassInternal, "the changes that passed verification could not be kept: %v", err)
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
func (c *Calls) resolveValues(ctx context.Context, subject string, declared []CallParam, values []CallValue, request run.Request, collection *Resolved) ([]run.Input, error) {
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
		args, err := definition.Value{Name: value.Name, Source: value.Source, Args: value.Args}.Bind(params, texts)
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

// workspaceRoot is the repository of cwd, or cwd outside one: the
// directory a call without a checkout works in.
func (c *Calls) workspaceRoot(ctx context.Context, cwd string) string {
	root, err := c.workspaces.Root(ctx, cwd)
	if err != nil {
		return cwd
	}
	return root
}

// prepareWorkspace returns the agent's working directory: a checkout of the
// revision of the input checkout names, or, when it names none, the
// repository. It must not overlap Agister's state.
func (c *Calls) prepareWorkspace(ctx context.Context, checkout string, inputs []run.Input, cwd string) (preparedWorkspace, error) {
	noop := func() error { return nil }
	root := c.workspaceRoot(ctx, cwd)
	if overlaps(root, c.stateDir) {
		return preparedWorkspace{}, refuse("workspace %s overlaps Agister's state %s", root, c.stateDir)
	}
	if checkout == "" {
		return preparedWorkspace{Dir: root, Repository: root, Release: noop}, nil
	}
	var revision string
	for _, input := range inputs {
		if input.Name == checkout && input.Revision {
			revision = input.Identity
		}
	}
	if revision == "" {
		return preparedWorkspace{}, refuse("workspace.checkout: input %s is not a revision", checkout)
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

func hasParam(params []CallParam, name string) bool {
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
