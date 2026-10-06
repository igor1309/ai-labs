package app

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"path/filepath"
	"slices"
	"strings"

	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

// Borrower lends an in-place call the caller's worktree (ADR-022): it holds
// the worktree's lock, refuses one that overlaps a directory Agister made
// and still removes, or one another run may still write in, admits the
// worktree only as the revision left it, or, for a continuation, as the
// session's latest run left it, and runs its precheck, all before the
// call's first turn. It never changes the worktree.
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
	// Key returns the canonical path that would key the directory at dir,
	// as Lock returns it, and takes no lock: a directory a run recorded is
	// the worktree, holds it or lies in it only by this path. It is empty
	// for a directory that is not there, which is no worktree.
	Key(dir string) (key string, err error)
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
// worktree, and reads back the changes a continued session's latest run
// recorded.
type BorrowRuns interface {
	// ListStrict refuses an incomplete listing when any record cannot be read.
	ListStrict(ctx context.Context) ([]run.Record, error)
	// Artifact reads back the bytes of an artifact the run stored, as its
	// record names it.
	Artifact(ctx context.Context, runID string, artifact run.Artifact) ([]byte, error)
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
	// Latest is the session's latest run, as recorded, when the call
	// continues a session (ADR-022 rule 8): the worktree must be as it left
	// it. Nil for a fresh call.
	Latest *run.Record
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
// turn: the worktree's lock must be free, no directory Agister made and
// still removes may overlap it (rule 2), no run that worked in a directory
// overlapping it may still have a writer (rule 3), the worktree must be
// exactly the revision's (rule 4), or, continuing, exactly as the session's
// latest run left it (rule 8),
// and the precheck, if any, must pass and leave it so (rule 5). The
// worktree is on the call's record (run.InPlace) once its lock is held. A
// call refused holds no lock, nor does one a collaborator's panic ends.
func (b *Borrower) Borrow(ctx context.Context, call BorrowCall) (*Borrowed, error) {
	key, unlock, err := b.locks.Lock(call.Dir)
	if errors.Is(err, ErrWorktreeLocked) {
		return nil, refuse("worktree %s is in use: another in-place call holds it (ADR-022 rule 3)", call.Dir)
	}
	if err != nil {
		return nil, fmt.Errorf("locking worktree %s: %w", call.Dir, err)
	}
	// The lock is the call's only once Borrow hands it over: on any other
	// way out, a panic included, it is let go here.
	lent := false
	defer func() {
		if lent {
			return
		}
		if unlockErr := unlock(); unlockErr != nil {
			call.Event(run.SourceAgister, "WORKTREE_UNLOCK_FAILED", map[string]any{"error": unlockErr.Error()})
		}
	}()
	// On record before anything is run there: a call killed from here on
	// leaves a run that names the worktree, and that a reap finishes: the
	// reap takes only runs with effects on record, and the worktree is not
	// one of them, so they start empty.
	previous := call.Record.Effects
	if previous == nil {
		call.Record.Effects = &run.Effects{}
	}
	call.Record.Workspace = call.Dir
	call.Record.InPlace = &run.InPlace{Dir: call.Dir, Worktree: key, RepositoryIdentity: call.RepositoryIdentity, Revision: call.Revision, Verify: call.Verify}
	if err := call.Update(*call.Record); err != nil {
		call.Record.InPlace, call.Record.Effects = nil, previous
		return nil, fmt.Errorf("recording the worktree failed: %w", err)
	}
	call.Event(run.SourceAgister, "WORKTREE_LOCKED", map[string]any{"dir": call.Dir, "worktree": key})
	records, err := b.runs.ListStrict(ctx)
	if err != nil {
		return nil, refuse("the runs that may still write in worktree %s cannot be read: %v", call.Dir, err)
	}
	// What other runs still hold of the worktree, found once. A directory
	// Agister removes is refused before any process is ended for the
	// worktree: one that is not the caller's to lend ends nothing.
	claims, err := b.claims(call, key, records)
	if err != nil {
		return nil, err
	}
	if err := b.made(call, claims); err != nil {
		return nil, err
	}
	if err := b.writers(ctx, call, claims); err != nil {
		return nil, err
	}
	// The content the worktree must hold: the revision's, or what the
	// session's latest run left there.
	expected := ""
	if call.Latest != nil {
		if expected, err = b.resumable(ctx, call, key); err != nil {
			return nil, err
		}
	}
	if err := b.admit(ctx, call, "", expected); err != nil {
		return nil, err
	}
	if precheck := call.Precheck; precheck != nil {
		if err := b.prechecks.Precheck(ctx, PrecheckCall{Record: call.Record, Event: call.Event, Update: call.Update, Precheck: *precheck, Dir: call.Dir}); err != nil {
			return nil, err
		}
		if err := b.admit(ctx, call, "after the precheck, ", expected); err != nil {
			return nil, err
		}
	}
	call.Event(run.SourceAgister, "WORKTREE_ADMITTED", map[string]any{"dir": call.Dir, "revision": call.Revision})
	lent = true
	return &Borrowed{
		Release: unlock,
		Head: func(ctx context.Context) (string, error) {
			state, err := b.worktrees.State(ctx, call.Dir, call.Revision)
			return state.Head, err
		},
	}, nil
}

// claim is a directory another run has on record that overlaps the
// worktree a call asks for, which that run may still write in or Agister
// may still remove.
type claim struct {
	run *run.Record
	dir string // as the run recorded it
	// lies says how the worktree lies to the directory: it "is" it, "is
	// inside" it or "contains" it.
	lies string
	// removed names the directory as one Agister made and still removes;
	// empty for one the run may only still write in.
	removed string
}

// claims lists the directories other runs have on record that overlap the
// worktree key names, each run's in the order made refuses them. It is the
// one place that says which of a run's directories count, and what
// overlapping is (ADR-022 rules 2 and 3), for any run, in-place, in a
// checkout of its own or in the repository itself: a directory Agister may
// still remove, which is the checkout of a run that has not finished, a
// clean copy or an unreleased checkout on record, each with the directory
// made to hold it, its parent, which is removed with it and with whatever
// else is there, a repository beside the checkout included; and every
// directory of a run that may still write, which is one unfinished or one
// with a process not known to have ended. A writer works in the checkout,
// not in the directory that holds it. A directory overlaps the worktree
// when it is the worktree, holds it or lies in it, by its canonical path
// alone: what a removal takes, and where a writer reaches, is everything
// under a directory. records are every run's.
func (b *Borrower) claims(call BorrowCall, key string, records []run.Record) ([]claim, error) {
	var claims []claim
	for i := range records {
		other := &records[i]
		if other.ID == call.Record.ID {
			continue
		}
		var effects run.Effects
		if other.Effects != nil {
			effects = *other.Effects
		}
		type recorded struct {
			dir, removed string
		}
		var dirs []recorded
		// The directory first: a worktree that overlaps it is refused as
		// that, not as one in its parent.
		removes := func(made *run.Checkout, what string) {
			dirs = append(dirs, recorded{made.Dir, what}, recorded{filepath.Dir(made.Dir), "the directory made for " + what})
		}
		// A finished run's checkout stays on record, released.
		if checkout := effects.Checkout; checkout != nil && other.FinishedAt == nil {
			removes(checkout, "the checkout of run "+other.ID+", which has not finished")
		}
		if copied := effects.Copy; copied != nil {
			removes(copied, "a clean copy run "+other.ID+" still has on record")
		}
		if unreleased := effects.Unreleased; unreleased != nil {
			removes(unreleased, "a checkout run "+other.ID+" could not release")
		}
		if other.FinishedAt == nil || len(unended(other)) > 0 {
			// Where its runtime works, and where its commands run.
			worked := []string{other.Workspace}
			if other.InPlace != nil {
				worked = append(worked, other.InPlace.Worktree)
			}
			for _, checkout := range []*run.Checkout{effects.Checkout, effects.Copy, effects.Unreleased} {
				if checkout != nil {
					worked = append(worked, checkout.Dir)
				}
			}
			for _, dir := range worked {
				if dir != "" && !slices.ContainsFunc(dirs, func(r recorded) bool { return r.dir == dir }) {
					dirs = append(dirs, recorded{dir: dir})
				}
			}
		}
		for _, dir := range dirs {
			canonical, err := b.locks.Key(dir.dir)
			if err != nil {
				return nil, refuse("worktree %s cannot be told apart from %s, which run %s recorded: %v", call.Dir, dir.dir, other.ID, err)
			}
			if how := lies(key, canonical); how != "" {
				claims = append(claims, claim{run: other, dir: dir.dir, lies: how, removed: dir.removed})
			}
		}
	}
	return claims, nil
}

// lies says how the worktree lies to a directory, both by their canonical
// paths: it "is" it, "is inside" it or "contains" it. It is empty when
// neither holds the other, and for a directory that is not there, whose
// path is empty.
func lies(worktree, dir string) string {
	under := func(path, dir string) bool {
		separator := string(filepath.Separator)
		return strings.HasPrefix(path, strings.TrimSuffix(dir, separator)+separator)
	}
	switch {
	case dir == "":
		return ""
	case worktree == dir:
		return "is"
	case under(worktree, dir):
		return "is inside"
	case under(dir, worktree):
		return "contains"
	}
	return ""
}

// unended are the processes a finished run recorded that are not known to
// have ended, by name.
func unended(other *run.Record) []unendedProcess {
	if other.ProcessesKnownEnded() || other.Effects == nil {
		return nil
	}
	var processes []unendedProcess
	for _, process := range []unendedProcess{{"runtime", other.Effects.Process}, {"command", other.Effects.Command}} {
		if process.process != nil {
			processes = append(processes, process)
		}
	}
	return processes
}

// unendedProcess is a process a run recorded, and what it ran.
type unendedProcess struct {
	name    string
	process *run.Process
}

// made refuses a worktree that overlaps a directory Agister made and still
// removes: the checkout of another run that has not finished, which its
// release or a reap removes, or a clean copy or an unreleased checkout a
// run still has on record, which a reap removes, and the directory made
// for any of them, removed with it. The removal takes all that is under the
// directory, a repository nested in it included: a call lent one would lose
// its work with it, and nothing of Agister's removes a borrowed worktree or
// anything in it (ADR-022 rules 2 and 7).
func (b *Borrower) made(call BorrowCall, claims []claim) error {
	for _, held := range claims {
		if held.removed == "" {
			continue
		}
		reason := held.lies + " " + held.removed
		if held.lies != "is" {
			reason += " (" + held.dir + ")"
		}
		call.Event(run.SourceAgister, "WORKTREE_NOT_ADMITTED", map[string]any{"reason": reason, "run": held.run.ID})
		return refuse("worktree %s %s: Agister made that directory and removes it with all that is in it, so the worktree is not the caller's to lend (ADR-022 rule 2)", call.Dir, reason)
	}
	return nil
}

// writers refuses while a run that worked in a directory overlapping the
// worktree may still write there (ADR-022 rule 3): one unfinished, or one
// with a process that is not known to have ended, unless that process can
// be ended now. The run may be any: in-place, in the repository itself, or
// in a checkout of its own.
func (b *Borrower) writers(ctx context.Context, call BorrowCall, claims []claim) error {
	var asked []string
	for _, held := range claims {
		other := held.run
		if slices.Contains(asked, other.ID) {
			continue
		}
		asked = append(asked, other.ID)
		where := "worktree " + call.Dir
		switch held.lies {
		case "is inside":
			where = fmt.Sprintf("%s (which holds worktree %s)", held.dir, call.Dir)
		case "contains":
			where = fmt.Sprintf("%s (inside worktree %s)", held.dir, call.Dir)
		}
		if other.FinishedAt == nil {
			return refuse("run %s worked in %s and has not finished: it may still write there", other.ID, where)
		}
		for _, process := range unended(other) {
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
				return refuse("run %s worked in %s, and its %s process %q may still write there: it could not be ended: %s", other.ID, where, process.name, process.process.Ref, reason)
			}
		}
	}
	return nil
}

