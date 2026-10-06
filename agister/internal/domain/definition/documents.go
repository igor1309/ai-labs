package definition

import (
	"fmt"
	"regexp"
	"sort"
	"strings"
	"time"

	"gopkg.in/yaml.v3"
)

// Hierarchical documents (process, policy, verification, runtime mapping)
// are YAML.

const (
	ProcessSchema   = "agister.process/v1alpha1"
	PolicySchema    = "agister.process-policy/v1alpha1"
	RuntimeSchema   = "agister.runtime/v1alpha1"
	VerifySchema    = "agister.verify/v1alpha1"
	WorkspaceSchema = "agister.workspace/v1alpha1"
)

// Policy is a reusable set of execution defaults.
type Policy struct {
	Name   string
	Limits Limits
	Source Source
}

// Param is a value supplied by the caller of a process.
type Param struct {
	Name       string
	Default    string
	HasDefault bool
}

// Value is one input the agent receives, and where it comes from.
type Value struct {
	Name   string
	Source string // input source kind, e.g. "git.diff", "file", "param"
	// Args are the source arguments. They may reference ${param.<name>} and
	// ${value.<name>}, the resolved text of an input value declared before
	// this one.
	Args map[string]string
}

// Output is a process's output contract.
type Output struct {
	Format string // "json" or "text"
	Schema string // name of a schema definition (json only)
}

// Verify is a process's verification command (ADR-002): run after a valid
// turn, on a clean copy of the base with the turn's patch applied
// (ADR-005), with the operator's authority, or, where it says so, in the
// worktree of an in-place call (ADR-022 rule 6).
type Verify struct {
	Command     string        // one Bash command
	Timeout     time.Duration // per run
	MaxAttempts int           // runs, the first included
	Instruction string        // what the agent is told when a run fails
	// Where is WhereWorkspace, or empty: a clean copy.
	Where string
}

// WhereWorkspace is the only value of a verification's where: an in-place
// call runs the command in the caller's worktree (ADR-022 rule 6).
const WhereWorkspace = "workspace"

// Repairs reports whether a failed run may be followed by a repair turn,
// which resumes the call's session: an agent and runtime that cannot
// continue sessions cannot run it.
func (v *Verify) Repairs() bool { return v != nil && v.MaxAttempts > 1 }

// Verification is a verification command as a document of its own, which
// a process names (ADR-010).
type Verification struct {
	Name   string
	Verify Verify
	Source Source
}

// Setup is the command that prepares a call's checkout before its first
// turn (ADR-012): run once, in the checkout, with the operator's authority.
type Setup struct {
	Command string        // one Bash command
	Timeout time.Duration // of its one run
}

// Workspace is a repository's workspace settings: the setup every process
// that checks out a revision and declares none of its own runs, and, for
// every such process, whether its calls work in the caller's worktree and
// the precheck that gates them there (ADR-022).
type Workspace struct {
	Setup *Setup // unset: no default
	// Mode is ModeInPlace or ModeTemporary; empty: not set, which is
	// ModeTemporary.
	Mode string
	// Precheck gates an in-place call before its first turn; unset: none.
	// It has a setup's fields, both required.
	Precheck *Setup
	Source   Source
}

// The workspace modes of a call whose process checks out a revision
// (ADR-022 rule 1): a checkout of its own, or the caller's worktree.
const (
	ModeTemporary = "temporary"
	ModeInPlace   = "in-place"
)

// InPlace says the calls of a process with a checkout work in the caller's
// worktree under these settings, unless the call says otherwise.
func (w *Workspace) InPlace() bool { return w != nil && w.Mode == ModeInPlace }

