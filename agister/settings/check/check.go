// Package check is built on resolve (ADR-002, rule 8), which it is handed
// and does not import: it resolves every document a layer holds, alone,
// and reports every problem once, with what it refuses; and it lists and
// shows the processes, workflows and agents, each field with its source.
// It gives data and gates nothing; what is printed is the composition's.
// It spells no field of any kind: it shows the fields its port gives, in
// the order given.
package check

import (
	"cmp"
	"errors"
	"fmt"
	"slices"
)

// Kind is a kind of document.
type Kind string

const (
	KindWorkflow Kind = "workflow"
	KindProcess  Kind = "process"
	KindAgent    Kind = "agent"
	KindRuntime  Kind = "runtime"
	KindBrief    Kind = "brief"
	KindPrompt   Kind = "prompt"
	KindSchema   Kind = "schema"
	KindSkill    Kind = "skill"
)

// rank is where kind comes in the order check asks for names in.
func rank(kind Kind) int {
	return slices.Index([]Kind{KindWorkflow, KindProcess, KindAgent, KindRuntime, KindBrief, KindPrompt, KindSchema, KindSkill}, kind)
}

// Layer is a layer of the settings (ADR-002, rule 2).
type Layer string

const (
	LayerHome       Layer = "home"
	LayerRepository Layer = "repository"
	LayerProject    Layer = "project"
)

// Reference is a document, by kind and name.
type Reference struct {
	Kind Kind
	Name string
}

// Held is a document a layer holds, by kind and name, and the layers that
// hold it.
type Held struct {
	Kind   Kind
	Name   string
	Layers []Layer
}

// Names is what check asks of the layers: every document they hold.
type Names interface {
	Held() []Held
}

// Resolver is what check asks of resolve: a document, by kind and name, to
// what resolves, or to the faults that refuse it; and the problems of no
// document, which refuse every request.
type Resolver interface {
	Resolve(document Reference) (Resolved, []Fault)
	Problems() []Problem
}

// Fields is what inspect asks of the documents: a document's fields, from
// its tree as layered and extended, in the order to show them; none for
// one that does not decode.
type Fields interface {
	Fields(document Reference) []Field
}

// Source is where a value comes from: a file, its line there, 0 for none,
// and the layer of the file.
type Source struct {
	File  string
	Line  int
	Layer Layer
}

// Field is one field of a document: its place, its value as text, and its
// source.
type Field struct {
	Place  string
	Value  string
	Source Source
}

// Problem is a problem or a warning: the source and the place of what it
// is about, none for no document or the whole, and what is wrong.
type Problem struct {
	Source  Source
	Place   string
	Message string
}

// Resolved is what a document resolves to: every document it reached, the
// plan of each step, and its warnings.
type Resolved struct {
	Reached  []Reference
	Plans    []Plan
	Warnings []Problem
}

// Plan is a step's plan (ADR-003, rule 4): the step, by its workflow's name
// and its place there; its process, agent and runtime; the options it
// takes; and the permissions required, allowed, granted, granted beyond
// the allowed, and allowed but withheld.
type Plan struct {
	Workflow string
	Place    string
	Process  string
	Agent    string
	Runtime  string
	Options  []string
	Required []string
	Allowed  []string
	Granted  []string
	Extra    []string
	Withheld []string
}

// Fault is one fault that refuses a document: a document at fault, the
// last link of the chain that reached it, with its problems or the block
// that refuses it; or, with no chain, problems of no document.
type Fault struct {
	Chain    []Link
	Problems []Problem
	Block    *Block
}

// Link is a document of a chain, and where the document before it names
// it; none for the first.
type Link struct {
	Kind   Kind
	Name   string
	Source Source
	Place  string
}

// Block is a block of the repository (ADR-002, rule 7): its reason and
// where the blocks give it.
type Block struct {
	Reason string
	Source Source
}

// Checker checks, lists and shows the documents its names give.
type Checker struct {
	names    Names
	resolver Resolver
	fields   Fields
}

// New gives a checker asking names for the documents held, resolver to
// resolve each, and fields for a document's fields.
func New(names Names, resolver Resolver, fields Fields) (*Checker, error) {
	if names == nil {
		return nil, errors.New("check: no names")
	}
	if resolver == nil {
		return nil, errors.New("check: no resolver")
	}
	if fields == nil {
		return nil, errors.New("check: no fields")
	}
	return &Checker{names: names, resolver: resolver, fields: fields}, nil
}

// Report is what check gives: the problems of no document, each of which
// refuses every request; each document at fault, once, with what it
// refuses; each warning, once, with every name it came with; and every
// name, resolving or refused. Each is in the order first met.
type Report struct {
	Problems []Problem
	Findings []Finding
	Warnings []Warning
	Names    []Status
}

// Finding is a document at fault, with its problems or the block that
// refuses it, and every name it refuses.
type Finding struct {
	Document Reference
	Problems []Problem
	Block    *Block
	Refuses  []Reference
}