// resumable refuses a continuation unless the session's latest run worked
// in-place in this worktree, of the same repository and revision, and its
// changes were captured and still match their record (ADR-022 rule 8),
// each reason on its own. It returns the content that run left there.
func (b *Borrower) resumable(ctx context.Context, call BorrowCall, key string) (string, error) {
	latest := call.Latest
	refused := func(format string, args ...any) error {
		reason := fmt.Sprintf(format, args...)
		call.Event(run.SourceAgister, "WORKTREE_NOT_ADMITTED", map[string]any{"reason": reason, "run": latest.ID})
		return refuse("%s; a continuation in-place resumes where the session's latest run left the worktree (ADR-022 rule 8)", reason)
	}
	worked := latest.InPlace
	switch {
	case worked == nil:
		return "", refused("run %s, the latest run of the session, worked in a checkout of its own, not in-place; a session does not switch from temporary to in-place", latest.ID)
	case worked.Worktree != key:
		return "", refused("run %s, the latest run of the session, worked in worktree %s, not %s", latest.ID, worked.Worktree, key)
	case worked.RepositoryIdentity != call.RepositoryIdentity:
		return "", refused("run %s, the latest run of the session, worked in repository %s, not %s", latest.ID, worked.RepositoryIdentity, call.RepositoryIdentity)
	case worked.Revision != call.Revision:
		return "", refused("run %s, the latest run of the session, worked on revision %s, not %s", latest.ID, worked.Revision, call.Revision)
	case worked.Content == "":
		return "", refused("run %s, the latest run of the session, recorded no content its changes were captured from: its capture failed or never ran", latest.ID)
	}
	var patch *run.Artifact
	if latest.Result != nil {
		for i, artifact := range latest.Result.Artifacts {
			if artifact.Name == "changes.patch" {
				patch = &latest.Result.Artifacts[i]
			}
		}
	}
	// No patch with the content recorded is a run that changed nothing.
	if patch != nil {
		data, err := b.runs.Artifact(ctx, latest.ID, *patch)
		if err != nil {
			return "", refused("run %s's changes.patch cannot be read: %v", latest.ID, err)
		}
		sum := sha256.Sum256(data)
		if digest := "sha256:" + hex.EncodeToString(sum[:]); digest != patch.Digest {
			return "", refused("run %s's changes.patch is %s, not %s as recorded", latest.ID, digest, patch.Digest)
		}
	}
	return worked.Content, nil
}

