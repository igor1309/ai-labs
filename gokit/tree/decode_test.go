package tree_test

import (
	"fmt"
	"maps"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/BurntSushi/toml"
	"github.com/igor1309/ai-labs/gokit/tree"
	"gopkg.in/yaml.v3"
)

// The scenarios of tree.feature's sections "Decode": what each node holds,
// whatever its origin, and where each node came from.

// Decode: values

// values is every node of n, one a line: its place, its kind and its value
// when it is a scalar. Map keys come sorted, so equal values list equal.
func values(n tree.Node) []string {
	var lines []string
	var walk func(place string, n tree.Node)
	walk = func(place string, n tree.Node) {
		line := fmt.Sprintf("%s %s", place, n.Kind())
		switch n.Kind() {
		case tree.String:
			text, _ := n.Text()
			line += fmt.Sprintf(" %q", text)
		case tree.Integer:
			i, _ := n.Integer()
			line += fmt.Sprintf(" %d", i)
		case tree.Number:
			f, _ := n.Number()
			line += fmt.Sprintf(" %g", f)
		case tree.Boolean:
			b, _ := n.Boolean()
			line += fmt.Sprintf(" %t", b)
		}
		lines = append(lines, line)
		for i, item := range n.Items() {
			walk(fmt.Sprintf("%s[%d]", place, i), item)
		}
		for _, key := range n.Keys() {
			value, _ := n.Get(key)
			walk(place+"."+key, value)
		}
	}
	walk("", n)
	return lines
}

// assertDecodes decodes data in format and fails unless it gives the
// values want and no problem.
func assertDecodes(t *testing.T, format tree.Format, data string, want ...string) {
	t.Helper()
	got, problems := tree.Decode(format, []byte(data), "/a/v."+strings.ToLower(format.String()))
	if len(problems) > 0 {
		t.Fatalf("problems %v, want none", problems)
	}
	if lines := values(got); !slices.Equal(lines, want) {
		t.Fatalf("values:\n%s\nwant:\n%s", strings.Join(lines, "\n"), strings.Join(want, "\n"))
	}
}

func TestAScalarDecodesToItsValue(t *testing.T) {
	t.Parallel()
	for _, c := range []struct {
		format tree.Format
		data   string
		want   string
	}{
		{tree.YAML, "a: text", `.a string "text"`},
		{tree.YAML, `a: "3"`, `.a string "3"`},
		{tree.YAML, "a: 20m", `.a string "20m"`},
		{tree.YAML, "a: 3", ".a integer 3"},
		{tree.YAML, "a: 2.5", ".a number 2.5"},
		{tree.YAML, "a: true", ".a boolean true"},
		{tree.TOML, `a = "text"`, `.a string "text"`},
		{tree.TOML, `a = "3"`, `.a string "3"`},
		{tree.TOML, "a = 3", ".a integer 3"},
		{tree.TOML, "a = 2.5", ".a number 2.5"},
		{tree.TOML, "a = true", ".a boolean true"},
	} {
		t.Run(c.format.String()+" "+c.data, func(t *testing.T) {
			t.Parallel()
			assertDecodes(t, c.format, c.data, " map", c.want)
		})
	}
}

func TestMapsAndListsNest(t *testing.T) {
	t.Parallel()
	assertDecodes(t, tree.YAML, `a:
  b: [x, y]
  c:
    d: 2
  e:
    - f: 1
  g: []
  h: {}
`,
		" map",
		".a map",
		".a.b list",
		`.a.b[0] string "x"`,
		`.a.b[1] string "y"`,
		".a.c map",
		".a.c.d integer 2",
		".a.e list",
		".a.e[0] map",
		".a.e[0].f integer 1",
		".a.g list",
		".a.h map",
	)
}

