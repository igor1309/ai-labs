package fsruns

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"syscall"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/contract"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

// Contract test: the run store against the real filesystem, and the
// kernel's flock on a run's owner.lock.
func TestOwnershipDecidesRunningVersusAbandoned(t *testing.T) {
	t.Parallel()
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

// Contract test: the run store against the real filesystem, and the
// kernel's flock on a run's owner.lock.
func TestFinishedRecord(t *testing.T) {
	t.Parallel()
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

// Contract test: the run store against the real filesystem, and the
// kernel's flock on a run's owner.lock.
func TestArtifactsAreStoredWithTheirDigest(t *testing.T) {
	t.Parallel()
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
//
// Contract test: the run store against the real filesystem, and the
// kernel's flock on a run's owner.lock.
func TestArtifactsReadBackAsStored(t *testing.T) {
	t.Parallel()
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
//
// Contract test: the run store against the real filesystem, and the
// kernel's flock on a run's owner.lock.
func TestRunIDsStayInTheStore(t *testing.T) {
	t.Parallel()
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

// Contract test: the run store against the real filesystem, and the
// kernel's flock on a run's owner.lock.
func TestAdoptTakesOnlyAnAbandonedRun(t *testing.T) {
	t.Parallel()
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
//
// Contract test: the run store against the real filesystem, and the
// kernel's flock on a run's owner.lock.
func TestAFinishedRunWithACleanCopyOnRecordIsAdopted(t *testing.T) {
	t.Parallel()
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
//
// Contract test: the run store against the real filesystem, and the
// kernel's flock on a run's owner.lock.
func TestAFinishedRunWithAnUnreleasedCheckoutOnRecordIsAdopted(t *testing.T) {
	t.Parallel()
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

// Contract test: the run store against the real filesystem, and the
// kernel's flock on a run's owner.lock.
func TestLiveCheckoutsAreThoseOfRunsSomeoneOwns(t *testing.T) {
	t.Parallel()
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
//
// Contract test: the run store against the real filesystem, and the
// kernel's flock on a run's owner.lock.
func TestACheckoutAReapCouldNotRemoveIsReapedLater(t *testing.T) {
	t.Parallel()
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

// closed says whether ch is closed now, without waiting.
func closed(ch <-chan struct{}) bool {
	select {
	case <-ch:
		return true
	default:
		return false
	}
}

// A run this process writes has a notification, closed already when the
// run has an event after the one asked about, and open while it does not.
// Another Store over the same directory shares it.
//
// Contract test: the run store against the real filesystem, and the
// kernel's flock on a run's owner.lock.
func TestAppendedIsClosedAlreadyWhenALaterEventExists(t *testing.T) {
	t.Parallel()
	store := Store{Dir: t.TempDir()}
	ctx := context.Background()
	h, err := store.Create(ctx, run.Record{Schema: run.RecordSchema, ID: "r", Process: "p", CreatedAt: time.Now()})
	if err != nil {
		t.Fatal(err)
	}
	defer h.Finish(run.Record{ID: "r", FinishedAt: new(time.Time)})
	for range 2 {
		if err := h.Append(run.Event{Kind: "E"}); err != nil {
			t.Fatal(err)
		}
	}
	for _, reader := range []Store{store, {Dir: store.Dir}} {
		if appended, ok := reader.Appended(ctx, "r", 1); !ok || !closed(appended) {
			t.Fatalf("after event 1 of 2: ok %v, closed %v", ok, ok && closed(appended))
		}
		if appended, ok := reader.Appended(ctx, "r", 2); !ok || closed(appended) {
			t.Fatalf("after the last event: ok %v, closed %v", ok, ok && closed(appended))
		}
	}
}

// The notification closes when the run appends its next event, and not
// before: raw output, record updates and artifacts do not close it.
//
// Contract test: the run store against the real filesystem, and the
// kernel's flock on a run's owner.lock.
func TestAppendedClosesOnTheNextAppendAndNotBefore(t *testing.T) {
	t.Parallel()
	store := Store{Dir: t.TempDir()}
	ctx := context.Background()
	h, err := store.Create(ctx, run.Record{Schema: run.RecordSchema, ID: "r", Process: "p", CreatedAt: time.Now()})
	if err != nil {
		t.Fatal(err)
	}
	defer h.Finish(run.Record{ID: "r", FinishedAt: new(time.Time)})
	appended, ok := store.Appended(ctx, "r", 0)
	if !ok || closed(appended) {
		t.Fatalf("a run with no events: ok %v, closed %v", ok, ok && closed(appended))
	}
	if err := h.Raw("line"); err != nil {
		t.Fatal(err)
	}
	if err := h.Update(run.Record{Schema: run.RecordSchema, ID: "r", Process: "p"}); err != nil {
		t.Fatal(err)
	}
	if _, err := h.Artifact("a.txt", []byte("a")); err != nil {
		t.Fatal(err)
	}
	if closed(appended) {
		t.Fatal("closed before any event was appended")
	}
	if err := h.Append(run.Event{Kind: "E"}); err != nil {
		t.Fatal(err)
	}
	if !closed(appended) {
		t.Fatal("not closed once an event was appended")
	}
	if next, _ := store.Appended(ctx, "r", 1); closed(next) {
		t.Fatal("closed for the event after the one appended")
	}
}

// The notification closes when the run finishes, and a finished run's is
// closed already.
//
// Contract test: the run store against the real filesystem, and the
// kernel's flock on a run's owner.lock.
func TestAppendedClosesWhenTheRunFinishes(t *testing.T) {
	t.Parallel()
	store := Store{Dir: t.TempDir()}
	ctx := context.Background()
	record := run.Record{Schema: run.RecordSchema, ID: "r", Process: "p", CreatedAt: time.Now()}
	h, err := store.Create(ctx, record)
	if err != nil {
		t.Fatal(err)
	}
	appended, ok := store.Appended(ctx, "r", 0)
	if !ok || closed(appended) {
		t.Fatalf("a running run: ok %v, closed %v", ok, ok && closed(appended))
	}
	now := time.Now()
	record.FinishedAt = &now
	if err := h.Finish(record); err != nil {
		t.Fatal(err)
	}
	if !closed(appended) {
		t.Fatal("not closed once the run finished")
	}
	if again, ok := store.Appended(ctx, "r", 0); !ok || !closed(again) {
		t.Fatalf("a finished run: ok %v, closed %v", ok, ok && closed(again))
	}
}

// A run another process runs has no notification: its owner lock is held
// elsewhere and no handle here holds it. Once that owner is gone without
// finishing, the run has ended, abandoned, and its notification is closed
// already.
//
// Contract test: the run store against the real filesystem, and the
// kernel's flock on a run's owner.lock.
func TestAppendedHasNoNotificationForARunAnotherProcessRuns(t *testing.T) {
	t.Parallel()
	store := Store{Dir: t.TempDir()}
	ctx := context.Background()
	dir := filepath.Join(store.Dir, "r")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		t.Fatal(err)
	}
	data, _ := json.Marshal(run.Record{Schema: run.RecordSchema, ID: "r", Process: "p", CreatedAt: time.Now()})
	if err := os.WriteFile(filepath.Join(dir, "record.json"), data, 0o600); err != nil {
		t.Fatal(err)
	}
	// The other owner's lock: an open file of its own, as another
	// process's is.
	lock, err := os.OpenFile(filepath.Join(dir, "owner.lock"), os.O_CREATE|os.O_RDWR, 0o600)
	if err != nil {
		t.Fatal(err)
	}
	if err := syscall.Flock(int(lock.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		t.Fatal(err)
	}
	if _, ok := store.Appended(ctx, "r", 0); ok {
		t.Fatal("a notification for a run another process runs")
	}
	lock.Close()
	if appended, ok := store.Appended(ctx, "r", 0); !ok || !closed(appended) {
		t.Fatalf("an abandoned run: ok %v, closed %v", ok, ok && closed(appended))
	}
	if _, ok := store.Appended(ctx, "../r", 0); ok {
		t.Fatal("a notification for a path out of the store")
	}
}

// A run this process adopts is signalled as one it created is: from the
// last event its dead owner wrote, on each event the reap appends, and on
// its finish.
//
// Contract test: the run store against the real filesystem, and the
// kernel's flock on a run's owner.lock.
func TestAppendedSignalsAnAdoptedRun(t *testing.T) {
	t.Parallel()
	store := Store{Dir: t.TempDir()}
	ctx := context.Background()
	record := run.Record{Schema: run.RecordSchema, ID: "r", Process: "p", CreatedAt: time.Now()}
	dead, err := store.Create(ctx, record)
	if err != nil {
		t.Fatal(err)
	}
	if err := dead.Append(run.Event{Kind: "E"}); err != nil {
		t.Fatal(err)
	}
	// The owner disappears without finishing; the in-process signal goes
	// with it, as a killed process's does.
	if err := store.Abandon("r"); err != nil {
		t.Fatal(err)
	}

	adopted, _, err := store.Adopt(ctx, "r")
	if err != nil {
		t.Fatal(err)
	}
	if appended, ok := store.Appended(ctx, "r", 0); !ok || !closed(appended) {
		t.Fatalf("after event 0 of the dead owner's 1: ok %v, closed %v", ok, ok && closed(appended))
	}
	appended, ok := store.Appended(ctx, "r", 1)
	if !ok || closed(appended) {
		t.Fatalf("after the dead owner's last event: ok %v, closed %v", ok, ok && closed(appended))
	}
	if err := adopted.Append(run.Event{Kind: "EFFECTS_REAPED"}); err != nil {
		t.Fatal(err)
	}
	if !closed(appended) {
		t.Fatal("not closed once the reap appended its event")
	}
	finishing, _ := store.Appended(ctx, "r", 2)
	now := time.Now()
	record.FinishedAt = &now
	if err := adopted.Finish(record); err != nil {
		t.Fatal(err)
	}
	if !closed(finishing) {
		t.Fatal("not closed once the reap finished the run")
	}
}

// A run abandoned in this process is left as a killed owner leaves it:
// unowned, with its record as last saved and unfinished, so it reads as
// abandoned and is adopted. Its handle refuses every later write, the
// finish included, and takes nothing from whoever adopted the run.
//
// Contract test: the run store against the real filesystem, and the
// kernel's flock on a run's owner.lock.
func TestAbandonLeavesTheRunAsAKilledOwnerDoes(t *testing.T) {
	t.Parallel()
	store := Store{Dir: t.TempDir()}
	ctx := context.Background()
	record := run.Record{Schema: run.RecordSchema, ID: "r", Process: "p", CreatedAt: time.Now()}
	h, err := store.Create(ctx, record)
	if err != nil {
		t.Fatal(err)
	}
	if err := h.Append(run.Event{Kind: "E"}); err != nil {
		t.Fatal(err)
	}
	record.Effects = &run.Effects{Process: &run.Process{Ref: "pgid:7"}}
	if err := h.Update(record); err != nil {
		t.Fatal(err)
	}
	if err := store.Abandon("r"); err != nil {
		t.Fatal(err)
	}

	saved, state, err := store.Get(ctx, "r")
	if err != nil || state != run.StateAbandoned || saved.FinishedAt != nil || saved.Effects == nil || saved.Effects.Process == nil || saved.Effects.Process.Ref != "pgid:7" {
		t.Fatalf("the abandoned run = %+v, %s, %v", saved, state, err)
	}
	if abandoned, err := store.Abandoned(ctx); err != nil || len(abandoned) != 1 || abandoned[0].ID != "r" {
		t.Fatalf("abandoned = %+v, %v", abandoned, err)
	}

	now := time.Now()
	finished := record
	finished.FinishedAt = &now
	refused := func(what string, err error) {
		t.Helper()
		if !errors.Is(err, errAbandoned) {
			t.Fatalf("%s on an abandoned handle = %v, want %v", what, err, errAbandoned)
		}
	}
	refused("Append", h.Append(run.Event{Kind: "LATE"}))
	refused("Raw", h.Raw("late"))
	refused("Update", h.Update(finished))
	_, err = h.Artifact("late.txt", []byte("late"))
	refused("Artifact", err)
	refused("Finish", h.Finish(finished))
	events, state, err := store.Events(ctx, "r", 0)
	if err != nil || state != run.StateAbandoned || len(events) != 1 || events[0].Kind != "E" {
		t.Fatalf("events after the refused writes = %+v, %s, %v", events, state, err)
	}
	for _, name := range []string{"provider.jsonl", "artifacts"} {
		if _, err := os.Stat(filepath.Join(store.Dir, "r", name)); !errors.Is(err, os.ErrNotExist) {
			t.Fatalf("%s after the refused writes: %v", name, err)
		}
	}

	// The run is the adopter's now: the abandoned handle's finish neither
	// writes its record nor ends its notification.
	adopted, _, err := store.Adopt(ctx, "r")
	if err != nil {
		t.Fatal(err)
	}
	appended, ok := store.Appended(ctx, "r", 1)
	if !ok || closed(appended) {
		t.Fatalf("the adopted run: ok %v, closed %v", ok, ok && closed(appended))
	}
	refused("Finish", h.Finish(finished))
	if _, state, _ := store.Get(ctx, "r"); state != run.StateRunning || closed(appended) {
		t.Fatalf("after the abandoned handle's finish: %s, closed %v", state, closed(appended))
	}
	if err := adopted.Finish(finished); err != nil {
		t.Fatal(err)
	}
	if _, state, _ := store.Get(ctx, "r"); state != run.StateFinished || !closed(appended) {
		t.Fatalf("after the adopter's finish: %s, closed %v", state, closed(appended))
	}
}

// The notification closes when the run is abandoned, and an abandoned
// run's is closed already: whoever follows it wakes and reads it abandoned.
//
// Contract test: the run store against the real filesystem, and the
// kernel's flock on a run's owner.lock.
func TestAppendedClosesWhenTheRunIsAbandoned(t *testing.T) {
	t.Parallel()
	store := Store{Dir: t.TempDir()}
	ctx := context.Background()
	if _, err := store.Create(ctx, run.Record{Schema: run.RecordSchema, ID: "r", Process: "p", CreatedAt: time.Now()}); err != nil {
		t.Fatal(err)
	}
	appended, ok := store.Appended(ctx, "r", 0)
	if !ok || closed(appended) {
		t.Fatalf("a running run: ok %v, closed %v", ok, ok && closed(appended))
	}
	// Another Store over the same directory abandons it, as it shares the
	// handles.
	if err := (Store{Dir: store.Dir}).Abandon("r"); err != nil {
		t.Fatal(err)
	}
	if !closed(appended) {
		t.Fatal("not closed once the run was abandoned")
	}
	if _, state, _ := store.Get(ctx, "r"); state != run.StateAbandoned {
		t.Fatalf("read once woken: %s", state)
	}
	if again, ok := store.Appended(ctx, "r", 0); !ok || !closed(again) {
		t.Fatalf("an abandoned run: ok %v, closed %v", ok, ok && closed(again))
	}
}

// Only a run a handle here holds is abandoned: one that finished, one
// abandoned already, one nobody here created and a path out of the store
// are errors, and a finished run stays finished.
//
// Contract test: the run store against the real filesystem, and the
// kernel's flock on a run's owner.lock.
func TestAbandonNeedsARunThisProcessHolds(t *testing.T) {
	t.Parallel()
	store := Store{Dir: t.TempDir()}
	ctx := context.Background()
	record := run.Record{Schema: run.RecordSchema, ID: "done", Process: "p", CreatedAt: time.Now()}
	h, err := store.Create(ctx, record)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now()
	record.FinishedAt = &now
	if err := h.Finish(record); err != nil {
		t.Fatal(err)
	}
	if err := store.Abandon("done"); err == nil {
		t.Fatal("a finished run was abandoned")
	}
	if _, state, _ := store.Get(ctx, "done"); state != run.StateFinished {
		t.Fatalf("the finished run reads %s", state)
	}

	if _, err := store.Create(ctx, run.Record{Schema: run.RecordSchema, ID: "twice", Process: "p", CreatedAt: time.Now()}); err != nil {
		t.Fatal(err)
	}
	if err := store.Abandon("twice"); err != nil {
		t.Fatal(err)
	}
	if err := store.Abandon("twice"); err == nil {
		t.Fatal("a run was abandoned twice")
	}
	if err := store.Abandon("unknown"); err == nil {
		t.Fatal("a run nobody created was abandoned")
	}
	var invalid *contract.InputError
	if err := store.Abandon("../twice"); !errors.As(err, &invalid) {
		t.Fatalf("a path out of the store: %v", err)
	}
}
