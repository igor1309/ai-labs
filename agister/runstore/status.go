package runstore

import (
	"encoding/json"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"time"
)

// Snapshot contains only the durable state and disposable liveness evidence
// needed to inspect a run. Heartbeat is nil when missing or malformed.
type Snapshot struct {
	Record    Record
	Active    []ActiveCall
	Heartbeat *Heartbeat
	legacy    bool
}

func (s *Store) Snapshot(id string) (Snapshot, error) {
	folder, err := s.run(id)
	if err != nil {
		return Snapshot{}, err
	}
	var snapshot Snapshot
	log, err := os.Open(filepath.Join(folder, "run.jsonl"))
	if err == nil {
		var line Line
		snapshot.Record, line, err = FoldState(log)
		err = errors.Join(err, log.Close())
		if err != nil {
			return Snapshot{}, err
		}
		if snapshot.Record.ID != id {
			return Snapshot{}, errors.New("runstore: log id disagrees with folder")
		}
		snapshot.Active = line.Active
	} else if errors.Is(err, fs.ErrNotExist) {
		snapshot.Record, err = s.Record(id)
		if err != nil {
			return Snapshot{}, err
		}
		snapshot.legacy = true
		return snapshot, nil
	} else {
		return Snapshot{}, err
	}
	if snapshot.Record.Ended != nil {
		return snapshot, nil
	}
	data, err := os.ReadFile(filepath.Join(folder, id+".heartbeat"))
	if err != nil && !errors.Is(err, fs.ErrNotExist) {
		return Snapshot{}, err
	}
	var h Heartbeat
	if err == nil && json.Unmarshal(data, &h) == nil && validHeartbeat(h) {
		snapshot.Heartbeat = &h
	}
	return snapshot, nil
}

func validHeartbeat(h Heartbeat) bool {
	return h.PID > 0 && h.ProcessStart != "" && !h.Beat.IsZero() && h.PendingAgeMS >= 0 &&
		(h.PendingSince == nil && h.PendingAgeMS == 0 || h.PendingSince != nil && !h.PendingSince.IsZero() && !h.PendingSince.After(h.Beat) && h.Beat.Sub(*h.PendingSince).Milliseconds() == h.PendingAgeMS)
}

// LiveState is the observed state, distinct from the durable run outcome.
type LiveState struct {
	Status string
	Since  *time.Time
}

// Observe gives terminal outcomes priority over disposable heartbeat evidence.
// A stale beat with a matching live owner is unknown; only a current beat
// proves the independent ticker has observed a stalled log writer.
func Observe(snapshot Snapshot, now time.Time, stalledAfter time.Duration, probe func(int) (string, bool, error)) (LiveState, error) {
	r, h := snapshot.Record, snapshot.Heartbeat
	// Legacy lost is also an in-flight placeholder; only an end time proves that outcome.
	if snapshot.legacy && r.Status == "lost" && r.Ended == nil {
		return LiveState{Status: "unknown"}, nil
	}
	if snapshot.legacy || r.Ended != nil {
		return LiveState{Status: r.Status}, nil
	}
	if h == nil || !validHeartbeat(*h) {
		return LiveState{Status: "unknown"}, nil
	}
	if probe == nil || stalledAfter <= 0 {
		return LiveState{}, errors.New("runstore: missing status probe or threshold")
	}
	start, alive, err := probe(h.PID)
	if err != nil {
		return LiveState{}, err
	}
	if !alive || start != h.ProcessStart {
		return LiveState{Status: "lost"}, nil
	}
	if h.Beat.After(now) || now.Sub(h.Beat) > stalledAfter {
		return LiveState{Status: "unknown"}, nil
	}
	if h.PendingSince != nil && now.Sub(*h.PendingSince) >= stalledAfter {
		return LiveState{Status: "writer stalled", Since: h.PendingSince}, nil
	}
	return LiveState{Status: r.Status}, nil
}
