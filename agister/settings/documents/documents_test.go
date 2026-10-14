package documents_test

import (
	"fmt"
	"reflect"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/settings/documents"
)

const (
	homePath    = "/home/.agister/processes/review.yaml"
	repoPath    = "/repo/.agister/processes/review.yaml"
	projectPath = "/repo/app/.agister/processes/review.yaml"

	schema = "schema: agister.process/v1alpha1\n"
)

// listed writes each field as "path = value  (document, layer)".
func listed(fields []documents.Field) []string {
	layers := map[documents.Layer]string{documents.Home: "home", documents.Repository: "repository", documents.Project: "project"}
	lines := make([]string, len(fields))
	for i, field := range fields {
		lines[i] = fmt.Sprintf("%s = %v  (%s, %s)", strings.Join(field.Path, "."), field.Value, field.Origin.Document, layers[field.Origin.Layer])
	}
	return lines
}

func compose(t *testing.T, doc documents.Document) documents.Composed {
	t.Helper()
	composed, err := documents.Compose(doc)
	if err != nil {
		t.Fatal(err)
	}
	return composed
}

func TestADocumentIsComposedFromHomeTowardTheLaunchDirectory(t *testing.T) {
	t.Parallel()
	composed := compose(t, documents.Document{Kind: documents.Process, Name: "review", Files: []documents.File{
		// Given nearest first: the order of the files is not what layers them.
		{Layer: documents.Project, Path: projectPath, Data: []byte("stale:\n  no_event: 5m\n")},
		{Layer: documents.Repository, Path: repoPath, Data: []byte("timeout: 30m\ntools:\n  require: [repository.write]\n")},
		{Layer: documents.Home, Path: homePath, Data: []byte(
			"schema: agister.process/v1alpha1\ntimeout: 20m\nstale:\n  no_event: 10m\n  repeated_tool_calls: 5\ntools:\n  require: [repository.read, repository.diff]\n")},
	}})
	want := []string{
		"schema = agister.process/v1alpha1  (review, home)",
		"timeout = 30m  (review, repository)",
		"stale.no_event = 5m  (review, project)",
		"stale.repeated_tool_calls = 5  (review, home)",
		"tools.require = [repository.write]  (review, repository)",
	}
	if got := listed(composed.Fields()); !reflect.DeepEqual(got, want) {
		t.Errorf("fields\n got %q\nwant %q", got, want)
	}
	if got := composed.Fields()[1].Origin.Path; got != repoPath {
		t.Errorf("timeout came from %s, want %s", got, repoPath)
	}
}

func TestAnAgentIsReadAsTOMLAndAProcessAsYAML(t *testing.T) {
	t.Parallel()
	toml := []byte("schema = \"agister.agent/v1alpha1\"\nruntime = \"codex\"\n")
	agent := compose(t, documents.Document{Kind: documents.Agent, Name: "sol", Files: []documents.File{{Path: "sol.toml", Data: toml}}})
	if got, want := listed(agent.Fields()), []string{"schema = agister.agent/v1alpha1  (sol, home)", "runtime = codex  (sol, home)"}; !reflect.DeepEqual(got, want) {
		t.Errorf("agent fields\n got %q\nwant %q", got, want)
	}
	_, err := documents.Compose(documents.Document{Kind: documents.Process, Name: "review", Files: []documents.File{{Path: "review.yaml", Data: toml}}})
	if err == nil {
		t.Error("a process written in TOML was read")
	}
}

func TestEveryFileThatCannotBeReadIsNamed(t *testing.T) {
	t.Parallel()
	_, err := documents.Compose(documents.Document{Kind: documents.Process, Name: "review", Files: []documents.File{
		{Layer: documents.Home, Path: homePath, Data: []byte("- a\n")},
		{Layer: documents.Repository, Path: repoPath, Data: []byte("timeout: 30m\n")},
		{Layer: documents.Project, Path: projectPath, Data: []byte("")},
	}})
	if err == nil {
		t.Fatal("composed")
	}
	want := homePath + ": line 1: the document is not a map\n" + projectPath + ": the file holds no document"
	if err.Error() != want {
		t.Errorf("error\n got %q\nwant %q", err, want)
	}
}

