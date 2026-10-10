package pages

import (
	"context"
	"fmt"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"syscall"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/adapters/fsdefs"
	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
)

// binarySettings is the selection and store the composition root gives the
// pages: the binary's own.
func binarySettings(home, root, launch string, read func(string) ([]byte, error)) (SettingsStore, error) {
	return fsdefs.Inspect(home, root, launch, read)
}

// Contract test: temporary settings files and worktree markers are read by
// the endpoint; text and provenance match the binary's filesystem store.
func TestSettingsEndpointComposesThreeLayersWithTheBinarysProvenance(t *testing.T) {
	t.Parallel()
	base := realDir(t, t.TempDir())
	home, repo := filepath.Join(base, "home"), filepath.Join(base, "repo")
	project, launch := filepath.Join(repo, "docs"), filepath.Join(repo, "docs", "guide")
	write(t, filepath.Join(repo, ".git"), "gitdir: unused-by-settings-inspection\n")
	mkdir(t, launch)
	write(t, filepath.Join(home, "processes", "implement.yaml"), "name: implement\nprompt: implement\nguidance: [style]\nuses: agent:a\nverify: verify:repo\ninput:\n  params:\n    candidate: {default: HEAD}\n    brief: {}\n")
	write(t, filepath.Join(repo, ".agister", "processes", "implement.yaml"), "input:\n  params:\n    candidate: {default: trunk}\n")
	write(t, filepath.Join(project, ".agister", "processes", "implement.yaml"), "guidance: []\ninput:\n  params:\n    candidate: {default: origin/trunk}\n")
	write(t, filepath.Join(home, "verifies", "repo.yaml"), "name: repo\ntimeout: 1m\nmax_attempts: 2\n")
	write(t, filepath.Join(project, ".agister", "verifies", "repo.yaml"), "command: cd docs && make test\n")
	write(t, filepath.Join(home, "prompts", "implement.md"), "Home implement.\n")
	write(t, filepath.Join(repo, ".agister", "layer.yaml"), "schema: agister.layer/v1alpha1\nprompts: [prompts]\n")
	library := filepath.Join(repo, "prompts", "implement.md")
	write(t, library, "Repo implement.\n")
	write(t, filepath.Join(repo, "prompts", "unused.md"), "Unused.\n")
	write(t, filepath.Join(home, "runtimes", "main.yaml"), "adapter: codex\ncontract: codex/2\n")
	write(t, filepath.Join(project, ".agister", "runtimes", "main.yaml"), "primitives: {}\n")
	write(t, filepath.Join(home, "skills", "rules", "SKILL.md"), skillMD("rules", "Home."))
	write(t, filepath.Join(project, ".agister", "skills", "rules", "SKILL.md"), skillMD("rules", "Project."))

	var got struct {
		ComposedFiles map[string]string
		Sources       map[string]struct {
			Layers []struct {
				Layer, Path string
				Fields      []string
			}
		}
	}
	h := Handler(home, noChoose(t), owners(), SkillHomes{}, binarySettings)
	if code := get(t, h, "localhost", "/api/settings?path="+q(launch), &got); code != http.StatusOK {
		t.Fatalf("status %d", code)
	}
	selected, err := fsdefs.Select(fsdefs.Store{Dir: home}, repo, launch)
	if err != nil {
		t.Fatal(err)
	}
	for file, kind := range map[string]definition.Kind{
		"processes/implement.yaml": definition.KindProcess,
		"verifies/repo.yaml":       definition.KindVerify,
		"prompts/implement.md":     definition.KindPrompt,
	} {
		name := strings.TrimSuffix(filepath.Base(file), filepath.Ext(file))
		doc, err := selected.Read(context.Background(), kind, name)
		if err != nil {
			t.Fatal(err)
		}
		if got.ComposedFiles[file] != string(doc.Bytes) {
			t.Errorf("%s: text %q, want %q", file, got.ComposedFiles[file], doc.Bytes)
		}
		layers := got.Sources[file].Layers
		if len(layers) != len(doc.Source.Layers) {
			t.Fatalf("%s: layers %+v, want %+v", file, layers, doc.Source.Layers)
		}
		for i, want := range doc.Source.Layers {
			if layers[i].Layer != string(want.Layer) || layers[i].Path != want.Path || !reflect.DeepEqual(layers[i].Fields, want.Fields) {
				t.Errorf("%s: layer %+v, want %+v", file, layers[i], want)
			}
		}
	}
	if _, found := got.ComposedFiles["prompts/unused.md"]; found {
		t.Fatal("an unreferenced library prompt is listed")
	}
	var skills SkillsReply
	if code := get(t, h, "localhost", "/api/skills?path="+q(launch), &skills); code != 200 {
		t.Fatalf("skills status %d", code)
	}
	if !reflect.DeepEqual(skills.Adapters, []string{"codex"}) {
		t.Errorf("inherited adapter: %v", skills.Adapters)
	}
	if len(skills.Settings) != 2 || skills.Settings[0].Scope != "project" || skills.Settings[0].Description != "Project." {
		t.Errorf("skills %+v", skills.Settings)
	}
}

