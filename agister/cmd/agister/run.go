package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"maps"
	"os"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/igor1309/ai-labs/agister/cli"
	"github.com/igor1309/ai-labs/agister/core/admit"
	"github.com/igor1309/ai-labs/agister/core/call"
	"github.com/igor1309/ai-labs/agister/core/inputs"
	"github.com/igor1309/ai-labs/agister/core/watch"
	"github.com/igor1309/ai-labs/agister/core/workflow"
	"github.com/igor1309/ai-labs/agister/runstore"
	"github.com/igor1309/ai-labs/agister/runtime/bash"
	"github.com/igor1309/ai-labs/agister/runtime/claudecode"
	"github.com/igor1309/ai-labs/agister/runtime/codex"
	"github.com/igor1309/ai-labs/agister/settings/documents"
	"github.com/igor1309/ai-labs/agister/settings/layout"
	"github.com/igor1309/ai-labs/agister/settings/resolve"
	"github.com/igor1309/ai-labs/agister/supervisor"
	group "github.com/igor1309/ai-labs/gokit/supervisor"
)

// signals starts watching the signals that cancel a run: fired delivers
// each, until stop.
type signals func() (fired <-chan os.Signal, stop func())

// clock tells the time a run's and a call's timing are measured by.
type clock interface {
	Now() time.Time
}

// host is what a run is given of the machine Agister runs on: the context
// every run ends within; Agister's own environment, as "KEY=value"; the
// clock and the timer a call's timing and time limit are kept on; the
// signals that cancel a run; and the randomness a run's id is drawn from.
type host struct {
	ctx     context.Context
	environ []string
	clock   clock
	timer   call.Timer
	signals signals
	random  io.Reader
}

// turn is a runtime a step takes its turn on: the contract of its wrapper,
// how it takes a call's inputs, whether it reports a cost, and its turns.
type turn struct {
	contract string
	inputs   call.Inputs
	cost     bool
	runtime  call.Runtime
}

// runs answers cli's run from resolve and core (docs/run-implementation.md,
// "The first run", "A step on a model runtime", "Inputs and progress", "A
// step in a held worktree" and "Parallel steps and a join"): a request
// resolves over
// the settings of home's folder and its launch directory, read once; what
// this slice does not run is refused before anything runs; and the
// workflow runs in the root of the git worktree that holds the launch
// directory, a signal cancelling it, each step on the turn of the contract
// its agent's runtime names. A call's output is checked against its schema
// by the validator, and its inputs are read through sourcing; each call is
// admitted against its worktree, and holds it, through holding; what each
// step is doing is told to events. Each run that reaches core is recorded
// in store (docs/run-implementation.md, "Records"); a run that continues
// one store keeps is checked against it first, and its step resumes that
// run's session ("Continuation"); a step continuing an earlier step's
// session resumes it ("A binding continuing a session").
type runs struct {
	home      string
	links     links
	fs        layout.FileSystem
	roots     layout.WorktreeRoot
	wrappers  resolve.Wrappers
	turns     []turn
	validator call.Validator
	sourcing  sourcing
	holding   holding
	host      host
	events    workflow.Events
	store     runStore
}

// runStore is what a run asks of runstore: its record kept, and the runs
// kept that a continuation reads.
type runStore interface {
	recordStore
	keptRuns
}

func newRuns(home string, links links, fs layout.FileSystem, roots layout.WorktreeRoot, wrappers resolve.Wrappers, turns []turn, validator call.Validator, sourcing sourcing, holding holding, host host, events workflow.Events, store runStore) (*runs, error) {
	contracts := map[string]bool{}
	for _, t := range turns {
		switch {
		case t.contract == "" || t.runtime == nil:
			return nil, errors.New("runs: no turn")
		case t.inputs == 0:
			return nil, errors.New("runs: no turn's inputs")
		case contracts[t.contract]:
			return nil, fmt.Errorf("runs: two turns of the contract %q", t.contract)
		}
		contracts[t.contract] = true
	}
	switch {
	case home == "":
		return nil, errors.New("runs: no home")
	case links == nil:
		return nil, errors.New("runs: no links")
	case fs == nil:
		return nil, errors.New("runs: no filesystem")
	case roots == nil:
		return nil, errors.New("runs: no worktree root")
	case wrappers == nil:
		return nil, errors.New("runs: no wrappers")
	case len(turns) == 0:
		return nil, errors.New("runs: no turn")
	case validator == nil:
		return nil, errors.New("runs: no validator")
	case sourcing.check() != nil:
		return nil, fmt.Errorf("runs: %w", sourcing.check())
	case holding.check() != nil:
		return nil, fmt.Errorf("runs: %w", holding.check())
	case host.ctx == nil:
		return nil, errors.New("runs: no context")
	case host.clock == nil:
		return nil, errors.New("runs: no clock")
	case host.timer == nil:
		return nil, errors.New("runs: no timer")
	case host.signals == nil:
		return nil, errors.New("runs: no signals")
	case host.random == nil:
		return nil, errors.New("runs: no randomness")
	case events == nil:
		return nil, errors.New("runs: no events")
	case store == nil:
		return nil, errors.New("runs: no record store")
	}
	return &runs{home: home, links: links, fs: fs, roots: roots, wrappers: wrappers, turns: slices.Clone(turns), validator: validator, sourcing: sourcing, holding: holding, host: host, events: events, store: store}, nil
}

// takes is how each turn takes a call's inputs, by its contract.
func (r *runs) takes() map[string]call.Inputs {
	takes := map[string]call.Inputs{}
	for _, t := range r.turns {
		takes[t.contract] = t.inputs
	}
	return takes
}

func (r *runs) Run(launch string, request cli.Request) (cli.Result, error) {
	resolvedLaunch, err := r.links.Resolved(launch)
	if err != nil {
		return cli.Result{}, fmt.Errorf("the launch directory %s: %w", launch, err)
	}
	// Layout asks for the launch directory's root, and so does the run: git
	// is asked once.
	roots := &knownRoots{roots: r.roots, found: map[string]string{}}
	read, err := readSettings(r.home, resolvedLaunch, r.fs, roots, r.wrappers)
	if err != nil {
		return cli.Result{}, err
	}
	resolved, faults := read.resolver.Resolve(resolveRequest(request))
	if len(faults) > 0 {
		return cli.Result{}, refused(faultLines(faults))
	}
	root, err := roots.Root(resolvedLaunch)
	if err != nil {
		return cli.Result{}, err
	}
	if root == "" {
		return cli.Result{}, refused([]string{fmt.Sprintf("the launch directory %q is in no git worktree", launch)})
	}
	built, unrun, err := planOf(request.Workflow, resolved, read.documents, r.takes())
	if err != nil {
		return cli.Result{}, err
	}
	if len(unrun) > 0 {
		return cli.Result{}, refused(unrun)
	}
	for name, planned := range built.calls {
		if limit := planned.step.CostLimit; limit != nil {
			for _, runtime := range r.turns {
				if runtime.contract == planned.contract && !runtime.cost {
					runtimeName := resolved.Agents[planned.agent].Runtime.Value
					planned.step.Warnings = append(planned.step.Warnings, fmt.Sprintf("the runtime %s reports no cost: the cost limit %g spends nothing", runtimeName, *limit))
					planned.step.CostLimit = nil
				}
			}
		}
		built.calls[name] = planned
	}
	built, refusal := sessionsContinued(built, read.documents)
	if len(refusal) > 0 {
		return cli.Result{}, refused(refusal)
	}
	if request.Continue != "" {
		c, refusal, err := continuationOf(r.host.ctx, request.Continue, built, root, r.store, r.holding.facts, read.documents)
		if err != nil {
			return cli.Result{}, err
		}
		if len(refusal) > 0 {
			return cli.Result{}, refused(refusal)
		}
		built = continued(built, c)
	}
	var reused runstore.Record
	if request.Reuse != "" {
		var refusal []string
		reused, refusal, err = reuseOf(request.Reuse, request, r.store)
		if err != nil {
			return cli.Result{}, err
		}
		if len(refusal) > 0 {
			return cli.Result{}, refused(refusal)
		}
	}
	started := r.host.clock.Now()
	id, err := runIDOf(started, r.host.random)
	if err != nil {
		return cli.Result{}, err
	}
	record, err := newRunRecord(r.store, r.host.clock, id, started, request, built.definitions, built.definitionBytes, launch, root)
	if err != nil {
		return cli.Result{}, err
	}
	budget, _ := read.documents.Budget()
	var daily *float64
	if budget.Given {
		daily = &budget.Value
	}
	runner, err := r.runner(built, id, launch, root, record, reused, daily)
	if err != nil {
		return cli.Result{}, err
	}
	if err := record.begin(); err != nil {
		return cli.Result{}, refused([]string{"its record cannot be written: " + err.Error()})
	}
	ctx, stop := r.cancelled()
	defer stop()
	return record.end(runner.Run(ctx, built.workflow, request.Params)), nil
}

