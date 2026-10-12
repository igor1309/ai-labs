package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io/fs"
	"maps"
	"os"
	"path/filepath"
	"reflect"
	"regexp"
	"slices"
	"sort"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/BurntSushi/toml"
	"github.com/igor1309/ai-labs/agister/internal/adapters/git/gittest"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/runtimetest"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/runtimetest/fakecodex"
	"github.com/igor1309/ai-labs/agister/internal/adapters/schema"
	"github.com/igor1309/ai-labs/agister/internal/cli"
	"github.com/igor1309/ai-labs/agister/internal/contract"
	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
	domain "github.com/igor1309/ai-labs/agister/internal/domain/run"
	"github.com/igor1309/ai-labs/gokit/fakeproc"
	"github.com/igor1309/ai-labs/gokit/supervisor/supervisortest"
	"gopkg.in/yaml.v3"
)

// repoParams are the values given to a process param that has no default,
// by param name; any other such param gets fallbackParam. Each is a real
// file of the repository, so a param read as a file resolves; a brief and
// a goal are a goal of the repository, which has the goal form.
var repoParams = map[string]string{
	"prompt":   "agister/home/prompts/code-review-architecture.md",
	"brief":    repoGoal,
	"goal":     repoGoal,
	"question": "agister/home/prompts/code-review-tests.md",
}

// homeFolder is the source of home's settings in this repository
// (ADR-027 rule 1), relative to its root.
var homeFolder = filepath.Join("agister", "home")

// repoGoal is a goal of the repository that has the goal form.
const repoGoal = "agister/testdata/briefs/lab-119-goal.md"

const fallbackParam = "AGENTS.md"

// testTimeouts are the test's own timeouts for a run, by the workflow it
// names, in place of its process's own: the advisor's process allows 20
// minutes, which advisor_codex calls, and implement's 45, which
// implement_pi and implement_pi_glm call on Pi.
var testTimeouts = map[string]string{
	"advisor_codex":    "1m",
	"implement_pi":     "1m",
	"implement_pi_glm": "1m",
}

// implementers are home's implement processes. Each names verify:repo, a
// slot this repository fills only in its projects' layers, so each is
// launched in a project; at the root it is refused (ADR-028 Migration step
// 4).
var implementers = []string{"implement"}

// callAgents are what each of home's workflows of one call (ADR-030 rule
// 6) runs its call on, by workflow: implement, on each agent in use, in
// the resumable session implement says it has (ADR-030 Migration step 3).
// implement_codex, implement_pi and implement_pi_glm bind the agents the
// processes of their names ran on, which checked no brief's form.
var callAgents = func() map[string]agentProfile {
	on := func(agent string) agentProfile {
		profile := homeAgents[agent]
		profile.session = definition.SessionResumable
		return profile
	}
	return map[string]agentProfile{
		"implement_opus":   on("claude-opus"),
		"implement_sonnet": on("claude-sonnet"),
		"implement_codex":  on("codex-sol-61"),
		"implement_pi":     on("pi-m3"),
		"implement_pi_glm": on("pi-glm-53"),
	}
}()

// calledProcess is the process a run called: a workflow of one call's, or
// the run's own.
func calledProcess(record map[string]any) string {
	if call, ok := record["call"].(map[string]any); ok {
		process, _ := call["process"].(string)
		return process
	}
	process, _ := record["process"].(string)
	return process
}

// projects are this repository's project directories, relative to its
// root, each with a layer that fills verify:repo with its own check
// (ADR-028 rule 1).
var projects = []string{"agister", "warder"}

// launchDir is the directory, relative to the repository's root, a test
// launches process name in when the process is not its claim: an
// implementer in agister/, as a change to Agister is launched, and any
// other process at the root.
func launchDir(name string) string {
	if slices.Contains(implementers, name) {
		return "agister"
	}
	return "."
}

// agentProfile is what a call's record says of the agent it ran on: the
// agent, its runtime mapping, the model and effort the call asked of it and
// the session mode the call ran under.
type agentProfile struct{ agent, runtime, model, effort, session string }

// homeAgents are home's five agents, by name, each with its runtime
// mapping, model and effort: a call's profile, but for its session mode.
var homeAgents = map[string]agentProfile{
	"claude-opus":   {agent: "claude-opus", runtime: "claude-code", model: "opus", effort: "high"},
	"claude-sonnet": {agent: "claude-sonnet", runtime: "claude-code", model: "sonnet", effort: "high"},
	"codex-sol-61":  {agent: "codex-sol-61", runtime: "codex", model: "gpt-6.1-sol", effort: "high"},
	"pi-glm-53":     {agent: "pi-glm-53", runtime: "pi", model: "opencode-go/glm-5.3", effort: "high"},
	"pi-m3":         {agent: "pi-m3", runtime: "pi", model: "opencode-go/minimax-m3", effort: "high"},
}

// processAgents is what each of home's processes runs on, by process, a
// base left out, where a node of home's workflows binds it and where a test
// runs it alone (runsAlone): one of home's five agents (ADR-030 Migration
// step 3), with the runtime, model and effort the process ran on when home
// had seven and its process named it, and the session mode its call ran
// under then, an implementer's resumable and any other's fresh-only.
var processAgents = func() map[string]agentProfile {
	const fresh, resumable = definition.SessionFresh, definition.SessionResumable
	opus, codex := homeAgents["claude-opus"], homeAgents["codex-sol-61"]
	in := func(session string, profile agentProfile) agentProfile {
		profile.session = session
		return profile
	}
	return map[string]agentProfile{
		"implement":           in(resumable, opus),
		"adr_review_codex":    in(fresh, codex),
		"adversarial_review":  in(fresh, codex),
		"advisor":             in(fresh, codex),
		"architecture_review": in(fresh, codex),
		"clarity_review":      in(fresh, codex),
		"intent_review":       in(fresh, codex),
		"tests_review":        in(fresh, codex),
		"review_judge":        in(fresh, opus),
	}
}()

// staleLimits are the effective staleness limits recorded for each process's
// run, by process, as its process or its policy sets them; a process not
// listed records none.
var staleLimits = func() map[string]domain.StaleLimits {
	implement := domain.StaleLimits{NoEvent: 21 * time.Minute, ToolCommand: 15 * time.Minute, RepeatedToolCalls: 5}
	review := domain.StaleLimits{NoEvent: 10 * time.Minute, ToolCommand: 8 * time.Minute, RepeatedToolCalls: 5}
	return map[string]domain.StaleLimits{
		"implement":           implement,
		"adr_review_codex":    review,
		"adversarial_review":  review,
		"advisor":             review,
		"architecture_review": review,
		"clarity_review":      review,
		"intent_review":       review,
		"tests_review":        review,
		"review_judge":        {NoEvent: 3 * time.Minute},
	}
}()

// requiredPermissions are the permissions each of home's processes says it
// cannot work without (tools.require, ADR-030 rule 8), by process, a base
// left out, as its run records them: implement reads the repository, writes
// its change and runs its tests, a review reads the repository and the
// change's diff,
// the advisor reads the repository, and the judge, which rules on the
// reviews it is given, needs none.
var requiredPermissions = func() map[string][]string {
	review := []string{"repository.read", "repository.diff"}
	return map[string][]string{
		"implement":           {"repository.read", "repository.write", "process.execute"},
		"adr_review_codex":    review,
		"adversarial_review":  review,
		"advisor":             {"repository.read"},
		"architecture_review": review,
		"clarity_review":      review,
		"intent_review":       review,
		"tests_review":        review,
		"review_judge":        nil,
	}
}()

// verifyFixture is the verification command every process that declares
// verify, inline or by name, runs in the test's repository instead of its own: it passes in
// the worktree, at the candidate (ADR-025). The real command would run this module's own
// tests, this one included.
const verifyFixture = "grep -qx two change.txt"

// verifyFixtureTimeout is the timeout verifyFixture runs with in place of
// the process's own.
const verifyFixtureTimeout = "30s"

// Every process and workflow of home's settings folder (homeFolder) runs,
// installed as home and composed under this repository's own settings
// (<repository root>/.agister) as the CLI composes them, on the fake
// runtimes, and completes with output its schema accepts; an implementer
// is launched in agister/ and composed under that project's layer as well
// (launchDir). A process runs only as a node of a workflow, which binds it
// to its agent (ADR-030 rules 5 and 7): it is run through home's
// workflows, and each process that is not a base must be bound by a node
// of one, and one that takes a workflow's collection must be one's join. A
// base is not work: it runs through each process that extends it, laid
// over it (homeBases). A process that names a missing schema, a schema that
// does not compile, an unknown input source or a prompt path that does not
// resolve from the repository root fails it, as does a node that binds a
// missing agent. Processes are read from the directory, so a new one is
// tested without listing it here, but for its agent: each process that is
// not a base is one of processAgents, and each of those exists. Each node's
// run, a join's included, records its agent as processAgents has it
// (recordsAgent), its staleLimits and its requiredPermissions, which list
// every process that is not a base, and output its schema accepts. A
// workflow of one call is one run, launched where its process is, which
// names the workflow and its call, and records the agent callAgents lists
// for it, or, for one it does not list, which binds its process to the
// agent processAgents lists, that agent; the limits its process has, the
// guidance repositoryGuidance names for that process, home's implement
// prompt where it calls an implementer and, where that process declares
// verify, the verification its run passed (verifiedOnce), on writableCodex.
//
// The test works in a repository of its own whose top-level entries link to
// this repository's working tree (settings and prompts as they are, edits
// included), with a base and a candidate commit of its own: revisions, diffs
// and checkouts are deterministic, and this repository's git state is never
// read or written. Each base and candidate param is pointed at them. There,
// a process that declares verify, inline or by name, runs verifyFixture
// instead of its command and completes with one passing verification
// attempt.
func TestRepositoryProcessesRunOnFakeRuntimes(t *testing.T) {
	t.Parallel()
	root, repo, home := onFakeRuntimes(t)
	writableCodex(t, home)
	entries, err := os.ReadDir(filepath.Join(root, homeFolder, "processes"))
	if err != nil {
		t.Fatal(err)
	}

	var names []string
	for _, entry := range entries {
		if !entry.IsDir() && filepath.Ext(entry.Name()) == ".yaml" {
			names = append(names, strings.TrimSuffix(entry.Name(), ".yaml"))
		}
	}
	sort.Strings(names)
	if len(names) == 0 {
		t.Fatal("the home folder has no processes")
	}
	for name := range processAgents {
		if !slices.Contains(names, name) {
			t.Errorf("process %s, which has an agent listed, is not among the home folder's processes", name)
		}
	}
	for _, name := range implementers {
		if !slices.Contains(names, name) {
			t.Fatalf("home has no implementer %s", name)
		}
	}
	implementPrompt, err := os.ReadFile(filepath.Join(root, homeFolder, "prompts", "implement.md"))
	if err != nil {
		t.Fatal(err)
	}
	// Processes that take a workflow's collection, to be run as a join.
	joins := map[string]bool{}
	bases := homeBases(t, root)
	for _, name := range names {
		if bases[name] {
			continue
		}
		if _, listed := processAgents[name]; !listed {
			t.Errorf("process %s of the home folder has no agent listed in processAgents", name)
		}
		if len(parseProcess(t, root, name).Collects()) > 0 {
			joins[name] = true
		}
	}

	// Every workflow runs its nodes and completes with its join's output, or
	// its call's.
	workflows, err := filepath.Glob(filepath.Join(root, homeFolder, "workflows", "*.yaml"))
	if err != nil {
		t.Fatal(err)
	}
	bound, joined := map[string]bool{}, map[string]bool{}
	for _, path := range workflows {
		name := strings.TrimSuffix(filepath.Base(path), ".yaml")
		workflow := parseWorkflow(t, root, name)
		for _, node := range workflow.Nodes() {
			bound[node.Process] = true
		}
		if call := workflow.Call; call != nil {
			if _, listed := callAgents[name]; !listed && processAgents[call.Process].agent != call.Agent {
				t.Errorf("workflow %s of the home folder, of one call, has no agent listed in callAgents, and binds %s to %s, not to the agent processAgents lists for it",
					name, call.Process, call.Agent)
			}
			t.Run("workflow "+name, func(t *testing.T) {
				launch := launchDir(call.Process)
				process := parseProcess(t, root, call.Process)
				args := append([]string{"run", name}, paramArgs(t, launch, process.Params)...)
				if timeout := testTimeouts[name]; timeout != "" {
					args = append(args, "--timeout", timeout)
				}
				created, r := runRecorded(t, home, filepath.Join(repo, launch), args)
				if len(created) != 1 {
					t.Fatalf("runs recorded: %v, want the call's alone", created)
				}
				record := completedRun(t, home, created[0])
				want := map[string]any{"node": call.Name, "process": call.Process, "agent": call.Agent}
				if record["process"] != name || !reflect.DeepEqual(record["call"], want) {
					t.Fatalf("the run of %v calls %v, want workflow %s's call %v", record["process"], record["call"], name, want)
				}
				if slices.Contains(implementers, call.Process) {
					text := string(implementPrompt)
					if given := inputOf(t, record, "prompt"); given["source"] != "prompt" || given["identity"] != "sha256:"+digestOf(text) || given["value"] != text {
						t.Fatalf("%s's prompt = %v, want home's implement prompt", name, given)
					}
					source := definitionOf(t, run{record: record}, "prompts", "implement")
					want := homeFile("prompts", "implement", filepath.Join(home, "prompts", "implement.md"), text)
					if !reflect.DeepEqual(source, want) {
						t.Fatalf("%s's prompt definition = %v, want %v", name, source, want)
					}
				}
				recordsAgent(t, record)
				recordsStaleLimits(t, record)
				recordsRequired(t, record)
				givesGuidance(t, root, repo, record, repositoryGuidance[call.Process]...)
				if verifies(process) {
					verifiedOnce(t, record)
				}
				schemaAccepts(t, record, record["result"].(map[string]any)["output"], r.stdout)
			})
			continue
		}
		joined[workflow.Join.Process] = true
		t.Run("workflow "+name, func(t *testing.T) {
			args := append([]string{"run", name}, paramArgs(t, ".", workflow.Params)...)
			created, r := runRecorded(t, home, repo, args)
			if len(created) != len(workflow.FanOut)+2 {
				t.Fatalf("runs recorded: %v, want the workflow's and one per node", created)
			}
			var record map[string]any
			for _, id := range created {
				var candidate map[string]any
				readJSON(t, filepath.Join(home, "runs", id, "record.json"), &candidate)
				if candidate["workflow"] != nil {
					record = candidate
				}
			}
			if record == nil {
				t.Fatalf("no workflow run among %v", created)
			}
			result := record["result"].(map[string]any)
			if result["status"] != "completed" {
				t.Fatalf("result = %v", result)
			}
			nodes := record["workflow"].(map[string]any)["nodes"].([]any)
			var join map[string]any
			for i, node := range nodes {
				node := node.(map[string]any)
				child := completedRun(t, home, node["run"].(string))
				recordsAgent(t, child)
				recordsStaleLimits(t, child)
				recordsRequired(t, child)
				if parent := child["parent"].(map[string]any); parent["run"] != record["id"] || parent["node"] != node["name"] {
					t.Fatalf("node %v: parent %v", node["name"], parent)
				}
				if i == len(nodes)-1 {
					join = child
					continue
				}
				if parseProcess(t, root, calledProcess(child)).Output.Format == "json" {
					schemaValidates(t, child, child["result"].(map[string]any)["output"])
				}
			}
			// The workflow's output is its join's, which its schema accepts.
			if !reflect.DeepEqual(result["output"], join["result"].(map[string]any)["output"]) {
				t.Fatalf("output %v, join's %v", result["output"], join["result"])
			}
			schemaAccepts(t, join, result["output"], r.stdout)
		})
	}
	for _, name := range names {
		if !bases[name] && !bound[name] {
			t.Errorf("process %s of the home folder is bound by no node of its workflows: it runs nowhere", name)
		}
	}
	for name := range joins {
		if !joined[name] {
			t.Errorf("process %s takes a workflow's collection, but no workflow of the home folder joins with it", name)
		}
	}
	for name := range staleLimits {
		if !slices.Contains(names, name) {
			t.Errorf("process %s, which has stale limits, is not among the home folder's processes", name)
		}
	}
	for name := range requiredPermissions {
		if !slices.Contains(names, name) {
			t.Errorf("process %s, which has required permissions listed, is not among the home folder's processes", name)
		}
	}
	for name := range callAgents {
		if !slices.Contains(workflows, filepath.Join(root, homeFolder, "workflows", name+".yaml")) {
			t.Errorf("workflow %s, which has an agent listed, is not among the home folder's workflows", name)
		}
	}
}

// verifies reports whether process declares verify, inline or by name.
func verifies(process definition.Process) bool {
	return process.Verify != nil || process.VerifyName != ""
}

// verifiedOnce checks that a run recorded one verification attempt, which
// ran verifyFixture and passed.
func verifiedOnce(t *testing.T, record map[string]any) {
	t.Helper()
	attempts, _ := record["attempts"].([]any)
	if len(attempts) != 1 {
		t.Fatalf("attempts = %v, want one", record["attempts"])
	}
	if run, _ := attempts[0].(map[string]any)["run"].(map[string]any); run["command"] != verifyFixture || run["passed"] != true {
		t.Fatalf("verification run = %v, want %q passed", run, verifyFixture)
	}
}

// recordsAgent checks that a process's run recorded what processAgents
// lists for its process, and a run of a workflow of one call what
// callAgents lists for its workflow, or, for a workflow it does not list,
// what processAgents lists for the process it calls: the agent, its runtime
// mapping, the model and effort asked of it and the session mode.
func recordsAgent(t *testing.T, record map[string]any) {
	t.Helper()
	process, _ := record["process"].(string)
	agents, list := processAgents, "processAgents"
	if _, ok := record["call"]; ok {
		if _, listed := callAgents[process]; listed {
			agents, list = callAgents, "callAgents"
		} else {
			process = calledProcess(record)
		}
	}
	want, listed := agents[process]
	if !listed {
		t.Fatalf("%s: no agent listed in %s", process, list)
	}
	agent, _ := record["agent"].(string)
	runtime, _ := record["runtime"].(map[string]any)
	mapping, _ := runtime["mapping"].(string)
	profile, _ := record["profile"].(map[string]any)
	model, _ := profile["model"].(string)
	effort, _ := profile["effort"].(string)
	session, _ := profile["session"].(string)
	if got := (agentProfile{agent: agent, runtime: mapping, model: model, effort: effort, session: session}); got != want {
		t.Fatalf("%s ran on %+v, want %+v", process, got, want)
	}
}

// recordsStaleLimits checks that a process's run recorded the effective
// staleness limits staleLimits lists for the process it called, or none.
func recordsStaleLimits(t *testing.T, record map[string]any) {
	t.Helper()
	process := calledProcess(record)
	effective, ok := record["effective"].(map[string]any)
	if !ok {
		t.Fatalf("%s: no effective limits recorded: %v", process, record)
	}
	var got domain.StaleLimits
	if recorded, set := effective["stale"]; set {
		data, err := json.Marshal(recorded)
		if err != nil {
			t.Fatal(err)
		}
		if err := json.Unmarshal(data, &got); err != nil {
			t.Fatalf("%s: stale %s: %v", process, data, err)
		}
	}
	if want := staleLimits[process]; got != want {
		t.Fatalf("%s: effective stale limits %+v, want %+v", process, got, want)
	}
}

// recordsRequired checks that a process's run recorded, among its effective
// limits, the permissions requiredPermissions lists for the process it
// called, in their order, or none.
func recordsRequired(t *testing.T, record map[string]any) {
	t.Helper()
	process := calledProcess(record)
	want, listed := requiredPermissions[process]
	if !listed {
		t.Fatalf("%s: no required permissions listed in requiredPermissions", process)
	}
	effective, ok := record["effective"].(map[string]any)
	if !ok {
		t.Fatalf("%s: no effective limits recorded: %v", process, record)
	}
	var got []string
	if recorded, set := effective["require"]; set {
		data, err := json.Marshal(recorded)
		if err != nil {
			t.Fatal(err)
		}
		if err := json.Unmarshal(data, &got); err != nil {
			t.Fatalf("%s: require %s: %v", process, data, err)
		}
	}
	if !slices.Equal(got, want) {
		t.Fatalf("%s: effective tools.require %v, want %v", process, got, want)
	}
}

