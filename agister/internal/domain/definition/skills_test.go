package definition_test

import (
	"reflect"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
)

// Settings give an agent its skills (ADR-021).

const reviewSkill = "---\nname: review\ndescription: How to review a change.\nlicense: MIT\n---\n\n# Review\n\nRead the diff.\n"

// Rule 1: a skill is its SKILL.md: its bytes are the whole file, unchanged,
// front matter included, and what else the front matter holds is the
// runtime's.
func TestASkillIsItsSkillFile(t *testing.T) {
	t.Parallel()
	skill, err := definition.ParseSkill(doc(definition.KindSkill, "review", reviewSkill))
	if err != nil || skill.Name != "review" || skill.Description != "How to review a change." || string(skill.Bytes) != reviewSkill || skill.Source.Kind != definition.KindSkill {
		t.Fatalf("skill = %+v, %v", skill, err)
	}
	// The front matter may end the file, and a description may be folded.
	folded := "---\r\nname: review\r\ndescription: >\r\n  How to review\r\n  a change.\r\n---"
	if skill, err := definition.ParseSkill(doc(definition.KindSkill, "review", folded)); err != nil || skill.Description != "How to review a change." || string(skill.Bytes) != folded {
		t.Fatalf("folded = %+v, %v", skill, err)
	}
}

// Rule 1: the front matter's name is the folder's and its description is
// not empty; a file without front matter is no skill.
func TestASkillsFrontMatterNamesItAndDescribesIt(t *testing.T) {
	t.Parallel()
	cases := map[string]struct{ text, want string }{
		"a name unlike the folder": {"---\nname: reviews\ndescription: d\n---\n", `name: "reviews" does not match its definition name "review"`},
		"no name":                  {"---\ndescription: d\n---\n", "name: is required"},
		"a name twice":             {"---\nname: review\nname: other\ndescription: d\n---\n", "name: is declared more than once"},
		"no description":           {"---\nname: review\n---\n", "description: is required"},
		"an empty description":     {"---\nname: review\ndescription: \"\"\n---\n", "description: must not be empty"},
		"a blank description":      {"---\nname: review\ndescription: \"  \"\n---\n", "description: must not be empty"},
		"a description not text":   {"---\nname: review\ndescription: [a, b]\n---\n", "description: must be a scalar"},
		"no front matter":          {"# Review\n\nname: review\ndescription: d\n", "has no front matter: it starts with a line ---, then name and description, then a line ---"},
		"an empty file":            {"", "has no front matter"},
		"front matter left open":   {"---\nname: review\ndescription: d\n\n# Review\n", "front matter is not closed by a line ---"},
		"front matter not YAML":    {"---\nname: [review\n---\n", "front matter: yaml:"},
		"front matter not a map":   {"---\n- review\n---\n", "front matter: must be a mapping with name and description"},
		"empty front matter":       {"---\n---\n", "front matter: must be a mapping with name and description"},
		"a NUL byte":               {"---\nname: review\ndescription: d\n---\n\x00", "not a UTF-8 text file"},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			_, err := definition.ParseSkill(doc(definition.KindSkill, "review", c.text))
			if err == nil || !strings.HasPrefix(err.Error(), "skill review (review) is invalid:\n  ") || !strings.Contains(err.Error(), "\n  "+c.want) {
				t.Fatalf("err = %v, want %q", err, c.want)
			}
		})
	}
}

const skilledAgent = `schema = "agister.agent/v1alpha1"
name = "a"
runtime = "rt"
`

// skilledProcess is a text process with the top-level lines given.
func skilledProcess(lines string) string {
	return `schema: agister.process/v1alpha1
name: p
type: process
prompt: review
` + lines + `input:
  instruction: Review it.
  params:
    which: {default: review}
output:
  format: text
`
}

