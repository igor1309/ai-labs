package documents

import (
	"slices"
	"time"

	"github.com/igor1309/ai-labs/gokit/tree"
)

// skill is the kind a process's skills name. Skills are blobs left out for
// now (backlog/skills.md): Documents holds none, and a process names them.
const skill Kind = "skill"

// ProcessDefinition is a process, what a step does (ADR-012, terms): its
// name; the prompt it is given, the instruction told before it, its
// guidance and its skills, each by name; the params a caller gives it and
// the inputs it reads; the environment its runtime's program is given; the
// permissions it requires and allows (ADR-003, rule 2); its workspace and
// limits (ADR-004, rules 2, 3 and 7); its recovery (ADR-006, rule 3); and
// its output. A process may give any of them.
type ProcessDefinition struct {
	Name        string
	Prompt      Field[string]
	Instruction Field[string]
	Guidance    Field[[]Field[string]]
	Skills      Field[[]Field[string]]
	Params      Field[[]Field[Param]]
	Inputs      Field[[]Field[Input]]
	Environment Field[[]Field[Binding]]
	Permissions Field[Permissions]
	Workspace   Field[Workspace]
	Limits      Field[Limits]
	Recovery    Field[Recovery]
	Output      Field[Output]
}

// Param is a value the caller gives, by name: its default, where the
// caller may leave it out.
type Param struct {
	Name    string
	Default Field[string]
}

// Input is a value read from a source before the call starts (ADR-010,
// rule 1), by name: the source, by its name, the brief forms a text may
// take, and the source's arguments, by name. A source is code: resolve
// knows each one and what it takes.
type Input struct {
	Name      string
	Source    Field[string]
	Form      Field[[]Field[string]]
	Arguments []Field[Binding]
}

// Permissions are the permissions a process's work requires, and those it
// allows.
type Permissions struct {
	Require Field[[]string]
	Allow   Field[[]string]
}

// Workspace is what a call needs of the worktree: read-only or read-write
// access, the input whose revision its HEAD must be, and whether its
// content must be its HEAD's.
type Workspace struct {
	Access   Field[string]
	Revision Field[Reference]
	Clean    Field[bool]
}

// Limits are a call's limits: its time, its cost, and its staleness.
type Limits struct {
	Time  Field[time.Duration]
	Cost  Field[float64]
	Stale Field[Stale]
}

// Stale is when a turn is stale (ADR-006, rule 1): the same tool call made
// a number of times in a row, one tool command running too long, or no
// event or output for too long.
type Stale struct {
	RepeatedToolCalls Field[int]
	ToolCommand       Field[time.Duration]
	NoEvent           Field[time.Duration]
}

// Recovery is the budget of resumes a stale turn may take, and the
// instruction the agent is told.
type Recovery struct {
	Resumes     Field[int]
	Instruction Field[string]
}

// Output is what a call's output is checked against: a schema, by name.
type Output struct {
	Schema Field[string]
}

// Process is the process name, typed from its composed tree, extends
// applied, or its problems, and then no process: those of its tree, as
// Tree gives them, or else those of its fields.
func (d *Documents) Process(name string) (ProcessDefinition, []Problem) {
	process, problems := definitionOf(d.processes, Process, name)
	return process.clone(), problems
}

// clone is the process with slices of its own: a process is typed once and
// held, and a caller that changes what it was given must change nothing
// Documents holds.
func (p ProcessDefinition) clone() ProcessDefinition {
	p.Guidance.Value = slices.Clone(p.Guidance.Value)
	p.Skills.Value = slices.Clone(p.Skills.Value)
	p.Params.Value = slices.Clone(p.Params.Value)
	p.Inputs.Value = slices.Clone(p.Inputs.Value)
	for i := range p.Inputs.Value {
		input := &p.Inputs.Value[i].Value
		input.Form.Value = slices.Clone(input.Form.Value)
		input.Arguments = slices.Clone(input.Arguments)
	}
	p.Environment.Value = slices.Clone(p.Environment.Value)
	p.Permissions.Value.Require.Value = slices.Clone(p.Permissions.Value.Require.Value)
	p.Permissions.Value.Allow.Value = slices.Clone(p.Permissions.Value.Allow.Value)
	return p
}

// processReads is what a process's references may read: its params and its
// inputs.
func processReads() readable { return readable{roots: []string{"params", "inputs"}} }

