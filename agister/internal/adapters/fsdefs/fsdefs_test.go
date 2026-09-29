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

	path, created, err := store.Write(ctx, definition.KindProcess, "p", []byte("one"), false)
	if err != nil || !created || path != filepath.Join(store.Dir, "processes", "p.yaml") {
		t.Fatalf("write = %s %v %v", path, created, err)
	}
	if _, created, _ := store.Write(ctx, definition.KindProcess, "p", []byte("two"), false); created {
		t.Fatal("overwrote without permission")
	}
	doc, err := store.Read(ctx, definition.KindProcess, "p")
	sum := sha256.Sum256([]byte("one"))
	if err != nil || string(doc.Bytes) != "one" || doc.Source.SHA256 != hex.EncodeToString(sum[:]) || doc.Source.Path != path {
		t.Fatalf("read = %+v, %v", doc, err)
	}
	if _, created, _ := store.Write(ctx, definition.KindProcess, "p", []byte("two"), true); !created {
		t.Fatal("overwrite refused")
	}

	store.Write(ctx, definition.KindService, "service", []byte("s"), false)
	if _, err := os.Stat(filepath.Join(store.Dir, "service.toml")); err != nil {
		t.Fatal(err)
	}
	os.WriteFile(filepath.Join(store.Dir, "processes", "notes.txt"), nil, 0o600)
	store.Write(ctx, definition.KindProcess, "a", []byte("x"), false)
	if names, _ := store.List(ctx, definition.KindProcess); !reflect.DeepEqual(names, []string{"a", "p"}) {
		t.Fatalf("list = %v", names)
	}
	if names, err := store.List(ctx, definition.KindPolicy); err != nil || names != nil {
		t.Fatalf("empty kind = %v, %v", names, err)
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

func TestLayeredProjectReplacesGlobalByName(t *testing.T) {
	ctx := context.Background()
	global, project := fsdefs.Store{Dir: t.TempDir()}, fsdefs.Store{Dir: t.TempDir()}
	global.Write(ctx, definition.KindProcess, "shared", []byte("global"), false)
	global.Write(ctx, definition.KindProcess, "global_only", []byte("global"), false)
	project.Write(ctx, definition.KindProcess, "shared", []byte("project"), false)
	project.Write(ctx, definition.KindProcess, "project_only", []byte("project"), false)
	layered := fsdefs.Layered{Global: global, Project: &project}

	for name, want := range map[string]string{"shared": "project", "global_only": "global", "project_only": "project"} {
		doc, err := layered.Read(ctx, definition.KindProcess, name)
		if err != nil || string(doc.Bytes) != want || !strings.HasPrefix(doc.Source.Path, map[string]string{"global": global.Dir, "project": project.Dir}[want]) {
			t.Fatalf("%s = %+v, %v", name, doc, err)
		}
	}
	if names, err := layered.List(ctx, definition.KindProcess); err != nil || !reflect.DeepEqual(names, []string{"global_only", "project_only", "shared"}) {
		t.Fatalf("list = %v, %v", names, err)
	}
	_, err := layered.Read(ctx, definition.KindProcess, "missing")
	if err == nil || !strings.Contains(err.Error(), "not found") || !strings.Contains(err.Error(), project.Dir) || !strings.Contains(err.Error(), global.Dir) {
		t.Fatalf("missing = %v", err)
	}
	if _, err := layered.Read(ctx, definition.KindAgent, "../escape"); err == nil {
		t.Fatal("path traversal accepted")
	}
	outside := fsdefs.Layered{Global: global}
	if doc, err := outside.Read(ctx, definition.KindProcess, "shared"); err != nil || string(doc.Bytes) != "global" {
		t.Fatalf("without project = %+v, %v", doc, err)
	}
}

// A repository may not widen the limits and grants that bound its own
// policies, so its service and runtime mappings are refused, not ignored.
func TestLayeredRefusesProjectServiceAndRuntimes(t *testing.T) {
	ctx := context.Background()
	global, project := fsdefs.Store{Dir: t.TempDir()}, fsdefs.Store{Dir: t.TempDir()}
	for _, kind := range []definition.Kind{definition.KindService, definition.KindRuntime} {
		global.Write(ctx, kind, "service", []byte("global"), false)
		project.Write(ctx, kind, "service", []byte("project"), false)
	}
	project.Write(ctx, definition.KindRuntime, "project_only", []byte("project"), false)
	layered := fsdefs.Layered{Global: global, Project: &project}

	for _, read := range []struct {
		kind definition.Kind
		name string
	}{{definition.KindService, "service"}, {definition.KindRuntime, "service"}, {definition.KindRuntime, "project_only"}} {
		_, err := layered.Read(ctx, read.kind, read.name)
		if err == nil || !strings.Contains(err.Error(), "only global settings") {
			t.Fatalf("%s %s = %v", read.kind, read.name, err)
		}
	}
	if names, _ := layered.List(ctx, definition.KindRuntime); !reflect.DeepEqual(names, []string{"project_only", "service"}) {
		t.Fatalf("list = %v (a refused project runtime must stay visible to check)", names)
	}
}
