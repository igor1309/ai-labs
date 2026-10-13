package app

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"
	"sync"

	"github.com/igor1309/ai-labs/agister/internal/contract"
	"github.com/igor1309/ai-labs/agister/internal/domain/document"
	"github.com/igor1309/ai-labs/agister/internal/domain/settings"
)

// Checker validates all settings at once, before any call needs them.
type Checker struct {
	definitions CheckDefinitions
	// documents reads each document the check checks, from definitions.
	documents documentReader
	validator CheckValidator
	runtimes  CheckRuntimes
	sources   []string // input source kinds the code provides
	// probes verify a version the settings verify nothing for; nil: none
	// is probed.
	probes CheckProbes
	// once keeps the first check without probes, for settings that cannot
	// change; nil: each check reads them again.
	once *checkOnce
}

// checkOnce is a check made once and what it found.
type checkOnce struct {
	sync.Once
	found CheckResult
	err   error
}

// CheckDefinitions supplies every definition document and its origin, and
// the layers they are read from (ADR-028 rule 1). Read reads a document as
// a call reads it; ReadListed one as the settings list it, a prompt never
// from a folder a layer.yaml lists (rule 9), and any other kind as Read.
type CheckDefinitions interface {
	Read(ctx context.Context, kind document.Kind, name string) (document.Document, error)
	ReadListed(ctx context.Context, kind document.Kind, name string) (document.Document, error)
	List(ctx context.Context, kind document.Kind) ([]string, error)
	Layers(ctx context.Context) []document.LayerDir
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
	return &Checker{definitions: definitions, documents: newDocumentReader(definitions), validator: validator, runtimes: runtimes, sources: sources}
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
	if probe || c.once == nil {
		return c.checkNow(ctx, probe)
	}
	c.once.Do(func() { c.once.found, c.once.err = c.checkNow(ctx, false) })
	return c.once.found, c.once.err
}

