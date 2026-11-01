package inputs

import (
	"context"
	"fmt"
	"regexp"
	"strings"
)

// Form is a brief form a text may take (ADR-010, rule 5), by its name: its
// parts, which check the text's structure, never its meaning.
type Form struct {
	Name  string
	Parts []Part
}

// Part is a part of a brief form: its heading line, Markdown and all;
// whether a text must have it; the text it must read, "" for any; and
// whether it refers to a file, the first path it names in back quotes.
type Part struct {
	Heading      string
	Required     bool
	Reads        string
	RefersToFile bool
}

// takesAForm is nil where text takes one of forms, else the error that
// names, for each form, what keeps text from taking it.
func (r *Resolver) takesAForm(ctx context.Context, text string, forms []Form) error {
	var lacks []string
	for _, form := range forms {
		wrong, err := r.wrong(ctx, text, form)
		if err != nil {
			return err
		}
		if len(wrong) == 0 {
			return nil
		}
		lacks = append(lacks, fmt.Sprintf("%q: %s", form.Name, strings.Join(wrong, ", ")))
	}
	return fmt.Errorf("it takes none of its forms: %s", strings.Join(lacks, "; "))
}

// wrong is what keeps text from taking form, none where it takes it: each
// part that appears more than once, each required part missing or empty,
// each that does not read as it must, and each that refers to a file and
// names none in back quotes, or names one that does not exist. An error is
// paths' failing to tell.
func (r *Resolver) wrong(ctx context.Context, text string, form Form) ([]string, error) {
	headings := make([]string, 0, len(form.Parts))
	for _, part := range form.Parts {
		headings = append(headings, part.Heading)
	}
	found := sections(text, headings)
	var wrong []string
	for _, part := range form.Parts {
		at := found[part.Heading]
		switch {
		case len(at) > 1:
			wrong = append(wrong, fmt.Sprintf("part %q appears %d times", part.Heading, len(at)))
			continue
		case len(at) == 0:
			if part.Required {
				wrong = append(wrong, fmt.Sprintf("part %q is missing", part.Heading))
			}
			continue
		}
		body := strings.TrimSpace(at[0])
		switch {
		case body == "" && part.Required:
			wrong = append(wrong, fmt.Sprintf("part %q is empty", part.Heading))
			continue
		// An optional part may be there and empty, unless it must read a
		// text or name a file.
		case body == "" && part.Reads == "" && !part.RefersToFile:
			continue
		case part.Reads != "" && body != part.Reads:
			wrong = append(wrong, fmt.Sprintf("part %q must read %q", part.Heading, part.Reads))
		}
		if !part.RefersToFile {
			continue
		}
		match := backQuoted.FindStringSubmatch(body)
		if match == nil {
			wrong = append(wrong, fmt.Sprintf("part %q names no file in back quotes", part.Heading))
			continue
		}
		exists, err := r.paths.Exists(ctx, match[1])
		if err != nil {
			return nil, fmt.Errorf("part %q: %q: %w", part.Heading, match[1], err)
		}
		if !exists {
			wrong = append(wrong, fmt.Sprintf("part %q: %q does not exist", part.Heading, match[1]))
		}
	}
	return wrong, nil
}

// backQuoted is a back-quoted span on one line.
var backQuoted = regexp.MustCompile("`([^`\n]+)`")

// sections is the body of each appearance in text of each of headings,
// by the heading: the lines after it up to the next heading of its level or
// above, each without trailing blanks. A heading inside fenced code is the
// code's text, and a heading of a lower level stays in the body it is in.
func sections(text string, headings []string) map[string][]string {
	lines := strings.Split(text, "\n")
	found := map[string][]string{}
	type reading struct {
		heading string
		level   int
		line    int
	}
	var open []reading
	closeFrom := func(level, end int) {
		for len(open) > 0 && open[len(open)-1].level >= level {
			last := open[len(open)-1]
			found[last.heading] = append(found[last.heading], strings.Join(lines[last.line+1:end], "\n"))
			open = open[:len(open)-1]
		}
	}
	fence := ""
	for n, line := range lines {
		line = strings.TrimRight(line, " \t\r")
		lines[n] = line
		if fence != "" {
			if closesFence(line, fence) {
				fence = ""
			}
		} else if marker := fenceMarker(line); marker != "" {
			fence = marker
		} else if level := headingLevel(line); level > 0 {
			closeFrom(level, n)
			for _, heading := range headings {
				if line == heading {
					open = append(open, reading{heading: heading, level: level, line: n})
					break
				}
			}
		}
	}
	closeFrom(1, len(lines))
	return found
}

// fenceIndent is the most a fence's marker may be indented, opening or
// closing; a line indented more is the block's text.
const fenceIndent = 3

// fenceMarker is the run of back quotes or tildes that opens a fenced code
// block on line, "" where line opens none. A run of back quotes with
// another back quote after it opens none: the line is inline code, as
// CommonMark has it.
func fenceMarker(line string) string {
	trimmed := strings.TrimLeft(line, " ")
	if len(line)-len(trimmed) > fenceIndent {
		return ""
	}
	for _, mark := range []string{"`", "~"} {
		run := len(trimmed) - len(strings.TrimLeft(trimmed, mark))
		if run >= 3 && !(mark == "`" && strings.Contains(trimmed[run:], "`")) {
			return strings.Repeat(mark, run)
		}
	}
	return ""
}

// closesFence is whether line closes the fenced code block fence opened:
// the same mark at least as long, indented no more than an opening one may
// be, with nothing after it.
func closesFence(line, fence string) bool {
	trimmed := strings.TrimLeft(line, " ")
	return len(line)-len(trimmed) <= fenceIndent && strings.HasPrefix(trimmed, fence) && strings.Trim(trimmed, fence[:1]) == ""
}

// headingLevel is the level of a Markdown ATX heading line, 0 for any
// other line.
func headingLevel(line string) int {
	level := len(line) - len(strings.TrimLeft(line, "#"))
	if level < 1 || level > 6 || len(line) > level && line[level] != ' ' && line[level] != '\t' {
		return 0
	}
	return level
}
