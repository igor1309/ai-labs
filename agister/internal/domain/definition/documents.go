package definition

import (
	"regexp"
	"sort"
	"strings"

	"gopkg.in/yaml.v3"
)

// Hierarchical documents (process, policy, runtime mapping) are YAML.

const (
	ProcessSchema = "agister.process/v1alpha1"
	PolicySchema  = "agister.process-policy/v1alpha1"
	RuntimeSchema = "agister.runtime/v1alpha1"
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
	Source string            // input source kind, e.g. "git.diff", "file", "param"
	Args   map[string]string // source arguments; may reference ${param.<name>}
}

// Output is a process's output contract.
type Output struct {
	Format string // "json" or "text"
	Schema string // name of a schema definition (json only)
}

// Process is a named agent call.
type Process struct {
	Name        string
	Agent       string
	Policy      string
	Instruction string
	Params      []Param
	Values      []Value
	Checkout    string   // name of the input whose revision is checked out
	Require     []string // permissions the call cannot work without
	Output      Output
	Limits      Limits // narrowing overrides
	Source      Source
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
	if value, _ := scalar(values["schema"], "schema", p); value != schema {
		p.add("schema", "must be %q", schema)
	}
	checkName(required(values, "name", "", p), expected, p)
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
	values := fields(root, "", append([]string{"schema", "name", "status", "type", "uses", "policy", "input", "output"}, limitKeys...), p)
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
	for _, entry := range mapping(input["params"], "input.params", p) {
		field := "input.params." + entry.key
		param := Param{Name: entry.key}
		spec := fields(entry.value, field, []string{"default"}, p)
		if node, ok := spec["default"]; ok {
			param.Default, _ = scalar(node, field+".default", p)
			param.HasDefault = true
		}
		process.Params = append(process.Params, param)
	}
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
		for _, reference := range value.references() {
			if !hasParam(process.Params, reference) {
				p.add(field, "refers to ${param.%s}, which is not declared in input.params", reference)
			}
		}
		process.Values = append(process.Values, value)
	}

	limits, tools, workspace := parseLimits(values, []string{"allow", "require"}, []string{"access", "scope", "checkout"}, p)
	process.Limits = limits
	process.Require = stringList(tools["require"], "tools.require", p)
	if node, ok := workspace["checkout"]; ok {
		process.Checkout, _ = scalar(node, "workspace.checkout", p)
		if !hasValue(process.Values, process.Checkout) {
			p.add("workspace.checkout", "%q is not an input value", process.Checkout)
		}
	}

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

	for _, constraint := range limits.Constraints {
		if !hasValue(process.Values, constraint.CandidateInput) {
			p.add("constraints."+constraint.Subject, "refers to input.%s, which is not an input value", constraint.CandidateInput)
		}
	}
	return process, p.err("process " + subjectName(doc.Source))
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

var paramReference = regexp.MustCompile(`\$\{param\.([a-z_][a-z0-9_]*)\}`)

func (v Value) references() []string {
	var names []string
	for _, arg := range v.Args {
		for _, match := range paramReference.FindAllStringSubmatch(arg, -1) {
			names = append(names, match[1])
		}
	}
	return names
}

// Bind substitutes ${param.<name>} references in the value's arguments.
func (v Value) Bind(params map[string]string) map[string]string {
	bound := make(map[string]string, len(v.Args))
	for key, arg := range v.Args {
		bound[key] = paramReference.ReplaceAllStringFunc(arg, func(reference string) string {
			return params[paramReference.FindStringSubmatch(reference)[1]]
		})
	}
	return bound
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
