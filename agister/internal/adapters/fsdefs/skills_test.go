package fsdefs_test

import (
	"context"
	"io/fs"
	"net"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/adapters/fsdefs"
	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
)

// Settings give an agent its skills (ADR-021 rule 1).

func skillText(name string) string {
	return "---\nname: " + name + "\ndescription: How to " + name + ".\n---\n\n# " + name + "\n"
}

// A skill is the folder skills/<name>/ of a layer, holding its SKILL.md: a
// project's replaces home's whole and says which file it overrides.
func TestASkillIsAFolderOfALayer(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	global, project := fsdefs.Store{Dir: t.TempDir()}, fsdefs.Store{Dir: t.TempDir()}
	homeReview := filepath.Join(global.Dir, "skills", "review", "SKILL.md")
	homeStyle := filepath.Join(global.Dir, "skills", "style", "SKILL.md")
	projectReview := filepath.Join(project.Dir, "skills", "review", "SKILL.md")
	projectTests := filepath.Join(project.Dir, "skills", "tests", "SKILL.md")
	put(t, homeReview, "home's "+skillText("review"))
	put(t, homeStyle, skillText("style"))
	put(t, projectReview, skillText("review"))
	put(t, projectTests, skillText("tests"))
	// A file in skills/ is no skill: a skill is a folder.
	put(t, filepath.Join(global.Dir, "skills", "notes.md"), "x")
	put(t, filepath.Join(global.Dir, "skills", "SKILL.md"), "x")

	layered := fsdefs.Layered{Global: global, Project: &project}
	if names, err := layered.List(ctx, definition.KindSkill); err != nil || !reflect.DeepEqual(names, []string{"review", "style", "tests"}) {
		t.Fatalf("list = %v, %v", names, err)
	}
	if names, err := global.List(ctx, definition.KindSkill); err != nil || !reflect.DeepEqual(names, []string{"review", "style"}) {
		t.Fatalf("home's = %v, %v", names, err)
	}
	review, err := layered.Read(ctx, definition.KindSkill, "review")
	if err != nil || string(review.Bytes) != skillText("review") || review.Source.Path != projectReview || !review.Source.Project || review.Source.Overrides != homeReview || review.Source.SHA256 == "" {
		t.Fatalf("review = %+v, %v", review.Source, err)
	}
	style, err := layered.Read(ctx, definition.KindSkill, "style")
	if err != nil || string(style.Bytes) != skillText("style") || style.Source.Path != homeStyle || style.Source.Project || style.Source.Overrides != "" {
		t.Fatalf("style = %+v, %v", style.Source, err)
	}
	tests, err := layered.Read(ctx, definition.KindSkill, "tests")
	if err != nil || tests.Source.Path != projectTests || !tests.Source.Project || tests.Source.Overrides != "" {
		t.Fatalf("tests = %+v, %v", tests.Source, err)
	}
	// Outside a project, home's is the skill.
	if doc, err := (fsdefs.Layered{Global: global}).Read(ctx, definition.KindSkill, "review"); err != nil || string(doc.Bytes) != "home's "+skillText("review") || doc.Source.Project {
		t.Fatalf("home's review = %+v, %v", doc.Source, err)
	}
	want := "not found (expected " + filepath.Join(project.Dir, "skills", "git", "SKILL.md") + " or " + filepath.Join(global.Dir, "skills", "git", "SKILL.md") + ")"
	for _, name := range []string{"git", "notes"} {
		if _, err := layered.Read(ctx, definition.KindSkill, name); err == nil || err.Error() != strings.ReplaceAll(want, "git", name) {
			t.Fatalf("%s = %v, want %q", name, err, want)
		}
	}
}

