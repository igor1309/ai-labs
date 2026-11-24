// Package callevents steps through a live call's events for one client:
// windows of the call's text cut by the client's size and overlap, no
// call while none is live, then the call's end. It knows no file and no
// transport; the live call and the clock are its own ports.
package callevents

import (
	"context"
	"time"
)

// Kind tells an event apart.
type Kind int

const (
	// NoCall says no call is live.
	NoCall Kind = iota
	// Chunk carries the next window of the call's text.
	Chunk
	// CallEnded says the call ended; no event follows it.
	CallEnded
)

// Part is one stretch of speech: its side, its start in call time and its
// words.
type Part struct {
	// ID is unique within a call and persists across reads of the part.
	ID    string
	Side  string
	Start time.Duration
	Words string
}

// Window is a stretch of call time [From, To). Context holds the parts of
// its overlap with the window before, New the parts that follow it.
type Window struct {
	From    time.Duration
	To      time.Duration
	Context []Part
	New     []Part
}

// Event is one step of a call: a window when Kind is Chunk.
type Event struct {
	Kind   Kind
	Window Window
}

// Call is what the live call port tells of the call being recorded.
type Call struct {
	// ID tells one call from another for as long as it is followed.
	ID string
	// Start is call time zero.
	Start time.Time
	// Parts are the parts read so far, in the order the call said them.
	Parts []Part
	// Ended is true once the call has ended.
	Ended bool
}

// LiveCall answers which call is being recorded and what it said so far.
type LiveCall interface {
	// Live gives the live call, or false when none is. An error is a
	// failed read.
	Live() (Call, bool, error)
}

// Clock tells the time and waits for it.
type Clock interface {
	Now() time.Time
	// Wait returns once the clock reaches t, or with ctx's error when it
	// is done first.
	Wait(ctx context.Context, t time.Time) error
}
