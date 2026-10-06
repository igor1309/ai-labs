package app

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

// Borrower lends an in-place call the caller's worktree (ADR-022): it holds
// the worktree's lock, refuses while another run may still write there,
// admits the worktree only as the revision left it, and runs its precheck,
// all before the call's first turn. It never changes the worktree.
type Borrower struct {
	locks     BorrowLocks
	worktrees BorrowWorktrees
	content   BorrowContent
	runs      BorrowRuns
	processes BorrowProcesses
	prechecks BorrowPrechecks
}

// BorrowLocks holds one lock per worktree, in a namespace of its own under
// Agister's state, apart from the worktree commands' (ADR-022 rule 3).
type BorrowLocks interface {
	// Lock takes the lock of the worktree at dir, without waiting, and
	// returns the worktree's canonical path, symlinks resolved, which keys
	// it, and the release of the lock. A lock another call holds is an
	// error that wraps ErrWorktreeLocked.
	Lock(dir string) (key string, unlock func() error, err error)
}

// ErrWorktreeLocked is what a worktree's lock is refused with while another
// call holds it.
var ErrWorktreeLocked = errors.New("the worktree's lock is held")

// BorrowWorktrees reads a worktree's git state, and writes nothing in it.
type BorrowWorktrees interface {
	State(ctx context.Context, dir, revision string) (WorktreeState, error)
}

// WorktreeState is what decides whether a worktree is still as revision
// left it, besides its content.
type WorktreeState struct {
	Head string // the commit HEAD names
	Tree string // revision's tree: the content identity of a clean worktree
	// The paths whose index entry differs from HEAD's, conflicts included.
	Staged []string
	// The submodules whose checkout differs from the commit recorded, or
	// holds changes of its own.
	DirtySubmodules []string
	// The untracked files that are not ignored.
	Untracked []string
}

// BorrowContent names a worktree's content as a patch would: the files of
// revision as the worktree has them, and its untracked files that are not
// ignored, whatever its index flags hide.
type BorrowContent interface {
	Identity(ctx context.Context, dir, revision string) (string, error)
}

// BorrowRuns lists every run's record, to find the runs that worked in a
// worktree.
type BorrowRuns interface {
	// ListStrict refuses an incomplete listing when any record cannot be read.
	ListStrict(ctx context.Context) ([]run.Record, error)
}

// BorrowProcesses ends a process another run recorded, through the seam
// the reap uses.
type BorrowProcesses interface {
	// Reap ends the process the reference names, unless it may be another
	// one by now: then it is ReapLeft.
	Reap(ctx context.Context, ref string) (Reaping, error)
}

// BorrowPrechecks runs the precheck of an in-place call.
type BorrowPrechecks interface {
	// Precheck runs it once and records the run; a refusal when it did not
	// exit zero within its timeout.
	Precheck(ctx context.Context, call PrecheckCall) error
}

// BorrowAdapters are what a Borrower runs on besides the precheck runner.
type BorrowAdapters struct {
	Locks     BorrowLocks
	Worktrees BorrowWorktrees
	Content   BorrowContent
	Runs      BorrowRuns
	Writers   BorrowProcesses
}

// NewBorrower returns the component that lends calls the caller's worktree.
// Every collaborator is required.
func NewBorrower(locks BorrowLocks, worktrees BorrowWorktrees, content BorrowContent, runs BorrowRuns, processes BorrowProcesses, prechecks BorrowPrechecks) *Borrower {
	return &Borrower{locks: locks, worktrees: worktrees, content: content, runs: runs, processes: processes, prechecks: prechecks}
}

// BorrowCall is one in-place call asking for the worktree at Dir, and what
// it records to.
type BorrowCall struct {
	Record *run.Record
	Event  func(source, kind string, data map[string]any)
	Update func(run.Record) error

	Dir                string
	RepositoryIdentity string
	Revision           string
	// Precheck gates the call; nil when the settings declare none.
	Precheck *SetupCommand
	// Verify is where the call verifies (run.InPlace.Verify).
	Verify string
}

// Borrowed is the worktree as a call holds it.
type Borrowed struct {
	// Release lets the worktree's lock go. The call keeps it until its
	// changes are captured.
	Release func() error
	// Head is the commit the worktree's HEAD names now.
	Head func(ctx context.Context) (string, error)
}

