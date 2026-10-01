// Package fakeoutput builds, for the fake runtimes, an output that a JSON
// Schema accepts, so a fake can answer any process whatever its schema.
package fakeoutput

// Enabled reports whether the fakes should answer from the schema: when the
// environment variable FAKE_OUTPUT is "schema".
func Enabled(getenv func(string) string) bool { return getenv("FAKE_OUTPUT") == "schema" }

// Instance is a small value the schema accepts: the first enum value or
// const, an object with each required property, an array of one item, and
// otherwise a zero value of the first listed type. An anyOf is answered by
// its first variant. It covers the keywords Agister's schemas use, not JSON
// Schema at large.
func Instance(schema any) any {
	s, ok := schema.(map[string]any)
	if !ok {
		return nil
	}
	if value, ok := s["const"]; ok {
		return value
	}
	if values, ok := s["enum"].([]any); ok && len(values) > 0 {
		return values[0]
	}
	if variants, ok := s["anyOf"].([]any); ok && len(variants) > 0 {
		return Instance(variants[0])
	}
	kind, _ := s["type"].(string)
	if kinds, ok := s["type"].([]any); ok && len(kinds) > 0 {
		kind, _ = kinds[0].(string)
	}
	switch kind {
	case "object":
		object := map[string]any{}
		properties, _ := s["properties"].(map[string]any)
		required, _ := s["required"].([]any)
		for _, name := range required {
			if name, ok := name.(string); ok {
				object[name] = Instance(properties[name])
			}
		}
		return object
	case "array":
		if items, ok := s["items"]; ok {
			return []any{Instance(items)}
		}
		return []any{}
	case "string":
		return "fake"
	case "integer", "number":
		return 1
	case "boolean":
		return false
	default:
		return nil
	}
}
