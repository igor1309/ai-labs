package callevents

import (
	"context"
	"errors"
	"io"
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

	// ended is true once the call was read ended, at endAt in call time,
	// as last; lastGiven once its last part-window was looked at; over
	// once the end was given.
	ended     bool
	lastGiven bool
	endAt     time.Duration
	last      Call
	over      bool
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
	for {
		if e.over {
			return Event{}, io.EOF
		}
		if e.ended {
			return e.afterEnd(), nil
		}
		from, to := e.bounds(e.next)
		due := e.start.Add(to)
		if e.clock.Now().Before(due) {
			if err := e.clock.Wait(ctx, earlier(due, e.clock.Now().Add(lookAgain))); err != nil {
				return Event{}, err
			}
			if call, ok, err := e.live.Live(); err == nil && ok && call.Ended {
				e.end(call)
			}
			continue
		}
		call, ok, err := e.live.Live()
		e.next++
		if err != nil || !ok {
			return Event{Kind: Chunk, Window: Window{From: from, To: to}}, nil
		}
		if call.Ended {
			e.next--
			e.end(call)
			continue
		}
		return e.window(call.Parts, from, to), nil
	}
}

// end keeps the ended call and the call time its end was seen at.
func (e *Events) end(call Call) {
	e.ended, e.last, e.endAt = true, call, e.clock.Now().Sub(e.start)
}

// afterEnd gives the windows due before the end, then the last part-window
// if it has words not yet given, then the end, then nothing.
func (e *Events) afterEnd() Event {
	from, to := e.bounds(e.next)
	if to <= e.endAt {
		e.next++
		return e.window(e.last.Parts, from, to)
	}
	if !e.lastGiven {
		e.lastGiven = true
		if last := e.window(e.last.Parts, from, e.endAt); len(last.Window.New) > 0 {
			return last
		}
	}
	e.over = true
	return Event{Kind: CallEnded}
}

func (e *Events) window(parts []Part, from, to time.Duration) Event {
	context := e.repeated(parts, from, to)
	return Event{Kind: Chunk, Window: Window{From: from, To: to, Context: context, New: e.give(parts, to)}}
}

func earlier(a, b time.Time) time.Time {
	if a.Before(b) {
		return a
	}
	return b
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
