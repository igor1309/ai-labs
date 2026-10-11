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
	"slices"
	"strings"
	"syscall"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/adapters/fsdefs"
	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
)

// worktree is a home and a worktree's root, each a directory of its own.
func worktree(t *testing.T) (home fsdefs.Store, root string) {
	t.Helper()
	return fsdefs.Store{Dir: filepath.Join(t.TempDir(), "home")}, filepath.Join(t.TempDir(), "w")
}

// sum is the digest a source carries for these bytes.
func sum(data []byte) string {
	digest := sha256.Sum256(data)
	return hex.EncodeToString(digest[:])
}

// dirs are the layers selected, nearest first, each "layer dir".
func dirs(selected fsdefs.Layered) []string {
	var found []string
	for _, layer := range selected.Layers(context.Background()) {
		found = append(found, string(layer.Layer)+" "+layer.Dir)
	}
	return found
}

// ADR-028 rule 1: the layers are home, the .agister of the worktree's root
// and the .agister of the nearest directory that holds one, from the launch
// directory upward and below the root. A command launched at the root, or
// under no directory that holds one, has no project layer; a sibling's is
// never read.
//
// Contract test: the selection of layers against the real filesystem.
func TestSelectTakesTheNearestProjectLayerBelowTheRoot(t *testing.T) {
	t.Parallel()
	home, root := worktree(t)
	repository := filepath.Join(root, ".agister")
	docs, warder := filepath.Join(root, "docs", ".agister"), filepath.Join(root, "warder", ".agister")
	for _, dir := range []string{home.Dir, repository, docs, warder, filepath.Join(root, "docs", "guide", "deep"), filepath.Join(root, "plain", "sub")} {
		if err := os.MkdirAll(dir, 0o700); err != nil {
			t.Fatal(err)
		}
	}
	for launch, want := range map[string][]string{
		".":               {"repository " + repository, "home " + home.Dir},
		"plain/sub":       {"repository " + repository, "home " + home.Dir},
		"docs":            {"project " + docs, "repository " + repository, "home " + home.Dir},
		"docs/guide/deep": {"project " + docs, "repository " + repository, "home " + home.Dir},
		"warder":          {"project " + warder, "repository " + repository, "home " + home.Dir},
	} {
		selected, err := fsdefs.Select(home, root, filepath.Join(root, launch))
		if err != nil || !reflect.DeepEqual(dirs(selected), want) || len(selected.Nested) != 0 {
			t.Errorf("launched in %s: %v, nested %v, %v; want %v", launch, dirs(selected), selected.Nested, err, want)
		}
		for _, layer := range selected.Layers(context.Background()) {
			if len(layer.Invalid) != 0 {
				t.Errorf("launched in %s: %s layer is invalid: %+v", launch, layer.Layer, layer.Invalid)
			}
		}
	}

	// The launch directory reached through a link is the directory it is.
	link := filepath.Join(t.TempDir(), "link")
	if err := os.Symlink(filepath.Join(root, "docs", "guide"), link); err != nil {
		t.Fatal(err)
	}
	if selected, err := fsdefs.Select(home, root, link); err != nil || !reflect.DeepEqual(dirs(selected), []string{"project " + docs, "repository " + repository, "home " + home.Dir}) {
		t.Errorf("launched through a link: %v, %v", dirs(selected), err)
	}
	// A directory outside the root has no project layer of this worktree.
	if selected, err := fsdefs.Select(home, root, t.TempDir()); err != nil || selected.Project != nil {
		t.Errorf("launched outside the root: %v, %v", dirs(selected), err)
	}
}

// ADR-028 rule 1: a repository without .agister has no repository layer,
// and a document found nowhere still names where it would hold it; a
// .agister that is home itself is no layer, at the root or below it; one
// that exists and is no directory, or cannot be resolved, is an error, so
// a layer never silently stops applying.
//
// Contract test: the selection of layers against the real filesystem.
func TestSelectReadsNoLayerThatIsHomeOrAbsent(t *testing.T) {
	t.Parallel()
	t.Run("absent", func(t *testing.T) {
		t.Parallel()
		home, root := worktree(t)
		for _, dir := range []string{home.Dir, filepath.Join(root, "sub")} {
			if err := os.MkdirAll(dir, 0o700); err != nil {
				t.Fatal(err)
			}
		}
		selected, err := fsdefs.Select(home, root, filepath.Join(root, "sub"))
		if err != nil || !reflect.DeepEqual(dirs(selected), []string{"home " + home.Dir}) {
			t.Fatalf("selected %v, %v", dirs(selected), err)
		}
		want := "not found (expected " + filepath.Join(root, ".agister", "verifies", "p.yaml") + " or " + filepath.Join(home.Dir, "verifies", "p.yaml") + ")"
		if _, err := selected.Read(context.Background(), definition.KindVerify, "p"); !errors.Is(err, definition.ErrNotFound) || err.Error() != want {
			t.Fatalf("missing = %v, want %q", err, want)
		}
	})
	t.Run("home at the root", func(t *testing.T) {
		t.Parallel()
		root := filepath.Join(t.TempDir(), "w")
		home := fsdefs.Store{Dir: filepath.Join(root, ".agister")}
		if err := os.MkdirAll(home.Dir, 0o700); err != nil {
			t.Fatal(err)
		}
		selected, err := fsdefs.Select(home, root, root)
		if err != nil || !reflect.DeepEqual(dirs(selected), []string{"home " + home.Dir}) || selected.Absent != "" {
			t.Fatalf("selected %v, absent %q, %v", dirs(selected), selected.Absent, err)
		}
	})
	t.Run("home below the root", func(t *testing.T) {
		t.Parallel()
		root := filepath.Join(t.TempDir(), "w")
		home := fsdefs.Store{Dir: filepath.Join(root, "user", ".agister")}
		repository := filepath.Join(root, ".agister")
		for _, dir := range []string{home.Dir, repository} {
			if err := os.MkdirAll(dir, 0o700); err != nil {
				t.Fatal(err)
			}
		}
		selected, err := fsdefs.Select(home, root, filepath.Join(root, "user"))
		if err != nil || !reflect.DeepEqual(dirs(selected), []string{"repository " + repository, "home " + home.Dir}) {
			t.Fatalf("selected %v, %v", dirs(selected), err)
		}
	})
	for name, at := range map[string]string{"at the root": ".agister", "below the root": filepath.Join("docs", ".agister")} {
		t.Run("a file "+name, func(t *testing.T) {
			t.Parallel()
			home, root := worktree(t)
			path := filepath.Join(root, at)
			put(t, path, "not a directory")
			if err := os.MkdirAll(filepath.Join(root, "docs"), 0o700); err != nil {
				t.Fatal(err)
			}
			if _, err := fsdefs.Select(home, root, filepath.Join(root, "docs")); err == nil || !strings.Contains(err.Error(), path) || !strings.Contains(err.Error(), "not a directory") {
				t.Fatalf("selected with %s a file: %v", path, err)
			}
		})
		// A dangling link is there and cannot be used: it is no absent
		// layer, whose settings would silently stop applying.
		t.Run("a dangling link "+name, func(t *testing.T) {
			t.Parallel()
			home, root := worktree(t)
			path := filepath.Join(root, at)
			dangle(t, path)
			if err := os.MkdirAll(filepath.Join(root, "docs"), 0o700); err != nil {
				t.Fatal(err)
			}
			selected, err := fsdefs.Select(home, root, filepath.Join(root, "docs"))
			if err == nil || !strings.HasPrefix(err.Error(), "settings "+path+": ") || !errors.Is(err, fs.ErrNotExist) {
				t.Fatalf("selected with %s a dangling link: %v, %v", path, dirs(selected), err)
			}
		})
	}
}

