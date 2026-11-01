package main

import (
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"maps"
	"slices"
	"sync"
	"time"

	"github.com/igor1309/ai-labs/agister/cli"
	"github.com/igor1309/ai-labs/agister/core/admit"
	"github.com/igor1309/ai-labs/agister/core/call"
	"github.com/igor1309/ai-labs/agister/core/inputs"
	"github.com/igor1309/ai-labs/agister/core/workflow"
	"github.com/igor1309/ai-labs/agister/runstore"
)

const persistenceFailure workflow.Class = "persistence"

// recordStore accepts the run's initial record, subsequent facts and final
// result, and keeps the artifacts those facts name.
type recordStore interface {
	Begin(record runstore.Record) error
	Write(record runstore.Record) error
	Append(id string, event runstore.Event) error
	WritePatch(id, step string, patch []byte) (string, error)
	WriteDefinition(id, digest string, data []byte) error
	Patch(path string) ([]byte, error)
}

// runStoreAt is the store of the runs kept under folder.
type runStoreAt func(folder string) (homeRuns, error)

// homeRuns is what build asks of the runs kept under home's "runs": what a
// run asks of them, and a run exported, as cli's runs ask.
type homeRuns interface {
	runStore
	cli.Runs
	Snapshot(id string) (runstore.Snapshot, error)
}

// runIDOf is the id of a run started at started: its UTC time to the
// second, and six hex characters drawn from random, as
// 20261017T071618Z-55fd36.
func runIDOf(started time.Time, random io.Reader) (string, error) {
	drawn := make([]byte, 3)
	if _, err := io.ReadFull(random, drawn); err != nil {
		return "", fmt.Errorf("the run's id: %w", err)
	}
	return started.UTC().Format("20060102T150405Z") + "-" + hex.EncodeToString(drawn), nil
}

// callID is the id of the call of the step step in the run run.
func callID(run, step string) string {
	return run + "/" + step
}

// endedCall is a step's call as it ended: its step, process and agent; the
// id of the call whose session it continues, "" for none; the inputs it
// was given and its resolved process environment, in declaration order,
// none where its inputs were refused; its permission plan; its worktree's
// facts, none for a call refused; the earlier call
// it took, nil for one made; its result and session cost, nil where
// unknown; its cost's source, "" where its cost is unknown; and its
// primary, where it was made again on its agent's fallback, nil where it
// was not, the agent then the fallback's. Of a call taken, the primary
// gives only its agent and plan: its result is the one the taken call
// recorded.
type endedCall struct {
	definitions          []runstore.Definition
	definitionBytes      map[string][]byte
	permissions          runstore.Permissions
	environment          []runstore.Variable
	step, process, agent string
	continues            string
	taken                *runstore.Call
	inputs               []givenInput
	facts                admit.Facts
	result               workflow.Result
	sessionCost          *float64
	costSource           string
	primary              *endedPrimary
}

// endedPrimary is how a call ended on its step's agent before it was made
// again on the agent's fallback: the agent, its permission plan, its
// result and session cost, nil where unknown, and its cost's source, ""
// where its cost is unknown.
type endedPrimary struct {
	agent       string
	permissions runstore.Permissions
	result      workflow.Result
	sessionCost *float64
	costSource  string
}

// runRecord translates run facts for persistence and remembers the first
// persistence failure so later producers cannot append beyond a damaged line.
type runRecord struct {
	store recordStore
	clock clock
	root  string

	mu                 sync.Mutex
	record             runstore.Record
	warnings           []string
	failure            error
	definitionBytes    map[string][]byte
	definitionAttempts map[string]bool
	childInputs        map[string]func() []runstore.Input
}

// newRunRecord is the record of the run id, started at started, of request,
// asked in launch, its calls made in the worktree whose root is root, kept
// by store.
func newRunRecord(store recordStore, clock clock, id string, started time.Time, request cli.Request, definitions []runstore.Definition, data map[string][]byte, launch, root string) (*runRecord, error) {
	switch {
	case store == nil:
		return nil, errors.New("run record: no store")
	case clock == nil:
		return nil, errors.New("run record: no clock")
	}
	asked := runstore.Request{Workflow: request.Workflow, Process: request.Process, Agent: request.Agent,
		Params: maps.Clone(request.Params), Dir: launch, Definitions: slices.Clone(definitions)}
	if continues := request.Continue; continues != "" {
		asked.Continue = &continues
	}
	if reuse := request.Reuse; reuse != "" {
		asked.Reuse = &reuse
	}
	return &runRecord{store: store, clock: clock, root: root, definitionBytes: data, definitionAttempts: map[string]bool{}, record: runstore.Record{
		Schema:  runstore.Schema,
		ID:      id,
		Request: asked,
		Started: started,
		Status:  "running",
	}}, nil
}

