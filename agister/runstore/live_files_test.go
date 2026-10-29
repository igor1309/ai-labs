package runstore

import (
	"encoding/json"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/gokit/clocktest"
)

// Contract test: live runs atomically persist heartbeat evidence and remove it
// after the durable terminal, including when ending through Append.
func TestStoreHeartbeatLifecycle(t *testing.T) {
	t.Parallel()
	for _, via := range []string{"write", "append", "failure"} {
		t.Run(via, func(t *testing.T) {
			t.Parallel()
			folder := t.TempDir()
			c := clocktest.NewClock(time.Date(2026, 10, 29, 12, 0, 0, 0, time.UTC))
			s, err := NewLive(folder, Liveness{PID: 52, Probe: func(pid int) (string, bool, error) {
				if pid != 52 {
					t.Errorf("pid %d", pid)
				}
				return "process start", true, nil
			}, Now: c.Now, Timer: c.Timer, Interval: time.Second})
			if err != nil {
				t.Fatal(err)
			}
			r := Record{Schema: Schema, ID: "x", Status: "running", Started: c.Now()}
			if err := s.Begin(r); err != nil {
				t.Fatal(err)
			}
			t.Cleanup(func() { s.stopPulse("x") })
			snapshot, err := s.Snapshot("x")
			if err != nil || snapshot.Record.Status != "running" || snapshot.Heartbeat == nil || snapshot.Heartbeat.PID != 52 || snapshot.Heartbeat.ProcessStart != "process start" || !snapshot.Heartbeat.Beat.Equal(c.Now()) {
				t.Fatalf("snapshot %+v, %v", snapshot, err)
			}
			c.Started(time.Second)
			at := c.Now()
			r.Ended, r.Status, r.Result = &at, "completed", &Result{Outcome: Outcome{Status: "completed"}}
			switch via {
			case "write":
				err = s.Write(r)
			case "append":
				err = s.Append("x", Event{Kind: RunEnded, At: at, Record: &r})
			case "failure":
				err = s.Append("x", Event{Kind: RunStarted, Record: &r})
			}
			if (err != nil) != (via == "failure") {
				t.Fatalf("finish error %v", err)
			}
			path := filepath.Join(folder, "x", "x.heartbeat")
			if _, err := os.Stat(path); !errors.Is(err, fs.ErrNotExist) {
				t.Fatalf("heartbeat survived finish: %v", err)
			}
			if c.Pending() != 0 {
				t.Fatalf("ticker survived finish: %d", c.Pending())
			}
			c.Advance(time.Hour)
			if _, err := os.Stat(path); !errors.Is(err, fs.ErrNotExist) {
				t.Fatalf("ticker recreated heartbeat: %v", err)
			}
			snapshot, err = s.Snapshot("x")
			want := "completed"
			if via == "failure" {
				want = "running"
			}
			if err != nil || snapshot.Record.Status != want || snapshot.Heartbeat != nil {
				t.Fatalf("finished %+v, %v", snapshot, err)
			}
		})
	}
}

// Contract test: missing and malformed heartbeat files preserve the committed
// log state, and terminal outcomes ignore disposable files entirely.
func TestSnapshotReadsStartupGapAndMalformedHeartbeats(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 10, 29, 12, 0, 0, 0, time.UTC)
	valid, _ := json.Marshal(Heartbeat{PID: 7, ProcessStart: "start", Beat: now})
	for _, c := range []struct {
		name  string
		data  []byte
		valid bool
	}{
		{name: "missing"}, {name: "malformed", data: []byte("{")}, {name: "empty", data: []byte("{}")},
		{name: "zero identity", data: []byte(`{"pid":0,"process_start":"start","last_beat":"2026-10-29T12:00:00Z"}`)},
		{name: "bad age", data: []byte(`{"pid":7,"process_start":"start","last_beat":"2026-10-29T12:00:00Z","pending_age_ms":100}`)},
		{name: "valid", data: valid, valid: true},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			folder := t.TempDir()
			s, err := New(folder)
			if err != nil {
				t.Fatal(err)
			}
			r := Record{Schema: Schema, ID: "x", Status: "running", Started: now}
			if err := s.Begin(r); err != nil {
				t.Fatal(err)
			}
			path := filepath.Join(folder, "x", "x.heartbeat")
			if c.data != nil {
				if err := os.WriteFile(path, c.data, 0600); err != nil {
					t.Fatal(err)
				}
			}
			got, err := s.Snapshot("x")
			if err != nil || got.Record.Status != "running" || (got.Heartbeat != nil) != c.valid {
				t.Fatalf("snapshot %+v, %v", got, err)
			}
			r.Ended, r.Status, r.Result = &now, "completed", &Result{Outcome: Outcome{Status: "completed"}}
			if err := s.Write(r); err != nil {
				t.Fatal(err)
			}
			if err := os.Remove(path); err != nil && !errors.Is(err, fs.ErrNotExist) {
				t.Fatal(err)
			}
			if err := os.Mkdir(path, 0700); err != nil {
				t.Fatal(err)
			}
			got, err = s.Snapshot("x")
			if err != nil || got.Record.Status != "completed" || got.Heartbeat != nil {
				t.Fatalf("terminal %+v, %v", got, err)
			}
		})
	}
}