// ADR-028 rule 1: there is no fourth layer. A second .agister between the
// project layer's directory and the root makes the project layer invalid,
// naming both directories; the layers are selected all the same, so check
// can read them. Launched above the nearer one, the farther is the project
// layer and is valid.
//
// Contract test: the selection of layers against the real filesystem.
func TestASecondSettingsDirectoryOnTheWayUpMakesTheProjectLayerInvalid(t *testing.T) {
	t.Parallel()
	home, root := worktree(t)
	outer, inner := filepath.Join(root, "docs", ".agister"), filepath.Join(root, "docs", "guide", ".agister")
	for _, dir := range []string{home.Dir, filepath.Join(root, ".agister"), outer, inner} {
		if err := os.MkdirAll(dir, 0o700); err != nil {
			t.Fatal(err)
		}
	}
	selected, err := fsdefs.Select(home, root, filepath.Join(root, "docs", "guide"))
	if err != nil || selected.Project == nil || selected.Project.Dir != inner || !reflect.DeepEqual(selected.Nested, []string{outer}) {
		t.Fatalf("selected %v, nested %v, %v", dirs(selected), selected.Nested, err)
	}
	layers := selected.Layers(context.Background())
	if len(layers) != 3 || layers[0].Layer != definition.LayerProject || len(layers[0].Invalid) != 1 || len(layers[1].Invalid) != 0 || len(layers[2].Invalid) != 0 {
		t.Fatalf("layers = %+v", layers)
	}
	if invalid := layers[0].Invalid[0]; invalid.Path != outer || !strings.Contains(invalid.Reason, "a second .agister between "+inner+" and the worktree's root") {
		t.Fatalf("invalid = %+v", invalid)
	}

	above, err := fsdefs.Select(home, root, filepath.Join(root, "docs"))
	if err != nil || above.Project == nil || above.Project.Dir != outer || len(above.Nested) != 0 || len(above.Layers(context.Background())[0].Invalid) != 0 {
		t.Fatalf("launched above: %v, nested %v, %v", dirs(above), above.Nested, err)
	}
}

// ADR-028 rule 7: blocks.yaml is the repository layer's alone. One in a
// project layer makes that layer invalid, whatever is at its path, and is
// not read: the repository's blocks are read from there as from the root.
//
// Contract test: the settings store against the real filesystem.
func TestBlocksInAProjectLayerMakeItInvalidAndAreNotRead(t *testing.T) {
	t.Parallel()
	for name, plant := range map[string]func(t *testing.T, path string){
		"a file":           func(t *testing.T, path string) { put(t, path, "project's") },
		"a directory":      func(t *testing.T, path string) { put(t, filepath.Join(path, "x"), "") },
		"a dangling link ": dangle,
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			ctx := context.Background()
			home, root := worktree(t)
			repository, project := filepath.Join(root, ".agister"), filepath.Join(root, "docs", ".agister")
			put(t, filepath.Join(repository, "blocks.yaml"), "repository's")
			plant(t, filepath.Join(project, "blocks.yaml"))
			if err := os.MkdirAll(home.Dir, 0o700); err != nil {
				t.Fatal(err)
			}
			selected, err := fsdefs.Select(home, root, filepath.Join(root, "docs"))
			if err != nil {
				t.Fatal(err)
			}
			layers := selected.Layers(ctx)
			if len(layers) != 3 || len(layers[0].Invalid) != 1 || layers[0].Invalid[0].Path != filepath.Join(project, "blocks.yaml") ||
				!strings.Contains(layers[0].Invalid[0].Reason, "blocks are the repository layer's alone") {
				t.Fatalf("layers = %+v", layers)
			}
			doc, err := selected.Read(ctx, definition.KindBlocks, "blocks")
			if err != nil || string(doc.Bytes) != "repository's" || doc.Source.Layer != definition.LayerRepository || doc.Source.Path != filepath.Join(repository, "blocks.yaml") {
				t.Fatalf("blocks = %+v %q, %v", doc.Source, doc.Bytes, err)
			}
			if names, err := selected.List(ctx, definition.KindBlocks); err != nil || !reflect.DeepEqual(names, []string{"blocks"}) {
				t.Fatalf("listed %v, %v", names, err)
			}
		})
	}
	t.Run("none", func(t *testing.T) {
		t.Parallel()
		home, root := worktree(t)
		for _, dir := range []string{home.Dir, filepath.Join(root, ".agister"), filepath.Join(root, "docs", ".agister")} {
			if err := os.MkdirAll(dir, 0o700); err != nil {
				t.Fatal(err)
			}
		}
		selected, err := fsdefs.Select(home, root, filepath.Join(root, "docs"))
		if err != nil || len(selected.Layers(context.Background())[0].Invalid) != 0 {
			t.Fatalf("a project layer without blocks: %+v, %v", selected.Layers(context.Background()), err)
		}
		if names, err := selected.List(context.Background(), definition.KindBlocks); err != nil || len(names) != 0 {
			t.Fatalf("listed %v, %v", names, err)
		}
	})
}

