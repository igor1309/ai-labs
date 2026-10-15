package documents_test

import (
	"reflect"
	"slices"
	"strings"
	"sync"
	"testing"

	"github.com/igor1309/ai-labs/agister/settings/documents"
	"github.com/igor1309/ai-labs/gokit/tree"
)

const (
	homeBrief       = "/home/.agister/briefs/a.yaml"
	repositoryBrief = "/repo/.agister/briefs/a.yaml"
	// briefHeader is a brief's schema and name, its first two lines.
	briefHeader = "schema: agister.brief/v1alpha1\nname: a\n"
	// validTemplate is the template of validBrief.
	validTemplate = "## Goal\n\n## Notes\n\n## Open\n\nNone.\n"
	// validBrief is the brief of brief.feature's "A brief's fields".
	validBrief = briefHeader + `parts:
  - {heading: "## Goal", required: true, reference: file}
  - {heading: "## Notes", required: false}
  - {heading: "## Open", required: true, reads: None.}
template: |
  ## Goal

  ## Notes

  ## Open

  None.
`
)

// briefsOf is a documents of the briefs given, by name.
func briefsOf(briefs map[string]documents.Document) *documents.Documents {
	return documents.New(documents.Snapshot{Documents: map[documents.Kind]map[string]documents.Document{documents.Brief: briefs}})
}

// homeBriefOf is the brief a that documents give when bytes are its only
// source, its home file.
func homeBriefOf(bytes string) (documents.BriefDefinition, []documents.Problem) {
	return briefsOf(map[string]documents.Document{"a": {Sources: documents.Sources{Home: source(homeBrief, bytes)}}}).Brief("a")
}

func assertBrief(t *testing.T, got, want documents.BriefDefinition) {
	t.Helper()
	if !reflect.DeepEqual(got, want) {
		t.Errorf("brief\n got %+v\nwant %+v", got, want)
	}
}

func assertNoBrief(t *testing.T, got documents.BriefDefinition) {
	t.Helper()
	if !reflect.DeepEqual(got, documents.BriefDefinition{}) {
		t.Errorf("a brief %+v, want none", got)
	}
}

// inHomeBrief is a problem at place of the brief a's home file, on line.
func inHomeBrief(line int, place, message string) documents.Problem {
	return documents.Problem{Path: homeBrief, Line: line, Place: place, Message: message}
}

// boolean is a boolean field given by the file at path, on line.
func boolean(value bool, path string, line int) documents.Field[bool] {
	return documents.Field[bool]{Value: value, Origin: documents.Origin{Path: path, Line: line}, Given: true}
}

// part is a part given whole by the file at path, on line, as a part on
// one line is.
func part(path string, line int, heading string, required bool) documents.Field[documents.Part] {
	return documents.Field[documents.Part]{
		Value:  documents.Part{Heading: text(heading, path, line), Required: boolean(required, path, line)},
		Origin: documents.Origin{Path: path, Line: line},
		Given:  true,
	}
}

// parts are a brief's parts, given by the file at path, on line.
func parts(path string, line int, items ...documents.Field[documents.Part]) documents.Field[[]documents.Field[documents.Part]] {
	return documents.Field[[]documents.Field[documents.Part]]{Value: items, Origin: documents.Origin{Path: path, Line: line}, Given: true}
}

// validBriefDefinition is validBrief typed: every field it gives, each
// with its value and the origin of its home file, on its line.
func validBriefDefinition() documents.BriefDefinition {
	goal := part(homeBrief, 4, "## Goal", true)
	goal.Value.Reference = text("file", homeBrief, 4)
	open := part(homeBrief, 6, "## Open", true)
	open.Value.Reads = text("None.", homeBrief, 6)
	return documents.BriefDefinition{
		Name:     "a",
		Parts:    parts(homeBrief, 3, goal, part(homeBrief, 5, "## Notes", false), open),
		Template: text(validTemplate, homeBrief, 7),
	}
}

// withParts is a brief of the parts given, one per line from line 4, and
// the template given, on the line after them.
func withParts(template string, lines ...string) string {
	var b strings.Builder
	b.WriteString(briefHeader + "parts:\n")
	for _, line := range lines {
		b.WriteString("  - " + line + "\n")
	}
	b.WriteString("template: " + template + "\n")
	return b.String()
}

