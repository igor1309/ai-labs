package definition_test

import (
	"reflect"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
)

// Prompts are settings (ADR-014).

// promptProcess is a text process whose only input is the value given,
// indented under input.values.
func promptProcess(value string) string {
	return `schema: agister.process/v1alpha1
name: p
type: process
uses: agent:a
input:
  instruction: Review it.
  params:
    which: {default: review}
  values:
` + value + `output:
  format: text
`
}

// Rule 1: a prompt document is its text, unchanged, with no header.
func TestAPromptIsItsText(t *testing.T) {
	t.Parallel()
	text := "# Review\n\nschema: is not a header here.\n  Indented, ${param.x} and all.\n"
	prompt, err := definition.ParsePrompt(doc(definition.KindPrompt, "review", text))
	if err != nil || prompt.Name != "review" || prompt.Text != text || prompt.Source.Kind != definition.KindPrompt {
		t.Fatalf("prompt = %+v, %v", prompt, err)
	}
	if empty, err := definition.ParsePrompt(doc(definition.KindPrompt, "empty", "")); err != nil || empty.Text != "" {
		t.Fatalf("empty = %+v, %v", empty, err)
	}
	for name, text := range map[string]string{"a NUL byte": "text\x00", "not UTF-8": "\xff\xfe"} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			_, err := definition.ParsePrompt(doc(definition.KindPrompt, "review", text))
			if err == nil || err.Error() != "prompt review (review) is invalid:\n  not a UTF-8 text file" {
				t.Fatalf("err = %v", err)
			}
		})
	}
}

// Rule 2: a prompt input has exactly one argument, name, a literal
// document name.
func TestAPromptInputNamesItsDocumentLiterally(t *testing.T) {
	t.Parallel()
	process, err := definition.ParseProcess(doc(definition.KindProcess, "p", promptProcess(
		"    rules: {source: prompt, name: review}\n    style: {source: prompt, name: style}\n    again: {source: prompt, name: review}\n")))
	if err != nil {
		t.Fatal(err)
	}
	want := definition.Value{Name: "rules", Source: "prompt", Args: map[string]string{"name": "review"}}
	if !reflect.DeepEqual(process.Values[0], want) || !reflect.DeepEqual(process.Prompts(), []string{"review", "style"}) {
		t.Fatalf("values %+v, prompts %q", process.Values, process.Prompts())
	}

	cases := map[string]struct{ value, want string }{
		"name missing":       {"    rules: {source: prompt}\n", "input.values.rules.name: is required"},
		"name interpolated":  {"    rules: {source: prompt, name: \"${param.which}\"}\n", "input.values.rules.name: is not interpolated: name the prompt document literally"},
		"name partly so":     {"    rules: {source: prompt, name: \"review_${param.which}\"}\n", "input.values.rules.name: is not interpolated"},
		"an extra argument":  {"    rules: {source: prompt, name: review, path: review.md}\n", "input.values.rules.path: is not an argument of source prompt, which takes only name and optional"},
		"a path, not a name": {"    rules: {source: prompt, name: ../review}\n", `input.values.rules.name: invalid prompt name "../review"`},
		"an empty name":      {"    rules: {source: prompt, name: \"\"}\n", `input.values.rules.name: invalid prompt name ""`},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			_, err := definition.ParseProcess(doc(definition.KindProcess, "p", promptProcess(c.value)))
			if err == nil || !strings.Contains(err.Error(), "\n  "+c.want) {
				t.Fatalf("err = %v, want %q", err, c.want)
			}
		})
	}
}

// ADR-019 rule 1: a prompt input may be optional; optional takes only
// true, and leaving it out means required. A prompt that a required input
// also names is required.
func TestAPromptInputMayBeOptional(t *testing.T) {
	t.Parallel()
	process, err := definition.ParseProcess(doc(definition.KindProcess, "p", promptProcess(
		"    rules: {source: prompt, name: review}\n    go: {source: prompt, name: go_tests, optional: true}\n    style: {source: prompt, name: style, optional: true}\n    again: {source: prompt, name: review, optional: true}\n")))
	if err != nil {
		t.Fatal(err)
	}
	var optional []bool
	for _, value := range process.Values {
		optional = append(optional, value.Optional())
	}
	if !reflect.DeepEqual(optional, []bool{false, true, true, true}) {
		t.Fatalf("optional = %v", optional)
	}
	if got := process.OptionalPrompts(); !reflect.DeepEqual(got, []string{"go_tests", "style"}) {
		t.Fatalf("optional prompts = %q", got)
	}
	if !reflect.DeepEqual(process.Prompts(), []string{"review", "go_tests", "style"}) {
		t.Fatalf("prompts = %q", process.Prompts())
	}

	for name, value := range map[string]string{"false": "false", "no": "no", "a string": `"yes"`, "a number": "1", "empty": `""`} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			_, err := definition.ParseProcess(doc(definition.KindProcess, "p", promptProcess("    rules: {source: prompt, name: review, optional: "+value+"}\n")))
			if want := "\n  input.values.rules.optional: takes only true; leave it out for a required prompt"; err == nil || !strings.Contains(err.Error(), want) {
				t.Fatalf("err = %v, want %q", err, want)
			}
		})
	}
}

// ADR-019 rule 5: no other input refers to an optional prompt's value; a
// required one may be referred to, as before.
func TestNoInputRefersToAnOptionalPrompt(t *testing.T) {
	t.Parallel()
	refers := "    other: {source: git.diff, base: \"${value.rules}\"}\n"
	_, err := definition.ParseProcess(doc(definition.KindProcess, "p", promptProcess("    rules: {source: prompt, name: review, optional: true}\n"+refers)))
	if want := "\n  input.values.other: refers to ${value.rules}, an optional prompt, which may be missing"; err == nil || !strings.Contains(err.Error(), want) {
		t.Fatalf("err = %v, want %q", err, want)
	}
	if _, err := definition.ParseProcess(doc(definition.KindProcess, "p", promptProcess("    rules: {source: prompt, name: review}\n"+refers))); err != nil {
		t.Fatalf("a required prompt referred to: %v", err)
	}
}

// A workflow's values are resolved once for every node; it names no
// prompt: the process that needs one does.
func TestAWorkflowValueIsNoPrompt(t *testing.T) {
	t.Parallel()
	text := `schema: agister.workflow/v1alpha1
name: w
type: workflow
input:
  values:
    rules: {source: prompt, name: review}
fan_out:
  - {node: a, uses: "process:p"}
join: {node: j, uses: "process:q"}
`
	_, err := definition.ParseWorkflow(doc(definition.KindWorkflow, "w", text))
	if err == nil || !strings.Contains(err.Error(), "\n  input.values.rules.source: prompt is given only to a process") {
		t.Fatalf("err = %v", err)
	}
}