// threeLayers are a home, a repository layer and a project layer of one
// worktree, as a command launched in the project's directory selects them.
func threeLayers(t *testing.T) (selected fsdefs.Layered, home, repository, project string) {
	t.Helper()
	store, root := worktree(t)
	home, repository, project = store.Dir, filepath.Join(root, ".agister"), filepath.Join(root, "docs", ".agister")
	for _, dir := range []string{home, repository, project} {
		if err := os.MkdirAll(dir, 0o700); err != nil {
			t.Fatal(err)
		}
	}
	selected, err := fsdefs.Select(store, root, filepath.Join(root, "docs"))
	if err != nil {
		t.Fatal(err)
	}
	return selected, home, repository, project
}

// ADR-028 rules 3 and 4: a document of a composed kind is composed from
// every layer that holds it, home downward, and names each layer's file,
// nearest first, with its digest and the fields it gave; its own digest is
// the composition's. A layer that does not hold it is not among them.
//
// Contract test: the settings store against the real filesystem.
func TestADocumentIsComposedFromEveryLayerThatHoldsIt(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	selected, home, repository, project := threeLayers(t)
	const homeText, repositoryText, projectText = "schema: v1\nname: p\nlimits: {timeout: 10m, attempts: 1}\nallow: [read]\n",
		"allow: [read, write]\n", "limits: {attempts: 3}\nallow: []\n"
	put(t, filepath.Join(home, "verifies", "p.yaml"), homeText)
	put(t, filepath.Join(repository, "verifies", "p.yaml"), repositoryText)
	put(t, filepath.Join(project, "verifies", "p.yaml"), projectText)
	put(t, filepath.Join(home, "verifies", "home_only.yaml"), homeText)
	put(t, filepath.Join(project, "verifies", "partial.yaml"), projectText)
	put(t, filepath.Join(home, "verifies", "partial.yaml"), homeText)

	doc, err := selected.Read(ctx, definition.KindVerify, "p")
	if err != nil {
		t.Fatal(err)
	}
	if got := string(doc.Bytes); got != "schema: v1\nname: p\nlimits:\n  timeout: 10m\n  attempts: 3\nallow: []\n" {
		t.Fatalf("composed:\n%s", got)
	}
	want := definition.Source{
		Kind: definition.KindVerify, Name: "p", Layer: definition.LayerProject, Path: filepath.Join(project, "verifies", "p.yaml"), SHA256: sum(doc.Bytes),
		Layers: []definition.LayerFile{
			{Layer: definition.LayerProject, Path: filepath.Join(project, "verifies", "p.yaml"), SHA256: sum([]byte(projectText)), Fields: []string{"limits.attempts", "allow"}},
			{Layer: definition.LayerRepository, Path: filepath.Join(repository, "verifies", "p.yaml"), SHA256: sum([]byte(repositoryText)), Fields: []string{}},
			{Layer: definition.LayerHome, Path: filepath.Join(home, "verifies", "p.yaml"), SHA256: sum([]byte(homeText)), Fields: []string{"schema", "name", "limits.timeout"}},
		},
	}
	if !reflect.DeepEqual(doc.Source, want) {
		t.Fatalf("source = %+v\nwant     %+v", doc.Source, want)
	}
	// What each layer's file holds, with the file as the source names it:
	// what a composition with one of them changed is composed from.
	texts := []definition.LayerText{{File: want.Layers[0], Bytes: []byte(projectText)}, {File: want.Layers[1], Bytes: []byte(repositoryText)}, {File: want.Layers[2], Bytes: []byte(homeText)}}
	if !reflect.DeepEqual(doc.Texts, texts) {
		t.Fatalf("texts = %+v\nwant    %+v", doc.Texts, texts)
	}

	// One layer alone: its file, byte for byte, and its digest.
	alone, err := selected.Read(ctx, definition.KindVerify, "home_only")
	if err != nil || string(alone.Bytes) != homeText || alone.Source.SHA256 != sum([]byte(homeText)) || alone.Source.Layer != definition.LayerHome ||
		len(alone.Source.Layers) != 1 || alone.Source.Layers[0].Layer != definition.LayerHome {
		t.Fatalf("home's alone = %+v %q, %v", alone.Source, alone.Bytes, err)
	}
	// The repository holds none: the project's is composed onto home's.
	partial, err := selected.Read(ctx, definition.KindVerify, "partial")
	if err != nil || len(partial.Source.Layers) != 2 || partial.Source.Layers[0].Layer != definition.LayerProject || partial.Source.Layers[1].Layer != definition.LayerHome {
		t.Fatalf("partial = %+v, %v", partial.Source, err)
	}
	if names, err := selected.List(ctx, definition.KindVerify); err != nil || !reflect.DeepEqual(names, []string{"home_only", "p", "partial"}) {
		t.Fatalf("listed %v, %v", names, err)
	}
	missing := "not found (expected " + filepath.Join(project, "verifies", "gone.yaml") + " or " + filepath.Join(repository, "verifies", "gone.yaml") + " or " + filepath.Join(home, "verifies", "gone.yaml") + ")"
	gone, err := selected.Read(ctx, definition.KindVerify, "gone")
	if !errors.Is(err, definition.ErrNotFound) || err.Error() != missing {
		t.Fatalf("missing = %v, want %q", err, missing)
	}
	// A document no layer holds is expected in the nearest layer, which
	// its source names with the path its file would have there.
	expected := definition.Source{Kind: definition.KindVerify, Name: "gone", Layer: definition.LayerProject, Path: filepath.Join(project, "verifies", "gone.yaml")}
	if !reflect.DeepEqual(gone.Source, expected) || gone.Bytes != nil || gone.Texts != nil {
		t.Fatalf("missing source = %+v, want %+v", gone.Source, expected)
	}
}