// Process is a named agent call.
type Process struct {
	Name        string
	Agent       string
	Policy      string
	Instruction string
	Params      []Param
	Values      []Value
	Checkout    string   // name of the input whose revision is checked out
	Setup       *Setup   // its own setup; unset: the workspace's, if any
	Require     []string // permissions the call cannot work without
	Skills      []string // the skill documents its calls are given (ADR-021)
	Output      Output
	// Verify is the inline block, or the named verification once it is
	// resolved; unset: no verification, or a named one not resolved.
	Verify     *Verify
	VerifyName string // name of a verification definition, in place of the inline block
	Limits     Limits // narrowing overrides
	Source     Source
}

// Primitive is one restriction primitive a runtime offers.
type Primitive struct {
	Name     string   `json:"name"`
	Grants   []string `json:"grants"`
	Verified []string `json:"verified,omitempty"` // version prefixes its grants were checked against
}

// Mapping declares, for one runtime adapter, what each primitive grants.
type Mapping struct {
	Name       string
	Adapter    string
	Contract   string
	Efforts    []string
	Select     string // "any" subset, or exactly "one"
	Primitives []Primitive
	Source     Source
}

func header(values map[string]*yaml.Node, schema, expected string, p *problems) {
	value, _ := scalar(values["schema"], "schema", p)
	checkSchema(value, schema, p)
	checkName(required(values, "name", "", p), expected, p)
}

// schemaShape is what every schema Agister declares looks like:
// agister.<kind>/<version>.
var schemaShape = regexp.MustCompile(`^agister\.[a-z][a-z0-9-]*/v[0-9][a-z0-9]*$`)

// checkSchema reports a document's schema other than the one this code
// reads. One of Agister's shape names a schema this code does not know,
// as a document written for a newer Agister would; any other is a mistake.
func checkSchema(value, schema string, p *problems) {
	switch {
	case value == schema:
	case schemaShape.MatchString(value):
		p.unknown("schema", "must be %q", schema)
	default:
		p.add("schema", "must be %q", schema)
	}
}

// ParsePolicy parses a process policy.
func ParsePolicy(doc Document) (Policy, error) {
	p := &problems{}
	root := parseYAML(doc.Bytes, p)
	if root == nil {
		return Policy{Name: doc.Source.Name, Source: doc.Source}, p.err("policy " + subjectName(doc.Source))
	}
	values := fields(root, "", append([]string{"schema", "name", "status"}, limitKeys...), p)
	header(values, PolicySchema, doc.Source.Name, p)
	limits, _, _ := parseLimits(values, []string{"allow"}, []string{"access", "scope"}, p)
	return Policy{Name: doc.Source.Name, Limits: limits, Source: doc.Source}, p.err("policy " + subjectName(doc.Source))
}

