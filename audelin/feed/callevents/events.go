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
	// given holds the parts already given, so none is given twice and a
	// revision of one is not sent.
	given map[partKey]bool
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
	return &Events{live: live, clock: clock, size: size, overlap: overlap, given: map[partKey]bool{}}, nil
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
			if joined, ok := e.join(call); ok {
				return joined, nil
			}
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
	context := e.repeated(call.Parts, from, to)
	return Event{Kind: Chunk, Window: Window{From: from, To: to, Context: context, New: e.give(call.Parts, to)}}, nil
}

// join gives a call under way as one window of everything said up to the
// last window end passed, and goes on from there. A call with no window
// end passed yet is not under way.
func (e *Events) join(call Call) (Event, bool) {
	elapsed := e.clock.Now().Sub(call.Start)
	if elapsed < e.size {
		return Event{}, false
	}
	k := int((elapsed - e.size) / e.step())
	_, to := e.bounds(k)
	e.next = k + 1
	return Event{Kind: Chunk, Window: Window{From: 0, To: to, New: e.give(call.Parts, to)}}, true
}

func (e *Events) step() time.Duration { return e.size - e.overlap }

func (e *Events) bounds(k int) (from, to time.Duration) {
	from = time.Duration(k) * e.step()
	return from, from + e.size
}

// partKey tells a part apart from the others of its call.
type partKey struct {
	side  string
	start time.Duration
}

// repeated gives the parts in [from, to) already given: the overlap's
// words, which a window carries as context.
func (e *Events) repeated(parts []Part, from, to time.Duration) []Part {
	var ctx []Part
	for _, p := range parts {
		if p.Start >= from && p.Start < to && e.given[partKey{p.Side, p.Start}] {
			ctx = append(ctx, p)
		}
	}
	return ctx
}

// give gives the parts starting before to that were not given yet, words
// first read after their own window included, and marks them given.
func (e *Events) give(parts []Part, to time.Duration) []Part {
	var fresh []Part
	for _, p := range parts {
		k := partKey{p.Side, p.Start}
		if p.Start < to && !e.given[k] {
			e.given[k] = true
			fresh = append(fresh, p)
		}
	}
	return fresh
}
