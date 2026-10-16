package documents

import (
	"slices"

	"github.com/igor1309/ai-labs/gokit/tree"
)

// RuntimeDefinition is a runtime mapping, for one runtime wrapper: its
// name, the adapter and the contract of the wrapper, which it must give;
// the efforts the runtime accepts, and what it grants with no option, which
// it may, none among it, for a nearer layer to drop the base's grants with;
// and the options it offers, which it may, with the select that
// says whether a plan takes "any" of them or exactly "one", given with
// them and only with them.
type RuntimeDefinition struct {
	Name     string
	Adapter  Field[string]
	Contract Field[string]
	Efforts  Field[[]string]
	Grants   Field[[]string]
	Select   Field[string]
	Options  Field[[]Field[Option]]
}

// Option is one option of a runtime: its name, the permissions it grants,
// at least one, and the versions of the runtime it was verified on, which
// it may give.
type Option struct {
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
	r.Grants.Value = slices.Clone(r.Grants.Value)
	r.Options.Value = slices.Clone(r.Options.Value)
	for i := range r.Options.Value {
		option := &r.Options.Value[i].Value
		option.Grants.Value = slices.Clone(option.Grants.Value)
		option.Verified.Value = slices.Clone(option.Verified.Value)
	}
	return r
}

func typeRuntime(name string, root tree.Node) (RuntimeDefinition, []Problem) {
	t := newTyping(Runtime, root)
	// A select chooses among options, and options need a select to be
	// chosen: each is needed where the other is given.
	_, selects := t.node.Get("select")
	_, offers := t.node.Get("options")
	runtime := RuntimeDefinition{
		Name:     name,
		Adapter:  t.text("adapter", required),
		Contract: t.text("contract", required),
		Efforts:  t.texts("efforts", optional),
		Grants:   t.texts("grants", optional),
		Select:   t.oneOf("select", neededIf(offers), "any", "one"),
	}
	options := t.entries("options", neededIf(selects))
	// No option would leave a plan nothing to select. An option that is no
	// map is a problem of its own, and no entry.
	if named, _ := t.node.Get("options"); options.Given && len(named.Keys()) == 0 {
		t.problem(options.Origin, t.at("options"), "it names an option")
	}
	if options.Given {
		runtime.Options = Field[[]Field[Option]]{Value: []Field[Option]{}, Origin: options.Origin, Given: true}
	}
	for _, entry := range options.Value {
		option := Option{
			Name:     entry.name,
			Grants:   grants(entry.fields),
			Verified: entry.fields.texts("verified", optional),
		}
		entry.fields.done()
		runtime.Options.Value = append(runtime.Options.Value, Field[Option]{Value: option, Origin: originOf(entry.fields.node, entry.fields.place), Given: true})
	}
	if problems := t.end(); len(problems) > 0 {
		return RuntimeDefinition{}, problems
	}
	return runtime, nil
}

// grants is the grants of an option, which it must give: at least one, for
// an option granting nothing would fit every plan.
func grants(f *fields) Field[[]string] {
	grants := f.texts("grants", required)
	if grants.Given && len(grants.Value) == 0 {
		f.problem(grants.Origin, f.at("grants"), "it grants a permission")
	}
	return grants
}

// neededIf is required where given, and optional where not.
func neededIf(given bool) need {
	if given {
		return required
	}
	return optional
}
