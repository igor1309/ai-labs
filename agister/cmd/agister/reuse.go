package main

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"slices"
	"time"

	"github.com/igor1309/ai-labs/agister/cli"
	"github.com/igor1309/ai-labs/agister/core/workflow"
	"github.com/igor1309/ai-labs/agister/runstore"
)

// reuseOf is the record of the run named run, which request reuses
// (docs/run-implementation.md, "Reuse"), or why it does not hold, each
// line: the run is kept by kept, and its request is request's, the same
// workflow, or the same process and agent.
func reuseOf(run string, request cli.Request, kept keptRuns) (runstore.Record, []string, error) {
	record, err := kept.Record(run)
	if errors.Is(err, fs.ErrNotExist) {
		return runstore.Record{}, []string{fmt.Sprintf("no run %q is kept", run)}, nil
	}
	if err != nil {
		return runstore.Record{}, nil, err
	}
	earlier := record.Request
	if earlier.Workflow != request.Workflow || earlier.Process != request.Process || earlier.Agent != request.Agent {
		ran := fmt.Sprintf("the process %q on %q", earlier.Process, earlier.Agent)
		if earlier.Workflow != "" {
			ran = fmt.Sprintf("the workflow %q", earlier.Workflow)
		}
		return runstore.Record{}, []string{fmt.Sprintf("%q ran %s", run, ran)}, nil
	}
	return record, nil, nil
}

// reusable is the calls a run may take from the run it reuses, in the
// worktree whose root is root, read through facts; none where the run
// reuses none.
type reusable struct {
	calls []runstore.Call
	root  string
	facts continuedWorktree
}

// taken is the earlier call that ended's call takes: of the same step,
// completed, of the same process, asked of the same agent, given inputs of
// the same names, in the same order, with the same identities, and the
// same process environment, variable for variable; its root the
// worktree's, and the worktree's HEAD and content, not empty, its own;
// false for none.
func (r reusable) taken(ctx context.Context, ended endedCall) (runstore.Call, bool, error) {
	i := slices.IndexFunc(r.calls, func(c runstore.Call) bool { return c.Step == ended.step })
	if i < 0 {
		return runstore.Call{}, false, nil
	}
	earlier := r.calls[i]
	if earlier.Result.Status != string(workflow.Completed) || earlier.Process != ended.process ||
		askedAgent(earlier) != ended.agent || !sameDefinitions(earlier.Definitions, ended.definitions) ||
		!slices.Equal(earlier.Environment, ended.environment) || earlier.Root != r.root || earlier.Content == "" || leftHead(earlier) == "" ||
		!slices.EqualFunc(earlier.Inputs, ended.inputs, func(kept runstore.Input, given givenInput) bool {
			return kept.Name == given.name && kept.Identity == given.Identity
		}) {
		return runstore.Call{}, false, nil
	}
	head, err := r.facts.Head(ctx, r.root)
	if err != nil || head != leftHead(earlier) {
		return runstore.Call{}, false, err
	}
	content, err := r.facts.Content(ctx, r.root)
	if err != nil || content != earlier.Content {
		return runstore.Call{}, false, err
	}
	return earlier, true, nil
}

// askedAgent is the agent c's step asked for: its primary's, where c was
// made again on the primary's fallback, which then answered.
func askedAgent(c runstore.Call) string {
	if primary := c.Primary; primary != nil {
		return primary.Agent
	}
	return c.Agent
}

// reusedResult is the result of a call taken, earlier, as it was recorded,
// but for its cost, zero, and its usage, every count unknown: the run that
// takes it spent none.
func reusedResult(earlier runstore.Call) workflow.Result {
	outcome := earlier.Result.Outcome
	result := workflow.Result{
		Status: workflow.Status(outcome.Status),
		Output: outcome.Output,
		Timing: workflow.Timing{Started: outcome.Timing.Started, Ended: outcome.Timing.Ended,
			Duration: time.Duration(outcome.Timing.DurationMS) * time.Millisecond},
		Cost:     new(float64),
		Warnings: slices.Clone(outcome.Warnings),
	}
	if class := outcome.Class; class != nil {
		result.Class = workflow.Class(*class)
	}
	if reason := outcome.Reason; reason != nil {
		result.Reason = *reason
	}
	if session := earlier.Result.Session; session != nil {
		result.Session = *session
	}
	return result
}
