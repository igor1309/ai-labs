package fsdefs_test

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/adapters/fsdefs"
	"github.com/igor1309/ai-labs/agister/internal/contract"
	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
)

func put(t *testing.T, path, text string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(text), 0o600); err != nil {
		t.Fatal(err)
	}
}

// dangle makes path a symbolic link to nothing: a file listed that cannot
// be read.
func dangle(t *testing.T, path string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(filepath.Join(filepath.Dir(path), "nowhere"), path); err != nil {
		t.Fatal(err)
	}
}

// A source folder's settings documents are what the store lists; every
// other file is named, and a folder that is not a kind's is not read. Its
// blocks.yaml is named and not read: home has no blocks (ADR-018 rule 6).
//
// Contract test: the settings store against the real filesystem.
func TestSourceReadsSettingsAndNamesTheRest(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	for _, name := range []string{
		"service.toml", "workspace.yaml", "blocks.yaml", "agents/a.toml", "prompts/p.md", "verifies/repo.yaml",
		"notes.txt", ".DS_Store", "agents/a.yaml", "agents/old/b.toml", "agents/Bad.toml", "prompts/Not A Name.md", "runs/r1/record.json",
	} {
		put(t, filepath.Join(dir, name), name)
	}
	// The folder may be reached through a link.
	link := filepath.Join(t.TempDir(), "settings")
	if err := os.Symlink(dir, link); err != nil {
		t.Fatal(err)
	}
	docs, ignored, err := fsdefs.Store{Dir: t.TempDir()}.Source(context.Background(), link)
	if err != nil {
		t.Fatal(err)
	}
	var read []string
	for _, doc := range docs {
		read = append(read, string(doc.Source.Kind)+"/"+doc.Source.Name+"="+string(doc.Bytes))
		if !strings.HasPrefix(doc.Source.Path, link+string(filepath.Separator)) {
			t.Errorf("path %s not in the folder as named", doc.Source.Path)
		}
	}
	wantRead := []string{"agents/a=agents/a.toml", "prompts/p=prompts/p.md", "service/service=service.toml", "verifies/repo=verifies/repo.yaml", "workspace/workspace=workspace.yaml"}
	if !reflect.DeepEqual(read, wantRead) {
		t.Fatalf("read %v", read)
	}
	wantIgnored := []string{".DS_Store", "agents/Bad.toml", "agents/a.yaml", "agents/old/", "blocks.yaml", "notes.txt", "prompts/Not A Name.md", "runs/"}
	if !reflect.DeepEqual(ignored, wantIgnored) {
		t.Fatalf("ignored %v", ignored)
	}
}

// A symbolic link in the folder refuses it, wherever it points.
//
// Contract test: the settings store against the real filesystem.
func TestSourceRefusesASymbolicLink(t *testing.T) {
	t.Parallel()
	for _, name := range []string{"agents/a.toml", "agents", "notes", "skills/review", "skills/style/SKILL.md"} {
		dir := t.TempDir()
		put(t, filepath.Join(dir, "service.toml"), "s")
		target := filepath.Join(t.TempDir(), "target")
		put(t, filepath.Join(target, "x"), "x")
		os.MkdirAll(filepath.Dir(filepath.Join(dir, name)), 0o700)
		if err := os.Symlink(target, filepath.Join(dir, name)); err != nil {
			t.Fatal(err)
		}
		var input *contract.InputError
		if _, _, err := (fsdefs.Store{Dir: t.TempDir()}).Source(context.Background(), dir); !errors.As(err, &input) || !strings.Contains(err.Error(), "is a symbolic link") {
			t.Errorf("%s: %v", name, err)
		}
	}
	var input *contract.InputError
	if _, _, err := (fsdefs.Store{Dir: t.TempDir()}).Source(context.Background(), filepath.Join(t.TempDir(), "none")); !errors.As(err, &input) {
		t.Errorf("missing folder: %v", err)
	}
}