func TestADocumentIsComposedOverTheDocumentItExtends(t *testing.T) {
	t.Parallel()
	base := compose(t, documents.Document{Kind: documents.Process, Name: "review_base", Files: []documents.File{
		{Layer: documents.Home, Path: "/home/.agister/processes/review_base.yaml", Data: []byte(
			"schema: agister.process/v1alpha1\ntimeout: 20m\nstale:\n  no_event: 10m\n  repeated_tool_calls: 5\noutput:\n  schema: review-result\n")},
	}})
	review := compose(t, documents.Document{Kind: documents.Process, Name: "review", Files: []documents.File{
		{Layer: documents.Home, Path: homePath, Data: []byte("schema: agister.process/v1alpha1\nextends: review_base\nstale:\n  no_event: 5m\n")},
		{Layer: documents.Repository, Path: repoPath, Data: []byte("timeout: 30m\n")},
	}})
	extends, err := review.Extends()
	if err != nil || extends != "review_base" {
		t.Fatalf("extends %q, %v; want review_base", extends, err)
	}
	want := []string{
		"schema = agister.process/v1alpha1  (review, home)",
		"timeout = 30m  (review, repository)",
		"stale.no_event = 5m  (review, home)",
		"stale.repeated_tool_calls = 5  (review_base, home)",
		"output.schema = review-result  (review_base, home)",
		"extends = review_base  (review, home)",
	}
	extended := documents.Extend(base, review)
	if err := extended.Complete(); err != nil {
		t.Errorf("complete: %v", err)
	}
	if got := listed(extended.Fields()); !reflect.DeepEqual(got, want) {
		t.Errorf("fields\n got %q\nwant %q", got, want)
	}
}

func TestExtendsNamesADocumentOrNone(t *testing.T) {
	t.Parallel()
	none := compose(t, documents.Document{Kind: documents.Process, Name: "review", Files: []documents.File{{Path: homePath, Data: []byte(schema + "timeout: 20m\n")}}})
	if extends, err := none.Extends(); extends != "" || err != nil {
		t.Errorf("a document without extends extends %q, %v", extends, err)
	}
	for _, value := range []string{`""`, "[a, b]", "{a: b}", "3"} {
		bad := compose(t, documents.Document{Kind: documents.Process, Name: "review", Files: []documents.File{
			{Layer: documents.Home, Path: homePath, Data: []byte(schema + "extends: review_base\n")},
			{Layer: documents.Repository, Path: repoPath, Data: []byte("extends: " + value + "\n")},
		}})
		_, err := bad.Extends()
		if want := repoPath + ": extends must name a document of its kind"; err == nil || err.Error() != want {
			t.Errorf("extends: %s gives %v, want %q", value, err, want)
		}
	}
}

func TestEveryProblemOfAFileIsNamedWithItsFile(t *testing.T) {
	t.Parallel()
	_, err := documents.Compose(documents.Document{Kind: documents.Agent, Name: "sol", Files: []documents.File{
		{Layer: documents.Home, Path: "/home/.agister/agents/sol.toml", Data: []byte("schema = \"agister.agent/v1alpha1\"\nruntime = \"codex\"\n")},
		{Layer: documents.Repository, Path: "/repo/.agister/agents/sol.toml", Data: []byte(
			"schema = \"agister.agent/v999\"\nruntime = \"codex\"\nfuture = true\ncolour = \"red\"\n")},
	}})
	want := "/repo/.agister/agents/sol.toml: future: unknown field\n" +
		"/repo/.agister/agents/sol.toml: colour: unknown field\n" +
		"/repo/.agister/agents/sol.toml: schema: must be \"agister.agent/v1alpha1\""
	if err == nil || err.Error() != want {
		t.Errorf("error\n got %v\nwant %q", err, want)
	}
}

