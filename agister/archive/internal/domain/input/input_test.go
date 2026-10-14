package input

import "testing"

func TestInputVocabularyKeepsRecordedNames(t *testing.T) {
	t.Parallel()
	for _, c := range []struct{ name, got, want string }{
		{"PromptInput", PromptInput, "prompt"},
		{"GuidanceInput", GuidanceInput, "guidance."},
		{"PromptSource", PromptSource, "prompt"},
		{"CollectionSource", CollectionSource, "workflow.collection"},
		{"FileSource", FileSource, "file"},
	} {
		if c.got != c.want {
			t.Errorf("%s = %q, want %q", c.name, c.got, c.want)
		}
	}
}
