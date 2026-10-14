package main

import (
	"bytes"
	"context"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/cli"
	"github.com/igor1309/ai-labs/agister/internal/contract"
)

// A repository whose settings use a field this binary does not know, in a
// shape it does not read, is told on check and on every call they refuse
// that the settings may need a newer binary: LAB-119's implement process
// gave its brief a list of forms, and the binary before them read every
// field of an input value as a scalar (LAB-122). So is one whose process
// sets, beside its prompt, a field this binary does not know. A known field with a
// wrong value refuses its calls without that line.
func TestSettingsNewerThanTheBinaryAreNamedOnEveryRefusal(t *testing.T) {
	t.Parallel()
	home, repo := setup(t, "approve")
	settings := filepath.Join(repo, ".agister", "processes")
	newer := func(name, from, to string) string {
		text := read(t, filepath.Join(home, "processes", name+".yaml"))
		if !strings.Contains(text, from) {
			t.Fatalf("the shipped %s has no %q", name, from)
		}
		path := filepath.Join(settings, name+".yaml")
		write(t, path, strings.Replace(text, from, to, 1))
		return path
	}
	// LAB-119's document shape, a list under input.values.brief, and a
	// mapping beside it: two problems in one process.
	implement := newer("implement", `brief: {source: file, path: "${param.brief}"}`, `brief: {source: file, path: "${param.brief}", forms: [goal, step], context: {lines: 3}}`)
	review := newer("adversarial_review", `diff: {source: git.diff,`, `diff: {source: git.diff, context: {lines: 3},`)
	// A field this binary knows, on a source it does not apply to.
	ask := newer("ask", "question: {source: param, name: question}", "question: {source: param, name: question, form: [goal]}")
	// A field a process does not have, beside the prompt it names.
	reviewed := filepath.Join(settings, "reviewed.yaml")
	write(t, reviewed, strings.Replace(promptingProcess, "prompt: review\n", "prompt: review\nprompt_layers: [project]\n", 1))
	write(t, filepath.Join(repo, ".agister", "prompts", "review.md"), "The repository's review rules.\n")

	const version = "v1.2.3 143e31f8 2026-10-07T10:00:00Z"
	agisterAt := func(args ...string) result {
		var stdout, stderr bytes.Buffer
		code := cli.Run(context.Background(), append([]string{"--home", home}, args...), cli.IO{
			Stdin: strings.NewReader(""), Stdout: &stdout, Stderr: &stderr, Cwd: repo, Getenv: func(string) string { return "" }, Version: version,
		}, composeInProcess, diagnostics)
		return result{code, stdout.String(), stderr.String()}
	}
	hint := func(n string) string {
		return n + " problem(s) name something this binary does not know; the settings may need one newer than agister " + version + ".\n"
	}

	// A document two layers hold names the layer file that set the field at
	// fault (ADR-028 rule 5): here the repository's, composed onto home's.
	set := func(path string) string { return " (set in " + path + ")" }
	r := agisterAt("check")
	for _, want := range []string{
		"process implement: input.values.brief.context: must be a scalar" + set(implement) + "\n",
		"process implement: input.values.brief.forms: must be a scalar" + set(implement) + "\n",
		"process adversarial_review: input.values.diff.context: must be a scalar" + set(review) + "\n",
		"process ask: input.values.question.form: applies to source file only",
		"process reviewed: prompt_layers: unknown field\n",
	} {
		if !strings.Contains(r.stderr, want) {
			t.Errorf("check lacks %q", want)
		}
	}
	if r.code != cli.ExitUsage || !strings.HasSuffix(r.stderr, "\n"+hint("4")) {
		t.Fatalf("check: %d\n%s", r.code, r.stderr)
	}

	runs := &newRuns{home: home}
	runs.take(t)
	write(t, filepath.Join(repo, "brief.md"), "# Brief\n")
	// A process runs only as a workflow's node (ADR-030 rule 7).
	reviewedOn := bound(t, filepath.Join(repo, ".agister"), "reviewed", "assistant")
	for _, c := range []struct {
		name    string
		args    []string
		reason  string
		hint    string  // the last line of stderr
		unknown float64 // the record's result.error.unknown
	}{
		{"process", []string{"run", "implement_assistant", "--quiet", "--param", "brief=brief.md"},
			"process implement (" + implement + "): input.values.brief.context: must be a scalar" + set(implement) + "; input.values.brief.forms: must be a scalar" + set(implement), hint("2"), 2},
		{"continued", []string{"run", "implement_assistant", "--quiet", "--param", "brief=brief.md", "--continue", "20261007T103130Z-66a352"},
			"process implement (" + implement + "): input.values.brief.context: must be a scalar" + set(implement) + "; input.values.brief.forms: must be a scalar" + set(implement), hint("2"), 2},
		{"workflow", []string{"run", "review_panel", "--quiet", "--param", "base=main", "--param", "architecture=a.txt"},
			"workflow review_panel uses process adversarial_review (" + review + "): input.values.diff.context: must be a scalar" + set(review), hint("1"), 1},
		{"field beside the prompt", []string{"run", reviewedOn, "--quiet"},
			"process reviewed (" + reviewed + "): prompt_layers: unknown field", hint("1"), 1},
		{"known field", []string{"run", "ask_assistant", "--quiet", "--param", "question=why"},
			"process ask (" + ask + "): input.values.question.form: applies to source file only", "", 0},
	} {
		r := agisterAt(c.args...)
		lines := strings.SplitAfter(strings.TrimSuffix(r.stderr, "\n"), "\n")
		last := lines[len(lines)-1] + "\n"
		if r.code != cli.ExitRefused || !strings.Contains(r.stderr, c.reason) {
			t.Errorf("%s: %d, want the refusal %q\n%s", c.name, r.code, c.reason, r.stderr)
		}
		if c.hint != "" && last != c.hint || c.hint == "" && strings.Contains(r.stderr, "newer than agister") {
			t.Errorf("%s: stderr ends %q, want %q\n%s", c.name, last, c.hint, r.stderr)
		}
		refused := runs.one(t)
		recorded, _ := refused.record["result"].(map[string]any)["error"].(map[string]any)["unknown"].(float64)
		if recorded != c.unknown {
			t.Errorf("%s: the record counts %v unknown problems, want %v", c.name, recorded, c.unknown)
		}
	}
}

