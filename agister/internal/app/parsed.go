package app

import (
	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
	"github.com/igor1309/ai-labs/agister/internal/domain/settings"
)

// parsedSettings are the settings documents that parsed, each by name, as
// check reads them.
type parsedSettings struct {
	service   *serviceSettings
	agents    map[string]agentProfile
	processes map[string]definition.Process
	mappings  map[string]runtimeMapping
	schemas   map[string]bool
	workflows map[string]declaredWorkflow
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

func settingsAgent(agent agentProfile) settings.Agent {
	return settings.Agent{Name: agent.name, Runtime: agent.runtime, Effort: agent.effort, Skills: agent.skills}
}

func settingsMapping(mapping runtimeMapping) settings.Mapping {
	return settings.Mapping{Name: mapping.name, Adapter: mapping.adapter, Efforts: mapping.efforts, Offer: mapping.offer}
}

// settingsProcess is the process as settings checks it. A process that
// sets no session is fresh-only (ADR-030 rule 2).
func settingsProcess(process definition.Process) settings.Process {
	out := settings.Process{
		Name: process.Name,
		Params: translated(processParams(process), func(param declaredParam) settings.Param {
			return settings.Param{Name: param.name, HasDefault: param.hasDefault}
		}),
		Values:    settingsValues(processValues(process)),
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

func settingsWorkflow(workflow declaredWorkflow) settings.Workflow {
	out := settings.Workflow{
		Name:   workflow.name,
		Values: settingsValues(workflow.values),
		FanOut: translated(workflow.fanOut, settingsNode),
		Join:   settingsNode(workflow.join),
	}
	if workflow.call != nil {
		call := settingsNode(*workflow.call)
		out.Call = &call
	}
	return out
}

func settingsNode(node workflowNode) settings.Node {
	return settings.Node{Name: node.name, Process: node.process, Agent: node.agent}
}

func settingsValues(values []declaredValue) []settings.Value {
	return translated(values, func(value declaredValue) settings.Value {
		return settings.Value{Name: value.name, Source: value.source, Forms: value.forms}
	})
}
