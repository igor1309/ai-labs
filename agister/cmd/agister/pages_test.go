package main

import (
	"context"
	"os"
	"path/filepath"
	"reflect"
	"syscall"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/adapters/fsdefs"
	"github.com/igor1309/ai-labs/agister/internal/adapters/fsruns"
	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
	"github.com/igor1309/ai-labs/agister/pages"
)

// The pages read a run's owner from the run store agister run writes: an
// unfinished run is running while a process holds its owner.lock, and lost
// once none does or there is no lock at all.
//
// Contract test: the kernel's flock on a run's owner.lock, as the pages'
// run store reads it.
func TestPagesReadTheRunsOwnersFromTheRunStore(t *testing.T) {
	t.Parallel()
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
	appends := fsruns.NewAppends()
	store := pagesEnv(appends).Observe(runs)
	// It signals through the appends the process was given, as the
	// process's other run stores do.
	if want := (fsruns.Store{Dir: runs, Appends: appends}); store != pages.RunObserver(want) {
		t.Fatalf("the pages' run store = %+v, want %+v", store, want)
	}
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

// The pages select and read the settings layers with the binary's own
// selection and store: a launch below a project's .agister reads home's,
// the repository's and the project's, each through the page's reader.
//
// Contract test: the settings layers on the real filesystem, as the
// binary's store selects and reads them.
func TestPagesReadTheSettingsWithTheBinarysStore(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	base := tempDir(t)
	home, root := filepath.Join(base, "home"), filepath.Join(base, "w")
	launch := filepath.Join(root, "docs", "guide")
	put := func(path, text string) {
		t.Helper()
		if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte(text), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	put(filepath.Join(home, "verifies", "p.yaml"), "name: p\n")
	put(filepath.Join(root, ".agister", "verifies", "p.yaml"), "timeout: 1m\n")
	put(filepath.Join(root, "docs", ".agister", "verifies", "p.yaml"), "max_cost_usd: 1\n")
	if err := os.MkdirAll(launch, 0o700); err != nil {
		t.Fatal(err)
	}
	var read []string
	store, err := pagesEnv(fsruns.NewAppends()).Settings(home, root, launch, func(path string) ([]byte, error) {
		read = append(read, path)
		return os.ReadFile(path)
	})
	if err != nil {
		t.Fatal(err)
	}
	binary, err := fsdefs.Select(fsdefs.Store{Dir: home}, root, launch)
	if err != nil {
		t.Fatal(err)
	}
	if got, want := store.Layers(ctx), binary.Layers(ctx); !reflect.DeepEqual(got, want) {
		t.Fatalf("layers %+v, want %+v", got, want)
	}
	got, err := store.Read(ctx, definition.KindVerify, "p")
	if err != nil {
		t.Fatal(err)
	}
	want, err := binary.Read(ctx, definition.KindVerify, "p")
	if err != nil || string(got.Bytes) != string(want.Bytes) || !reflect.DeepEqual(got.Source, want.Source) {
		t.Fatalf("p = %+v %q, want %+v %q (%v)", got.Source, got.Bytes, want.Source, want.Bytes, err)
	}
	if len(read) != 3 {
		t.Fatalf("read with the page's reader: %v", read)
	}
}