// runner is core's runner of built, in the run whose id is id, its calls'
// turns taken in dir, the worktree's root, over Agister's environment, each by the caller of its
// turn's contract, once core/admit has admitted it against that worktree,
// and watched for staleness by core/watch, on the host's timer; its inputs
// read by the sources, a path relative to launch, as the person gave it;
// a call taken from reused's calls where it may be;
// what each step is doing told to the run's events and to record, and each
// call, as it ends, to record.
func (r *runs) runner(built plan, id, launch, dir string, record *runRecord, reused runstore.Record, daily *float64) (*workflow.Runner, error) {
	watcher, err := watch.New(watch.Timer(r.host.timer))
	if err != nil {
		return nil, err
	}
	stale, err := newStaleness(watcher)
	if err != nil {
		return nil, err
	}
	callers := map[string]turnCaller{}
	for _, t := range r.turns {
		caller, err := call.New(t.runtime, t.inputs, r.validator, stale, r.host.clock, r.host.timer, dir, r.host.environ)
		if err != nil {
			return nil, err
		}
		callers[t.contract] = caller
	}
	resolver, err := inputs.New(r.sourcing.sources(launch, dir), briefPaths{paths: r.sourcing.paths, launch: launch})
	if err != nil {
		return nil, err
	}
	admitter, err := admit.New(worktreeAt{facts: r.holding.facts, root: dir},
		worktreeHold{locks: r.holding.locks, links: r.links, folder: r.holding.folder, root: dir})
	if err != nil {
		return nil, err
	}
	steps, err := newStepCalls(resolver, admitter, callers, r.host.clock, built.calls, record, func() (*call.DailyBudget, []string) {
		return dailyBudget(r.store, r.host.clock.Now(), daily)
	})
	if err != nil {
		return nil, err
	}
	steps.run = id
	steps.reuse = reusable{calls: reused.Calls, root: dir, facts: r.holding.facts}
	return workflow.New(boundary{inputs: resolver, declared: built.boundary, records: record}, steps, bothEvents{r.events, record}, r.host.clock)
}

// cancelled is the host's context, ended once a signal arrives; stop ends
// it and returns once nothing watches the signals any more.
func (r *runs) cancelled() (context.Context, func()) {
	fired, unwatch := r.host.signals()
	ctx, cancel := context.WithCancel(r.host.ctx)
	done := make(chan struct{})
	go func() {
		defer close(done)
		select {
		case <-fired:
			cancel()
		case <-ctx.Done():
		}
	}()
	return ctx, func() {
		cancel()
		<-done
		unwatch()
	}
}

// resolveRequest is request in resolve's words, giving the names of its
// params.
func resolveRequest(request cli.Request) resolve.Request {
	params := slices.Sorted(maps.Keys(request.Params))
	if request.Workflow != "" {
		return resolve.Document(resolve.KindWorkflow, request.Workflow).WithParams(params...)
	}
	return resolve.Step(request.Process, request.Agent).WithParams(params...)
}

// refused is the refusal of a run, nothing run, for each of lines.
func refused(lines []string) error {
	return errors.New("the run is refused, and nothing runs:\n  " + strings.Join(lines, "\n  "))
}

// faultLines is each problem of faults, and each block, after the
// document at fault.
func faultLines(faults []resolve.Fault) []string {
	var lines []string
	for _, fault := range faults {
		var document string
		if len(fault.Chain) > 0 {
			last := fault.Chain[len(fault.Chain)-1]
			document = fmt.Sprintf("%s %s: ", last.Kind, last.Name)
		}
		for _, problem := range fault.Problems {
			lines = append(lines, document+problemLine(problem.Origin, problem.Message))
		}
		if block := fault.Block; block != nil {
			lines = append(lines, document+problemLine(block.Origin, "blocked: "+block.Reason))
		}
	}
	return lines
}

// problemLine is message at origin, as "file:line place: message", each
// part left out where it is none.
func problemLine(origin resolve.Origin, message string) string {
	var where []string
	if origin.Path != "" {
		file := origin.Path
		if origin.Line > 0 {
			file += ":" + strconv.Itoa(origin.Line)
		}
		where = append(where, file)
	}
	if origin.Place != "" {
		where = append(where, origin.Place)
	}
	if len(where) == 0 {
		return message
	}
	return strings.Join(where, " ") + ": " + message
}

// knownRoots answers layout's worktree root from roots, asking for each
// directory once.
type knownRoots struct {
	roots layout.WorktreeRoot
	found map[string]string
}

func (k *knownRoots) Root(dir string) (string, error) {
	if root, ok := k.found[dir]; ok {
		return root, nil
	}
	root, err := k.roots.Root(dir)
	if err != nil {
		return "", err
	}
	k.found[dir] = root
	return root, nil
}

// runDocuments is what a run's plan asks of documents: what resolve does
// not hold, a param's default, an input's source, a brief form's parts, a
// time limit, a prompt's text, and what this slice does not run.
type runDocuments interface {
	Files(kind documents.Kind, name string) ([]documents.File, []documents.Problem)
	Workflow(name string) (documents.WorkflowDefinition, []documents.Problem)
	Process(name string) (documents.ProcessDefinition, []documents.Problem)
	Brief(name string) (documents.BriefDefinition, []documents.Problem)
	Blob(kind documents.Kind, name string) (documents.Blob, []documents.Problem)
}

// plan is a run built for core: what its workflow declares of its params
// and inputs, which core/inputs resolves at its boundary; its workflow; and
// each step's call, by the step's name.
type plan struct {
	definitions     []runstore.Definition
	definitionBytes map[string][]byte
	boundary        inputs.Declared
	workflow        workflow.Workflow
	calls           map[string]plannedCall
}

// plannedCall is a step's call: its process and agent, by name; the
// contract of the turn it is taken on; the id of the call whose session
// it continues, "" for none; whether it is of a session's chain inside the
// run, continuing a session or continued by a step, which is made, never
// taken by a reuse: what a session held is not compared, and a session the
// earlier run went on in has moved past the call a reuse would take; what
// its process declares, which
// core/inputs resolves before the call starts; what it declares of the
// worktree, which core/admit admits it by, but the commit of its pin,
// which its inputs give; and the call core/call makes, but its environment
// and inputs, which those give; the permissions resolve planned; and the
// call made again on its agent's fallback, nil for none (ADR-004, rule 8).
type plannedCall struct {
	definitions     []runstore.Definition
	definitionBytes map[string][]byte
	permissions     runstore.Permissions
	process         string
	agent           string
	contract        string
	continues       string
	chained         bool
	declared        inputs.Declared
	admission       admit.Request
	step            call.Step
	fallback        *plannedCall
}