// Contract test: invalid settings layer files refuse the Pages endpoint.
func TestSettingsEndpointRefusesInvalidLayers(t *testing.T) {
	t.Parallel()
	for _, bad := range []string{"project blocks", "nested project", "missing prompt folder", "home layer"} {
		t.Run(bad, func(t *testing.T) {
			t.Parallel()
			base := realDir(t, t.TempDir())
			home, repo := filepath.Join(base, "home"), filepath.Join(base, "repo")
			project := filepath.Join(repo, "docs")
			write(t, filepath.Join(repo, ".git"), "gitdir: marker\n")
			mkdir(t, home)
			mkdir(t, filepath.Join(project, ".agister"))
			var want string
			switch bad {
			case "project blocks":
				write(t, filepath.Join(project, ".agister", "blocks.yaml"), "blocks: []\n")
				want = "blocks.yaml"
			case "nested project":
				mkdir(t, filepath.Join(project, "inner", ".agister"))
				project = filepath.Join(project, "inner")
				want = "second .agister"
			case "missing prompt folder":
				write(t, filepath.Join(project, ".agister", "layer.yaml"), "schema: agister.layer/v1alpha1\nprompts: [missing]\n")
				want = "prompts folder missing"
			case "home layer":
				write(t, filepath.Join(home, "layer.yaml"), "schema: agister.layer/v1alpha1\n")
				want = "home holds no layer.yaml"
			}
			var got struct{ Error string }
			code := get(t, Handler(home, noChoose(t), owners(), SkillHomes{}, binarySettings), "localhost", "/api/settings?path="+q(project), &got)
			if code == 200 || !strings.Contains(got.Error, want) {
				t.Fatalf("status %d, error %q, want %s", code, got.Error, want)
			}
		})
	}
}

// Contract test: a malformed parent file reports a document error rather
// than silently handing the page the nearer partial's fields.
func TestSettingsCompositionKeepsMalformedParentAsAnErrorItem(t *testing.T) {
	t.Parallel()
	base := realDir(t, t.TempDir())
	home, repo := filepath.Join(base, "home"), filepath.Join(base, "repo")
	bad := filepath.Join(home, "processes", "p.yaml")
	write(t, bad, "prompt: review\n---\nprompt: ignored\n")
	write(t, filepath.Join(repo, ".agister", "processes", "p.yaml"), "guidance: []\n")
	store, err := binarySettings(home, repo, repo, pageSettingsReader(os.ReadFile, map[string]string{}))
	if err != nil {
		t.Fatal(err)
	}
	files, sources, err := settingsComposition(store)
	if err != nil {
		t.Fatal(err)
	}
	if _, found := files["processes/p.yaml"]; found {
		t.Fatal("broken composition has text")
	}
	source := sources["processes/p.yaml"].(map[string]any)
	if message, _ := source["error"].(string); !strings.Contains(message, bad) || !strings.Contains(message, "must hold exactly one YAML document") {
		t.Fatalf("source %+v", source)
	}
}

type reportedSettings struct {
	Files, ComposedFiles map[string]string
	Sources              map[string]struct {
		Layers []struct {
			Layer, Path string
			Fields      []string
		}
	}
}

func assertReportedDocument(t *testing.T, got reportedSettings, store fsdefs.Layered, file string, kind definition.Kind) {
	t.Helper()
	name := strings.TrimSuffix(filepath.Base(file), filepath.Ext(file))
	doc, err := store.Read(context.Background(), kind, name)
	if err != nil {
		t.Fatal(err)
	}
	if got.ComposedFiles[file] != string(doc.Bytes) {
		t.Fatalf("%s: text %q, want %q", file, got.ComposedFiles[file], doc.Bytes)
	}
	layers := got.Sources[file].Layers
	if len(layers) != len(doc.Source.Layers) {
		t.Fatalf("%s: layers %+v, want %+v", file, layers, doc.Source.Layers)
	}
	for i, want := range doc.Source.Layers {
		if layers[i].Layer != string(want.Layer) || layers[i].Path != want.Path || !reflect.DeepEqual(layers[i].Fields, want.Fields) {
			t.Errorf("%s: layer %+v, want %+v", file, layers[i], want)
		}
	}
}