// Rule 2: an agent and a process name their skills, each a literal
// document name, in the order written.
func TestAnAgentAndAProcessNameTheirSkills(t *testing.T) {
	t.Parallel()
	agent, err := definition.ParseAgent(doc(definition.KindAgent, "a", skilledAgent+"skills = [\"style\", \"review\"]\n"))
	if err != nil || !reflect.DeepEqual(agent.Skills, []string{"style", "review"}) {
		t.Fatalf("agent skills = %q, %v", agent.Skills, err)
	}
	process, err := definition.ParseProcess(doc(definition.KindProcess, "p", skilledProcess("skills: [review, tests]\n")))
	if err != nil || !reflect.DeepEqual(process.Skills, []string{"review", "tests"}) {
		t.Fatalf("process skills = %q, %v", process.Skills, err)
	}
	// Neither needs any.
	for _, text := range []string{skilledAgent, skilledAgent + "skills = []\n"} {
		if agent, err := definition.ParseAgent(doc(definition.KindAgent, "a", text)); err != nil || len(agent.Skills) != 0 {
			t.Fatalf("agent skills = %q, %v", agent.Skills, err)
		}
	}
	for _, lines := range []string{"", "skills: []\n"} {
		if process, err := definition.ParseProcess(doc(definition.KindProcess, "p", skilledProcess(lines))); err != nil || len(process.Skills) != 0 {
			t.Fatalf("process skills = %q, %v", process.Skills, err)
		}
	}
}

// Rule 2: a name is literal, as a prompt's is: not interpolated, valid by
// the naming rule. One repeated in a list is a problem, as a node or a
// block named twice is.
func TestASkillNameIsLiteralAndNamedOnce(t *testing.T) {
	t.Parallel()
	cases := map[string]struct{ toml, yaml, want string }{
		"interpolated":   {`["${param.which}"]`, `["${param.which}"]`, "skills[0]: is not interpolated: name the skill document literally"},
		"partly so":      {`["review", "review_${param.which}"]`, `[review, "review_${param.which}"]`, "skills[1]: is not interpolated"},
		"a path":         {`["../review"]`, `[../review]`, `skills[0]: invalid skill name "../review"`},
		"not a name":     {`["Code Review"]`, `[Code Review]`, `skills[0]: invalid skill name "Code Review"`},
		"an empty name":  {`[""]`, `[""]`, `skills[0]: invalid skill name ""`},
		"named twice":    {`["review", "style", "review"]`, `[review, style, review]`, `skills[2]: skill "review" is named twice (also skills[0])`},
		"not a list":     {`"review"`, `review`, "skills: must be a list"},
		"not all string": {`["review", 1]`, `[review, [style]]`, "skills[1]: must be a s"},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			_, err := definition.ParseAgent(doc(definition.KindAgent, "a", skilledAgent+"skills = "+c.toml+"\n"))
			if err == nil || !strings.Contains(err.Error(), "\n  "+c.want) {
				t.Errorf("agent: err = %v, want %q", err, c.want)
			}
			_, err = definition.ParseProcess(doc(definition.KindProcess, "p", skilledProcess("skills: "+c.yaml+"\n")))
			if err == nil || !strings.Contains(err.Error(), "\n  "+c.want) {
				t.Errorf("process: err = %v, want %q", err, c.want)
			}
		})
	}
}

