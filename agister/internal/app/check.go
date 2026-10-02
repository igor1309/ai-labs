package app

import (
	"context"
	"errors"
	"fmt"
	"sort"

	"github.com/igor1309/ai-labs/agister/internal/contract"
	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
	"github.com/igor1309/ai-labs/agister/internal/domain/settings"
)

// Checker validates all settings at once, before any call needs them.
type Checker struct {
	definitions CheckDefinitions
	validator   CheckValidator
	runtimes    CheckRuntimes
	sources     []string // input source kinds the code provides
}

// CheckDefinitions supplies every definition document and its origin.
type CheckDefinitions interface {
	Read(ctx context.Context, kind definition.Kind, name string) (definition.Document, error)
	List(ctx context.Context, kind definition.Kind) ([]string, error)
}

// CheckValidator compiles output schemas.
type CheckValidator interface {
	Compile(schema []byte) error
}

// CheckRuntimes is the catalog of runtime adapters the code provides, and
// what one of them reports about itself, to probe it.
type CheckRuntimes interface {
	Adapters() []string
	Identity(ctx context.Context, adapter, command string) (RuntimeIdentity, error)
}

// CheckAdapters are what a Checker runs on besides the settings it checks.
type CheckAdapters struct {
	Validator CheckValidator
	Runtimes  CheckRuntimes
}

// NewChecker returns the use case that validates all settings. sources are
// the input source kinds the code provides.
func NewChecker(definitions CheckDefinitions, validator CheckValidator, runtimes CheckRuntimes, sources []string) *Checker {
	return &Checker{definitions: definitions, validator: validator, runtimes: runtimes, sources: sources}
}

