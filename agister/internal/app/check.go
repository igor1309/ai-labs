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
	return found.Report, err
}

// Checked checks the settings, without asking the runtimes, and returns
// what it found: its report, and each document, problem and block as the
// components that refuse what depends on a problem or a block read them.
func (c *Checker) Checked(ctx context.Context) (CheckResult, error) {
	return c.check(ctx, false)
}

// CheckResult is what a check finds: its report, and each document,
// problem and block as the components that refuse what depends on a
// problem or a block read them.
type CheckResult struct {
	Report    contract.CheckReport
	Documents []CheckedDocument
	Problems  []CheckedProblem
	// What the repository blocks (ADR-018); none when its blocks.yaml has
	// a problem, which stops every command.
	Blocks []CheckedBlock
}

// CheckedBlock is one document the repository's blocks.yaml blocks.
type CheckedBlock struct {
	Ref    DocumentRef
	Path   string // of the blocks.yaml
	Reason string
}

// CheckedDocument is one document the settings list.
type CheckedDocument struct {
	Ref  DocumentRef
	Path string
	Uses []DocumentRef // whether or not they exist
}

// CheckedProblem is one problem, as reported and as found.
type CheckedProblem struct {
	Text string // as reported, naming its document
	// The document it is about; nil on one that stops every command
	// (ADR-015 rule 4).
	About   *DocumentRef
	Message string // without its document's name
	// The agent it depends on, on a process's problem (ADR-015 rule 2).
	Agent string
	// Unknown: it names a mechanism the code does not provide, as settings
	// written for a newer Agister would.
	Unknown bool
}

