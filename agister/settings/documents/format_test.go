package documents

import (
	"fmt"
	"reflect"
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

// leaf is a field of a tree read from no document: its path of keys and
// its value, of the type the format gives it.
type leaf struct {
	path  string
	value any
}

func leaves(n *node) []leaf {
	var list []leaf
	for _, field := range n.fields(nil, nil) {
		list = append(list, leaf{strings.Join(field.Path, "."), field.Value})
	}
	return list
}

// A file's fields come in the order it wrote them, each value of the type
// the tree promises: a scalar as the format reads it, a list as []any and
// a map in a list as map[string]any.
func TestAFileIsReadInTheOrderItIsWrittenWithItsValuesTypes(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name   string
		format format
		data   string
		want   []leaf
	}{
		{"YAML", yamlFormat, `
name: review
attempts: 2
cost: 1.5
clean: true
stale:
  no_event: 10m
  none: {}
tools:
  require: [repository.read, repository.diff]
fan_out:
  - {node: tests, uses: [a, {b: 1}]}
`, []leaf{
			{"name", "review"},
			{"attempts", 2},
			{"cost", 1.5},
			{"clean", true},
			{"stale.no_event", "10m"},
			{"stale.none", map[string]any{}},
			{"tools.require", []any{"repository.read", "repository.diff"}},
			{"fan_out", []any{map[string]any{"node": "tests", "uses": []any{"a", map[string]any{"b": 1}}}}},
		}},
		{"TOML", tomlFormat, `
schema = "agister.agent/v1alpha1"
attempts = 2
cost = 1.5
clean = true
skills = ["go", "review"]
inline = {a = 1}

[limits]
timeout = "20m"

[[notes]]
text = "a"

[[notes.links]]
to = "b"
`, []leaf{
			{"schema", "agister.agent/v1alpha1"},
			{"attempts", int64(2)},
			{"cost", 1.5},
			{"clean", true},
			{"skills", []any{"go", "review"}},
			{"inline.a", int64(1)},
			{"limits.timeout", "20m"},
			{"notes", []any{map[string]any{"text": "a", "links": []any{map[string]any{"to": "b"}}}}},
		}},
		{"TOML tables a dotted key or a header implies", tomlFormat, `
runtime = "codex"
model = "sol"
limits.timeout = "20m"
limits.cost = 2
effort = "high"

[stale.recover]
max_resumes = 1

[stale]
no_event = "5m"
`, []leaf{
			{"runtime", "codex"},
			{"model", "sol"},
			{"limits.timeout", "20m"},
			{"limits.cost", int64(2)},
			{"effort", "high"},
			{"stale.recover.max_resumes", int64(1)},
			{"stale.no_event", "5m"},
		}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			tree, err := parse(c.format, []byte(c.data))
			if err != nil {
				t.Fatal(err)
			}
			if got := leaves(tree); !reflect.DeepEqual(got, c.want) {
				t.Errorf("fields\n got %#v\nwant %#v", got, c.want)
			}
		})
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
		{"a key in a list that is not a string", yamlFormat, "a:\n  - {1: tests}\n", "line 2: a key is not a string"},
		{"a key in a list's list that is not a string", yamlFormat, "a:\n  - [x, {true: tests}]\n", "line 2: a key is not a string"},
		{"a merge key in a list", yamlFormat, "a: &base {b: 1}\nc:\n  - <<: *base\n", "line 3: a key is not a string"},
		{"a key given twice in a list", yamlFormat, "a:\n  - b: 1\n    b: 2\n", "line 3: b is given twice"},
		{"an alias in a list", yamlFormat, "a: &x 1\nb: [*x]\n", "line 2: an alias is not read"},
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

// problems is what read finds in data, a file of kind k, each as its text.
func problems(t *testing.T, k Kind, data string) []string {
	t.Helper()
	_, found := read(k, []byte(data))
	var texts []string
	for _, problem := range found {
		texts = append(texts, problem.Error())
	}
	return texts
}

// A file that holds every field its kind knows, at every depth, has no
// problem, and neither does a layer's file that sets one field and names
// no schema.
func TestAFileOfItsKindsFieldsIsRead(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name string
		kind Kind
		data string
	}{
		{"an agent", Agent, `
schema = "agister.agent/v1alpha1"
name = "sol"
extends = "base"
runtime = "codex"
model = "gpt-6.1-sol"
model_family = "openai"
effort = "high"
skills = ["go"]
`},
		{"a process", Process, `
schema: agister.process/v1alpha1
name: review
extends: review_base
type: process
session: resumable
prompt: review
guidance: [go-testing-seams]
skills: [go]
input:
  instruction: Review.
  params:
    base: {default: origin/trunk}
    goal: {}
  values:
    base_revision: {source: git.revision, rev: "${param.base}"}
    changed_files: {source: git.changed_files, base: "${value.base_revision}", head: HEAD}
    goal: {source: param, name: goal}
    brief: {source: file, path: "${param.goal}", form: [goal]}
workspace: {access: read-only, scope: candidate, revision: base_revision, clean: true}
tools: {require: [repository.read], allow: [repository.read]}
timeout: 20m
retry: {max_attempts: 1}
stale:
  no_event: 10m
  tool_command: 8m
  repeated_tool_calls: 5
  recover: {max_resumes: 1, instruction: Go on.}
isolation: {deny: [network]}
output: {format: json, schema: review-result, require_valid: true}
verify: {command: scripts/test.sh, timeout: 5m, no_output: 2m, max_attempts: 3, instruction: Fix it.}
`},
		{"a process naming its verification", Process, "verify: verify:repo\n"},
		{"a workflow", Workflow, `
schema: agister.workflow/v1alpha1
name: code_review
extends: code_review_base
type: workflow
input:
  params:
    goal: {}
  values:
    goal: {source: file, path: "${param.goal}", form: [goal]}
call: {node: work, uses: process:implement, agent: sol}
fan_out:
  - {node: tests, uses: process:tests_review, agent: sol}
join: {node: judge, uses: process:review_judge, agent: opus}
`},
		{"a runtime", Runtime, `
schema: agister.runtime/v1alpha1
name: codex
extends: codex_base
adapter: codex
contract: codex/2
efforts: [low, high]
primitives:
  select: one
  items:
    read-only: {grants: [repository.read], verified: ["0.161."]}
`},
		{"a verification", Verify, `
schema: agister.verify/v1alpha1
name: repo
extends: repo_base
command: scripts/test.sh
timeout: 5m
no_output: 2m
max_attempts: 3
instruction: Fix it.
`},
		{"a brief", Brief, `
schema: agister.brief/v1alpha1
name: goal
extends: goal_base
parts:
  - {heading: "## Intent", required: true, reads: None., reference: file}
template: "# <issue>"
`},
		{"a layer's file", Process, "timeout: 30m\n"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			if got := problems(t, c.kind, c.data); len(got) > 0 {
				t.Errorf("problems %q", got)
			}
		})
	}
}