// An install refused for the settings it would leave says, after its
// problems, that they may need a newer binary when one names something
// this binary does not know, and keeps its own wording and exit code
// (LAB-122). One refused for a known field's wrong value does not.
func TestAnInstallOfNewerSettingsIsNamedOnItsRefusal(t *testing.T) {
	t.Parallel()
	home := initedHome(t)
	const version = "v1.2.3 143e31f8 2026-10-07T10:00:00Z"
	install := func(src string) result {
		stages := tempDir(t)
		var stdout, stderr bytes.Buffer
		code := cli.Run(context.Background(), []string{"--home", home, "install", src}, cli.IO{
			Stdin: strings.NewReader("yes\n"), Stdout: &stdout, Stderr: &stderr, Cwd: tempDir(t), Getenv: func(string) string { return "" }, Version: version,
		}, func(config cli.Config) (contract.Client, error) {
			compose := inProcess(config)
			compose.stages = stages
			client, _, err := compose.wire(config)
			return client, err
		}, diagnostics)
		return result{code, stdout.String(), stderr.String()}
	}
	settings := func(from, to string) string {
		src := filepath.Join(tempDir(t), ".agister")
		text := read(t, filepath.Join(home, "processes", "implement.yaml"))
		if !strings.Contains(text, from) {
			t.Fatalf("the shipped implement has no %q", from)
		}
		write(t, filepath.Join(src, "processes", "implement.yaml"), strings.Replace(text, from, to, 1))
		return src
	}
	before := files(t, home)

	// Home's implement_assistant binds the process, and a workflow whose
	// process cannot be parsed does not find it: its problem follows the
	// process's own, and is not one of a newer binary's.
	const unbound = "  workflow implement_assistant: call node implement: process \"implement\" does not exist\n"
	src := settings("type: process\n", "type: process\nfuture: 1\n")
	r := install(src)
	want := "agister: home's settings would not pass check once " + src + " is installed, so nothing was installed:\n" +
		"  process implement: future: unknown field\n" + unbound +
		"1 problem(s) name something this binary does not know; the settings may need one newer than agister " + version + ".\n"
	if r.code != cli.ExitUsage || !strings.HasSuffix(r.stderr, want) {
		t.Errorf("unknown field: %d\n%s, want it to end\n%s", r.code, r.stderr, want)
	}

	src = settings(`brief: {source: file, path: "${param.brief}"}`, `brief: {source: file, path: "${param.brief}", form: goal}`)
	r = install(src)
	if r.code != cli.ExitUsage || !strings.HasSuffix(r.stderr, "\n  process implement: input.values.brief.form: must be a list of brief names\n"+unbound) {
		t.Errorf("known field: %d\n%s", r.code, r.stderr)
	}
	if !reflect.DeepEqual(files(t, home), before) || backups(t, home) != nil {
		t.Fatal("a refused install wrote")
	}
}

