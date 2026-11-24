package callevents

import (
	"context"
	"errors"
	"time"
)

// lookAgain is how often a waiting iterator looks for a call to start.
const lookAgain = time.Second

// Events steps through the events of the live call for one client. It
// keeps its own place, as an iterator does; use one per client.
type Events struct {
	live    LiveCall
	clock   Clock
	size    time.Duration
	overlap time.Duration

	start   time.Time
	started bool
	// saidNoCall is true once no call was said, so it is said once.
	saidNoCall bool
	// next is the index of the next window to give.
	next int
}

// New makes an iterator whose windows are size long and overlap the window
// before by overlap.
func New(live LiveCall, clock Clock, size, overlap time.Duration) (*Events, error) {
	if size <= 0 {
		return nil, errors.New("window size must be above zero")
	}
	if overlap < 0 || overlap >= size {
		return nil, errors.New("overlap must be from zero to below the window size")
	}
	return &Events{live: live, clock: clock, size: size, overlap: overlap}, nil
}

// Next gives the next event once it is due.
func (e *Events) Next(ctx context.Context) (Event, error) {
	for !e.started {
		call, ok, err := e.live.Live()
		if err != nil {
			return Event{}, err
		}
		if ok {
			e.start, e.started = call.Start, true
			break
		}
		if !e.saidNoCall {
			e.saidNoCall = true
			return Event{Kind: NoCall}, nil
		}
		if err := e.clock.Wait(ctx, e.clock.Now().Add(lookAgain)); err != nil {
			return Event{}, err
		}
	}
	from, to := e.bounds(e.next)
	if err := e.clock.Wait(ctx, e.start.Add(to)); err != nil {
		return Event{}, err
	}
	call, _, err := e.live.Live()
	if err != nil {
		return Event{}, err
	}
	e.next++
	return Event{Kind: Chunk, Window: Window{From: from, To: to, New: partsIn(call.Parts, from, to)}}, nil
}

func (e *Events) bounds(k int) (from, to time.Duration) {
	from = time.Duration(k) * (e.size - e.overlap)
	return from, from + e.size
}

// partsIn gives the parts whose start falls in [from, to).
func partsIn(parts []Part, from, to time.Duration) []Part {
	var in []Part
	for _, p := range parts {
		if p.Start >= from && p.Start < to {
			in = append(in, p)
		}
	}
	return in
}