// onFakeRuntimes is this repository's root, and a mirror of it (see mirror
// and fixVerify) with an Agister home that is homeFolder installed into an
// empty one (ADR-027 rule 7), where git and the claude, codex and pi that
// run are fakes, in process.
func onFakeRuntimes(t *testing.T) (root, repo, home string) {
	t.Helper()
	root, repo, home, _ = onFakeRuntimesRecorded(t)
	return root, repo, home
}

// onFakeRuntimesRecorded is onFakeRuntimes with the mirror's record in the fake of git,
// for a test that commits to it.
func onFakeRuntimesRecorded(t *testing.T) (root, repo, home string, recorded *gittest.Repository) {
	t.Helper()
	root, err := filepath.Abs(filepath.Join("..", "..", ".."))
	if err != nil {
		t.Fatal(err)
	}

	home = filepath.Join(tempDir(t), "home")
	repo, recorded = mirror(t, root, home)
	fixVerify(t, root, repo)
	// The fakes answer as claude, codex and pi, each with an output from
	// the schema it is given, and report their default versions, which the
	// mappings verify (claude-code 2.1.283, codex 0.158.0, pi 0.85.1). No
	// real runtime ever runs, and no ccusage: the starter has none, so
	// Codex turns cost unknown.
	startThrough(t, home, runtimetest.InProcess{Env: []string{"FAKE_OUTPUT=schema"}})
	if r := agisterInstalling(t, "yes\n", home, tempDir(t), "install", filepath.Join(root, homeFolder)); r.code != 0 {
		t.Fatalf("install %s: %d %s", homeFolder, r.code, r.stderr)
	}
	return root, repo, home, recorded
}

// The judge of code_review rules on the collection of a fixed set of
// reviews: architecture, tests, adversarial, clarity and intent, the ADR
// review not among them. Each reviewer, and the judge, is given its own
// standing prompt, the settings prompt of its role (ADR-027 rule 4), so a
// process that names another role's prompt fails here. The intent reviewer
// declares a valid review-result its required output.
func TestCodeReviewCollectsItsFiveReviews(t *testing.T) {
	t.Parallel()
	root, repo, home := onFakeRuntimes(t)
	reviews, records := judgedReviews(t, home, repo, "code_review")
	want := map[string]string{
		"architecture": "architecture_review completed",
		"tests":        "tests_review completed",
		"adversarial":  "adversarial_review completed",
		"clarity":      "clarity_review completed",
		"intent":       "intent_review completed",
	}
	if !reflect.DeepEqual(reviews, want) {
		t.Fatalf("code_review's judge collected %v, want %v", reviews, want)
	}

	for _, c := range []struct{ process, prompt string }{
		{"architecture_review", "code-review-architecture"},
		{"tests_review", "code-review-tests"},
		{"adversarial_review", "code-review-adversarial"},
		{"clarity_review", "code-review-clarity"},
		{"intent_review", "code-review-intent"},
		{"review_judge", "code-review-judge"},
	} {
		prompt, err := os.ReadFile(filepath.Join(root, homeFolder, "prompts", c.prompt+".md"))
		if err != nil {
			t.Fatal(err)
		}
		sum := sha256.Sum256(prompt)
		digest := "sha256:" + hex.EncodeToString(sum[:])
		record := records[c.process]
		if record == nil {
			t.Fatalf("code_review: no run of %s", c.process)
		}
		if given := inputOf(t, record, "prompt"); given["source"] != "prompt" || given["identity"] != digest {
			t.Errorf("%s's prompt = %v, want the prompt %s (%s)", c.process, given, c.prompt, digest)
		}
	}

	if output := parseProcess(t, root, "intent_review").Output; output.Format != "json" || output.Schema != "review-result" {
		t.Fatalf("intent_review's output = %+v, want json of schema review-result", output)
	}
	// The parsed process keeps no require_valid: it is read from the
	// document, laid over the review base, which gives the output.
	var document struct {
		Output struct {
			RequireValid bool `yaml:"require_valid"`
		} `yaml:"output"`
	}
	if err := yaml.Unmarshal(extendedProcess(t, root, "intent_review").Bytes, &document); err != nil {
		t.Fatal(err)
	}
	if !document.Output.RequireValid {
		t.Fatal("intent_review's output.require_valid is not true, want its output required valid")
	}
}

// The intent reviewer reviews the candidate it is given, in the worktree at
// that candidate (ADR-025 rule 2): with HEAD at another commit, the call,
// run alone (runsAlone), is refused, naming the candidate, and its runtime
// never starts.
func TestIntentReviewIsRefusedOffItsCandidate(t *testing.T) {
	t.Parallel()
	root, repo, home, recorded := onFakeRuntimesRecorded(t)
	// HEAD moves past feature, the candidate, to a commit of its own.
	head := recorded.Commit("later", map[string]string{"change.txt": "one\ntwo\nthree\n"})
	before := map[string]bool{}
	for _, entry := range readRuns(t, home) {
		before[entry.Name()] = true
	}
	r := agister(t, home, repo, "run", runsAlone(t, root, home, "intent_review"), "--param", "base=main", "--param", "candidate=feature", "--param", "goal="+repoGoal)
	const pinned = "a call works on the revision its process pins, and Agister does not move HEAD (ADR-025 rule 2)"
	if r.code != cli.ExitRefused || !strings.Contains(r.stderr, pinned) {
		t.Fatalf("intent_review off its candidate: exit %d, stderr %q, want refused with %q", r.code, r.stderr, pinned)
	}
	var created []string
	for _, entry := range readRuns(t, home) {
		if !before[entry.Name()] {
			created = append(created, entry.Name())
		}
	}
	if len(created) != 1 {
		t.Fatalf("runs recorded: %v, want one", created)
	}
	id := created[0]
	var record map[string]any
	readJSON(t, filepath.Join(home, "runs", id, "record.json"), &record)
	candidate, _ := inputOf(t, record, "candidate_revision")["value"].(string)
	if want := "is at " + head + ", not revision " + candidate; candidate == head || !strings.Contains(r.stderr, want) {
		t.Fatalf("stderr %q, want %q", r.stderr, want)
	}
	if started := processesStarted(filepath.Join(home, "runs", id)); len(started) != 0 {
		t.Fatalf("run %s: the runtime started: %v", id, started)
	}
}

// The judge of adr_review rules on the collection of the ADR review alone,
// and the ADR reviewer is given its standing prompt, the settings prompt
// code-review-adr (ADR-027 rule 4).
func TestADRReviewCollectsTheADRReview(t *testing.T) {
	t.Parallel()
	root, repo, home := onFakeRuntimes(t)
	reviews, records := judgedReviews(t, home, repo, "adr_review")
	want := map[string]string{"adr": "adr_review_codex completed"}
	if !reflect.DeepEqual(reviews, want) {
		t.Fatalf("adr_review's judge collected %v, want %v", reviews, want)
	}

	prompt, err := os.ReadFile(filepath.Join(root, homeFolder, "prompts", "code-review-adr.md"))
	if err != nil {
		t.Fatal(err)
	}
	sum := sha256.Sum256(prompt)
	digest := "sha256:" + hex.EncodeToString(sum[:])
	if given := inputOf(t, records["adr_review_codex"], "prompt"); given["source"] != "prompt" || given["identity"] != digest {
		t.Fatalf("adr_review_codex's prompt = %v, want the prompt code-review-adr (%s)", given, digest)
	}
}

// workflowAgents is the agent each node of home's review workflows binds
// its process to, by workflow and node (ADR-030 Migration step 3): the one
// the node's process named when the process chose it.
var workflowAgents = map[string]map[string]string{
	"code_review": {
		"architecture": "codex-sol-61",
		"tests":        "codex-sol-61",
		"adversarial":  "codex-sol-61",
		"clarity":      "codex-sol-61",
		"intent":       "codex-sol-61",
		"judge":        "claude-opus",
	},
	"adr_review": {
		"adr":   "codex-sol-61",
		"judge": "claude-opus",
	},
}

// Each node of code_review and adr_review names its agent (ADR-030 rule
// 5), the one of workflowAgents: its workflow's file in the home folder
// says it on the node. The node binds it, not its process: in the
// installed home, the process names no agent, nor does the base it
// extends, the workflow completes, and each node's run records what
// processAgents lists for its process, the agent, runtime, model, effort
// and session mode it ran on when its process named the agent.
func TestTheReviewWorkflowsNameTheirAgents(t *testing.T) {
	t.Parallel()
	root, repo, home := onFakeRuntimes(t)
	names := slices.Sorted(maps.Keys(workflowAgents))
	nodes := map[string][]definition.Node{}
	for _, name := range names {
		nodes[name] = parseWorkflow(t, root, name).Nodes()
		named := map[string]string{}
		for _, node := range nodes[name] {
			named[node.Name] = node.Agent
		}
		if !reflect.DeepEqual(named, workflowAgents[name]) {
			t.Errorf("%s's nodes name the agents %v, want %v", name, named, workflowAgents[name])
		}
	}

	// process list has no agent to name of a process (ADR-030 rule 2): each
	// is listed by its name and output alone.
	listed := agister(t, home, repo, "process", "list")
	for _, name := range names {
		for _, node := range nodes[name] {
			line := regexp.MustCompile(`(?m)^` + regexp.QuoteMeta(node.Process) + `\t[^\t\n]+$`)
			if listed.code != 0 || !line.MatchString(listed.stdout) || strings.Contains(listed.stdout, "agent:") {
				t.Fatalf("process list lacks %s, a process that names no agent: %d\n%s%s", line, listed.code, listed.stdout, listed.stderr)
			}
		}
	}

	for _, name := range names {
		_, records := judgedReviews(t, home, repo, name)
		for _, node := range nodes[name] {
			record := records[node.Process]
			if record == nil {
				t.Fatalf("%s: no run of node %s's %s", name, node.Name, node.Process)
			}
			if parent, _ := record["parent"].(map[string]any); parent["node"] != node.Name {
				t.Fatalf("%s: the run of %s is node %v's, want %s's", name, node.Process, parent["node"], node.Name)
			}
			if record["agent"] != workflowAgents[name][node.Name] {
				t.Errorf("%s: node %s ran on %v, want %s", name, node.Name, record["agent"], workflowAgents[name][node.Name])
			}
			recordsAgent(t, record)
		}
	}
}

// Each review workflow of the repository refuses a call without a goal
// (ADR-023 rule 1): the param is required, so the call ends refused, naming
// it, and no node starts.
func TestReviewWorkflowsRefuseACallWithoutAGoal(t *testing.T) {
	t.Parallel()
	_, repo, home := onFakeRuntimes(t)
	for _, workflow := range []string{"code_review", "adr_review"} {
		before := map[string]bool{}
		for _, entry := range readRuns(t, home) {
			before[entry.Name()] = true
		}
		r := agister(t, home, repo, "run", workflow, "--param", "base=main", "--param", "candidate=feature")
		if want := "workflow " + workflow + " is missing params: goal"; r.code != cli.ExitRefused || !strings.Contains(r.stderr, want) {
			t.Fatalf("%s without a goal: exit %d, stderr %q, want refused with %q", workflow, r.code, r.stderr, want)
		}
		for _, entry := range readRuns(t, home) {
			if before[entry.Name()] {
				continue
			}
			var record map[string]any
			readJSON(t, filepath.Join(home, "runs", entry.Name(), "record.json"), &record)
			if record["parent"] != nil {
				t.Fatalf("%s without a goal started node %v (run %v)", workflow, record["parent"], record["id"])
			}
		}
	}
}

// Each review workflow of the repository resolves the goal file once, as
// its own input, identified by its digest, and every review node receives
// its text (ADR-023 rule 1): as the node's input goal, and in the prompt
// its runtime is given. The judge does not (ADR-003 rule 4): its call takes
// no param, has no input goal, and its prompt holds no line of the goal.
func TestReviewNodesReceiveTheGoalAndTheJudgeDoesNot(t *testing.T) {
	t.Parallel()
	_, repo, home := onFakeRuntimes(t)
	sum := sha256.Sum256([]byte(reviewGoal))
	digest := "sha256:" + hex.EncodeToString(sum[:])
	for _, workflow := range []string{"code_review", "adr_review"} {
		reviews, records := judgedReviews(t, home, repo, workflow)
		if given := inputOf(t, records[workflow], "goal"); given["source"] != "file" || given["identity"] != digest {
			t.Fatalf("%s's goal = %v, want the goal file (%s)", workflow, given, digest)
		}
		for node, review := range reviews {
			record := records[strings.TrimSuffix(review, " completed")]
			if record == nil {
				t.Fatalf("%s: no run of node %s (%s)", workflow, node, review)
			}
			if given := inputOf(t, record, "goal"); given["value"] != reviewGoal {
				t.Fatalf("%s: node %s's goal = %v, want the goal file's text %q", workflow, node, given, reviewGoal)
			}
			if prompt := runtimeStart(t, home, record["id"].(string)).Prompt; !strings.Contains(prompt, "## goal\n") || !strings.Contains(prompt, reviewGoal) {
				t.Fatalf("%s: node %s's prompt lacks the goal:\n%s", workflow, node, prompt)
			}
		}
		judge := records["review_judge"]
		if params, _ := judge["request"].(map[string]any)["params"].(map[string]any); len(params) != 0 {
			t.Fatalf("%s: the judge's call took params %v", workflow, params)
		}
		for _, input := range judge["inputs"].([]any) {
			if name := input.(map[string]any)["name"]; name != "reviews" && name != "prompt" {
				t.Fatalf("%s: the judge was given input %v, want only reviews and its prompt", workflow, name)
			}
		}
		prompt := runtimeStart(t, home, judge["id"].(string)).Prompt
		for _, line := range strings.Split(strings.TrimSpace(reviewGoal), "\n") {
			if line != "" && strings.Contains(prompt, line) {
				t.Fatalf("%s: the judge's prompt holds the goal's line %q:\n%s", workflow, line, prompt)
			}
		}
	}
}

// The advisor answers a question file on the Codex agent, a model family
// other than the judge's, which home's advisor_codex binds it to (ADR-030
// rule 6), in the caller's worktree (ADR-025), and is given the question and
// its standing prompt, the settings prompt advisor (ADR-027 rule 4). Its
// output is of the advice schema.
func TestAdvisorAnswersAQuestionFile(t *testing.T) {
	t.Parallel()
	root, repo, home := onFakeRuntimes(t)
	question := filepath.Join(tempDir(t), "question.md")
	write(t, question, "Asked by: workflow run 1, item 2.\nQuestion: which?\nOptions: (a) one; (b) two.\n")
	// The timeout is the test's own: the process allows 20 minutes.
	created, r := runRecorded(t, home, repo, []string{"run", "advisor_codex", "--param", "question=" + question, "--param", "revision=feature", "--timeout", "1m"})
	if len(created) != 1 {
		t.Fatalf("runs recorded: %v, want one", created)
	}
	record := completedRun(t, home, created[0])
	// Its output is the one property advice, which the advice schema
	// accepts: the fake answers with the first variant, owner.
	output := record["result"].(map[string]any)["output"]
	schemaAccepts(t, record, output, r.stdout)
	if want := map[string]any{"advice": map[string]any{"kind": "conflict", "reason": "fake"}}; !reflect.DeepEqual(output, want) {
		t.Fatalf("the advisor's output = %v, want %v", output, want)
	}
	// The runtime worked in the caller's worktree, at the revision.
	if workspace, _ := record["workspace"].(string); runtimeCwd(t, home, created[0]) != workspace || workspace != repo {
		t.Fatalf("the advisor's workspace %q, runtime cwd %q, the caller's repository %s", workspace, runtimeCwd(t, home, created[0]), repo)
	}
	// The runtime was started under its read-only sandbox.
	if argv := runtimeArgv(t, home, created[0]); !follows(argv, "--sandbox", "read-only") {
		t.Fatalf("the advisor's runtime argv = %v, want --sandbox read-only", argv)
	}
	if call, _ := record["call"].(map[string]any); record["agent"] != "codex-sol-61" || call["process"] != "advisor" {
		t.Fatalf("the advisor's agent = %v, of its call %v, want codex-sol-61 calling advisor", record["agent"], record["call"])
	}
	if advisor, judge := modelFamily(t, root, "codex-sol-61"), modelFamily(t, root, "claude-opus"); advisor == "" || advisor == judge {
		t.Fatalf("the advisor's model family %q, the judge's %q: want another", advisor, judge)
	}
	for _, input := range []struct{ name, source, path string }{
		{"question", "file", question},
		{"prompt", "prompt", filepath.Join(root, homeFolder, "prompts", "advisor.md")},
	} {
		data, err := os.ReadFile(input.path)
		if err != nil {
			t.Fatal(err)
		}
		sum := sha256.Sum256(data)
		digest := "sha256:" + hex.EncodeToString(sum[:])
		if given := inputOf(t, record, input.name); given["source"] != input.source || given["identity"] != digest {
			t.Fatalf("advisor's %s = %v, want %s %s (%s)", input.name, given, input.source, input.path, digest)
		}
	}
	feature := revision(t, home, repo, "feature")
	if given := inputOf(t, record, "revision"); given["identity"] != feature {
		t.Fatalf("advisor's revision = %v, want feature (%s)", given, feature)
	}
}

// runtimeArgv is the command line a call's fake runtime was started with,
// as the first line of its stdout tells it.
func runtimeArgv(t *testing.T, home, id string) []string {
	t.Helper()
	first := runtimeStart(t, home, id)
	if len(first.Argv) == 0 {
		t.Fatalf("run %s: no argv in the runtime's first line", id)
	}
	return first.Argv
}

// runtimeCwd is the directory a call's fake runtime was started in, as the
// first line of its stdout tells it.
func runtimeCwd(t *testing.T, home, id string) string {
	t.Helper()
	first := runtimeStart(t, home, id)
	if first.Cwd == "" {
		t.Fatalf("run %s: no cwd in the runtime's first line", id)
	}
	return first.Cwd
}

// runtimeStart is the first line of the stdout of a call's runtime, which
// a fake runtime writes with its argv, cwd and prompt (runtimeEcho).
func runtimeStart(t *testing.T, home, id string) (first struct {
	Argv   []string
	Cwd    string
	Prompt string
}) {
	t.Helper()
	echo := runtimeEcho(filepath.Join(home, "runs", id))
	if err := json.Unmarshal([]byte(echo), &first); err != nil {
		t.Fatalf("run %s: the runtime's first line %q: %v", id, echo, err)
	}
	return first
}

// follows reports whether value is the argument right after flag in argv.
func follows(argv []string, flag, value string) bool {
	for i := 0; i+1 < len(argv); i++ {
		if argv[i] == flag && argv[i+1] == value {
			return true
		}
	}
	return false
}

