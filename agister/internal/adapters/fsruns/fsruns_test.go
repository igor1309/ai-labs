package fsruns

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/app"
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

// An artifact a run stored reads back as stored, by the path its record
// names; a path out of the run's artifacts, or to none, is refused.
func TestArtifactsReadBackAsStored(t *testing.T) {
	store := Store{Dir: t.TempDir()}
	ctx := context.Background()
	h, err := store.Create(ctx, run.Record{Schema: run.RecordSchema, ID: "r4"})
	if err != nil {
		t.Fatal(err)
	}
	patch := []byte("diff --git a/x b/x\nGIT binary patch\n\x00\xff\n")
	artifact, err := h.Artifact("changes.patch", patch)
	if err != nil {
		t.Fatal(err)
	}
	if data, err := store.Artifact(ctx, "r4", artifact); err != nil || string(data) != string(patch) {
		t.Fatalf("read %q, %v", data, err)
	}
	if _, err := store.Artifact(ctx, "r4", run.Artifact{Path: "artifacts/gone.patch"}); !errors.Is(err, contract.ErrNotFound) {
		t.Fatalf("a missing artifact: %v", err)
	}
	for _, path := range []string{"record.json", "artifacts/../record.json", "artifacts/", "artifacts/.hidden", "../r4/artifacts/changes.patch"} {
		if _, err := store.Artifact(ctx, "r4", run.Artifact{Path: path}); err == nil || err.Error() != fmt.Sprintf("run r4: invalid artifact path %q", path) {
			t.Fatalf("artifact path %q: %v", path, err)
		}
	}
	var input *contract.InputError
	if _, err := store.Artifact(ctx, "../r4", artifact); !errors.As(err, &input) {
		t.Fatalf("an invalid run ID: %v", err)
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
		if _, err := store.Artifact(ctx, id, run.Artifact{Path: "artifacts/changes.patch"}); !errors.As(err, &input) {
			t.Errorf("Artifact(%q) = %v", id, err)
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

// A finished run whose record still names a clean copy is listed and
// adopted, so a reap removes the copy; one with no copy on record is not.
func TestAFinishedRunWithACleanCopyOnRecordIsAdopted(t *testing.T) {
	store := Store{Dir: t.TempDir()}
	ctx := context.Background()
	now := time.Now()
	for id, copied := range map[string]*run.Checkout{"copy": {Repository: "/repo", Dir: "/tmp/agister-checkout-2/workspace"}, "none": nil} {
		h, err := store.Create(ctx, run.Record{Schema: run.RecordSchema, ID: id, CreatedAt: now, Effects: &run.Effects{
			Checkout: &run.Checkout{Repository: "/repo", Dir: "/tmp/agister-checkout-1/workspace"}, Copy: copied,
		}})
		if err != nil {
			t.Fatal(err)
		}
		record, _, _ := store.Get(ctx, id)
		record.FinishedAt = &now
		record.Result = &run.Result{Status: run.Completed}
		if err := h.Finish(record); err != nil {
			t.Fatal(err)
		}
	}
	if abandoned, err := store.Abandoned(ctx); err != nil || len(abandoned) != 1 || abandoned[0].ID != "copy" {
		t.Fatalf("abandoned = %+v, %v", abandoned, err)
	}
	if _, _, err := store.Adopt(ctx, "none"); err == nil {
		t.Fatal("adopted a finished run with no copy on record")
	}
	adopted, record, err := store.Adopt(ctx, "copy")
	if err != nil || record.FinishedAt == nil || record.Effects.Copy == nil {
		t.Fatalf("adopt: %+v, %v", record, err)
	}
	record.Effects.Copy = nil
	if err := adopted.Finish(record); err != nil {
		t.Fatal(err)
	}
	if abandoned, _ := store.Abandoned(ctx); len(abandoned) != 0 {
		t.Fatalf("abandoned after the reap = %+v", abandoned)
	}
	if got, status, _ := store.Get(ctx, "copy"); status != run.StateFinished || got.Result.Status != run.Completed {
		t.Fatalf("run reads %s, %+v", status, got.Result)
	}
}

// A finished run whose record names an unreleased checkout is listed and
// adopted, so a reap removes it; one with only its Checkout on record, as
// every finished record before Unreleased has, is not.
func TestAFinishedRunWithAnUnreleasedCheckoutOnRecordIsAdopted(t *testing.T) {
	store := Store{Dir: t.TempDir()}
	ctx := context.Background()
	now := time.Now()
	checkout := &run.Checkout{Repository: "/repo", Dir: "/tmp/agister-checkout-1/workspace"}
	for id, unreleased := range map[string]*run.Checkout{"unreleased": checkout, "released": nil} {
		h, err := store.Create(ctx, run.Record{Schema: run.RecordSchema, ID: id, CreatedAt: now, Effects: &run.Effects{Checkout: checkout}})
		if err != nil {
			t.Fatal(err)
		}
		record, _, _ := store.Get(ctx, id)
		record.Effects.Unreleased = unreleased
		record.FinishedAt = &now
		record.Result = &run.Result{Status: run.Completed}
		if err := h.Finish(record); err != nil {
			t.Fatal(err)
		}
	}
	if abandoned, err := store.Abandoned(ctx); err != nil || len(abandoned) != 1 || abandoned[0].ID != "unreleased" {
		t.Fatalf("abandoned = %+v, %v", abandoned, err)
	}
	if _, _, err := store.Adopt(ctx, "released"); err == nil {
		t.Fatal("adopted a finished run with only its Checkout on record")
	}
	adopted, record, err := store.Adopt(ctx, "unreleased")
	if err != nil || record.FinishedAt == nil || !reflect.DeepEqual(record.Effects.Unreleased, checkout) {
		t.Fatalf("adopt: %+v, %v", record, err)
	}
	record.Effects.Unreleased = nil
	if err := adopted.Finish(record); err != nil {
		t.Fatal(err)
	}
	if abandoned, _ := store.Abandoned(ctx); len(abandoned) != 0 {
		t.Fatalf("abandoned after the reap = %+v", abandoned)
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

// reapSpies are the reaper's other collaborators: no process is left, the
// clock stands still, and discard runs as the test says.
type reapSpies struct {
	discard func(ctx context.Context, dir string) error
}

func (reapSpies) Reap(context.Context, string) (app.Reaping, error) { return app.ReapGone, nil }

func (reapSpies) Now() time.Time { return time.Date(2026, 10, 1, 12, 0, 0, 0, time.UTC) }

func (s reapSpies) Discard(ctx context.Context, _, dir string) error { return s.discard(ctx, dir) }

// An abandoned run's checkout that a reap could not remove, as when the
// reap deadline passes while another process holds the worktree lock, is
// left on record as unreleased: a later reap lists the finished run,
// removes the checkout and clears the marker.
func TestACheckoutAReapCouldNotRemoveIsReapedLater(t *testing.T) {
	store := Store{Dir: t.TempDir()}
	ctx := context.Background()
	checkout := &run.Checkout{Repository: "/repo", Dir: "/tmp/agister-checkout-1/workspace-1"}
	h, err := store.Create(ctx, run.Record{Schema: run.RecordSchema, ID: "killed", Process: "p", CreatedAt: time.Now(), Effects: &run.Effects{Checkout: checkout}})
	if err != nil {
		t.Fatal(err)
	}
	// Its owner is killed.
	h.(*handle).lock.Close()

	var discarded []string
	spies := &reapSpies{}
	reaper := app.NewReaper(store, spies, spies, spies)
	// The deadline passes while the first removal waits.
	var deadline context.CancelFunc
	reaper.ReapContext = func(ctx context.Context) (context.Context, context.CancelFunc) {
		ctx, deadline = context.WithCancel(ctx)
		return ctx, deadline
	}
	spies.discard = func(ctx context.Context, dir string) error {
		discarded = append(discarded, dir)
		deadline()
		return ctx.Err()
	}
	if err := reaper.Reap(ctx); err != nil {
		t.Fatal(err)
	}
	record, state, err := store.Get(ctx, "killed")
	if err != nil || state != run.StateFinished || len(discarded) != 1 ||
		record.Effects == nil || !reflect.DeepEqual(record.Effects.Unreleased, checkout) {
		t.Fatalf("after the first reap: %s, discarded %v, effects %+v, %v", state, discarded, record.Effects, err)
	}
	finished := *record.FinishedAt

	spies.discard = func(ctx context.Context, dir string) error {
		discarded = append(discarded, dir)
		return ctx.Err()
	}
	if err := reaper.Reap(ctx); err != nil {
		t.Fatal(err)
	}
	record, _, err = store.Get(ctx, "killed")
	if err != nil || !reflect.DeepEqual(discarded, []string{checkout.Dir, checkout.Dir}) ||
		record.Effects == nil || record.Effects.Unreleased != nil || !reflect.DeepEqual(record.Effects.Checkout, checkout) ||
		!record.FinishedAt.Equal(finished) {
		t.Fatalf("after the second reap: discarded %v, finished %v, effects %+v, %v", discarded, record.FinishedAt, record.Effects, err)
	}
	if abandoned, err := store.Abandoned(ctx); err != nil || len(abandoned) != 0 {
		t.Fatalf("abandoned after the second reap = %+v, %v", abandoned, err)
	}
}
