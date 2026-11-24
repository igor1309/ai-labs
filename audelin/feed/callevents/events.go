package callevents

import (
	"cmp"
	"context"
	"errors"
	"io"
	"slices"
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
	next  int
	given map[string]struct{}
	// sent keeps the original parts for context even if the transcript rewrites them.
	sent []Part

	// ended is true once the call was read ended, at endAt in call time.
	// remaining holds the ended snapshot's unsent parts. over is true
	// once the end was given.
	ended     bool
	endAt     time.Duration
	remaining []Part
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
	return &Events{live: live, clock: clock, size: size, overlap: overlap, given: make(map[string]struct{})}, nil
}

// Next gives the next event once it is due.
func (e *Events) Next(ctx context.Context) (Event, error) {
	for !e.started {
		call, ok, err := e.live.Live()
		if err == nil && ok {
			e.start, e.started = call.Start, true
			if joined, ok := e.join(call); ok {
				return joined, nil
			}
			break
		}
		if err == nil && !e.saidNoCall {
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

// end takes the unsent parts once. A finishing pass can split one
// segment into speaker rows that still share the original segment ID.
func (e *Events) end(call Call) {
	e.ended, e.endAt = true, e.clock.Now().Sub(e.start)
	for _, p := range call.Parts {
		if _, given := e.given[p.ID]; !given {
			e.remaining = append(e.remaining, p)
		}
	}
}

// afterEnd gives the windows due before the end, then the last part-window
// if it has words not yet given, then the end, then nothing.
func (e *Events) afterEnd() Event {
	from, to := e.bounds(e.next)
	if to <= e.endAt {
		e.next++
		return e.drain(from, to)
	}
	if len(e.remaining) > 0 {
		// The clock dates the observation of the end. The final snapshot
		// may still contain unsent parts at or beyond that time.
		to = e.endAt
		for _, p := range e.remaining {
			to = max(to, p.Start+time.Nanosecond)
		}
		return e.drain(from, to)
	}
	e.over = true
	return Event{Kind: CallEnded}
}

func (e *Events) window(parts []Part, from, to time.Duration) Event {
	w := e.withContext(from, to)
	for _, p := range parts {
		if _, given := e.given[p.ID]; !given && p.Start < to {
			// Words first read after their own window go in this one.
			w.New = append(w.New, p)
		}
	}
	e.remember(w.New)
	return Event{Kind: Chunk, Window: w}
}

func (e *Events) drain(from, to time.Duration) Event {
	w := e.withContext(from, to)
	e.remaining = slices.DeleteFunc(e.remaining, func(p Part) bool {
		if p.Start >= to {
			return false
		}
		w.New = append(w.New, p)
		return true
	})
	e.sent = append(e.sent, w.New...)
	return Event{Kind: Chunk, Window: w}
}

func (e *Events) withContext(from, to time.Duration) Window {
	w := Window{From: from, To: to}
	for _, p := range e.sent {
		if p.Start >= from && p.Start < to {
			w.Context = append(w.Context, p)
		}
	}
	slices.SortStableFunc(w.Context, func(a, b Part) int { return cmp.Compare(a.Start, b.Start) })
	return w
}

func (e *Events) remember(parts []Part) {
	for _, p := range parts {
		e.given[p.ID] = struct{}{}
	}
	e.sent = append(e.sent, parts...)
}

func earlier(a, b time.Time) time.Time {
	if a.Before(b) {
		return a
	}
	return b
}

// join gives everything already saved, then resumes the regular cadence.
func (e *Events) join(call Call) (Event, bool) {
	elapsed := max(0, e.clock.Now().Sub(call.Start))
	if elapsed < e.size && len(call.Parts) == 0 {
		return Event{}, false
	}
	if elapsed >= e.size {
		e.next = 1 + int((elapsed-e.size)/e.step())
	}
	w := Window{To: elapsed, New: slices.Clone(call.Parts)}
	e.remember(w.New)
	return Event{Kind: Chunk, Window: w}, true
}

func (e *Events) step() time.Duration { return e.size - e.overlap }

func (e *Events) bounds(k int) (from, to time.Duration) {
	from = time.Duration(k) * e.step()
	return from, from + e.size
}
