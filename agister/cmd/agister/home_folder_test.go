package main

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"sort"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/adapters/fsdefs"
	"github.com/igor1309/ai-labs/agister/internal/contract"
	"gopkg.in/yaml.v3"
)

// projectReplacements are the documents this repository's .agister holds
// that home's settings folder holds too, by kind and name, each with the
// reason the repository's must differ from home's (ADR-027 rule 6). Every
// other document of .agister is the repository's own.
var projectReplacements = map[string]string{}

// Home's settings folder installs into an empty home with this binary, every
// file of it a settings document installed as it is, and passes check there
// as global settings, with no project settings (ADR-027 rule 7). Its only
// warnings are the implement processes' verify:repo, a slot a repository
// fills (ADR-027 rule 3). It holds no verification, no process or workflow
// of it reads a file at a fixed path (rule 4), and this repository's
// .agister shares no document with it but those projectReplacements lists
// with their reason (rule 6).
func TestTheHomeFolderInstallsAndPassesCheckAsGlobalSettings(t *testing.T) {
	t.Parallel()
	root, err := filepath.Abs(filepath.Join("..", "..", ".."))
	if err != nil {
		t.Fatal(err)
	}
	folder := filepath.Join(root, homeFolder)
	home := filepath.Join(tempDir(t), "home")
	nowhere := tempDir(t)

	// files leaves out the backups and the log, live state the folder may
	// not hold (rule 3): with nothing in it but settings, files is all of it.
	if ignored := notSettings(t, folder); len(ignored) != 0 {
		t.Fatalf("%s holds what is not settings, which install does not take: %v", homeFolder, ignored)
	}
	if r := agisterInstalling(t, "yes\n", home, nowhere, "install", folder); r.code != 0 {
		t.Fatalf("install %s: %d\n%s%s", homeFolder, r.code, r.stdout, r.stderr)
	}
	installed := files(t, home)
	delete(installed, ".write.lock")
	if want := files(t, folder); !reflect.DeepEqual(installed, want) {
		t.Fatalf("home after the install holds %v, want the folder's files %v", keys(installed), keys(want))
	}

	r := agister(t, home, nowhere, "check", "--json")
	var report contract.CheckReport
	if err := json.Unmarshal([]byte(r.stdout), &report); err != nil || r.code != 0 || len(report.Problems) != 0 {
		t.Fatalf("check: %d %v\n%s%s", r.code, err, r.stdout, r.stderr)
	}
	for _, warning := range report.Warnings {
		if !strings.Contains(warning, "names verify:repo, which does not exist") {
			t.Errorf("check warns %q, want only the verify:repo a repository fills", warning)
		}
	}

	if _, err := os.Stat(filepath.Join(folder, "verifies")); err == nil {
		t.Errorf("%s holds verifies/: a verification is a slot a repository fills", homeFolder)
	}
	if fixed := fixedFilePaths(t, folder); len(fixed) != 0 {
		t.Errorf("%s reads files at fixed paths, not settings prompts: %v", homeFolder, fixed)
	}
	shared := sharedDocuments(t, filepath.Join(root, ".agister"), folder)
	for _, document := range shared {
		if projectReplacements[document] == "" {
			t.Errorf(".agister holds %s, which %s holds too, and projectReplacements gives no reason", document, homeFolder)
		}
	}
	for document := range projectReplacements {
		if !slices.Contains(shared, document) {
			t.Errorf("projectReplacements lists %s, which .agister and %s do not both hold", document, homeFolder)
		}
	}
}

// notSettings finds what a settings folder holds that is not a settings
// document: live state such as a backup or the log, which files leaves
// out, a file beside the kinds' folders, and one in a kind's folder that
// is no document of it. Its documents, a skill among them, are none.
func TestNotSettings(t *testing.T) {
	t.Parallel()
	folder := tempDir(t)
	for _, path := range []string{"service.toml", "prompts/review.md", "skills/review/SKILL.md"} {
		write(t, filepath.Join(folder, path), "x\n")
	}
	if got := notSettings(t, folder); len(got) != 0 {
		t.Fatalf("not settings = %q, want none", got)
	}
	write(t, filepath.Join(folder, "backups", "leaked", "manifest.json"), "{}\n")
	write(t, filepath.Join(folder, "logs", "agister.jsonl"), "{}\n")
	write(t, filepath.Join(folder, "notes.md"), "x\n")
	write(t, filepath.Join(folder, "prompts", "review.txt"), "x\n")
	want := []string{"backups/", "logs/", "notes.md", "prompts/review.txt"}
	if got := notSettings(t, folder); !reflect.DeepEqual(got, want) {
		t.Fatalf("not settings = %q, want %q", got, want)
	}
}

