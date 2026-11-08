package store

import (
	"errors"
	"os"
	"path/filepath"
	"reflect"
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
	if err := Save(path, state{Offset: 10}); err != nil {
		t.Fatal(err)
	}
	loaded, err = Load(path, func() state { return state{} })
	if err != nil || loaded.Offset != 10 {
		t.Fatal(loaded, err)
	}
	info, err = os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != 0o600 {
		t.Fatal(info.Mode())
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

type failingFile struct {
	file    *os.File
	stage   string
	failure error
	calls   *[]string
}

func (f *failingFile) Name() string { return f.file.Name() }
func (f *failingFile) Write(data []byte) (int, error) {
	*f.calls = append(*f.calls, "write:"+string(data))
	if f.stage == "write" {
		// Leave a partial candidate so cleanup must remove written data too.
		n, err := f.file.Write(data[:1])
		if err != nil {
			return n, err
		}
		return n, f.failure
	}
	return f.file.Write(data)
}
func (f *failingFile) Sync() error {
	*f.calls = append(*f.calls, "sync")
	if f.stage == "sync" {
		return f.failure
	}
	return f.file.Sync()
}
func (f *failingFile) Close() error {
	*f.calls = append(*f.calls, "close")
	err := f.file.Close()
	if err != nil {
		return err
	}
	if f.stage == "close" {
		return f.failure
	}
	return nil
}

// Contract test: failed candidate operations preserve the real committed file and remove the temporary file.
func TestCandidateFailuresPreserveCommittedStateAndCleanUp(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		stage string
		calls []string
	}{
		{"write", []string{"create", `write:{"offset":12}`, "close", "remove"}},
		{"sync", []string{"create", `write:{"offset":12}`, "sync", "close", "remove"}},
		{"close", []string{"create", `write:{"offset":12}`, "sync", "close", "remove"}},
	} {
		t.Run(tc.stage, func(t *testing.T) {
			t.Parallel()
			dir := t.TempDir()
			path := filepath.Join(dir, "state.json")
			if err := Save(path, state{Offset: 9}); err != nil {
				t.Fatal(err)
			}
			failure := errors.New(tc.stage + " failed")
			var calls []string
			var temporary string
			ops := fileOps{
				createTemp: func(gotDir, pattern string) (replacementFile, error) {
					calls = append(calls, "create")
					if gotDir != dir || pattern != ".state-*" {
						t.Fatalf("create %q %q", gotDir, pattern)
					}
					file, err := os.CreateTemp(gotDir, pattern)
					if err != nil {
						return nil, err
					}
					temporary = file.Name()
					t.Cleanup(func() { file.Close() })
					return &failingFile{file: file, stage: tc.stage, failure: failure, calls: &calls}, nil
				},
				rename: func(from, to string) error {
					calls = append(calls, "rename")
					return os.Rename(from, to)
				},
				remove: func(name string) error {
					calls = append(calls, "remove")
					if name != temporary {
						t.Fatalf("remove %q want %q", name, temporary)
					}
					return os.Remove(name)
				},
			}
			if err := save(path, state{Offset: 12}, ops); !errors.Is(err, failure) {
				t.Fatalf("error %v want %v", err, failure)
			}
			if !reflect.DeepEqual(calls, tc.calls) {
				t.Fatalf("calls %v want %v", calls, tc.calls)
			}
			data, err := os.ReadFile(path)
			if err != nil || string(data) != `{"offset":9}` {
				t.Fatalf("committed %s error %v", data, err)
			}
			if _, err := os.Stat(temporary); !errors.Is(err, os.ErrNotExist) {
				t.Fatalf("temporary %q remains: %v", temporary, err)
			}
			entries, err := os.ReadDir(dir)
			if err != nil || len(entries) != 1 || entries[0].Name() != "state.json" {
				t.Fatalf("directory %+v error %v", entries, err)
			}
		})
	}
}
