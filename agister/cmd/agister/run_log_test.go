package main

import (
	"reflect"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/cli"
	"github.com/igor1309/ai-labs/agister/core/call"
	"github.com/igor1309/ai-labs/agister/core/workflow"
	"github.com/igor1309/ai-labs/agister/runstore"
	"github.com/igor1309/ai-labs/gokit/clocktest"
)

// Integration test: the record adapter, log store and existing budget,
// continuation and reuse readers share the folded record contract.
// Contract test: the filesystem-backed run store.
func TestLogOnlyReadersIncludeAnUnfinishedRunsSpend(t *testing.T) {
	t.Parallel()
	folder := t.TempDir()
	store, err := runstore.New(folder)
	if err != nil {
		t.Fatal(err)
	}
	at := time.Date(2026, 10, 29, 10, 0, 0, 0, time.UTC)
	clock := clocktest.NewClock(at)
	id := "20261029T100000Z-abcdef"
	request := cli.Request{Process: "ask", Agent: "claude", Params: map[string]string{"q": "why"}}
	r, err := newRunRecord(store, clock, id, at, request, nil, nil, "/r", "/r")
	if err != nil {
		t.Fatal(err)
	}
	if err := r.begin(); err != nil {
		t.Fatal(err)
	}
	r.Started("ask", "claude")
	permissions := runstore.Permissions{Granted: []string{"read"}}
	r.Prepared(endedCall{step: "ask", process: "ask", agent: "claude", permissions: permissions})
	cost := 0.75
	r.Observed("ask", call.Report{Session: "s1", Cost: &cost})
	r.Capacity("ask", workflow.Capacity{Reason: "busy", Retry: time.Minute})
	reader, err := runstore.New(folder)
	if err != nil {
		t.Fatal(err)
	}
	during, err := reader.Record(id)
	if err != nil || during.Status != "waiting" || during.Result != nil || during.Ended != nil || len(during.Calls) != 1 {
		t.Fatalf("during %+v, %v", during, err)
	}
	if !reflect.DeepEqual(during.Request.Params, request.Params) || !reflect.DeepEqual(during.Calls[0].Permissions, permissions) || during.Calls[0].Result.Session == nil || *during.Calls[0].Result.Session != "s1" {
		t.Fatalf("during %+v", during)
	}
	ceiling := 20.0
	day, warnings := dailyBudget(reader, at, &ceiling)
	if len(warnings) != 0 || day.Spent != cost {
		t.Fatalf("unfinished spend %+v, warnings %v", day, warnings)
	}
	clock.Advance(time.Minute)
	r.Observed("ask", call.Report{Running: true})
	r.Called(endedCall{step: "ask", process: "ask", agent: "claude", permissions: permissions, result: workflow.Result{Status: workflow.Completed, Session: "s1", Cost: &cost, Timing: workflow.Timing{Started: at, Ended: clock.Now()}}})
	day, warnings = dailyBudget(reader, at, &ceiling)
	if len(warnings) != 0 || day.Spent != cost {
		t.Fatalf("ended call counted twice: %+v, %v", day, warnings)
	}
	reused, why, err := reuseOf(id, request, reader)
	if err != nil || len(why) != 0 || reused.Calls[0].Result.Status != "completed" {
		t.Fatalf("reuse %+v, %v, %v", reused, why, err)
	}
	latest, err := latestCall(reader, "000", reused.Calls[0], "s1")
	if err != nil || latest.ID != id+"/ask" || latest.Result.Session == nil || *latest.Result.Session != "s1" {
		t.Fatalf("continuation %+v, %v", latest, err)
	}
	r.Ended("ask", workflow.Ended{Status: workflow.Completed})
	result := r.end(workflow.Result{Status: workflow.Completed, Cost: &cost, Sessions: map[string]string{"ask": "s1"}, Timing: workflow.Timing{Started: at, Ended: clock.Now(), Duration: time.Minute}})
	final, err := reader.Record(id)
	if err != nil || final.Status != "completed" || final.Result == nil || final.Result.RunID != result.RunID || !reflect.DeepEqual(final.Result.Sessions, result.Sessions) || final.Result.Cost == nil || *final.Result.Cost != cost {
		t.Fatalf("final %+v, %v", final, err)
	}
}