// brief.feature, "A brief's fields": every field the brief gives, each
// with its value and the origin of its home file, on its line; its parts
// in the file's order.
func TestABriefsFields(t *testing.T) {
	t.Parallel()
	got, problems := homeBriefOf(validBrief)
	assertProblems(t, problems, nil)
	assertBrief(t, got, validBriefDefinition())
}

// A brief's parts are in the file's order, whatever order their headings
// sort in, and the template agrees with them in that order.
func TestABriefsPartsAreInTheFilesOrder(t *testing.T) {
	t.Parallel()
	got, problems := homeBriefOf(withParts(`"## Open\n## Goal\n## Notes\n"`,
		`{heading: "## Open", required: true}`,
		`{heading: "## Goal", required: true}`,
		`{heading: "## Notes", required: false}`,
	))
	assertProblems(t, problems, nil)
	assertBrief(t, got, documents.BriefDefinition{
		Name:     "a",
		Parts:    parts(homeBrief, 3, part(homeBrief, 4, "## Open", true), part(homeBrief, 5, "## Goal", true), part(homeBrief, 6, "## Notes", false)),
		Template: text("## Open\n## Goal\n## Notes\n", homeBrief, 7),
	})
}

// A brief given is the caller's own: changing its parts changes nothing
// the documents hold, and the next call gives the brief as typed.
func TestABriefGivenIsTheCallersOwn(t *testing.T) {
	t.Parallel()
	d := briefsOf(map[string]documents.Document{"a": {Sources: documents.Sources{Home: source(homeBrief, validBrief)}}})
	given, _ := d.Brief("a")
	given.Parts.Value[0].Value.Heading.Value = "## x"
	got, problems := d.Brief("a")
	assertProblems(t, problems, nil)
	assertBrief(t, got, validBriefDefinition())
}

// brief.feature, "A brief needs its parts and its template": each
// missing one is in no file.
func TestABriefNeedsItsPartsAndItsTemplate(t *testing.T) {
	t.Parallel()
	got, problems := homeBriefOf(briefHeader)
	assertNoBrief(t, got)
	assertProblems(t, problems, []documents.Problem{missing("parts"), missing("template")})
}

// A part needs its heading and whether it is required; the text it reads
// and its reference may be left out.
func TestAPartNeedsItsHeadingAndWhetherItIsRequired(t *testing.T) {
	t.Parallel()
	got, problems := homeBriefOf(withParts(`"## Goal\n"`, `{heading: "## Goal", required: false}`))
	assertProblems(t, problems, nil)
	assertBrief(t, got, documents.BriefDefinition{
		Name:     "a",
		Parts:    parts(homeBrief, 3, part(homeBrief, 4, "## Goal", false)),
		Template: text("## Goal\n", homeBrief, 5),
	})
}

