package definition_test

import (
	"errors"
	"reflect"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
)

// Settings define a brief's form (ADR-026 rules 3 to 5): its parts and the
// template a caller copies; a file input may name the forms its text must
// have, and agister checks the text's structure against them.

// stepForm is a step brief's form: a required part that refers to a file, a
// required one, an optional one, and Open, which must read None.
const stepForm = `schema: agister.brief/v1alpha1
name: step
parts:
  - {heading: "## Goal", required: true, reference: file}
  - {heading: "## Covers", required: true}
  - {heading: "## Constraints", required: false}
  - {heading: "## Open", required: true, reads: None.}
template: |
  # <issue> step <n>

  ## Goal

  ` + "`<the goal file>`" + `

  ## Covers

  - <criterion>

  ## Constraints

  <Only what the goal does not say.>

  ## Open

  None.
`

func parseStep(t *testing.T) definition.Brief {
	t.Helper()
	brief, err := definition.ParseBrief(doc(definition.KindBrief, "step", stepForm))
	if err != nil {
		t.Fatal(err)
	}
	return brief
}

// A form is its parts in order, each with its heading, whether it is
// required, the text it must read and the reference it holds; and its
// template.
func TestABriefIsItsPartsAndItsTemplate(t *testing.T) {
	t.Parallel()
	brief := parseStep(t)
	want := []definition.BriefPart{
		{Heading: "## Goal", Required: true, Reference: definition.ReferenceFile},
		{Heading: "## Covers", Required: true},
		{Heading: "## Constraints"},
		{Heading: "## Open", Required: true, Reads: "None."},
	}
	if brief.Name != "step" || !reflect.DeepEqual(brief.Parts, want) || !strings.HasPrefix(brief.Template, "# <issue> step <n>\n\n## Goal\n") || brief.Source.Kind != definition.KindBrief {
		t.Fatalf("brief = %+v", brief)
	}
}

// A form names each part by a heading line, once; says whether each is
// required; holds no other reference than a file; and has a template whose
// headings are its parts', each once and in order.
func TestABriefsFormIsChecked(t *testing.T) {
	t.Parallel()
	cases := map[string]struct{ text, want string }{
		"another schema":          {strings.Replace(stepForm, "agister.brief/v1alpha1", "agister.prompt/v1alpha1", 1), "schema:"},
		"no parts":                {strings.Replace(stepForm, "parts:\n", "other:\n", 1), "parts: is required"},
		"parts not a list":        {"schema: agister.brief/v1alpha1\nname: step\nparts: {heading: \"## Goal\"}\ntemplate: x\n", "parts: must be a list of parts"},
		"no part":                 {"schema: agister.brief/v1alpha1\nname: step\nparts: []\ntemplate: x\n", "parts: must list at least one part"},
		"a heading without #":     {strings.Replace(stepForm, `"## Covers"`, `"Covers"`, 1), `parts[1].heading: "Covers" is not a Markdown heading line`},
		"a heading twice":         {strings.Replace(stepForm, `"## Covers"`, `"## Goal"`, 1), `parts[1].heading: "## Goal" is also the heading of parts[0]`},
		"a part without heading":  {strings.Replace(stepForm, `heading: "## Covers", `, "", 1), "parts[1].heading: is required"},
		"required not said":       {strings.Replace(stepForm, `"## Covers", required: true`, `"## Covers"`, 1), "parts[1].required: is required"},
		"required not a boolean":  {strings.Replace(stepForm, `"## Covers", required: true`, `"## Covers", required: yes please`, 1), "parts[1].required:"},
		"an empty reads":          {strings.Replace(stepForm, "reads: None.", `reads: ""`, 1), "parts[3].reads: must not be empty"},
		"another reference":       {strings.Replace(stepForm, "reference: file", "reference: url", 1), `parts[0].reference: must be "file"`},
		"an unknown field":        {strings.Replace(stepForm, "reference: file", "refers: file", 1), "parts[0].refers: unknown field"},
		"no template":             {strings.Split(stepForm, "template:")[0], "template: is required"},
		"a template without part": {strings.Replace(stepForm, "  ## Covers\n", "  ## Covered\n", 1), `template: has no heading "## Covers"`},
		"a template part twice":   {strings.Replace(stepForm, "  ## Open\n", "  ## Covers\n\n  ## Open\n", 1), `template: has heading "## Covers" more than once`},
		"a name unlike the file":  {strings.Replace(stepForm, "name: step", "name: goal", 1), `name: "goal" does not match`},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			_, err := definition.ParseBrief(doc(definition.KindBrief, "step", c.text))
			if err == nil || !strings.HasPrefix(err.Error(), "brief step (step) is invalid:") || !strings.Contains(err.Error(), c.want) {
				t.Fatalf("err = %v, want %q", err, c.want)
			}
		})
	}
	// Parts in the template out of the parts' order.
	swapped := strings.Replace(strings.Replace(strings.Replace(stepForm, "  ## Goal\n", "  ## X\n", 1), "  ## Covers\n", "  ## Goal\n", 1), "  ## X\n", "  ## Covers\n", 1)
	_, err := definition.ParseBrief(doc(definition.KindBrief, "step", swapped))
	if err == nil || !strings.Contains(err.Error(), `template: has heading "## Covers" before the part declared ahead of it`) {
		t.Fatalf("swapped: err = %v", err)
	}
}

