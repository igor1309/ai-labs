package app_test

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/adapters/fsdefs"
	"github.com/igor1309/ai-labs/agister/internal/contract"
	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

// Settings live in real temporary files; runtime turns and effects remain
// the existing harness's spies. Broken input is never put in live settings.
func settingsFiles(t *testing.T, docs map[definition.Kind]map[string]string) fsdefs.Store {
	t.Helper()
	store := fsdefs.Store{Dir: t.TempDir()}
	for kind, names := range docs {
		for name, text := range names {
			if _, written, err := store.Write(context.Background(), kind, name, []byte(text), ""); err != nil || !written {
				t.Fatalf("write %s/%s: %t, %v", kind, name, written, err)
			}
		}
	}
	return store
}

func unreadableFile(t *testing.T, path string) {
	t.Helper()
	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
	// A symlink loop is unreadable even when tests run as root.
	if err := os.Symlink(filepath.Base(path), path); err != nil {
		t.Fatal(err)
	}
}

func TestADR012Rule4IncludesUnparsedAndUnreadableNames(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		name string
		bad  func(*testing.T, fsdefs.Store)
	}{
		{"missing service", func(t *testing.T, s fsdefs.Store) { mustRemove(t, filepath.Join(s.Dir, "service.toml")) }},
		{"invalid service", func(t *testing.T, s fsdefs.Store) { mustWrite(t, filepath.Join(s.Dir, "service.toml"), "not toml =") }},
		{"unreadable service", func(t *testing.T, s fsdefs.Store) { unreadableFile(t, filepath.Join(s.Dir, "service.toml")) }},
		{"invalid file name", func(t *testing.T, s fsdefs.Store) {
			mustWrite(t, filepath.Join(s.Dir, "agents", "Not A Name.toml"), "x")
		}},
		{"unlistable directory", func(t *testing.T, s fsdefs.Store) {
			mustWrite(t, filepath.Join(s.Dir, "verifies"), "a file, not a directory")
		}},
		{"invalid workflow duplicate", func(t *testing.T, s fsdefs.Store) { mustWrite(t, filepath.Join(s.Dir, "workflows", "first.yaml"), "[") }},
		{"invalid process duplicate", func(t *testing.T, s fsdefs.Store) { mustWrite(t, filepath.Join(s.Dir, "processes", "w.yaml"), "[") }},
		{"unreadable process duplicate", func(t *testing.T, s fsdefs.Store) {
			path := filepath.Join(s.Dir, "processes", "w.yaml")
			mustWrite(t, path, nodeProcess("w", "Work."))
			unreadableFile(t, path)
		}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			h := newHarness()
			s := settingsFiles(t, workflowDocs())
			tc.bad(t, s)
			client := h.clientOn(s)
			report, err := client.Check(context.Background(), false)
			if err != nil {
				t.Fatal(err)
			}
			stops := false
			for _, problem := range report.Reach {
				stops = stops || problem.Stops
			}
			if !stops {
				t.Fatalf("no global refusal: %+v", report.Reach)
			}
			ctx := context.Background()
			refused := map[string]error{}
			_, refused["agent create"] = client.CreateAgent(ctx, contract.Agent{Name: "c", Runtime: "rt"}, false, nil)
			_, refused["agent list"] = client.ListAgents(ctx)
			_, refused["process list"] = client.ListProcesses(ctx)
			_, refused["process show"] = client.ShowProcess(ctx, "first", "")
			_, refused["workflow list"] = client.ListWorkflows(ctx)
			_, refused["workflow show"] = client.ShowWorkflow(ctx, "w")
			_, refused["run"] = client.Submit(ctx, contract.CallRequest{Process: "first", Cwd: "/repo"})
			_, refused["runs list"] = client.ListRuns(ctx)
			_, refused["runs show"] = client.Inspect(ctx, "earlier")
			refused["runs follow"] = client.Observe(ctx, "earlier", 0, func(contract.Event) error { return nil })
			for command, err := range refused {
				if !errors.As(err, new(*contract.SettingsError)) {
					t.Errorf("%s: %v", command, err)
				}
			}
			if len(h.recorder.created)+len(h.runner.calls()) != 0 {
				t.Fatal("a globally refused call started")
			}
		})
	}
}

func mustWrite(t *testing.T, path, text string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(text), 0600); err != nil {
		t.Fatal(err)
	}
}

func mustRemove(t *testing.T, path string) {
	t.Helper()
	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
}

