package app

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io/fs"
	"path"
	"sort"
	"strings"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/contract"
	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
)

// Settings manages definitions: examples, agents and process listings.
type Settings struct {
	definitions SettingsDefinitions
	writer      DefinitionWriter
	examples    Examples
	// Every settings view a write takes part in (global settings alone, and
	// with the project in view); each must stay valid.
	scopes []Scope
	// check checks the definitions the listings read, to show what their
	// problems refuse (ADR-015).
	check SettingsCheck
}

// SettingsCheck checks the settings a listing reads.
type SettingsCheck interface {
	Check(ctx context.Context) (SettingsChecked, error)
}

// SettingsChecked is what a check of the settings tells a listing: each
// document listed, what it uses, and the problems that refuse what depends
// on it. A problem that stops every command is not here: the gate refuses
// every command for it first.
type SettingsChecked struct {
	Documents []SettingsDocument
	Problems  []SettingsProblem
	Blocks    []SettingsBlock
}

// SettingsDocument is one document the settings list.
type SettingsDocument struct {
	Ref  DocumentRef
	Path string
	Uses []DocumentRef // whether or not they exist
}

// SettingsProblem is one problem of a document. A listing shows what a
// call without --agent would be refused, so every problem of a process
// counts, whichever agent it depends on.
type SettingsProblem struct {
	About   DocumentRef
	Message string // without the document's name
}

// SettingsBlock is one document the repository blocks (ADR-018): a listing
// shows what it refuses as it shows what a problem refuses.
type SettingsBlock struct {
	Ref    DocumentRef
	Path   string // of the blocks.yaml
	Reason string
}

func (f SettingsChecked) reach() *reach {
	r := newReach()
	for _, d := range f.Documents {
		r.documents[d.Ref] = reachDocument{path: d.Path, uses: d.Uses}
	}
	for _, p := range f.Problems {
		r.about[p.About] = append(r.about[p.About], reachProblem{message: p.Message})
	}
	for _, b := range f.Blocks {
		r.blocked[b.Ref] = reachBlock{path: b.Path, reason: b.Reason}
	}
	return r
}

// SettingsDefinitions supplies the definitions a listing or a write reads.
type SettingsDefinitions interface {
	Read(ctx context.Context, kind definition.Kind, name string) (definition.Document, error)
	List(ctx context.Context, kind definition.Kind) ([]string, error)
}

// DefinitionWriter stores definition documents.
type DefinitionWriter interface {
	// Write stores data only over the document with digest expected, or
	// where there is none when expected is empty; otherwise it writes
	// nothing and written is false.
	Write(ctx context.Context, kind definition.Kind, name string, data []byte, expected string) (path string, written bool, err error)
	// Current reports where a document would be stored and a digest of the
	// one there, empty when there is none.
	Current(ctx context.Context, kind definition.Kind, name string) (path, digest string, err error)
}

// SettingsAdapters are what Settings runs on besides the settings it reads.
type SettingsAdapters struct {
	Writer   DefinitionWriter
	Examples Examples
}

// NewSettings returns the use case that manages definitions. scopes are
// every settings view a write takes part in (global settings alone, and
// with the project in view); each must stay valid. check checks
// definitions, for the listings.
func NewSettings(definitions SettingsDefinitions, writer DefinitionWriter, examples Examples, scopes []Scope, check SettingsCheck) *Settings {
	return &Settings{definitions: definitions, writer: writer, examples: examples, scopes: scopes, check: check}
}

// Scope is one view of the settings a write takes part in.
type Scope struct {
	Name  string // for messages, e.g. "global settings"
	Check ProposedCheck
}

// ProposedCheck reports the problems a global document would add to one
// view of the settings, were it written; problems already there are not
// reported.
type ProposedCheck interface {
	ProblemsAdded(ctx context.Context, doc definition.Document) ([]string, error)
}