// brief.feature, "A brief's parts": each value of a part that is not
// one a form can check by is a problem at its place, in the file and on
// the line that gave it; a missing one is in no file.
func TestABriefsParts(t *testing.T) {
	t.Parallel()
	goal := `{heading: "## Goal", required: true}`
	cases := []struct {
		name  string
		bytes string
		want  documents.Problem
	}{
		{"the parts []", briefHeader + "parts: []\ntemplate: x\n", inHomeBrief(3, "parts", "it names a part")},
		{"parts that are no list", briefHeader + "parts: {heading: '## Goal'}\ntemplate: x\n",
			inHomeBrief(3, "parts", "it is a list, not a map")},
		{"a part that is no map", withParts(`"## Goal\n"`, goal, `"## Open"`), inHomeBrief(5, "parts[1]", "it is a map, not a string")},
		{"a first part with no heading", withParts(`"## Goal\n"`, `{required: true}`), missing("parts[0].heading")},
		{`a first part headed "Goal"`, withParts(`"Goal\n"`, `{heading: Goal, required: true}`),
			inHomeBrief(4, "parts[0].heading", `it is a Markdown heading line, as "## Goal"`)},
		{"a heading that is no string", withParts(`"## Goal\n"`, `{heading: 1, required: true}`),
			inHomeBrief(4, "parts[0].heading", "it is a string, not an integer")},
		{"a second part headed as the first", withParts(`"## Goal\n"`, goal, goal),
			inHomeBrief(5, "parts[1].heading", "it is also the heading of parts[0]")},
		{"a third part headed as the first", withParts(`"## Goal\n## Open\n"`, goal, `{heading: "## Open", required: true}`, goal),
			inHomeBrief(6, "parts[2].heading", "it is also the heading of parts[0]")},
		{"a first part with no required", withParts(`"## Goal\n"`, `{heading: "## Goal"}`), missing("parts[0].required")},
		{`a first part whose required is "yes"`, withParts(`"## Goal\n"`, `{heading: "## Goal", required: "yes"}`),
			inHomeBrief(4, "parts[0].required", "it is a boolean, not a string")},
		{`a first part whose reference is "url"`, withParts(`"## Goal\n"`, `{heading: "## Goal", required: true, reference: url}`),
			inHomeBrief(4, "parts[0].reference", `it is "file"`)},
		{"a reference that is no string", withParts(`"## Goal\n"`, `{heading: "## Goal", required: true, reference: [file]}`),
			inHomeBrief(4, "parts[0].reference", "it is a string, not a list")},
		{"reads that is no string", withParts(`"## Goal\n"`, `{heading: "## Goal", required: true, reads: 1}`),
			inHomeBrief(4, "parts[0].reads", "it is a string, not an integer")},
		{"a field of a part no kind knows", withParts(`"## Goal\n"`, `{heading: "## Goal", required: true, colour: red}`),
			inHomeBrief(4, "parts[0].colour", "the field is not known")},
		{"a template that is no string", withParts("[x]", goal), inHomeBrief(5, "template", "it is a string, not a list")},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			got, problems := homeBriefOf(c.bytes)
			assertNoBrief(t, got)
			assertProblems(t, problems, []documents.Problem{c.want})
		})
	}
}

// A part's heading is one line of one to six "#", a space and its text.
func TestAPartsHeadingIsAMarkdownHeadingLine(t *testing.T) {
	t.Parallel()
	cases := []struct {
		heading string
		valid   bool
	}{
		{"# Goal", true},
		{"## Goal", true},
		{"###### Goal", true},
		{"## The goal, whole", true},
		{"Goal", false},
		{"##Goal", false},
		{"## ", false},
		{"##", false},
		{"####### Goal", false},
		{" ## Goal", false},
		{"## Goal\n## Open", false},
		{"## Goal\r", false},
		{"", false},
	}
	for _, c := range cases {
		t.Run(c.heading, func(t *testing.T) {
			t.Parallel()
			root := tree.NewMap(map[string]tree.Node{
				"schema": tree.NewString("agister.brief/v1alpha1", tree.Origin{Path: homeBrief, Line: 1}),
				"name":   tree.NewString("a", tree.Origin{Path: homeBrief, Line: 2}),
				"parts": tree.NewList([]tree.Node{tree.NewMap(map[string]tree.Node{
					"heading":  tree.NewString(c.heading, tree.Origin{Path: homeBrief, Line: 4}),
					"required": tree.NewBoolean(true, tree.Origin{Path: homeBrief, Line: 4}),
				}, tree.Origin{Path: homeBrief, Line: 4})}, tree.Origin{Path: homeBrief, Line: 3}),
				"template": tree.NewString(c.heading+"\n", tree.Origin{Path: homeBrief, Line: 5}),
			}, tree.Origin{Path: homeBrief, Line: 1})
			got, problems := documents.TypeBrief("a", root)
			if c.valid {
				assertProblems(t, problems, nil)
				assertBrief(t, got, documents.BriefDefinition{
					Name:     "a",
					Parts:    parts(homeBrief, 3, part(homeBrief, 4, c.heading, true)),
					Template: text(c.heading+"\n", homeBrief, 5),
				})
				return
			}
			assertNoBrief(t, got)
			assertProblems(t, problems, []documents.Problem{inHomeBrief(4, "parts[0].heading", `it is a Markdown heading line, as "## Goal"`)})
		})
	}
}