// ADR-028 rule 6: a prompt, a skill and a schema are taken whole from the
// nearest layer that holds them, unchanged: the farther layers' files are
// named as held, and give nothing.
//
// Contract test: the settings store against the real filesystem.
func TestAPromptASkillAndASchemaAreTakenWholeFromTheNearestLayer(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	selected, home, repository, project := threeLayers(t)
	for kind, file := range map[definition.Kind]string{
		definition.KindPrompt: filepath.Join("prompts", "x.md"),
		definition.KindSkill:  filepath.Join("skills", "x", "SKILL.md"),
		definition.KindSchema: filepath.Join("schemas", "x.json"),
	} {
		// A schema whose keys a merge would join: it is not merged.
		texts := map[string]string{home: `{"required": ["a"], "properties": {"a": {}}}`, repository: `{"required": ["b"]}`, project: `{"properties": {"c": {}}}`}
		if kind == definition.KindSkill {
			texts = map[string]string{home: skillText("x") + "home\n", repository: skillText("x") + "repository\n", project: skillText("x") + "project\n"}
		}
		put(t, filepath.Join(home, file), texts[home])
		put(t, filepath.Join(repository, file), texts[repository])
		doc, err := selected.Read(ctx, kind, "x")
		if err != nil || string(doc.Bytes) != texts[repository] || doc.Source.Layer != definition.LayerRepository || doc.Source.SHA256 != sum([]byte(texts[repository])) {
			t.Fatalf("%s from the repository = %+v %q, %v", kind, doc.Source, doc.Bytes, err)
		}
		put(t, filepath.Join(project, file), texts[project])
		doc, err = selected.Read(ctx, kind, "x")
		if err != nil || string(doc.Bytes) != texts[project] || doc.Source.Path != filepath.Join(project, file) || doc.Source.SHA256 != sum([]byte(texts[project])) {
			t.Fatalf("%s from the project = %+v %q, %v", kind, doc.Source, doc.Bytes, err)
		}
		want := []definition.LayerFile{
			{Layer: definition.LayerProject, Path: filepath.Join(project, file), SHA256: sum([]byte(texts[project]))},
			{Layer: definition.LayerRepository, Path: filepath.Join(repository, file)},
			{Layer: definition.LayerHome, Path: filepath.Join(home, file)},
		}
		if !reflect.DeepEqual(doc.Source.Layers, want) {
			t.Fatalf("%s layers = %+v", kind, doc.Source.Layers)
		}
	}
}

// ADR-028 rule 5: a layer's file that is there and cannot be read, or is
// not one map, breaks the document: the parent's is not read in its place,
// and the error names the file.
//
// Contract test: the settings store against the real filesystem.
func TestALayerFileThatCannotBeReadBreaksTheDocument(t *testing.T) {
	t.Parallel()
	const whole = "schema: v1\nname: p\n"
	for name, plant := range map[string]func(t *testing.T, path string){
		"a dangling link": dangle,
		"a directory":     func(t *testing.T, path string) { put(t, filepath.Join(path, "x"), "") },
		"a list":          func(t *testing.T, path string) { put(t, path, "- a\n") },
		"not YAML":        func(t *testing.T, path string) { put(t, path, "name: [unclosed\n") },
	} {
		for _, at := range []definition.Layer{definition.LayerProject, definition.LayerRepository, definition.LayerHome} {
			t.Run(name+" in the "+string(at)+" layer", func(t *testing.T) {
				t.Parallel()
				selected, home, repository, project := threeLayers(t)
				paths := map[definition.Layer]string{
					definition.LayerHome:       filepath.Join(home, "verifies", "p.yaml"),
					definition.LayerRepository: filepath.Join(repository, "verifies", "p.yaml"),
					definition.LayerProject:    filepath.Join(project, "verifies", "p.yaml"),
				}
				for layer, path := range paths {
					if layer == at {
						plant(t, path)
					} else {
						put(t, path, whole)
					}
				}
				doc, err := selected.Read(context.Background(), definition.KindVerify, "p")
				if err == nil || errors.Is(err, definition.ErrNotFound) || !strings.Contains(err.Error(), paths[at]) || doc.Bytes != nil {
					t.Fatalf("read %q, %v; want an error naming %s", doc.Bytes, err, paths[at])
				}
				if doc.Source.Layer != definition.LayerProject || doc.Source.Path != paths[definition.LayerProject] {
					t.Fatalf("source = %+v", doc.Source)
				}
			})
		}
	}
}