func (s *Settings) Init(ctx context.Context, overwrite bool, approved *contract.InitResult) (contract.InitResult, error) {
	result := contract.InitResult{Digests: map[string]string{}, Contents: map[string]string{}}
	if s.examples == nil {
		return result, &contract.InputError{Message: "no example definitions are available"}
	}
	var files []string
	err := fs.WalkDir(s.examples, ".", func(name string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if strings.HasPrefix(entry.Name(), ".") && name != "." {
			// Stray OS metadata such as .DS_Store is never a definition.
			if entry.IsDir() {
				return fs.SkipDir
			}
			return nil
		}
		if !entry.IsDir() {
			files = append(files, name)
		}
		return nil
	})
	if err != nil {
		return result, err
	}
	sort.Strings(files)
	type file struct {
		kind               definition.Kind
		base, path, digest string
		data               []byte
	}
	var plan []file
	for _, name := range files {
		kind, base := definition.KindService, "service"
		if dir := path.Dir(name); dir != "." {
			kind = definition.Kind(dir)
			base = strings.TrimSuffix(path.Base(name), path.Ext(name))
		} else if name != "service.toml" {
			return result, fmt.Errorf("unexpected example file %q", name)
		}
		data, err := fs.ReadFile(s.examples, name)
		if err != nil {
			return result, err
		}
		current, digest, err := s.writer.Current(ctx, kind, base)
		if err != nil {
			return result, err
		}
		plan = append(plan, file{kind, base, current, digest, data})
		sum := sha256.Sum256(data)
		result.Digests[current] = digest
		result.Contents[current] = hex.EncodeToString(sum[:])
		switch {
		case digest == "":
			result.Created = append(result.Created, current)
		case overwrite:
			result.Replaced = append(result.Replaced, current)
		default:
			result.Kept = append(result.Kept, current)
		}
	}
	if approved == nil {
		return result, nil
	}
	if err := initApproved(*approved, result); err != nil {
		return contract.InitResult{}, err
	}
	for _, f := range plan {
		if f.digest != "" && !overwrite {
			continue
		}
		// Only the file as planned is written over: one created, edited or
		// removed since is left as it is.
		if _, written, err := s.writer.Write(ctx, f.kind, f.base, f.data, f.digest); err != nil {
			return result, err
		} else if !written {
			return result, changedSinceApproved([]string{f.path})
		}
	}
	return result, nil
}

// initApproved refuses a plan other than the one approved: a file changed
// since, the same files handled differently, such as a kept file now
// replaced, or other content to write.
func initApproved(approved, plan contract.InitResult) error {
	actions := func(r contract.InitResult) map[string]string {
		m := map[string]string{}
		for _, p := range r.Created {
			m[p] = "create"
		}
		for _, p := range r.Replaced {
			m[p] = "replace"
		}
		for _, p := range r.Kept {
			m[p] = "keep"
		}
		return m
	}
	want, got := actions(approved), actions(plan)
	paths := make([]string, 0, len(want)+len(got))
	for p := range want {
		paths = append(paths, p)
	}
	for p := range got {
		if _, ok := want[p]; !ok {
			paths = append(paths, p)
		}
	}
	sort.Strings(paths)
	var changed, differ []string
	for _, p := range paths {
		switch {
		case approved.Digests[p] != plan.Digests[p]:
			changed = append(changed, p)
		case want[p] != got[p], approved.Contents[p] != plan.Contents[p]:
			differ = append(differ, p)
		}
	}
	if len(changed) > 0 {
		return changedSinceApproved(changed)
	}
	if len(differ) > 0 {
		return notApproved(differ)
	}
	return nil
}