// The home folder's advice schema accepts a conflict with its reason, and
// a decision with its record; it refuses an answer whose payload is the
// other's, a missing field, an unexpected one and an owner answer, which
// the advisor no longer has (ADR-032). The payloads are fixed,
// not built from the schema.
func TestAdviceSchemaTiesTheAnswerToItsPayload(t *testing.T) {
	t.Parallel()
	root, err := filepath.Abs(filepath.Join("..", "..", ".."))
	if err != nil {
		t.Fatal(err)
	}
	document, err := os.ReadFile(filepath.Join(root, homeFolder, "schemas", "advice.json"))
	if err != nil {
		t.Fatal(err)
	}
	const record = `"asked_by":"workflow run 1, item 2","question":"which?","options":["one","two"],"chosen":"one",` +
		`"excluded":[{"option":"two","why":"D-3 excludes it"}],"rests_on":["D-3"],"follow_ups":[]`
	const recordWithoutChosen = `"asked_by":"workflow run 1, item 2","question":"which?","options":["one","two"],` +
		`"excluded":[{"option":"two","why":"D-3 excludes it"}],"rests_on":["D-3"],"follow_ups":[]`
	const reason = `"reason":"ADR-001 rule 9 and D-3 contradict each other"`
	cases := []struct {
		name, output string
		valid        bool
	}{
		{"a decision", `{"advice":{"kind":"decision",` + record + `}}`, true},
		{"a conflict", `{"advice":{"kind":"conflict",` + reason + `}}`, true},
		{"owner", `{"advice":{"kind":"owner",` + reason + `}}`, false},
		{"a decision without its record", `{"advice":{"kind":"decision"}}`, false},
		{"a decision with a reason", `{"advice":{"kind":"decision",` + reason + `,` + record + `}}`, false},
		{"a decision with a reason for a record", `{"advice":{"kind":"decision",` + reason + `}}`, false},
		{"a conflict with a record", `{"advice":{"kind":"conflict",` + reason + `,` + record + `}}`, false},
		{"a conflict with a record for a reason", `{"advice":{"kind":"conflict",` + record + `}}`, false},
		{"a conflict with an empty reason", `{"advice":{"kind":"conflict","reason":""}}`, false},
		{"a conflict with a blank reason", `{"advice":{"kind":"conflict","reason":" "}}`, false},
		{"a conflict without a reason", `{"advice":{"kind":"conflict"}}`, false},
		{"an unknown kind", `{"advice":{"kind":"maybe",` + reason + `}}`, false},
		{"no kind, a reason", `{"advice":{` + reason + `}}`, false},
		{"no kind, a record", `{"advice":{` + record + `}}`, false},
		{"no advice", `{}`, false},
		{"null advice", `{"advice":null}`, false},
		{"an answer at the root", `{"kind":"conflict",` + reason + `}`, false},
		{"a record without its chosen option", `{"advice":{"kind":"decision",` + recordWithoutChosen + `}}`, false},
		{"an excluded option without its why", `{"advice":{"kind":"decision",` + strings.Replace(record, `,"why":"D-3 excludes it"`, "", 1) + `}}`, false},
		{"an unexpected field", `{"advice":{"kind":"conflict",` + reason + `},"note":"x"}`, false},
		{"an unexpected field in a conflict", `{"advice":{"kind":"conflict",` + reason + `,"note":"x"}}`, false},
		{"an unexpected field in the record", `{"advice":{"kind":"decision",` + record + `,"status":"final"}}`, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			err := (schema.Validator{}).Validate(document, []byte(c.output))
			if c.valid && err != nil {
				t.Fatalf("%s refused: %v", c.output, err)
			}
			if !c.valid && err == nil {
				t.Fatalf("%s accepted", c.output)
			}
		})
	}
}

// The home folder's implementation schema requires the point left open,
// empty when the work went through (ADR-032 rule 4): an open point is its
// question, at least two options and what was searched, and nothing else.
// The payloads are fixed, not built from the schema.
func TestImplementationSchemaCarriesThePointLeftOpen(t *testing.T) {
	t.Parallel()
	document, err := os.ReadFile(filepath.Join(repositoryRoot(t), homeFolder, "schemas", "implementation.json"))
	if err != nil {
		t.Fatal(err)
	}
	const report = `"summary":"s","files_changed":["a.go"],"checks":[],"notes":""`
	const point = `{"question":"which?","options":["one","two"],"searched":["ADR-030: silent"]}`
	cases := []struct {
		name, output string
		valid        bool
	}{
		{"nothing open", `{` + report + `,"open":[]}`, true},
		{"a point open", `{` + report + `,"open":[` + point + `]}`, true},
		{"no open field", `{` + report + `}`, false},
		{"a point without a search", `{` + report + `,"open":[{"question":"which?","options":["one","two"],"searched":[]}]}`, false},
		{"a point with one option", `{` + report + `,"open":[{"question":"which?","options":["one"],"searched":["ADR-030: silent"]}]}`, false},
		{"a point with a blank question", `{` + report + `,"open":[{"question":" ","options":["one","two"],"searched":["ADR-030: silent"]}]}`, false},
		{"a point with an unexpected field", `{` + report + `,"open":[{"question":"which?","options":["one","two"],"searched":["ADR-030: silent"],"lean":"one"}]}`, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			err := (schema.Validator{}).Validate(document, []byte(c.output))
			if c.valid && err != nil {
				t.Fatalf("%s refused: %v", c.output, err)
			}
			if !c.valid && err == nil {
				t.Fatalf("%s accepted", c.output)
			}
		})
	}
}

// The home folder's review result schema accepts a review whose coverage
// holds entries of every status; it refuses a review without coverage, a
// null coverage, an empty one, a scalar coverage, an entry that is not an
// object, an entry with an unknown status, an entry missing its item,
// status or detail, an entry whose item or detail is not a string, and an
// entry with an unexpected field. The payloads are fixed, not built from the
// schema.
func TestReviewResultSchemaRequiresCoverage(t *testing.T) {
	t.Parallel()
	root, err := filepath.Abs(filepath.Join("..", "..", ".."))
	if err != nil {
		t.Fatal(err)
	}
	document, err := os.ReadFile(filepath.Join(root, homeFolder, "schemas", "review-result.json"))
	if err != nil {
		t.Fatal(err)
	}
	const review = `"verdict":"approve","summary":"Small change, low risk.","findings":[]`
	cases := []struct {
		name, output string
		valid        bool
	}{
		{"coverage of every status", `{` + review + `,"coverage":[` +
			`{"item":"tests","status":"checked","detail":"each case has a test"},` +
			`{"item":"errors","status":"finding","detail":"1"},` +
			`{"item":"naming","status":"rule_only","detail":"rule 3, a.go:4, no concrete case"},` +
			`{"item":"docs","status":"not_checked","detail":"no docs changed"}]}`, true},
		{"null coverage", `{` + review + `,"coverage":null}`, false},
		{"empty coverage", `{` + review + `,"coverage":[]}`, false},
		{"no coverage", `{` + review + `}`, false},
		{"an unknown status", `{` + review + `,"coverage":[{"item":"tests","status":"skipped","detail":"x"}]}`, false},
		{"an entry without its item", `{` + review + `,"coverage":[{"status":"checked","detail":"x"}]}`, false},
		{"an entry without its status", `{` + review + `,"coverage":[{"item":"tests","detail":"x"}]}`, false},
		{"an entry without its detail", `{` + review + `,"coverage":[{"item":"tests","status":"checked"}]}`, false},
		{"an unexpected field in an entry", `{` + review + `,"coverage":[{"item":"tests","status":"checked","detail":"x","note":"y"}]}`, false},
		{"a scalar coverage", `{` + review + `,"coverage":"all"}`, false},
		{"an entry that is not an object", `{` + review + `,"coverage":["tests"]}`, false},
		{"a non-string item", `{` + review + `,"coverage":[{"item":42,"status":"checked","detail":"x"}]}`, false},
		{"a non-string detail", `{` + review + `,"coverage":[{"item":"tests","status":"checked","detail":42}]}`, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			err := (schema.Validator{}).Validate(document, []byte(c.output))
			if c.valid && err != nil {
				t.Fatalf("%s refused: %v", c.output, err)
			}
			if !c.valid && err == nil {
				t.Fatalf("%s accepted", c.output)
			}
		})
	}
}

// The home folder's review result schema accepts a finding that presents its
// case for value (ADR-020 rule 4): its requirement, consequence, severity
// rationale and fix cost, of every size and change risk band. It refuses a
// finding missing any of the four, a size or change risk out of its bands,
// a fix cost missing a band or its basis, and a fix cost with an unexpected
// field. The payloads are fixed, not built from the schema.
func TestReviewResultSchemaRequiresTheCaseForValue(t *testing.T) {
	t.Parallel()
	root, err := filepath.Abs(filepath.Join("..", "..", ".."))
	if err != nil {
		t.Fatal(err)
	}
	document, err := os.ReadFile(filepath.Join(root, homeFolder, "schemas", "review-result.json"))
	if err != nil {
		t.Fatal(err)
	}
	const finding = `"severity":"major","file":"a.go","line":4,"title":"A lost error",` +
		`"detail":"Write drops the error; return it.",` +
		`"evidence":{"case":"a full disk","trace":["a.go:4 drops the error"],"scope":"change"}`
	const requirement = `"requirement":"ADR-001 rule 4: a failure is reported"`
	const consequence = `"consequence":"On a full disk the run records success."`
	const rationale = `"severity_rationale":"A wrong record, not a crash: major, not blocker."`
	fixCost := func(size, risk string) string {
		return `"fix_cost":{"size":"` + size + `","size_basis":"a.go Write and a_test.go",` +
			`"change_risk":"` + risk + `","change_risk_basis":"no caller outside a.go"}`
	}
	const fixCostWithout = `"fix_cost":{"size":"small","size_basis":"a.go","change_risk":"contained","change_risk_basis":"none"}`
	review := func(fields ...string) string {
		return `{"verdict":"request_changes","summary":"One lost error.","findings":[{` +
			strings.Join(append([]string{finding}, fields...), ",") +
			`}],"coverage":[{"item":"1. paths","status":"finding","detail":"1"}]}`
	}
	cases := []struct {
		name, output string
		valid        bool
	}{
		{"a finding with its case for value", review(requirement, consequence, rationale, fixCost("small", "contained")), true},
		{"a trivial, moderate fix", review(requirement, consequence, rationale, fixCost("trivial", "moderate")), true},
		{"a substantial, broad fix", review(requirement, consequence, rationale, fixCost("substantial", "broad")), true},
		{"a major fix", review(requirement, consequence, rationale, fixCost("major", "contained")), true},
		{"empty bases", review(requirement, consequence, rationale,
			`"fix_cost":{"size":"small","size_basis":"","change_risk":"contained","change_risk_basis":""}`), true},
		{"no requirement", review(consequence, rationale, fixCost("small", "contained")), false},
		{"no consequence", review(requirement, rationale, fixCost("small", "contained")), false},
		{"no severity rationale", review(requirement, consequence, fixCost("small", "contained")), false},
		{"no fix cost", review(requirement, consequence, rationale), false},
		{"a size out of its bands", review(requirement, consequence, rationale, fixCost("huge", "contained")), false},
		{"a change risk out of its bands", review(requirement, consequence, rationale, fixCost("small", "none")), false},
		{"a fix cost without its size", review(requirement, consequence, rationale,
			strings.Replace(fixCostWithout, `"size":"small",`, "", 1)), false},
		{"a fix cost without its size basis", review(requirement, consequence, rationale,
			strings.Replace(fixCostWithout, `"size_basis":"a.go",`, "", 1)), false},
		{"a fix cost without its change risk", review(requirement, consequence, rationale,
			strings.Replace(fixCostWithout, `"change_risk":"contained",`, "", 1)), false},
		{"a fix cost without its change risk basis", review(requirement, consequence, rationale,
			strings.Replace(fixCostWithout, `,"change_risk_basis":"none"`, "", 1)), false},
		{"an unexpected field in the fix cost", review(requirement, consequence, rationale,
			strings.Replace(fixCostWithout, `}`, `,"hours":3}`, 1)), false},
		{"a scalar fix cost", review(requirement, consequence, rationale, `"fix_cost":"small"`), false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			err := (schema.Validator{}).Validate(document, []byte(c.output))
			if c.valid && err != nil {
				t.Fatalf("%s refused: %v", c.output, err)
			}
			if !c.valid && err == nil {
				t.Fatalf("%s accepted", c.output)
			}
		})
	}
}

// The home folder's review result schema accepts a finding whose evidence
// states its scope (ADR-023 rule 3) as change, goal or outside. It refuses
// evidence without a scope, a scope out of those three, one that is not a
// string, and the introduced_by_change it replaces, in its place or beside
// it. The payloads are fixed, not built from the schema.
func TestReviewResultSchemaRequiresTheScope(t *testing.T) {
	t.Parallel()
	root, err := filepath.Abs(filepath.Join("..", "..", ".."))
	if err != nil {
		t.Fatal(err)
	}
	document, err := os.ReadFile(filepath.Join(root, homeFolder, "schemas", "review-result.json"))
	if err != nil {
		t.Fatal(err)
	}
	review := func(scope string) string {
		return `{"verdict":"request_changes","summary":"One lost error.","findings":[{` +
			`"severity":"major","file":"a.go","line":4,"title":"A lost error",` +
			`"detail":"Write drops the error; return it.",` +
			`"evidence":{"case":"a full disk","trace":["a.go:4 drops the error"]` + scope + `},` +
			`"requirement":"The goal, Done when: \"a failed write is reported\"",` +
			`"consequence":"On a full disk the run records success.",` +
			`"severity_rationale":"A wrong record, not a crash: major, not blocker.",` +
			`"fix_cost":{"size":"small","size_basis":"a.go","change_risk":"contained","change_risk_basis":"none"}` +
			`}],"coverage":[{"item":"1. paths","status":"finding","detail":"1"}]}`
	}
	cases := []struct {
		name, output string
		valid        bool
	}{
		{"a finding in the change", review(`,"scope":"change"`), true},
		{"a finding that stops the goal", review(`,"scope":"goal"`), true},
		{"a finding outside both", review(`,"scope":"outside"`), true},
		{"no scope", review(``), false},
		{"a scope out of the three", review(`,"scope":"module"`), false},
		{"a scope that is not a string", review(`,"scope":true`), false},
		{"introduced_by_change in place of the scope", review(`,"introduced_by_change":true`), false},
		{"introduced_by_change beside the scope", review(`,"scope":"change","introduced_by_change":true`), false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			err := (schema.Validator{}).Validate(document, []byte(c.output))
			if c.valid && err != nil {
				t.Fatalf("%s refused: %v", c.output, err)
			}
			if !c.valid && err == nil {
				t.Fatalf("%s accepted", c.output)
			}
		})
	}
}

// The home folder's judgement schema accepts a judgement with no coverage
// gaps and one whose gaps hold an entry of every status; it refuses a
// judgement without coverage gaps, null coverage gaps, scalar ones, an entry
// that is not an object, an entry with an unknown status, an entry whose
// review is not an integer (a string, a fraction), an entry missing its
// review, item, status or detail, an entry whose item or detail is not a
// string, and an entry with an unexpected field. The payloads are fixed, not
// built from the schema.
func TestJudgementSchemaRequiresCoverageGaps(t *testing.T) {
	t.Parallel()
	root, err := filepath.Abs(filepath.Join("..", "..", ".."))
	if err != nil {
		t.Fatal(err)
	}
	document, err := os.ReadFile(filepath.Join(root, homeFolder, "schemas", "judgement.json"))
	if err != nil {
		t.Fatal(err)
	}
	const judgement = `"summary":"One fix; the tests review left an item unchecked.","items":[` +
		`{"severity":"major","sources":["1#1","3#2"],"title":"A lost error","ruling":"fix",` +
		`"reason":"The trace shows the error dropped.","action":"Return the error.","missing_evidence":"",` +
		`"benefit":"The caller no longer reports success on a failed write.","cost":"One function and its test, contained.",` +
		`"switching_condition":"A trace showing the caller handles the error."}]`
	cases := []struct {
		name, output string
		valid        bool
	}{
		{"no coverage gaps", `{` + judgement + `,"coverage_gaps":[]}`, true},
		{"a gap of every status", `{` + judgement + `,"coverage_gaps":[` +
			`{"review":2,"item":"9. cost","status":"not_checked","detail":"no test changed"},` +
			`{"review":2,"item":"8. wall clock","status":"rule_only","detail":"rule 8, a_test.go:4, no load condition traced"},` +
			`{"review":4,"item":"whole review","status":"incomplete","detail":"failed: timeout"}]}`, true},
		{"no coverage_gaps", `{` + judgement + `}`, false},
		{"an unknown status", `{` + judgement + `,"coverage_gaps":[{"review":2,"item":"9. cost","status":"checked","detail":"x"}]}`, false},
		{"a non-integer review", `{` + judgement + `,"coverage_gaps":[{"review":"2","item":"9. cost","status":"not_checked","detail":"x"}]}`, false},
		{"an entry without its review", `{` + judgement + `,"coverage_gaps":[{"item":"9. cost","status":"not_checked","detail":"x"}]}`, false},
		{"an entry without its item", `{` + judgement + `,"coverage_gaps":[{"review":2,"status":"not_checked","detail":"x"}]}`, false},
		{"an entry without its status", `{` + judgement + `,"coverage_gaps":[{"review":2,"item":"9. cost","detail":"x"}]}`, false},
		{"an entry without its detail", `{` + judgement + `,"coverage_gaps":[{"review":2,"item":"9. cost","status":"not_checked"}]}`, false},
		{"an unexpected field in an entry", `{` + judgement + `,"coverage_gaps":[{"review":2,"item":"9. cost","status":"not_checked","detail":"x","note":"y"}]}`, false},
		{"null coverage_gaps", `{` + judgement + `,"coverage_gaps":null}`, false},
		{"a scalar coverage_gaps", `{` + judgement + `,"coverage_gaps":"none"}`, false},
		{"an entry that is not an object", `{` + judgement + `,"coverage_gaps":["9. cost"]}`, false},
		{"a non-string item", `{` + judgement + `,"coverage_gaps":[{"review":2,"item":9,"status":"not_checked","detail":"x"}]}`, false},
		{"a non-string detail", `{` + judgement + `,"coverage_gaps":[{"review":2,"item":"9. cost","status":"not_checked","detail":42}]}`, false},
		{"a fractional review", `{` + judgement + `,"coverage_gaps":[{"review":2.5,"item":"9. cost","status":"not_checked","detail":"x"}]}`, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			err := (schema.Validator{}).Validate(document, []byte(c.output))
			if c.valid && err != nil {
				t.Fatalf("%s refused: %v", c.output, err)
			}
			if !c.valid && err == nil {
				t.Fatalf("%s accepted", c.output)
			}
		})
	}
}

// The home folder's judgement schema accepts an item of every ruling, waive
// included (ADR-020 rule 2), each with its benefit, cost and switching
// condition (rule 5), empty where the ruling leaves them so. It refuses an
// item missing its benefit, cost or switching condition, an item with an
// unknown ruling, and an owner item, a ruling the judge no longer has
// (ADR-031 rule 1). The payloads are fixed, not built from the schema.
func TestJudgementSchemaRecordsWhatDecidedARuling(t *testing.T) {
	t.Parallel()
	root, err := filepath.Abs(filepath.Join("..", "..", ".."))
	if err != nil {
		t.Fatal(err)
	}
	document, err := os.ReadFile(filepath.Join(root, homeFolder, "schemas", "judgement.json"))
	if err != nil {
		t.Fatal(err)
	}
	const benefit = `"benefit":"A clearer name for one local variable."`
	const cost = `"cost":"Two files and their tests, moderate risk."`
	const switching = `"switching_condition":"A case where the name misleads a caller."`
	item := func(ruling, action, missing string, fields ...string) string {
		return `{"summary":"One item.","items":[{"severity":"nit","sources":["1#1"],"title":"A vague name",` +
			`"ruling":"` + ruling + `","reason":"The evidence holds.","action":"` + action + `",` +
			`"missing_evidence":"` + missing + `"` + strings.Join(append([]string{""}, fields...), ",") +
			`}],"coverage_gaps":[]}`
	}
	cases := []struct {
		name, output string
		valid        bool
	}{
		{"a waive", item("waive", "", "", benefit, cost, switching), true},
		{"a fix", item("fix", "Rename it.", "", benefit, cost, switching), true},
		{"a reject with only its switching condition", item("reject", "", "A case.", `"benefit":""`, `"cost":""`, switching), true},
		{"a defer with only its switching condition", item("defer", "Gap, trigger, done when.", "", `"benefit":""`, `"cost":""`, switching), true},
		{"no benefit", item("waive", "", "", cost, switching), false},
		{"no cost", item("waive", "", "", benefit, switching), false},
		{"no switching condition", item("waive", "", "", benefit, cost), false},
		{"an unknown ruling", item("ignore", "", "", benefit, cost, switching), false},
		{"an owner item", item("owner", "Rename it, or leave it?", "", benefit, cost, switching), false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			err := (schema.Validator{}).Validate(document, []byte(c.output))
			if c.valid && err != nil {
				t.Fatalf("%s refused: %v", c.output, err)
			}
			if !c.valid && err == nil {
				t.Fatalf("%s accepted", c.output)
			}
		})
	}
}

