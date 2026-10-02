package fsdefs_test

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/adapters/fsdefs"
	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
)

func TestWriteReadList(t *testing.T) {
	store := fsdefs.Store{Dir: t.TempDir()}
	ctx := context.Background()

	path, created, err := store.Write(ctx, definition.KindProcess, "p", []byte("one"), "")
	if err != nil || !created || path != filepath.Join(store.Dir, "processes", "p.yaml") {
		t.Fatalf("write = %s %v %v", path, created, err)
	}
	if _, created, _ := store.Write(ctx, definition.KindProcess, "p", []byte("two"), ""); created {
		t.Fatal("overwrote without permission")
	}
	doc, err := store.Read(ctx, definition.KindProcess, "p")
	sum := sha256.Sum256([]byte("one"))
	if err != nil || string(doc.Bytes) != "one" || doc.Source.SHA256 != hex.EncodeToString(sum[:]) || doc.Source.Path != path {
		t.Fatalf("read = %+v, %v", doc, err)
	}
	if _, created, _ := store.Write(ctx, definition.KindProcess, "p", []byte("two"), doc.Source.SHA256); !created {
		t.Fatal("overwrite refused")
	}

	store.Write(ctx, definition.KindService, "service", []byte("s"), "")
	if _, err := os.Stat(filepath.Join(store.Dir, "service.toml")); err != nil {
		t.Fatal(err)
	}
	os.WriteFile(filepath.Join(store.Dir, "processes", "notes.txt"), nil, 0o600)
	store.Write(ctx, definition.KindProcess, "a", []byte("x"), "")
	if names, _ := store.List(ctx, definition.KindProcess); !reflect.DeepEqual(names, []string{"a", "p"}) {
		t.Fatalf("list = %v", names)
	}
	if names, err := store.List(ctx, definition.KindPolicy); err != nil || names != nil {
		t.Fatalf("empty kind = %v, %v", names, err)
	}
}

// A replacement writes only over the document it expects: one edited or
// removed since is left as it is, and nothing is left beside it.
func TestWriteReplacesOnlyTheExpectedDocument(t *testing.T) {
	store := fsdefs.Store{Dir: t.TempDir()}
	ctx := context.Background()
	path, _, _ := store.Write(ctx, definition.KindAgent, "a", []byte("one"), "")
	_, planned, _ := store.Current(ctx, definition.KindAgent, "a")
	os.WriteFile(path, []byte("edited"), 0o600)
	if _, written, err := store.Write(ctx, definition.KindAgent, "a", []byte("two"), planned); written || err != nil {
		t.Fatalf("wrote over an edit: %v", err)
	}
	if data, _ := os.ReadFile(path); string(data) != "edited" {
		t.Fatalf("content = %q", data)
	}
	_, current, _ := store.Current(ctx, definition.KindAgent, "a")
	if _, written, err := store.Write(ctx, definition.KindAgent, "a", []byte("two"), current); !written || err != nil {
		t.Fatalf("replacement refused: %v", err)
	}
	if data, _ := os.ReadFile(path); string(data) != "two" {
		t.Fatalf("content = %q", data)
	}
	if entries, _ := os.ReadDir(filepath.Dir(path)); len(entries) != 1 {
		t.Fatalf("left beside it: %v", entries)
	}
	os.Remove(path)
	if _, written, err := store.Write(ctx, definition.KindAgent, "a", []byte("three"), current); written || err != nil {
		t.Fatalf("recreated a removed document: %v", err)
	}
	if _, err := os.Stat(path); err == nil {
		t.Fatal("a removed document was recreated")
	}
}

func TestRejectsUnsafeNamesAndReportsMissing(t *testing.T) {
	store := fsdefs.Store{Dir: t.TempDir()}
	if _, err := store.Read(context.Background(), definition.KindAgent, "../escape"); err == nil {
		t.Fatal("path traversal accepted")
	}
	if _, err := store.Read(context.Background(), definition.KindAgent, "missing"); err == nil || !strings.Contains(err.Error(), "not found") {
		t.Fatalf("err = %v", err)
	}
}

