package inputs_test

import (
	"context"
	"errors"
	"reflect"
	"testing"

	"github.com/igor1309/ai-labs/agister/core/inputs"
)

// formF is brief.feature's form "f": "## Goal" required, referring to a
// file; "## Notes" optional; "## Open" required, reading "None.".
var formF = inputs.Form{Name: "f", Parts: []inputs.Part{
	{Heading: "## Goal", Required: true, RefersToFile: true},
	{Heading: "## Notes"},
	{Heading: "## Open", Required: true, Reads: "None."},
}}

// formE is brief.feature's form "e", requiring "## Intent".
var formE = inputs.Form{Name: "e", Parts: []inputs.Part{{Heading: "## Intent", Required: true}}}

// briefOf resolves the input "brief", of the text text and the forms
// forms, over paths.
func briefOf(t *testing.T, text string, paths inputs.Paths, forms ...inputs.Form) (inputs.Resolved, error) {
	t.Helper()
	r := resolverOver(t, map[string]inputs.Source{"s": &sourceSpy{value: text}}, paths)
	return r.Resolve(context.Background(), inputs.Declared{
		Inputs: []inputs.Input{{Name: "brief", Source: "s", Forms: forms}},
	}, nil)
}

// refusalOf is err's reason, failing t where err is not a refusal, failed,
// class "refused".
func refusalOf(t *testing.T, err error) string {
	t.Helper()
	var refusal *inputs.Refusal
	if !errors.As(err, &refusal) {
		t.Fatalf("resolved: %v, want a refusal", err)
	}
	if refusal.Status() != "failed" || refusal.Class() != "refused" {
		t.Errorf("refused %q, class %q; want failed, class refused", refusal.Status(), refusal.Class())
	}
	return refusal.Reason
}

// brief.feature, "A text takes the form, or is refused saying why". The
// path a part names is asked as the brief writes it.
func TestATextTakesTheFormOrIsRefusedSayingWhy(t *testing.T) {
	t.Parallel()
	cases := []struct {
		text string
		why  string // "" where the text resolves
	}{
		{"## Goal\n\n`g.md`\n\n## Open\n\nNone.", ""},
		{"## Goal\n\n`g.md`\n\n## Notes\n\n## Open\n\nNone.", ""},
		{"## Goal\n\n`g.md`", `part "## Open" is missing`},
		{"## Goal\n\n## Open\n\nNone.", `part "## Goal" is empty`},
		{"## Goal\n\ng.md\n\n## Open\n\nNone.", `part "## Goal" names no file in back quotes`},
		{"## Goal\n\n`h.md`\n\n## Open\n\nNone.", `part "## Goal": "h.md" does not exist`},
		{"## Goal\n\n`g.md`\n\n## Open\n\nSome.", `part "## Open" must read "None."`},
		{"## Goal\n\n`g.md`\n\n## Goal\n\nx\n\n## Open\n\nNone.", `part "## Goal" appears 2 times`},
		{"## Goal\n\n`g.md`\n\n```\n## Open\n```\n", `part "## Open" is missing`},
	}
	for _, c := range cases {
		t.Run(c.text, func(t *testing.T) {
			t.Parallel()
			paths := &pathsSpy{exist: []string{"g.md"}}
			got, err := briefOf(t, c.text, paths, formF)
			if c.why == "" {
				if err != nil {
					t.Fatalf("refused: %v, want it resolved", err)
				}
				if got.Inputs["brief"].Value != c.text {
					t.Errorf("brief is %q, want %q", got.Inputs["brief"].Value, c.text)
				}
				if want := []string{"g.md"}; !reflect.DeepEqual(paths.asked, want) {
					t.Errorf("asked whether %q exist, want %q", paths.asked, want)
				}
				return
			}
			if got, want := refusalOf(t, err), `input "brief": it takes none of its forms: "f": `+c.why; got != want {
				t.Errorf("refused\n %q\nwant\n %q", got, want)
			}
		})
	}
}

// brief.feature, "A text needs to take one of its forms", whichever of
// them it takes.
func TestATextNeedsToTakeOneOfItsForms(t *testing.T) {
	t.Parallel()
	text := "## Goal\n\n`g.md`\n\n## Open\n\nNone."
	for _, forms := range [][]inputs.Form{{formF, formE}, {formE, formF}} {
		if _, err := briefOf(t, text, &pathsSpy{exist: []string{"g.md"}}, forms...); err != nil {
			t.Errorf("forms %q then %q: refused: %v, want it resolved", forms[0].Name, forms[1].Name, err)
		}
	}
}

// brief.feature, "A text that takes none of its forms says what each
// lacks".
func TestATextThatTakesNoneOfItsFormsSaysWhatEachLacks(t *testing.T) {
	t.Parallel()
	_, err := briefOf(t, "x", &pathsSpy{}, formF, formE)
	want := `input "brief": it takes none of its forms: "f": part "## Goal" is missing, part "## Open" is missing; "e": part "## Intent" is missing`
	if got := refusalOf(t, err); got != want {
		t.Errorf("refused\n %q\nwant\n %q", got, want)
	}
}

// A section ends at the next heading of its level or above: a lower
// heading stays in its body, and one of its level ends it.
func TestASectionEndsAtTheNextHeadingOfItsLevelOrAbove(t *testing.T) {
	t.Parallel()
	open := inputs.Form{Name: "o", Parts: []inputs.Part{{Heading: "## Open", Required: true, Reads: "None.\n\n### Sub"}}}
	cases := []struct {
		text string
		why  string
	}{
		{"## Open\n\nNone.\n\n### Sub\n\n## Next", ""},
		{"## Open\n\nNone.\n\n# Top\n\n### Sub", `part "## Open" must read "None.\n\n### Sub"`},
	}
	for _, c := range cases {
		_, err := briefOf(t, c.text, &pathsSpy{}, open)
		if c.why == "" {
			if err != nil {
				t.Errorf("%q: refused: %v, want it resolved", c.text, err)
			}
			continue
		}
		if got, want := refusalOf(t, err), `input "brief": it takes none of its forms: "o": `+c.why; got != want {
			t.Errorf("%q: refused\n %q\nwant\n %q", c.text, got, want)
		}
	}
}

// Paths that cannot tell whether a path exists refuse the input, saying
// why.
func TestPathsThatCannotTellRefuseTheInput(t *testing.T) {
	t.Parallel()
	_, err := briefOf(t, "## Goal\n\n`g.md`\n\n## Open\n\nNone.", &pathsSpy{err: errors.New("denied")}, formF)
	if got, want := refusalOf(t, err), `input "brief": part "## Goal": "g.md": denied`; got != want {
		t.Errorf("refused %q, want %q", got, want)
	}
}
