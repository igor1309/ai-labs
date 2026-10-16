package main

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"slices"
	"strconv"
	"strings"

	"github.com/igor1309/ai-labs/agister/cli"
	"github.com/igor1309/ai-labs/agister/files"
	"github.com/igor1309/ai-labs/agister/runtime/bash"
	"github.com/igor1309/ai-labs/agister/runtime/claudecode"
	"github.com/igor1309/ai-labs/agister/runtime/codex"
	"github.com/igor1309/ai-labs/agister/runtime/pi"
	"github.com/igor1309/ai-labs/agister/settings/check"
	"github.com/igor1309/ai-labs/agister/settings/documents"
	"github.com/igor1309/ai-labs/agister/settings/layout"
	"github.com/igor1309/ai-labs/agister/settings/resolve"
	"github.com/igor1309/ai-labs/gokit/tree"
)

// kinds is one kind of document in each part's words; "" where a part has
// no such kind.
type kinds struct {
	check     check.Kind
	resolve   resolve.Kind
	documents documents.Kind
	layout    layout.Kind
	cli       cli.Kind
}

// everyKind is each kind of document, in each part's words. Documents types
// a skill's block and exports no kind for skills, which it holds none of
// (backlog/skills.md): its block names the kind "skill".
func everyKind() []kinds {
	return []kinds{
		{check.KindWorkflow, resolve.KindWorkflow, documents.Workflow, layout.Workflow, cli.KindWorkflow},
		{check.KindProcess, resolve.KindProcess, documents.Process, layout.Process, cli.KindProcess},
		{check.KindAgent, resolve.KindAgent, documents.Agent, layout.Agent, cli.KindAgent},
		{check.KindRuntime, resolve.KindRuntime, documents.Runtime, layout.Runtime, cli.KindRuntime},
		{check.KindBrief, resolve.KindBrief, documents.Brief, layout.Brief, cli.KindBrief},
		{check.KindPrompt, resolve.KindPrompt, documents.Prompt, layout.Prompt, cli.KindPrompt},
		{check.KindSchema, resolve.KindSchema, documents.Schema, layout.Schema, cli.KindSchema},
		{check.KindSkill, resolve.KindSkill, documents.Kind("skill"), "", cli.KindSkill},
	}
}

// findKind is the kind of everyKind that of picks, the zero kinds for none.
func findKind(of func(kinds) bool) kinds {
	all := everyKind()
	if i := slices.IndexFunc(all, of); i >= 0 {
		return all[i]
	}
	return kinds{}
}

func kindOf(kind resolve.Kind) kinds {
	return findKind(func(k kinds) bool { return k.resolve == kind })
}

func documentsKind(kind documents.Kind) kinds {
	return findKind(func(k kinds) bool { return k.documents == kind })
}

func checkKind(kind check.Kind) kinds {
	return findKind(func(k kinds) bool { return k.check == kind })
}

func layoutKind(kind layout.Kind) kinds {
	return findKind(func(k kinds) bool { return k.layout == kind })
}

func cliKind(kind cli.Kind) kinds {
	return findKind(func(k kinds) bool { return k.cli == kind })
}

// documentsSnapshot is layout's snapshot in documents' words: each
// document's sources and its files' problems, and the blocks file.
func documentsSnapshot(snapshot layout.Snapshot) documents.Snapshot {
	source := func(s *layout.Source) *documents.Source {
		if s == nil {
			return nil
		}
		return &documents.Source{Path: s.Path, Bytes: s.Bytes}
	}
	mapped := documents.Snapshot{Documents: map[documents.Kind]map[string]documents.Document{}, Blocks: source(snapshot.Blocks)}
	for kind, named := range snapshot.Documents {
		k := layoutKind(kind).documents
		mapped.Documents[k] = map[string]documents.Document{}
		for name, document := range named {
			var problems []documents.Problem
			for _, p := range document.Problems {
				problems = append(problems, documents.Problem{Path: p.Path, Message: p.Err.Error()})
			}
			mapped.Documents[k][name] = documents.Document{
				Sources: documents.Sources{
					Home:       source(document.Sources.Home),
					Repository: source(document.Sources.Repository),
					Project:    source(document.Sources.Project),
				},
				Problems: problems,
			}
		}
	}
	return mapped
}

