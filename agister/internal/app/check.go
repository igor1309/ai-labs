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
	// probes verify a version the settings verify nothing for; nil: none
	// is probed.
	probes CheckProbes
}

// CheckDefinitions supplies every definition document and its origin, and
// the layers they are read from (ADR-028 rule 1). Read reads a document as
// a call reads it; ReadListed one as the settings list it, a prompt never
// from a folder a layer.yaml lists (rule 9), and any other kind as Read.
type CheckDefinitions interface {
	Read(ctx context.Context, kind definition.Kind, name string) (definition.Document, error)
	ReadListed(ctx context.Context, kind definition.Kind, name string) (definition.Document, error)
	List(ctx context.Context, kind definition.Kind) ([]string, error)
	Layers(ctx context.Context) []definition.LayerDir
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

// CheckProbes verify a runtime version the settings verify no primitive
// for (ADR-029): the primitives a probe found holding, none when its
// adapter has no probe, and an error when the probe failed.
type CheckProbes interface {
	Verified(ctx context.Context, adapter, command, version string) ([]string, error)
}

// CheckAdapters are what a Checker runs on besides the settings it checks.
type CheckAdapters struct {
	Validator CheckValidator
	Runtimes  CheckRuntimes
	// Probes verify a runtime version the settings verify no primitive
	// for (ADR-029); nil: none is probed.
	Probes CheckProbes
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
	// Binds are a workflow's nodes, in declaration order, the join last.
	Binds []NodeBinding
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
		Mappings:  map[string]definition.Mapping{},
		Schemas:   map[string]bool{},
		Workflows: map[string]definition.Workflow{},
		Verifies:  map[string]definition.Verification{},
		Prompts:   map[string]bool{},
		Skills:    map[string]bool{},
		Briefs:    map[string]bool{},
	}

	// A layer that is invalid is a problem of no document: it stops every
	// command launched under it (ADR-028 rules 1 and 7).
	for _, layer := range c.definitions.Layers(ctx) {
		for _, invalid := range layer.Invalid {
			stops(string(layer.Layer)+" layer "+layer.Dir, "%s: %s", invalid.Path, invalid.Reason)
		}
	}

	// A prompt a process names is read as a call reads it; any other the
	// settings list, as they list it: a folder a layer.yaml lists is read
	// only for a name a process gives, and its other files are not
	// settings (ADR-028 rule 9).
	named := c.namedPrompts(ctx)
	// A base is checked through each process that extends it, so it may
	// leave out what each of them sets (ADR-030 rule 9).
	bundle.Bases = c.bases(ctx)

	// Each document on its own: one checks a document read, or not, err
	// saying why not; each checks every document of a kind the settings
	// list.
	one := func(kind definition.Kind, name string, doc definition.Document, err error, parse func(definition.Document) error) {
		if farther := doc.Source.Layers; len(farther) > 1 {
			paths := make([]string, 0, len(farther)-1)
			for _, layer := range farther[1:] {
				paths = append(paths, layer.Path)
			}
			report.Overrides = append(report.Overrides, fmt.Sprintf("%s %s: %s overrides %s", kind.Singular(), name, doc.Source.Path, strings.Join(paths, ", ")))
		}
		index[DocumentRef{Kind: kind, Name: name}] = len(report.Definitions)
		report.Definitions = append(report.Definitions, contract.Definition{Kind: string(kind), Name: name, Layer: string(doc.Source.Layer), Path: doc.Source.Path, Layers: definitionLayers(doc.Source)})
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
			if kind == definition.KindBrief {
				// And a broken brief form (ADR-026 rule 8).
				bundle.Briefs[name] = true
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
			read := c.definitions.Read
			if kind == definition.KindPrompt && !named[name] {
				read = c.definitions.ReadListed
			}
			doc, err := read(ctx, kind, name)
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
		{definition.KindBrief, func(d definition.Document) error {
			_, err := definition.ParseBrief(d)
			return err
		}},
		{definition.KindProcess, func(d definition.Document) error {
			if len(bundle.Bases[d.Source.Name]) > 0 {
				return nil
			}
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
		// Optional: listed only when the document exists. A call reads
		// none of it (ADR-025): it is reported, not parsed.
		{definition.KindWorkspace, func(d definition.Document) error {
			report.Warnings = append(report.Warnings, "workspace settings "+d.Source.Path+": "+definition.ObsoleteWorkspace)
			return nil
		}},
	}
	for _, step := range steps {
		if err := each(step.kind, step.parse); err != nil {
			return CheckResult{Report: report}, err
		}
	}
	// A prompt a process names that the settings do not list is read as
	// a call reads it: only one no layer has is missing. One found in a
	// folder a layer lists is listed only so, under the process that names
	// it (ADR-028 rule 9). Anything else at its path, such as a directory,
	// is a document that cannot be read, a problem of its own that refuses
	// the process.
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
			reached.documents[document.Ref] = reachDocument{path: document.Path, uses: document.Uses, binds: document.Binds}
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
				item.Processes = reached.refuses(*subject, problem.Agent, processes)
				item.Workflows = reached.refuses(*subject, problem.Agent, workflows)
			}
			report.Reach = append(report.Reach, item)
		}
		for _, block := range blocks {
			report.Blocks = append(report.Blocks, contract.Block{
				Ref:  contract.DefinitionRef{Kind: string(block.Ref.Kind), Name: block.Ref.Name},
				Path: block.Path, Reason: block.Reason,
				Processes: reached.refuses(block.Ref, "", processes),
				Workflows: reached.refuses(block.Ref, "", workflows),
			})
		}
		return CheckResult{Report: report, Documents: documents, Problems: found, Blocks: blocks}
	}
	// What each definition references, and the reverse.
	link := func(from DocumentRef, kind definition.Kind, name string, guidance bool) {
		source, ok := index[from]
		if name == "" || !ok { // a name unlike its file is reported as a problem
			return
		}
		to := DocumentRef{Kind: kind, Name: name}
		documents[source].Uses = append(documents[source].Uses, to)
		report.Definitions[source].Uses = append(report.Definitions[source].Uses, contract.DefinitionRef{Kind: string(to.Kind), Name: to.Name, Guidance: guidance})
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
		link(from, definition.KindVerify, process.VerifyName, false)
		link(from, definition.KindPrompt, process.Prompt, false)
		for _, prompt := range process.Guidance {
			link(from, definition.KindPrompt, prompt, true)
		}
		for _, skill := range process.Skills {
			link(from, definition.KindSkill, skill, false)
		}
		if process.Output.Format == "json" {
			link(from, definition.KindSchema, process.Output.Schema, false)
		}
		for _, form := range process.Forms() {
			link(from, definition.KindBrief, form, false)
		}
	}
	// A process uses its base, whose problems and blocks refuse it.
	for _, base := range sortedNames(bundle.Bases) {
		for _, name := range bundle.Bases[base] {
			link(DocumentRef{Kind: definition.KindProcess, Name: name}, definition.KindProcess, base, false)
		}
	}
	for _, name := range sortedNames(bundle.Workflows) {
		from := DocumentRef{Kind: definition.KindWorkflow, Name: name}
		// A workflow uses the agent a node binds its process to, each once:
		// its problems and blocks refuse the workflow (ADR-030 rule 10).
		agents := map[string]bool{}
		for _, node := range bundle.Workflows[name].Nodes() {
			link(from, definition.KindProcess, node.Process, false)
			if !agents[node.Agent] {
				agents[node.Agent] = true
				link(from, definition.KindAgent, node.Agent, false)
			}
			if source, ok := index[from]; ok {
				documents[source].Binds = append(documents[source].Binds, NodeBinding{Process: node.Process, Agent: node.Agent})
			}
		}
		for _, form := range bundle.Workflows[name].Forms() {
			link(from, definition.KindBrief, form, false)
		}
	}

	// Settings a call no longer reads are ignored, and said so (ADR-025).
	for _, name := range sortedNames(bundle.Processes) {
		for _, obsolete := range bundle.Processes[name].Obsolete {
			report.Warnings = append(report.Warnings, "process "+name+": "+obsolete)
		}
	}
	for _, name := range sortedNames(bundle.Verifies) {
		for _, obsolete := range bundle.Verifies[name].Verify.Obsolete {
			report.Warnings = append(report.Warnings, "verification "+name+": "+obsolete)
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

	// Against the runtimes themselves: the version each agent's runtime was
	// found to have, by agent, where its mapping verifies it.
	installed := map[string]string{}
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
			var probeFailed error
			if err == nil && identity.Contract == mapping.Contract && !mapping.Verified(identity.Version) && c.probes != nil {
				var probed []string
				if probed, probeFailed = c.probes.Verified(ctx, mapping.Adapter, agent.Command, identity.Version); probeFailed == nil {
					mapping = mapping.WithVerified(identity.Version, probed)
					bundle.Mappings[agent.Runtime] = mapping
				}
			}
			switch {
			case err != nil:
				problem("agent "+name, "runtime unavailable: %v", err)
			case identity.Contract != mapping.Contract:
				problem("agent "+name, "adapter implements %s, mapping %s describes %s", identity.Contract, mapping.Name, mapping.Contract)
			case probeFailed != nil:
				problem("agent "+name, "mapping %s verifies no primitive for runtime version %s%s", mapping.Name, identity.Version, probeRefusal(probeFailed))
			case !mapping.Verified(identity.Version):
				problem("agent "+name, "mapping %s verifies no primitive for runtime version %s", mapping.Name, identity.Version)
			default:
				installed[name] = identity.Version
				for _, p := range settings.PlanProblems(bundle, agent, identity.Version) {
					settingsProblem(p)
				}
				// Repairs resume the call's session, which only the
				// runtime can say it supports. So do recoveries (ADR-024
				// rule 6).
				if !identity.Resume {
					for _, p := range settings.ResumeProblems(bundle, agent) {
						settingsProblem(p)
					}
				}
				// So is whether it enforces a cost limit, which a call
				// under one is refused without.
				if !identity.CostLimit {
					for _, p := range settings.CostProblems(bundle, agent) {
						settingsProblem(p)
					}
				}
			}
		}
	}

	// Each binding as its call would be planned (ADR-030 rules 7 and 8):
	// what it withholds is listed. A permission in tools.require it would
	// withhold is no warning: the plan cannot be made, a problem found above
	// that refuses the workflow.
	for _, plan := range settings.BindingPlans(bundle, installed) {
		report.Bindings = append(report.Bindings, contract.Binding{
			Workflow: plan.Workflow, Node: plan.Node, Process: plan.Process, Agent: plan.Agent,
			Runtime: plan.Runtime, Version: plan.Version, Withheld: plan.Withheld, Required: plan.Required,
		})
	}
	return finish(), nil
}