// ParseProcess parses a process definition.
func ParseProcess(doc Document) (Process, error) {
	p := &problems{}
	root := parseYAML(doc.Bytes, p)
	if root == nil {
		return Process{Name: doc.Source.Name, Source: doc.Source}, p.err("process " + subjectName(doc.Source))
	}
	// Read by key, a second verify would replace the first, so a process
	// could declare both forms (ADR-010 rule 2) and run the one it names
	// last.
	if declared(root, "verify") > 1 {
		p.add("verify", "is declared more than once: the inline fields or one reference, not both")
	}
	// So would a second skills: a process could name a skill and run
	// without it (ADR-021 rule 2).
	if declared(root, "skills") > 1 {
		p.add("skills", "is declared more than once: one list names the process's skills")
	}
	values := fields(root, "", append([]string{"schema", "name", "status", "type", "uses", "policy", "input", "output", "verify", "skills"}, limitKeys...), p)
	header(values, ProcessSchema, doc.Source.Name, p)
	if value, _ := scalar(values["type"], "type", p); value != "process" {
		p.add("type", `must be "process"`)
	}

	process := Process{Name: doc.Source.Name, Source: doc.Source}
	uses := required(values, "uses", "", p)
	if agent, ok := strings.CutPrefix(uses, "agent:"); ok && agent != "" {
		process.Agent = agent
	} else if uses != "" {
		p.add("uses", `must be "agent:<name>"`)
	}
	if node, ok := values["policy"]; ok {
		reference, _ := scalar(node, "policy", p)
		if policy, ok := strings.CutPrefix(reference, "process-policy:"); ok && policy != "" {
			process.Policy = policy
		} else {
			p.add("policy", `must be "process-policy:<name>"`)
		}
	}

	input := fields(values["input"], "input", []string{"instruction", "params", "values"}, p)
	process.Instruction = required(input, "instruction", "input", p)
	process.Params, process.Values = parseInputs(input, p)

	limits, tools, workspace := parseLimits(values, []string{"allow", "require"}, []string{"access", "scope", "checkout", "setup"}, p)
	process.Limits = limits
	process.Require = stringList(tools["require"], "tools.require", p)
	if node, ok := workspace["checkout"]; ok {
		process.Checkout, _ = scalar(node, "workspace.checkout", p)
		if !hasValue(process.Values, process.Checkout) {
			p.add("workspace.checkout", "%q is not an input value", process.Checkout)
		}
	}
	if node, ok := workspace["setup"]; ok {
		process.Setup = parseSetup(node, "workspace.setup", p)
		// Without a checkout the agent works in the repository itself,
		// which is prepared already.
		if process.Checkout == "" {
			p.add("workspace.setup", "requires workspace.checkout: setup prepares a checkout the call owns")
		}
	}

	// Each a literal document name, which nothing is substituted in.
	process.Skills = skillNames(stringList(values["skills"], "skills", p), "skills", p)

	output := fields(values["output"], "output", []string{"format", "schema", "require_valid"}, p)
	process.Output.Format = required(output, "format", "output", p)
	switch process.Output.Format {
	case "json":
		process.Output.Schema = required(output, "schema", "output", p)
		if valid, ok := boolean(output["require_valid"], "output.require_valid", p); !ok || !valid {
			p.add("output.require_valid", "must be true (accepting invalid output is not supported)")
		}
	case "text":
		if _, ok := output["schema"]; ok {
			p.add("output.schema", "applies to json output only")
		}
	case "":
	default:
		p.add("output.format", `must be "json" or "text"`)
	}

	if node, ok := values["verify"]; ok {
		if node.Kind == yaml.ScalarNode && node.Tag != "!!null" {
			if name, ok := strings.CutPrefix(node.Value, "verify:"); ok && ValidName(name) {
				process.VerifyName = name
			} else {
				p.add("verify", `must be "verify:<name>" or the inline fields`)
			}
		} else {
			process.Verify = parseVerify(fields(node, "verify", verifyFields(), p), "verify", p)
		}
		// Verifying a tree the call does not own would check content other
		// calls can change and the call does not capture.
		if process.Checkout == "" {
			p.add("verify", "requires workspace.checkout: verification runs only in a checkout the call owns")
		}
	}

	return process, p.err("process " + subjectName(doc.Source))
}

// ParseVerify parses a verification: the fields of a process's inline
// verify block, as a document a process names.
func ParseVerify(doc Document) (Verification, error) {
	p := &problems{}
	verification := Verification{Name: doc.Source.Name, Source: doc.Source}
	root := parseYAML(doc.Bytes, p)
	if root == nil {
		return verification, p.err("verification " + subjectName(doc.Source))
	}
	values := fields(root, "", append([]string{"schema", "name"}, verifyFields()...), p)
	header(values, VerifySchema, doc.Source.Name, p)
	verification.Verify = *parseVerify(values, "", p)
	return verification, p.err("verification " + subjectName(doc.Source))
}

// verifyKeys is a verification's required fields. Each call returns a new
// slice.
func verifyKeys() []string {
	return []string{"command", "timeout", "max_attempts", "instruction"}
}

// verifyFields is all a verification may hold: its required fields and
// where, the only optional one. Each call returns a new slice.
func verifyFields() []string {
	return append(verifyKeys(), "where")
}

