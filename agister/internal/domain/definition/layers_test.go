package definition_test

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"reflect"
	"strings"
	"testing"

	"github.com/BurntSushi/toml"
	"gopkg.in/yaml.v3"

	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
)

// layer is one layer's file of a document, as Compose takes it.
func layer(name definition.Layer, path, text string) definition.LayerText {
	return definition.LayerText{File: definition.LayerFile{Layer: name, Path: path, SHA256: "digest of " + path}, Bytes: []byte(text)}
}

// leaves are a YAML document's leaves in its order, each "path = value": a
// leaf is a scalar, a list, shown as its items, or an empty map.
func leaves(t *testing.T, data []byte) []string {
	t.Helper()
	var root yaml.Node
	if err := yaml.Unmarshal(data, &root); err != nil || len(root.Content) != 1 {
		t.Fatalf("the composition is not one YAML document: %v\n%s", err, data)
	}
	var found []string
	var walk func(node *yaml.Node, path string)
	walk = func(node *yaml.Node, path string) {
		switch {
		case node.Kind == yaml.MappingNode && len(node.Content) > 0:
			for i := 0; i+1 < len(node.Content); i += 2 {
				walk(node.Content[i+1], strings.TrimPrefix(path+"."+node.Content[i].Value, "."))
			}
		case node.Kind == yaml.MappingNode:
			found = append(found, path+" = {}")
		case node.Kind == yaml.SequenceNode:
			items := make([]string, len(node.Content))
			for i, item := range node.Content {
				items[i] = item.Value
			}
			found = append(found, path+" = ["+strings.Join(items, ", ")+"]")
		default:
			found = append(found, path+" = "+node.Value)
		}
	}
	walk(root.Content[0], "")
	return found
}

// The three layer files of ADR-028 rule 4's example.
const (
	homeImplement = `schema: agister.process/v1alpha1
name: implement
type: process
uses: agent:claude-implementer-opus
policy: process-policy:implement
prompt: implement
input:
  instruction: Implement the task.
  params:
    candidate: {default: HEAD}
    brief: {}
  values:
    candidate_revision: {source: git.revision, rev: "${param.candidate}"}
    brief: {source: file, path: "${param.brief}", form: [goal, step]}
verify: verify:repo
`
	repositoryImplement = "guidance: [testing, architecture]\n"
	projectImplement    = `guidance: []
input:
  params:
    candidate: {default: origin/trunk}
    ticket: {}
  values:
    brief: {form: [step]}
    ticket: {source: param, name: ticket}
`
)

// ADR-028 rule 4, on its own example: a map merges by key at every depth, a
// key both layers hold keeping the parent's position and a new one added
// after the parent's; a list replaces whole. Rule 11: each layer file names
// the fields it gave, in its order, and one that gave nothing names none.
func TestComposeMergesMapsByKeyAndNamesEachFieldsLayer(t *testing.T) {
	t.Parallel()
	data, files, err := definition.Compose(definition.KindProcess, []definition.LayerText{
		layer(definition.LayerProject, "/w/docs/.agister/processes/implement.yaml", projectImplement),
		layer(definition.LayerRepository, "/w/.agister/processes/implement.yaml", repositoryImplement),
		layer(definition.LayerHome, "/h/processes/implement.yaml", homeImplement),
	})
	if err != nil {
		t.Fatal(err)
	}
	want := []string{
		"schema = agister.process/v1alpha1",
		"name = implement",
		"type = process",
		"uses = agent:claude-implementer-opus",
		"policy = process-policy:implement",
		"prompt = implement",
		"input.instruction = Implement the task.",
		"input.params.candidate.default = origin/trunk",
		"input.params.brief = {}",
		"input.params.ticket = {}",
		"input.values.candidate_revision.source = git.revision",
		"input.values.candidate_revision.rev = ${param.candidate}",
		"input.values.brief.source = file",
		"input.values.brief.path = ${param.brief}",
		"input.values.brief.form = [step]",
		"input.values.ticket.source = param",
		"input.values.ticket.name = ticket",
		"verify = verify:repo",
		"guidance = []",
	}
	if got := leaves(t, data); !reflect.DeepEqual(got, want) {
		t.Fatalf("composed:\n%s\nwant:\n%s", strings.Join(got, "\n"), strings.Join(want, "\n"))
	}
	wantFiles := []definition.LayerFile{
		{Layer: definition.LayerProject, Path: "/w/docs/.agister/processes/implement.yaml", SHA256: "digest of /w/docs/.agister/processes/implement.yaml", Fields: []string{
			"guidance", "input.params.candidate.default", "input.params.ticket", "input.values.brief.form", "input.values.ticket.source", "input.values.ticket.name",
		}},
		{Layer: definition.LayerRepository, Path: "/w/.agister/processes/implement.yaml", SHA256: "digest of /w/.agister/processes/implement.yaml", Fields: []string{}},
		{Layer: definition.LayerHome, Path: "/h/processes/implement.yaml", SHA256: "digest of /h/processes/implement.yaml", Fields: []string{
			"schema", "name", "type", "uses", "policy", "prompt", "input.instruction", "input.params.brief",
			"input.values.candidate_revision.source", "input.values.candidate_revision.rev", "input.values.brief.source", "input.values.brief.path", "verify",
		}},
	}
	if !reflect.DeepEqual(files, wantFiles) {
		t.Fatalf("files = %+v", files)
	}
}

