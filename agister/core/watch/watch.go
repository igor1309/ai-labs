// Package watch observes a turn for staleness (ADR-001, "Core"; ADR-006,
// rule 1), best effort, over what its wrapper reports: the same tool call
// made a number of times in a row, no result following a tool call for too
// long, or nothing at all for too long. It reports the limit reached and
// what went stale; it ends nothing itself.
package watch

import (
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"
)

// Limits are a turn's staleness limits, each not watched where zero: the
// tool calls in a row that make it stale; how long a tool call may wait for
// a result, its command running; and how long nothing at all may come.
type Limits struct {
	RepeatedToolCalls int
	ToolCommand       time.Duration
	NoEvent           time.Duration
}

// Report is a line a turn read: the tool call it made, where Tool is not
// nil; a tool's result, where Result is set; else another line.
type Report struct {
	Tool   *Tool
	Result bool
}

// Tool is a tool call: the tool's name and all it was given.
type Tool struct {
	Name, Input string
}

// Limit is which of a turn's limits was reached.
type Limit int

const (
	RepeatedToolCalls Limit = iota + 1
	ToolCommand
	NoEvent
)

// Stale is what went stale of a turn: the limit reached, and what it
// says of the turn.
type Stale struct {
	Limit Limit
	What  string
}

// Timer starts a wait: fired delivers once it has passed, and stop
// releases it.
type Timer func(wait time.Duration) (fired <-chan time.Time, stop func())

// Watcher watches turns, their waits kept on its timer.
type Watcher struct {
	timer Timer
}

// New gives a watcher whose waits are kept on timer.
func New(timer Timer) (*Watcher, error) {
	if timer == nil {
		return nil, errors.New("watch: no timer")
	}
	return &Watcher{timer: timer}, nil
}

// Watch starts watching a turn against limits, as the turn starts: report
// is given each line the turn reads, as it reads it, and returns once the
// watch has taken it; stale is told, once, the first limit reached, after
// which nothing more is watched. Stop ends the watch and returns once
// stale will be told nothing more; a limit that passed before it is still
// told. A report after stop is dropped.
func (w *Watcher) Watch(limits Limits, stale func(Stale)) (report func(Report), stop func()) {
	t := &turn{
		limits:  limits,
		timer:   w.timer,
		told:    stale,
		reports: make(chan Report),
		taken:   make(chan struct{}),
		stop:    make(chan struct{}),
		done:    make(chan struct{}),
	}
	go t.watch()
	var once sync.Once
	return t.report, func() {
		once.Do(func() { close(t.stop) })
		<-t.done
	}
}

// turn is one turn watched. Its reports, its waits and its stop are taken
// by one goroutine, one at a time, so nothing of it needs a lock: quiet is
// the wait for the next line, and command the wait for a result of the
// tool call running; last is the latest tool call, made repeated times in
// a row.
type turn struct {
	limits  Limits
	timer   Timer
	told    func(Stale)
	reports chan Report
	taken   chan struct{}
	stop    chan struct{}
	done    chan struct{}

	quiet, command wait
	running        string
	last           Tool
	repeated       int
}

func (t *turn) report(r Report) {
	select {
	case t.reports <- r:
	case <-t.done:
		return
	}
	select {
	case <-t.taken:
	case <-t.done:
	}
}

// wait is a wait started: fired is nil where none was started.
type wait struct {
	fired <-chan time.Time
	stop  func()
}

// none is no wait.
var none = wait{stop: func() {}}

func (t *turn) start(limit time.Duration) wait {
	if limit <= 0 {
		return none
	}
	fired, stop := t.timer(limit)
	return wait{fired: fired, stop: stop}
}

// watch takes the turn's reports until a limit is reached or the watch is
// stopped. A wait that has passed is taken before a report or the stop
// that came with it: the time passed first.
func (t *turn) watch() {
	defer close(t.done)
	t.quiet, t.command = t.start(t.limits.NoEvent), none
	defer func() { t.quiet.stop(); t.command.stop() }()
	for {
		var stale *Stale
		select {
		case <-t.quiet.fired:
			stale = t.quietFor()
		case <-t.command.fired:
			stale = t.commandRan()
		case <-t.stop:
			if stale = t.passed(); stale == nil {
				return
			}
		case r := <-t.reports:
			if stale = t.passed(); stale == nil {
				stale = t.took(r)
			}
			if stale == nil {
				t.taken <- struct{}{}
				continue
			}
		}
		if stale != nil {
			t.told(*stale)
			return
		}
	}
}

// passed is the limit of a wait that has passed, nil where none has.
func (t *turn) passed() *Stale {
	select {
	case <-t.quiet.fired:
		return t.quietFor()
	case <-t.command.fired:
		return t.commandRan()
	default:
		return nil
	}
}

func (t *turn) quietFor() *Stale {
	return &Stale{Limit: NoEvent, What: "no event for " + span(t.limits.NoEvent)}
}

func (t *turn) commandRan() *Stale {
	return &Stale{Limit: ToolCommand, What: fmt.Sprintf("the tool command %q ran over %s", t.running, span(t.limits.ToolCommand))}
}

// took restarts the waits for what follows r, and counts a tool call
// against the one before it: the limit it reaches, nil for none. Any line
// restarts the quiet wait; a command's wait ends only at a result or the
// next tool call, since a runtime prints other lines while a command runs.
// The first result ends it, not the command's own: a turn runs one command
// at a time in practice. Lines between two tool calls do not break their
// run; only a different call does.
func (t *turn) took(r Report) *Stale {
	t.quiet.stop()
	t.quiet = t.start(t.limits.NoEvent)
	if r.Tool == nil && !r.Result {
		return nil
	}
	t.command.stop()
	t.command = none
	if r.Tool == nil {
		return nil
	}
	if t.repeated > 0 && *r.Tool == t.last {
		t.repeated++
	} else {
		t.last, t.repeated = *r.Tool, 1
	}
	if limit := t.limits.RepeatedToolCalls; limit > 0 && t.repeated >= limit {
		return &Stale{Limit: RepeatedToolCalls, What: fmt.Sprintf("the tool call %q repeated %d times", t.last.Name, t.repeated)}
	}
	t.running = r.Tool.Name
	t.command = t.start(t.limits.ToolCommand)
	return nil
}

// span is d as a person writes a limit: "15m" for fifteen minutes, "1h"
// for an hour, the zero units left off the end.
func span(d time.Duration) string {
	s := d.String()
	if strings.HasSuffix(s, "m0s") {
		s = strings.TrimSuffix(s, "0s")
	}
	if strings.HasSuffix(s, "h0m") {
		s = strings.TrimSuffix(s, "0m")
	}
	return s
}
