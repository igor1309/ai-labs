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
	Clock       Clock
	IDs         IDs
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
			Process: request.Process,
			Params:  request.Params,
			Agent:   request.Agent,
			Timeout: request.Timeout,
			Cwd:     request.Cwd,
		},
	}
	handle, err := c.Recorder.Create(ctx, record)
	if err != nil {
		return "", err
	}
	runCtx, cancel := context.WithCancel(WithCorrelation(context.WithoutCancel(ctx), "run_id", record.ID, "process", request.Process))
	c.Hosted.add(record.ID, cancel)
	go func() {
		defer c.Hosted.remove(record.ID)
		defer cancel()
		c.execute(runCtx, handle, record)
	}()
	return record.ID, nil
}

// execute runs one call. Every refusal happens before the runtime starts
// and is recorded; every effect is released on every path.
func (c *Calls) execute(ctx context.Context, handle RunHandle, record run.Record) {
	event := func(source, kind string, data map[string]any) {
		_ = handle.Append(run.Event{At: c.Clock.Now(), Source: source, Kind: kind, Data: data})
	}
	// Effects end before the record does: the workspace is released first.
	release := func() error { return nil }
	finish := func(outcome run.CallOutcome, reason string) {
		if err := release(); err != nil {
			event(run.SourceAgister, "WORKSPACE_RELEASE_FAILED", map[string]any{"error": err.Error()})
		}
		release = func() error { return nil }
		now := c.Clock.Now()
		record.FinishedAt = &now
		record.Outcome = outcome
		record.Reason = reason
		event(run.SourceAgister, "CALL_FINISHED", map[string]any{"outcome": string(outcome), "reason": reason})
		_ = handle.Finish(record)
	}
	defer func() {
		if recovered := recover(); recovered != nil {
			finish(run.CallFailed, fmt.Sprintf("internal error: %v", recovered))
		}
	}()
	event(run.SourceAgister, "CALL_SUBMITTED", map[string]any{"process": record.Process})

	fail := func(err error) {
		var refusal *Refusal
		if errors.As(err, &refusal) {
			event(run.SourceAgister, "REFUSED", map[string]any{"reason": refusal.Reason})
			finish(run.CallRefused, refusal.Reason)
			return
		}
		finish(run.CallFailed, err.Error())
	}

	res, err := resolver{definitions: c.Definitions, runtimes: c.Runtimes, validator: c.Validator}.resolve(ctx, record.Request.Process, record.Request.Agent, record.Request.Timeout)
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
		revision := inputIdentity(inputs, rule.CandidateInput)
		writer, err := c.Provenance.Writer(ctx, revision)
		if err != nil {
			fail(err)
			return
		}
		result := constraint.ModelFamily(rule, res.agent.ModelFamily, revision, writer)
		event(run.SourceAgister, "CONSTRAINT_CHECKED", map[string]any{"subject": result.Subject, "satisfied": result.Satisfied, "unknown": result.Unknown, "basis": result.Basis})
		if !result.Satisfied {
			fail(refuse("constraint %s unsatisfied: %s", result.Subject, result.Basis))
			return
		}
	}

	workspace, releaseWorkspace, err := c.prepareWorkspace(ctx, res.process, inputs, record.Request.Cwd)
	if err != nil {
		fail(err)
		return
	}
	release = releaseWorkspace
	record.Workspace = workspace

	request := TurnRequest{
		Prompt:       prompt.Inputs(inputs),
		Instruction:  prompt.Instruction(res.process.Instruction, res.plan.Granted, res.plan.Withheld),
		Cwd:          workspace,
		Model:        res.agent.Model,
		Effort:       res.agent.Effort,
		Primitives:   res.plan.Primitives,
		Timeout:      res.effective.Timeout,
		OutputSchema: res.schema,
	}
	if res.identity.PresetSessionID {
		request.SessionID = c.IDs.SessionID()
		record.RequestedSessionID = request.SessionID
	}
	_ = handle.Update(record)

	turn := res.runner.RunTurn(ctx, request, sink{handle: handle, clock: c.Clock})
	record.Turn = &turn

	var validation error
	if turn.Outcome == run.TurnCompleted && res.process.Output.Format == "json" {
		validation = c.Validator.Validate(res.schema, turn.Output)
	}
	outcome, reason := run.Judge(turn, res.process.Output, validation)
	if validation == nil && turn.Outcome == run.TurnCompleted {
		record.Output = turn.Output
	}
	finish(outcome, reason)
}

// resolveInputs binds caller params and resolves every input value to an
// immutable value through its source.
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
	for _, value := range process.Values {
		provider, ok := c.Inputs[value.Source]
		if !ok {
			return nil, refuse("input %s: unknown source %q", value.Name, value.Source)
		}
		resolved, err := provider.Resolve(ctx, InputSpec{Source: value.Source, Args: value.Bind(params), Params: params, Cwd: request.Cwd})
		if err != nil {
			return nil, refuse("input %s: %v", value.Name, err)
		}
		inputs = append(inputs, run.Input{Name: value.Name, Source: value.Source, Identity: resolved.Identity, Revision: resolved.Revision, Value: resolved.Value})
	}
	return inputs, nil
}

// prepareWorkspace returns the agent's working directory: a checkout of the
// declared revision, or the repository. It must not overlap Agister's state.
func (c *Calls) prepareWorkspace(ctx context.Context, process definition.Process, inputs []run.Input, cwd string) (string, func() error, error) {
	noop := func() error { return nil }
	root, err := c.Workspaces.Root(ctx, cwd)
	if err != nil {
		root = cwd
	}
	if overlaps(root, c.StateDir) {
		return "", noop, refuse("workspace %s overlaps Agister's state %s", root, c.StateDir)
	}
	if process.Checkout == "" {
		return root, noop, nil
	}
	var revision string
	for _, input := range inputs {
		if input.Name == process.Checkout && input.Revision {
			revision = input.Identity
		}
	}
	if revision == "" {
		return "", noop, refuse("workspace.checkout: input %s is not a revision", process.Checkout)
	}
	dir, release, err := c.Workspaces.Checkout(ctx, root, revision)
	if err != nil {
		return "", noop, err
	}
	if overlaps(dir, c.StateDir) {
		_ = release()
		return "", noop, refuse("workspace %s overlaps Agister's state %s", dir, c.StateDir)
	}
	return dir, release, nil
}

type sink struct {
	handle RunHandle
	clock  Clock
}

func (s sink) Event(source, kind string, data map[string]any) {
	_ = s.handle.Append(run.Event{At: s.clock.Now(), Source: source, Kind: kind, Data: data})
}

func (s sink) Raw(line string) { _ = s.handle.Raw(line) }

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

func inputIdentity(inputs []run.Input, name string) string {
	for _, input := range inputs {
		if input.Name == name {
			return input.Identity
		}
	}
	return ""
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