// planOf is the run of resolved, the workflow name, "" for one made of a
// step; or what this slice does not run, each named in the order the
// request's documents give it. It reads what resolve does not hold from
// docs, the documents of the snapshot resolve checked, which have composed
// the layers already (ADR-002). A turn is taken only on a runtime whose
// contract takes names, which says how its turn takes a call's inputs.
func planOf(name string, resolved resolve.Resolved, docs runDocuments, takes map[string]call.Inputs) (plan, []string, error) {
	if resolved.Workflow == nil {
		return plan{}, nil, errors.New("the request resolves to no workflow")
	}
	w := *resolved.Workflow
	unrun, err := notRunOf(name, w, resolved, docs, takes)
	if err != nil || len(unrun) > 0 {
		return plan{}, textsOfNotRun(unrun), err
	}

	// A workflow made of a step declares its process's params.
	var params []documents.Field[documents.Param]
	documentsByName := map[string]documents.Item{}
	var outputs []documents.Field[documents.Binding]
	sources := map[string]string{}
	if name != "" {
		definition, problems := docs.Workflow(name)
		if len(problems) > 0 {
			return plan{}, nil, documentProblems(problems)
		}
		params = definition.Params.Value
		var collect func([]documents.Field[documents.Item])
		collect = func(items []documents.Field[documents.Item]) {
			for _, field := range items {
				item := field.Value
				documentsByName[item.Name] = item
				collect(item.Parallel.Value)
				collect(item.Branch.Value)
				collect(item.Repeat.Value.Steps.Value)
			}
		}
		collect(definition.Steps.Value)
		outputs = definition.Outputs.Value
		for _, input := range definition.Inputs.Value {
			sources[input.Value.Name] = input.Value.Source.Value
		}
	} else if len(w.Steps) == 1 {
		definition, problems := docs.Process(w.Steps[0].Process.Value)
		if len(problems) > 0 {
			return plan{}, nil, documentProblems(problems)
		}
		params = definition.Params.Value
	}
	built := plan{calls: map[string]plannedCall{}, definitions: []runstore.Definition{}}
	if name != "" {
		named := []runstore.Definition{{Kind: "workflow", Name: name}}
		for _, input := range w.Inputs {
			for _, form := range input.Forms {
				named = append(named, runstore.Definition{Kind: "brief", Name: form.Value})
			}
		}
		built.definitions, built.definitionBytes, err = definitionsOf(docs, named)
		if err != nil {
			return plan{}, nil, err
		}
	}
	defaults := declaredParams(params)
	for _, param := range w.Params {
		built.boundary.Params = append(built.boundary.Params, inputs.Param{Name: param.Name, Default: defaults[param.Name]})
	}
	for _, input := range w.Inputs {
		arguments, err := inputsArguments(input.Arguments)
		if err != nil {
			return plan{}, nil, err
		}
		forms, err := formsOf(input.Forms, docs)
		if err != nil {
			return plan{}, nil, err
		}
		built.boundary.Inputs = append(built.boundary.Inputs, inputs.Input{Name: input.Name, Source: sources[input.Name], Arguments: arguments, Forms: forms})
	}
	// Every leaf is planned, including arms execution may never select.
	stepOf := func(item resolve.Item) (workflow.Step, error) {
		planned, err := plannedCallOf(name, item, item.Agent.Value, resolved, docs, takes)
		if err != nil {
			return workflow.Step{}, err
		}
		if fallback := resolved.Agents[item.Agent.Value].Fallback.Value; fallback != "" {
			if planned, err = withFallback(planned, name, item, fallback, resolved, docs, takes); err != nil {
				return workflow.Step{}, err
			}
		}
		var bindings []workflow.Binding
		if name == "" {
			bindings, err = workflowBindings(item.Inputs)
		} else {
			bindings, err = documentWorkflowBindings(documentsByName[item.Name].Inputs.Value)
		}
		if err != nil {
			return workflow.Step{}, err
		}
		built.calls[item.Name] = planned
		step := workflow.Step{Name: item.Name, Agent: item.Agent.Value, Bindings: bindings}
		if session := item.Session; session != nil {
			step.Session = session.Name
		}
		return step, nil
	}
	var buildItem func(resolve.Item) (workflow.Step, error)
	buildItem = func(item resolve.Item) (workflow.Step, error) {
		if itemKind(item) == "" {
			return stepOf(item)
		}
		definition := documentsByName[item.Name]
		builtItem := workflow.Step{Name: item.Name, Max: item.Max}
		children := item.Parallel
		if item.Branch != nil {
			children = item.Branch
		}
		if item.Repeat != nil {
			children = item.Repeat.Steps
		}
		var steps []workflow.Step
		for _, child := range children {
			step, err := buildItem(child)
			if err != nil {
				return workflow.Step{}, err
			}
			childDefinition := documentsByName[child.Name]
			if childDefinition.If.Given {
				condition := workflowCondition(childDefinition.If.Value)
				step.If = &condition
			}
			step.Outputs, err = documentWorkflowBindings(childDefinition.Outputs.Value)
			if err != nil {
				return workflow.Step{}, err
			}
			steps = append(steps, step)
		}
		switch {
		case item.Parallel != nil:
			builtItem.Parallel = steps
		case item.Branch != nil:
			builtItem.Branch = steps
		case item.Repeat != nil:
			repeat := definition.Repeat.Value
			state, err := documentWorkflowBindings(repeat.State.Value)
			if err != nil {
				return workflow.Step{}, err
			}
			next, err := documentWorkflowBindings(repeat.Next.Value)
			if err != nil {
				return workflow.Step{}, err
			}
			builtItem.Repeat = &workflow.Repeat{State: state, Next: next, Steps: steps, Until: workflowCondition(repeat.Until.Value), Max: repeat.Max.Value}
		}
		return builtItem, nil
	}
	for _, item := range w.Steps {
		step, err := buildItem(item)
		if err != nil {
			return plan{}, nil, err
		}
		built.workflow.Steps = append(built.workflow.Steps, step)
	}
	if name == "" {
		built.workflow.Outputs, err = workflowBindings(w.Outputs)
	} else {
		built.workflow.Outputs, err = documentWorkflowBindings(outputs)
	}
	if err != nil {
		return plan{}, nil, err
	}
	for _, item := range stepsOf(w.Steps) {
		if session := item.Session; session != nil {
			for _, name := range []string{item.Name, session.Name} {
				planned := built.calls[name]
				planned.chained = true
				built.calls[name] = planned
			}
		}
	}
	return built, nil, nil
}

// notRunOf is what this slice does not run of w, the workflow name, ""
// for one made of a step, in the order its documents give it: the
// workflow's inputs; workflow items at any depth, and each item a
// parallel holds that is not a step; a field
// read within a parallel's outputs, which are a list; then, for each step,
// a parallel's included, on its agent and on the agent's fallback, a
// runtime with no turn, and what its process declares that is not run,
// among them an input named as a document of its message, which two
// sections of one name would leave ambiguous.
// passName is a name ending as a pass does, in /<n>.
var passName = regexp.MustCompile(`/[0-9]+$`)

func notRunOf(name string, w resolve.Workflow, resolved resolve.Resolved, docs runDocuments, takes map[string]call.Inputs) ([]notRunLine, error) {
	var unrun notRun
	document := resolve.Reference{Kind: resolve.KindProcess, Name: ""}
	if name != "" {
		document = resolve.Reference{Kind: resolve.KindWorkflow, Name: name}
		definition, problems := docs.Workflow(name)
		if len(problems) > 0 {
			return nil, documentProblems(problems)
		}
		owner := fmt.Sprintf("the workflow %q", name)
		for _, input := range definition.Inputs.Value {
			unrun.input(document, owner, input.Value)
		}
		parallels := map[string]bool{}
		notStep := func(item resolve.Item) {
			if kind := itemKind(item); kind != "" {
				unrun.add(document, owner, fmt.Sprintf("the item %q, %s,", item.Name, kind))
			}
		}
		var inspect func([]resolve.Item)
		inspect = func(items []resolve.Item) {
			for _, item := range items {
				// A pass names its step <step>/<n>; a declared name of that
				// form would share a pass's call id.
				if passName.MatchString(item.Name) {
					unrun.add(document, owner, fmt.Sprintf("the item %q, named as a pass,", item.Name))
				}
				switch {
				case item.Parallel != nil:
					parallels[item.Name] = true
					for _, child := range item.Parallel {
						notStep(child)
					}
					inspect(item.Parallel)
				case item.Branch != nil:
					inspect(item.Branch)
				case item.Repeat != nil:
					inspect(item.Repeat.Steps)
				default:
					notStep(item)
				}
			}
		}
		inspect(w.Steps)
		for _, binding := range referencesOf(w) {
			if read := binding.From; read.Root == resolve.RootOutputs && parallels[read.Name] && read.Field != "" {
				unrun.add(document, owner, fmt.Sprintf("a field within the parallel %q's outputs", read.Name))
			}
			if read := binding.From; read.Root == resolve.RootSession {
				unrun.add(document, owner, fmt.Sprintf("the session of %q, read as a value,", read.Name))
			}
		}
	}
	for _, item := range stepsOf(w.Steps) {
		definition, problems := docs.Process(item.Process.Value)
		if len(problems) > 0 {
			return nil, documentProblems(problems)
		}
		// A step's call may be made again on its agent's fallback, whose
		// runtime must run it as well.
		agents := []string{item.Agent.Value}
		if fallback := resolved.Agents[item.Agent.Value].Fallback.Value; fallback != "" {
			agents = append(agents, fallback)
		}
		for _, agent := range agents {
			runtime := resolved.Agents[agent].Runtime.Value
			inputsTaken, turned := takes[resolved.Runtimes[runtime].Contract.Value]
			step := fmt.Sprintf("the step %q", item.Name)
			if !turned {
				unrun.add(document, step, fmt.Sprintf("the runtime %q's turn", runtime))
			}
			processDocument := resolve.Reference{Kind: resolve.KindProcess, Name: item.Process.Value}
			owner := fmt.Sprintf("the process %q", item.Process.Value)
			documentNames := documentNamesOf(definition)
			for _, input := range definition.Inputs.Value {
				unrun.input(processDocument, owner, input.Value)
				if turned && inputsTaken == call.InMessage && slices.Contains(documentNames, input.Value.Name) {
					unrun.add(processDocument, owner, fmt.Sprintf("the input %q, a document's name,", input.Value.Name))
				}
			}
		}
	}
	return unrun.lines, nil
}

// notRunProcessOf is the process portion of notRunOf for a process checked
// without an agent. It shares the same source rule as a workflow run.
func notRunProcessOf(name string, docs runDocuments) ([]notRunLine, error) {
	definition, problems := docs.Process(name)
	if len(problems) > 0 {
		return nil, documentProblems(problems)
	}
	var unrun notRun
	document := resolve.Reference{Kind: resolve.KindProcess, Name: name}
	owner := fmt.Sprintf("the process %q", name)
	for _, input := range definition.Inputs.Value {
		unrun.input(document, owner, input.Value)
	}
	return unrun.lines, nil
}

