package documents

import (
	"fmt"
	"slices"
	"strings"

	"github.com/igor1309/ai-labs/gokit/tree"
)

// BriefDefinition is a brief form, which checks a text's structure, never
// its meaning (ADR-010, rule 5): its name, its parts in the file's order,
// at least one, and the template a caller copies, whose headings are the
// parts', each once and in their order; it must give both.
type BriefDefinition struct {
	Name     string
	Parts    Field[[]Field[Part]]
	Template Field[string]
}

// Part is one part of a brief: its heading, a Markdown heading line no
// other part has, and whether a text must have it, which it must give; the
// text it reads and the reference it is, "file", which it may.
type Part struct {
	Heading   Field[string]
	Required  Field[bool]
	Reads     Field[string]
	Reference Field[string]
}

// Brief is the brief name, typed from its composed tree, extends applied,
// or its problems, and then no brief: those of its tree, as Tree gives
// them, or else those of its fields.
func (d *Documents) Brief(name string) (BriefDefinition, []Problem) {
	brief, problems := definitionOf(d.briefs, Brief, name)
	return brief.clone(), problems
}

// clone is the brief with a slice of parts of its own: a brief is typed
// once and held, and a caller that changes what it was given must change
// nothing Documents holds.
func (b BriefDefinition) clone() BriefDefinition {
	b.Parts.Value = slices.Clone(b.Parts.Value)
	return b
}

func typeBrief(name string, root tree.Node) (BriefDefinition, []Problem) {
	t := newTyping(Brief, root)
	brief := BriefDefinition{Name: name}
	parts := t.list("parts", required)
	// A form of no part would take any text.
	if listed, _ := t.node.Get("parts"); parts.Given && len(listed.Items()) == 0 {
		t.problem(parts.Origin, "parts", "it names a part")
	}
	// headings are the parts' that are Markdown heading lines, each once, in
	// the parts' order; first is the place of the part that has each.
	var headings []string
	first := map[string]string{}
	var typed []Field[Part]
	for _, p := range parts.Value {
		part := Part{Heading: p.text("heading", required)}
		if heading := part.Heading; heading.Given {
			switch earlier, seen := first[heading.Value]; {
			case !headingLine(heading.Value):
				p.problem(heading.Origin, p.at("heading"), `it is a Markdown heading line, as "## Goal"`)
			// Two parts of one heading could not be told apart in a text.
			case seen:
				p.problem(heading.Origin, p.at("heading"), "it is also the heading of "+earlier)
			default:
				first[heading.Value] = p.place
				headings = append(headings, heading.Value)
			}
		}
		part.Required = p.boolean("required", required)
		part.Reads = p.text("reads", optional)
		part.Reference = p.oneOf("reference", optional, "file")
		p.done()
		typed = append(typed, Field[Part]{Value: part, Origin: originOf(p.node), Given: true})
	}
	if parts.Given {
		brief.Parts = Field[[]Field[Part]]{Value: typed, Origin: parts.Origin, Given: true}
	}
	brief.Template = t.text("template", required)
	if brief.Template.Given {
		for _, message := range disagreement(brief.Template.Value, headings) {
			t.problem(brief.Template.Origin, "template", message)
		}
	}
	if problems := t.end(); len(problems) > 0 {
		return BriefDefinition{}, problems
	}
	return brief, nil
}

// headingLine is whether heading is a Markdown heading line: one line of
// one to six "#", a space and its text.
func headingLine(heading string) bool {
	text := strings.TrimLeft(heading, "#")
	level := len(heading) - len(text)
	return level >= 1 && level <= 6 && strings.HasPrefix(text, " ") && strings.TrimSpace(text) != "" &&
		!strings.ContainsAny(heading, "\r\n")
}

// disagreement is how template, the form's own example, differs from
// headings, the parts' in their order: each is a line of it, once, and
// after the one before it. A line is a heading only where it is a part's,
// and wherever it is: fenced code is not passed over.
func disagreement(template string, headings []string) []string {
	lines := map[string][]int{}
	for i, line := range strings.Split(template, "\n") {
		if slices.Contains(headings, line) {
			lines[line] = append(lines[line], i)
		}
	}
	var messages []string
	for _, heading := range headings {
		switch len(lines[heading]) {
		case 0:
			messages = append(messages, fmt.Sprintf("it has the heading %q", heading))
		case 1:
		default:
			messages = append(messages, fmt.Sprintf("it has the heading %q once", heading))
		}
	}
	// Order is read among the headings the template has once: one missing
	// or repeated has its own problem, and no single place.
	previous, previousLine := "", -1
	for _, heading := range headings {
		if len(lines[heading]) != 1 {
			continue
		}
		line := lines[heading][0]
		if line < previousLine {
			messages = append(messages, fmt.Sprintf("it has the heading %q after %q", heading, previous))
		}
		previous, previousLine = heading, line
	}
	return messages
}