// A store read alone is home: its documents name the home layer.
//
// Contract test: the settings store against the real filesystem.
func TestAStoreAloneIsReadAsHome(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	store := fsdefs.Store{Dir: t.TempDir()}
	path := filepath.Join(store.Dir, "verifies", "p.yaml")
	put(t, path, "name: p\n")
	doc, err := store.Read(ctx, definition.KindVerify, "p")
	want := []definition.LayerFile{{Layer: definition.LayerHome, Path: path, SHA256: sum([]byte("name: p\n")), Fields: []string{"name"}}}
	if err != nil || doc.Source.Layer != definition.LayerHome || !reflect.DeepEqual(doc.Source.Layers, want) {
		t.Fatalf("source = %+v, %v", doc.Source, err)
	}
	if layers := store.Layers(ctx); !reflect.DeepEqual(layers, []definition.LayerDir{{Layer: definition.LayerHome, Dir: store.Dir}}) {
		t.Fatalf("layers = %+v", layers)
	}
}

// A viewer inspects the layers Select selects, home's alone outside a
// worktree, and every document and layer.yaml is read with its reader: a
// file it leaves out as not found is passed over, as an absent one is.
//
// Contract test: the settings store against the real filesystem.
func TestInspectSelectsAsSelectAndReadsWithTheViewersReader(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	home, root := worktree(t)
	repository, project := filepath.Join(root, ".agister"), filepath.Join(root, "docs", ".agister")
	put(t, filepath.Join(home.Dir, "verifies", "p.yaml"), "name: p\n")
	put(t, filepath.Join(repository, "layer.yaml"), layerFile("a", "b"))
	left, taken := filepath.Join(root, "a", "x.md"), filepath.Join(root, "b", "x.md")
	put(t, left, "left out\n")
	put(t, taken, "taken\n")
	put(t, filepath.Join(project, "verifies", "p.yaml"), "timeout: 1m\n")
	var opened []string
	read := func(path string) ([]byte, error) {
		opened = append(opened, path)
		if path == left {
			return nil, definition.ErrNotFound
		}
		return os.ReadFile(path)
	}

	alone, err := fsdefs.Inspect(home.Dir, "", filepath.Join(root, "docs"), read)
	if err != nil || !reflect.DeepEqual(dirs(alone), []string{"home " + home.Dir}) {
		t.Fatalf("outside a worktree: %v, %v", dirs(alone), err)
	}
	inspected, err := fsdefs.Inspect(home.Dir, root, filepath.Join(root, "docs"), read)
	selected, serr := fsdefs.Select(home, root, filepath.Join(root, "docs"))
	if err != nil || serr != nil || !reflect.DeepEqual(dirs(inspected), dirs(selected)) {
		t.Fatalf("inside: %v, %v; Select %v, %v", dirs(inspected), err, dirs(selected), serr)
	}
	doc, err := inspected.Read(ctx, definition.KindPrompt, "x")
	if err != nil || doc.Source.Path != taken || string(doc.Bytes) != "taken\n" {
		t.Fatalf("x = %+v %q, %v", doc.Source, doc.Bytes, err)
	}
	verification, err := inspected.Read(ctx, definition.KindVerify, "p")
	if err != nil || !strings.Contains(string(verification.Bytes), "timeout: 1m") {
		t.Fatalf("p = %q, %v", verification.Bytes, err)
	}
	for _, path := range []string{filepath.Join(repository, "layer.yaml"), left, taken, filepath.Join(project, "verifies", "p.yaml"), filepath.Join(home.Dir, "verifies", "p.yaml")} {
		if !slices.Contains(opened, path) {
			t.Errorf("%s not read with the viewer's reader: %v", path, opened)
		}
	}
	if _, err := fsdefs.Inspect(home.Dir, root, root, nil); err == nil {
		t.Fatal("inspected with no reader")
	}
}

// layerFile is a layer.yaml listing folders.
func layerFile(folders ...string) string {
	return "schema: agister.layer/v1alpha1\nprompts: [" + strings.Join(folders, ", ") + "]\n"
}