// ADR-028 rule 4, value by value: a scalar and a list replace whole, unlike
// values replace whole either way, null is a scalar that replaces, and an
// empty map over a map changes nothing, so nothing unsets.
func TestComposeReplacesWhatIsNotAMapOnBothSides(t *testing.T) {
	t.Parallel()
	const home = `scalar: home
list: [a, b]
map: {kept: home, changed: home}
scalar_to_map: home
map_to_scalar: {a: 1}
map_to_list: {a: 1}
list_to_map: [a]
emptied: {a: 1, b: 2}
nulled: home
`
	for name, c := range map[string]struct {
		nearer string
		want   []string
		fields []string // the nearer layer's
	}{
		"a scalar replaces a scalar":           {"scalar: nearer\n", []string{"scalar = nearer"}, []string{"scalar"}},
		"a list replaces a list, never joined": {"list: [c]\n", []string{"list = [c]"}, []string{"list"}},
		"[] is the list that means none":       {"list: []\n", []string{"list = []"}, []string{"list"}},
		"a map merges by key": {"map: {changed: nearer, added: nearer}\n",
			[]string{"map.kept = home", "map.changed = nearer", "map.added = nearer"}, []string{"map.changed", "map.added"}},
		"a map replaces a scalar":                 {"scalar_to_map: {a: 1}\n", []string{"scalar_to_map.a = 1"}, []string{"scalar_to_map.a"}},
		"a scalar replaces a map":                 {"map_to_scalar: nearer\n", []string{"map_to_scalar = nearer"}, []string{"map_to_scalar"}},
		"a list replaces a map":                   {"map_to_list: [x]\n", []string{"map_to_list = [x]"}, []string{"map_to_list"}},
		"a map replaces a list":                   {"list_to_map: {a: 1}\n", []string{"list_to_map.a = 1"}, []string{"list_to_map.a"}},
		"an empty map over a map changes nothing": {"emptied: {}\n", []string{"emptied.a = 1", "emptied.b = 2"}, []string{}},
		"null is a scalar that replaces":          {"nulled: null\n", []string{"nulled = null"}, []string{"nulled"}},
		"an empty map is a leaf where it is new":  {"added: {}\n", []string{"added = {}"}, []string{"added"}},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			data, files, err := definition.Compose(definition.KindPolicy, []definition.LayerText{
				layer(definition.LayerRepository, "/w/.agister/policies/p.yaml", c.nearer),
				layer(definition.LayerHome, "/h/policies/p.yaml", home),
			})
			if err != nil {
				t.Fatal(err)
			}
			got := leaves(t, data)
			for _, want := range c.want {
				if !contains(got, want) {
					t.Errorf("composed lacks %q:\n%s", want, strings.Join(got, "\n"))
				}
			}
			// What the nearer layer does not name is home's, in home's place.
			if key, _, _ := strings.Cut(c.want[0], " "); key != "added" && len(got) > 0 && strings.HasPrefix(got[len(got)-1], "added") {
				t.Errorf("a key both hold moved: %v", got)
			}
			if !reflect.DeepEqual(files[0].Fields, c.fields) {
				t.Errorf("the nearer layer gave %v, want %v", files[0].Fields, c.fields)
			}
		})
	}
}

