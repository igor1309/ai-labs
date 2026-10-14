package tree_test

import (
	"fmt"
	"slices"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/gokit/tree"
)

// The scenarios of tree.feature's sections "Merge". Their trees are built
// here, not decoded: what merge does is the same whatever decoded them.

// from is the origin path, line.
func from(path string, line int) tree.Origin { return tree.Origin{Path: path, Line: line} }

// mapOf is the map of its key and value pairs, from origin.
func mapOf(origin tree.Origin, pairs ...any) tree.Node {
	entries := map[string]tree.Node{}
	for i := 0; i < len(pairs); i += 2 {
		entries[pairs[i].(string)] = pairs[i+1].(tree.Node)
	}
	return tree.NewMap(entries, origin)
}

func listOf(origin tree.Origin, items ...tree.Node) tree.Node { return tree.NewList(items, origin) }

func str(s string, origin tree.Origin) tree.Node { return tree.NewString(s, origin) }

func integer(i int64, origin tree.Origin) tree.Node { return tree.NewInteger(i, origin) }

// dump is every node of n, one a line: its place, its kind, its value
// when it is a scalar, and its origin. Map keys come sorted, so equal
// trees dump equal.
func dump(n tree.Node) []string {
	var lines []string
	var walk func(place string, n tree.Node)
	walk = func(place string, n tree.Node) {
		line := fmt.Sprintf("%s %s", place, n.Kind())
		switch n.Kind() {
		case tree.Empty:
			lines = append(lines, line)
			return
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
		lines = append(lines, fmt.Sprintf("%s %s:%d", line, n.Origin().Path, n.Origin().Line))
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

func assertDump(t *testing.T, got tree.Node, want ...string) {
	t.Helper()
	if lines := dump(got); !slices.Equal(lines, want) {
		t.Fatalf("tree:\n%s\nwant:\n%s", strings.Join(lines, "\n"), strings.Join(want, "\n"))
	}
}

var (
	u = func(line int) tree.Origin { return from("/u.yaml", line) }
	o = func(line int) tree.Origin { return from("/o.yaml", line) }
)

// Merge: maps

func TestATreeOverAnEmptyMapIsThatTree(t *testing.T) {
	t.Parallel()
	over := mapOf(o(1), "a", integer(1, o(1)))
	assertDump(t, over.Over(mapOf(u(1))),
		" map /o.yaml:1",
		".a integer 1 /o.yaml:1")
}

func TestAnEmptyMapOverAMapLeavesItsValues(t *testing.T) {
	t.Parallel()
	under := mapOf(u(1), "a", integer(1, u(1)))
	assertDump(t, mapOf(o(1)).Over(under),
		" map /o.yaml:1",
		".a integer 1 /u.yaml:1")
}

func TestMapsMergeByKeyTheOverTreesValueWinning(t *testing.T) {
	t.Parallel()
	under := mapOf(u(1), "a", integer(1, u(1)), "b", integer(1, u(2)))
	over := mapOf(o(1), "a", integer(2, o(1)), "c", integer(2, o(2)))
	assertDump(t, over.Over(under),
		" map /o.yaml:1",
		".a integer 2 /o.yaml:1",
		".b integer 1 /u.yaml:2",
		".c integer 2 /o.yaml:2")
}

func TestMapsMergeByKeyAtEveryDepth(t *testing.T) {
	t.Parallel()
	under := mapOf(u(1), "a", mapOf(u(1),
		"name", str("x", u(2)),
		"limits", mapOf(u(3), "tries", integer(2, u(4)), "minutes", integer(20, u(5)))))
	over := mapOf(o(1), "a", mapOf(o(1),
		"limits", mapOf(o(2), "minutes", integer(40, o(3)))))
	assertDump(t, over.Over(under),
		" map /o.yaml:1",
		".a map /o.yaml:1",
		".a.limits map /o.yaml:2",
		".a.limits.minutes integer 40 /o.yaml:3",
		".a.limits.tries integer 2 /u.yaml:4",
		".a.name string \"x\" /u.yaml:2")
}

func TestNothingUnsetsAnEmptyMapOverAMapAtDepthLeavesIt(t *testing.T) {
	t.Parallel()
	under := mapOf(u(1), "a", mapOf(u(1), "x", integer(1, u(2))))
	over := mapOf(o(1), "a", mapOf(o(1)))
	assertDump(t, over.Over(under),
		" map /o.yaml:1",
		".a map /o.yaml:1",
		".a.x integer 1 /u.yaml:2")
}

// Merge: lists and scalars

func TestAListReplacesAListWhole(t *testing.T) {
	t.Parallel()
	under := mapOf(u(1), "items", listOf(u(1), str("a", u(1)), str("b", u(1)), str("c", u(1))))
	for _, c := range []struct {
		name string
		over tree.Node
		want []string
	}{
		{"a list of one", listOf(o(1), str("d", o(1))), []string{
			" map /o.yaml:1", ".items list /o.yaml:1", ".items[0] string \"d\" /o.yaml:1"}},
		{"an empty list", listOf(o(1)), []string{
			" map /o.yaml:1", ".items list /o.yaml:1"}},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			assertDump(t, mapOf(o(1), "items", c.over).Over(under), c.want...)
		})
	}
}

func TestAListOfMapsReplacesWholeItsItemsAreNotMerged(t *testing.T) {
	t.Parallel()
	under := mapOf(u(1), "items", listOf(u(2),
		mapOf(u(2), "name", str("a", u(2)), "size", str("20m", u(3)))))
	over := mapOf(o(1), "items", listOf(o(2),
		mapOf(o(2), "name", str("b", o(2)))))
	assertDump(t, over.Over(under),
		" map /o.yaml:1",
		".items list /o.yaml:2",
		".items[0] map /o.yaml:2",
		".items[0].name string \"b\" /o.yaml:2")
}

func TestListsAndScalarsReplaceWhole(t *testing.T) {
	t.Parallel()
	one := func(origin tree.Origin) tree.Node { return integer(1, origin) }
	values := map[string]func(tree.Origin) tree.Node{
		"1":      one,
		"2":      func(origin tree.Origin) tree.Node { return integer(2, origin) },
		`"1"`:    func(origin tree.Origin) tree.Node { return str("1", origin) },
		"true":   func(origin tree.Origin) tree.Node { return tree.NewBoolean(true, origin) },
		"text":   func(origin tree.Origin) tree.Node { return str("text", origin) },
		`""`:     func(origin tree.Origin) tree.Node { return str("", origin) },
		"[1, 2]": func(origin tree.Origin) tree.Node { return listOf(origin, one(origin), integer(2, origin)) },
		"{b: 2}": func(origin tree.Origin) tree.Node { return mapOf(origin, "b", integer(2, origin)) },
	}
	for _, c := range [][2]string{
		{"1", "2"},
		{`"1"`, "1"},
		{"1", "true"},
		{"text", `""`},
		{"1", "[1, 2]"},
		{"[1, 2]", "1"},
		{"1", "{b: 2}"},
		{"{b: 2}", "1"},
		{"[1, 2]", "{b: 2}"},
		{"{b: 2}", "[1, 2]"},
	} {
		t.Run(c[1]+" over "+c[0], func(t *testing.T) {
			t.Parallel()
			under := mapOf(u(1), "a", values[c[0]](u(1)))
			over := mapOf(o(1), "a", values[c[1]](o(1)))
			want := dump(over)
			assertDump(t, over.Over(under), want...)
		})
	}
}

func TestATreeThatIsNoMapAtTheTopReplacesWhole(t *testing.T) {
	t.Parallel()
	for _, c := range []struct {
		name        string
		under, over tree.Node
	}{
		{"a list over a map", mapOf(u(1), "a", integer(1, u(1))), listOf(o(1), str("b", o(1)))},
		{"a map over a list", listOf(u(1), str("a", u(1))), mapOf(o(1), "b", integer(1, o(1)))},
		{"a list over a list", listOf(u(1), str("a", u(1))), listOf(o(1), str("b", o(1)))},
		{"a string over a string", str("a", u(1)), str("b", o(1))},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			assertDump(t, c.over.Over(c.under), dump(c.over)...)
		})
	}
}

