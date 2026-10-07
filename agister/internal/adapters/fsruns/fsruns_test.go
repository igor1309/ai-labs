package fsruns

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"syscall"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/contract"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

// newStore is a Store over a directory of the test's own that signals
// through Appends of the test's own: no handle of one test is another's to
// find.
func newStore(t *testing.T) Store {
	t.Helper()
	return Store{Dir: t.TempDir(), Appends: NewAppends()}
}

// letGo abandons h's run once the test ends, unless the test finished or
// abandoned it: no handle outlives its test holding its run.
func letGo(t *testing.T, h app.ReapHandle) {
	t.Helper()
	t.Cleanup(func() { h.(*handle).abandon() })
}

// holdErr is the error store gives to a hold of run id; a read it gives
// instead is let go once the test ends.
func holdErr(t *testing.T, store Store, id string) error {
	t.Helper()
	read, err := store.Hold(context.Background(), id)
	if err == nil {
		t.Cleanup(read.Release)
	}
	return err
}

// Contract test: the run store against the real filesystem, and the
// kernel's flock on a run's owner.lock.
func TestOwnershipDecidesRunningVersusAbandoned(t *testing.T) {
	t.Parallel()
	store := newStore(t)
	ctx := context.Background()
	record := run.Record{Schema: run.RecordSchema, ID: "r1", Process: "p", CreatedAt: time.Now()}
	h, err := store.Create(ctx, record)
	if err != nil {
		t.Fatal(err)
	}
	letGo(t, h)
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
	store := newStore(t)
	ctx := context.Background()
	record := run.Record{Schema: run.RecordSchema, ID: "r2", Process: "p", CreatedAt: time.Now()}
	h, err := store.Create(ctx, record)
	if err != nil {
		t.Fatal(err)
	}
	letGo(t, h)
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

// A run whose directory holds no record.json yet is being created and has
// recorded nothing: the strict listing leaves it out. A record that exists
// but is not valid JSON, or cannot be read at all, still fails it.
//
// Contract test: the run store against the real filesystem, and the
// kernel's flock on a run's owner.lock.
func TestListStrictSkipsARunBeingCreatedAndFailsOnABrokenRecord(t *testing.T) {
	t.Parallel()
	store := newStore(t)
	ctx := context.Background()
	record := run.Record{Schema: run.RecordSchema, ID: "r1", Process: "p", CreatedAt: time.Now()}
	h, err := store.Create(ctx, record)
	if err != nil {
		t.Fatal(err)
	}
	letGo(t, h)
	if err := os.Mkdir(filepath.Join(store.Dir, "r2"), 0o700); err != nil {
		t.Fatal(err)
	}
	records, err := store.ListStrict(ctx)
	if err != nil || len(records) != 1 || records[0].ID != "r1" {
		t.Fatalf("listed %+v, err %v", records, err)
	}

	if err := os.Mkdir(filepath.Join(store.Dir, "r3"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(store.Dir, "r3", "record.json"), []byte("{"), 0o600); err != nil {
		t.Fatal(err)
	}
	records, err = store.ListStrict(ctx)
	if err == nil || errors.Is(err, contract.ErrNotFound) || !strings.Contains(err.Error(), "listing run r3: ") || records != nil {
		t.Fatalf("a broken record must fail the strict listing: listed %+v, err %v", records, err)
	}

	t.Run("a record that cannot be read", func(t *testing.T) {
		t.Parallel()
		store := newStore(t)
		// A directory where the record is: it exists, and reading it fails.
		if err := os.MkdirAll(filepath.Join(store.Dir, "r4", "record.json"), 0o700); err != nil {
			t.Fatal(err)
		}
		records, err := store.ListStrict(ctx)
		if err == nil || errors.Is(err, contract.ErrNotFound) || !strings.Contains(err.Error(), "listing run r4: ") || records != nil {
			t.Fatalf("a record that cannot be read must fail the strict listing: listed %+v, err %v", records, err)
		}
	})
}

// Contract test: the run store against the real filesystem, and the
// kernel's flock on a run's owner.lock.
func TestArtifactsAreStoredWithTheirDigest(t *testing.T) {
	t.Parallel()
	store := newStore(t)
	h, err := store.Create(context.Background(), run.Record{Schema: run.RecordSchema, ID: "r3"})
	if err != nil {
		t.Fatal(err)
	}
	letGo(t, h)
	artifact, err := h.Artifact("changes.patch", []byte("diff"))
	if err != nil || artifact.Path != "artifacts/changes.patch" || artifact.Bytes != 4 ||
		artifact.Digest != "sha256:df087996d45b03e7eb8c133c0298fd98d35113fca26aaba58612fef3cc212cad" {
		t.Fatalf("artifact %+v, %v", artifact, err)
	}
	if dir := store.RunDir("r3"); dir != filepath.Join(store.Dir, "r3") {
		t.Fatalf("run directory %q", dir)
	}
	data, err := os.ReadFile(filepath.Join(store.RunDir("r3"), artifact.Path))
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
	store := newStore(t)
	ctx := context.Background()
	h, err := store.Create(ctx, run.Record{Schema: run.RecordSchema, ID: "r4"})
	if err != nil {
		t.Fatal(err)
	}
	letGo(t, h)
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
	letGo(t, h)
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
	store := newStore(t)
	ctx := context.Background()
	effects := &run.Effects{Checkout: &run.Checkout{Repository: "/repo", Dir: "/tmp/agister-checkout-1/workspace"}}
	record := run.Record{Schema: run.RecordSchema, ID: "r1", Process: "p", CreatedAt: time.Now(), Effects: effects}
	h, err := store.Create(ctx, record)
	if err != nil {
		t.Fatal(err)
	}
	letGo(t, h)
	_ = h.Append(run.Event{Kind: "E"})

	// Owned: neither listed nor adoptable.
	if abandoned, _ := store.Abandoned(ctx); len(abandoned) != 0 {
		t.Fatalf("owned run listed: %+v", abandoned)
	}
	if _, _, err := store.Adopt(ctx, "r1"); !errors.Is(err, app.ErrRunOwned) {
		t.Fatalf("adopting a run its owner holds = %v, want it owned", err)
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
	letGo(t, adopted)
	if _, status, _ := store.Get(ctx, "r1"); status != run.StateRunning {
		t.Fatalf("adopted run reads %s", status)
	}
	if _, _, err := store.Adopt(ctx, "r1"); !errors.Is(err, app.ErrRunOwned) {
		t.Fatalf("adopting a run twice = %v, want it owned", err)
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
	store := newStore(t)
	ctx := context.Background()
	now := time.Now()
	for id, copied := range map[string]*run.Checkout{"copy": {Repository: "/repo", Dir: "/tmp/agister-checkout-2/workspace"}, "none": nil} {
		h, err := store.Create(ctx, run.Record{Schema: run.RecordSchema, ID: id, CreatedAt: now, Effects: &run.Effects{
			Checkout: &run.Checkout{Repository: "/repo", Dir: "/tmp/agister-checkout-1/workspace"}, Copy: copied,
		}})
		if err != nil {
			t.Fatal(err)
		}
		letGo(t, h)
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
	letGo(t, adopted)
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
	store := newStore(t)
	ctx := context.Background()
	now := time.Now()
	checkout := &run.Checkout{Repository: "/repo", Dir: "/tmp/agister-checkout-1/workspace"}
	for id, unreleased := range map[string]*run.Checkout{"unreleased": checkout, "released": nil} {
		h, err := store.Create(ctx, run.Record{Schema: run.RecordSchema, ID: id, CreatedAt: now, Effects: &run.Effects{Checkout: checkout}})
		if err != nil {
			t.Fatal(err)
		}
		letGo(t, h)
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
	// It is told apart from a run that is owned, and comes with its record
	// as it finished.
	if _, finished, err := store.Adopt(ctx, "released"); !errors.Is(err, app.ErrRunFinished) || errors.Is(err, app.ErrRunOwned) || finished.FinishedAt == nil || finished.Result == nil || finished.Result.Status != run.Completed {
		t.Fatalf("adopting a finished run with only its Checkout on record = %+v, %v", finished, err)
	}
	adopted, record, err := store.Adopt(ctx, "unreleased")
	if err != nil || record.FinishedAt == nil || !reflect.DeepEqual(record.Effects.Unreleased, checkout) {
		t.Fatalf("adopt: %+v, %v", record, err)
	}
	letGo(t, adopted)
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
	store := newStore(t)
	ctx := context.Background()
	effects := func(dir string) *run.Effects {
		return &run.Effects{Checkout: &run.Checkout{Repository: "/repo", Dir: dir}}
	}
	live, err := store.Create(ctx, run.Record{Schema: run.RecordSchema, ID: "live", CreatedAt: time.Now(), Effects: effects("/tmp/agister-checkout-live/workspace")})
	if err != nil {
		t.Fatal(err)
	}
	letGo(t, live)
	_ = live.Append(run.Event{Kind: "E"})
	dead, err := store.Create(ctx, run.Record{Schema: run.RecordSchema, ID: "dead", CreatedAt: time.Now(), Effects: effects("/tmp/agister-checkout-dead/workspace")})
	if err != nil {
		t.Fatal(err)
	}
	letGo(t, dead)
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
	letGo(t, copying)
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
	store := newStore(t)
	ctx := context.Background()
	checkout := &run.Checkout{Repository: "/repo", Dir: "/tmp/agister-checkout-1/workspace-1"}
	h, err := store.Create(ctx, run.Record{Schema: run.RecordSchema, ID: "killed", Process: "p", CreatedAt: time.Now(), Effects: &run.Effects{Checkout: checkout}})
	if err != nil {
		t.Fatal(err)
	}
	letGo(t, h)
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
// Another Store over the same directory, given the same Appends, shares it.
//
// Contract test: the run store against the real filesystem, and the
// kernel's flock on a run's owner.lock.
func TestAppendedIsClosedAlreadyWhenALaterEventExists(t *testing.T) {
	t.Parallel()
	store := newStore(t)
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
	for _, reader := range []Store{store, {Dir: store.Dir, Appends: store.Appends}} {
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
	store := newStore(t)
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
	store := newStore(t)
	ctx := context.Background()
	record := run.Record{Schema: run.RecordSchema, ID: "r", Process: "p", CreatedAt: time.Now()}
	h, err := store.Create(ctx, record)
	if err != nil {
		t.Fatal(err)
	}
	letGo(t, h)
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
	store := newStore(t)
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
	store := newStore(t)
	ctx := context.Background()
	record := run.Record{Schema: run.RecordSchema, ID: "r", Process: "p", CreatedAt: time.Now()}
	dead, err := store.Create(ctx, record)
	if err != nil {
		t.Fatal(err)
	}
	letGo(t, dead)
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
	letGo(t, adopted)
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
	store := newStore(t)
	ctx := context.Background()
	record := run.Record{Schema: run.RecordSchema, ID: "r", Process: "p", CreatedAt: time.Now()}
	h, err := store.Create(ctx, record)
	if err != nil {
		t.Fatal(err)
	}
	letGo(t, h)
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
	letGo(t, adopted)
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
	store := newStore(t)
	ctx := context.Background()
	h, err := store.Create(ctx, run.Record{Schema: run.RecordSchema, ID: "r", Process: "p", CreatedAt: time.Now()})
	if err != nil {
		t.Fatal(err)
	}
	letGo(t, h)
	appended, ok := store.Appended(ctx, "r", 0)
	if !ok || closed(appended) {
		t.Fatalf("a running run: ok %v, closed %v", ok, ok && closed(appended))
	}
	// Another Store over the same directory, given the same Appends,
	// abandons it, as it shares the handles.
	if err := (Store{Dir: store.Dir, Appends: store.Appends}).Abandon("r"); err != nil {
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
	store := newStore(t)
	ctx := context.Background()
	record := run.Record{Schema: run.RecordSchema, ID: "done", Process: "p", CreatedAt: time.Now()}
	h, err := store.Create(ctx, record)
	if err != nil {
		t.Fatal(err)
	}
	letGo(t, h)
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

	twice, err := store.Create(ctx, run.Record{Schema: run.RecordSchema, ID: "twice", Process: "p", CreatedAt: time.Now()})
	if err != nil {
		t.Fatal(err)
	}
	letGo(t, twice)
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

// A Store signals only through the Appends it was given. One given none, or
// given another, still stores and reads the run, and follows it as a run
// another process runs: no notification while it runs, none to abandon.
//
// Contract test: the run store against the real filesystem, and the
// kernel's flock on a run's owner.lock.
func TestAStoreSignalsOnlyThroughItsOwnAppends(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	holder := newStore(t)
	record := run.Record{Schema: run.RecordSchema, ID: "held", Process: "p", CreatedAt: time.Now()}
	h, err := holder.Create(ctx, record)
	if err != nil {
		t.Fatal(err)
	}
	letGo(t, h)
	for name, other := range map[string]Store{"no appends": {Dir: holder.Dir}, "other appends": {Dir: holder.Dir, Appends: NewAppends()}} {
		if _, ok := other.Appended(ctx, "held", 0); ok {
			t.Fatalf("%s: a notification for a run its appends do not hold", name)
		}
		if err := other.Abandon("held"); err == nil {
			t.Fatalf("%s: abandoned a run its appends do not hold", name)
		}
	}
	if _, state, err := holder.Get(ctx, "held"); err != nil || state != run.StateRunning {
		t.Fatalf("the held run reads %s, %v", state, err)
	}

	// A Store given none holds its runs all the same.
	bare := Store{Dir: t.TempDir()}
	record.ID = "bare"
	owned, err := bare.Create(ctx, record)
	if err != nil {
		t.Fatal(err)
	}
	letGo(t, owned)
	if err := owned.Append(run.Event{Kind: "E"}); err != nil {
		t.Fatal(err)
	}
	if _, ok := bare.Appended(ctx, "bare", 0); ok {
		t.Fatal("a notification from a store with no appends")
	}
	if err := bare.Abandon("bare"); err == nil {
		t.Fatal("a store with no appends abandoned a run")
	}
	now := time.Now()
	record.FinishedAt = &now
	if err := owned.Finish(record); err != nil {
		t.Fatal(err)
	}
	events, state, err := bare.Events(ctx, "bare", 0)
	if err != nil || state != run.StateFinished || len(events) != 1 {
		t.Fatalf("the finished run = %+v, %s, %v", events, state, err)
	}
	if ended, ok := bare.Appended(ctx, "bare", 1); !ok || !closed(ended) {
		t.Fatalf("a finished run: ok %v, closed %v", ok, ok && closed(ended))
	}
}

// A handle lets go of its owner lock before it releases its signal, and
// another handle can take the run in between: a finished run with a clean
// copy on record, or an abandoned one, is adopted. Whoever waits on the
// first handle's signal is woken by the adoption, and the adopter's signal
// is not the first handle's to end: it goes on until the adopter finishes.
//
// Contract test: the run store against the real filesystem, and the
// kernel's flock on a run's owner.lock.
func TestARunAdoptedBeforeItsOwnerReleasesItsSignalKeepsItsOwn(t *testing.T) {
	t.Parallel()
	now := time.Now()
	for name, disown := range map[string]func(store Store, owner app.RunHandle, record run.Record) error{
		"finished": func(_ Store, owner app.RunHandle, record run.Record) error {
			record.FinishedAt = &now
			return owner.Finish(record)
		},
		"abandoned": func(store Store, _ app.RunHandle, record run.Record) error {
			return store.Abandon(record.ID)
		},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			store := newStore(t)
			ctx := context.Background()
			record := run.Record{Schema: run.RecordSchema, ID: "r", Process: "p", CreatedAt: now, Effects: &run.Effects{
				Copy: &run.Checkout{Repository: "/repo", Dir: "/tmp/agister-checkout-1/workspace"},
			}}
			owner, err := store.Create(ctx, record)
			if err != nil {
				t.Fatal(err)
			}
			letGo(t, owner)
			if err := owner.Append(run.Event{Kind: "E"}); err != nil {
				t.Fatal(err)
			}
			observed, ok := store.Appended(ctx, "r", 1)
			if !ok || closed(observed) {
				t.Fatalf("the owner's run: ok %v, closed %v", ok, ok && closed(observed))
			}

			// The owner has let go of its lock and not yet of its signal:
			// the run is adopted there.
			var adopted app.ReapHandle
			var adoptErr error
			store.Appends.unlocked = func(dir string) {
				store.Appends.unlocked = nil
				if dir != filepath.Join(store.Dir, "r") || closed(observed) {
					adoptErr = fmt.Errorf("unlocked %s, the owner's signal closed %v", dir, closed(observed))
					return
				}
				if adopted, _, adoptErr = store.Adopt(ctx, "r"); adoptErr == nil {
					letGo(t, adopted)
				}
			}
			if err := disown(store, owner, record); err != nil {
				t.Fatal(err)
			}
			if adopted == nil || adoptErr != nil {
				t.Fatalf("adopted between the owner's lock and its signal: %v, %v", adopted != nil, adoptErr)
			}

			if !closed(observed) {
				t.Fatal("whoever waited on the owner's signal was not woken")
			}
			following, ok := store.Appended(ctx, "r", 1)
			if !ok || closed(following) {
				t.Fatalf("the adopter's signal once the owner released its own: ok %v, closed %v", ok, ok && closed(following))
			}
			if err := adopted.Append(run.Event{Kind: "EFFECTS_REAPED"}); err != nil {
				t.Fatal(err)
			}
			if !closed(following) {
				t.Fatal("not closed once the adopter appended its event")
			}
			finishing, ok := store.Appended(ctx, "r", 2)
			if !ok || closed(finishing) {
				t.Fatalf("after the adopter's event: ok %v, closed %v", ok, ok && closed(finishing))
			}
			record.FinishedAt, record.Effects = &now, nil
			if err := adopted.Finish(record); err != nil {
				t.Fatal(err)
			}
			if _, state, _ := store.Get(ctx, "r"); state != run.StateFinished || !closed(finishing) {
				t.Fatalf("after the adopter's finish: %s, closed %v", state, closed(finishing))
			}
		})
	}
}

// A held read lists a run's evidence, artifacts among it, and not its
// owner lock; it opens each, and nothing outside the run, a neighbouring
// run's record there included, nor the lock.
//
// Contract test: the run store against the real filesystem, and the
// kernel's flock on a run's owner.lock.
func TestAHeldReadListsARunsEvidenceWithoutItsLock(t *testing.T) {
	t.Parallel()
	store := newStore(t)
	ctx := context.Background()
	at := time.Now()
	record := run.Record{Schema: run.RecordSchema, ID: "r1", Process: "p", CreatedAt: at}
	h, err := store.Create(ctx, record)
	if err != nil {
		t.Fatal(err)
	}
	letGo(t, h)
	if err := h.Append(run.Event{Kind: "E"}); err != nil {
		t.Fatal(err)
	}
	if err := h.Raw(`{"raw":true}`); err != nil {
		t.Fatal(err)
	}
	if _, err := h.Artifact("out.txt", []byte("bytes\n")); err != nil {
		t.Fatal(err)
	}
	record.FinishedAt = &at
	if err := h.Finish(record); err != nil {
		t.Fatal(err)
	}
	neighbour, err := store.Create(ctx, run.Record{Schema: run.RecordSchema, ID: "r2", Process: "p", CreatedAt: at})
	if err != nil {
		t.Fatal(err)
	}
	letGo(t, neighbour)
	if _, err := os.Stat(filepath.Join(store.Dir, "r2", "record.json")); err != nil {
		t.Fatalf("the neighbouring run's record: %v", err)
	}

	read, err := store.Hold(ctx, "r1")
	if err != nil {
		t.Fatal(err)
	}
	defer read.Release()
	if read.State() != run.StateFinished || read.Record().ID != "r1" || read.Record().FinishedAt == nil {
		t.Fatalf("held: %s, %+v", read.State(), read.Record())
	}
	files, err := read.Files()
	if want := []string{"artifacts/out.txt", "events.jsonl", "provider.jsonl", "record.json"}; err != nil || !reflect.DeepEqual(files, want) {
		t.Fatalf("files = %v, %v, want %v", files, err, want)
	}
	file, err := read.Open("artifacts/out.txt")
	if err != nil {
		t.Fatal(err)
	}
	data, err := io.ReadAll(file)
	file.Close()
	if err != nil || string(data) != "bytes\n" {
		t.Fatalf("artifact = %q, %v", data, err)
	}
	for _, path := range []string{"owner.lock", "../r2/record.json", "/etc/hosts"} {
		if file, err := read.Open(path); err == nil {
			file.Close()
			t.Errorf("opened %s", path)
		}
	}
	if err := holdErr(t, store, "absent"); !errors.Is(err, contract.ErrNotFound) {
		t.Fatalf("an absent run: %v", err)
	}
	if err := holdErr(t, store, "../r1"); err == nil {
		t.Fatal("held a path out of the store")
	}
}

// A held read keeps every writer out until it is released: a run's owner
// holds it alone, so a run running is not held; a process adopting a run
// to recover it takes it alone, so a held run is not adopted, and one
// being recovered is not held. Reads share a run, and a held run's state
// still reads as it is.
//
// Contract test: the run store against the real filesystem, and the
// kernel's flock on a run's owner.lock.
func TestAHeldReadKeepsWritersOut(t *testing.T) {
	t.Parallel()
	store := newStore(t)
	ctx := context.Background()
	effects := &run.Effects{Checkout: &run.Checkout{Repository: "/repo", Dir: "/tmp/agister-checkout-1/workspace"}}
	h, err := store.Create(ctx, run.Record{Schema: run.RecordSchema, ID: "r1", Process: "p", CreatedAt: time.Now(), Effects: effects})
	if err != nil {
		t.Fatal(err)
	}
	letGo(t, h)
	var owned *app.RunOwnedError
	if err := holdErr(t, store, "r1"); !errors.As(err, &owned) || owned.ID != "r1" || owned.Finished {
		t.Fatalf("a running run: %v", err)
	}

	// Its owner is killed: the run is abandoned, and is held.
	h.(*handle).lock.Close()
	read, err := store.Hold(ctx, "r1")
	if err != nil {
		t.Fatalf("an abandoned run: %v", err)
	}
	t.Cleanup(read.Release)
	if state := read.State(); state != run.StateAbandoned {
		t.Fatalf("an abandoned run is held as %s", state)
	}
	other, err := store.Hold(ctx, "r1")
	if err != nil {
		t.Fatalf("a second read: %v", err)
	}
	t.Cleanup(other.Release)
	other.Release()
	if _, state, _ := store.Get(ctx, "r1"); state != run.StateAbandoned {
		t.Fatalf("a held run reads %s", state)
	}
	if _, _, err := store.Adopt(ctx, "r1"); !errors.Is(err, app.ErrRunOwned) {
		t.Fatalf("adopting a held run = %v, want it owned", err)
	}
	read.Release()
	read.Release()

	adopted, record, err := store.Adopt(ctx, "r1")
	if err != nil {
		t.Fatalf("adopting a released run: %v", err)
	}
	letGo(t, adopted)
	if err := holdErr(t, store, "r1"); !errors.As(err, &owned) || owned.Finished {
		t.Fatalf("an abandoned run being recovered: %v", err)
	}
	now := time.Now()
	record.FinishedAt, record.Result = &now, &run.Result{Status: run.Lost}
	record.Effects = &run.Effects{Checkout: effects.Checkout, Unreleased: effects.Checkout}
	if err := adopted.Finish(record); err != nil {
		t.Fatal(err)
	}
	// Finished with its checkout unreleased, it is adopted again to remove
	// it.
	adopted, _, err = store.Adopt(ctx, "r1")
	if err != nil {
		t.Fatal(err)
	}
	letGo(t, adopted)
	if err := holdErr(t, store, "r1"); !errors.As(err, &owned) || !owned.Finished {
		t.Fatalf("a finished run being recovered: %v", err)
	}
}

// memoryFolders keeps the copies an export makes in memory. A stage calls
// created as it creates each file, before it writes it.
type memoryFolders struct {
	copies  map[string]map[string][]byte
	created func(path string)
}

func (f *memoryFolders) Folder(string) error { return nil }

func (f *memoryFolders) Copy(_, id string) ([]string, bool, error) {
	files, ok := f.copies[id]
	var paths []string
	for path := range files {
		paths = append(paths, path)
	}
	sort.Strings(paths)
	return paths, ok, nil
}

func (f *memoryFolders) OpenCopy(_, id, path string) (io.ReadCloser, error) {
	return memoryFile(f.copies[id], path)
}

func (f *memoryFolders) Stage(_, id string) (app.ExportStage, error) {
	return &memoryStage{folders: f, id: id, files: map[string]*bytes.Buffer{}}, nil
}

type memoryStage struct {
	folders *memoryFolders
	id      string
	files   map[string]*bytes.Buffer
}

func (s *memoryStage) Create(path string) (io.WriteCloser, error) {
	s.folders.created(path)
	s.files[path] = &bytes.Buffer{}
	return nopCloser{s.files[path]}, nil
}

func (s *memoryStage) Open(path string) (io.ReadCloser, error) {
	return memoryFile(s.written(), path)
}

func (s *memoryStage) Commit() error {
	s.folders.copies[s.id] = s.written()
	return nil
}

func (s *memoryStage) Discard() error { return nil }

func (s *memoryStage) written() map[string][]byte {
	files := map[string][]byte{}
	for path, data := range s.files {
		files[path] = data.Bytes()
	}
	return files
}

type nopCloser struct{ io.Writer }

func (nopCloser) Close() error { return nil }

func memoryFile(files map[string][]byte, path string) (io.ReadCloser, error) {
	data, ok := files[path]
	if !ok {
		return nil, fmt.Errorf("%s: %w", path, contract.ErrNotFound)
	}
	return io.NopCloser(bytes.NewReader(data)), nil
}

// An export holds the run it copies against recovery: a reap that comes
// while the export has copied the run's events and not yet its record
// does not adopt the run, so the copy is the run as it was, its record and
// events together. Once the export is done, the reap recovers the run.
// So for a finished run whose checkout was never released, and for an
// abandoned one.
//
// Contract test: the run store against the real filesystem, and the
// kernel's flock on a run's owner.lock.
func TestAnExportHoldsTheRunAgainstRecovery(t *testing.T) {
	t.Parallel()
	checkout := &run.Checkout{Repository: "/repo", Dir: "/tmp/agister-checkout-1/workspace-1"}
	for _, c := range []struct {
		name string
		// leave leaves the run as its owner did.
		leave func(t *testing.T, h app.RunHandle, record run.Record)
	}{
		{"unreleased", func(t *testing.T, h app.RunHandle, record run.Record) {
			now := time.Now()
			record.FinishedAt, record.Result = &now, &run.Result{Status: run.Completed}
			record.Effects = &run.Effects{Checkout: checkout, Unreleased: checkout}
			if err := h.Finish(record); err != nil {
				t.Fatal(err)
			}
		}},
		{"abandoned", func(t *testing.T, h app.RunHandle, _ run.Record) {
			h.(*handle).lock.Close()
		}},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			store := newStore(t)
			ctx := context.Background()
			record := run.Record{Schema: run.RecordSchema, ID: "r1", Process: "p", CreatedAt: time.Now(), Effects: &run.Effects{Checkout: checkout}}
			h, err := store.Create(ctx, record)
			if err != nil {
				t.Fatal(err)
			}
			letGo(t, h)
			if err := h.Append(run.Event{Kind: "E"}); err != nil {
				t.Fatal(err)
			}
			c.leave(t, h, record)
			before := map[string][]byte{}
			for _, name := range []string{"record.json", "events.jsonl"} {
				if before[name], err = os.ReadFile(filepath.Join(store.Dir, "r1", name)); err != nil {
					t.Fatal(err)
				}
			}

			var discarded []string
			spies := &reapSpies{discard: func(_ context.Context, dir string) error {
				discarded = append(discarded, dir)
				return nil
			}}
			reaper := app.NewReaper(store, spies, spies, spies)
			reaper.ReapContext = func(ctx context.Context) (context.Context, context.CancelFunc) { return context.WithCancel(ctx) }
			var reapErr error
			reaped := false
			folders := &memoryFolders{copies: map[string]map[string][]byte{}, created: func(path string) {
				if path == "record.json" {
					reaped, reapErr = true, reaper.Reap(ctx)
				}
			}}

			result, err := app.NewExporter(store, folders).Export(ctx, contract.ExportRequest{Runs: []string{"r1"}, To: "/audit"})
			if err != nil || len(result.Runs) != 1 || result.Runs[0].Action != contract.ExportCopied {
				t.Fatalf("export: %+v, %v", result, err)
			}
			if !reaped || reapErr != nil || len(discarded) != 0 {
				t.Fatalf("the reap during the export: reached %v, %v, discarded %v", reaped, reapErr, discarded)
			}
			for name, data := range before {
				if got := folders.copies["r1"][name]; !bytes.Equal(got, data) {
					t.Errorf("the copy's %s = %s, the run's was %s", name, got, data)
				}
			}

			if err := reaper.Reap(ctx); err != nil {
				t.Fatal(err)
			}
			events, _, err := store.Events(ctx, "r1", 0)
			if err != nil || len(discarded) != 1 || len(events) != 2 || events[1].Kind != "EFFECTS_REAPED" {
				t.Fatalf("the reap after the export: discarded %v, events %+v, %v", discarded, events, err)
			}
		})
	}
}
