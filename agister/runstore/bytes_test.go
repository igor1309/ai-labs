package runstore_test

import (
	"bytes"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"testing"
)

// runstore.feature, "A definition's bytes are written whole by their
// digest", and the definition export example.
// Contract test: the file system.
func TestDefinitionBytesAreKeptAndExported(t *testing.T) {
	t.Parallel()
	s, runs := store(t)
	for _, data := range [][]byte{[]byte("b1"), []byte("b1"), {0, 255, '\n'}, {}} {
		if err := s.WriteDefinition("x", "d1", data); err != nil {
			t.Fatal(err)
		}
		got, err := os.ReadFile(filepath.Join(runs, "x", "definitions", "d1"))
		if err != nil || !bytes.Equal(got, data) {
			t.Fatalf("bytes %q, error %v; want %q", got, err, data)
		}
		entries, err := os.ReadDir(filepath.Join(runs, "x", "definitions"))
		if err != nil || len(entries) != 1 || entries[0].Name() != "d1" {
			t.Fatalf("entries %v, error %v", entries, err)
		}
	}
	if err := s.Write(lost("x")); err != nil {
		t.Fatal(err)
	}
	for _, digest := range []string{"d1", "d2"} {
		if err := s.WriteDefinition("x", digest, []byte(digest+"\x00\xff")); err != nil {
			t.Fatal(err)
		}
	}
	out := t.TempDir()
	for range 2 {
		if err := s.Export("x", out); err != nil {
			t.Fatal(err)
		}
		for _, digest := range []string{"d1", "d2"} {
			got, err := os.ReadFile(filepath.Join(out, "x", "definitions", digest))
			if err != nil || string(got) != digest+"\x00\xff" {
				t.Fatalf("exported %s: %q, error %v", digest, got, err)
			}
		}
	}
}

// Definition digests and run ids must name a file and a run of their own.
// Contract test: the file system.
func TestDefinitionPathsStayUnderTheRun(t *testing.T) {
	t.Parallel()
	s, runs := store(t)
	for _, bad := range []string{"", ".", "..", "../outside", "/outside", "a/b", `a\b`} {
		if err := s.WriteDefinition("x", bad, []byte("bad")); err == nil {
			t.Errorf("digest %q accepted", bad)
		}
		if err := s.WriteDefinition(bad, "d1", []byte("bad")); err == nil {
			t.Errorf("run %q accepted", bad)
		}
	}
	if _, err := os.Stat(runs); !errors.Is(err, fs.ErrNotExist) {
		t.Fatalf("runs folder error %v; want no folder created", err)
	}
}

// A definition write reports the underlying failure.
// Contract test: the file system.
func TestDefinitionWriteFailure(t *testing.T) {
	t.Parallel()
	s, runs := store(t)
	if err := s.Write(lost("x")); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(runs, "x", "definitions"), []byte("not a directory"), 0o600); err != nil {
		t.Fatal(err)
	}
	var pathError *fs.PathError
	if err := s.WriteDefinition("x", "d1", []byte("bytes")); !errors.As(err, &pathError) {
		t.Fatalf("error %v; want file system error", err)
	}
}