// layerOf is the layer whose folder holds path, the nearest of those that
// do; "" for a path of no layer.
func layerOf(folders layout.Folders, path string) check.Layer {
	var layer check.Layer
	var nearest string
	for _, l := range []struct {
		layer  check.Layer
		folder string
	}{
		{check.LayerHome, folders.Home},
		{check.LayerRepository, folders.Repository},
		{check.LayerProject, folders.Project},
	} {
		if l.folder == "" || len(l.folder) <= len(nearest) {
			continue
		}
		if path == l.folder || strings.HasPrefix(path, l.folder+string(filepath.Separator)) {
			layer, nearest = l.layer, l.folder
		}
	}
	return layer
}

// contracts answers resolve's wrappers from the runtime wrappers' facts,
// by contract: a contract no wrapper takes has none.
type contracts struct {
	wrappers []wrapperFacts
}

// wrapperFacts gives a runtime wrapper's contract and its facts in
// resolve's words.
type wrapperFacts func() (string, resolve.Facts)

func newContracts(wrappers ...wrapperFacts) (*contracts, error) {
	if slices.ContainsFunc(wrappers, func(w wrapperFacts) bool { return w == nil }) {
		return nil, errors.New("contracts: no wrapper")
	}
	return &contracts{wrappers: wrappers}, nil
}

func (c *contracts) Facts(contract string) (resolve.Facts, bool) {
	for _, wrapper := range c.wrappers {
		if takes, facts := wrapper(); takes == contract {
			return facts, true
		}
	}
	return resolve.Facts{}, false
}

func claudeCodeFacts(wrapper interface{ Facts() claudecode.Facts }) wrapperFacts {
	return func() (string, resolve.Facts) {
		f := wrapper.Facts()
		return f.Contract, resolve.Facts{Schema: f.Schema, Session: f.Session, Skills: f.Skills, Model: f.Model,
			Efforts: f.Efforts, ToolCalls: f.ToolCalls, ToolCommands: f.ToolCommands}
	}
}

func codexFacts(wrapper interface{ Facts() codex.Facts }) wrapperFacts {
	return func() (string, resolve.Facts) {
		f := wrapper.Facts()
		return f.Contract, resolve.Facts{Schema: f.Schema, Session: f.Session, Skills: f.Skills, Model: f.Model,
			Efforts: f.Efforts, ToolCalls: f.ToolCalls, ToolCommands: f.ToolCommands}
	}
}

func piFacts(wrapper interface{ Facts() pi.Facts }) wrapperFacts {
	return func() (string, resolve.Facts) {
		f := wrapper.Facts()
		return f.Contract, resolve.Facts{Schema: f.Schema, Session: f.Session, Skills: f.Skills, Model: f.Model,
			Efforts: f.Efforts, ToolCalls: f.ToolCalls, ToolCommands: f.ToolCommands}
	}
}

func bashFacts(wrapper interface{ Facts() bash.Facts }) wrapperFacts {
	return func() (string, resolve.Facts) {
		f := wrapper.Facts()
		return f.Contract, resolve.Facts{Schema: f.Schema, Session: f.Session, Skills: f.Skills, Model: f.Model,
			Efforts: f.Efforts, ToolCalls: f.ToolCalls, ToolCommands: f.ToolCommands}
	}
}

// filesystem is what layout's filesystem asks of files.
type filesystem interface {
	Entries(folder string) ([]files.Entry, error)
	Bytes(file string) ([]byte, error)
}

// layoutFiles answers layout's filesystem from files. An error passes as
// files gives it, so one that is fs.ErrNotExist stays so.
type layoutFiles struct {
	files filesystem
}

func newLayoutFiles(files filesystem) (*layoutFiles, error) {
	if files == nil {
		return nil, errors.New("layout files: no files")
	}
	return &layoutFiles{files: files}, nil
}

func (l *layoutFiles) Entries(folder string) ([]layout.Entry, error) {
	entries, err := l.files.Entries(folder)
	if err != nil {
		return nil, err
	}
	mapped := make([]layout.Entry, 0, len(entries))
	for _, entry := range entries {
		kind := layout.Other
		switch entry.Kind {
		case files.RegularFile:
			kind = layout.RegularFile
		case files.Folder:
			kind = layout.Folder
		}
		mapped = append(mapped, layout.Entry{Name: entry.Name, Kind: kind})
	}
	return mapped, nil
}