func TestTOMLAndYAMLOfTheSameValuesDecodeToTheSameValues(t *testing.T) {
	t.Parallel()
	want := []string{
		" map",
		`.a string "x"`,
		".b list",
		`.b[0] string "y"`,
		`.b[1] string "z"`,
		".c map",
		".c.d integer 2",
	}
	for _, c := range []struct {
		format tree.Format
		data   string
	}{
		{tree.YAML, "a: x\nb: [y, z]\nc:\n  d: 2\n"},
		{tree.TOML, "a = \"x\"\nb = [\"y\", \"z\"]\n[c]\nd = 2\n"},
	} {
		t.Run(c.format.String(), func(t *testing.T) {
			t.Parallel()
			assertDecodes(t, c.format, c.data, want...)
		})
	}
}

func TestATreesTopIsAnyValue(t *testing.T) {
	t.Parallel()
	for _, c := range []struct {
		data string
		want []string
	}{
		{"- a: x", []string{" list", "[0] map", `[0].a string "x"`}},
		{"text", []string{` string "text"`}},
	} {
		t.Run(c.data, func(t *testing.T) {
			t.Parallel()
			assertDecodes(t, tree.YAML, c.data, c.want...)
		})
	}
}

func TestBytesThatHoldNoValueAreAnEmptyTree(t *testing.T) {
	t.Parallel()
	for _, c := range []struct {
		format tree.Format
		path   string
		data   string
	}{
		{tree.YAML, "/a/empty.yaml", ""},
		{tree.YAML, "/a/empty.yaml", "# a comment"},
		{tree.TOML, "/a/empty.toml", ""},
		{tree.TOML, "/a/empty.toml", "# a comment"},
	} {
		t.Run(fmt.Sprintf("%s %q", c.format, c.data), func(t *testing.T) {
			t.Parallel()
			got, problems := tree.Decode(c.format, []byte(c.data), c.path)
			if len(problems) > 0 {
				t.Fatalf("problems %v, want none", problems)
			}
			if got.Kind() != tree.Empty || got.Origin() != (tree.Origin{}) {
				t.Errorf("tree %s from %+v, want the empty tree", got.Kind(), got.Origin())
			}
		})
	}
}

// Decode: origins

// origins is the origin of every node of n, by its place: "the top", or
// as "items[0].name".
func origins(n tree.Node) map[string]tree.Origin {
	got := map[string]tree.Origin{}
	var walk func(place string, n tree.Node)
	walk = func(place string, n tree.Node) {
		if place == "" {
			got["the top"] = n.Origin()
		} else {
			got[place] = n.Origin()
		}
		for i, item := range n.Items() {
			walk(fmt.Sprintf("%s[%d]", place, i), item)
		}
		for _, key := range n.Keys() {
			value, _ := n.Get(key)
			if place == "" {
				walk(key, value)
			} else {
				walk(place+"."+key, value)
			}
		}
	}
	walk("", n)
	return got
}

// assertOrigins decodes data in format from path and fails unless it gives
// no problem and every node has the origin want gives it, and no other
// node is there. It is the tree decoded.
func assertOrigins(t *testing.T, format tree.Format, data, path string, want map[string]tree.Origin) tree.Node {
	t.Helper()
	got, problems := tree.Decode(format, []byte(data), path)
	if len(problems) > 0 {
		t.Fatalf("problems %v, want none", problems)
	}
	if origins := origins(got); !maps.Equal(origins, want) {
		t.Fatalf("origins %v, want %v", origins, want)
	}
	return got
}

func TestEveryYAMLNodeKeepsItsPathAndLine(t *testing.T) {
	t.Parallel()
	at := func(line int) tree.Origin { return tree.Origin{Path: "/a/v.yaml", Line: line} }
	assertOrigins(t, tree.YAML, `size: 20m
items:
  - name: a
  - name: b
`, "/a/v.yaml", map[string]tree.Origin{
		"the top":       at(1),
		"size":          at(1),
		"items":         at(2),
		"items[0]":      at(3),
		"items[0].name": at(3),
		"items[1]":      at(4),
		"items[1].name": at(4),
	})
}

