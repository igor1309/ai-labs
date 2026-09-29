package app

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"sort"
	"strings"
	"sync"

	"github.com/igor1309/ai-labs/agister/internal/contract"
	"github.com/igor1309/ai-labs/agister/internal/domain/constraint"
	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
	"github.com/igor1309/ai-labs/agister/internal/domain/prompt"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

// Calls submits and executes agent calls.
type Calls struct {
	Definitions DefinitionSource
	Runtimes    Runtimes
	Inputs      map[string]InputProvider
	Workspaces  Workspaces
	Provenance  Provenance
	Validator   OutputValidator
	Recorder    RunRecorder
	// Earlier runs, read only to continue a session.
	Runs  RunLookup
	Clock Clock
	IDs   IDs
	// Agister's own state; no agent workspace may overlap it.
	StateDir string
	Hosted   *Hosted
}

// Hosted tracks calls running in this process so they can be cancelled.
type Hosted struct {
	mu      sync.Mutex
	cancels map[string]context.CancelFunc
}

func NewHosted() *Hosted { return &Hosted{cancels: map[string]context.CancelFunc{}} }

func (h *Hosted) add(id string, cancel context.CancelFunc) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.cancels[id] = cancel
}

func (h *Hosted) remove(id string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.cancels, id)
}

func (h *Hosted) cancel(id string) bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	cancel, ok := h.cancels[id]
	if ok {
		cancel()
	}
	return ok
}

const inlineInputChars = 2000

