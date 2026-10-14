package app

import (
	"context"
	"errors"

	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
	"github.com/igor1309/ai-labs/agister/internal/domain/document"
	"github.com/igor1309/ai-labs/agister/internal/domain/enforce"
	"github.com/igor1309/ai-labs/agister/internal/domain/policy"
)

// documentReader reads a settings document as what it is: one method per
// kind reads the document, parses it and returns the parsed value with the
// document's source. The service settings, a runtime mapping, an agent, a
// process, a verification, a prompt, a brief form, a skill, a workflow and
// the blocks are returned in the package's own types, which no other file
// of the package maps a parsed document to. This file is the one of the
// package that imports the parser: what another file uses of it, a name
// or a function, it takes from here under the package's own name.
// It reads only the document it is asked for (ADR-015 rule 1), and decides
// nothing for its caller: what to read next, what a failure stops and how
// it is worded are the caller's.
//
// A document the definitions do not give fails with an *unreadError, and
// has no value: its source is what the definitions give beside the
// failure, such as where the document was looked for. One that was read
// and has problems fails with the parser's *document.InvalidError, beside
// its source and what of it parsed.
type documentReader struct {
	definitions readerDefinitions
}

// readerDefinitions supplies a document as a call reads it, with Read, and
// as the settings list it, with ReadListed: a prompt never from a folder a
// layer.yaml lists (ADR-028 rule 9).
type readerDefinitions interface {
	Read(ctx context.Context, kind document.Kind, name string) (document.Document, error)
	ReadListed(ctx context.Context, kind document.Kind, name string) (document.Document, error)
}

// unreadError is the failure of a read: the definitions gave no document,
// so nothing was parsed. Its text is the read's own.
type unreadError struct{ err error }

func (e *unreadError) Error() string { return e.err.Error() }

func (e *unreadError) Unwrap() error { return e.err }

// unread reports whether err is a read's failure, not a parse's.
func unread(err error) bool {
	var failure *unreadError
	return errors.As(err, &failure)
}

const (
	// obsoleteWorkspace is the warning for the workspace settings, which
	// ADR-025 removed: they are read and ignored.
	obsoleteWorkspace = definition.ObsoleteWorkspace
)

// withHome is doc, a composed kind's document, as writing home to the home
// layer would make it, as the parser composes it (ADR-028 rule 4).
func withHome(doc document.Document, home document.LayerText) (document.Document, error) {
	return definition.WithHome(doc, home)
}

// newDocumentReader returns the reader over definitions, which are
// required.
func newDocumentReader(definitions readerDefinitions) documentReader {
	if definitions == nil {
		panic("app.newDocumentReader: no definitions")
	}
	return documentReader{definitions: definitions}
}

// Service reads the service settings as the package uses them, not as
// their file holds them.
func (r documentReader) Service(ctx context.Context) (serviceSettings, document.Source, error) {
	service, source, err := readParsed(ctx, r, document.KindService, "service", definition.ParseService)
	return serviceOf(service), source, err
}

// serviceOf is a parsed service document as the package uses it. What
// parsed of an invalid one is mapped the same, and of one that was not
// read there is nothing.
func serviceOf(service definition.Service) serviceSettings {
	return serviceSettings{
		ceilings: policy.Ceilings{
			MaxTimeout:        service.MaxTimeout,
			MaxAttempts:       service.MaxAttempts,
			MaxVerifyAttempts: service.MaxVerifyAttempts,
			MaxCostUSD:        service.MaxCostUSD,
			Permissions:       service.Permissions,
			Writing:           service.Writing,
		},
		stateReaching: service.StateReaching,
	}
}

// Process reads a process as the package uses it, not as its file holds
// it.
func (r documentReader) Process(ctx context.Context, name string) (declaredProcess, document.Source, error) {
	return readParsed(ctx, r, document.KindProcess, name, parseProcess)
}

