package main

import (
	"bytes"
	"context"
	"io"
	"path/filepath"
	"reflect"
	"regexp"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/adapters/fsdefs"
	"github.com/igor1309/ai-labs/agister/internal/cli"
	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
)

// The caller skill, skills/agister/SKILL.md, is for the agent that runs
// Agister. It stays loadable as a settings skill would be (ADR-021 rule 1),
// and every command and flag it names is one the CLI's usage defines.

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
	commands := cliCommands(t)
	named, problems := skillProblems(text, commands)
	if named == 0 {
		t.Fatal("the skill names no agister command in its code")
	}
	if len(problems) > 0 {
		t.Error(strings.Join(problems, "\n"))
	}
}

// The check fails a skill that names a command, a subcommand or a flag the
// CLI lacks, in a code span or a code block, and passes what it has.
func TestTheSkillCheckFindsWhatTheCLILacks(t *testing.T) {
	t.Parallel()
	text := "Use `agister runs list`, `agister launch x`, `agister runs\nprune` and `agister process show <name> --agent a`.\n\n" +
		"~~~sh\nagister run implement --param a=b \\\n  --bogus x && agister check --tree\n~~~\n\n" +
		"    echo yes | agister install --restore 1 --json --probe\n"
	named, problems := skillProblems(text, cliCommands(t))
	want := []string{ // the blocks', then the spans'
		"agister run: --bogus is not one of its flags",
		"agister install: --probe is not one of its flags",
		"agister launch: not a command of the CLI",
		"agister runs prune: not a command of the CLI",
	}
	if named != 7 || !reflect.DeepEqual(problems, want) {
		t.Errorf("named %d, problems:\n%s\nwant 7:\n%s", named, strings.Join(problems, "\n"), strings.Join(want, "\n"))
	}
}

// cliCommands are the commands the CLI's usage defines, each with the flags
// it takes; the key "" holds the global options, which every command takes.
func cliCommands(t *testing.T) map[string]map[string]bool {
	t.Helper()
	var out bytes.Buffer
	if code := cli.Run(context.Background(), []string{"--help"}, cli.IO{Stdout: &out, Stderr: io.Discard}, nil); code != 0 {
		t.Fatalf("--help: %d", code)
	}
	commands := parseUsage(out.String())
	if len(commands) < 2 || len(commands[""]) == 0 {
		t.Fatalf("no commands or global options in the usage:\n%s", out.String())
	}
	return commands
}

var (
	flagPattern   = regexp.MustCompile(`--([a-z][a-z-]*)`)
	flagArgument  = regexp.MustCompile(`^\[?--([a-z][a-z-]*)`)
	optionPattern = regexp.MustCompile(`^\s+(?:-\w, )?--([a-z][a-z-]*)`)
	wordPattern   = regexp.MustCompile(`^[a-z][a-z-]*$`)
	optionalWord  = regexp.MustCompile(`^\[([a-z][a-z-]*)\]$`)
	columnGap     = regexp.MustCompile(`\s{3,}`)
)

// parseUsage reads the usage: under "Usage:", an entry is a line "  agister
// <command> [<subcommand>] ..." and the lines indented below it, and every
// --flag in it is the command's; under "Options:", the global options.
func parseUsage(usage string) map[string]map[string]bool {
	commands := map[string]map[string]bool{"": {}}
	section := ""
	var entry []string // the keys of the entry being read
	for _, line := range strings.Split(usage, "\n") {
		switch {
		case line == "Usage:" || line == "Options:":
			section, entry = line, nil
			continue
		case strings.TrimSpace(line) == "":
			entry = nil
			continue
		}
		if section == "Options:" {
			if match := optionPattern.FindStringSubmatch(line); match != nil {
				commands[""][match[1]] = true
			}
			continue
		}
		if section != "Usage:" {
			continue
		}
		if synopsis, ok := strings.CutPrefix(line, "  agister "); ok {
			synopsis = columnGap.Split(synopsis, 2)[0]
			entry = nil
			var words []string
			for _, field := range strings.Fields(synopsis) {
				if optional := optionalWord.FindStringSubmatch(field); optional != nil && len(words) == 1 {
					entry = append(entry, words[0]+" "+optional[1])
					break
				}
				if !wordPattern.MatchString(field) || len(words) == 2 {
					break
				}
				words = append(words, field)
			}
			entry = append(entry, strings.Join(words, " "))
			for _, key := range entry {
				if commands[key] == nil {
					commands[key] = map[string]bool{}
				}
			}
		}
		for _, match := range flagPattern.FindAllStringSubmatch(line, -1) {
			for _, key := range entry {
				commands[key][match[1]] = true
			}
		}
	}
	return commands
}

// skillProblems checks each agister command the markdown writes in its
// code spans and code blocks against commands, as parseUsage reads them,
// and returns how many it checked and what it found wrong.
func skillProblems(markdown string, commands map[string]map[string]bool) (int, []string) {
	named := 0
	var problems []string
	for _, code := range codeOf(markdown) {
		for _, args := range invocations(code) {
			if len(args) == 0 {
				continue // agister itself, named in prose
			}
			named++
			key, flags := "", args
			if !strings.HasPrefix(args[0], "-") {
				key, flags = args[0], args[1:]
				if len(args) > 1 && wordPattern.MatchString(args[1]) && hasSubcommands(commands, args[0]) {
					key, flags = args[0]+" "+args[1], args[2:]
				}
				if commands[key] == nil {
					problems = append(problems, "agister "+key+": not a command of the CLI")
					continue
				}
			}
			for _, arg := range flags {
				match := flagArgument.FindStringSubmatch(arg)
				if match != nil && !commands[key][match[1]] && !commands[""][match[1]] {
					problems = append(problems, "agister "+key+": --"+match[1]+" is not one of its flags")
				}
			}
		}
	}
	return named, problems
}

func hasSubcommands(commands map[string]map[string]bool, command string) bool {
	for key := range commands {
		if strings.HasPrefix(key, command+" ") {
			return true
		}
	}
	return false
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