// stepsOf visits every leaf in declaration order, including every branch
// arm and repeat body.
func stepsOf(items []resolve.Item) []resolve.Item {
	var steps []resolve.Item
	for _, item := range items {
		switch {
		case item.Parallel != nil:
			steps = append(steps, stepsOf(item.Parallel)...)
		case item.Branch != nil:
			steps = append(steps, stepsOf(item.Branch)...)
		case item.Repeat != nil:
			steps = append(steps, stepsOf(item.Repeat.Steps)...)
		case itemKind(item) == "":
			steps = append(steps, item)
		}
	}
	return steps
}

// referencesOf collects bindings and condition reads at every depth.
func referencesOf(w resolve.Workflow) []resolve.Binding {
	var reads []resolve.Binding
	bindings := func(bindings []resolve.Binding) {
		for _, binding := range bindings {
			if binding.From != nil {
				reads = append(reads, binding)
			}
		}
	}
	condition := func(c resolve.Condition) {
		for _, read := range c.Reads {
			read := read
			reads = append(reads, resolve.Binding{From: &read})
		}
	}
	var of func([]resolve.Item)
	of = func(items []resolve.Item) {
		for _, item := range items {
			bindings(item.Inputs)
			bindings(item.Outputs)
			condition(item.If)
			of(item.Parallel)
			of(item.Branch)
			if repeat := item.Repeat; repeat != nil {
				bindings(repeat.State)
				of(repeat.Steps)
				bindings(repeat.Next)
				condition(repeat.Until)
			}
		}
	}
	of(w.Steps)
	bindings(w.Outputs)
	return reads
}

// documentNamesOf is the name of each document a model's message gives of
// definition, in order: "prompt" where it names a prompt, then each
// guidance by its name.
func documentNamesOf(definition documents.ProcessDefinition) []string {
	var names []string
	if definition.Prompt.Value != "" {
		names = append(names, "prompt")
	}
	for _, guidance := range definition.Guidance.Value {
		names = append(names, guidance.Value)
	}
	return names
}

// plannedCallOf is the call of the step item of the workflow name on
// agent, the step's or its fallback: the contract of its runtime; its process's params, their defaults, inputs,
// their sources, and environment; its process's workspace: the input it
// pins, with that input's source, whether it asks a clean worktree, and
// whether it writes, declaring read-write access; on a runtime that takes its inputs in its
// environment, its script, the text of its process's prompt; on one that
// takes them in its message, its documents, the prompt as "prompt" where
// its process names one, then each guidance by its name, its process's
// instruction, its agent's model and effort, its plan's options and the
// bytes of its process's output schema; its process's time limit,
// staleness limits and recovery; and its plan's warnings, those resolve
// gives at the step.
func plannedCallOf(name string, item resolve.Item, on string, resolved resolve.Resolved, docs runDocuments, takes map[string]call.Inputs) (plannedCall, error) {
	process := resolved.Processes[item.Process.Value]
	agent := resolved.Agents[on]
	definition, problems := docs.Process(item.Process.Value)
	if len(problems) > 0 {
		return plannedCall{}, documentProblems(problems)
	}
	sources := map[string]string{}
	for _, input := range definition.Inputs.Value {
		sources[input.Value.Name] = input.Value.Source.Value
	}
	planned := plannedCall{process: item.Process.Value, agent: on,
		contract: resolved.Runtimes[agent.Runtime.Value].Contract.Value}
	for _, p := range resolved.Plans {
		if p.Workflow == name && p.Place == item.Origin.Place && p.Agent == on {
			planned.permissions = runstore.Permissions{
				Options: append([]string{}, p.Options...), Required: append([]string{}, p.Required...),
				Allowed: append([]string{}, p.Allowed...), Granted: append([]string{}, p.Granted...),
				Extra: append([]string{}, p.Extra...), Withheld: append([]string{}, p.Withheld...),
			}
			planned.step.Options = slices.Clone(p.Options)
		}
	}
	workspace := definition.Workspace.Value
	planned.admission.Writer = workspace.Access.Value == "read-write"
	planned.admission.Clean = workspace.Clean.Given && workspace.Clean.Value
	if workspace.Revision.Given {
		pinned := workspace.Revision.Value.Name
		planned.admission.Pin = &admit.Pin{Input: pinned, Source: sources[pinned]}
	}
	defaults := declaredParams(definition.Params.Value)
	for _, param := range process.Params {
		planned.declared.Params = append(planned.declared.Params, inputs.Param{Name: param.Name, Default: defaults[param.Name]})
	}
	for _, input := range process.Inputs {
		arguments, err := inputsArguments(input.Arguments)
		if err != nil {
			return plannedCall{}, err
		}
		forms, err := formsOf(input.Forms, docs)
		if err != nil {
			return plannedCall{}, err
		}
		planned.declared.Inputs = append(planned.declared.Inputs, inputs.Input{Name: input.Name, Source: sources[input.Name], Arguments: arguments, Forms: forms})
	}
	for _, variable := range process.Environment {
		value, err := inputsValue(variable)
		if err != nil {
			return plannedCall{}, err
		}
		planned.declared.Environment = append(planned.declared.Environment, inputs.Variable{Name: variable.Name, Value: value})
	}
	blob := func(kind documents.Kind, name string) ([]byte, error) {
		b, problems := docs.Blob(kind, name)
		if len(problems) > 0 {
			return nil, documentProblems(problems)
		}
		return b.Bytes, nil
	}
	if takes[planned.contract] == call.InMessage {
		if prompt := process.Prompt.Value; prompt != "" {
			text, err := blob(documents.Prompt, prompt)
			if err != nil {
				return plannedCall{}, err
			}
			planned.step.Documents = append(planned.step.Documents, call.Named{Name: "prompt", Text: string(text)})
		}
		for _, guidance := range process.Guidance {
			text, err := blob(documents.Prompt, guidance.Value)
			if err != nil {
				return plannedCall{}, err
			}
			planned.step.Documents = append(planned.step.Documents, call.Named{Name: guidance.Value, Text: string(text)})
		}
		planned.step.Instruction = definition.Instruction.Value
		planned.step.Model, planned.step.Effort = agent.Model.Value, agent.Effort.Value
		if schema := process.Schema.Value; schema != "" {
			bytes, err := blob(documents.Schema, schema)
			if err != nil {
				return plannedCall{}, err
			}
			planned.step.Schema = bytes
		}
	} else if prompt := process.Prompt.Value; prompt != "" {
		text, err := blob(documents.Prompt, prompt)
		if err != nil {
			return plannedCall{}, err
		}
		planned.step.Prompt = string(text)
	}
	if cost := definition.Limits.Value.Cost; cost.Given {
		planned.step.CostLimit = &cost.Value
	}
	planned.step.TimeLimit = definition.Limits.Value.Time.Value
	stale := definition.Limits.Value.Stale.Value
	planned.step.Staleness = call.Limits{RepeatedToolCalls: stale.RepeatedToolCalls.Value,
		ToolCommand: stale.ToolCommand.Value, NoEvent: stale.NoEvent.Value}
	recovery := definition.Recovery.Value
	planned.step.Recovery = call.Recovery{Resumes: recovery.Resumes.Value, Instruction: recovery.Instruction.Value}
	for _, warning := range resolved.Warnings {
		if warning.Origin == item.Origin {
			planned.step.Warnings = append(planned.step.Warnings, problemLine(warning.Origin, warning.Message))
		}
	}
	named := []runstore.Definition{{Kind: "process", Name: item.Process.Value}, {Kind: "agent", Name: on}, {Kind: "runtime", Name: agent.Runtime.Value}}
	if prompt := process.Prompt.Value; prompt != "" {
		named = append(named, runstore.Definition{Kind: "prompt", Name: prompt})
	}
	for _, guidance := range process.Guidance {
		named = append(named, runstore.Definition{Kind: "prompt", Name: guidance.Value})
	}
	if schema := process.Schema.Value; schema != "" {
		named = append(named, runstore.Definition{Kind: "schema", Name: schema})
	}
	for _, input := range process.Inputs {
		for _, form := range input.Forms {
			named = append(named, runstore.Definition{Kind: "brief", Name: form.Value})
		}
	}
	var err error
	planned.definitions, planned.definitionBytes, err = definitionsOf(docs, named)
	if err != nil {
		return plannedCall{}, err
	}
	return planned, nil
}

