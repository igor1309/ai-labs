package main

import (
	"errors"
	"fmt"
	"io"

	"github.com/igor1309/ai-labs/agister/cli"
	"github.com/igor1309/ai-labs/agister/core/call"
	"github.com/igor1309/ai-labs/agister/settings/check"
	"github.com/igor1309/ai-labs/agister/settings/layout"
	"github.com/igor1309/ai-labs/agister/settings/resolve"
)

// links is what the command line asks of files: a launch directory's path
// with its links resolved.
type links interface {
	Resolved(folder string) (string, error)
}

// newCommandLine is the command line over the settings of home's folder
// home and each command's launch directory, its links resolved by links,
// read through fs and roots, each step planned with the facts of wrappers;
// runner, which answers its run; and runs, which answers its runs.
// Layout walks up the launch directory to the root git gives of it, which
// git spells as it is asked: a launch through a link would walk up where
// the link is, and miss the root of where it leads.
func newCommandLine(home string, links links, fs layout.FileSystem, roots layout.WorktreeRoot, wrappers resolve.Wrappers, runner cli.Runner, runs cli.Runs, states cli.RunStates, stdout, stderr io.Writer, runTakes map[string]call.Inputs) (*cli.CLI, error) {
	if links == nil {
		return nil, errors.New("command line: no links")
	}
	port, err := newSettings(home, func(home, launch string) (inspector, error) {
		resolved, err := links.Resolved(launch)
		if err != nil {
			return nil, fmt.Errorf("the launch directory %s: %w", launch, err)
		}
		checker, err := newChecker(home, resolved, fs, roots, wrappers, runTakes)
		if err != nil {
			return nil, err
		}
		return checker, nil
	})
	if err != nil {
		return nil, err
	}
	return cli.New(port, runner, runs, states, stdout, stderr)
}

// inspector is what cli's port asks of check.
type inspector interface {
	Check() check.Report
	List(kind check.Kind) ([]check.Listed, error)
	Show(document check.Reference) (check.Shown, error)
}

// checkers gives the checker of the settings of home's folder and the
// launch directory.
type checkers func(home, launch string) (inspector, error)

// settings answers cli's port from check, over a checker of its own for
// each request: a command reads the settings once, at home's folder and
// its launch directory.
type settings struct {
	home     string
	checkers checkers
}

func newSettings(home string, checkers checkers) (*settings, error) {
	if home == "" {
		return nil, errors.New("settings: no home")
	}
	if checkers == nil {
		return nil, errors.New("settings: no checkers")
	}
	return &settings{home: home, checkers: checkers}, nil
}

func (s *settings) Check(launch string) (cli.Report, error) {
	checker, err := s.checkers(s.home, launch)
	if err != nil {
		return cli.Report{}, err
	}
	report := checker.Check()
	mapped := cli.Report{Problems: cliProblems(report.Problems)}
	for _, finding := range report.Findings {
		mapped.Findings = append(mapped.Findings, cli.Finding{Document: cliDocument(finding.Document),
			Problems: cliProblems(finding.Problems), Block: cliBlock(finding.Block), Refuses: cliDocuments(finding.Refuses)})
	}
	for _, warning := range report.Warnings {
		mapped.Warnings = append(mapped.Warnings, cli.Warning{Problem: cliProblem(warning.Problem), With: cliDocuments(warning.With)})
	}
	for _, status := range report.Names {
		mapped.Names = append(mapped.Names, cli.Status{Document: cliDocument(status.Document), Resolves: status.Resolves})
	}
	return mapped, nil
}

func (s *settings) List(launch string, kind cli.Kind) ([]cli.Listed, error) {
	checker, err := s.checkers(s.home, launch)
	if err != nil {
		return nil, err
	}
	listed, err := checker.List(cliKind(kind).check)
	if err != nil {
		return nil, err
	}
	var mapped []cli.Listed
	for _, l := range listed {
		var layers []cli.Layer
		for _, layer := range l.Layers {
			layers = append(layers, cliLayer(layer))
		}
		mapped = append(mapped, cli.Listed{Name: l.Name, Layers: layers, Resolves: l.Resolves})
	}
	return mapped, nil
}

func (s *settings) Show(launch string, document cli.Document) (cli.Shown, error) {
	checker, err := s.checkers(s.home, launch)
	if err != nil {
		return cli.Shown{}, err
	}
	shown, err := checker.Show(check.Reference{Kind: cliKind(document.Kind).check, Name: document.Name})
	if err != nil {
		return cli.Shown{}, err
	}
	mapped := cli.Shown{Held: shown.Held, Reached: cliDocuments(shown.Resolved.Reached), Warnings: cliProblems(shown.Resolved.Warnings)}
	for _, field := range shown.Fields {
		mapped.Fields = append(mapped.Fields, cli.Field{Place: field.Place, Value: field.Value, Source: cliSource(field.Source)})
	}
	for _, plan := range shown.Resolved.Plans {
		mapped.Plans = append(mapped.Plans, cli.Plan{
			Workflow: plan.Workflow, Place: plan.Place,
			Process: plan.Process, Agent: plan.Agent, Runtime: plan.Runtime,
			Options: plan.Options, Required: plan.Required, Allowed: plan.Allowed,
			Granted: plan.Granted, Extra: plan.Extra, Withheld: plan.Withheld,
		})
	}
	for _, fault := range shown.Faults {
		f := cli.Fault{Problems: cliProblems(fault.Problems), Block: cliBlock(fault.Block)}
		for _, link := range fault.Chain {
			f.Chain = append(f.Chain, cli.Link{Document: cliDocument(check.Reference{Kind: link.Kind, Name: link.Name}),
				Source: cliSource(link.Source), Place: link.Place})
		}
		mapped.Faults = append(mapped.Faults, f)
	}
	return mapped, nil
}

func cliDocument(document check.Reference) cli.Document {
	return cli.Document{Kind: checkKind(document.Kind).cli, Name: document.Name}
}

func cliDocuments(documents []check.Reference) []cli.Document {
	var mapped []cli.Document
	for _, document := range documents {
		mapped = append(mapped, cliDocument(document))
	}
	return mapped
}

func cliLayer(layer check.Layer) cli.Layer {
	switch layer {
	case check.LayerHome:
		return cli.LayerHome
	case check.LayerRepository:
		return cli.LayerRepository
	case check.LayerProject:
		return cli.LayerProject
	}
	return ""
}

func cliSource(source check.Source) cli.Source {
	return cli.Source{File: source.File, Line: source.Line, Layer: cliLayer(source.Layer)}
}

func cliProblem(problem check.Problem) cli.Problem {
	return cli.Problem{Source: cliSource(problem.Source), Place: problem.Place, Message: problem.Message}
}

func cliProblems(problems []check.Problem) []cli.Problem {
	var mapped []cli.Problem
	for _, problem := range problems {
		mapped = append(mapped, cliProblem(problem))
	}
	return mapped
}

func cliBlock(block *check.Block) *cli.Block {
	if block == nil {
		return nil
	}
	return &cli.Block{Reason: block.Reason, Source: cliSource(block.Source)}
}
