package main

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"regexp"
	"slices"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/cli"
)

// Prompts are settings (ADR-014), on real settings directories: Agister's
// home and a repository's .agister, composed by the layered store. A
// process names its prompt in prompt (ADR-028 rule 8).

const promptingProcess = `schema: agister.process/v1alpha1
name: reviewed
type: process
uses: agent:assistant
policy: process-policy:read-only
prompt: review
input:
  instruction: Follow the rules.
output:
  format: text
`

// promptRun runs reviewed from cwd and returns what its record says of
// each input, by name, and of its prompt review among its definitions,
// and the prompt the agent was given.
func promptRun(t *testing.T, home, cwd string) (inputs map[string]map[string]any, source map[string]any, given string) {
	t.Helper()
	// Run IDs sort by the second they start in, so the run is the one new.
	before := map[string]bool{}
	entries, _ := os.ReadDir(filepath.Join(home, "runs"))
	for _, entry := range entries {
		before[entry.Name()] = true
	}
	if r := agister(t, home, cwd, "run", "reviewed", "--quiet", "--timeout", "1m"); r.code != cli.ExitCompleted {
		t.Fatalf("run from %s: %d\n%s%s", cwd, r.code, r.stdout, r.stderr)
	}
	var added []string
	entries, _ = os.ReadDir(filepath.Join(home, "runs"))
	for _, entry := range entries {
		if !before[entry.Name()] {
			added = append(added, entry.Name())
		}
	}
	if len(added) != 1 {
		t.Fatalf("new runs = %v", added)
	}
	last := lastRunIn(t, filepath.Join(home, "runs", added[0]))
	inputs = map[string]map[string]any{}
	recorded, _ := last.record["inputs"].([]any)
	for _, input := range recorded {
		input := input.(map[string]any)
		inputs[input["name"].(string)] = input
	}
	definitions, _ := last.record["definitions"].([]any)
	for _, d := range definitions {
		if d := d.(map[string]any); d["kind"] == "prompts" && d["name"] == "review" {
			if source != nil {
				t.Fatalf("the prompt is recorded twice: %v", definitions)
			}
			source = d
		}
	}
	given, _ = last.first["prompt"].(string)
	return inputs, source, given
}

// nearest is the nearest layer file of a definition a run recorded.
func nearest(source map[string]any) map[string]any {
	layers, _ := source["layers"].([]any)
	if len(layers) == 0 {
		return map[string]any{}
	}
	file, _ := layers[0].(map[string]any)
	return file
}

// homeFile and repositoryFile are a document taken whole as a run records
// it: the one layer file it was read from.
func homeFile(kind, name, path, text string) map[string]any {
	return map[string]any{"kind": kind, "name": name, "layers": []any{map[string]any{"layer": "home", "path": path, "sha256": digestOf(text)}}}
}

func repositoryFile(kind, name, path, text string) map[string]any {
	return map[string]any{"kind": kind, "name": name, "layers": []any{map[string]any{"layer": "repository", "path": path, "sha256": digestOf(text)}}}
}

func digestOf(text string) string {
	sum := sha256.Sum256([]byte(text))
	return hex.EncodeToString(sum[:])
}

