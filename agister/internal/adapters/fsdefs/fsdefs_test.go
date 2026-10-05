package fsdefs_test

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/adapters/fsdefs"
	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
)

// Contract test: the settings store against the real filesystem.
func TestWriteReadList(t *testing.T) {
	t.Parallel()
	store := fsdefs.Store{Dir: t.TempDir()}
	ctx := context.Background()

	path, created, err := store.Write(ctx, definition.KindProcess, "p", []byte("one"), "")
	if err != nil || !created || path != filepath.Join(store.Dir, "processes", "p.yaml") {
		t.Fatalf("write = %s %v %v", path, created, err)
	}
	if _, created, _ := store.Write(ctx, definition.KindProcess, "p", []byte("two"), ""); created {
		t.Fatal("overwrote without permission")
	}
	doc, err := store.Read(ctx, definition.KindProcess, "p")
	sum := sha256.Sum256([]byte("one"))
	if err != nil || string(doc.Bytes) != "one" || doc.Source.SHA256 != hex.EncodeToString(sum[:]) || doc.Source.Path != path {
		t.Fatalf("read = %+v, %v", doc, err)
	}
	if _, created, _ := store.Write(ctx, definition.KindProcess, "p", []byte("two"), doc.Source.SHA256); !created {
		t.Fatal("overwrite refused")
	}

	store.Write(ctx, definition.KindService, "service", []byte("s"), "")
	if _, err := os.Stat(filepath.Join(store.Dir, "service.toml")); err != nil {
		t.Fatal(err)
	}
	os.WriteFile(filepath.Join(store.Dir, "processes", "notes.txt"), nil, 0o600)
	store.Write(ctx, definition.KindProcess, "a", []byte("x"), "")
	if names, _ := store.List(ctx, definition.KindProcess); !reflect.DeepEqual(names, []string{"a", "p"}) {
		t.Fatalf("list = %v", names)
	}
	if names, err := store.List(ctx, definition.KindPolicy); err != nil || names != nil {
		t.Fatalf("empty kind = %v, %v", names, err)
	}
}

// A replacement writes only over the document it expects: one edited or
// removed since is left as it is, and nothing is left beside it.
//
// Contract test: the settings store against the real filesystem.
func TestWriteReplacesOnlyTheExpectedDocument(t *testing.T) {
	t.Parallel()
	store := fsdefs.Store{Dir: t.TempDir()}
	ctx := context.Background()
	path, _, _ := store.Write(ctx, definition.KindAgent, "a", []byte("one"), "")
	_, planned, _ := store.Current(ctx, definition.KindAgent, "a")
	os.WriteFile(path, []byte("edited"), 0o600)
	if _, written, err := store.Write(ctx, definition.KindAgent, "a", []byte("two"), planned); written || err != nil {
		t.Fatalf("wrote over an edit: %v", err)
	}
	if data, _ := os.ReadFile(path); string(data) != "edited" {
		t.Fatalf("content = %q", data)
	}
	_, current, _ := store.Current(ctx, definition.KindAgent, "a")
	if _, written, err := store.Write(ctx, definition.KindAgent, "a", []byte("two"), current); !written || err != nil {
		t.Fatalf("replacement refused: %v", err)
	}
	if data, _ := os.ReadFile(path); string(data) != "two" {
		t.Fatalf("content = %q", data)
	}
	if entries, _ := os.ReadDir(filepath.Dir(path)); len(entries) != 1 {
		t.Fatalf("left beside it: %v", entries)
	}
	os.Remove(path)
	if _, written, err := store.Write(ctx, definition.KindAgent, "a", []byte("three"), current); written || err != nil {
		t.Fatalf("recreated a removed document: %v", err)
	}
	if _, err := os.Stat(path); err == nil {
		t.Fatal("a removed document was recreated")
	}
}