func TestADR012UnreadableDocumentsHavePathsAndViews(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		kind definition.Kind
		name string
	}{
		{definition.KindProcess, "first"},
		{definition.KindWorkflow, "w"},
	} {
		t.Run(string(tc.kind), func(t *testing.T) {
			t.Parallel()
			h := newHarness()
			s := settingsFiles(t, workflowDocs())
			path := filepath.Join(s.Dir, string(tc.kind), tc.name+".yaml")
			unreadableFile(t, path)
			client := h.clientOn(s)
			ctx := context.Background()
			report, err := client.Check(ctx, false)
			if err != nil {
				t.Fatal(err)
			}
			found := false
			for _, d := range report.Definitions {
				if d.Kind == string(tc.kind) && d.Name == tc.name {
					found = d.Invalid && d.Path == path && len(d.Uses) == 0
				}
			}
			if !found {
				t.Fatalf("unreadable document not attributed: %+v", report.Definitions)
			}
			var name, refusal string
			if tc.kind == definition.KindProcess {
				view, err := client.ShowProcess(ctx, tc.name, "")
				if err != nil {
					t.Fatal(err)
				}
				name, refusal = view.Name, view.Refusal
			} else {
				view, err := client.ShowWorkflow(ctx, tc.name)
				if err != nil {
					t.Fatal(err)
				}
				name, refusal = view.Name, view.Refusal
			}
			if name != tc.name || !strings.Contains(refusal, "("+path+"): ") || !strings.Contains(refusal, "too many levels") {
				t.Fatalf("view %s: %s", name, refusal)
			}
			record := h.submit(t, client, contract.CallRequest{Process: tc.name})
			if class(record) != run.ClassRefused || message(record) != refusal || len(h.runner.calls()) != 0 {
				t.Fatalf("record: %+v", record.Result)
			}
			if _, err := client.ListRuns(ctx); err != nil {
				t.Fatal(err)
			}
			if tc.kind == definition.KindProcess {
				view, err := client.ShowWorkflow(ctx, "w")
				if err != nil || !strings.Contains(view.Refusal, "workflow w uses process first ("+path+")") {
					t.Fatalf("dependent workflow view: %+v, %v", view, err)
				}
			}
		})
	}
}

func TestADR012WorkflowPreflightsRuntimeProblems(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		name    string
		node    string
		change  func(*harness, map[definition.Kind]map[string]string)
		problem string
		// The whole refusal of a problem of the runtime mapping, after its
		// chain and path; empty where only problem is checked.
		ofMapping string
	}{
		{"adapter contract", "second", func(h *harness, docs map[definition.Kind]map[string]string) {
			docs[definition.KindRuntime]["bad"] = strings.Replace(docs[definition.KindRuntime]["bad"], "contract: spy/1", "contract: spy/2", 1)
		}, "describes adapter contract spy/2", "runtime mapping bad describes adapter contract spy/2, but the adapter implements spy/1"},
		{"actual runtime version", "joiner", func(h *harness, docs map[definition.Kind]map[string]string) {
			docs[definition.KindRuntime]["bad"] = strings.ReplaceAll(docs[definition.KindRuntime]["bad"], `verified: ["1."]`, `verified: ["2."]`)
		}, "verifies no primitive for spy version 1.2.3", "runtime mapping bad verifies no primitive for spy version 1.2.3"},
		{"runtime cannot repair", "second", func(h *harness, docs map[definition.Kind]map[string]string) {
			docs[definition.KindService]["service"] += "max_verify_attempts = 3\n"
			docs[definition.KindProcess]["second"] = namingVerification(docs[definition.KindProcess]["second"] + "session: resumable\n")
			docs[definition.KindVerify] = map[string]string{"repo": verification}
			h.runner.identity.Resume = false
		}, "runtime bad cannot resume sessions", ""},
		{"missing verification with broken runtime", "second", func(h *harness, docs map[definition.Kind]map[string]string) {
			docs[definition.KindRuntime]["bad"] = strings.Replace(docs[definition.KindRuntime]["bad"], "contract: spy/1", "contract: spy/2", 1)
			docs[definition.KindProcess]["second"] = namingVerification(docs[definition.KindProcess]["second"])
		}, "describes adapter contract spy/2", ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			h := newHarness()
			docs := withBrokenMapping(workflowDocs())
			docs[definition.KindRuntime]["bad"] = strings.Replace(docs[definition.KindRuntime]["bad"], "adapter: nowhere", "adapter: spy", 1)
			docs[definition.KindWorkflow]["w"] = boundTo(workflowDoc, map[string]string{"second": "two", "joiner": "merge"}[tc.node], tc.node, "b")
			tc.change(h, docs)
			s := settingsFiles(t, docs)
			client := h.clientOn(s)
			view, err := client.ShowWorkflow(context.Background(), "w")
			if err != nil || !strings.Contains(view.Refusal, "workflow w uses process "+tc.node) || !strings.Contains(view.Refusal, tc.problem) || !strings.Contains(view.Refusal, s.Dir) {
				t.Fatalf("view: %+v, %v", view, err)
			}
			// The refusal names the mapping's document, by the chain that
			// reaches it.
			if want := "workflow w uses process " + tc.node + ", which uses agent b, which uses runtime mapping bad (" + filepath.Join(s.Dir, "runtimes", "bad.yaml") + "): " + tc.ofMapping; tc.ofMapping != "" && view.Refusal != want {
				t.Fatalf("view refusal %q, want %q", view.Refusal, want)
			}
			record := h.submit(t, client, contract.CallRequest{Process: "w", Params: map[string]string{"candidate": "HEAD"}})
			if class(record) != run.ClassRefused || message(record) != view.Refusal {
				t.Fatalf("workflow result: %+v", record.Result)
			}
			if record.Workflow != nil || len(h.recorder.created) != 1 || len(h.runner.calls())+len(h.inputs.specs) != 0 {
				t.Fatal("a node or workspace started before the workflow refusal")
			}
		})
	}
}