func (s *Settings) CreateAgent(ctx context.Context, spec contract.Agent, overwrite bool, approved *contract.AgentWrite) (contract.AgentWrite, error) {
	agent := definition.Agent{
		Name: spec.Name, Runtime: spec.Runtime, Model: spec.Model, ModelFamily: spec.ModelFamily,
		Effort: spec.Effort, Command: spec.Command, Session: spec.Session,
	}
	if agent.Session == "" {
		agent.Session = definition.SessionFresh
	}
	if agent.Session != definition.SessionFresh && agent.Session != definition.SessionResumable {
		return contract.AgentWrite{}, &contract.InputError{Message: fmt.Sprintf("invalid session mode %q (supported: %s, %s)", agent.Session, definition.SessionFresh, definition.SessionResumable)}
	}
	if !definition.ValidName(agent.Name) {
		return contract.AgentWrite{}, &contract.InputError{Message: fmt.Sprintf("invalid agent name %q", agent.Name)}
	}
	doc, err := s.definitions.Read(ctx, definition.KindRuntime, agent.Runtime)
	if err != nil {
		names, _ := s.definitions.List(ctx, definition.KindRuntime)
		return contract.AgentWrite{}, &contract.InputError{Message: fmt.Sprintf("unknown runtime %q (available: %s)", agent.Runtime, strings.Join(names, ", "))}
	}
	mapping, err := definition.ParseMapping(doc)
	if err != nil {
		return contract.AgentWrite{}, err
	}
	if agent.Effort != "" && !contains(mapping.Efforts, agent.Effort) {
		return contract.AgentWrite{}, &contract.InputError{Message: fmt.Sprintf("unsupported %s effort %q (supported: %s)", mapping.Name, agent.Effort, strings.Join(mapping.Efforts, ", "))}
	}
	data := definition.FormatAgent(agent)
	if _, err := definition.ParseAgent(definition.Document{Source: definition.Source{Kind: definition.KindAgent, Name: agent.Name}, Bytes: data}); err != nil {
		return contract.AgentWrite{}, err
	}
	path, digest, err := s.writer.Current(ctx, definition.KindAgent, agent.Name)
	if err != nil {
		return contract.AgentWrite{}, err
	}
	exists := digest != ""
	if exists && !overwrite {
		return contract.AgentWrite{}, &contract.InputError{Message: fmt.Sprintf("agent %s already exists at %s (overwrite to replace it)", agent.Name, path)}
	}
	if err := s.keepsSettingsValid(ctx, definition.Document{Source: definition.Source{Kind: definition.KindAgent, Name: agent.Name, Path: path}, Bytes: data}); err != nil {
		return contract.AgentWrite{}, err
	}
	sum := sha256.Sum256(data)
	plan := contract.AgentWrite{Path: path, Replaces: exists, Digest: digest, Content: hex.EncodeToString(sum[:])}
	if approved == nil {
		return plan, nil
	}
	if approved.Path != plan.Path || approved.Content != plan.Content {
		return contract.AgentWrite{}, notApproved([]string{path})
	}
	if *approved != plan {
		return contract.AgentWrite{}, changedSinceApproved([]string{path})
	}
	// Only the file as planned is written over: one created, edited or
	// removed since is left as it is.
	if _, written, err := s.writer.Write(ctx, definition.KindAgent, agent.Name, data, digest); err != nil {
		return contract.AgentWrite{}, err
	} else if !written {
		return contract.AgentWrite{}, changedSinceApproved([]string{path})
	}
	return plan, nil
}

// changedSinceApproved refuses a write whose files differ from the plan the
// user approved.
func changedSinceApproved(paths []string) error {
	return &contract.InputError{Message: fmt.Sprintf("changed since you confirmed, so nothing more was written: %s", strings.Join(paths, ", "))}
}

// notApproved refuses a write other than the one the user approved.
func notApproved(paths []string) error {
	return &contract.InputError{Message: fmt.Sprintf("not the plan you confirmed, so nothing was written: %s", strings.Join(paths, ", "))}
}

// keepsSettingsValid refuses a document that would add problems to any
// scope: once written, they would refuse what depends on it, or stop every
// command there, including the one that could repair them. Problems that
// are there already do not stop it.
func (s *Settings) keepsSettingsValid(ctx context.Context, doc definition.Document) error {
	for _, scope := range s.scopes {
		added, err := scope.Check.ProblemsAdded(ctx, doc)
		if err != nil {
			return err
		}
		if len(added) > 0 {
			return &contract.InputError{Message: fmt.Sprintf("%s %s would break the %s, so nothing was written:\n  %s", doc.Source.Kind.Singular(), doc.Source.Name, scope.Name, strings.Join(added, "\n  "))}
		}
	}
	return nil
}

func (s *Settings) ListAgents(ctx context.Context) ([]contract.Agent, error) {
	names, err := s.definitions.List(ctx, definition.KindAgent)
	if err != nil {
		return nil, err
	}
	reached, err := s.reach(ctx)
	if err != nil {
		return nil, err
	}
	agents := make([]contract.Agent, 0, len(names))
	for _, name := range names {
		refusal := refusalOf(reached.refusal(DocumentRef{Kind: definition.KindAgent, Name: name}, ""))
		// A broken agent is listed as such: it refuses only what uses it.
		doc, err := s.definitions.Read(ctx, definition.KindAgent, name)
		if err != nil {
			agents = append(agents, contract.Agent{Name: name, Problem: fmt.Sprintf("unreadable: %v (run `agister check`)", err), Refusal: refusal})
			continue
		}
		agent, err := definition.ParseAgent(doc)
		if err != nil {
			agents = append(agents, contract.Agent{Name: name, Problem: "invalid (run `agister check`)", Refusal: refusal})
			continue
		}
		agents = append(agents, contract.Agent{Name: agent.Name, Runtime: agent.Runtime, Model: agent.Model, ModelFamily: agent.ModelFamily, Effort: agent.Effort, Session: agent.Session, Command: agent.Command, Refusal: refusal})
	}
	return agents, nil
}