// A layer's file need not name the schema, but the composed document must:
// one of its files, or of what it extends, names it.
func TestADocumentNamesItsSchema(t *testing.T) {
	t.Parallel()
	repo := compose(t, documents.Document{Kind: documents.Verify, Name: "repo", Files: []documents.File{
		{Layer: documents.Home, Path: "/home/.agister/verifies/repo.yaml", Data: []byte("command: scripts/test.sh\n")},
		{Layer: documents.Repository, Path: "/repo/.agister/verifies/repo.yaml", Data: []byte("timeout: 5m\n")},
	}})
	if want := `no file of repo gives its schema, "agister.verify/v1alpha1"`; repo.Complete() == nil || repo.Complete().Error() != want {
		t.Errorf("error\n got %v\nwant %q", repo.Complete(), want)
	}
	base := compose(t, documents.Document{Kind: documents.Verify, Name: "repo_base", Files: []documents.File{
		{Layer: documents.Home, Path: "/home/.agister/verifies/repo_base.yaml", Data: []byte("no_output: 2m\n")},
	}})
	extending := compose(t, documents.Document{Kind: documents.Verify, Name: "repo", Files: []documents.File{
		{Layer: documents.Home, Path: "/home/.agister/verifies/repo.yaml", Data: []byte("extends: repo_base\ncommand: scripts/test.sh\n")},
	}})
	err := documents.Extend(base, extending).Complete()
	if want := `no file of repo or of what it extends gives its schema, "agister.verify/v1alpha1"`; err == nil || err.Error() != want {
		t.Errorf("error\n got %v\nwant %q", err, want)
	}
	named := compose(t, documents.Document{Kind: documents.Verify, Name: "repo", Files: []documents.File{
		{Layer: documents.Repository, Path: "/repo/.agister/verifies/repo.yaml", Data: []byte("schema: agister.verify/v1alpha1\n")},
	}})
	if err := named.Complete(); err != nil {
		t.Errorf("a document naming its schema: %v", err)
	}
}

// An extending document need not name the schema: it takes it, with every
// field it does not set, from what it extends, through any chain of
// extends.
func TestAnExtendingDocumentTakesItsSchemaFromItsBase(t *testing.T) {
	t.Parallel()
	process := func(name, data string) documents.Composed {
		return compose(t, documents.Document{Kind: documents.Process, Name: name, Files: []documents.File{
			{Layer: documents.Home, Path: "/home/.agister/processes/" + name + ".yaml", Data: []byte(data)},
		}})
	}
	root := process("review_root", schema+"timeout: 20m\nretry:\n  max_attempts: 1\n")
	base := process("review_base", "extends: review_root\ntimeout: 25m\n")
	review := process("review", "extends: review_base\ntimeout: 30m\n")
	cases := []struct {
		name string
		got  documents.Composed
		want []string
	}{
		{"over the document naming the schema", documents.Extend(root, base), []string{
			"schema = agister.process/v1alpha1  (review_root, home)",
			"timeout = 25m  (review_base, home)",
			"retry.max_attempts = 1  (review_root, home)",
			"extends = review_root  (review_base, home)",
		}},
		{"through a chain", documents.Extend(documents.Extend(root, base), review), []string{
			"schema = agister.process/v1alpha1  (review_root, home)",
			"timeout = 30m  (review, home)",
			"retry.max_attempts = 1  (review_root, home)",
			"extends = review_base  (review, home)",
		}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			if err := c.got.Complete(); err != nil {
				t.Errorf("complete: %v", err)
			}
			if got := listed(c.got.Fields()); !reflect.DeepEqual(got, c.want) {
				t.Errorf("fields\n got %q\nwant %q", got, c.want)
			}
		})
	}
}

