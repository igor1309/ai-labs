package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io/fs"
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

	"github.com/igor1309/ai-labs/agister/internal/adapters/git/gittest"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/runtimetest"
	"github.com/igor1309/ai-labs/agister/internal/adapters/schema"
	"github.com/igor1309/ai-labs/agister/internal/cli"
	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
	domain "github.com/igor1309/ai-labs/agister/internal/domain/run"
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

// testTimeouts are the test's own timeouts for a process run, by process
// name, in place of its policy's: the advisor's policy allows 20 minutes,
// implement_pi's 45.
var testTimeouts = map[string]string{
	"advisor":          "1m",
	"implement_pi":     "1m",
	"implement_pi_glm": "1m",
}

// implementers are home's implement processes. Each names verify:repo, a
// slot this repository fills only in its projects' layers, so each is
// launched in a project; at the root it is refused (ADR-028 Migration step
// 4).
var implementers = []string{"implement", "implement_codex", "implement_pi", "implement_pi_glm"}

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

// codexAgents is the agent recorded for each process that runs on Codex, by
// process: each agent is named after its model version.
var codexAgents = map[string]string{
	"adr_review_codex":          "codex-sol-61",
	"adversarial_review_codex":  "codex-sol-61",
	"advisor":                   "codex-sol-61",
	"architecture_review_codex": "codex-sol-61",
	"clarity_review_codex":      "codex-sol-61",
	"intent_review_codex":       "codex-sol-61",
	"tests_review_codex":        "codex-sol-61",
	"implement_codex":           "codex-implementer-sol-61",
}

