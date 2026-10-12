package app_test

import (
	"context"
	"errors"
	"reflect"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/domain/document"
)

// failingSource answers from docs, except where told to fail. A call that
// fails is counted among the spy's reads as one that succeeds is.
type failingSource struct {
	*definitionsSpy
	listErr map[document.Kind]error
	readErr map[string]error // kind/name
}

func (s failingSource) List(ctx context.Context, kind document.Kind) ([]string, error) {
	if err := s.listErr[kind]; err != nil {
		s.record("list " + string(kind))
		return nil, err
	}
	return s.definitionsSpy.List(ctx, kind)
}

func (s failingSource) Read(ctx context.Context, kind document.Kind, name string) (document.Document, error) {
	if err := s.readErr[string(kind)+"/"+name]; err != nil {
		s.record(string(kind) + "/" + name)
		return document.Document{}, err
	}
	return s.definitionsSpy.Read(ctx, kind, name)
}

// ReadListed fails where Read does: the spy's layer, home, lists no
// folders.
func (s failingSource) ReadListed(ctx context.Context, kind document.Kind, name string) (document.Document, error) {
	return s.Read(ctx, kind, name)
}

// A snapshot returns again what the source answered, errors included, so a
// check against it reports what a check against the source reports; and it
// never reads the source again.
func TestSnapshotReplaysReadAndListErrors(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	spy := &definitionsSpy{docs: settingsDocs()}
	readFailure, listFailure := errors.New("cannot read process p"), errors.New("cannot list verifications")
	live := failingSource{
		definitionsSpy: spy,
		listErr:        map[document.Kind]error{document.KindVerify: listFailure},
		readErr:        map[string]error{"processes/p": readFailure, "service/service": errors.New("cannot read service")},
	}
	snap := app.Snapshot(ctx, live)
	reads := spy.readCount()

	if _, err := snap.Read(ctx, document.KindProcess, "p"); err != readFailure {
		t.Errorf("read error = %v", err)
	}
	if _, err := snap.Read(ctx, document.KindService, "service"); err == nil || err.Error() != "cannot read service" {
		t.Errorf("service read error = %v", err)
	}
	if _, err := snap.List(ctx, document.KindVerify); err != listFailure {
		t.Errorf("list error = %v", err)
	}
	if names, err := snap.List(ctx, document.KindAgent); err != nil || !reflect.DeepEqual(names, []string{"a"}) {
		t.Errorf("agents = %v, %v", names, err)
	}
	if _, err := snap.Read(ctx, document.KindAgent, "unlisted"); err == nil {
		t.Error("an unlisted document was found")
	}
	if got := spy.readCount(); got != reads {
		t.Errorf("reading the snapshot read the source %d more times", got-reads)
	}

	sources := []string{"git.revision", "git.diff", "param"}
	check := func(src app.SnapshotSource) []string {
		// The list failure aborts a check, so compare with verifications listable.
		runtimes := &runtimesSpy{runner: &runnerSpy{}}
		checker := app.NewChecker(src, &validatorSpy{}, runtimes, sources)
		report, err := checker.Check(ctx, false)
		if err != nil {
			return []string{"error: " + err.Error()}
		}
		return messages(report.Problems)
	}
	if got, want := check(snap), check(live); !reflect.DeepEqual(got, want) {
		t.Errorf("check on snapshot = %v, on source = %v", got, want)
	}
	delete(live.listErr, document.KindVerify)
	snap = app.Snapshot(ctx, live)
	if got, want := check(snap), check(live); len(got) == 0 || !reflect.DeepEqual(got, want) {
		t.Errorf("check on snapshot = %v, on source = %v", got, want)
	}
}

// Editing the source after the snapshot changes nothing in it.
func TestSnapshotIsImmutable(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	spy := &definitionsSpy{docs: settingsDocs()}
	snap := app.Snapshot(ctx, spy)
	spy.set(document.KindAgent, "a", "changed")
	spy.set(document.KindAgent, "b", "added")
	doc, err := snap.Read(ctx, document.KindAgent, "a")
	if err != nil || string(doc.Bytes) != settingsDocs()[document.KindAgent]["a"] {
		t.Fatalf("read = %q, %v", doc.Bytes, err)
	}
	doc.Bytes[0] = 'X'
	again, _ := snap.Read(ctx, document.KindAgent, "a")
	if again.Bytes[0] == 'X' {
		t.Error("a caller changed the snapshot through the bytes it was given")
	}
	if names, _ := snap.List(ctx, document.KindAgent); !reflect.DeepEqual(names, []string{"a"}) {
		t.Errorf("agents = %v", names)
	}
}