func (s *Settings) ListProcesses(ctx context.Context) ([]contract.ProcessSummary, error) {
	names, err := s.definitions.List(ctx, definition.KindProcess)
	if err != nil {
		return nil, err
	}
	reached, err := s.reach(ctx)
	if err != nil {
		return nil, err
	}
	processes := make([]contract.ProcessSummary, 0, len(names))
	for _, name := range names {
		refusal := refusalOf(reached.call(name, ""))
		doc, err := s.definitions.Read(ctx, definition.KindProcess, name)
		if err != nil {
			processes = append(processes, contract.ProcessSummary{Name: name, Problem: fmt.Sprintf("unreadable: %v (run `agister check`)", err), Refusal: refusal})
			continue
		}
		process, err := definition.ParseProcess(doc)
		if err != nil {
			processes = append(processes, contract.ProcessSummary{Name: name, Problem: "invalid (run `agister check`)", Refusal: refusal})
			continue
		}
		output := process.Output.Format
		if process.Output.Schema != "" {
			output += ":" + process.Output.Schema
		}
		processes = append(processes, contract.ProcessSummary{Name: process.Name, Agent: process.Agent, Policy: process.Policy, Output: output, Refusal: refusal})
	}
	return processes, nil
}

// reach is what the problems of the settings refuse.
func (s *Settings) reach(ctx context.Context) (*reach, error) {
	found, err := s.check.Check(ctx)
	if err != nil {
		return nil, err
	}
	return found.reach(), nil
}

// refusalOf is a refusal's reason; empty for none.
func refusalOf(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}

func (s *Settings) ListWorkflows(ctx context.Context) ([]contract.WorkflowSummary, error) {
	names, err := s.definitions.List(ctx, definition.KindWorkflow)
	if err != nil {
		return nil, err
	}
	reached, err := s.reach(ctx)
	if err != nil {
		return nil, err
	}
	workflows := make([]contract.WorkflowSummary, 0, len(names))
	for _, name := range names {
		refusal := refusalOf(reached.workflow(name))
		doc, err := s.definitions.Read(ctx, definition.KindWorkflow, name)
		if err != nil {
			workflows = append(workflows, contract.WorkflowSummary{Name: name, Problem: fmt.Sprintf("unreadable: %v (run `agister check`)", err), Refusal: refusal})
			continue
		}
		workflow, err := definition.ParseWorkflow(doc)
		if err != nil {
			workflows = append(workflows, contract.WorkflowSummary{Name: name, Problem: "invalid (run `agister check`)", Refusal: refusal})
			continue
		}
		summary := contract.WorkflowSummary{Name: workflow.Name, Join: workflow.Join.Name + ":" + workflow.Join.Process, Refusal: refusal}
		for _, node := range workflow.FanOut {
			summary.FanOut = append(summary.FanOut, node.Name+":"+node.Process)
		}
		workflows = append(workflows, summary)
	}
	return workflows, nil
}

// VerifyWarning is what check and process show say of a process whose
// verification is in effect (ADR-002 rule 10): until verification is
// confined, the command lends the operator's authority to the agent's code.
const VerifyWarning = "verify runs its command with the operator's authority, not the agent's permissions, " +
	"and the command can run code the agent wrote, with access to Agister's state"

// Inspection shows a process as a call would see it, without effects.
type Inspection struct {
	resolver InspectionResolver
}

// InspectionResolver resolves a process the way a call would, and a
// workflow the way a run of it would (Resolver is one).
type InspectionResolver interface {
	// InspectProcess resolves the process named name, with agent, when set,
	// in place of its own, and no limits of a caller. A refused one's view
	// has what was resolved before the refusal, never nil.
	InspectProcess(ctx context.Context, name, agent string) (*InspectedProcess, error)
	// InspectWorkflow resolves the workflow of that name; found is false
	// when the settings have none.
	InspectWorkflow(ctx context.Context, name string) (res *InspectedWorkflow, found bool, err error)
}