// Contract test: an external directory symlink selects the same temporary
// worktree and project as its target and the binary's selector.
func TestSettingsEndpointSelectsLayersThroughLaunchSymlink(t *testing.T) {
	t.Parallel()
	base := realDir(t, t.TempDir())
	home, repo := filepath.Join(base, "home"), filepath.Join(base, "repo")
	project := filepath.Join(repo, "docs")
	write(t, filepath.Join(repo, ".git"), "gitdir: marker\n")
	write(t, filepath.Join(home, "processes", "p.yaml"), "prompt: rules\nguidance: [home]\n")
	write(t, filepath.Join(repo, ".agister", "processes", "p.yaml"), "uses: agent:a\n")
	write(t, filepath.Join(project, ".agister", "processes", "p.yaml"), "guidance: [project]\n")
	link := filepath.Join(base, "outside", "launch")
	symlink(t, project, link)
	h := Handler(home, noChoose(t), owners(), SkillHomes{}, binarySettings)
	var target, alias reportedSettings
	for path, got := range map[string]*reportedSettings{project: &target, link: &alias} {
		if code := get(t, h, "localhost", "/api/settings?path="+q(path), got); code != 200 {
			t.Fatalf("%s: status %d", path, code)
		}
	}
	if !reflect.DeepEqual(alias, target) {
		t.Fatalf("link %+v, target %+v", alias, target)
	}
	store, err := fsdefs.Select(fsdefs.Store{Dir: home}, repo, link)
	if err != nil {
		t.Fatal(err)
	}
	assertReportedDocument(t, alias, store, "processes/p.yaml", definition.KindProcess)
}

// Contract test: runtime skills are inventoried at the temporary worktree's
// root even when only home or a project supplies settings.
func TestEndpointsKeepRootWithoutRepositorySettings(t *testing.T) {
	t.Parallel()
	for _, projectSettings := range []bool{false, true} {
		t.Run(fmt.Sprint(projectSettings), func(t *testing.T) {
			t.Parallel()
			base := realDir(t, t.TempDir())
			home, repo := filepath.Join(base, "home"), filepath.Join(base, "repo")
			launch := filepath.Join(repo, "docs")
			write(t, filepath.Join(repo, ".git"), "gitdir: marker\n")
			mkdir(t, launch)
			if projectSettings {
				mkdir(t, filepath.Join(launch, ".agister"))
			}
			write(t, filepath.Join(home, "runtimes", "main.yaml"), "adapter: codex\n")
			write(t, filepath.Join(repo, ".agents", "skills", "rules", "SKILL.md"), skillMD("rules", "Root rules."))
			// Distinct answers make using the launch directory observable.
			write(t, filepath.Join(launch, ".agents", "skills", "wrong", "SKILL.md"), skillMD("wrong", "Project rules."))
			h := Handler(home, noChoose(t), owners(), SkillHomes{}, binarySettings)
			var got reportedSettings
			if code := get(t, h, "localhost", "/api/settings?path="+q(launch), &got); code != 200 {
				t.Fatalf("settings status %d", code)
			}
			store, err := fsdefs.Select(fsdefs.Store{Dir: home}, repo, launch)
			if err != nil {
				t.Fatal(err)
			}
			assertReportedDocument(t, got, store, "runtimes/main.yaml", definition.KindRuntime)
			var skills SkillsReply
			if code := get(t, h, "localhost", "/api/skills?path="+q(launch), &skills); code != 200 {
				t.Fatalf("skills status %d", code)
			}
			if !reflect.DeepEqual(skills.Adapters, []string{"codex"}) {
				t.Fatalf("adapters %v", skills.Adapters)
			}
			folder := skills.Folders[0]
			if folder.Path != filepath.Join(repo, ".agents", "skills") || len(folder.Skills) != 1 || folder.Skills[0].Name != "rules" {
				t.Fatalf("root inventory %+v", folder)
			}
		})
	}
}

