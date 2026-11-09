package main

import (
	"errors"
	"fmt"
	"io/fs"
	"reflect"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/pages"
	"github.com/igor1309/ai-labs/agister/runstore"
)

// pagesStoreSpy gives a snapshot or an error per run id.
type pagesStoreSpy struct {
	snapshots map[string]runstore.Snapshot
	errs      map[string]error
}

func (s pagesStoreSpy) Runs() ([]string, error) {
	var ids []string
	for id := range s.snapshots {
		ids = append(ids, id)
	}
	return ids, nil
}
func (s pagesStoreSpy) Snapshot(id string) (runstore.Snapshot, error) {
	if err := s.errs[id]; err != nil {
		return runstore.Snapshot{}, err
	}
	return s.snapshots[id], nil
}

func newPagesRunsOver(t *testing.T, store pagesStoreSpy, now time.Time, alive bool) *pagesRuns {
	t.Helper()
	probe := func(int) (string, bool, error) { return "start", alive, nil }
	runs, err := newPagesRuns(store, func() time.Time { return now }, probe)
	if err != nil {
		t.Fatal(err)
	}
	return runs
}

// Scenario: A snapshot is mapped to pages' run.
func TestPagesRunMapsTheSnapshot(t *testing.T) {
	t.Parallel()
	started := time.Date(2026, 11, 1, 9, 0, 0, 0, time.UTC)
	ended := started.Add(90 * time.Second)
	usd, class := 1.5, "runtime_error"
	record := runstore.Record{ID: "R1", Started: started, Ended: &ended, Status: "completed",
		Request: runstore.Request{Workflow: "code_review", Params: map[string]string{"base": "trunk"}, Dir: "/work"},
		Calls: []runstore.Call{{Step: "implement", Process: "implement", Agent: "codex-sol-61",
			Result: runstore.CallResult{Outcome: runstore.Outcome{Status: "completed", Timing: runstore.Timing{DurationMS: 60000}, Cost: &usd}}}},
		Children: []runstore.Child{{ID: "R1-c", Workflow: "tests_debate", Status: "failed", Class: &class}},
		Result:   &runstore.Result{Outcome: runstore.Outcome{Status: "completed", Timing: runstore.Timing{DurationMS: 90000}, Cost: &usd, Output: map[string]any{"verdict": "pass"}}}}
	runs := newPagesRunsOver(t, pagesStoreSpy{snapshots: map[string]runstore.Snapshot{"R1": {Record: record}}}, ended, true)
	got, err := runs.Run("R1")
	if err != nil {
		t.Fatal(err)
	}
	ms := int64(90000)
	want := pages.Run{ID: "R1", Workflow: "code_review", Started: started, Ended: &ended, Status: "completed", DurationMS: &ms, Cost: &usd,
		Params: map[string]string{"base": "trunk"}, Dir: "/work", Output: map[string]any{"verdict": "pass"},
		Calls:    []pages.Call{{Step: "implement", Process: "implement", Agent: "codex-sol-61", Status: "completed", DurationMS: 60000, Cost: &usd}},
		Children: []pages.Child{{ID: "R1-c", Workflow: "tests_debate", Status: "failed", Class: "runtime_error"}}}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %+v\nwant %+v", got, want)
	}
}

// Scenario: A run's state is the state agister status gives: unstarted,
// ended, a dead owner, and a live one on either side of the stall threshold.
func TestPagesRunStateIsStatusState(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 11, 1, 9, 0, 0, 0, time.UTC)
	pending := func(age time.Duration) *time.Time { at := now.Add(-age); return &at }
	beat := func(age time.Duration) *runstore.Heartbeat {
		h := &runstore.Heartbeat{PID: 42, ProcessStart: "start", Beat: now}
		if age > 0 {
			h.PendingSince, h.PendingAgeMS = pending(age), age.Milliseconds()
		}
		return h
	}
	running := runstore.Record{ID: "20261101T085900Z-aa", Started: now.Add(-time.Minute), Status: "running"}
	cases := []struct {
		name     string
		snapshot runstore.Snapshot
		err      error
		alive    bool
		want     string
	}{
		{"unstarted", runstore.Snapshot{}, runstore.ErrNotStarted, true, "unknown"},
		{"ended", runstore.Snapshot{Record: runstore.Record{ID: running.ID, Started: running.Started, Ended: &now, Status: "failed"}}, nil, true, "failed"},
		{"dead owner", runstore.Snapshot{Record: running, Heartbeat: beat(0)}, nil, false, "lost"},
		{"live, writer pending under the threshold", runstore.Snapshot{Record: running, Heartbeat: beat(stalledAfter - time.Second)}, nil, true, "running"},
		{"live, writer pending at the threshold", runstore.Snapshot{Record: running, Heartbeat: beat(stalledAfter)}, nil, true, "writer stalled"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			id := running.ID
			probe := func(int) (string, bool, error) { return "start", c.alive, nil }
			clock := func() time.Time { return now }
			store := pagesStoreSpy{snapshots: map[string]runstore.Snapshot{id: c.snapshot}, errs: map[string]error{id: c.err}}
			runs, err := newPagesRuns(store, clock, probe)
			if err != nil {
				t.Fatal(err)
			}
			got, err := runs.Run(id)
			if err != nil {
				t.Fatal(err)
			}
			states, err := newRunStates(store, clock, probe, stalledAfter)
			if err != nil {
				t.Fatal(err)
			}
			status, err := states.States(id, false)
			if err != nil {
				t.Fatal(err)
			}
			if got.Status != c.want || status[0].Status != c.want {
				t.Fatalf("pages %q, status %q, want both %q", got.Status, status[0].Status, c.want)
			}
		})
	}
}

// Scenario: A run the store cannot read is an error of that run.
func TestPagesRunGivesTheStoreError(t *testing.T) {
	t.Parallel()
	bad := errors.New("runstore: log id disagrees with folder")
	_, err := newPagesRunsOver(t, pagesStoreSpy{errs: map[string]error{"R1": bad}}, time.Date(2026, 11, 1, 9, 0, 0, 0, time.UTC), true).Run("R1")
	if !errors.Is(err, bad) {
		t.Fatalf("got %v, want %v", err, bad)
	}
}

// Scenario: A run the store does not keep is not found.
func TestPagesRunNotKeptIsNotFound(t *testing.T) {
	t.Parallel()
	missing := fmt.Errorf("runstore: the record of %q: %w", "R9", fs.ErrNotExist)
	_, err := newPagesRunsOver(t, pagesStoreSpy{errs: map[string]error{"R9": missing}}, time.Date(2026, 11, 1, 9, 0, 0, 0, time.UTC), true).Run("R9")
	if !errors.Is(err, pages.ErrNotFound) {
		t.Fatalf("got %v, want ErrNotFound", err)
	}
}