// InspectedProcess is a process as a call would resolve it, as far as its
// view shows it.
type InspectedProcess struct {
	Process InspectedDefinition
	Agent   string // the agent's name
	// AgentSkills are the skills the agent names and the process does not:
	// with the process's, the call's (ADR-021 rule 2).
	AgentSkills []string
	Runtime     string // the runtime mapping's name
	Effective   InspectedLimits
	Primitives  []string // the plan's
	Withheld    []string // allowed but not provided
	Sources     []InspectedSource
	Absent      []string // the optional prompts neither layer has (ADR-019)
}

// InspectedDefinition is what the view shows of a process's definition.
type InspectedDefinition struct {
	Name         string
	Policy       string
	OutputFormat string // "json" or "text"
	OutputSchema string // name of a schema definition (json only)
	Params       []InspectedParam
	Values       []InspectedValue
	Verify       *InspectedVerify // unset: no verification, or a named one not resolved
	VerifyName   string           // the verification it names; empty for an inline block
	Prompts      []string         // the prompts its inputs name
	Optional     []string         // those of Prompts only optional inputs name (ADR-019)
	Skills       []string         // the skills it names
}

// InspectedParam is a param a process or workflow declares.
type InspectedParam struct {
	Name       string
	Default    string
	HasDefault bool
}

// InspectedValue is an input a process or workflow declares, and its
// source kind.
type InspectedValue struct {
	Name     string
	Source   string
	Optional bool // an optional prompt (ADR-019)
}

// InspectedVerify is a process's verification command.
type InspectedVerify struct {
	Command     string
	Timeout     time.Duration
	MaxAttempts int
	Instruction string
}

// InspectedLimits are a call's composed limits.
type InspectedLimits struct {
	Timeout     time.Duration
	MaxAttempts int
	MaxCostUSD  *float64 // unset: no cost limit
	Allow       []string
	Deny        []string
	Permissions []string // allowed and not denied
	Access      string
	Scope       string
	Stale       InspectedStale
}

// InspectedStale are a call's composed staleness limits; a zero one is not
// set.
type InspectedStale struct {
	NoEvent           time.Duration
	NoOutput          time.Duration
	ToolCommand       time.Duration
	RepeatedToolCalls int
	MaxResumes        int // recovery turns a stale call may take (ADR-024)
}

func inspectedStale(stale CallStale) InspectedStale {
	return InspectedStale{
		NoEvent: stale.NoEvent, NoOutput: stale.NoOutput, ToolCommand: stale.ToolCommand,
		RepeatedToolCalls: stale.RepeatedToolCalls, MaxResumes: stale.Recover.MaxResumes,
	}
}

// InspectedSource is where a definition came from.
type InspectedSource struct {
	Kind    string
	Name    string
	Path    string
	Project bool
	// The global definition this project one takes priority over.
	Overrides string
}

// InspectedWorkflow is a workflow and its nodes' processes, as a run of it
// would resolve them.
type InspectedWorkflow struct {
	Workflow      InspectedWorkflowDefinition
	NodeProcesses map[string]InspectedNodeProcess // by name
	Sources       []InspectedSource               // the workflow's document
}

// InspectedWorkflowDefinition is what the view shows of a workflow's
// definition.
type InspectedWorkflowDefinition struct {
	Name   string
	Params []InspectedParam
	Values []InspectedValue
	FanOut []InspectedNode
	Join   InspectedNode
}

// InspectedNode is one node of a workflow and the process it calls.
type InspectedNode struct {
	Name    string
	Process string
}

// InspectedNodeProcess is what the view reads of a node's process: the
// params it declares and the inputs that receive the workflow's collection.
type InspectedNodeProcess struct {
	Params   []string
	Collects []string
}