// withFallback is planned, the call of the step item of the workflow
// name, made again on fallback once its turns at capacity are spent
// (ADR-004, rule 8). The fallback's warnings are among the step's, which
// resolve gives at the step; the documents of both are the call's, so
// that a call is kept with every document that may have made it.
func withFallback(planned plannedCall, name string, item resolve.Item, fallback string, resolved resolve.Resolved, docs runDocuments, takes map[string]call.Inputs) (plannedCall, error) {
	again, err := plannedCallOf(name, item, fallback, resolved, docs, takes)
	if err != nil {
		return plannedCall{}, err
	}
	again.step.Warnings = nil
	var definitions []runstore.Definition
	for _, definition := range again.definitions {
		if !slices.ContainsFunc(planned.definitions, func(d runstore.Definition) bool {
			return d.Kind == definition.Kind && d.Name == definition.Name
		}) {
			definitions = append(definitions, definition)
		}
	}
	planned.definitions = orderedDefinitions(slices.Concat(planned.definitions, definitions))
	data := make(map[string][]byte, len(planned.definitionBytes)+len(again.definitionBytes))
	maps.Copy(data, planned.definitionBytes)
	maps.Copy(data, again.definitionBytes)
	planned.definitionBytes = data
	planned.fallback = &again
	return planned, nil
}

// notRun is what this slice does not run, each line once, in the order
// added.
type notRun struct {
	lines []notRunLine
}

type notRunLine struct {
	document resolve.Reference
	text     string
}

// add names what, of owner, as not run yet.
func (n *notRun) add(document resolve.Reference, owner, what string) {
	line := notRunLine{document: document, text: owner + ": " + what + " is not run yet"}
	if !slices.ContainsFunc(n.lines, func(existing notRunLine) bool { return existing == line }) {
		n.lines = append(n.lines, line)
	}
}

func (n notRun) texts() []string {
	texts := make([]string, 0, len(n.lines))
	for _, line := range n.lines {
		texts = append(texts, line.text)
	}
	return texts
}

func textsOfNotRun(lines []notRunLine) []string {
	return (notRun{lines: lines}).texts()
}

// input names what this slice does not run of the input of owner: a source
// a run does not plug in.
func (n *notRun) input(document resolve.Reference, owner string, input documents.Input) {
	if source := input.Source.Value; !pluggedIn(source) {
		n.add(document, owner, fmt.Sprintf("the input %q from the source %q", input.Name, source))
	}
}

// itemKind is what item is when it is not a step, "" for a step.
func itemKind(item resolve.Item) string {
	switch {
	case item.Parallel != nil:
		return "a parallel"
	case item.Branch != nil:
		return "a branch"
	case item.Repeat != nil:
		return "a repeat"
	case item.Workflow.Value != "":
		return "a workflow"
	}
	return ""
}

// formsOf is each brief form of names in core/inputs' words: the brief
// document of its name in docs, the snapshot resolve checked.
func formsOf(names []resolve.Name, docs runDocuments) ([]inputs.Form, error) {
	var forms []inputs.Form
	for _, name := range names {
		brief, problems := docs.Brief(name.Value)
		if len(problems) > 0 {
			return nil, documentProblems(problems)
		}
		form := inputs.Form{Name: name.Value}
		for _, field := range brief.Parts.Value {
			part := field.Value
			form.Parts = append(form.Parts, inputs.Part{Heading: part.Heading.Value, Required: part.Required.Value,
				Reads: part.Reads.Value, RefersToFile: part.Reference.Value == "file"})
		}
		forms = append(forms, form)
	}
	return forms, nil
}

// declaredParams is each param's default, by its name, of those that
// have one.
func declaredParams(params []documents.Field[documents.Param]) map[string]*string {
	defaults := map[string]*string{}
	for _, param := range params {
		if d := param.Value.Default; d.Given {
			defaults[param.Value.Name] = &d.Value
		}
	}
	return defaults
}

// documentProblems is the error of a document's problems, which resolve
// checked there were none of.
func documentProblems(problems []documents.Problem) error {
	texts := make([]string, 0, len(problems))
	for _, problem := range problems {
		texts = append(texts, problem.String())
	}
	return errors.New(strings.Join(texts, "; "))
}

// documentWorkflowBindings maps the checked document's executable bindings.
func documentWorkflowBindings(bindings []documents.Field[documents.Binding]) ([]workflow.Binding, error) {
	var mapped []workflow.Binding
	for _, field := range bindings {
		binding := field.Value
		value := workflow.Value{Text: binding.Value.Text}
		if read := binding.Value.From; read.Root != "" {
			reference, err := workflowReference(read)
			if err != nil {
				return nil, fmt.Errorf("%s: %w", problemLine(originOf(field.Origin), binding.Name), err)
			}
			value.Reads = &reference
		}
		mapped = append(mapped, workflow.Binding{Name: binding.Name, Value: value})
	}
	return mapped, nil
}

// workflowBindings maps the bindings of a standalone step, whose workflow
// resolve synthesizes without a document (ADR-013).
func workflowBindings(bindings []resolve.Binding) ([]workflow.Binding, error) {
	var mapped []workflow.Binding
	for _, binding := range bindings {
		value := workflow.Value{Text: binding.Text}
		if read := binding.From; read != nil {
			reference := workflow.Reference{Name: read.Name, Field: read.Field}
			switch read.Root {
			case resolve.RootParam:
				reference.Of = workflow.Params
			case resolve.RootInput:
				reference.Of = workflow.Inputs
			case resolve.RootOutputs:
				reference.Of = workflow.Outputs
			default:
				return nil, fmt.Errorf("%s reads the root %q, which a workflow of steps does not read",
					problemLine(read.Origin, binding.Name), read.Root)
			}
			value.Reads = &reference
		}
		mapped = append(mapped, workflow.Binding{Name: binding.Name, Value: value})
	}
	return mapped, nil
}

// inputsArguments is an input's arguments in core/inputs' words, by name.
func inputsArguments(bindings []resolve.Binding) (map[string]inputs.Value, error) {
	arguments := map[string]inputs.Value{}
	for _, binding := range bindings {
		value, err := inputsValue(binding)
		if err != nil {
			return nil, err
		}
		arguments[binding.Name] = value
	}
	return arguments, nil
}

// inputsValue is the value of binding in core/inputs' words: a text, or
// the param or the input it reads.
func inputsValue(binding resolve.Binding) (inputs.Value, error) {
	read := binding.From
	if read == nil {
		return inputs.Value{Text: binding.Text}, nil
	}
	switch read.Root {
	case resolve.RootParam:
		return inputs.Value{Reads: &inputs.Reference{Of: inputs.Params, Name: read.Name}}, nil
	case resolve.RootInput:
		return inputs.Value{Reads: &inputs.Reference{Of: inputs.Inputs, Name: read.Name}}, nil
	}
	return inputs.Value{}, fmt.Errorf("%s reads the root %q, which an input's argument or an environment does not read",
		problemLine(read.Origin, binding.Name), read.Root)
}

// declaredResolver is what a run asks of core/inputs.
type declaredResolver interface {
	Resolve(ctx context.Context, declared inputs.Declared, given map[string]string) (inputs.Resolved, error)
}

// boundary answers core/workflow's resolver from core/inputs: what the
// workflow declares of its params and inputs, resolved at its boundary over
// the params given, and told to records, in the order it declares them.
// Inputs refused are told nothing.
type boundary struct {
	inputs   declaredResolver
	declared inputs.Declared
	records  boundaryRecords
}

// boundaryRecords is told a workflow's inputs once they are resolved.
type boundaryRecords interface {
	Resolved(given []givenInput)
}

func (b boundary) Resolve(ctx context.Context, given map[string]string) (workflow.Boundary, error) {
	resolved, err := b.inputs.Resolve(ctx, b.declared, given)
	if err != nil {
		return workflow.Boundary{}, err
	}
	b.records.Resolved(givenInputs(b.declared.Inputs, resolved.Inputs))
	return workflow.Boundary{Params: resolved.Params, Inputs: values(resolved.Inputs)}, nil
}

// givenInput is an input as it was resolved: its name, its value and its
// identity.
type givenInput struct {
	name string
	inputs.Fixed
}

// givenInputs is each of declared as resolved gives it, in the order
// declared.
func givenInputs(declared []inputs.Input, resolved map[string]inputs.Fixed) []givenInput {
	var given []givenInput
	for _, input := range declared {
		given = append(given, givenInput{name: input.Name, Fixed: resolved[input.Name]})
	}
	return given
}

// values is each input's value, by its name.
func values(fixed map[string]inputs.Fixed) map[string]string {
	mapped := map[string]string{}
	for name, f := range fixed {
		mapped[name] = f.Value
	}
	return mapped
}

// turnCaller is what a step's call asks of core/call.
type turnCaller interface {
	Call(ctx context.Context, step call.Step, report func(call.Report)) call.Result
}

// admission is what a step's call asks of core/admit.
type admission interface {
	Make(ctx context.Context, request admit.Request, made func(ctx context.Context), told func(admit.Facts)) error
}

