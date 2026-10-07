package inputs_test

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/adapters/inputs"
	"github.com/igor1309/ai-labs/agister/internal/app"
)

func TestParam(t *testing.T) {
	t.Parallel()
	resolved, err := inputs.Param{}.Resolve(context.Background(), app.InputSpec{Args: map[string]string{"name": "q"}, Params: map[string]string{"q": "why?"}})
	if err != nil || resolved.Value != "why?" || resolved.Identity != "why?" {
		t.Fatalf("%+v %v", resolved, err)
	}
	if _, err := (inputs.Param{}).Resolve(context.Background(), app.InputSpec{Args: map[string]string{"name": "x"}}); err == nil {
		t.Fatal("missing param accepted")
	}
}

// Contract test: the file source against the real filesystem.
func TestFileIsReadRelativeToTheCallerAndDigested(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "doc.md"), []byte("hello"), 0o600)
	resolved, err := inputs.File{}.Resolve(context.Background(), app.InputSpec{Args: map[string]string{"path": "doc.md"}, Cwd: dir})
	want := "sha256:2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
	if err != nil || resolved.Value != "hello" || resolved.Identity != want {
		t.Fatalf("%+v %v", resolved, err)
	}
	if _, err := (inputs.File{}).Resolve(context.Background(), app.InputSpec{Args: map[string]string{"path": "missing"}, Cwd: dir}); err == nil {
		t.Fatal("missing file accepted")
	}
}

// Contract test: whether a file a brief refers to exists, against the real
// filesystem; a folder exists too, and a path that cannot be looked up is an
// error, not an absence.
func TestFileSaysWhetherAPathExists(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "goal.md"), []byte("goal"), 0o600); err != nil {
		t.Fatal(err)
	}
	for path, want := range map[string]bool{filepath.Join(dir, "goal.md"): true, dir: true, filepath.Join(dir, "missing.md"): false} {
		if found, err := (inputs.File{}).Exists(context.Background(), path); err != nil || found != want {
			t.Fatalf("%s: %t, %v, want %t", path, found, err, want)
		}
	}
	if _, err := (inputs.File{}).Exists(context.Background(), filepath.Join(dir, "goal.md", "below")); err == nil {
		t.Fatal("a path below a file was looked up without error")
	}
}