// parseVerify reads the fields of a verify block, or of a verification
// document, under field. Every one but where is required: there is no
// default command, timeout, attempt count or instruction.
func parseVerify(values map[string]*yaml.Node, field string, p *problems) *Verify {
	for _, key := range verifyKeys() {
		if _, ok := values[key]; !ok {
			p.add(join(field, key), "is required")
		}
	}
	verify := &Verify{
		Command:     nonEmpty(values["command"], join(field, "command"), p),
		Instruction: nonEmpty(values["instruction"], join(field, "instruction"), p),
	}
	if text, ok := scalar(values["timeout"], join(field, "timeout"), p); ok {
		verify.Timeout, _ = duration(text, join(field, "timeout"), p)
	}
	if attempts, ok := integer(values["max_attempts"], join(field, "max_attempts"), p); ok {
		if attempts < 1 {
			p.add(join(field, "max_attempts"), "must be at least 1")
		}
		verify.MaxAttempts = attempts
	}
	if node, ok := values["where"]; ok {
		if where, ok := scalar(node, join(field, "where"), p); ok {
			verify.Where = where
			if where != WhereWorkspace {
				p.add(join(field, "where"), "must be %q", WhereWorkspace)
			}
		}
	}
	return verify
}

// parseSetup reads a setup block. Both fields are required: there is no
// default command or timeout.
func parseSetup(node *yaml.Node, field string, p *problems) *Setup {
	keys := []string{"command", "timeout"}
	values := fields(node, field, keys, p)
	for _, key := range keys {
		if _, ok := values[key]; !ok {
			p.add(join(field, key), "is required")
		}
	}
	setup := &Setup{Command: nonEmpty(values["command"], join(field, "command"), p)}
	if text, ok := scalar(values["timeout"], join(field, "timeout"), p); ok {
		setup.Timeout, _ = duration(text, join(field, "timeout"), p)
	}
	return setup
}

// ParseWorkspace parses a repository's workspace settings.
func ParseWorkspace(doc Document) (Workspace, error) {
	p := &problems{}
	workspace := Workspace{Source: doc.Source}
	root := parseYAML(doc.Bytes, p)
	if root == nil {
		return workspace, p.err("workspace settings")
	}
	values := fields(root, "", []string{"schema", "setup", "mode", "precheck"}, p)
	value, _ := scalar(values["schema"], "schema", p)
	checkSchema(value, WorkspaceSchema, p)
	if node, ok := values["setup"]; ok {
		workspace.Setup = parseSetup(node, "setup", p)
	}
	if node, ok := values["mode"]; ok {
		workspace.Mode, _ = scalar(node, "mode", p)
		if workspace.Mode != ModeInPlace && workspace.Mode != ModeTemporary {
			p.add("mode", "must be %q or %q", ModeInPlace, ModeTemporary)
		}
	}
	if node, ok := values["precheck"]; ok {
		workspace.Precheck = parseSetup(node, "precheck", p)
	}
	return workspace, p.err("workspace settings")
}

// EffectiveSetup is the setup a call of the process runs: its own, or the
// workspace's default when it checks out a revision and declares none.
// fromWorkspace says the workspace's applies; nil when none does.
func (p Process) EffectiveSetup(workspace *Workspace) (setup *Setup, fromWorkspace bool) {
	switch {
	case p.Checkout == "":
		return nil, false
	case p.Setup != nil:
		return p.Setup, false
	case workspace != nil && workspace.Setup != nil:
		return workspace.Setup, true
	}
	return nil, false
}