// A problem of a process on one agent's runtime is a problem of the
// workflow whose node binds the two (ADR-030 rule 8), named with the
// workflow's document; the same process bound to a sound agent runs.
//
// Until ADR-030 rule 2 this was of --agent, which selected agent b in
// place of the agent process p named, and it had a second mode, "repair
// session": agent b fresh-only where agent a was resumable. A process
// names no agent and an agent holds no session now (rules 1 and 2), so the
// binding is a workflow's and the session mode has nothing to differ by:
// verify_test.go has a fresh-only process's repairs refused.
func TestADR012ABindingsProblemIsResolvedAndAttributed(t *testing.T) {
	t.Parallel()
	h := newHarness()
	docs := withBrokenMapping(settingsDocs())
	docs[definition.KindRuntime]["bad"] = strings.Replace(docs[definition.KindRuntime]["bad"], "adapter: nowhere", "adapter: spy", 1)
	docs[definition.KindProcess]["q"] = strings.Replace(docs[definition.KindProcess]["q"], "repository.diff]}", "repository.diff], require: [repository.read]}", 1)
	docs[definition.KindRuntime]["bad"] = strings.Replace(docs[definition.KindRuntime]["bad"], "grants: [repository.read]", "grants: [repository.search]", 1)
	const problem = "required permissions would be withheld"
	// p is the same process; p_a binds it to the sound agent and p_b to
	// the bad one, as q_b binds q.
	docs[definition.KindProcess]["p"] = strings.Replace(docs[definition.KindProcess]["q"], "name: q", "name: p", 1)
	docs[definition.KindWorkflow]["p_b"] = callOf("p_b", "p", "b")
	docs[definition.KindWorkflow]["q_a"] = callOf("q_a", "q", "a")
	s := settingsFiles(t, docs)
	client := h.clientOn(s)
	for workflow, process := range map[string]string{"q_b": "q", "p_b": "p"} {
		record := h.submit(t, client, contract.CallRequest{Process: workflow})
		if class(record) != run.ClassRefused || !strings.Contains(message(record), "workflow "+workflow+" ("+filepath.Join(s.Dir, "workflows", workflow+".yaml")+"): call node work: process "+process+": cannot run on agent b's runtime bad: ") || !strings.Contains(message(record), problem) {
			t.Fatalf("%s: %s", workflow, message(record))
		}
	}
	if len(h.runner.calls()) != 0 {
		t.Fatal("a refused agent ran")
	}
	for _, workflow := range []string{"q_a", "p_a"} {
		if record := h.submit(t, client, contract.CallRequest{Process: workflow}); class(record) != "" || record.Agent != "a" {
			t.Fatalf("sound binding %s: %+v", workflow, record.Result)
		}
	}
}