func TestAnEmptyTreeIsPassedOver(t *testing.T) {
	t.Parallel()
	a := mapOf(o(1), "a", integer(1, o(1)))
	var empty tree.Node
	assertDump(t, a.Over(empty), dump(a)...)
	assertDump(t, empty.Over(a), dump(a)...)
	assertDump(t, empty.Over(empty), " empty")
}

// Merge: origins

// The under and over trees of the scenario "Every node keeps the origin of
// the tree it came from", built fresh on each call.
func originTrees() (under, over tree.Node) {
	under = mapOf(u(1),
		"a", mapOf(u(1),
			"name", str("x", u(2)),
			"limits", mapOf(u(3), "tries", integer(2, u(4))),
			"size", str("20m", u(5))),
		"items", listOf(u(6), str("p", u(7)), str("q", u(8))))
	over = mapOf(o(1),
		"a", mapOf(o(1), "size", str("40m", o(2))),
		"items", listOf(o(3), str("r", o(4))),
		"b", integer(1, o(5)))
	return under, over
}

func TestEveryNodeKeepsTheOriginOfTheTreeItCameFrom(t *testing.T) {
	t.Parallel()
	under, over := originTrees()
	assertDump(t, over.Over(under),
		" map /o.yaml:1",
		".a map /o.yaml:1",
		".a.limits map /u.yaml:3",
		".a.limits.tries integer 2 /u.yaml:4",
		".a.name string \"x\" /u.yaml:2",
		".a.size string \"40m\" /o.yaml:2",
		".b integer 1 /o.yaml:5",
		".items list /o.yaml:3",
		".items[0] string \"r\" /o.yaml:4")
}

