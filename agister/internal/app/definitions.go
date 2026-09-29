package app

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"path"
	"sort"
	"strings"

	"github.com/igor1309/ai-labs/agister/internal/contract"
	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
)

// Settings manages definitions: examples, agents and process listings.
type Settings struct {
	Definitions DefinitionSource
	Writer      DefinitionWriter
	Examples    Examples
}

func (s *Settings) Init(ctx context.Context, overwrite, dryRun bool) (contract.InitResult, error) {
	var result contract.InitResult
	if s.Examples == nil {
		return result, &contract.InputError{Message: "no example definitions are available"}
	}
	var files []string
	err := fs.WalkDir(s.Examples, ".", func(name string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if strings.HasPrefix(entry.Name(), ".") && name != "." {
			// Stray OS metadata such as .DS_Store is never a definition.
			if entry.IsDir() {
				return fs.SkipDir
			}
			return nil
		}
		if !entry.IsDir() {
			files = append(files, name)
		}
		return nil
	})
	if err != nil {
		return result, err
	}
	sort.Strings(files)
	for _, name := range files {
		kind, base := definition.KindService, "service"
		if dir := path.Dir(name); dir != "." {
			kind = definition.Kind(dir)
			base = strings.TrimSuffix(path.Base(name), path.Ext(name))
		} else if name != "service.toml" {
			return result, fmt.Errorf("unexpected example file %q", name)
		}
		data, err := fs.ReadFile(s.Examples, name)
		if err != nil {
			return result, err
		}
		path, existed, err := s.Writer.Exists(ctx, kind, base)
		if err != nil {
			return result, err
		}
		created := !existed || overwrite
		if !dryRun {
			if path, created, err = s.Writer.Write(ctx, kind, base, data, overwrite); err != nil {
				return result, err
			}
		}
		switch {
		case !created:
			result.Kept = append(result.Kept, path)
		case existed:
			result.Replaced = append(result.Replaced, path)
		default:
			result.Created = append(result.Created, path)
		}
	}
	return result, nil
}

func (s *Settings) CreateAgent(ctx context.Context, spec contract.Agent, overwrite, dryRun bool) (contract.AgentWrite, error) {
	agent := definition.Agent{
		Name: spec.Name, Runtime: spec.Runtime, Model: spec.Model, ModelFamily: spec.ModelFamily,
		Effort: spec.Effort, Command: spec.Command, Session: spec.Session,
	}
	if agent.Session == "" {
		agent.Session = definition.SessionFresh
	}
	if agent.Session != definition.SessionFresh && agent.Session != definition.SessionResumable {
		return contract.AgentWrite{}, &contract.InputError{Message: fmt.Sprintf("invalid session mode %q (supported: %s, %s)", agent.Session, definition.SessionFresh, definition.SessionResumable)}
	}
	if !definition.ValidName(agent.Name) {
		return contract.AgentWrite{}, &contract.InputError{Message: fmt.Sprintf("invalid agent name %q", agent.Name)}
	}
	doc, err := s.Definitions.Read(ctx, definition.KindRuntime, agent.Runtime)
	if err != nil {
		names, _ := s.Definitions.List(ctx, definition.KindRuntime)
		return contract.AgentWrite{}, &contract.InputError{Message: fmt.Sprintf("unknown runtime %q (available: %s)", agent.Runtime, strings.Join(names, ", "))}
	}
	mapping, err := definition.ParseMapping(doc)
	if err != nil {
		return contract.AgentWrite{}, err
	}
	if agent.Effort != "" && !contains(mapping.Efforts, agent.Effort) {
		return contract.AgentWrite{}, &contract.InputError{Message: fmt.Sprintf("unsupported %s effort %q (supported: %s)", mapping.Name, agent.Effort, strings.Join(mapping.Efforts, ", "))}
	}
	data := definition.FormatAgent(agent)
	if _, err := definition.ParseAgent(definition.Document{Source: definition.Source{Kind: definition.KindAgent, Name: agent.Name}, Bytes: data}); err != nil {
		return contract.AgentWrite{}, err
	}
	path, exists, err := s.Writer.Exists(ctx, definition.KindAgent, agent.Name)
	if err != nil {
		return contract.AgentWrite{}, err
	}
	if exists && !overwrite {
		return contract.AgentWrite{}, &contract.InputError{Message: fmt.Sprintf("agent %s already exists at %s (overwrite to replace it)", agent.Name, path)}
	}
	if dryRun {
		return contract.AgentWrite{Path: path, Replaces: exists}, nil
	}
	written, created, err := s.Writer.Write(ctx, definition.KindAgent, agent.Name, data, overwrite)
	if err != nil {
		return contract.AgentWrite{}, err
	}
	if !created {
		return contract.AgentWrite{}, &contract.InputError{Message: fmt.Sprintf("agent %s already exists at %s (overwrite to replace it)", agent.Name, written)}
	}
	return contract.AgentWrite{Path: written, Replaces: exists}, nil
}