// Warning is a warning and every name that resolves with it.
type Warning struct {
	Problem Problem
	With    []Reference
}

// Status is a name and whether it resolves.
type Status struct {
	Document Reference
	Resolves bool
}

// Check asks for the problems of no document, then resolves every name a
// layer holds, alone, kind by kind and by name within a kind, so a
// document nothing uses is checked too. A fault with a chain is the
// document at its end, reported as first met, and met again adds each
// problem it did not have; one with none is problems of no document. A warning of a refused name is not reported: resolve gives
// none with a refusal.
func (c *Checker) Check() Report {
	var report Report
	none := map[Problem]bool{}
	ofNoDocument := func(problems []Problem) {
		for _, problem := range problems {
			if !none[problem] {
				none[problem] = true
				report.Problems = append(report.Problems, problem)
			}
		}
	}
	ofNoDocument(c.resolver.Problems())
	findings := map[Reference]int{}
	warnings := map[Problem]int{}
	for _, held := range sorted(c.names.Held()) {
		name := Reference{Kind: held.Kind, Name: held.Name}
		resolved, faults := c.resolver.Resolve(name)
		report.Names = append(report.Names, Status{Document: name, Resolves: len(faults) == 0})
		if len(faults) == 0 {
			for _, warning := range resolved.Warnings {
				i, met := warnings[warning]
				if !met {
					i = len(report.Warnings)
					warnings[warning] = i
					report.Warnings = append(report.Warnings, Warning{Problem: warning})
				}
				report.Warnings[i].With = append(report.Warnings[i].With, name)
			}
			continue
		}
		for _, fault := range faults {
			if len(fault.Chain) == 0 {
				ofNoDocument(fault.Problems)
				continue
			}
			last := fault.Chain[len(fault.Chain)-1]
			document := Reference{Kind: last.Kind, Name: last.Name}
			i, met := findings[document]
			if !met {
				i = len(report.Findings)
				findings[document] = i
				report.Findings = append(report.Findings, Finding{Document: document, Problems: slices.Clone(fault.Problems), Block: fault.Block})
			} else {
				known := make(map[Problem]bool, len(report.Findings[i].Problems))
				for _, problem := range report.Findings[i].Problems {
					known[problem] = true
				}
				for _, problem := range fault.Problems {
					if !known[problem] {
						report.Findings[i].Problems = append(report.Findings[i].Problems, problem)
						known[problem] = true
					}
				}
			}
			report.Findings[i].Refuses = append(report.Findings[i].Refuses, name)
		}
	}
	return report
}

// sorted is held kind by kind, in the order check asks for names in, and
// by name within a kind.
func sorted(held []Held) []Held {
	held = slices.Clone(held)
	slices.SortStableFunc(held, func(a, b Held) int {
		return cmp.Or(cmp.Compare(rank(a.Kind), rank(b.Kind)), cmp.Compare(a.Name, b.Name))
	})
	return held
}

// Listed is a name of a listing, the layers that hold it, and whether it
// resolves.
type Listed struct {
	Name     string
	Layers   []Layer
	Resolves bool
}

// List gives each name of kind a layer holds, by name, resolving each
// alone. Inspect lists the processes, the workflows or the agents.
func (c *Checker) List(kind Kind) ([]Listed, error) {
	if err := inspected(kind); err != nil {
		return nil, err
	}
	var listed []Listed
	for _, held := range sorted(c.names.Held()) {
		if held.Kind != kind {
			continue
		}
		_, faults := c.resolver.Resolve(Reference{Kind: kind, Name: held.Name})
		listed = append(listed, Listed{Name: held.Name, Layers: held.Layers, Resolves: len(faults) == 0})
	}
	return listed, nil
}

// Shown is a document shown: whether a layer holds it; its fields; and
// what it resolves to, or the faults that refuse it, each with its chain.
type Shown struct {
	Held     bool
	Fields   []Field
	Resolved Resolved
	Faults   []Fault
}

// Show shows the process, the workflow or the agent document. One no layer
// holds is shown as not held, and neither its fields nor resolve are
// asked for.
func (c *Checker) Show(document Reference) (Shown, error) {
	if err := inspected(document.Kind); err != nil {
		return Shown{}, err
	}
	if !slices.ContainsFunc(c.names.Held(), func(held Held) bool {
		return held.Kind == document.Kind && held.Name == document.Name
	}) {
		return Shown{}, nil
	}
	shown := Shown{Held: true, Fields: c.fields.Fields(document)}
	shown.Resolved, shown.Faults = c.resolver.Resolve(document)
	return shown, nil
}

// inspected is whether inspect lists and shows documents of kind.
func inspected(kind Kind) error {
	switch kind {
	case KindProcess, KindWorkflow, KindAgent:
		return nil
	}
	return fmt.Errorf("check: inspect shows processes, workflows and agents, not the kind %q", kind)
}
