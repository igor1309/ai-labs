package app

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"path/filepath"
	"slices"
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
	preparer   CallPreparer
	borrower   CallBorrower
	verifier   CallVerifier
	recoverer  CallRecoverer
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
// agent that overrides the process's, the caller's narrowing limits and the
// workspace mode the caller asks for (ADR-022 rule 1).
type CallResolveRequest struct {
	Process    string
	Agent      string
	Timeout    string
	MaxCostUSD *float64
	Workspace  string
}

// ResolvedCall is everything a call needs before inputs and effects.
type ResolvedCall struct {
	Process CallProcess
	Agent   CallAgent
	Mapping CallMapping
	Schema  []byte
	Prompts map[string]Resolved // by name: each prompt's text, identified by its digest
	Absent  []CallAbsent        // the optional prompt inputs whose prompt neither layer has (ADR-019)
	// Skills are the call's skills, in order: the process's, then its
	// agent's, each once (ADR-021).
	Skills    []CallSkill
	Sources   []CallSource
	Effective CallLimits
	Identity  CallRuntime
	Plan      CallPlan
}

// CallSkill is one skill a call is given, as it was read with the call: an
// adapter gives it from here, without reading the settings again.
type CallSkill struct {
	Name string
	// Bytes are the whole SKILL.md, unchanged, front matter included.
	Bytes    []byte
	Identity string // sha256:<digest of Bytes>
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
	// Setup is the setup its checkout runs (ADR-012), the process's own or
	// the workspace's; unset: none.
	Setup *CallSetup
	// InPlace says the call works in the caller's worktree, not a checkout
	// of its own (ADR-022); Precheck gates it there, unset: none.
	InPlace  bool
	Precheck *CallSetup
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

// CallAbsent is an optional prompt input whose prompt neither layer has
// (ADR-019): the call goes ahead without it, and only it.
type CallAbsent struct {
	Index  int // among the process's values
	Input  string
	Prompt string
}

// CallVerify is a process's verification command (ADR-002).
type CallVerify struct {
	Command     string
	Timeout     time.Duration // per run
	MaxAttempts int           // runs, the first included
	Instruction string        // what the agent is told when a run fails
	// InWorkspace says the command runs in the worktree of an in-place
	// call, not on a clean copy (ADR-022 rule 6).
	InWorkspace bool
}

// CallSetup is the command that prepares a call's checkout before its
// first turn (ADR-012), and where it came from.
type CallSetup struct {
	Command string
	Timeout time.Duration
	From    string // run.SetupFromProcess or run.SetupFromWorkspace
	Path    string // the document it came from
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
	res, err := c.resolver.resolve(ctx, request.Process, request.Agent, overrides{timeout: request.Timeout, maxCostUSD: request.MaxCostUSD, workspace: request.Workspace})
	process, agent, effective := res.process, res.agent, res.effective
	resolved := &ResolvedCall{
		Process: CallProcess{
			Name: process.Name, Instruction: process.Instruction,
			Params: callParams(process.Params), Values: callValues(process.Values),
			Checkout: process.Checkout, Output: process.Output.Format, InPlace: res.inPlace,
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
		resolved.Process.Verify = &CallVerify{Command: verify.Command, Timeout: verify.Timeout, MaxAttempts: verify.MaxAttempts, Instruction: verify.Instruction,
			InWorkspace: verify.Where == definition.WhereWorkspace}
	}
	for name, prompt := range res.prompts {
		if resolved.Prompts == nil {
			resolved.Prompts = map[string]Resolved{}
		}
		resolved.Prompts[name] = Resolved{Value: prompt.Text, Identity: "sha256:" + prompt.Source.SHA256}
	}
	resolved.Absent = translated(res.absent, func(absent absentInput) CallAbsent {
		return CallAbsent{Index: absent.index, Input: absent.input, Prompt: absent.prompt}
	})
	resolved.Skills = translated(res.skills, func(skill definition.Skill) CallSkill {
		return CallSkill{Name: skill.Name, Bytes: skill.Bytes, Identity: "sha256:" + skill.Source.SHA256}
	})
	if setup := res.setup; setup != nil {
		resolved.Process.Setup = &CallSetup{Command: setup.Command, Timeout: setup.Timeout, From: setup.from, Path: setup.path}
	}
	if precheck := res.precheck; precheck != nil {
		resolved.Process.Precheck = &CallSetup{Command: precheck.Command, Timeout: precheck.Timeout, From: precheck.from, Path: precheck.path}
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
	limits.Recover = CallRecover{MaxResumes: stale.Recover.MaxResumes, Instruction: stale.Recover.Instruction}
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
// The cancel added reports whether it took effect. Remove takes it away
// once the call is no longer cancellable; End says the call has finished:
// its execution has ended and its cleanup been attempted, with any failure
// recorded on its run.
type CallCancels interface {
	Add(id string, cancel func() bool)
	Remove(id string)
	End(id string)
}

// CallRunners builds the runner of the runtime a call resolved to.
type CallRunners interface {
	Runner(adapter, command string) (TurnRunner, error)
}

// TurnRunner drives one runtime. It knows nothing of permissions, policies
// or processes.
type TurnRunner interface {
	Identity(ctx context.Context) (RuntimeIdentity, error)
	// Admit tells, before the call checks out, carries changes or runs its
	// setup, whether the runner can run a first turn that carries start:
	// nil when it can, else the fault the turn would end with.
	Admit(start TurnStart) *run.Error
	RunTurn(ctx context.Context, request TurnRequest, sink EventSink) run.Turn
}

// EventSink receives a turn's events, the agent's tool calls and raw runtime
// output.
type EventSink interface {
	Event(source, kind string, data map[string]any)
	// ToolStarted reports a tool call the agent started, and ToolFinished
	// the end of the call of the result's ID, with the result where the
	// runtime reported one, each beside the event that records it. An
	// adapter that reports them says so in its identity
	// (RuntimeIdentity.ToolCalls).
	ToolStarted(call ToolCall)
	ToolFinished(result ToolResult)
	// PermissionDenied reports a tool call the runtime refused for want of
	// a permission, where its stream lists them.
	PermissionDenied(denial PermissionDenial)
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
// run continued, every run's record for the session's latest run and its
// totals, and that run's changes to carry (ADR-013). A record that is not
// finished and no longer owned reads as abandoned.
type CallRuns interface {
	Get(ctx context.Context, id string) (run.Record, run.State, error)
	// ListStrict refuses an incomplete listing when any record cannot be read.
	ListStrict(ctx context.Context) ([]run.Record, error)
	// Artifact reads back the bytes of an artifact the run stored, as its
	// record names it.
	Artifact(ctx context.Context, runID string, artifact run.Artifact) ([]byte, error)
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
	// RepositoryIdentity is the canonical Git common directory, which survives
	// removal of a worktree.
	RepositoryIdentity(ctx context.Context, repository string) (string, error)
	// SameRepository compares repository identities, including distinct
	// worktrees of one repository.
	SameRepository(ctx context.Context, first, second string) (bool, error)
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
	// Apply applies a patch Changes made to the checkout's files; with
	// check, it only checks that the whole patch applies, and changes
	// nothing.
	Apply(ctx context.Context, dir string, patch []byte, check bool) error
	// Rebuild names the content revision has with patch applied, as
	// Identity would name a checkout of it, without making one.
	Rebuild(ctx context.Context, dir, revision string, patch []byte) (string, error)
}

// CallPreparer runs a call's checkout's setup once, with the operator's
// authority, before its first turn (ADR-012), and returns why the call
// fails, if it does.
type CallPreparer interface {
	Setup(ctx context.Context, call SetupCall) *run.Error
}

// CallBorrower lends an in-place call the caller's worktree (ADR-022), or
// refuses it, before the call's first turn: it holds the worktree's lock,
// which the call keeps until its changes are captured, and admits the
// worktree only as the revision left it, after its precheck. It never
// changes the worktree.
type CallBorrower interface {
	Borrow(ctx context.Context, call BorrowCall) (*Borrowed, error)
}

// CallVerifier runs the verification loop of a call whose process declares
// verify (ADR-002; where the command runs, ADR-005), after its first turn
// was valid. It returns the content a passing run checked, on a clean copy
// of the base with the patch to that content applied, empty when none
// passed, and the fault that ended the loop without a pass.
type CallVerifier interface {
	Verify(ctx context.Context, call VerifyCall) (verified string, fault *run.Error)
}

// CallRecoverer gives a call its turns with stale recovery (ADR-024): the
// take and conclude it returns are the call's own, where a turn Agister
// ended at a staleness limit is followed by a recovery turn while the
// call's budget, time and cost allow, each recorded before the call goes
// on. A call without a budget of resumes gets its own back.
type CallRecoverer interface {
	Recover(ctx context.Context, call RecoverCall) (take func(TurnRequest, *run.SessionTotals) run.Turn, conclude func(run.Turn) *run.Error)
}

// RunRecorder creates run records owned by the calling process.
type RunRecorder interface {
	Create(ctx context.Context, record run.Record) (RunHandle, error)
}

// CallAdapters are what Calls run on besides their resolver, preparer,
// verifier, recoverer and cancellations. StateDir is Agister's own state, which no
// agent workspace may overlap.
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
// collaborator is required. borrower lends in-place calls the caller's
// worktree. timer starts the waits of a call's staleness limits. stateDir
// is Agister's own state, which no agent workspace may overlap. cancels is
// where each running call's cancellation is held.
func NewCalls(
	resolver CallResolver,
	runners CallRunners,
	inputs map[string]InputProvider,
	workspaces CallWorkspaces,
	changes CallChanges,
	preparer CallPreparer,
	borrower CallBorrower,
	verifier CallVerifier,
	recoverer CallRecoverer,
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
		preparer:   preparer,
		borrower:   borrower,
		verifier:   verifier,
		recoverer:  recoverer,
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

// Hosted tracks calls running in this process so they can be cancelled,
// and says when each has finished (Done).
// Each cancel reports whether it took effect: a workflow that already
// finished refuses it (see flow.stop).
// It is attached at composition as the CallCancels of Calls and the
// RunsCanceller of Runs.
type Hosted struct {
	mu      sync.Mutex
	cancels map[string]func() bool
	// done holds, by run ID, the channel each call running here closes when
	// it ends.
	done map[string]chan struct{}
	// captured, when set, runs after a cancel took a run's callback and
	// before it calls it; tests use it to let the run end in between.
	captured func(id string)
}

func NewHosted() *Hosted {
	return &Hosted{cancels: map[string]func() bool{}, done: map[string]chan struct{}{}}
}

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
	if _, ok := h.done[id]; !ok {
		h.done[id] = make(chan struct{})
	}
}

func (h *Hosted) Remove(id string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.cancels, id)
}

// End closes the call's Done and forgets it.
func (h *Hosted) End(id string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if done, ok := h.done[id]; ok {
		close(done)
		delete(h.done, id)
	}
}

// Done returns a channel closed once the call id hosted here has finished:
// its execution has ended and its cleanup (ending its processes, releasing
// its workspace) has been attempted, any failure recorded on its run. It
// does not promise that cleanup succeeded (ADR-008 rule 6). For a call not
// running here, finished or never hosted, it is closed already.
func (h *Hosted) Done(id string) <-chan struct{} {
	h.mu.Lock()
	defer h.mu.Unlock()
	if done, ok := h.done[id]; ok {
		return done
	}
	ended := make(chan struct{})
	close(ended)
	return ended
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
			Workspace:  request.Workspace,
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
			defer c.cancels.End(record.ID)
			defer c.cancels.Remove(record.ID)
			defer cancel()
			c.runWorkflow(runCtx, handle, record, resolver, workflow, workflowErr, flow)
		}()
		return record.ID, nil
	}
	runCtx, cancel := context.WithCancel(WithCorrelation(context.WithoutCancel(ctx), "run_id", record.ID, "process", request.Process))
	c.cancels.Add(record.ID, cancelled(cancel))
	go func() {
		defer c.cancels.End(record.ID)
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
	// ended says the call's processes are known to have ended as it
	// finishes: every runtime and command run ends its process before it
	// returns. A panic may leave one.
	ended := true
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
		known := ended
		record.ProcessesEnded = &known
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
			ended = false
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
		Workspace: record.Request.Workspace,
	})
	record.Definitions = recordSources(res.Sources)
	record.AbsentPrompts = recordAbsent(res.Absent)
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
	record.Setup = recordSetup(res.Process.Setup)
	record.Precheck = recordPrecheck(res.Process.Precheck)
	record.Runtime = &run.Runtime{Mapping: res.Mapping.Name, Adapter: res.Mapping.Adapter, Contract: res.Identity.Contract, Version: res.Identity.Version}
	record.Plan = recordPlan(res.Plan)
	_ = handle.Update(record)
	event(run.SourceAgister, "PLANNED", map[string]any{"primitives": res.Plan.Primitives, "granted": res.Plan.Granted, "withheld": res.Plan.Withheld})
	if len(res.Plan.Withheld) > 0 {
		event(run.SourceAgister, "PERMISSIONS_WITHHELD", map[string]any{"permissions": res.Plan.Withheld})
	}

	resumed, err := c.continuation(ctx, res, record.ID, record.Request.Continue, record.Request.Cwd)
	if err != nil {
		fail(err)
		return
	}
	skills := translated(res.Skills, func(skill CallSkill) TurnSkill { return TurnSkill{Name: skill.Name, Bytes: skill.Bytes} })
	// A first turn the runner cannot run costs no checkout, carried changes
	// or setup: it is refused before any of them.
	if fault := runner.Admit(TurnStart{ResumeSessionID: resumed.session, Skills: skills}); fault != nil {
		if fault.Class == run.ClassRefused {
			fail(refuse("%s", fault.Message))
		} else {
			finish(fault)
		}
		return
	}

	inputs, err := c.resolveValues(ctx, "process "+res.Process.Name, res.Process.Params, res.Process.Values, record.Request, collection, res.Prompts, res.Absent)
	if err != nil {
		fail(err)
		return
	}
	record.Inputs = summarize(inputs)
	_ = handle.Update(record)
	revision, _ := revisionOf(inputs, res.Process.Checkout)
	// The changes carried go only onto the base they are from (ADR-013 rule
	// 2), which is known only now. A checkout input that is no revision is
	// refused as the workspace is prepared.
	if carry := resumed.carry; carry != nil && revision != "" {
		if err := carry.onto(res, revision); err != nil {
			fail(err)
			return
		}
	}

	workspace, err := c.prepareWorkspace(ctx, res.Process.Checkout, res.Process.InPlace, inputs, record.Request.Cwd)
	if err != nil {
		fail(err)
		return
	}
	release = workspace.Release
	record.Workspace = workspace.Dir
	// The content a passing verification run checked, whose patch is what
	// the call delivers (ADR-005 rule 1).
	var verified string
	// inWorkspace verifies in the caller's worktree, not on a clean copy:
	// only an in-place call whose verification says so (ADR-022 rule 6).
	inWorkspace := res.Process.InPlace && res.Process.Verify != nil && res.Process.Verify.InWorkspace
	if res.Process.InPlace {
		// The caller's worktree, borrowed: no checkout, setup or release. Its
		// lock is held until the changes are captured, and nothing in it is
		// reset, cleaned or removed, whatever the end (ADR-022 rule 7).
		verify := ""
		switch {
		case inWorkspace:
			verify = run.VerifyInWorkspace
		case res.Process.Verify != nil:
			verify = run.VerifyOnCopy
		}
		var precheck *BorrowPrecheck
		if p := res.Process.Precheck; p != nil {
			precheck = &BorrowPrecheck{Command: p.Command, Timeout: p.Timeout}
		}
		borrowed, err := c.borrower.Borrow(ctx, BorrowCall{
			Record: &record, Event: event, Update: handle.Update,
			Dir: workspace.Dir, RepositoryIdentity: workspace.RepositoryIdentity, Revision: revision, Precheck: precheck, Verify: verify,
			Latest: resumed.worktree,
		})
		if err != nil {
			fail(err)
			return
		}
		release = borrowed.Release
		if setup := res.Process.Setup; setup != nil {
			event(run.SourceAgister, "SETUP_SKIPPED", map[string]any{"command": setup.Command, "reason": "an in-place call works in the worktree its caller prepared (ADR-022 rule 5)"})
		}
		collect = func() *run.Error {
			ctx := context.WithoutCancel(ctx)
			// A commit the agent made fails the call, and stays; the patch is
			// still taken from the revision.
			var fault *run.Error
			head, err := borrowed.Head(ctx)
			switch {
			case err != nil:
				fault = run.Fault(run.ClassInternal, "reading the worktree's HEAD: %v", err)
			case head != revision:
				event(run.SourceAgister, "WORKTREE_COMMITTED", map[string]any{"head": head, "revision": revision})
				fault = run.Fault(run.ClassCommitted, "the worktree's HEAD is %s, not revision %s: the agent committed in the caller's worktree; its commit stays", head, revision)
			}
			// What passed in the worktree was never rebuilt from the patch:
			// the capture is checked to rebuild it (ADR-022 rule 6).
			artifacts, content, failed := c.collectChanges(ctx, handle, workspace.Dir, revision, verified, inWorkspace, event)
			result.Artifacts = artifacts
			record.InPlace.Content = content
			if fault == nil {
				fault = failed
			}
			return fault
		}
	}
	if workspace.Owned {
		// Recorded before the runtime starts: if this process is killed,
		// a later reap removes the checkout. A checkout that cannot be
		// recorded is one nobody could find, so it is released and the
		// call refused.
		owned = &run.Checkout{Repository: workspace.Repository, RepositoryIdentity: workspace.RepositoryIdentity, Dir: workspace.Dir, Revision: revision}
		record.Effects = &run.Effects{Checkout: owned}
		if err := handle.Update(record); err != nil {
			record.Effects = nil
			fail(fmt.Errorf("recording the checkout failed: %w", err))
			return
		}
		// Changes that cannot be carried cost no setup (ADR-013 rule 3).
		carry := resumed.carry
		if carry != nil {
			if err := c.changes.Apply(ctx, workspace.Dir, carry.patch, true); err != nil {
				fail(refuse("run %s's changes do not apply to revision %s: %v", carry.from, revision, err))
				return
			}
		}
		// The setup prepares the checkout before the runtime reads it, once:
		// repair turns continue in the same checkout (ADR-012). A failed one
		// ends the call before any turn, and leaves no changes of the
		// call's to keep.
		if setup := res.Process.Setup; setup != nil {
			if fault := c.preparer.Setup(ctx, SetupCall{
				Record: &record, Event: event, Update: handle.Update, Artifact: handle.Artifact,
				Setup: SetupCommand{Command: setup.Command, Timeout: setup.Timeout}, Dir: workspace.Dir, Base: revision,
			}); fault != nil {
				finish(fault)
				return
			}
		}
	}

	// Every continuation's record has been in the session since Create. Check
	// again after setup, before applying the selected patch or starting a turn.
	if err := c.currentResumption(ctx, resumed, record.ID, record.Request.Continue); err != nil {
		fail(err)
		return
	}
	if workspace.Owned {
		carry := resumed.carry
		// The setup saw the revision's content; the changes carried are the
		// session's, applied before its first turn here. The call's own patch
		// is still from the revision, so it holds them once.
		if carry != nil {
			if err := c.changes.Apply(ctx, workspace.Dir, carry.patch, false); err != nil {
				fail(refuse("run %s's changes could not be applied to revision %s: %v", carry.from, revision, err))
				return
			}
			event(run.SourceAgister, "CHANGES_CARRIED", map[string]any{"run": carry.from, "digest": carry.artifact.Digest, "bytes": carry.artifact.Bytes})
		}
		collect = func() *run.Error {
			artifacts, _, fault := c.collectChanges(ctx, handle, workspace.Dir, revision, verified, false, event)
			result.Artifacts = artifacts
			return fault
		}
	}

	text := prompt.Inputs(inputs)
	// A continued call in a checkout of its own is told where it works now,
	// and what of the session's work is there (ADR-013 rule 4); one in the
	// caller's worktree, that the session's work is there already (ADR-022
	// rule 8).
	switch {
	case record.Request.Continue != "" && workspace.Owned:
		var from string
		if resumed.carry != nil {
			from = resumed.carry.from
		}
		text = strings.TrimSuffix(prompt.Continues(record.Request.Continue, from, workspace.Dir, revision)+"\n\n"+text, "\n\n")
	case resumed.worktree != nil:
		text = strings.TrimSuffix(prompt.ContinuesInPlace(record.Request.Continue, resumed.worktree.ID, workspace.Dir, revision)+"\n\n"+text, "\n\n")
	}
	request := TurnRequest{
		Prompt:          text,
		Instruction:     prompt.Instruction(res.Process.Instruction, res.Plan.Granted, res.Plan.Withheld),
		Cwd:             workspace.Dir,
		ResumeSessionID: resumed.session,
		MaxCostUSD:      res.Effective.MaxCostUSD,
		Model:           res.Agent.Model,
		Effort:          res.Agent.Effort,
		Primitives:      res.Plan.Primitives,
		Timeout:         res.Effective.Timeout,
		OutputSchema:    res.Schema,
		Skills:          skills,
	}
	// A call without a checkout has its workspace on record from here: one
	// killed before its runtime's process is on record too leaves a run a
	// reap finishes, which takes only runs with effects on record, so they
	// start empty (ADR-022 rule 3).
	if record.Effects == nil {
		record.Effects = &run.Effects{}
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
		// The call's session is the first one a turn of it reported.
		if result.Session == nil && turn.ProviderSessionID != "" {
			result.Session = &run.Session{ProviderSessionID: turn.ProviderSessionID, Continues: record.Request.Continue}
		}
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

	// Every turn of the call is taken with its stale recovery (ADR-024):
	// the first, and each the verification loop takes.
	take, conclude = c.recoverer.Recover(ctx, RecoverCall{
		Record: &record, Result: &result, Event: event, Update: handle.Update,
		Recover: res.Effective.Stale.Recover, Limit: res.Effective.MaxCostUSD, Deadline: deadline,
		Take: take, Conclude: conclude,
	})

	turn := take(request, resumed.before)
	fault := conclude(turn)
	if verify := res.Process.Verify; fault == nil && verify != nil {
		verified, fault = c.verifier.Verify(ctx, VerifyCall{
			Record: &record, Result: &result, Event: event, Update: handle.Update, Artifact: handle.Artifact,
			Verify: definition.Verify{Command: verify.Command, Timeout: verify.Timeout, MaxAttempts: verify.MaxAttempts, Instruction: verify.Instruction}, Limit: res.Effective.MaxCostUSD, Deadline: deadline, NoOutput: res.Effective.Stale.NoOutput,
			Dir: workspace.Dir, Base: revision, Repository: workspace.Repository, InWorkspace: inWorkspace, Request: request, Session: turn.ProviderSessionID,
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
	inputs, err := c.resolveValues(ctx, "workflow "+workflow.Name, workflow.Params, workflow.Values, record.Request, nil, nil, nil)
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
		defer c.cancels.End(record.ID)
		defer c.cancels.Remove(record.ID)
		defer cancel()
		ended(c.execute(nodeCtx, handle, record, resolver, collection))
	}()
	return record.ID, nil
}

// resumption is what a continued call resumes: the provider session, which
// the runtime resumes in place, its totals before the call's first turn,
// and, for a call with a checkout of its own, the changes it carries
// (ADR-013), or, for an in-place call, the session's latest run, whose
// changes are already in the worktree (ADR-022 rule 8); all unset for a
// fresh session.
type resumption struct {
	session  string
	latest   string // selected before checkout setup
	before   *run.SessionTotals
	carry    *carried
	worktree *run.Record
}

// carried is the changes.patch of a continued session's latest run, read and
// matched against its digest, to apply to the call's checkout.
type carried struct {
	from     string // the session's latest run
	artifact run.Artifact
	patch    []byte
	// base is the revision the latest run's checkout was of; empty on its
	// record when made before it was recorded.
	base string
	// process and inputs are that run's, which name its revision then.
	process     string
	definitions []run.DefinitionSource
	inputs      []run.Input
}

// onto refuses changes carried onto another revision than they are from
// (ADR-013 rule 2). A record that names no revision is taken at its input
// the call's process checks out, when its recorded definition matches.
func (c *carried) onto(res *ResolvedCall, revision string) error {
	process := res.Process
	base := c.base
	if base == "" && c.process == process.Name {
		before := processDigest(c.definitions, c.process)
		if before == "" || before != processDigest(recordSources(res.Sources), process.Name) {
			return refuse("the revision run %s worked on is unknown: its process definition cannot be matched to the current process %s; its changes cannot be carried", c.from, process.Name)
		}
		for _, input := range c.inputs {
			if input.Name == process.Checkout && input.Revision {
				base = input.Identity
			}
		}
	}
	switch {
	case base == "" && c.process != process.Name:
		return refuse("the revision run %s worked on is unknown: its record names none, and it ran process %s, not %s; its changes cannot be carried", c.from, c.process, process.Name)
	case base == "":
		return refuse("the revision run %s worked on is unknown: its record names none, nor any input %s; its changes cannot be carried", c.from, process.Checkout)
	case base != revision:
		return refuse("run %s's changes are from revision %s, not %s; a continuation carries them only onto the same revision", c.from, base, revision)
	}
	return nil
}

func processDigest(sources []run.DefinitionSource, name string) string {
	for _, source := range sources {
		if source.Kind == string(definition.KindProcess) && source.Name == name {
			return source.SHA256
		}
	}
	return ""
}

// continuation checks a request to continue an earlier run's session and
// returns what the call resumes. Continuing is deliberate: the agent must
// allow it, the runtime must support it, and the earlier run must be
// finished, by the same agent, with a session. self is the asking run.
func (c *Calls) continuation(ctx context.Context, res *ResolvedCall, self, runID, cwd string) (resumption, error) {
	if runID == "" {
		return resumption{}, nil
	}
	if res.Agent.Session != definition.SessionResumable {
		return resumption{}, refuse("agent %s is %s; it cannot continue run %s", res.Agent.Name, res.Agent.Session, runID)
	}
	if !res.Identity.Resume {
		return resumption{}, refuse("runtime %s cannot continue sessions", res.Mapping.Name)
	}
	prior, state, err := c.runs.Get(ctx, runID)
	if err != nil {
		return resumption{}, refuse("run %s: %v", runID, err)
	}
	switch {
	case state != run.StateFinished:
		return resumption{}, refuse("run %s is %s, not finished", runID, state)
	case prior.Agent != res.Agent.Name:
		return resumption{}, refuse("run %s ran agent %s; only agent %s's own runs can be continued by it", runID, prior.Agent, res.Agent.Name)
	case prior.Runtime == nil || prior.Runtime.Adapter != res.Mapping.Adapter:
		return resumption{}, refuse("run %s did not run on %s", runID, res.Mapping.Adapter)
	case prior.Result == nil || prior.Result.Session == nil || prior.Result.Session.ProviderSessionID == "":
		return resumption{}, refuse("run %s has no provider session", runID)
	}
	// An in-place call resumes where the session's latest run worked, known
	// only from the session's runs.
	if res.Identity.ResumeWhereItRan && !res.Process.InPlace {
		if err := c.whereItRan(ctx, res, prior, cwd); err != nil {
			return resumption{}, err
		}
	}
	resumed := resumption{session: prior.Result.Session.ProviderSessionID}
	// Every continuation must know the session is idle, including calls
	// without a checkout. Otherwise one can advance a selected patch's session
	// while its checkout setup is still running.
	records, err := c.runs.ListStrict(ctx)
	if err != nil {
		return resumption{}, refuse("the runs of run %s's session cannot be read: %v", runID, err)
	}
	latest, err := sessionLatest(records, resumed.session, self, runID)
	if err != nil {
		return resumption{}, err
	}
	resumed.latest = latest
	resumed.before = run.LatestTotals(records, resumed.session, self)
	if res.Process.Checkout == "" {
		return resumed, nil
	}
	if res.Process.InPlace {
		// Nothing is carried: the borrower admits the worktree only as the
		// latest run left it.
		worked := prior
		if found, _ := run.Latest(records, resumed.session, self); found != nil {
			worked = *found
		}
		if res.Identity.ResumeWhereItRan {
			if err := c.whereItRan(ctx, res, worked, cwd); err != nil {
				return resumption{}, err
			}
		}
		resumed.worktree = &worked
		return resumed, nil
	}
	resumed.carry, err = c.carried(ctx, records, prior, resumed.session, self, cwd)
	return resumed, err
}

// sessionLatest refuses unfinished or overlapping runs and names the session's
// latest run. A missing listing entry falls back to the run read by Get.
func sessionLatest(records []run.Record, session, self, prior string) (string, error) {
	latest, known := run.Latest(records, session, self)
	if !known {
		return "", refuse("the latest run of run %s's session is unknown: one has not finished, or the last to finish overlapped another", prior)
	}
	if latest == nil {
		return prior, nil
	}
	return latest.ID, nil
}

func (c *Calls) currentResumption(ctx context.Context, resumed resumption, self, prior string) error {
	if resumed.session == "" {
		return nil
	}
	records, err := c.runs.ListStrict(ctx)
	if err != nil {
		return refuse("the runs of run %s's session cannot be read: %v", prior, err)
	}
	latest, err := sessionLatest(records, resumed.session, self, prior)
	if err != nil {
		return err
	}
	if latest != resumed.latest {
		return refuse("run %s's session advanced from run %s to run %s before its first turn", prior, resumed.latest, latest)
	}
	return nil
}

// carried reads the changes a continuation with a checkout carries: the
// changes.patch of the session's latest run, the run continued or a later
// continuation of it (ADR-013 rule 1). None when that run worked in no
// checkout or kept no patch. It refuses when the latest run is unknown, when
// it worked in-place (ADR-022 rule 8), when its checkout was of another
// repository than the call's, or when its patch cannot be read as it was
// recorded.
func (c *Calls) carried(ctx context.Context, records []run.Record, prior run.Record, session, self, cwd string) (*carried, error) {
	latest, known := run.Latest(records, session, self)
	if !known {
		return nil, refuse("the latest run of run %s's session is unknown: one has not finished, or the last to finish overlapped another; its changes cannot be carried", prior.ID)
	}
	if latest == nil {
		latest = &prior
	}
	if worked := latest.InPlace; worked != nil {
		return nil, refuse("run %s, the latest run of the session, worked in-place in worktree %s; a session does not switch from in-place to temporary: continue it with --workspace in-place (ADR-022 rule 8)", latest.ID, worked.Dir)
	}
	if latest.Effects == nil || latest.Effects.Checkout == nil || latest.Result == nil {
		return nil, nil
	}
	var patch *run.Artifact
	for i, artifact := range latest.Result.Artifacts {
		if artifact.Name == "changes.patch" {
			patch = &latest.Result.Artifacts[i]
		}
	}
	if patch == nil {
		return nil, nil
	}
	checkout := latest.Effects.Checkout
	here := c.workspaceRoot(ctx, cwd)
	var same bool
	var err error
	expected, actual := checkout.Repository, here
	if checkout.RepositoryIdentity != "" {
		var identity string
		identity, err = c.workspaces.RepositoryIdentity(ctx, here)
		expected, actual = checkout.RepositoryIdentity, identity
		same = actual == expected
	} else {
		// Older records only name their launching worktree.
		same, err = c.workspaces.SameRepository(ctx, here, checkout.Repository)
	}
	if err != nil {
		return nil, refuse("run %s's repository cannot be compared with %s: %v", latest.ID, here, err)
	}
	if !same {
		return nil, refuse("run %s's changes are of repository %s, not %s; a continuation carries them only into the same repository", latest.ID, expected, actual)
	}
	data, err := c.runs.Artifact(ctx, latest.ID, *patch)
	if err != nil {
		return nil, refuse("run %s's changes.patch cannot be read: %v", latest.ID, err)
	}
	sum := sha256.Sum256(data)
	if digest := "sha256:" + hex.EncodeToString(sum[:]); digest != patch.Digest {
		return nil, refuse("run %s's changes.patch is %s, not %s as recorded; it is not carried", latest.ID, digest, patch.Digest)
	}
	return &carried{
		from: latest.ID, artifact: *patch, patch: data,
		base: checkout.Revision, process: latest.Request.Process, definitions: latest.Definitions, inputs: latest.Inputs,
	}, nil
}

// whereItRan refuses a continuation of run prior, on a runtime that
// resumes a session only in the directory it ran in, that would work
// anywhere else: in a checkout of its own, made for the call, or in
// another directory than prior worked in. An in-place call works in the
// caller's worktree, which may be that directory (ADR-022 rule 8). It makes
// no workspace.
func (c *Calls) whereItRan(ctx context.Context, res *ResolvedCall, prior run.Record, cwd string) error {
	if res.Process.Checkout != "" && !res.Process.InPlace {
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
// verified when it names the content a verification run passed on. A run
// on a clean copy checked revision with this very patch applied, so the
// patch delivers exactly what passed (ADR-005 rule 1); one in the worktree
// did not (rebuild): the patch must rebuild that content from revision, or
// it is not kept (ADR-002 rule 7). No changes store no artifact and are
// recorded as NO_CHANGES. It returns the content the patch was taken to,
// empty when none was kept. A failure is recorded; it does not change the
// call's status, unless the changes were verified: then the call fails.
func (c *Calls) collectChanges(ctx context.Context, handle RunHandle, dir, revision, verified string, rebuild bool, event func(string, string, map[string]any)) ([]run.Artifact, string, *run.Error) {
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
	if err == nil && rebuild && verified != "" {
		err = c.rebuilds(ctx, dir, revision, patch, verified)
	}
	var artifacts []run.Artifact
	switch {
	case err == nil && len(patch) == 0:
		// Nothing changed: recorded, so the record does not read as work lost.
		event(run.SourceAgister, "NO_CHANGES", map[string]any{"name": "changes.patch"})
	case err == nil:
		var artifact run.Artifact
		if artifact, err = handle.Artifact("changes.patch", patch); err == nil {
			event(run.SourceAgister, "ARTIFACT_STORED", map[string]any{"name": artifact.Name, "digest": artifact.Digest, "bytes": artifact.Bytes})
			artifacts = []run.Artifact{artifact}
		}
	}
	if err != nil {
		event(run.SourceAgister, "ARTIFACT_FAILED", map[string]any{"name": "changes.patch", "error": err.Error()})
		if verified != "" {
			return nil, "", run.Fault(run.ClassInternal, "the changes that passed verification could not be kept: %v", err)
		}
		return nil, "", nil
	}
	return artifacts, identity, nil
}

// rebuilds fails unless patch, applied to revision, rebuilds the content
// verified names.
func (c *Calls) rebuilds(ctx context.Context, dir, revision string, patch []byte, verified string) error {
	rebuilt, err := c.changes.Rebuild(ctx, dir, revision, patch)
	if err != nil {
		return fmt.Errorf("rebuilding the content that passed from the captured changes: %w", err)
	}
	if rebuilt != verified {
		return fmt.Errorf("the captured changes do not rebuild the content that passed: applied to %s they make %s, not %s", revision, rebuilt, verified)
	}
	return nil
}

// resolveValues binds caller params to the params declared and resolves
// every input value to an immutable value through its source, in order: a
// value's arguments may use the text of the values resolved before it,
// such as a commit hash. subject names the definition, e.g. "process p".
// Only a join has a collection to receive; a collection input of any other
// call is refused. prompts are the prompts resolved with the call, by name
// (ADR-014 rule 3), and absent the optional prompt inputs neither layer has
// the prompt of, by their index among values, which give no input (ADR-019
// rule 2); a workflow has none.
func (c *Calls) resolveValues(ctx context.Context, subject string, declared []CallParam, values []CallValue, request run.Request, collection *Resolved, prompts map[string]Resolved, absent []CallAbsent) ([]run.Input, error) {
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
	for i, value := range values {
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
		if value.Source == definition.PromptSource {
			if slices.ContainsFunc(absent, func(a CallAbsent) bool { return a.Index == i }) {
				continue
			}
			prompt, ok := prompts[value.Args["name"]]
			if !ok {
				return nil, refuse("input %s: prompt %q was not resolved with the call", value.Name, value.Args["name"])
			}
			texts[value.Name] = prompt.Value.(string)
			inputs = append(inputs, run.Input{Name: value.Name, Source: value.Source, Identity: prompt.Identity, Value: prompt.Value})
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
	Repository         string
	RepositoryIdentity string
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
// revision of the input checkout names, the caller's worktree for an
// in-place call, which it neither checks nor locks (see CallBorrower), or,
// when it names none, the repository. It must not overlap Agister's state.
func (c *Calls) prepareWorkspace(ctx context.Context, checkout string, inPlace bool, inputs []run.Input, cwd string) (preparedWorkspace, error) {
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
	identity, err := c.workspaces.RepositoryIdentity(ctx, root)
	if err != nil {
		return preparedWorkspace{}, err
	}
	if inPlace {
		return preparedWorkspace{Dir: root, Repository: root, RepositoryIdentity: identity, Release: noop}, nil
	}
	dir, release, err := c.workspaces.Checkout(ctx, root, revision)
	if err != nil {
		return preparedWorkspace{}, err
	}
	if overlaps(dir, c.stateDir) {
		_ = release()
		return preparedWorkspace{}, refuse("workspace %s overlaps Agister's state %s", dir, c.stateDir)
	}
	return preparedWorkspace{Dir: dir, Repository: root, RepositoryIdentity: identity, Release: release, Owned: true}, nil
}

// sink records a turn's events, and on the record its process as an effect
// and its trail; the turn's caller leaves the record alone while the turn
// runs.
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

// Touched records the paths a tool call writes, each as the runtime gave
// it: an event per path, and on the record's trail the paths it does not
// hold yet, written down at once, so a turn that never returns leaves them.
func (s *sink) Touched(call ToolCall) {
	trail := s.record.Trail
	for _, path := range call.Writes {
		s.Event(run.SourceProtocol, "TOUCHED", map[string]any{"path": path, "tool": call.Name, "tool_use_id": call.ID})
		trail = trail.Touch(path, call.Name)
	}
	s.keep(trail)
}

// Denied records a tool call the runtime refused for want of a permission:
// an event, and the denial on the record's trail.
func (s *sink) Denied(denial PermissionDenial) {
	s.Event(run.SourceProtocol, "PERMISSION_DENIED", map[string]any{"tool": denial.Tool, "input": denial.Input})
	s.keep(s.record.Trail.Deny(denial.Tool, denial.Input))
}

// keep puts a trail that grew on the record and writes it. One that cannot
// be written stays on the record, for its next write.
func (s *sink) keep(trail *run.Trail) {
	if trail == s.record.Trail {
		return
	}
	s.record.Trail = trail
	_ = s.handle.Update(*s.record)
}

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
