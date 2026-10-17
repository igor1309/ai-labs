package main

import (
	"errors"

	"github.com/igor1309/ai-labs/agister/core/call"
	"github.com/igor1309/ai-labs/agister/core/watch"
)

// turnWatcher is what a call's staleness asks of core/watch.
type turnWatcher interface {
	Watch(limits watch.Limits, stale func(watch.Stale)) (report func(watch.Report), stop func())
}

// staleness answers core/call's staleness from core/watch (ADR-001,
// "Core"): a turn's limits and each line it reports in watch's words, and
// what went stale in call's.
type staleness struct {
	watcher turnWatcher
}

func newStaleness(watcher turnWatcher) (*staleness, error) {
	if watcher == nil {
		return nil, errors.New("staleness: no watcher")
	}
	return &staleness{watcher: watcher}, nil
}

func (s *staleness) Watch(limits call.Limits, stale func(call.Stale)) (func(call.Report), func()) {
	report, stop := s.watcher.Watch(watch.Limits{RepeatedToolCalls: limits.RepeatedToolCalls, ToolCommand: limits.ToolCommand, NoEvent: limits.NoEvent},
		func(went watch.Stale) { stale(call.Stale{Limit: callLimit(went.Limit), What: went.What}) })
	return func(r call.Report) {
		var tool *watch.Tool
		if t := r.Tool; t != nil {
			tool = &watch.Tool{Name: t.Name, Input: t.Input}
		}
		report(watch.Report{Tool: tool})
	}, stop
}

// callLimit is the limit reached in core/call's words.
func callLimit(limit watch.Limit) call.Limit {
	switch limit {
	case watch.RepeatedToolCalls:
		return call.RepeatedToolCalls
	case watch.ToolCommand:
		return call.ToolCommand
	case watch.NoEvent:
		return call.NoEvent
	}
	return 0
}