// A project document takes priority over the global one of the same kind
// and name, whatever the kind, and says which one it overrides.
func TestLayeredProjectTakesPriority(t *testing.T) {
	ctx := context.Background()
	global, project := fsdefs.Store{Dir: t.TempDir()}, fsdefs.Store{Dir: t.TempDir()}
	for _, kind := range []definition.Kind{definition.KindService, definition.KindAgent, definition.KindProcess, definition.KindPolicy, definition.KindRuntime, definition.KindSchema} {
		name := "shared"
		if kind == definition.KindService {
			name = "service"
		}
		globalPath, _, _ := global.Write(ctx, kind, name, []byte("global"), "")
		projectPath, _, _ := project.Write(ctx, kind, name, []byte("project"), "")
		layered := fsdefs.Layered{Global: global, Project: &project}
		doc, err := layered.Read(ctx, kind, name)
		if err != nil || string(doc.Bytes) != "project" || doc.Source.Path != projectPath || !doc.Source.Project || doc.Source.Overrides != globalPath {
			t.Fatalf("%s = %+v, %v", kind, doc.Source, err)
		}
	}
	global.Write(ctx, definition.KindPolicy, "global_only", []byte("global"), "")
	project.Write(ctx, definition.KindPolicy, "project_only", []byte("project"), "")
	layered := fsdefs.Layered{Global: global, Project: &project}

	if doc, err := layered.Read(ctx, definition.KindPolicy, "global_only"); err != nil || string(doc.Bytes) != "global" || doc.Source.Project || doc.Source.Overrides != "" {
		t.Fatalf("global_only = %+v, %v", doc.Source, err)
	}
	if doc, err := layered.Read(ctx, definition.KindPolicy, "project_only"); err != nil || string(doc.Bytes) != "project" || !doc.Source.Project || doc.Source.Overrides != "" {
		t.Fatalf("project_only = %+v, %v", doc.Source, err)
	}
	if names, err := layered.List(ctx, definition.KindPolicy); err != nil || !reflect.DeepEqual(names, []string{"global_only", "project_only", "shared"}) {
		t.Fatalf("list = %v, %v", names, err)
	}
	_, err := layered.Read(ctx, definition.KindPolicy, "missing")
	if err == nil || !strings.Contains(err.Error(), "not found") || !strings.Contains(err.Error(), project.Dir) || !strings.Contains(err.Error(), global.Dir) {
		t.Fatalf("missing = %v", err)
	}
	if _, err := layered.Read(ctx, definition.KindAgent, "../escape"); err == nil {
		t.Fatal("path traversal accepted")
	}
	outside := fsdefs.Layered{Global: global}
	if doc, err := outside.Read(ctx, definition.KindPolicy, "shared"); err != nil || string(doc.Bytes) != "global" {
		t.Fatalf("without project = %+v, %v", doc, err)
	}
}

// held reports whether another descriptor cannot take the store's write lock
// right now, without waiting.
func held(t *testing.T, dir string) bool {
	t.Helper()
	file, err := os.OpenFile(filepath.Join(dir, fsdefs.LockName), os.O_RDWR, 0)
	if err != nil {
		t.Fatalf("lock file: %v", err)
	}
	defer file.Close()
	err = syscall.Flock(int(file.Fd()), syscall.LOCK_EX|syscall.LOCK_NB)
	if err == nil {
		return false
	}
	if err != syscall.EWOULDBLOCK {
		t.Fatalf("probe: %v", err)
	}
	return true
}

// The lock is held while the digest is compared, while the replacement is
// renamed over the document, and while a new document is created.
func TestWriteHoldsTheLockAtEachStep(t *testing.T) {
	ctx := context.Background()
	dir := t.TempDir()
	seen := map[string]bool{}
	store := fsdefs.Store{Dir: dir}.Observing(func(point string) { seen[point] = held(t, dir) })

	if _, written, err := store.Write(ctx, definition.KindProcess, "p", []byte("one"), ""); err != nil || !written {
		t.Fatalf("create: %v %v", written, err)
	}
	sum := sha256.Sum256([]byte("one"))
	if _, written, err := store.Write(ctx, definition.KindProcess, "p", []byte("two"), hex.EncodeToString(sum[:])); err != nil || !written {
		t.Fatalf("replace: %v %v", written, err)
	}
	for _, point := range []string{"create", "compare", "rename"} {
		if held, ok := seen[point]; !ok || !held {
			t.Errorf("lock not held at %s (reached %v)", point, ok)
		}
	}
	if held(t, dir) {
		t.Error("lock still held after Write returned")
	}
}