// ADR-028 rule 9: a layer's prompt is its .agister/prompts file, else the
// first file of that name in the folders its layer.yaml lists, in order,
// each relative to the directory that holds the layer's .agister; the
// layer wins over its parents as any layer does. A prompt no layer has is
// expected in each place, and a listed folder holds no other document.
//
// Contract test: the settings store against the real filesystem.
func TestALayersPromptsAreAlsoFoundInTheFoldersItsLayerFileLists(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	selected, home, repository, project := threeLayers(t)
	root := filepath.Dir(repository)
	put(t, filepath.Join(repository, "layer.yaml"), layerFile("a", "b/c"))
	put(t, filepath.Join(project, "layer.yaml"), layerFile("p"))
	for _, folder := range []string{filepath.Join(root, "a"), filepath.Join(root, "b", "c"), filepath.Join(root, "docs", "p")} {
		if err := os.MkdirAll(folder, 0o700); err != nil {
			t.Fatal(err)
		}
	}
	read := func(want string) definition.Document {
		t.Helper()
		doc, err := selected.Read(ctx, definition.KindPrompt, "x")
		if err != nil || doc.Source.Path != want || string(doc.Bytes) != want || doc.Source.SHA256 != sum([]byte(want)) {
			t.Fatalf("x = %+v %q, %v; want %s", doc.Source, doc.Bytes, err, want)
		}
		return doc
	}
	for _, path := range []string{filepath.Join(home, "prompts", "x.md"), filepath.Join(root, "b", "c", "x.md")} {
		put(t, path, path)
	}
	doc := read(filepath.Join(root, "b", "c", "x.md"))
	if doc.Source.Layer != definition.LayerRepository || !reflect.DeepEqual(doc.Source.Layers[1:], []definition.LayerFile{{Layer: definition.LayerHome, Path: filepath.Join(home, "prompts", "x.md")}}) {
		t.Fatalf("x from the second folder = %+v", doc.Source)
	}
	// The first folder listed comes first, and the layer's own prompts/
	// before both; the project's folder before the repository's.
	for _, path := range []string{filepath.Join(root, "a", "x.md"), filepath.Join(repository, "prompts", "x.md"), filepath.Join(root, "docs", "p", "x.md")} {
		put(t, path, path)
		read(path)
	}
	doc = read(filepath.Join(root, "docs", "p", "x.md"))
	if doc.Source.Layer != definition.LayerProject || !reflect.DeepEqual(doc.Source.Layers[1:], []definition.LayerFile{
		{Layer: definition.LayerRepository, Path: filepath.Join(repository, "prompts", "x.md")},
		{Layer: definition.LayerHome, Path: filepath.Join(home, "prompts", "x.md")},
	}) {
		t.Fatalf("x from the project's folder = %+v", doc.Source)
	}

	_, err := selected.Read(ctx, definition.KindPrompt, "y")
	if !errors.Is(err, definition.ErrNotFound) {
		t.Fatalf("y: %v", err)
	}
	for _, path := range []string{filepath.Join(project, "prompts", "y.md"), filepath.Join(root, "docs", "p", "y.md"), filepath.Join(repository, "prompts", "y.md"), filepath.Join(root, "a", "y.md"), filepath.Join(root, "b", "c", "y.md"), filepath.Join(home, "prompts", "y.md")} {
		if !strings.Contains(err.Error(), path) {
			t.Fatalf("y: %v; want %s among the paths expected", err, path)
		}
	}
	// A listed folder is not settings: no other kind is read there.
	put(t, filepath.Join(root, "a", "z.md"), "z")
	if _, err := selected.Read(ctx, definition.KindVerify, "z"); !errors.Is(err, definition.ErrNotFound) {
		t.Fatalf("verification z: %v", err)
	}
	if names, err := selected.List(ctx, definition.KindPrompt); err != nil || slices.Contains(names, "z") {
		t.Fatalf("prompts listed %v, %v", names, err)
	}
}

// ADR-028 rule 9: a layer.yaml that cannot be used makes its layer
// invalid, so it stops every command launched under the layer: one that
// cannot be read or is not valid, or that lists a folder that does not
// exist, is not a folder, or that a link leads out of the directory that
// holds the layer's .agister. Which prompt the layer was meant to give
// cannot be known, so a prompt its .agister/prompts lacks is not looked
// for in its parents. Home holds no layer.yaml: one there makes home
// invalid.
//
// Contract test: the settings store against the real filesystem.
func TestALayerFileThatCannotBeUsedMakesItsLayerInvalid(t *testing.T) {
	t.Parallel()
	for name, c := range map[string]struct {
		plant  func(t *testing.T, dir string) // dir holds the layer's .agister
		reason string
	}{
		"unreadable": {func(t *testing.T, dir string) { dangle(t, filepath.Join(dir, ".agister", "layer.yaml")) }, "cannot be read"},
		"no schema":  {func(t *testing.T, dir string) { put(t, filepath.Join(dir, ".agister", "layer.yaml"), "prompts: [a]\n") }, "is invalid: schema: is required"},
		"a list":     {func(t *testing.T, dir string) { put(t, filepath.Join(dir, ".agister", "layer.yaml"), "- a\n") }, "is invalid"},
		"a folder that does not exist": {func(t *testing.T, dir string) {
			put(t, filepath.Join(dir, ".agister", "layer.yaml"), layerFile("a"))
		}, "lists prompts folder a, which does not exist in "},
		"a file": {func(t *testing.T, dir string) {
			put(t, filepath.Join(dir, "a"), "")
			put(t, filepath.Join(dir, ".agister", "layer.yaml"), layerFile("a"))
		}, "lists prompts folder a, which is not a folder"},
		"a link that leaves": {func(t *testing.T, dir string) {
			if err := os.Symlink(t.TempDir(), filepath.Join(dir, "a")); err != nil {
				t.Fatal(err)
			}
			put(t, filepath.Join(dir, ".agister", "layer.yaml"), layerFile("a"))
		}, "lists prompts folder a, which a link leads out of "},
	} {
		for _, at := range []definition.Layer{definition.LayerProject, definition.LayerRepository} {
			t.Run(name+" in the "+string(at)+" layer", func(t *testing.T) {
				t.Parallel()
				ctx := context.Background()
				selected, home, repository, project := threeLayers(t)
				dir, index := filepath.Dir(project), 0
				if at == definition.LayerRepository {
					dir, index = filepath.Dir(repository), 1
				}
				c.plant(t, dir)
				put(t, filepath.Join(home, "prompts", "x.md"), "home's")
				file := filepath.Join(dir, ".agister", "layer.yaml")
				layers := selected.Layers(ctx)
				for i, layer := range layers {
					if i != index && len(layer.Invalid) != 0 {
						t.Fatalf("layer %s is invalid too: %+v", layer.Layer, layer.Invalid)
					}
				}
				if invalid := layers[index].Invalid; len(invalid) != 1 || invalid[0].Path != file || !strings.Contains(invalid[0].Reason, c.reason) {
					t.Fatalf("%s layer invalid = %+v, want %q", at, invalid, c.reason)
				}
				doc, err := selected.Read(ctx, definition.KindPrompt, "x")
				if err == nil || errors.Is(err, definition.ErrNotFound) || !strings.Contains(err.Error(), file) || doc.Bytes != nil {
					t.Fatalf("x = %q, %v; want an error naming %s", doc.Bytes, err, file)
				}
			})
		}
	}
	t.Run("home's", func(t *testing.T) {
		t.Parallel()
		selected, home, _, _ := threeLayers(t)
		put(t, filepath.Join(home, "layer.yaml"), layerFile())
		layers := selected.Layers(context.Background())
		if invalid := layers[2].Invalid; layers[2].Layer != definition.LayerHome || len(invalid) != 1 || invalid[0].Path != filepath.Join(home, "layer.yaml") || !strings.Contains(invalid[0].Reason, "home holds no layer.yaml") {
			t.Fatalf("layers = %+v", layers)
		}
	})
}