func TestEveryTOMLNodeKeepsItsPathAndHasNoLine(t *testing.T) {
	t.Parallel()
	path := tree.Origin{Path: "/a/v.toml"}
	assertOrigins(t, tree.TOML, `size = "20m"

[shape]
width = 2
`, "/a/v.toml", map[string]tree.Origin{
		"the top":     path,
		"size":        path,
		"shape":       path,
		"shape.width": path,
	})
}

// Every scalar kind keeps its origin in either format, as a key's value
// and as a list's item: in YAML the line of its key or of its item, in
// TOML the path alone.
func TestEveryScalarKindKeepsItsOrigin(t *testing.T) {
	t.Parallel()
	scalars := []struct {
		// want is the scalar as values lists it, and written as each format
		// writes it.
		want    string
		written map[tree.Format]string
	}{
		{`string "text"`, map[tree.Format]string{tree.YAML: "text", tree.TOML: `"text"`}},
		{`string "3"`, map[tree.Format]string{tree.YAML: `"3"`, tree.TOML: `"3"`}},
		{"integer 3", map[tree.Format]string{tree.YAML: "3", tree.TOML: "3"}},
		{"number 2.5", map[tree.Format]string{tree.YAML: "2.5", tree.TOML: "2.5"}},
		{"boolean true", map[tree.Format]string{tree.YAML: "true", tree.TOML: "true"}},
	}
	formats := []struct {
		format tree.Format
		path   string
		// layout is bytes holding value as "a" and as "b"'s item, each on
		// a line of its own, and lines the line each node has.
		layout func(value string) string
		lines  map[string]int
	}{
		{
			tree.YAML, "/a/v.yaml",
			func(value string) string { return fmt.Sprintf("a: %[1]s\nb:\n  - %[1]s\n", value) },
			map[string]int{"the top": 1, "a": 1, "b": 2, "b[0]": 3},
		},
		{
			tree.TOML, "/a/v.toml",
			func(value string) string { return fmt.Sprintf("a = %[1]s\nb = [\n  %[1]s,\n]\n", value) },
			map[string]int{"the top": 0, "a": 0, "b": 0, "b[0]": 0},
		},
	}
	for _, f := range formats {
		for _, s := range scalars {
			t.Run(f.format.String()+" "+s.want, func(t *testing.T) {
				t.Parallel()
				want := map[string]tree.Origin{}
				for place, line := range f.lines {
					want[place] = tree.Origin{Path: f.path, Line: line}
				}
				got := assertOrigins(t, f.format, f.layout(s.written[f.format]), f.path, want)
				wantValues := []string{" map", ".a " + s.want, ".b list", ".b[0] " + s.want}
				if lines := values(got); !slices.Equal(lines, wantValues) {
					t.Errorf("values:\n%s\nwant:\n%s", strings.Join(lines, "\n"), strings.Join(wantValues, "\n"))
				}
			})
		}
	}
}

// A YAML node's line is its key's, wherever its value is written below
// it, and the top's is 1, whatever comes before its value: the lines the
// parser gives the values are not the origins.
func TestANodesLineIsItsKeysAndTheTopsIs1(t *testing.T) {
	t.Parallel()
	for _, c := range []struct {
		name   string
		format tree.Format
		data   string
		lines  map[string]int
	}{
		{"a string below its key", tree.YAML, "a:\n  text\n", map[string]int{"the top": 1, "a": 1}},
		{"a quoted string below its key", tree.YAML, "a:\n  \"3\"\n", map[string]int{"the top": 1, "a": 1}},
		{"an integer below its key", tree.YAML, "a:\n  3\n", map[string]int{"the top": 1, "a": 1}},
		{"a number below its key", tree.YAML, "a:\n  2.5\n", map[string]int{"the top": 1, "a": 1}},
		{"a boolean below its key", tree.YAML, "a:\n  true\n", map[string]int{"the top": 1, "a": 1}},
		{"a value below a blank line and a comment", tree.YAML, "a:\n\n  # c\n  3\n", map[string]int{"the top": 1, "a": 1}},
		{"a value below a nested key", tree.YAML, "a:\n  b:\n    3\n", map[string]int{"the top": 1, "a": 1, "a.b": 2}},
		{"a value below its key in a list's item", tree.YAML, "- a:\n    3\n", map[string]int{"the top": 1, "[0]": 1, "[0].a": 1}},
		{"a map after a leading comment", tree.YAML, "# c\na: 1\n", map[string]int{"the top": 1, "a": 2}},
		{"a map after leading blank lines", tree.YAML, "\n\na: 1\n", map[string]int{"the top": 1, "a": 3}},
		{"a list after a comment and a blank line", tree.YAML, "# c\n\n- x\n", map[string]int{"the top": 1, "[0]": 3}},
		{"a scalar after a leading comment", tree.YAML, "# c\ntext\n", map[string]int{"the top": 1}},
		{"a TOML table after a comment and a blank line", tree.TOML, "# c\n\na = 1\n", map[string]int{"the top": 0, "a": 0}},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			path := "/a/v." + strings.ToLower(c.format.String())
			want := map[string]tree.Origin{}
			for place, line := range c.lines {
				want[place] = tree.Origin{Path: path, Line: line}
			}
			assertOrigins(t, c.format, c.data, path, want)
		})
	}
}

