package documents

import (
	"fmt"
	"reflect"
	"strings"
	"testing"
)

// tree is a map node of pairs, a key then its value: a *node, or a leaf's
// value.
func tree(pairs ...any) *node {
	n := &node{isMap: true}
	for i := 0; i < len(pairs); i += 2 {
		value, ok := pairs[i+1].(*node)
		if !ok {
			value = &node{value: pairs[i+1]}
		}
		n.entries = append(n.entries, entry{key: pairs[i].(string), value: value})
	}
	return n
}

var (
	farther = Origin{Document: "base", Layer: Home, Path: "/home/.agister/processes/base.yaml"}
	nearer  = Origin{Document: "review", Layer: Project, Path: "/repo/app/.agister/processes/review.yaml"}
)

// stamped is n with origin given to it and everything under it.
func stamped(origin Origin, n *node) *node {
	if n != nil {
		n.stamp(origin)
	}
	return n
}

// traced writes each field of n as "path = value  {document layer path}",
// with where it came from.
func traced(n *node) []string {
	var lines []string
	for _, field := range n.fields(nil, nil) {
		lines = append(lines, fmt.Sprintf("%s = %v  %v", strings.Join(field.Path, "."), field.Value, field.Origin))
	}
	return lines
}

// Each field of the merged tree has its value from the tree that gave it
// and names that tree's file, whichever kind of value replaced which.
func TestMergedComposesFieldByField(t *testing.T) {
	t.Parallel()
	f, n := fmt.Sprint(farther), fmt.Sprint(nearer)
	cases := []struct {
		name       string
		base, over *node
		want       []string
	}{
		{
			"maps merge by key at every depth",
			tree("a", tree("b", 1, "c", tree("d", 2, "e", 3))),
			tree("a", tree("c", tree("e", 4))),
			[]string{"a.b = 1  " + f, "a.c.d = 2  " + f, "a.c.e = 4  " + n},
		},
		{
			"a scalar replaces",
			tree("a", 1, "b", 2),
			tree("a", 3),
			[]string{"a = 3  " + n, "b = 2  " + f},
		},
		{
			"a list replaces whole, its items never merged",
			tree("a", []any{"x", "y", map[string]any{"k": 1}}),
			tree("a", []any{map[string]any{"k": 2}}),
			[]string{"a = [map[k:2]]  " + n},
		},
		{
			"a map replaces a scalar",
			tree("a", 1),
			tree("a", tree("b", 2)),
			[]string{"a.b = 2  " + n},
		},
		{
			"a scalar replaces a map",
			tree("a", tree("b", 2)),
			tree("a", 1),
			[]string{"a = 1  " + n},
		},
		{
			"a list replaces a map",
			tree("a", tree("b", 2)),
			tree("a", []any{"x"}),
			[]string{"a = [x]  " + n},
		},
		{
			"a map replaces a list",
			tree("a", []any{"x"}),
			tree("a", tree("b", 2)),
			[]string{"a.b = 2  " + n},
		},
		{
			"a map with no keys replaces a scalar",
			tree("a", 1),
			tree("a", tree()),
			[]string{"a = map[]  " + n},
		},
		{
			"a map with no keys over a map changes nothing",
			tree("a", tree("b", 2)),
			tree("a", tree()),
			[]string{"a.b = 2  " + f},
		},
		{
			"a nearer key comes after the farther keys",
			tree("b", 1, "a", 2),
			tree("c", 3, "a", 4),
			[]string{"b = 1  " + f, "a = 4  " + n, "c = 3  " + n},
		},
		{
			"over nothing is over",
			nil,
			tree("a", 1),
			[]string{"a = 1  " + n},
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			got := traced(merged(stamped(farther, c.base), stamped(nearer, c.over)))
			if !reflect.DeepEqual(got, c.want) {
				t.Errorf("merged\n got %q\nwant %q", got, c.want)
			}
		})
	}
}

func TestMergedChangesNeitherTree(t *testing.T) {
	t.Parallel()
	base := stamped(farther, tree("a", tree("b", 1), "c", 2))
	over := stamped(nearer, tree("a", tree("d", 3), "e", 4))
	merged(base, over)
	if got, want := traced(base), []string{"a.b = 1  " + fmt.Sprint(farther), "c = 2  " + fmt.Sprint(farther)}; !reflect.DeepEqual(got, want) {
		t.Errorf("base\n got %q\nwant %q", got, want)
	}
	if got, want := traced(over), []string{"a.d = 3  " + fmt.Sprint(nearer), "e = 4  " + fmt.Sprint(nearer)}; !reflect.DeepEqual(got, want) {
		t.Errorf("over\n got %q\nwant %q", got, want)
	}
}