// ADR-030 rule 4: there are no policies, and a file in a layer's
// policies/ is a problem of that layer, each file its own: a file named
// policies, which cannot be listed, is one. An empty policies/ is none.
//
// Contract test: the settings store against the real filesystem.
func TestAFileInPoliciesMakesItsLayerInvalid(t *testing.T) {
	t.Parallel()
	const reason = "a layer holds no policies (ADR-030 rule 4): set the policy's fields on each process that names it, then remove it"
	for i, at := range []definition.Layer{definition.LayerProject, definition.LayerRepository, definition.LayerHome} {
		t.Run(string(at), func(t *testing.T) {
			t.Parallel()
			selected, home, repository, project := threeLayers(t)
			dir := []string{project, repository, home}[i]
			policies := filepath.Join(dir, "policies")
			put(t, filepath.Join(policies, "read-only.yaml"), "schema: agister.process-policy/v1alpha1\nname: read-only\n")
			put(t, filepath.Join(policies, "notes.txt"), "")
			layers := selected.Layers(context.Background())
			for j, layer := range layers {
				if j != i && len(layer.Invalid) != 0 {
					t.Fatalf("layer %s is invalid too: %+v", layer.Layer, layer.Invalid)
				}
			}
			want := []definition.LayerProblem{
				{Path: filepath.Join(policies, "notes.txt"), Reason: reason},
				{Path: filepath.Join(policies, "read-only.yaml"), Reason: reason},
			}
			if layers[i].Layer != at || !reflect.DeepEqual(layers[i].Invalid, want) {
				t.Fatalf("%s layer invalid = %+v, want %+v", at, layers[i].Invalid, want)
			}
		})
	}
	t.Run("a file named policies", func(t *testing.T) {
		t.Parallel()
		selected, _, repository, _ := threeLayers(t)
		put(t, filepath.Join(repository, "policies"), "")
		invalid := selected.Layers(context.Background())[1].Invalid
		if len(invalid) != 1 || invalid[0].Path != filepath.Join(repository, "policies") || !strings.HasPrefix(invalid[0].Reason, reason+" (cannot be listed: ") {
			t.Fatalf("repository layer invalid = %+v", invalid)
		}
	})
	t.Run("an empty policies", func(t *testing.T) {
		t.Parallel()
		selected, home, _, _ := threeLayers(t)
		if err := os.MkdirAll(filepath.Join(home, "policies"), 0o700); err != nil {
			t.Fatal(err)
		}
		for _, layer := range selected.Layers(context.Background()) {
			if len(layer.Invalid) != 0 {
				t.Fatalf("layer %s is invalid: %+v", layer.Layer, layer.Invalid)
			}
		}
	})
}

// ADR-028 rule 6: a prompt is taken whole from the nearest layer, and a
// farther layer's file of it is named, not opened, wherever the layer
// holds it: in its own prompts/ or in a folder its layer.yaml lists. A
// FIFO there, which a read would wait on for ever, does not hang the read
// of the project's prompt.
//
// Contract test: the settings store against a real FIFO with no writer,
// which a blocking read waits on for ever.
func TestAFartherLayersPromptIsNamedNotOpened(t *testing.T) {
	t.Parallel()
	for name, at := range map[string]string{
		"its own prompts/":  filepath.Join(".agister", "prompts", "x.md"),
		"its first folder":  filepath.Join("lib", "x.md"),
		"its second folder": filepath.Join("later", "x.md"),
	} {
		t.Run("in "+name, func(t *testing.T) {
			t.Parallel()
			ctx := context.Background()
			selected, home, repository, project := threeLayers(t)
			root := filepath.Dir(repository)
			put(t, filepath.Join(repository, "layer.yaml"), layerFile("lib", "later"))
			fifo := filepath.Join(root, at)
			for _, dir := range []string{filepath.Join(root, "lib"), filepath.Join(root, "later"), filepath.Dir(fifo)} {
				if err := os.MkdirAll(dir, 0o700); err != nil {
					t.Fatal(err)
				}
			}
			if err := syscall.Mkfifo(fifo, 0o600); err != nil {
				t.Fatal(err)
			}
			// Metadata uses the same precedence as a read: own prompts/
			// before listed folders, then the first listed folder found.
			if at == filepath.Join(".agister", "prompts", "x.md") {
				put(t, filepath.Join(root, "lib", "x.md"), "The first folder's x.\n")
			}
			if at != filepath.Join("later", "x.md") {
				put(t, filepath.Join(root, "later", "x.md"), "The second folder's x.\n")
			}
			homePath, path, text := filepath.Join(home, "prompts", "x.md"), filepath.Join(project, "prompts", "x.md"), "The project's x.\n"
			put(t, homePath, "Home's x.\n")
			put(t, path, text)

			type read struct {
				doc definition.Document
				err error
			}
			done := make(chan read, 1)
			workers := letGo(t, fifo)
			workers.Add(1)
			go func() {
				defer workers.Done()
				doc, err := selected.Read(ctx, definition.KindPrompt, "x")
				done <- read{doc, err}
			}()
			select {
			case got := <-done:
				want := definition.Source{
					Kind: definition.KindPrompt, Name: "x", Layer: definition.LayerProject, Path: path, SHA256: sum([]byte(text)),
					Layers: []definition.LayerFile{
						{Layer: definition.LayerProject, Path: path, SHA256: sum([]byte(text))},
						{Layer: definition.LayerRepository, Path: fifo},
						{Layer: definition.LayerHome, Path: homePath},
					},
				}
				if got.err != nil || string(got.doc.Bytes) != text || !reflect.DeepEqual(got.doc.Source, want) {
					t.Fatalf("x = %+v %q, %v\nwant %+v", got.doc.Source, got.doc.Bytes, got.err, want)
				}
			case <-time.After(5 * time.Second):
				t.Fatal("reading the project's prompt waits on the repository's FIFO")
			}
		})
	}
}

