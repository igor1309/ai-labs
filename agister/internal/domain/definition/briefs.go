package definition

import (
	"fmt"
	"regexp"
	"strings"

	"gopkg.in/yaml.v3"
)

// BriefSchema is the schema of a brief's form (ADR-026 rule 5).
const BriefSchema = "agister.brief/v1alpha1"

// FileSource is the input source that reads a file, the one whose value
// may name the forms its text must have (ADR-026 rule 8).
const FileSource = "file"

// ReferenceFile is what a part that holds a reference to a file says: its
// first back-quoted path, relative to the caller's directory, must exist.
const ReferenceFile = "file"

// Brief is a brief's form as settings define it (ADR-026 rules 3 to 5):
// its parts in order, and the template a caller copies. Agister checks a
// text's structure against it, never its meaning.
type Brief struct {
	Name     string
	Parts    []BriefPart
	Template string
	Source   Source
}

// BriefPart is one part of a brief's form.
type BriefPart struct {
	// Heading is the part's heading line exactly, its Markdown included:
	// "## Intent". Its section runs to the next heading of its level or
	// above.
	Heading  string
	Required bool
	// Reads, when set, is the exact text the part must read, as "None."
	// for Open.
	Reads string
	// Reference is ReferenceFile for a part that refers to a file, empty
	// otherwise.
	Reference string
}

// headingLine is a Markdown ATX heading as a part names it: one to six #,
// one space and its text, with no space around.
var headingLine = regexp.MustCompile(`^#{1,6} \S(.*\S)?$`)

// ParseBrief parses a brief's form: its parts, each with its heading,
// whether it is required, the text it must read and the reference it
// holds; and its template, whose headings are the parts', in order.
func ParseBrief(doc Document) (Brief, error) {
	p := &problems{}
	subject := "brief " + subjectName(doc.Source)
	brief := Brief{Name: doc.Source.Name, Source: doc.Source}
	root := parseYAML(doc.Bytes, p)
	if root == nil {
		return brief, p.err(subject)
	}
	values := fields(root, "", []string{"schema", "name", "status", "parts", "template"}, p)
	header(values, BriefSchema, doc.Source.Name, p)
	switch list := values["parts"]; {
	case list == nil:
		p.add("parts", "is required")
	case list.Kind != yaml.SequenceNode:
		p.add("parts", "must be a list of parts")
	case len(list.Content) == 0:
		p.add("parts", "must list at least one part")
	default:
		seen := map[string]string{} // heading: the field that declared it first
		for i, item := range list.Content {
			field := fieldIndex("parts", i)
			spec := fields(item, field, []string{"heading", "required", "reads", "reference"}, p)
			part := BriefPart{Heading: required(spec, "heading", field, p)}
			if part.Heading != "" {
				if !headingLine.MatchString(part.Heading) {
					p.add(field+".heading", "%q is not a Markdown heading line, such as \"## Intent\"", part.Heading)
				} else if first, ok := seen[part.Heading]; ok {
					p.add(field+".heading", "%q is also the heading of %s", part.Heading, first)
				} else {
					seen[part.Heading] = field
				}
			}
			if node, ok := spec["required"]; ok {
				part.Required, _ = boolean(node, field+".required", p)
			} else {
				p.add(field+".required", "is required")
			}
			if node, ok := spec["reads"]; ok {
				part.Reads = nonEmpty(node, field+".reads", p)
			}
			if node, ok := spec["reference"]; ok {
				if part.Reference, _ = scalar(node, field+".reference", p); part.Reference != ReferenceFile {
					p.add(field+".reference", "must be %q", ReferenceFile)
				}
			}
			brief.Parts = append(brief.Parts, part)
		}
	}
	brief.Template = required(values, "template", "", p)
	if brief.Template != "" && len(p.list) == 0 {
		brief.templateProblems(p)
	}
	return brief, p.err(subject)
}

// templateProblems reports a template whose headings are not the parts':
// each part's once, in the parts' order. The rule and the template are one
// document so that they cannot drift.
func (b Brief) templateProblems(p *problems) {
	found := b.sections(b.Template)
	last := -1
	for i, part := range b.Parts {
		switch at := found[i]; len(at) {
		case 0:
			p.add("template", "has no heading %q", part.Heading)
		case 1:
			if at[0].line < last {
				p.add("template", "has heading %q before the part declared ahead of it", part.Heading)
			}
			last = at[0].line
		default:
			p.add("template", "has heading %q more than once", part.Heading)
		}
	}
}