// stepCalls answers core/workflow's caller from core/inputs, core/admit
// and core/call (ADR-001, "Core"): a step's process's inputs and
// environment are resolved over the params its bindings give before its
// call starts, the inputs given in the order its process declares them,
// and one that cannot be resolved refuses the call, its turn not taken,
// its reason why. The call is then admitted, its pin the commit its
// git.revision input gives, and made through admit, which holds the
// worktree while it is made; a call not admitted is refused as well. Each
// call is made by the caller of its turn's contract, each tool call its
// turns report, each stale turn and each turn at capacity given on to
// core/workflow's report, and no other line, which the progress skips. A
// call whose turns at capacity are spent is made again, fresh, on its
// agent's fallback, where it has one, inside the same hold (ADR-004, rule
// 8): reported, kept as the fallback's call with the agent's as its
// primary, and warned of in its result. A call with no usage,
// as on bash, has every count of it unknown. Each call, refused or made,
// is told to records as it ends, with the inputs it was given, none for a
// call whose inputs were refused, and the worktree's facts admit told of
// it. A call is taken from the run reused, where it may be, and neither
// admitted nor made; a call of a session's chain never is. A call
// continuing a session is given it, continues the session's latest call
// in the run whose id is run, and is admitted only where the worktree is
// as that call left it (docs/run-implementation.md, "A binding continuing
// a session").
type stepCalls struct {
	inputs   declaredResolver
	admits   admission
	callers  map[string]turnCaller
	clock    clock
	calls    map[string]plannedCall
	records  callRecords
	daily    func() (*call.DailyBudget, []string)
	reuse    reusable
	run      string
	sessions sessionCalls
}

// sessionCalls is the latest call of each session in a run, by the
// session: its id and the worktree admit told at its end. The facts are
// the run's own, kept in memory: only the run's calls go on in its
// sessions meanwhile, the caller running no two writers in one worktree
// (ADR-004, rule 6). It is safe for concurrent use.
type sessionCalls struct {
	mu     sync.Mutex
	latest map[string]sessionCall
}

// sessionCall is a session's latest call: its id, agent and the worktree
// it left, together with its session cost, nil where unknown.
type sessionCall struct {
	id    string
	agent string
	left  admit.Facts
	cost  *float64
}

// of is the latest call of session, false for none.
func (s *sessionCalls) of(session string) (sessionCall, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	latest, ok := s.latest[session]
	return latest, ok
}

// went keeps made as the latest call of each of sessions, but "".
func (s *sessionCalls) went(made sessionCall, sessions ...string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.latest == nil {
		s.latest = map[string]sessionCall{}
	}
	for _, session := range sessions {
		if session != "" {
			s.latest[session] = made
		}
	}
}

// callRecords is told each step's call as it ends. It is told from many
// goroutines at once, one for each step of a parallel.
type callRecords interface {
	Called(ended endedCall)
}

func newStepCalls(inputs declaredResolver, admits admission, callers map[string]turnCaller, clock clock, calls map[string]plannedCall, records callRecords, daily func() (*call.DailyBudget, []string)) (*stepCalls, error) {
	switch {
	case inputs == nil:
		return nil, errors.New("step calls: no inputs")
	case admits == nil:
		return nil, errors.New("step calls: no admission")
	case clock == nil:
		return nil, errors.New("step calls: no clock")
	case records == nil:
		return nil, errors.New("step calls: no records")
	case daily == nil:
		return nil, errors.New("step calls: no daily budget reader")
	}
	for _, name := range slices.Sorted(maps.Keys(calls)) {
		if callers[calls[name].contract] == nil {
			return nil, fmt.Errorf("step calls: no caller for the step %q, of the contract %q", name, calls[name].contract)
		}
		if fallback := calls[name].fallback; fallback != nil && callers[fallback.contract] == nil {
			return nil, fmt.Errorf("step calls: no caller for the step %q's fallback, of the contract %q", name, fallback.contract)
		}
	}
	return &stepCalls{inputs: inputs, admits: admits, callers: maps.Clone(callers), clock: clock, calls: calls, records: records, daily: daily}, nil
}

func (s *stepCalls) Call(ctx context.Context, name, declared string, params map[string]string, session string, report func(workflow.Report)) workflow.Result {
	planned := s.calls[declared]
	ended := endedCall{step: name, process: planned.process, agent: planned.agent, continues: planned.continues,
		definitions: planned.definitions, definitionBytes: planned.definitionBytes, permissions: planned.permissions,
		environment: []runstore.Variable{}}
	ended.result = s.call(ctx, name, declared, params, session, report, &ended)
	s.records.Called(ended)
	return ended.result
}

// call is the result of the step name's call, continuing session, "" for
// none, the inputs it is given, the call it continues and its worktree's
// facts kept in ended where they are known. A call taken from the run
// reused reports Reused and keeps the call it took in ended; any other
// reports Started.
func (s *stepCalls) call(ctx context.Context, name, declared string, params map[string]string, session string, report func(workflow.Report), ended *endedCall) workflow.Result {
	planned, ok := s.calls[declared]
	if !ok {
		report(workflow.Report{Started: true})
		return s.refused(fmt.Sprintf("no step %q is planned", name), nil)
	}
	resolved, err := s.inputs.Resolve(ctx, planned.declared, params)
	if err != nil {
		report(workflow.Report{Started: true})
		return s.refused(err.Error(), planned.step.Warnings)
	}
	ended.inputs = givenInputs(planned.declared.Inputs, resolved.Inputs)
	for _, variable := range planned.declared.Environment {
		ended.environment = append(ended.environment, runstore.Variable{Name: variable.Name, Value: resolved.Environment[variable.Name]})
	}
	var earlier runstore.Call
	var taken bool
	if !planned.chained {
		earlier, taken, err = s.reuse.taken(ctx, *ended)
	}
	if taken {
		ended.taken = &earlier
		// A call taken that answered on the fallback is recorded on it, as
		// it was made, under this run's plans.
		if earlier.Primary != nil && planned.fallback != nil {
			ended.primary = &endedPrimary{agent: planned.agent, permissions: planned.permissions}
			ended.agent, ended.permissions = planned.fallback.agent, planned.fallback.permissions
		}
		report(workflow.Report{Reused: earlier.ID})
		return reusedResult(earlier)
	}
	report(workflow.Report{Started: true})
	if err != nil {
		return s.refused(err.Error(), planned.step.Warnings)
	}
	step := planned.step
	var warnings []string
	step.DailyBudget, warnings = s.daily()
	step.Warnings = append(slices.Clone(step.Warnings), warnings...)
	step.Environment = resolved.Environment
	for _, input := range ended.inputs {
		step.Inputs = append(step.Inputs, call.Named{Name: input.name, Text: input.Value})
	}
	request := planned.admission
	if pin := request.Pin; pin != nil {
		pinned := *pin
		if pinned.Source == revisionSourceName {
			pinned.Commit = resolved.Inputs[pinned.Input].Value
		}
		request.Pin = &pinned
	}
	if session != "" {
		latest, ok := s.sessions.of(session)
		if !ok {
			return s.refused(fmt.Sprintf("no call of the run went on in the session %q", session), planned.step.Warnings)
		}
		if latest.agent != planned.agent {
			return s.refused(fmt.Sprintf("the session %q ran on %q, not %q", session, latest.agent, planned.agent), planned.step.Warnings)
		}
		step.Session = session
		step.SessionCostBefore = latest.cost
		ended.continues = latest.id
		request.Left = &latest.left
	}
	relay := func(r call.Report) {
		switch {
		case r.Tool != nil:
			report(workflow.Report{Tool: &workflow.Tool{Name: r.Tool.Name, Input: r.Tool.Input}})
		case r.Stale != nil:
			report(workflow.Report{Stale: &workflow.Stale{What: r.Stale.What, Recovering: r.Stale.Recovering}})
		case r.Capacity != nil:
			report(workflow.Report{Capacity: &workflow.Capacity{Reason: r.Capacity.Reason, Retry: r.Capacity.Retry}})
		case r.Fallback:
			report(workflow.Report{Fallback: planned.fallback.agent})
		}
	}
	var called call.Result
	err = s.admits.Make(ctx, request, func(ctx context.Context) {
		caller := s.callers[planned.contract]
		if planned.fallback == nil {
			called = caller.Call(ctx, step, relay)
			return
		}
		again := planned.fallback.step
		again.Environment, again.Inputs, again.DailyBudget = step.Environment, step.Inputs, step.DailyBudget
		called = call.WithFallback(ctx, caller, step, call.Fallback{Maker: s.callers[planned.fallback.contract], Step: again}, s.clock.Now, relay)
	}, func(told admit.Facts) { ended.facts = told })
	if err != nil {
		return s.refused(err.Error(), step.Warnings)
	}
	ended.sessionCost, ended.costSource = called.SessionCost, called.CostSource
	sessions := []string{step.Session, called.Session}
	if primary := called.Primary; primary != nil {
		ended.primary = &endedPrimary{agent: planned.agent, permissions: planned.permissions, result: workflowResult(*primary),
			sessionCost: primary.SessionCost, costSource: primary.CostSource}
		ended.agent, ended.permissions = planned.fallback.agent, planned.fallback.permissions
		called.Warnings = append(slices.Clone(called.Warnings),
			fmt.Sprintf("the step %q was made again on the agent %q, the fallback of %q: %s", name, planned.fallback.agent, planned.agent, primary.Reason))
		s.sessions.went(sessionCall{id: callID(s.run, name), agent: planned.agent, left: ended.facts, cost: primary.SessionCost}, step.Session, primary.Session)
		sessions = []string{called.Session}
	}
	s.sessions.went(sessionCall{id: callID(s.run, name), agent: ended.agent, left: ended.facts, cost: called.SessionCost}, sessions...)
	return workflowResult(called)
}

