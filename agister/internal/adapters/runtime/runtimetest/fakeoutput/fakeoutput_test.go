package fakeoutput_test

import (
	"encoding/json"
	"reflect"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/runtimetest/fakeoutput"
)

// An object's oneOf is answered by its first variant: each property takes
// the variant's keywords over the object's own, and a property the variant
// leaves out keeps the object's.
func TestInstanceAnswersAOneOfByItsFirstVariant(t *testing.T) {
	const document = `{
		"type": "object",
		"required": ["answer", "reason", "decision", "note"],
		"oneOf": [
			{"properties": {"answer": {"const": "owner"}, "reason": {"const": ""}, "decision": {"type": "null"}}},
			{"properties": {"answer": {"const": "decision"}, "decision": {"type": "object"}}}
		],
		"properties": {
			"answer": {"type": "string", "enum": ["decision", "owner"]},
			"reason": {"type": "string"},
			"decision": {"type": ["object", "null"], "required": ["chosen"], "properties": {"chosen": {"type": "string"}}},
			"note": {"type": "string"}
		}
	}`
	var schema any
	if err := json.Unmarshal([]byte(document), &schema); err != nil {
		t.Fatal(err)
	}
	want := map[string]any{"answer": "owner", "reason": "", "decision": nil, "note": "fake"}
	if got := fakeoutput.Instance(schema); !reflect.DeepEqual(got, want) {
		t.Fatalf("instance = %v, want %v", got, want)
	}
}