// The path names a file of the other format's extension in a temporary
// directory, either holding other values in the format its extension
// names or not there: decode reads neither the file nor the format from
// the path, and the bytes it is given are the tree.
//
// Contract test: the filesystem, a file at the path decode is given.
func TestDecodeKeepsThePathItIsGivenAndReadsNothingFromIt(t *testing.T) {
	t.Parallel()
	for _, c := range []struct {
		format tree.Format
		data   string
		// name is the file's, and file what it holds when it is there.
		name, file string
		line       int
	}{
		{tree.YAML, "a: [x]", "v.toml", "a = [\"y\"]\nb = 1\n", 1},
		{tree.TOML, `a = ["x"]`, "v.yaml", "a: [y]\nb: 1\n", 0},
	} {
		for _, there := range []bool{true, false} {
			t.Run(fmt.Sprintf("%s from %s, there: %t", c.format, c.name, there), func(t *testing.T) {
				t.Parallel()
				path := filepath.Join(t.TempDir(), c.name)
				if there {
					if err := os.WriteFile(path, []byte(c.file), 0o600); err != nil {
						t.Fatal(err)
					}
				}
				at := tree.Origin{Path: path, Line: c.line}
				got := assertOrigins(t, c.format, c.data, path, map[string]tree.Origin{
					"the top": at,
					"a":       at,
					"a[0]":    at,
				})
				want := []string{" map", ".a list", `.a[0] string "x"`}
				if lines := values(got); !slices.Equal(lines, want) {
					t.Errorf("values:\n%s\nwant:\n%s", strings.Join(lines, "\n"), strings.Join(want, "\n"))
				}
			})
		}
	}
}

// Decode: problems

// assertProblems decodes data in format from path and fails unless it
// gives no tree and exactly the problems want, in their order. It is the
// problems decoded.
func assertProblems(t *testing.T, format tree.Format, data, path string, want ...tree.Problem) []tree.Problem {
	t.Helper()
	got, problems := tree.Decode(format, []byte(data), path)
	if !slices.Equal(problems, want) {
		t.Errorf("problems %+v, want %+v", problems, want)
	}
	if got.Kind() != tree.Empty || got.Origin() != (tree.Origin{}) {
		t.Errorf("tree %s from %+v, want none", got.Kind(), got.Origin())
	}
	return problems
}

