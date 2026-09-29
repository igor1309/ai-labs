package fsdefs_test

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"os"
	"path/filepath"
	"reflect"
	"strings"
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