// begin claims the run log before anything runs.
func (r *runRecord) begin() error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.keepDefinitions(r.record.Request.Definitions, r.definitionBytes)
	return r.store.Begin(r.written())
}

// Resolved records each of the workflow's resolved inputs.
func (r *runRecord) Resolved(given []givenInput) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.record.Inputs = recordInputs(given)
	for _, input := range r.record.Inputs {
		r.appendLocked(runstore.Event{At: r.clock.Now(), Kind: runstore.InputResolved, InputFact: &input})
	}
}

// Called records the call that ended.
func (r *runRecord) Called(ended endedCall) {
	call := runstore.Call{
		Definitions: slices.Clone(ended.definitions),
		ID:          callID(r.record.ID, ended.step),
		Step:        ended.step,
		Process:     ended.process,
		Agent:       ended.agent,
		Root:        r.root,
		Head:        ended.facts.Head,
		EndHead:     &ended.facts.EndHead,
		Content:     ended.facts.Content,
		Inputs:      recordInputs(ended.inputs),
		Result:      runstore.CallResult{Outcome: outcomeOf(ended.result), SessionCost: ended.sessionCost},
	}
	if continues := ended.continues; continues != "" {
		call.Continues = &continues
	}
	if session := ended.result.Session; session != "" {
		call.Result.Session = &session
	}
	if source := ended.costSource; source != "" {
		call.Result.CostSource = &source
	}
	if taken := ended.taken; taken != nil {
		call = *taken
		call.ID, call.Continues, call.Reuses = callID(r.record.ID, ended.step), nil, &taken.ID
		head := leftHead(*taken)
		call.EndHead = &head
	}
	call.Permissions = ended.permissions
	call.Environment = slices.Clone(ended.environment)
	switch primary := ended.primary; {
	case primary == nil:
	case ended.taken == nil:
		call.Primary = primaryOf(*primary)
	case call.Primary != nil:
		kept := *call.Primary
		kept.Permissions = primary.permissions
		call.Primary = &kept
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	r.keepDefinitions(call.Definitions, ended.definitionBytes)
	patch := ended.facts.Patch
	patchError := ended.facts.PatchError
	if taken := ended.taken; taken != nil {
		call.Patch = nil
		if taken.Patch != nil {
			data, err := r.store.Patch(*taken.Patch)
			if err != nil {
				patchError = err.Error()
			} else {
				text := string(data)
				patch = &text
			}
		}
	}
	if patch != nil {
		path, err := r.store.WritePatch(r.record.ID, ended.step, []byte(*patch))
		if err != nil {
			patchError = err.Error()
		} else {
			call.Patch = &path
		}
	}
	if patchError != "" {
		r.warn(fmt.Sprintf("the patch of %q could not be kept: %s", ended.step, patchError))
	}
	r.record.Calls = append(r.record.Calls, call)
	r.appendLocked(runstore.Event{At: r.clock.Now(), Kind: runstore.CallEnded, Step: ended.step, CallFact: &call})
}

// end records result as how the run ended, and gives it as cli prints it,
// its run's id and the record's warnings in it.
func (r *runRecord) end(result workflow.Result) cli.Result {
	r.mu.Lock()
	defer r.mu.Unlock()
	result.Warnings = append(slices.Clone(result.Warnings), r.warnings...)
	ended := result.Timing.Ended
	r.record.Ended = &ended
	r.record.Status = string(result.Status)
	sessions := map[string]string{}
	maps.Copy(sessions, result.Sessions)
	r.record.Result = &runstore.Result{Outcome: outcomeOf(result), Sessions: sessions, RunID: r.record.ID}
	r.persist()
	if r.failure != nil {
		result.Status, result.Class, result.Reason = workflow.Failed, persistenceFailure, r.failure.Error()
	}
	printed := cliResult(result)
	printed.RunID = r.record.ID
	return printed
}

// written is the record as it is written now: its calls its own, so that
// the record kept grows apart from it.
func (r *runRecord) written() runstore.Record {
	record := r.record
	record.Calls = slices.Clone(r.record.Calls)
	record.Children = slices.Clone(r.record.Children)
	return record
}

// warn adds warning to the run's, once. The caller holds mu.
func (r *runRecord) warn(warning string) {
	if !slices.Contains(r.warnings, warning) {
		r.warnings = append(r.warnings, warning)
	}
}

// Started, Tool, Stale, Capacity, Fallback, Reused and Ended answer core/workflow's
// events: each is appended to the run's events at the clock's time.
func (r *runRecord) Started(step, agent string) {
	r.append(runstore.Event{Step: step, Kind: runstore.Started, Agent: agent})
}

func (r *runRecord) Tool(step string, tool workflow.Tool) {
	r.append(runstore.Event{Step: step, Kind: runstore.Tool, Name: tool.Name, Input: tool.Input})
}

func (r *runRecord) Stale(step string, stale workflow.Stale) {
	var waiting *runstore.Waiting
	if stale.Recovering {
		waiting = &runstore.Waiting{On: "recovery", Since: r.clock.Now()}
	}
	r.append(runstore.Event{Step: step, Kind: runstore.Stale, What: stale.What, Recovering: stale.Recovering, Waiting: waiting})
}

// Capacity records the policy's wait with an explicit deadline.
func (r *runRecord) Capacity(step string, capacity workflow.Capacity) {
	var waiting *runstore.Waiting
	if capacity.Retry > 0 {
		now := r.clock.Now()
		until := now.Add(capacity.Retry)
		waiting = &runstore.Waiting{On: "capacity", Since: now, Until: &until}
	}
	r.append(runstore.Event{Step: step, Kind: runstore.Capacity, Reason: capacity.Reason, Retrying: capacity.Retry > 0, Waiting: waiting})
}

func (r *runRecord) Fallback(step, agent string) {
	r.append(runstore.Event{Step: step, Kind: runstore.Fallback, Agent: agent, Waiting: &runstore.Waiting{On: "fallback", Since: r.clock.Now()}})
}

func (r *runRecord) Reused(step, call string) {
	r.append(runstore.Event{Step: step, Kind: runstore.Reused, Call: call})
}

func (r *runRecord) Ended(step string, ended workflow.Ended) {
	r.append(runstore.Event{Step: step, Kind: runstore.Ended, Status: string(ended.Status), Class: string(ended.Class),
		Duration: ended.Duration})
}

func (r *runRecord) ChildStarted(step, workflowName string, params map[string]string, _ map[string]string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	keptInputs := []runstore.Input{}
	// Execution appends each enclosing repeat's pass to the declared path.
	// The resolver observer belongs to that declaration across its passes.
	for declared := step; ; {
		if captured := r.childInputs[declared]; captured != nil {
			keptInputs = captured()
			break
		}
		withoutPass := passName.ReplaceAllString(declared, "")
		if withoutPass == declared {
			break
		}
		declared = withoutPass
	}
	r.record.Children = append(r.record.Children, runstore.Child{
		ID: callID(r.record.ID, step), Workflow: workflowName, Parent: r.record.ID,
		Params: maps.Clone(params), Inputs: keptInputs, Status: "running",
	})
	r.appendLocked(runstore.Event{At: r.clock.Now(), Step: step, Kind: runstore.ChildStarted, Workflow: workflowName, Params: maps.Clone(params), Inputs: keptInputs})
}

func (r *runRecord) ChildEnded(step string, ended workflow.ChildEnd) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for i := range r.record.Children {
		if r.record.Children[i].ID != callID(r.record.ID, step) {
			continue
		}
		child := &r.record.Children[i]
		child.Status, child.Output = string(ended.Status), ended.Output
		if ended.Class == "" {
			child.Class = nil
		} else {
			class := string(ended.Class)
			child.Class = &class
		}
		break
	}
	r.appendLocked(runstore.Event{At: r.clock.Now(), Step: step, Kind: runstore.ChildEnded, Status: string(ended.Status), Class: string(ended.Class), Output: ended.Output})
}

