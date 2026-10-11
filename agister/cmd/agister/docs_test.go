package main

import (
	"html"
	"path/filepath"
	"reflect"
	"regexp"
	"slices"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/cli"
)

// The documents that describe the settings say what the binary does
// (ADR-030): agents, processes and the workflows that bind them, with no
// policy document, no --agent, no agister run of a process and none of the
// agent names it retired. They are the README, the caller skill, the
// settings diagrams and the Pages README; the examples' READMEs run only
// workflows too.

// settingsDocs are the documents, relative to agister/, that describe the
// settings.
func settingsDocs(t *testing.T) []string {
	t.Helper()
	docs := []string{"README.md", filepath.Join("skills", "agister", "SKILL.md"), filepath.Join("pages", "README.md")}
	diagrams, err := filepath.Glob(filepath.Join("..", "..", "docs", "settings-architecture", "*"))
	if err != nil || len(diagrams) == 0 {
		t.Fatalf("the settings diagrams: %v, %v", diagrams, err)
	}
	for _, path := range diagrams {
		rel, _ := filepath.Rel(filepath.Join("..", ".."), path)
		docs = append(docs, rel)
	}
	return docs
}

func TestTheSettingsDocsNameNoPolicyAgentFlagOrRetiredAgent(t *testing.T) {
	t.Parallel()
	for _, doc := range settingsDocs(t) {
		for _, problem := range staleMentions(docText(read(t, filepath.Join("..", "..", doc)), doc)) {
			t.Errorf("%s: %s", doc, problem)
		}
	}
}

func TestNoDocRunsAProcess(t *testing.T) {
	t.Parallel()
	docs := settingsDocs(t)
	examples, err := filepath.Glob(filepath.Join("..", "..", "examples", "*", "README.md"))
	if err != nil || len(examples) == 0 {
		t.Fatalf("the examples' READMEs: %v, %v", examples, err)
	}
	for _, path := range examples {
		rel, _ := filepath.Rel(filepath.Join("..", ".."), path)
		docs = append(docs, rel)
	}
	processes := processNames(t)
	for _, doc := range docs {
		text := read(t, filepath.Join("..", "..", doc))
		for _, problem := range processRuns(codeIn(text, doc), processes) {
			t.Errorf("%s: %s", doc, problem)
		}
	}
}

// The check finds a policy document, --agent and a retired agent name, in
// prose or code, and passes the policy package's paths, the Pages
// summary's policy key and a stylesheet's custom property.
func TestTheStaleMentionCheckFindsPolicyAgentFlagAndRetiredAgent(t *testing.T) {
	t.Parallel()
	found := map[string][]string{
		"A process names its `policy: process-policy:implement`.": {"names a policy: policy", "names a policy: policy"},
		"Its limits are in `policies/implement.yaml`.":            {"names a policy: policies"},
		"Pass `--agent codex-sol-61` to choose another.":          {"names --agent"},
		"The judge is `claude-judge`, the implementer `codex-implementer-sol-61`.": {
			"names the retired agent codex-implementer-sol-61",
			"names the retired agent claude-judge",
		},
		"<p>A <b>Policy</b> holds the limits.</p>": {"names a policy: Policy"},
	}
	for text, want := range found {
		if got := staleMentions(text); !reflect.DeepEqual(got, want) {
			t.Errorf("staleMentions(%q) = %q, want %q", text, got, want)
		}
	}
	passed := []string{
		"Limits compose in `internal/domain/policy/policy.go:74`.",
		"- `policy`: the limits the call ran under, the record's `effective`\n  ones",
		docText("<style>.k-agent { color: var(--agent); }</style><p>An agent.</p>", "index.html"),
		"`--agents` of another tool, and `claude-opus`.",
	}
	for _, text := range passed {
		if got := staleMentions(text); len(got) != 0 {
			t.Errorf("staleMentions(%q) = %q, want none", text, got)
		}
	}
}

// The check finds a run of a process, by its name or as <process>, in
// markdown or HTML code, by the binary's name or the path the README
// builds it at, and passes a run of a workflow and what names a process
// without running it.
func TestTheProcessRunCheckFindsARunOfAProcess(t *testing.T) {
	t.Parallel()
	processes := []string{"ask", "implement"}
	found := map[string][]string{
		"Run `agister run implement --param brief=<file>`.": {"agister run implement --param brief=<file>: runs the process implement"},
		"```sh\nagister --home /tmp run ask \\\n  --param question=x\n```": {
			"agister --home /tmp run ask --param question=x: runs the process ask",
		},
		"```sh\ngo build -o bin/agister ./cmd/agister\nbin/agister run ask --param question=\"What does cmd/agister do?\"\n```": {
			"bin/agister run ask --param question=\"What does cmd/agister do?\": runs the process ask",
		},
		"Use `agister run <process>`.": {"agister run <process>: runs the process <process>"},
		"<p>In <code>agister run &lt;process&gt;</code></p>": {
			"agister run <process>: runs the process <process>",
		},
	}
	for text, want := range found {
		doc := "README.md"
		if strings.HasPrefix(text, "<") {
			doc = "index.html"
		}
		if got := processRuns(codeIn(text, doc), processes); !reflect.DeepEqual(got, want) {
			t.Errorf("processRuns(%q) = %q, want %q", text, got, want)
		}
	}
	passed := []string{
		"`agister run implement_codex --param brief=<file>` and `agister run <workflow>`.",
		"`agister process show implement` shows the work.",
		"```sh\ngo build -o bin/agister ./cmd/agister\nbin/agister run ask_assistant --param question=\"What does cmd/agister do?\"\n```",
		"<text class=\"cmd\">agister run &lt;workflow&gt;</text> <code>agister run ask_assistant</code>",
	}
	for _, text := range passed {
		doc := "README.md"
		if strings.HasPrefix(text, "<") {
			doc = "index.html"
		}
		if got := processRuns(codeIn(text, doc), processes); len(got) != 0 {
			t.Errorf("processRuns(%q) = %q, want none", text, got)
		}
	}
}

