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
// verify (ADR-002), through the contracts it declares here: one loop per
// call (Verify).
type Verifier struct {
	content  VerifyContent
	copies   VerifyCopies
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

// VerifyCopies makes the clean copies verification runs in: what a call
// delivers is its patch, so the command checks the base with that patch
// applied, not the checkout the agent works in.
type VerifyCopies interface {
	// Copy checks revision out of repository apart from every other
	// checkout, applies patch to its files, and returns its directory and
	// what removes it.
	Copy(ctx context.Context, repository, revision string, patch []byte) (dir string, remove func() error, err error)
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
func NewVerifier(content VerifyContent, copies VerifyCopies, commands VerifyCommands, clock VerifyClock) *Verifier {
	return &Verifier{content: content, copies: copies, commands: commands, clock: clock}
}

// VerifyCall is what one call's verification loop checks, repairs with and
// records to.
type VerifyCall struct {
	Record *run.Record
	Result *run.Result
	Event  func(source, kind string, data map[string]any)
	// Update and Artifact write the run's evidence.
	Update   func(run.Record) error
	Artifact func(name string, data []byte) (run.Artifact, error)

	Verify   definition.Verify
	Limit    *float64  // the call's cost limit, one budget for every turn
	Deadline time.Time // the call's timeout, for every turn and run
	Dir      string    // the call's checkout
	Base     string    // the revision it was checked out at
	// Repository is the one Dir is a checkout of, where the clean copies
	// are made.
	Repository string
	// Request is the call's first turn, which every repair repeats with
	// the failure as its prompt.
	Request TurnRequest
	// Session is the provider session of the call's first turn, which
	// every repair resumes.
	Session string

	// Take runs a turn and records it with the call, given the resumed
	// session's totals before it; Conclude says whether a turn ended
	// validly, and why not.
	Take     func(TurnRequest, *run.SessionTotals) run.Turn
	Conclude func(run.Turn) *run.Error
}

// Verify verifies the call's latest turn, which was valid, and repairs
// until a run passes or the loop must stop. It returns the content the
// passing run checked, and the fault that stopped the loop without a pass.
func (v *Verifier) Verify(ctx context.Context, call VerifyCall) (verified string, fault *run.Error) {
	loop := &verification{
		content: v.content, copies: v.copies, commands: v.commands, clock: v.clock,
		record: call.Record, result: call.Result, event: call.Event, update: call.Update, artifact: call.Artifact,
		verify: call.Verify, limit: call.Limit, deadline: call.Deadline, dir: call.Dir, base: call.Base, repository: call.Repository,
		request: call.Request, session: call.Session, take: call.Take, conclude: call.Conclude,
	}
	fault = loop.run(ctx)
	return loop.verified, fault
}

// verification is one call's verification loop: after a valid turn it runs
// the process's command in a clean copy of the base with the turn's changes
// applied, and on a failure with attempts, time and budget left, resumes
// the call's session in place with the failure and checks again. Every
// attempt is recorded before the next turn starts.
type verification struct {
	content  VerifyContent
	copies   VerifyCopies
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
	// repository is the one dir is a checkout of, where the clean copies
	// are made.
	repository string
	request    TurnRequest
	// session is the provider session of the call's first turn, which
	// every repair resumes.
	session string

	take     func(TurnRequest, *run.SessionTotals) run.Turn
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

		ran, fault := v.check(ctx, number, identity, timeout)
		attempt.Run = ran
		if fault != nil {
			return v.stop(attempt, fault)
		}
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
		// The run was in its clean copy, not the checkout: a repair's changes
		// are from the content checked.
		from = identity
		ran.Passed = ran.Exit.Code != nil && *ran.Exit.Code == 0 && ran.After == ""
		if ran.Passed {
			// The node completes only once the passing attempt is recorded.
			if err := v.save(attempt); err != nil {
				return run.Fault(run.ClassInternal, "recording attempt %d failed: %v", number, err)
			}
			v.verified = identity
			return nil
		}

		if fault := v.exhausted(*ran, previous, number); fault != nil {
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
		previous = ran

		// Rule 4: the repair resumes the call's own session in place.
		request := v.request
		request.Prompt = prompt.Repair(v.verify.Instruction, v.verify.Command, ended(*ran), ran.Output)
		request.ResumeSessionID = v.session
		request.Timeout = remaining
		request.MaxCostUSD = budget
		v.event(run.SourceAgister, "REPAIR_STARTED", map[string]any{"attempt": number + 1, "session": v.session})
		// The session's totals before the repair are what the call's turn
		// before it reported.
		repair := v.take(request, turn.Session)
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
// every turn so far cost on its own (rule 5). With a limit and a cost unknown, the
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

// check runs the command once on a clean copy of the base with the
// patch to identity applied, so it checks exactly what the call would
// deliver; the copy must have that content, or the captured changes do not
// reproduce it and the call fails. The copy is on record while it exists
// and removed on every path. A run that ended, not killed or failed to
// run, is compared with the content it checked (rule 7). The run is nil
// when the command never ran.
func (v *verification) check(ctx context.Context, number int, identity string, timeout time.Duration) (*run.CommandRun, *run.Error) {
	patch, err := v.content.Changes(ctx, v.dir, v.base, identity)
	if err != nil {
		return nil, v.failure(ctx, "capturing the changes to check", err)
	}
	dir, remove, err := v.copies.Copy(ctx, v.repository, v.base, patch)
	if err != nil {
		return nil, v.failure(ctx, "making the clean copy to check", err)
	}
	defer v.removeCopy(number, dir, remove)
	if err := v.recordCopy(dir); err != nil {
		return nil, run.Fault(run.ClassInternal, "%v", err)
	}
	copied, err := v.content.Identity(ctx, dir, v.base)
	if err != nil {
		return nil, v.failure(ctx, "naming the clean copy's content", err)
	}
	if copied != identity {
		return nil, run.Fault(run.ClassInternal, "the captured changes do not reproduce attempt %d's content: applied to %s they make %s, not %s", number, v.base, copied, identity)
	}

	ran := v.runCommand(ctx, number, dir, timeout)
	if ran.Cancelled || ran.TimedOut || ran.Error != "" {
		return &ran, nil
	}
	// Rule 7: a run that changes the content fails, whatever its exit.
	after, err := v.content.Identity(ctx, dir, v.base)
	if err != nil {
		return &ran, v.failure(ctx, "naming the clean copy's content after the run", err)
	}
	if after != identity {
		ran.After = after
		v.event(run.SourceAgister, "VERIFY_CHANGED_CONTENT", map[string]any{"attempt": number, "checked": identity, "after": after})
		if ran.AfterChanges, err = v.keep(ctx, fmt.Sprintf("attempt-%d-run.patch", number), identity, after); err != nil {
			return &ran, v.failure(ctx, "keeping the run's changes", err)
		}
	}
	return &ran, nil
}

// recordCopy records the clean copy on the run, so a reap after a killed
// CLI removes it. A copy that cannot be recorded is not claimed by the
// record; the caller removes it.
func (v *verification) recordCopy(dir string) error {
	previous := v.record.Effects
	effects := run.Effects{}
	if previous != nil {
		effects = *previous
	}
	effects.Copy = &run.Checkout{Repository: v.repository, Dir: dir}
	v.record.Effects = &effects
	if err := v.update(*v.record); err != nil {
		v.record.Effects = previous
		return fmt.Errorf("recording the clean copy failed: %w", err)
	}
	return nil
}

// removeCopy removes the clean copy and, once it is gone, its record. One
// that could not be removed stays on record, and the failure is an event.
func (v *verification) removeCopy(number int, dir string, remove func() error) {
	if err := remove(); err != nil {
		v.event(run.SourceAgister, "VERIFY_COPY_REMOVE_FAILED", map[string]any{"attempt": number, "dir": dir, "error": err.Error()})
		return
	}
	if effects := v.record.Effects; effects != nil && effects.Copy != nil && effects.Copy.Dir == dir {
		cleared := *effects
		cleared.Copy = nil
		v.record.Effects = &cleared
		// A record that still names a removed copy costs a reap nothing: a
		// copy already gone is discarded as success.
		_ = v.update(*v.record)
	}
}

// runCommand runs the verification command once in dir, its process group
// on record as an effect of the call while it runs.
func (v *verification) runCommand(ctx context.Context, number int, dir string, timeout time.Duration) run.CommandRun {
	v.event(run.SourceAgister, "VERIFY_STARTED", map[string]any{"attempt": number, "command": v.verify.Command, "dir": dir, "timeout": timeout.String()})
	started := v.clock.Now()
	result := v.commands.Run(ctx, CommandRequest{Command: v.verify.Command, Dir: dir, Timeout: timeout, Bound: verifyOutputBound}, v.recordGroup)
	finished := v.clock.Now()
	ran := run.CommandRun{
		Command:    v.verify.Command,
		Dir:        dir,
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
			text += "; the run changed the content it checked, which fails it whatever its exit code"
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
