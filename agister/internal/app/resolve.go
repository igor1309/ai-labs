package app

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"strings"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
	"github.com/igor1309/ai-labs/agister/internal/domain/enforce"
	"github.com/igor1309/ai-labs/agister/internal/domain/policy"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
	"github.com/igor1309/ai-labs/agister/internal/domain/settings"
)

// Refusal is why a call cannot proceed. It is recorded as the run's outcome.
type Refusal struct {
	Reason string
	// Unknown counts the settings problems it names that name something
	// this code does not know, as settings written for a newer Agister
	// would (LAB-122).
	Unknown int
}

func (r *Refusal) Error() string { return r.Reason }

// fault is the refusal as the run's error.
func (r *Refusal) fault() *run.Error {
	fault := run.Fault(run.ClassRefused, "%s", r.Reason)
	fault.Unknown = r.Unknown
	return fault
}

func refuse(format string, args ...any) error { return &Refusal{Reason: fmt.Sprintf(format, args...)} }

// resolution is everything a call needs before inputs and effects. Each
// consumer is given its own translation of it (see Resolver.Snapshot and
// Resolver.InspectProcess).
type resolution struct {
	service definition.Service
	process definition.Process
	agent   definition.Agent
	mapping definition.Mapping
	schema  []byte
	// prompts are the process's prompt, then its guidance, in order
	// (ADR-028 rule 8).
	prompts []definition.Prompt
	forms   map[string]definition.Brief // by name: the brief forms its inputs name (ADR-026 rule 8)
	// skills are the call's skills, in order: the process's, then its
	// agent's, each once (ADR-021 rule 2).
	skills    []definition.Skill
	sources   []definition.Source
	effective policy.Effective
	identity  RuntimeIdentity
	plan      enforce.Plan
	// refusedPlan is the plan refused for withholding a required
	// permission, or, for a call the settings refuse, the plan the
	// settings would give it (settings.SettingsPlan): inspection shows what
	// else it withholds, and no call is given it.
	refusedPlan enforce.Plan
	// writer says the call holds the worktree alone (ADR-025 rule 4): its
	// plan grants a permission the service lists as writing, or its process
	// declares verify, whose command runs with the operator's authority.
	writer bool
	// session is the session mode the call runs under, which its process
	// says (ADR-030 rule 3).
	session string
}

// Resolver loads and checks definitions, composes limits, checks the
// runtime and plans enforcement. Every failure is a refusal.
type Resolver struct {
	definitions ResolverDefinitions
	identities  ResolverIdentities
	validator   ResolverValidator
	// probes verify a version the settings verify nothing for; nil: none
	// is probed.
	probes ResolverProbes
	// check checks the definitions the resolver reads, which must not
	// change under it (a snapshot), so a call that depends on a document
	// with a problem is refused (ADR-015).
	check ResolverCheck
	// checked is what the problems refuse, checked once when the
	// definitions were frozen.
	checked *checkedReach
}

// ResolverCheck checks the settings a call resolves from, to refuse one
// that depends on a document with a problem.
type ResolverCheck interface {
	Check(ctx context.Context) (ResolverChecked, error)
}

// ResolverChecked is what a check of the settings tells a call: each
// document listed, what it uses, and the problems and blocks that refuse
// what depends on it. A problem that stops every command is not here: the
// gate refuses every command for it first.
type ResolverChecked struct {
	Documents []ResolverDocument
	Problems  []ResolverProblem
	Blocks    []ResolverBlock
}

// ResolverDocument is one document the settings list.
type ResolverDocument struct {
	Ref  DocumentRef
	Path string
	Uses []DocumentRef // whether or not they exist
	// Binds are a workflow's nodes, in declaration order, the join last.
	Binds []NodeBinding
}

// ResolverProblem is one problem of a document.
type ResolverProblem struct {
	About   DocumentRef
	Message string // without the document's name
	// Set on a process's problem that depends on the agent it names: a
	// call that selects another agent does not have it (ADR-015 rule 2).
	Agent string
	// Unknown: it names something this code does not know, as settings
	// written for a newer Agister would.
	Unknown bool
}

