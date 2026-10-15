package documents

import "github.com/igor1309/ai-labs/gokit/tree"

// AgentDefinition is an agent: its name, the runtime it runs on, by name,
// which it must give, and the model, the model's family, the effort and the command
// it may.
type AgentDefinition struct {
	Name        string
	Runtime     Field[string]
	Model       Field[string]
	ModelFamily Field[string]
	Effort      Field[string]
	Command     Field[string]
}

// Agent is the agent name, typed from its composed tree, extends applied,
// or its problems, and then no agent: those of its tree, as Tree gives
// them, or else those of its fields.
func (d *Documents) Agent(name string) (AgentDefinition, []Problem) {
	return definitionOf(d.agents, Agent, name)
}

func typeAgent(name string, root tree.Node) (AgentDefinition, []Problem) {
	t := newTyping(Agent, name, root)
	agent := AgentDefinition{
		Name:        name,
		Runtime:     t.reference("runtime", required, Runtime),
		Model:       t.text("model", optional),
		ModelFamily: t.text("model_family", optional),
		Effort:      t.text("effort", optional),
		Command:     t.text("command", optional),
	}
	if problems := t.end(); len(problems) > 0 {
		return AgentDefinition{}, problems
	}
	return agent, nil
}
