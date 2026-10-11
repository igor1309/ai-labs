package definition_test

import (
	"errors"
	"reflect"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
)

// Prompts are settings (ADR-014), which a process names as its prompt and
// its guidance (ADR-028 rule 8).

// promptProcess is a text process with the given top-level fields, its
// prompt and guidance among them, and the given values indented under
// input.values.
func promptProcess(fields, values string) string {
	return `schema: agister.process/v1alpha1
name: p
type: process
` + fields + `input:
  instruction: Review it.
  params:
    which: {default: review}
  values:
    diff: {source: git.diff}
` + values + `output:
  format: text
`
}

// ADR-014 rule 1: a prompt document is its text, unchanged, with no header.
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

// ADR-028 rule 8: a process names one prompt and a guidance list, which in
// no layer, or [], means none; Prompts lists the prompt, then the
// guidance, in order.
func TestAProcessNamesOnePromptAndAGuidanceList(t *testing.T) {
	t.Parallel()
	for name, c := range map[string]struct {
		fields   string
		guidance []string
	}{
		"no guidance":     {"prompt: review\n", nil},
		"empty guidance":  {"prompt: review\nguidance: []\n", []string{}},
		"one":             {"prompt: review\nguidance: [testing]\n", []string{"testing"}},
		"two, in order":   {"prompt: review\nguidance: [style, testing]\n", []string{"style", "testing"}},
		"guidance before": {"guidance: [testing]\nprompt: review\n", []string{"testing"}},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			process, err := definition.ParseProcess(doc(definition.KindProcess, "p", promptProcess(c.fields, "")))
			if err != nil {
				t.Fatal(err)
			}
			if process.Prompt != "review" || len(process.Guidance) != len(c.guidance) || !reflect.DeepEqual(process.Prompts(), append([]string{"review"}, c.guidance...)) {
				t.Fatalf("prompt %q, guidance %q, prompts %q", process.Prompt, process.Guidance, process.Prompts())
			}
		})
	}
}

// ADR-028 rule 8: prompt is required, and both are literal names, never
// interpolated (ADR-014 rule 2); guidance names each prompt once, and a
// further one than the prompt.
func TestThePromptAndTheGuidanceAreLiteralNames(t *testing.T) {
	t.Parallel()
	cases := map[string]struct{ fields, want string }{
		"no prompt":                  {"guidance: [testing]\n", "prompt: is required"},
		"an empty prompt":            {"prompt: \"\"\n", "prompt: must not be empty"},
		"a prompt list":              {"prompt: [review]\n", "prompt: must be a scalar"},
		"a prompt interpolated":      {"prompt: \"${param.which}\"\n", "prompt: is not interpolated: name the prompt document literally"},
		"a prompt partly so":         {"prompt: \"review_${param.which}\"\n", "prompt: is not interpolated"},
		"a prompt path":              {"prompt: ../review\n", `prompt: invalid prompt name "../review"`},
		"a prompt twice":             {"prompt: review\nprompt: style\n", "prompt: is declared more than once: a process has one prompt"},
		"guidance a name":            {"prompt: review\nguidance: testing\n", "guidance: must be a list of prompt names; [] for none"},
		"guidance a map":             {"prompt: review\nguidance: {testing: true}\n", "guidance: must be a list of prompt names; [] for none"},
		"guidance interpolated":      {"prompt: review\nguidance: [\"${param.which}\"]\n", "guidance[0]: is not interpolated: name the prompt document literally"},
		"guidance a path":            {"prompt: review\nguidance: [testing, prompts/style.md]\n", `guidance[1]: invalid prompt name "prompts/style.md"`},
		"guidance an empty name":     {"prompt: review\nguidance: [\"\"]\n", `guidance[0]: invalid prompt name ""`},
		"guidance a name twice":      {"prompt: review\nguidance: [testing, style, testing]\n", `guidance[2]: prompt "testing" is named twice (also guidance[0])`},
		"guidance names the prompt":  {"prompt: review\nguidance: [review]\n", `guidance[0]: prompt "review" is the process's prompt: guidance names further prompts`},
		"guidance declared twice":    {"prompt: review\nguidance: [testing]\nguidance: [style]\n", "guidance: is declared more than once: one list names the process's guidance"},
		"guidance a list of lists":   {"prompt: review\nguidance: [[testing]]\n", "guidance[0]: must be a scalar"},
		"guidance null, not a list":  {"prompt: review\nguidance: null\n", "guidance: must be a list of prompt names; [] for none"},
		"a value named prompt":       {"prompt: review\n", ""},
		"a value named for guidance": {"prompt: review\n", ""},
	}
	values := map[string]struct{ value, want string }{
		"a value named prompt":       {"    prompt: {source: param, name: which}\n", "input.values.prompt: is the input that gives the process's prompt (ADR-028): name this value otherwise"},
		"a value named for guidance": {"    guidance.testing: {source: param, name: which}\n", "input.values.guidance.testing: is the name of an input that gives a guidance prompt (ADR-028): name this value otherwise"},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			value, want := values[name].value, c.want
			if want == "" {
				want = values[name].want
			}
			_, err := definition.ParseProcess(doc(definition.KindProcess, "p", promptProcess(c.fields, value)))
			if err == nil || !strings.Contains(err.Error(), "\n  "+want) {
				t.Fatalf("err = %v, want %q", err, want)
			}
		})
	}
}