// ResolverBlock is one document the repository blocks (ADR-018).
type ResolverBlock struct {
	Ref    DocumentRef
	Path   string // of the blocks.yaml
	Reason string
}

func (f ResolverChecked) reach() *reach {
	r := newReach()
	for _, d := range f.Documents {
		r.documents[d.Ref] = reachDocument{path: d.Path, uses: d.Uses, binds: d.Binds}
	}
	for _, p := range f.Problems {
		r.about[p.About] = append(r.about[p.About], reachProblem{message: p.Message, agent: p.Agent, unknown: p.Unknown})
	}
	for _, b := range f.Blocks {
		r.blocked[b.Ref] = reachBlock{path: b.Path, reason: b.Reason}
	}
	return r
}

type checkedReach struct {
	reach *reach
	err   error
}

// ResolverDefinitions supplies the documents a call or a view is resolved
// from, and the layers they are read from. ReadListed is read by the
// snapshot a resolver freezes them in, which its check checks.
type ResolverDefinitions interface {
	Read(ctx context.Context, kind definition.Kind, name string) (definition.Document, error)
	ReadListed(ctx context.Context, kind definition.Kind, name string) (definition.Document, error)
	List(ctx context.Context, kind definition.Kind) ([]string, error)
	Layers(ctx context.Context) []definition.LayerDir
}

// ResolverIdentities asks a runtime adapter what it reports about itself,
// to check the runtime a call would use.
type ResolverIdentities interface {
	Identity(ctx context.Context, adapter, command string) (RuntimeIdentity, error)
}

// ResolverProbes verify a runtime version the settings verify no
// primitive for (ADR-029): the primitives a probe found holding, none when
// its adapter has no probe, and an error when the probe failed.
type ResolverProbes interface {
	Verified(ctx context.Context, adapter, command, version string) ([]string, error)
}

// ResolverValidator compiles an output schema.
type ResolverValidator interface {
	Compile(schema []byte) error
}

// ResolverAdapters are what a Resolver runs on besides the settings it
// resolves from.
type ResolverAdapters struct {
	Identities ResolverIdentities
	Validator  ResolverValidator
	// Probes verify a runtime version the settings verify no primitive
	// for (ADR-029); nil: none is probed.
	Probes ResolverProbes
}

// NewResolver returns the component that resolves a process into what a
// call or a view needs. check checks definitions; every collaborator is
// required.
func NewResolver(definitions ResolverDefinitions, identities ResolverIdentities, validator ResolverValidator, check ResolverCheck) *Resolver {
	return &Resolver{definitions: definitions, identities: identities, validator: validator, check: check}
}

// frozen returns a resolver over the definitions as they are now, which
// reads nothing else afterwards (see the package function Snapshot).
func (r *Resolver) frozen(ctx context.Context) *Resolver {
	copied := *r
	copied.definitions = Snapshot(ctx, r.definitions)
	copied.checked = nil
	reached, err := copied.reach(ctx)
	copied.checked = &checkedReach{reach: reached, err: err}
	return &copied
}

// reach is what the problems of the resolver's definitions refuse.
func (r *Resolver) reach(ctx context.Context) (*reach, error) {
	if r.checked != nil {
		return r.checked.reach, r.checked.err
	}
	found, err := r.check.Check(ctx)
	if err != nil {
		return nil, err
	}
	return found.reach(), nil
}

// overrides are the caller's narrowing limits.
type overrides struct {
	timeout    string
	maxCostUSD *float64
	// A workflow defers only a missing named verification to its node.
	deferMissingVerify bool
	// The call is a workflow node's: its agent is the one the node binds
	// its process to (ADR-030 rule 5).
	node bool
}

