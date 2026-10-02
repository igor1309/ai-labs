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
	found, err := c.check(ctx, probe)
	return found.report, err
}

// checked is what a check finds: its report, and each document and problem
// as the components that refuse what depends on a problem read them.
type checked struct {
	report    contract.CheckReport
	documents []checkedDocument
	problems  []checkedProblem
}

// checkedDocument is one document the settings list.
type checkedDocument struct {
	ref  DocumentRef
	path string
	uses []DocumentRef // whether or not they exist
}

// checkedProblem is one problem, as reported and as found.
type checkedProblem struct {
	text string // as reported, naming its document
	// The document it is about; nil on one that stops every command
	// (ADR-013 rule 4).
	about   *DocumentRef
	message string // without its document's name
	// The agent it depends on, on a process's problem (ADR-013 rule 2).
	agent string
}

func (c *Checker) check(ctx context.Context, probe bool) (checked, error) {
	report := contract.CheckReport{Checked: map[string]int{}}
	index := map[DocumentRef]int{}   // into report.Definitions and documents
	var documents []checkedDocument  // as report.Definitions
	listed := map[DocumentRef]bool{} // in the settings, read or not
	// Every problem, with the document it is about (ADR-013).
	var found []checkedProblem
	about := func(ref DocumentRef, subject, message, agent string) {
		text := subject + ": " + message
		if ref == serviceRef {
			// Every call depends on it, and every check on its vocabulary
			// and limits (ADR-013 rule 4).
			found = append(found, checkedProblem{text: text, message: message})
			return
		}
		found = append(found, checkedProblem{text: text, about: &ref, message: message, agent: agent})
	}
	stops := func(subject, format string, args ...any) {
		message := fmt.Sprintf(format, args...)
		found = append(found, checkedProblem{text: subject + ": " + message, message: message})
	}
	problem := func(subject, format string, args ...any) {
		ref, ok := subjectRef(subject)
		if !ok {
			stops(subject, format, args...)
			return
		}
		about(ref, subject, fmt.Sprintf(format, args...), "")
	}
	settingsProblem := func(p settings.Problem) {
		ref, ok := subjectRef(p.Subject)
		if p.Unattributed || !ok {
			stops(p.Subject, "%s", p.Message)
			return
		}
		about(ref, p.Subject, p.Message, p.Agent)
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
				// Nothing can name what it holds (ADR-013 rule 4).
				stops("settings directory "+string(kind), "cannot be listed: %v", err)
				return nil
			}
		}
		for _, name := range names {
			listed[DocumentRef{Kind: kind, Name: name}] = true
			if kind != definition.KindService && !definition.ValidName(name) {
				// Nothing can name such a document (ADR-013 rule 4).
				stops(kind.Singular()+" "+name, "%q is not a valid name; rename the file", name)
				continue
			}
			doc, err := c.definitions.Read(ctx, kind, name)
			if doc.Source.Overrides != "" {
				report.Overrides = append(report.Overrides, fmt.Sprintf("%s %s: %s overrides %s", kind.Singular(), name, doc.Source.Path, doc.Source.Overrides))
			}
			layer := "global"
			if doc.Source.Project {
				layer = "project"
			}
			index[DocumentRef{Kind: kind, Name: name}] = len(report.Definitions)
			report.Definitions = append(report.Definitions, contract.Definition{Kind: string(kind), Name: name, Layer: layer, Path: doc.Source.Path, Overrides: doc.Source.Overrides})
			documents = append(documents, checkedDocument{ref: DocumentRef{Kind: kind, Name: name}, path: doc.Source.Path})
			if err != nil {
				report.Definitions[len(report.Definitions)-1].Invalid = true
				problem(kind.Singular()+" "+name, "%v", err)
				continue
			}
			report.Checked[string(kind)]++
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
		// Optional: listed only when the document exists.
		{definition.KindWorkspace, func(d definition.Document) error {
			_, err := definition.ParseWorkspace(d)
			return err
		}},
	}
	for _, step := range steps {
		if err := each(step.kind, step.parse); err != nil {
			return checked{report: report}, err
		}
	}
	// File names define the run namespace even when their documents cannot
	// be parsed. settings.Check handles the pair when both parsed.
	for ref := range listed {
		if ref.Kind != definition.KindWorkflow || !listed[DocumentRef{Kind: definition.KindProcess, Name: ref.Name}] {
			continue
		}
		_, processOK := bundle.Processes[ref.Name]
		_, workflowOK := bundle.Workflows[ref.Name]
		if bundle.Service == nil || !processOK || !workflowOK {
			stops("workflow "+ref.Name, "a process has the same name; name one of them otherwise")
		}
	}
	// What each problem refuses, once every problem is known.
	finish := func() checked {
		sort.SliceStable(found, func(i, j int) bool { return found[i].text < found[j].text })
		reached := newReach()
		for _, document := range documents {
			reached.documents[document.ref] = reachDocument{path: document.path, uses: document.uses}
		}
		var processes, workflows []DocumentRef
		for ref := range listed {
			switch ref.Kind {
			case definition.KindProcess:
				processes = append(processes, ref)
			case definition.KindWorkflow:
				workflows = append(workflows, ref)
			}
		}
		byName := func(refs []DocumentRef) {
			sort.Slice(refs, func(i, j int) bool { return refs[i].Name < refs[j].Name })
		}
		byName(processes)
		byName(workflows)
		for _, problem := range found {
			report.Problems = append(report.Problems, problem.text)
			item := contract.ProblemReach{Problem: problem.text, Stops: problem.about == nil}
			if subject := problem.about; subject != nil {
				item.Subject = &contract.DefinitionRef{Kind: string(subject.Kind), Name: subject.Name}
				item.Agent = problem.agent
				item.Processes = reached.refuses(*subject, processes)
				item.Workflows = reached.refuses(*subject, workflows)
			}
			report.Reach = append(report.Reach, item)
		}
		return checked{report: report, documents: documents, problems: found}
	}
	// What each definition references, and the reverse.
	link := func(from DocumentRef, kind definition.Kind, name string) {
		source, ok := index[from]
		if name == "" || !ok { // a name unlike its file is reported as a problem
			return
		}
		to := DocumentRef{Kind: kind, Name: name}
		documents[source].uses = append(documents[source].uses, to)
		report.Definitions[source].Uses = append(report.Definitions[source].Uses, contract.DefinitionRef{Kind: string(to.Kind), Name: to.Name})
		if i, ok := index[to]; ok {
			report.Definitions[i].UsedBy = append(report.Definitions[i].UsedBy, contract.DefinitionRef{Kind: string(from.Kind), Name: from.Name})
		}
	}
	for _, name := range sortedNames(bundle.Agents) {
		link(DocumentRef{Kind: definition.KindAgent, Name: name}, definition.KindRuntime, bundle.Agents[name].Runtime)
	}
	for _, name := range sortedNames(bundle.Processes) {
		process, from := bundle.Processes[name], DocumentRef{Kind: definition.KindProcess, Name: name}
		link(from, definition.KindAgent, process.Agent)
		link(from, definition.KindPolicy, process.Policy)
		link(from, definition.KindVerify, process.VerifyName)
		if process.Output.Format == "json" {
			link(from, definition.KindSchema, process.Output.Schema)
		}
		// A call of a checkout without a setup of its own reads the
		// workspace settings for their default (ADR-012), whether or not
		// they parse; a missing document is no default, not a missing
		// reference.
		if process.Checkout != "" && process.Setup == nil && listed[workspaceRef] {
			link(from, definition.KindWorkspace, workspaceRef.Name)
		}
	}
	for _, name := range sortedNames(bundle.Workflows) {
		from := DocumentRef{Kind: definition.KindWorkflow, Name: name}
		for _, node := range bundle.Workflows[name].Nodes() {
			link(from, definition.KindProcess, node.Process)
		}
	}

	for _, name := range sortedNames(bundle.Processes) {
		process := bundle.Resolved(name)
		switch {
		case process.Verify != nil:
			report.Warnings = append(report.Warnings, "process "+name+": "+VerifyWarning)
		case process.VerifyName != "" && !listed[DocumentRef{Kind: definition.KindVerify, Name: process.VerifyName}]:
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
func subjectRef(subject string) (DocumentRef, bool) {
	if subject == "service" {
		return serviceRef, true
	}
	for _, kind := range allKinds {
		if name, ok := strings.CutPrefix(subject, kind.Singular()+" "); ok {
			return DocumentRef{Kind: kind, Name: name}, true
		}
	}
	return DocumentRef{}, false
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
