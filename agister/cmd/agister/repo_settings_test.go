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
// file of the repository, so a param read as a file resolves.
var repoParams = map[string]string{
	"prompt":   "prompts/code-review-architecture.md",
	"brief":    "prompts/code-review-tests.md",
	"question": "prompts/code-review-tests.md",
}

const fallbackParam = "AGENTS.md"

// testTimeouts are the test's own timeouts for a process run, by process
// name, in place of its policy's: the advisor's policy allows 20 minutes,
// implement_pi's 45.
var testTimeouts = map[string]string{
	"advisor":          "1m",
	"implement_pi":     "1m",
	"implement_pi_glm": "1m",
}

// codexAgents is the agent recorded for each process that runs on Codex, by
// process: each agent is named after its model version.
var codexAgents = map[string]string{
	"adr_review_codex":          "codex-sol-61",
	"adversarial_review_codex":  "codex-sol-61",
	"advisor":                   "codex-sol-61",
	"architecture_review_codex": "codex-sol-61",
	"clarity_review_codex":      "codex-sol-61",
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
		"tests_review_codex":        review,
		"review_judge":              {NoEvent: 3 * time.Minute},
	}
}()

// verifyFixture is the verification command every process that declares
// verify, inline or by name, runs in the test's repository instead of its own: it passes in a
// checkout of the candidate. The real command would run this module's own
// tests, this one included.
const verifyFixture = "grep -qx two change.txt"

// verifyFixtureTimeout is the timeout verifyFixture runs with in place of
// the process's own.
const verifyFixtureTimeout = "30s"