func TestADR012MissingVerificationStillRefusesAtItsNode(t *testing.T) {
	t.Parallel()
	h := newHarness()
	docs := workflowDocs()
	docs[definition.KindProcess]["second"] = namingVerification(docs[definition.KindProcess]["second"])
	s := settingsFiles(t, docs)
	project := fsdefs.Store{Dir: t.TempDir()}
	client := h.clientOn(fsdefs.Layered{Home: s, Repository: &project})
	ctx := context.Background()
	view, err := client.ShowWorkflow(ctx, "w")
	if err != nil || view.Refusal != "" || view.FanOut[1].Process.Refusal == "" {
		t.Fatalf("workflow with missing verification: %+v, %v", view, err)
	}
	if report, err := client.Check(ctx, false); err != nil || len(report.Problems) != 0 || len(report.Warnings) != 1 {
		t.Fatalf("check: %+v, %v", report, err)
	}
	h.recorder.finished = make(chan run.Record, 4)
	if _, err := client.Submit(ctx, contract.CallRequest{Process: "w", Cwd: "/repo", Params: map[string]string{"candidate": "HEAD"}}); err != nil {
		t.Fatal(err)
	}
	finished := map[string]run.Record{}
	for len(finished) < 4 {
		record := h.recorder.wait(t)
		finished[record.Process] = record
	}
	second := finished["second"]
	if class(second) != run.ClassRefused || !strings.Contains(message(second), "process second names verify:repo") ||
		!strings.Contains(message(second), filepath.Join(s.Dir, "verifies", "repo.yaml")) ||
		!strings.Contains(message(second), filepath.Join(project.Dir, "verifies", "repo.yaml")) {
		t.Fatalf("missing verification at second node: %+v", second.Result)
	}
	if finished["w"].Workflow == nil || finished["first"].Result.Status != run.Completed || finished["joiner"].Result.Status != run.Completed || len(h.runner.calls()) != 2 {
		t.Fatalf("workflow did not run its sound nodes: %+v", finished)
	}
}

func TestADR012EveryDocumentKindRefusesOnlyItsDependents(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		kind definition.Kind
		name string
	}{
		{definition.KindAgent, "b"},
		{definition.KindRuntime, "bad"},
		{definition.KindSchema, "broken"},
		{definition.KindVerify, "repo"},
		{definition.KindProcess, "second"},
		{definition.KindWorkflow, "w"},
	} {
		t.Run(string(tc.kind), func(t *testing.T) {
			t.Parallel()
			h := newHarness()
			docs := workflowDocs()
			switch tc.kind {
			case definition.KindAgent, definition.KindRuntime:
				docs = withBrokenMapping(docs)
				docs[definition.KindRuntime]["bad"] = strings.Replace(docs[definition.KindRuntime]["bad"], "adapter: nowhere", "adapter: spy", 1)
				docs[definition.KindWorkflow]["w"] = boundTo(workflowDoc, "two", "second", "b")
			case definition.KindSchema:
				docs[definition.KindProcess]["second"] = strings.Replace(docs[definition.KindProcess]["second"], "schema: s", "schema: broken", 1)
			case definition.KindVerify:
				docs[definition.KindProcess]["second"] = namingVerification(docs[definition.KindProcess]["second"])
			}
			if docs[tc.kind] == nil {
				docs[tc.kind] = map[string]string{}
			}
			docs[tc.kind][tc.name] = "["
			// Nothing but a workflow's node runs a process (ADR-030 rule 5).
			docs[definition.KindWorkflow]["first_a"] = callOf("first_a", "first", "a")
			if tc.kind == definition.KindSchema {
				// The validator seam rejects this document, while accepting
				// the unrelated process's schema.
				h.validator.compileFor = func(data []byte) error {
					if string(data) == "[" {
						return errors.New("invalid JSON schema")
					}
					return nil
				}
			}
			s := settingsFiles(t, docs)
			client := h.clientOn(s)
			report, err := client.Check(context.Background(), false)
			if err != nil {
				t.Fatal(err)
			}
			found := false
			for _, reach := range report.Reach {
				if reach.Subject != nil && *reach.Subject == (contract.DefinitionRef{Kind: string(tc.kind), Name: tc.name}) {
					found = true
					want, workflows := []string{"second"}, []string{"w"}
					if tc.kind == definition.KindWorkflow {
						want = nil
					} else if tc.kind == definition.KindAgent || tc.kind == definition.KindRuntime {
						// Processes q and second were refused here while
						// each named agent b. No process names an agent
						// (ADR-030 rule 2): the workflows that bind b are.
						want, workflows = nil, []string{"q_b", "w"}
					}
					if reach.Stops || !reflect.DeepEqual(reach.Processes, want) || !reflect.DeepEqual(reach.Workflows, workflows) {
						t.Fatalf("reach: %+v", reach)
					}
				}
			}
			if !found {
				t.Fatalf("no attributed problem: %+v", report.Reach)
			}
			workflow := h.submit(t, client, contract.CallRequest{Process: "w"})
			if class(workflow) != run.ClassRefused || len(h.runner.calls()) != 0 || len(h.recorder.created) != 1 || !strings.Contains(message(workflow), s.Dir) {
				t.Fatalf("dependent workflow: %+v", workflow.Result)
			}
			if record := h.submit(t, client, contract.CallRequest{Process: "first_a"}); class(record) != "" || len(h.runner.calls()) != 1 {
				t.Fatalf("unrelated process: %+v", record.Result)
			}
		})
	}
}

