package app

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"

	"github.com/igor1309/ai-labs/agister/internal/contract"
	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
	"github.com/igor1309/ai-labs/agister/internal/domain/settings"
)

// Checker validates all settings at once, before any call needs them.
type Checker struct {
	Definitions DefinitionSource
	Validator   OutputValidator
	Runtimes    Runtimes
	Sources     []string // input source kinds the code provides
}

func (c *Checker) Check(ctx context.Context, probe bool) (contract.CheckReport, error) {
	report := contract.CheckReport{Checked: map[string]int{}}
	index := map[contract.DefinitionRef]int{} // into report.Definitions
	problem := func(subject, format string, args ...any) {
		report.Problems = append(report.Problems, subject+": "+fmt.Sprintf(format, args...))
	}
	bundle := settings.Bundle{
		Agents:    map[string]definition.Agent{},
		Processes: map[string]definition.Process{},
		Policies:  map[string]definition.Policy{},
		Mappings:  map[string]definition.Mapping{},
		Schemas:   map[string]bool{},
	}

	// Each document on its own.
	each := func(kind definition.Kind, parse func(definition.Document) error) error {
		names := []string{"service"}
		if kind != definition.KindService {
			var err error
			if names, err = c.Definitions.List(ctx, kind); err != nil {
				return err
			}
		}
		for _, name := range names {
			doc, err := c.Definitions.Read(ctx, kind, name)
			if err != nil {
				problem(kind.Singular()+" "+name, "%v", err)
				continue
			}
			report.Checked[string(kind)]++
			if doc.Source.Overrides != "" {
				report.Overrides = append(report.Overrides, fmt.Sprintf("%s %s: %s overrides %s", kind.Singular(), name, doc.Source.Path, doc.Source.Overrides))
			}
			layer := "global"
			if doc.Source.Project {
				layer = "project"
			}
			index[contract.DefinitionRef{Kind: string(kind), Name: name}] = len(report.Definitions)
			report.Definitions = append(report.Definitions, contract.Definition{Kind: string(kind), Name: name, Layer: layer, Path: doc.Source.Path, Overrides: doc.Source.Overrides})
			if err := parse(doc); err != nil {
				report.Definitions[len(report.Definitions)-1].Invalid = true
				var invalid *definition.InvalidError
				if errors.As(err, &invalid) {
					for _, p := range invalid.Problems {
						problem(kind.Singular()+" "+name, "%s", p)
					}
				} else {
					problem(kind.Singular()+" "+name, "%v", err)
				}
			}
		}
		return nil
	}
	steps := []struct {
		kind  definition.Kind
		parse func(definition.Document) error
	}{
		{definition.KindService, func(d definition.Document) error {
			service, err := definition.ParseService(d)
			if err == nil {
				bundle.Service = &service
			}
			return err
		}},
		{definition.KindRuntime, func(d definition.Document) error {
			m, err := definition.ParseMapping(d)
			if err == nil {
				bundle.Mappings[m.Name] = m
			}
			return err
		}},
		{definition.KindAgent, func(d definition.Document) error {
			a, err := definition.ParseAgent(d)
			if err == nil {
				bundle.Agents[a.Name] = a
			}
			return err
		}},
		{definition.KindPolicy, func(d definition.Document) error {
			p, err := definition.ParsePolicy(d)
			if err == nil {
				bundle.Policies[p.Name] = p
			}
			return err
		}},
		{definition.KindProcess, func(d definition.Document) error {
			p, err := definition.ParseProcess(d)
			if err == nil {
				bundle.Processes[p.Name] = p
			}
			return err
		}},
		{definition.KindSchema, func(d definition.Document) error {
			if err := c.Validator.Compile(d.Bytes); err != nil {
				return err
			}
			bundle.Schemas[d.Source.Name] = true
			return nil
		}},
	}
	for _, step := range steps {
		if err := each(step.kind, step.parse); err != nil {
			return report, err
		}
	}
	// What each definition references, and the reverse.
	link := func(from contract.DefinitionRef, kind definition.Kind, name string) {
		source, ok := index[from]
		if name == "" || !ok { // a name unlike its file is reported as a problem
			return
		}
		to := contract.DefinitionRef{Kind: string(kind), Name: name}
		report.Definitions[source].Uses = append(report.Definitions[source].Uses, to)
		if i, ok := index[to]; ok {
			report.Definitions[i].UsedBy = append(report.Definitions[i].UsedBy, from)
		}
	}
	for _, name := range sortedNames(bundle.Agents) {
		link(contract.DefinitionRef{Kind: string(definition.KindAgent), Name: name}, definition.KindRuntime, bundle.Agents[name].Runtime)
	}
	for _, name := range sortedNames(bundle.Processes) {
		process, from := bundle.Processes[name], contract.DefinitionRef{Kind: string(definition.KindProcess), Name: name}
		link(from, definition.KindAgent, process.Agent)
		link(from, definition.KindPolicy, process.Policy)
		if process.Output.Format == "json" {
			link(from, definition.KindSchema, process.Output.Schema)
		}
	}

	if bundle.Service == nil {
		sort.Strings(report.Problems)
		return report, nil
	}

	// Across documents.
	for _, p := range settings.Check(bundle, settings.Mechanisms{Sources: c.Sources, Adapters: c.Runtimes.Adapters()}) {
		report.Problems = append(report.Problems, p.String())
	}

	// Against the runtimes themselves.
	if probe {
		for _, name := range sortedNames(bundle.Agents) {
			agent := bundle.Agents[name]
			mapping, ok := bundle.Mappings[agent.Runtime]
			if !ok {
				continue
			}
			runner, err := c.Runtimes.Runner(mapping.Adapter, agent.Command)
			if err != nil {
				continue // reported as an unknown adapter
			}
			identity, err := runner.Identity(ctx)
			switch {
			case err != nil:
				problem("agent "+name, "runtime unavailable: %v", err)
			case identity.Contract != mapping.Contract:
				problem("agent "+name, "adapter implements %s, mapping %s describes %s", identity.Contract, mapping.Name, mapping.Contract)
			case !mapping.Verified(identity.Version):
				problem("agent "+name, "runtime version %s is not verified by mapping %s (verified: %s)", identity.Version, mapping.Name, strings.Join(mapping.VerifiedVersions, ", "))
			}
		}
	}
	sort.Strings(report.Problems)
	return report, nil
}

