package main

import (
	"context"
	"io/fs"
	"path/filepath"
	"reflect"
	"regexp"
	"slices"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/adapters/fsdefs"
	"github.com/igor1309/ai-labs/agister/internal/cli"
	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
)

// The caller skill, skills/agister/SKILL.md, is for the agent that runs
// Agister. It stays loadable as a settings skill would be (ADR-021 rule 1),
// and every command it names is one the CLI dispatches, with only flags the
// CLI defines for that command.

// callerSkill is the folder that holds skills/agister, read as a settings
// directory is.
var callerSkill = filepath.Join("..", "..")

// The store reads the skill as it reads a settings skill: a folder holding
// its SKILL.md alone; ParseSkill checks its front matter.
func TestTheCallerSkillIsALoadableSkill(t *testing.T) {
	t.Parallel()
	doc, err := fsdefs.Store{Dir: callerSkill}.Read(context.Background(), definition.KindSkill, "agister")
	if err != nil {
		t.Fatal(err)
	}
	skill, err := definition.ParseSkill(doc)
	if err != nil {
		t.Fatal(err)
	}
	if skill.Name != "agister" || skill.Description == "" {
		t.Errorf("skill %q, description %q", skill.Name, skill.Description)
	}
}

func TestTheCallerSkillNamesOnlyCommandsAndFlagsTheCLIHas(t *testing.T) {
	t.Parallel()
	text := read(t, filepath.Join(callerSkill, "skills", "agister", "SKILL.md"))
	named, problems := skillProblems(text)
	if named == 0 {
		t.Fatal("the skill names no agister command in its code")
	}
	if len(problems) > 0 {
		t.Error(strings.Join(problems, "\n"))
	}
}

// A call's changes stay in the worktree it worked in, and every call works
// there (ADR-025 rules 1 and 6): the skill's code applies no patch and
// chooses no workspace.
func TestTheCallerSkillAppliesNoPatchAndChoosesNoWorkspace(t *testing.T) {
	t.Parallel()
	text := read(t, filepath.Join(callerSkill, "skills", "agister", "SKILL.md"))
	for _, code := range codeOf(text) {
		for _, removed := range []string{"git apply", "--workspace"} {
			if strings.Contains(code, removed) {
				t.Errorf("the skill's code %q names %s", code, removed)
			}
		}
	}
}

// Nothing a caller reads tells it to apply a run's changes (ADR-025 rule
// 1): the skill, its front matter's description and its prose included.
// It says only that nothing is applied.
func TestTheCallerGuidanceTellsNoOneToApplyARunsChanges(t *testing.T) {
	t.Parallel()
	for _, file := range []string{filepath.Join("skills", "agister", "SKILL.md")} {
		text := read(t, filepath.Join(callerSkill, file))
		for _, sentence := range applyInstructions(text) {
			t.Errorf("%s tells a caller to apply a run's changes: %q", file, sentence)
		}
	}
}

// The check finds each sentence that speaks of applying, in prose, front
// matter, a heading or code, and passes one that says nothing is applied
// and the senses that are not about a run's changes.
func TestTheApplyCheckFindsAnInstructionToApply(t *testing.T) {
	t.Parallel()
	found := []string{
		"description: Drive Agister from outside - run one, read a run's record, apply a run's patch, and prepare a repository's `.agister/`.",
		"Use when asked to \"use agister\", to read or apply what a run produced.",
		"- Implement through the `implement` process: commit the candidate, write\n  the brief to a file, run\n  `agister run implement --param candidate=<rev> --param brief=<file>`, and\n  apply the run's `changes.patch`.",
		"## Apply a run's changes",
		"Apply it on the revision the run worked on.",
		"```sh\ngit apply <home>/runs/<run-id>/artifacts/changes.patch\n```",
		"The verification runs with the agent's changes applied.",
	}
	for _, text := range found {
		if got := applyInstructions(text); len(got) != 1 {
			t.Errorf("applyInstructions(%q) = %q, want one sentence", text, got)
		}
	}
	passed := []string{
		"There is\nnothing to apply: run the testing command yourself, and commit.",
		"**Do not\napply it**: the changes are already in the worktree.",
		"Its changes are in that worktree; nothing is applied, and `changes.patch` is only the evidence.",
		"The patch is evidence: nobody applies it. It never applies a patch. No one applies it.",
		"`--continue` applies nothing: that run's changes are in the worktree.",
		"- Running Agister in a repository applies that repository's `.agister/`,\n  including the commands its agents run.",
		"These rules replace the root `AGENTS.md`'s steps; its verification rules\nstill apply.",
	}
	for _, text := range passed {
		if got := applyInstructions(text); len(got) != 0 {
			t.Errorf("applyInstructions(%q) = %q, want none", text, got)
		}
	}
}

