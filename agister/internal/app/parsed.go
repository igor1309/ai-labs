package app

import (
	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
	"github.com/igor1309/ai-labs/agister/internal/domain/settings"
)

// parsedSettings are the settings documents that parsed, each by name, as
// check reads them.
type parsedSettings struct {
	service   *serviceSettings
	agents    map[string]definition.Agent
	processes map[string]definition.Process
	mappings  map[string]runtimeMapping
	schemas   map[string]bool
	workflows map[string]definition.Workflow
	verifies  map[string]definition.Verification
	// prompts are the prompt documents the settings have; an unreadable
	// one is a problem of its own, not of the processes that name it.
	prompts map[string]bool
	// skills are the skill documents the settings have; a broken one is a
	// problem of its own, not of the agents and processes that name it.
	skills map[string]bool
	// briefs are the brief forms the settings have; a broken one is a
	// problem of its own, not of the processes and workflows that name it.
	briefs map[string]bool
	// bases are the processes some process extends, each with those that
	// extend it, whether or not they parsed (ADR-030 rule 9).
	bases map[string][]string
}

// resolved returns the process named name with the verification it names
// as its verify, as a call resolves it (ADR-010 rule 3). One that names a
// verification the settings lack is returned without verify values.
func (p parsedSettings) resolved(name string) definition.Process {
	process := p.processes[name]
	if verification, ok := p.verifies[process.VerifyName]; ok && process.VerifyName != "" {
		process.Verify = &verification.Verify
	}
	return process
}

// bundle is what settings checks of the documents: each process resolved,
// as a call resolves it.
func (p parsedSettings) bundle() settings.Bundle {
	b := settings.Bundle{
		Agents:    mapped(p.agents, settingsAgent),
		Processes: map[string]settings.Process{},
		Mappings:  mapped(p.mappings, settingsMapping),
		Schemas:   p.schemas,
		Workflows: mapped(p.workflows, settingsWorkflow),
		Prompts:   p.prompts,
		Skills:    p.skills,
		Briefs:    p.briefs,
		Bases:     p.bases,
	}
	if p.service != nil {
		service := settingsService(*p.service)
		b.Service = &service
	}
	for name := range p.processes {
		b.Processes[name] = settingsProcess(p.resolved(name))
	}
	return b
}

// mapped is m with each value mapped by f.
func mapped[V, W any](m map[string]V, f func(V) W) map[string]W {
	out := make(map[string]W, len(m))
	for name, value := range m {
		out[name] = f(value)
	}
	return out
}

func settingsService(service serviceSettings) settings.Service {
	return settings.Service{Ceilings: service.ceilings, StateReaching: service.stateReaching}
}

func settingsAgent(agent definition.Agent) settings.Agent {
	return settings.Agent{Name: agent.Name, Runtime: agent.Runtime, Effort: agent.Effort, Skills: agent.Skills}
}

func settingsMapping(mapping runtimeMapping) settings.Mapping {
	return settings.Mapping{Name: mapping.name, Adapter: mapping.adapter, Efforts: mapping.efforts, Offer: mapping.offer}
}

// settingsProcess is the process as settings checks it. A process that
// sets no session is fresh-only (ADR-030 rule 2).
func settingsProcess(process definition.Process) settings.Process {
	out := settings.Process{
		Name: process.Name,
		Params: translated(process.Params, func(param definition.Param) settings.Param {
			return settings.Param{Name: param.Name, HasDefault: param.HasDefault}
		}),
		Values:    settingsValues(process.Values),
		Prompt:    process.Prompt,
		Guidance:  process.Guidance,
		Skills:    process.Skills,
		Limits:    declared(process),
		Resumable: definition.CallSession(process) == definition.SessionResumable,
	}
	if process.Output.Format == "json" {
		out.Schema = process.Output.Schema
	}
	return out
}

func settingsWorkflow(workflow definition.Workflow) settings.Workflow {
	out := settings.Workflow{
		Name:   workflow.Name,
		Values: settingsValues(workflow.Values),
		FanOut: translated(workflow.FanOut, settingsNode),
		Join:   settingsNode(workflow.Join),
	}
	if workflow.Call != nil {
		call := settingsNode(*workflow.Call)
		out.Call = &call
	}
	return out
}

func settingsNode(node definition.Node) settings.Node {
	return settings.Node{Name: node.Name, Process: node.Process, Agent: node.Agent}
}

func settingsValues(values []definition.Value) []settings.Value {
	return translated(values, func(value definition.Value) settings.Value {
		return settings.Value{Name: value.Name, Source: value.Source, Forms: value.Forms}
	})
}