func (c *Checker) checkNow(ctx context.Context, probe bool) (CheckResult, error) {
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
	parsed := parsedSettings{
		agents:    map[string]agentProfile{},
		processes: map[string]declaredProcess{},
		mappings:  map[string]runtimeMapping{},
		schemas:   map[string]bool{},
		workflows: map[string]declaredWorkflow{},
		verifies:  map[string]declaredVerification{},
		prompts:   map[string]bool{},
		skills:    map[string]bool{},
		briefs:    map[string]bool{},
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
	parsed.bases = c.bases(ctx)

	// Each document on its own: one checks a document the reader read, or
	// not, err saying why not or what is wrong with it; each checks every
	// document of a kind the settings list, which read reads.
	one := func(kind document.Kind, name string, source document.Source, err error) {
		if farther := source.Layers; len(farther) > 1 {
			paths := make([]string, 0, len(farther)-1)
			for _, layer := range farther[1:] {
				paths = append(paths, layer.Path)
			}
			report.Overrides = append(report.Overrides, fmt.Sprintf("%s %s: %s overrides %s", kind.Singular(), name, source.Path, strings.Join(paths, ", ")))
		}
		index[DocumentRef{Kind: kind, Name: name}] = len(report.Definitions)
		report.Definitions = append(report.Definitions, contract.Definition{Kind: string(kind), Name: name, Layer: string(source.Layer), Path: source.Path, Layers: definitionLayers(source)})
		documents = append(documents, CheckedDocument{Ref: DocumentRef{Kind: kind, Name: name}, Path: source.Path})
		if unread(err) {
			report.Definitions[len(report.Definitions)-1].Invalid = true
			problem(kind.Singular()+" "+name, "%v", err)
			return
		}
		report.Checked[string(kind)]++
		if err != nil {
			report.Definitions[len(report.Definitions)-1].Invalid = true
			var invalid *document.InvalidError
			if errors.As(err, &invalid) {
				for _, p := range invalid.Problems {
					settingsProblem(settings.Problem{Subject: kind.Singular() + " " + name, Message: p.Message, Unknown: p.Unknown})
				}
			} else {
				problem(kind.Singular()+" "+name, "%v", err)
			}
		}
	}
	each := func(kind document.Kind, read func(name string) (document.Source, error)) error {
		names := []string{"service"}
		if kind != document.KindService {
			var err error
			if names, err = c.definitions.List(ctx, kind); err != nil {
				// Nothing can name what it holds (ADR-015 rule 4).
				stops("settings directory "+string(kind), "cannot be listed: %v", err)
				return nil
			}
		}
		for _, name := range names {
			listed[DocumentRef{Kind: kind, Name: name}] = true
			if kind == document.KindPrompt {
				// One that cannot be read or parsed is a problem of its
				// own (ADR-014 rule 1); the processes that name it still
				// find it.
				parsed.prompts[name] = true
			}
			if kind == document.KindSkill {
				// So is a broken skill (ADR-021 rule 4): what names it still
				// finds it.
				parsed.skills[name] = true
			}
			if kind == document.KindBrief {
				// And a broken brief form (ADR-026 rule 8).
				parsed.briefs[name] = true
			}
			if kind != document.KindService && !document.ValidName(name) {
				// Nothing can name such a document (ADR-015 rule 4).
				what := "file"
				if kind == document.KindSkill {
					what = "folder"
				}
				stops(kind.Singular()+" "+name, "%q is not a valid name; rename the %s", name, what)
				continue
			}
			source, err := read(name)
			one(kind, name, source, err)
		}
		return nil
	}
	// Each kind's read reads a document through the reader and keeps what
	// of it the checks across documents read.
	steps := []struct {
		kind document.Kind
		read func(name string) (document.Source, error)
	}{
		{document.KindService, func(string) (document.Source, error) {
			service, source, err := c.documents.Service(ctx)
			if err == nil {
				parsed.service = &service
			}
			return source, err
		}},
		{document.KindRuntime, func(name string) (document.Source, error) {
			m, source, err := c.documents.Mapping(ctx, name)
			if err == nil {
				parsed.mappings[m.name] = m
			}
			return source, err
		}},
		{document.KindAgent, func(name string) (document.Source, error) {
			a, source, err := c.documents.Agent(ctx, name)
			if err == nil {
				parsed.agents[a.name] = a
			}
			return source, err
		}},
		{document.KindVerify, func(name string) (document.Source, error) {
			v, source, err := c.documents.Verification(ctx, name)
			if err == nil {
				parsed.verifies[v.name] = v
			}
			return source, err
		}},
		{document.KindPrompt, func(name string) (document.Source, error) {
			read := c.documents.Prompt
			if !named[name] {
				read = c.documents.ListedPrompt
			}
			_, source, err := read(ctx, name)
			return source, err
		}},
		{document.KindSkill, func(name string) (document.Source, error) {
			_, source, err := c.documents.Skill(ctx, name)
			return source, err
		}},
		{document.KindBrief, func(name string) (document.Source, error) {
			_, source, err := c.documents.Brief(ctx, name)
			return source, err
		}},
		{document.KindProcess, func(name string) (document.Source, error) {
			p, source, err := c.documents.Process(ctx, name)
			switch {
			case unread(err):
			case len(parsed.bases[source.Name]) > 0:
				// What a base leaves out is no problem of its own.
				err = nil
			case err == nil:
				parsed.processes[p.name] = p
			}
			return source, err
		}},
		{document.KindSchema, func(name string) (document.Source, error) {
			schema, source, err := c.documents.Schema(ctx, name)
			if err != nil {
				return source, err
			}
			if err := c.validator.Compile(schema); err != nil {
				return source, err
			}
			parsed.schemas[source.Name] = true
			return source, nil
		}},
		{document.KindWorkflow, func(name string) (document.Source, error) {
			w, source, err := c.documents.Workflow(ctx, name)
			if err == nil {
				parsed.workflows[w.name] = w
			}
			return source, err
		}},
		// Optional: listed only when the document exists. A call reads
		// none of it (ADR-025): it is reported, not parsed.
		{document.KindWorkspace, func(name string) (document.Source, error) {
			source, err := c.documents.Workspace(ctx, name)
			if err == nil {
				report.Warnings = append(report.Warnings, "workspace settings "+source.Path+": "+obsoleteWorkspace)
			}
			return source, err
		}},
	}
	for _, step := range steps {
		if err := each(step.kind, step.read); err != nil {
			return CheckResult{Report: report}, err
		}
	}
	// A prompt a process names that the settings do not list is read as
	// a call reads it: only one no layer has is missing. One found in a
	// folder a layer lists is listed only so, under the process that names
	// it (ADR-028 rule 9). Anything else at its path, such as a directory,
	// is a document that cannot be read, a problem of its own that refuses
	// the process.
	for _, name := range sortedNames(parsed.processes) {
		for _, prompt := range parsed.processes[name].prompts() {
			ref := DocumentRef{Kind: document.KindPrompt, Name: prompt}
			if listed[ref] {
				continue
			}
			_, source, err := c.documents.Prompt(ctx, prompt)
			if errors.Is(err, document.ErrNotFound) {
				continue
			}
			listed[ref], parsed.prompts[prompt] = true, true
			one(document.KindPrompt, prompt, source, err)
		}
	}
	// File names define the run namespace even when their documents cannot
	// be parsed. settings.Check handles the pair when both parsed.
	for ref := range listed {
		if ref.Kind != document.KindWorkflow || !listed[DocumentRef{Kind: document.KindProcess, Name: ref.Name}] {
			continue
		}
		_, processOK := parsed.processes[ref.Name]
		_, workflowOK := parsed.workflows[ref.Name]
		if parsed.service == nil || !processOK || !workflowOK {
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
			case document.KindProcess:
				processes = append(processes, ref)
			case document.KindWorkflow:
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
	link := func(from DocumentRef, kind document.Kind, name string, guidance bool) {
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
	for _, name := range sortedNames(parsed.agents) {
		agent, from := parsed.agents[name], DocumentRef{Kind: document.KindAgent, Name: name}
		link(from, document.KindRuntime, agent.runtime, false)
		for _, skill := range agent.skills {
			link(from, document.KindSkill, skill, false)
		}
	}
	for _, name := range sortedNames(parsed.processes) {
		process, from := parsed.processes[name], DocumentRef{Kind: document.KindProcess, Name: name}
		link(from, document.KindVerify, process.verifyName, false)
		link(from, document.KindPrompt, process.prompt, false)
		for _, prompt := range process.guidance {
			link(from, document.KindPrompt, prompt, true)
		}
		for _, skill := range process.skills {
			link(from, document.KindSkill, skill, false)
		}
		if process.output.format == "json" {
			link(from, document.KindSchema, process.output.schema, false)
		}
		for _, form := range process.forms() {
			link(from, document.KindBrief, form, false)
		}
	}
	// A process uses its base, whose problems and blocks refuse it.
	for _, base := range sortedNames(parsed.bases) {
		for _, name := range parsed.bases[base] {
			link(DocumentRef{Kind: document.KindProcess, Name: name}, document.KindProcess, base, false)
		}
	}
	for _, name := range sortedNames(parsed.workflows) {
		from := DocumentRef{Kind: document.KindWorkflow, Name: name}
		// A workflow uses the agent a node binds its process to, each once:
		// its problems and blocks refuse the workflow (ADR-030 rule 10).
		agents := map[string]bool{}
		for _, node := range parsed.workflows[name].nodes() {
			link(from, document.KindProcess, node.process, false)
			if !agents[node.agent] {
				agents[node.agent] = true
				link(from, document.KindAgent, node.agent, false)
			}
			if source, ok := index[from]; ok {
				documents[source].Binds = append(documents[source].Binds, NodeBinding{Process: node.process, Agent: node.agent})
			}
		}
		for _, form := range parsed.workflows[name].forms() {
			link(from, document.KindBrief, form, false)
		}
	}

	// Settings a call no longer reads are ignored, and said so (ADR-025).
	for _, name := range sortedNames(parsed.processes) {
		for _, obsolete := range parsed.processes[name].obsolete {
			report.Warnings = append(report.Warnings, "process "+name+": "+obsolete)
		}
	}
	for _, name := range sortedNames(parsed.verifies) {
		for _, obsolete := range parsed.verifies[name].obsolete {
			report.Warnings = append(report.Warnings, "verification "+name+": "+obsolete)
		}
	}
	for _, name := range sortedNames(parsed.processes) {
		process := parsed.resolved(name)
		switch {
		case process.verify != nil:
			report.Warnings = append(report.Warnings, "process "+name+": "+VerifyWarning)
		case process.verifyName != "" && !listed[DocumentRef{Kind: document.KindVerify, Name: process.verifyName}]:
			// Not a problem: every other process and workflow still runs
			// (ADR-010 rule 4). An invalid one is a problem of its own.
			report.Warnings = append(report.Warnings, fmt.Sprintf("process %s: names verify:%s, which does not exist; calls of it are refused until verifies/%s.yaml exists", name, process.verifyName, process.verifyName))
		}
	}

	if parsed.service == nil {
		return finish(), nil
	}

	// Across documents.
	bundle := parsed.bundle()
	for _, name := range sortedNames(parsed.mappings) {
		mapping := bundle.Mappings[name]
		if verified, _ := mapping.Offer.ForAnyVersion(); len(verified.Primitives) == 0 {
			report.Warnings = append(report.Warnings, "runtime mapping "+mapping.Name+": verifies no primitive against any runtime version; permissions are best effort")
		}
	}
	known := c.runtimes.Adapters()
	// The core itself supplies a join's collection (ADR-003 rule 4).
	sources := append(append([]string(nil), c.sources...), collectionSource)
	for _, p := range settings.Check(bundle, settings.Mechanisms{Sources: sources, Adapters: known}) {
		settingsProblem(p)
	}

	// Against the runtimes themselves: the version each agent's runtime was
	// found to have, by agent, where its mapping verifies it.
	installed := map[string]string{}
	if probe {
		for _, name := range sortedNames(parsed.agents) {
			agent := parsed.agents[name]
			mapping, ok := parsed.mappings[agent.runtime]
			if !ok {
				continue
			}
			if !contains(known, mapping.adapter) {
				continue // reported as an unknown adapter
			}
			identity, err := c.runtimes.Identity(ctx, mapping.adapter, agent.command)
			// What a probe verifies is seen by every check that follows,
			// of this agent and of any other on the same runtime.
			checked := bundle.Mappings[agent.runtime]
			var probeFailed error
			if err == nil && identity.Contract == mapping.contract && !checked.Offer.Verified(identity.Version) && c.probes != nil {
				var probed []string
				if probed, probeFailed = c.probes.Verified(ctx, mapping.adapter, agent.command, identity.Version); probeFailed == nil {
					checked.Offer = checked.Offer.WithVerified(identity.Version, probed)
					bundle.Mappings[agent.runtime] = checked
				}
			}
			switch {
			case err != nil:
				problem("agent "+name, "runtime unavailable: %v", err)
			case identity.Contract != mapping.contract:
				problem("agent "+name, "adapter implements %s, mapping %s describes %s", identity.Contract, mapping.name, mapping.contract)
			default:
				installed[name] = identity.Version
				if !checked.Offer.Verified(identity.Version) {
					report.Warnings = append(report.Warnings, fmt.Sprintf("agent %s: runtime %s version %s is unverified%s", name, mapping.name, identity.Version, probeRefusal(probeFailed)))
				}
				for _, p := range settings.PlanProblems(bundle, bundle.Agents[name], identity.Version) {
					settingsProblem(p)
				}
				// Repairs resume the call's session, which only the
				// runtime can say it supports. So do recoveries (ADR-024
				// rule 6).
				if !identity.Resume {
					for _, p := range settings.ResumeProblems(bundle, bundle.Agents[name]) {
						settingsProblem(p)
					}
				}
				// So is whether it enforces a cost limit, which a call
				// under one is refused without.
				if !identity.CostLimit {
					for _, p := range settings.CostProblems(bundle, bundle.Agents[name]) {
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
		binding := fmt.Sprintf("workflow %s: %s: process %s on agent %s runtime %s", plan.Workflow, plan.Label, plan.Process, plan.Agent, plan.Runtime)
		if len(plan.Extra) > 0 {
			report.Warnings = append(report.Warnings, binding+" grants beyond tools.allow: "+strings.Join(plan.Extra, ", "))
		}
		if len(plan.Unverified) > 0 {
			report.Warnings = append(report.Warnings, binding+" version "+plan.Version+" has unverified primitives: "+strings.Join(plan.Unverified, ", "))
		}
		report.Bindings = append(report.Bindings, contract.Binding{
			Workflow: plan.Workflow, Node: plan.Node, Process: plan.Process, Agent: plan.Agent,
			Runtime: plan.Runtime, Version: plan.Version, Withheld: plan.Withheld, Required: plan.Required, Extra: plan.Extra,
		})
	}
	return finish(), nil
}

// namedPrompts are the prompts the processes that parse name. Those that
// do not parse are problems of their own, which check reports when it
// reads them.
func (c *Checker) namedPrompts(ctx context.Context) map[string]bool {
	named := map[string]bool{}
	names, _ := c.definitions.List(ctx, document.KindProcess)
	for _, name := range names {
		if process, _, err := c.documents.Process(ctx, name); err == nil {
			for _, prompt := range process.prompts() {
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
	names, _ := c.definitions.List(ctx, document.KindProcess)
	// Each base is read and composed once, however many extend it.
	extends := c.documents.Extending(ctx)
	for _, name := range names {
		if base := extends(name); base != "" && contains(names, base) {
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
	names, err := c.definitions.List(ctx, document.KindBlocks)
	if err != nil {
		stops("blocks", fmt.Sprintf("cannot be listed: %v", err), false)
		return nil
	}
	var blocks []CheckedBlock
	for _, name := range names {
		parsed, source, err := c.documents.Blocks(ctx, name)
		home := func(path string) {
			message := "home's settings block nothing: only a repository's settings have blocks; remove it"
			about := blocksRef // each problem its own, so no caller's change reaches another
			*found = append(*found, CheckedProblem{Text: "blocks (" + path + "): " + message, About: &about, Message: message})
		}
		if source.Layer != document.LayerRepository {
			home(source.Path)
			continue
		}
		for i, farther := range source.Layers {
			if i > 0 {
				home(farther.Path)
			}
		}
		subject := "blocks (" + source.Path + ")"
		if unread(err) {
			stops(subject, err.Error(), false)
			continue
		}
		checked[string(document.KindBlocks)]++
		var invalid *document.InvalidError
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
		for i, block := range parsed {
			ref := DocumentRef{Kind: block.kind, Name: block.name}
			if !listed[ref] {
				stops(subject, fmt.Sprintf("blocks[%d].ref: %s is in neither the repository's settings nor home's", i, label(ref)), false)
				missing = true
				continue
			}
			named = append(named, CheckedBlock{Ref: ref, Path: source.Path, Reason: block.reason})
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
func (c *Checker) ProblemsAdded(ctx context.Context, doc document.Document) ([]string, error) {
	before, err := c.Check(ctx, false)
	if err != nil {
		return nil, err
	}
	after := *c
	after.definitions, after.once = withDocument{definitions: c.definitions, doc: doc}, nil
	after.documents = newDocumentReader(after.definitions)
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

// definitionLayers are a document's layer files as check and show report
// them, nearest first. The farther files of a document taken whole are
// replaced by the nearest.
func definitionLayers(source document.Source) []contract.DefinitionLayer {
	layers := make([]contract.DefinitionLayer, 0, len(source.Layers))
	for i, layer := range source.Layers {
		layers = append(layers, contract.DefinitionLayer{
			Layer: string(layer.Layer), Path: layer.Path, Fields: layer.Fields,
			Replaced: i > 0 && !document.Composed(source.Kind), Process: layer.Process,
		})
	}
	return layers
}