func (c *Calls) Submit(ctx context.Context, request contract.CallRequest) (string, error) {
	now := c.Clock.Now()
	record := run.Record{
		Schema:    run.RecordSchema,
		ID:        c.IDs.RunID(now),
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
	// snapshot and never reads the live source.
	definitions := Snapshot(ctx, c.Definitions)
	handle, err := c.Recorder.Create(ctx, record)
	if err != nil {
		return "", err
	}
	runCtx, cancel := context.WithCancel(WithCorrelation(context.WithoutCancel(ctx), "run_id", record.ID, "process", request.Process))
	c.Hosted.add(record.ID, cancel)
	go func() {
		defer c.Hosted.remove(record.ID)
		defer cancel()
		c.execute(runCtx, handle, record, definitions)
	}()
	return record.ID, nil
}

// execute runs one call. Every refusal happens before the runtime starts
// and is recorded; every effect is released on every path.
func (c *Calls) execute(ctx context.Context, handle RunHandle, record run.Record, definitions DefinitionSource) {
	event := func(source, kind string, data map[string]any) {
		_ = handle.Append(run.Event{At: c.Clock.Now(), Source: source, Kind: kind, Data: data})
	}
	result := run.Result{Cost: run.Cost{Source: run.CostUnknown}, Timing: run.Timing{StartedAt: record.CreatedAt}}
	// Effects end before the record does: the workspace's changes are kept
	// and the workspace released first.
	var collect func()
	release := func() error { return nil }
	finish := func(fault *run.Error) {
		// Cleared first: if it panics, the recovery calls finish again.
		if pending := collect; pending != nil {
			collect = nil
			pending()
		}
		if err := release(); err != nil {
			event(run.SourceAgister, "WORKSPACE_RELEASE_FAILED", map[string]any{"error": err.Error()})
		}
		release = func() error { return nil }
		now := c.Clock.Now()
		record.FinishedAt = &now
		result.Status, result.Error = run.Completed, fault
		if fault != nil {
			result.Status = run.StatusOf(fault.Class)
			result.Output = nil
		}
		result.Timing.FinishedAt = now
		result.Timing.WallMS = now.Sub(result.Timing.StartedAt).Milliseconds()
		record.Result = &result
		data := map[string]any{"status": string(result.Status)}
		if fault != nil {
			data["class"], data["message"] = string(fault.Class), fault.Message
		}
		event(run.SourceAgister, "CALL_FINISHED", data)
		// A finished run is no longer cancellable.
		c.Hosted.remove(record.ID)
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
	res, err := resolver{definitions: definitions, runtimes: c.Runtimes, validator: c.Validator}.resolve(ctx, record.Request.Process, record.Request.Agent, caller)
	record.Definitions = res.sources
	if err != nil {
		fail(err)
		return
	}
	record.Agent = res.agent.Name
	record.Effective = &res.effective
	record.Runtime = &run.Runtime{Mapping: res.mapping.Name, Adapter: res.mapping.Adapter, Contract: res.identity.Contract, Version: res.identity.Version}
	record.Plan = &res.plan
	_ = handle.Update(record)
	event(run.SourceAgister, "PLANNED", map[string]any{"primitives": res.plan.Primitives, "granted": res.plan.Granted, "withheld": res.plan.Withheld})
	if len(res.plan.Withheld) > 0 {
		event(run.SourceAgister, "PERMISSIONS_WITHHELD", map[string]any{"permissions": res.plan.Withheld})
	}

	resumeSessionID, err := c.continuation(ctx, res, record.Request.Continue)
	if err != nil {
		fail(err)
		return
	}

	inputs, err := c.resolveInputs(ctx, res.process, record.Request)
	if err != nil {
		fail(err)
		return
	}
	record.Inputs = summarize(inputs)
	_ = handle.Update(record)

	// Constraints are checked before any workspace or runtime exists.
	for _, rule := range res.effective.Constraints {
		if res.agent.ModelFamily == "" {
			fail(refuse("process %s constrains %s, but agent %s declares no model_family", res.process.Name, rule.Subject, res.agent.Name))
			return
		}
		// Provenance is keyed by commit: any other input would always be
		// "unknown" and could pass the constraint silently.
		revision, ok := revisionOf(inputs, rule.CandidateInput)
		if !ok {
			fail(refuse("constraint %s: input %s is not a revision", rule.Subject, rule.CandidateInput))
			return
		}
		writer, err := c.Provenance.Writer(ctx, revision)
		if err != nil {
			fail(err)
			return
		}
		outcome := constraint.ModelFamily(rule, res.agent.ModelFamily, revision, writer)
		event(run.SourceAgister, "CONSTRAINT_CHECKED", map[string]any{"subject": outcome.Subject, "satisfied": outcome.Satisfied, "unknown": outcome.Unknown, "basis": outcome.Basis})
		if !outcome.Satisfied {
			fail(refuse("constraint %s unsatisfied: %s", outcome.Subject, outcome.Basis))
			return
		}
	}

	workspace, err := c.prepareWorkspace(ctx, res.process, inputs, record.Request.Cwd)
	if err != nil {
		fail(err)
		return
	}
	release = workspace.Release
	record.Workspace = workspace.Dir
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
		revision, _ := revisionOf(inputs, res.process.Checkout)
		collect = func() { result.Artifacts = c.collectChanges(ctx, handle, workspace.Dir, revision, event) }
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
	if res.identity.PresetSessionID {
		request.SessionID = c.IDs.SessionID()
		record.RequestedSessionID = request.SessionID
	}
	_ = handle.Update(record)

	turnStart := c.Clock.Now()
	turn := res.runner.RunTurn(ctx, request, &sink{handle: handle, clock: c.Clock, record: &record})
	turnMS := c.Clock.Now().Sub(turnStart).Milliseconds()
	record.Turn = &turn

	result.Timing.TurnMS = &turnMS
	result.Timing.RuntimeMS = turn.RuntimeMS
	result.Usage = turn.Usage
	result.Text = turn.Text
	if turn.CostUSD != nil {
		result.Cost = run.Cost{USD: turn.CostUSD, Source: run.CostRuntime}
	}
	if turn.ProviderSessionID != "" {
		result.Session = &run.Session{ProviderSessionID: turn.ProviderSessionID, Continues: record.Request.Continue}
	}

	var validation error
	if turn.Status == run.Completed && res.process.Output.Format == "json" {
		validation = c.Validator.Validate(res.schema, turn.Output)
	}
	_, fault := run.Conclude(turn, res.process.Output, validation)
	if fault == nil && res.process.Output.Format == "json" {
		result.Output = turn.Output
	}
	finish(fault)
}

// continuation checks a request to continue an earlier run's session and
// returns that provider session. Continuing is deliberate: the agent must
// allow it, the runtime must support it, and the earlier run must be
// finished, by the same agent, with a session.
func (c *Calls) continuation(ctx context.Context, res *resolution, runID string) (string, error) {
	if runID == "" {
		return "", nil
	}
	if res.agent.Session != definition.SessionResumable {
		return "", refuse("agent %s is %s; it cannot continue run %s", res.agent.Name, res.agent.Session, runID)
	}
	if !res.identity.Resume || !res.identity.PresetSessionID {
		return "", refuse("runtime %s cannot continue sessions", res.mapping.Name)
	}
	prior, state, err := c.Runs.Get(ctx, runID)
	if err != nil {
		return "", refuse("run %s: %v", runID, err)
	}
	switch {
	case state != run.StateFinished:
		return "", refuse("run %s is %s, not finished", runID, state)
	case prior.Agent != res.agent.Name:
		return "", refuse("run %s ran agent %s; only agent %s's own runs can be continued by it", runID, prior.Agent, res.agent.Name)
	case prior.Runtime == nil || prior.Runtime.Adapter != res.mapping.Adapter:
		return "", refuse("run %s did not run on %s", runID, res.mapping.Adapter)
	case prior.Result == nil || prior.Result.Session == nil || prior.Result.Session.ProviderSessionID == "":
		return "", refuse("run %s has no provider session", runID)
	}
	return prior.Result.Session.ProviderSessionID, nil
}

// collectChanges keeps a call's changes to its own workspace as an
// artifact. A failure is recorded; it does not change the call's status.
func (c *Calls) collectChanges(ctx context.Context, handle RunHandle, dir, revision string, event func(string, string, map[string]any)) []run.Artifact {
	patch, err := c.Workspaces.Changes(context.WithoutCancel(ctx), dir, revision)
	if err == nil && len(patch) == 0 {
		return nil
	}
	var artifact run.Artifact
	if err == nil {
		artifact, err = handle.Artifact("changes.patch", patch)
	}
	if err != nil {
		event(run.SourceAgister, "ARTIFACT_FAILED", map[string]any{"name": "changes.patch", "error": err.Error()})
		return nil
	}
	event(run.SourceAgister, "ARTIFACT_STORED", map[string]any{"name": artifact.Name, "digest": artifact.Digest, "bytes": artifact.Bytes})
	return []run.Artifact{artifact}
}

// resolveInputs binds caller params and resolves every input value to an
// immutable value through its source, in order: a value's arguments may
// use the text of the values resolved before it, such as a commit hash.
func (c *Calls) resolveInputs(ctx context.Context, process definition.Process, request run.Request) ([]run.Input, error) {
	params := map[string]string{}
	var unknown []string
	for name := range request.Params {
		if !hasParam(process.Params, name) {
			unknown = append(unknown, name)
		}
	}
	if len(unknown) > 0 {
		sort.Strings(unknown)
		return nil, refuse("process %s takes no params: %s", process.Name, strings.Join(unknown, ", "))
	}
	var missing []string
	for _, param := range process.Params {
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
		return nil, refuse("process %s is missing params: %s", process.Name, strings.Join(missing, ", "))
	}

	inputs := make([]run.Input, 0, len(process.Values))
	texts := map[string]string{}
	for _, value := range process.Values {
		provider, ok := c.Inputs[value.Source]
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
	root, err := c.Workspaces.Root(ctx, cwd)
	if err != nil {
		root = cwd
	}
	if overlaps(root, c.StateDir) {
		return preparedWorkspace{}, refuse("workspace %s overlaps Agister's state %s", root, c.StateDir)
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
	dir, release, err := c.Workspaces.Checkout(ctx, root, revision)
	if err != nil {
		return preparedWorkspace{}, err
	}
	if overlaps(dir, c.StateDir) {
		_ = release()
		return preparedWorkspace{}, refuse("workspace %s overlaps Agister's state %s", dir, c.StateDir)
	}
	return preparedWorkspace{Dir: dir, Repository: root, Release: release, Owned: true}, nil
}

// sink records a turn's events, and its process as an effect on record,
// which the turn's caller leaves alone while the turn runs.
type sink struct {
	handle RunHandle
	clock  Clock
	record *run.Record
}

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
