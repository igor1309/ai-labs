package main

import (
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/cli"
	"github.com/igor1309/ai-labs/agister/core/workflow"
	"github.com/igor1309/ai-labs/agister/runstore"
	"github.com/igor1309/ai-labs/gokit/clocktest"
)

func TestRecordFactsUseTheCurrentClockAndCarryOnlyTheChange(t *testing.T) {
	t.Parallel()
	store := &storeSpy{}
	clock := clocktest.NewClock(recordStart)
	r, err := newRunRecord(store, clock, recordID, recordStart, cli.Request{}, nil, nil, "/r", "/r")
	if err != nil {
		t.Fatal(err)
	}
	if err := r.begin(); err != nil {
		t.Fatal(err)
	}
	steps := []struct {
		kind runstore.Kind
		act  func()
	}{
		{runstore.InputResolved, func() { r.Resolved([]givenInput{{name: "goal"}}) }},
		{runstore.Started, func() { r.Started("a", "bash") }},
		{runstore.Prepared, func() { r.Prepared(endedCall{step: "a"}) }},
		{runstore.CallEnded, func() { r.Called(endedCall{step: "a", result: workflow.Result{Status: workflow.Completed}}) }},
		{runstore.Ended, func() { r.Ended("a", workflow.Ended{Status: workflow.Completed}) }},
		{runstore.ChildStarted, func() { r.ChildStarted("child", "nested", nil, nil) }},
		{runstore.ChildEnded, func() { r.ChildEnded("child", workflow.ChildEnd{Status: workflow.Completed}) }},
	}
	for i, step := range steps {
		clock.Advance(time.Minute)
		step.act()
		_, records, events := store.given()
		wantRecords := []int{2, 2, 2, 3, 3, 4, 5}[i]
		if len(records) != wantRecords || len(events) != i+1 {
			t.Fatalf("%s: %d snapshots, %d facts", step.kind, len(records), len(events))
		}
		e := events[i].event
		if e.Kind != step.kind || !e.At.Equal(clock.Now()) || e.Record != nil {
			t.Fatalf("fact %+v at %v", e, clock.Now())
		}
	}
	_, _, events := store.given()
	if events[0].event.InputFact == nil || events[0].event.InputFact.Name != "goal" {
		t.Fatalf("input fact %+v", events[0])
	}
	if events[3].event.CallFact == nil || events[3].event.CallFact.Step != "a" {
		t.Fatalf("call fact %+v", events[3])
	}
}