var (
	paragraphBreak = regexp.MustCompile(`\n[ \t]*\n`)
	sentenceEnd    = regexp.MustCompile(`[.!?]\s`)
	applying       = regexp.MustCompile(`(?i)\bappl(?:y|ies|ied|ying)\b`)
	// Saying that nothing is applied.
	notApplying = regexp.MustCompile(`(?i)\b(?:not|nothing(?: is)?|nobody|never|no one)\s+(?:to\s+)?appl(?:y|ies|ied|ying)\b|\bappl(?:y|ies)\s+nothing\b`)
	// The senses of the word that are not about a run's changes: settings
	// applied in a repository, rules that still apply.
	otherApplying = regexp.MustCompile("(?i)\\bapplies that repository's `\\.agister/`|\\brules still apply\\b")
)

// applyInstructions are the markdown's sentences that speak of applying,
// each paragraph's lines joined, other than to say that nothing is applied
// or in a sense that is not about a run's changes.
func applyInstructions(markdown string) []string {
	var found []string
	for _, paragraph := range paragraphBreak.Split(markdown, -1) {
		joined := strings.Join(strings.Fields(paragraph), " ")
		for _, sentence := range sentenceEnd.Split(joined+" ", -1) {
			rest := otherApplying.ReplaceAllString(notApplying.ReplaceAllString(sentence, ""), "")
			if applying.MatchString(rest) {
				found = append(found, strings.TrimSpace(sentence))
			}
		}
	}
	return found
}