// Contract test: the layered filesystem store opens only the nearest whole
// prompt/schema, while the read seam deterministically refuses farther files.
func TestEndpointsDoNotOpenReplacedWholeDocuments(t *testing.T) {
	t.Parallel()
	base := realDir(t, t.TempDir())
	home, repo := filepath.Join(base, "home"), filepath.Join(base, "repo")
	write(t, filepath.Join(repo, ".git"), "gitdir: marker\n")
	write(t, filepath.Join(home, "processes", "p.yaml"), "prompt: rules\noutput: schema:result\n")
	write(t, filepath.Join(home, "runtimes", "main.yaml"), "adapter: codex\n")
	denied := map[string]bool{}
	for rel, text := range map[string]string{"prompts/rules.md": "Repo rules.\n", "schemas/result.json": "{}\n"} {
		path := filepath.Join(home, rel)
		write(t, path, "farther\n")
		denied[path] = true
		write(t, filepath.Join(repo, ".agister", rel), text)
	}
	read := func(path string) ([]byte, error) {
		if denied[path] {
			t.Errorf("opened replaced whole document %s", path)
			return nil, &os.PathError{Op: "open", Path: path, Err: fs.ErrPermission}
		}
		return os.ReadFile(path)
	}
	h := handler(home, noChoose(t), owners(), SkillHomes{}, binarySettings, read)
	var got reportedSettings
	if code := get(t, h, "localhost", "/api/settings?path="+q(repo), &got); code != 200 {
		t.Fatalf("settings status %d", code)
	}
	store, err := fsdefs.Select(fsdefs.Store{Dir: home}, repo, repo)
	if err != nil {
		t.Fatal(err)
	}
	assertReportedDocument(t, got, store, "prompts/rules.md", definition.KindPrompt)
	assertReportedDocument(t, got, store, "schemas/result.json", definition.KindSchema)
	// Runtime discovery also must not open an unrelated prompt.
	unrelated := filepath.Join(home, "prompts", "unrelated.md")
	write(t, unrelated, "not read by runtime inventory\n")
	denied[unrelated] = true
	var skills SkillsReply
	if code := get(t, h, "localhost", "/api/skills?path="+q(repo), &skills); code != 200 || !reflect.DeepEqual(skills.Adapters, []string{"codex"}) {
		t.Fatalf("skills status %d: %+v", code, skills)
	}
}

// A prompt a process names is resolved through the nearer layer's library
// before the prompt inventory is read, so home's direct prompt of that name,
// which the library replaces, is never opened (ADR-028 rules 6 and 9).
//
// Contract test: temporary settings and a library folder, through the
// endpoint and the binary's filesystem store, with the read seam refusing
// the replaced file.
func TestSettingsEndpointResolvesNamedPromptsBeforeTheInventory(t *testing.T) {
	t.Parallel()
	base := realDir(t, t.TempDir())
	home, repo := filepath.Join(base, "home"), filepath.Join(base, "repo")
	write(t, filepath.Join(repo, ".git"), "gitdir: marker\n")
	write(t, filepath.Join(home, "processes", "p.yaml"), "prompt: rules\nguidance: []\n")
	replaced := filepath.Join(home, "prompts", "rules.md")
	write(t, replaced, "Home rules.\n")
	write(t, filepath.Join(repo, ".agister", "layer.yaml"), "schema: agister.layer/v1alpha1\nprompts: [library]\n")
	write(t, filepath.Join(repo, "library", "rules.md"), "Library rules.\n")
	read := func(path string) ([]byte, error) {
		if path == replaced {
			t.Errorf("opened replaced prompt %s", path)
			return nil, &os.PathError{Op: "open", Path: path, Err: fs.ErrPermission}
		}
		return os.ReadFile(path)
	}
	var got reportedSettings
	h := handler(home, noChoose(t), owners(), SkillHomes{}, binarySettings, read)
	if code := get(t, h, "localhost", "/api/settings?path="+q(repo), &got); code != http.StatusOK {
		t.Fatalf("status %d: %+v", code, got)
	}
	if got.ComposedFiles["prompts/rules.md"] != "Library rules.\n" {
		t.Fatalf("prompt text %q", got.ComposedFiles["prompts/rules.md"])
	}
	store, err := fsdefs.Select(fsdefs.Store{Dir: home}, repo, repo)
	if err != nil {
		t.Fatal(err)
	}
	assertReportedDocument(t, got, store, "prompts/rules.md", definition.KindPrompt)
}