// The problem is the parser's own error, at the bytes as a whole, and
// says the path.
func TestBytesThatCannotBeParsedAreAProblem(t *testing.T) {
	t.Parallel()
	for _, c := range []struct {
		format tree.Format
		path   string
		data   string
		parse  func(data string) error
	}{
		{tree.YAML, "/a/bad.yaml", "a: [b", func(data string) error {
			return yaml.Unmarshal([]byte(data), &yaml.Node{})
		}},
		{tree.TOML, "/a/bad.toml", `a = [ "b"`, func(data string) error {
			_, err := toml.Decode(data, &map[string]any{})
			return err
		}},
	} {
		t.Run(c.format.String(), func(t *testing.T) {
			t.Parallel()
			err := c.parse(c.data)
			if err == nil {
				t.Fatalf("the parser takes %q", c.data)
			}
			problems := assertProblems(t, c.format, c.data, c.path, tree.Problem{Origin: tree.Origin{Path: c.path}, Message: err.Error()})
			if want := c.path + ": " + err.Error(); len(problems) == 1 && problems[0].String() != want {
				t.Errorf("problem %q, want %q", problems[0], want)
			}
		})
	}
}

// Any document after the first is a problem, whatever it holds; a single
// document is none, its start marked or not.
func TestASecondYAMLDocumentIsAProblem(t *testing.T) {
	t.Parallel()
	more := tree.Problem{Origin: tree.Origin{Path: "/a/two.yaml"}, Message: "the bytes hold more than one document"}
	for _, c := range []struct {
		name string
		data string
		want []tree.Problem
	}{
		{"a second map", "a: 1\n---\nb: 2\n", []tree.Problem{more}},
		{"a second empty document", "a: 1\n---\n", []tree.Problem{more}},
		{"a second and a third", "a: 1\n---\nb: 2\n---\nc: 3\n", []tree.Problem{more}},
		{"a second of another kind", "a: 1\n---\n- b\n", []tree.Problem{more}},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			assertProblems(t, tree.YAML, c.data, "/a/two.yaml", c.want...)
		})
	}
	for _, data := range []string{"---\na: 1\n", "a: 1\n...\n", "---\na: 1\n...\n"} {
		t.Run(fmt.Sprintf("one document %q", data), func(t *testing.T) {
			t.Parallel()
			assertDecodes(t, tree.YAML, data, " map", ".a integer 1")
		})
	}
}

// A null over a value would unset it, and nothing unsets.
func TestAKeyWithNoValueIsAProblem(t *testing.T) {
	t.Parallel()
	for _, data := range []string{"a: {b: }", "a: {b: null}", "a: {b: ~}"} {
		t.Run(data, func(t *testing.T) {
			t.Parallel()
			assertProblems(t, tree.YAML, data, "/a/v.yaml", tree.Problem{
				Place:   "a.b",
				Origin:  tree.Origin{Path: "/a/v.yaml", Line: 1},
				Message: "the key has no value",
			})
		})
	}
}

// Every kind of TOML date and time is a problem at its place.
func TestATOMLDateIsAProblem(t *testing.T) {
	t.Parallel()
	for _, data := range []string{
		"a = 2026-10-14",
		"a = 2026-10-14T07:32:00",
		"a = 2026-10-14T07:32:00Z",
		"a = 07:32:00",
	} {
		t.Run(data, func(t *testing.T) {
			t.Parallel()
			assertProblems(t, tree.TOML, data, "/a/v.toml", tree.Problem{
				Place:   "a",
				Origin:  tree.Origin{Path: "/a/v.toml"},
				Message: "a date is no value of a tree",
			})
		})
	}
}

