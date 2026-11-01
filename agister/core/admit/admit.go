// Package admit admits a call before it starts (ADR-001, "Core"; ADR-004,
// rules 2, 3 and 5): the worktree's HEAD is the revision its process pins,
// a call continuing a session finds the worktree as the session's latest
// call left it, its content is HEAD's where its process asks a clean
// worktree, and the call holds the worktree, a writer alone and a reader
// shared, until it ends. A call not admitted is refused, not queued. An
// admitted call's worktree is told, read under its hold (ADR-004, rule 4):
// its HEAD when admitted and at its end, its content and pinned changes.
package admit

import (
	"context"
	"errors"
	"fmt"
)

// Request is what a call's process declares of the worktree: the input
// whose revision HEAD must be, nil for none; for a call continuing a
// session, the worktree the session's latest call left, as admit told it,
// nil for none; whether its content must be HEAD's; and whether the call
// writes to it, declaring read-write access.
type Request struct {
	Pin    *Pin
	Left   *Facts
	Clean  bool
	Writer bool
}

// Pin is the input a call pins its revision to: its name, its source's,
// and the commit it gives, "" where its source gives no commit.
type Pin struct {
	Input  string
	Source string
	Commit string
}

// Worktree tells the facts of the call's worktree: the commit its HEAD
// is, whether its content is HEAD's, and its content, as the id of the
// tree its files make; and the patch from a pinned commit to that content.
type Worktree interface {
	Head(ctx context.Context) (string, error)
	Clean(ctx context.Context) (bool, error)
	Content(ctx context.Context) (string, error)
	Changes(ctx context.Context, commit, content string) (string, error)
}

// Facts is what an admitted call's worktree was: the commit its HEAD was
// when admitted and at its end, and its final content, each empty where
// unreadable. Patch is nil for none; PatchError says why a pinned patch
// could not be given.
type Facts struct {
	Head       string
	EndHead    string
	Content    string
	Patch      *string
	PatchError string
}

// ErrHeld is what a hold's error wraps when another call holds the
// worktree so that this one cannot take its hold.
var ErrHeld = errors.New("the worktree is held by another call")

// Hold takes the hold of the call's worktree, alone or shared, without
// waiting, and gives its release; its error wraps ErrHeld where another
// call's hold excludes it.
type Hold interface {
	Take(alone bool) (release func(), err error)
}

// Admitter admits calls against one worktree.
type Admitter struct {
	worktree Worktree
	hold     Hold
}

// New gives an admitter whose worktree's facts are worktree's and whose
// hold is hold's.
func New(worktree Worktree, hold Hold) (*Admitter, error) {
	switch {
	case worktree == nil:
		return nil, errors.New("admit: no worktree")
	case hold == nil:
		return nil, errors.New("admit: no hold")
	}
	return &Admitter{worktree: worktree, hold: hold}, nil
}

// Make admits the call request declares and, admitted, makes it through
// made, holding the worktree until made returns, however it ends. It
// checks, then holds: the pin first, then the worktree a session's latest
// call left, then the content, then the hold. A
// call not admitted is its error, which says why: no hold is taken, made
// is not called and told is not told. An admitted call's facts are told
// once made returns, however it ends, before the hold is released: a fact
// that cannot be read is told "", and the call goes on as before.
func (a *Admitter) Make(ctx context.Context, request Request, made func(ctx context.Context), told func(Facts)) error {
	if pin := request.Pin; pin != nil {
		if pin.Commit == "" {
			return fmt.Errorf("a pin from the input %q, of the source %q, is not run yet", pin.Input, pin.Source)
		}
		head, err := a.worktree.Head(ctx)
		if err != nil {
			return fmt.Errorf("the worktree's HEAD: %w", err)
		}
		if head != pin.Commit {
			return fmt.Errorf("HEAD is %q, not the pinned %q", head, pin.Commit)
		}
	}
	if left := request.Left; left != nil {
		if err := a.asLeft(ctx, *left); err != nil {
			return err
		}
	}
	if request.Clean {
		clean, err := a.worktree.Clean(ctx)
		if err != nil {
			return fmt.Errorf("whether the worktree is clean: %w", err)
		}
		if !clean {
			return errors.New("the worktree is not clean")
		}
	}
	release, err := a.hold.Take(request.Writer)
	if errors.Is(err, ErrHeld) {
		return ErrHeld
	}
	if err != nil {
		return fmt.Errorf("the worktree's hold: %w", err)
	}
	defer release()
	head, err := a.worktree.Head(ctx)
	if err != nil {
		head = ""
	}
	defer func() {
		// A cancelled call has left its worktree too; final facts are read
		// independently of the call's cancellation, under its hold.
		final := context.WithoutCancel(ctx)
		facts := Facts{Head: head}
		facts.EndHead, err = a.worktree.Head(final)
		if err != nil {
			facts.EndHead = ""
		}
		facts.Content, err = a.worktree.Content(final)
		if err != nil {
			facts.Content = ""
		}
		if pin := request.Pin; pin != nil {
			if facts.Content == "" {
				facts.PatchError = "the worktree's content could not be read"
				if err != nil {
					facts.PatchError += ": " + err.Error()
				}
			} else {
				patch, changesErr := a.worktree.Changes(final, pin.Commit, facts.Content)
				if changesErr != nil {
					facts.PatchError = changesErr.Error()
				} else {
					facts.Patch = &patch
				}
			}
		}
		told(facts)
	}()
	made(ctx)
	return nil
}

// asLeft is why the worktree is not as left, the facts a session's latest
// call was told: its HEAD not the one that call left, or its
// content not the one that call left; nil where it is. A fact left empty
// was not read, and the worktree is not known to be as left.
func (a *Admitter) asLeft(ctx context.Context, left Facts) error {
	if left.EndHead != "" {
		head, err := a.worktree.Head(ctx)
		if err != nil {
			return fmt.Errorf("the worktree's HEAD: %w", err)
		}
		if head != left.EndHead {
			return fmt.Errorf("HEAD is %q, not the session's latest call's %q", head, left.EndHead)
		}
	}
	notAsLeft := errors.New("the worktree is not as the session's latest call left it")
	if left.EndHead == "" || left.Content == "" {
		return notAsLeft
	}
	content, err := a.worktree.Content(ctx)
	if err != nil {
		return fmt.Errorf("the worktree's content: %w", err)
	}
	if content != left.Content {
		return notAsLeft
	}
	return nil
}
