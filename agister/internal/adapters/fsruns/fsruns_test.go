package fsruns

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/contract"
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

// A run ID cannot lead out of the runs directory.
func TestRunIDsStayInTheStore(t *testing.T) {
	root := t.TempDir()
	store := Store{Dir: filepath.Join(root, "runs")}
	ctx := context.Background()
	outside := Store{Dir: root}
	h, err := outside.Create(ctx, run.Record{Schema: run.RecordSchema, ID: "elsewhere", Process: "p", CreatedAt: time.Now()})
	if err != nil {
		t.Fatal(err)
	}
	h.(*handle).lock.Close()

	var input *contract.InputError
	for _, id := range []string{"../elsewhere", "..", ".", "", "a/b", "/abs"} {
		if record, _, err := store.Get(ctx, id); !errors.As(err, &input) {
			t.Errorf("Get(%q) = %q, %v", id, record.ID, err)
		}
		if _, _, err := store.Events(ctx, id, 0); !errors.As(err, &input) {
			t.Errorf("Events(%q) = %v", id, err)
		}
		if _, err := store.Create(ctx, run.Record{ID: id}); !errors.As(err, &input) {
			t.Errorf("Create(%q) = %v", id, err)
		}
	}
	if _, err := os.Stat(filepath.Join(root, "b")); err == nil {
		t.Fatal("Create wrote outside the store")
	}
}

func TestAdoptTakesOnlyAnAbandonedRun(t *testing.T) {
	store := Store{Dir: t.TempDir()}
	ctx := context.Background()
	effects := &run.Effects{Checkout: &run.Checkout{Repository: "/repo", Dir: "/tmp/agister-checkout-1/workspace"}}
	record := run.Record{Schema: run.RecordSchema, ID: "r1", Process: "p", CreatedAt: time.Now(), Effects: effects}
	h, err := store.Create(ctx, record)
	if err != nil {
		t.Fatal(err)
	}
	_ = h.Append(run.Event{Kind: "E"})

	// Owned: neither listed nor adoptable.
	if abandoned, _ := store.Abandoned(ctx); len(abandoned) != 0 {
		t.Fatalf("owned run listed: %+v", abandoned)
	}
	if _, _, err := store.Adopt(ctx, "r1"); err == nil {
		t.Fatal("adopted a run its owner holds")
	}

	// The owner disappears: the run is listed and adopted once.
	h.(*handle).lock.Close()
	if abandoned, _ := store.Abandoned(ctx); len(abandoned) != 1 || abandoned[0].ID != "r1" {
		t.Fatalf("abandoned = %+v", abandoned)
	}
	adopted, got, err := store.Adopt(ctx, "r1")
	if err != nil || got.Effects == nil || got.Effects.Checkout.Dir != effects.Checkout.Dir {
		t.Fatalf("adopt: %+v, %v", got, err)
	}
	if _, status, _ := store.Get(ctx, "r1"); status != run.StateRunning {
		t.Fatalf("adopted run reads %s", status)
	}
	if _, _, err := store.Adopt(ctx, "r1"); err == nil {
		t.Fatal("adopted a run twice")
	}

	// The adopter can append (numbering on) and finish it.
	if err := adopted.Append(run.Event{Kind: "F"}); err != nil {
		t.Fatal(err)
	}
	if events, _, _ := store.Events(ctx, "r1", 0); len(events) != 2 || events[1].Seq != 2 {
		t.Fatalf("events = %+v", events)
	}
	now := time.Now()
	got.FinishedAt = &now
	got.Result = &run.Result{Status: run.Lost}
	if err := adopted.Finish(got); err != nil {
		t.Fatal(err)
	}
	if _, status, _ := store.Get(ctx, "r1"); status != run.StateFinished {
		t.Fatalf("finished run reads %s", status)
	}
	if _, _, err := store.Adopt(ctx, "r1"); err == nil {
		t.Fatal("adopted a finished run")
	}
	if abandoned, _ := store.Abandoned(ctx); len(abandoned) != 0 {
		t.Fatalf("finished run listed: %+v", abandoned)
	}
}

func TestLiveCheckoutsAreThoseOfRunsSomeoneOwns(t *testing.T) {
	store := Store{Dir: t.TempDir()}
	ctx := context.Background()
	effects := func(dir string) *run.Effects {
		return &run.Effects{Checkout: &run.Checkout{Repository: "/repo", Dir: dir}}
	}
	live, err := store.Create(ctx, run.Record{Schema: run.RecordSchema, ID: "live", CreatedAt: time.Now(), Effects: effects("/tmp/agister-checkout-live/workspace")})
	if err != nil {
		t.Fatal(err)
	}
	_ = live.Append(run.Event{Kind: "E"})
	dead, err := store.Create(ctx, run.Record{Schema: run.RecordSchema, ID: "dead", CreatedAt: time.Now(), Effects: effects("/tmp/agister-checkout-dead/workspace")})
	if err != nil {
		t.Fatal(err)
	}
	_ = dead.Append(run.Event{Kind: "E"})
	dead.(*handle).lock.Close()

	// A clean copy verification checks is a checkout too.
	copying, err := store.Create(ctx, run.Record{Schema: run.RecordSchema, ID: "copying", CreatedAt: time.Now(), Effects: &run.Effects{
		Checkout: &run.Checkout{Repository: "/repo", Dir: "/tmp/agister-checkout-own/workspace"},
		Copy:     &run.Checkout{Repository: "/repo", Dir: "/tmp/agister-checkout-copy/workspace"},
	}})
	if err != nil {
		t.Fatal(err)
	}
	_ = copying.Append(run.Event{Kind: "E"})

	dirs, err := store.LiveCheckouts(ctx)
	want := []string{"/tmp/agister-checkout-own/workspace", "/tmp/agister-checkout-copy/workspace", "/tmp/agister-checkout-live/workspace"}
	if err != nil || !reflect.DeepEqual(dirs, want) {
		t.Fatalf("live checkouts = %v, %v", dirs, err)
	}
}