// InspectProcess translates the Resolver's resolution into the view's.
func (r *Resolver) InspectProcess(ctx context.Context, name, agent string) (*InspectedProcess, error) {
	res, err := r.resolve(ctx, name, agent, overrides{})
	process := res.process
	inspected := &InspectedProcess{
		Process: InspectedDefinition{
			Name: process.Name, Policy: process.Policy,
			OutputFormat: process.Output.Format, OutputSchema: process.Output.Schema,
			Params: inspectedParams(process.Params), Values: inspectedValues(process.Values),
			VerifyName: process.VerifyName, Prompts: process.Prompts(), Optional: process.OptionalPrompts(), Skills: process.Skills,
		},
		Agent:       res.agent.Name,
		AgentSkills: definition.CallSkills(process, res.agent)[len(process.Skills):],
		Runtime:     res.mapping.Name,
		Effective: InspectedLimits{
			Timeout: res.effective.Timeout, MaxAttempts: res.effective.MaxAttempts, MaxCostUSD: res.effective.MaxCostUSD,
			Allow: res.effective.Allow, Deny: res.effective.Deny, Permissions: res.effective.Permissions,
			Access: res.effective.Access, Scope: res.effective.Scope, Stale: inspectedStale(callStale(res.effective.Stale)),
		},
		Primitives: res.plan.Primitives,
		Withheld:   res.plan.Withheld,
		Sources:    inspectedSources(res.sources),
	}
	if verify := process.Verify; verify != nil {
		inspected.Process.Verify = &InspectedVerify{Command: verify.Command, Timeout: verify.Timeout, MaxAttempts: verify.MaxAttempts, Instruction: verify.Instruction}
	}
	for _, name := range inspected.Process.Prompts {
		for _, absent := range res.absent {
			if absent.prompt == name && !contains(inspected.Absent, name) {
				inspected.Absent = append(inspected.Absent, name)
			}
		}
	}
	return inspected, err
}

// InspectWorkflow translates the Resolver's workflow resolution into the
// view's.
func (r *Resolver) InspectWorkflow(ctx context.Context, name string) (*InspectedWorkflow, bool, error) {
	res, found, err := r.workflow(ctx, name)
	if res == nil {
		return nil, found, err
	}
	workflow := res.workflow
	node := func(node definition.Node) InspectedNode { return InspectedNode{Name: node.Name, Process: node.Process} }
	inspected := &InspectedWorkflow{
		Workflow: InspectedWorkflowDefinition{
			Name: workflow.Name, Params: inspectedParams(workflow.Params), Values: inspectedValues(workflow.Values),
			FanOut: translated(workflow.FanOut, node), Join: node(workflow.Join),
		},
		NodeProcesses: make(map[string]InspectedNodeProcess, len(res.processes)),
		Sources:       inspectedSources(res.sources),
	}
	for name, process := range res.processes {
		inspected.NodeProcesses[name] = InspectedNodeProcess{
			Params:   translated(process.Params, func(param definition.Param) string { return param.Name }),
			Collects: process.Collects(),
		}
	}
	return inspected, found, err
}

func inspectedParams(params []definition.Param) []InspectedParam {
	return translated(params, func(param definition.Param) InspectedParam {
		return InspectedParam{Name: param.Name, Default: param.Default, HasDefault: param.HasDefault}
	})
}

func inspectedValues(values []definition.Value) []InspectedValue {
	return translated(values, func(value definition.Value) InspectedValue {
		return InspectedValue{Name: value.Name, Source: value.Source, Optional: value.Optional()}
	})
}

func inspectedSources(sources []definition.Source) []InspectedSource {
	return translated(sources, func(source definition.Source) InspectedSource {
		return InspectedSource{Kind: string(source.Kind), Name: source.Name, Path: source.Path, Project: source.Project, Overrides: source.Overrides}
	})
}

// NewInspection returns the use case that shows a process as a call would
// see it.
func NewInspection(resolver InspectionResolver) *Inspection {
	return &Inspection{resolver: resolver}
}

func (i *Inspection) ShowProcess(ctx context.Context, name, agent string) (contract.ProcessView, error) {
	return i.showProcess(ctx, name, agent)
}

