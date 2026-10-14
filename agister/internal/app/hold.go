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

// Holder holds the caller's worktree for a call (ADR-025): it takes the
// worktree's hold, shared with other readers or a writer's alone, refuses
// one that overlaps a directory Agister made and still removes, or one a
// writer's run left may still write in, once it has reaped the run a dead
// owner left unfinished there, and admits the worktree only with
// HEAD at the revision the process pins, its content HEAD's when the
// process needs a clean worktree, or, for a continuation, as the session's
// latest run left it, all before the call's first turn. It never changes
// the worktree.
type Holder struct {
	locks     HoldLocks
	worktrees HoldWorktrees
	content   HoldContent
	runs      HoldRuns
	reaper    HoldReaper
	processes HoldProcesses
}

// HoldLocks holds one hold per worktree, in a namespace of its own under
// Agister's state, apart from the worktree commands' (ADR-025 rule 4).
type HoldLocks interface {
	// Lock takes the hold of the worktree at dir, without waiting: alone,
	// for a writer, or shared with other readers. It returns the
	// worktree's canonical path, symlinks resolved, which keys it, and the
	// release of the hold. A hold the call cannot take, as one another
	// call has alone, or any other for one alone, is an error that wraps
	// ErrWorktreeLocked.
	Lock(dir string, alone bool) (key string, unlock func() error, err error)
	// Key returns the canonical path that would key the directory at dir,
	// as Lock returns it, and takes no lock: a directory a run recorded is
	// the worktree, holds it or lies in it only by this path. It is empty
	// for a directory that is not there, which is no worktree.
	Key(dir string) (key string, err error)
}

// ErrWorktreeLocked is what a worktree's hold is refused with while another
// call holds it in a way that excludes it.
var ErrWorktreeLocked = errors.New("the worktree's hold is taken")

