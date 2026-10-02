package app

import (
	"context"

	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

// SetupCall is the setup one call's checkout runs (ADR-010), where, and
// what it records to.
type SetupCall struct {
	Record *run.Record
	Event  func(source, kind string, data map[string]any)
	// Update and Artifact write the run's evidence.
	Update   func(run.Record) error
	Artifact func(name string, data []byte) (run.Artifact, error)

	Setup definition.Setup
	Dir   string // the call's checkout, fresh
	Base  string // the revision it was checked out at
}

// Setup runs the call's setup command once in its checkout, before the
// first turn, with the operator's authority, its process group on record
// while it runs. It fails the call if the command does not exit zero
// within its timeout, or leaves the checkout's content other than the
// revision's: what it makes must be ignored (ADR-010 rule 4). The run is
// on record either way.
func (v *Verifier) Setup(ctx context.Context, call SetupCall) *run.Error {
	failure := func(step string, err error) *run.Error {
		if ctx.Err() != nil {
			return run.Fault(run.ClassCancelled, "cancelled while %s: %v", step, err)
		}
		return run.Fault(run.ClassInternal, "%s: %v", step, err)
	}
	// The checkout is fresh, so its content is the revision's.
	before, err := v.content.Identity(ctx, call.Dir, call.Base)
	if err != nil {
		return failure("naming the checkout's content before its setup", err)
	}
	setup := call.Setup
	call.Event(run.SourceAgister, "SETUP_STARTED", map[string]any{"command": setup.Command, "dir": call.Dir, "timeout": setup.Timeout.String()})
	started := v.clock.Now()
	result := v.commands.Run(ctx, CommandRequest{Command: setup.Command, Dir: call.Dir, Timeout: setup.Timeout, Bound: verifyOutputBound},
		func(ref string) error { return recordGroup(call.Record, call.Update, "the setup command", ref) })
	ran := commandRun(setup.Command, call.Dir, result, started, v.clock.Now())

	fault := setupEnded(ran, setup)
	// A run that ended on its own is held to the content it started on,
	// whatever its exit.
	if !ran.Cancelled && !ran.TimedOut && ran.Error == "" {
		after, err := v.content.Identity(ctx, call.Dir, call.Base)
		switch {
		case err != nil:
			fault = failure("naming the checkout's content after its setup", err)
		case after != before:
			ran.After = after
			call.Event(run.SourceAgister, "SETUP_CHANGED_CONTENT", map[string]any{"before": before, "after": after})
			if ran.AfterChanges, err = keepChanges(ctx, v.content.Changes, call.Dir, before, after, "setup.patch", call.Artifact, call.Event); err != nil {
				fault = failure("keeping the setup's changes", err)
			} else if fault == nil {
				fault = run.Fault(run.ClassSetupFailed, "the setup command changed the checkout's content (tracked files changed or unignored files added): what it makes must be ignored")
			}
		}
	}
	ran.Passed = fault == nil
	call.Record.SetupRun = &ran
	call.Event(run.SourceAgister, "SETUP_FINISHED", map[string]any{
		"code": ran.Exit.Code, "signal": ran.Exit.Signal, "timed_out": ran.TimedOut, "cancelled": ran.Cancelled,
		"error": ran.Error, "bytes": ran.Output.Bytes, "sha256": ran.Output.SHA256, "wall_ms": ran.WallMS, "passed": ran.Passed,
	})
	if err := call.Update(*call.Record); err != nil && fault == nil {
		fault = run.Fault(run.ClassInternal, "recording the setup's run failed: %v", err)
	}
	return fault
}

// setupEnded is why the setup's run fails the call by how it ended, if it
// does.
func setupEnded(ran run.CommandRun, setup definition.Setup) *run.Error {
	switch {
	case ran.Cancelled:
		return run.Fault(run.ClassCancelled, "cancelled during the checkout's setup")
	case ran.TimedOut:
		return run.Fault(run.ClassSetupFailed, "the setup command exceeded its timeout %s", setup.Timeout)
	case ran.Error != "":
		return run.Fault(run.ClassInternal, "the setup command could not run: %s", ran.Error)
	case ran.Exit.Code == nil:
		return run.Fault(run.ClassSetupFailed, "the setup command was killed by %s", ran.Exit.Signal)
	case *ran.Exit.Code != 0:
		return run.Fault(run.ClassSetupFailed, "the setup command exited with code %d", *ran.Exit.Code)
	}
	return nil
}

// keepChanges stores the patch from one content to another, as changes
// makes it, as an artifact named name; none when they are the same.
func keepChanges(ctx context.Context, changes func(ctx context.Context, dir, from, to string) ([]byte, error), dir, from, to, name string, store func(string, []byte) (run.Artifact, error), event func(string, string, map[string]any)) (*run.Artifact, error) {
	patch, err := changes(ctx, dir, from, to)
	if err != nil || len(patch) == 0 {
		return nil, err
	}
	artifact, err := store(name, patch)
	if err != nil {
		return nil, err
	}
	event(run.SourceAgister, "ARTIFACT_STORED", map[string]any{"name": artifact.Name, "digest": artifact.Digest, "bytes": artifact.Bytes})
	return &artifact, nil
}