func (c *Checker) check(ctx context.Context, probe bool) (CheckResult, error) {
	report := contract.CheckReport{Checked: map[string]int{}}
	index := map[DocumentRef]int{}   // into report.Definitions and documents
	var documents []CheckedDocument  // as report.Definitions
	listed := map[DocumentRef]bool{} // in the settings, read or not
	// Every problem, with the document it is about (ADR-015).
	var found []CheckedProblem
	about := func(ref DocumentRef, p settings.Problem) {
		if ref == serviceRef {
			// Every call depends on it, and every check on its vocabulary
			// and limits (ADR-015 rule 4).
			found = append(found, CheckedProblem{Text: p.String(), Message: p.Message, Unknown: p.Unknown})
			return
		}
		found = append(found, CheckedProblem{Text: p.String(), About: &ref, Message: p.Message, Agent: p.Agent, Unknown: p.Unknown})
	}
	stops := func(subject, format string, args ...any) {
		message := fmt.Sprintf(format, args...)
		found = append(found, CheckedProblem{Text: subject + ": " + message, Message: message})
	}
	settingsProblem := func(p settings.Problem) {
		ref, ok := subjectRef(p.Subject)
		if p.Unattributed || !ok {
			found = append(found, CheckedProblem{Text: p.String(), Message: p.Message, Unknown: p.Unknown})
			return
		}
		about(ref, p)
	}
	problem := func(subject, format string, args ...any) {
		settingsProblem(settings.Problem{Subject: subject, Message: fmt.Sprintf(format, args...)})
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
		Skills:    map[string]bool{},
	}

	// Each document on its own: one checks a document read, or not, err
	// saying why not; each checks every document of a kind the settings
	// list.
	one := func(kind definition.Kind, name string, doc definition.Document, err error, parse func(definition.Document) error) {
		if doc.Source.Overrides != "" {
			report.Overrides = append(report.Overrides, fmt.Sprintf("%s %s: %s overrides %s", kind.Singular(), name, doc.Source.Path, doc.Source.Overrides))
		}
		layer := "global"
		if doc.Source.Project {
			layer = "project"
		}
		index[DocumentRef{Kind: kind, Name: name}] = len(report.Definitions)
		report.Definitions = append(report.Definitions, contract.Definition{Kind: string(kind), Name: name, Layer: layer, Path: doc.Source.Path, Overrides: doc.Source.Overrides})
		documents = append(documents, CheckedDocument{Ref: DocumentRef{Kind: kind, Name: name}, Path: doc.Source.Path})
		if err != nil {
			report.Definitions[len(report.Definitions)-1].Invalid = true
			problem(kind.Singular()+" "+name, "%v", err)
			return
		}
		report.Checked[string(kind)]++
		if err := parse(doc); err != nil {
			report.Definitions[len(report.Definitions)-1].Invalid = true
			var invalid *definition.InvalidError
			if errors.As(err, &invalid) {
				for _, p := range invalid.Problems {
					settingsProblem(settings.Problem{Subject: kind.Singular() + " " + name, Message: p.Message, Unknown: p.Unknown})
				}
			} else {
				problem(kind.Singular()+" "+name, "%v", err)
			}
		}
	}
	each := func(kind definition.Kind, parse func(definition.Document) error) error {
		names := []string{"service"}
		if kind != definition.KindService {
			var err error
			if names, err = c.definitions.List(ctx, kind); err != nil {
				// Nothing can name what it holds (ADR-015 rule 4).
				stops("settings directory "+string(kind), "cannot be listed: %v", err)
				return nil
			}
		}
		for _, name := range names {
			listed[DocumentRef{Kind: kind, Name: name}] = true
			if kind == definition.KindPrompt {
				// One that cannot be read or parsed is a problem of its
				// own (ADR-014 rule 1); the processes that name it still
				// find it.
				bundle.Prompts[name] = true
			}
			if kind == definition.KindSkill {
				// So is a broken skill (ADR-021 rule 4): what names it still
				// finds it.
				bundle.Skills[name] = true
			}
			if kind != definition.KindService && !definition.ValidName(name) {
				// Nothing can name such a document (ADR-015 rule 4).
				what := "file"
				if kind == definition.KindSkill {
					what = "folder"
				}
				stops(kind.Singular()+" "+name, "%q is not a valid name; rename the %s", name, what)
				continue
			}
			doc, err := c.definitions.Read(ctx, kind, name)
			one(kind, name, doc, err, parse)
		}
		return nil
	}
	parsePrompt := func(d definition.Document) error {
		_, err := definition.ParsePrompt(d)
		return err
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
		{definition.KindPrompt, parsePrompt},
		{definition.KindSkill, func(d definition.Document) error {
			_, err := definition.ParseSkill(d)
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
			return CheckResult{Report: report}, err
		}
	}
	// A prompt a process names that the settings do not list is read as
	// a call reads it: only one neither layer has is missing. Anything
	// else at its path, such as a directory, is a document that cannot be
	// read, a problem of its own that refuses the process (ADR-019 rule 1).
	for _, name := range sortedNames(bundle.Processes) {
		for _, prompt := range bundle.Processes[name].Prompts() {
			ref := DocumentRef{Kind: definition.KindPrompt, Name: prompt}
			if listed[ref] {
				continue
			}
			doc, err := c.definitions.Read(ctx, definition.KindPrompt, prompt)
			if errors.Is(err, definition.ErrNotFound) {
				continue
			}
			listed[ref], bundle.Prompts[prompt] = true, true
			one(definition.KindPrompt, prompt, doc, err, parsePrompt)
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
	blocks := c.blocks(ctx, listed, report.Checked, &found)
	// What each problem and block refuses, once every problem is known.
	finish := func() CheckResult {
		sort.SliceStable(found, func(i, j int) bool { return found[i].Text < found[j].Text })
		reached := newReach()
		for _, document := range documents {
			reached.documents[document.Ref] = reachDocument{path: document.Path, uses: document.Uses}
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
			report.Problems = append(report.Problems, contract.Problem{Message: problem.Text, Unknown: problem.Unknown})
			item := contract.ProblemReach{Problem: problem.Text, Stops: problem.About == nil}
			if subject := problem.About; subject != nil {
				item.Subject = &contract.DefinitionRef{Kind: string(subject.Kind), Name: subject.Name}
				item.Agent = problem.Agent
				item.Processes = reached.refuses(*subject, processes)
				item.Workflows = reached.refuses(*subject, workflows)
			}
			report.Reach = append(report.Reach, item)
		}
		for _, block := range blocks {
			report.Blocks = append(report.Blocks, contract.Block{
				Ref:  contract.DefinitionRef{Kind: string(block.Ref.Kind), Name: block.Ref.Name},
				Path: block.Path, Reason: block.Reason,
				Processes: reached.refuses(block.Ref, processes),
				Workflows: reached.refuses(block.Ref, workflows),
			})
		}
		return CheckResult{Report: report, Documents: documents, Problems: found, Blocks: blocks}
	}
	// What each definition references, and the reverse.
	link := func(from DocumentRef, kind definition.Kind, name string, optional bool) {
		source, ok := index[from]
		if name == "" || !ok { // a name unlike its file is reported as a problem
			return
		}
		to := DocumentRef{Kind: kind, Name: name}
		documents[source].Uses = append(documents[source].Uses, to)
		report.Definitions[source].Uses = append(report.Definitions[source].Uses, contract.DefinitionRef{Kind: string(to.Kind), Name: to.Name, Optional: optional})
		if i, ok := index[to]; ok {
			report.Definitions[i].UsedBy = append(report.Definitions[i].UsedBy, contract.DefinitionRef{Kind: string(from.Kind), Name: from.Name})
		}
	}
	for _, name := range sortedNames(bundle.Agents) {
		agent, from := bundle.Agents[name], DocumentRef{Kind: definition.KindAgent, Name: name}
		link(from, definition.KindRuntime, agent.Runtime, false)
		for _, skill := range agent.Skills {
			link(from, definition.KindSkill, skill, false)
		}
	}
	for _, name := range sortedNames(bundle.Processes) {
		process, from := bundle.Processes[name], DocumentRef{Kind: definition.KindProcess, Name: name}
		link(from, definition.KindAgent, process.Agent, false)
		link(from, definition.KindPolicy, process.Policy, false)
		link(from, definition.KindVerify, process.VerifyName, false)
		optional := process.OptionalPrompts()
		for _, prompt := range process.Prompts() {
			link(from, definition.KindPrompt, prompt, contains(optional, prompt))
		}
		for _, skill := range process.Skills {
			link(from, definition.KindSkill, skill, false)
		}
		if process.Output.Format == "json" {
			link(from, definition.KindSchema, process.Output.Schema, false)
		}
		// A call of a checkout without a setup of its own reads the
		// workspace settings for their default (ADR-012), whether or not
		// they parse; a missing document is no default, not a missing
		// reference.
		if process.Checkout != "" && process.Setup == nil && listed[workspaceRef] {
			link(from, definition.KindWorkspace, workspaceRef.Name, false)
		}
	}
	for _, name := range sortedNames(bundle.Workflows) {
		from := DocumentRef{Kind: definition.KindWorkflow, Name: name}
		for _, node := range bundle.Workflows[name].Nodes() {
			link(from, definition.KindProcess, node.Process, false)
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
	// The core itself supplies a join's collection (ADR-003 rule 4) and the
	// prompts a process names, which it reads from the settings (ADR-014).
	sources := append(append([]string(nil), c.sources...), definition.CollectionSource, definition.PromptSource)
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

// blocks reads the repository's blocks.yaml (ADR-018) and returns what it
// blocks, adding its problems to found. listed is every document the
// settings list. Only the repository's blocks: home's is a problem of
// home's settings that refuses nothing (rule 1). A problem of the
// repository's cannot be attributed: what it was meant to block cannot be
// known, so it stops every command and blocks nothing itself (rule 5).
func (c *Checker) blocks(ctx context.Context, listed map[DocumentRef]bool, checked map[string]int, found *[]CheckedProblem) []CheckedBlock {
	stops := func(subject, message string, unknown bool) {
		*found = append(*found, CheckedProblem{Text: subject + ": " + message, Message: message, Unknown: unknown})
	}
	names, err := c.definitions.List(ctx, definition.KindBlocks)
	if err != nil {
		stops("blocks", fmt.Sprintf("cannot be listed: %v", err), false)
		return nil
	}
	var blocks []CheckedBlock
	for _, name := range names {
		doc, err := c.definitions.Read(ctx, definition.KindBlocks, name)
		home := func(path string) {
			message := "home's settings block nothing: only a repository's settings have blocks; remove it"
			about := blocksRef // each problem its own, so no caller's change reaches another
			*found = append(*found, CheckedProblem{Text: "blocks (" + path + "): " + message, About: &about, Message: message})
		}
		if !doc.Source.Project {
			home(doc.Source.Path)
			continue
		}
		if doc.Source.Overrides != "" {
			home(doc.Source.Overrides)
		}
		subject := "blocks (" + doc.Source.Path + ")"
		if err != nil {
			stops(subject, err.Error(), false)
			continue
		}
		checked[string(definition.KindBlocks)]++
		parsed, err := definition.ParseBlocks(doc)
		var invalid *definition.InvalidError
		switch {
		case errors.As(err, &invalid):
			for _, p := range invalid.Problems {
				stops(subject, p.Message, p.Unknown)
			}
			continue
		case err != nil:
			stops(subject, err.Error(), false)
			continue
		}
		var named []CheckedBlock
		missing := false
		for i, block := range parsed.Blocks {
			ref := DocumentRef{Kind: block.Kind, Name: block.Name}
			if !listed[ref] {
				stops(subject, fmt.Sprintf("blocks[%d].ref: %s is in neither the repository's settings nor home's", i, label(ref)), false)
				missing = true
				continue
			}
			named = append(named, CheckedBlock{Ref: ref, Path: doc.Source.Path, Reason: block.Reason})
		}
		if !missing {
			blocks = append(blocks, named...)
		}
	}
	return blocks
}

// subjectRef is the document a problem's subject names, as check names it:
// "agent a", "runtime mapping rt", "service".
func subjectRef(subject string) (DocumentRef, bool) {
	if subject == "service" {
		return serviceRef, true
	}
	for _, kind := range allKinds() {
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
		existing[problem.Message] = true
	}
	var added []string
	for _, problem := range report.Problems {
		if !existing[problem.Message] {
			added = append(added, problem.Message)
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
