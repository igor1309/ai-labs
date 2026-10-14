package documents

import "testing"

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

func TestMergedComposesFieldByField(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name       string
		base, over *node
		want       string
	}{
		{
			"maps merge by key at every depth",
			tree("a", tree("b", 1, "c", tree("d", 2, "e", 3))),
			tree("a", tree("c", tree("e", 4))),
			"{a: {b: 1, c: {d: 2, e: 4}}}",
		},
		{
			"a scalar replaces",
			tree("a", 1, "b", 2),
			tree("a", 3),
			"{a: 3, b: 2}",
		},
		{
			"a list replaces whole, its items never merged",
			tree("a", []any{"x", "y", map[string]any{"k": 1}}),
			tree("a", []any{map[string]any{"k": 2}}),
			"{a: [map[k:2]]}",
		},
		{
			"a map replaces a scalar",
			tree("a", 1),
			tree("a", tree("b", 2)),
			"{a: {b: 2}}",
		},
		{
			"a scalar replaces a map",
			tree("a", tree("b", 2)),
			tree("a", 1),
			"{a: 1}",
		},
		{
			"a map with no keys over a map changes nothing",
			tree("a", tree("b", 2)),
			tree("a", tree()),
			"{a: {b: 2}}",
		},
		{
			"a nearer key comes after the farther keys",
			tree("b", 1, "a", 2),
			tree("c", 3, "a", 4),
			"{b: 1, a: 4, c: 3}",
		},
		{
			"over nothing is over",
			nil,
			tree("a", 1),
			"{a: 1}",
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			if got := show(merged(c.base, c.over)); got != c.want {
				t.Errorf("merged\n got %s\nwant %s", got, c.want)
			}
		})
	}
}

func TestMergedChangesNeitherTree(t *testing.T) {
	t.Parallel()
	base := tree("a", tree("b", 1), "c", 2)
	over := tree("a", tree("d", 3), "e", 4)
	merged(base, over)
	if got, want := show(base), "{a: {b: 1}, c: 2}"; got != want {
		t.Errorf("base\n got %s\nwant %s", got, want)
	}
	if got, want := show(over), "{a: {d: 3}, e: 4}"; got != want {
		t.Errorf("over\n got %s\nwant %s", got, want)
	}
}
