package documents

import (
	"fmt"
	"strings"
	"testing"
)

// show writes a tree in one line, its maps' keys in order: {a: 1, b: {c: [x y]}}.
func show(n *node) string {
	if !n.isMap {
		return fmt.Sprint(n.value)
	}
	parts := make([]string, len(n.entries))
	for i, entry := range n.entries {
		parts[i] = entry.key + ": " + show(entry.value)
	}
	return "{" + strings.Join(parts, ", ") + "}"
}

func TestYAMLIsReadInTheOrderItIsWritten(t *testing.T) {
	t.Parallel()
	tree, err := parse(yamlFormat, []byte(`
name: review
timeout: 20m
stale:
  no_event: 10m
  repeated_tool_calls: 5
tools:
  require: [repository.read, repository.diff]
fan_out:
  - {node: tests, uses: process:tests_review}
`))
	if err != nil {
		t.Fatal(err)
	}
	want := "{name: review, timeout: 20m, stale: {no_event: 10m, repeated_tool_calls: 5}, " +
		"tools: {require: [repository.read repository.diff]}, fan_out: [map[node:tests uses:process:tests_review]]}"
	if got := show(tree); got != want {
		t.Errorf("tree\n got %s\nwant %s", got, want)
	}
}

func TestTOMLIsReadInTheOrderItIsWritten(t *testing.T) {
	t.Parallel()
	tree, err := parse(tomlFormat, []byte(`
schema = "agister.agent/v1alpha1"
runtime = "codex"
model = "sol"
skills = ["go", "review"]

[limits]
timeout = "20m"
cost = 2

[[notes]]
text = "a"
`))
	if err != nil {
		t.Fatal(err)
	}
	want := "{schema: agister.agent/v1alpha1, runtime: codex, model: sol, skills: [go review], " +
		"limits: {timeout: 20m, cost: 2}, notes: [map[text:a]]}"
	if got := show(tree); got != want {
		t.Errorf("tree\n got %s\nwant %s", got, want)
	}
}

func TestAFileThatIsNotOneMapIsNotRead(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name   string
		format format
		data   string
		want   string
	}{
		{"empty YAML", yamlFormat, "", "the file holds no document"},
		{"two YAML documents", yamlFormat, "a: 1\n---\nb: 2\n", "the file holds more than one document"},
		{"a YAML list", yamlFormat, "- a\n- b\n", "line 1: the document is not a map"},
		{"a YAML scalar", yamlFormat, "review\n", "line 1: the document is not a map"},
		{"a key that is not a string", yamlFormat, "1: a\n", "line 1: a key is not a string"},
		{"a merge key", yamlFormat, "a: &base {b: 1}\nc:\n  <<: *base\n", "line 3: a key is not a string"},
		{"a key given twice", yamlFormat, "a: 1\nb: 2\na: 3\n", "line 3: a is given twice"},
		{"an alias", yamlFormat, "a: &x 1\nb: *x\n", "line 2: an alias is not read"},
		{"broken YAML", yamlFormat, "a: [1\n", "yaml:"},
		{"broken TOML", tomlFormat, "a = \n", "toml:"},
		{"a TOML key given twice", tomlFormat, "a = 1\na = 2\n", "toml:"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			tree, err := parse(c.format, []byte(c.data))
			if err == nil {
				t.Fatalf("read as %s", show(tree))
			}
			if !strings.Contains(err.Error(), c.want) {
				t.Errorf("error %q does not say %q", err, c.want)
			}
		})
	}
}