// Each review prompt of the repository carries its part of the coverage
// contract. A reviewer's prompt has a definition of done whose items are
// numbered 1 to the prompt's own count, in order, with none unnumbered, and
// the instruction to report every numbered item in coverage with one of the
// four statuses. The judge's has its definition of done, numbered the same
// way, and the instructions that coverage entries are not findings, that
// not_checked and rule_only entries are copied to coverage_gaps, that a
// review with no output is an incomplete "whole review" gap, and that the
// summary names coverage gaps. An instruction is held by its short phrases
// standing in one paragraph, not by its wording, so a rewording that keeps
// them passes. The prompts are the repository's own, read as they are.
func TestReviewPromptsCarryTheirCoverageContract(t *testing.T) {
	t.Parallel()
	root, err := filepath.Abs(filepath.Join("..", "..", ".."))
	if err != nil {
		t.Fatal(err)
	}
	report := promptInstruction{"report every numbered item in coverage with one of the four statuses",
		[]string{"every numbered item", "`coverage`", "`checked`", "`finding`", "`rule_only`", "`not_checked`"}}
	cases := []struct {
		prompt       string
		items        int
		instructions []promptInstruction
	}{
		{"code-review-tests.md", 11, []promptInstruction{report}},
		{"code-review-adversarial.md", 8, []promptInstruction{report}},
		{"code-review-architecture.md", 9, []promptInstruction{report}},
		{"code-review-clarity.md", 9, []promptInstruction{report}},
		{"code-review-intent.md", 5, []promptInstruction{report}},
		{"code-review-adr.md", 6, []promptInstruction{report}},
		{"code-review-judge.md", 5, []promptInstruction{
			{"coverage entries are not findings", []string{"`coverage`", "not findings"}},
			{"copy not_checked and rule_only entries to coverage_gaps", []string{"`not_checked`", "`rule_only`", "`coverage_gaps`"}},
			{`a review with no output is an incomplete "whole review" gap`, []string{`"whole review"`, "`incomplete`"}},
			{"the summary names coverage gaps", []string{"`summary`", "coverage gap"}},
		}},
	}
	for _, c := range cases {
		t.Run(c.prompt, func(t *testing.T) {
			t.Parallel()
			data, err := os.ReadFile(filepath.Join(root, homeFolder, "prompts", c.prompt))
			if err != nil {
				t.Fatal(err)
			}
			prompt := string(data)
			want := make([]int, c.items)
			for i := range want {
				want[i] = i + 1
			}
			if got := definitionOfDoneNumbers(prompt); !slices.Equal(got, want) {
				t.Errorf("agister/home/prompts/%s: want a \"Definition of done\" of %d items numbered 1 to %d, found the numbers %v (0 is an unnumbered item)",
					c.prompt, c.items, c.items, got)
			}
			for _, instruction := range c.instructions {
				if !carries(prompt, instruction.phrases) {
					t.Errorf("agister/home/prompts/%s lost the instruction %q: no paragraph has all of %q",
						c.prompt, instruction.name, instruction.phrases)
				}
			}
		})
	}
}

// Each review prompt of the repository carries its part of ADR-020. A
// reviewer's prompt has the instruction that every finding presents its
// case for value: its requirement, consequence, severity rationale and fix
// cost as review-result.json bands it, each band with its basis. The
// judge's has the waive ruling and the two questions it answers; the burden
// for fixing by severity, blocker to nit, and that equal or unresolved
// economics leave the presumption standing; that a trade-off or a stance
// only the owner can take stays an owner question, while fixing or waiving
// one proven finding is the judge's when its presented case settles it; the
// severity checked before merging, a merged item taking the highest
// supported one; a reject for a finding with no causal chain; a fix cost
// without its basis counted as unpresented; and the switching condition
// each item records. An instruction is held
// by its short phrases standing in one paragraph, as in
// TestReviewPromptsCarryTheirCoverageContract. The files are the
// repository's own, read as they are.
func TestReviewPromptsCarryTheCaseForValue(t *testing.T) {
	t.Parallel()
	root, err := filepath.Abs(filepath.Join("..", "..", ".."))
	if err != nil {
		t.Fatal(err)
	}
	present := promptInstruction{"every finding presents its case for value",
		[]string{"presents its case for value", "`requirement`", "`consequence`", "`severity_rationale`",
			"`fix_cost`", "`review-result.json`", "its basis"}}
	cases := []struct {
		file         string
		instructions []promptInstruction
	}{
		{"agister/home/prompts/code-review-tests.md", []promptInstruction{present}},
		{"agister/home/prompts/code-review-adversarial.md", []promptInstruction{present}},
		{"agister/home/prompts/code-review-architecture.md", []promptInstruction{present}},
		{"agister/home/prompts/code-review-clarity.md", []promptInstruction{present}},
		{"agister/home/prompts/code-review-intent.md", []promptInstruction{present}},
		{"agister/home/prompts/code-review-adr.md", []promptInstruction{present}},
		{"agister/home/prompts/code-review-judge.md", []promptInstruction{
			{"waive: proven, in the change, the burden for fixing not met", []string{
				"for an item whose evidence holds and that lies in the change", "the burden for fixing at its severity",
				"**waive**", "not a reject", "sunk and never counts"}},
			{"the burden for fixing by severity", []string{
				"**blocker**: always fixed", "**major**: fix, or `waive`", "grossly disproportionate",
				"**minor**: fix, or `waive` when the presented cost exceeds the presented benefit",
				"**nit**: `waive`, or fix when the presented benefit exceeds the presented cost"}},
			{"equal or unresolved economics leave the presumption standing", []string{"equal or unresolved", "presumption"}},
			{"a finding that offers more than one fix is ruled like any other; a fix that touches policy needs its rule quoted", []string{
				"more than one fix", "ruled like any other", "each option as the", "an accepted ADR",
				"quotes the rule that allows it", "`reject`", "`missing_evidence`"}},
			{"a requirement means what its quoted words say; an unsettled reading is rejected, never waived", []string{
				"A requirement means what its quoted words say", "only where a review quotes the source",
				"no quote settles them", "`reject`", "`missing_evidence` names the quote", "never a reason to `waive`"}},
			{"every item is ruled; no question is handed on", []string{
				"You rule on every item", "hands a question to", "a gap in their evidence"}},
			{"severity is checked before merging", []string{
				"before merging", "`severity_rationale`", "the highest severity the evidence supports",
				"the highest supported severity among its sources"}},
			{"a finding with no causal chain is rejected", []string{"**reject**", "no causal chain", "`requirement`", "`consequence`"}},
			{"a fix cost without its basis counts as unpresented", []string{"`fix_cost` whose basis is missing or empty", "unpresented"}},
			{"each item records its switching condition", []string{"`benefit`", "`cost`", "`switching_condition`", "if circumstances change"}},
		}},
	}
	for _, c := range cases {
		t.Run(c.file, func(t *testing.T) {
			t.Parallel()
			data, err := os.ReadFile(filepath.Join(root, c.file))
			if err != nil {
				t.Fatal(err)
			}
			for _, instruction := range c.instructions {
				if !carries(string(data), instruction.phrases) {
					t.Errorf("%s lost the instruction %q: no paragraph has all of %q",
						c.file, instruction.name, instruction.phrases)
				}
			}
		})
	}
}

// Each review prompt of the repository carries its part of ADR-023. A
// reviewer's prompt has the instruction to look also for what stops the
// goal: such a finding has scope goal, a concrete scenario the goal
// requires, and the goal's condition quoted in its requirement with its
// qualifications and its place in the goal; the goal's claims are checked,
// and its scope exclusions are the owner's. The tests prompt adds that a
// missing test counts only with the goal behaviour the existing assertions
// let break, and the adversarial one that the goal widens the changed
// paths. The ADR prompt's opening keeps a change that touches no ADR from
// findings of scope change only: its goal can still raise a goal finding.
// The judge's has the scope rule: goal ruled as change, outside deferred,
// an unsupported scope rejected, a goal finding a scope exclusion bars
// deferred, and an older collection's introduced_by_change read as a
// scope; and that a missing test is a goal finding too, with the goal
// behaviour the existing assertions let break. Each review process's
// instruction says what its input goal is. An instruction is held by its
// short phrases standing in one paragraph, as in
// TestReviewPromptsCarryTheirCoverageContract. The files are the
// repository's own, read as they are.
func TestReviewPromptsCarryTheGoal(t *testing.T) {
	t.Parallel()
	root, err := filepath.Abs(filepath.Join("..", "..", ".."))
	if err != nil {
		t.Fatal(err)
	}
	look := promptInstruction{"look also for what stops the goal, within its bounds",
		[]string{"the goal of the change", "Look also for what stops the goal", "scope `goal`",
			"a concrete scenario the goal requires", "`requirement`", "every qualification it carries",
			"where in the goal it stands", "are claims you check", "scope exclusions", "are the owner's", "you cannot override it"}}
	cases := []struct {
		prompt       string
		instructions []promptInstruction
	}{
		{"code-review-tests.md", []promptInstruction{look,
			{"a missing test counts only with the goal behaviour the existing assertions let break", []string{
				"A missing test", "a specific goal behaviour", "existing assertions let break"}}}},
		{"code-review-adversarial.md", []promptInstruction{look,
			{"the goal widens the changed paths", []string{
				"every changed path", "The goal widens that", "each scenario the goal requires", "changed or not"}}}},
		{"code-review-architecture.md", []promptInstruction{look}},
		{"code-review-clarity.md", []promptInstruction{look}},
		{"code-review-intent.md", []promptInstruction{look}},
		{"code-review-adr.md", []promptInstruction{look,
			{"a change that touches no ADR has no change finding; its goal can still raise a goal finding", []string{
				"A change that touches no ADR", "no finding of scope `change`", "can still raise a `goal` finding"}}}},
		{"code-review-judge.md", []promptInstruction{
			{"a missing test is a goal finding with the goal behaviour the existing assertions let break", []string{
				"A missing test is a `goal` finding too", "the code is correct", "a specific goal behaviour",
				"existing assertions let break", "every assertion still passes"}},
			{"a finding's scope decides its ruling", []string{
				"`evidence.scope`", "Rule a `goal` finding as you rule a `change` one", "An `outside` finding is `defer`",
				"You read no goal", "is rejected like any other", "a scope exclusion of the goal bars", "is `defer`",
				"`introduced_by_change`", "read true as `change` and false as `outside`"}},
			{"fix and waive are for scope change or goal", []string{
				"for an item whose evidence holds and that lies in the change or stops its goal", "scope `change` or `goal`"}},
		}},
	}
	for _, c := range cases {
		t.Run(c.prompt, func(t *testing.T) {
			t.Parallel()
			data, err := os.ReadFile(filepath.Join(root, homeFolder, "prompts", c.prompt))
			if err != nil {
				t.Fatal(err)
			}
			for _, instruction := range c.instructions {
				if !carries(string(data), instruction.phrases) {
					t.Errorf("agister/home/prompts/%s lost the instruction %q: no paragraph has all of %q",
						c.prompt, instruction.name, instruction.phrases)
				}
			}
		})
	}
	says := []string{"The input goal says what the change is for", "are claims you check",
		"Its scope exclusions are the owner's", "you cannot override it", "its scope"}
	for _, name := range []string{"adr_review_codex", "adversarial_review", "architecture_review", "clarity_review", "intent_review", "tests_review"} {
		if instruction := parseProcess(t, root, name).Instruction; !carries(instruction, says) {
			t.Errorf("process %s's instruction does not say what its input goal is: it lacks one of %q:\n%s", name, says, instruction)
		}
	}
}

// The intent prompt of the repository carries its duties (LAB-120): it is
// descriptive, not prescriptive, and its finding's requirement quotes the
// goal; its definition of done lists the goal's readings, each quoted from
// its words with the quoted source that settles it or rules it out, names
// the one the change implements with its trace, makes each requirement of
// the goal met or a finding, holds the change to the surface the goal
// speaks of, and reports what goes beyond every reading. It settles a
// reading from the record, the goal, then the ADRs, then the code at the
// base, quotes the settling source in the finding, reports a gap the record
// leaves as a finding, and asks no one to decide (ADR-031 rule 3). An
// instruction is held by its
// short phrases standing in one paragraph, as in
// TestReviewPromptsCarryTheirCoverageContract. The prompt is the
// repository's own, read as it is.
func TestIntentPromptCarriesItsDuties(t *testing.T) {
	t.Parallel()
	const prompt = "code-review-intent.md"
	data, err := os.ReadFile(filepath.Join("..", "..", "..", homeFolder, "prompts", prompt))
	if err != nil {
		t.Fatal(err)
	}
	instructions := []promptInstruction{
		{"descriptive, not prescriptive; a finding's requirement quotes the goal", []string{
			"descriptive, not prescriptive", "You do not prescribe more work", "`requirement` quotes the goal"}},
		{"every reading is listed, each quoted from its words with its settling source quoted", []string{
			"Every reading of the goal is listed, each quoted from its words",
			"the source that settles it or rules it out, quoted", "A reading you ruled out is listed too"}},
		{"the implemented reading is named with its trace", []string{
			"The reading the change implements is named, with the trace that shows it"}},
		{"each requirement of the goal is met or its absence is a finding", []string{
			"Each requirement of the goal is met by the change, or its absence is a finding"}},
		{"the surface the goal speaks of is the one exercised", []string{
			"The surface the goal speaks of", "is the surface the change and its tests exercise",
			"a change proven one layer below is a finding"}},
		{"nothing goes beyond every reading without a stated reason", []string{
			"Nothing in the change goes beyond every reading of the goal without a stated reason"}},
		{"a reading is settled from the record, in order", []string{
			"settle which one holds from the record, in this order", "quote what settles it"}},
		{"an ADR settles a reading; a departure from one is not defensible", []string{
			"the decisions the repository records", "a reading that departs from one is not defensible"}},
		{"the code at the base settles what the record leaves", []string{
			"where those are silent, the code and its tests as they stood at the base"}},
		{"the settling source is quoted in the finding; a gap the record leaves is the finding; no one is asked", []string{
			"a reading the record does not support is a finding", "the source that settles the reading",
			"Only the finding is evidence", "report the gap itself as the finding", "you never ask anyone to"}},
	}
	for _, instruction := range instructions {
		if !carries(string(data), instruction.phrases) {
			t.Errorf("agister/home/prompts/%s lost the instruction %q: no paragraph has all of %q",
				prompt, instruction.name, instruction.phrases)
		}
	}
}

// The architecture prompt of the repository reviews the shape of the
// change (LAB-212, LAB-187): every component the change touches is read as
// it stands at the candidate and asked its own reason to change, which the
// goal is not; a change to how a file is kept is its reader's and writer's
// reason only; a type that carries another component's words is no
// boundary, and a one-to-one copy translates nothing; file formats are the
// language of the outer edges; and the width of a change is evidence. An
// instruction is held by its short phrases standing in one paragraph, as
// in TestReviewPromptsCarryTheirCoverageContract. The prompt is the
// repository's own, read as it is.
func TestArchitecturePromptReviewsTheShapeOfTheChange(t *testing.T) {
	t.Parallel()
	const prompt = "code-review-architecture.md"
	data, err := os.ReadFile(filepath.Join("..", "..", "..", homeFolder, "prompts", prompt))
	if err != nil {
		t.Fatal(err)
	}
	instructions := []promptInstruction{
		{"the subject is the shape of the change", []string{
			"Review the shape of the change", "A finding is about structure",
			"behaviour, tests and documents are evidence for it, not findings of their own"}},
		{"each touched component is read whole and asked its own reason to change", []string{
			"as it stands at the candidate, not only its lines in the diff",
			"its responsibility, its dependencies", "its interfaces", "what is its own reason to change?"}},
		{"the goal is no reason; a file's keeping is its reader's and writer's reason", []string{
			"The goal, or a decision it carries out, is no component's reason to change",
			"is the reason of that file's reader and writer only", "even when the change only removes code",
			"is a finding: name that reason and the dependency or interface that carried it in"}},
		{"separation is judged by its language; a one-to-one copy translates nothing", []string{
			"Separation is judged by its language, not its form", "are no boundary, and a finding",
			"An adapter that copies fields one to one translates nothing", "At the persistence edge such a copy is fine"}},
		{"file formats are the language of the outer edges", []string{
			"the language of the outer edges only", "one reader and written by one writer",
			"A package that parses a format is an edge, whatever its path"}},
		{"the width of the change is evidence", []string{
			"The width of the change is evidence", "the responsibility it would have if no file existed"}},
		{"item 8 asks each touched component's own reason", []string{
			"every component the change touched had a reason of its own to change"}},
	}
	for _, instruction := range instructions {
		if !carries(string(data), instruction.phrases) {
			t.Errorf("agister/home/prompts/%s lost the instruction %q: no paragraph has all of %q",
				prompt, instruction.name, instruction.phrases)
		}
	}
}

// The tests prompt of the repository asks for the class a case stands
// for and a test that covers it, not the one variant (LAB-213), and makes
// a process-wide measure taken as a test's result a finding as it stands,
// serial or not, with the seam that observes the product's own work. An
// instruction is held by its short phrases standing in one paragraph, as
// in TestReviewPromptsCarryTheirCoverageContract. The prompt is the
// repository's own, read as it is.
func TestTestsPromptAsksForTheClassAndTheProductsOwnMeasure(t *testing.T) {
	t.Parallel()
	const prompt = "code-review-tests.md"
	data, err := os.ReadFile(filepath.Join("..", "..", "..", homeFolder, "prompts", prompt))
	if err != nil {
		t.Fatal(err)
	}
	instructions := []promptInstruction{
		{"a finding names the class its case stands for, and a test that covers it", []string{
			"A case stands for a class", "The finding names the class", "with its case as",
			"a test that covers the class", "not the one case"}},
		{"a process-wide measure is a finding as it stands, serial or not", []string{
			"a measure of the whole process", "`testing.AllocsPerRun`", "Running it serially does not isolate it",
			"a finding as it stands", "the seam that observes the product's own work"}},
	}
	for _, instruction := range instructions {
		if !carries(string(data), instruction.phrases) {
			t.Errorf("agister/home/prompts/%s lost the instruction %q: no paragraph has all of %q",
				prompt, instruction.name, instruction.phrases)
		}
	}
}

// The advisor always decides (ADR-032, LAB-206): an option that would
// change the record is excluded, never a reason to ask; the record is
// asked in order, what the decisions say, what they mean, then the code
// that carries them out; and only a defect in the record is a conflict,
// with nothing decided. An instruction is held by its short phrases
// standing in one paragraph, as in
// TestReviewPromptsCarryTheirCoverageContract. The prompt is the
// repository's own, read as it is.
func TestTheAdvisorAlwaysDecides(t *testing.T) {
	t.Parallel()
	const prompt = "advisor.md"
	data, err := os.ReadFile(filepath.Join("..", "..", "..", homeFolder, "prompts", prompt))
	if err != nil {
		t.Fatal(err)
	}
	instructions := []promptInstruction{
		{"the advisor decides", []string{
			"You decide it", "you choose one of the options"}},
		{"an option that would change the record is excluded, never referred", []string{
			"is excluded, with the rule it would change", "never to ask anyone"}},
		{"the record is asked in order", []string{
			"Ask the record, in this order,", "What do the recorded decisions say about the question?",
			"If they are silent or leave a gap: what do they mean?", "what do the code and tests that carry the decisions out show"}},
		{"code is evidence of a decision, and an open reading is settled", []string{
			"Code that carries out a decision is evidence of it", "evidence only of itself",
			"A reading the record leaves open is settled here, not a reason to stop"}},
		{"only a defect in the record is a conflict", []string{
			"Only when every option is excluded", "two recorded decisions contradict each other",
			"answer `conflict`", "Decide nothing: the record is at fault"}},
	}
	for _, instruction := range instructions {
		if !carries(string(data), instruction.phrases) {
			t.Errorf("agister/home/prompts/%s lost the instruction %q: no paragraph has all of %q",
				prompt, instruction.name, instruction.phrases)
		}
	}
}