// retiredAgents are the agent names ADR-030 replaced.
var retiredAgents = []string{
	"codex-implementer-sol-61", "claude-implementer-opus", "claude-implementer-sonnet",
	"claude-judge", "pi-implementer-glm-53", "pi-implementer-m3",
}

var (
	policyWord = regexp.MustCompile(`(?i)\bpolic(?:y|ies)\b`)
	// The policy package's paths, and the Pages run summary's key, the
	// limits the call ran under, are not policy documents.
	notPolicy = regexp.MustCompile("internal/domain/policy/[\\w./:-]*|(?m)^- `policy`: the limits the call ran under")
	agentFlag = regexp.MustCompile(`(?:^|[^\w(-])--agent\b`)
)

// staleMentions are what the text says that the binary no longer has: a
// policy document, the --agent flag, an agent name ADR-030 retired.
func staleMentions(text string) []string {
	var problems []string
	for _, word := range policyWord.FindAllString(notPolicy.ReplaceAllString(text, ""), -1) {
		problems = append(problems, "names a policy: "+word)
	}
	if agentFlag.MatchString(text) {
		problems = append(problems, "names --agent")
	}
	for _, name := range retiredAgents {
		if strings.Contains(text, name) {
			problems = append(problems, "names the retired agent "+name)
		}
	}
	return problems
}

var (
	stylePattern = regexp.MustCompile(`(?s)<style>.*?</style>`)
	tagPattern   = regexp.MustCompile(`<[^>]*>`)
	htmlCode     = regexp.MustCompile(`(?s)<(code|pre|text)\b[^>]*>(.*?)</(?:code|pre|text)>`)
)

// docText is the text the checks read: an HTML document's without its
// stylesheet, or the markdown as it is.
func docText(text, doc string) string {
	if filepath.Ext(doc) != ".html" {
		return text
	}
	return stylePattern.ReplaceAllString(text, "")
}

// codeIn is a document's code: the markdown's, as codeOf finds it, or the
// text of each code, pre and SVG text element of an HTML document, its
// tags dropped and entities unescaped.
func codeIn(text, doc string) []string {
	if filepath.Ext(doc) != ".html" {
		return codeOf(text)
	}
	var code []string
	for _, match := range htmlCode.FindAllStringSubmatch(docText(text, doc), -1) {
		for _, line := range strings.Split(html.UnescapeString(tagPattern.ReplaceAllString(match[2], "")), "\n") {
			code = append(code, line)
		}
	}
	return code
}

// processRuns are the code's agister runs whose name is a process's, or
// the placeholder <process>: agister run runs a workflow only (ADR-030
// rule 7).
func processRuns(code []string, processes []string) []string {
	var problems []string
	for _, line := range code {
		for _, args := range invocations(line) {
			words := commandWords(args, cli.GlobalFlags())
			if len(words) == 0 || words[0] != "run" {
				continue
			}
			at := slices.Index(args, "run")
			if at+1 >= len(args) {
				continue
			}
			name := args[at+1]
			if name == "<process>" || slices.Contains(processes, name) {
				problems = append(problems, strings.Join(strings.Fields(line), " ")+": runs the process "+name)
			}
		}
	}
	return problems
}

// processNames are the processes home, the examples and this repository
// define, less any name a workflow also has.
func processNames(t *testing.T) []string {
	t.Helper()
	names := func(pattern string) []string {
		paths, err := filepath.Glob(pattern)
		if err != nil {
			t.Fatal(err)
		}
		var found []string
		for _, path := range paths {
			found = append(found, strings.TrimSuffix(filepath.Base(path), ".yaml"))
		}
		return found
	}
	var processes, workflows []string
	for _, dir := range []string{
		filepath.Join("..", "..", "home"),
		filepath.Join("..", "..", "examples", "*"),
		filepath.Join("..", "..", "..", ".agister"),
	} {
		processes = append(processes, names(filepath.Join(dir, "processes", "*.yaml"))...)
		workflows = append(workflows, names(filepath.Join(dir, "workflows", "*.yaml"))...)
	}
	if !slices.Contains(processes, "implement") || !slices.Contains(processes, "ask") {
		t.Fatalf("the processes %q leave out implement or ask", processes)
	}
	return slices.DeleteFunc(processes, func(name string) bool { return slices.Contains(workflows, name) })
}