// workflowResult is called in core/workflow's words, its usage every
// count unknown where it reported none.
func workflowResult(called call.Result) workflow.Result {
	var usage workflow.Usage
	if u := called.Usage; u != nil {
		usage = workflow.Usage(*u)
	}
	return workflow.Result{
		Status:   workflow.Status(called.Status),
		Class:    workflow.Class(called.Class),
		Output:   called.Output,
		Timing:   workflow.Timing{Started: called.Timing.Started, Ended: called.Timing.Ended, Duration: called.Timing.Duration},
		Cost:     called.Cost,
		Usage:    usage,
		Session:  called.Session,
		Reason:   called.Reason,
		Warnings: called.Warnings,
	}
}

// refused is a call refused before it started, for reason, given its
// plan's warnings.
func (s *stepCalls) refused(reason string, warnings []string) workflow.Result {
	now := s.clock.Now()
	return workflow.Result{Status: workflow.Failed, Class: workflow.Refused, Timing: workflow.Timing{Started: now, Ended: now},
		Reason: reason, Warnings: slices.Clone(warnings)}
}

// cliResult is a run's result in cli's words.
func cliResult(result workflow.Result) cli.Result {
	return cli.Result{
		Status:   cli.RunStatus(result.Status),
		Class:    cli.Class(result.Class),
		Output:   result.Output,
		Timing:   cli.Timing{Started: result.Timing.Started, Ended: result.Timing.Ended, Duration: result.Timing.Duration},
		Cost:     result.Cost,
		Usage:    cli.Usage(result.Usage),
		Sessions: result.Sessions,
		Reason:   result.Reason,
		Warnings: result.Warnings,
	}
}

// bashRuns is what a turn on bash asks of the bash wrapper.
type bashRuns interface {
	Run(ctx context.Context, turn bash.Turn) (bash.Ended, error)
}

// bashInputs is how core/call takes a call's inputs on bash, as its
// wrapper's facts say.
func bashInputs(inputs bash.Inputs) call.Inputs {
	switch inputs {
	case bash.InEnvironment:
		return call.InEnvironment
	case bash.InMessage:
		return call.InMessage
	}
	return 0
}

// bashTurns answers core/call's runtime from the bash wrapper: the turn's
// prompt is its script, and it reports no line. A program that could
// not start is core's ErrNotStarted. A stream is given by the fields a
// call's output has: an incomplete one as it was kept.
type bashTurns struct {
	bash bashRuns
}

func newBashTurns(bash bashRuns) (*bashTurns, error) {
	if bash == nil {
		return nil, errors.New("bash turns: no bash")
	}
	return &bashTurns{bash: bash}, nil
}

func (b *bashTurns) Turn(ctx context.Context, turn call.Turn, _ func(call.Report)) (call.Ended, error) {
	result, err := b.bash.Run(ctx, bash.Turn{Script: turn.Prompt, Dir: turn.Dir, Env: turn.Env})
	if errors.Is(err, bash.ErrNotStarted) {
		return call.Ended{}, fmt.Errorf("%w: %w", call.ErrNotStarted, err)
	}
	if err != nil {
		return call.Ended{}, err
	}
	stream := func(s bash.Stream) call.Stream {
		return call.Stream{Head: s.Head, Tail: s.Tail, Size: s.Size, Digest: s.Digest}
	}
	return call.Ended{Code: result.Code, Signal: result.Signal, Stdout: stream(result.Stdout), Stderr: stream(result.Stderr)}, nil
}

// claudeCodeRuns is what a turn on claude-code asks of the claude-code
// wrapper.
type claudeCodeRuns interface {
	Run(ctx context.Context, turn claudecode.Turn, report func(claudecode.Report)) (claudecode.Result, error)
}

// claudeCodeInputs is how core/call takes a call's inputs on claude-code,
// as its wrapper's facts say.
func claudeCodeInputs(inputs claudecode.Inputs) call.Inputs {
	switch inputs {
	case claudecode.InEnvironment:
		return call.InEnvironment
	case claudecode.InMessage:
		return call.InMessage
	}
	return 0
}

// claudeCodeTurns answers core/call's runtime from the claude-code wrapper:
// the turn's prompt is its message, each line it reports core's, the
// session it read core's, and its reply core's, its failure class by its
// name. A program that could not start is core's ErrNotStarted.
type claudeCodeTurns struct {
	claude claudeCodeRuns
}

func newClaudeCodeTurns(claude claudeCodeRuns) (*claudeCodeTurns, error) {
	if claude == nil {
		return nil, errors.New("claude-code turns: no claude-code")
	}
	return &claudeCodeTurns{claude: claude}, nil
}

func (c *claudeCodeTurns) Turn(ctx context.Context, turn call.Turn, report func(call.Report)) (call.Ended, error) {
	result, err := c.claude.Run(ctx, claudecode.Turn{Message: turn.Prompt, Dir: turn.Dir, Env: turn.Env, Instruction: turn.Instruction,
		Model: turn.Model, Effort: turn.Effort, Options: turn.Options, Schema: turn.Schema, Session: turn.Session, SessionCostBefore: turn.SessionCostBefore, Budget: turn.Budget},
		func(r claudecode.Report) {
			var tool *call.Tool
			if t := r.Tool; t != nil {
				tool = &call.Tool{Name: t.Name, Input: t.Input}
			}
			report(call.Report{Tool: tool, Result: r.Result})
		})
	if errors.Is(err, claudecode.ErrNotStarted) {
		return call.Ended{}, fmt.Errorf("%w: %w", call.ErrNotStarted, err)
	}
	if err != nil {
		return call.Ended{}, err
	}
	stream := func(s claudecode.Stream) call.Stream {
		return call.Stream{Head: s.Head, Tail: s.Tail, Size: s.Size, Digest: s.Digest}
	}
	ended := call.Ended{Code: result.Ended.Code, Signal: result.Ended.Signal, Stdout: stream(result.Ended.Stdout), Stderr: stream(result.Ended.Stderr),
		Session: result.Session}
	if r := result.Reply; r != nil {
		ended.Reply = &call.Reply{Text: r.Text, Output: r.Output, Session: r.Session, Cost: r.Cost, SessionCost: r.SessionCost, CostSource: r.CostSource,
			Usage:   call.Usage{Input: r.Usage.Input, Output: r.Usage.Output, CacheRead: r.Usage.CacheRead, CacheWrite: r.Usage.CacheWrite},
			Failure: call.Class(r.Failure), Reason: r.Reason}
	}
	return ended, nil
}

// codexRuns is what a turn on codex asks of the codex wrapper.
type codexRuns interface {
	Run(ctx context.Context, turn codex.Turn, report func(codex.Report)) (codex.Result, error)
}

// codexInputs is how core/call takes a call's inputs on codex, as its
// wrapper's facts say.
func codexInputs(inputs codex.Inputs) call.Inputs {
	switch inputs {
	case codex.InEnvironment:
		return call.InEnvironment
	case codex.InMessage:
		return call.InMessage
	}
	return 0
}

// codexTurns answers core/call's runtime from the codex wrapper: the turn's
// prompt is its message, each line it reports core's, the session it read
// core's, and its reply core's, its failure class by its name, its cost,
// session's cost, cost source and why its cost is unknown as the wrapper
// gives them. A turn is given no budget: codex takes none. A program that
// could not start is core's ErrNotStarted.
type codexTurns struct {
	codex codexRuns
}

func newCodexTurns(codex codexRuns) (*codexTurns, error) {
	if codex == nil {
		return nil, errors.New("codex turns: no codex")
	}
	return &codexTurns{codex: codex}, nil
}