// resolve resolves the process named processName. A refused one's
// resolution has what was resolved before the refusal. A call that depends
// on a document with a problem, or a blocked one, is refused for it, naming
// each, before its runtime is asked anything (ADR-015, ADR-018).
func (r *Resolver) resolve(ctx context.Context, processName, agentOverride string, caller overrides) (*resolution, error) {
	reached, err := r.reach(ctx)
	if err != nil {
		return &resolution{}, err
	}
	refused := reached.call(processName, agentOverride)
	res, err := r.resolveCall(ctx, processName, agentOverride, caller, refused != nil)
	if refused != nil {
		// A listed but unreadable process still has an identity for its view.
		if reached.listed(DocumentRef{Kind: definition.KindProcess, Name: processName}) && res.process.Name == "" {
			res.process.Name = processName
		}
		return res, refused
	}
	return res, err
}

// resolveCall resolves the call; settingsOnly stops it before the runtime
// is asked anything.
func (r *Resolver) resolveCall(ctx context.Context, processName, agentOverride string, caller overrides, settingsOnly bool) (res *resolution, err error) {
	res = &resolution{}
	root := DocumentRef{Kind: definition.KindProcess, Name: processName}
	subject := root
	defer func() {
		// Static problems already carry their document and chain. Problems
		// discovered while resolving an override or probing its runtime
		// need the same attribution (ADR-015 rules 2 and 3).
		if settingsOnly || err == nil {
			return
		}
		var refusal *Refusal
		if !errors.As(err, &refusal) {
			return
		}
		reached, checkErr := r.reach(ctx)
		if checkErr == nil {
			if subject.Kind == definition.KindVerify {
				if !reached.listed(subject) {
					// ADR-010's missing-verification refusal already names
					// the process, reference and both expected paths.
					return
				}
			}
			err = reached.explain(root, agentOverride, subject, refusal.Reason)
		}
	}()
	load := func(kind definition.Kind, name string) (definition.Document, error) {
		subject = DocumentRef{Kind: kind, Name: name}
		doc, err := r.definitions.Read(ctx, kind, name)
		if err != nil {
			return doc, refuse("%s %q: %v", kind.Singular(), name, err)
		}
		res.sources = append(res.sources, doc.Source)
		return doc, nil
	}
	parsed := func(err error) error {
		var invalid *definition.InvalidError
		if errors.As(err, &invalid) {
			return refuse("%v", err)
		}
		return err
	}

	doc, err := load(definition.KindService, "service")
	if err != nil {
		return res, err
	}
	if res.service, err = definition.ParseService(doc); err != nil {
		return res, parsed(err)
	}
	if doc, err = load(definition.KindProcess, processName); err != nil {
		return res, err
	}
	if res.process, err = definition.ParseProcess(doc); err != nil {
		return res, parsed(err)
	}
	// A process names no agent, and has one only as a node that binds it
	// to one: nothing else chooses an agent (ADR-030 rules 2 and 5).
	bound := caller.node && agentOverride != ""
	if bound {
		if doc, err = load(definition.KindAgent, agentOverride); err != nil {
			return res, err
		}
		if res.agent, err = definition.ParseAgent(doc); err != nil {
			return res, parsed(err)
		}
		if doc, err = load(definition.KindRuntime, res.agent.Runtime); err != nil {
			return res, err
		}
		if res.mapping, err = definition.ParseMapping(doc); err != nil {
			return res, parsed(err)
		}
		if unknown := res.mapping.UnknownPermissions(res.service.Permissions); len(unknown) > 0 {
			return res, refuse("runtime mapping %s grants permissions not in the vocabulary: %s", res.mapping.Name, strings.Join(unknown, ", "))
		}
		if res.agent.Effort != "" && !contains(res.mapping.Efforts, res.agent.Effort) {
			return res, refuse("agent %s: effort %q is not supported by runtime %s (supported: %s)", res.agent.Name, res.agent.Effort, res.mapping.Name, strings.Join(res.mapping.Efforts, ", "))
		}
	}
	if res.process.Output.Format == "json" {
		if doc, err = load(definition.KindSchema, res.process.Output.Schema); err != nil {
			return res, err
		}
		res.schema = doc.Bytes
		// Fail before the agent runs, not when its output is validated.
		if err := r.validator.Compile(res.schema); err != nil {
			return res, refuse("schema %q: %v", res.process.Output.Schema, err)
		}
	}
	// The verification a process names is the call's from here on
	// (ADR-010 rule 3); without it the call is refused, never run unverified.
	if name := res.process.VerifyName; name != "" {
		names, listErr := r.definitions.List(ctx, definition.KindVerify)
		if listErr != nil {
			return res, listErr
		}
		if !caller.deferMissingVerify || contains(names, name) {
			if doc, err = load(definition.KindVerify, name); err != nil {
				return res, refuse("process %s names verify:%s: %v", res.process.Name, name, err)
			}
			verification, err := definition.ParseVerify(doc)
			if err != nil {
				return res, parsed(err)
			}
			res.process.Verify = &verification.Verify
		}
	}
	// The prompt and each guidance prompt a process names are read with
	// the call, from the same settings, and recorded among its sources
	// (ADR-014 rule 3). One no layer has refuses the call, as any other
	// document does (ADR-028 rule 8).
	for _, name := range res.process.Prompts() {
		namer := "process " + res.process.Name + " names"
		if name != res.process.Prompt {
			namer += " in its guidance"
		}
		if doc, err = load(definition.KindPrompt, name); err != nil {
			return res, refuse("%s %v", namer, err)
		}
		prompt, err := definition.ParsePrompt(doc)
		if err != nil {
			return res, parsed(err)
		}
		res.prompts = append(res.prompts, prompt)
	}
	// Each brief form its inputs name is read with the call, from the same
	// settings, and recorded among its sources (ADR-026 rule 8).
	for _, name := range res.process.Forms() {
		if doc, err = load(definition.KindBrief, name); err != nil {
			return res, refuse("process %s names %v", res.process.Name, err)
		}
		brief, err := definition.ParseBrief(doc)
		if err != nil {
			return res, parsed(err)
		}
		if res.forms == nil {
			res.forms = map[string]definition.Brief{}
		}
		res.forms[name] = brief
	}
	// Each skill the process and its agent name is read with the call, from
	// the same settings, and recorded among its sources (ADR-021 rule 3).
	for _, name := range definition.CallSkills(res.process, res.agent) {
		namer := "process " + res.process.Name
		if !contains(res.process.Skills, name) {
			namer = "agent " + res.agent.Name
		}
		if doc, err = load(definition.KindSkill, name); err != nil {
			return res, refuse("%s names %v", namer, err)
		}
		skill, err := definition.ParseSkill(doc)
		if err != nil {
			return res, parsed(err)
		}
		res.skills = append(res.skills, skill)
	}

	subject = root
	limits := policy.Caller{MaxCostUSD: caller.maxCostUSD}
	if caller.timeout != "" {
		timeout, err := time.ParseDuration(caller.timeout)
		if err != nil || timeout <= 0 {
			return res, refuse("invalid timeout %q", caller.timeout)
		}
		limits.Timeout = &timeout
	}
	if caller.maxCostUSD != nil && *caller.maxCostUSD <= 0 {
		return res, refuse("invalid cost limit %g", *caller.maxCostUSD)
	}
	if res.effective, err = policy.Compose(res.service, res.process, limits); err != nil {
		return res, refuse("%v", err)
	}
	// Refused once everything that needs no agent is resolved, so its view
	// has it.
	if !bound {
		return res, refuse("names no agent: only a workflow's node binds it to one (ADR-030 rule 5); run a workflow that binds it")
	}
	// A call the settings refuse never asks its runtime: its view shows
	// what the settings' plan withholds, which no call is given.
	if settingsOnly {
		res.refusedPlan, _ = settings.SettingsPlan(res.service, res.effective, res.mapping)
	}

	// Whether the call's session may be resumed is its process's to say
	// (ADR-030 rule 3).
	res.session = definition.CallSession(res.process)
	// A repair turn resumes the call's own session (ADR-002 rule 4).
	if verify := res.process.Verify; verify.Repairs() && res.session != definition.SessionResumable {
		return res, refuse("verify.max_attempts %d repairs in the call's session, but process %s is %s", verify.MaxAttempts, res.process.Name, res.session)
	}
	// So does a recovery turn (ADR-024 rule 6).
	if resumes := res.effective.Stale.Recover.MaxResumes; resumes > 0 && res.session != definition.SessionResumable {
		return res, refuse("stale.recover.max_resumes %d recovers in the call's session, but process %s is %s", resumes, res.process.Name, res.session)
	}

	if settingsOnly {
		return res, nil
	}
	subject = DocumentRef{Kind: definition.KindRuntime, Name: res.mapping.Name}
	if res.identity, err = r.identities.Identity(ctx, res.mapping.Adapter, res.agent.Command); err != nil {
		subject = DocumentRef{Kind: definition.KindAgent, Name: res.agent.Name}
		return res, refuse("runtime %s is unavailable: %v", res.mapping.Name, err)
	}
	if res.identity.Contract != res.mapping.Contract {
		return res, refuse("runtime mapping %s describes adapter contract %s, but the adapter implements %s", res.mapping.Name, res.mapping.Contract, res.identity.Contract)
	}
	if verify := res.process.Verify; verify.Repairs() && !res.identity.Resume {
		subject = root
		return res, refuse("verify.max_attempts %d repairs in the call's session, but runtime %s cannot resume sessions", verify.MaxAttempts, res.mapping.Name)
	}
	if resumes := res.effective.Stale.Recover.MaxResumes; resumes > 0 && !res.identity.Resume {
		subject = root
		return res, refuse("stale.recover.max_resumes %d recovers in the call's session, but runtime %s cannot resume sessions", resumes, res.mapping.Name)
	}
	verified, unverified := res.mapping.ForVersion(res.identity.Version)
	// A version the settings verify nothing for is probed, once (ADR-029).
	if len(verified.Primitives) == 0 && r.probes != nil {
		probed, err := r.probes.Verified(ctx, res.mapping.Adapter, res.agent.Command, res.identity.Version)
		if err != nil {
			return res, refuse("runtime mapping %s verifies no primitive for %s version %s%s", res.mapping.Name, res.mapping.Adapter, res.identity.Version, probeRefusal(err))
		}
		res.mapping = res.mapping.WithVerified(res.identity.Version, probed)
		verified, unverified = res.mapping.ForVersion(res.identity.Version)
	}
	if len(verified.Primitives) == 0 {
		return res, refuse("runtime mapping %s verifies no primitive for %s version %s", res.mapping.Name, res.mapping.Adapter, res.identity.Version)
	}
	if message := settings.CostRefusal(res.effective, res.mapping.Name, res.identity.CostLimit); message != "" {
		subject = root
		return res, refuse("%s", message)
	}
	// An adapter that cannot give skills refuses a call that names one: it
	// must not run without them (ADR-021 rule 6).
	if len(res.skills) > 0 && !res.identity.Skills {
		subject = root
		names := translated(res.skills, func(skill definition.Skill) string { return skill.Name })
		return res, refuse("adapter %s of runtime %s cannot give a call its skills (ADR-021): %s", res.mapping.Adapter, res.mapping.Name, strings.Join(names, ", "))
	}
	// The staleness limits on tool calls need the adapter to report them.
	if stale := res.effective.Stale; !res.identity.ToolCalls {
		subject = root
		switch {
		case stale.ToolCommand != nil:
			return res, refuse("runtime %s does not report tool calls, so it cannot enforce stale.tool_command %s", res.mapping.Name, *stale.ToolCommand)
		case stale.RepeatedToolCalls != nil:
			return res, refuse("runtime %s does not report tool calls, so it cannot enforce stale.repeated_tool_calls %d", res.mapping.Name, *stale.RepeatedToolCalls)
		}
	}
	subject = root
	if res.plan, err = enforce.Make(res.effective.Permissions, offer(verified), res.effective.Require, res.service.StateReaching); err != nil {
		if refused := (*enforce.RefusedError)(nil); errors.As(err, &refused) && refused.Plan != nil {
			res.refusedPlan = *refused.Plan
		}
		return res, refuse("runtime %s: %v%s", res.mapping.Name, err, unverifiedNote(unverified, "for version "+res.identity.Version))
	}
	if tools := res.identity.SkillTools; len(tools) > 0 && !slices.ContainsFunc(tools, func(tool string) bool { return contains(res.plan.Primitives, tool) }) {
		return res, refuse("runtime %s needs %s to use the repository's skills (ADR-006), and the plan grants no such tool: %s",
			res.mapping.Name, strings.Join(tools, " or "), withoutSkillTools(res, tools, verified, unverified))
	}
	res.writer = res.process.Verify != nil || res.process.VerifyName != "" ||
		slices.ContainsFunc(res.plan.Granted, func(permission string) bool { return contains(res.service.Writing, permission) })
	return res, nil
}

