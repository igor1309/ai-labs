package main

import (
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/runtimetest"
	"github.com/igor1309/ai-labs/agister/internal/adapters/schema"
	"github.com/igor1309/ai-labs/agister/internal/cli"
	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
	"gopkg.in/yaml.v3"
)

// repoParams are the values given to a process param that has no default,
// by param name; any other such param gets fallbackParam. Each is a real
// file of the repository, so a param read as a file resolves.
var repoParams = map[string]string{
	"prompt":  "prompts/code-review-architecture.md",
	"brief":   "prompts/session-resume-review.md",
	"reviews": "prompts/code-review-judge.md",
}

const fallbackParam = "AGENTS.md"

// verifyFixture is the verification command every process that declares
// verify runs in the test's repository instead of its own: it passes in a
// checkout of the candidate. The real command would run this module's own
// tests, this one included.
const verifyFixture = "grep -qx two change.txt"

// Every process of this repository's own settings (<repository root>/.agister)
// runs, as the CLI composes them over a global layer, on the fake runtimes,
// and completes with output its schema accepts. A process that names a
// missing agent, policy or schema, a schema that does not compile, an
// unknown input source or a prompt path that does not resolve from the
// repository root fails it. Processes are read from the directory, so a new
// one is tested without listing it here.
//
// The test works in a repository of its own whose top-level entries link to
// this repository's working tree (settings and prompts as they are, edits
// included), with a base and a candidate commit of its own: revisions, diffs
// and checkouts are deterministic, and this repository's git state is never
// read or written. Each base and candidate param is pointed at them. There,
// a process that declares verify runs verifyFixture instead of its command
// and completes with one passing verification attempt.
func TestRepositoryProcessesRunOnFakeRuntimes(t *testing.T) {
	root, err := filepath.Abs(filepath.Join("..", "..", ".."))
	if err != nil {
		t.Fatal(err)
	}
	entries, err := os.ReadDir(filepath.Join(root, ".agister", "processes"))
	if err != nil {
		t.Fatal(err)
	}

	// The fakes answer as claude and codex, first on PATH, each with an
	// output from the schema it is given, and report their default versions,
	// which the mappings verify (claude-code 2.1.283, codex 0.158.0).
	bin := t.TempDir()
	for name, fake := range map[string]string{"claude": "fakeclaude", "codex": "fakecodex"} {
		if err := os.Symlink(runtimetest.Binary(t, fake), filepath.Join(bin, name)); err != nil {
			t.Fatal(err)
		}
	}
	t.Setenv("PATH", bin+string(os.PathListSeparator)+os.Getenv("PATH"))
	t.Setenv("FAKE_OUTPUT", "schema")
	t.Setenv("FAKE_VERSION", "")

	repo := mirror(t, root)
	fixVerify(t, root, repo)
	home := filepath.Join(t.TempDir(), "home")
	if r := agisterInput(t, "yes\n", home, t.TempDir(), "init"); r.code != 0 {
		t.Fatalf("init: %d %s", r.code, r.stderr)
	}

	var names []string
	for _, entry := range entries {
		if !entry.IsDir() && filepath.Ext(entry.Name()) == ".yaml" {
			names = append(names, strings.TrimSuffix(entry.Name(), ".yaml"))
		}
	}
	sort.Strings(names)
	if len(names) == 0 {
		t.Fatal("the repository has no processes")
	}
	for _, name := range names {
		t.Run(name, func(t *testing.T) {
			data, err := os.ReadFile(filepath.Join(root, ".agister", "processes", name+".yaml"))
			if err != nil {
				t.Fatal(err)
			}
			process, err := definition.ParseProcess(definition.Document{
				Source: definition.Source{Kind: definition.KindProcess, Name: name, Path: name + ".yaml"}, Bytes: data,
			})
			if err != nil {
				t.Fatal(err)
			}
			args := []string{"run", name}
			for _, param := range process.Params {
				value, set := "", true
				switch {
				case param.Name == "base":
					value = "main"
				case param.Name == "candidate":
					value = "feature"
				case !param.HasDefault && repoParams[param.Name] != "":
					value = repoParams[param.Name]
				case !param.HasDefault:
					value = fallbackParam
				default:
					set = false
				}
				if set {
					args = append(args, "--param", param.Name+"="+value)
				}
			}

			before := map[string]bool{}
			for _, entry := range readRuns(t, home) {
				before[entry.Name()] = true
			}
			r := agister(t, home, repo, args...)
			if r.code != cli.ExitCompleted {
				t.Fatalf("%v: exit %d\n%s%s", args, r.code, r.stdout, r.stderr)
			}
			var created []string
			for _, entry := range readRuns(t, home) {
				if !before[entry.Name()] {
					created = append(created, entry.Name())
				}
			}
			if len(created) != 1 {
				t.Fatalf("runs recorded: %v, want one", created)
			}
			dir := filepath.Join(home, "runs", created[0])
			var record, first map[string]any
			readJSON(t, filepath.Join(dir, "record.json"), &record)
			provider, _ := os.ReadFile(filepath.Join(dir, "provider.jsonl"))
			if err := json.Unmarshal([]byte(strings.SplitN(string(provider), "\n", 2)[0]), &first); err != nil || first["argv"] == nil {
				t.Fatalf("the runtime was not a fake: %s", provider)
			}
			result := record["result"].(map[string]any)
			if result["status"] != "completed" {
				t.Fatalf("result = %v", result)
			}
			if process.Verify != nil {
				attempts, _ := record["attempts"].([]any)
				if len(attempts) != 1 {
					t.Fatalf("attempts = %v, want one", record["attempts"])
				}
				if run, _ := attempts[0].(map[string]any)["run"].(map[string]any); run["command"] != verifyFixture || run["passed"] != true {
					t.Fatalf("verification run = %v, want %q passed", run, verifyFixture)
				}
			}
			// The output is what the process's schema accepts.
			var schemaPath string
			for _, source := range record["definitions"].([]any) {
				source := source.(map[string]any)
				if source["kind"] == string(definition.KindSchema) {
					schemaPath = source["path"].(string)
				}
			}
			if process.Output.Format == "json" {
				document, err := os.ReadFile(schemaPath)
				if err != nil {
					t.Fatalf("schema of %s: %v", name, err)
				}
				output, _ := json.Marshal(result["output"])
				if err := (schema.Validator{}).Validate(document, output); err != nil {
					t.Fatalf("output %s: %v", output, err)
				}
				var printed any
				if err := json.Unmarshal([]byte(r.stdout), &printed); err != nil || !reflect.DeepEqual(printed, result["output"]) {
					t.Fatalf("stdout %s, recorded output %s: %v", r.stdout, output, err)
				}
			}
		})
	}
}