// Pages' size limit holds on what is read, not only on what Stat said: a
// file small on disk whose read returns more than fileCap bytes is left out
// of the composed settings and of the raw inventory, as if absent.
//
// Contract test: small temporary settings files, through the endpoint and
// the binary's filesystem store, with the read seam returning too much.
func TestSettingsEndpointLeavesOutAFileReadOverTheCap(t *testing.T) {
	t.Parallel()
	base := realDir(t, t.TempDir())
	home, repo := filepath.Join(base, "home"), filepath.Join(base, "repo")
	write(t, filepath.Join(repo, ".git"), "gitdir: marker\n")
	dir := filepath.Join(repo, ".agister")
	write(t, filepath.Join(home, "processes", "p.yaml"), "prompt: rules\nguidance: []\noutput: {schema: result}\n")
	grown := map[string]bool{}
	for _, rel := range []string{"schemas/result.json", "processes/nested/notes.yaml"} {
		path := filepath.Join(dir, filepath.FromSlash(rel))
		write(t, path, "{}\n")
		grown[path] = true
	}
	write(t, filepath.Join(dir, "processes", "nested", "kept.yaml"), "kept: true\n")
	read := func(path string) ([]byte, error) {
		if grown[path] {
			return []byte(strings.Repeat("x", fileCap+1)), nil
		}
		return os.ReadFile(path)
	}
	var got reportedSettings
	h := handler(home, noChoose(t), owners(), SkillHomes{}, binarySettings, read)
	if code := get(t, h, "localhost", "/api/settings?path="+q(repo), &got); code != http.StatusOK {
		t.Fatalf("status %d", code)
	}
	if _, found := got.ComposedFiles["schemas/result.json"]; found {
		t.Error("an oversized schema read is composed")
	}
	if _, found := got.Sources["schemas/result.json"]; found {
		t.Error("an oversized schema read has provenance")
	}
	if !reflect.DeepEqual(got.Files, map[string]string{"processes/nested/kept.yaml": "kept: true\n"}) {
		t.Errorf("raw inventory %v", got.Files)
	}
	if _, found := got.ComposedFiles["processes/p.yaml"]; !found {
		t.Errorf("home's process is not composed: %v", got.ComposedFiles)
	}
}

// Contract test: a symlinked process partial supplies fields and provenance
// through the temporary filesystem exactly as the binary's store reads it.
func TestSettingsEndpointIncludesSymlinkedPartial(t *testing.T) {
	t.Parallel()
	base := realDir(t, t.TempDir())
	home, repo := filepath.Join(base, "home"), filepath.Join(base, "repo")
	project := filepath.Join(repo, "docs")
	write(t, filepath.Join(repo, ".git"), "gitdir: marker\n")
	write(t, filepath.Join(home, "processes", "p.yaml"), "prompt: rules\nguidance: [style]\n")
	partial := filepath.Join(base, "partial.yaml")
	write(t, partial, "guidance: []\n")
	symlink(t, partial, filepath.Join(project, ".agister", "processes", "p.yaml"))
	var got reportedSettings
	if code := get(t, Handler(home, noChoose(t), owners(), SkillHomes{}, binarySettings), "localhost", "/api/settings?path="+q(project), &got); code != 200 {
		t.Fatalf("status %d", code)
	}
	store, err := fsdefs.Select(fsdefs.Store{Dir: home}, repo, project)
	if err != nil {
		t.Fatal(err)
	}
	assertReportedDocument(t, got, store, "processes/p.yaml", definition.KindProcess)
	if !strings.Contains(got.ComposedFiles["processes/p.yaml"], "guidance: []") {
		t.Fatalf("symlink partial did not clear guidance: %+v", got)
	}
}

