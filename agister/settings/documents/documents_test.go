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
			"timeout: 20m\nstale:\n  no_event: 10m\n  repeated_tool_calls: 5\ntools:\n  require: [repository.read, repository.diff]\n")},
	}})
	want := []string{
		"timeout = 30m  (review, repository)",
		"stale.no_event = 5m  (review, project)",
		"stale.repeated_tool_calls = 5  (review, home)",
		"tools.require = [repository.write]  (review, repository)",
	}
	if got := listed(composed.Fields()); !reflect.DeepEqual(got, want) {
		t.Errorf("fields\n got %q\nwant %q", got, want)
	}
	if got := composed.Fields()[0].Origin.Path; got != repoPath {
		t.Errorf("timeout came from %s, want %s", got, repoPath)
	}
}

func TestAnAgentIsReadAsTOMLAndAProcessAsYAML(t *testing.T) {
	t.Parallel()
	toml := []byte("runtime = \"codex\"\n")
	agent := compose(t, documents.Document{Kind: documents.Agent, Name: "sol", Files: []documents.File{{Path: "sol.toml", Data: toml}}})
	if got, want := listed(agent.Fields()), []string{"runtime = codex  (sol, home)"}; !reflect.DeepEqual(got, want) {
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
			"timeout: 20m\nstale:\n  no_event: 10m\n  repeated_tool_calls: 5\noutput:\n  schema: review-result\n")},
	}})
	review := compose(t, documents.Document{Kind: documents.Process, Name: "review", Files: []documents.File{
		{Layer: documents.Home, Path: homePath, Data: []byte("extends: review_base\nstale:\n  no_event: 5m\n")},
		{Layer: documents.Repository, Path: repoPath, Data: []byte("timeout: 30m\n")},
	}})
	extends, err := review.Extends()
	if err != nil || extends != "review_base" {
		t.Fatalf("extends %q, %v; want review_base", extends, err)
	}
	want := []string{
		"timeout = 30m  (review, repository)",
		"stale.no_event = 5m  (review, home)",
		"stale.repeated_tool_calls = 5  (review_base, home)",
		"output.schema = review-result  (review_base, home)",
		"extends = review_base  (review, home)",
	}
	if got := listed(documents.Extend(base, review).Fields()); !reflect.DeepEqual(got, want) {
		t.Errorf("fields\n got %q\nwant %q", got, want)
	}
}

func TestExtendsNamesADocumentOrNone(t *testing.T) {
	t.Parallel()
	none := compose(t, documents.Document{Kind: documents.Process, Name: "review", Files: []documents.File{{Path: homePath, Data: []byte("timeout: 20m\n")}}})
	if extends, err := none.Extends(); extends != "" || err != nil {
		t.Errorf("a document without extends extends %q, %v", extends, err)
	}
	for _, value := range []string{`""`, "[a, b]", "{a: b}", "3"} {
		bad := compose(t, documents.Document{Kind: documents.Process, Name: "review", Files: []documents.File{
			{Layer: documents.Home, Path: homePath, Data: []byte("extends: review_base\n")},
			{Layer: documents.Repository, Path: repoPath, Data: []byte("extends: " + value + "\n")},
		}})
		_, err := bad.Extends()
		if want := repoPath + ": extends must name a document of its kind"; err == nil || err.Error() != want {
			t.Errorf("extends: %s gives %v, want %q", value, err, want)
		}
	}
}
