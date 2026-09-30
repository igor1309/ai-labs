// Package prompt assembles what the agent receives. The words come from the
// process definition; this package only arranges them with the resolved
// inputs and the granted permissions, or with a verification run's failure.
//
// It depends on the run package's evidence types (run.Input, run.Output):
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

// fenced puts text in a code block it cannot close.
func fenced(text string) string {
	fence := fence(text)
	return fence + "\n" + strings.TrimRight(text, "\n") + "\n" + fence
}
