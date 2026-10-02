package main

import (
	"crypto/sha256"
	"encoding/hex"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/cli"
)

// Prompts are settings (ADR-014), on real settings directories: Agister's
// home and a repository's .agister, composed by the layered store.

const promptingProcess = `schema: agister.process/v1alpha1
name: reviewed
type: process
uses: agent:assistant
policy: process-policy:read-only
input:
  instruction: Follow the rules.
  values:
    rules: {source: prompt, name: review}
output:
  format: text
`

// promptRun runs reviewed from cwd and returns what its record says of
// the rules input and of the prompt among its definitions, and the prompt
// the agent was given.
func promptRun(t *testing.T, home, cwd string) (input, source map[string]any, given string) {
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
	inputs, _ := last.record["inputs"].([]any)
	if len(inputs) != 1 {
		t.Fatalf("inputs = %v", last.record["inputs"])
	}
	input, _ = inputs[0].(map[string]any)
	definitions, _ := last.record["definitions"].([]any)
	for _, d := range definitions {
		if d := d.(map[string]any); d["kind"] == "prompts" {
			if source != nil {
				t.Fatalf("the prompt is recorded twice: %v", definitions)
			}
			source = d
		}
	}
	given, _ = last.first["prompt"].(string)
	return input, source, given
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
	home, repo := setup(t, "approve")
	write(t, filepath.Join(home, "processes", "reviewed.yaml"), promptingProcess)
	global, homeText := filepath.Join(home, "prompts", "review.md"), "Home's review rules.\n"
	write(t, global, homeText)
	// A directory of the repository with a prompts/review.md of its own,
	// which a path relative to the caller would find.
	sub := filepath.Join(repo, "sub")
	write(t, filepath.Join(sub, "prompts", "review.md"), "The caller's directory's rules.\n")

	for _, cwd := range []string{repo, sub} {
		input, source, given := promptRun(t, home, cwd)
		if input["name"] != "rules" || input["source"] != "prompt" || input["value"] != homeText || input["identity"] != "sha256:"+digestOf(homeText) {
			t.Fatalf("from %s: input = %v", cwd, input)
		}
		if source["name"] != "review" || source["path"] != global || source["sha256"] != digestOf(homeText) || source["project"] != nil || source["overrides"] != nil {
			t.Fatalf("from %s: source = %v", cwd, source)
		}
		if !strings.Contains(given, homeText) || strings.Contains(given, "caller's directory") {
			t.Fatalf("from %s: the agent was given:\n%s", cwd, given)
		}
	}

	project, repoText := filepath.Join(repo, ".agister", "prompts", "review.md"), "The repository's review rules.\n"
	write(t, project, repoText)
	for _, cwd := range []string{repo, sub} {
		input, source, given := promptRun(t, home, cwd)
		if input["value"] != repoText || input["identity"] != "sha256:"+digestOf(repoText) {
			t.Fatalf("from %s: input = %v", cwd, input)
		}
		if source["path"] != project || source["sha256"] != digestOf(repoText) || source["project"] != true || source["overrides"] != global {
			t.Fatalf("from %s: source = %v", cwd, source)
		}
		if !strings.Contains(given, repoText) || strings.Contains(given, homeText) {
			t.Fatalf("from %s: the agent was given:\n%s", cwd, given)
		}
	}

	r := agister(t, home, repo, "check", "--tree")
	if r.code != 0 || !regexp.MustCompile(`process reviewed +global .*\n(.*\n)*└─ prompt review +project `+regexp.QuoteMeta(project)+` \(overrides `+regexp.QuoteMeta(global)+`\)\n`).MatchString(r.stdout) {
		t.Fatalf("check --tree: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	r = agister(t, home, repo, "process", "show", "reviewed")
	if r.code != 0 || !strings.Contains(r.stdout, "prompts      review: project "+project+"\n") ||
		!strings.Contains(r.stdout, "prompt review: project "+project+" (overrides "+global+")\n") {
		t.Fatalf("process show: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
}

// A prompt in neither layer is a problem of the settings, on the process
// that names it, and a call of it is refused before its first turn
// (ADR-015).
func TestAPromptInNeitherLayerIsAProblemOfTheProcess(t *testing.T) {
	home, repo := setup(t, "approve")
	process := filepath.Join(home, "processes", "reviewed.yaml")
	write(t, process, promptingProcess)
	problem := `process reviewed: input rules: prompt "review" does not exist`
	r := agister(t, home, repo, "check", "--tree")
	if r.code != cli.ExitUsage || !strings.Contains(r.stderr, problem+"\n  refuses process reviewed\n") || !regexp.MustCompile(`└─ prompt review +MISSING\n`).MatchString(r.stdout) {
		t.Fatalf("check --tree: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	runs := &newRuns{home: home}
	runs.take(t)
	want := `process reviewed (` + process + `): input rules: prompt "review" does not exist`
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
// and the call gets the file's text.
func TestAFileInPromptsReadThroughSourceFileKeepsWorking(t *testing.T) {
	home, repo := setup(t, "approve")
	path, text := filepath.Join(home, "prompts", "Review.md"), "Legacy review rules.\n"
	write(t, path, text)
	write(t, filepath.Join(home, "processes", "reviewed.yaml"), strings.Replace(promptingProcess,
		"{source: prompt, name: review}", "{source: file, path: "+path+"}", 1))
	if r := agister(t, home, repo, "check"); r.code != 0 || strings.Contains(r.stderr, "problem") {
		t.Fatalf("check: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	input, source, given := promptRun(t, home, repo)
	if input["name"] != "rules" || input["source"] != "file" || input["value"] != text || source != nil {
		t.Fatalf("input = %v, prompt source = %v", input, source)
	}
	if !strings.Contains(given, text) {
		t.Fatalf("the agent was given:\n%s", given)
	}
}