// Contract test: ignored .yml files neither supply layers nor break valid
// temporary settings, even beside a recognized file of the same stem.
func TestEndpointsIgnoreYmlDocuments(t *testing.T) {
	t.Parallel()
	base := realDir(t, t.TempDir())
	home, repo := filepath.Join(base, "home"), filepath.Join(base, "repo")
	write(t, filepath.Join(repo, ".git"), "gitdir: marker\n")
	write(t, filepath.Join(home, "runtimes", "main.yaml"), "adapter: pi\n")
	write(t, filepath.Join(home, "runtimes", "main.yml"), "adapter: [\n")
	write(t, filepath.Join(repo, ".agister", "runtimes", "main.yml"), "adapter: codex\n")
	h := Handler(home, noChoose(t), owners(), SkillHomes{}, binarySettings)
	var got reportedSettings
	if code := get(t, h, "localhost", "/api/settings?path="+q(repo), &got); code != 200 {
		t.Fatalf("settings status %d", code)
	}
	store, err := fsdefs.Select(fsdefs.Store{Dir: home}, repo, repo)
	if err != nil {
		t.Fatal(err)
	}
	assertReportedDocument(t, got, store, "runtimes/main.yaml", definition.KindRuntime)
	if _, found := got.Files["runtimes/main.yml"]; found || len(got.Sources) != 1 {
		t.Fatalf("ignored file in inventory: %+v", got)
	}
	var skills SkillsReply
	if code := get(t, h, "localhost", "/api/skills?path="+q(repo), &skills); code != 200 || !reflect.DeepEqual(skills.Adapters, []string{"pi"}) {
		t.Fatalf("skills status %d: %+v", code, skills)
	}
}

// Contract test: nonempty guidance resolves text and provenance from a
// layer.yaml prompt library, through the endpoint and the binary's store.
func TestSettingsEndpointReadsGuidanceFromLayerPromptFolder(t *testing.T) {
	t.Parallel()
	base := realDir(t, t.TempDir())
	home, repo := filepath.Join(base, "home"), filepath.Join(base, "repo")
	write(t, filepath.Join(repo, ".git"), "gitdir: marker\n")
	write(t, filepath.Join(home, "processes", "p.yaml"), "prompt: rules\nguidance: [style]\n")
	write(t, filepath.Join(home, "prompts", "rules.md"), "Home rules.\n")
	write(t, filepath.Join(repo, ".agister", "layer.yaml"), "schema: agister.layer/v1alpha1\nprompts: [library]\n")
	write(t, filepath.Join(repo, "library", "style.md"), "Library style.\n")
	var got reportedSettings
	if code := get(t, Handler(home, noChoose(t), owners(), SkillHomes{}, binarySettings), "localhost", "/api/settings?path="+q(repo), &got); code != 200 {
		t.Fatalf("status %d", code)
	}
	store, err := fsdefs.Select(fsdefs.Store{Dir: home}, repo, repo)
	if err != nil {
		t.Fatal(err)
	}
	assertReportedDocument(t, got, store, "processes/p.yaml", definition.KindProcess)
	assertReportedDocument(t, got, store, "prompts/style.md", definition.KindPrompt)
	if got.ComposedFiles["prompts/style.md"] != "Library style.\n" {
		t.Fatalf("guidance text %+v", got.ComposedFiles)
	}
}

// A layer's file that is not regular is refused, not left out: the page
// neither waits on it nor shows the parent's fields in its place (ADR-028
// rule 5). Its layers are still named.
//
// Contract test: a named pipe in temporary settings, as the endpoint reads
// them.
func TestSettingsEndpointRefusesALayerFileThatIsNotRegular(t *testing.T) {
	t.Parallel()
	base := realDir(t, t.TempDir())
	home, repo := filepath.Join(base, "home"), filepath.Join(base, "repo")
	write(t, filepath.Join(repo, ".git"), "gitdir: marker\n")
	write(t, filepath.Join(home, "processes", "p.yaml"), "prompt: rules\nguidance: [style]\n")
	pipe := filepath.Join(repo, ".agister", "processes", "p.yaml")
	mkdir(t, filepath.Dir(pipe))
	if err := syscall.Mkfifo(pipe, 0o600); err != nil {
		t.Fatal(err)
	}
	var got struct {
		ComposedFiles map[string]string
		Sources       map[string]struct {
			Error  string
			Layers []struct{ Layer, Path string }
		}
	}
	if code := get(t, Handler(home, noChoose(t), owners(), SkillHomes{}, binarySettings), "localhost", "/api/settings?path="+q(repo), &got); code != 200 {
		t.Fatalf("status %d", code)
	}
	source := got.Sources["processes/p.yaml"]
	if _, found := got.ComposedFiles["processes/p.yaml"]; found || !strings.Contains(source.Error, pipe+": not a regular file") ||
		len(source.Layers) != 1 || source.Layers[0].Layer != "repository" || source.Layers[0].Path != pipe {
		t.Fatalf("composed %q, source %+v", got.ComposedFiles["processes/p.yaml"], source)
	}
}