func (r *runRecord) append(event runstore.Event) {
	r.mu.Lock()
	defer r.mu.Unlock()
	event.At = r.clock.Now()
	r.appendLocked(event)
}

func (r *runRecord) appendLocked(event runstore.Event) error {
	if r.failure == nil {
		r.failure = r.store.Append(r.record.ID, event)
	}
	return r.failure
}

func (r *runRecord) persist() {
	if r.failure == nil {
		r.failure = r.store.Write(r.written())
	}
}

// primaryOf is primary as the record keeps it, its result as a call's.
func primaryOf(primary endedPrimary) *runstore.Primary {
	kept := runstore.Primary{Agent: primary.agent, Permissions: primary.permissions,
		Result: runstore.CallResult{Outcome: outcomeOf(primary.result), SessionCost: primary.sessionCost}}
	if session := primary.result.Session; session != "" {
		kept.Result.Session = &session
	}
	if source := primary.costSource; source != "" {
		kept.Result.CostSource = &source
	}
	return &kept
}

// recordInputs is each of given as the record keeps it.
func recordInputs(given []givenInput) []runstore.Input {
	var kept []runstore.Input
	for _, input := range given {
		kept = append(kept, runstore.Input{Name: input.name, Value: input.Value, Identity: input.Identity})
	}
	return kept
}

func childInputs(given map[string]inputs.Fixed) []runstore.Input {
	names := slices.Sorted(maps.Keys(given))
	kept := make([]runstore.Input, 0, len(names))
	for _, name := range names {
		input := given[name]
		kept = append(kept, runstore.Input{Name: name, Value: input.Value, Identity: input.Identity})
	}
	return kept
}

