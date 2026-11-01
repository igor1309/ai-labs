package tree_test

import (
	"slices"
	"testing"

	"github.com/igor1309/ai-labs/gokit/tree"
)

func TestDeclaredKeysPreserveYAMLOrder(t *testing.T) {
	t.Parallel()
	for _, text := range []string{"B: b\nA: a\n", "{B: b, A: a}"} {
		t.Run(text, func(t *testing.T) {
			t.Parallel()
			node, problems := tree.Decode(tree.YAML, []byte(text), "process.yaml")
			if len(problems) != 0 {
				t.Fatal(problems)
			}
			if got := node.DeclaredKeys(); !slices.Equal(got, []string{"B", "A"}) {
				t.Errorf("declared keys %q, want B, A", got)
			}
			keys := node.DeclaredKeys()
			keys[0] = "changed"
			if got := node.DeclaredKeys(); !slices.Equal(got, []string{"B", "A"}) {
				t.Errorf("keys changed the tree: %q", got)
			}
			if got := node.Keys(); !slices.Equal(got, []string{"A", "B"}) {
				t.Errorf("sorted keys %q, want A, B", got)
			}
		})
	}
}

func TestDeclaredKeysOfMergedMaps(t *testing.T) {
	t.Parallel()
	upper, problems := tree.Decode(tree.YAML, []byte("env: {C: upper, B: override}"), "upper.yaml")
	if len(problems) != 0 {
		t.Fatal(problems)
	}
	lower, problems := tree.Decode(tree.YAML, []byte("env: {B: lower, A: lower, D: lower}"), "lower.yaml")
	if len(problems) != 0 {
		t.Fatal(problems)
	}
	merged, _ := upper.Over(lower).Get("env")
	if got := merged.DeclaredKeys(); !slices.Equal(got, []string{"C", "B", "A", "D"}) {
		t.Errorf("merged keys %q", got)
	}
	value, _ := merged.Get("B")
	if text, _ := value.Text(); text != "override" {
		t.Errorf("B %q, want override", text)
	}
	base, _ := lower.Get("env")
	if got := base.DeclaredKeys(); !slices.Equal(got, []string{"B", "A", "D"}) {
		t.Errorf("lower keys changed: %q", got)
	}
	if got := merged.Keys(); !slices.Equal(got, []string{"A", "B", "C", "D"}) {
		t.Errorf("sorted keys %q", got)
	}
}

func TestDeclaredKeysWithoutAnOrderedSourceAreSorted(t *testing.T) {
	t.Parallel()
	toml, problems := tree.Decode(tree.TOML, []byte("B = 'b'\nA = 'a'\n"), "process.toml")
	if len(problems) != 0 {
		t.Fatal(problems)
	}
	for _, node := range []tree.Node{toml, tree.NewMap(map[string]tree.Node{"B": {}, "A": {}}, tree.Origin{})} {
		if got := node.DeclaredKeys(); !slices.Equal(got, []string{"A", "B"}) {
			t.Errorf("keys %q, want A, B", got)
		}
	}
	for _, node := range []tree.Node{{}, tree.NewString("text", tree.Origin{})} {
		if got := node.DeclaredKeys(); len(got) != 0 {
			t.Errorf("non-map keys %q", got)
		}
	}
}