// Contract test: the settings store against the real filesystem.
func TestRejectsUnsafeNamesAndReportsMissing(t *testing.T) {
	t.Parallel()
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
//
// Contract test: the settings store against the real filesystem.
func TestLayeredProjectTakesPriority(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	global, project := fsdefs.Store{Dir: t.TempDir()}, fsdefs.Store{Dir: t.TempDir()}
	for _, kind := range []definition.Kind{definition.KindService, definition.KindAgent, definition.KindProcess, definition.KindPolicy, definition.KindRuntime, definition.KindSchema} {
		name := "shared"
		if kind == definition.KindService {
			name = "service"
		}
		globalPath, _, _ := global.Write(ctx, kind, name, []byte("global"), "")
		projectPath, _, _ := project.Write(ctx, kind, name, []byte("project"), "")
		layered := fsdefs.Layered{Global: global, Project: &project}
		doc, err := layered.Read(ctx, kind, name)
		if err != nil || string(doc.Bytes) != "project" || doc.Source.Path != projectPath || !doc.Source.Project || doc.Source.Overrides != globalPath {
			t.Fatalf("%s = %+v, %v", kind, doc.Source, err)
		}
	}
	global.Write(ctx, definition.KindPolicy, "global_only", []byte("global"), "")
	project.Write(ctx, definition.KindPolicy, "project_only", []byte("project"), "")
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
	if _, err := outside.Read(ctx, definition.KindPolicy, "missing"); err == nil || strings.Contains(err.Error(), " or ") {
		t.Fatalf("missing without project = %v", err)
	}

	// A repository without settings of its own: a document found nowhere
	// names where the repository would hold it too.
	absent := filepath.Join(t.TempDir(), ".agister")
	unset := fsdefs.Layered{Global: global, Absent: absent}
	if doc, err := unset.Read(ctx, definition.KindPolicy, "shared"); err != nil || string(doc.Bytes) != "global" || doc.Source.Project {
		t.Fatalf("with an absent project = %+v, %v", doc, err)
	}
	want := "not found (expected " + filepath.Join(absent, "policies", "missing.yaml") + " or " + filepath.Join(global.Dir, "policies", "missing.yaml") + ")"
	if _, err := unset.Read(ctx, definition.KindPolicy, "missing"); err == nil || err.Error() != want {
		t.Fatalf("missing with an absent project = %v, want %q", err, want)
	}
}

// A prompt is prompts/<name>.md, its bytes unchanged (ADR-014); one in
// neither layer names both places it was expected.
//
// Contract test: the settings store against the real filesystem.
func TestPromptsAreMarkdownFiles(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	global, project := fsdefs.Store{Dir: t.TempDir()}, fsdefs.Store{Dir: t.TempDir()}
	text := "# Review\n\nRead the diff.\n"
	path, _, err := global.Write(ctx, definition.KindPrompt, "review", []byte(text), "")
	if err != nil || path != filepath.Join(global.Dir, "prompts", "review.md") {
		t.Fatalf("write = %q, %v", path, err)
	}
	// Another extension in the folder is not a prompt, nor is a file whose
	// name breaks the naming rule, which source: file may still read.
	for _, other := range []string{"notes.txt", "Style Guide.md"} {
		if err := os.WriteFile(filepath.Join(global.Dir, "prompts", other), []byte("x"), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	layered := fsdefs.Layered{Global: global, Project: &project}
	if names, err := layered.List(ctx, definition.KindPrompt); err != nil || !reflect.DeepEqual(names, []string{"review"}) {
		t.Fatalf("list = %v, %v", names, err)
	}
	if doc, err := layered.Read(ctx, definition.KindPrompt, "review"); err != nil || string(doc.Bytes) != text || doc.Source.Path != path || doc.Source.Project {
		t.Fatalf("read = %+v, %v", doc.Source, err)
	}
	want := "not found (expected " + filepath.Join(project.Dir, "prompts", "style.md") + " or " + filepath.Join(global.Dir, "prompts", "style.md") + ")"
	if _, err := layered.Read(ctx, definition.KindPrompt, "style"); err == nil || err.Error() != want {
		t.Fatalf("missing = %v, want %q", err, want)
	}
}

// A repository's prompts folder, or a prompt's file in it, that is a
// dangling symlink is not a prompt neither layer has (ADR-019 rule 1,
// D-11): reading the prompt fails, naming the link, and is not ErrNotFound;
// a folder that is such a link cannot be listed. A folder or file that
// simply does not exist stays not found.
//
// Contract test: the settings store against the real filesystem.
func TestADanglingPromptLinkIsNotAbsent(t *testing.T) {
	t.Parallel()
	for name, c := range map[string]struct {
		plant  func(folder string) (link string, err error)
		listed bool
	}{
		"folder": {plant: func(folder string) (string, error) {
			return folder, os.Symlink(filepath.Join(filepath.Dir(folder), "nowhere"), folder)
		}, listed: false},
		"file": {plant: func(folder string) (string, error) {
			link := filepath.Join(folder, "review.md")
			if err := os.MkdirAll(folder, 0o700); err != nil {
				return link, err
			}
			return link, os.Symlink(filepath.Join(folder, "nowhere.md"), link)
		}, listed: true},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			ctx := context.Background()
			global, project := fsdefs.Store{Dir: t.TempDir()}, fsdefs.Store{Dir: t.TempDir()}
			link, err := c.plant(filepath.Join(project.Dir, "prompts"))
			if err != nil {
				t.Fatal(err)
			}
			layered := fsdefs.Layered{Global: global, Project: &project}
			names, err := layered.List(ctx, definition.KindPrompt)
			if c.listed && (err != nil || !reflect.DeepEqual(names, []string{"review"})) || !c.listed && (err == nil || !strings.Contains(err.Error(), link)) {
				t.Fatalf("listed = %v, %v", names, err)
			}
			doc, err := layered.Read(ctx, definition.KindPrompt, "review")
			if err == nil || errors.Is(err, definition.ErrNotFound) || !strings.Contains(err.Error(), "cannot be resolved") || !doc.Source.Project {
				t.Fatalf("read = %+v, %v", doc.Source, err)
			}
		})
	}
	t.Run("missing", func(t *testing.T) {
		t.Parallel()
		ctx := context.Background()
		global, project := fsdefs.Store{Dir: t.TempDir()}, fsdefs.Store{Dir: t.TempDir()}
		layered := fsdefs.Layered{Global: global, Project: &project}
		for _, state := range []string{"no folder", "an empty folder"} {
			if names, err := layered.List(ctx, definition.KindPrompt); err != nil || len(names) != 0 {
				t.Fatalf("%s: listed = %v, %v", state, names, err)
			}
			if _, err := layered.Read(ctx, definition.KindPrompt, "review"); !errors.Is(err, definition.ErrNotFound) {
				t.Fatalf("%s: read = %v", state, err)
			}
			if err := os.MkdirAll(filepath.Join(project.Dir, "prompts"), 0o700); err != nil {
				t.Fatal(err)
			}
		}
	})
}

// held reports whether another descriptor cannot take the store's write lock
// right now, without waiting.
func held(t *testing.T, dir string) bool {
	t.Helper()
	file, err := os.OpenFile(filepath.Join(dir, fsdefs.LockName), os.O_RDWR, 0)
	if err != nil {
		t.Fatalf("lock file: %v", err)
	}
	defer file.Close()
	err = syscall.Flock(int(file.Fd()), syscall.LOCK_EX|syscall.LOCK_NB)
	if err == nil {
		return false
	}
	if err != syscall.EWOULDBLOCK {
		t.Fatalf("probe: %v", err)
	}
	return true
}

// The lock is held while the digest is compared, while the replacement is
// renamed over the document, and while a new document is created.
//
// Contract test: the settings store against the real filesystem.
func TestWriteHoldsTheLockAtEachStep(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	dir := t.TempDir()
	seen := map[string]bool{}
	store := fsdefs.Store{Dir: dir}.Observing(func(point string) { seen[point] = held(t, dir) })

	if _, written, err := store.Write(ctx, definition.KindProcess, "p", []byte("one"), ""); err != nil || !written {
		t.Fatalf("create: %v %v", written, err)
	}
	sum := sha256.Sum256([]byte("one"))
	if _, written, err := store.Write(ctx, definition.KindProcess, "p", []byte("two"), hex.EncodeToString(sum[:])); err != nil || !written {
		t.Fatalf("replace: %v %v", written, err)
	}
	for _, point := range []string{"create", "compare", "rename"} {
		if held, ok := seen[point]; !ok || !held {
			t.Errorf("lock not held at %s (reached %v)", point, ok)
		}
	}
	if held(t, dir) {
		t.Error("lock still held after Write returned")
	}
}

// Contract test: the settings store against the real filesystem.
func TestLockFileIsNeverListed(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	store := fsdefs.Store{Dir: t.TempDir()}
	for _, kind := range []definition.Kind{definition.KindProcess, definition.KindAgent, definition.KindPolicy, definition.KindRuntime, definition.KindSchema} {
		if _, _, err := store.Write(ctx, kind, "x", []byte("x"), ""); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := os.Stat(filepath.Join(store.Dir, fsdefs.LockName)); err != nil {
		t.Fatalf("lock file: %v", err)
	}
	for _, kind := range []definition.Kind{definition.KindAgent, definition.KindProcess, definition.KindPolicy, definition.KindRuntime, definition.KindSchema, definition.KindService} {
		names, err := store.List(ctx, kind)
		if err != nil || (kind != definition.KindService && !reflect.DeepEqual(names, []string{"x"})) || (kind == definition.KindService && len(names) != 0) {
			t.Errorf("%s: %v %v", kind, names, err)
		}
	}
}

// A sanity check only; the lock tests above are what pin the lock down.
//
// Contract test: the settings store against the real filesystem.
func TestConcurrentWritesWithOneDigestLandOnce(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	store := fsdefs.Store{Dir: t.TempDir()}
	if _, _, err := store.Write(ctx, definition.KindProcess, "p", []byte("zero"), ""); err != nil {
		t.Fatal(err)
	}
	sum := sha256.Sum256([]byte("zero"))
	expected := hex.EncodeToString(sum[:])
	const writers = 8
	var wins atomic.Int32
	var wg sync.WaitGroup
	for i := 0; i < writers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, written, err := store.Write(ctx, definition.KindProcess, "p", []byte(fmt.Sprintf("writer %d", i)), expected)
			if err != nil {
				t.Error(err)
			}
			if written {
				wins.Add(1)
			}
		}()
	}
	wg.Wait()
	if wins.Load() != 1 {
		t.Fatalf("%d writes landed, want 1", wins.Load())
	}
}

