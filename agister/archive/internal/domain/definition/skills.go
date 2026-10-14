package definition

import (
	"strings"

	"gopkg.in/yaml.v3"

	"github.com/igor1309/ai-labs/agister/internal/domain/document"
)

// Skill is a skill the settings give an agent, a document of its own that
// an agent and a process name (ADR-021). The document is its SKILL.md.
type Skill struct {
	Name        string
	Description string
	// Bytes are the whole SKILL.md, unchanged, front matter included: what
	// the call is given.
	Bytes  []byte
	Source document.Source
}

// ParseSkill reads a skill: its SKILL.md, whose front matter's name is the
// document's and whose description is not empty. What else the front
// matter holds is the runtime's to read.
func ParseSkill(doc document.Document) (Skill, error) {
	p := &problems{}
	skill := Skill{Name: doc.Source.Name, Source: doc.Source}
	subject := "skill " + subjectName(doc.Source)
	if !readable(doc.Bytes, p) {
		return skill, p.err(subject)
	}
	skill.Bytes = append([]byte(nil), doc.Bytes...)
	header, ok := frontMatter(string(doc.Bytes), p)
	if !ok {
		return skill, p.err(subject)
	}
	var document yaml.Node
	if err := yaml.Unmarshal([]byte(header), &document); err != nil {
		p.add("front matter", "%v", err)
		return skill, p.err(subject)
	}
	if len(document.Content) == 0 || document.Content[0].Kind != yaml.MappingNode {
		p.add("front matter", "must be a mapping with name and description")
		return skill, p.err(subject)
	}
	root := document.Content[0]
	unique(root, "", p)
	values := map[string]*yaml.Node{}
	for _, entry := range mapping(root, "", p) {
		if _, ok := values[entry.key]; !ok {
			values[entry.key] = entry.value
		}
	}
	checkName(required(values, "name", "", p), doc.Source.Name, p)
	if node, ok := values["description"]; !ok {
		p.add("description", "is required")
	} else if text, ok := scalar(node, "description", p); ok {
		if skill.Description = strings.TrimSpace(text); skill.Description == "" {
			p.add("description", "must not be empty")
		}
	}
	return skill, p.err(subject)
}

// frontMatter is the text between a SKILL.md's first line, ---, and the
// next such line.
func frontMatter(text string, p *problems) (string, bool) {
	delimiter := func(line string) bool { return strings.TrimRight(line, " \t\r") == "---" }
	first, rest, _ := strings.Cut(text, "\n")
	if !delimiter(first) {
		p.add("", "has no front matter: it starts with a line ---, then name and description, then a line ---")
		return "", false
	}
	var header []string
	for rest != "" {
		var line string
		line, rest, _ = strings.Cut(rest, "\n")
		if delimiter(line) {
			return strings.Join(header, "\n"), true
		}
		header = append(header, line)
	}
	p.add("", "front matter is not closed by a line ---")
	return "", false
}

// skillNames reports the problems of a list of skill names, under field:
// each is a literal document name, named once. It returns the names that
// have none.
func skillNames(names []string, field string, p *problems) []string {
	seen := map[string]string{} // name: the field that named it first
	var valid []string
	for i, name := range names {
		at := fieldIndex(field, i)
		switch first, again := seen[name]; {
		case strings.Contains(name, "${"):
			p.add(at, "is not interpolated: name the skill document literally")
		case !document.ValidName(name):
			p.add(at, "invalid skill name %q", name)
		case again:
			p.add(at, "skill %q is named twice (also %s)", name, first)
		default:
			seen[name] = at
			valid = append(valid, name)
		}
	}
	return valid
}

// CallSkills lists the skills a call of the process on the agent is given:
// the process's, then the agent's, each once (ADR-021 rule 2).
func CallSkills(process Process, agent Agent) []string {
	var names []string
	for _, name := range append(append([]string(nil), process.Skills...), agent.Skills...) {
		if !contains(names, name) {
			names = append(names, name)
		}
	}
	return names
}