// mirror is a repository with a base commit on main and a candidate on
// feature, whose untracked top-level entries link to those of root, .git
// aside.
func mirror(t *testing.T, root string) string {
	t.Helper()
	dir, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	gitCmd(t, dir, "init", "--quiet", "--initial-branch=main")
	gitCmd(t, dir, "config", "user.email", "test@example.com")
	gitCmd(t, dir, "config", "user.name", "Test")
	gitCmd(t, dir, "config", "maintenance.auto", "false")
	write(t, filepath.Join(dir, "change.txt"), "one\n")
	gitCmd(t, dir, "add", "change.txt")
	gitCmd(t, dir, "commit", "--quiet", "-m", "base")
	gitCmd(t, dir, "checkout", "--quiet", "-b", "feature")
	write(t, filepath.Join(dir, "change.txt"), "one\ntwo\n")
	gitCmd(t, dir, "commit", "--quiet", "-am", "candidate")

	entries, err := os.ReadDir(root)
	if err != nil {
		t.Fatal(err)
	}
	var linked []string
	for _, entry := range entries {
		if entry.Name() == ".git" {
			continue
		}
		if err := os.Symlink(filepath.Join(root, entry.Name()), filepath.Join(dir, entry.Name())); err != nil {
			t.Fatal(err)
		}
		linked = append(linked, entry.Name())
	}
	// The links stay untracked, so no checkout and no diff carries them.
	exclude := filepath.Join(dir, ".git", "info", "exclude")
	if err := os.WriteFile(exclude, []byte("/"+strings.Join(linked, "\n/")+"\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if out, err := exec.Command("git", "-C", dir, "status", "--porcelain").Output(); err != nil || len(out) != 0 {
		t.Fatalf("mirror not clean: %s %v", out, err)
	}
	return dir
}

// fixVerify makes repo's .agister a directory whose entries link to those of
// root's, processes aside: there, a process that declares verify is written
// with verifyFixture as its command, and every other links to its file.
func fixVerify(t *testing.T, root, repo string) {
	t.Helper()
	settings := filepath.Join(repo, ".agister")
	if err := os.Remove(settings); err != nil {
		t.Fatal(err)
	}
	// link makes to a directory whose entries link to those of from, except
	// aside.
	link := func(from, to, except string) {
		t.Helper()
		entries, err := os.ReadDir(from)
		if err != nil {
			t.Fatal(err)
		}
		if err := os.Mkdir(to, 0o755); err != nil {
			t.Fatal(err)
		}
		for _, entry := range entries {
			if entry.Name() == except {
				continue
			}
			if err := os.Symlink(filepath.Join(from, entry.Name()), filepath.Join(to, entry.Name())); err != nil {
				t.Fatal(err)
			}
		}
	}
	link(filepath.Join(root, ".agister"), settings, "processes")
	link(filepath.Join(root, ".agister", "processes"), filepath.Join(settings, "processes"), "")

	processes, err := filepath.Glob(filepath.Join(settings, "processes", "*.yaml"))
	if err != nil {
		t.Fatal(err)
	}
	for _, path := range processes {
		data, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		var document yaml.Node
		if err := yaml.Unmarshal(data, &document); err != nil {
			t.Fatalf("%s: %v", path, err)
		}
		command := valueOf(valueOf(document.Content[0], "verify"), "command")
		if command == nil {
			continue
		}
		command.SetString(verifyFixture)
		fixed, err := yaml.Marshal(&document)
		if err != nil {
			t.Fatal(err)
		}
		if err := os.Remove(path); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, fixed, 0o644); err != nil {
			t.Fatal(err)
		}
	}
}

// valueOf is the value of key in mapping, or nil.
func valueOf(mapping *yaml.Node, key string) *yaml.Node {
	if mapping == nil || mapping.Kind != yaml.MappingNode {
		return nil
	}
	for i := 0; i+1 < len(mapping.Content); i += 2 {
		if mapping.Content[i].Value == key {
			return mapping.Content[i+1]
		}
	}
	return nil
}

func readRuns(t *testing.T, home string) []os.DirEntry {
	t.Helper()
	entries, err := os.ReadDir(filepath.Join(home, "runs"))
	if err != nil && !os.IsNotExist(err) {
		t.Fatal(err)
	}
	return entries
}