// Every field a kind does not know is a problem, at every depth: in a map,
// under a name the settings choose, and in a list's maps. A field of a
// type format does not expect is not format's to say.
func TestAFieldItsKindDoesNotKnowIsAProblem(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name string
		kind Kind
		data string
		want []string
	}{
		{"an agent", Agent, "runtime = \"codex\"\nfuture = true\n[limits]\ntimeout = \"1m\"\n",
			[]string{"future: unknown field", "limits: unknown field"}},
		{"a process", Process, `
timeout: 20m
stale: {no_evnt: 5m, recover: {max_resumes: 1, after: 2}}
input:
  params: {goal: {default: a, optional: true}}
  values: {goal: {source: param, name: goal, cache: true}}
verify: {command: x, where: here}
`, []string{
			"stale.no_evnt: unknown field",
			"stale.recover.after: unknown field",
			"input.params.goal.optional: unknown field",
			"input.values.goal.cache: unknown field",
			"verify.where: unknown field",
		}},
		{"a workflow", Workflow, `
fan_out:
  - {node: a, uses: process:a}
  - {node: b, uses: process:b, timeout: 1h, retry: {max_attempts: 2}}
join: {node: j, uses: process:j, params: {}}
limits: {}
`, []string{
			"fan_out[1].retry: unknown field",
			"fan_out[1].timeout: unknown field",
			"join.params: unknown field",
			"limits: unknown field",
		}},
		{"a runtime", Runtime, "verified_versions: [\"1\"]\nprimitives:\n  items:\n    read: {grants: [a], since: 1}\n",
			[]string{"verified_versions: unknown field", "primitives.items.read.since: unknown field"}},
		{"a verification", Verify, "command: x\non_failure: stop\n", []string{"on_failure: unknown field"}},
		{"a brief", Brief, "parts:\n  - {heading: a, optional: true}\n", []string{"parts[0].optional: unknown field"}},
		{"a field of a type format does not expect", Workflow, "fan_out: {node: a}\njoin: [a]\ninput: 3\n", nil},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			if got := problems(t, c.kind, c.data); !reflect.DeepEqual(got, c.want) {
				t.Errorf("problems\n got %q\nwant %q", got, c.want)
			}
		})
	}
}

// A file that names a schema names its kind's, at the version format
// reads.
func TestASchemaIsItsKindsAtTheVersionFormatReads(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name string
		kind Kind
		data string
		want string
	}{
		{"another version", Process, "schema: agister.process/v2\n", "agister.process/v1alpha1"},
		{"another kind", Process, "schema: agister.workflow/v1alpha1\n", "agister.process/v1alpha1"},
		{"a verification's schema in an agent", Agent, "schema = \"agister.verify/v1alpha1\"\n", "agister.agent/v1alpha1"},
		{"a schema that is not a string", Verify, "schema: 1\n", "agister.verify/v1alpha1"},
		{"a schema that is a list", Brief, "schema: [agister.brief/v1alpha1]\n", "agister.brief/v1alpha1"},
		{"a schema that is a map", Runtime, "schema: {version: v1alpha1}\n", "agister.runtime/v1alpha1"},
		{"a workflow's schema in a workflow", Workflow, "schema: agister.workflow/v2\n", "agister.workflow/v1alpha1"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			want := []string{fmt.Sprintf("schema: must be %q", c.want)}
			if got := problems(t, c.kind, c.data); !reflect.DeepEqual(got, want) {
				t.Errorf("problems\n got %q\nwant %q", got, want)
			}
		})
	}
}