// ADR-028 rule 8: {source: prompt} is no longer an input source, and
// optional goes with it, on any input: each is a problem of the process,
// which names prompt and guidance, and not one a newer Agister's settings
// would have.
func TestThePromptSourceAndOptionalAreRefused(t *testing.T) {
	t.Parallel()
	source := "input.values.rules.source: source prompt is no longer an input source (ADR-028): a process names its prompt in prompt and further prompts in guidance"
	optional := "input.values.%s.optional: is no longer read (ADR-028): no input is optional; a prompt only some layers have is guidance those layers set"
	for name, c := range map[string]struct {
		value string
		want  []string
	}{
		"a prompt input":               {"    rules: {source: prompt, name: review}\n", []string{source}},
		"an optional prompt input":     {"    rules: {source: prompt, name: review, optional: true}\n", []string{strings.ReplaceAll(optional, "%s", "rules"), source}},
		"an optional file input":       {"    brief: {source: file, path: brief.md, optional: true}\n", []string{strings.ReplaceAll(optional, "%s", "brief")}},
		"optional false, on any input": {"    base: {source: param, name: which, optional: false}\n", []string{strings.ReplaceAll(optional, "%s", "base")}},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			_, err := definition.ParseProcess(doc(definition.KindProcess, "p", promptProcess("prompt: review\n", c.value)))
			var invalid *definition.InvalidError
			if !errors.As(err, &invalid) {
				t.Fatalf("err = %v", err)
			}
			if !reflect.DeepEqual(invalid.Messages(), c.want) {
				t.Fatalf("problems:\n  %s\nwant:\n  %s", strings.Join(invalid.Messages(), "\n  "), strings.Join(c.want, "\n  "))
			}
			for _, problem := range invalid.Problems {
				if problem.Unknown {
					t.Fatalf("%q is reported as unknown, as a newer Agister's setting", problem.Message)
				}
			}
		})
	}
}

// A workflow's values are resolved once for every node; it names no
// prompt: the process that needs one does, and the source is gone.
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
	if err == nil || !strings.Contains(err.Error(), "\n  input.values.rules.source: source prompt is no longer an input source (ADR-028)") {
		t.Fatalf("err = %v", err)
	}
}

// ADR-028 rule 9: a layer's layer.yaml names the folders its prompts are
// also found in, each relative to the directory that holds the layer's
// .agister and inside it.
func TestALayerNamesItsPromptFolders(t *testing.T) {
	t.Parallel()
	settings, err := definition.ParseLayer([]byte("schema: agister.layer/v1alpha1\nprompts:\n  - prompts\n  - docs/./rules/\n"))
	if err != nil || !reflect.DeepEqual(settings.Prompts, []string{"prompts", "docs/rules"}) {
		t.Fatalf("settings %+v, %v", settings, err)
	}
	if settings, err := definition.ParseLayer([]byte("schema: agister.layer/v1alpha1\n")); err != nil || settings.Prompts != nil {
		t.Fatalf("no folders: settings %+v, %v", settings, err)
	}
	for name, c := range map[string]struct{ text, want string }{
		"no schema":        {"prompts: [prompts]\n", "schema: is required"},
		"another schema":   {"schema: agister.process/v1alpha1\nprompts: [prompts]\n", `schema: must be "agister.layer/v1alpha1"`},
		"an unknown field": {"schema: agister.layer/v1alpha1\nskills: [skills]\n", "skills: unknown field"},
		"not a list":       {"schema: agister.layer/v1alpha1\nprompts: prompts\n", "prompts: must be a list"},
		"an absolute path": {"schema: agister.layer/v1alpha1\nprompts: [/etc/prompts]\n", `prompts[0]: "/etc/prompts" is not inside the directory that holds .agister`},
		"a .. that leaves": {"schema: agister.layer/v1alpha1\nprompts: [prompts, ../prompts]\n", `prompts[1]: "../prompts" is not inside the directory that holds .agister`},
		"an empty folder":  {"schema: agister.layer/v1alpha1\nprompts: [\"\"]\n", "prompts[0]: must not be empty"},
		"a folder twice":   {"schema: agister.layer/v1alpha1\nprompts: [prompts, ./prompts]\n", `prompts[1]: "./prompts" is listed twice`},
		"not one mapping":  {"- prompts\n", "must be a mapping"},
		"two documents":    {"schema: agister.layer/v1alpha1\n---\nprompts: [prompts]\n", "must hold exactly one YAML document"},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			_, err := definition.ParseLayer([]byte(c.text))
			if err == nil || !strings.Contains(err.Error(), c.want) {
				t.Fatalf("err = %v, want %q", err, c.want)
			}
		})
	}
}