// The workspace settings are one optional document, workspace.yaml: listed
// only when it exists, and a project's takes priority over the global one.
//
// Contract test: the settings store against the real filesystem.
func TestWorkspaceSettingsAreAnOptionalSingleton(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	global, project := fsdefs.Store{Dir: t.TempDir()}, fsdefs.Store{Dir: t.TempDir()}
	layered := fsdefs.Layered{Global: global, Project: &project}
	if names, err := layered.List(ctx, definition.KindWorkspace); err != nil || len(names) != 0 {
		t.Fatalf("none = %v, %v", names, err)
	}

	globalPath, _, err := global.Write(ctx, definition.KindWorkspace, "workspace", []byte("global"), "")
	if err != nil || globalPath != filepath.Join(global.Dir, "workspace.yaml") {
		t.Fatalf("written at %s, %v", globalPath, err)
	}
	if names, err := layered.List(ctx, definition.KindWorkspace); err != nil || !reflect.DeepEqual(names, []string{"workspace"}) {
		t.Fatalf("global = %v, %v", names, err)
	}
	if doc, err := layered.Read(ctx, definition.KindWorkspace, "workspace"); err != nil || string(doc.Bytes) != "global" || doc.Source.Project {
		t.Fatalf("global = %+v, %v", doc.Source, err)
	}

	projectPath, _, _ := project.Write(ctx, definition.KindWorkspace, "workspace", []byte("project"), "")
	if names, err := layered.List(ctx, definition.KindWorkspace); err != nil || !reflect.DeepEqual(names, []string{"workspace"}) {
		t.Fatalf("both = %v, %v", names, err)
	}
	doc, err := layered.Read(ctx, definition.KindWorkspace, "workspace")
	if err != nil || string(doc.Bytes) != "project" || doc.Source.Path != projectPath || !doc.Source.Project || doc.Source.Overrides != globalPath {
		t.Fatalf("project = %+v, %v", doc.Source, err)
	}
}