// fixedFilePaths finds a fixed path where a process or a workflow of
// folder takes a file input: its path names no param, and absolute or
// relative, it is a path of a machine or a repository. A file a param
// names is none.
func TestFixedFilePaths(t *testing.T) {
	t.Parallel()
	folder := tempDir(t)
	write(t, filepath.Join(folder, "processes", "p.yaml"), "input:\n  values:\n"+
		"    brief: {source: file, path: \"${param.brief}\"}\n"+
		"    review: {source: file, path: prompts/review.md}\n"+
		"    judge: {source: file, path: /home/me/.agister/prompts/judge.md}\n")
	write(t, filepath.Join(folder, "workflows", "w.yaml"), "input:\n  values:\n"+
		"    goal: {source: file, path: \"${param.goal}\"}\n"+
		"    notes: {source: file, path: notes.md}\n")
	write(t, filepath.Join(folder, "processes", "q.yaml"), "input:\n  values:\n"+
		"    question: {source: file, path: \"${param.question}\"}\n")
	want := []string{
		"processes/p.yaml: judge reads /home/me/.agister/prompts/judge.md",
		"processes/p.yaml: review reads prompts/review.md",
		"workflows/w.yaml: notes reads notes.md",
	}
	if got := fixedFilePaths(t, folder); !reflect.DeepEqual(got, want) {
		t.Fatalf("fixed paths = %q, want %q", got, want)
	}
}

// sharedDocuments finds each document two settings folders both hold, by
// kind and name whatever its extension, a skill by its folder and the
// service as one; a document only one holds is none.
func TestSharedDocuments(t *testing.T) {
	t.Parallel()
	project, folder := tempDir(t), tempDir(t)
	for _, path := range []string{"prompts/go.md", "verifies/repo.yaml", "agents/a.toml", "processes/p.yml", "skills/s/SKILL.md", "service.toml"} {
		write(t, filepath.Join(project, path), "x\n")
	}
	for _, path := range []string{"prompts/review.md", "agents/a.toml", "processes/p.yaml", "skills/s/SKILL.md", "service.toml", "schemas/repo.json"} {
		write(t, filepath.Join(folder, path), "y\n")
	}
	want := []string{"agents/a", "processes/p", "service", "skills/s"}
	if got := sharedDocuments(t, project, folder); !reflect.DeepEqual(got, want) {
		t.Fatalf("shared = %q, want %q", got, want)
	}
}

// notSettings are the files and folders of folder that install names as
// not settings and does not take, as its source reads the folder.
func notSettings(t *testing.T, folder string) []string {
	t.Helper()
	_, ignored, err := fsdefs.Store{}.Source(context.Background(), folder)
	if err != nil {
		t.Fatal(err)
	}
	return ignored
}

// fixedFilePaths are the file inputs of folder's processes and workflows
// whose path names no param, each as "<file>: <value> reads <path>",
// sorted.
func fixedFilePaths(t *testing.T, folder string) []string {
	t.Helper()
	var fixed []string
	for _, kind := range []string{"processes", "workflows"} {
		paths, err := filepath.Glob(filepath.Join(folder, kind, "*.yaml"))
		if err != nil {
			t.Fatal(err)
		}
		for _, path := range paths {
			var document struct {
				Input struct {
					Values map[string]map[string]any `yaml:"values"`
				} `yaml:"input"`
			}
			if err := yaml.Unmarshal([]byte(read(t, path)), &document); err != nil {
				t.Fatalf("%s: %v", path, err)
			}
			for name, value := range document.Input.Values {
				if file, _ := value["path"].(string); value["source"] == "file" && !strings.Contains(file, "${param.") {
					fixed = append(fixed, kind+"/"+filepath.Base(path)+": "+name+" reads "+file)
				}
			}
		}
	}
	sort.Strings(fixed)
	return fixed
}

// sharedDocuments are the documents both settings folders hold, as
// "<kind>/<name>", or "service", sorted.
func sharedDocuments(t *testing.T, a, b string) []string {
	t.Helper()
	inB := documents(t, b)
	var shared []string
	for document := range documents(t, a) {
		if inB[document] {
			shared = append(shared, document)
		}
	}
	sort.Strings(shared)
	return shared
}

// documents are the documents of a settings folder by kind and name: a
// file's path without its extension, a skill's folder, the service as
// "service".
func documents(t *testing.T, dir string) map[string]bool {
	t.Helper()
	found := map[string]bool{}
	for rel := range files(t, dir) {
		parts := strings.Split(filepath.ToSlash(rel), "/")
		switch {
		case len(parts) == 1:
			found[strings.TrimSuffix(parts[0], filepath.Ext(parts[0]))] = true
		case parts[0] == "skills":
			found["skills/"+parts[1]] = true
		default:
			found[parts[0]+"/"+strings.TrimSuffix(parts[1], filepath.Ext(parts[1]))] = true
		}
	}
	return found
}