// A store's documents are what List names, but for a file whose name
// breaks the naming rule, which is no document and is not read. One that
// cannot be read is named as unreadable, not read.
//
// Contract test: the settings store against the real filesystem.
func TestDocumentsSkipsInvalidNames(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	for _, name := range []string{"service.toml", "agents/a.toml", "agents/Bad.toml", "verifies/Not A Name.yaml"} {
		put(t, filepath.Join(dir, name), name)
	}
	dangle(t, filepath.Join(dir, "prompts", "x.md"))
	docs, unreadable, err := fsdefs.Store{Dir: dir}.Documents(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	var read []string
	for _, doc := range docs {
		read = append(read, string(doc.Source.Kind)+"/"+doc.Source.Name)
	}
	if !reflect.DeepEqual(read, []string{"agents/a", "service/service"}) {
		t.Fatalf("read %v", read)
	}
	want := []definition.Source{{Kind: definition.KindPrompt, Name: "x", Path: filepath.Join(dir, "prompts", "x.md")}}
	if !reflect.DeepEqual(unreadable, want) {
		t.Fatalf("unreadable %+v", unreadable)
	}
}

// A stage is read as the store it stages: paths, and where a document not
// found was expected, are the store's, and what the store lists that the
// stage lacks is listed and read from the store. Its removal removes it.
//
// Contract test: the settings store against the real filesystem.
func TestStageReadsAsTheStore(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	home := fsdefs.Store{Dir: t.TempDir()}.StagingIn(root)
	ctx := context.Background()
	put(t, filepath.Join(home.Dir, "agents", "Bad Name.toml"), "x")
	dangle(t, filepath.Join(home.Dir, "prompts", "x.md"))
	before := tree(t, home.Dir)
	staged, remove, err := home.Stage(ctx, []definition.Document{{Source: definition.Source{Kind: definition.KindAgent, Name: "a"}, Bytes: []byte("x")}})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(remove)
	if entries, _ := os.ReadDir(root); len(entries) != 1 {
		t.Fatalf("stages %v, want one", entries)
	}
	doc, err := staged.Read(ctx, definition.KindAgent, "a")
	if err != nil || doc.Source.Path != filepath.Join(home.Dir, "agents", "a.toml") || string(doc.Bytes) != "x" {
		t.Fatalf("read %+v, %v", doc, err)
	}
	if _, err := staged.Read(ctx, definition.KindAgent, "b"); err == nil || !strings.Contains(err.Error(), filepath.Join(home.Dir, "agents", "b.toml")) {
		t.Fatalf("missing: %v", err)
	}
	if names, _ := staged.List(ctx, definition.KindAgent); !reflect.DeepEqual(names, []string{"Bad Name", "a"}) {
		t.Fatalf("list %v", names)
	}
	if names, _ := staged.List(ctx, definition.KindPrompt); !reflect.DeepEqual(names, []string{"x"}) {
		t.Fatalf("list prompts %v", names)
	}
	_, want := home.Read(ctx, definition.KindPrompt, "x")
	if _, err := staged.Read(ctx, definition.KindPrompt, "x"); err == nil || err.Error() != want.Error() {
		t.Fatalf("unreadable: %v, want %v", err, want)
	}
	remove()
	if entries, _ := os.ReadDir(root); len(entries) != 0 {
		t.Fatalf("the stage is left after its removal: %v", entries)
	}
	if after := tree(t, home.Dir); !reflect.DeepEqual(after, before) {
		t.Fatalf("staging wrote into the store: %v", after)
	}
}

// A process is read from a stage laid over its base as home will hold
// both: home's process over the base the install writes (ADR-030 rule 9).
func TestStageLaysAProcessOverItsStagedBase(t *testing.T) {
	t.Parallel()
	home := fsdefs.Store{Dir: t.TempDir()}.StagingIn(t.TempDir())
	ctx := context.Background()
	// The base leaves out the prompt, which its process sets.
	base := func(instruction string) string {
		return "schema: agister.process/v1alpha1\nname: base\ntype: process\ntimeout: 10m\ninput:\n  instruction: " + instruction + "\noutput:\n  format: text\n"
	}
	put(t, filepath.Join(home.Dir, "processes", "base.yaml"), base("home"))
	put(t, filepath.Join(home.Dir, "processes", "child.yaml"), "name: child\nextends: process:base\nprompt: p\n")
	staged, remove, err := home.Stage(ctx, []definition.Document{{Source: definition.Source{Kind: definition.KindProcess, Name: "base"}, Bytes: []byte(base("staged"))}})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(remove)
	doc, err := staged.Read(ctx, definition.KindProcess, "child")
	want := "schema: agister.process/v1alpha1\ntype: process\ntimeout: 10m\ninput:\n  instruction: staged\noutput:\n  format: text\nname: child\nextends: process:base\nprompt: p\n"
	if err != nil || string(doc.Bytes) != want {
		t.Fatalf("read %q, %v\nwant %q", doc.Bytes, err, want)
	}
}

// tree lists every path under dir, relative to it.
func tree(t *testing.T, dir string) []string {
	t.Helper()
	var paths []string
	err := filepath.WalkDir(dir, func(path string, _ fs.DirEntry, err error) error {
		rel, _ := filepath.Rel(dir, path)
		paths = append(paths, rel)
		return err
	})
	if err != nil {
		t.Fatal(err)
	}
	return paths
}

// Put replaces a document whole, leaving nothing beside it; Remove takes it
// away, and a missing one is no error.
//
// Contract test: the settings store against the real filesystem.
func TestPutAndRemove(t *testing.T) {
	t.Parallel()
	store := fsdefs.Store{Dir: t.TempDir()}
	ctx := context.Background()
	for _, text := range []string{"one", "two"} {
		if err := store.Put(ctx, definition.KindPrompt, "p", []byte(text)); err != nil {
			t.Fatal(err)
		}
	}
	entries, _ := os.ReadDir(filepath.Join(store.Dir, "prompts"))
	if doc, err := store.Read(ctx, definition.KindPrompt, "p"); err != nil || string(doc.Bytes) != "two" || len(entries) != 1 {
		t.Fatalf("read %q, %v, entries %v", doc.Bytes, err, entries)
	}
	for range 2 {
		if err := store.Remove(ctx, definition.KindPrompt, "p"); err != nil {
			t.Fatal(err)
		}
	}
	if _, digest, _ := store.Current(ctx, definition.KindPrompt, "p"); digest != "" {
		t.Fatal("not removed")
	}
}

// A backup holds the replaced documents laid out like the store, and its
// manifest; it is never written over, and a stamp is one name.
//
// Contract test: the settings store against the real filesystem.
func TestBackups(t *testing.T) {
	t.Parallel()
	backups := fsdefs.Backups{Dir: filepath.Join(t.TempDir(), "backups")}
	ctx := context.Background()
	manifest := fsdefs.Manifest{Stamp: "s1", Source: "/repo/.agister", Installed: time.Date(2026, 10, 2, 0, 0, 0, 0, time.UTC),
		Documents: []fsdefs.ManifestEntry{{Path: "/home/service.toml", Kind: "service", Name: "service", Action: "replace", Before: "b", After: "a"}}}
	saved := []definition.Document{{Source: definition.Source{Kind: definition.KindService, Name: "service"}, Bytes: []byte("old")}}
	if err := backups.Save(ctx, "s1", manifest, saved); err != nil {
		t.Fatal(err)
	}
	if err := backups.Save(ctx, "s1", manifest, nil); err == nil {
		t.Fatal("wrote over a backup")
	}
	if got, err := backups.Manifest(ctx, "s1"); err != nil || !reflect.DeepEqual(got, manifest) {
		t.Fatalf("manifest %+v, %v", got, err)
	}
	if data, err := backups.Saved(ctx, "s1", definition.KindService, "service"); err != nil || string(data) != "old" {
		t.Fatalf("saved %q, %v", data, err)
	}
	if err := backups.Save(ctx, "s0", fsdefs.Manifest{}, nil); err != nil {
		t.Fatal(err)
	}
	if stamps, err := backups.List(ctx); err != nil || !reflect.DeepEqual(stamps, []string{"s0", "s1"}) {
		t.Fatalf("list %v, %v", stamps, err)
	}
	for _, stamp := range []string{"", "..", "../x", "a/b", ".hidden"} {
		if _, err := backups.Manifest(ctx, stamp); err == nil || !strings.Contains(err.Error(), "invalid backup stamp") {
			t.Errorf("stamp %q: %v", stamp, err)
		}
	}
	if err := backups.Remove(ctx, "s0"); err != nil {
		t.Fatal(err)
	}
	if stamps, _ := backups.List(ctx); !reflect.DeepEqual(stamps, []string{"s1"}) {
		t.Fatalf("after remove %v", stamps)
	}
}

// A backup whose write fails is removed whole: no folder is left to be
// taken for a backup.
//
// Contract test: the settings store against the real filesystem.
func TestBackupsSaveLeavesNothingWhenAWriteFails(t *testing.T) {
	t.Parallel()
	dir := filepath.Join(t.TempDir(), "backups")
	full := errors.New("disk full")
	var written []string
	backups := fsdefs.Backups{Dir: dir}.Writing(func(path string, data []byte) error {
		if filepath.Base(path) == "manifest.json" {
			return full
		}
		written = append(written, path)
		return os.WriteFile(path, data, 0o600)
	})
	saved := []definition.Document{{Source: definition.Source{Kind: definition.KindService, Name: "service"}, Bytes: []byte("old")}}
	if err := backups.Save(context.Background(), "s1", fsdefs.Manifest{Stamp: "s1"}, saved); !errors.Is(err, full) {
		t.Fatalf("save: %v", err)
	}
	if len(written) != 1 {
		t.Fatalf("written %v, want the saved document before the manifest failed", written)
	}
	if entries, err := os.ReadDir(dir); err != nil || len(entries) != 0 {
		t.Fatalf("left %v, %v", entries, err)
	}
}

// A policy is found where the store kept it by what a restore runs on: a
// backup made before ADR-030 names it, and its restore puts that file back
// or removes it (ADR-016 rule 6). It is no settings: the store neither
// lists, reads, writes nor installs it, and a new backup saves none.
//
// Contract test: the settings store against the real filesystem.
func TestAPolicyIsFoundOnlyByARestore(t *testing.T) {
	t.Parallel()
	const policies = definition.Kind("policies")
	ctx := context.Background()
	store := fsdefs.Store{Dir: t.TempDir()}
	path := filepath.Join(store.Dir, "policies", "read-only.yaml")
	if got, digest, err := store.Current(ctx, policies, "read-only"); err != nil || got != path || digest != "" {
		t.Fatalf("current of none: %q, %q, %v", got, digest, err)
	}
	if err := store.Put(ctx, policies, "read-only", []byte("old")); err != nil {
		t.Fatal(err)
	}
	if data, err := os.ReadFile(path); err != nil || string(data) != "old" {
		t.Fatalf("put %q, %v", data, err)
	}
	if got, digest, err := store.Current(ctx, policies, "read-only"); err != nil || got != path || digest != sha("old") {
		t.Fatalf("current: %q, %q, %v", got, digest, err)
	}
	if data, err := store.File(ctx, policies, "read-only"); err != nil || string(data) != "old" {
		t.Fatalf("file %q, %v", data, err)
	}
	backups := fsdefs.Backups{Dir: filepath.Join(t.TempDir(), "backups")}
	put(t, filepath.Join(backups.Dir, "s1", "policies", "read-only.yaml"), "before")
	if data, err := backups.Saved(ctx, "s1", policies, "read-only"); err != nil || string(data) != "before" {
		t.Fatalf("saved %q, %v", data, err)
	}
	// A manifest's name is one name: nothing outside policies/ is reached.
	for _, name := range []string{"", "../agents/a", "a/b"} {
		if _, _, err := store.Current(ctx, policies, name); err == nil || !strings.Contains(err.Error(), "invalid name") {
			t.Errorf("current of %q: %v", name, err)
		}
		if err := store.Remove(ctx, policies, name); err == nil || !strings.Contains(err.Error(), "invalid name") {
			t.Errorf("remove of %q: %v", name, err)
		}
	}

	const unknown = `unknown definition kind "policies"`
	if _, err := store.Read(ctx, policies, "read-only"); err == nil || !strings.Contains(err.Error(), unknown) {
		t.Errorf("read: %v", err)
	}
	if _, _, err := store.Write(ctx, policies, "other", []byte("x"), ""); err == nil || !strings.Contains(err.Error(), unknown) {
		t.Errorf("write: %v", err)
	}
	saved := []definition.Document{{Source: definition.Source{Kind: policies, Name: "read-only"}, Bytes: []byte("old")}}
	if err := backups.Save(ctx, "s2", fsdefs.Manifest{Stamp: "s2"}, saved); err == nil || !strings.Contains(err.Error(), unknown) {
		t.Errorf("save: %v", err)
	}
	if docs, unreadable, err := store.Documents(ctx); err != nil || len(docs) != 0 || len(unreadable) != 0 {
		t.Errorf("documents %+v, unreadable %+v, %v", docs, unreadable, err)
	}
	if docs, ignored, err := (fsdefs.Store{Dir: t.TempDir()}).Source(ctx, store.Dir); err != nil || len(docs) != 0 || !reflect.DeepEqual(ignored, []string{"policies/"}) {
		t.Errorf("source: read %+v, ignored %v, %v", docs, ignored, err)
	}

	if err := store.Remove(ctx, policies, "read-only"); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Lstat(path); !errors.Is(err, fs.ErrNotExist) {
		t.Fatalf("not removed: %v", err)
	}
}

func sha(text string) string {
	sum := sha256.Sum256([]byte(text))
	return hex.EncodeToString(sum[:])
}