func TestLockFileIsNeverListed(t *testing.T) {
	ctx := context.Background()
	store := fsdefs.Store{Dir: t.TempDir()}
	for _, kind := range []definition.Kind{definition.KindProcess, definition.KindAgent, definition.KindPolicy, definition.KindRuntime, definition.KindSchema} {
		if _, _, err := store.Write(ctx, kind, "x", []byte("x"), ""); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := os.Stat(filepath.Join(store.Dir, fsdefs.LockName)); err != nil {
		t.Fatalf("lock file: %v", err)
	}
	for _, kind := range []definition.Kind{definition.KindAgent, definition.KindProcess, definition.KindPolicy, definition.KindRuntime, definition.KindSchema, definition.KindService} {
		names, err := store.List(ctx, kind)
		if err != nil || (kind != definition.KindService && !reflect.DeepEqual(names, []string{"x"})) || (kind == definition.KindService && len(names) != 0) {
			t.Errorf("%s: %v %v", kind, names, err)
		}
	}
}

// A sanity check only; the lock tests above are what pin the lock down.
func TestConcurrentWritesWithOneDigestLandOnce(t *testing.T) {
	ctx := context.Background()
	store := fsdefs.Store{Dir: t.TempDir()}
	if _, _, err := store.Write(ctx, definition.KindProcess, "p", []byte("zero"), ""); err != nil {
		t.Fatal(err)
	}
	sum := sha256.Sum256([]byte("zero"))
	expected := hex.EncodeToString(sum[:])
	const writers = 8
	var wins atomic.Int32
	var wg sync.WaitGroup
	for i := 0; i < writers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, written, err := store.Write(ctx, definition.KindProcess, "p", []byte(fmt.Sprintf("writer %d", i)), expected)
			if err != nil {
				t.Error(err)
			}
			if written {
				wins.Add(1)
			}
		}()
	}
	wg.Wait()
	if wins.Load() != 1 {
		t.Fatalf("%d writes landed, want 1", wins.Load())
	}
}

// The workspace settings are one optional document, workspace.yaml: listed
// only when it exists, and a project's takes priority over the global one.
func TestWorkspaceSettingsAreAnOptionalSingleton(t *testing.T) {
	ctx := context.Background()
	global, project := fsdefs.Store{Dir: t.TempDir()}, fsdefs.Store{Dir: t.TempDir()}
	layered := fsdefs.Layered{Global: global, Project: &project}
	if names, err := layered.List(ctx, definition.KindWorkspace); err != nil || len(names) != 0 {
		t.Fatalf("none = %v, %v", names, err)
	}

	globalPath, _, err := global.Write(ctx, definition.KindWorkspace, "workspace", []byte("global"), "")
	if err != nil || globalPath != filepath.Join(global.Dir, "workspace.yaml") {
		t.Fatalf("written at %s, %v", globalPath, err)
	}
	if names, err := layered.List(ctx, definition.KindWorkspace); err != nil || !reflect.DeepEqual(names, []string{"workspace"}) {
		t.Fatalf("global = %v, %v", names, err)
	}
	if doc, err := layered.Read(ctx, definition.KindWorkspace, "workspace"); err != nil || string(doc.Bytes) != "global" || doc.Source.Project {
		t.Fatalf("global = %+v, %v", doc.Source, err)
	}

	projectPath, _, _ := project.Write(ctx, definition.KindWorkspace, "workspace", []byte("project"), "")
	if names, err := layered.List(ctx, definition.KindWorkspace); err != nil || !reflect.DeepEqual(names, []string{"workspace"}) {
		t.Fatalf("both = %v, %v", names, err)
	}
	doc, err := layered.Read(ctx, definition.KindWorkspace, "workspace")
	if err != nil || string(doc.Bytes) != "project" || doc.Source.Path != projectPath || !doc.Source.Project || doc.Source.Overrides != globalPath {
		t.Fatalf("project = %+v, %v", doc.Source, err)
	}
}