// processOf is a parsed process document as the package uses it: its
// limits as what it declares to policy, and whether a call's session may
// be resumed, which a process that sets no session leaves fresh-only
// (ADR-030 rules 2 and 3). What parsed of an invalid one is mapped the
// same, and of one that was not read there is nothing.
func processOf(process definition.Process) declaredProcess {
	own := process.Limits
	out := declaredProcess{
		name:        process.Name,
		instruction: process.Instruction,
		prompt:      process.Prompt,
		guidance:    process.Guidance,
		params:      paramsOf(process.Params),
		values:      valuesOf(process.Values),
		revision:    process.Revision,
		clean:       process.Clean,
		skills:      process.Skills,
		output:      processOutput{format: process.Output.Format, schema: process.Output.Schema},
		verifyName:  process.VerifyName,
		limits: policy.Declared{
			Process:     process.Name,
			Timeout:     own.Timeout,
			MaxAttempts: own.MaxAttempts,
			MaxCostUSD:  own.MaxCostUSD,
			Allow:       own.Allow,
			Deny:        own.Deny,
			Require:     process.Require,
			Access:      own.Access,
			Scope:       own.Scope,
			Pinned:      process.Revision != "",
			Stale: policy.DeclaredStale{
				NoEvent:           own.Stale.NoEvent,
				NoOutput:          own.Stale.NoOutput,
				ToolCommand:       own.Stale.ToolCommand,
				RepeatedToolCalls: own.Stale.RepeatedToolCalls,
				MaxResumes:        own.Stale.Recover.MaxResumes,
				Instruction:       own.Stale.Recover.Instruction,
			},
		},
		resumable: definition.CallSession(process) == definition.SessionResumable,
		obsolete:  process.Obsolete,
	}
	if process.Verify != nil {
		verify := verifyOf(*process.Verify)
		out.verify = &verify
	}
	return out
}

// collects lists the inputs of process that receive a workflow's
// collection, in declaration order.
func collects(process declaredProcess) []string {
	values := translated(process.values, func(value declaredValue) definition.Value {
		return definition.Value{Name: value.name, Source: value.source}
	})
	return definition.Process{Values: values}.Collects()
}

// Agent reads an agent as the package uses it, not as its file holds it.
func (r documentReader) Agent(ctx context.Context, name string) (agentProfile, document.Source, error) {
	return readParsed(ctx, r, document.KindAgent, name, parseAgent)
}

// agentOf is a parsed agent document as the package uses it. What parsed
// of an invalid one is mapped the same, and of one that was not read there
// is nothing.
func agentOf(agent definition.Agent) agentProfile {
	return agentProfile{
		name:        agent.Name,
		runtime:     agent.Runtime,
		model:       agent.Model,
		modelFamily: agent.ModelFamily,
		effort:      agent.Effort,
		command:     agent.Command,
		skills:      agent.Skills,
	}
}

// parserAgent is agent as the parser holds one, for the parser's functions
// that take an agent. It has no source: a document's provenance is
// returned beside the package's agent, not in it.
func parserAgent(agent agentProfile) definition.Agent {
	return definition.Agent{
		Name:        agent.name,
		Runtime:     agent.runtime,
		Model:       agent.model,
		ModelFamily: agent.modelFamily,
		Effort:      agent.effort,
		Command:     agent.command,
		Skills:      agent.skills,
	}
}

// formatAgent is agent as the bytes of its settings document, which a
// write stores.
func formatAgent(agent agentProfile) []byte {
	return definition.FormatAgent(parserAgent(agent))
}

// callSkills lists the skills a call of process on agent is given: the
// process's, then the agent's, each once (ADR-021 rule 2).
func callSkills(process declaredProcess, agent agentProfile) []string {
	return definition.CallSkills(definition.Process{Skills: process.skills}, parserAgent(agent))
}

// Mapping reads a runtime mapping as the package uses it, not as its file
// holds it.
func (r documentReader) Mapping(ctx context.Context, name string) (runtimeMapping, document.Source, error) {
	mapping, source, err := readParsed(ctx, r, document.KindRuntime, name, definition.ParseMapping)
	return mappingOf(mapping), source, err
}

// mappingOf is a parsed runtime document as the package uses it: its
// primitives as what it offers enforce, of which a plan takes exactly one
// where the document selects "one". What parsed of an invalid one is
// mapped the same, and of one that was not read there is nothing.
func mappingOf(mapping definition.Mapping) runtimeMapping {
	var primitives []enforce.Primitive
	for _, primitive := range mapping.Primitives {
		primitives = append(primitives, enforce.Primitive{Name: primitive.Name, Grants: primitive.Grants, Verified: primitive.Verified})
	}
	return runtimeMapping{
		name:     mapping.Name,
		adapter:  mapping.Adapter,
		contract: mapping.Contract,
		efforts:  mapping.Efforts,
		offer:    enforce.Offer{One: mapping.Select == "one", Primitives: primitives},
	}
}

// Verification reads a verification as the package uses it, not as its
// file holds it.
func (r documentReader) Verification(ctx context.Context, name string) (declaredVerification, document.Source, error) {
	verification, source, err := readParsed(ctx, r, document.KindVerify, name, definition.ParseVerify)
	return verificationOf(verification), source, err
}

// verificationOf is a parsed verification document as the package uses
// it. What parsed of an invalid one is mapped the same, and of one that
// was not read there is nothing.
func verificationOf(verification definition.Verification) declaredVerification {
	return declaredVerification{name: verification.Name, verify: verifyOf(verification.Verify), obsolete: verification.Verify.Obsolete}
}

