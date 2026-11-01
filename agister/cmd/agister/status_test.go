package main

import (
	"errors"
	"reflect"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/cli"
	"github.com/igor1309/ai-labs/agister/runstore"
)

type statusStoreSpy struct {
	ids       []string
	snapshots map[string]runstore.Snapshot
	err       error
}

func (s statusStoreSpy) Runs() ([]string, error)                       { return s.ids, s.err }
func (s statusStoreSpy) Snapshot(id string) (runstore.Snapshot, error) { return s.snapshots[id], s.err }

func TestRunStatesMapsDurableAndLiveStateAndOrdersByStart(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 10, 29, 12, 0, 0, 0, time.UTC)
	old := now.Add(-time.Hour)
	until := now.Add(time.Minute)
	class, reason := "runtime", "denied"
	store := statusStoreSpy{ids: []string{"z-old", "a-new"}, snapshots: map[string]runstore.Snapshot{
		"z-old": {Record: runstore.Record{ID: "z-old", Started: old, Ended: &now, Status: "failed", Result: &runstore.Result{Outcome: runstore.Outcome{Class: &class, Reason: &reason}}}},
		"a-new": {Record: runstore.Record{ID: "a-new", Started: now, Status: "waiting"}, Active: []runstore.ActiveCall{{Step: "review", Since: old, Waiting: &runstore.Waiting{On: "capacity", Since: now, Until: &until}}}, Heartbeat: &runstore.Heartbeat{PID: 42, ProcessStart: "start", Beat: now}},
	}}
	probes := []int{}
	states, err := newRunStates(store, func() time.Time { return now }, func(pid int) (string, bool, error) { probes = append(probes, pid); return "start", true, nil }, 10*time.Second)
	if err != nil {
		t.Fatal(err)
	}
	got, err := states.States("", false)
	want := []cli.RunState{
		{ID: "a-new", Status: "waiting", Since: now, Active: []cli.RunActivity{{Step: "review", Since: now, WaitingOn: "capacity", Until: &until}}},
		{ID: "z-old", Status: "failed", Since: old, Active: []cli.RunActivity{}, Class: class, Reason: reason},
	}
	if err != nil || !reflect.DeepEqual(got, want) || !reflect.DeepEqual(probes, []int{42}) {
		t.Fatalf("states %+v, %v, probes %v", got, err, probes)
	}
	got, err = states.States("", true)
	if err != nil || !reflect.DeepEqual(got, want[:1]) {
		t.Fatalf("last %+v, %v", got, err)
	}
	got, err = states.States("z-old", false)
	if err != nil || !reflect.DeepEqual(got, want[1:]) {
		t.Fatalf("named %+v, %v", got, err)
	}
}

func TestRunStatesPropagatesErrorsAndEmptyLast(t *testing.T) {
	t.Parallel()
	failure := errors.New("read denied")
	for _, c := range []struct {
		name  string
		store statusStoreSpy
		id    string
		last  bool
		want  error
	}{
		{name: "list error", store: statusStoreSpy{err: failure}, want: failure},
		{name: "snapshot error", store: statusStoreSpy{err: failure}, id: "x", want: failure},
		{name: "empty list", store: statusStoreSpy{}},
		{name: "empty last", store: statusStoreSpy{}, last: true},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			s, err := newRunStates(c.store, func() time.Time { return time.Time{} }, func(int) (string, bool, error) { t.Fatal("unexpected probe"); return "", false, nil }, time.Second)
			if err != nil {
				t.Fatal(err)
			}
			got, err := s.States(c.id, c.last)
			if c.last {
				if err == nil || err.Error() != "no runs kept" {
					t.Fatalf("last error %v", err)
				}
				return
			}
			if !errors.Is(err, c.want) || c.want == nil && len(got) != 0 {
				t.Fatalf("states %+v, %v", got, err)
			}
		})
	}
}

func TestRunStatesRequiresCollaborators(t *testing.T) {
	t.Parallel()
	now := func() time.Time { return time.Time{} }
	probe := func(int) (string, bool, error) { return "", false, nil }
	for _, c := range []struct {
		store statusStore
		now   func() time.Time
		probe func(int) (string, bool, error)
		wait  time.Duration
	}{
		{nil, now, probe, time.Second}, {statusStoreSpy{}, nil, probe, time.Second}, {statusStoreSpy{}, now, nil, time.Second}, {statusStoreSpy{}, now, probe, 0},
	} {
		if _, err := newRunStates(c.store, c.now, c.probe, c.wait); err == nil {
			t.Fatal("missing collaborator accepted")
		}
	}
}
