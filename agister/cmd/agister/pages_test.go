package main

import (
	"context"
	"os"
	"path/filepath"
	"syscall"
	"testing"

	"github.com/igor1309/ai-labs/agister/pages"
)

// The pages read a run's owner from the run store agister run writes: an
// unfinished run is running while a process holds its owner.lock, and lost
// once none does or there is no lock at all.
func TestPagesReadTheRunsOwnersFromTheRunStore(t *testing.T) {
	ctx := context.Background()
	runs := tempDir(t)
	unfinished := func(id string) {
		t.Helper()
		if err := os.MkdirAll(filepath.Join(runs, id), 0o700); err != nil {
			t.Fatal(err)
		}
		record := `{"schema":"agister.run/v1alpha3","id":"` + id + `","process":"implement","request":{"process":"implement","cwd":"/r"},"created_at":"2026-10-01T10:00:00Z"}`
		if err := os.WriteFile(filepath.Join(runs, id, "record.json"), []byte(record), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	unfinished("owned")
	unfinished("unlocked") // a CLI killed before it took the lock
	lock, err := os.OpenFile(filepath.Join(runs, "owned", "owner.lock"), os.O_CREATE|os.O_RDWR, 0o600)
	if err != nil {
		t.Fatal(err)
	}
	defer lock.Close()
	if err := syscall.Flock(int(lock.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		t.Fatal(err)
	}
	store := pagesEnv().Observe(runs)
	status := func(id string) string {
		t.Helper()
		detail, err := pages.ReadRun(ctx, runs, store, id)
		if err != nil {
			t.Fatal(err)
		}
		list, err := pages.ListRuns(ctx, runs, store, pages.DefaultRunLimit)
		if err != nil {
			t.Fatal(err)
		}
		for _, summary := range list.Runs {
			if summary.ID == id && summary.Status != detail.Summary.Status {
				t.Fatalf("%s: listed %s, read %s", id, summary.Status, detail.Summary.Status)
			}
		}
		return detail.Summary.Status
	}

	if got := status("owned"); got != "running" {
		t.Fatalf("held: %s", got)
	}
	if got := status("unlocked"); got != "lost" {
		t.Fatalf("no lock: %s", got)
	}
	// The owner lets go without finishing: the run is lost.
	if err := syscall.Flock(int(lock.Fd()), syscall.LOCK_UN); err != nil {
		t.Fatal(err)
	}
	if got := status("owned"); got != "lost" {
		t.Fatalf("released: %s", got)
	}
}
