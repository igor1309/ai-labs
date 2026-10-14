package tree_test

import (
	"testing"

	"github.com/igor1309/ai-labs/gokit/tree"
)

// The value type: what each node holds, and that nothing changes it once
// it is made.

// A scalar gives its value through its own getter and is no scalar of any
// other kind; a map, a list and the empty tree are no scalar at all. Each
// node's origin is the one it was made with, whether that origin has a
// line or not, whatever the node's kind.
func TestEachNodeIsTheScalarOfItsKindAloneAndKeepsItsOrigin(t *testing.T) {
	t.Parallel()
	type made struct {
		name   string
		node   tree.Node
		kind   tree.Kind
		value  any
		origin tree.Origin
	}
	cases := []made{{"the empty tree", tree.Node{}, tree.Empty, nil, tree.Origin{}}}
	for _, k := range []struct {
		name  string
		build func(tree.Origin) tree.Node
		kind  tree.Kind
		value any
	}{
		{"a string", func(o tree.Origin) tree.Node { return tree.NewString("text", o) }, tree.String, "text"},
		{"an empty string", func(o tree.Origin) tree.Node { return tree.NewString("", o) }, tree.String, ""},
		{"an integer", func(o tree.Origin) tree.Node { return tree.NewInteger(-3, o) }, tree.Integer, int64(-3)},
		{"a number", func(o tree.Origin) tree.Node { return tree.NewNumber(2.5, o) }, tree.Number, 2.5},
		{"a boolean true", func(o tree.Origin) tree.Node { return tree.NewBoolean(true, o) }, tree.Boolean, true},
		{"a boolean false", func(o tree.Origin) tree.Node { return tree.NewBoolean(false, o) }, tree.Boolean, false},
		{"a map", func(o tree.Origin) tree.Node { return mapOf(o, "a", integer(1, from("/m.yaml", 8))) }, tree.Map, nil},
		{"a list", func(o tree.Origin) tree.Node { return listOf(o, integer(1, from("/l.yaml", 10))) }, tree.List, nil},
	} {
		for _, o := range []struct {
			name   string
			origin tree.Origin
		}{
			{"with a line", from("/lined.yaml", 7)},
			{"without a line", from("/unlined.toml", 0)},
		} {
			cases = append(cases, made{k.name + " from an origin " + o.name, k.build(o.origin), k.kind, k.value, o.origin})
		}
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			if got := c.node.Kind(); got != c.kind {
				t.Errorf("kind %s, want %s", got, c.kind)
			}
			if got := c.node.Origin(); got != c.origin {
				t.Errorf("origin %+v, want %+v", got, c.origin)
			}
			type got struct {
				value any
				ok    bool
			}
			text, isText := c.node.Text()
			i, isInteger := c.node.Integer()
			f, isNumber := c.node.Number()
			b, isBoolean := c.node.Boolean()
			for kind, g := range map[tree.Kind]got{
				tree.String:  {text, isText},
				tree.Integer: {i, isInteger},
				tree.Number:  {f, isNumber},
				tree.Boolean: {b, isBoolean},
			} {
				switch {
				case kind == c.kind && !g.ok:
					t.Errorf("its %s getter says it is no %s", kind, kind)
				case kind == c.kind && g.value != c.value:
					t.Errorf("its %s is %v, want %v", kind, g.value, c.value)
				case kind != c.kind && g.ok:
					t.Errorf("its %s getter says it is a %s, holding %v", kind, kind, g.value)
				}
			}
		})
	}
}

// A node keeps its values and origins whatever is later written to the
// map or slice it was made from, or to the slice Items gave.
func TestAWriteToACollectionHandedInOrOutLeavesTheNode(t *testing.T) {
	t.Parallel()
	mapWith := func(write func(entries map[string]tree.Node)) tree.Node {
		entries := map[string]tree.Node{"a": integer(1, o(2))}
		n := tree.NewMap(entries, o(1))
		write(entries)
		return n
	}
	mapped := []string{" map /o.yaml:1", ".a integer 1 /o.yaml:2"}
	listed := []string{" list /o.yaml:1", "[0] integer 1 /o.yaml:2"}
	for _, c := range []struct {
		name string
		node func() tree.Node
		want []string
	}{
		{"a value of NewMap's entries replaced", func() tree.Node {
			return mapWith(func(entries map[string]tree.Node) { entries["a"] = integer(2, u(9)) })
		}, mapped},
		{"a key added to NewMap's entries", func() tree.Node {
			return mapWith(func(entries map[string]tree.Node) { entries["b"] = integer(2, u(9)) })
		}, mapped},
		{"a key deleted from NewMap's entries", func() tree.Node {
			return mapWith(func(entries map[string]tree.Node) { delete(entries, "a") })
		}, mapped},
		{"an item of NewList's items replaced", func() tree.Node {
			items := []tree.Node{integer(1, o(2))}
			n := tree.NewList(items, o(1))
			items[0] = integer(2, u(9))
			return n
		}, listed},
		{"an item of the slice Items gave replaced", func() tree.Node {
			n := tree.NewList([]tree.Node{integer(1, o(2))}, o(1))
			n.Items()[0] = integer(2, u(9))
			return n
		}, listed},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			assertDump(t, c.node(), c.want...)
		})
	}
}