// The implementer searches the record before it leaves a point open
// (ADR-032 rule 4, LAB-206): it leaves one only when the point blocks the
// work, the record searched does not settle it and its options differ in
// what can be observed, says what it searched, and leaves at most one. The
// instruction is held by its short phrases standing in one paragraph, as
// in TestReviewPromptsCarryTheirCoverageContract. The prompt is the
// repository's own, read as it is.
func TestTheImplementerSearchesTheRecordBeforeLeavingAPointOpen(t *testing.T) {
	t.Parallel()
	const prompt = "implement.md"
	data, err := os.ReadFile(filepath.Join("..", "..", "..", homeFolder, "prompts", prompt))
	if err != nil {
		t.Fatal(err)
	}
	phrases := []string{"Leave a point open only when all three hold", "searched for it, do not settle it",
		"behaviour a user or a caller can observe, or in a contract", "what you searched",
		"never a point left open", "Leave at most one"}
	if !carries(string(data), phrases) {
		t.Errorf("agister/home/prompts/%s lost the instruction to search before leaving a point open: no paragraph has all of %q",
			prompt, phrases)
	}
}

// The clarity prompt of the repository carries the exception to its rule
// that a change does not edit a recorded decision. An edit a recorded rule
// of the project requires, which brings a document the rule names in line
// with behaviour the change itself built (a done gate), is not such a
// finding; the reviewer quotes the rule and where it stands in the item's
// coverage entry; an edit that says more than the change built, that
// changes a rule, or that no such rule requires is still a finding; and an
// edit the goal expressly directs is the owner's own. The definition of
// done stands in one paragraph, so each phrase is one only that item has.
// An instruction is held by its short phrases standing in one paragraph, as
// in TestReviewPromptsCarryTheirCoverageContract. The prompt is the
// repository's own, read as it is.
func TestClarityPromptCarriesTheDoneGateException(t *testing.T) {
	t.Parallel()
	const prompt = "code-review-clarity.md"
	data, err := os.ReadFile(filepath.Join("..", "..", "..", homeFolder, "prompts", prompt))
	if err != nil {
		t.Fatal(err)
	}
	instructions := []promptInstruction{
		{"an edit a recorded rule of the project requires is not a finding", []string{
			"does not edit a recorded decision", "not such a finding",
			"a recorded rule of the project requires the change to make it", "a document the rule names",
			"behaviour the change itself built", "a done gate", "The owner's rule is the decision"}},
		{"the coverage entry quotes the rule and where it stands", []string{
			"you check it", "the `coverage` entry for this item", "quotes the rule", "where it stands"}},
		{"an edit beyond what the change built, or one no rule requires, is still a finding", []string{
			"still a finding", "says more than the change built", "changes a rule instead of describing behaviour",
			"that no such rule requires stays a finding"}},
		{"an edit the goal expressly directs is the owner's own", []string{
			"An edit the goal expressly directs", "the owner's own", "not a finding either"}},
	}
	for _, instruction := range instructions {
		if !carries(string(data), instruction.phrases) {
			t.Errorf("agister/home/prompts/%s lost the instruction %q: no paragraph has all of %q",
				prompt, instruction.name, instruction.phrases)
		}
	}
}

// A hand observation is no proof (LAB-163). The clarity prompt makes a
// comment that records an observation, a hand check or history a major
// finding, to be proved by a test or removed (LAB-216), and the implement
// prompt asks for none (LAB-215); the tests prompt
// makes a changed setting value a changed behaviour, proved by a contract
// test where it claims how an external tool behaves. An instruction is
// held by its short phrases standing in one paragraph, as in
// TestReviewPromptsCarryTheirCoverageContract. The prompts are the
// repository's own, read as they are.
func TestReviewPromptsRefuseHandObservationsAsProof(t *testing.T) {
	t.Parallel()
	cases := []struct {
		prompt      string
		instruction promptInstruction
	}{
		{"code-review-clarity.md", promptInstruction{"a comment recording an observation, a hand check or history is a finding", []string{
			"A comment that records an observation", "a check done by hand", "history", "is a finding",
			"behaviour a test should prove", "names that test", "severity `major`", "misleads the next reader",
			"has no place in the change", "asks for it removed"}}},
		{"implement.md", promptInstruction{"a comment says why, and history has no place in the change", []string{
			"A comment says why the code is as it is now", "has no place", "in the change",
			"a behaviour you saw", "is proved by a test"}}},
		{"code-review-tests.md", promptInstruction{"a changed setting value is a changed behaviour, proved by a contract test", []string{
			"A changed setting value is a changed", "how an external tool behaves", "a contract test against that",
			"a hand observation is no test", "the value that could be wrong while every test stays green"}}},
	}
	for _, c := range cases {
		data, err := os.ReadFile(filepath.Join("..", "..", "..", homeFolder, "prompts", c.prompt))
		if err != nil {
			t.Fatal(err)
		}
		if !carries(string(data), c.instruction.phrases) {
			t.Errorf("agister/home/prompts/%s lost the instruction %q: no paragraph has all of %q",
				c.prompt, c.instruction.name, c.instruction.phrases)
		}
	}
}

// Three prompts name AGENTS.md, and none as a pointer to guidance, which
// ADR-028 rule 13 forbids (LAB-161's audit). implement leaves the testing
// command to the agent's skills and AGENTS.md: where the full suite is too
// slow to run on every change (iFora's takes 15 minutes), choosing the
// tests is the agent's judgement, which no verification can make. advisor
// rules from AGENTS.md as material; code-review-clarity reviews an edit to
// it.
func TestPromptsNameAgentsMDOnlyAsMaterial(t *testing.T) {
	t.Parallel()
	cases := []struct {
		prompt  string
		phrases []string
	}{
		{"implement.md", []string{"run your testing command", "as your skills and the", "repository's AGENTS.md describe it"}},
		{"advisor.md", []string{"`AGENTS.md` file", "the project's decisions record"}},
		{"code-review-clarity.md", []string{"A change does not edit a recorded decision", "AGENTS.md", "is a finding"}},
	}
	for _, c := range cases {
		data, err := os.ReadFile(filepath.Join("..", "..", "..", homeFolder, "prompts", c.prompt))
		if err != nil {
			t.Fatal(err)
		}
		if !carries(string(data), c.phrases) {
			t.Errorf("agister/home/prompts/%s no longer names AGENTS.md as it did: no paragraph has all of %q", c.prompt, c.phrases)
		}
	}
}

// carries holds for phrases that stand in one paragraph, the first or a
// later one, wrapped across its lines or not; it does not for a missing
// phrase, for phrases that stand in different paragraphs, and for a phrase
// that is only part of a longer one.
func TestCarries(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name, prompt string
		phrases      []string
		want         bool
	}{
		{"one paragraph", "Report it in `coverage` as `checked`.", []string{"`coverage`", "`checked`"}, true},
		{"a later paragraph", "Review the change.\n\nReport it in `coverage` as `checked`.", []string{"`coverage`", "`checked`"}, true},
		{"a phrase wrapped across lines", "Report every numbered\n   item in `coverage`.", []string{"every numbered item", "`coverage`"}, true},
		{"a missing phrase", "Report it in `coverage` as `checked`.", []string{"`coverage`", "`finding`"}, false},
		{"phrases in different paragraphs", "Report it in `coverage`.\n\nIts status is `checked`.", []string{"`coverage`", "`checked`"}, false},
		{"phrases apart by a line of blanks", "Report it in `coverage`.\n \t\nIts status is `checked`.", []string{"`coverage`", "`checked`"}, false},
		{"part of a longer phrase", "Report it in `coverage` as `not_checked`.", []string{"`coverage`", "`checked`"}, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			if got := carries(c.prompt, c.phrases); got != c.want {
				t.Fatalf("carries(%q, %q) = %v, want %v", c.prompt, c.phrases, got, c.want)
			}
		})
	}
}

// definitionOfDoneNumbers gives the numbers of the items under the
// "Definition of done" heading, in order, right after it or after a lead-in,
// up to the next heading, markdown or plain. A missing item, a duplicate,
// items from 2 and a bullet (as 0) show in what it gives; an indented
// sub-list is not an item, a list before the heading or under a later
// heading is not part of it, and a prompt without the heading gives none.
func TestDefinitionOfDoneNumbers(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name, prompt string
		want         []int
	}{
		{"a complete list", "Review it.\n\nDefinition of done:\n\n1. One.\n2. Two.\n3. Three.\n", []int{1, 2, 3}},
		{"a lead-in before the items", "Definition of done\n\nIt is in good shape when:\n\n1. One.\n2. Two.\n", []int{1, 2}},
		{"items wrapped and apart", "Definition of done:\n\n1. One,\n   wrapped.\n\n2. Two.\n\nStop once done.\n", []int{1, 2}},
		{"a missing item", "Definition of done:\n\n1. One.\n3. Three.\n", []int{1, 3}},
		{"a duplicate", "Definition of done:\n\n1. One.\n2. Two.\n2. Two again.\n", []int{1, 2, 2}},
		{"an unnumbered item", "Definition of done:\n\n1. One.\n* Bullet.\n2. Two.\n", []int{1, 0, 2}},
		{"an unnumbered item with a dash", "Definition of done:\n\n1. One.\n\n- Bullet.\n", []int{1, 0}},
		{"an indented sub-list", "Definition of done:\n\n1. One:\n   - a part.\n   1. a step.\n2. Two.\n", []int{1, 2}},
		{"a later list under a plain heading", "Definition of done\n\n1. One.\n2. Two.\n\nReview findings\n\n1. Location.\n", []int{1, 2}},
		{"a later list under a markdown heading", "## Definition of done\n\n1. One.\n\n## Findings:\n\n1. Location.\n", []int{1}},
		{"a list before the heading only", "1. Merge.\n2. Sort.\n\nDefinition of done:\n\nEverything is ruled on.\n", nil},
		{"no definition of done", "Review it.\n\n1. One.\n2. Two.\n", nil},
		{"items from 2", "Definition of done:\n\n2. Two.\n3. Three.\n", []int{2, 3}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			if got := definitionOfDoneNumbers(c.prompt); !slices.Equal(got, c.want) {
				t.Fatalf("definitionOfDoneNumbers(%q) = %v, want %v", c.prompt, got, c.want)
			}
		})
	}
}

// promptInstruction is an instruction a prompt gives, by the name a failure
// reports it under, with the short phrases that carry it.
type promptInstruction struct {
	name    string
	phrases []string
}

// blankLine separates two paragraphs of a prompt.
var blankLine = regexp.MustCompile(`\n[ \t]*\n`)

// listItem starts a top-level list item of a prompt: a numbered one, whose
// number it captures, or a bullet.
var listItem = regexp.MustCompile(`^(?:(\d+)\.|[*-]) `)

// carries reports whether one paragraph of prompt has every phrase.
// Whitespace inside a paragraph is one space, so a phrase wrapped across
// lines is found.
func carries(prompt string, phrases []string) bool {
	for _, paragraph := range blankLine.Split(prompt, -1) {
		paragraph = strings.Join(strings.Fields(paragraph), " ")
		lacks := func(phrase string) bool { return !strings.Contains(paragraph, phrase) }
		if !slices.ContainsFunc(phrases, lacks) {
			return true
		}
	}
	return false
}

// definitionOfDoneNumbers returns the numbers of the items of prompt's
// "Definition of done", in order, with 0 for a bullet standing where an item
// could: the top-level list items from the line after that heading to the
// next heading or the end of the prompt. It returns nil without the heading.
func definitionOfDoneNumbers(prompt string) []int {
	_, after, found := strings.Cut(prompt, "Definition of done")
	if !found {
		return nil
	}
	_, after, _ = strings.Cut(after, "\n")
	var numbers []int
	for _, paragraph := range blankLine.Split(after, -1) {
		if isHeading(paragraph) {
			break
		}
		for _, line := range strings.Split(paragraph, "\n") {
			if item := listItem.FindStringSubmatch(line); item != nil {
				number, _ := strconv.Atoi(item[1]) // a bullet has none: 0
				numbers = append(numbers, number)
			}
		}
	}
	return numbers
}

// isHeading reports whether a paragraph of a prompt is a heading: a markdown
// one, or a plain one as the prompts write "Review findings", a single line
// that is not indented, is no list item and ends without punctuation.
func isHeading(paragraph string) bool {
	paragraph = strings.Trim(paragraph, "\n")
	if strings.HasPrefix(paragraph, "#") {
		return true
	}
	plain := paragraph != "" && !strings.Contains(paragraph, "\n") &&
		!strings.HasPrefix(paragraph, " ") && !listItem.MatchString(paragraph)
	return plain && !strings.ContainsAny(paragraph[len(paragraph)-1:], ".,:;!?")
}

// No schema this repository gives to Codex uses a combinator Codex's
// strict structured outputs refuse before the turn starts: oneOf and allOf
// anywhere, anyOf at the root. The schemas are those of the processes a
// node of home's workflows binds to an agent that runs on the codex
// runtime, each laid over the base it extends; the workflows are read from
// the directory, so a new one is checked without listing it here.
func TestSchemasGivenToCodexUseNoRefusedCombinator(t *testing.T) {
	t.Parallel()
	root, err := filepath.Abs(filepath.Join("..", "..", ".."))
	if err != nil {
		t.Fatal(err)
	}
	workflows, err := filepath.Glob(filepath.Join(root, homeFolder, "workflows", "*.yaml"))
	if err != nil {
		t.Fatal(err)
	}
	var nodes []definition.Node
	for _, path := range workflows {
		nodes = append(nodes, parseWorkflow(t, root, strings.TrimSuffix(filepath.Base(path), ".yaml")).Nodes()...)
	}
	checked := map[string]bool{}
	for _, node := range nodes {
		process := parseProcess(t, root, node.Process)
		name := process.Output.Schema
		if name == "" || checked[name] || agentRuntime(t, root, node.Agent) != "codex" {
			continue
		}
		checked[name] = true
		data, err := os.ReadFile(filepath.Join(root, homeFolder, "schemas", name+".json"))
		if err != nil {
			t.Fatal(err)
		}
		var document any
		if err := json.Unmarshal(data, &document); err != nil {
			t.Fatalf("schema %s: %v", name, err)
		}
		if refused := refusedCombinators(document); len(refused) > 0 {
			t.Errorf("schema %s, given to Codex by process %s, uses %v", name, process.Name, refused)
		}
	}
	if !checked["advice"] {
		t.Fatalf("schemas checked: %v, want the advisor's among them", checked)
	}
}

// refusedCombinators finds a root-level oneOf, anyOf and allOf, and a
// oneOf or allOf at any depth; a nested anyOf is none.
func TestRefusedCombinators(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name, document string
		want           []string
	}{
		{"none", `{"type":"object","properties":{"a":{"type":"string"}}}`, nil},
		{"a nested anyOf", `{"type":"object","properties":{"a":{"anyOf":[{"type":"string"},{"type":"null"}]}}}`, nil},
		{"a nested allOf", `{"type":"object","properties":{"a":{"allOf":[{"type":"string"}]}}}`, []string{"allOf at /properties/a"}},
		{"a root oneOf", `{"type":"object","oneOf":[{"required":["a"]}]}`, []string{"oneOf at /"}},
		{"a root anyOf", `{"anyOf":[{"type":"object"}]}`, []string{"anyOf at /"}},
		{"a root allOf", `{"allOf":[{"type":"object"}]}`, []string{"allOf at /"}},
		{"a oneOf in a property", `{"type":"object","properties":{"a":{"oneOf":[{"type":"string"}]}}}`, []string{"oneOf at /properties/a"}},
		{"a oneOf in an array's items", `{"type":"object","properties":{"a":{"type":"array","items":{"oneOf":[{"type":"string"}]}}}}`, []string{"oneOf at /properties/a/items"}},
		{"a oneOf in an anyOf's variant", `{"type":"object","properties":{"a":{"anyOf":[{"type":"null"},{"oneOf":[{"type":"string"}]}]}}}`, []string{"oneOf at /properties/a/anyOf/1"}},
		{"several", `{"allOf":[{"oneOf":[{"type":"object"}]}],"anyOf":[{"type":"object"}]}`, []string{"allOf at /", "anyOf at /", "oneOf at /allOf/0"}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			var document any
			if err := json.Unmarshal([]byte(c.document), &document); err != nil {
				t.Fatal(err)
			}
			if got := refusedCombinators(document); !reflect.DeepEqual(got, c.want) {
				t.Fatalf("refused = %v, want %v", got, c.want)
			}
		})
	}
}

// refusedCombinators are the combinators of a JSON Schema document that
// Codex refuses, each with the place it stands at, sorted: oneOf and allOf
// anywhere, anyOf at the root.
func refusedCombinators(document any) []string {
	var refused []string
	var walk func(node any, at string)
	walk = func(node any, at string) {
		switch node := node.(type) {
		case map[string]any:
			place := at
			if place == "" {
				place = "/"
			}
			for key, value := range node {
				if key == "oneOf" || key == "allOf" || at == "" && key == "anyOf" {
					refused = append(refused, key+" at "+place)
				}
				walk(value, at+"/"+key)
			}
		case []any:
			for i, value := range node {
				walk(value, at+"/"+strconv.Itoa(i))
			}
		}
	}
	walk(document, "")
	sort.Strings(refused)
	return refused
}

// agentRuntime is the runtime of an agent of the home folder.
func agentRuntime(t *testing.T, root, agent string) string {
	t.Helper()
	return parseAgent(t, root, agent).Runtime
}

// modelFamily is the model family of an agent of the home folder.
func modelFamily(t *testing.T, root, agent string) string {
	t.Helper()
	return parseAgent(t, root, agent).ModelFamily
}

// parseAgent parses an agent of the home folder.
func parseAgent(t *testing.T, root, agent string) definition.Agent {
	t.Helper()
	data, err := os.ReadFile(filepath.Join(root, homeFolder, "agents", agent+".toml"))
	if err != nil {
		t.Fatal(err)
	}
	parsed, err := definition.ParseAgent(definition.Document{
		Source: definition.Source{Kind: definition.KindAgent, Name: agent, Path: agent + ".toml"}, Bytes: data,
	})
	if err != nil {
		t.Fatal(err)
	}
	return parsed
}

// The judge runs under no cost limit: its process sets none, so its call's
// effective limits carry none.
func TestTheJudgeHasNoCostLimit(t *testing.T) {
	t.Parallel()
	_, repo, home := onFakeRuntimes(t)
	_, records := judgedReviews(t, home, repo, "code_review")
	effective, ok := records["review_judge"]["effective"].(map[string]any)
	if !ok {
		t.Fatalf("the judge's run records no effective limits: %v", records["review_judge"])
	}
	if limit, set := effective["max_cost_usd"]; set {
		t.Fatalf("the judge's effective cost limit is %v, want none", limit)
	}
}

// The judge runs read-only and with no permission, for 10 minutes at most,
// in one attempt, and is ended after 3 minutes without a runtime event: its
// call's effective limits record each.
func TestTheJudgeRunsUnderItsLimits(t *testing.T) {
	t.Parallel()
	_, repo, home := onFakeRuntimes(t)
	_, records := judgedReviews(t, home, repo, "code_review")
	recorded, ok := records["review_judge"]["effective"]
	if !ok {
		t.Fatalf("the judge's run records no effective limits: %v", records["review_judge"])
	}
	data, err := json.Marshal(recorded)
	if err != nil {
		t.Fatal(err)
	}
	var got domain.EffectivePolicy
	if err := json.Unmarshal(data, &got); err != nil {
		t.Fatalf("the judge's effective limits %s: %v", data, err)
	}
	if got.Access != "read-only" {
		t.Errorf("the judge's workspace access is %q, want read-only", got.Access)
	}
	if len(got.Allow) != 0 || len(got.Permissions) != 0 {
		t.Errorf("the judge is allowed %v and has permissions %v, want none", got.Allow, got.Permissions)
	}
	if got.Timeout != 10*time.Minute {
		t.Errorf("the judge's timeout is %s, want 10m", got.Timeout)
	}
	if got.MaxAttempts != 1 {
		t.Errorf("the judge's attempts are %d, want 1", got.MaxAttempts)
	}
	if want := (domain.StaleLimits{NoEvent: 3 * time.Minute}); got.Stale == nil || *got.Stale != want {
		t.Errorf("the judge's stale limits are %+v, want %+v", got.Stale, want)
	}
}

