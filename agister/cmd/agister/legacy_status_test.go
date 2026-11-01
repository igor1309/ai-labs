package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/runstore"
)

// Integration test: status and runs list read legacy runstore snapshots.
// Contract test: run folders containing only record.json and events.jsonl.
func TestLegacyRunsReportRecordedOutcomesOrUnknown(t *testing.T) {
	t.Parallel()
	for _, status := range []string{"completed", "failed", "interrupted", "lost"} {
		t.Run(status, func(t *testing.T) {
			t.Parallel()
			for _, hasEnd := range []bool{false, true} {
				name := "without end time"
				if hasEnd {
					name = "with end time"
				}
				t.Run(name, func(t *testing.T) {
					t.Parallel()
					folder := t.TempDir()
					id := "20261020T080000Z-aaaaaa"
					runFolder := filepath.Join(folder, id)
					if err := os.Mkdir(runFolder, 0700); err != nil {
						t.Fatal(err)
					}
					at := time.Date(2026, 10, 20, 8, 0, 0, 0, time.UTC)
					r := runstore.Record{Schema: runstore.Schema, ID: id, Started: at, Status: status}
					want := status
					if hasEnd {
						r.Ended = &at
					}
					if status != "lost" {
						r.Result = &runstore.Result{Outcome: runstore.Outcome{Status: status}}
					}
					if status == "failed" || status == "interrupted" {
						class, reason := "runtime", "denied"
						r.Result.Class, r.Result.Reason = &class, &reason
						want = "failed: " + class + ": " + reason
					}
					if status == "lost" {
						want = "lost (process gone)"
						if !hasEnd {
							// Without an end time, legacy lost carries no liveness evidence.
							want = "unknown"
						}
					}
					data, err := json.Marshal(r)
					if err != nil {
						t.Fatal(err)
					}
					if err := os.WriteFile(filepath.Join(runFolder, "record.json"), data, 0600); err != nil {
						t.Fatal(err)
					}
					if err := os.WriteFile(filepath.Join(runFolder, "events.jsonl"), nil, 0600); err != nil {
						t.Fatal(err)
					}
					store, err := runstore.New(folder)
					if err != nil {
						t.Fatal(err)
					}
					f := newRunFixture(t, map[string]string{}, nil)
					machine := idleHost(t)
					machine.clock, machine.timer, machine.signals, machine.random = f.clock, f.clock.Timer, f.signals.watch, f.random
					var stdout, stderr strings.Builder
					commandLine, err := build("/u", &linksSpy{}, newFilesystemSpy(f.settings), f.roots, f.runtimes.runtimes(), f.validator, f.sources.sourcing(), f.holding.holding(),
						func(string) (homeRuns, error) { return store, nil }, machine, &stdout, &stderr)
					if err != nil {
						t.Fatal(err)
					}
					for _, args := range [][]string{{"status"}, {"status", id}, {"status", "--last"}, {"runs", "list"}} {
						stdout.Reset()
						stderr.Reset()
						if code := commandLine.Run(args, "/r"); code != 0 || stderr.String() != "" || stdout.String() != id+": "+want+"\n" {
							t.Fatalf("%v: exit %d, stdout %q, stderr %q; want %q", args, code, stdout.String(), stderr.String(), id+": "+want+"\n")
						}
					}
				})
			}
		})
	}
}
