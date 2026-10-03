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
