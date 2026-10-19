package documents_test

import (
	"crypto/sha256"
	"fmt"
	"reflect"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/settings/documents"
)

func file(layer, path, text string) documents.File {
	return documents.File{Layer: layer, Path: path, Digest: fmt.Sprintf("%x", sha256.Sum256([]byte(text)))}
}

// files.feature: layers precede the extended document, blobs select only
// their nearest source, and problems give no files.
func TestDocumentFiles(t *testing.T) {
	t.Parallel()
	for _, c := range []struct {
		name     string
		kind     documents.Kind
		snapshot documents.Snapshot
		want     []documents.File
		problem  string
	}{
		{name: "layers", kind: documents.Process, snapshot: snapshotOf(map[string]documents.Document{
			"a": {Sources: documents.Sources{Home: source(homeProcess, "{x: 1}"), Project: source(projectProcess, "{x: 2}")}},
		}), want: []documents.File{file("project", projectProcess, "{x: 2}"), file("home", homeProcess, "{x: 1}")}},
		{name: "extends", kind: documents.Process, snapshot: snapshotOf(map[string]documents.Document{
			"a":    {Sources: documents.Sources{Home: source(homeProcess, "{extends: base}")}},
			"base": {Sources: documents.Sources{Home: source("/h/base.yaml", "{x: 1}"), Repository: source("/r/base.yaml", "{x: 2}")}},
		}), want: []documents.File{file("home", homeProcess, "{extends: base}"), file("repository", "/r/base.yaml", "{x: 2}"), file("home", "/h/base.yaml", "{x: 1}")}},
		{name: "blob", kind: documents.Prompt, snapshot: documents.Snapshot{Documents: map[documents.Kind]map[string]documents.Document{
			documents.Prompt: {"a": {Sources: documents.Sources{Home: source("/h/a.md", "far"), Repository: source("/r/a.md", "near")}}},
		}}, want: []documents.File{file("repository", "/r/a.md", "near")}},
		{name: "missing base", kind: documents.Process, snapshot: snapshotOf(map[string]documents.Document{
			"a": {Sources: documents.Sources{Home: source(homeProcess, "{extends: missing}")}},
		}), problem: `no layer holds the process "missing"`},
		{name: "bad bytes", kind: documents.Process, snapshot: snapshotOf(map[string]documents.Document{
			"a": {Sources: documents.Sources{Home: source(homeProcess, "x: [")}},
		}), problem: "" + homeProcess},
		{name: "missing", kind: documents.Process, snapshot: snapshotOf(nil), problem: `no layer holds the process "a"`},
		{name: "unknown", kind: "x", problem: `the kind "x" is not known`},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			d := documents.New(c.snapshot)
			got, problems := d.Files(c.kind, "a")
			if !reflect.DeepEqual(got, c.want) {
				t.Errorf("files %+v, want %+v", got, c.want)
			}
			if c.problem != "" {
				if len(problems) == 0 || !strings.Contains(fmt.Sprint(problems), c.problem) {
					t.Fatalf("problems %v, want %q", problems, c.problem)
				}
				problems[0].Message = "changed"
			} else if len(problems) != 0 {
				t.Fatalf("problems %v", problems)
			}
			if len(got) > 0 {
				got[0].Digest = "changed"
			}
			again, ps := d.Files(c.kind, "a")
			if !reflect.DeepEqual(again, c.want) || c.problem != "" && !strings.Contains(fmt.Sprint(ps), c.problem) {
				t.Errorf("caller changed cached files or problems: %+v, %v", again, ps)
			}
		})
	}
}
