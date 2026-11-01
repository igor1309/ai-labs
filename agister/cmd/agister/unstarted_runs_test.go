package main

import (
	"errors"
	"io"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/cli"
	"github.com/igor1309/ai-labs/agister/runstore"
	"github.com/igor1309/ai-labs/gokit/clocktest"
)

// Integration test: status, continuation, reuse and budget read the log store.
// Contract test: filesystem logs without a committed first line.
func TestUnstartedRunsDoNotHideReadableRuns(t *testing.T) {
	t.Parallel()
	for _, name := range []string{"empty", "torn first line", "short first write"} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			folder := t.TempDir()
			store, err := runstore.New(folder)
			if err != nil {
				t.Fatal(err)
			}
			at := time.Date(2026, 10, 20, 10, 0, 0, 0, time.UTC)
			oldID, latestID, badID := "20261020T060000Z-aaaaaa", "20261020T070000Z-bbbbbb", "20261020T080000Z-cccccc"
			request := cli.Request{Process: "ask", Agent: "claude-opus"}
			for i, id := range []string{oldID, latestID} {
				c := keptCall(id+"/ask", []string{"t1", "t2"}[i], "s1")
				c.Result.Outcome = dailyCall(at.Format(time.RFC3339), usd(0.5)).Result.Outcome
				r := keptRun(id, c)
				r.Request = runstore.Request{Process: request.Process, Agent: request.Agent}
				r.Started, r.Status = at.Add(time.Duration(i-4)*time.Hour), "running"
				if err := store.Begin(r); err != nil {
					t.Fatal(err)
				}
				r.Ended, r.Status = &at, "completed"
				r.Result = &runstore.Result{Outcome: runstore.Outcome{Status: "completed"}}
				if err := store.Write(r); err != nil {
					t.Fatal(err)
				}
			}
			badFolder := filepath.Join(folder, badID)
			if err := os.Mkdir(badFolder, 0700); err != nil {
				t.Fatal(err)
			}
			writer, err := runstore.NewLogWriter(func(data []byte, _ bool) error {
				cut := 0
				switch name {
				case "torn first line":
					cut = len(data) - 1
				case "short first write":
					cut = len(data) / 2
				}
				if err := os.WriteFile(filepath.Join(badFolder, "run.jsonl"), data[:cut], 0600); err != nil {
					return err
				}
				return io.ErrShortWrite
			})
			if err != nil {
				t.Fatal(err)
			}
			initial := runstore.Record{Schema: runstore.Schema, ID: badID, Started: at.Add(-2 * time.Hour)}
			if err := writer.Append(runstore.Event{Kind: runstore.RunStarted, Record: &initial}); !errors.Is(err, io.ErrShortWrite) {
				t.Fatalf("first append: %v", err)
			}
			if _, err := store.Record(badID); !errors.Is(err, runstore.ErrNotStarted) {
				t.Fatalf("record error %v, want not started", err)
			}
			if _, err := store.Snapshot(badID); !errors.Is(err, runstore.ErrNotStarted) {
				t.Fatalf("snapshot error %v, want not started", err)
			}

			f := newContinueFixture(t)
			f.clock = clocktest.NewClock(at)
			f.holding.content = "t2"
			machine := idleHost(t)
			machine.clock, machine.timer, machine.signals, machine.random = f.clock, f.clock.Timer, f.signals.watch, f.random
			var stdout, stderr strings.Builder
			commandLine, err := build("/u", &linksSpy{}, newFilesystemSpy(f.settings), f.roots, f.runtimes.runtimes(), f.validator, f.sources.sourcing(), f.holding.holding(),
				func(string) (homeRuns, error) { return store, nil }, machine, &stdout, &stderr)
			if err != nil {
				t.Fatal(err)
			}
			for _, args := range [][]string{{"status"}, {"runs", "list"}, {"status", badID}, {"status", "--last"}} {
				stdout.Reset()
				stderr.Reset()
				want := badID + ": unknown\n" + latestID + ": completed\n" + oldID + ": completed\n"
				if len(args) == 2 && args[0] == "status" {
					want = badID + ": unknown\n"
				}
				if code := commandLine.Run(args, "/r"); code != 0 || stderr.String() != "" || stdout.String() != want {
					t.Fatalf("%v: exit %d, stdout %q, stderr %q; want %q", args, code, stdout.String(), stderr.String(), want)
				}
			}
			day, warnings := dailyBudget(store, at, usd(20))
			wantWarnings := []string{"the runs could not be read: " + runstore.ErrNotStarted.Error() + "; they spend nothing of the day"}
			if day.Spent != 1 || !reflect.DeepEqual(warnings, wantWarnings) {
				t.Fatalf("budget %+v, warnings %v", day, warnings)
			}
			reused, why, err := reuseOf(latestID, request, store)
			if err != nil || len(why) != 0 || reused.ID != latestID || reused.Calls[0].ID != latestID+"/ask" {
				t.Fatalf("reuse %+v, %v, %v", reused, why, err)
			}
			// A reused call may need to scan behind its own run as well.
			first := keptCall("reused/ask", "t1", "s1")
			reuses := oldID + "/ask"
			first.Reuses = &reuses
			latest, err := latestCall(store, badID, first, "s1")
			if err != nil || latest.ID != latestID+"/ask" {
				t.Fatalf("latest reused call %+v, %v", latest, err)
			}
			stdout.Reset()
			stderr.Reset()
			args := []string{"run", "--process", "ask", "--agent", "claude-opus", "--param", "q=more", "--continue", oldID}
			if code := commandLine.Run(args, "/r"); code != 0 {
				t.Fatalf("continuation exit %d, stderr %q", code, stderr.String())
			}
			turns := f.runtimes.claude.ran()
			continued, err := store.Record(at.Format("20060102T150405Z") + "-55fd36")
			if err != nil || len(turns) != 1 || turns[0].Session != "s1" || len(continued.Calls) != 1 || continued.Calls[0].Continues == nil || *continued.Calls[0].Continues != latestID+"/ask" {
				t.Fatalf("continued %+v, %v, turns %+v", continued, err, turns)
			}
		})
	}
}