// withoutSkillTools says why the plan grants none of tools: each is
// unverified for the version, absent from the mapping, or needs
// permissions the plan withholds or the effective permissions do not
// allow.
func withoutSkillTools(res *resolution, tools []string, verified definition.Mapping, unverified []string) string {
	// What a primitive may grant: the effective permissions, less the
	// state-reaching ones, which the plan withholds (enforce.Make).
	allowed := slices.DeleteFunc(slices.Clone(res.effective.Permissions), func(p string) bool { return contains(res.service.StateReaching, p) })
	var reasons []string
	for _, tool := range tools {
		i := slices.IndexFunc(verified.Primitives, func(p definition.Primitive) bool { return p.Name == tool })
		switch {
		case i >= 0:
			var withheld, disallowed []string
			for _, grant := range verified.Primitives[i].Grants {
				switch {
				case contains(allowed, grant):
				case contains(res.plan.Withheld, grant):
					withheld = append(withheld, grant)
				default:
					disallowed = append(disallowed, grant)
				}
			}
			var parts []string
			if len(withheld) > 0 {
				parts = append(parts, strings.Join(withheld, ", ")+", which the plan withholds")
			}
			if len(disallowed) > 0 {
				parts = append(parts, strings.Join(disallowed, ", ")+", which the effective permissions do not allow")
			}
			if len(parts) == 0 {
				reasons = append(reasons, "the plan does not grant "+tool)
			} else {
				reasons = append(reasons, tool+" needs "+strings.Join(parts, ", and "))
			}
		case contains(unverified, tool):
			reasons = append(reasons, tool+" is not verified for version "+res.identity.Version)
		default:
			reasons = append(reasons, "runtime mapping "+res.mapping.Name+" has no "+tool)
		}
	}
	return strings.Join(reasons, "; ")
}

