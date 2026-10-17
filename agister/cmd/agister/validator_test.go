package main

import (
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// model.feature, "The validator is the schema's own": output the schema
// accepts passes, and output it rejects, output that is not JSON and a
// schema that does not compile are each rejected, saying why.
func TestTheValidatorIsTheSchemasOwn(t *testing.T) {
	t.Parallel()
	const answer = `{"type":"object","required":["ok"],"properties":{"ok":{"type":"boolean"}}}`
	cases := []struct {
		name, schema, output string
		// why is what the rejection says, "" where the output passes.
		why string
	}{
		{"accepted", answer, `{"ok":true}`, ""},
		{"a field of the wrong type", answer, `{"ok":1}`, "/ok"},
		{"a field missing", answer, `{}`, "ok"},
		{"output that is not JSON", answer, `{"ok":`, "the output is not JSON"},
		{"no output", answer, ``, "the output is not JSON"},
		{"a schema that is not JSON", `{`, `{"ok":true}`, "the schema is not JSON"},
		{"a schema that does not compile", `{"type":"nothing"}`, `{"ok":true}`, "the schema"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			err := schemaValidator{}.Validate([]byte(c.schema), []byte(c.output))
			switch {
			case c.why == "" && err != nil:
				t.Errorf("rejected: %v, want it accepted", err)
			case c.why != "" && (err == nil || !strings.Contains(err.Error(), c.why)):
				t.Errorf("rejected with %v, want a rejection saying %q", err, c.why)
			}
		})
	}
}

// model.feature, "The validator is the schema's own": a schema is its
// bytes alone, so one that refers to a schema in a file fails to compile,
// and the output is rejected whatever the file holds.
func TestTheValidatorLoadsNoReferencedFile(t *testing.T) {
	t.Parallel()
	referenced := filepath.Join(t.TempDir(), "answer.schema.json")
	if err := os.WriteFile(referenced, []byte(`{"type":"object"}`), 0o600); err != nil {
		t.Fatal(err)
	}
	schema := `{"$ref":"` + (&url.URL{Scheme: "file", Path: filepath.ToSlash(referenced)}).String() + `"}`
	err := schemaValidator{}.Validate([]byte(schema), []byte(`{"ok":true}`))
	if err == nil || !strings.Contains(err.Error(), "the schema") {
		t.Errorf("Validate with a schema referring to %s: %v, want the schema rejected", referenced, err)
	}
}
