package main

import (
	"context"
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

// The check fails a skill that names a command, a subcommand or a flag the
// CLI lacks, in a code span or a code block, and passes what it has. Global
// flags before the command, with their values, do not hide it.
func TestTheSkillCheckFindsWhatTheCLILacks(t *testing.T) {
	t.Parallel()
	text := "Use `agister runs list`, `agister launch x`, `agister runs\nprune` and `agister process show <name> --agent a`.\n" +
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