// The repository's implement runs under no cost limit: its process sets
// none, so its call's effective limits carry none.
func TestImplementHasNoCostLimit(t *testing.T) {
	t.Parallel()
	root, repo, home := onFakeRuntimes(t)
	launch := launchDir("implement")
	args := append([]string{"run", runsAlone(t, root, home, "implement")}, paramArgs(t, launch, parseProcess(t, root, "implement").Params)...)
	created, _ := runRecorded(t, home, filepath.Join(repo, launch), args)
	if len(created) != 1 {
		t.Fatalf("runs recorded: %v, want one", created)
	}
	record := completedRun(t, home, created[0])
	effective, ok := record["effective"].(map[string]any)
	if !ok {
		t.Fatalf("the implement run records no effective limits: %v", record)
	}
	if limit, set := effective["max_cost_usd"]; set {
		t.Fatalf("implement's effective cost limit is %v, want none", limit)
	}
}

// implementerPermissions are the permissions every implementer is allowed
// and has.
var implementerPermissions = []string{
	"repository.read", "repository.search", "repository.diff", "repository.history.read", "repository.write",
	"repository.history.write", "process.execute", "network", "host.read", "host.write",
}

// showProcess is process name as a call of it sees it: what workflow show
// --json prints for the call of the workflow it runs alone through
// (runsAlone), shown from its launchDir in repo.
func showProcess(t *testing.T, home, repo, name string) contract.ProcessView {
	t.Helper()
	workflow := runsAlone(t, repositoryRoot(t), home, name)
	r := agister(t, home, filepath.Join(repo, launchDir(name)), "workflow", "show", workflow, "--json")
	var view contract.WorkflowView
	if err := json.Unmarshal([]byte(r.stdout), &view); err != nil || r.code != 0 || view.Call == nil {
		t.Fatalf("workflow show %s: %d %v\n%s%s", workflow, r.code, err, r.stdout, r.stderr)
	}
	return view.Call.Process
}

// runsAlone is the workflow of one call a test runs process name of the
// home folder alone through: a process runs only as a workflow's node,
// which binds it to its agent (ADR-030 rules 5 and 7). It is home's own
// that calls the process on the agent processAgents lists for it, where one
// does: implement_opus for implement, advisor_codex for the advisor.
// Otherwise it is <name>_alone, which runsAlone writes into the test's
// home, binding the process to the one agent the nodes of home's workflows
// bind it to.
func runsAlone(t *testing.T, root, home, name string) string {
	t.Helper()
	paths, err := filepath.Glob(filepath.Join(root, homeFolder, "workflows", "*.yaml"))
	if err != nil {
		t.Fatal(err)
	}
	agents := map[string]bool{}
	for _, path := range paths {
		workflow := strings.TrimSuffix(filepath.Base(path), ".yaml")
		parsed := parseWorkflow(t, root, workflow)
		if call := parsed.Call; call != nil {
			if call.Process == name && call.Agent == processAgents[name].agent {
				return workflow
			}
			continue
		}
		for _, node := range parsed.Nodes() {
			if node.Process == name {
				agents[node.Agent] = true
			}
		}
	}
	if len(agents) != 1 {
		t.Fatalf("process %s is bound by home's workflows to %v, want one agent", name, slices.Sorted(maps.Keys(agents)))
	}
	workflow := name + "_alone"
	write(t, filepath.Join(home, "workflows", workflow+".yaml"), "schema: agister.workflow/v1alpha1\nname: "+workflow+
		"\ntype: workflow\ncall: {node: "+name+", uses: process:"+name+", agent: "+slices.Collect(maps.Keys(agents))[0]+"}\n")
	return workflow
}

// Each implementer runs read-write on its candidate with every permission
// of implementerPermissions and no denial, for 45 minutes at most, in one
// attempt, and is ended after 21 minutes without a runtime event, 15
// minutes on one tool command or 5 identical tool calls in a row: process
// show prints each.
func TestTheImplementersRunUnderTheirLimits(t *testing.T) {
	t.Parallel()
	_, repo, home := onFakeRuntimes(t)
	for _, name := range implementers {
		view := showProcess(t, home, repo, name)
		if view.Refusal != "" {
			t.Errorf("%s is refused: %s", name, view.Refusal)
		}
		if view.Access != "read-write" || view.Scope != "candidate" {
			t.Errorf("%s's workspace is %s on %s, want read-write on candidate", name, view.Access, view.Scope)
		}
		if !reflect.DeepEqual(view.Allowed, implementerPermissions) || !reflect.DeepEqual(view.Permissions, implementerPermissions) || len(view.Denied) != 0 {
			t.Errorf("%s is allowed %v, denied %v and has %v, want allowed and having %v, denied none",
				name, view.Allowed, view.Denied, view.Permissions, implementerPermissions)
		}
		if view.Timeout != 45*time.Minute {
			t.Errorf("%s's timeout is %s, want 45m", name, view.Timeout)
		}
		if view.MaxAttempts != 1 {
			t.Errorf("%s's attempts are %d, want 1", name, view.MaxAttempts)
		}
		if want := (contract.Stale{NoEvent: 21 * time.Minute, ToolCommand: 15 * time.Minute, RepeatedToolCalls: 5}); view.Stale != want {
			t.Errorf("%s's stale limits are %+v, want %+v", name, view.Stale, want)
		}
	}
}

// callWithheld are what the plan of each workflow of one call withholds of
// what its process allows, by workflow, where it withholds any:
// implement_codex runs on Codex, at a version whose workspace-write home's
// runtime verifies, and its plan withholds network and
// repository.history.write, as it did when implement_codex was a process.
var callWithheld = map[string][]string{
	"implement_codex": {"repository.history.write", "network"},
}

// Each of home's workflows of one call is that call alone (ADR-030 rule
// 6): its file in the home folder holds its schema, name, type and call,
// node implement, which binds process implement to the agent callAgents
// lists for it, and nothing else. workflow show, launched where implement
// runs, shows the call on that agent and its runtime, refused for nothing,
// with implement's params and inputs, among them the brief and its form,
// goal or step, and the plan withholding what callWithheld lists. A run
// given a brief of neither form is refused for it before its runtime
// starts, and its record names the workflow: the brief's form is checked on every agent,
// where implement_codex, implement_pi and implement_pi_glm checked none.
func TestTheImplementWorkflowsCallImplementWithTheBriefsForm(t *testing.T) {
	t.Parallel()
	root, repo, home := onFakeRuntimes(t)
	writableCodex(t, home)
	launch := filepath.Join(repo, launchDir("implement"))
	implement := showProcess(t, home, repo, "implement")
	const brief = "brief <- file (form goal, step)"
	if !slices.Contains(implement.Inputs, brief) {
		t.Fatalf("implement's inputs are %v, want among them %q", implement.Inputs, brief)
	}
	runs := &newRuns{home: home}
	runs.take(t)
	for _, name := range slices.Sorted(maps.Keys(callAgents)) {
		agent := callAgents[name]
		var document map[string]any
		if err := yaml.Unmarshal([]byte(read(t, filepath.Join(root, homeFolder, "workflows", name+".yaml"))), &document); err != nil {
			t.Fatal(err)
		}
		want := map[string]any{
			"schema": "agister.workflow/v1alpha1", "name": name, "type": "workflow",
			"call": map[string]any{"node": "implement", "uses": "process:implement", "agent": agent.agent},
		}
		if !reflect.DeepEqual(document, want) {
			t.Errorf("%s's file holds %v, want %v", name, document, want)
		}

		r := agister(t, home, launch, "workflow", "show", name, "--json")
		var view contract.WorkflowView
		if err := json.Unmarshal([]byte(r.stdout), &view); err != nil || r.code != 0 {
			t.Fatalf("workflow show %s: %d %v\n%s%s", name, r.code, err, r.stdout, r.stderr)
		}
		if view.Refusal != "" || view.Call == nil || len(view.FanOut) != 0 {
			t.Fatalf("%s is refused %q, calls %+v and fans out to %v, want one call refused for nothing", name, view.Refusal, view.Call, view.FanOut)
		}
		call := view.Call.Process
		if view.Call.Name != "implement" || call.Name != "implement" || call.Agent != agent.agent || call.Runtime != agent.runtime || call.Refusal != "" {
			t.Errorf("%s calls node %s, process %s on %s (runtime %s), refused %q, want node implement, process implement on %s (runtime %s), refused for nothing",
				name, view.Call.Name, call.Name, call.Agent, call.Runtime, call.Refusal, agent.agent, agent.runtime)
		}
		if !reflect.DeepEqual(view.Params, implement.Params) || !reflect.DeepEqual(view.Inputs, implement.Inputs) {
			t.Errorf("%s's params are %+v and its inputs %v, want implement's %+v and %v", name, view.Params, view.Inputs, implement.Params, implement.Inputs)
		}
		if !slices.Equal(call.Withheld, callWithheld[name]) {
			t.Errorf("%s's plan withholds %v, want %v", name, call.Withheld, callWithheld[name])
		}

		r = agister(t, home, launch, "run", name, "--quiet", "--param", "candidate=feature", "--param", "brief=AGENTS.md")
		refused := runs.one(t)
		const formless = "input brief: has none of its forms: form goal: "
		if r.code != cli.ExitRefused || refused.record["process"] != name || !strings.Contains(r.stderr, formless) {
			t.Errorf("%s given a brief of neither form: exit %d, run of %v, want refused for %q\n%s", name, r.code, refused.record["process"], formless, r.stderr)
		}
		if kinds := strings.Join(refused.kinds(), " "); strings.Contains(kinds, "PROCESS_STARTED") {
			t.Errorf("%s given a brief of neither form started its runtime: %s", name, kinds)
		}
	}
}

// Each implementer says itself that its call's session may be resumed
// (ADR-030 rule 3): its home file gives session, and none of the layers of
// the agent it runs alone on (runsAlone) does, so that agent is
// fresh-only; the call is not refused for verify:repo, which repairs in
// that session, and its run records a resumable session.
func TestTheImplementersAreResumableOfThemselves(t *testing.T) {
	t.Parallel()
	root, repo, home := onFakeRuntimes(t)
	runs := &newRuns{home: home}
	for _, name := range implementers {
		view := showProcess(t, home, repo, name)
		agent := view.Agent
		if view.Refusal != "" {
			t.Errorf("%s on %s is refused: %s", name, agent, view.Refusal)
		}
		var layers int
		for _, source := range view.Sources {
			if source.Kind != "agents" || source.Name != agent {
				continue
			}
			for _, layer := range source.Layers {
				layers++
				if slices.Contains(layer.Fields, "session") {
					t.Errorf("%s's agent %s is given session by %s, want by no layer", name, agent, layer.Path)
				}
			}
		}
		if layers == 0 {
			t.Errorf("%s's agent %s is composed from no layer: %+v", name, agent, view.Sources)
		}
		var given []string
		for _, source := range view.Sources {
			if source.Kind != "processes" || source.Name != name {
				continue
			}
			for _, layer := range source.Layers {
				if slices.Contains(layer.Fields, "session") {
					given = append(given, layer.Path)
				}
			}
		}
		if want := []string{filepath.Join(home, "processes", name+".yaml")}; !reflect.DeepEqual(given, want) {
			t.Errorf("%s's session is given by %v, want its home file %v", name, given, want)
		}

		launch := launchDir(name)
		args := append([]string{"run", runsAlone(t, root, home, name), "--quiet", "--timeout", "1m"}, paramArgs(t, launch, parseProcess(t, root, name).Params)...)
		r := agister(t, home, filepath.Join(repo, launch), args...)
		last := runs.one(t)
		profile, _ := last.record["profile"].(map[string]any)
		if r.code != cli.ExitCompleted || last.record["agent"] != agent || profile["session"] != definition.SessionResumable {
			t.Errorf("%s's run on the fresh-only %s: exit %d, by %v, as %v, want it completed in a resumable session\n%s",
				name, agent, r.code, last.record["agent"], last.record["profile"], r.stderr)
		}
	}
}

// writableCodex makes home's fake Codex report 0.159.0, the first version
// whose workspace-write home's runtime verifies: implement, on
// codex-sol-61, requires repository.write.
func writableCodex(t *testing.T, home string) {
	t.Helper()
	startThrough(t, home, runtimetest.InProcess{
		Env:   []string{"FAKE_OUTPUT=schema"},
		Fakes: map[string]supervisortest.Fake{"codex": codexAt("0.159.0")},
	})
}

// codexAt is the fake Codex, reporting version as its own.
func codexAt(version string) supervisortest.Fake {
	return func(p fakeproc.Process) int {
		getenv := p.Getenv
		p.Getenv = func(key string) string {
			if key == "FAKE_VERSION" {
				return version
			}
			return getenv(key)
		}
		return fakecodex.Main(p)
	}
}

// The home folder holds no policies/: a layer holds no policies (ADR-030
// rule 4).
func TestTheHomeFolderHoldsNoPolicies(t *testing.T) {
	t.Parallel()
	path := filepath.Join("..", "..", "..", homeFolder, "policies")
	if _, err := os.Stat(path); !errors.Is(err, fs.ErrNotExist) {
		t.Errorf("the home folder holds %s (%v), want none", path, err)
	}
}

// Home has five agents, one for each runtime and model in use (ADR-030
// Migration step 3): agent list prints each with its runtime, model, effort
// and model family, and none refused.
func TestTheHomeFolderHoldsFiveAgents(t *testing.T) {
	t.Parallel()
	_, repo, home := onFakeRuntimes(t)
	r := agister(t, home, repo, "agent", "list")
	want := strings.Join([]string{
		"claude-opus\tclaude-code\topus\thigh\tanthropic",
		"claude-sonnet\tclaude-code\tsonnet\thigh\tanthropic",
		"codex-sol-61\tcodex\tgpt-6.1-sol\thigh\topenai",
		"pi-glm-53\tpi\topencode-go/glm-5.3\thigh\tglm",
		"pi-m3\tpi\topencode-go/minimax-m3\thigh\tminimax",
	}, "\n") + "\n"
	if r.code != 0 || r.stdout != want {
		t.Fatalf("agent list: %d\n%s%s\nwant\n%s", r.code, r.stdout, r.stderr, want)
	}
}

// No process of the home folder names an agent and no agent names a session
// (ADR-030 rules 1 and 2): of the fields of each process file, none is uses,
// and of each agent file, none is session. A workflow's node binds a process
// to its agent, and a process says itself whether its call resumes.
func TestTheHomeFolderNamesNoAgentOnAProcessAndNoSessionOnAnAgent(t *testing.T) {
	t.Parallel()
	root := repositoryRoot(t)
	for _, kind := range []struct{ dir, ext, field string }{
		{"processes", ".yaml", "uses"},
		{"agents", ".toml", "session"},
	} {
		paths, err := filepath.Glob(filepath.Join(root, homeFolder, kind.dir, "*"+kind.ext))
		if err != nil {
			t.Fatal(err)
		}
		if len(paths) == 0 {
			t.Fatalf("the home folder has no %s", kind.dir)
		}
		for _, path := range paths {
			var document map[string]any
			if kind.ext == ".toml" {
				_, err = toml.Decode(read(t, path), &document)
			} else {
				err = yaml.Unmarshal([]byte(read(t, path)), &document)
			}
			if err != nil {
				t.Fatalf("%s: %v", path, err)
			}
			if value, ok := document[kind.field]; ok {
				t.Errorf("%s gives %s %v, want none", path, kind.field, value)
			}
		}
	}
}

// advisorPermissions are the permissions the advisor is allowed and has.
var advisorPermissions = []string{
	"repository.read", "repository.diff", "repository.search", "repository.history.read", "process.execute", "host.read",
}

// The advisor runs read-only on its candidate with every permission of
// advisorPermissions, repository.write, repository.history.write and
// network denied, for 20 minutes at most, in one attempt, and is ended
// after 10 minutes without a runtime event, 8 minutes on one tool command
// or 5 identical tool calls in a row: process show prints each.
func TestTheAdvisorRunsUnderItsLimits(t *testing.T) {
	t.Parallel()
	_, repo, home := onFakeRuntimes(t)
	view := showProcess(t, home, repo, "advisor")
	if view.Refusal != "" {
		t.Errorf("the advisor is refused: %s", view.Refusal)
	}
	if view.Access != "read-only" || view.Scope != "candidate" {
		t.Errorf("the advisor's workspace is %s on %s, want read-only on candidate", view.Access, view.Scope)
	}
	denied := []string{"repository.write", "repository.history.write", "network"}
	if !reflect.DeepEqual(view.Allowed, advisorPermissions) || !reflect.DeepEqual(view.Permissions, advisorPermissions) || !reflect.DeepEqual(view.Denied, denied) {
		t.Errorf("the advisor is allowed %v, denied %v and has %v, want allowed and having %v, denied %v",
			view.Allowed, view.Denied, view.Permissions, advisorPermissions, denied)
	}
	if view.Timeout != 20*time.Minute {
		t.Errorf("the advisor's timeout is %s, want 20m", view.Timeout)
	}
	if view.MaxAttempts != 1 {
		t.Errorf("the advisor's attempts are %d, want 1", view.MaxAttempts)
	}
	if want := (contract.Stale{NoEvent: 10 * time.Minute, ToolCommand: 8 * time.Minute, RepeatedToolCalls: 5}); view.Stale != want {
		t.Errorf("the advisor's stale limits are %+v, want %+v", view.Stale, want)
	}
}

// reviewPermissions are the permissions a review is allowed and has.
var reviewPermissions = []string{
	"repository.read", "repository.diff", "repository.search", "repository.history.read", "process.execute", "host.read",
}

// reviewPrompts are the processes on the review base, each with its
// prompt: code_review's reviewers and adr_review's.
var reviewPrompts = map[string]string{
	"adr_review_codex":    "code-review-adr",
	"adversarial_review":  "code-review-adversarial",
	"architecture_review": "code-review-architecture",
	"clarity_review":      "code-review-clarity",
	"intent_review":       "code-review-intent",
	"tests_review":        "code-review-tests",
}

// gainGuidance are the reviews whose instruction lacked the review base's
// sentence on guidance, and has it on the base: the one intended change of
// their resolution. The intent review lacked it as the ADR and clarity
// reviews did.
var gainGuidance = map[string]bool{"adr_review_codex": true, "clarity_review": true, "intent_review": true}

// guidanceSentence is the review base's sentence on guidance, by its short
// phrases.
var guidanceSentence = []string{"Any guidance given as further inputs", "holds the rules the repository",
	"gives for the code it names", "code in the change that departs from one", "is a finding, which quotes the rule"}