func TestAMergeOverAMergedTreeKeepsEachNodesOwnOrigin(t *testing.T) {
	t.Parallel()
	first := mapOf(from("/1.yaml", 1),
		"a", integer(1, from("/1.yaml", 1)), "b", integer(1, from("/1.yaml", 2)), "c", integer(1, from("/1.yaml", 3)))
	second := mapOf(from("/2.yaml", 1),
		"b", integer(2, from("/2.yaml", 1)), "c", integer(2, from("/2.yaml", 2)))
	third := mapOf(from("/3.yaml", 1), "c", integer(3, from("/3.yaml", 1)))
	assertDump(t, third.Over(second.Over(first)),
		" map /3.yaml:1",
		".a integer 1 /1.yaml:1",
		".b integer 2 /2.yaml:1",
		".c integer 3 /3.yaml:1")
}

func TestTheOrderOfMergesIsTheCallersAndItTells(t *testing.T) {
	t.Parallel()
	first := mapOf(from("/1.yaml", 1), "a", mapOf(from("/1.yaml", 1), "x", integer(1, from("/1.yaml", 2))))
	second := mapOf(from("/2.yaml", 1), "a", integer(0, from("/2.yaml", 1)))
	third := mapOf(from("/3.yaml", 1), "a", mapOf(from("/3.yaml", 1), "y", integer(2, from("/3.yaml", 2))))
	assertDump(t, third.Over(second.Over(first)),
		" map /3.yaml:1",
		".a map /3.yaml:1",
		".a.y integer 2 /3.yaml:2")
	assertDump(t, third.Over(second).Over(first),
		" map /3.yaml:1",
		".a map /3.yaml:1",
		".a.x integer 1 /1.yaml:2",
		".a.y integer 2 /3.yaml:2")
}

// Merge: purity

func TestMergingChangesNeitherTree(t *testing.T) {
	t.Parallel()
	under, over := originTrees()
	wantUnder, wantOver := dump(under), dump(over)
	merged := over.Over(under)
	// A merge over the merged tree too, so a merge that shared and then
	// wrote a node of its inputs would show here.
	mapOf(from("/x.yaml", 1), "a", mapOf(from("/x.yaml", 1), "name", str("y", from("/x.yaml", 2)))).Over(merged)
	assertDump(t, under, wantUnder...)
	assertDump(t, over, wantOver...)
}