// Check reports what keeps text from having the form b: each part that
// appears more than once, each required part that is missing or empty,
// each part that does not read as defined, and each part holding a
// reference to a file that names none in back quotes, or whose first
// back-quoted path resolve refuses. It checks structure, never meaning
// (ADR-026 rule 8). resolve is given the path as written.
func (b Brief) Check(text string, resolve func(path string) error) []string {
	var wrong []string
	found := b.sections(text)
	for i, part := range b.Parts {
		at := found[i]
		if len(at) > 1 {
			wrong = append(wrong, fmt.Sprintf("part %q appears %d times", part.Heading, len(at)))
			continue
		}
		if len(at) == 0 {
			if part.Required {
				wrong = append(wrong, fmt.Sprintf("part %q is missing", part.Heading))
			}
			continue
		}
		body := strings.TrimSpace(at[0].body)
		switch {
		case body == "" && part.Required:
			wrong = append(wrong, fmt.Sprintf("part %q is empty", part.Heading))
			continue
		case body == "":
			continue
		case part.Reads != "" && body != part.Reads:
			wrong = append(wrong, fmt.Sprintf("part %q must read %q", part.Heading, part.Reads))
		}
		if part.Reference == ReferenceFile {
			match := backQuoted.FindStringSubmatch(body)
			switch {
			case match == nil:
				wrong = append(wrong, fmt.Sprintf("part %q names no file in back quotes", part.Heading))
			default:
				if err := resolve(match[1]); err != nil {
					wrong = append(wrong, fmt.Sprintf("part %q: %v", part.Heading, err))
				}
			}
		}
	}
	return wrong
}

// backQuoted is a back-quoted span on one line.
var backQuoted = regexp.MustCompile("`([^`\n]+)`")

// section is one appearance of a part's heading in a text: the line it is
// on and what follows it, up to the next heading of its level or above.
type section struct {
	line int
	body string
}

// sections finds each part's heading in text, outside fenced code, by its
// index among b.Parts. A section ends at the next heading of its level or
// above; a part's heading below its level opens a section of its own and
// stays in its body.
func (b Brief) sections(text string) map[int][]section {
	byHeading := map[string]int{}
	for i, part := range b.Parts {
		byHeading[part.Heading] = i
	}
	found := map[int][]section{}
	type reading struct {
		index, level int
		section      section
	}
	var open []reading // the sections being read, outermost first
	closeFrom := func(level int) {
		for len(open) > 0 && open[len(open)-1].level >= level {
			last := open[len(open)-1]
			found[last.index] = append(found[last.index], last.section)
			open = open[:len(open)-1]
		}
	}
	fence := ""
	for n, line := range strings.Split(text, "\n") {
		line = strings.TrimRight(line, " \t\r")
		var starts *reading
		if fence != "" {
			if closesFence(line, fence) {
				fence = ""
			}
		} else if marker := fenceMarker(line); marker != "" {
			fence = marker
		} else if level := headingLevel(line); level > 0 {
			closeFrom(level)
			if i, ok := byHeading[line]; ok {
				starts = &reading{index: i, level: level, section: section{line: n}}
			}
		}
		for i := range open {
			open[i].section.body += line + "\n"
		}
		if starts != nil {
			open = append(open, *starts)
		}
	}
	closeFrom(1)
	return found
}

// fenceIndent is the most a fence's marker may be indented, opening or
// closing; a line indented more is the block's text.
const fenceIndent = 3

// fenceMarker is the run of back quotes or tildes that opens a fenced code
// block on line, empty when line opens none.
func fenceMarker(line string) string {
	trimmed := strings.TrimLeft(line, " ")
	if len(line)-len(trimmed) > fenceIndent {
		return ""
	}
	for _, mark := range []string{"`", "~"} {
		run := len(trimmed) - len(strings.TrimLeft(trimmed, mark))
		if run >= 3 {
			return strings.Repeat(mark, run)
		}
	}
	return ""
}

// closesFence reports whether line closes the fenced code block that fence
// opened: the same mark at least as long, indented no more than an opening
// one may be, with nothing after it.
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

// formNames reports the problems of a value's form list: each a literal
// brief name, named once, and at least one.
func formNames(names []string, field string, p *problems) []string {
	if len(names) == 0 {
		p.add(field, "must name at least one form")
		return nil
	}
	seen := map[string]string{}
	var valid []string
	for i, name := range names {
		at := fieldIndex(field, i)
		switch first, again := seen[name]; {
		case strings.Contains(name, "${"):
			p.add(at, "is not interpolated: name the brief document literally")
		case !ValidName(name):
			p.add(at, "invalid brief name %q", name)
		case again:
			p.add(at, "form %q is named twice (also %s)", name, first)
		default:
			seen[name] = at
			valid = append(valid, name)
		}
	}
	return valid
}

// forms lists the forms values name, each once, in declaration order.
func forms(values []Value) []string {
	var names []string
	for _, value := range values {
		for _, name := range value.Forms {
			if !contains(names, name) {
				names = append(names, name)
			}
		}
	}
	return names
}

// Forms lists the brief forms the process's inputs name, each once.
func (p Process) Forms() []string { return forms(p.Values) }

// Forms lists the brief forms the workflow's inputs name, each once.
func (w Workflow) Forms() []string { return forms(w.Values) }