// Rule 2: a second skills does not replace the first, whichever is empty:
// a process or an agent that names a skill is not read as naming none.
func TestSkillsDeclaredTwiceIsInvalid(t *testing.T) {
	t.Parallel()
	cases := map[string]struct{ toml, yaml string }{
		"some, then none":  {"skills = [\"review\"]\nskills = []\n", "skills: [review]\nskills: []\n"},
		"none, then some":  {"skills = []\nskills = [\"review\"]\n", "skills: []\nskills: [review]\n"},
		"some, then other": {"skills = [\"review\"]\nskills = [\"style\"]\n", "skills: [review]\nskills: [style]\n"},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			// The TOML parser refuses a key defined twice itself.
			agent, err := definition.ParseAgent(doc(definition.KindAgent, "a", skilledAgent+c.toml))
			if want := "(last key \"skills\"): Key 'skills' has already been defined."; err == nil || !strings.Contains(err.Error(), want) || len(agent.Skills) != 0 {
				t.Errorf("agent: skills %q, err = %v, want %q", agent.Skills, err, want)
			}
			_, err = definition.ParseProcess(doc(definition.KindProcess, "p", skilledProcess(c.yaml)))
			if want := "\n  skills: is declared more than once: one list names the process's skills"; err == nil || !strings.Contains(err.Error(), want) {
				t.Errorf("process: err = %v, want %q", err, want)
			}
		})
	}
	// Apart at the two ends of the document, as next to each other.
	_, err := definition.ParseProcess(doc(definition.KindProcess, "p", skilledProcess("skills: [review]\n")+"skills: []\n"))
	if err == nil || !strings.Contains(err.Error(), "\n  skills: is declared more than once") {
		t.Fatalf("apart: err = %v", err)
	}
	// A skills that is not the process's own is not a second one.
	_, err = definition.ParseProcess(doc(definition.KindProcess, "p", skilledProcess("skills: [review]\n")+"  skills: []\n"))
	if err == nil || strings.Contains(err.Error(), "more than once") || !strings.Contains(err.Error(), "\n  output.skills: unknown field") {
		t.Fatalf("nested: err = %v", err)
	}
}

// Rule 2: the call gets the process's skills, then its agent's, each once.
func TestACallsSkillsAreTheProcessesThenItsAgents(t *testing.T) {
	t.Parallel()
	process := definition.Process{Skills: []string{"review", "tests"}}
	agent := definition.Agent{Skills: []string{"style", "review", "git"}}
	if got := definition.CallSkills(process, agent); !reflect.DeepEqual(got, []string{"review", "tests", "style", "git"}) {
		t.Fatalf("skills = %q", got)
	}
	if got := definition.CallSkills(process, definition.Agent{}); !reflect.DeepEqual(got, []string{"review", "tests"}) {
		t.Fatalf("the process's alone = %q", got)
	}
	if got := definition.CallSkills(definition.Process{}, definition.Agent{}); len(got) != 0 {
		t.Fatalf("none named = %q", got)
	}
	if !reflect.DeepEqual(process.Skills, []string{"review", "tests"}) || !reflect.DeepEqual(agent.Skills, []string{"style", "review", "git"}) {
		t.Fatalf("the lists changed: %q, %q", process.Skills, agent.Skills)
	}
}

// An agent's skills survive being written as a settings document.
func TestAnAgentsSkillsRoundTrip(t *testing.T) {
	t.Parallel()
	agent := definition.Agent{Name: "r", Runtime: "claude-code", Skills: []string{"review", "style"}}
	parsed, err := definition.ParseAgent(doc(definition.KindAgent, "r", string(definition.FormatAgent(agent))))
	if err != nil || !reflect.DeepEqual(parsed.Skills, agent.Skills) {
		t.Fatalf("skills = %q, %v", parsed.Skills, err)
	}
	if text := string(definition.FormatAgent(definition.Agent{Name: "r", Runtime: "claude-code"})); strings.Contains(text, "skills") {
		t.Fatalf("an agent without skills is written with some:\n%s", text)
	}
}

// Rule 4: a skill is not a kind blocks.yaml names (ADR-018 rule 1).
func TestASkillCannotBeBlocked(t *testing.T) {
	t.Parallel()
	_, err := definition.ParseBlocks(doc(definition.KindBlocks, "blocks", "schema: agister.blocks/v1alpha1\nblocks:\n  - ref: skill:review\n"))
	if want := `blocks[0].ref: "skill" cannot be blocked: only a process, workflow, agent or runtime is`; err == nil || !strings.Contains(err.Error(), want) {
		t.Fatalf("err = %v, want %q", err, want)
	}
}
