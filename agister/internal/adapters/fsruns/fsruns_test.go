package fsruns

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

func TestOwnershipDecidesRunningVersusAbandoned(t *testing.T) {
	store := Store{Dir: t.TempDir()}
	ctx := context.Background()
	record := run.Record{Schema: run.RecordSchema, ID: "r1", Process: "p", CreatedAt: time.Now()}
	h, err := store.Create(ctx, record)
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 3; i++ {
		if err := h.Append(run.Event{Kind: "E"}); err != nil {
			t.Fatal(err)
		}
	}
	if _, status, _ := store.Get(ctx, "r1"); status != run.StateRunning {
		t.Fatalf("owned and unfinished: %s", status)
	}
	events, _, _ := store.Events(ctx, "r1", 1)
	if len(events) != 2 || events[0].Seq != 2 {
		t.Fatalf("events after 1 = %+v", events)
	}

	// The owner disappears without finishing (e.g. the process was killed).
	h.(*handle).lock.Close()
	if _, status, _ := store.Get(ctx, "r1"); status != run.StateAbandoned {
		t.Fatalf("unowned and unfinished must read as abandoned: %s", status)
	}
}

func TestFinishedRecord(t *testing.T) {
	store := Store{Dir: t.TempDir()}
	ctx := context.Background()
	record := run.Record{Schema: run.RecordSchema, ID: "r2", Process: "p", CreatedAt: time.Now()}
	h, err := store.Create(ctx, record)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now()
	record.FinishedAt = &now
	record.Result = &run.Result{Status: run.Completed}
	if err := h.Finish(record); err != nil {
		t.Fatal(err)
	}
	got, status, err := store.Get(ctx, "r2")
	if err != nil || status != run.StateFinished || got.Result == nil || got.Result.Status != run.Completed {
		t.Fatalf("got %+v %s %v", got, status, err)
	}
	if _, err := store.Create(ctx, record); err == nil {
		t.Fatal("a run ID must not be reused")
	}
}

func TestArtifactsAreStoredWithTheirDigest(t *testing.T) {
	store := Store{Dir: t.TempDir()}
	h, err := store.Create(context.Background(), run.Record{Schema: run.RecordSchema, ID: "r3"})
	if err != nil {
		t.Fatal(err)
	}
	artifact, err := h.Artifact("changes.patch", []byte("diff"))
	if err != nil || artifact.Path != "artifacts/changes.patch" || artifact.Bytes != 4 ||
		artifact.Digest != "sha256:df087996d45b03e7eb8c133c0298fd98d35113fca26aaba58612fef3cc212cad" {
		t.Fatalf("artifact %+v, %v", artifact, err)
	}
	data, err := os.ReadFile(filepath.Join(store.Dir, "r3", artifact.Path))
	if err != nil || string(data) != "diff" {
		t.Fatalf("stored %q, %v", data, err)
	}
	for _, name := range []string{"", "../escape", "a/b", ".hidden"} {
		if _, err := h.Artifact(name, nil); err == nil {
			t.Fatalf("artifact name %q accepted", name)
		}
	}
}