// stepText is a step brief that has the form stepForm.
const stepText = "# LAB-1 step 1: the write\n\n## Goal\n\n`goals/lab-1.md`, and see `other.md`.\n\n## Covers\n\n- 1\n\n## Open\n\nNone.\n"

// existing resolves the paths given, and refuses any other.
func existing(paths ...string) func(string) error {
	return func(path string) error {
		for _, known := range paths {
			if path == known {
				return nil
			}
		}
		return errors.New("file " + path + " does not exist")
	}
}

// A text has the form when each required part is there once and not empty,
// each part reads as defined, and its reference resolves; an optional part
// may be left out. Only the first back-quoted path of a part that refers
// to a file is resolved, as written.
func TestATextHasItsForm(t *testing.T) {
	t.Parallel()
	brief := parseStep(t)
	var asked []string
	resolve := func(path string) error { asked = append(asked, path); return nil }
	if wrong := brief.Check(stepText, resolve); wrong != nil || !reflect.DeepEqual(asked, []string{"goals/lab-1.md"}) {
		t.Fatalf("wrong = %q, asked %q", wrong, asked)
	}
	// An optional part, given, is held to nothing but appearing once; a
	// sub-heading belongs to its part, and a heading in fenced code is no
	// part's.
	text := strings.Replace(stepText, "## Open", "## Constraints\n\nKeep it small.\n\n### Detail\n\n```\n## Open\nNot this.\n```\n\n## Open", 1)
	if wrong := brief.Check(text, existing("goals/lab-1.md")); wrong != nil {
		t.Fatalf("with constraints: %q", wrong)
	}
	// The text's own title and anything around the parts are free.
	if wrong := brief.Check("Preamble.\n\n"+stepText+"\n## Notes\n\nfree\n", existing("goals/lab-1.md")); wrong != nil {
		t.Fatalf("with notes: %q", wrong)
	}
}

// What keeps a text from its form is reported part by part: each required
// part missing, a part left empty, Open that does not read None., a part
// given twice, and a reference that names no file or one that does not
// resolve.
func TestEachWrongPartIsReported(t *testing.T) {
	t.Parallel()
	brief := parseStep(t)
	resolve := existing("goals/lab-1.md")
	for _, part := range []string{"## Goal", "## Covers", "## Open"} {
		t.Run("missing "+part, func(t *testing.T) {
			t.Parallel()
			text := strings.Replace(stepText, part+"\n", "## Other\n", 1)
			if wrong := brief.Check(text, resolve); !reflect.DeepEqual(wrong, []string{`part "` + part + `" is missing`}) {
				t.Fatalf("wrong = %q", wrong)
			}
		})
	}
	cases := map[string]struct {
		text string
		want []string
	}{
		"an empty part":         {strings.Replace(stepText, "- 1\n", "  \n", 1), []string{`part "## Covers" is empty`}},
		"an empty Open":         {strings.TrimSuffix(stepText, "None.\n"), []string{`part "## Open" is empty`}},
		"Open not None.":        {strings.Replace(stepText, "None.", "Should it retry?", 1), []string{`part "## Open" must read "None."`}},
		"Open more than None.":  {stepText + "\nAnd one more.\n", []string{`part "## Open" must read "None."`}},
		"a part twice":          {stepText + "\n## Covers\n\n- 2\n", []string{`part "## Covers" appears 2 times`}},
		"a goal not in quotes":  {strings.Replace(stepText, "`goals/lab-1.md`, and see `other.md`.", "goals/lab-1.md", 1), []string{`part "## Goal" names no file in back quotes`}},
		"a goal that is absent": {strings.Replace(stepText, "goals/lab-1.md", "goals/lab-2.md", 1), []string{`part "## Goal": file goals/lab-2.md does not exist`}},
		"no part at all":        {"Just text.\n", []string{`part "## Goal" is missing`, `part "## Covers" is missing`, `part "## Open" is missing`}},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			if wrong := brief.Check(c.text, resolve); !reflect.DeepEqual(wrong, c.want) {
				t.Fatalf("wrong = %q, want %q", wrong, c.want)
			}
		})
	}
}

