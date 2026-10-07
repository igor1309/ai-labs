package main

import (
	"bytes"
	"context"
	"path/filepath"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/cli"
)

// A repository whose settings use a field this binary does not know, in a
// shape it does not read, is told on check and on every call they refuse
// that the settings may need a newer binary: LAB-119's implement process
// gave its brief a list of forms, and the binary before them read every
// field of an input value as a scalar (LAB-122). A known field with a
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
	// LAB-119's document shape: a list under input.values.brief.
	implement := newer("implement", `brief: {source: file, path: "${param.brief}"}`, `brief: {source: file, path: "${param.brief}", forms: [goal, step]}`)
	review := newer("adversarial_review", `diff: {source: git.diff,`, `diff: {source: git.diff, context: {lines: 3},`)
	// A field this binary knows, on a source it does not apply to.
	ask := newer("ask", "question: {source: param, name: question}", "question: {source: param, name: question, form: [goal]}")

	const version = "v1.2.3 143e31f8 2026-10-07T10:00:00Z"
	agisterAt := func(args ...string) result {
		var stdout, stderr bytes.Buffer
		code := cli.Run(context.Background(), append([]string{"--home", home}, args...), cli.IO{
			Stdin: strings.NewReader(""), Stdout: &stdout, Stderr: &stderr, Cwd: repo, Getenv: func(string) string { return "" }, Version: version,
		}, composeInProcess)
		return result{code, stdout.String(), stderr.String()}
	}
	hint := func(n string) string {
		return n + " problem(s) name something this binary does not know; the settings may need one newer than agister " + version + ".\n"
	}

	r := agisterAt("check")
	for _, want := range []string{
		"process implement: input.values.brief.forms: must be a scalar\n",
		"process adversarial_review: input.values.diff.context: must be a scalar\n",
		"process ask: input.values.question.form: applies to source file only",
	} {
		if !strings.Contains(r.stderr, want) {
			t.Errorf("check lacks %q", want)
		}
	}
	if r.code != cli.ExitUsage || !strings.HasSuffix(r.stderr, "\n"+hint("2")) {
		t.Fatalf("check: %d\n%s", r.code, r.stderr)
	}

	runs := &newRuns{home: home}
	runs.take(t)
	write(t, filepath.Join(repo, "brief.md"), "# Brief\n")
	for _, c := range []struct {
		name   string
		args   []string
		reason string
		hint   string // the last line of stderr
	}{
		{"process", []string{"run", "implement", "--quiet", "--param", "brief=brief.md"},
			"process implement (" + implement + "): input.values.brief.forms: must be a scalar", hint("1")},
		{"continued", []string{"run", "implement", "--quiet", "--param", "brief=brief.md", "--continue", "20261007T103130Z-66a352"},
			"process implement (" + implement + "): input.values.brief.forms: must be a scalar", hint("1")},
		{"workflow", []string{"run", "review_panel", "--quiet", "--param", "base=main", "--param", "architecture=a.txt"},
			"workflow review_panel uses process adversarial_review (" + review + "): input.values.diff.context: must be a scalar", hint("1")},
		{"known field", []string{"run", "ask", "--quiet", "--param", "question=why"},
			"process ask (" + ask + "): input.values.question.form: applies to source file only", ""},
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
		if want := map[bool]float64{true: 1}[c.hint != ""]; recorded != want {
			t.Errorf("%s: the record counts %v unknown problems, want %v", c.name, recorded, want)
		}
	}
}