// Borrow lends the call the worktree at call.Dir, or refuses it, before any
// turn: the worktree's lock must be free, no run that worked there may
// still have a writer, the worktree must be exactly the revision's (rule
// 4), and the precheck, if any, must pass and leave it so (rule 5). The
// worktree is on the call's record (run.InPlace) once its lock is held. A
// call refused holds no lock.
func (b *Borrower) Borrow(ctx context.Context, call BorrowCall) (borrowed *Borrowed, err error) {
	key, unlock, err := b.locks.Lock(call.Dir)
	if errors.Is(err, ErrWorktreeLocked) {
		return nil, refuse("worktree %s is in use: another in-place call holds it (ADR-022 rule 3)", call.Dir)
	}
	if err != nil {
		return nil, fmt.Errorf("locking worktree %s: %w", call.Dir, err)
	}
	defer func() {
		if err != nil {
			if unlockErr := unlock(); unlockErr != nil {
				call.Event(run.SourceAgister, "WORKTREE_UNLOCK_FAILED", map[string]any{"error": unlockErr.Error()})
			}
		}
	}()
	// On record before anything is run there: a call killed from here on
	// leaves a run that names the worktree.
	call.Record.Workspace = call.Dir
	call.Record.InPlace = &run.InPlace{Dir: call.Dir, Worktree: key, RepositoryIdentity: call.RepositoryIdentity, Revision: call.Revision, Verify: call.Verify}
	if err := call.Update(*call.Record); err != nil {
		call.Record.InPlace = nil
		return nil, fmt.Errorf("recording the worktree failed: %w", err)
	}
	call.Event(run.SourceAgister, "WORKTREE_LOCKED", map[string]any{"dir": call.Dir, "worktree": key})
	if err := b.writers(ctx, call, key); err != nil {
		return nil, err
	}
	if err := b.admit(ctx, call, ""); err != nil {
		return nil, err
	}
	if precheck := call.Precheck; precheck != nil {
		if err := b.prechecks.Precheck(ctx, PrecheckCall{Record: call.Record, Event: call.Event, Update: call.Update, Precheck: *precheck, Dir: call.Dir}); err != nil {
			return nil, err
		}
		if err := b.admit(ctx, call, "after the precheck, "); err != nil {
			return nil, err
		}
	}
	call.Event(run.SourceAgister, "WORKTREE_ADMITTED", map[string]any{"dir": call.Dir, "revision": call.Revision})
	return &Borrowed{
		Release: unlock,
		Head: func(ctx context.Context) (string, error) {
			state, err := b.worktrees.State(ctx, call.Dir, call.Revision)
			return state.Head, err
		},
	}, nil
}

// writers refuses while a run that worked in the worktree may still write
// there (ADR-022 rule 3): one unfinished, or one with a process that is not
// known to have ended, unless that process can be ended now.
func (b *Borrower) writers(ctx context.Context, call BorrowCall, key string) error {
	records, err := b.runs.ListStrict(ctx)
	if err != nil {
		return refuse("the runs that may still write in worktree %s cannot be read: %v", call.Dir, err)
	}
	for _, other := range records {
		if other.ID == call.Record.ID || other.InPlace == nil || other.InPlace.Worktree != key {
			continue
		}
		if other.FinishedAt == nil {
			return refuse("run %s worked in worktree %s and has not finished: it may still write there", other.ID, call.Dir)
		}
		if other.ProcessesEnded || other.Effects == nil {
			continue
		}
		for _, process := range []struct {
			name    string
			process *run.Process
		}{{"runtime", other.Effects.Process}, {"command", other.Effects.Command}} {
			if process.process == nil {
				continue
			}
			reaping, err := b.processes.Reap(ctx, process.process.Ref)
			data := map[string]any{"run": other.ID, "process": process.name, "ref": process.process.Ref, "outcome": string(reaping)}
			if err != nil {
				data["error"] = err.Error()
			}
			call.Event(run.SourceAgister, "WORKTREE_WRITER_REAPED", data)
			if err != nil || reaping == ReapLeft {
				reason := "it cannot be told apart from another"
				if err != nil {
					reason = err.Error()
				}
				return refuse("run %s worked in worktree %s, and its %s process %q may still write there: it could not be ended: %s", other.ID, call.Dir, process.name, process.process.Ref, reason)
			}
		}
	}
	return nil
}

// admit refuses a worktree that is not exactly the revision's (ADR-022
// rule 4), each reason on its own; prefix says when it was found.
func (b *Borrower) admit(ctx context.Context, call BorrowCall, prefix string) error {
	state, err := b.worktrees.State(ctx, call.Dir, call.Revision)
	if err != nil {
		return fmt.Errorf("reading worktree %s: %w", call.Dir, err)
	}
	refused := func(format string, args ...any) error {
		reason := fmt.Sprintf(format, args...)
		call.Event(run.SourceAgister, "WORKTREE_NOT_ADMITTED", map[string]any{"reason": reason})
		return refuse("%sworktree %s %s; an in-place call starts from the revision exactly (ADR-022 rule 4)", prefix, call.Dir, reason)
	}
	switch {
	case state.Head != call.Revision:
		return refused("is at %s, not revision %s", state.Head, call.Revision)
	case len(state.Staged) > 0:
		return refused("has staged changes: %s", strings.Join(state.Staged, ", "))
	case len(state.DirtySubmodules) > 0:
		return refused("has dirty submodules: %s", strings.Join(state.DirtySubmodules, ", "))
	case len(state.Untracked) > 0:
		return refused("has untracked files that are not ignored: %s", strings.Join(state.Untracked, ", "))
	}
	identity, err := b.content.Identity(ctx, call.Dir, call.Revision)
	if err != nil {
		return fmt.Errorf("naming worktree %s's content: %w", call.Dir, err)
	}
	if identity != state.Tree {
		return refused("has content %s, not revision %s's %s (a tracked file changed, even one its index marks unchanged)", identity, call.Revision, state.Tree)
	}
	return nil
}
