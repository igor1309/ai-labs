package fsdefs_test

import (
	"context"
	"errors"
	"io/fs"
	"net"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"syscall"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/adapters/fsdefs"
	"github.com/igor1309/ai-labs/agister/internal/contract"
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

// A SKILL.md replaced by a FIFO after its folder is listed is not read and
// not waited on: what is opened is checked again, so an unused skill does
// not hang a call that names none (ADR-021 rules 1 and 4).
//
// Contract test: the settings store against a real FIFO with no writer,
// which a blocking open waits on for ever.
func TestASkillFileReplacedByAFIFOIsNotWaitedOn(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	dir := t.TempDir()
	file := filepath.Join(dir, "skills", "review", "SKILL.md")
	put(t, file, skillText("review"))
	store := fsdefs.Store{Dir: dir}.Observing(func(point string) {
		if point != "open" {
			return
		}
		if err := os.Remove(file); err != nil {
			t.Error(err)
		}
		if err := syscall.Mkfifo(file, 0o600); err != nil {
			t.Error(err)
		}
	})

	type read struct {
		doc definition.Document
		err error
	}
	done := make(chan read, 1)
	go func() {
		doc, err := store.Read(ctx, definition.KindSkill, "review")
		done <- read{doc, err}
	}()
	select {
	case got := <-done:
		if info, err := os.Lstat(file); err != nil || info.Mode().Type() != fs.ModeNamedPipe {
			t.Fatalf("fixture = %v, %v: not a FIFO", info, err)
		}
		if want := file + " is not a regular file"; got.err == nil || got.err.Error() != want {
			t.Fatalf("err = %v, want %q", got.err, want)
		}
		if got.doc.Source.Kind != definition.KindSkill || got.doc.Source.Name != "review" || got.doc.Source.Path != file || got.doc.Bytes != nil {
			t.Fatalf("document = %+v, %q", got.doc.Source, got.doc.Bytes)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("reading a skill whose SKILL.md became a FIFO blocks")
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

// A source folder's skill is a settings document to install, its SKILL.md
// (ADR-027 rule 8); a file directly in skills/, or a skill folder whose
// name breaks the naming rule, is named and not read (rule 9).
//
// Contract test: the settings store against the real filesystem.
func TestSourceReadsSkills(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	put(t, filepath.Join(dir, "agents", "a.toml"), "a")
	put(t, filepath.Join(dir, "skills", "review", "SKILL.md"), skillText("review"))
	put(t, filepath.Join(dir, "skills", "notes.md"), "x")
	put(t, filepath.Join(dir, "skills", "Bad Name", "SKILL.md"), skillText("Bad Name"))
	docs, ignored, err := fsdefs.Store{Dir: t.TempDir()}.Source(context.Background(), dir)
	if err != nil {
		t.Fatal(err)
	}
	var read []string
	for _, doc := range docs {
		read = append(read, string(doc.Source.Kind)+"/"+doc.Source.Name+" "+doc.Source.Path+"="+string(doc.Bytes))
	}
	want := []string{"agents/a " + filepath.Join(dir, "agents", "a.toml") + "=a", "skills/review " + filepath.Join(dir, "skills", "review", "SKILL.md") + "=" + skillText("review")}
	if !reflect.DeepEqual(read, want) {
		t.Fatalf("read %v", read)
	}
	if !reflect.DeepEqual(ignored, []string{"skills/Bad Name/SKILL.md", "skills/notes.md"}) {
		t.Fatalf("ignored = %v", ignored)
	}
}

// A source skill folder that is not a skill refuses the folder, naming the
// skill and what is wrong with it (ADR-027 rule 9, ADR-021 rule 1).
//
// Contract test: the settings store against the real filesystem.
func TestSourceRefusesASkillThatIsNotOne(t *testing.T) {
	t.Parallel()
	for name, c := range map[string]struct {
		make func(t *testing.T, folder string)
		want string
	}{
		"a file beside": {func(t *testing.T, folder string) {
			put(t, filepath.Join(folder, "SKILL.md"), skillText("review"))
			put(t, filepath.Join(folder, "checklist.md"), "x")
		}, " holds checklist.md beside SKILL.md: a skill is its SKILL.md alone"},
		"a folder beside": {func(t *testing.T, folder string) {
			put(t, filepath.Join(folder, "SKILL.md"), skillText("review"))
			put(t, filepath.Join(folder, "scripts", "run.sh"), "x")
		}, " holds scripts beside SKILL.md: a skill is its SKILL.md alone"},
		"SKILL.md a folder": {func(t *testing.T, folder string) {
			put(t, filepath.Join(folder, "SKILL.md", "x.md"), "x")
		}, "SKILL.md is a folder: a skill's SKILL.md is a regular file"},
		"no SKILL.md": {func(t *testing.T, folder string) {
			if err := os.MkdirAll(folder, 0o700); err != nil {
				t.Fatal(err)
			}
		}, " has no SKILL.md"},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			dir := t.TempDir()
			put(t, filepath.Join(dir, "agents", "a.toml"), "a")
			folder := filepath.Join(dir, "skills", "review")
			c.make(t, folder)
			var input *contract.InputError
			_, _, err := fsdefs.Store{Dir: t.TempDir()}.Source(context.Background(), dir)
			if !errors.As(err, &input) || !strings.HasPrefix(err.Error(), "skill review: "+folder) || !strings.Contains(err.Error(), c.want) || !strings.HasSuffix(err.Error(), "; so nothing was installed") {
				t.Fatalf("source: %v", err)
			}
		})
	}
}

// A staged skill reads as home will hold it once its SKILL.md is written:
// what home's folder holds beside it, a folder in its place, or a folder
// that is a symbolic link, is that skill's problem, named at home's path
// (ADR-027 rule 8).
//
// Contract test: the settings store against the real filesystem.
func TestAStagedSkillReadsAsHomeWillHoldIt(t *testing.T) {
	t.Parallel()
	for name, c := range map[string]struct {
		make func(t *testing.T, folder string)
		want string
	}{
		"none":                       {func(*testing.T, string) {}, ""},
		"replaced":                   {func(t *testing.T, folder string) { put(t, filepath.Join(folder, "SKILL.md"), "old") }, ""},
		"a link in SKILL.md's place": {func(t *testing.T, folder string) { dangle(t, filepath.Join(folder, "SKILL.md")) }, ""},
		"a file beside": {func(t *testing.T, folder string) {
			put(t, filepath.Join(folder, "SKILL.md"), "old")
			put(t, filepath.Join(folder, "checklist.md"), "x")
		}, "{folder} holds checklist.md beside SKILL.md: a skill is its SKILL.md alone"},
		"SKILL.md a folder": {func(t *testing.T, folder string) {
			put(t, filepath.Join(folder, "SKILL.md", "x.md"), "x")
		}, "{folder}/SKILL.md is a folder: a skill's SKILL.md is a regular file"},
		"a linked folder": {func(t *testing.T, folder string) {
			target := t.TempDir()
			if err := os.MkdirAll(filepath.Dir(folder), 0o700); err != nil {
				t.Fatal(err)
			}
			if err := os.Symlink(target, folder); err != nil {
				t.Fatal(err)
			}
		}, "{folder} is a symbolic link: a skill is a folder holding its SKILL.md"},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			ctx := context.Background()
			home := fsdefs.Store{Dir: t.TempDir()}
			folder := filepath.Join(home.Dir, "skills", "review")
			c.make(t, folder)
			doc := definition.Document{Source: definition.Source{Kind: definition.KindSkill, Name: "review"}, Bytes: []byte(skillText("review"))}
			staged, remove, err := home.StagingIn(t.TempDir()).Stage(ctx, []definition.Document{doc})
			if err != nil {
				t.Fatal(err)
			}
			defer remove()
			got, err := staged.Read(ctx, definition.KindSkill, "review")
			if c.want == "" {
				if err != nil || string(got.Bytes) != skillText("review") || got.Source.Path != filepath.Join(folder, "SKILL.md") {
					t.Fatalf("staged = %+v, %v", got.Source, err)
				}
				return
			}
			want := strings.ReplaceAll(c.want, "{folder}", folder)
			if err == nil || !strings.HasPrefix(err.Error(), want) || got.Source.Path != filepath.Join(folder, "SKILL.md") {
				t.Fatalf("staged = %+v, %v; want %q", got.Source, err, want)
			}
		})
	}
}