// A repository's blocks are one optional document, blocks.yaml, and only
// the project's are the repository's (ADR-018 rule 1): home's is read as
// home's where the project has none, so check can report it, and never
// over the project's.
//
// Contract test: the settings store against the real filesystem.
func TestBlocksAreTheProjectsOwn(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	global, project := fsdefs.Store{Dir: t.TempDir()}, fsdefs.Store{Dir: t.TempDir()}
	layered := fsdefs.Layered{Global: global, Project: &project}
	if names, err := layered.List(ctx, definition.KindBlocks); err != nil || len(names) != 0 {
		t.Fatalf("none = %v, %v", names, err)
	}

	globalPath, _, err := global.Write(ctx, definition.KindBlocks, "blocks", []byte("home"), "")
	if err != nil || globalPath != filepath.Join(global.Dir, "blocks.yaml") {
		t.Fatalf("written at %s, %v", globalPath, err)
	}
	if names, err := layered.List(ctx, definition.KindBlocks); err != nil || !reflect.DeepEqual(names, []string{"blocks"}) {
		t.Fatalf("home's = %v, %v", names, err)
	}
	for name, source := range map[string]fsdefs.Layered{"in a project": layered, "home alone": {Global: global}} {
		if doc, err := source.Read(ctx, definition.KindBlocks, "blocks"); err != nil || string(doc.Bytes) != "home" || doc.Source.Project || doc.Source.Path != globalPath {
			t.Fatalf("%s: home's = %+v, %v", name, doc.Source, err)
		}
	}

	projectPath, _, _ := project.Write(ctx, definition.KindBlocks, "blocks", []byte("project"), "")
	if names, err := layered.List(ctx, definition.KindBlocks); err != nil || !reflect.DeepEqual(names, []string{"blocks"}) {
		t.Fatalf("both = %v, %v", names, err)
	}
	doc, err := layered.Read(ctx, definition.KindBlocks, "blocks")
	if err != nil || string(doc.Bytes) != "project" || doc.Source.Path != projectPath || projectPath != filepath.Join(project.Dir, "blocks.yaml") ||
		!doc.Source.Project || doc.Source.Overrides != globalPath {
		t.Fatalf("project's = %+v, %v", doc.Source, err)
	}
}