// parseInputs reads input.params, the values a caller supplies, and
// input.values, each input and its source, in declaration order.
func parseInputs(input map[string]*yaml.Node, p *problems) ([]Param, []Value) {
	var params []Param
	for _, entry := range mapping(input["params"], "input.params", p) {
		field := "input.params." + entry.key
		param := Param{Name: entry.key}
		spec := fields(entry.value, field, []string{"default"}, p)
		if node, ok := spec["default"]; ok {
			param.Default, _ = scalar(node, field+".default", p)
			param.HasDefault = true
		}
		params = append(params, param)
	}
	var values []Value
	for _, entry := range mapping(input["values"], "input.values", p) {
		field := "input.values." + entry.key
		value := Value{Name: entry.key, Args: map[string]string{}}
		for _, arg := range mapping(entry.value, field, p) {
			text, _ := scalar(arg.value, join(field, arg.key), p)
			if arg.key == "source" {
				value.Source = text
			} else {
				value.Args[arg.key] = text
			}
		}
		if value.Source == "" {
			p.add(field+".source", "is required")
		}
		if value.Source == PromptSource {
			// A literal document name, which nothing is substituted in.
			promptArgs(value, field, p)
			values = append(values, value)
			continue
		}
		for _, reference := range value.references("param") {
			if !hasParam(params, reference) {
				p.add(field, "refers to ${param.%s}, which is not declared in input.params", reference)
			}
		}
		// Values resolve in order, so a value refers only to earlier ones.
		for _, reference := range value.references("value") {
			switch {
			case !hasValue(values, reference):
				p.add(field, "refers to ${value.%s}, which is not an input value declared before it", reference)
			case optionalValue(values, reference):
				// An input never depends on one that may be missing (ADR-019 rule 5).
				p.add(field, "refers to ${value.%s}, an optional prompt, which may be missing", reference)
			}
		}
		values = append(values, value)
	}
	return params, values
}

// ParseMapping parses a runtime permission mapping.
func ParseMapping(doc Document) (Mapping, error) {
	p := &problems{}
	root := parseYAML(doc.Bytes, p)
	if root == nil {
		return Mapping{Name: doc.Source.Name, Source: doc.Source}, p.err("runtime mapping " + subjectName(doc.Source))
	}
	values := fields(root, "", []string{"schema", "name", "status", "adapter", "contract", "verified_versions", "efforts", "primitives"}, p)
	// One version list for the whole mapping vouched for primitives nobody
	// had checked; verification is now recorded per primitive.
	if _, ok := values["verified_versions"]; ok {
		p.add("verified_versions", "no longer supported: list the versions each primitive was verified against in primitives.items.<name>.verified")
	}
	header(values, RuntimeSchema, doc.Source.Name, p)
	m := Mapping{
		Name:     doc.Source.Name,
		Adapter:  required(values, "adapter", "", p),
		Contract: required(values, "contract", "", p),
		Efforts:  stringList(values["efforts"], "efforts", p),
		Source:   doc.Source,
	}
	primitives := fields(values["primitives"], "primitives", []string{"select", "items"}, p)
	m.Select = required(primitives, "select", "primitives", p)
	if m.Select != "any" && m.Select != "one" && m.Select != "" {
		p.add("primitives.select", `must be "any" or "one"`)
	}
	for _, entry := range mapping(primitives["items"], "primitives.items", p) {
		field := "primitives.items." + entry.key
		item := fields(entry.value, field, []string{"grants", "verified"}, p)
		grants := stringList(item["grants"], field+".grants", p)
		// A primitive granting nothing would fit every plan.
		if len(grants) == 0 {
			p.add(field+".grants", "must grant at least one permission")
		}
		m.Primitives = append(m.Primitives, Primitive{Name: entry.key, Grants: grants, Verified: stringList(item["verified"], field+".verified", p)})
	}
	if len(m.Primitives) == 0 {
		p.add("primitives.items", "must declare at least one primitive")
	}
	return m, p.err("runtime mapping " + subjectName(doc.Source))
}

// UnknownPermissions lists names used by the mapping that are not in vocabulary.
func (m Mapping) UnknownPermissions(vocabulary []string) []string {
	var unknown []string
	for _, primitive := range m.Primitives {
		for _, grant := range primitive.Grants {
			if !contains(vocabulary, grant) && !contains(unknown, grant) {
				unknown = append(unknown, grant)
			}
		}
	}
	return unknown
}

