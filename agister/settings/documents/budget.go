package documents

import (
	"slices"

	"github.com/igor1309/ai-labs/gokit/tree"
)

// Budget gives home's daily cost in US dollars, with its origin; none
// when the file is absent, empty or has problems of no document.
func (d *Documents) Budget() (Field[float64], []Problem) {
	return d.budget.value, slices.Clone(d.budget.problems)
}

func budgetOf(file Source, decode decoder) definition[Field[float64]] {
	root, decoded := decode(tree.YAML, file.Bytes, file.Path)
	if len(decoded) > 0 {
		var problems []Problem
		for _, p := range decoded {
			problems = append(problems, Problem{Path: p.Origin.Path, Line: p.Origin.Line, Place: p.Place, Message: p.Message})
		}
		return definition[Field[float64]]{problems: problems}
	}
	if root.Kind() == tree.Empty {
		return definition[Field[float64]]{}
	}
	if root.Kind() != tree.Map {
		return definition[Field[float64]]{problems: []Problem{{Path: file.Path, Message: "it is a map"}}}
	}
	f := &fields{typing: &typing{}, node: root, known: map[string]bool{}}
	var cost Field[float64]
	if _, given := root.Get("daily"); !given {
		f.known["daily"] = true
		f.problem(originOf(root, ""), "daily", "it is missing")
	} else if daily := f.mapping("daily", required); daily.Given {
		m := daily.Value
		if _, given := m.node.Get("cost"); !given {
			m.known["cost"] = true
			m.problem(originOf(m.node, m.place), "daily.cost", "it is missing")
		} else {
			cost = m.amount("cost", required)
		}
		m.done()
	}
	f.done()
	if len(f.typing.problems) > 0 {
		return definition[Field[float64]]{problems: f.typing.problems}
	}
	return definition[Field[float64]]{value: cost}
}