func (c *Checker) Check(ctx context.Context, probe bool) (contract.CheckReport, error) {
	report := contract.CheckReport{Checked: map[string]int{}}
	index := map[contract.DefinitionRef]int{}   // into report.Definitions
	listed := map[contract.DefinitionRef]bool{} // in the settings, read or not
	problem := func(subject, format string, args ...any) {
		report.Problems = append(report.Problems, subject+": "+fmt.Sprintf(format, args...))
	}
	bundle := settings.Bundle{
		Agents:    map[string]definition.Agent{},
		Processes: map[string]definition.Process{},
		Policies:  map[string]definition.Policy{},
		Mappings:  map[string]definition.Mapping{},
		Schemas:   map[string]bool{},
		Workflows: map[string]definition.Workflow{},
		Verifies:  map[string]definition.Verification{},
		Prompts:   map[string]bool{},
	}

	var workspace *definition.Workspace // unset: none, or invalid

	// Each document on its own.
	each := func(kind definition.Kind, parse func(definition.Document) error) error {
		names := []string{"service"}
		if kind != definition.KindService {
			var err error
			if names, err = c.definitions.List(ctx, kind); err != nil {
				return err
			}
		}
		for _, name := range names {
			listed[contract.DefinitionRef{Kind: string(kind), Name: name}] = true
			if kind == definition.KindPrompt {
				// One that cannot be read or parsed is a problem of its
				// own (ADR-013 rule 1); the processes that name it still
				// find it.
				bundle.Prompts[name] = true
			}
			doc, err := c.definitions.Read(ctx, kind, name)
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
		{definition.KindVerify, func(d definition.Document) error {
			v, err := definition.ParseVerify(d)
			if err == nil {
				bundle.Verifies[v.Name] = v
			}
			return err
		}},
		{definition.KindPrompt, func(d definition.Document) error {
			_, err := definition.ParsePrompt(d)
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
			if err := c.validator.Compile(d.Bytes); err != nil {
				return err
			}
			bundle.Schemas[d.Source.Name] = true
			return nil
		}},
		{definition.KindWorkflow, func(d definition.Document) error {
			w, err := definition.ParseWorkflow(d)
			if err == nil {
				bundle.Workflows[w.Name] = w
			}
			return err
		}},
		// Optional: listed only when the document exists.
		{definition.KindWorkspace, func(d definition.Document) error {
			parsed, err := definition.ParseWorkspace(d)
			if err == nil {
				workspace = &parsed
			}
			return err
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
		link(from, definition.KindVerify, process.VerifyName)
		for _, prompt := range process.Prompts() {
			link(from, definition.KindPrompt, prompt)
		}
		if process.Output.Format == "json" {
			link(from, definition.KindSchema, process.Output.Schema)
		}
		// The workspace's setup is the default of a checkout without one of
		// its own (ADR-012); a missing document is no default, not a
		// missing reference.
		if _, fromWorkspace := process.EffectiveSetup(workspace); fromWorkspace {
			link(from, definition.KindWorkspace, string(definition.KindWorkspace))
		}
	}
	for _, name := range sortedNames(bundle.Workflows) {
		from := contract.DefinitionRef{Kind: string(definition.KindWorkflow), Name: name}
		for _, node := range bundle.Workflows[name].Nodes() {
			link(from, definition.KindProcess, node.Process)
		}
	}

	for _, name := range sortedNames(bundle.Processes) {
		process := bundle.Resolved(name)
		switch {
		case process.Verify != nil:
			report.Warnings = append(report.Warnings, "process "+name+": "+VerifyWarning)
		case process.VerifyName != "" && !listed[contract.DefinitionRef{Kind: string(definition.KindVerify), Name: process.VerifyName}]:
			// Not a problem: every other process and workflow still runs
			// (ADR-010 rule 4). An invalid one is a problem of its own.
			report.Warnings = append(report.Warnings, fmt.Sprintf("process %s: names verify:%s, which does not exist; calls of it are refused until verifies/%s.yaml exists", name, process.VerifyName, process.VerifyName))
		}
	}

	if bundle.Service == nil {
		sort.Strings(report.Problems)
		return report, nil
	}

	// Across documents.
	known := c.runtimes.Adapters()
	// The core itself supplies a join's collection (ADR-003 rule 4) and the
	// prompts a process names, which it reads from the settings (ADR-013).
	sources := append(append([]string(nil), c.sources...), definition.CollectionSource, definition.PromptSource)
	for _, p := range settings.Check(bundle, settings.Mechanisms{Sources: sources, Adapters: known}) {
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
			if !contains(known, mapping.Adapter) {
				continue // reported as an unknown adapter
			}
			identity, err := c.runtimes.Identity(ctx, mapping.Adapter, agent.Command)
			switch {
			case err != nil:
				problem("agent "+name, "runtime unavailable: %v", err)
			case identity.Contract != mapping.Contract:
				problem("agent "+name, "adapter implements %s, mapping %s describes %s", identity.Contract, mapping.Name, mapping.Contract)
			case !mapping.Verified(identity.Version):
				problem("agent "+name, "mapping %s verifies no primitive for runtime version %s", mapping.Name, identity.Version)
			default:
				for _, p := range settings.PlanProblems(bundle, agent, identity.Version) {
					report.Problems = append(report.Problems, p.String())
				}
				// Repairs resume the call's session, which only the
				// runtime can say it supports.
				for _, process := range sortedNames(bundle.Processes) {
					if verify := bundle.Resolved(process).Verify; bundle.Processes[process].Agent == name && verify.Repairs() && !identity.Resume {
						problem("process "+process, "verify.max_attempts %d repairs in the call's session, but runtime %s cannot resume sessions", verify.MaxAttempts, mapping.Name)
					}
				}
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
	after.definitions = withDocument{CheckDefinitions: c.definitions, doc: doc}
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
	CheckDefinitions
	doc definition.Document
}

func (w withDocument) Read(ctx context.Context, kind definition.Kind, name string) (definition.Document, error) {
	if kind != w.doc.Source.Kind || name != w.doc.Source.Name {
		return w.CheckDefinitions.Read(ctx, kind, name)
	}
	if current, err := w.CheckDefinitions.Read(ctx, kind, name); err == nil && current.Source.Project {
		return current, nil
	}
	return w.doc, nil
}

func (w withDocument) List(ctx context.Context, kind definition.Kind) ([]string, error) {
	names, err := w.CheckDefinitions.List(ctx, kind)
	if err != nil || kind != w.doc.Source.Kind || contains(names, w.doc.Source.Name) {
		return names, err
	}
	names = append(append([]string(nil), names...), w.doc.Source.Name)
	sort.Strings(names)
	return names, nil
}
