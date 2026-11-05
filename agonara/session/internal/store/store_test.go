package store

import (
	"os"
	"path/filepath"
	"testing"
)

type state struct {
	Offset int `json:"offset"`
}

func TestMissingFileGivesEmptyStateAndSaveRestores(t *testing.T) {
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