func contains(items []string, want string) bool {
	for _, item := range items {
		if item == want {
			return true
		}
	}
	return false
}

// ADR-028 rule 4: a TOML table is a map and an array a list, an array of
// tables included. The composition is a TOML document its kind's parser
// reads.
func TestComposeComposesTOMLTables(t *testing.T) {
	t.Parallel()
	const home = `schema = "agister.agent/v1alpha1"
name = "reviewer"
runtime = "claude"
skills = ["review", "style"]

[limits]
timeout = "10m"
attempts = 2

[[steps]]
name = "first"

[[steps]]
name = "second"
`
	const repository = `effort = "high"
skills = ["tests"]

[limits]
attempts = 3

[[steps]]
name = "only"
`
	data, files, err := definition.Compose(definition.KindAgent, []definition.LayerText{
		layer(definition.LayerRepository, "/w/.agister/agents/reviewer.toml", repository),
		layer(definition.LayerHome, "/h/agents/reviewer.toml", home),
	})
	if err != nil {
		t.Fatal(err)
	}
	var got map[string]any
	if _, err := toml.Decode(string(data), &got); err != nil {
		t.Fatalf("the composition is not TOML: %v\n%s", err, data)
	}
	want := map[string]any{
		"schema": "agister.agent/v1alpha1", "name": "reviewer", "runtime": "claude", "effort": "high",
		"skills": []any{"tests"},
		"limits": map[string]any{"timeout": "10m", "attempts": int64(3)},
		"steps":  []map[string]any{{"name": "only"}},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("composed = %#v\n%s", got, data)
	}
	if want := []string{"effort", "skills", "limits.attempts", "steps"}; !reflect.DeepEqual(files[0].Fields, want) {
		t.Errorf("the repository gave %v, want %v", files[0].Fields, want)
	}
	if want := []string{"schema", "name", "runtime", "limits.timeout"}; !reflect.DeepEqual(files[1].Fields, want) {
		t.Errorf("home gave %v, want %v", files[1].Fields, want)
	}
}

// A document one layer alone holds is that layer's file, byte for byte,
// whatever it holds: its comments, its anchors, and a text that is no
// mapping, which its kind's parser reports as it does today (ADR-028 rule
// 5). So every whole document composes to itself.
func TestComposeLeavesADocumentOfOneLayerUnchanged(t *testing.T) {
	t.Parallel()
	for name, c := range map[string]struct {
		text   string
		fields []string
	}{
		"a mapping":      {"# a comment\nbase: &base {a: 1}\nother: *base\n", []string{}},
		"plain fields":   {"# a comment\nname: p   # kept\nlist: [a]\n", []string{"name", "list"}},
		"not a mapping":  {"- a\n- b\n", []string{}},
		"not YAML":       {"name: [unclosed\n", []string{}},
		"an empty file":  {"", []string{}},
		"a repeated key": {"name: a\nname: b\n", []string{}},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			data, files, err := definition.Compose(definition.KindPolicy, []definition.LayerText{layer(definition.LayerHome, "/h/policies/p.yaml", c.text)})
			if err != nil || string(data) != c.text {
				t.Fatalf("composed %q, %v; want the file unchanged", data, err)
			}
			if len(files) != 1 || files[0].Layer != definition.LayerHome || files[0].Path != "/h/policies/p.yaml" || !reflect.DeepEqual(files[0].Fields, c.fields) {
				t.Fatalf("files = %+v, want fields %v", files, c.fields)
			}
		})
	}
	if _, _, err := definition.Compose(definition.KindPolicy, nil); !errors.Is(err, definition.ErrNotFound) {
		t.Fatalf("no layer: %v", err)
	}
}