// ShowWorkflow shows a workflow and each node's process as a run of it
// would see them.
func (i *Inspection) ShowWorkflow(ctx context.Context, name string) (contract.WorkflowView, error) {
	res, found, err := i.resolver.InspectWorkflow(ctx, name)
	var refusal *Refusal
	switch {
	case !found:
		return contract.WorkflowView{}, &contract.InputError{Message: fmt.Sprintf("no workflow %q", name)}
	case err != nil && !errors.As(err, &refusal):
		return contract.WorkflowView{}, err
	case err != nil && res.Workflow.Name == "":
		return contract.WorkflowView{}, &contract.InputError{Message: refusal.Reason}
	}
	workflow := res.Workflow
	view := contract.WorkflowView{Name: workflow.Name, Sources: origins(res.Sources)}
	if refusal != nil {
		view.Refusal = refusal.Reason
	}
	for _, param := range workflow.Params {
		view.Params = append(view.Params, contract.Param{Name: param.Name, Default: param.Default, Required: !param.HasDefault})
	}
	passed := map[string]bool{}
	for _, value := range workflow.Values {
		view.Inputs = append(view.Inputs, value.Name+" <- "+value.Source)
		passed[value.Name] = true
	}
	node := func(node InspectedNode, join bool) (contract.WorkflowNode, error) {
		process, err := i.showProcess(ctx, node.Process, "")
		var input *contract.InputError
		if errors.As(err, &input) {
			process, err = contract.ProcessView{Name: node.Process, Refusal: input.Message}, nil
		}
		shown := contract.WorkflowNode{Name: node.Name, Process: process}
		for _, param := range res.NodeProcesses[node.Process].Params {
			if passed[param] && !join {
				shown.Params = append(shown.Params, param)
			}
		}
		return shown, err
	}
	for _, fanOut := range workflow.FanOut {
		shown, err := node(fanOut, false)
		if err != nil {
			return contract.WorkflowView{}, err
		}
		view.FanOut = append(view.FanOut, shown)
	}
	if view.Join, err = node(workflow.Join, true); err != nil {
		return contract.WorkflowView{}, err
	}
	if collects := res.NodeProcesses[workflow.Join.Process].Collects; len(collects) == 1 {
		view.Collection = collects[0]
	}
	for _, shown := range append(append([]contract.WorkflowNode(nil), view.FanOut...), view.Join) {
		for _, warning := range shown.Process.Warnings {
			view.Warnings = append(view.Warnings, "node "+shown.Name+": "+warning)
		}
	}
	return view, nil
}

func (i *Inspection) showProcess(ctx context.Context, name, agent string) (contract.ProcessView, error) {
	res, err := i.resolver.InspectProcess(ctx, name, agent)
	var refusal *Refusal
	if err != nil && !errors.As(err, &refusal) {
		return contract.ProcessView{}, err
	}
	if err != nil && res.Process.Name == "" {
		return contract.ProcessView{}, &contract.InputError{Message: refusal.Reason}
	}
	view := contract.ProcessView{
		Name:        res.Process.Name,
		Agent:       res.Agent,
		Runtime:     res.Runtime,
		Policy:      res.Process.Policy,
		Output:      res.Process.OutputFormat,
		Timeout:     res.Effective.Timeout,
		MaxAttempts: res.Effective.MaxAttempts,
		MaxCostUSD:  res.Effective.MaxCostUSD,
		Allowed:     res.Effective.Allow,
		Denied:      res.Effective.Deny,
		Permissions: res.Effective.Permissions,
		Access:      res.Effective.Access,
		Scope:       res.Effective.Scope,
		Stale:       contract.Stale(res.Effective.Stale),
		Primitives:  res.Primitives,
		Withheld:    res.Withheld,
		VerifyName:  res.Process.VerifyName,
		Prompts:     res.Process.Prompts,
		Optional:    res.Process.Optional,
		Absent:      res.Absent,
		Skills:      res.Process.Skills,
		AgentSkills: res.AgentSkills,
	}
	if res.Process.OutputSchema != "" {
		view.Output += ":" + res.Process.OutputSchema
	}
	for _, param := range res.Process.Params {
		view.Params = append(view.Params, contract.Param{Name: param.Name, Default: param.Default, Required: !param.HasDefault})
	}
	for _, value := range res.Process.Values {
		input := value.Name + " <- " + value.Source
		if value.Optional {
			input += " (optional)"
		}
		view.Inputs = append(view.Inputs, input)
	}
	view.Sources = origins(res.Sources)
	if verify := res.Process.Verify; verify != nil {
		view.Verify = &contract.Verify{Command: verify.Command, Timeout: verify.Timeout, MaxAttempts: verify.MaxAttempts, Instruction: verify.Instruction}
		// A refused call runs no command.
		if refusal == nil {
			view.Warnings = append(view.Warnings, VerifyWarning)
		}
	}
	if refusal != nil {
		view.Refusal = refusal.Reason
	}
	return view, nil
}

// origins are where definitions come from, as a client sees it.
func origins(sources []InspectedSource) []contract.DefinitionOrigin {
	var shown []contract.DefinitionOrigin
	for _, source := range sources {
		layer := "global"
		if source.Project {
			layer = "project"
		}
		shown = append(shown, contract.DefinitionOrigin{Kind: source.Kind, Name: source.Name, Layer: layer, Path: source.Path, Overrides: source.Overrides})
	}
	return shown
}