// verifyOf are the values of a parsed verify block, or of a parsed
// verification document, as the package uses them.
func verifyOf(verify definition.Verify) verifyValues {
	return verifyValues{command: verify.Command, timeout: verify.Timeout, maxAttempts: verify.MaxAttempts, instruction: verify.Instruction}
}

// Prompt reads a prompt as the package uses it, not as its file holds it.
func (r documentReader) Prompt(ctx context.Context, name string) (promptText, document.Source, error) {
	prompt, source, err := readParsed(ctx, r, document.KindPrompt, name, definition.ParsePrompt)
	return promptOf(prompt), source, err
}

// ListedPrompt reads a prompt as the settings list it, not as a call reads
// it: the one of the inventory, which no process need name.
func (r documentReader) ListedPrompt(ctx context.Context, name string) (promptText, document.Source, error) {
	doc, err := r.definitions.ReadListed(ctx, document.KindPrompt, name)
	prompt, source, err := parsedOf(doc, err, definition.ParsePrompt)
	return promptOf(prompt), source, err
}

// promptOf is a parsed prompt document as the package uses it. What parsed
// of an invalid one is mapped the same, and of one that was not read there
// is nothing.
func promptOf(prompt definition.Prompt) promptText {
	return promptText{name: prompt.Name, text: prompt.Text, sha256: prompt.Source.SHA256}
}

// Brief reads a brief's form as the package uses it, not as its file holds
// it.
func (r documentReader) Brief(ctx context.Context, name string) (briefForm, document.Source, error) {
	brief, source, err := readParsed(ctx, r, document.KindBrief, name, definition.ParseBrief)
	return briefOf(brief), source, err
}

// briefOf is a parsed brief document as the package uses it. What parsed
// of an invalid one is mapped the same, and of one that was not read there
// is nothing.
func briefOf(brief definition.Brief) briefForm {
	var parts []briefPart
	for _, part := range brief.Parts {
		parts = append(parts, briefPart{heading: part.Heading, required: part.Required, reads: part.Reads, reference: part.Reference})
	}
	return briefForm{parts: parts}
}

// parserBrief is form as the parser holds one, for the parser's check of a
// text against it. It has no name, template or source: the package's form
// holds only its parts.
func parserBrief(form briefForm) definition.Brief {
	var parts []definition.BriefPart
	for _, part := range form.parts {
		parts = append(parts, definition.BriefPart{Heading: part.heading, Required: part.required, Reads: part.reads, Reference: part.reference})
	}
	return definition.Brief{Parts: parts}
}

// formCheck is the check of a text against form, as the parser checks it
// (ADR-026 rule 8): what keeps the text from having the form, none when it
// has it.
func formCheck(form briefForm) func(text string, resolve func(path string) error) []string {
	return parserBrief(form).Check
}

// Skill reads a skill as the package uses it, not as its file holds it.
func (r documentReader) Skill(ctx context.Context, name string) (givenSkill, document.Source, error) {
	skill, source, err := readParsed(ctx, r, document.KindSkill, name, definition.ParseSkill)
	return skillOf(skill), source, err
}

// skillOf is a parsed skill document as the package uses it. What parsed
// of an invalid one is mapped the same, and of one that was not read there
// is nothing.
func skillOf(skill definition.Skill) givenSkill {
	return givenSkill{name: skill.Name, bytes: skill.Bytes, sha256: skill.Source.SHA256}
}

// Workflow reads a workflow as the package uses it, not as its file holds
// it.
func (r documentReader) Workflow(ctx context.Context, name string) (declaredWorkflow, document.Source, error) {
	workflow, source, err := readParsed(ctx, r, document.KindWorkflow, name, definition.ParseWorkflow)
	return workflowOf(workflow), source, err
}

// workflowOf is a parsed workflow document as the package uses it. What
// parsed of an invalid one is mapped the same, and of one that was not
// read there is nothing.
func workflowOf(workflow definition.Workflow) declaredWorkflow {
	out := declaredWorkflow{
		name:   workflow.Name,
		params: paramsOf(workflow.Params),
		values: valuesOf(workflow.Values),
		fanOut: translated(workflow.FanOut, nodeOf),
		join:   nodeOf(workflow.Join),
	}
	if workflow.Call != nil {
		call := nodeOf(*workflow.Call)
		out.call = &call
	}
	return out
}

func nodeOf(node definition.Node) workflowNode {
	return workflowNode{name: node.Name, process: node.Process, agent: node.Agent}
}