// Every process and workflow of this repository's own settings
// (<repository root>/.agister) runs, as the CLI composes them over a global
// layer, on the fake runtimes, and completes with output its schema
// accepts. A process that takes a workflow's collection runs only as a
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
	entries, err := os.ReadDir(filepath.Join(root, ".agister", "processes"))
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
		t.Fatal("the repository has no processes")
	}
	for name := range codexAgents {
		if !slices.Contains(names, name) {
			t.Errorf("process %s, which runs on Codex, is not among the repository's processes", name)
		}
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
			args := append([]string{"run", name}, paramArgs(process.Params)...)
			if timeout := testTimeouts[name]; timeout != "" {
				args = append(args, "--timeout", timeout)
			}
			created, r := runRecorded(t, home, repo, args)
			if len(created) != 1 {
				t.Fatalf("runs recorded: %v, want one", created)
			}
			record := completedRun(t, home, created[0])
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
	workflows, err := filepath.Glob(filepath.Join(root, ".agister", "workflows", "*.yaml"))
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
			args := append([]string{"run", name}, paramArgs(workflow.Params)...)
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
			t.Errorf("process %s takes a workflow's collection, but no repository workflow joins with it", name)
		}
	}
	for name := range staleLimits {
		if !slices.Contains(names, name) {
			t.Errorf("process %s, which has stale limits, is not among the repository's processes", name)
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
// and fixVerify) with an initialized Agister home, where git and the
// claude, codex and pi that run are fakes, in process.
func onFakeRuntimes(t *testing.T) (root, repo, home string) {
	t.Helper()
	root, err := filepath.Abs(filepath.Join("..", "..", ".."))
	if err != nil {
		t.Fatal(err)
	}

	home = filepath.Join(tempDir(t), "home")
	repo = mirror(t, root, home)
	fixVerify(t, root, repo)
	// The fakes answer as claude, codex and pi, each with an output from
	// the schema it is given, and report their default versions, which the
	// mappings verify (claude-code 2.1.283, codex 0.158.0, pi 0.85.1). No
	// real runtime ever runs, and no ccusage: the starter has none, so
	// Codex turns cost unknown.
	startThrough(t, home, runtimetest.InProcess{Env: []string{"FAKE_OUTPUT=schema"}})
	if r := agisterInput(t, "yes\n", home, tempDir(t), "init"); r.code != 0 {
		t.Fatalf("init: %d %s", r.code, r.stderr)
	}
	return root, repo, home
}

// The judge of code_review rules on the collection of a fixed set of
// reviews: architecture, tests, adversarial and clarity, the ADR review not
// among them.
func TestCodeReviewCollectsItsFourReviews(t *testing.T) {
	t.Parallel()
	_, repo, home := onFakeRuntimes(t)
	reviews, _ := judgedReviews(t, home, repo, "code_review")
	want := map[string]string{
		"architecture": "architecture_review_codex completed",
		"tests":        "tests_review_codex completed",
		"adversarial":  "adversarial_review_codex completed",
		"clarity":      "clarity_review_codex completed",
	}
	if !reflect.DeepEqual(reviews, want) {
		t.Fatalf("code_review's judge collected %v, want %v", reviews, want)
	}
}

// The judge of adr_review rules on the collection of the ADR review alone,
// and the ADR reviewer is given its standing prompt,
// prompts/code-review-adr.md.
func TestADRReviewCollectsTheADRReview(t *testing.T) {
	t.Parallel()
	root, repo, home := onFakeRuntimes(t)
	reviews, records := judgedReviews(t, home, repo, "adr_review")
	want := map[string]string{"adr": "adr_review_codex completed"}
	if !reflect.DeepEqual(reviews, want) {
		t.Fatalf("adr_review's judge collected %v, want %v", reviews, want)
	}

	prompt, err := os.ReadFile(filepath.Join(root, "prompts", "code-review-adr.md"))
	if err != nil {
		t.Fatal(err)
	}
	sum := sha256.Sum256(prompt)
	digest := "sha256:" + hex.EncodeToString(sum[:])
	if given := inputOf(t, records["adr_review_codex"], "review_prompt"); given["source"] != "file" || given["identity"] != digest {
		t.Fatalf("adr_review_codex's review_prompt = %v, want prompts/code-review-adr.md (%s)", given, digest)
	}
}

// The advisor answers a question file on the Codex agent, a model family
// other than the judge's, in a checkout of the revision, and is given the
// question and its standing prompt, prompts/advisor.md. Its output is of
// the advice schema.
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
	// The runtime worked in a checkout of the revision, not in the
	// caller's repository.
	if workspace, _ := record["workspace"].(string); workspace == "" || runtimeCwd(t, home, created[0]) != workspace || workspace == repo {
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
	for name, path := range map[string]string{"question": question, "advisor_prompt": filepath.Join(root, "prompts", "advisor.md")} {
		data, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		sum := sha256.Sum256(data)
		digest := "sha256:" + hex.EncodeToString(sum[:])
		if given := inputOf(t, record, name); given["source"] != "file" || given["identity"] != digest {
			t.Fatalf("advisor's %s = %v, want %s (%s)", name, given, path, digest)
		}
	}
	feature := revision(t, home, repo, "feature")
	if given := inputOf(t, record, "revision"); given["identity"] != feature {
		t.Fatalf("advisor's revision = %v, want feature (%s)", given, feature)
	}
}

// runtimeArgv is the command line a call's fake runtime was started with,
// as the first line of the call's provider.jsonl captures it.
func runtimeArgv(t *testing.T, home, id string) []string {
	t.Helper()
	first := runtimeStart(t, home, id)
	if len(first.Argv) == 0 {
		t.Fatalf("run %s: no argv in provider.jsonl", id)
	}
	return first.Argv
}

// runtimeCwd is the directory a call's fake runtime was started in, as the
// first line of the call's provider.jsonl captures it.
func runtimeCwd(t *testing.T, home, id string) string {
	t.Helper()
	first := runtimeStart(t, home, id)
	if first.Cwd == "" {
		t.Fatalf("run %s: no cwd in provider.jsonl", id)
	}
	return first.Cwd
}

// runtimeStart is the first line of a call's provider.jsonl, which a fake
// runtime writes with its argv and cwd.
func runtimeStart(t *testing.T, home, id string) (first struct {
	Argv []string
	Cwd  string
}) {
	t.Helper()
	provider, err := os.ReadFile(filepath.Join(home, "runs", id, "provider.jsonl"))
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal([]byte(strings.SplitN(string(provider), "\n", 2)[0]), &first); err != nil {
		t.Fatalf("run %s: provider.jsonl %q: %v", id, provider, err)
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

// The repository's advice schema accepts an owner answer with its reason,
// and a decision with its record; it refuses an answer whose payload is the
// other's, a missing field and an unexpected one. The payloads are fixed,
// not built from the schema.
func TestAdviceSchemaTiesTheAnswerToItsPayload(t *testing.T) {
	t.Parallel()
	root, err := filepath.Abs(filepath.Join("..", "..", ".."))
	if err != nil {
		t.Fatal(err)
	}
	document, err := os.ReadFile(filepath.Join(root, ".agister", "schemas", "advice.json"))
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

// The repository's review result schema accepts a review whose coverage
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
	document, err := os.ReadFile(filepath.Join(root, ".agister", "schemas", "review-result.json"))
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

// The repository's judgement schema accepts a judgement with no coverage
// gaps and one whose gaps hold an entry of every status; it refuses a
// judgement without coverage gaps, an entry with an unknown status, an entry
// whose review is not an integer, an entry missing its review, item, status
// or detail, and an entry with an unexpected field. The payloads are fixed,
// not built from the schema.
func TestJudgementSchemaRequiresCoverageGaps(t *testing.T) {
	t.Parallel()
	root, err := filepath.Abs(filepath.Join("..", "..", ".."))
	if err != nil {
		t.Fatal(err)
	}
	document, err := os.ReadFile(filepath.Join(root, ".agister", "schemas", "judgement.json"))
	if err != nil {
		t.Fatal(err)
	}
	const judgement = `"summary":"One fix; the tests review left an item unchecked.","items":[` +
		`{"severity":"major","sources":["1#1","3#2"],"title":"A lost error","ruling":"fix",` +
		`"reason":"The trace shows the error dropped.","action":"Return the error.","missing_evidence":""}]`
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
	processes, err := filepath.Glob(filepath.Join(root, ".agister", "processes", "*.yaml"))
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
		data, err := os.ReadFile(filepath.Join(root, ".agister", "schemas", name+".json"))
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

// agentRuntime is the runtime of a repository agent.
func agentRuntime(t *testing.T, root, agent string) string {
	t.Helper()
	return parseAgent(t, root, agent).Runtime
}

// modelFamily is the model family of a repository agent.
func modelFamily(t *testing.T, root, agent string) string {
	t.Helper()
	return parseAgent(t, root, agent).ModelFamily
}

// parseAgent parses a repository agent.
func parseAgent(t *testing.T, root, agent string) definition.Agent {
	t.Helper()
	data, err := os.ReadFile(filepath.Join(root, ".agister", "agents", agent+".toml"))
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

// The judge runs under no cost limit: its policy sets none, so its call's
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

// The repository's implement runs under no cost limit: its policy sets
// none, so its call's effective limits carry none.
func TestImplementHasNoCostLimit(t *testing.T) {
	t.Parallel()
	root, repo, home := onFakeRuntimes(t)
	args := append([]string{"run", "implement"}, paramArgs(parseProcess(t, root, "implement").Params)...)
	created, _ := runRecorded(t, home, repo, args)
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

// judgedReviews runs a review workflow to completion and is its judge's
// collection, as each node's process and status by node, and the nodes'
// runs by process. It fails unless the judge received that collection.
func judgedReviews(t *testing.T, home, repo, workflow string) (reviews map[string]string, records map[string]map[string]any) {
	t.Helper()
	created, _ := runRecorded(t, home, repo, []string{"run", workflow, "--param", "base=main", "--param", "candidate=feature"})
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
	data, err := os.ReadFile(filepath.Join(root, ".agister", "processes", name+".yaml"))
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
// revisions, and
// every other param without a default a file of the repository.
func paramArgs(params []definition.Param) []string {
	var args []string
	for _, param := range params {
		value, set := "", true
		switch {
		case param.Name == "base":
			value = "main"
		case param.Name == "candidate", param.Name == "revision":
			value = "feature"
		case !param.HasDefault && repoParams[param.Name] != "":
			value = repoParams[param.Name]
		case !param.HasDefault:
			value = fallbackParam
		default:
			set = false
		}
		if set {
			args = append(args, "--param", param.Name+"="+value)
		}
	}
	return args
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
	provider, readErr := os.ReadFile(filepath.Join(dir, "provider.jsonl"))
	if err := json.Unmarshal([]byte(strings.SplitN(string(provider), "\n", 2)[0]), &first); err != nil || first["argv"] == nil {
		t.Fatalf("run %s: the runtime was not a fake: provider.jsonl %q (read error: %v); result %v", id, provider, readErr, record["result"])
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
			schemaPath = source["path"].(string)
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
// links.
func mirror(t *testing.T, root, home string) string {
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
	return dir
}

// fixVerify makes repo's .agister a directory whose entries link to those of
// root's, processes and verifies aside. Each of those two is a directory
// whose entries link to root's, and every file with a verification command
// is written with verifyFixture as its command and verifyFixtureTimeout as
// its timeout: a process that declares verify inline, and every verify a
// process names (ADR-010), whose command and timeout are top-level keys. A
// root without verifies has none in repo either.
func fixVerify(t *testing.T, root, repo string) {
	t.Helper()
	settings := filepath.Join(repo, ".agister")
	if err := os.Remove(settings); err != nil {
		t.Fatal(err)
	}
	// link makes to a directory whose entries link to those of from, except
	// those of aside.
	link := func(from, to string, aside ...string) {
		t.Helper()
		entries, err := os.ReadDir(from)
		if err != nil {
			t.Fatal(err)
		}
		if err := os.Mkdir(to, 0o755); err != nil {
			t.Fatal(err)
		}
		for _, entry := range entries {
			if slices.Contains(aside, entry.Name()) {
				continue
			}
			if err := os.Symlink(filepath.Join(from, entry.Name()), filepath.Join(to, entry.Name())); err != nil {
				t.Fatal(err)
			}
		}
	}
	// fix writes, in place of each link of dir's *.yaml, its file with the
	// command and timeout of the mapping verification picks from its
	// document set to the fixture's; a file whose mapping has no command
	// stays a link.
	fix := func(dir string, verification func(document *yaml.Node) *yaml.Node) {
		t.Helper()
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
			if err := os.WriteFile(path, fixed, 0o644); err != nil {
				t.Fatal(err)
			}
		}
	}

	link(filepath.Join(root, ".agister"), settings, "processes", "verifies")
	link(filepath.Join(root, ".agister", "processes"), filepath.Join(settings, "processes"))
	fix(filepath.Join(settings, "processes"), func(process *yaml.Node) *yaml.Node {
		return valueOf(process, "verify")
	})

	verifies := filepath.Join(root, ".agister", "verifies")
	if _, err := os.Stat(verifies); errors.Is(err, fs.ErrNotExist) {
		return
	} else if err != nil {
		t.Fatal(err)
	}
	link(verifies, filepath.Join(settings, "verifies"))
	fix(filepath.Join(settings, "verifies"), func(verify *yaml.Node) *yaml.Node {
		return verify
	})
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
