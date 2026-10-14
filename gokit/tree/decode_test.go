package tree_test

import (
	"fmt"
	"slices"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/gokit/tree"
)

// The scenarios of tree.feature's section "Decode: values": what each
// node holds, whatever its origin.

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