// HoldWorktrees reads a worktree's git state, and writes nothing in it.
type HoldWorktrees interface {
	State(ctx context.Context, dir, revision string) (WorktreeState, error)
	// Root returns dir's canonical git worktree root.
	Root(ctx context.Context, dir string) (string, error)
	// IsSubmodule says whether root is the canonical root of a submodule
	// tracked by the worktree's index. That root remains in the outer boundary;
	// an independent worktree beneath it does not.
	IsSubmodule(ctx context.Context, worktree, root string) (bool, error)
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

// HoldContent names a worktree's content as a patch would: the files of
// revision as the worktree has them, and its untracked files that are not
// ignored, whatever its index flags hide.
type HoldContent interface {
	Identity(ctx context.Context, dir, revision string) (string, error)
}

// HoldRuns lists every run's record, to find the runs that worked in a
// worktree, and reads back the changes a continued session's latest run
// recorded.
type HoldRuns interface {
	// ListStrict refuses an incomplete listing when any record cannot be read.
	ListStrict(ctx context.Context) ([]run.Record, error)
	// Artifact reads back the bytes of an artifact the run stored, as its
	// record names it.
	Artifact(ctx context.Context, runID string, artifact run.Artifact) ([]byte, error)
}

// HoldReaper finishes a run its owner left unfinished.
type HoldReaper interface {
	// ReapRun ends what run id left and finishes it as lost, as a reap
	// does, unless a process owns the run: then owned is true, and nothing
	// of the run is touched. It returns the run's record as finished: by
	// this reap or, meanwhile, by another or by the run's owner.
	ReapRun(ctx context.Context, id string) (finished run.Record, owned bool, err error)
}

// HoldProcesses ends a process another run recorded.
type HoldProcesses interface {
	// Reap ends the process the reference names, unless it may be another
	// one by now: then it is HoldReapLeft.
	Reap(ctx context.Context, ref string) (HoldReaping, error)
}

// HoldReaping is what a hold found of a process another run recorded.
type HoldReaping string

const (
	HoldReapKilled HoldReaping = "killed" // the process was killed
	HoldReapGone   HoldReaping = "gone"   // no such process
	HoldReapLeft   HoldReaping = "left"   // not killed: it may be another process by now
)

// HoldAdapters are what a Holder runs on.
type HoldAdapters struct {
	Locks     HoldLocks
	Worktrees HoldWorktrees
	Content   HoldContent
	Runs      HoldRuns
	// Reaper finishes the unfinished runs nobody owns.
	Reaper  HoldReaper
	Writers HoldProcesses
}

// NewHolder returns the component that holds the caller's worktree for
// calls. Every collaborator is required.
func NewHolder(adapters HoldAdapters) *Holder {
	return &Holder{
		locks: adapters.Locks, worktrees: adapters.Worktrees, content: adapters.Content, runs: adapters.Runs, reaper: adapters.Reaper, processes: adapters.Writers,
	}
}

// HoldCall is one call asking for the worktree at Dir, and what it
// records to.
type HoldCall struct {
	Record *run.Record
	Event  func(source, kind string, data map[string]any)
	Update func(run.Record) error

	Dir                string
	RepositoryIdentity string // empty when the process pins no revision
	// Revision is the revision HEAD must be (ADR-025 rule 2); empty when
	// the process pins none.
	Revision string
	// Verify is where the call verifies (run.InPlace.Verify).
	Verify string
	// Writer holds the worktree alone; a reader shares it with other
	// readers (ADR-025 rule 4).
	Writer bool
	// Clean admits a fresh call only to a worktree whose content is HEAD's
	// (ADR-025 rule 3).
	Clean bool
	// Latest is the session's latest run, as recorded, when the call
	// continues a session (ADR-025 rule 7): the worktree must be as it left
	// it. Nil for a fresh call.
	Latest *run.Record
}

// Held is the worktree as a call holds it.
type Held struct {
	// Release lets the worktree's hold go. The call keeps it until its
	// changes are captured.
	Release func() error
	// Head is the commit the worktree's HEAD names now.
	Head func(ctx context.Context) (string, error)
}

// Hold holds the worktree at call.Dir for the call, or refuses it, before
// any turn: the call must take its hold (ADR-025 rule 4), no directory Agister
// made and still removes may overlap the worktree, no writer's run that
// worked in a directory overlapping it may still write there, one a dead
// owner left unfinished being reaped first, HEAD must be
// the revision the process pins (rule 2), the content HEAD's when the
// process needs a clean worktree (rule 3), or, continuing, the worktree
// exactly as the session's latest run left it (rule 7). The worktree is on
// the call's record (run.InPlace) once its hold is taken. A call refused
// holds nothing, nor does one a collaborator's panic ends.
func (h *Holder) Hold(ctx context.Context, call HoldCall) (*Held, error) {
	key, unlock, err := h.locks.Lock(call.Dir, call.Writer)
	if errors.Is(err, ErrWorktreeLocked) {
		if call.Writer {
			return nil, refuse("worktree %s is in use: another call holds it, and a writer holds it alone (ADR-025 rule 4)", call.Dir)
		}
		return nil, refuse("worktree %s is in use: a writer holds it alone (ADR-025 rule 4)", call.Dir)
	}
	if err != nil {
		return nil, fmt.Errorf("holding worktree %s: %w", call.Dir, err)
	}
	// The hold is the call's only once Hold hands it over: on any other
	// way out, a panic included, it is let go here.
	handed := false
	defer func() {
		if handed {
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
	writer := call.Writer
	call.Record.Workspace = call.Dir
	call.Record.InPlace = &run.InPlace{Dir: call.Dir, Worktree: key, RepositoryIdentity: call.RepositoryIdentity, Revision: call.Revision, Verify: call.Verify, Writer: &writer}
	if err := call.Update(*call.Record); err != nil {
		call.Record.InPlace, call.Record.Effects = nil, previous
		return nil, fmt.Errorf("recording the worktree failed: %w", err)
	}
	call.Event(run.SourceAgister, "WORKTREE_LOCKED", map[string]any{"dir": call.Dir, "worktree": key, "writer": writer})
	records, err := h.runs.ListStrict(ctx)
	if err != nil {
		return nil, refuse("the runs that may still write in worktree %s cannot be read: %v", call.Dir, err)
	}
	// What other runs still hold of the worktree, found once. A directory
	// Agister removes is refused before any process is ended for the
	// worktree: one that is not the caller's to hold ends nothing.
	claims, err := h.claims(ctx, call, key, records)
	if err != nil {
		return nil, err
	}
	if err := h.made(call, claims); err != nil {
		return nil, err
	}
	if err := h.writers(ctx, call, claims); err != nil {
		return nil, err
	}
	// The content the worktree must hold, continuing: what the session's
	// latest run left there, when it recorded any.
	expected := ""
	if call.Latest != nil {
		if expected, err = h.resumable(ctx, call, key); err != nil {
			return nil, err
		}
	}
	if err := h.admit(ctx, call, expected); err != nil {
		return nil, err
	}
	call.Event(run.SourceAgister, "WORKTREE_ADMITTED", map[string]any{"dir": call.Dir, "revision": call.Revision})
	handed = true
	return &Held{
		Release: unlock,
		Head: func(ctx context.Context) (string, error) {
			state, err := h.worktrees.State(ctx, call.Dir, call.Revision)
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
// overlapping is (ADR-025 rule 4, as ADR-022 rule 3 had it), for any run,
// in the caller's worktree or, made before ADR-025, in a checkout of its
// own: a directory Agister may still remove, which is the checkout of a
// run that has not finished, a clean copy or an unreleased checkout on
// record, each with the directory made to hold it, its parent, which is
// removed with it and with whatever else is there, a repository beside the
// checkout included; and every directory of a writer's run that may still
// write, which is one unfinished or one with a process not known to have
// ended. A reader's run writes nothing (ADR-025 rule 4); a run that worked
// in a checkout works in the checkout, not in the directory that holds it.
// Removals overlap by canonical path containment alone. A writer's directory
// inside the worktree overlaps only within its git boundary, including tracked
// submodules (ADR-037). An unknown boundary overlaps too. An outer writer still
// overlaps a nested worktree, since its permissions cover subfolders (ADR-025
// rule 8). records are every run's.
func (h *Holder) claims(ctx context.Context, call HoldCall, key string, records []run.Record) ([]claim, error) {
	var claims []claim
	// Workspace and InPlace may name the same directory, across many runs.
	// Resolve each boundary once for this hold's view of the records.
	inside := map[string]bool{}
	submodules := map[string]bool{}
	writerInside := func(dir string) bool {
		if overlaps, known := inside[dir]; known {
			return overlaps
		}
		root, err := h.worktrees.Root(ctx, dir)
		overlaps := true
		if err == nil && root != "" && root != key && lies(key, root) == "contains" {
			var known bool
			overlaps, known = submodules[root]
			if !known {
				tracked, err := h.worktrees.IsSubmodule(ctx, key, root)
				overlaps = err != nil || tracked
				submodules[root] = overlaps
			}
		}
		inside[dir] = overlaps
		return overlaps
	}
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
		// A record without the worktree on it was made before ADR-025, by a
		// call that may have written where it worked.
		writer := other.InPlace == nil || other.InPlace.HeldAlone()
		if writer && (other.FinishedAt == nil || len(unended(other)) > 0) {
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
			canonical, err := h.locks.Key(dir.dir)
			if err != nil {
				return nil, refuse("worktree %s cannot be told apart from %s, which run %s recorded: %v", call.Dir, dir.dir, other.ID, err)
			}
			if how := lies(key, canonical); how != "" {
				if how == "contains" && dir.removed == "" && !writerInside(canonical) {
					continue
				}
				claims = append(claims, claim{run: other, dir: dir.dir, lies: how, removed: dir.removed})
			}
		}
	}
	return claims, nil
}

// lies says how the worktree lies to a directory, both by their canonical
// paths: it "is" it, "is inside" it or "contains" it. It is empty when
// neither holds the other, and for a directory that is not there, whose
// path is empty. This is removal's whole overlap rule; a contained writer
// also needs the git boundary check in claims (ADR-037).
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
// directory, a repository nested in it included: a call handed one would lose
// its work with it, and nothing of Agister's removes the caller's worktree
// or anything in it (ADR-025 rules 4 and 6).
func (h *Holder) made(call HoldCall, claims []claim) error {
	for _, held := range claims {
		if held.removed == "" {
			continue
		}
		reason := held.lies + " " + held.removed
		if held.lies != "is" {
			reason += " (" + held.dir + ")"
		}
		call.Event(run.SourceAgister, "WORKTREE_NOT_ADMITTED", map[string]any{"reason": reason, "run": held.run.ID})
		return refuse("worktree %s %s: Agister made that directory and removes it with all that is in it, so the worktree is not the caller's to lend (ADR-025 rule 4)", call.Dir, reason)
	}
	return nil
}

// writers refuses while a writer's run that worked in a directory
// overlapping the worktree may still write there (ADR-025 rule 4): one
// unfinished, or one with a process that is not known to have ended, unless
// that process can be ended now, through the reap's seam. An unfinished run
// may still write while its owner holds it. One nobody owns was left by a
// killed owner: it is reaped here, by the reap's own step, which finishes
// it as lost, and the call then asks about its processes as about any
// finished run's. The reap beside the calls would finish it too, but
// nobody waits for that one, and a call refused meanwhile ends before it
// does. The run may have worked in the caller's worktree or, before
// ADR-025, in a checkout of its own.
func (h *Holder) writers(ctx context.Context, call HoldCall, claims []claim) error {
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
			reaped, kept := h.reap(ctx, call, other.ID)
			if reaped == nil {
				return refuse("run %s worked in %s and has not finished: it may still write there%s", other.ID, where, kept)
			}
			other = reaped
		}
		for _, process := range unended(other) {
			reaping, err := h.processes.Reap(ctx, process.process.Ref)
			data := map[string]any{"run": other.ID, "process": process.name, "ref": process.process.Ref, "outcome": string(reaping)}
			if err != nil {
				data["error"] = err.Error()
			}
			call.Event(run.SourceAgister, "WORKTREE_WRITER_REAPED", data)
			if err != nil || reaping == HoldReapLeft {
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

// reap has the unfinished run id reaped, and returns its record as
// finished: by this reap, as lost, or meanwhile by another or by its owner.
// A run still unfinished returns none, and what kept it so beyond today's
// reason: nothing for one its owner holds, the failure for one that could
// not be reaped. The call's events say which it was, and how the run
// ended.
func (h *Holder) reap(ctx context.Context, call HoldCall, id string) (finished *run.Record, kept string) {
	reaped, owned, err := h.reaper.ReapRun(ctx, id)
	if err == nil && !owned && reaped.FinishedAt == nil {
		err = errors.New("its record is still unfinished")
	}
	data := map[string]any{"run": id}
	switch {
	case err != nil:
		data["outcome"], data["error"] = "unfinished", err.Error()
		kept = ": it could not be reaped: " + err.Error()
	case owned:
		data["outcome"] = "owned"
	default:
		finished = &reaped
		data["outcome"], data["processes_ended"] = "finished", reaped.ProcessesKnownEnded()
		if result := reaped.Result; result != nil {
			data["status"] = string(result.Status)
			if result.Error != nil {
				data["class"] = string(result.Error.Class)
			}
		}
	}
	call.Event(run.SourceAgister, "WORKTREE_RUN_REAPED", data)
	return finished, kept
}

// resumable refuses a continuation unless the session's latest run worked
// in this worktree, and, when it pinned a revision, of the same repository
// and revision, with its changes captured and still matching their record
// (ADR-025 rule 7), each reason on its own. A latest run that worked in a
// checkout of its own, made before ADR-025, is refused. It returns the
// content that run left there; empty for one that pinned no revision,
// which recorded none.
func (h *Holder) resumable(ctx context.Context, call HoldCall, key string) (string, error) {
	latest := call.Latest
	refused := func(format string, args ...any) error {
		reason := fmt.Sprintf(format, args...)
		call.Event(run.SourceAgister, "WORKTREE_NOT_ADMITTED", map[string]any{"reason": reason, "run": latest.ID})
		return refuse("%s; a continuation resumes where the session's latest run left the worktree (ADR-025 rule 7)", reason)
	}
	if err := workedInACheckout(*latest); err != nil {
		call.Event(run.SourceAgister, "WORKTREE_NOT_ADMITTED", map[string]any{"reason": err.Error(), "run": latest.ID})
		return "", err
	}
	worked := latest.InPlace
	if worked == nil {
		// Made before ADR-025 by a call without a checkout, which worked in
		// the repository itself.
		dir, err := h.locks.Key(latest.Workspace)
		if err != nil {
			return "", refused("worktree %s cannot be told apart from %s, where run %s, the latest run of the session, worked: %v", call.Dir, latest.Workspace, latest.ID, err)
		}
		worked = &run.InPlace{Dir: latest.Workspace, Worktree: dir}
	}
	switch {
	case worked.Worktree != key:
		return "", refused("run %s, the latest run of the session, worked in worktree %s, not %s", latest.ID, or(worked.Worktree, "none"), key)
	case worked.Revision == "":
		// It pinned no revision, so it recorded no content.
		return "", nil
	case worked.RepositoryIdentity != call.RepositoryIdentity:
		return "", refused("run %s, the latest run of the session, worked in repository %s, not %s", latest.ID, worked.RepositoryIdentity, or(call.RepositoryIdentity, "none"))
	case worked.Revision != call.Revision:
		return "", refused("run %s, the latest run of the session, worked on revision %s, not %s", latest.ID, worked.Revision, or(call.Revision, "none"))
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
		data, err := h.runs.Artifact(ctx, latest.ID, *patch)
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

// admit refuses a worktree whose HEAD is not the revision the process pins
// (ADR-025 rule 2); continuing, one that does not hold the content the
// session's latest run left there, when it recorded any (rule 7); and
// otherwise, for a process that needs a clean worktree, one whose content
// is not HEAD's (rule 3), each reason on its own. A fresh call that pins no
// revision and needs no clean worktree reads nothing.
func (h *Holder) admit(ctx context.Context, call HoldCall, expected string) error {
	fresh := call.Latest == nil
	if call.Revision == "" && (!fresh || !call.Clean) {
		return nil
	}
	// A clean worktree without a pinned revision is HEAD's.
	revision := or(call.Revision, "HEAD")
	state, err := h.worktrees.State(ctx, call.Dir, revision)
	if err != nil {
		return fmt.Errorf("reading worktree %s: %w", call.Dir, err)
	}
	refused := func(rule, format string, args ...any) error {
		reason := fmt.Sprintf(format, args...)
		call.Event(run.SourceAgister, "WORKTREE_NOT_ADMITTED", map[string]any{"reason": reason})
		return refuse("worktree %s %s; %s", call.Dir, reason, rule)
	}
	const (
		pinned     = "a call works on the revision its process pins, and Agister does not move HEAD (ADR-025 rule 2)"
		continuing = "a continuation resumes where the session's latest run left the worktree (ADR-025 rule 7)"
		clean      = "a fresh call of a process that declares workspace.clean starts from HEAD's content exactly (ADR-025 rule 3)"
	)
	if call.Revision != "" && state.Head != call.Revision {
		rule := pinned
		if !fresh {
			rule = continuing
		}
		return refused(rule, "is at %s, not revision %s", state.Head, call.Revision)
	}
	if !fresh {
		// The session's changes are in the worktree, uncommitted: only HEAD
		// and the content they left are checked.
		if expected == "" {
			return nil
		}
		identity, err := h.content.Identity(ctx, call.Dir, call.Revision)
		if err != nil {
			return fmt.Errorf("naming worktree %s's content: %w", call.Dir, err)
		}
		if identity != expected {
			return refused(continuing, "has content %s, not %s, which run %s, the latest run of the session, left there", identity, expected, call.Latest.ID)
		}
		return nil
	}
	if !call.Clean {
		return nil
	}
	switch {
	case len(state.Staged) > 0:
		return refused(clean, "has staged changes: %s", strings.Join(state.Staged, ", "))
	case len(state.DirtySubmodules) > 0:
		return refused(clean, "has dirty submodules: %s", strings.Join(state.DirtySubmodules, ", "))
	case len(state.Untracked) > 0:
		return refused(clean, "has untracked files that are not ignored: %s", strings.Join(state.Untracked, ", "))
	}
	identity, err := h.content.Identity(ctx, call.Dir, revision)
	if err != nil {
		return fmt.Errorf("naming worktree %s's content: %w", call.Dir, err)
	}
	if identity != state.Tree {
		return refused(clean, "has content %s, not %s's %s (a tracked file changed, even one its index marks unchanged)", identity, or(call.Revision, "HEAD"), state.Tree)
	}
	return nil
}
