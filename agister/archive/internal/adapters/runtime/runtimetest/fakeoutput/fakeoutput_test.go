package fakeoutput_test

import (
	"encoding/json"
	"reflect"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/runtimetest/fakeoutput"
)

// A property's anyOf is answered by its first variant, whole: its constant
// and each of its required properties, and nothing of the other variants.
func TestInstanceAnswersAnAnyOfByItsFirstVariant(t *testing.T) {
	t.Parallel()
	const document = `{
		"type": "object",
		"required": ["advice", "note"],
		"properties": {
			"advice": {"anyOf": [
				{"type": "object", "required": ["kind", "reason"], "properties": {"kind": {"type": "string", "enum": ["owner"]}, "reason": {"type": "string"}}},
				{"type": "object", "required": ["kind", "chosen"], "properties": {"kind": {"const": "decision"}, "chosen": {"type": "string"}}}
			]},
			"note": {"type": "string"}
		}
	}`
	var schema any
	if err := json.Unmarshal([]byte(document), &schema); err != nil {
		t.Fatal(err)
	}
	want := map[string]any{"advice": map[string]any{"kind": "owner", "reason": "fake"}, "note": "fake"}
	if got := fakeoutput.Instance(schema); !reflect.DeepEqual(got, want) {
		t.Fatalf("instance = %v, want %v", got, want)
	}
}

// An array holds as many items as its minItems asks, and at least one.
func TestInstanceFillsAnArrayToItsMinItems(t *testing.T) {
	t.Parallel()
	const document = `{
		"type": "object",
		"required": ["two", "none"],
		"properties": {
			"two": {"type": "array", "minItems": 2, "items": {"type": "string"}},
			"none": {"type": "array", "items": {"type": "integer"}}
		}
	}`
	var schema any
	if err := json.Unmarshal([]byte(document), &schema); err != nil {
		t.Fatal(err)
	}
	want := map[string]any{"two": []any{"fake", "fake"}, "none": []any{1}}
	if got := fakeoutput.Instance(schema); !reflect.DeepEqual(got, want) {
		t.Fatalf("instance = %v, want %v", got, want)
	}
}
