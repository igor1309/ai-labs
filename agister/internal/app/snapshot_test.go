package app_test

import (
	"context"
	"errors"
	"reflect"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
)

// failingSource answers from docs, except where told to fail. A call that
// fails is counted among the spy's reads as one that succeeds is.
type failingSource struct {
	*definitionsSpy
	listErr map[definition.Kind]error
	readErr map[string]error // kind/name
}

func (s failingSource) List(ctx context.Context, kind definition.Kind) ([]string, error) {
	if err := s.listErr[kind]; err != nil {
		s.record("list " + string(kind))
		return nil, err
	}
	return s.definitionsSpy.List(ctx, kind)
}

func (s failingSource) Read(ctx context.Context, kind definition.Kind, name string) (definition.Document, error) {
	if err := s.readErr[string(kind)+"/"+name]; err != nil {
		s.record(string(kind) + "/" + name)
		return definition.Document{}, err
	}
	return s.definitionsSpy.Read(ctx, kind, name)
}

// A snapshot returns again what the source answered, errors included, so a
// check against it reports what a check against the source reports; and it
// never reads the source again.
func TestSnapshotReplaysReadAndListErrors(t *testing.T) {
	ctx := context.Background()
	spy := &definitionsSpy{docs: settingsDocs()}
	readFailure, listFailure := errors.New("cannot read process p"), errors.New("cannot list policies")
	live := failingSource{
		definitionsSpy: spy,
		listErr:        map[definition.Kind]error{definition.KindPolicy: listFailure},
		readErr:        map[string]error{"processes/p": readFailure, "service/service": errors.New("cannot read service")},
	}
	snap := app.Snapshot(ctx, live)
	reads := spy.readCount()

	if _, err := snap.Read(ctx, definition.KindProcess, "p"); err != readFailure {
		t.Errorf("read error = %v", err)
	}
	if _, err := snap.Read(ctx, definition.KindService, "service"); err == nil || err.Error() != "cannot read service" {
		t.Errorf("service read error = %v", err)
	}
	if _, err := snap.List(ctx, definition.KindPolicy); err != listFailure {
		t.Errorf("list error = %v", err)
	}
	if names, err := snap.List(ctx, definition.KindAgent); err != nil || !reflect.DeepEqual(names, []string{"a"}) {
		t.Errorf("agents = %v, %v", names, err)
	}
	if _, err := snap.Read(ctx, definition.KindAgent, "unlisted"); err == nil {
		t.Error("an unlisted document was found")
	}
	if got := spy.readCount(); got != reads {
		t.Errorf("reading the snapshot read the source %d more times", got-reads)
	}

	sources := []string{"git.revision", "git.diff", "param"}
	check := func(src app.SnapshotSource) []string {
		// The list failure aborts a check, so compare with policies listable.
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
	delete(live.listErr, definition.KindPolicy)
	snap = app.Snapshot(ctx, live)
	if got, want := check(snap), check(live); len(got) == 0 || !reflect.DeepEqual(got, want) {
		t.Errorf("check on snapshot = %v, on source = %v", got, want)
	}
}

// Editing the source after the snapshot changes nothing in it.
func TestSnapshotIsImmutable(t *testing.T) {
	ctx := context.Background()
	spy := &definitionsSpy{docs: settingsDocs()}
	snap := app.Snapshot(ctx, spy)
	spy.set(definition.KindAgent, "a", "changed")
	spy.set(definition.KindAgent, "b", "added")
	doc, err := snap.Read(ctx, definition.KindAgent, "a")
	if err != nil || string(doc.Bytes) != settingsDocs()[definition.KindAgent]["a"] {
		t.Fatalf("read = %q, %v", doc.Bytes, err)
	}
	doc.Bytes[0] = 'X'
	again, _ := snap.Read(ctx, definition.KindAgent, "a")
	if again.Bytes[0] == 'X' {
		t.Error("a caller changed the snapshot through the bytes it was given")
	}
	if names, _ := snap.List(ctx, definition.KindAgent); !reflect.DeepEqual(names, []string{"a"}) {
		t.Errorf("agents = %v", names)
	}
}
