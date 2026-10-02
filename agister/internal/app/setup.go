package app

import (
	"context"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

// setupOutputBound is how many bytes of setup's combined output are kept
// from each end.
const setupOutputBound = 8 << 10

// SetupCommandRequest is one run of a checkout's setup command.
type SetupCommandRequest struct {
	Command string // run as bash -c Command
	Dir     string
	Timeout time.Duration
	Bound   int // bytes kept from each end of combined stdout and stderr
}

// SetupCommandResult is how setup ended, with its process group gone.
type SetupCommandResult struct {
	ExitCode   *int // unset when signalled or the command never ran
	Signal     string
	TimedOut   bool
	Cancelled  bool
	Error      string // why the command could not start or be recorded
	Head, Tail []byte // non-overlapping ends of combined stdout and stderr
	Bytes      int64  // bytes of the whole output
	SHA256     string // hex digest of the whole output
}

// Preparer runs the setup of calls whose checkout declares one (ADR-012),
// through the contracts it declares here: one setup per call (Setup).
type Preparer struct {
	content  SetupContent
	commands SetupCommands
	clock    SetupClock
}

// SetupContent names a checkout's content and diffs two contents, so the
// setup is held to the revision's content.
type SetupContent interface {
	// Identity names the checkout's content: the files of revision as the
	// checkout has them, and its untracked files that are not ignored.
	Identity(ctx context.Context, dir, revision string) (string, error)
	// Changes returns the patch from one content, a revision or an
	// identity, to another; empty when they are the same.
	Changes(ctx context.Context, dir, from, to string) ([]byte, error)
}

// SetupCommands runs the setup command.
type SetupCommands interface {
	// Run runs the command in a process group of its own until it exits,
	// its timeout passes or ctx ends, and kills the whole group before it
	// returns. started records the group as soon as it exists, and may be
	// called again as more becomes known; an error from it means the group
	// is not on record: Run kills it and the run fails.
	Run(ctx context.Context, request SetupCommandRequest, started func(ref string) error) SetupCommandResult
}

// SetupClock tells when the setup's run starts and ends.
type SetupClock interface{ Now() time.Time }

// SetupAdapters are what a Preparer runs on.
type SetupAdapters struct {
	Content  SetupContent
	Commands SetupCommands
	Clock    SetupClock
}

// NewPreparer returns the component that runs checkouts' setups. Every
// collaborator is required.
func NewPreparer(content SetupContent, commands SetupCommands, clock SetupClock) *Preparer {
	return &Preparer{content: content, commands: commands, clock: clock}
}

// SetupCommand is the command that prepares a checkout, and how long it
// may run.
type SetupCommand struct {
	Command string
	Timeout time.Duration
}

// SetupCall is the setup one call's checkout runs (ADR-012), where, and
// what it records to.
type SetupCall struct {
	Record *run.Record
	Event  func(source, kind string, data map[string]any)
	// Update and Artifact write the run's evidence.
	Update   func(run.Record) error
	Artifact func(name string, data []byte) (run.Artifact, error)

	Setup SetupCommand
	Dir   string // the call's checkout, fresh
	Base  string // the revision it was checked out at
}

// Setup runs the call's setup command once in its checkout, before the
// first turn, with the operator's authority, its process group on record
// while it runs. It fails the call if the checkout's content is not the
// revision's before the command, as when a checkout hook changed it, if
// the command does not exit zero within its timeout, or if it leaves the
// checkout's content other than it found it: what it makes must be ignored
// (ADR-012 rule 4). The run is on record either way.
func (p *Preparer) Setup(ctx context.Context, call SetupCall) *run.Error {
	failure := func(step string, err error) *run.Error {
		if ctx.Err() != nil {
			return run.Fault(run.ClassCancelled, "cancelled while %s: %v", step, err)
		}
		return run.Fault(run.ClassInternal, "%s: %v", step, err)
	}
	before, err := p.content.Identity(ctx, call.Dir, call.Base)
	if err != nil {
		return failure("naming the checkout's content before its setup", err)
	}
	// The checkout is fresh, but what made it may have changed it: its
	// hooks run as it is made. The setup starts on the revision's content
	// or not at all.
	if drift, err := keepChanges(ctx, p.content.Changes, call.Dir, call.Base, before, "checkout.patch", call.Artifact, call.Event); err != nil {
		return failure("comparing the checkout's content with its revision before its setup", err)
	} else if drift != nil {
		call.Event(run.SourceAgister, "CHECKOUT_CHANGED_CONTENT", map[string]any{"revision": call.Base, "content": before})
		return run.Fault(run.ClassSetupFailed, "the checkout's content is not the revision's before its setup (tracked files changed or unignored files added as it was made, as by a checkout hook)")
	}
	setup := call.Setup
	call.Event(run.SourceAgister, "SETUP_STARTED", map[string]any{"command": setup.Command, "dir": call.Dir, "timeout": setup.Timeout.String()})
	started := p.clock.Now()
	result := p.commands.Run(ctx, SetupCommandRequest{Command: setup.Command, Dir: call.Dir, Timeout: setup.Timeout, Bound: setupOutputBound},
		func(ref string) error { return recordGroup(call.Record, call.Update, "the setup command", ref) })
	finished := p.clock.Now()
	ran := run.CommandRun{
		Command: setup.Command, Dir: call.Dir,
		Exit:     &run.Exit{Code: result.ExitCode, Signal: result.Signal},
		TimedOut: result.TimedOut, Cancelled: result.Cancelled, Error: result.Error,
		StartedAt: started, FinishedAt: finished, WallMS: finished.Sub(started).Milliseconds(),
		Output: run.Output{
			Head: string(result.Head), Tail: string(result.Tail), Bytes: result.Bytes,
			Omitted: result.Bytes - int64(len(result.Head)+len(result.Tail)), SHA256: result.SHA256,
		},
	}

	fault := setupEnded(ran, setup)
	// A run that ended on its own is held to the content it started on,
	// whatever its exit.
	if !ran.Cancelled && !ran.TimedOut && ran.Error == "" {
		after, err := p.content.Identity(ctx, call.Dir, call.Base)
		switch {
		case err != nil:
			fault = failure("naming the checkout's content after its setup", err)
		case after != before:
			ran.After = after
			call.Event(run.SourceAgister, "SETUP_CHANGED_CONTENT", map[string]any{"before": before, "after": after})
			if ran.AfterChanges, err = keepChanges(ctx, p.content.Changes, call.Dir, before, after, "setup.patch", call.Artifact, call.Event); err != nil {
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
func setupEnded(ran run.CommandRun, setup SetupCommand) *run.Error {
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