// Removing a skill removes its folder with its SKILL.md when nothing else
// is left in it, and keeps a folder that holds more (ADR-027 rule 8).
//
// Contract test: the settings store against the real filesystem.
func TestRemovingASkillRemovesItsEmptiedFolder(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	store := fsdefs.Store{Dir: t.TempDir()}
	for _, name := range []string{"review", "style"} {
		if err := store.Put(ctx, definition.KindSkill, name, []byte(skillText(name))); err != nil {
			t.Fatal(err)
		}
	}
	put(t, filepath.Join(store.Dir, "skills", "style", "notes.md"), "mine")
	for range 2 {
		for _, name := range []string{"review", "style"} {
			if err := store.Remove(ctx, definition.KindSkill, name); err != nil {
				t.Fatal(err)
			}
		}
	}
	if got := tree(t, filepath.Join(store.Dir, "skills")); !reflect.DeepEqual(got, []string{".", "style", filepath.Join("style", "notes.md")}) {
		t.Fatalf("left %v", got)
	}
}

// A skill's folder with nothing in it is what a failed write of its
// SKILL.md left, and Remove removes it; a folder that holds anything, a
// symbolic link, no folder, or another kind's document leaves nothing
// (ADR-027 rule 8).
//
// Contract test: the settings store against the real filesystem.
func TestAnEmptySkillFolderIsLeftByAFailedWriteAndRemoved(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	store := fsdefs.Store{Dir: t.TempDir()}
	skills := filepath.Join(store.Dir, "skills")
	for _, name := range []string{"empty", "elsewhere"} {
		if err := os.MkdirAll(filepath.Join(skills, name), 0o700); err != nil {
			t.Fatal(err)
		}
	}
	if err := store.Put(ctx, definition.KindSkill, "whole", []byte(skillText("whole"))); err != nil {
		t.Fatal(err)
	}
	put(t, filepath.Join(skills, "notes", "notes.md"), "mine")
	if err := os.Symlink(filepath.Join(skills, "elsewhere"), filepath.Join(skills, "linked")); err != nil {
		t.Fatal(err)
	}
	for name, want := range map[string]string{
		"empty":   filepath.Join(skills, "empty"),
		"whole":   "",
		"notes":   "",
		"linked":  "",
		"missing": "",
	} {
		if left, err := store.Left(ctx, definition.KindSkill, name); err != nil || left != want {
			t.Errorf("skill %s: left %q, %v, want %q", name, left, err, want)
		}
	}
	if left, err := store.Left(ctx, definition.KindPrompt, "empty"); err != nil || left != "" {
		t.Errorf("prompt empty: left %q, %v, want none", left, err)
	}

	if err := store.Remove(ctx, definition.KindSkill, "empty"); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Lstat(filepath.Join(skills, "empty")); !os.IsNotExist(err) {
		t.Fatalf("the empty folder is left: %v", err)
	}
	if left, err := store.Left(ctx, definition.KindSkill, "empty"); err != nil || left != "" {
		t.Fatalf("after Remove: left %q, %v, want none", left, err)
	}
}

// Removing a document whose folder is not there at all, a skill's or
// another kind's, is no error: there is nothing to remove.
//
// Contract test: the settings store against the real filesystem.
func TestRemovingFromAnAbsentFolderIsNoError(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	store := fsdefs.Store{Dir: t.TempDir()}
	for _, kind := range []definition.Kind{definition.KindSkill, definition.KindPrompt} {
		if err := store.Remove(ctx, kind, "review"); err != nil {
			t.Errorf("%s: %v", kind, err)
		}
	}
	if got := tree(t, store.Dir); !reflect.DeepEqual(got, []string{"."}) {
		t.Fatalf("left %v", got)
	}
}