// A process's layer file that cannot be read breaks it (ADR-028 rule 5),
// and the farther layers' files are read only to say what base it names
// (ADR-030 rule 9): one that is not a regular file, a FIFO here, is passed
// over, and the read fails with the nearer file's error instead of waiting
// on it.
//
// Contract test: the settings store against a real FIFO with no writer,
// which a blocking read waits on for ever.
func TestABrokenProcessDoesNotWaitOnAFartherFIFO(t *testing.T) {
	t.Parallel()
	selected, home, repository, _ := threeLayers(t)
	link := filepath.Join(repository, "processes", "child.yaml")
	dangle(t, link)
	fifo := filepath.Join(home, "processes", "child.yaml")
	if err := os.MkdirAll(filepath.Dir(fifo), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := syscall.Mkfifo(fifo, 0o600); err != nil {
		t.Fatal(err)
	}

	type read struct {
		doc definition.Document
		err error
	}
	done := make(chan read, 1)
	workers := letGo(t, fifo)
	workers.Add(1)
	go func() {
		defer workers.Done()
		doc, err := selected.Read(context.Background(), definition.KindProcess, "child")
		done <- read{doc, err}
	}()
	select {
	case got := <-done:
		if got.err == nil || !strings.Contains(got.err.Error(), "cannot be resolved") || got.doc.Source.Path != link || len(got.doc.Texts) != 0 {
			t.Fatalf("child = %+v, %v; want %s not resolved, and no farther text", got.doc.Source, got.err, link)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("reading the broken process waits on home's FIFO")
	}
}

// ADR-028 rule 9: a file in a folder a layer.yaml lists that cannot be
// resolved, a dangling symlink, is the layer's prompt all the same:
// reading it fails, naming it, and home's prompt is not given in its
// place.
//
// Contract test: the settings store against the real filesystem.
func TestADanglingPromptInAListedFolderIsNotHomes(t *testing.T) {
	t.Parallel()
	selected, home, repository, _ := threeLayers(t)
	put(t, filepath.Join(repository, "layer.yaml"), layerFile("lib"))
	link := filepath.Join(filepath.Dir(repository), "lib", "x.md")
	dangle(t, link)
	put(t, filepath.Join(home, "prompts", "x.md"), "Home's x.\n")
	doc, err := selected.Read(context.Background(), definition.KindPrompt, "x")
	if err == nil || errors.Is(err, definition.ErrNotFound) || !strings.Contains(err.Error(), "cannot be resolved") || !strings.Contains(err.Error(), link) {
		t.Fatalf("x = %q, %v; want it not resolved, naming %s", doc.Bytes, err, link)
	}
	if doc.Bytes != nil || doc.Source.Layer != definition.LayerRepository || doc.Source.Path != link {
		t.Fatalf("x = %+v %q; want the repository's %s, and no text", doc.Source, doc.Bytes, link)
	}
}

// ADR-028 rule 9: a folder a layer.yaml lists is read for a name a process
// gives, and is not otherwise settings. Read as the settings list it, a
// prompt is each layer's own prompts/ file alone: a file of its name in a
// listed folder, which would fail as a prompt, neither replaces home's nor
// is named among its layers, and one only there is not found there and
// not expected there. Read as a call reads it, the folder's comes first.
//
// Contract test: the settings store against the real filesystem.
func TestAPromptAsTheSettingsListItIsNotTakenFromAListedFolder(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	selected, home, repository, _ := threeLayers(t)
	put(t, filepath.Join(repository, "layer.yaml"), layerFile("lib"))
	lib := filepath.Join(filepath.Dir(repository), "lib")
	homePath, homeText := filepath.Join(home, "prompts", "notes.md"), "Home's notes.\n"
	put(t, homePath, homeText)
	put(t, filepath.Join(lib, "notes.md"), "\x00\xff")
	put(t, filepath.Join(lib, "x.md"), "The library's x.\n")

	listed, err := selected.ReadListed(ctx, definition.KindPrompt, "notes")
	want := definition.Source{
		Kind: definition.KindPrompt, Name: "notes", Layer: definition.LayerHome, Path: homePath, SHA256: sum([]byte(homeText)),
		Layers: []definition.LayerFile{{Layer: definition.LayerHome, Path: homePath, SHA256: sum([]byte(homeText))}},
	}
	if err != nil || string(listed.Bytes) != homeText || !reflect.DeepEqual(listed.Source, want) {
		t.Fatalf("notes listed = %+v %q, %v\nwant %+v", listed.Source, listed.Bytes, err, want)
	}
	if _, err := selected.ReadListed(ctx, definition.KindPrompt, "x"); !errors.Is(err, definition.ErrNotFound) || strings.Contains(err.Error(), lib) {
		t.Fatalf("x listed: %v; want not found, and not expected in %s", err, lib)
	}
	if names, err := selected.List(ctx, definition.KindPrompt); err != nil || !reflect.DeepEqual(names, []string{"notes"}) {
		t.Fatalf("listed %v, %v", names, err)
	}

	named, err := selected.Read(ctx, definition.KindPrompt, "notes")
	if err != nil || named.Source.Path != filepath.Join(lib, "notes.md") || !reflect.DeepEqual(named.Source.Layers[1:], []definition.LayerFile{{Layer: definition.LayerHome, Path: homePath}}) {
		t.Fatalf("notes named = %+v, %v", named.Source, err)
	}
}