// Each review on the review base, launched where it runs, resolves as it did
// before it extended the base: on codex-sol-61, with base, candidate and
// goal for its params and the review's inputs, a review result for its
// output, read-only on its candidate with every permission of
// reviewPermissions, repository.write, repository.history.write and network
// denied, for 20 minutes at most, in one attempt, ended after 10 minutes
// without a runtime event, 8 minutes on one tool command or 5 identical
// tool calls in a row, with no cost limit, its prompt of reviewPrompts and
// the guidance repositoryGuidance names for it: process show prints each.
// Its instruction is the base's, which says how guidance is used: those of
// gainGuidance gain that sentence, and each asserts it.
func TestTheReviewsResolveAsBefore(t *testing.T) {
	t.Parallel()
	root, repo, home := onFakeRuntimes(t)
	var base struct {
		Input struct {
			Instruction string `yaml:"instruction"`
		} `yaml:"input"`
	}
	if err := yaml.Unmarshal([]byte(read(t, filepath.Join(root, homeFolder, "processes", "review.yaml"))), &base); err != nil {
		t.Fatal(err)
	}
	for _, name := range slices.Sorted(maps.Keys(reviewPrompts)) {
		view := showProcess(t, home, repo, name)
		if view.Refusal != "" {
			t.Errorf("%s is refused: %s", name, view.Refusal)
		}
		if view.Agent != "codex-sol-61" || view.Runtime != "codex" {
			t.Errorf("%s runs on %s (runtime %s), want codex-sol-61 (runtime codex)", name, view.Agent, view.Runtime)
		}
		params := []contract.Param{{Name: "base", Default: "origin/trunk"}, {Name: "candidate", Default: "HEAD"}, {Name: "goal", Required: true}}
		if !reflect.DeepEqual(view.Params, params) {
			t.Errorf("%s's params are %+v, want %+v", name, view.Params, params)
		}
		inputs := []string{"base_revision <- git.revision", "candidate_revision <- git.revision", "changed_files <- git.changed_files", "goal <- param"}
		if !reflect.DeepEqual(view.Inputs, inputs) {
			t.Errorf("%s's inputs are %v, want %v", name, view.Inputs, inputs)
		}
		if view.Output != "json:review-result" {
			t.Errorf("%s's output is %s, want json:review-result", name, view.Output)
		}
		if view.Access != "read-only" || view.Scope != "candidate" {
			t.Errorf("%s's workspace is %s on %s, want read-only on candidate", name, view.Access, view.Scope)
		}
		denied := []string{"repository.write", "repository.history.write", "network"}
		if !reflect.DeepEqual(view.Allowed, reviewPermissions) || !reflect.DeepEqual(view.Permissions, reviewPermissions) || !reflect.DeepEqual(view.Denied, denied) {
			t.Errorf("%s is allowed %v, denied %v and has %v, want allowed and having %v, denied %v",
				name, view.Allowed, view.Denied, view.Permissions, reviewPermissions, denied)
		}
		if view.Timeout != 20*time.Minute || view.MaxAttempts != 1 || view.MaxCostUSD != nil {
			t.Errorf("%s's limits are timeout %s, %d attempts, cost %v, want 20m, 1 and none", name, view.Timeout, view.MaxAttempts, view.MaxCostUSD)
		}
		if want := (contract.Stale{NoEvent: 10 * time.Minute, ToolCommand: 8 * time.Minute, RepeatedToolCalls: 5}); view.Stale != want {
			t.Errorf("%s's stale limits are %+v, want %+v", name, view.Stale, want)
		}
		if guidance := repositoryGuidance[name]; view.Prompt != reviewPrompts[name] || !reflect.DeepEqual(view.Guidance, guidance) {
			t.Errorf("%s's prompt is %s and its guidance %v, want %s and %v", name, view.Prompt, view.Guidance, reviewPrompts[name], guidance)
		}
		instruction := parseProcess(t, root, name).Instruction
		if instruction != base.Input.Instruction {
			t.Errorf("%s's instruction is\n%s\nwant the review base's\n%s", name, instruction, base.Input.Instruction)
		}
		if gainGuidance[name] && !carries(instruction, guidanceSentence) {
			t.Errorf("%s's instruction does not say how guidance is used: it lacks one of %q:\n%s", name, guidanceSentence, instruction)
		}
	}
}

// Each review's file in the home folder holds its schema, name, type, the
// review base it extends and its prompt, and nothing else (ADR-030 rule 9):
// process show names the base's home file among the files the process is
// composed from.
func TestTheReviewsExtendTheReviewBase(t *testing.T) {
	t.Parallel()
	root, repo, home := onFakeRuntimes(t)
	for _, name := range slices.Sorted(maps.Keys(reviewPrompts)) {
		var document map[string]any
		if err := yaml.Unmarshal([]byte(read(t, filepath.Join(root, homeFolder, "processes", name+".yaml"))), &document); err != nil {
			t.Fatal(err)
		}
		want := map[string]any{
			"schema": "agister.process/v1alpha1", "name": name, "type": "process",
			"extends": "process:review", "prompt": reviewPrompts[name],
		}
		if !reflect.DeepEqual(document, want) {
			t.Errorf("%s's file holds %v, want %v", name, document, want)
		}
		view := showProcess(t, home, repo, name)
		var base *contract.DefinitionLayer
		for _, source := range view.Sources {
			if source.Kind != "processes" || source.Name != name {
				continue
			}
			for _, layer := range source.Layers {
				if layer.Process == "review" {
					base = &layer
				}
			}
		}
		if base == nil || base.Layer != "home" || base.Path != filepath.Join(home, "processes", "review.yaml") {
			t.Errorf("%s's base file is %+v, want home's processes/review.yaml", name, base)
		}
	}
}

// check on home, as global settings on the fake runtimes, which report
// versions the mappings verify, finds no problem and plans every node of
// every workflow of the home folder on the agent it binds, none of them
// withholding a permission its process requires (ADR-030 rule 8). It warns
// of nothing but the implement processes' verify:repo, a slot a repository
// fills (ADR-027 rule 3).
func TestCheckOnHomeWarnsOfNoBinding(t *testing.T) {
	t.Parallel()
	root, _, home := onFakeRuntimes(t)
	r := agister(t, home, tempDir(t), "check", "--json")
	var report contract.CheckReport
	if err := json.Unmarshal([]byte(r.stdout), &report); err != nil || r.code != 0 || len(report.Problems) != 0 {
		t.Fatalf("check: %d %v\n%s%s", r.code, err, r.stdout, r.stderr)
	}
	for _, warning := range report.Warnings {
		if !strings.Contains(warning, "names verify:repo, which does not exist") {
			t.Errorf("check warns %q, want only the verify:repo a repository fills", warning)
		}
	}

	paths, err := filepath.Glob(filepath.Join(root, homeFolder, "workflows", "*.yaml"))
	if err != nil {
		t.Fatal(err)
	}
	var want []string
	for _, path := range paths {
		name := strings.TrimSuffix(filepath.Base(path), ".yaml")
		for _, node := range parseWorkflow(t, root, name).Nodes() {
			want = append(want, name+" "+node.Name+": process "+node.Process+", agent "+node.Agent)
		}
	}
	var planned []string
	for _, binding := range report.Bindings {
		planned = append(planned, binding.Workflow+" "+binding.Node+": process "+binding.Process+", agent "+binding.Agent)
		if len(binding.Required) != 0 {
			t.Errorf("workflow %s node %s withholds %v, which process %s requires", binding.Workflow, binding.Node, binding.Required, binding.Process)
		}
	}
	if len(want) == 0 || !reflect.DeepEqual(planned, want) {
		t.Errorf("check plans the bindings %q, want each node of home's workflows %q", planned, want)
	}
}

// implement runs its tests, so it requires process.execute (ADR-030 rule
// 8). On Claude Code only Bash grants it, and Bash grants network as well:
// with network denied, in home's implement as these temp settings deny it,
// Bash is withheld, and the run is refused, naming process.execute, before
// its runtime starts.
func TestImplementWithoutNetworkIsRefusedForProcessExecute(t *testing.T) {
	t.Parallel()
	root, repo, home := onFakeRuntimes(t)
	path := filepath.Join(home, "processes", "implement.yaml")
	text := read(t, path)
	if !strings.Contains(text, "\ntimeout: 45m\n") {
		t.Fatalf("%s: the shipped timeout was not found", path)
	}
	write(t, path, strings.Replace(text, "\ntimeout: 45m\n", "\nisolation:\n  deny: [network]\n\ntimeout: 45m\n", 1))

	before := map[string]bool{}
	for _, entry := range readRuns(t, home) {
		before[entry.Name()] = true
	}
	launch := launchDir("implement")
	args := append([]string{"run", runsAlone(t, root, home, "implement")}, paramArgs(t, launch, parseProcess(t, root, "implement").Params)...)
	r := agister(t, home, filepath.Join(repo, launch), args...)
	const withheld = "required permissions would be withheld: process.execute"
	if r.code != cli.ExitRefused || !strings.Contains(r.stderr, withheld) {
		t.Fatalf("implement without network: exit %d, stderr %q, want refused with %q", r.code, r.stderr, withheld)
	}
	var created []string
	for _, entry := range readRuns(t, home) {
		if !before[entry.Name()] {
			created = append(created, entry.Name())
		}
	}
	if len(created) != 1 {
		t.Fatalf("runs recorded: %v, want one", created)
	}
	if started := processesStarted(filepath.Join(home, "runs", created[0])); len(started) != 0 {
		t.Fatalf("run %s: the runtime started: %v", created[0], started)
	}
}

// projectChecks are the commands of each project's verify:repo, by
// project: each is written from the worktree's root, where it runs
// (ADR-028 rule 2).
var projectChecks = map[string]*regexp.Regexp{
	"agister": regexp.MustCompile(`^agister/scripts/test\.sh$`),
	"warder":  regexp.MustCompile(`^warder/scripts/test\.sh$`),
}

// Each implementer launched at the repository's root is refused before its
// first turn: no layer there fills verify:repo (ADR-028 Migration step 4).
// It runs only as a workflow's node (ADR-030 rule 7): each workflow of one
// call, which calls implement, is refused so, on writableCodex.
func TestImplementersAreRefusedAtTheRoot(t *testing.T) {
	t.Parallel()
	root, repo, home := onFakeRuntimes(t)
	writableCodex(t, home)
	runs := &newRuns{home: home}
	runs.take(t)
	processes := map[string]string{}
	for name := range callAgents {
		processes[name] = parseWorkflow(t, root, name).Call.Process
	}
	for _, name := range slices.Sorted(maps.Keys(processes)) {
		t.Run(name, func(t *testing.T) {
			process := processes[name]
			args := append([]string{"run", name, "--quiet"}, paramArgs(t, ".", parseProcess(t, root, process).Params)...)
			r := agister(t, home, repo, args...)
			reason := "process " + process + ` names verify:repo: verification "repo": not found (expected ` +
				filepath.Join(repo, ".agister", "verifies", "repo.yaml") + " or " + filepath.Join(home, "verifies", "repo.yaml") + ")"
			last := runs.one(t)
			result, _ := last.record["result"].(map[string]any)
			fault, _ := result["error"].(map[string]any)
			if r.code != cli.ExitRefused || last.record["process"] != name || fault["class"] != "refused" || fault["message"] != reason {
				t.Fatalf("run: %d, error %v, want %q\n%s", r.code, fault, reason, r.stderr)
			}
			if kinds := strings.Join(last.kinds(), " "); strings.Contains(kinds, "PROCESS_STARTED") {
				t.Fatalf("the refused call started: %s", kinds)
			}
		})
	}
}

// goPrompts are the Go prompts of the repository's library, prompts/,
// which its layer.yaml lists (ADR-028 rule 9).
var goPrompts = []string{"go-testing-seams", "go-architecture"}

// repositoryGuidance is the guidance the repository's layer sets, by
// process (LAB-161): the implementers, the architecture review and the
// adversarial review get both Go prompts, the tests review the testing
// one. A process it does not name, the clarity and intent reviews and the
// judge among them, gets none.
var repositoryGuidance = map[string][]string{
	"implement":           goPrompts,
	"architecture_review": goPrompts,
	"adversarial_review":  goPrompts,
	"tests_review":        {"go-testing-seams"},
}

// The repository's layer sets, for each process of repositoryGuidance and
// no other, its guidance and no other field. It holds no prompts/, whose
// prompts are read from the library its layer.yaml lists, and no
// verifies/: verify:repo is filled by each project's layer.
func TestTheRepositoryLayerSetsOnlyTheGoGuidance(t *testing.T) {
	t.Parallel()
	root, err := filepath.Abs(filepath.Join("..", "..", ".."))
	if err != nil {
		t.Fatal(err)
	}
	settings := filepath.Join(root, ".agister")
	paths, err := filepath.Glob(filepath.Join(settings, "processes", "*"))
	if err != nil {
		t.Fatal(err)
	}
	set := map[string][]string{}
	for _, path := range paths {
		var document map[string]any
		if err := yaml.Unmarshal([]byte(read(t, path)), &document); err != nil {
			t.Fatalf("%s: %v", path, err)
		}
		guidance, ok := document["guidance"].([]any)
		if len(document) != 1 || !ok {
			t.Fatalf("%s sets %v, want guidance alone", path, document)
		}
		names := []string{}
		for _, name := range guidance {
			names = append(names, name.(string))
		}
		set[strings.TrimSuffix(filepath.Base(path), ".yaml")] = names
	}
	if !reflect.DeepEqual(set, repositoryGuidance) {
		t.Fatalf("the repository's layer sets guidance %v, want %v", set, repositoryGuidance)
	}
	for _, kind := range []string{"prompts", "verifies"} {
		if _, err := os.Lstat(filepath.Join(settings, kind)); !errors.Is(err, fs.ErrNotExist) {
			t.Errorf("%s holds %s/ (%v), want none", settings, kind, err)
		}
	}
}

// The repository's Go prompts say what home's review prompts say (LAB-217):
// go-architecture that a component's types are in its own words, that a
// one-to-one copy translates nothing, that each component a change touches
// has its own reason to change, and that file formats are the language of
// the outer edges; go-testing-seams that serial running does not isolate a
// process-wide measure, and that a test covers the class of cases. An
// instruction is held by its short phrases standing in one paragraph, as
// in TestReviewPromptsCarryTheirCoverageContract. The prompts are the
// repository's own, read as they are.
func TestTheGoPromptsAgreeWithTheReviews(t *testing.T) {
	t.Parallel()
	root, err := filepath.Abs(filepath.Join("..", "..", ".."))
	if err != nil {
		t.Fatal(err)
	}
	cases := []struct {
		prompt       string
		instructions []promptInstruction
	}{
		{"go-architecture", []promptInstruction{
			{"a component's types are in its own words; a copy couples as a shared type does", []string{
				"in its own words", "a copy of another's type", "couples them just the same",
				"Two internal types", "of the same shape are a reason to ask what each component needs"}},
			{"a one-to-one copy translates nothing", []string{
				"copies fields one to one translates nothing", "at the", "persistence edge such a copy is fine"}},
			{"each component a change touches has its own reason to change", []string{
				"its own reason to change", "The goal is no component's reason", "carries that reason in"}},
			{"file formats are the language of the outer edges", []string{
				"the language of the", "outer edges", "one reader and written by one", "A package that",
				"parses a format is an edge, whatever its path"}},
		}},
		{"go-testing-seams", []promptInstruction{
			{"serial does not isolate a process-wide measure", []string{
				"Serial does not isolate a measure of the whole process", "`testing.AllocsPerRun`",
				"the product's own work through a seam it is given"}},
			{"a test covers the class of cases", []string{
				"A test covers the class of cases a behaviour has", "not one example of it"}},
		}},
	}
	for _, c := range cases {
		data, err := os.ReadFile(filepath.Join(root, "prompts", c.prompt+".md"))
		if err != nil {
			t.Fatal(err)
		}
		for _, instruction := range c.instructions {
			if !carries(string(data), instruction.phrases) {
				t.Errorf("prompts/%s.md lost the instruction %q: no paragraph has all of %q",
					c.prompt, instruction.name, instruction.phrases)
			}
		}
	}
}

// implementWorkflows are home's workflows that call implement on Codex and
// on Pi, each named after the process that ran implement's work there
// before ADR-030 (Migration step 3).
var implementWorkflows = []string{"implement_codex", "implement_pi", "implement_pi_glm"}

// Home has one implement process, implement, which implementers lists
// alone: of the home folder's processes, a base left out, it alone is given
// home's implement prompt or completes with the implementation schema.
// implementWorkflows are no processes of the home folder.
func TestHomeHasOneImplementProcess(t *testing.T) {
	t.Parallel()
	root := repositoryRoot(t)
	paths, err := filepath.Glob(filepath.Join(root, homeFolder, "processes", "*.yaml"))
	if err != nil {
		t.Fatal(err)
	}
	bases := homeBases(t, root)
	var found []string
	for _, path := range paths {
		name := strings.TrimSuffix(filepath.Base(path), ".yaml")
		if bases[name] {
			continue
		}
		if process := parseProcess(t, root, name); process.Prompt == "implement" || process.Output.Schema == "implementation" {
			found = append(found, name)
		}
	}
	if want := []string{"implement"}; !slices.Equal(found, want) || !slices.Equal(implementers, want) {
		t.Fatalf("home's implement processes are %v and implementers %v, want %v", found, implementers, want)
	}
	for _, name := range implementWorkflows {
		path := filepath.Join(root, homeFolder, "processes", name+".yaml")
		if _, err := os.Lstat(path); !errors.Is(err, fs.ErrNotExist) {
			t.Errorf("the home folder holds %s (%v), want none", path, err)
		}
	}
}

// The repository's layer sets implement's guidance once: of the documents
// of its layer and its projects', one sets guidance on implement or on one
// of implementWorkflows, the repository's processes/implement.yaml, to the
// Go prompts. A workflow takes the guidance of the process it calls.
func TestTheRepositoryLayerSetsImplementsGuidanceOnce(t *testing.T) {
	t.Parallel()
	root := repositoryRoot(t)
	targets := append([]string{"implement"}, implementWorkflows...)
	set := map[string][]string{}
	for _, layer := range append([]string{"."}, projects...) {
		settings := filepath.Join(root, layer, ".agister")
		err := filepath.WalkDir(settings, func(path string, entry fs.DirEntry, err error) error {
			if err != nil || entry.IsDir() || filepath.Ext(path) != ".yaml" {
				return err
			}
			if !slices.Contains(targets, strings.TrimSuffix(entry.Name(), ".yaml")) {
				return nil
			}
			var document struct {
				Guidance []string `yaml:"guidance"`
			}
			if err := yaml.Unmarshal([]byte(read(t, path)), &document); err != nil {
				return err
			}
			if document.Guidance != nil {
				rel, err := filepath.Rel(root, path)
				if err != nil {
					return err
				}
				set[rel] = document.Guidance
			}
			return nil
		})
		if err != nil {
			t.Fatal(err)
		}
	}
	if want := map[string][]string{filepath.Join(".agister", "processes", "implement.yaml"): goPrompts}; !reflect.DeepEqual(set, want) {
		t.Fatalf("the repository's layers set implement's guidance in %v, want %v", set, want)
	}
}

// givesGuidance checks that the call's guidance is names, in order and no
// other: each the input guidance.<name>, the text of prompts/<name>.md,
// recorded from the repository's layer, which finds it there.
func givesGuidance(t *testing.T, root, repo string, record map[string]any, names ...string) {
	t.Helper()
	var given []string
	inputs, _ := record["inputs"].([]any)
	for _, input := range inputs {
		if name, _ := input.(map[string]any)["name"].(string); strings.HasPrefix(name, "guidance.") {
			given = append(given, strings.TrimPrefix(name, "guidance."))
		}
	}
	if !slices.Equal(given, names) {
		t.Fatalf("%s's guidance = %v, want %v", record["process"], given, names)
	}
	for _, name := range names {
		text, err := os.ReadFile(filepath.Join(root, "prompts", name+".md"))
		if err != nil {
			t.Fatal(err)
		}
		digest := digestOf(string(text))
		if input := inputOf(t, record, "guidance."+name); input["source"] != "prompt" || input["identity"] != "sha256:"+digest {
			t.Fatalf("%s's guidance.%s = %v, want prompts/%s.md (%s)", record["process"], name, input, name, digest)
		}
		file := nearest(definitionOf(t, run{record: record}, "prompts", name))
		if file["layer"] != "repository" || file["path"] != filepath.Join(repo, "prompts", name+".md") || file["sha256"] != digest {
			t.Fatalf("%s's prompt %s recorded from %v, want the repository's prompts/%s.md", record["process"], name, file, name)
		}
	}
}