// namedPrompts are the prompts the processes that parse name. Those that
// do not parse are problems of their own, which check reports when it
// reads them.
func (c *Checker) namedPrompts(ctx context.Context) map[string]bool {
	named := map[string]bool{}
	names, _ := c.definitions.List(ctx, definition.KindProcess)
	for _, name := range names {
		doc, err := c.definitions.Read(ctx, definition.KindProcess, name)
		if err != nil {
			continue
		}
		if process, err := definition.ParseProcess(doc); err == nil {
			for _, prompt := range process.Prompts() {
				named[prompt] = true
			}
		}
	}
	return named
}

// bases are the processes some process extends, each with those that
// extend it (ADR-030 rule 9). A process that cannot be read or does not
// parse still names its base, in the nearest file that holds its whole
// document.
func (c *Checker) bases(ctx context.Context) map[string][]string {
	bases := map[string][]string{}
	names, _ := c.definitions.List(ctx, definition.KindProcess)
	read := func(name string) (definition.Document, error) {
		return c.definitions.Read(ctx, definition.KindProcess, name)
	}
	for _, name := range names {
		doc, _ := read(name)
		if base := definition.Extends(doc, read); base != "" && contains(names, base) {
			bases[base] = append(bases[base], name)
		}
	}
	return bases
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
		if doc.Source.Layer != definition.LayerRepository {
			home(doc.Source.Path)
			continue
		}
		for i, farther := range doc.Source.Layers {
			if i > 0 {
				home(farther.Path)
			}
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

// ProblemsAdded checks these settings with doc written to the home layer
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

// withDocument is a definitions source with one home document added or
// replaced. Where a nearer layer holds a document of the same name, a
// composed kind's is composed from the nearer layers' files as they are and
// the home document beneath them (ADR-028 rule 4); any other kind's is the
// nearer layer's, which replaces home's whole (rule 6).
type withDocument struct {
	CheckDefinitions
	doc definition.Document
}

func (w withDocument) Read(ctx context.Context, kind definition.Kind, name string) (definition.Document, error) {
	return w.with(ctx, kind, name, w.CheckDefinitions.Read)
}

func (w withDocument) ReadListed(ctx context.Context, kind definition.Kind, name string) (definition.Document, error) {
	return w.with(ctx, kind, name, w.CheckDefinitions.ReadListed)
}

// with is the document as read reads it, with w's home document in place.
func (w withDocument) with(ctx context.Context, kind definition.Kind, name string, read func(context.Context, definition.Kind, string) (definition.Document, error)) (definition.Document, error) {
	if kind != w.doc.Source.Kind || name != w.doc.Source.Name {
		return read(ctx, kind, name)
	}
	current, err := read(ctx, kind, name)
	switch {
	case err != nil || current.Source.Layer == definition.LayerHome:
		return w.doc, nil
	case !definition.Composed(kind):
		return current, nil
	}
	home := definition.LayerFile{Layer: definition.LayerHome, Path: w.doc.Source.Path, SHA256: w.doc.Source.SHA256}
	return definition.WithHome(current, definition.LayerText{File: home, Bytes: w.doc.Bytes})
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

// definitionLayers are a document's layer files as check and show report
// them, nearest first. The farther files of a document taken whole are
// replaced by the nearest.
func definitionLayers(source definition.Source) []contract.DefinitionLayer {
	layers := make([]contract.DefinitionLayer, 0, len(source.Layers))
	for i, layer := range source.Layers {
		layers = append(layers, contract.DefinitionLayer{
			Layer: string(layer.Layer), Path: layer.Path, Fields: layer.Fields,
			Replaced: i > 0 && !definition.Composed(source.Kind), Process: layer.Process,
		})
	}
	return layers
}