func typeProcess(name string, root tree.Node) (ProcessDefinition, []Problem) {
	t := newTyping(Process, root)
	process := ProcessDefinition{
		Name:        name,
		Prompt:      t.reference("prompt", optional, Prompt),
		Instruction: t.text("instruction", optional),
		Guidance:    t.references("guidance", optional, Prompt),
		Skills:      t.references("skills", optional, skill),
		Params:      typeParams(t),
		Inputs:      typeInputs(t),
		Environment: t.bindingsBy("environment", optional, processReads(), tree.Node.DeclaredKeys),
	}
	if permissions := t.mapping("permissions", optional); permissions.Given {
		p := permissions.Value
		process.Permissions = Field[Permissions]{Value: Permissions{
			Require: p.texts("require", optional),
			Allow:   p.texts("allow", optional),
		}, Origin: permissions.Origin, Given: true}
		p.done()
	}
	if workspace := t.mapping("workspace", optional); workspace.Given {
		w := workspace.Value
		process.Workspace = Field[Workspace]{Value: Workspace{
			Access: w.oneOf("access", optional, "read-only", "read-write"),
			// A revision is that of an input (ADR-004, rule 2).
			Revision: w.from("revision", optional, readable{roots: []string{"inputs"}}),
			Clean:    w.boolean("clean", optional),
		}, Origin: workspace.Origin, Given: true}
		w.done()
	}
	if limits := t.mapping("limits", optional); limits.Given {
		process.Limits = Field[Limits]{Value: typeLimits(limits.Value), Origin: limits.Origin, Given: true}
	}
	if recovery := t.mapping("recovery", optional); recovery.Given {
		r := recovery.Value
		process.Recovery = Field[Recovery]{Value: Recovery{
			Resumes:     r.integer("resumes", required, 1),
			Instruction: r.text("instruction", required),
		}, Origin: recovery.Origin, Given: true}
		r.done()
	}
	if output := t.mapping("output", optional); output.Given {
		o := output.Value
		process.Output = Field[Output]{Value: Output{Schema: o.reference("schema", required, Schema)}, Origin: output.Origin, Given: true}
		o.done()
	}
	if problems := t.end(); len(problems) > 0 {
		return ProcessDefinition{}, problems
	}
	return process, nil
}

func typeParams(t *fields) Field[[]Field[Param]] {
	params := t.entries("params", optional)
	if !params.Given {
		return Field[[]Field[Param]]{}
	}
	typed := []Field[Param]{}
	for _, entry := range params.Value {
		param := Param{Name: entry.name, Default: entry.fields.text("default", optional)}
		entry.fields.done()
		typed = append(typed, Field[Param]{Value: param, Origin: originOf(entry.fields.node, entry.fields.place), Given: true})
	}
	return Field[[]Field[Param]]{Value: typed, Origin: params.Origin, Given: true}
}

func typeInputs(t *fields) Field[[]Field[Input]] {
	inputs := t.entries("inputs", optional)
	if !inputs.Given {
		return Field[[]Field[Input]]{}
	}
	typed := []Field[Input]{}
	for _, entry := range inputs.Value {
		input := Input{
			Name:      entry.name,
			Source:    entry.fields.text("source", required),
			Form:      entry.fields.references("form", optional, Brief),
			Arguments: []Field[Binding]{},
		}
		// Every other field is an argument of the source.
		for _, key := range entry.fields.node.Keys() {
			if key == "source" || key == "form" {
				continue
			}
			if value := entry.fields.value(key, required, processReads()); value.Given {
				input.Arguments = append(input.Arguments, Field[Binding]{Value: Binding{Name: key, Value: value.Value}, Origin: value.Origin, Given: true})
			}
		}
		entry.fields.done()
		typed = append(typed, Field[Input]{Value: input, Origin: originOf(entry.fields.node, entry.fields.place), Given: true})
	}
	return Field[[]Field[Input]]{Value: typed, Origin: inputs.Origin, Given: true}
}

func typeLimits(l *fields) Limits {
	limits := Limits{Time: l.duration("time", optional), Cost: l.amount("cost", optional)}
	if stale := l.mapping("stale", optional); stale.Given {
		s := stale.Value
		limits.Stale = Field[Stale]{Value: Stale{
			RepeatedToolCalls: s.integer("repeated_tool_calls", optional, 1),
			ToolCommand:       s.duration("tool_command", optional),
			NoEvent:           s.duration("no_event", optional),
		}, Origin: stale.Origin, Given: true}
		s.done()
	}
	l.done()
	return limits
}