func (s *Settings) ListAgents(ctx context.Context) ([]contract.Agent, error) {
	names, err := s.Definitions.List(ctx, definition.KindAgent)
	if err != nil {
		return nil, err
	}
	agents := make([]contract.Agent, 0, len(names))
	for _, name := range names {
		doc, err := s.Definitions.Read(ctx, definition.KindAgent, name)
		if err != nil {
			return nil, err
		}
		agent, err := definition.ParseAgent(doc)
		if err != nil {
			return nil, err
		}
		agents = append(agents, contract.Agent{Name: agent.Name, Runtime: agent.Runtime, Model: agent.Model, ModelFamily: agent.ModelFamily, Effort: agent.Effort, Session: agent.Session, Command: agent.Command})
	}
	return agents, nil
}

func (s *Settings) ListProcesses(ctx context.Context) ([]contract.ProcessSummary, error) {
	names, err := s.Definitions.List(ctx, definition.KindProcess)
	if err != nil {
		return nil, err
	}
	processes := make([]contract.ProcessSummary, 0, len(names))
	for _, name := range names {
		doc, err := s.Definitions.Read(ctx, definition.KindProcess, name)
		if err != nil {
			return nil, err
		}
		process, err := definition.ParseProcess(doc)
		if err != nil {
			processes = append(processes, contract.ProcessSummary{Name: name, Problem: "invalid (run `agister check`)"})
			continue
		}
		output := process.Output.Format
		if process.Output.Schema != "" {
			output += ":" + process.Output.Schema
		}
		processes = append(processes, contract.ProcessSummary{Name: process.Name, Agent: process.Agent, Policy: process.Policy, Output: output})
	}
	return processes, nil
}

// Inspection shows a process as a call would see it, without effects.
type Inspection struct {
	Definitions DefinitionSource
	Runtimes    Runtimes
	Validator   OutputValidator
}

func (i *Inspection) ShowProcess(ctx context.Context, name, agent string) (contract.ProcessView, error) {
	res, err := resolver{definitions: i.Definitions, runtimes: i.Runtimes, validator: i.Validator}.resolve(ctx, name, agent, overrides{})
	var refusal *Refusal
	if err != nil && !errors.As(err, &refusal) {
		return contract.ProcessView{}, err
	}
	if err != nil && res.process.Name == "" {
		return contract.ProcessView{}, &contract.InputError{Message: refusal.Reason}
	}
	view := contract.ProcessView{
		Name:        res.process.Name,
		Agent:       res.agent.Name,
		Runtime:     res.mapping.Name,
		Policy:      res.process.Policy,
		Output:      res.process.Output.Format,
		Timeout:     res.effective.Timeout,
		MaxAttempts: res.effective.MaxAttempts,
		MaxCostUSD:  res.effective.MaxCostUSD,
		Allowed:     res.effective.Allow,
		Denied:      res.effective.Deny,
		Permissions: res.effective.Permissions,
		Access:      res.effective.Access,
		Scope:       res.effective.Scope,
		Primitives:  res.plan.Primitives,
		Withheld:    res.plan.Withheld,
	}
	if res.process.Output.Schema != "" {
		view.Output += ":" + res.process.Output.Schema
	}
	for _, param := range res.process.Params {
		view.Params = append(view.Params, contract.Param{Name: param.Name, Default: param.Default, Required: !param.HasDefault})
	}
	for _, value := range res.process.Values {
		view.Inputs = append(view.Inputs, value.Name+" <- "+value.Source)
	}
	for _, rule := range res.effective.Constraints {
		view.Constraints = append(view.Constraints, fmt.Sprintf("%s differs from the writer of input.%s (unknown: %s)", rule.Subject, rule.CandidateInput, rule.OnUnknown))
	}
	for _, source := range res.sources {
		text := fmt.Sprintf("%s %s: global %s", source.Kind.Singular(), source.Name, source.Path)
		if source.Project {
			text = fmt.Sprintf("%s %s: project %s", source.Kind.Singular(), source.Name, source.Path)
		}
		if source.Overrides != "" {
			text += " (overrides " + source.Overrides + ")"
		}
		view.Sources = append(view.Sources, text)
	}
	if refusal != nil {
		view.Refusal = refusal.Reason
	}
	return view, nil
}