// A folder that holds anything beside its SKILL.md, or whose SKILL.md is not
// a regular file, is a broken skill: listed, and reading it says what is
// wrong.
func TestABrokenSkillIsListedAndNotRead(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	store := fsdefs.Store{Dir: t.TempDir()}
	folder := func(name string) string { return filepath.Join(store.Dir, "skills", name) }
	file := func(name string) string { return filepath.Join(folder(name), "SKILL.md") }

	put(t, file("good"), skillText("good"))
	put(t, file("second"), skillText("second"))
	put(t, filepath.Join(folder("second"), "reference.md"), "more")
	put(t, file("scripted"), skillText("scripted"))
	put(t, filepath.Join(folder("scripted"), "scripts", "run.sh"), "#!/bin/sh\n")
	put(t, filepath.Join(folder("scripted"), ".DS_Store"), "x")
	elsewhere := filepath.Join(t.TempDir(), "SKILL.md")
	put(t, elsewhere, skillText("linked"))
	if err := os.MkdirAll(folder("linked"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(elsewhere, file("linked")); err != nil {
		t.Fatal(err)
	}
	dangle(t, file("dangling"))
	if err := os.MkdirAll(filepath.Join(file("nested"), "deeper"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(folder("empty"), 0o700); err != nil {
		t.Fatal(err)
	}
	put(t, filepath.Join(folder("lowercase"), "skill.txt"), skillText("lowercase"))
	if err := os.Symlink(folder("good"), folder("alias")); err != nil {
		t.Fatal(err)
	}

	names, err := store.List(ctx, definition.KindSkill)
	if want := []string{"alias", "dangling", "empty", "good", "linked", "lowercase", "nested", "scripted", "second"}; err != nil || !reflect.DeepEqual(names, want) {
		t.Fatalf("list = %v, %v", names, err)
	}
	if doc, err := store.Read(ctx, definition.KindSkill, "good"); err != nil || string(doc.Bytes) != skillText("good") {
		t.Fatalf("good = %+v, %v", doc.Source, err)
	}
	wants := map[string]string{
		"second":    folder("second") + " holds reference.md beside SKILL.md: a skill is its SKILL.md alone, and its other files are not given to a call",
		"scripted":  folder("scripted") + " holds .DS_Store, scripts beside SKILL.md: a skill is its SKILL.md alone, and its other files are not given to a call",
		"linked":    file("linked") + " is a symbolic link: a skill's SKILL.md is a regular file",
		"dangling":  file("dangling") + " is a symbolic link: a skill's SKILL.md is a regular file",
		"nested":    file("nested") + " is a folder: a skill's SKILL.md is a regular file",
		"empty":     folder("empty") + " has no SKILL.md",
		"lowercase": folder("lowercase") + " has no SKILL.md",
		"alias":     folder("alias") + " is a symbolic link: a skill is a folder holding its SKILL.md",
	}
	for name, want := range wants {
		doc, err := store.Read(ctx, definition.KindSkill, name)
		if err == nil || err.Error() != want {
			t.Errorf("%s = %v, want %q", name, err, want)
		}
		// What is broken is still named: a problem of that skill.
		if doc.Source.Kind != definition.KindSkill || doc.Source.Name != name || doc.Source.Path != file(name) || doc.Bytes != nil {
			t.Errorf("%s: document = %+v, %q", name, doc.Source, doc.Bytes)
		}
	}
}

// A SKILL.md that is neither a regular file, a link nor a folder, a socket
// here, is a broken skill too: listed, and not read.
//
// Contract test: the settings store against a real socket file, which only
// listening on it makes.
//
// Serial: it changes the process's working directory, to bind the socket
// by its name from inside its folder. A socket's path is at most 104 bytes
// on macOS, and a temporary folder's is longer there.
func TestASkillFileThatIsNotRegularIsNotRead(t *testing.T) {
	ctx := context.Background()
	store := fsdefs.Store{Dir: t.TempDir()}
	folder := filepath.Join(store.Dir, "skills", "special")
	file := filepath.Join(folder, "SKILL.md")
	if err := os.MkdirAll(folder, 0o700); err != nil {
		t.Fatal(err)
	}
	t.Chdir(folder)
	listener, err := net.Listen("unix", "SKILL.md")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = listener.Close() })
	if info, err := os.Lstat(file); err != nil || info.Mode().Type() != fs.ModeSocket {
		t.Fatalf("fixture = %v, %v: not a socket", info, err)
	}

	if names, err := store.List(ctx, definition.KindSkill); err != nil || !reflect.DeepEqual(names, []string{"special"}) {
		t.Fatalf("list = %v, %v", names, err)
	}
	doc, err := store.Read(ctx, definition.KindSkill, "special")
	if want := file + " is not a regular file"; err == nil || err.Error() != want {
		t.Fatalf("err = %v, want %q", err, want)
	}
	if doc.Source.Kind != definition.KindSkill || doc.Source.Name != "special" || doc.Source.Path != file || doc.Bytes != nil {
		t.Fatalf("document = %+v, %q", doc.Source, doc.Bytes)
	}
}

// A project's broken skill is not home's: a project's replaces home's
// whole, so nothing of home's stands in for it.
func TestAProjectsBrokenSkillDoesNotFallBackToHomes(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	global, project := fsdefs.Store{Dir: t.TempDir()}, fsdefs.Store{Dir: t.TempDir()}
	put(t, filepath.Join(global.Dir, "skills", "review", "SKILL.md"), skillText("review"))
	put(t, filepath.Join(project.Dir, "skills", "review", "notes.md"), "x")
	doc, err := fsdefs.Layered{Global: global, Project: &project}.Read(ctx, definition.KindSkill, "review")
	if want := filepath.Join(project.Dir, "skills", "review") + " has no SKILL.md"; err == nil || err.Error() != want {
		t.Fatalf("err = %v, want %q", err, want)
	}
	if !doc.Source.Project || doc.Bytes != nil {
		t.Fatalf("document = %+v, %q", doc.Source, doc.Bytes)
	}
}

// A folder whose name breaks the naming rule is listed, as a file of any
// kind but a prompt is, so check reports it; it names no skill.
func TestASkillFolderWithAnInvalidNameIsListed(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	store := fsdefs.Store{Dir: t.TempDir()}
	put(t, filepath.Join(store.Dir, "skills", "Code Review", "SKILL.md"), skillText("Code Review"))
	if names, err := store.List(ctx, definition.KindSkill); err != nil || !reflect.DeepEqual(names, []string{"Code Review"}) {
		t.Fatalf("list = %v, %v", names, err)
	}
	if _, err := store.Read(ctx, definition.KindSkill, "Code Review"); err == nil || err.Error() != `invalid name "Code Review"` {
		t.Fatalf("read = %v", err)
	}
	if _, err := store.Read(ctx, definition.KindSkill, "../agents"); err == nil || err.Error() != `invalid name "../agents"` {
		t.Fatalf("read = %v", err)
	}
}

// A home's skills are its settings: install's inventory of home has them,
// and a stage of them reads as home does, a broken one included.
func TestHomesSkillsAreItsDocuments(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	home := fsdefs.Store{Dir: t.TempDir()}
	review := filepath.Join(home.Dir, "skills", "review", "SKILL.md")
	broken := filepath.Join(home.Dir, "skills", "broken", "SKILL.md")
	put(t, review, skillText("review"))
	put(t, broken, skillText("broken"))
	put(t, filepath.Join(home.Dir, "skills", "broken", "extra.md"), "x")

	docs, unreadable, err := home.Documents(ctx)
	if err != nil || len(docs) != 1 || docs[0].Source.Path != review || string(docs[0].Bytes) != skillText("review") {
		t.Fatalf("documents = %+v, %v", docs, err)
	}
	if len(unreadable) != 1 || unreadable[0].Kind != definition.KindSkill || unreadable[0].Name != "broken" || unreadable[0].Path != broken {
		t.Fatalf("unreadable = %+v", unreadable)
	}
	staged, remove, err := home.StagingIn(t.TempDir()).Stage(ctx, docs)
	if err != nil {
		t.Fatal(err)
	}
	defer remove()
	if names, err := staged.List(ctx, definition.KindSkill); err != nil || !reflect.DeepEqual(names, []string{"broken", "review"}) {
		t.Fatalf("staged list = %v, %v", names, err)
	}
	if doc, err := staged.Read(ctx, definition.KindSkill, "review"); err != nil || string(doc.Bytes) != skillText("review") || doc.Source.Path != review {
		t.Fatalf("staged review = %+v, %v", doc.Source, err)
	}
	if _, err := staged.Read(ctx, definition.KindSkill, "broken"); err == nil || !strings.Contains(err.Error(), "holds extra.md beside SKILL.md") {
		t.Fatalf("staged broken = %v", err)
	}
}

// A source folder's skills/ is not settings to install: named once, and
// not read, whatever it holds (ADR-016 rule 1).
func TestSourceNamesSkillsAndDoesNotReadThem(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	put(t, filepath.Join(dir, "agents", "a.toml"), "a")
	put(t, filepath.Join(dir, "skills", "review", "SKILL.md"), skillText("review"))
	put(t, filepath.Join(dir, "skills", "broken", "extra.md"), "x")
	docs, ignored, err := fsdefs.Store{Dir: t.TempDir()}.Source(context.Background(), dir)
	if err != nil || len(docs) != 1 || docs[0].Source.Kind != definition.KindAgent {
		t.Fatalf("docs = %+v, %v", docs, err)
	}
	if !reflect.DeepEqual(ignored, []string{"skills/"}) {
		t.Fatalf("ignored = %v", ignored)
	}
}