// brief.feature, "A brief's template has the parts' headings": each
// part's heading is a line of the template, once, after the heading of the
// part before it; each way it is not is a problem at "template", on the
// template's line.
func TestABriefsTemplateHasThePartsHeadings(t *testing.T) {
	t.Parallel()
	goalOpen := []string{`{heading: "## Goal", required: true}`, `{heading: "## Open", required: false}`}
	three := []string{`{heading: "## A", required: true}`, `{heading: "## B", required: true}`, `{heading: "## C", required: true}`}
	cases := []struct {
		name     string
		template string
		parts    []string
		want     []string
	}{
		{"the template ## Goal", `"## Goal\n"`, goalOpen, []string{`it has the heading "## Open"`}},
		{"the template ## Goal ## Goal ## Open", `"## Goal\n## Goal\n## Open\n"`, goalOpen, []string{`it has the heading "## Goal" once`}},
		{"the template ## Open ## Goal", `"## Open\n## Goal\n"`, goalOpen, []string{`it has the heading "## Open" after "## Goal"`}},
		{"no heading", `"Goal and Open\n"`, goalOpen, []string{`it has the heading "## Goal"`, `it has the heading "## Open"`}},
		{"a heading within a line", `"## Goal\nSee ## Open\n"`, goalOpen, []string{`it has the heading "## Open"`}},
		{"a heading of another level", `"## Goal\n### Open\n"`, goalOpen, []string{`it has the heading "## Open"`}},
		{"a heading indented", `"## Goal\n  ## Open\n"`, goalOpen, []string{`it has the heading "## Open"`}},
		{"a heading a fence holds twice", "\"## Goal\\n```\\n## Goal\\n```\\n## Open\\n\"", goalOpen, []string{`it has the heading "## Goal" once`}},
		{"the last before the first", `"## B\n## C\n## A\n"`, three, []string{`it has the heading "## B" after "## A"`}},
		{"the last first", `"## C\n## A\n## B\n"`, three, []string{`it has the heading "## C" after "## B"`}},
		{"one missing and the others out of order", `"## C\n## A\n"`, three, []string{`it has the heading "## B"`, `it has the heading "## C" after "## A"`}},
		{"one twice and one missing", `"## A\n## A\n## B\n"`, three, []string{`it has the heading "## A" once`, `it has the heading "## C"`}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			got, problems := homeBriefOf(withParts(c.template, c.parts...))
			assertNoBrief(t, got)
			var want []documents.Problem
			for _, message := range c.want {
				want = append(want, inHomeBrief(4+len(c.parts), "template", message))
			}
			assertProblems(t, problems, want)
		})
	}
}

// A template agrees with its parts whatever else it holds: lines that are
// no part's heading, headings of no part, and a part's heading in fenced
// code, which is a line as any other. The template is the text the file
// gives, whole: all it holds is kept, its line endings among it.
func TestATemplateHoldsMoreThanThePartsHeadings(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name     string
		template string
		want     string
	}{
		{"text around the headings", `"# A brief\n\n## Goal\nWhat to do.\n\n## Open\n\nNone.\n"`, "# A brief\n\n## Goal\nWhat to do.\n\n## Open\n\nNone.\n"},
		{"a heading of no part", `"## Goal\n## Notes\n## Open\n"`, "## Goal\n## Notes\n## Open\n"},
		{"a part's heading in fenced code", "\"```\\n## Goal\\n```\\n## Open\\n\"", "```\n## Goal\n```\n## Open\n"},
		{"no line break at its end", `"## Goal\n## Open"`, "## Goal\n## Open"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			got, problems := homeBriefOf(withParts(c.template, `{heading: "## Goal", required: true}`, `{heading: "## Open", required: false}`))
			assertProblems(t, problems, nil)
			if want := text(c.want, homeBrief, 6); got.Template != want {
				t.Errorf("template\n got %+v\nwant %+v", got.Template, want)
			}
		})
	}
}

// Every problem of a brief's fields is reported, in the order its fields
// are read: each part's after the one before it, the template's after the
// parts', and the fields no kind knows of a map after that map's own. The
// template is checked against the parts' headings that are valid.
func TestEveryBriefFieldProblemIsReported(t *testing.T) {
	t.Parallel()
	got, problems := homeBriefOf(`schema: agister.brief/v1alpha1
name: a
colour: red
parts:
  - {heading: Goal, required: yes}
  - {heading: "## Open", colour: red}
  - {heading: "## Open", required: true, reference: url}
  - {heading: "## Notes", required: false}
template: "## Notes\n"
`)
	assertNoBrief(t, got)
	assertProblems(t, problems, []documents.Problem{
		inHomeBrief(5, "parts[0].heading", `it is a Markdown heading line, as "## Goal"`),
		inHomeBrief(5, "parts[0].required", "it is a boolean, not a string"),
		missing("parts[1].required"),
		inHomeBrief(6, "parts[1].colour", "the field is not known"),
		inHomeBrief(7, "parts[2].heading", "it is also the heading of parts[1]"),
		inHomeBrief(7, "parts[2].reference", `it is "file"`),
		inHomeBrief(9, "template", `it has the heading "## Open"`),
		inHomeBrief(3, "colour", "the field is not known"),
	})
}