func (l *layoutFiles) Bytes(file string) ([]byte, error) { return l.files.Bytes(file) }

// worktrees is what layout's worktree root asks of git.
type worktrees interface {
	Root(ctx context.Context, dir string) (string, error)
}

// worktreeRoot answers layout's worktree root from git, within ctx.
type worktreeRoot struct {
	ctx context.Context
	git worktrees
}

func newWorktreeRoot(ctx context.Context, git worktrees) (*worktreeRoot, error) {
	if ctx == nil {
		return nil, errors.New("worktree root: no context")
	}
	if git == nil {
		return nil, errors.New("worktree root: no git")
	}
	return &worktreeRoot{ctx: ctx, git: git}, nil
}

func (w *worktreeRoot) Root(dir string) (string, error) {
	root, err := w.git.Root(w.ctx, dir)
	if err != nil {
		return "", fmt.Errorf("the worktree root of %s: %w", dir, err)
	}
	return root, nil
}

// names answers check's names from layout's snapshot: each document a
// layer holds a file of, with the layers that hold one, a file that cannot
// be read among them.
type names struct {
	snapshot layout.Snapshot
}

func (n names) Held() []check.Held {
	var held []check.Held
	for kind, named := range n.snapshot.Documents {
		for name, document := range named {
			var paths []string
			for _, source := range []*layout.Source{document.Sources.Home, document.Sources.Repository, document.Sources.Project} {
				if source != nil {
					paths = append(paths, source.Path)
				}
			}
			for _, p := range document.Problems {
				paths = append(paths, p.Path)
			}
			var layers []check.Layer
			for _, layer := range []check.Layer{check.LayerHome, check.LayerRepository, check.LayerProject} {
				if slices.ContainsFunc(paths, func(path string) bool { return layerOf(n.snapshot.Layers, path) == layer }) {
					layers = append(layers, layer)
				}
			}
			held = append(held, check.Held{Kind: layoutKind(kind).check, Name: name, Layers: layers})
		}
	}
	return held
}

// resolver is what check's resolve asks of resolve.
type resolver interface {
	Resolve(request resolve.Request) (resolve.Resolved, []resolve.Fault)
}

// declared is what check's resolve asks of resolve's source: a workflow,
// for the params it declares, and the problems of no document.
type declared interface {
	Workflow(name string) (resolve.Workflow, []resolve.Problem)
	Problems() []resolve.Problem
}

// checkResolve answers check's resolve from resolve, asking for a workflow
// as a caller giving every param it declares: a param no caller gives is a
// fault of a run's request, not of the settings. Each source's layer is
// that of its file.
type checkResolve struct {
	resolver resolver
	source   declared
	layers   layout.Folders
}

func newCheckResolve(resolver resolver, source declared, layers layout.Folders) (*checkResolve, error) {
	if resolver == nil {
		return nil, errors.New("check resolve: no resolver")
	}
	if source == nil {
		return nil, errors.New("check resolve: no source")
	}
	return &checkResolve{resolver: resolver, source: source, layers: layers}, nil
}

