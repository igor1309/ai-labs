package pages

import (
	"context"
	"net/http"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/adapters/fsdefs"
	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
)

// Contract test: temporary settings files and worktree markers are read by
// the endpoint; text and provenance match the binary's filesystem store.
func TestSettingsEndpointComposesThreeLayersWithTheBinarysProvenance(t *testing.T) {
	t.Parallel()
	base := t.TempDir()
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
	h := Handler(home, noChoose(t), owners(), SkillHomes{})
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
			base := t.TempDir()
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
			code := get(t, Handler(home, noChoose(t), owners(), SkillHomes{}), "localhost", "/api/settings?path="+q(project), &got)
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
	base := t.TempDir()
	home, repo := filepath.Join(base, "home"), filepath.Join(base, "repo")
	bad := filepath.Join(home, "processes", "p.yaml")
	write(t, bad, "prompt: review\n---\nprompt: ignored\n")
	write(t, filepath.Join(repo, ".agister", "processes", "p.yaml"), "guidance: []\n")
	files, sources, err := settingsComposition([]settingsLayer{{"home", home}, {"repository", filepath.Join(repo, ".agister")}}, os.ReadFile)
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