// Each implement process of the home folder, run alone (runsAlone) in each
// project of the repository, gives its agent the two Go prompts as its guidance, in
// the order the repository's layer sets, each the text of
// prompts/<name>.md, and verifies with that project's verify:repo
// (ADR-028 Migration step 4). That verification is a complete document of
// the project's layer alone, whose command is written from the worktree's
// root: the run's record names that file as the verification's only
// layer, and the run passes the one attempt the fixture's command makes
// (fixVerify).
func TestImplementersAreGivenTheGoPrompts(t *testing.T) {
	t.Parallel()
	root, repo, home := onFakeRuntimes(t)
	for _, project := range projects {
		path := filepath.Join(project, ".agister", "verifies", "repo.yaml")
		data, err := os.ReadFile(filepath.Join(root, path))
		if err != nil {
			t.Fatal(err)
		}
		verification, err := definition.ParseVerify(definition.Document{
			Source: definition.Source{Kind: definition.KindVerify, Name: "repo", Path: path}, Bytes: data,
		})
		if err != nil {
			t.Fatalf("%s is not a complete verification: %v", path, err)
		}
		if !projectChecks[project].MatchString(verification.Verify.Command) {
			t.Fatalf("%s runs %q, want %v", path, verification.Verify.Command, projectChecks[project])
		}
		for _, name := range implementers {
			t.Run(project+" "+name, func(t *testing.T) {
				workflow := runsAlone(t, root, home, name)
				args := append([]string{"run", workflow}, paramArgs(t, project, parseProcess(t, root, name).Params)...)
				if timeout := testTimeouts[workflow]; timeout != "" {
					args = append(args, "--timeout", timeout)
				}
				created, _ := runRecorded(t, home, filepath.Join(repo, project), args)
				if len(created) != 1 {
					t.Fatalf("runs recorded: %v, want one", created)
				}
				record := completedRun(t, home, created[0])
				givesGuidance(t, root, repo, record, repositoryGuidance[name]...)
				source := definitionOf(t, run{record: record}, "verifies", "repo")
				if layers, _ := source["layers"].([]any); len(layers) != 1 || nearest(source)["layer"] != "project" || nearest(source)["path"] != filepath.Join(repo, path) {
					t.Fatalf("verify:repo recorded from %v, want %s alone", source, path)
				}
				attempts, _ := record["attempts"].([]any)
				if len(attempts) != 1 {
					t.Fatalf("attempts = %v, want one", record["attempts"])
				}
				if run, _ := attempts[0].(map[string]any)["run"].(map[string]any); run["command"] != verifyFixture || run["passed"] != true {
					t.Fatalf("verification run = %v, want %q passed", run, verifyFixture)
				}
			})
		}
	}
}

// reviewers are the fan-out processes of code_review.
var reviewers = []string{"architecture_review", "tests_review", "adversarial_review", "clarity_review", "intent_review"}

// Each review of the home folder, run alone (runsAlone) at the root and in
// each project, gives its agent the guidance repositoryGuidance names for it,
// and none where it names none, each the text the implementers are given.
func TestReviewersAreGivenTheirGoGuidance(t *testing.T) {
	t.Parallel()
	root, repo, home := onFakeRuntimes(t)
	for _, launch := range append([]string{"."}, projects...) {
		for _, name := range reviewers {
			t.Run(launch+" "+name, func(t *testing.T) {
				workflow := runsAlone(t, root, home, name)
				args := append([]string{"run", workflow}, paramArgs(t, launch, parseProcess(t, root, name).Params)...)
				if timeout := testTimeouts[workflow]; timeout != "" {
					args = append(args, "--timeout", timeout)
				}
				created, _ := runRecorded(t, home, filepath.Join(repo, launch), args)
				if len(created) != 1 {
					t.Fatalf("runs recorded: %v, want one", created)
				}
				givesGuidance(t, root, repo, completedRun(t, home, created[0]), repositoryGuidance[name]...)
			})
		}
	}
}

// A code_review launched in warder/ gives each review and the judge the
// guidance repositoryGuidance names for it, and each Go prompt a review
// gets has the digest the implement run launched there recorded: the code
// is reviewed under the rules it was written under.
func TestCodeReviewInWarderIsGivenTheImplementersGuidance(t *testing.T) {
	t.Parallel()
	root, repo, home := onFakeRuntimes(t)
	args := append([]string{"run", runsAlone(t, root, home, "implement")}, paramArgs(t, "warder", parseProcess(t, root, "implement").Params)...)
	created, _ := runRecorded(t, home, filepath.Join(repo, "warder"), args)
	if len(created) != 1 {
		t.Fatalf("runs recorded: %v, want one", created)
	}
	implemented := completedRun(t, home, created[0])
	_, records := judgedReviews(t, home, filepath.Join(repo, "warder"), "code_review")
	for _, name := range append(reviewers, "review_judge") {
		givesGuidance(t, root, repo, records[name], repositoryGuidance[name]...)
		for _, prompt := range repositoryGuidance[name] {
			got, want := inputOf(t, records[name], "guidance."+prompt)["identity"], inputOf(t, implemented, "guidance."+prompt)["identity"]
			if got != want {
				t.Fatalf("%s's guidance.%s = %v, the implement run's %v", name, prompt, got, want)
			}
		}
	}
}

// reviewGoal is the text of the goal file judgedReviews gives a review
// workflow, in the goal form: no prompt, settings document or fixture
// holds a line of it.
const reviewGoal = "## Intent\n\nGoal: a failed write is reported to the caller.\n\n" +
	"## Done when\n\nThe caller of a failed write gets its error.\n\n" +
	"## Out of scope\n\nOut of scope: the retry policy.\n\n" +
	"## Open\n\nNone.\n"

// judgedReviews runs a review workflow to completion, with a goal file of
// its own that holds reviewGoal, and is its judge's collection, as each
// node's process and status by node, and the nodes' runs by process, the
// workflow's own run under the workflow's name. It fails unless the judge
// received that collection.
func judgedReviews(t *testing.T, home, repo, workflow string) (reviews map[string]string, records map[string]map[string]any) {
	t.Helper()
	goal := filepath.Join(tempDir(t), "goal.md")
	write(t, goal, reviewGoal)
	created, _ := runRecorded(t, home, repo, []string{"run", workflow, "--param", "base=main", "--param", "candidate=feature", "--param", "goal=" + goal})
	records = map[string]map[string]any{}
	var flow map[string]any
	var flowDir string
	for _, id := range created {
		var record map[string]any
		readJSON(t, filepath.Join(home, "runs", id, "record.json"), &record)
		if record["workflow"] != nil {
			flow, flowDir = record, filepath.Join(home, "runs", id)
			continue
		}
		records[record["process"].(string)] = record
	}
	if flow == nil || flow["result"].(map[string]any)["status"] != "completed" {
		t.Fatalf("workflow run = %v among %v", flow, created)
	}
	records[workflow] = flow

	artifact := flow["workflow"].(map[string]any)["collection"].(map[string]any)
	data, err := os.ReadFile(filepath.Join(flowDir, artifact["path"].(string)))
	if err != nil {
		t.Fatal(err)
	}
	var collection []struct{ Node, Process, Status string }
	if err := json.Unmarshal(data, &collection); err != nil {
		t.Fatal(err)
	}
	reviews = map[string]string{}
	for _, entry := range collection {
		reviews[entry.Node] = entry.Process + " " + entry.Status
	}
	// What the judge received is that collection.
	if got := inputOf(t, records["review_judge"], "reviews")["identity"]; got != artifact["digest"] {
		t.Fatalf("the judge received %v, the collection is %v", got, artifact["digest"])
	}
	return reviews, records
}

// inputOf is a call's recorded input by name.
func inputOf(t *testing.T, record map[string]any, name string) map[string]any {
	t.Helper()
	inputs, _ := record["inputs"].([]any)
	for _, input := range inputs {
		if input := input.(map[string]any); input["name"] == name {
			return input
		}
	}
	t.Fatalf("run %v has no input %s: %v", record["id"], name, inputs)
	return nil
}

// parseProcess is process name of the home folder, laid over the base it
// extends, if any, as the settings compose it (ADR-030 rule 9).
func parseProcess(t *testing.T, root, name string) definition.Process {
	t.Helper()
	process, err := definition.ParseProcess(extendedProcess(t, root, name))
	if err != nil {
		t.Fatal(err)
	}
	return process
}

// extendedProcess is the document of process name in the home folder, laid
// over the base it extends, if any (ADR-030 rule 9).
func extendedProcess(t *testing.T, root, name string) definition.Document {
	t.Helper()
	doc, err := definition.Extended(homeProcess(t, root, name), func(base string) (definition.Document, error) {
		return homeProcess(t, root, base), nil
	})
	if err != nil {
		t.Fatal(err)
	}
	return doc
}

// homeProcess is the document of process name in the home folder, as it is.
func homeProcess(t *testing.T, root, name string) definition.Document {
	t.Helper()
	data, err := os.ReadFile(filepath.Join(root, homeFolder, "processes", name+".yaml"))
	if err != nil {
		t.Fatal(err)
	}
	return definition.Document{Source: definition.Source{Kind: definition.KindProcess, Name: name, Path: name + ".yaml"}, Bytes: data}
}

// parseWorkflow is workflow name of the home folder.
func parseWorkflow(t *testing.T, root, name string) definition.Workflow {
	t.Helper()
	path := filepath.Join(root, homeFolder, "workflows", name+".yaml")
	workflow, err := definition.ParseWorkflow(definition.Document{
		Source: definition.Source{Kind: definition.KindWorkflow, Name: name, Path: path}, Bytes: []byte(read(t, path)),
	})
	if err != nil {
		t.Fatal(err)
	}
	return workflow
}

// homeBases are the bases the home folder's processes extend: each is not
// work, and is run only through the processes that extend it (ADR-030 rule
// 9).
func homeBases(t *testing.T, root string) map[string]bool {
	t.Helper()
	paths, err := filepath.Glob(filepath.Join(root, homeFolder, "processes", "*.yaml"))
	if err != nil {
		t.Fatal(err)
	}
	bases := map[string]bool{}
	for _, path := range paths {
		var document struct {
			Extends string `yaml:"extends"`
		}
		if err := yaml.Unmarshal([]byte(read(t, path)), &document); err != nil {
			t.Fatalf("%s: %v", path, err)
		}
		if base, ok := strings.CutPrefix(document.Extends, "process:"); ok {
			bases[base] = true
		}
	}
	return bases
}

// paramArgs gives base, candidate and revision the test repository's
// revisions, and every other param without a default a file of the
// repository, relative to launch, the directory the call is launched in,
// itself relative to the repository's root: a relative file path is read
// from there (ADR-028 rule 2).
func paramArgs(t *testing.T, launch string, params []definition.Param) []string {
	t.Helper()
	var args []string
	for _, param := range params {
		value, set := "", true
		switch {
		case param.Name == "base":
			value = "main"
		case param.Name == "candidate", param.Name == "revision":
			value = "feature"
		case !param.HasDefault && repoParams[param.Name] != "":
			value = fromLaunch(t, launch, repoParams[param.Name])
		case !param.HasDefault:
			value = fromLaunch(t, launch, fallbackParam)
		default:
			set = false
		}
		if set {
			args = append(args, "--param", param.Name+"="+value)
		}
	}
	return args
}

// fromLaunch is path, relative to the repository's root, relative to
// launch, which is relative to the root as well.
func fromLaunch(t *testing.T, launch, path string) string {
	t.Helper()
	rel, err := filepath.Rel(launch, path)
	if err != nil {
		t.Fatal(err)
	}
	return rel
}

// runRecorded runs agister, requires it to complete, and returns the runs
// it recorded.
func runRecorded(t *testing.T, home, repo string, args []string) ([]string, result) {
	t.Helper()
	before := map[string]bool{}
	for _, entry := range readRuns(t, home) {
		before[entry.Name()] = true
	}
	r := agister(t, home, repo, args...)
	if r.code != cli.ExitCompleted {
		t.Fatalf("%v: exit %d\n%s%s", args, r.code, r.stdout, r.stderr)
	}
	var created []string
	for _, entry := range readRuns(t, home) {
		if !before[entry.Name()] {
			created = append(created, entry.Name())
		}
	}
	return created, r
}

// completedRun is a call's record, which ran on a fake runtime and
// completed.
func completedRun(t *testing.T, home, id string) map[string]any {
	t.Helper()
	dir := filepath.Join(home, "runs", id)
	var record, first map[string]any
	readJSON(t, filepath.Join(dir, "record.json"), &record)
	echo := runtimeEcho(dir)
	if err := json.Unmarshal([]byte(echo), &first); err != nil || first["argv"] == nil {
		t.Fatalf("run %s: the runtime was not a fake: its first line %q; result %v", id, echo, record["result"])
	}
	if result := record["result"].(map[string]any); result["status"] != "completed" {
		t.Fatalf("run %s: result = %v", id, result)
	}
	return record
}

// schemaAccepts checks that the schema the call's record names accepts
// output, and that the CLI printed it.
func schemaAccepts(t *testing.T, record map[string]any, output any, stdout string) {
	t.Helper()
	schemaValidates(t, record, output)
	data, _ := json.Marshal(output)
	var printed any
	if err := json.Unmarshal([]byte(stdout), &printed); err != nil || !reflect.DeepEqual(printed, output) {
		t.Fatalf("stdout %s, recorded output %s: %v", stdout, data, err)
	}
}

// schemaValidates checks that the schema the call's record names accepts
// output.
func schemaValidates(t *testing.T, record map[string]any, output any) {
	t.Helper()
	var schemaPath string
	for _, source := range record["definitions"].([]any) {
		source := source.(map[string]any)
		if source["kind"] == string(definition.KindSchema) {
			schemaPath, _ = nearest(source)["path"].(string)
		}
	}
	document, err := os.ReadFile(schemaPath)
	if err != nil {
		t.Fatalf("schema of %s: %v", record["process"], err)
	}
	data, _ := json.Marshal(output)
	if err := (schema.Validator{}).Validate(document, data); err != nil {
		t.Fatalf("output %s: %v", data, err)
	}
}

// mirror is a repository of the fake of git, given to every composition
// over home, with a base revision on main and a candidate on feature, whose
// working tree's top-level entries link to those of root, .git aside. The
// revisions hold only change.txt, so no checkout and no diff carries the
// links. It returns the repository's record in the fake as well.
func mirror(t *testing.T, root, home string) (string, *gittest.Repository) {
	t.Helper()
	dir, err := filepath.EvalSymlinks(tempDir(t))
	if err != nil {
		t.Fatal(err)
	}
	fake := gittest.New(tempDir(t))
	r := fake.Record(dir)
	r.Commit("main", map[string]string{"change.txt": "one\n"})
	r.Commit("feature", map[string]string{"change.txt": "one\ntwo\n"})
	write(t, filepath.Join(dir, "change.txt"), "one\ntwo\n")
	gitThrough(t, home, fake)

	entries, err := os.ReadDir(root)
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range entries {
		if entry.Name() == ".git" {
			continue
		}
		if err := os.Symlink(filepath.Join(root, entry.Name()), filepath.Join(dir, entry.Name())); err != nil {
			t.Fatal(err)
		}
	}
	return dir, r
}

// fixVerify makes the settings of each of repo's layers, its .agister and
// the .agister of each top-level directory of root that holds one (ADR-028
// rule 1), a directory whose entries link to those of root's, and so are
// that directory and each of the layer's processes and verifies. Every
// file there with a verification command is written with verifyFixture as
// its command and verifyFixtureTimeout as its timeout: a process that
// declares verify inline, and every verify a process names (ADR-010), whose
// command and timeout are top-level keys. Each folder a layer's layer.yaml
// lists is a directory of links too: a link to root's folder would lead out
// of repo, which makes the layer invalid (ADR-028 rule 9). A layer without
// processes, verifies or layer.yaml has none in repo either.
func fixVerify(t *testing.T, root, repo string) {
	t.Helper()
	// expand makes repo's rel, and each directory above it, a directory
	// whose entries link to those of root's rel, where it is still a link.
	var expand func(rel string)
	expand = func(rel string) {
		t.Helper()
		if dir := filepath.Dir(rel); dir != "." {
			expand(dir)
		}
		to := filepath.Join(repo, rel)
		info, err := os.Lstat(to)
		if err != nil {
			t.Fatal(err)
		}
		if info.Mode()&fs.ModeSymlink == 0 {
			return
		}
		from := filepath.Join(root, rel)
		entries, err := os.ReadDir(from)
		if err != nil {
			t.Fatal(err)
		}
		if err := os.Remove(to); err != nil {
			t.Fatal(err)
		}
		if err := os.Mkdir(to, 0o755); err != nil {
			t.Fatal(err)
		}
		for _, entry := range entries {
			if err := os.Symlink(filepath.Join(from, entry.Name()), filepath.Join(to, entry.Name())); err != nil {
				t.Fatal(err)
			}
		}
	}
	// fix links, in place of each link of dir's *.yaml, its file with the
	// command and timeout of the mapping verification picks from its
	// document set to the fixture's, written outside repo: the worktree a
	// call works in holds links only, which the fake of git leaves out of
	// its content (ADR-025). A file whose mapping has no command stays a
	// link to root's.
	fix := func(dir string, verification func(document *yaml.Node) *yaml.Node) {
		t.Helper()
		outside := tempDir(t)
		paths, err := filepath.Glob(filepath.Join(dir, "*.yaml"))
		if err != nil {
			t.Fatal(err)
		}
		for _, path := range paths {
			data, err := os.ReadFile(path)
			if err != nil {
				t.Fatal(err)
			}
			var document yaml.Node
			if err := yaml.Unmarshal(data, &document); err != nil {
				t.Fatalf("%s: %v", path, err)
			}
			verify := verification(document.Content[0])
			command := valueOf(verify, "command")
			if command == nil {
				continue
			}
			command.SetString(verifyFixture)
			if timeout := valueOf(verify, "timeout"); timeout != nil {
				timeout.SetString(verifyFixtureTimeout)
			} else {
				verify.Content = append(verify.Content,
					&yaml.Node{Kind: yaml.ScalarNode, Value: "timeout"},
					&yaml.Node{Kind: yaml.ScalarNode, Value: verifyFixtureTimeout})
			}
			fixed, err := yaml.Marshal(&document)
			if err != nil {
				t.Fatal(err)
			}
			if err := os.Remove(path); err != nil {
				t.Fatal(err)
			}
			written := filepath.Join(outside, filepath.Base(path))
			if err := os.WriteFile(written, fixed, 0o644); err != nil {
				t.Fatal(err)
			}
			if err := os.Symlink(written, path); err != nil {
				t.Fatal(err)
			}
		}
	}

	layers := []string{"."}
	entries, err := os.ReadDir(root)
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range entries {
		if info, err := os.Stat(filepath.Join(root, entry.Name(), ".agister")); entry.IsDir() && err == nil && info.IsDir() {
			layers = append(layers, entry.Name())
		}
	}
	for _, layer := range layers {
		settings := filepath.Join(layer, ".agister")
		expand(settings)
		for kind, verification := range map[string]func(document *yaml.Node) *yaml.Node{
			"processes": func(process *yaml.Node) *yaml.Node { return valueOf(process, "verify") },
			"verifies":  func(verify *yaml.Node) *yaml.Node { return verify },
		} {
			if _, err := os.Stat(filepath.Join(root, settings, kind)); errors.Is(err, fs.ErrNotExist) {
				continue
			} else if err != nil {
				t.Fatal(err)
			}
			expand(filepath.Join(settings, kind))
			fix(filepath.Join(repo, settings, kind), verification)
		}
		data, err := os.ReadFile(filepath.Join(root, settings, "layer.yaml"))
		if errors.Is(err, fs.ErrNotExist) {
			continue
		} else if err != nil {
			t.Fatal(err)
		}
		parsed, err := definition.ParseLayer(data)
		if err != nil {
			t.Fatalf("%s: %v", filepath.Join(root, settings, "layer.yaml"), err)
		}
		for _, folder := range parsed.Prompts {
			expand(filepath.Join(layer, folder))
		}
	}
}

// valueOf is the value of key in mapping, or nil.
func valueOf(mapping *yaml.Node, key string) *yaml.Node {
	if mapping == nil || mapping.Kind != yaml.MappingNode {
		return nil
	}
	for i := 0; i+1 < len(mapping.Content); i += 2 {
		if mapping.Content[i].Value == key {
			return mapping.Content[i+1]
		}
	}
	return nil
}

func readRuns(t *testing.T, home string) []os.DirEntry {
	t.Helper()
	entries, err := os.ReadDir(filepath.Join(home, "runs"))
	if err != nil && !os.IsNotExist(err) {
		t.Fatal(err)
	}
	return entries
}
