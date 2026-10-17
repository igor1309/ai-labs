// Package admit admits a call before it starts (ADR-001, "Core"; ADR-004,
// rules 2 and 3): the worktree's HEAD is the revision its process pins,
// its content is HEAD's where its process asks a clean worktree, and the
// call holds the worktree, a writer alone and a reader shared, until it
// ends. A call not admitted is refused, not queued. An admitted call's
// worktree is told, read under its hold (ADR-004, rule 4): its HEAD when
// admitted and its content at the call's end.
package admit

import (
	"context"
	"errors"
	"fmt"
)

// Request is what a call's process declares of the worktree: the input
// whose revision HEAD must be, nil for none; whether its content must be
// HEAD's; and whether the call writes to it, declaring read-write access.
type Request struct {
	Pin    *Pin
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
// tree its files make.
type Worktree interface {
	Head(ctx context.Context) (string, error)
	Clean(ctx context.Context) (bool, error)
	Content(ctx context.Context) (string, error)
}

// Facts is what an admitted call's worktree was: the commit its HEAD was
// when the call was admitted, and its content when the call ended; each ""
// where it could not be read.
type Facts struct {
	Head    string
	Content string
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
// checks, then holds: the pin first, then the content, then the hold. A
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
		// The content is read whether or not the call was cancelled: a call
		// that ends so has left its worktree as well.
		content, err := a.worktree.Content(context.WithoutCancel(ctx))
		if err != nil {
			content = ""
		}
		told(Facts{Head: head, Content: content})
	}()
	made(ctx)
	return nil
}