// The issue's case (LAB-50): the process and the prompt are global, run
// from a repository with no prompts/ of its own at its root. The input is
// home's text, and the prompt is among the call's sources as a global
// document; with .agister/prompts/review.md in the repository, the
// repository's text wins as a project document. The call's directory has
// no say in either.
func TestAPromptIsFoundInTheSettingsNotTheCallersDirectory(t *testing.T) {
	t.Parallel()
	home, repo := setup(t, "approve")
	write(t, filepath.Join(home, "processes", "reviewed.yaml"), promptingProcess)
	global, homeText := filepath.Join(home, "prompts", "review.md"), "Home's review rules.\n"
	write(t, global, homeText)
	// A directory of the repository with a prompts/review.md of its own,
	// which a path relative to the caller would find.
	sub := filepath.Join(repo, "sub")
	write(t, filepath.Join(sub, "prompts", "review.md"), "The caller's directory's rules.\n")

	for _, cwd := range []string{repo, sub} {
		inputs, source, given := promptRun(t, home, cwd)
		input := inputs["prompt"]
		if input["source"] != "prompt" || input["value"] != homeText || input["identity"] != "sha256:"+digestOf(homeText) {
			t.Fatalf("from %s: input = %v", cwd, input)
		}
		if !reflect.DeepEqual(source, homeFile("prompts", "review", global, homeText)) {
			t.Fatalf("from %s: source = %v", cwd, source)
		}
		if !strings.Contains(given, homeText) || strings.Contains(given, "caller's directory") {
			t.Fatalf("from %s: the agent was given:\n%s", cwd, given)
		}
	}

	project, repoText := filepath.Join(repo, ".agister", "prompts", "review.md"), "The repository's review rules.\n"
	write(t, project, repoText)
	for _, cwd := range []string{repo, sub} {
		inputs, source, given := promptRun(t, home, cwd)
		if input := inputs["prompt"]; input["value"] != repoText || input["identity"] != "sha256:"+digestOf(repoText) {
			t.Fatalf("from %s: input = %v", cwd, input)
		}
		if !reflect.DeepEqual(source, repositoryFile("prompts", "review", project, repoText)) {
			t.Fatalf("from %s: source = %v", cwd, source)
		}
		if !strings.Contains(given, repoText) || strings.Contains(given, homeText) {
			t.Fatalf("from %s: the agent was given:\n%s", cwd, given)
		}
	}

	r := agister(t, home, repo, "check", "--tree")
	if r.code != 0 || !regexp.MustCompile(`process reviewed +home .*\n(.*\n)*└─ prompt review +repository `+regexp.QuoteMeta(project)+`\n +home +`+regexp.QuoteMeta(global)+` \(replaced\)\n`).MatchString(r.stdout) {
		t.Fatalf("check --tree: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	r = agister(t, home, repo, "process", "show", "reviewed")
	if r.code != 0 || !strings.Contains(r.stdout, "prompt       review: repository "+project+"\n") ||
		!regexp.MustCompile(`prompt review: repository `+regexp.QuoteMeta(project)+`\n +home `+regexp.QuoteMeta(global)+` \(replaced\)\n`).MatchString(r.stdout) {
		t.Fatalf("process show: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
}

// A prompt in neither layer is a problem of the settings, on the process
// that names it, and a call of it is refused before its first turn
// (ADR-015).
func TestAPromptInNeitherLayerIsAProblemOfTheProcess(t *testing.T) {
	t.Parallel()
	home, repo := setup(t, "approve")
	process := filepath.Join(home, "processes", "reviewed.yaml")
	write(t, process, promptingProcess)
	problem := `process reviewed: prompt "review" does not exist`
	r := agister(t, home, repo, "check", "--tree")
	if r.code != cli.ExitUsage || !strings.Contains(r.stderr, problem+"\n  refuses process reviewed\n") || !regexp.MustCompile(`└─ prompt review +MISSING\n`).MatchString(r.stdout) {
		t.Fatalf("check --tree: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	runs := &newRuns{home: home}
	runs.take(t)
	want := `process reviewed (` + process + `): prompt "review" does not exist`
	if r := agister(t, home, repo, "run", "reviewed", "--quiet", "--timeout", "1m"); r.code != cli.ExitRefused || !strings.Contains(r.stderr, want) {
		t.Fatalf("run: %d, want %q\n%s%s", r.code, want, r.stdout, r.stderr)
	}
	if refused := runs.one(t); refused.first != nil {
		t.Fatalf("the refused call reached the runtime: %v", refused.first)
	}
}

// A prompt that is not readable text is a problem of that document alone;
// it refuses the process that uses it (ADR-015).
func TestAnUnreadablePromptIsAProblemOfItsOwn(t *testing.T) {
	t.Parallel()
	home, repo := setup(t, "approve")
	write(t, filepath.Join(home, "processes", "reviewed.yaml"), promptingProcess)
	prompt := filepath.Join(repo, ".agister", "prompts", "review.md")
	write(t, prompt, "\x00\xff")
	r := agister(t, home, repo, "check")
	if r.code != cli.ExitUsage || !strings.Contains(r.stderr, "prompt review: not a UTF-8 text file\n  refuses process reviewed\n1 problem(s) in ") || strings.Contains(r.stderr, "process reviewed:") {
		t.Fatalf("check: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	runs := &newRuns{home: home}
	runs.take(t)
	want := "process reviewed uses prompt review (" + prompt + "): not a UTF-8 text file"
	if r := agister(t, home, repo, "run", "reviewed", "--quiet", "--timeout", "1m"); r.code != cli.ExitRefused || !strings.Contains(r.stderr, want) {
		t.Fatalf("run: %d, want %q\n%s%s", r.code, want, r.stdout, r.stderr)
	}
	if refused := runs.one(t); refused.first != nil {
		t.Fatalf("the refused call reached the runtime: %v", refused.first)
	}
}

// ADR-014 rule 5: settings that read a file in prompts/ through source:
// file keep working, whatever the file's name. One whose name breaks the
// naming rule is not a prompt document, so check has nothing to say of it,
// and the call gets the file's text as a value, before its prompt.
func TestAFileInPromptsReadThroughSourceFileKeepsWorking(t *testing.T) {
	t.Parallel()
	home, repo := setup(t, "approve")
	path, text := filepath.Join(home, "prompts", "Legacy_Rules.md"), "Legacy review rules.\n"
	write(t, path, text)
	write(t, filepath.Join(home, "prompts", "review.md"), "Home's review rules.\n")
	write(t, filepath.Join(home, "processes", "reviewed.yaml"), strings.Replace(promptingProcess,
		"  instruction: Follow the rules.\n", "  instruction: Follow the rules.\n  values:\n    rules: {source: file, path: "+path+"}\n", 1))
	if r := agister(t, home, repo, "check"); r.code != 0 || strings.Contains(r.stderr, "problem") {
		t.Fatalf("check: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	inputs, source, given := promptRun(t, home, repo)
	if input := inputs["rules"]; input["source"] != "file" || input["value"] != text || source["name"] != "review" {
		t.Fatalf("input = %v, prompt source = %v", input, source)
	}
	if !strings.Contains(given, text) || strings.Index(given, text) > strings.Index(given, "Home's review rules.") {
		t.Fatalf("the agent was given:\n%s", given)
	}
}

// D-11 of ADR-019, kept by ADR-028 rule 6: a directory at the
// repository's prompt path is not a prompt the layer lacks, so home's is
// not given in its place. check reports it as a broken prompt that refuses
// the process, and a call of it is refused before its first turn.
func TestADirectoryAtAPromptsPathRefusesTheCall(t *testing.T) {
	t.Parallel()
	home, repo := setup(t, "approve")
	write(t, filepath.Join(home, "processes", "reviewed.yaml"), promptingProcess)
	write(t, filepath.Join(home, "prompts", "review.md"), "Home's review rules.\n")
	prompt := filepath.Join(repo, ".agister", "prompts", "review.md")
	if err := os.MkdirAll(prompt, 0o755); err != nil {
		t.Fatal(err)
	}

	r := agister(t, home, repo, "check", "--tree")
	if r.code != cli.ExitUsage || !regexp.MustCompile(`prompt review: .*is a directory\n  refuses process reviewed\n`).MatchString(r.stderr) {
		t.Fatalf("check --tree: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	runs := &newRuns{home: home}
	runs.take(t)
	want := "process reviewed uses prompt review (" + prompt + "): "
	if r := agister(t, home, repo, "run", "reviewed", "--quiet", "--timeout", "1m"); r.code != cli.ExitRefused || !strings.Contains(r.stderr, want) || !strings.Contains(r.stderr, "is a directory") {
		t.Fatalf("run: %d, want %q\n%s%s", r.code, want, r.stdout, r.stderr)
	}
	if refused := runs.one(t); refused.first != nil {
		t.Fatalf("the refused call reached the runtime: %v", refused.first)
	}
}

// Nor is a dangling symlink at the repository's prompts folder or at the
// prompt's file, with home holding the prompt. check reports it, and a
// call of it is refused before its first turn. A folder that cannot be
// listed stops every command (ADR-015 rule 4), so that call records no run
// at all; a file that cannot be read refuses the process, and its call's
// record.
func TestADanglingLinkAtAPromptsPathRefusesTheCall(t *testing.T) {
	t.Parallel()
	for name, c := range map[string]struct {
		plant func(folder string) (string, error)
		check string
		stops bool
	}{
		"folder": {
			plant: func(folder string) (string, error) {
				if err := os.MkdirAll(filepath.Dir(folder), 0o755); err != nil {
					return folder, err
				}
				return folder, os.Symlink(filepath.Join(filepath.Dir(folder), "nowhere"), folder)
			},
			check: "settings directory prompts: cannot be listed: ", stops: true,
		},
		"file": {
			plant: func(folder string) (string, error) {
				link := filepath.Join(folder, "review.md")
				if err := os.MkdirAll(folder, 0o755); err != nil {
					return link, err
				}
				return link, os.Symlink(filepath.Join(folder, "nowhere.md"), link)
			},
			check: "prompt review: cannot be resolved: ",
		},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			home, repo := setup(t, "approve")
			write(t, filepath.Join(home, "processes", "reviewed.yaml"), promptingProcess)
			write(t, filepath.Join(home, "prompts", "review.md"), "Home's review rules.\n")
			link, err := c.plant(filepath.Join(repo, ".agister", "prompts"))
			if err != nil {
				t.Fatal(err)
			}

			r := agister(t, home, repo, "check", "--tree")
			if r.code != cli.ExitUsage || !strings.Contains(r.stderr, c.check) || !strings.Contains(r.stderr, link) {
				t.Fatalf("check --tree: %d\n%s%s", r.code, r.stdout, r.stderr)
			}
			runs := &newRuns{home: home}
			runs.take(t)
			r = agister(t, home, repo, "run", "reviewed", "--quiet", "--timeout", "1m")
			if c.stops {
				if r.code != cli.ExitUsage || !strings.Contains(r.stderr, c.check) {
					t.Fatalf("run: %d\n%s%s", r.code, r.stdout, r.stderr)
				}
				if recorded := runs.take(t); len(recorded) != 0 {
					t.Fatalf("%d runs recorded, want none", len(recorded))
				}
				return
			}
			if want := "process reviewed uses prompt review (" + link + "): cannot be resolved"; r.code != cli.ExitRefused || !strings.Contains(r.stderr, want) {
				t.Fatalf("run: %d, want %q\n%s%s", r.code, want, r.stdout, r.stderr)
			}
			if refused := runs.one(t); refused.first != nil {
				t.Fatalf("the refused call reached the runtime: %v", refused.first)
			}
		})
	}
}

// guidedProcess is promptingProcess with names as its guidance.
func guidedProcess(names []string) string {
	return strings.Replace(promptingProcess, "prompt: review\n", "prompt: review\nguidance: ["+strings.Join(names, ", ")+"]\n", 1)
}

// ADR-028 rule 8: the agent is given the prompt as the input prompt, then
// each guidance prompt, in the list's order, as the input
// guidance.<name>, each from the nearest layer that has it and recorded
// with its digest. A guidance name no layer has is a problem of the
// process and refuses its call before its first turn. Each case lists,
// for each guidance name in turn, the layer it is nearest in: it is
// written there and in every layer farther out, each layer's text its own.
func TestEachGuidancePromptIsGivenFromTheNearestLayerThatHasIt(t *testing.T) {
	t.Parallel()
	names := []string{"style", "testing"}
	layers := []string{"project", "repository", "home"}
	for _, where := range [][]string{
		{},
		{"project"}, {"repository"}, {"home"}, {"nowhere"},
		{"project", "repository"}, {"repository", "home"}, {"home", "project"},
		{"project", "project"}, {"home", "nowhere"}, {"nowhere", "repository"},
	} {
		t.Run(fmt.Sprintf("%d %v", len(where), where), func(t *testing.T) {
			t.Parallel()
			home, repo := setup(t, "approve")
			launch := filepath.Join(repo, "docs")
			dirs := map[string]string{"home": home, "repository": filepath.Join(repo, ".agister"), "project": filepath.Join(launch, ".agister")}
			if err := os.MkdirAll(dirs["project"], 0o755); err != nil {
				t.Fatal(err)
			}
			process := filepath.Join(home, "processes", "reviewed.yaml")
			guidance := names[:len(where)]
			write(t, process, guidedProcess(guidance))
			reviewPath, reviewText := filepath.Join(dirs["repository"], "prompts", "review.md"), "The repository's review rules.\n"
			write(t, reviewPath, reviewText)

			type given struct{ input, prompt, layer, path, text string }
			want := []given{{"prompt", "review", "repository", reviewPath, reviewText}}
			var missing []string
			for i, name := range guidance {
				nearest := slices.Index(layers, where[i])
				if nearest < 0 {
					missing = append(missing, name)
					continue
				}
				for _, layer := range layers[nearest:] {
					write(t, filepath.Join(dirs[layer], "prompts", name+".md"), "The "+layer+"'s "+name+" rules.\n")
				}
				want = append(want, given{"guidance." + name, name, where[i], filepath.Join(dirs[where[i]], "prompts", name+".md"), "The " + where[i] + "'s " + name + " rules.\n"})
			}

			runs := &newRuns{home: home}
			runs.take(t)
			r := agister(t, home, launch, "run", "reviewed", "--quiet", "--timeout", "1m")
			if len(missing) > 0 {
				problem := `guidance: prompt "` + missing[0] + `" does not exist`
				if check := agister(t, home, launch, "check"); check.code != cli.ExitUsage || !strings.Contains(check.stderr, "process reviewed: "+problem+"\n  refuses process reviewed\n") {
					t.Fatalf("check: %d, want %q\n%s%s", check.code, problem, check.stdout, check.stderr)
				}
				if want := "process reviewed (" + process + "): " + problem; r.code != cli.ExitRefused || !strings.Contains(r.stderr, want) {
					t.Fatalf("run: %d, want %q\n%s%s", r.code, want, r.stdout, r.stderr)
				}
				if refused := runs.one(t); refused.first != nil {
					t.Fatalf("the refused call reached the runtime: %v", refused.first)
				}
				return
			}
			if r.code != cli.ExitCompleted {
				t.Fatalf("run: %d\n%s%s", r.code, r.stdout, r.stderr)
			}
			ran := runs.one(t)
			inputs, _ := ran.record["inputs"].([]any)
			if len(inputs) != len(want) {
				t.Fatalf("inputs = %v, want %d", inputs, len(want))
			}
			prompt, _ := ran.first["prompt"].(string)
			at := 0
			for i, w := range want {
				input := inputs[i].(map[string]any)
				if input["name"] != w.input || input["source"] != "prompt" || input["identity"] != "sha256:"+digestOf(w.text) {
					t.Fatalf("input %d = %v, want %s from %s", i, input, w.input, w.path)
				}
				if file := nearest(definitionOf(t, ran, "prompts", w.prompt)); file["layer"] != w.layer || file["path"] != w.path || file["sha256"] != digestOf(w.text) {
					t.Fatalf("prompt %s recorded from %v, want %s %s", w.prompt, file, w.layer, w.path)
				}
				// Each section follows the one before it.
				next := strings.Index(prompt[at:], "## "+w.input+"\n")
				if next < 0 || !strings.Contains(prompt[at+next:], w.text) {
					t.Fatalf("the agent was not given %s after the inputs before it:\n%s", w.input, prompt)
				}
				at += next
			}
		})
	}
}

// layerFile is a layer.yaml listing folders.
func layerFile(folders ...string) string {
	return "schema: agister.layer/v1alpha1\nprompts: [" + strings.Join(folders, ", ") + "]\n"
}

// ADR-028 rule 9: a repository layer's prompt is its .agister/prompts
// file, else the first file of that name in the folders its layer.yaml
// lists, in order, each relative to the worktree's root; the layer's
// wins over home's. A listed folder is read for the names processes give
// only: its other files are neither checked nor shown.
func TestALayerFindsItsPromptsInTheFoldersItsLayerFileLists(t *testing.T) {
	t.Parallel()
	home, repo := setup(t, "approve")
	write(t, filepath.Join(home, "processes", "reviewed.yaml"), guidedProcess([]string{"style"}))
	write(t, filepath.Join(repo, ".agister", "layer.yaml"), layerFile("prompts", "docs/prompts"))
	first, second := filepath.Join(repo, "prompts"), filepath.Join(repo, "docs", "prompts")
	texts := map[string]string{
		filepath.Join(first, "review.md"):          "The first folder's review rules.\n",
		filepath.Join(second, "review.md"):         "The second folder's review rules.\n",
		filepath.Join(second, "style.md"):          "The second folder's style rules.\n",
		filepath.Join(home, "prompts", "style.md"): "Home's style rules.\n",
		filepath.Join(first, "Not A Name.md"):      "\x00\xff",
		filepath.Join(first, "notes.md"):           "\x00\xff",
	}
	for path, text := range texts {
		write(t, path, text)
	}

	review, style := filepath.Join(first, "review.md"), filepath.Join(second, "style.md")
	r := agister(t, home, repo, "check", "--tree")
	if r.code != 0 || !regexp.MustCompile(`├─ prompt review +repository `+regexp.QuoteMeta(review)+`\n`).MatchString(r.stdout) ||
		!regexp.MustCompile(`└─ prompt style +repository `+regexp.QuoteMeta(style)+` \(guidance\)\n +home +`+regexp.QuoteMeta(filepath.Join(home, "prompts", "style.md"))+` \(replaced\)\n`).MatchString(r.stdout) ||
		strings.Contains(r.stdout+r.stderr, "notes") || strings.Contains(r.stdout+r.stderr, "Not A Name") {
		t.Fatalf("check --tree: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	inputs, source, _ := promptRun(t, home, repo)
	if inputs["prompt"]["identity"] != "sha256:"+digestOf(texts[review]) || inputs["guidance.style"]["identity"] != "sha256:"+digestOf(texts[style]) || nearest(source)["path"] != review {
		t.Fatalf("inputs = %v, prompt source = %v", inputs, source)
	}

	// The layer's own prompts/ comes before the folders it lists.
	own, ownText := filepath.Join(repo, ".agister", "prompts", "review.md"), "The repository's own review rules.\n"
	write(t, own, ownText)
	if inputs, source, _ := promptRun(t, home, repo); inputs["prompt"]["identity"] != "sha256:"+digestOf(ownText) || nearest(source)["path"] != own {
		t.Fatalf("with its own: inputs = %v, prompt source = %v", inputs, source)
	}
}

// ADR-028 rule 9: a layer.yaml that cannot be used stops every command
// launched under its layer, as a broken block list does: one that is not
// valid, or that lists a folder that does not exist, is not a folder, or
// is not inside the directory that holds the layer's .agister, by an
// absolute path, a .. or a link that leaves. A project layer's stops only
// what is launched below it. Home holds no layer.yaml: one there is a
// problem of home's that stops every command.
func TestALayerFileThatCannotBeUsedStopsEveryCommandUnderItsLayer(t *testing.T) {
	t.Parallel()
	for name, c := range map[string]struct {
		plant  func(t *testing.T, root string) string // writes the file in root, and returns what the problem says
		layer  string
		reason string
	}{
		"not YAML": {layer: "repository", plant: func(t *testing.T, root string) string {
			write(t, filepath.Join(root, ".agister", "layer.yaml"), "prompts: [unclosed\n")
			return "is invalid"
		}},
		"another schema": {layer: "repository", plant: func(t *testing.T, root string) string {
			write(t, filepath.Join(root, ".agister", "layer.yaml"), "schema: agister.layer/v2\nprompts: [prompts]\n")
			return "is invalid: schema"
		}},
		"an unknown field": {layer: "repository", plant: func(t *testing.T, root string) string {
			write(t, filepath.Join(root, ".agister", "layer.yaml"), layerFile()+"skills: [skills]\n")
			return "skills: unknown field"
		}},
		"an absolute folder": {layer: "repository", plant: func(t *testing.T, root string) string {
			write(t, filepath.Join(root, ".agister", "layer.yaml"), layerFile(filepath.Join(root, "prompts")))
			return "is not inside the directory that holds .agister"
		}},
		"a folder above": {layer: "repository", plant: func(t *testing.T, root string) string {
			write(t, filepath.Join(root, ".agister", "layer.yaml"), layerFile("../prompts"))
			return "is not inside the directory that holds .agister"
		}},
		"a folder that does not exist": {layer: "repository", plant: func(t *testing.T, root string) string {
			write(t, filepath.Join(root, ".agister", "layer.yaml"), layerFile("prompts"))
			return "lists prompts folder prompts, which does not exist"
		}},
		"a file": {layer: "repository", plant: func(t *testing.T, root string) string {
			write(t, filepath.Join(root, "prompts"), "not a folder\n")
			write(t, filepath.Join(root, ".agister", "layer.yaml"), layerFile("prompts"))
			return "lists prompts folder prompts, which is not a folder"
		}},
		"a link that leaves": {layer: "repository", plant: func(t *testing.T, root string) string {
			if err := os.Symlink(tempDir(t), filepath.Join(root, "prompts")); err != nil {
				t.Fatal(err)
			}
			write(t, filepath.Join(root, ".agister", "layer.yaml"), layerFile("prompts"))
			return "lists prompts folder prompts, which a link leads out of " + root
		}},
		"a project's folder that does not exist": {layer: "project", plant: func(t *testing.T, project string) string {
			write(t, filepath.Join(project, ".agister", "layer.yaml"), layerFile("prompts"))
			return "lists prompts folder prompts, which does not exist"
		}},
		"home's": {layer: "home", reason: "home holds no layer.yaml"},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			home, repo := setup(t, "approve")
			write(t, filepath.Join(home, "processes", "reviewed.yaml"), promptingProcess)
			write(t, filepath.Join(home, "prompts", "review.md"), "Home's review rules.\n")
			launch := filepath.Join(repo, "docs")
			if err := os.MkdirAll(filepath.Join(launch, ".agister"), 0o755); err != nil {
				t.Fatal(err)
			}
			reason, file := c.reason, filepath.Join(repo, ".agister", "layer.yaml")
			switch c.layer {
			case "home":
				file = filepath.Join(home, "layer.yaml")
				write(t, file, layerFile())
			case "project":
				file = filepath.Join(launch, ".agister", "layer.yaml")
				reason = c.plant(t, launch)
			default:
				reason = c.plant(t, repo)
			}

			r := agister(t, home, launch, "check")
			if r.code != cli.ExitUsage || !strings.Contains(r.stderr, file+": ") || !strings.Contains(r.stderr, reason) {
				t.Fatalf("check: %d, want %q\n%s%s", r.code, reason, r.stdout, r.stderr)
			}
			runs := &newRuns{home: home}
			runs.take(t)
			for _, args := range [][]string{{"run", "reviewed", "--quiet", "--timeout", "1m"}, {"process", "show", "reviewed"}} {
				if r := agister(t, home, launch, args...); r.code == 0 || r.code == cli.ExitCompleted || !strings.Contains(r.stderr, "stop every command") || !strings.Contains(r.stderr, reason) {
					t.Fatalf("%v: %d\n%s%s", args, r.code, r.stdout, r.stderr)
				}
			}
			for _, ran := range runs.take(t) {
				if ran.first != nil {
					t.Fatalf("the runtime started: %v", ran.record)
				}
			}
			// A project layer's stops nothing launched above it.
			if c.layer == "project" {
				if r := agister(t, home, repo, "run", "reviewed", "--quiet", "--timeout", "1m"); r.code != cli.ExitCompleted {
					t.Fatalf("run at the root: %d\n%s%s", r.code, r.stdout, r.stderr)
				}
			}
		})
	}
}