// constrainedForm has optional parts held to a text or a reference, and one
// held to nothing.
const constrainedForm = `schema: agister.brief/v1alpha1
name: constrained
parts:
  - {heading: "## Covers", required: true}
  - {heading: "## Notes", required: false}
  - {heading: "## Status", required: false, reads: Done.}
  - {heading: "## See", required: false, reference: file}
template: |
  ## Covers

  ## Notes

  ## Status

  Done.

  ## See
`

// An optional part may be left out, and one held to nothing may be given
// empty; one given that must read a text or refer to a file is held to it,
// empty or not.
func TestAGivenOptionalPartIsHeldToItsConstraints(t *testing.T) {
	t.Parallel()
	brief, err := definition.ParseBrief(doc(definition.KindBrief, "constrained", constrainedForm))
	if err != nil {
		t.Fatal(err)
	}
	resolve := existing("goals/lab-1.md")
	const covers = "## Covers\n\n- 1\n"
	cases := map[string]struct {
		text string
		want []string
	}{
		"each optional part left out":   {covers, nil},
		"an empty part held to nothing": {covers + "\n## Notes\n\n", nil},
		"each part as it must be":       {covers + "\n## Status\n\nDone.\n\n## See\n\n`goals/lab-1.md`\n", nil},
		"an empty part that must read":  {covers + "\n## Status\n\n  \n", []string{`part "## Status" must read "Done."`}},
		"an empty part that refers":     {covers + "\n## See\n\n", []string{`part "## See" names no file in back quotes`}},
		"both empty, last in the text":  {covers + "\n## Status\n## See", []string{`part "## Status" must read "Done."`, `part "## See" names no file in back quotes`}},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			if wrong := brief.Check(c.text, resolve); !reflect.DeepEqual(wrong, c.want) {
				t.Fatalf("wrong = %q, want %q", wrong, c.want)
			}
		})
	}
}

// A section's body is built once, not copied again with each of its lines:
// checking a long text costs a number of allocations that does not grow
// with its lines.
//
// Serial: testing.AllocsPerRun counts the allocations of every goroutine,
// so a test running beside it would add its own.
func TestALongSectionIsReadWithoutCopyingItAgainPerLine(t *testing.T) {
	brief := parseStep(t)
	resolve := existing("goals/lab-1.md")
	long := strings.Replace(stepText, "- 1\n", strings.Repeat("- a criterion\n", 10000), 1)
	if wrong := brief.Check(long, resolve); wrong != nil {
		t.Fatalf("wrong = %q", wrong)
	}
	// The same text with one line: a check allocates for the text's lines
	// and its sections, never for each line of a section.
	short := testing.AllocsPerRun(10, func() { brief.Check(stepText, resolve) })
	if allocs := testing.AllocsPerRun(10, func() { brief.Check(long, resolve) }); allocs > short+2 {
		t.Fatalf("a 10000-line section takes %v allocations, a 1-line one %v", allocs, short)
	}
}

// A fence's closing marker is indented three spaces at most, as its opening
// one: a marker indented more is the block's text, and the parts after it
// are still inside the block.
func TestAnIndentedMarkerDoesNotCloseAFence(t *testing.T) {
	t.Parallel()
	brief := parseStep(t)
	resolve := existing("goals/lab-1.md")
	inside := "```\n    ```\n" + stepText + "```\n"
	want := []string{`part "## Goal" is missing`, `part "## Covers" is missing`, `part "## Open" is missing`}
	if wrong := brief.Check(inside, resolve); !reflect.DeepEqual(wrong, want) {
		t.Fatalf("four spaces: wrong = %q, want %q", wrong, want)
	}
	if wrong := brief.Check("```\nan example\n   ```\n"+stepText, resolve); wrong != nil {
		t.Fatalf("three spaces: wrong = %q", wrong)
	}
}

// nestedForm declares parts below others: Covers holds a required Detail,
// and Open, which must read None., an optional Notes.
const nestedForm = `schema: agister.brief/v1alpha1
name: nested
parts:
  - {heading: "## Covers", required: true}
  - {heading: "### Detail", required: true}
  - {heading: "## Open", required: true, reads: None.}
  - {heading: "### Notes", required: false}
template: |
  ## Covers

  ### Detail

  ## Open

  None.

  ### Notes
`

