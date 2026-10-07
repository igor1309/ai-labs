package fscache_test

import (
	"crypto/sha256"
	"encoding/hex"
	"os"
	"path/filepath"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/adapters/fscache"
)

func digest(text string) string {
	sum := sha256.Sum256([]byte(text))
	return hex.EncodeToString(sum[:])
}

// A copy is written to <cache>/<digest>/<name>, once: a second keep of the
// same bytes leaves the file it wrote as it is, and other bytes under the
// same name go to a folder of their own.
func TestACopyIsWrittenOnceUnderItsDigest(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	store := fscache.Store{Dir: dir}
	path, err := store.Keep(digest("the brief"), "brief.md", []byte("the brief"))
	if err != nil {
		t.Fatal(err)
	}
	if want := filepath.Join(dir, digest("the brief"), "brief.md"); path != want {
		t.Fatalf("path = %s, want %s", path, want)
	}
	if data, err := os.ReadFile(path); err != nil || string(data) != "the brief" {
		t.Fatalf("copy = %q, %v", data, err)
	}
	first, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}

	again, err := store.Keep(digest("the brief"), "brief.md", []byte("the brief"))
	if err != nil || again != path {
		t.Fatalf("again = %s, %v", again, err)
	}
	second, err := os.Stat(path)
	if err != nil || !os.SameFile(first, second) {
		t.Fatalf("the copy was written again: %v", err)
	}

	other, err := store.Keep(digest("another brief"), "brief.md", []byte("another brief"))
	if err != nil || other != filepath.Join(dir, digest("another brief"), "brief.md") {
		t.Fatalf("other = %s, %v", other, err)
	}
	for file, want := range map[string]string{path: "the brief", other: "another brief"} {
		if data, _ := os.ReadFile(file); string(data) != want {
			t.Fatalf("%s holds %q, want %q", file, data, want)
		}
	}
	entries, _ := os.ReadDir(filepath.Join(dir, digest("the brief")))
	if len(entries) != 1 {
		t.Fatalf("the copy's folder holds %d files", len(entries))
	}
}

// A file under a digest's folder that holds other bytes is replaced by
// the bytes the digest names.
func TestACopyThatHoldsOtherBytesIsReplaced(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	path := filepath.Join(dir, digest("the brief"), "brief.md")
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("changed by hand"), 0o600); err != nil {
		t.Fatal(err)
	}
	if kept, err := (fscache.Store{Dir: dir}).Keep(digest("the brief"), "brief.md", []byte("the brief")); err != nil || kept != path {
		t.Fatalf("kept = %s, %v", kept, err)
	}
	if data, _ := os.ReadFile(path); string(data) != "the brief" {
		t.Fatalf("copy = %q", data)
	}
}

// Keep refuses bytes that are not the digest's, a name that is not one
// file's, and a cache it cannot write, and writes nothing for them.
func TestKeepRefusesWhatItCannotKeep(t *testing.T) {
	t.Parallel()
	blocked := filepath.Join(t.TempDir(), "cache")
	if err := os.WriteFile(blocked, []byte("not a folder"), 0o600); err != nil {
		t.Fatal(err)
	}
	for name, keep := range map[string]struct {
		dir, digest, name string
	}{
		"other bytes":    {t.TempDir(), digest("other"), "brief.md"},
		"a path":         {t.TempDir(), digest("the brief"), "../brief.md"},
		"the parent":     {t.TempDir(), digest("the brief"), ".."},
		"no name":        {t.TempDir(), digest("the brief"), ""},
		"not a folder":   {blocked, digest("the brief"), "brief.md"},
		"a short digest": {t.TempDir(), "abc", "brief.md"},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			if path, err := (fscache.Store{Dir: keep.dir}).Keep(keep.digest, keep.name, []byte("the brief")); err == nil {
				t.Fatalf("kept as %s", path)
			}
			if entries, _ := os.ReadDir(keep.dir); len(entries) != 0 {
				t.Fatalf("%s holds %d entries", keep.dir, len(entries))
			}
		})
	}
}