// An agent refused for a runtime mapping with a field this binary does not
// know says, after the mapping's problems, that the settings may need a
// newer binary (LAB-122). One refused for a known field's wrong value does
// not, and neither writes the agent.
func TestAnAgentOnANewerRuntimeIsNamedOnItsRefusal(t *testing.T) {
	t.Parallel()
	home, repo := setup(t, "approve")
	const version = "v1.2.3 143e31f8 2026-10-07T10:00:00Z"
	create := func(runtime string) result {
		var stdout, stderr bytes.Buffer
		code := cli.Run(context.Background(), []string{"--home", home, "agent", "create", "g", "--runtime", runtime}, cli.IO{
			Stdin: strings.NewReader(""), Stdout: &stdout, Stderr: &stderr, Cwd: repo, Getenv: func(string) string { return "" }, Version: version,
		}, composeInProcess, diagnostics)
		return result{code, stdout.String(), stderr.String()}
	}
	shipped := read(t, filepath.Join(home, "runtimes", "claude-code.yaml"))
	runtime := func(name, from, to string) string {
		text := strings.Replace(shipped, "name: claude-code", "name: "+name, 1)
		if !strings.Contains(text, from) {
			t.Fatalf("the shipped runtime mapping has no %q", from)
		}
		path := filepath.Join(repo, ".agister", "runtimes", name+".yaml")
		write(t, path, strings.Replace(text, from, to, 1))
		return path
	}

	newer := runtime("newer-rt", "adapter: claude-code\n", "adapter: claude-code\nfuture: 1\n")
	r := create("newer-rt")
	want := "agister: runtime mapping newer-rt (" + newer + ") is invalid:\n  future: unknown field\n" +
		"1 problem(s) name something this binary does not know; the settings may need one newer than agister " + version + ".\n"
	if r.code != cli.ExitUsage || !strings.HasSuffix(r.stderr, want) {
		t.Errorf("unknown field: %d\n%s, want it to end\n%s", r.code, r.stderr, want)
	}

	wrong := runtime("wrong-rt", "primitives:\n", "efforts: high\nprimitives:\n")
	r = create("wrong-rt")
	if r.code != cli.ExitUsage || !strings.HasSuffix(r.stderr, "agister: runtime mapping wrong-rt ("+wrong+") is invalid:\n  efforts: must be a list\n") || strings.Contains(r.stderr, "newer than agister") {
		t.Errorf("known field: %d\n%s", r.code, r.stderr)
	}
	if _, err := os.Stat(filepath.Join(home, "agents", "g.toml")); !errors.Is(err, fs.ErrNotExist) {
		t.Fatalf("a refused agent was written: %v", err)
	}
}