// Decode goes on past a bad value: every one is a problem, in the order of
// the bytes for YAML, of the keys for TOML, whose parser keeps no order.
func TestEveryBadValueOfParsedBytesIsReported(t *testing.T) {
	t.Parallel()
	yamlAt := func(line int) tree.Origin { return tree.Origin{Path: "/a/v.yaml", Line: line} }
	tomlAt := tree.Origin{Path: "/a/v.toml"}
	date := "a date is no value of a tree"
	for _, c := range []struct {
		name   string
		format tree.Format
		data   string
		want   []tree.Problem
	}{
		{"two keys with no value", tree.YAML, "a:\nb:\n", []tree.Problem{
			{Place: "a", Origin: yamlAt(1), Message: "the key has no value"},
			{Place: "b", Origin: yamlAt(2), Message: "the key has no value"},
		}},
		{"bad values at every depth, between good ones", tree.YAML, "a:\n  b:\n  c: [1, ~, 2026-10-14]\nd: x\ne: ~\n", []tree.Problem{
			{Place: "a.b", Origin: yamlAt(2), Message: "the key has no value"},
			{Place: "a.c[1]", Origin: yamlAt(3), Message: "the item has no value"},
			{Place: "a.c[2]", Origin: yamlAt(3), Message: date},
			{Place: "e", Origin: yamlAt(5), Message: "the key has no value"},
		}},
		{"dates at every depth, between good values", tree.TOML, "z = 2026-10-14\nm = 1\nb = [2026-10-14]\n[a]\ny = 2026-10-14\nx = 2026-10-14\n", []tree.Problem{
			{Place: "a.x", Origin: tomlAt, Message: date},
			{Place: "a.y", Origin: tomlAt, Message: date},
			{Place: "b[0]", Origin: tomlAt, Message: date},
			{Place: "z", Origin: tomlAt, Message: date},
		}},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			path := "/a/v." + strings.ToLower(c.format.String())
			// Decoded again and again, as a TOML table's keys come in a new
			// order each time it is walked.
			for range 20 {
				assertProblems(t, c.format, c.data, path, c.want...)
			}
		})
	}
}

// What decode turns away beyond tree.feature's problems: a key that is no
// string, as a map's keys are strings; a key given twice, of which neither
// would win; an alias, whose value is written elsewhere than its origin;
// a YAML date, as a TOML one; and a format decode does not know.
func TestWhatIsNoValueOfATreeIsAProblemAtItsPlace(t *testing.T) {
	t.Parallel()
	at := func(line int) tree.Origin { return tree.Origin{Path: "/a/v.yaml", Line: line} }
	for _, c := range []struct {
		name   string
		format tree.Format
		data   string
		want   tree.Problem
	}{
		{"a key that is no string", tree.YAML, "a:\n  1: x", tree.Problem{Place: "a", Origin: at(2), Message: "a key must be a string"}},
		{"a key given twice", tree.YAML, "a: 1\na: 2", tree.Problem{Place: "a", Origin: at(2), Message: "the key is given more than once"}},
		{"an alias", tree.YAML, "a: &x 1\nb: *x", tree.Problem{Place: "b", Origin: at(2), Message: "an alias is no value of a tree"}},
		{"a YAML date", tree.YAML, "a: [2026-10-14]", tree.Problem{Place: "a[0]", Origin: at(1), Message: "a date is no value of a tree"}},
		{"an unknown format", tree.Format(0), "a: 1", tree.Problem{Origin: tree.Origin{Path: "/a/v.yaml"}, Message: "the format unknown is unknown"}},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			got, problems := tree.Decode(c.format, []byte(c.data), "/a/v.yaml")
			if len(problems) != 1 || problems[0] != c.want {
				t.Fatalf("problems %+v, want %+v", problems, c.want)
			}
			if got.Kind() != tree.Empty {
				t.Errorf("tree %s, want none", got.Kind())
			}
		})
	}
}

// A problem says where it is, with its line when it has one, its place
// when it is at a node, and what is wrong.
func TestAProblemSaysItsOriginPlaceAndMessage(t *testing.T) {
	t.Parallel()
	for _, c := range []struct {
		problem tree.Problem
		want    string
	}{
		{tree.Problem{Place: "a.b", Origin: tree.Origin{Path: "/a/v.yaml", Line: 3}, Message: "m"}, "/a/v.yaml:3: a.b: m"},
		{tree.Problem{Place: "a", Origin: tree.Origin{Path: "/a/v.toml"}, Message: "m"}, "/a/v.toml: a: m"},
		{tree.Problem{Origin: tree.Origin{Path: "/a/v.toml"}, Message: "m"}, "/a/v.toml: m"},
	} {
		t.Run(c.want, func(t *testing.T) {
			t.Parallel()
			if got := c.problem.String(); got != c.want {
				t.Errorf("%q, want %q", got, c.want)
			}
		})
	}
}
