package app

import (
	"context"
	"fmt"
	"slices"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
	"github.com/igor1309/ai-labs/agister/internal/domain/prompt"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

// verifyOutputBound is how much of a run's combined output is kept from
// each end: the evidence and the repair turn get that head and tail.
const verifyOutputBound = 8 << 10

// Verifier runs the verification loop of calls whose process declares
// verify (ADR-002), through the contracts it declares here. Calls compose
// one loop per call from it.
type Verifier struct {
	content  VerifyContent
	commands VerifyCommands
	clock    VerifyClock
}

// VerifyContent names a checkout's content and diffs two contents, so every
// checked state can be compared and rebuilt.
type VerifyContent interface {
	// Identity names the checkout's content: the files of revision as the
	// checkout has them, and its untracked files that are not ignored.
	Identity(ctx context.Context, dir, revision string) (string, error)
	// Changes returns the patch from one content to another; empty when
	// they are the same.
	Changes(ctx context.Context, dir, from, to string) ([]byte, error)
}

// VerifyCommands runs the verification command.
type VerifyCommands interface {
	// Run runs the command in a process group of its own until it exits,
	// its timeout passes or ctx ends, and kills the whole group before it
	// returns. started records the group as soon as it exists, and may be
	// called again as more becomes known; an error from it means the group
	// is not on record: Run kills it and the run fails.
	Run(ctx context.Context, request CommandRequest, started func(ref string) error) CommandResult
}

// VerifyClock tells how much of the call's time is left, and when each run
// starts and ends.
type VerifyClock interface{ Now() time.Time }

// NewVerifier returns the component that runs verification loops. Every
// collaborator is required.
func NewVerifier(content VerifyContent, commands VerifyCommands, clock VerifyClock) *Verifier {
	return &Verifier{content: content, commands: commands, clock: clock}
}

// verification is one call's verification loop: after a valid turn it runs
// the process's command in the call's checkout, and on a failure with
// attempts, time and budget left, resumes the call's session in place with
// the failure and checks again. Every attempt is recorded before the next
// turn starts.
type verification struct {
	content  VerifyContent
	commands VerifyCommands
	clock    VerifyClock

	record *run.Record
	result *run.Result
	event  func(source, kind string, data map[string]any)
	// update and artifact write the run's evidence.
	update   func(run.Record) error
	artifact func(name string, data []byte) (run.Artifact, error)

	verify   definition.Verify
	limit    *float64  // the call's cost limit, one budget for every turn
	deadline time.Time // the call's timeout, for every turn and run
	dir      string    // the call's checkout
	base     string    // the revision it was checked out at
	request  TurnRequest
	// session is the provider session of the call's first turn, which
	// every repair resumes.
	session string

	take     func(TurnRequest) run.Turn
	conclude func(run.Turn) *run.Error

	// verified names the content of the passing run, once one passed.
	verified string
}

// run verifies the latest turn, which was valid, and repairs until a run
// passes or the loop must stop; the fault says why it stopped.
func (v *verification) run(ctx context.Context) *run.Error {
	from := v.base
	var checked []string
	var previous *run.CommandRun
	for number := 1; ; number++ {
		turn := *v.record.Turn
		attempt := run.Attempt{Number: number, Session: turn.ProviderSessionID, Turn: turn}
		identity, err := v.content.Identity(ctx, v.dir, v.base)
		if err != nil {
			return v.stop(attempt, v.failure(ctx, "naming the checkout's content", err))
		}
		attempt.Identity = identity
		if attempt.Changes, err = v.keep(ctx, fmt.Sprintf("attempt-%d.patch", number), from, identity); err != nil {
			return v.stop(attempt, v.failure(ctx, "keeping the turn's changes", err))
		}
		// Rule 6: a run never repeats on content already checked.
		if earlier := slices.Index(checked, identity); earlier >= 0 {
			return v.stop(attempt, run.Fault(run.ClassBudgetExhausted,
				"no progress: attempt %d's content is what attempt %d checked", number, earlier+1))
		}
		if ctx.Err() != nil {
			return v.stop(attempt, run.Fault(run.ClassCancelled, "cancelled before attempt %d's run", number))
		}
		remaining := v.deadline.Sub(v.clock.Now())
		if remaining <= 0 {
			return v.stop(attempt, run.Fault(run.ClassTimeout, "the call's timeout passed before attempt %d's run", number))
		}
		timeout := min(v.verify.Timeout, remaining)
		checked = append(checked, identity)

		ran := v.runCommand(ctx, number, timeout)
		attempt.Run = &ran
		switch {
		case ran.Cancelled:
			return v.stop(attempt, run.Fault(run.ClassCancelled, "cancelled during attempt %d's run", number))
		case ran.TimedOut && timeout < v.verify.Timeout:
			return v.stop(attempt, run.Fault(run.ClassTimeout, "the call's timeout passed during attempt %d's run", number))
		case ran.TimedOut:
			return v.stop(attempt, run.Fault(run.ClassTimeout, "attempt %d's run exceeded verify.timeout %s", number, v.verify.Timeout))
		case ran.Error != "":
			return v.stop(attempt, run.Fault(run.ClassInternal, "attempt %d's run: %s", number, ran.Error))
		}

		// Rule 7: a run that changes the content fails, whatever its exit.
		after, err := v.content.Identity(ctx, v.dir, v.base)
		if err != nil {
			return v.stop(attempt, v.failure(ctx, "naming the checkout's content after the run", err))
		}
		if after != identity {
			ran.After = after
			v.event(run.SourceAgister, "VERIFY_CHANGED_CONTENT", map[string]any{"attempt": number, "checked": identity, "after": after})
			if ran.AfterChanges, err = v.keep(ctx, fmt.Sprintf("attempt-%d-run.patch", number), identity, after); err != nil {
				return v.stop(attempt, v.failure(ctx, "keeping the run's changes", err))
			}
		}
		from = after
		ran.Passed = ran.Exit.Code != nil && *ran.Exit.Code == 0 && ran.After == ""
		if ran.Passed {
			// The node completes only once the passing attempt is recorded.
			if err := v.save(attempt); err != nil {
				return run.Fault(run.ClassInternal, "recording attempt %d failed: %v", number, err)
			}
			v.verified = identity
			return nil
		}

		if fault := v.exhausted(ran, previous, number); fault != nil {
			return v.stop(attempt, fault)
		}
		budget, fault := v.budget()
		if fault != nil {
			return v.stop(attempt, fault)
		}
		remaining = v.deadline.Sub(v.clock.Now())
		if remaining <= 0 {
			return v.stop(attempt, run.Fault(run.ClassTimeout, "the call's timeout passed after attempt %d's run", number))
		}
		if ctx.Err() != nil {
			return v.stop(attempt, run.Fault(run.ClassCancelled, "cancelled after attempt %d's run", number))
		}
		// Every checked state can be rebuilt before the next turn changes it.
		if err := v.save(attempt); err != nil {
			return run.Fault(run.ClassInternal, "recording attempt %d failed: %v", number, err)
		}
		previous = &ran

		// Rule 4: the repair resumes the call's own session in place.
		request := v.request
		request.Prompt = prompt.Repair(v.verify.Instruction, v.verify.Command, ended(ran), ran.Output)
		request.ResumeSessionID = v.session
		request.Timeout = remaining
		request.MaxCostUSD = budget
		v.event(run.SourceAgister, "REPAIR_STARTED", map[string]any{"attempt": number + 1, "session": v.session})
		repair := v.take(request)
		fault = v.conclude(repair)
		// A repair that reports no session confirms none: it is not in the
		// call's session, whatever it did.
		if fault == nil && repair.ProviderSessionID != v.session {
			fault = run.Fault(run.ClassRuntimeError, "the repair turn resumed session %s, but the runtime reported session %q", v.session, repair.ProviderSessionID)
		}
		if fault != nil {
			failed := run.Attempt{Number: number + 1, Session: repair.ProviderSessionID, Turn: repair}
			return v.stop(failed, fault)
		}
	}
}

// exhausted is why a failed run cannot be repaired, if it cannot: the same
// failure as the run before (rule 6), the last attempt, or no session to
// resume (every repair reports the first turn's).
func (v *verification) exhausted(ran run.CommandRun, previous *run.CommandRun, number int) *run.Error {
	switch {
	case previous != nil && sameExit(previous.Exit, ran.Exit) && previous.Output.SHA256 == ran.Output.SHA256:
		return run.Fault(run.ClassBudgetExhausted, "no progress: attempt %d failed as attempt %d did, with the same exit status and output", number, number-1)
	case number >= v.verify.MaxAttempts:
		return run.Fault(run.ClassBudgetExhausted, "attempt %d of %d failed (%s)", number, v.verify.MaxAttempts, ended(ran))
	case v.session == "":
		return run.Fault(run.ClassBudgetExhausted, "attempt %d failed and its turn reported no session to repair in", number)
	}
	return nil
}

// budget is what a repair turn may spend: the call's cost limit less what
// every turn so far reported (rule 5). With a limit and a cost unknown, the
// limit cannot be enforced, and no repair starts.
func (v *verification) budget() (*float64, *run.Error) {
	if v.limit == nil {
		return nil, nil
	}
	spent := v.result.Cost
	if spent.Source == run.CostUnknown || spent.USD == nil {
		return nil, run.Fault(run.ClassBudgetExhausted, "a turn's cost is unknown, so the cost limit %g cannot be enforced for a repair", *v.limit)
	}
	left := *v.limit - *spent.USD
	if left <= 0 {
		return nil, run.Fault(run.ClassBudgetExhausted, "the cost limit %g is spent", *v.limit)
	}
	return &left, nil
}

// runCommand runs the verification command once, its process group on
// record as an effect of the call while it runs.
func (v *verification) runCommand(ctx context.Context, number int, timeout time.Duration) run.CommandRun {
	v.event(run.SourceAgister, "VERIFY_STARTED", map[string]any{"attempt": number, "command": v.verify.Command, "dir": v.dir, "timeout": timeout.String()})
	started := v.clock.Now()
	result := v.commands.Run(ctx, CommandRequest{Command: v.verify.Command, Dir: v.dir, Timeout: timeout, Bound: verifyOutputBound}, v.recordGroup)
	finished := v.clock.Now()
	ran := run.CommandRun{
		Command:    v.verify.Command,
		Dir:        v.dir,
		Exit:       &run.Exit{Code: result.ExitCode, Signal: result.Signal},
		TimedOut:   result.TimedOut,
		Cancelled:  result.Cancelled,
		Error:      result.Error,
		StartedAt:  started,
		FinishedAt: finished,
		WallMS:     finished.Sub(started).Milliseconds(),
		Output:     bounded(result),
	}
	v.event(run.SourceAgister, "VERIFY_FINISHED", map[string]any{
		"attempt": number, "code": ran.Exit.Code, "signal": ran.Exit.Signal, "timed_out": ran.TimedOut, "cancelled": ran.Cancelled,
		"error": ran.Error, "bytes": ran.Output.Bytes, "sha256": ran.Output.SHA256, "wall_ms": ran.WallMS,
	})
	return ran
}

// recordGroup records the command's process group on the run, so a reap
// after a killed CLI finds it (rule 10). A group that cannot be recorded
// is not claimed by the record, and the error makes the runner kill it.
func (v *verification) recordGroup(ref string) error {
	previous := v.record.Effects
	effects := run.Effects{}
	if previous != nil {
		effects = *previous
	}
	effects.Command = &run.Process{Ref: ref}
	v.record.Effects = &effects
	if err := v.update(*v.record); err != nil {
		v.record.Effects = previous
		return fmt.Errorf("recording the verification command's process failed: %w", err)
	}
	return nil
}

// keep stores the patch from one content to another as an artifact; none
// when they are the same.
func (v *verification) keep(ctx context.Context, name, from, to string) (*run.Artifact, error) {
	patch, err := v.content.Changes(ctx, v.dir, from, to)
	if err != nil || len(patch) == 0 {
		return nil, err
	}
	artifact, err := v.artifact(name, patch)
	if err != nil {
		return nil, err
	}
	v.event(run.SourceAgister, "ARTIFACT_STORED", map[string]any{"name": artifact.Name, "digest": artifact.Digest, "bytes": artifact.Bytes})
	return &artifact, nil
}

// save records an attempt with the run.
func (v *verification) save(attempt run.Attempt) error {
	v.record.Attempts = append(v.record.Attempts, attempt)
	return v.update(*v.record)
}

// stop ends the loop at an attempt, recording it and why.
func (v *verification) stop(attempt run.Attempt, fault *run.Error) *run.Error {
	attempt.Stopped = fault.String()
	// The record is finished with it whether or not this update lands.
	_ = v.save(attempt)
	v.event(run.SourceAgister, "VERIFY_STOPPED", map[string]any{"attempt": attempt.Number, "class": string(fault.Class), "message": fault.Message})
	return fault
}

// failure is the fault of a step that failed: cancelled when the call was.
func (v *verification) failure(ctx context.Context, step string, err error) *run.Error {
	if ctx.Err() != nil {
		return run.Fault(run.ClassCancelled, "cancelled while %s: %v", step, err)
	}
	return run.Fault(run.ClassInternal, "%s: %v", step, err)
}

// ended says how a run ended, as the repair turn is told.
func ended(ran run.CommandRun) string {
	if ran.Exit.Code != nil {
		text := fmt.Sprintf("exit code %d", *ran.Exit.Code)
		if ran.After != "" {
			text += "; the run changed the checkout's content, which fails it whatever its exit code"
		}
		return text
	}
	return "killed by " + ran.Exit.Signal
}

func sameExit(a, b *run.Exit) bool {
	return a.Signal == b.Signal && (a.Code == nil) == (b.Code == nil) && (a.Code == nil || *a.Code == *b.Code)
}

func bounded(result CommandResult) run.Output {
	return run.Output{
		Head:    string(result.Head),
		Tail:    string(result.Tail),
		Bytes:   result.Bytes,
		Omitted: result.Bytes - int64(len(result.Head)+len(result.Tail)),
		SHA256:  result.SHA256,
	}
}
