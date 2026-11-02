package main

import (
	"context"
	"errors"
	"slices"
	"strings"
	"syscall"
	"time"

	"github.com/igor1309/ai-labs/agister/cli"
	"github.com/igor1309/ai-labs/agister/runstore"
)

// statusStore supplies immutable snapshots rather than exposing file formats.
type statusStore interface {
	Runs() ([]string, error)
	Snapshot(string) (runstore.Snapshot, error)
}

type runStates struct {
	store        statusStore
	now          func() time.Time
	probe        func(int) (string, bool, error)
	stalledAfter time.Duration
}

func newRunStates(store statusStore, now func() time.Time, probe func(int) (string, bool, error), stalledAfter time.Duration) (*runStates, error) {
	if store == nil || now == nil || probe == nil || stalledAfter <= 0 {
		return nil, errors.New("status: missing collaborator or threshold")
	}
	return &runStates{store: store, now: now, probe: probe, stalledAfter: stalledAfter}, nil
}

func (s runStates) States(id string, last bool) ([]cli.RunState, error) {
	ids := []string{id}
	if id == "" {
		var err error
		ids, err = s.store.Runs()
		if err != nil {
			return nil, err
		}
	}
	snapshots := make([]runstore.Snapshot, 0, len(ids))
	for _, id := range ids {
		snapshot, err := readSnapshot(s.store, id)
		if err != nil {
			return nil, err
		}
		snapshots = append(snapshots, snapshot)
	}
	slices.SortFunc(snapshots, func(a, b runstore.Snapshot) int {
		if n := b.Record.Started.Compare(a.Record.Started); n != 0 {
			return n
		}
		if a.Record.ID < b.Record.ID {
			return 1
		}
		if a.Record.ID > b.Record.ID {
			return -1
		}
		return 0
	})
	if last {
		if len(snapshots) == 0 {
			return nil, errors.New("no runs kept")
		}
		snapshots = snapshots[:1]
	}
	states := make([]cli.RunState, 0, len(snapshots))
	now := s.now()
	for _, snapshot := range snapshots {
		observed, err := runstore.Observe(snapshot, now, s.stalledAfter, s.probe)
		if err != nil {
			return nil, err
		}
		r := snapshot.Record
		state := cli.RunState{ID: r.ID, Status: observed.Status, Since: r.Started, Active: []cli.RunActivity{}}
		if observed.Since != nil {
			state.Since = *observed.Since
		}
		for _, a := range snapshot.Active {
			activity := cli.RunActivity{Step: a.Step, Since: a.Since}
			if w := a.Waiting; w != nil {
				activity.Since, activity.WaitingOn, activity.Until = w.Since, w.On, w.Until
			}
			state.Active = append(state.Active, activity)
		}
		if r.Result != nil {
			if r.Result.Class != nil {
				state.Class = *r.Result.Class
			}
			if r.Result.Reason != nil {
				state.Reason = *r.Result.Reason
			}
		}
		states = append(states, state)
	}
	return states, nil
}

// stalledAfter is how long a live run's log may wait on its writer before
// agister status and pages both call it stalled.
const stalledAfter = 10 * time.Second

// readSnapshot is the run id's snapshot as agister status and pages both
// read it: a run whose log has no committed start yet is the run its id
// names, started when its id says, with no record besides.
func readSnapshot(store statusStore, id string) (runstore.Snapshot, error) {
	snapshot, err := store.Snapshot(id)
	if errors.Is(err, runstore.ErrNotStarted) {
		stamp, _, _ := strings.Cut(id, "-")
		started, _ := time.Parse("20060102T150405Z", stamp)
		return runstore.Snapshot{Record: runstore.Record{ID: id, Started: started}}, nil
	}
	return snapshot, err
}

func newProcessProbe(kill func(int, syscall.Signal) error, token func(context.Context, int) (string, error)) (func(int) (string, bool, error), error) {
	if kill == nil || token == nil {
		return nil, errors.New("process probe: missing kill or start token")
	}
	// Permission denied proves this pid belongs to another owner, so it
	// cannot establish liveness for the run's recorded owner.
	unowned := func(err error) bool {
		return errors.Is(err, syscall.ESRCH) || errors.Is(err, syscall.EPERM)
	}
	return func(pid int) (string, bool, error) {
		if err := kill(pid, 0); err != nil {
			if unowned(err) {
				return "", false, nil
			}
			return "", false, err
		}
		start, err := token(context.Background(), pid)
		if err != nil {
			if unowned(kill(pid, 0)) {
				return "", false, nil
			}
			return "", false, err
		}
		return start, true, nil
	}, nil
}
