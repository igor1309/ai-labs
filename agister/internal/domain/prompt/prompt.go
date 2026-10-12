// Package prompt assembles what the agent receives. The words come from the
// process definition; this package only arranges them with the resolved
// inputs and the granted permissions, with a verification run's failure, or
// with the evidence of a stale turn.
// The one exception is a continuation's notice (Continues),
// whose facts only Agister knows.
//
// It depends on the run package's evidence types (run.Input, run.Output,
// run.Stale):
// the agent receives exactly what the call records, so the prompt is built
// from the recorded values rather than from copies of them.
package prompt

import (
	"fmt"
	"strings"

	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

// Instruction is the process instruction followed by the grant.
func Instruction(instruction string, granted, withheld []string) string {
	var b strings.Builder
	b.WriteString(strings.TrimSpace(instruction))
	b.WriteString("\n\nGranted permissions: ")
	if len(granted) == 0 {
		b.WriteString("none")
	} else {
		b.WriteString(strings.Join(granted, ", "))
	}
	if len(withheld) > 0 {
		b.WriteString("\nWithheld permissions: " + strings.Join(withheld, ", "))
	}
	return b.String()
}

// Inputs renders each input as a named section, in declaration order.
func Inputs(inputs []run.Input) string {
	sections := make([]string, 0, len(inputs))
	for _, input := range inputs {
		sections = append(sections, fmt.Sprintf("## %s\n\n%s", input.Name, render(input.Value)))
	}
	return strings.Join(sections, "\n\n")
}

// Continues is Agister's notice to a continued call, which works in the
// caller's worktree (ADR-025 rule 7): the run it continues, the
// worktree at dir, at revision, and that the session's changes, as its
// latest run left them, are already there.
func Continues(continued, latest, dir, revision string) string {
	return "## continuation\n\n" + fmt.Sprintf("This call continues run %s. It works in the worktree at %s, at revision %s, where the session worked before."+
		" The session's changes, as run %s, its latest run, left them, are already in this worktree, uncommitted.", continued, dir, revision, latest)
}

func render(value any) string {
	switch v := value.(type) {
	case []string:
		lines := make([]string, len(v))
		for i, item := range v {
			lines[i] = "- " + item
		}
		return strings.Join(lines, "\n")
	case string:
		if strings.Contains(v, "\n") {
			return fenced(v)
		}
		return v
	default:
		return fmt.Sprint(v)
	}
}

// fence is longer than any backtick run in text, so the text cannot close
// it: a diff containing ``` stays inside its section.
func fence(text string) string {
	longest, run := 0, 0
	for _, r := range text {
		if r == '`' {
			run++
			longest = max(longest, run)
		} else {
			run = 0
		}
	}
	return strings.Repeat("`", max(3, longest+1))
}

// Repair is what a repair turn receives (ADR-002 rule 4): the process's
// verify instruction, then the command, how its run ended and its bounded
// output.
func Repair(instruction, command, ended string, output run.Output) string {
	text := output.Head
	if output.Omitted > 0 {
		text += fmt.Sprintf("\n[… %d bytes omitted …]\n", output.Omitted)
	}
	text += output.Tail
	sections := []string{
		strings.TrimSpace(instruction),
		"## command\n\n" + fenced(command),
		"## exit status\n\n" + ended,
		fmt.Sprintf("## output\n\n%d bytes, sha256 %s\n\n%s", output.Bytes, output.SHA256, fenced(text)),
	}
	return strings.Join(sections, "\n\n")
}

// Recovery is what a recovery turn receives (ADR-024 rules 2 and 4): the
// process's stale.recover instruction, then the evidence of what went
// stale, which names the limit. It is the evidence only: what to do about
// it is the instruction's to say.
func Recovery(instruction string, stale run.Stale) string {
	sections := []string{strings.TrimSpace(instruction)}
	call := func(title string) {
		if stale.Tool == nil {
			return
		}
		section := "## " + title + "\n\n" + stale.Tool.Name
		if stale.Tool.Input != "" {
			section += "\n\n" + fenced(stale.Tool.Input)
		}
		sections = append(sections, section)
	}
	switch stale.Limit {
	case run.StaleRepeatedToolCalls:
		sections = append(sections, fmt.Sprintf("## stale limit\n\nstale.repeated_tool_calls: the same tool call was made %d times in a row, and the turn was ended.", stale.Count))
		call("tool call")
		// A runtime that reports no result leaves nothing to say of one.
		if stale.Tool != nil && stale.Tool.Result != nil {
			sections = append(sections, "## last result\n\n"+fenced(*stale.Tool.Result))
		}
	case run.StaleToolCommand:
		sections = append(sections, fmt.Sprintf("## stale limit\n\nstale.tool_command: a tool's command ran for %s, and the turn was ended.", stale.After))
		call("command")
	default:
		sections = append(sections, fmt.Sprintf("## stale limit\n\nstale.%s: the turn was interrupted after %s without an event from the runtime.", stale.Limit, stale.After))
	}
	return strings.Join(sections, "\n\n")
}

// fenced puts text in a code block it cannot close.
func fenced(text string) string {
	fence := fence(text)
	return fence + "\n" + strings.TrimRight(text, "\n") + "\n" + fence
}