// A caller runs a workflow that binds implement to its agent, one of the
// implement_* workflows, and chooses no agent itself (ADR-030 rules 5 to 7
// and Migration 4): no caller document's code runs the process implement
// or passes --agent. The caller documents are the caller skill and each
// AGENTS.md of the repository.
func TestNoCallerDocumentRunsImplementOrChoosesAnAgent(t *testing.T) {
	t.Parallel()
	root, err := filepath.Abs(filepath.Join("..", "..", ".."))
	if err != nil {
		t.Fatal(err)
	}
	docs := []string{filepath.Join(root, "agister", "skills", "agister", "SKILL.md")}
	err = filepath.WalkDir(root, func(path string, entry fs.DirEntry, err error) error {
		switch {
		case err != nil:
			return err
		case entry.IsDir() && path != root && (entry.Name() == "node_modules" || strings.HasPrefix(entry.Name(), ".") && entry.Name() != ".github"):
			return filepath.SkipDir
		case !entry.IsDir() && entry.Name() == "AGENTS.md":
			docs = append(docs, path)
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"AGENTS.md", filepath.Join("agister", "AGENTS.md")} {
		if !slices.Contains(docs, filepath.Join(root, want)) {
			t.Fatalf("the caller documents %q leave out %s", docs, want)
		}
	}
	for _, doc := range docs {
		for _, problem := range callerProblems(read(t, doc)) {
			rel, _ := filepath.Rel(root, doc)
			t.Errorf("%s: %s", rel, problem)
		}
	}
}

// The check finds a run of the process implement and --agent, in a code
// span or a code block, and passes a run of an implement_* workflow and
// what names implement without running it.
func TestTheCallerCheckFindsImplementRunAndAgentChosen(t *testing.T) {
	t.Parallel()
	found := map[string][]string{
		"One `agister run implement` call.": {
			"agister run implement: runs the process implement",
		},
		"```sh\nagister --home /tmp run implement \\\n  --param brief=<file> --json\n```": {
			"agister --home /tmp run implement --param brief=<file> --json: runs the process implement",
		},
		"Run `agister run implement --agent codex-sol-61 --param brief=<file>`.": {
			"agister run implement --agent codex-sol-61 --param brief=<file>: runs the process implement",
			"agister run implement --agent codex-sol-61 --param brief=<file>: chooses an agent with --agent",
		},
		"With `--agent <agent>` it shows the process as that agent would run it.": {
			"--agent <agent>: chooses an agent with --agent",
		},
		"    agister process show implement [--agent=claude-opus]\n": {
			"agister process show implement [--agent=claude-opus]: chooses an agent with --agent",
		},
	}
	for text, want := range found {
		if got := callerProblems(text); !reflect.DeepEqual(got, want) {
			t.Errorf("callerProblems(%q) = %q, want %q", text, got, want)
		}
	}
	passed := []string{
		"```sh\nagister run implement_opus --param brief=<file> --json\n```",
		"`agister run implement_codex --continue <run-id> --param brief=<file>`",
		"`agister process show implement` shows the work; the `implement` process runs in `implement_opus`.",
		"`agister run <workflow> --param <param>=<value>`, with an agent the workflow binds.",
		"`agister run code_review --param base=<rev>` and `--agents` of another tool.",
	}
	for _, text := range passed {
		if got := callerProblems(text); len(got) != 0 {
			t.Errorf("callerProblems(%q) = %q, want none", text, got)
		}
	}
}

// callerProblems are what the markdown's code does that a caller no longer
// does: run the process implement, rather than a workflow that binds it to
// an agent, or choose an agent with --agent.
func callerProblems(markdown string) []string {
	var problems []string
	for _, code := range codeOf(markdown) {
		line := strings.Join(strings.Fields(code), " ")
		for _, args := range invocations(code) {
			if slices.Equal(commandWords(args, cli.GlobalFlags()), []string{"run", "implement"}) {
				problems = append(problems, line+": runs the process implement")
			}
		}
		for _, field := range strings.Fields(code) {
			if match := flagArgument.FindStringSubmatch(field); match != nil && match[1] == "agent" {
				problems = append(problems, line+": chooses an agent with --agent")
				break
			}
		}
	}
	return problems
}

// The check fails a skill that names a command, a subcommand or a flag the
// CLI lacks, in a code span or a code block, and passes what it has. Global
// flags before the command, with their values, do not hide it.
func TestTheSkillCheckFindsWhatTheCLILacks(t *testing.T) {
	t.Parallel()
	text := "Use `agister runs list`, `agister launch x`, `agister runs\nprune` and `agister process show <name> --dir a`.\n" +
		"Also `agister --home /tmp launch`, `agister --quiet --home=/tmp runs prune` and `agister --home /tmp run x --param a=b`.\n\n" +
		"~~~sh\nagister run implement --param a=b \\\n  --bogus x && agister check --tree\n~~~\n\n" +
		"    echo yes | agister install --restore 1 --json --probe\n"
	named, problems := skillProblems(text)
	want := []string{ // the blocks', then the spans'
		"agister run: --bogus is not one of its flags",
		"agister install: --probe is not one of its flags",
		"agister launch: not a command of the CLI",
		"agister runs prune: not a command of the CLI",
		"agister launch: not a command of the CLI",
		"agister runs prune: not a command of the CLI",
	}
	if named != 10 || !reflect.DeepEqual(problems, want) {
		t.Errorf("named %d, problems:\n%s\nwant 10:\n%s", named, strings.Join(problems, "\n"), strings.Join(want, "\n"))
	}
}

// Every global flag the check skips with its value is one the CLI has.
func TestTheSkillCheckSkipsOnlyGlobalFlagsWithValues(t *testing.T) {
	t.Parallel()
	for _, name := range globalValued {
		if !slices.Contains(cli.GlobalFlags(), name) {
			t.Errorf("--%s is not a global flag", name)
		}
	}
}

var (
	flagArgument = regexp.MustCompile(`^\[?--([a-z][a-z-]*)`)
	wordPattern  = regexp.MustCompile(`^[a-z][a-z-]*$`)
)

// skillProblems checks each agister command the markdown writes in its
// code spans and code blocks against the commands the CLI dispatches and
// the flags each takes, as parsing and dispatch use them, and returns how
// many it checked and what it found wrong. agister pages, which main runs
// itself, is not among them.
func skillProblems(markdown string) (int, []string) {
	global := cli.GlobalFlags()
	named := 0
	var problems []string
	for _, code := range codeOf(markdown) {
		for _, args := range invocations(code) {
			if len(args) == 0 {
				continue // agister itself, named in prose
			}
			named++
			command, ok := cli.Lookup(commandWords(args, global))
			if !ok {
				problems = append(problems, "agister "+command.Name+": not a command of the CLI")
				continue
			}
			for _, arg := range args {
				match := flagArgument.FindStringSubmatch(arg)
				if match != nil && !slices.Contains(command.Flags, match[1]) && !slices.Contains(global, match[1]) {
					problems = append(problems, strings.TrimSpace("agister "+command.Name)+": --"+match[1]+" is not one of its flags")
				}
			}
		}
	}
	return named, problems
}

// globalValued are the global flags that take a value, as the parser
// declares them.
var globalValued = []string{"home"}

// commandWords are the command and its subcommand, if any, that an
// invocation's arguments name, as parsing finds them: a global flag before
// or between them is skipped, with the value it takes unless it is joined
// by =.
func commandWords(args, global []string) []string {
	var words []string
	for i := 0; i < len(args) && len(words) < 2; i++ {
		arg := args[i]
		if strings.HasPrefix(arg, "-") {
			name, _, joined := strings.Cut(strings.TrimPrefix(arg[1:], "-"), "=")
			if !slices.Contains(global, name) {
				break
			}
			if !joined && slices.Contains(globalValued, name) {
				i++
			}
			continue
		}
		if !wordPattern.MatchString(arg) {
			break
		}
		words = append(words, arg)
	}
	return words
}

var spanPattern = regexp.MustCompile("`([^`]+)`")

// codeOf is the markdown's code: each fenced or indented block, its lines
// continued by a trailing backslash joined, then each code span of the
// rest, a span broken across lines joined.
func codeOf(markdown string) []string {
	var code, prose []string
	fence := ""
	for _, line := range strings.Split(markdown, "\n") {
		trimmed := strings.TrimSpace(line)
		switch {
		case fence != "" && strings.HasPrefix(trimmed, fence):
			fence = ""
		case fence != "":
			code = append(code, line)
		case strings.HasPrefix(trimmed, "```") || strings.HasPrefix(trimmed, "~~~"):
			fence = trimmed[:3]
		case strings.HasPrefix(line, "    "):
			code = append(code, line)
		default:
			prose = append(prose, line)
		}
	}
	blocks := strings.Split(strings.ReplaceAll(strings.Join(code, "\n"), "\\\n", " "), "\n")
	for _, span := range spanPattern.FindAllStringSubmatch(strings.Join(prose, "\n"), -1) {
		blocks = append(blocks, strings.ReplaceAll(span[1], "\n", " "))
	}
	return blocks
}

var separators = regexp.MustCompile(`&&|\|\||[|;()]`)

// invocations are the arguments after each agister in a line of code, one
// list per shell command it runs.
func invocations(code string) [][]string {
	var found [][]string
	for _, command := range separators.Split(code, -1) {
		fields := strings.Fields(command)
		for i, field := range fields {
			if field == "agister" {
				found = append(found, fields[i+1:])
				break
			}
		}
	}
	return found
}
