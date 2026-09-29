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
		globalPath, _, _ := global.Write(ctx, kind, name, []byte("global"), false)
		projectPath, _, _ := project.Write(ctx, kind, name, []byte("project"), false)
		layered := fsdefs.Layered{Global: global, Project: &project}
		doc, err := layered.Read(ctx, kind, name)
		if err != nil || string(doc.Bytes) != "project" || doc.Source.Path != projectPath || !doc.Source.Project || doc.Source.Overrides != globalPath {
			t.Fatalf("%s = %+v, %v", kind, doc.Source, err)
		}
	}
	global.Write(ctx, definition.KindPolicy, "global_only", []byte("global"), false)
	project.Write(ctx, definition.KindPolicy, "project_only", []byte("project"), false)
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
