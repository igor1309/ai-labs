package runtimetest_test

import (
	"os"
	"os/exec"
	"path/filepath"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/runtimetest"
)

func TestBuildOwnsItsCache(t *testing.T) {
	dir := t.TempDir()
	cache := filepath.Join(dir, "unusable-host-cache")
	if err := os.WriteFile(cache, []byte("not a directory"), 0600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("GOCACHE", cache)
	if err := os.WriteFile(filepath.Join(dir, "main.go"), []byte("package main\nfunc main() { println(\"fixture ran\") }\n"), 0600); err != nil {
		t.Fatal(err)
	}
	binary := filepath.Join(dir, "fixture")
	runtimetest.Build(t, dir, binary, "main.go")
	if out, err := exec.Command(binary).CombinedOutput(); err != nil || string(out) != "fixture ran\n" {
		t.Fatalf("fixture: %v, %q", err, out)
	}
	if data, err := os.ReadFile(cache); err != nil || string(data) != "not a directory" {
		t.Fatalf("host cache changed: %v, %q", err, data)
	}
}