// ADR-028 rule 5: a layer file that cannot be parsed, or is not one map,
// breaks the document; it is not skipped in favour of the parent's, and the
// error names it.
func TestComposeIsBrokenByALayerFileThatIsNotOneMap(t *testing.T) {
	t.Parallel()
	const whole = "schema: agister.policy/v1alpha1\nname: p\n"
	for name, c := range map[string]struct {
		kind    definition.Kind
		broken  string
		message string
	}{
		"not YAML":        {definition.KindPolicy, "name: [unclosed\n", ""},
		"a list":          {definition.KindPolicy, "- a\n", "a layer's file must be a mapping"},
		"a scalar":        {definition.KindPolicy, "just text\n", "a layer's file must be a mapping"},
		"two documents":   {definition.KindPolicy, "a: 1\n---\nb: 2\n", ""},
		"a repeated key":  {definition.KindPolicy, "limits: {a: 1, a: 2}\n", "limits.a: is declared more than once"},
		"an alias":        {definition.KindPolicy, "base: &base {a: 1}\nother: *base\n", "holds a YAML alias (*base)"},
		"not TOML":        {definition.KindAgent, "name = \n", ""},
		"an empty layer ": {definition.KindPolicy, "", ""},
	} {
		for _, at := range []string{"nearer", "farther"} {
			t.Run(name+" in the "+at+" layer", func(t *testing.T) {
				t.Parallel()
				sound := whole
				if c.kind == definition.KindAgent {
					sound = "name = \"a\"\n"
				}
				texts := []definition.LayerText{layer(definition.LayerRepository, "/w/.agister/x", c.broken), layer(definition.LayerHome, "/h/x", sound)}
				path := "/w/.agister/x"
				if at == "farther" {
					texts = []definition.LayerText{layer(definition.LayerRepository, "/w/.agister/x", sound), layer(definition.LayerHome, "/h/x", c.broken)}
					path = "/h/x"
				}
				data, files, err := definition.Compose(c.kind, texts)
				if err == nil || data != nil || !strings.HasPrefix(err.Error(), path+": ") || !strings.Contains(err.Error(), c.message) {
					t.Fatalf("composed %q, %v; want an error of %s holding %q", data, err, path, c.message)
				}
				if len(files) != 2 || files[0].Path != "/w/.agister/x" || files[1].Path != "/h/x" {
					t.Fatalf("files = %+v", files)
				}
			})
		}
	}
}

// ADR-028 rule 5: every rule of a document is checked on the composition,
// and a problem names the layer file that set the field at fault; a
// required field no layer sets names every layer file read. A document one
// file holds is reported as before: its subject names that file.
func TestProblemsOfAComposedDocumentNameTheLayerFileAtFault(t *testing.T) {
	t.Parallel()
	const home = `schema: agister.process/v1alpha1
name: p
type: process
prompt: review
uses: agent:a
input:
  instruction: Do it.
  values:
    candidate_revision: {source: git.revision, rev: HEAD}
output:
  format: text
`
	composed := func(t *testing.T, repository, home string) definition.Document {
		t.Helper()
		data, files, err := definition.Compose(definition.KindProcess, []definition.LayerText{
			layer(definition.LayerRepository, "/w/.agister/processes/p.yaml", repository),
			layer(definition.LayerHome, "/h/processes/p.yaml", home),
		})
		if err != nil {
			t.Fatal(err)
		}
		return definition.Document{
			Source: definition.Source{Kind: definition.KindProcess, Name: "p", Path: files[0].Path, Layer: files[0].Layer, Layers: files},
			Bytes:  data,
		}
	}
	messages := func(t *testing.T, doc definition.Document) []string {
		t.Helper()
		_, err := definition.ParseProcess(doc)
		var invalid *definition.InvalidError
		if !errors.As(err, &invalid) {
			t.Fatalf("parsed: %v", err)
		}
		var found []string
		for _, problem := range invalid.Problems {
			found = append(found, problem.Message)
		}
		return found
	}

	// The two layers compose to a document that parses: neither is whole.
	if process, err := definition.ParseProcess(composed(t, "uses: agent:b\n", home)); err != nil || process.Agent != "b" {
		t.Fatalf("composed process = %+v, %v", process, err)
	}
	for name, c := range map[string]struct {
		repository, home string
		want             string
	}{
		"set in the nearer layer": {"uses: nobody\n", home,
			`uses: must be "agent:<name>" (set in /w/.agister/processes/p.yaml)`},
		"set in the farther layer": {"policy: process-policy:strict\n", strings.Replace(home, "type: process", "type: workflow", 1),
			`type: must be "process" (set in /h/processes/p.yaml)`},
		"a field under a map two layers fill": {"input:\n  values:\n    candidate_revision: {rev: [HEAD]}\n", home,
			"input.values.candidate_revision.rev: must be a scalar (set in /w/.agister/processes/p.yaml)"},
		"a required field no layer sets": {"policy: process-policy:strict\n", strings.Replace(home, "uses: agent:a\n", "", 1),
			"uses: is required (no layer sets it: /w/.agister/processes/p.yaml, /h/processes/p.yaml)"},
		// The empty map the nearer layer gave is a leaf above the field: it
		// sets no field below it.
		"a required field under an empty map a layer gives": {"output: {}\n", strings.Replace(home, "output:\n  format: text\n", "", 1),
			"output.format: is required (no layer sets it: /w/.agister/processes/p.yaml, /h/processes/p.yaml)"},
		"an unknown field, whichever layer sets it": {"future: enabled\n", home,
			"future: unknown field (set in /w/.agister/processes/p.yaml)"},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			if got := messages(t, composed(t, c.repository, c.home)); !contains(got, c.want) {
				t.Fatalf("problems %q lack %q", got, c.want)
			}
		})
	}

	whole, files, err := definition.Compose(definition.KindProcess, []definition.LayerText{layer(definition.LayerHome, "/h/processes/p.yaml", strings.Replace(home, "uses: agent:a", "uses: nobody", 1))})
	if err != nil {
		t.Fatal(err)
	}
	alone := definition.Document{Source: definition.Source{Kind: definition.KindProcess, Name: "p", Path: "/h/processes/p.yaml", Layer: definition.LayerHome, Layers: files}, Bytes: whole}
	if got := messages(t, alone); !contains(got, `uses: must be "agent:<name>"`) {
		t.Fatalf("a document of one layer: problems %q", got)
	}
}

