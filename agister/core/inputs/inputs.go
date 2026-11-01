// Package inputs resolves what a workflow or a process declares (ADR-010):
// its params over those given, a param not given taking its default; its
// inputs, each from its source, a port plugged in by name (rule 2), to a
// value and its identity, a text checked against the brief forms it names
// (rule 5); and a process's environment.
package inputs

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"maps"
)

// Declared is what a workflow or a process declares: its params, its
// inputs and, for a process, its environment, each in its order.
type Declared struct {
	Params      []Param
	Inputs      []Input
	Environment []Variable
}

// Param is a declared param, with its default, nil for none.
type Param struct {
	Name    string
	Default *string
}

// Input is a declared input: the source it comes from, the arguments the
// source takes, and the brief forms its text may take, none for a text
// of any structure.
type Input struct {
	Name      string
	Source    string
	Arguments map[string]Value
	Forms     []Form
}

// Variable is a variable of a process's environment.
type Variable struct {
	Name  string
	Value Value
}

// Value is a text, or, when Reads is not nil, what it reads.
type Value struct {
	Text  string
	Reads *Reference
}

// Reference names a param or an input.
type Reference struct {
	Of   Scope
	Name string
}

// Scope is what a reference reads.
type Scope int

const (
	Params Scope = iota + 1
	Inputs
)

// Source gives an input's value from its arguments, their references
// evaluated, and the params, and its identity where it has one of its
// own, "" where it has none.
type Source interface {
	Value(ctx context.Context, arguments, params map[string]string) (Fixed, error)
}

// Paths tells whether a path a brief names exists, as the brief writes it.
type Paths interface {
	Exists(ctx context.Context, path string) (bool, error)
}

// Resolved is what Resolve gives: the params, the inputs and the
// environment, each by its name.
type Resolved struct {
	Params      map[string]string
	Inputs      map[string]Fixed
	Environment map[string]string
}

// Fixed is an input's value and its identity: the one its source gives,
// else the hex SHA-256 digest of its text.
type Fixed struct {
	Value    string
	Identity string
}

// Refusal is why what is declared cannot be resolved: it refuses the call
// before it starts, which ends failed, class "refused".
type Refusal struct {
	Reason string
}

func (r *Refusal) Error() string { return r.Reason }

// Status is the status a refused call ends in.
func (*Refusal) Status() string { return "failed" }

// Class is the class a refused call ends in.
func (*Refusal) Class() string { return "refused" }

// Resolver resolves inputs from the sources plugged into it, and checks a
// brief's references through paths.
type Resolver struct {
	sources map[string]Source
	paths   Paths
}

// New gives a resolver over sources, by their names, and paths.
func New(sources map[string]Source, paths Paths) (*Resolver, error) {
	for name, source := range sources {
		if source == nil {
			return nil, fmt.Errorf("inputs: no source %q", name)
		}
	}
	if paths == nil {
		return nil, errors.New("inputs: no paths")
	}
	return &Resolver{sources: maps.Clone(sources), paths: paths}, nil
}

// Resolve resolves declared over the params given: the params, then each
// input in its order, its arguments read from the params and the inputs
// before it, its text checked against its forms, then the environment.
// What cannot be resolved is a *Refusal.
func (r *Resolver) Resolve(ctx context.Context, declared Declared, given map[string]string) (Resolved, error) {
	resolved := Resolved{
		Params:      maps.Clone(given),
		Inputs:      map[string]Fixed{},
		Environment: map[string]string{},
	}
	if resolved.Params == nil {
		resolved.Params = map[string]string{}
	}
	for _, param := range declared.Params {
		if _, ok := resolved.Params[param.Name]; !ok && param.Default != nil {
			resolved.Params[param.Name] = *param.Default
		}
	}
	for _, input := range declared.Inputs {
		fixed, err := r.input(ctx, input, resolved)
		if err != nil {
			return Resolved{}, &Refusal{Reason: fmt.Sprintf("input %q: %v", input.Name, err)}
		}
		if fixed.Identity == "" {
			digest := sha256.Sum256([]byte(fixed.Value))
			fixed.Identity = hex.EncodeToString(digest[:])
		}
		resolved.Inputs[input.Name] = fixed
	}
	for _, variable := range declared.Environment {
		value, err := evaluate(variable.Value, resolved)
		if err != nil {
			return Resolved{}, &Refusal{Reason: fmt.Sprintf("environment %q: %v", variable.Name, err)}
		}
		resolved.Environment[variable.Name] = value
	}
	return resolved, nil
}

func (r *Resolver) input(ctx context.Context, input Input, resolved Resolved) (Fixed, error) {
	source, ok := r.sources[input.Source]
	if !ok {
		return Fixed{}, fmt.Errorf("no source %q is plugged in", input.Source)
	}
	arguments := map[string]string{}
	for name, value := range input.Arguments {
		text, err := evaluate(value, resolved)
		if err != nil {
			return Fixed{}, fmt.Errorf("argument %q: %w", name, err)
		}
		arguments[name] = text
	}
	fixed, err := source.Value(ctx, arguments, maps.Clone(resolved.Params))
	if err != nil {
		return Fixed{}, err
	}
	if len(input.Forms) > 0 {
		if err := r.takesAForm(ctx, fixed.Value, input.Forms); err != nil {
			return Fixed{}, err
		}
	}
	return fixed, nil
}

// evaluate is value's text, or what it reads of resolved.
func evaluate(value Value, resolved Resolved) (string, error) {
	if value.Reads == nil {
		return value.Text, nil
	}
	name := value.Reads.Name
	switch value.Reads.Of {
	case Params:
		if text, ok := resolved.Params[name]; ok {
			return text, nil
		}
		return "", fmt.Errorf("no param %q is given", name)
	case Inputs:
		if fixed, ok := resolved.Inputs[name]; ok {
			return fixed.Value, nil
		}
		return "", fmt.Errorf("no input %q is resolved", name)
	}
	return "", fmt.Errorf("a reference to %q reads neither a param nor an input", name)
}

// ParamSource is the source "param": the param named by its argument
// "name".
type ParamSource struct{}

func (ParamSource) Value(_ context.Context, arguments, params map[string]string) (Fixed, error) {
	name, ok := arguments["name"]
	if !ok {
		return Fixed{}, errors.New(`the source "param" names no param`)
	}
	value, ok := params[name]
	if !ok {
		return Fixed{}, fmt.Errorf("no param %q is given", name)
	}
	return Fixed{Value: value}, nil
}