func (c *codexTurns) Turn(ctx context.Context, turn call.Turn, report func(call.Report)) (call.Ended, error) {
	result, err := c.codex.Run(ctx, codex.Turn{Message: turn.Prompt, Dir: turn.Dir, Env: turn.Env, Instruction: turn.Instruction,
		Model: turn.Model, Effort: turn.Effort, Options: turn.Options, Schema: turn.Schema, Session: turn.Session},
		func(r codex.Report) {
			var tool *call.Tool
			if t := r.Tool; t != nil {
				tool = &call.Tool{Name: t.Name, Input: t.Input}
			}
			report(call.Report{Tool: tool, Result: r.Result})
		})
	if errors.Is(err, codex.ErrNotStarted) {
		return call.Ended{}, fmt.Errorf("%w: %w", call.ErrNotStarted, err)
	}
	if err != nil {
		return call.Ended{}, err
	}
	stream := func(s codex.Stream) call.Stream {
		return call.Stream{Head: s.Head, Tail: s.Tail, Size: s.Size, Digest: s.Digest}
	}
	ended := call.Ended{Code: result.Ended.Code, Signal: result.Ended.Signal, Stdout: stream(result.Ended.Stdout), Stderr: stream(result.Ended.Stderr),
		Session: result.Session}
	if r := result.Reply; r != nil {
		ended.Reply = &call.Reply{Text: r.Text, Output: r.Output, Session: r.Session,
			Cost: r.Cost, SessionCost: r.SessionCost, CostSource: r.CostSource, CostUnknown: r.CostUnknown,
			Usage:   call.Usage{Input: r.Usage.Input, Output: r.Usage.Output, CacheRead: r.Usage.CacheRead, Reasoning: r.Usage.Reasoning},
			Failure: call.Class(r.Failure), Reason: r.Reason}
	}
	return ended, nil
}

// programs is what the bash wrapper's supervisor asks of the supervisor.
type programs interface {
	Run(ctx context.Context, program supervisor.Program) (supervisor.Result, error)
}

// supervised answers the bash wrapper's supervisor from the supervisor. A
// program that could not start is bash's ErrNotStarted.
type supervised struct {
	programs programs
}

func newSupervised(programs programs) (*supervised, error) {
	if programs == nil {
		return nil, errors.New("supervised: no programs")
	}
	return &supervised{programs: programs}, nil
}

func (s *supervised) Run(ctx context.Context, program bash.Program) (bash.Ended, error) {
	result, err := s.programs.Run(ctx, supervisor.Program{Name: program.Name, Args: program.Args, Dir: program.Dir, Env: program.Env})
	if errors.Is(err, supervisor.ErrNotStarted) {
		return bash.Ended{}, fmt.Errorf("%w: %w", bash.ErrNotStarted, err)
	}
	if err != nil {
		return bash.Ended{}, err
	}
	stream := func(s supervisor.Stream) bash.Stream {
		return bash.Stream{Head: s.Head, Tail: s.Tail, Size: s.Size, Digest: s.Digest, Incomplete: s.Incomplete}
	}
	return bash.Ended{Code: result.Code, Signal: result.Signal, Stdout: stream(result.Stdout), Stderr: stream(result.Stderr)}, nil
}

// claudeCodePrograms is what the claude-code wrapper's supervisor asks of
// the supervisor.
type claudeCodePrograms interface {
	Run(ctx context.Context, program supervisor.Program) (supervisor.Result, error)
}

// claudeCodeSupervised answers the claude-code wrapper's supervisor from
// the supervisor: the program's stdin and its line function pass as they
// are. A program that could not start is claude-code's ErrNotStarted.
type claudeCodeSupervised struct {
	programs claudeCodePrograms
}

func newClaudeCodeSupervised(programs claudeCodePrograms) (*claudeCodeSupervised, error) {
	if programs == nil {
		return nil, errors.New("claude-code supervised: no programs")
	}
	return &claudeCodeSupervised{programs: programs}, nil
}

func (s *claudeCodeSupervised) Run(ctx context.Context, program claudecode.Program) (claudecode.Ended, error) {
	result, err := s.programs.Run(ctx, supervisor.Program{
		Name: program.Name, Args: program.Args, Dir: program.Dir, Env: program.Env, Stdin: program.Stdin, Line: program.Line,
	})
	if errors.Is(err, supervisor.ErrNotStarted) {
		return claudecode.Ended{}, fmt.Errorf("%w: %w", claudecode.ErrNotStarted, err)
	}
	if err != nil {
		return claudecode.Ended{}, err
	}
	stream := func(s supervisor.Stream) claudecode.Stream {
		return claudecode.Stream{Head: s.Head, Tail: s.Tail, Size: s.Size, Digest: s.Digest, Incomplete: s.Incomplete}
	}
	return claudecode.Ended{Code: result.Code, Signal: result.Signal, Stdout: stream(result.Stdout), Stderr: stream(result.Stderr)}, nil
}

// codexPrograms is what the codex wrapper's supervisor asks of the
// supervisor.
type codexPrograms interface {
	Run(ctx context.Context, program supervisor.Program) (supervisor.Result, error)
}

// codexSupervised answers the codex wrapper's supervisor from the
// supervisor: the program's stdin and its line function pass as they are.
// A program that could not start is codex's ErrNotStarted.
type codexSupervised struct {
	programs codexPrograms
}

func newCodexSupervised(programs codexPrograms) (*codexSupervised, error) {
	if programs == nil {
		return nil, errors.New("codex supervised: no programs")
	}
	return &codexSupervised{programs: programs}, nil
}

func (s *codexSupervised) Run(ctx context.Context, program codex.Program) (codex.Ended, error) {
	result, err := s.programs.Run(ctx, supervisor.Program{
		Name: program.Name, Args: program.Args, Dir: program.Dir, Env: program.Env, Stdin: program.Stdin, Line: program.Line,
	})
	if errors.Is(err, supervisor.ErrNotStarted) {
		return codex.Ended{}, fmt.Errorf("%w: %w", codex.ErrNotStarted, err)
	}
	if err != nil {
		return codex.Ended{}, err
	}
	stream := func(s supervisor.Stream) codex.Stream {
		return codex.Stream{Head: s.Head, Tail: s.Tail, Size: s.Size, Digest: s.Digest, Incomplete: s.Incomplete}
	}
	return codex.Ended{Code: result.Code, Signal: result.Signal, Stdout: stream(result.Stdout), Stderr: stream(result.Stderr)}, nil
}

// processGroups is what the supervisor's starter asks of gokit's process
// groups.
type processGroups interface {
	CheckExitObservation() error
	Start(group.Command) (group.Process, error)
}

// groupStarter answers the supervisor's starter from gokit's process
// groups: a program is started as gokit's command, its stdin and stderr
// the files the supervisor gives.
type groupStarter struct {
	groups processGroups
}

func newGroupStarter(groups processGroups) (*groupStarter, error) {
	if groups == nil {
		return nil, errors.New("group starter: no process groups")
	}
	return &groupStarter{groups: groups}, nil
}

func (g *groupStarter) CheckExitObservation() error { return g.groups.CheckExitObservation() }

func (g *groupStarter) Start(program supervisor.Program, stdin, stderr *os.File) (supervisor.Process, error) {
	process, err := g.groups.Start(group.Command{Name: program.Name, Args: program.Args, Dir: program.Dir, Env: program.Env, Stdin: stdin, Stderr: stderr})
	if err != nil {
		return nil, err
	}
	return groupProcess{process: process}, nil
}

// groupLeader is what the supervisor's process asks of a gokit process.
type groupLeader interface {
	Stdout() io.ReadCloser
	Signal(syscall.Signal) error
	Exited() error
	Wait() group.Exit
}

// groupProcess answers the supervisor's process from a gokit process: an
// exit with no code, ended by a signal, has the code 0.
type groupProcess struct {
	process groupLeader
}

func (p groupProcess) Stdout() io.ReadCloser              { return p.process.Stdout() }
func (p groupProcess) Signal(signal syscall.Signal) error { return p.process.Signal(signal) }
func (p groupProcess) Exited() error                      { return p.process.Exited() }

func (p groupProcess) Wait() supervisor.Exit {
	exit := p.process.Wait()
	ended := supervisor.Exit{Signal: exit.Signal}
	if exit.Code != nil {
		ended.Code = *exit.Code
	}
	return ended
}

func workflowReference(read documents.Reference) (workflow.Reference, error) {
	reference := workflow.Reference{Name: read.Name, Field: read.Field, Path: slices.Clone(read.Path)}
	switch read.Root {
	case documents.ReadsParam:
		reference.Of = workflow.Params
	case documents.ReadsInput:
		reference.Of = workflow.Inputs
	case documents.ReadsOutputs:
		reference.Of = workflow.Outputs
	case documents.ReadsState:
		reference.Of = workflow.State
	case documents.ReadsItem:
		reference.Of = workflow.QueryItem
	default:
		return workflow.Reference{}, fmt.Errorf("a workflow does not read the root %q", read.Root)
	}
	return reference, nil
}

// and, or and not read nothing; a leaf's read of a root a workflow does not
// read, a session, is refused before by notRunOf.
func workflowCondition(condition documents.Condition) workflow.Condition {
	reference, _ := workflowReference(condition.Reads.Value)
	mapped := workflow.Condition{Operator: condition.Operator, Reads: reference, Equals: condition.Equals.Value}
	for _, child := range condition.Of {
		mapped.Of = append(mapped.Of, workflowCondition(child.Value))
	}
	return mapped
}