// A repository's blocks.yaml that exists but is a directory, a dangling
// symlink or a symlink loop is not absent (ADR-018 rule 5): it is listed,
// and reading it fails, naming its path, with no fallback to home's.
//
// Contract test: the settings store against the real filesystem.
func TestBlocksThatCannotBeReadAreNotAbsent(t *testing.T) {
	t.Parallel()
	for name, plant := range map[string]func(path string) error{
		"directory":        func(path string) error { return os.Mkdir(path, 0o700) },
		"dangling symlink": func(path string) error { return os.Symlink(filepath.Join(filepath.Dir(path), "nowhere.yaml"), path) },
		"symlink loop":     func(path string) error { return os.Symlink(path, path) },
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			ctx := context.Background()
			global, project := fsdefs.Store{Dir: t.TempDir()}, fsdefs.Store{Dir: t.TempDir()}
			if _, _, err := global.Write(ctx, definition.KindBlocks, "blocks", []byte("home"), ""); err != nil {
				t.Fatal(err)
			}
			path := filepath.Join(project.Dir, "blocks.yaml")
			if err := plant(path); err != nil {
				t.Fatal(err)
			}
			if names, err := project.List(ctx, definition.KindBlocks); err != nil || !reflect.DeepEqual(names, []string{"blocks"}) {
				t.Fatalf("listed = %v, %v", names, err)
			}
			layered := fsdefs.Layered{Global: global, Project: &project}
			if names, err := layered.List(ctx, definition.KindBlocks); err != nil || !reflect.DeepEqual(names, []string{"blocks"}) {
				t.Fatalf("layered listed = %v, %v", names, err)
			}
			doc, err := layered.Read(ctx, definition.KindBlocks, "blocks")
			if err == nil || !strings.Contains(err.Error(), path) || strings.Contains(err.Error(), "not found") ||
				!doc.Source.Project || doc.Source.Path != path || len(doc.Bytes) != 0 {
				t.Fatalf("read = %+v %q, %v", doc.Source, doc.Bytes, err)
			}
		})
	}
}
