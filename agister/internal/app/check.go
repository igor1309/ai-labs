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
			if err := parse(doc); err != nil {
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
