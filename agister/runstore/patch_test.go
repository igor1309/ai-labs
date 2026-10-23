package runstore_test

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/igor1309/ai-labs/agister/runstore"
)

// runstore.feature, "A call's patch is written whole under its run", "A
// patch is given back by its path", and the patch export example.
// Contract test: the file system.
func TestACallsPatchIsKeptAndExported(t *testing.T) {
	t.Parallel()
	s, runs := store(t)
	for _, patch := range []string{"p1", "p2\x00\xff", ""} {
		path, err := s.WritePatch("x", "a", []byte(patch))
		if err != nil {
			t.Fatal(err)
		}
		if path != "x/patches/a.patch" {
			t.Fatalf("path %q", path)
		}
		got, err := s.Patch(path)
		if err != nil || !bytes.Equal(got, []byte(patch)) {
			t.Fatalf("patch %q, error %v; want %q", got, err, patch)
		}
		entries, err := os.ReadDir(filepath.Join(runs, "x", "patches"))
		if err != nil || len(entries) != 1 || entries[0].Name() != "a.patch" {
			t.Fatalf("entries %v, error %v", entries, err)
		}
	}
	if _, err := s.WritePatch("x", "a", []byte("p2")); err != nil {
		t.Fatal(err)
	}
	if err := s.Write(lost("x")); err != nil {
		t.Fatal(err)
	}
	out := t.TempDir()
	if err := s.Export("x", out); err != nil {
		t.Fatal(err)
	}
	got, err := os.ReadFile(filepath.Join(out, "x", "patches", "a.patch"))
	if err != nil || string(got) != "p2" {
		t.Fatalf("exported patch %q, error %v", got, err)
	}
}

// An absent end_head remains distinguishable from an unreadable one.
// Contract test: the record's JSON format and the file system.
func TestEndHeadAndPatchAreKeptInTheRecord(t *testing.T) {
	t.Parallel()
	for _, head := range []*string{nil, pointerTo(""), pointerTo("c2")} {
		t.Run("head="+stringValue(head), func(t *testing.T) {
			t.Parallel()
			s, _ := store(t)
			record := lost("x")
			record.Calls = []runstore.Call{{Head: "c1", EndHead: head, Patch: pointerTo("x/patches/a.patch")}}
			if err := s.Write(record); err != nil {
				t.Fatal(err)
			}
			got, err := s.Record("x")
			if err != nil {
				t.Fatal(err)
			}
			call := got.Calls[0]
			if (call.EndHead == nil) != (head == nil) || stringValue(call.EndHead) != stringValue(head) || call.Patch == nil || *call.Patch != "x/patches/a.patch" {
				t.Fatalf("call %+v", call)
			}
			data, err := json.Marshal(call)
			if err != nil {
				t.Fatal(err)
			}
			if bytes.Contains(data, []byte(`"end_head"`)) != (head != nil) {
				t.Errorf("JSON %s", data)
			}
		})
	}
}

func pointerTo(s string) *string { return &s }
func stringValue(s *string) string {
	if s == nil {
		return "absent"
	}
	return *s
}

// A bad path cannot escape the store.
// Contract test: the file system.
func TestPatchPathsStayUnderTheStore(t *testing.T) {
	t.Parallel()
	s, _ := store(t)
	for _, bad := range []string{"", "..", "../outside", "/outside", "a/../../b", `a\b`} {
		if _, err := s.WritePatch("x", bad, []byte("bad")); err == nil {
			t.Errorf("step %q accepted", bad)
		}
	}
	for _, bad := range []string{"../outside", "/outside", ""} {
		if _, err := s.Patch(bad); err == nil {
			t.Errorf("path %q accepted", bad)
		}
	}
}

// Contract test: the file system, including nested patch export.
func TestEachRepeatPassKeepsItsOwnPatch(t *testing.T) {
	t.Parallel()
	s, _ := store(t)
	for _, step := range []string{"fix/1", "fix/2", "fix/2/1", "repair/unit/1"} {
		path, err := s.WritePatch("x", step, []byte(step))
		if err != nil || path != "x/patches/"+step+".patch" {
			t.Fatalf("path %s, error %v", path, err)
		}
		patch, err := s.Patch(path)
		if err != nil || string(patch) != step {
			t.Fatalf("patch %q, error %v", patch, err)
		}
	}
	if err := s.Write(lost("x")); err != nil {
		t.Fatal(err)
	}
	out := t.TempDir()
	if err := s.Export("x", out); err != nil {
		t.Fatal(err)
	}
	for _, step := range []string{"fix/1", "fix/2", "fix/2/1", "repair/unit/1"} {
		patch, err := os.ReadFile(filepath.Join(out, "x", "patches", step+".patch"))
		if err != nil || string(patch) != step {
			t.Errorf("exported %s: %q, error %v", step, patch, err)
		}
	}
	for _, step := range []string{"fix/../1", "fix/1/", "fix/1/../../outside", "fix//1"} {
		if _, err := s.WritePatch("x", step, []byte("bad")); err == nil {
			t.Errorf("accepted %q", step)
		}
	}
}