// staleLimits are the effective staleness limits recorded for each process's
// run, by process, as its policy sets them; a process not listed records
// none.
var staleLimits = func() map[string]domain.StaleLimits {
	implement := domain.StaleLimits{NoEvent: 21 * time.Minute, ToolCommand: 15 * time.Minute, RepeatedToolCalls: 5}
	review := domain.StaleLimits{NoEvent: 10 * time.Minute, ToolCommand: 8 * time.Minute, RepeatedToolCalls: 5}
	return map[string]domain.StaleLimits{
		"implement":                 implement,
		"implement_codex":           implement,
		"implement_pi":              implement,
		"implement_pi_glm":          implement,
		"adr_review_codex":          review,
		"adversarial_review_codex":  review,
		"advisor":                   review,
		"architecture_review_codex": review,
		"clarity_review_codex":      review,
		"intent_review_codex":       review,
		"tests_review_codex":        review,
		"review_judge":              {NoEvent: 3 * time.Minute},
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
// (launchDir). A process that takes a workflow's collection runs only as a
// join: it is run through the workflows, and each must be one's join. A process that names a
// missing agent, policy or schema, a schema that does not compile, an
// unknown input source or a prompt path that does not resolve from the
// repository root fails it. Processes are read from the directory, so a new
// one is tested without listing it here. Each process of codexAgents
// exists, and its run records that agent. Each process's run, a join's
// included, records its staleLimits.
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
	for name := range codexAgents {
		if !slices.Contains(names, name) {
			t.Errorf("process %s, which runs on Codex, is not among the home folder's processes", name)
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
	for _, name := range names {
		process := parseProcess(t, root, name)
		if len(process.Collects()) > 0 {
			joins[name] = true
			continue
		}
		t.Run(name, func(t *testing.T) {
			launch := launchDir(name)
			args := append([]string{"run", name}, paramArgs(t, launch, process.Params)...)
			if timeout := testTimeouts[name]; timeout != "" {
				args = append(args, "--timeout", timeout)
			}
			created, r := runRecorded(t, home, filepath.Join(repo, launch), args)
			if len(created) != 1 {
				t.Fatalf("runs recorded: %v, want one", created)
			}
			record := completedRun(t, home, created[0])
			if slices.Contains(implementers, name) {
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
			if want, ok := codexAgents[name]; ok && record["agent"] != want {
				t.Fatalf("agent = %v, want %s", record["agent"], want)
			}
			recordsStaleLimits(t, record)
			if process.Verify != nil {
				attempts, _ := record["attempts"].([]any)
				if len(attempts) != 1 {
					t.Fatalf("attempts = %v, want one", record["attempts"])
				}
				if run, _ := attempts[0].(map[string]any)["run"].(map[string]any); run["command"] != verifyFixture || run["passed"] != true {
					t.Fatalf("verification run = %v, want %q passed", run, verifyFixture)
				}
			}
			if process.Output.Format == "json" {
				schemaAccepts(t, record, record["result"].(map[string]any)["output"], r.stdout)
			}
		})
	}

	// Every workflow runs its nodes and completes with its join's output.
	workflows, err := filepath.Glob(filepath.Join(root, homeFolder, "workflows", "*.yaml"))
	if err != nil {
		t.Fatal(err)
	}
	joined := map[string]bool{}
	for _, path := range workflows {
		name := strings.TrimSuffix(filepath.Base(path), ".yaml")
		data, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		workflow, err := definition.ParseWorkflow(definition.Document{
			Source: definition.Source{Kind: definition.KindWorkflow, Name: name, Path: path}, Bytes: data,
		})
		if err != nil {
			t.Fatal(err)
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
				recordsStaleLimits(t, child)
				if parent := child["parent"].(map[string]any); parent["run"] != record["id"] || parent["node"] != node["name"] {
					t.Fatalf("node %v: parent %v", node["name"], parent)
				}
				if i == len(nodes)-1 {
					join = child
				}
			}
			// The workflow's output is its join's, which its schema accepts.
			if !reflect.DeepEqual(result["output"], join["result"].(map[string]any)["output"]) {
				t.Fatalf("output %v, join's %v", result["output"], join["result"])
			}
			schemaAccepts(t, join, result["output"], r.stdout)
		})
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
}

// recordsStaleLimits checks that a process's run recorded the effective
// staleness limits staleLimits lists for its process, or none.
func recordsStaleLimits(t *testing.T, record map[string]any) {
	t.Helper()
	process, _ := record["process"].(string)
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
		"architecture": "architecture_review_codex completed",
		"tests":        "tests_review_codex completed",
		"adversarial":  "adversarial_review_codex completed",
		"clarity":      "clarity_review_codex completed",
		"intent":       "intent_review_codex completed",
	}
	if !reflect.DeepEqual(reviews, want) {
		t.Fatalf("code_review's judge collected %v, want %v", reviews, want)
	}

	for _, c := range []struct{ process, prompt string }{
		{"architecture_review_codex", "code-review-architecture"},
		{"tests_review_codex", "code-review-tests"},
		{"adversarial_review_codex", "code-review-adversarial"},
		{"clarity_review_codex", "code-review-clarity"},
		{"intent_review_codex", "code-review-intent"},
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

	if output := parseProcess(t, root, "intent_review_codex").Output; output.Format != "json" || output.Schema != "review-result" {
		t.Fatalf("intent_review_codex's output = %+v, want json of schema review-result", output)
	}
	// The parsed process keeps no require_valid: it is read from the document.
	data, err := os.ReadFile(filepath.Join(root, homeFolder, "processes", "intent_review_codex.yaml"))
	if err != nil {
		t.Fatal(err)
	}
	var document struct {
		Output struct {
			RequireValid bool `yaml:"require_valid"`
		} `yaml:"output"`
	}
	if err := yaml.Unmarshal(data, &document); err != nil {
		t.Fatal(err)
	}
	if !document.Output.RequireValid {
		t.Fatal("intent_review_codex's output.require_valid is not true, want its output required valid")
	}
}

// The intent reviewer reviews the candidate it is given, in the worktree at
// that candidate (ADR-025 rule 2): with HEAD at another commit, the call is
// refused, naming the candidate, and its runtime never starts.
func TestIntentReviewIsRefusedOffItsCandidate(t *testing.T) {
	t.Parallel()
	_, repo, home, recorded := onFakeRuntimesRecorded(t)
	// HEAD moves past feature, the candidate, to a commit of its own.
	head := recorded.Commit("later", map[string]string{"change.txt": "one\ntwo\nthree\n"})
	before := map[string]bool{}
	for _, entry := range readRuns(t, home) {
		before[entry.Name()] = true
	}
	r := agister(t, home, repo, "run", "intent_review_codex", "--param", "base=main", "--param", "candidate=feature", "--param", "goal="+repoGoal)
	const pinned = "a call works on the revision its process pins, and Agister does not move HEAD (ADR-025 rule 2)"
	if r.code != cli.ExitRefused || !strings.Contains(r.stderr, pinned) {
		t.Fatalf("intent_review_codex off its candidate: exit %d, stderr %q, want refused with %q", r.code, r.stderr, pinned)
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
// other than the judge's, in the caller's worktree (ADR-025), and is given the
// question and its standing prompt, the settings prompt advisor (ADR-027
// rule 4). Its output is of the advice schema.
func TestAdvisorAnswersAQuestionFile(t *testing.T) {
	t.Parallel()
	root, repo, home := onFakeRuntimes(t)
	question := filepath.Join(tempDir(t), "question.md")
	write(t, question, "Asked by: workflow run 1, item 2.\nQuestion: which?\nOptions: (a) one; (b) two.\n")
	// The timeout is the test's own: the process's policy allows 20 minutes.
	created, r := runRecorded(t, home, repo, []string{"run", "advisor", "--param", "question=" + question, "--param", "revision=feature", "--timeout", "1m"})
	if len(created) != 1 {
		t.Fatalf("runs recorded: %v, want one", created)
	}
	record := completedRun(t, home, created[0])
	// Its output is the one property advice, which the advice schema
	// accepts: the fake answers with the first variant, owner.
	output := record["result"].(map[string]any)["output"]
	schemaAccepts(t, record, output, r.stdout)
	if want := map[string]any{"advice": map[string]any{"kind": "owner", "reason": "fake"}}; !reflect.DeepEqual(output, want) {
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
	if record["agent"] != "codex-sol-61" {
		t.Fatalf("the advisor's agent = %v, want codex-sol-61", record["agent"])
	}
	if advisor, judge := modelFamily(t, root, "codex-sol-61"), modelFamily(t, root, "claude-judge"); advisor == "" || advisor == judge {
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

// The home folder's advice schema accepts an owner answer with its reason,
// and a decision with its record; it refuses an answer whose payload is the
// other's, a missing field and an unexpected one. The payloads are fixed,
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
	const reason = `"reason":"option (b) changes ADR-001 rule 9"`
	cases := []struct {
		name, output string
		valid        bool
	}{
		{"a decision", `{"advice":{"kind":"decision",` + record + `}}`, true},
		{"owner", `{"advice":{"kind":"owner",` + reason + `}}`, true},
		{"a decision without its record", `{"advice":{"kind":"decision"}}`, false},
		{"a decision with a reason", `{"advice":{"kind":"decision",` + reason + `,` + record + `}}`, false},
		{"a decision with a reason for a record", `{"advice":{"kind":"decision",` + reason + `}}`, false},
		{"owner with a record", `{"advice":{"kind":"owner",` + reason + `,` + record + `}}`, false},
		{"owner with a record for a reason", `{"advice":{"kind":"owner",` + record + `}}`, false},
		{"owner with an empty reason", `{"advice":{"kind":"owner","reason":""}}`, false},
		{"owner with a blank reason", `{"advice":{"kind":"owner","reason":" "}}`, false},
		{"owner without a reason", `{"advice":{"kind":"owner"}}`, false},
		{"an unknown kind", `{"advice":{"kind":"maybe",` + reason + `}}`, false},
		{"no kind, a reason", `{"advice":{` + reason + `}}`, false},
		{"no kind, a record", `{"advice":{` + record + `}}`, false},
		{"no advice", `{}`, false},
		{"null advice", `{"advice":null}`, false},
		{"an answer at the root", `{"kind":"owner",` + reason + `}`, false},
		{"a record without its chosen option", `{"advice":{"kind":"decision",` + recordWithoutChosen + `}}`, false},
		{"an excluded option without its why", `{"advice":{"kind":"decision",` + strings.Replace(record, `,"why":"D-3 excludes it"`, "", 1) + `}}`, false},
		{"an unexpected field", `{"advice":{"kind":"owner",` + reason + `},"note":"x"}`, false},
		{"an unexpected field in an owner answer", `{"advice":{"kind":"owner",` + reason + `,"note":"x"}}`, false},
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
// item missing its benefit, cost or switching condition, and an item with
// an unknown ruling. The payloads are fixed, not built from the schema.
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
		{"an owner item", item("owner", "Rename it, or leave it?", "", benefit, cost, switching), true},
		{"a reject with only its switching condition", item("reject", "", "A case.", `"benefit":""`, `"cost":""`, switching), true},
		{"a defer with only its switching condition", item("defer", "Gap, trigger, done when.", "", `"benefit":""`, `"cost":""`, switching), true},
		{"no benefit", item("waive", "", "", cost, switching), false},
		{"no cost", item("waive", "", "", benefit, switching), false},
		{"no switching condition", item("waive", "", "", benefit, cost), false},
		{"an unknown ruling", item("ignore", "", "", benefit, cost, switching), false},
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
		{"code-review-judge.md", 4, []promptInstruction{
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
				"**blocker**: always fixed", "**major**: fix, or `owner`", "grossly disproportionate",
				"**minor**: fix, or `waive` when the presented cost exceeds the presented benefit",
				"**nit**: `waive`, or fix when the presented benefit exceeds the presented cost"}},
			{"equal or unresolved economics leave the presumption standing", []string{"equal or unresolved", "presumption"}},
			{"the owner keeps its trade-offs and stances; fix or waive of one proven finding is the judge's", []string{
				"**owner**", "a trade-off or a stance only the owner can take",
				"Whether one proven finding is fixed or waived is yours", "when the presented case settles it"}},
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
// an unsupported scope rejected, a goal finding a scope exclusion bars left
// to the owner, and an older collection's introduced_by_change read as a
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
				"You read no goal", "is rejected like any other", "a scope exclusion of the goal bars", "is `owner`",
				"`introduced_by_change`", "read true as `change` and false as `outside`"}},
			{"fix, waive and owner are for scope change or goal", []string{
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
	for _, name := range []string{"adr_review_codex", "adversarial_review_codex", "architecture_review_codex", "clarity_review_codex", "intent_review_codex", "tests_review_codex"} {
		if instruction := parseProcess(t, root, name).Instruction; !carries(instruction, says) {
			t.Errorf("process %s's instruction does not say what its input goal is: it lacks one of %q:\n%s", name, says, instruction)
		}
	}
}

// The intent prompt of the repository carries its duties (LAB-120): it is
// descriptive, not prescriptive, and its finding's requirement quotes the
// goal; its definition of done lists the goal's defensible readings, each
// quoted from its words, names the one the change implements with its
// trace, makes each requirement of the goal met or a finding, holds the
// change to the surface the goal speaks of, and reports what goes beyond
// every reading; and a divergence between two defensible readings is
// reported as such, for the owner to settle. An instruction is held by its
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
		{"the defensible readings are listed, each quoted from its words", []string{
			"The defensible readings of the goal are listed, each quoted from its words"}},
		{"the implemented reading is named with its trace", []string{
			"The reading the change implements is named, with the trace that shows it"}},
		{"each requirement of the goal is met or its absence is a finding", []string{
			"Each requirement of the goal is met by the change, or its absence is a finding"}},
		{"the surface the goal speaks of is the one exercised", []string{
			"The surface the goal speaks of", "is the surface the change and its tests exercise",
			"a change proven one layer below is a finding"}},
		{"nothing goes beyond every reading without a stated reason", []string{
			"Nothing in the change goes beyond every reading of the goal without a stated reason"}},
		{"a divergence between two defensible readings is reported as such, for the owner", []string{
			"A divergence between two defensible readings is reported as such", "a stance only the owner can take"}},
	}
	for _, instruction := range instructions {
		if !carries(string(data), instruction.phrases) {
			t.Errorf("agister/home/prompts/%s lost the instruction %q: no paragraph has all of %q",
				prompt, instruction.name, instruction.phrases)
		}
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
// comment that records an observation, a hand check or history a finding,
// to be proved by a test or moved to the commit message; the tests prompt
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
			"behaviour a test should prove", "names that test", "belongs in the commit message"}}},
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
// anywhere, anyOf at the root. The schemas are those of the processes whose
// agent runs on the codex runtime, read from the directory, so a new one is
// checked without listing it here.
func TestSchemasGivenToCodexUseNoRefusedCombinator(t *testing.T) {
	t.Parallel()
	root, err := filepath.Abs(filepath.Join("..", "..", ".."))
	if err != nil {
		t.Fatal(err)
	}
	processes, err := filepath.Glob(filepath.Join(root, homeFolder, "processes", "*.yaml"))
	if err != nil {
		t.Fatal(err)
	}
	checked := map[string]bool{}
	for _, path := range processes {
		process := parseProcess(t, root, strings.TrimSuffix(filepath.Base(path), ".yaml"))
		name := process.Output.Schema
		if name == "" || checked[name] || agentRuntime(t, root, strings.TrimPrefix(process.Agent, "agent:")) != "codex" {
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

// The judge names no policy: its call's definitions hold its process and no
// policy.
func TestTheJudgeNamesNoPolicy(t *testing.T) {
	t.Parallel()
	_, repo, home := onFakeRuntimes(t)
	_, records := judgedReviews(t, home, repo, "code_review")
	judge := run{record: records["review_judge"]}
	definitionOf(t, judge, string(definition.KindProcess), "review_judge")
	for _, d := range judge.record["definitions"].([]any) {
		if d := d.(map[string]any); d["kind"] == string(definition.KindPolicy) {
			t.Fatalf("the judge's call read policy %v, want none", d["name"])
		}
	}
}

// The repository's implement runs under no cost limit: its policy sets
// none, so its call's effective limits carry none.
func TestImplementHasNoCostLimit(t *testing.T) {
	t.Parallel()
	root, repo, home := onFakeRuntimes(t)
	launch := launchDir("implement")
	args := append([]string{"run", "implement"}, paramArgs(t, launch, parseProcess(t, root, "implement").Params)...)
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

// projectChecks are the commands of each project's verify:repo, by
// project: each is written from the worktree's root, where it runs
// (ADR-028 rule 2).
var projectChecks = map[string]*regexp.Regexp{
	"agister": regexp.MustCompile(`^agister/scripts/test\.sh$`),
	"warder":  regexp.MustCompile(`^warder/scripts/test\.sh$`),
}

// Each implementer launched at the repository's root is refused before its
// first turn: no layer there fills verify:repo (ADR-028 Migration step 4).
func TestImplementersAreRefusedAtTheRoot(t *testing.T) {
	t.Parallel()
	root, repo, home := onFakeRuntimes(t)
	runs := &newRuns{home: home}
	runs.take(t)
	for _, name := range implementers {
		t.Run(name, func(t *testing.T) {
			args := append([]string{"run", name, "--quiet"}, paramArgs(t, ".", parseProcess(t, root, name).Params)...)
			r := agister(t, home, repo, args...)
			reason := "process " + name + ` names verify:repo: verification "repo": not found (expected ` +
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
	"implement":                 goPrompts,
	"implement_codex":           goPrompts,
	"implement_pi":              goPrompts,
	"implement_pi_glm":          goPrompts,
	"architecture_review_codex": goPrompts,
	"adversarial_review_codex":  goPrompts,
	"tests_review_codex":        {"go-testing-seams"},
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

// Each implement process of the home folder, launched in each project of
// the repository, gives its agent the two Go prompts as its guidance, in
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
				args := append([]string{"run", name}, paramArgs(t, project, parseProcess(t, root, name).Params)...)
				if timeout := testTimeouts[name]; timeout != "" {
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
var reviewers = []string{"architecture_review_codex", "tests_review_codex", "adversarial_review_codex", "clarity_review_codex", "intent_review_codex"}

// Each review of the home folder, launched at the root and in each
// project, gives its agent the guidance repositoryGuidance names for it,
// and none where it names none, each the text the implementers are given.
func TestReviewersAreGivenTheirGoGuidance(t *testing.T) {
	t.Parallel()
	root, repo, home := onFakeRuntimes(t)
	for _, launch := range append([]string{"."}, projects...) {
		for _, name := range reviewers {
			t.Run(launch+" "+name, func(t *testing.T) {
				args := append([]string{"run", name}, paramArgs(t, launch, parseProcess(t, root, name).Params)...)
				if timeout := testTimeouts[name]; timeout != "" {
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
	args := append([]string{"run", "implement"}, paramArgs(t, "warder", parseProcess(t, root, "implement").Params)...)
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

func parseProcess(t *testing.T, root, name string) definition.Process {
	t.Helper()
	data, err := os.ReadFile(filepath.Join(root, homeFolder, "processes", name+".yaml"))
	if err != nil {
		t.Fatal(err)
	}
	process, err := definition.ParseProcess(definition.Document{
		Source: definition.Source{Kind: definition.KindProcess, Name: name, Path: name + ".yaml"}, Bytes: data,
	})
	if err != nil {
		t.Fatal(err)
	}
	return process
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
	var printed any
	if err := json.Unmarshal([]byte(stdout), &printed); err != nil || !reflect.DeepEqual(printed, output) {
		t.Fatalf("stdout %s, recorded output %s: %v", stdout, data, err)
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