// A schema, a prompt or a skill is the nearest layer's file, its bytes as
// they are, whatever the order of the files, and only that file is read.
func TestADocumentTakenWholeIsTheNearestLayersFile(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name  string
		kind  documents.Kind
		files []documents.File
		want  documents.Whole
	}{
		{"a prompt", documents.Prompt, []documents.File{
			{Layer: documents.Project, Path: "/repo/app/.agister/prompts/review.md", Data: []byte("Project instructions\n")},
			{Layer: documents.Home, Path: "/home/.agister/prompts/review.md", Data: []byte("Home instructions\n")},
		}, documents.Whole{Data: []byte("Project instructions\n"), Origin: documents.Origin{Document: "review", Layer: documents.Project, Path: "/repo/app/.agister/prompts/review.md"}}},
		{"a skill", documents.Skill, []documents.File{
			{Layer: documents.Home, Path: "/home/.agister/skills/review/SKILL.md", Data: []byte("---\nname: review\n---\nHome.\n")},
			{Layer: documents.Repository, Path: "/repo/.agister/skills/review/SKILL.md", Data: []byte("---\nname: review\n---\nRepository.\n")},
		}, documents.Whole{Data: []byte("---\nname: review\n---\nRepository.\n"), Origin: documents.Origin{Document: "review", Layer: documents.Repository, Path: "/repo/.agister/skills/review/SKILL.md"}}},
		{"a schema over a farther file that is not read", documents.Schema, []documents.File{
			{Layer: documents.Home, Path: "/home/.agister/schemas/review.json", Data: []byte("{not json")},
			{Layer: documents.Repository, Path: "/repo/.agister/schemas/review.json", Data: []byte(`{"type": "object",  "required": ["verdict"]}`)},
		}, documents.Whole{Data: []byte(`{"type": "object",  "required": ["verdict"]}`), Origin: documents.Origin{Document: "review", Layer: documents.Repository, Path: "/repo/.agister/schemas/review.json"}}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			got, err := documents.Take(documents.Document{Kind: c.kind, Name: "review", Files: c.files})
			if err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(got, c.want) {
				t.Errorf("taken\n got %+v\nwant %+v", got, c.want)
			}
		})
	}
}

// What is taken whole is read in its kind's format, and is never
// composed; what is composed is never taken whole.
func TestADocumentIsTakenWholeOrComposedByItsKind(t *testing.T) {
	t.Parallel()
	const path = "/repo/.agister/schemas/review.json"
	_, err := documents.Take(documents.Document{Kind: documents.Schema, Name: "review", Files: []documents.File{
		{Layer: documents.Home, Path: "/home/.agister/schemas/review.json", Data: []byte("{}")},
		{Layer: documents.Repository, Path: path, Data: []byte("{} {}")},
	}})
	if want := path + ": the file is not one JSON document"; err == nil || !strings.HasPrefix(err.Error(), want) {
		t.Errorf("error\n got %v\nwant %q", err, want)
	}
	if _, err := documents.Take(documents.Document{Kind: documents.Prompt, Name: "review"}); err == nil || err.Error() != "no file holds review" {
		t.Errorf("a prompt no file holds: %v", err)
	}
	prompt := documents.Document{Kind: documents.Prompt, Name: "review", Files: []documents.File{{Path: "/home/.agister/prompts/review.md", Data: []byte("schema: x\n")}}}
	if _, err := documents.Compose(prompt); err == nil || err.Error() != "review is taken whole, not composed" {
		t.Errorf("a prompt composed: %v", err)
	}
	process := documents.Document{Kind: documents.Process, Name: "review", Files: []documents.File{{Path: homePath, Data: []byte(schema)}}}
	if _, err := documents.Take(process); err == nil || err.Error() != "review is composed, not taken whole" {
		t.Errorf("a process taken whole: %v", err)
	}
}
