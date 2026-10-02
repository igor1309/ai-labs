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
	// Every problem, with the document it is about (ADR-012).
	var found []contract.ProblemReach
	about := func(ref contract.DefinitionRef, text string) {
		if ref == serviceRef {
			// Every call depends on it, and every check on its vocabulary
			// and limits (ADR-012 rule 4).
			found = append(found, contract.ProblemReach{Problem: text, Stops: true})
			return
		}
		subject := ref
		found = append(found, contract.ProblemReach{Problem: text, Subject: &subject})
	}
	problem := func(subject, format string, args ...any) {
		text := subject + ": " + fmt.Sprintf(format, args...)
		ref, ok := subjectRef(subject)
		if !ok {
			found = append(found, contract.ProblemReach{Problem: text, Stops: true})
			return
		}
		about(ref, text)
	}
	stops := func(subject, format string, args ...any) {
		found = append(found, contract.ProblemReach{Problem: subject + ": " + fmt.Sprintf(format, args...), Stops: true})
	}
	settingsProblem := func(p settings.Problem) {
		ref, ok := subjectRef(p.Subject)
		if p.Unattributed || !ok {
			stops(p.Subject, "%s", p.Message)
			return
		}
		about(ref, p.String())
		found[len(found)-1].Agent = p.Agent
	}
	bundle := settings.Bundle{
		Agents:    map[string]definition.Agent{},
		Processes: map[string]definition.Process{},
		Policies:  map[string]definition.Policy{},
		Mappings:  map[string]definition.Mapping{},
		Schemas:   map[string]bool{},
		Workflows: map[string]definition.Workflow{},
		Verifies:  map[string]definition.Verification{},
	}

	// Each document on its own.
	each := func(kind definition.Kind, parse func(definition.Document) error) error {
		names := []string{"service"}
		if kind != definition.KindService {
			var err error
			if names, err = c.definitions.List(ctx, kind); err != nil {
				// Nothing can name what it holds (ADR-012 rule 4).
				stops("settings directory "+string(kind), "cannot be listed: %v", err)
				return nil
			}
		}
		for _, name := range names {
			listed[contract.DefinitionRef{Kind: string(kind), Name: name}] = true
			if kind != definition.KindService && !definition.ValidName(name) {
				// Nothing can name such a document (ADR-012 rule 4).
				stops(kind.Singular()+" "+name, "%q is not a valid name; rename the file", name)
				continue
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
	}
	for _, step := range steps {
		if err := each(step.kind, step.parse); err != nil {
			return report, err
		}
	}
	// What each problem refuses, once every problem is known.
	finish := func() contract.CheckReport {
		sort.SliceStable(found, func(i, j int) bool { return found[i].Problem < found[j].Problem })
		var processes, workflows []contract.DefinitionRef
		for _, kind := range []definition.Kind{definition.KindProcess, definition.KindWorkflow} {
			for ref := range listed {
				switch {
				case ref.Kind != string(kind):
				case kind == definition.KindProcess:
					processes = append(processes, ref)
				default:
					workflows = append(workflows, ref)
				}
			}
		}
		byName := func(refs []contract.DefinitionRef) {
			sort.Slice(refs, func(i, j int) bool { return refs[i].Name < refs[j].Name })
		}
		byName(processes)
		byName(workflows)
		reached := newReach(contract.CheckReport{Definitions: report.Definitions})
		for i := range found {
			report.Problems = append(report.Problems, found[i].Problem)
			if subject := found[i].Subject; subject != nil {
				found[i].Processes = reached.refuses(*subject, processes)
				found[i].Workflows = reached.refuses(*subject, workflows)
			}
		}
		report.Reach = found
		return report
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
		if process.Output.Format == "json" {
			link(from, definition.KindSchema, process.Output.Schema)
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
		return finish(), nil
	}

	// Across documents.
	known := c.runtimes.Adapters()
	// The core itself supplies a join's collection (ADR-003 rule 4).
	sources := append(append([]string(nil), c.sources...), definition.CollectionSource)
	for _, p := range settings.Check(bundle, settings.Mechanisms{Sources: sources, Adapters: known}) {
		settingsProblem(p)
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
					settingsProblem(p)
				}
				// Repairs resume the call's session, which only the
				// runtime can say it supports.
				for _, process := range sortedNames(bundle.Processes) {
					if verify := bundle.Resolved(process).Verify; bundle.Processes[process].Agent == name && verify.Repairs() && !identity.Resume {
						settingsProblem(settings.Problem{
							Subject: "process " + process, Agent: name,
							Message: fmt.Sprintf("verify.max_attempts %d repairs in the call's session, but runtime %s cannot resume sessions", verify.MaxAttempts, mapping.Name),
						})
					}
				}
			}
		}
	}
	return finish(), nil
}

// subjectRef is the document a problem's subject names, as check names it:
// "agent a", "runtime mapping rt", "service".
func subjectRef(subject string) (contract.DefinitionRef, bool) {
	if subject == "service" {
		return serviceRef, true
	}
	for _, kind := range allKinds {
		if name, ok := strings.CutPrefix(subject, kind.Singular()+" "); ok {
			return contract.DefinitionRef{Kind: string(kind), Name: name}, true
		}
	}
	return contract.DefinitionRef{}, false
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
