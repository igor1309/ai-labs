package store

import (
	"os"
	"path/filepath"
	"testing"
)

type state struct {
	Offset int `json:"offset"`
}

// Contract test: private JSON files survive an atomic save and reload.
func TestMissingFileGivesEmptyStateAndSaveRestores(t *testing.T) {
	t.Parallel()
	path := filepath.Join(t.TempDir(), "nested", "state.json")
	loaded, err := Load(path, func() state { return state{Offset: -1} })
	if err != nil || loaded.Offset != -1 {
		t.Fatal(loaded, err)
	}
	if err := Save(path, state{Offset: 9}); err != nil {
		t.Fatal(err)
	}
	info, _ := os.Stat(path)
	if info.Mode().Perm() != 0o600 {
		t.Fatal(info.Mode())
	}
	loaded, err = Load(path, func() state { return state{} })
	if err != nil || loaded.Offset != 9 {
		t.Fatal(loaded, err)
	}
}

// Contract test: corrupt JSON and failed atomic filesystem replacement preserve existing data.
func TestCorruptionAndFailedSaveLeaveExistingBytesIntact(t *testing.T) {
	t.Parallel()
	path := filepath.Join(t.TempDir(), "state.json")
	if err := os.WriteFile(path, []byte("{"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := Load(path, func() state { return state{} }); err == nil {
		t.Fatal("corruption accepted")
	}
	if err := Save(path, make(chan int)); err == nil {
		t.Fatal("unencodable state accepted")
	}
	data, _ := os.ReadFile(path)
	if string(data) != "{" {
		t.Fatalf("failed save changed bytes: %s", data)
	}
	target := filepath.Join(t.TempDir(), "directory")
	if err := os.Mkdir(target, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := Save(target, state{Offset: 1}); err == nil {
		t.Fatal("directory replaced")
	}
	entries, err := os.ReadDir(filepath.Dir(target))
	if err != nil || len(entries) != 1 || entries[0].Name() != "directory" {
		t.Fatalf("temporary file leaked: %+v %v", entries, err)
	}
}