// VerifiedFor reports whether version matches one of the primitive's
// verified prefixes. A prefix matches whole components: "2.1" and "2.1."
// match 2.1.3, not 2.10.0.
func (p Primitive) VerifiedFor(version string) bool {
	for _, prefix := range p.Verified {
		prefix = strings.TrimSuffix(prefix, ".")
		if prefix != "" && (version == prefix || strings.HasPrefix(version, prefix+".")) {
			return true
		}
	}
	return false
}

// ForVersion keeps only the primitives verified for version, so a plan
// made from it never grants an unchecked primitive, and names the rest.
func (m Mapping) ForVersion(version string) (Mapping, []string) {
	return m.keep(func(p Primitive) bool { return p.VerifiedFor(version) })
}

// Verified reports whether any primitive is verified for version.
func (m Mapping) Verified(version string) bool {
	verified, _ := m.ForVersion(version)
	return len(verified.Primitives) > 0
}

// ForAnyVersion keeps the primitives verified for some version: what a
// plan can use before the runtime's version is known.
func (m Mapping) ForAnyVersion() (Mapping, []string) {
	return m.keep(func(p Primitive) bool { return len(p.Verified) > 0 })
}

// Versions lists the distinct version prefixes some primitive is verified
// for, sorted and without a trailing dot: each is a version a plan can be
// made for.
func (m Mapping) Versions() []string {
	seen := map[string]bool{}
	var versions []string
	for _, primitive := range m.Primitives {
		for _, prefix := range primitive.Verified {
			if prefix = strings.TrimSuffix(prefix, "."); prefix != "" && !seen[prefix] {
				seen[prefix] = true
				versions = append(versions, prefix)
			}
		}
	}
	sort.Strings(versions)
	return versions
}

func (m Mapping) keep(verified func(Primitive) bool) (Mapping, []string) {
	kept := m
	kept.Primitives = nil
	var unverified []string
	for _, primitive := range m.Primitives {
		if verified(primitive) {
			kept.Primitives = append(kept.Primitives, primitive)
		} else {
			unverified = append(unverified, primitive.Name)
		}
	}
	return kept, unverified
}

var reference = regexp.MustCompile(`\$\{(param|value)\.([a-z_][a-z0-9_]*)\}`)

// references returns the names the value's arguments refer to as
// ${<kind>.<name>}.
func (v Value) references(kind string) []string {
	var names []string
	for _, arg := range v.Args {
		for _, match := range reference.FindAllStringSubmatch(arg, -1) {
			if match[1] == kind {
				names = append(names, match[2])
			}
		}
	}
	return names
}

// Bind substitutes the references in the value's arguments, in one pass:
// ${param.<name>} from params, ${value.<name>} from values, the text of the
// input values resolved before this one. A value reference values lacks is
// an error: that input has no text value.
func (v Value) Bind(params, values map[string]string) (map[string]string, error) {
	bound := make(map[string]string, len(v.Args))
	var missing []string
	for key, arg := range v.Args {
		bound[key] = reference.ReplaceAllStringFunc(arg, func(text string) string {
			match := reference.FindStringSubmatch(text)
			if match[1] == "param" {
				return params[match[2]]
			}
			value, ok := values[match[2]]
			if !ok {
				missing = append(missing, match[2])
			}
			return value
		})
	}
	if len(missing) > 0 {
		sort.Strings(missing)
		return nil, fmt.Errorf("refers to ${value.%s}, which has no text value", missing[0])
	}
	return bound, nil
}

func hasParam(params []Param, name string) bool {
	for _, param := range params {
		if param.Name == name {
			return true
		}
	}
	return false
}

func hasValue(values []Value, name string) bool {
	for _, value := range values {
		if value.Name == name {
			return true
		}
	}
	return false
}

// optionalValue reports whether any of values named name is an optional
// prompt. Names may repeat, and at run time a later input of the name
// supplies its text, so the first of them alone does not say.
func optionalValue(values []Value, name string) bool {
	for _, value := range values {
		if value.Name == name && value.Optional() {
			return true
		}
	}
	return false
}