// ADR-028 rule 4: what writing a document to the home layer would make of
// a composed document is composed from its nearer layers' files as they
// are, with the written document in place of home's file, or beneath them
// where the home layer holds none.
func TestWithHomeComposesTheWrittenDocumentBeneathTheNearerLayers(t *testing.T) {
	t.Parallel()
	nearer := layer(definition.LayerRepository, "/w/.agister/processes/p.yaml", "uses: agent:b\n")
	held := layer(definition.LayerHome, "/h/processes/p.yaml", "name: p\nuses: agent:a\ntype: process\n")
	written := layer(definition.LayerHome, "/h/processes/p.yaml", "name: p\nuses: agent:a\ntype: workflow\npolicy: x\n")
	const want = "name: p\nuses: agent:b\ntype: workflow\npolicy: x\n"
	data, files, err := definition.Compose(definition.KindProcess, []definition.LayerText{nearer, held})
	if err != nil {
		t.Fatal(err)
	}
	source := definition.Source{Kind: definition.KindProcess, Name: "p", Layer: definition.LayerRepository, Path: nearer.File.Path, Layers: files}
	for name, doc := range map[string]definition.Document{
		"over home's file": {Source: source, Bytes: data, Texts: []definition.LayerText{nearer, held}},
		"where home holds none": {
			Source: definition.Source{Kind: definition.KindProcess, Name: "p", Layer: definition.LayerRepository, Path: nearer.File.Path, Layers: files[:1]},
			Bytes:  nearer.Bytes, Texts: []definition.LayerText{nearer},
		},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			got, err := definition.WithHome(doc, written)
			if err != nil || string(got.Bytes) != want {
				t.Fatalf("with home = %q, %v; want %q", got.Bytes, err, want)
			}
			digest := sha256.Sum256([]byte(want))
			layers := []definition.LayerFile{
				{Layer: definition.LayerRepository, Path: nearer.File.Path, SHA256: nearer.File.SHA256, Fields: []string{"uses"}},
				{Layer: definition.LayerHome, Path: written.File.Path, SHA256: written.File.SHA256, Fields: []string{"name", "type", "policy"}},
			}
			wantSource := definition.Source{
				Kind: definition.KindProcess, Name: "p", Layer: definition.LayerRepository, Path: nearer.File.Path,
				SHA256: hex.EncodeToString(digest[:]), Layers: layers,
			}
			if !reflect.DeepEqual(got.Source, wantSource) {
				t.Fatalf("source = %+v\nwant     %+v", got.Source, wantSource)
			}
			texts := []definition.LayerText{{File: layers[0], Bytes: nearer.Bytes}, {File: layers[1], Bytes: written.Bytes}}
			if !reflect.DeepEqual(got.Texts, texts) {
				t.Fatalf("texts = %+v\nwant    %+v", got.Texts, texts)
			}
		})
	}
}