// paramsOf are the params a parsed document declares, as the package uses
// them, in the order it declares them.
func paramsOf(params []definition.Param) []declaredParam {
	return translated(params, func(param definition.Param) declaredParam {
		return declaredParam{name: param.Name, defaultValue: param.Default, hasDefault: param.HasDefault}
	})
}

// valuesOf are the input values a parsed document declares, as the
// package uses them, in the order it declares them.
func valuesOf(values []definition.Value) []declaredValue {
	return translated(values, func(value definition.Value) declaredValue {
		return declaredValue{name: value.Name, source: value.Source, args: value.Args, forms: value.Forms}
	})
}

// boundArgs is args, the arguments of a declared input value, with their
// references substituted as the parser binds them, in one pass:
// ${param.<name>} from params, ${value.<name>} from values, the text of
// the input values resolved before it. A value reference values lacks is
// an error. The parser checks the same references when it parses a value,
// so what a reference is stays its own.
func boundArgs(args, params, values map[string]string) (map[string]string, error) {
	return definition.Value{Args: args}.Bind(params, values)
}

// Schema reads an output schema: its bytes as they are, which the caller's
// validator compiles.
func (r documentReader) Schema(ctx context.Context, name string) ([]byte, document.Source, error) {
	return readParsed(ctx, r, document.KindSchema, name, func(doc document.Document) ([]byte, error) { return doc.Bytes, nil })
}

// Blocks reads a repository's blocks as the package uses them, not as
// their file holds them.
func (r documentReader) Blocks(ctx context.Context, name string) ([]declaredBlock, document.Source, error) {
	blocks, source, err := readParsed(ctx, r, document.KindBlocks, name, definition.ParseBlocks)
	return blocksOf(blocks), source, err
}

// blocksOf are the blocks of a parsed blocks document as the package uses
// them, in the order it names them. What parsed of an invalid one is
// mapped the same, and of one that was not read there is nothing.
func blocksOf(blocks definition.Blocks) []declaredBlock {
	return translated(blocks.Blocks, func(block definition.Block) declaredBlock {
		return declaredBlock{kind: block.Kind, name: block.Name, reason: block.Reason}
	})
}

// Workspace reads the workspace settings, which no call reads and nothing
// parses (ADR-025): only where they are.
func (r documentReader) Workspace(ctx context.Context, name string) (document.Source, error) {
	doc, err := r.definitions.Read(ctx, document.KindWorkspace, name)
	if err != nil {
		return doc.Source, &unreadError{err: err}
	}
	return doc.Source, nil
}

// Extending returns what says the base a process extends (ADR-030 rule 9),
// "" where it names none. A process that cannot be read or does not parse
// still names its base, in the nearest file that holds its whole document.
// What it returns reads and composes each base once for all the processes
// it is asked of, and holds them: its caller keeps it for one pass over
// the processes. The reader keeps nothing.
func (r documentReader) Extending(ctx context.Context) func(process string) string {
	read := func(name string) (document.Document, error) {
		return r.definitions.Read(ctx, document.KindProcess, name)
	}
	extender := definition.NewExtender(read)
	return func(process string) string {
		doc, _ := read(process)
		return extender.Extends(doc)
	}
}

// parseProcess parses doc, a process document already read: by the reader,
// or by whoever holds it and reads nothing more to parse it, as the
// snapshot holds what it froze, to the process as the package uses it.
// What of an invalid document parsed is returned beside the parser's
// *document.InvalidError.
func parseProcess(doc document.Document) (declaredProcess, error) {
	process, err := definition.ParseProcess(doc)
	return processOf(process), err
}

// parseAgent parses doc, an agent document already read, as parseProcess
// parses a process, to the agent as the package uses it.
func parseAgent(doc document.Document) (agentProfile, error) {
	agent, err := definition.ParseAgent(doc)
	return agentOf(agent), err
}

// parsedAgent parses data as the agent named name: what a write is about
// to store, which is read from nowhere and so has no source but its name.
func parsedAgent(name string, data []byte) (agentProfile, error) {
	return parseAgent(document.Document{Source: document.Source{Kind: document.KindAgent, Name: name}, Bytes: data})
}

// readParsed reads the document of kind named name and parses it.
func readParsed[T any](ctx context.Context, r documentReader, kind document.Kind, name string, parse func(document.Document) (T, error)) (T, document.Source, error) {
	doc, err := r.definitions.Read(ctx, kind, name)
	return parsedOf(doc, err, parse)
}

// parsedOf parses doc, which a read gave, or fails as the read did.
func parsedOf[T any](doc document.Document, err error, parse func(document.Document) (T, error)) (T, document.Source, error) {
	if err != nil {
		var none T
		return none, doc.Source, &unreadError{err: err}
	}
	value, err := parse(doc)
	return value, doc.Source, err
}