func (c *checkResolve) Resolve(document check.Reference) (check.Resolved, []check.Fault) {
	kind := checkKind(document.Kind).resolve
	request := resolve.Document(kind, document.Name)
	if kind == resolve.KindWorkflow {
		workflow, _ := c.source.Workflow(document.Name)
		var params []string
		for _, param := range workflow.Params {
			params = append(params, param.Name)
		}
		request = request.WithParams(params...)
	}
	resolved, faults := c.resolver.Resolve(request)
	if len(faults) > 0 {
		var mapped []check.Fault
		for _, fault := range faults {
			f := check.Fault{Problems: c.problems(fault.Problems)}
			for _, link := range fault.Chain {
				f.Chain = append(f.Chain, check.Link{Kind: kindOf(link.Kind).check, Name: link.Name,
					Source: c.sourceOf(link.Origin), Place: link.Origin.Place})
			}
			if block := fault.Block; block != nil {
				f.Block = &check.Block{Reason: block.Reason, Source: c.sourceOf(block.Origin)}
			}
			mapped = append(mapped, f)
		}
		return check.Resolved{}, mapped
	}
	var mapped check.Resolved
	for _, reached := range resolved.Reached {
		mapped.Reached = append(mapped.Reached, check.Reference{Kind: kindOf(reached.Kind).check, Name: reached.Name})
	}
	for _, plan := range resolved.Plans {
		mapped.Plans = append(mapped.Plans, check.Plan{
			Workflow: plan.Workflow, Place: plan.Place,
			Process: plan.Process, Agent: plan.Agent, Runtime: plan.Runtime,
			Options: plan.Options, Required: plan.Required, Allowed: plan.Allowed,
			Granted: plan.Granted, Extra: plan.Extra, Withheld: plan.Withheld,
		})
	}
	mapped.Warnings = c.problems(resolved.Warnings)
	return mapped, nil
}

func (c *checkResolve) Problems() []check.Problem { return c.problems(c.source.Problems()) }

func (c *checkResolve) problems(problems []resolve.Problem) []check.Problem {
	var mapped []check.Problem
	for _, p := range problems {
		mapped = append(mapped, check.Problem{Source: c.sourceOf(p.Origin), Place: p.Origin.Place, Message: p.Message})
	}
	return mapped
}

func (c *checkResolve) sourceOf(origin resolve.Origin) check.Source {
	return check.Source{File: origin.Path, Line: origin.Line, Layer: layerOf(c.layers, origin.Path)}
}

// trees is what check's fields asks of documents: a document's tree, as
// layered and extended, or its problems.
type trees interface {
	Tree(kind documents.Kind, name string) (tree.Node, []documents.Problem)
}

// checkFields answers check's fields from documents' tree: each leaf, in
// the tree's order, at its place spelled as documents spells a problem's,
// with its file, its line and the layer of its file. A document whose tree
// has problems has no fields: one that does not type has its tree.
type checkFields struct {
	trees  trees
	layers layout.Folders
}

func newCheckFields(trees trees, layers layout.Folders) (*checkFields, error) {
	if trees == nil {
		return nil, errors.New("check fields: no trees")
	}
	return &checkFields{trees: trees, layers: layers}, nil
}

func (c *checkFields) Fields(document check.Reference) []check.Field {
	root, problems := c.trees.Tree(checkKind(document.Kind).documents, document.Name)
	if len(problems) > 0 {
		return nil
	}
	var fields []check.Field
	var walk func(node tree.Node, place string)
	walk = func(node tree.Node, place string) {
		var value string
		switch node.Kind() {
		case tree.Map:
			// The root is no field: an empty document has none.
			if len(node.Keys()) > 0 || place == "" {
				for _, k := range node.Keys() {
					child, _ := node.Get(k)
					walk(child, key(place, k))
				}
				return
			}
			value = "{}"
		case tree.List:
			if items := node.Items(); len(items) > 0 {
				for i, item := range items {
					walk(item, itemPlace(place, i))
				}
				return
			}
			value = "[]"
		case tree.String:
			value, _ = node.Text()
		case tree.Integer:
			i, _ := node.Integer()
			value = strconv.FormatInt(i, 10)
		case tree.Number:
			f, _ := node.Number()
			value = strconv.FormatFloat(f, 'g', -1, 64)
		case tree.Boolean:
			b, _ := node.Boolean()
			value = strconv.FormatBool(b)
		case tree.Empty:
			return
		}
		origin := node.Origin()
		fields = append(fields, check.Field{Place: place, Value: value,
			Source: check.Source{File: origin.Path, Line: origin.Line, Layer: layerOf(c.layers, origin.Path)}})
	}
	walk(root, "")
	return fields
}

// key is the place of the field name of the map at place, as documents
// spells a problem's: the keys from the root joined by ".".
func key(place, name string) string {
	if place == "" {
		return name
	}
	return place + "." + name
}

// itemPlace is the place of the item i of the list at place, as documents
// spells a problem's.
func itemPlace(place string, i int) string {
	return place + "[" + strconv.Itoa(i) + "]"
}