// admit refuses a worktree that is not exactly the revision's (ADR-022
// rule 4), or, when expected names content, one that does not hold it with
// HEAD at the revision (rule 8), each reason on its own; prefix says when
// it was found.
func (b *Borrower) admit(ctx context.Context, call BorrowCall, prefix, expected string) error {
	state, err := b.worktrees.State(ctx, call.Dir, call.Revision)
	if err != nil {
		return fmt.Errorf("reading worktree %s: %w", call.Dir, err)
	}
	refused := func(format string, args ...any) error {
		reason := fmt.Sprintf(format, args...)
		call.Event(run.SourceAgister, "WORKTREE_NOT_ADMITTED", map[string]any{"reason": reason})
		if expected != "" {
			return refuse("%sworktree %s %s; a continuation in-place resumes where the session's latest run left the worktree (ADR-022 rule 8)", prefix, call.Dir, reason)
		}
		return refuse("%sworktree %s %s; an in-place call starts from the revision exactly (ADR-022 rule 4)", prefix, call.Dir, reason)
	}
	if expected != "" {
		// The session's changes are in the worktree, uncommitted: only HEAD
		// and the content they left are checked.
		if state.Head != call.Revision {
			return refused("is at %s, not revision %s", state.Head, call.Revision)
		}
		identity, err := b.content.Identity(ctx, call.Dir, call.Revision)
		if err != nil {
			return fmt.Errorf("naming worktree %s's content: %w", call.Dir, err)
		}
		if identity != expected {
			return refused("has content %s, not %s, which run %s, the latest run of the session, left there", identity, expected, call.Latest.ID)
		}
		return nil
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