// A brief is typed from the composed tree: the nearer layer's parts are
// the brief's whole, as a list is replaced, not merged, each part of its
// file; the template a farther layer gives is checked against them.
func TestABriefsFieldIsOfTheFileThatGaveIt(t *testing.T) {
	t.Parallel()
	brief := func(repository string) (documents.BriefDefinition, []documents.Problem) {
		return briefsOf(map[string]documents.Document{"a": {Sources: documents.Sources{
			Home:       source(homeBrief, validBrief),
			Repository: source(repositoryBrief, repository),
		}}}).Brief("a")
	}

	got, problems := brief("parts:\n  - {heading: \"## Goal\", required: false}\n")
	assertProblems(t, problems, nil)
	want := validBriefDefinition()
	want.Parts = parts(repositoryBrief, 1, part(repositoryBrief, 2, "## Goal", false))
	assertBrief(t, got, want)

	got, problems = brief("parts:\n  - {heading: \"## Plan\", required: true}\n")
	assertNoBrief(t, got)
	assertProblems(t, problems, []documents.Problem{inHomeBrief(7, "template", `it has the heading "## Plan"`)})

	got, problems = brief("parts:\n  - {heading: \"## Goal\", required: 1}\n")
	assertNoBrief(t, got)
	assertProblems(t, problems, []documents.Problem{{Path: repositoryBrief, Line: 2, Place: "parts[0].required", Message: "it is a boolean, not an integer"}})
}

// Each brief whose tree has no problem is typed once, when the documents
// are built, and never again however often it is asked for; one whose tree
// has problems is not typed, and has its tree's.
func TestEachBriefIsTypedOnce(t *testing.T) {
	t.Parallel()
	var mu sync.Mutex
	var typed []string
	typeBrief := func(name string, root tree.Node) (documents.BriefDefinition, []documents.Problem) {
		mu.Lock()
		typed = append(typed, name)
		mu.Unlock()
		return documents.TypeBrief(name, root)
	}
	brief := func(name, bytes string) documents.Document {
		return documents.Document{Sources: documents.Sources{Home: source("/home/.agister/briefs/"+name+".yaml", bytes)}}
	}
	d := documents.NewTypingWith(documents.Snapshot{Documents: map[documents.Kind]map[string]documents.Document{
		documents.Brief: {
			"a": brief("a", validBrief),
			"b": brief("b", "schema: agister.brief/v1alpha1\nname: b\n"),
			"c": brief("c", "x: [1"),
		},
		documents.Runtime: {"a": {Sources: documents.Sources{Home: source(homeRuntime, validRuntime)}}},
	}}, documents.Typers{Agent: documents.TypeAgent, Runtime: documents.TypeRuntime, Brief: typeBrief})
	for range 3 {
		for _, name := range []string{"a", "b", "c", "z"} {
			d.Brief(name)
		}
	}
	mu.Lock()
	got := slices.Sorted(slices.Values(typed))
	mu.Unlock()
	if want := []string{"a", "b"}; !slices.Equal(got, want) {
		t.Errorf("typed\n got %q\nwant %q", got, want)
	}
	a, problems := d.Brief("a")
	assertProblems(t, problems, nil)
	assertBrief(t, a, validBriefDefinition())
	if _, problems := d.Brief("b"); !slices.Equal(problems, []documents.Problem{missing("parts"), missing("template")}) {
		t.Errorf("brief b's problems %q, want its parts and template missing", problems)
	}
	_, want := d.Tree(documents.Brief, "c")
	if len(want) == 0 {
		t.Fatal("the brief c's tree has no problem")
	}
	c, problems := d.Brief("c")
	assertNoBrief(t, c)
	assertProblems(t, problems, want)
	if _, problems := d.Brief("z"); !slices.Equal(problems, []documents.Problem{{Message: `no layer holds the brief "z"`}}) {
		t.Errorf("brief z's problems %q, want no layer holding it", problems)
	}
}