// A section runs to the next heading of its level or above: a part's
// heading below it opens a section of its own, which stays in its parent's
// body and ends where its parent does.
func TestADeclaredSubheadingStaysInItsParent(t *testing.T) {
	t.Parallel()
	brief, err := definition.ParseBrief(doc(definition.KindBrief, "nested", nestedForm))
	if err != nil {
		t.Fatal(err)
	}
	none := func(string) error { return nil }
	const text = "## Covers\n\n### Detail\n\n- 1\n\n## Open\n\nNone.\n"
	cases := map[string]struct {
		text string
		want []string
	}{
		"a parent that starts with its child": {text, nil},
		"a child after its parent's text":     {strings.Replace(text, "## Covers\n\n", "## Covers\n\nThe write.\n\n", 1), nil},
		"text under a child of Open":          {text + "\n### Notes\n\nExtra text.\n", []string{`part "## Open" must read "None."`}},
		"a child missing":                     {strings.Replace(text, "### Detail\n\n", "", 1), []string{`part "### Detail" is missing`}},
		"a child ended by its parent's peer":  {strings.Replace(text, "- 1\n\n", "", 1), []string{`part "### Detail" is empty`}},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			if wrong := brief.Check(c.text, none); !reflect.DeepEqual(wrong, c.want) {
				t.Fatalf("wrong = %q, want %q", wrong, c.want)
			}
		})
	}
}

// formedProcess is a process whose value brief is the file value given.
func formedProcess(value string) string {
	return `schema: agister.process/v1alpha1
name: p
type: process
uses: agent:a
input:
  instruction: Implement it.
  params:
    brief: {}
  values:
    brief: ` + value + `
    notes: {source: file, path: notes.md, form: [step]}
output:
  format: text
`
}

// A file value may name the forms its text must have; each is named once
// and literally; the process lists them once each. A value without form
// names none.
func TestAFileValueNamesItsForms(t *testing.T) {
	t.Parallel()
	process, err := definition.ParseProcess(doc(definition.KindProcess, "p", formedProcess(`{source: file, path: "${param.brief}", form: [goal, step]}`)))
	if err != nil || !reflect.DeepEqual(process.Values[0].Forms, []string{"goal", "step"}) || !reflect.DeepEqual(process.Forms(), []string{"goal", "step"}) {
		t.Fatalf("process = %+v, %v", process.Values, err)
	}
	if _, ok := process.Values[0].Args["form"]; ok {
		t.Fatalf("form is an arg: %v", process.Values[0].Args)
	}
	plain, err := definition.ParseProcess(doc(definition.KindProcess, "p", formedProcess(`{source: file, path: "${param.brief}"}`)))
	if err != nil || plain.Values[0].Forms != nil || !reflect.DeepEqual(plain.Forms(), []string{"step"}) {
		t.Fatalf("plain = %+v, %v", plain.Values, err)
	}
	workflow, err := definition.ParseWorkflow(doc(definition.KindWorkflow, "w", strings.Replace(workflowText,
		"  values:\n", "  values:\n    goal: {source: file, path: goal.md, form: [goal]}\n", 1)))
	if err != nil || !reflect.DeepEqual(workflow.Forms(), []string{"goal"}) {
		t.Fatalf("workflow = %+v, %v", workflow.Values, err)
	}
}

func TestAValuesFormsAreChecked(t *testing.T) {
	t.Parallel()
	cases := map[string]struct{ value, want string }{
		"not a list":     {`{source: file, path: "${param.brief}", form: goal}`, "input.values.brief.form: must be a list of brief names"},
		"no form":        {`{source: file, path: "${param.brief}", form: []}`, "input.values.brief.form: must name at least one form"},
		"interpolated":   {`{source: file, path: "${param.brief}", form: ["${param.brief}"]}`, "input.values.brief.form[0]: is not interpolated"},
		"an invalid one": {`{source: file, path: "${param.brief}", form: [Goal]}`, `input.values.brief.form[0]: invalid brief name "Goal"`},
		"one twice":      {`{source: file, path: "${param.brief}", form: [goal, goal]}`, `input.values.brief.form[1]: form "goal" is named twice (also input.values.brief.form[0])`},
		"not a file":     {`{source: git.revision, rev: HEAD, form: [goal]}`, "input.values.brief.form: applies to source file only"},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			_, err := definition.ParseProcess(doc(definition.KindProcess, "p", formedProcess(c.value)))
			if err == nil || !strings.Contains(err.Error(), c.want) {
				t.Fatalf("err = %v, want %q", err, c.want)
			}
		})
	}
}
