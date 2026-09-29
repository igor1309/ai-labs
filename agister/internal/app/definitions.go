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

// NewSettings returns the use case that manages definitions. scopes are
// every settings view a write takes part in (global settings alone, and
// with the project in view); each must stay valid.
func NewSettings(definitions SettingsDefinitions, writer DefinitionWriter, examples Examples, scopes []Scope) *Settings {
	return &Settings{definitions: definitions, writer: writer, examples: examples, scopes: scopes}
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
// scope: once written, every command there would stop on them, including
// the one that could repair them.
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
	agents := make([]contract.Agent, 0, len(names))
	for _, name := range names {
		doc, err := s.definitions.Read(ctx, definition.KindAgent, name)
		if err != nil {
			return nil, err
		}
		agent, err := definition.ParseAgent(doc)
		if err != nil {
			return nil, err
		}
		agents = append(agents, contract.Agent{Name: agent.Name, Runtime: agent.Runtime, Model: agent.Model, ModelFamily: agent.ModelFamily, Effort: agent.Effort, Session: agent.Session, Command: agent.Command})
	}
	return agents, nil
}

func (s *Settings) ListProcesses(ctx context.Context) ([]contract.ProcessSummary, error) {
	names, err := s.definitions.List(ctx, definition.KindProcess)
	if err != nil {
		return nil, err
	}
	processes := make([]contract.ProcessSummary, 0, len(names))
	for _, name := range names {
		doc, err := s.definitions.Read(ctx, definition.KindProcess, name)
		if err != nil {
			return nil, err
		}
		process, err := definition.ParseProcess(doc)
		if err != nil {
			processes = append(processes, contract.ProcessSummary{Name: name, Problem: "invalid (run `agister check`)"})
			continue
		}
		output := process.Output.Format
		if process.Output.Schema != "" {
			output += ":" + process.Output.Schema
		}
		processes = append(processes, contract.ProcessSummary{Name: process.Name, Agent: process.Agent, Policy: process.Policy, Output: output})
	}
	return processes, nil
}

// Inspection shows a process as a call would see it, without effects.
type Inspection struct {
	resolver InspectionResolver
}

// InspectionResolver resolves a process the way a call would.
type InspectionResolver interface {
	Resolve(ctx context.Context, processName, agentOverride string, caller overrides) (*resolution, error)
}

// NewInspection returns the use case that shows a process as a call would
// see it.
func NewInspection(resolver InspectionResolver) *Inspection {
	return &Inspection{resolver: resolver}
}

func (i *Inspection) ShowProcess(ctx context.Context, name, agent string) (contract.ProcessView, error) {
	res, err := i.resolver.Resolve(ctx, name, agent, overrides{})
	var refusal *Refusal
	if err != nil && !errors.As(err, &refusal) {
		return contract.ProcessView{}, err
	}
	if err != nil && res.process.Name == "" {
		return contract.ProcessView{}, &contract.InputError{Message: refusal.Reason}
	}
	view := contract.ProcessView{
		Name:        res.process.Name,
		Agent:       res.agent.Name,
		Runtime:     res.mapping.Name,
		Policy:      res.process.Policy,
		Output:      res.process.Output.Format,
		Timeout:     res.effective.Timeout,
		MaxAttempts: res.effective.MaxAttempts,
		MaxCostUSD:  res.effective.MaxCostUSD,
		Allowed:     res.effective.Allow,
		Denied:      res.effective.Deny,
		Permissions: res.effective.Permissions,
		Access:      res.effective.Access,
		Scope:       res.effective.Scope,
		Primitives:  res.plan.Primitives,
		Withheld:    res.plan.Withheld,
	}
	if res.process.Output.Schema != "" {
		view.Output += ":" + res.process.Output.Schema
	}
	for _, param := range res.process.Params {
		view.Params = append(view.Params, contract.Param{Name: param.Name, Default: param.Default, Required: !param.HasDefault})
	}
	for _, value := range res.process.Values {
		view.Inputs = append(view.Inputs, value.Name+" <- "+value.Source)
	}
	for _, rule := range res.effective.Constraints {
		view.Constraints = append(view.Constraints, fmt.Sprintf("%s differs from the writer of input.%s (unknown: %s)", rule.Subject, rule.CandidateInput, rule.OnUnknown))
	}
	for _, source := range res.sources {
		layer := "global"
		if source.Project {
			layer = "project"
		}
		view.Sources = append(view.Sources, contract.DefinitionOrigin{Kind: string(source.Kind), Name: source.Name, Layer: layer, Path: source.Path, Overrides: source.Overrides})
	}
	if refusal != nil {
		view.Refusal = refusal.Reason
	}
	return view, nil
}
