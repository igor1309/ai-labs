// Package clocktest provides the manual clock tests time their code on:
// its time moves only when the test advances it, so no outcome waits on
// the wall clock. The code under test takes the clock's Now and Timer in
// place of the wall clock's.
package clocktest

import (
	"sort"
	"sync"
	"time"
)

// Clock is a manual clock. It tells the time it is set to, and starts
// timers, func(time.Duration) (<-chan time.Time, func()), that fire only
// once the test advances it past their wait. It reports each timer as it
// is started, so a test advances only once the code has started the timer
// it means.
type Clock struct {
	mu   sync.Mutex
	cond *sync.Cond
	now  time.Time
	// pending are the timers neither fired nor stopped.
	pending []*timer
	// started lists the wait of every timer started, in order; claimed
	// counts, per wait, those Started has returned for.
	started []time.Duration
	claimed map[time.Duration]int
	// waiting, when set, is called each time Started finds no timer of
	// its wait left to return for, before it waits for one. The clock is
	// locked meanwhile: the hook does not call it.
	waiting func(wait time.Duration)
}

type timer struct {
	at    time.Time
	fired chan time.Time
}

// NewClock is a clock set to start.
func NewClock(start time.Time) *Clock {
	c := &Clock{now: start, claimed: map[time.Duration]int{}}
	c.cond = sync.NewCond(&c.mu)
	return c
}

// Now is the time the clock is set to.
func (c *Clock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.now
}

// Timer starts a wait on the clock: fired delivers once the clock has been
// advanced by wait from now, and stop releases it. A wait of zero or less
// has passed already.
func (c *Clock) Timer(wait time.Duration) (fired <-chan time.Time, stop func()) {
	c.mu.Lock()
	defer c.mu.Unlock()
	t := &timer{at: c.now.Add(wait), fired: make(chan time.Time, 1)}
	c.started = append(c.started, wait)
	c.cond.Broadcast()
	if wait <= 0 {
		t.fired <- c.now
		return t.fired, func() {}
	}
	c.pending = append(c.pending, t)
	return t.fired, func() { c.remove(t) }
}

func (c *Clock) remove(t *timer) {
	c.mu.Lock()
	defer c.mu.Unlock()
	for i, p := range c.pending {
		if p == t {
			c.pending = append(c.pending[:i], c.pending[i+1:]...)
			return
		}
	}
}

// Advance moves the clock on by d, and fires every pending timer whose
// wait has passed by then, in the order their waits end: each delivers
// the time its wait ended.
func (c *Clock) Advance(d time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.now = c.now.Add(d)
	sort.SliceStable(c.pending, func(i, j int) bool { return c.pending[i].at.Before(c.pending[j].at) })
	kept := c.pending[:0]
	for _, t := range c.pending {
		if t.at.After(c.now) {
			kept = append(kept, t)
			continue
		}
		t.fired <- t.at
	}
	c.pending = kept
}

// Started returns once the code has started a timer of wait that no
// earlier call has returned for: the n-th call for a wait returns once n
// timers of it have been started, whatever else was started between. It
// waits without polling; a timer that is never started is a hang, which
// the test binary's -timeout reports.
func (c *Clock) Started(wait time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	for c.count(wait) <= c.claimed[wait] {
		if c.waiting != nil {
			c.waiting(wait)
		}
		c.cond.Wait()
	}
	c.claimed[wait]++
}

func (c *Clock) count(wait time.Duration) int {
	n := 0
	for _, started := range c.started {
		if started == wait {
			n++
		}
	}
	return n
}

// Waits lists the wait of every timer started so far, in the order they
// were started.
func (c *Clock) Waits() []time.Duration {
	c.mu.Lock()
	defer c.mu.Unlock()
	return append([]time.Duration(nil), c.started...)
}

// Pending counts the timers started and neither fired nor stopped.
func (c *Clock) Pending() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return len(c.pending)
}