func TestADR012AgentListingsShowBrokenDependencies(t *testing.T) {
	t.Parallel()
	h := newHarness()
	s := settingsFiles(t, withBrokenMapping(settingsDocs()))
	agents, err := h.clientOn(s).ListAgents(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	refused := map[string]bool{}
	for _, agent := range agents {
		refused[agent.Name] = agent.Refusal != ""
		if agent.Name == "b" && !strings.Contains(agent.Refusal, "agent b uses runtime mapping bad ("+filepath.Join(s.Dir, "runtimes", "bad.yaml")+")") {
			t.Fatalf("agent b: %+v", agent)
		}
	}
	if !reflect.DeepEqual(refused, map[string]bool{"a": false, "b": true}) {
		t.Fatalf("refused agents: %v", refused)
	}
}

// ADR-025: no call reads the workspace settings, so settings that do not
// parse refuse nothing: check warns that they are obsolete and ignored,
// and the calls and workflows they once refused run.
func TestInvalidWorkspaceSettingsRefuseNothing(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	h := newHarness()
	docs := workflowDocs()
	docs[definition.KindWorkspace] = map[string]string{"workspace": "schema: agister.workspace/v1alpha1\nsetup: {command: ./link-config.sh}\n"}
	docs[definition.KindWorkflow]["first_a"] = callOf("first_a", "first", "a")
	s := settingsFiles(t, docs)
	path := filepath.Join(s.Dir, "workspace.yaml")
	client := h.clientOn(s)

	report, err := client.Check(ctx, false)
	if err != nil {
		t.Fatal(err)
	}
	if len(report.Problems) != 0 || !contains(report.Warnings, "workspace settings "+path+": "+definition.ObsoleteWorkspace) {
		t.Fatalf("problems %v, warnings %q", messages(report.Problems), report.Warnings)
	}
	processes, err := client.ListProcesses(ctx)
	if err != nil {
		t.Fatal(err)
	}
	for _, process := range processes {
		if process.Refusal != "" {
			t.Fatalf("process %s refused: %s", process.Name, process.Refusal)
		}
	}
	if record := h.submit(t, client, contract.CallRequest{Process: "first_a"}); class(record) != "" {
		t.Fatalf("call of first: %s %q", class(record), message(record))
	}
}

// Workspace settings that cannot be read are the workspace document's
// problem, not one that stops every command, and no call reads them
// (ADR-025): runs list, and calls with a checkout and without one run.
func TestUnreadableWorkspaceSettingsRefuseNothing(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	h := newHarness()
	docs := workflowDocs()
	docs[definition.KindProcess]["first"] = inTheRepository(docs[definition.KindProcess]["first"])
	docs[definition.KindWorkflow]["first_a"] = callOf("first_a", "first", "a")
	docs[definition.KindWorkflow]["second_a"] = callOf("second_a", "second", "a")
	s := settingsFiles(t, docs)
	path := filepath.Join(s.Dir, "workspace.yaml")
	// A symlink to itself: it exists, and reading it fails.
	if err := os.Symlink("workspace.yaml", path); err != nil {
		t.Fatal(err)
	}
	client := h.clientOn(s)

	report, err := client.Check(ctx, false)
	if err != nil {
		t.Fatal(err)
	}
	for _, item := range report.Reach {
		if item.Stops || len(item.Processes) != 0 || len(item.Workflows) != 0 {
			t.Fatalf("a problem refuses something: %+v", item)
		}
	}
	if runs, err := client.ListRuns(ctx); err != nil || len(runs) != 1 {
		t.Fatalf("runs = %v, %v", runs, err)
	}
	for i, workflow := range []string{"first_a", "second_a"} {
		if record := h.submit(t, client, contract.CallRequest{Process: workflow}); class(record) != "" || len(h.runner.calls()) != i+1 {
			t.Fatalf("call of %s: %s %s", workflow, class(record), message(record))
		}
	}
}

// inTheRepository is the node process doc without its checkout, with the
// joiner's limits, which work in the repository.
func inTheRepository(doc string) string {
	doc = strings.Replace(doc, "workspace:\n  revision: candidate_revision\n", "", 1)
	return strings.Replace(doc, "timeout: 20m\ntools: {allow: [repository.read, repository.search, repository.diff]}\n", "timeout: 10m\ntools: {allow: [repository.read]}\n", 1)
}
