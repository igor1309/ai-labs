package fsprobes_test

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/adapters/fsprobes"
	"github.com/igor1309/ai-labs/agister/internal/app"
)

// A probe written is read back for its adapter and version, and for no
// other.
func TestAProbeIsReadBackForItsAdapterAndVersion(t *testing.T) {
	t.Parallel()
	store := fsprobes.Store{Dir: filepath.Join(t.TempDir(), "probes")}
	probe := app.RuntimeProbe{Version: "0.163.0", Primitives: []string{"read-only", "workspace-write"}, Report: "read-only: read file: ok", ProbedAt: time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC)}
	if err := store.Write("codex", probe); err != nil {
		t.Fatal(err)
	}
	got, found, err := store.Read("codex", "0.163.0")
	if err != nil || !found || !reflect.DeepEqual(got, probe) {
		t.Fatalf("read = %+v, %v, %v", got, found, err)
	}
	for _, other := range [][2]string{{"codex", "0.163.1"}, {"pi", "0.163.0"}} {
		if _, found, err := store.Read(other[0], other[1]); found || err != nil {
			t.Errorf("%s %s: found %v, %v", other[0], other[1], found, err)
		}
	}
	if _, err := os.Stat(filepath.Join(store.Dir, "codex", "0.163.0.json")); err != nil {
		t.Fatal(err)
	}
}

// A file that holds another version's probe, or a name that is not one
// file's, is an error, never a probe.
func TestAProbeIsReadOnlyFromItsOwnFile(t *testing.T) {
	t.Parallel()
	store := fsprobes.Store{Dir: t.TempDir()}
	if err := os.MkdirAll(filepath.Join(store.Dir, "codex"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(store.Dir, "codex", "0.163.0.json"), []byte(`{"version":"0.164.0","primitives":["read-only"]}`), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, found, err := store.Read("codex", "0.163.0"); found || err == nil {
		t.Fatalf("another version's probe: found %v, %v", found, err)
	}
	if _, _, err := store.Read("codex", "../x"); err == nil {
		t.Fatal("a version naming another folder was read")
	}
	if err := store.Write("..", app.RuntimeProbe{Version: "1.0.0"}); err == nil {
		t.Fatal("an adapter naming another folder was written")
	}
}