func sortedNames[V any](m map[string]V) []string {
	names := make([]string, 0, len(m))
	for name := range m {
		names = append(names, name)
	}
	sort.Strings(names)
	return names
}

var _ ProposedCheck = (*Checker)(nil)

// ProblemsAdded checks these settings with doc written to the global layer
// and reports the problems it adds.
func (c *Checker) ProblemsAdded(ctx context.Context, doc definition.Document) ([]string, error) {
	before, err := c.Check(ctx, false)
	if err != nil {
		return nil, err
	}
	after := *c
	after.Definitions = withDocument{DefinitionSource: c.Definitions, doc: doc}
	report, err := after.Check(ctx, false)
	if err != nil {
		return nil, err
	}
	existing := map[string]bool{}
	for _, problem := range before.Problems {
		existing[problem] = true
	}
	var added []string
	for _, problem := range report.Problems {
		if !existing[problem] {
			added = append(added, problem)
		}
	}
	return added, nil
}

// withDocument is a definitions source with one global document added or
// replaced; a project document of the same name still takes priority.
type withDocument struct {
	DefinitionSource
	doc definition.Document
}

func (w withDocument) Read(ctx context.Context, kind definition.Kind, name string) (definition.Document, error) {
	if kind != w.doc.Source.Kind || name != w.doc.Source.Name {
		return w.DefinitionSource.Read(ctx, kind, name)
	}
	if current, err := w.DefinitionSource.Read(ctx, kind, name); err == nil && current.Source.Project {
		return current, nil
	}
	return w.doc, nil
}

func (w withDocument) List(ctx context.Context, kind definition.Kind) ([]string, error) {
	names, err := w.DefinitionSource.List(ctx, kind)
	if err != nil || kind != w.doc.Source.Kind || contains(names, w.doc.Source.Name) {
		return names, err
	}
	names = append(append([]string(nil), names...), w.doc.Source.Name)
	sort.Strings(names)
	return names, nil
}
