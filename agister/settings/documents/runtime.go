package documents

import (
	"slices"

	"github.com/igor1309/ai-labs/gokit/tree"
)

// RuntimeDefinition is a runtime mapping, for one runtime wrapper: its
// name, the adapter and the contract of the wrapper, which it must give,
// the efforts the runtime accepts, which it may, and the primitives it
// offers, which it must.
type RuntimeDefinition struct {
	Name       string
	Adapter    Field[string]
	Contract   Field[string]
	Efforts    Field[[]string]
	Primitives Field[Primitives]
}

// Primitives are a runtime's options: whether a plan selects "any" of them
// or exactly "one", and each option, by name.
type Primitives struct {
	Select Field[string]
	Items  []Field[Primitive]
}

// Primitive is one option of a runtime: its name, the permissions it
// grants, at least one, and the versions of the runtime it was verified
// on, which it may give.
type Primitive struct {
	Name     string
	Grants   Field[[]string]
	Verified Field[[]string]
}

// Runtime is the runtime name, typed from its composed tree, extends
// applied, or its problems, and then no runtime: those of its tree, as Tree
// gives them, or else those of its fields.
func (d *Documents) Runtime(name string) (RuntimeDefinition, []Problem) {
	runtime, problems := definitionOf(d.runtimes, Runtime, name)
	return runtime.clone(), problems
}

// clone is the runtime with slices of its own: a runtime is typed once and
// held, and a caller that changes what it was given must change nothing
// Documents holds.
func (r RuntimeDefinition) clone() RuntimeDefinition {
	r.Efforts.Value = slices.Clone(r.Efforts.Value)
	r.Primitives.Value.Items = slices.Clone(r.Primitives.Value.Items)
	for i := range r.Primitives.Value.Items {
		item := &r.Primitives.Value.Items[i].Value
		item.Grants.Value = slices.Clone(item.Grants.Value)
		item.Verified.Value = slices.Clone(item.Verified.Value)
	}
	return r
}

func typeRuntime(name string, root tree.Node) (RuntimeDefinition, []Problem) {
	t := newTyping(Runtime, name, root)
	runtime := RuntimeDefinition{
		Name:     name,
		Adapter:  t.text("adapter", required),
		Contract: t.text("contract", required),
		Efforts:  t.texts("efforts", optional),
	}
	if primitives := t.mapping("primitives", required); primitives.Given {
		runtime.Primitives = Field[Primitives]{Value: typePrimitives(primitives.Value), Origin: primitives.Origin, Given: true}
	}
	if problems := t.end(); len(problems) > 0 {
		return RuntimeDefinition{}, problems
	}
	return runtime, nil
}

func typePrimitives(p *fields) Primitives {
	primitives := Primitives{Select: p.oneOf("select", required, "any", "one")}
	items := p.entries("items", required)
	// No option would leave a plan nothing to select. An item that is no
	// map is a problem of its own, and no entry.
	if named, _ := p.node.Get("items"); items.Given && len(named.Keys()) == 0 {
		p.problem(items.Origin, p.at("items"), "it names a primitive")
	}
	for _, item := range items.Value {
		primitive := Primitive{
			Name:     item.name,
			Grants:   item.fields.texts("grants", required),
			Verified: item.fields.texts("verified", optional),
		}
		// An option granting nothing would fit every plan.
		if primitive.Grants.Given && len(primitive.Grants.Value) == 0 {
			item.fields.problem(primitive.Grants.Origin, item.fields.at("grants"), "it grants a permission")
		}
		item.fields.done()
		primitives.Items = append(primitives.Items, Field[Primitive]{Value: primitive, Origin: originOf(item.fields.node), Given: true})
	}
	p.done()
	return primitives
}