// workflowResolution is a workflow and its nodes' processes, as a run of it
// uses them. Each node's call resolves its own process again, fully.
type workflowResolution struct {
	workflow  definition.Workflow
	processes map[string]definition.Process
	sources   []definition.Source         // the workflow's document, then its brief forms'
	forms     map[string]definition.Brief // by name: the brief forms its inputs name (ADR-026 rule 8)
}

// workflow resolves the workflow named name, refusing one whose nodes
// cannot run as ADR-003 has them (settings.WorkflowProblems), and one that
// depends on a document with a problem (ADR-015) or a blocked one
// (ADR-018). found is false when the
// settings list no workflow of that name.
func (r *Resolver) workflow(ctx context.Context, name string) (*workflowResolution, bool, error) {
	names, err := r.definitions.List(ctx, definition.KindWorkflow)
	if err != nil || !contains(names, name) {
		return nil, false, nil
	}
	reached, err := r.reach(ctx)
	if err != nil {
		return nil, true, err
	}
	res, err := r.resolveWorkflow(ctx, name)
	// Refused before any node runs, for a problem in what the workflow or
	// any node's call depends on (ADR-015 rule 3), or a block on it
	// (ADR-018 rule 2).
	if refused := reached.workflow(name); refused != nil {
		return res, true, refused
	}
	if err == nil {
		// Resolve every node, including the join, before any turn. Only a
		// missing named verification remains a refusal at its node.
		var problems []string
		seen := map[NodeBinding]bool{}
		for _, node := range res.workflow.Nodes() {
			binding := NodeBinding{Process: node.Process, Agent: node.Agent}
			if seen[binding] {
				continue
			}
			seen[binding] = true
			// Its nodes work in the caller's worktree, as any call does
			// (ADR-025 rule 4), each on the agent it binds (ADR-030 rule 5).
			if _, problem := r.resolve(ctx, node.Process, node.Agent, overrides{deferMissingVerify: true, node: true}); problem != nil {
				problems = append(problems, "workflow "+name+" uses "+strings.Replace(problem.Error(), " uses ", ", which uses ", 1))
			}
		}
		if len(problems) > 0 {
			err = refuse("%s", strings.Join(problems, "; "))
		}
	}
	return res, true, err
}