// outcomeOf is result in the shape Agister prints it: a class and a
// reason that are none as nil, its warnings none as empty.
func outcomeOf(result workflow.Result) runstore.Outcome {
	outcome := runstore.Outcome{
		Status:   string(result.Status),
		Output:   workflowOutput(result),
		Timing:   runstore.Timing{Started: result.Timing.Started, Ended: result.Timing.Ended, DurationMS: result.Timing.Duration.Milliseconds()},
		Cost:     result.Cost,
		Usage:    runstore.Usage(result.Usage),
		Warnings: append([]string{}, result.Warnings...),
	}
	if class := string(result.Class); class != "" {
		outcome.Class = &class
	}
	if reason := result.Reason; reason != "" {
		outcome.Reason = &reason
	}
	return outcome
}

// bothEvents tells core/workflow's events to each of its own, in order.
type bothEvents []workflow.Events

func (b bothEvents) Started(step, agent string) {
	for _, events := range b {
		events.Started(step, agent)
	}
}

func (b bothEvents) Tool(step string, tool workflow.Tool) {
	for _, events := range b {
		events.Tool(step, tool)
	}
}

func (b bothEvents) Stale(step string, stale workflow.Stale) {
	for _, events := range b {
		events.Stale(step, stale)
	}
}

func (b bothEvents) Capacity(step string, capacity workflow.Capacity) {
	for _, events := range b {
		events.Capacity(step, capacity)
	}
}

func (b bothEvents) Fallback(step, agent string) {
	for _, events := range b {
		events.Fallback(step, agent)
	}
}

func (b bothEvents) Reused(step, call string) {
	for _, events := range b {
		events.Reused(step, call)
	}
}

func (b bothEvents) Ended(step string, ended workflow.Ended) {
	for _, events := range b {
		events.Ended(step, ended)
	}
}

func (b bothEvents) ChildStarted(step, workflowName string, params map[string]string, inputs map[string]string) {
	for _, events := range b {
		events.ChildStarted(step, workflowName, params, inputs)
	}
}

func (b bothEvents) ChildEnded(step string, ended workflow.ChildEnd) {
	for _, events := range b {
		events.ChildEnded(step, ended)
	}
}

func (r *runRecord) Branch(step, arm string, conditions []workflow.ConditionRead) {
	kept := make([]runstore.Condition, 0, len(conditions))
	for _, condition := range conditions {
		kept = append(kept, runstore.Condition{Arm: condition.Arm, Holds: condition.Holds, Read: condition.Read})
	}
	r.append(runstore.Event{Step: step, Kind: runstore.Branch, Arm: arm, Conditions: kept})
}

func (r *runRecord) Pass(step string, pass int, state map[string]any) {
	r.append(runstore.Event{Step: step, Kind: runstore.Pass, Pass: pass, State: state})
}

func (r *runRecord) Stopped(step, why string, passes int) {
	r.append(runstore.Event{Step: step, Kind: runstore.Stopped, Stopped: why, Passes: passes})
}

func (b bothEvents) Branch(step, arm string, conditions []workflow.ConditionRead) {
	for _, events := range b {
		events.Branch(step, arm, conditions)
	}
}

func (b bothEvents) Pass(step string, pass int, state map[string]any) {
	for _, events := range b {
		events.Pass(step, pass, state)
	}
}

func (b bothEvents) Stopped(step, why string, passes int) {
	for _, events := range b {
		events.Stopped(step, why, passes)
	}
}

// Prepared keeps what was admitted before the runtime can act.
func (r *runRecord) Prepared(ended endedCall) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.keepDefinitions(ended.definitions, ended.definitionBytes)
	c := runstore.Call{ID: callID(r.record.ID, ended.step), Step: ended.step, Process: ended.process, Agent: ended.agent,
		Root: r.root, Permissions: ended.permissions, Environment: slices.Clone(ended.environment),
		Definitions: slices.Clone(ended.definitions), Inputs: recordInputs(ended.inputs),
		Result: runstore.CallResult{Outcome: runstore.Outcome{Status: "running", Timing: runstore.Timing{Started: r.clock.Now()}}}}
	r.appendLocked(runstore.Event{At: r.clock.Now(), Kind: runstore.Prepared, Step: ended.step, CallFact: &c})
}

func (r *runRecord) Observed(step string, report call.Report) {
	if report.Running {
		r.append(runstore.Event{Step: step, Kind: runstore.Resumed})
	}
	if report.Session != "" || report.Cost != nil {
		r.append(runstore.Event{Step: step, Kind: runstore.Progress, Session: report.Session, Cost: report.Cost})
	}
}