// resolveWorkflow reads the workflow and its nodes' processes.
func (r *Resolver) resolveWorkflow(ctx context.Context, name string) (*workflowResolution, error) {
	res := &workflowResolution{workflow: definition.Workflow{Name: name}, processes: map[string]definition.Process{}}
	doc, err := r.definitions.Read(ctx, definition.KindWorkflow, name)
	if err != nil {
		return res, refuse("workflow %q: %v", name, err)
	}
	res.sources = append(res.sources, doc.Source)
	if res.workflow, err = definition.ParseWorkflow(doc); err != nil {
		return res, refuse("%v", err)
	}
	// Each brief form its inputs name is read with the run, from the same
	// settings, and recorded among its sources (ADR-026 rule 8).
	for _, form := range res.workflow.Forms() {
		doc, err := r.definitions.Read(ctx, definition.KindBrief, form)
		if err != nil {
			return res, refuse("workflow %s names brief %q: %v", name, form, err)
		}
		res.sources = append(res.sources, doc.Source)
		brief, err := definition.ParseBrief(doc)
		if err != nil {
			return res, refuse("%v", err)
		}
		if res.forms == nil {
			res.forms = map[string]definition.Brief{}
		}
		res.forms[form] = brief
	}
	for _, node := range res.workflow.Nodes() {
		if _, ok := res.processes[node.Process]; ok {
			continue
		}
		doc, err := r.definitions.Read(ctx, definition.KindProcess, node.Process)
		if err != nil {
			continue // a process that does not exist is a workflow problem
		}
		process, err := definition.ParseProcess(doc)
		if err != nil {
			return res, refuse("node %s: %v", node.Name, err)
		}
		res.processes[node.Process] = process
	}
	if problems := settings.WorkflowProblems(res.workflow, res.processes, nil); len(problems) > 0 {
		return res, refuse("workflow %s: %s", name, strings.Join(problems, "; "))
	}
	return res, nil
}

// unverifiedNote names the primitives a refused plan could not use.
func unverifiedNote(unverified []string, scope string) string {
	if len(unverified) == 0 {
		return ""
	}
	return fmt.Sprintf(" (not verified %s: %s)", scope, strings.Join(unverified, ", "))
}

func contains(list []string, value string) bool {
	for _, item := range list {
		if item == value {
			return true
		}
	}
	return false
}

// offer is what the runtime mapping offers enforce: its primitives, and
// whether a plan takes exactly one of them.
func offer(mapping definition.Mapping) enforce.Offer {
	primitives := make([]enforce.Primitive, 0, len(mapping.Primitives))
	for _, primitive := range mapping.Primitives {
		primitives = append(primitives, enforce.Primitive{Name: primitive.Name, Grants: primitive.Grants})
	}
	return enforce.Offer{One: mapping.Select == "one", Primitives: primitives}
}
