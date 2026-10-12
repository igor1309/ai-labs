package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"regexp"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/examples"
	"github.com/igor1309/ai-labs/agister/internal/adapters/fsruns"
	"github.com/igor1309/ai-labs/agister/internal/adapters/git/gittest"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/runtimetest"
	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/cli"
	"github.com/igor1309/ai-labs/agister/internal/contract"
	"github.com/igor1309/ai-labs/gokit/clocktest"
)

// The CLI this package builds, the fake the test that kills it builds, and
// the homes tests copy (homeTemplate) are removed when its tests end.
func TestMain(m *testing.M) {
	code := runtimetest.Run(m)
	os.RemoveAll(homeTemplates.dir)
	os.Exit(code)
}

// agisterBinary builds this CLI once per test binary and returns its path.
func agisterBinary(t testing.TB) string {
	t.Helper()
	return runtimetest.Build(t, "agister", ".", ".")
}

// End-to-end wiring checks: the real composition root and real files, git
// and the runtimes faked in process; a few tests keep real git where their
// claim is the composition on a real repository. Rules are tested below
// this level; these tests prove the pieces are connected.

type result struct {
	code           int
	stdout, stderr string
}

func agister(t *testing.T, home, cwd string, args ...string) result {
	t.Helper()
	return agisterInput(t, "", home, cwd, args...)
}

// agisterInput runs agister with input as what the user types.
func agisterInput(t *testing.T, input, home, cwd string, args ...string) result {
	t.Helper()
	return agisterReading(t, strings.NewReader(input), home, cwd, args...)
}

func agisterReading(t *testing.T, stdin io.Reader, home, cwd string, args ...string) result {
	t.Helper()
	var stdout, stderr bytes.Buffer
	code := cli.Run(context.Background(), append([]string{"--home", home}, args...), cli.IO{
		Stdin: stdin, Stdout: &stdout, Stderr: &stderr, Cwd: cwd,
		Getenv: func(string) string { return "" },
	}, composeInProcess, diagnostics)
	return result{code, stdout.String(), stderr.String()}
}

// starters are the starters tests gave the compositions over their homes
// (startThrough), by home.
var starters sync.Map

// startThrough makes every composition over home in this test start its
// runtimes through starter: fakes with an environment, or reports, of the
// test's own. Its Groups is the composition's (inProcess).
func startThrough(t testing.TB, home string, starter runtimetest.InProcess) {
	starters.Store(home, starter)
	t.Cleanup(func() { starters.Delete(home) })
}

// userCodexHome is the user's CODEX_HOME of the compositions over home: a
// folder of the test's, which none makes unless a test does.
func userCodexHome(home string) string { return filepath.Join(home, "user-codex-home") }

// gits are the fakes of git tests gave the compositions over their homes
// (gitThrough), or realGit for a home on real git (onRealGit), by home.
var gits sync.Map

// realGit marks a home whose compositions keep the real git adapters.
type realGit struct{}

// gitThrough makes every composition over home in this test run over
// fake in place of git.
func gitThrough(t testing.TB, home string, fake *gittest.Fake) {
	gits.Store(home, fake)
	t.Cleanup(func() { gits.Delete(home) })
}

// onRealGit makes every composition over home in this test keep the real
// git adapters: the tests whose claim is the composition on a real
// repository.
func onRealGit(t testing.TB, home string) {
	gits.Store(home, realGit{})
	t.Cleanup(func() { gits.Delete(home) })
}

// fakeGit is the composition's git-backed adapters, all over fake.
func fakeGit(fake *gittest.Fake) gitAdapters {
	return gitAdapters{
		calls: fake, discarder: fake, content: fake, state: fake,
		revision: fake.Revision(), mergeBase: fake.MergeBase(), diff: fake.Diff(), changedFiles: fake.ChangedFiles(),
	}
}

// gitOf is the fake of git the compositions over home run over.
func gitOf(t testing.TB, home string) *gittest.Fake {
	t.Helper()
	fake, ok := gits.Load(home)
	if !ok {
		t.Fatalf("no fake of git for %s", home)
	}
	return fake.(*gittest.Fake)
}

// revision is what name resolves to in the fake repository at repo.
func revision(t testing.TB, home, repo, name string) string {
	t.Helper()
	resolved, err := gitOf(t, home).Revision().Resolve(context.Background(), app.InputSpec{Args: map[string]string{"rev": name}, Cwd: repo})
	if err != nil {
		t.Fatal(err)
	}
	return resolved.Value.(string)
}

// noCheckoutLeft fails the test if a checkout or clean copy the fake of
// git over home made is still there.
func noCheckoutLeft(t testing.TB, home string) {
	t.Helper()
	if left, err := gitOf(t, home).Left(); err != nil || len(left) != 0 {
		t.Fatalf("checkouts left: %v, %v", left, err)
	}
}

// stillAt is the time the clocks that never move are set to.
var stillAt = time.Date(2026, 10, 3, 12, 0, 0, 0, time.UTC)

// inProcess is the process's composition with fakes for its runtimes and
// for the shell of its setup and verification commands, run in process:
// neither is started as a process, and none is looked up on PATH; its
// environment, not the process's, sets CODEX_HOME to userCodexHome, which
// the production wiring reads. Its run
// store signals through appends of its own, as a process of its own does.
// Its turns and commands wait, its observing polls, and its reaps wait for
// a run's readers, on a clock that never moves, not on the wall clock: such a wait passes only on a clock
// the test advances (on). Its runtimes and its commands, a starter the
// test gave its home (startThrough) among them, number their process
// groups from one supervisortest.Groups: no two of its processes share a
// group, as no two of a machine's do. It runs over the fake of git the
// test gave its home, or one that knows no repository; a home on real git keeps the
// process's git adapters, whose worktree coordinator alone keeps the
// process's timer: the kernel gives no event when a lock file is let go,
// so the next attempt at one is due in real time.
func inProcess(config cli.Config) composition {
	c := processIn(config, fsruns.NewAppends(), func(key string) string {
		if key == "CODEX_HOME" {
			return userCodexHome(config.Home)
		}
		return ""
	}, func() (string, error) { return "", errors.New("the compositions in process have no user's home") })
	shared := sharedOf(config.Home)
	groups := shared.groups
	c.starter, c.commands = runtimetest.InProcess{Groups: groups}, runtimetest.InProcess{Groups: groups}
	still := clocktest.NewClock(stillAt)
	c.timer, c.poll, c.readers = still.Timer, still.Timer, still.Timer
	if starter, ok := starters.Load(config.Home); ok {
		starter := starter.(runtimetest.InProcess)
		starter.Groups = groups
		c.starter = starter
	}
	c.starter = echoing{Starter: c.starter, echoes: &shared.echoes}
	switch fake, _ := gits.Load(config.Home); fake := fake.(type) {
	case realGit:
	case *gittest.Fake:
		c.git = fakeGit(fake)
	default:
		c.git = fakeGit(&gittest.Fake{})
	}
	return c
}

// composeInProcess is compose, over inProcess.
func composeInProcess(config cli.Config) (contract.Client, error) {
	client, _, err := inProcess(config).wire(config)
	return client, err
}

// timer is the shape of the composition's timers.
type timer = func(wait time.Duration) (fired <-chan time.Time, stop func())

// timeoutOn is a timer whose waits of timeout are on clock, so the test
// advances a turn's timeout itself; every other wait, a grace or a
// staleness limit, never passes.
func timeoutOn(clock *clocktest.Clock, timeout time.Duration) timer {
	still := clocktest.NewClock(clock.Now())
	return func(wait time.Duration) (<-chan time.Time, func()) {
		if wait == timeout {
			return clock.Timer(wait)
		}
		return still.Timer(wait)
	}
}

// unpolledOn is the process's client, observing the runs it hosts as
// they append: it fails the test if it polls one.
func unpolledOn(t testing.TB, config cli.Config) (contract.Client, error) {
	composed := inProcess(config)
	composed.poll = unpolled(t)
	client, _, err := composed.wire(config)
	return client, err
}

// on is the process's composition, its runtimes in process, with its turns
// and commands waiting on timer.
func on(config cli.Config, timer timer) composition {
	c := inProcess(config)
	c.timer = timer
	return c
}

// agisterOn runs agister as agister does, its turns and commands waiting
// on timer.
func agisterOn(t *testing.T, timer timer, home, cwd string, args ...string) result {
	t.Helper()
	return agisterOver(t, func(config cli.Config) composition { return on(config, timer) }, home, cwd, args...)
}

// agisterOver runs agister as agister does, over the composition composed
// gives.
func agisterOver(t *testing.T, composed func(cli.Config) composition, home, cwd string, args ...string) result {
	t.Helper()
	var stdout, stderr bytes.Buffer
	code := cli.Run(context.Background(), append([]string{"--home", home}, args...), cli.IO{
		Stdin: strings.NewReader(""), Stdout: &stdout, Stderr: &stderr, Cwd: cwd,
		Getenv: func(string) string { return "" },
	}, func(config cli.Config) (contract.Client, error) {
		client, _, err := composed(config).wire(config)
		return client, err
	}, diagnostics)
	return result{code, stdout.String(), stderr.String()}
}

func gitCmd(t *testing.T, dir string, args ...string) string {
	t.Helper()
	command := exec.Command("git", args...)
	command.Dir = dir
	out, err := command.CombinedOutput()
	if err != nil {
		t.Fatalf("git %v: %v\n%s", args, err, out)
	}
	return strings.TrimSpace(string(out))
}

// repository is a real git repository with a base commit on main and a
// candidate on a branch whose content carries the fake runtime's scenario
// marker.
func repository(t *testing.T, scenario string) string {
	// Git reports the repository's real path (on macOS the temp dir sits
	// behind the /var -> /private/var symlink); expectations use the same.
	dir, err := filepath.EvalSymlinks(tempDir(t))
	if err != nil {
		t.Fatal(err)
	}
	gitCmd(t, dir, "init", "--quiet", "--initial-branch=main")
	gitCmd(t, dir, "config", "user.email", "test@example.com")
	gitCmd(t, dir, "config", "user.name", "Test")
	// No detached maintenance (git >= 2.47) may race the directory's cleanup.
	gitCmd(t, dir, "config", "maintenance.auto", "false")
	write(t, filepath.Join(dir, "a.txt"), "one\n")
	gitCmd(t, dir, "add", ".")
	gitCmd(t, dir, "commit", "--quiet", "-m", "base")
	gitCmd(t, dir, "checkout", "--quiet", "-b", "feature")
	write(t, filepath.Join(dir, "a.txt"), "one\ntwo SCENARIO:"+scenario+"\n")
	gitCmd(t, dir, "commit", "--quiet", "-am", "candidate")
	return dir
}

// fakeRepository is a fake of git with one repository, whose revisions are
// repository's and whose working tree holds the candidate.
func fakeRepository(t *testing.T, scenario string) (*gittest.Fake, string) {
	t.Helper()
	fake := gittest.New(tempDir(t))
	return fake, recordRepository(t, fake, scenario)
}

// recordRepository records in fake one more repository, as fakeRepository
// has it, and returns its directory.
func recordRepository(t *testing.T, fake *gittest.Fake, scenario string) string {
	t.Helper()
	dir, err := filepath.EvalSymlinks(tempDir(t))
	if err != nil {
		t.Fatal(err)
	}
	r := fake.Record(dir)
	r.Commit("main", map[string]string{"a.txt": "one\n"})
	candidate := "one\ntwo SCENARIO:" + scenario + "\n"
	r.Commit("feature", map[string]string{"a.txt": candidate})
	write(t, filepath.Join(dir, "a.txt"), candidate)
	return dir
}

// onFakeGit is fakeRepository's repository, its fake given to every
// composition over home.
func onFakeGit(t *testing.T, home, scenario string) string {
	t.Helper()
	fake, dir := fakeRepository(t, scenario)
	gitThrough(t, home, fake)
	return dir
}

// setup: example settings whose agents run claude, which the in-process
// starter runs the fake by, in a repository of the fake of git.
func setup(t *testing.T, scenario string) (home, repo string) {
	home = tempDir(t)
	repo = onFakeGit(t, home, scenario)
	template := homeTemplate(t, "setup-"+scenario, func(template string) {
		setupOn(t, template, onFakeGit(t, template, scenario), "claude")
	})
	if err := os.CopyFS(home, os.DirFS(template)); err != nil {
		t.Fatal(err)
	}
	return home, repo
}

// homeTemplates holds, by key, a home built once per test binary, which
// tests copy into homes of their own in place of making the calls that
// built it: those calls cost the most of this package's time.
var homeTemplates = struct {
	sync.Mutex
	dir   string
	byKey map[string]string
}{byKey: map[string]string{}}

// homeTemplate is the home build made for key, made by the first test
// that asks for it. What build makes must name no test's home or
// repository, or each copy must rewrite it.
func homeTemplate(t *testing.T, key string, build func(home string)) string {
	t.Helper()
	homeTemplates.Lock()
	defer homeTemplates.Unlock()
	if home, ok := homeTemplates.byKey[key]; ok {
		return home
	}
	if homeTemplates.dir == "" {
		dir, err := os.MkdirTemp("", "agister-homes-")
		if err != nil {
			t.Fatal(err)
		}
		homeTemplates.dir = dir
	}
	home, err := os.MkdirTemp(homeTemplates.dir, key+"-")
	if err != nil {
		t.Fatal(err)
	}
	build(home)
	homeTemplates.byKey[key] = home
	return home
}

// setupGit is setup in a real git repository, for the tests whose claim is
// the composition on one.
func setupGit(t *testing.T, scenario string) (home, repo string) {
	home = tempDir(t)
	onRealGit(t, home)
	return setupOn(t, home, repository(t, scenario), "claude")
}

// setupBuilt is setupGit with the agents pointed at the built fake, for the
// one test that kills a real CLI (TestNextCallReapsWhatAKilledRunLeftBehind):
// its runtime is a real process, and so is its git.
func setupBuilt(t *testing.T, scenario string) (home, repo string) {
	home = tempDir(t)
	onRealGit(t, home)
	return setupOn(t, home, repository(t, scenario), runtimetest.Binary(t, "fakeclaude"))
}

// setupOn: example settings in home with agents whose command is claude.
func setupOn(t *testing.T, home, repo, claude string) (string, string) {
	if r := agisterInput(t, "yes\n", home, repo, "init"); r.code != 0 {
		t.Fatalf("init: %d %s", r.code, r.stderr)
	}
	for _, args := range [][]string{
		{"agent", "create", "reviewer", "--force", "--runtime", "claude-code", "--model", "sonnet", "--model-family", "anthropic", "--effort", "high", "--command", claude},
		{"agent", "create", "assistant", "--force", "--runtime", "claude-code", "--model-family", "anthropic", "--command", claude},
	} {
		// Both replace a shipped agent, so each asks.
		if r := agisterInput(t, "yes\n", home, repo, args...); r.code != 0 {
			t.Fatalf("%v: %d %s", args, r.code, r.stderr)
		}
	}
	return home, repo
}

type run struct {
	dir    string
	record map[string]any
	events []map[string]any
	first  map[string]any // the fake's echo: argv, cwd, prompt
}

func lastRun(t *testing.T, home string) run {
	t.Helper()
	entries, _ := os.ReadDir(filepath.Join(home, "runs"))
	if len(entries) == 0 {
		t.Fatal("no runs")
	}
	return readRun(t, filepath.Join(home, "runs", entries[len(entries)-1].Name()))
}

// readRun reads the run recorded in dir.
func readRun(t *testing.T, dir string) run {
	t.Helper()
	var r run
	r.dir = dir
	readJSON(t, filepath.Join(dir, "record.json"), &r.record)
	data, _ := os.ReadFile(filepath.Join(dir, "events.jsonl"))
	for _, line := range strings.Split(strings.TrimSpace(string(data)), "\n") {
		var event map[string]any
		_ = json.Unmarshal([]byte(line), &event)
		r.events = append(r.events, event)
	}
	_ = json.Unmarshal([]byte(runtimeEcho(dir)), &r.first)
	return r
}

func (r run) kinds() []string {
	var kinds []string
	for _, event := range r.events {
		kinds = append(kinds, event["kind"].(string))
	}
	return kinds
}

func (r run) argv() []string {
	var args []string
	for _, arg := range r.first["argv"].([]any) {
		args = append(args, arg.(string))
	}
	return args
}

func TestAgentCallEndToEnd(t *testing.T) {
	t.Parallel()
	home, repo := setup(t, "approve")
	r := agister(t, home, repo, "run", "adversarial_review_reviewer", "--param", "base=main", "--timeout", "1m")
	if r.code != cli.ExitCompleted {
		t.Fatalf("exit %d\n%s", r.code, r.stderr)
	}
	var output map[string]any
	if err := json.Unmarshal([]byte(r.stdout), &output); err != nil || output["verdict"] != "approve" {
		t.Fatalf("stdout = %s", r.stdout)
	}

	last := lastRun(t, home)
	record := last.record
	result := record["result"].(map[string]any)
	if result["status"] != "completed" || record["agent"] != "reviewer" || result["output"].(map[string]any)["verdict"] != "approve" {
		t.Fatalf("record = %v", record)
	}
	// The node result: usage and cost as the runtime reports them, timing as Agister measures it.
	usage, cost, timing := result["usage"].(map[string]any), result["cost"].(map[string]any), result["timing"].(map[string]any)
	if usage["input_tokens"] != 100.0 || usage["cache_write_tokens"] != 5.0 || cost["source"] != "runtime" || cost["usd"] != 0.0123 ||
		timing["runtime_ms"] != 3400.0 || timing["turn_ms"] == nil || result["session"].(map[string]any)["provider_session_id"] != "00000000-0000-4000-8000-000000000000" || record["requested_session_id"] != nil {
		t.Fatalf("result = %v", result)
	}
	// Every definition used is attributed with its digest.
	var kinds []string
	for _, source := range record["definitions"].([]any) {
		source := source.(map[string]any)
		if digest, _ := nearest(source)["sha256"].(string); len(digest) != 64 {
			t.Fatalf("source without digest: %v", source)
		}
		kinds = append(kinds, source["kind"].(string))
	}
	// The workflow whose call the run is comes first (ADR-030 rule 6).
	if strings.Join(kinds, ",") != "workflows,service,processes,agents,runtimes,schemas,prompts" {
		t.Fatalf("definitions = %v", kinds)
	}
	// Inputs are immutable.
	candidate := revision(t, home, repo, "HEAD")
	for _, input := range record["inputs"].([]any) {
		input := input.(map[string]any)
		if input["name"] == "candidate_revision" && (input["identity"] != candidate || input["revision"] != true) {
			t.Fatalf("candidate input = %v", input)
		}
		if input["name"] == "diff" && !strings.HasPrefix(input["identity"].(string), "sha256:") {
			t.Fatalf("diff input = %v", input)
		}
	}
	// Primitives, not permissions, reach the runtime. Under claude-code/3
	// the shipped file tools reach the host, so a review is granted none;
	// Skill it always gets. The review sets no cost limit, so none is sent.
	args := strings.Join(last.argv(), " ")
	if !strings.Contains(args, "--tools=Skill --allowedTools=Skill") || strings.Contains(args, "Read") || strings.Contains(args, "Bash") || strings.Contains(args, "--max-budget-usd") {
		t.Fatalf("argv = %s", args)
	}
	prompt := last.first["prompt"].(string)
	if !strings.HasPrefix(prompt, "## base_revision\n\n") || !strings.Contains(prompt, "## changed_files\n\n- a.txt") {
		t.Fatalf("prompt = %q", prompt)
	}
	// The agent worked in the caller's worktree, at the candidate
	// (ADR-025), and no checkout was made.
	workspace := record["workspace"].(string)
	if last.first["cwd"] != workspace || workspace != repo {
		t.Fatalf("workspace %s, agent cwd %v", workspace, last.first["cwd"])
	}
	noCheckoutLeft(t, home)
	// What the turn did is the run's, not the log's.
	if logged := read(t, filepath.Join(home, "logs", "agister.jsonl")); strings.Contains(logged, `"msg":"turn.`) {
		t.Fatalf("the log holds the turn:\n%s", logged)
	}
	// The plan comes before any runtime process.
	order := strings.Join(last.kinds(), " ")
	if planned := strings.Index(order, "PLANNED"); planned < 0 || planned > strings.Index(order, "PROCESS_STARTED") || !strings.Contains(order, "PERMISSIONS_WITHHELD") {
		t.Fatalf("events = %s", order)
	}
}

func TestShippedExamplesPassCheck(t *testing.T) {
	t.Parallel()
	home, repo := setup(t, "approve")
	r := agister(t, home, repo, "check", "--probe")
	if r.code != 0 || !strings.HasPrefix(r.stdout, "settings OK:") ||
		!strings.Contains(r.stderr, "warning process implement: verify runs its command with the operator's authority") {
		t.Fatalf("exit %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	// A broken setting is found before any call, with every problem listed.
	write(t, filepath.Join(home, "agents", "broken.toml"), "schema = \"agister.agent/v1alpha1\"\nname = \"broken\"\nruntime = \"nowhere\"\n")
	write(t, filepath.Join(home, "schemas", "bad.json"), "{")
	r = agister(t, home, repo, "check")
	if r.code != cli.ExitUsage || !strings.Contains(r.stderr, `agent broken: runtime mapping "nowhere" does not exist`) || !strings.Contains(r.stderr, "schema bad: schema is not JSON") {
		t.Fatalf("exit %d\n%s", r.code, r.stderr)
	}
}

// ownLimits replaces the limits of the shipped ask, or of an example's
// copy of it, at path, from its workspace to its timeout, with limits.
func ownLimits(t *testing.T, path, limits string) {
	t.Helper()
	shipped := regexp.MustCompile(`(?s)\nworkspace:\n.*\ntimeout: 10m\n`)
	text := read(t, path)
	if len(shipped.FindAllString(text, -1)) != 1 {
		t.Fatalf("%s: the shipped limits were not found", path)
	}
	write(t, path, shipped.ReplaceAllLiteralString(text, "\n"+limits))
}

// claudeWriteLimits has ask allow every permission but process.execute, so
// Bash, which grants it, is never selected, and makes the call require
// repository.write. The settings live only in a temp home.
func claudeWriteLimits(t *testing.T, home string) {
	t.Helper()
	ownLimits(t, filepath.Join(home, "processes", "ask.yaml"), `workspace: {access: read-write, scope: repository}
tools:
  allow: [repository.read, repository.search, repository.diff, repository.history.read, repository.write, repository.history.write, network, host.read, host.write]
  require: [repository.write]
timeout: 10m
`)
}

// Edit and Write are verified for 2.1: with host access opted in, a call
// requiring repository writes is planned with them beside the read tools,
// and Claude Code is started with them in its allowlist.
func TestExampleClaudeCodeSettingsGrantTheVerifiedWriteTools(t *testing.T) {
	t.Parallel()
	home, repo := setup(t, "approve")
	service := filepath.Join(home, "service.toml")
	write(t, service, strings.Replace(read(t, service), `state_reaching = ["host.read", "host.write"]`, `state_reaching = []`, 1))
	claudeWriteLimits(t, home)
	r := agister(t, home, repo, "run", "ask_assistant", "--param", "question=What does this repository do?", "--quiet", "--timeout", "1m")
	if r.code != cli.ExitCompleted {
		t.Fatalf("exit %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	last := lastRun(t, home)
	plan := last.record["plan"].(map[string]any)
	if !reflect.DeepEqual(plan["primitives"], []any{"Read", "Glob", "Grep", "Edit", "Write"}) {
		t.Fatalf("plan = %v", plan)
	}
	if args := strings.Join(last.argv(), " "); !strings.Contains(args, "--tools=Read,Glob,Grep,Edit,Write,Skill --allowedTools=Read,Glob,Grep,Edit,Write,Skill") {
		t.Fatalf("argv = %s", args)
	}
}

// Edit and Write reach outside the checkout, so they grant host.write
// beside repository.write: with host.write withheld, as the shipped service
// does, no Claude Code tool can write the repository, and check refuses a
// call requiring repository writes.
func TestExampleClaudeCodeCallRequiringWritesWithoutHostWritesIsRefused(t *testing.T) {
	t.Parallel()
	home, repo := setup(t, "approve")
	claudeWriteLimits(t, home)
	const reason = "process ask: cannot run on agent assistant's runtime claude-code: cannot enforce the effective permissions: required permissions would be withheld: repository.write"
	r := agister(t, home, repo, "check")
	if r.code == 0 || !strings.Contains(r.stdout+r.stderr, reason) {
		t.Fatalf("exit %d\n%s%s", r.code, r.stdout, r.stderr)
	}
}

// init writes the shipped service settings, and a binary file in their
// place (a Finder .DS_Store once landed there) is reported as one problem.
func TestUnreadableServiceSettingsFailCheck(t *testing.T) {
	t.Parallel()
	home, repo := tempDir(t), tempDir(t)
	if r := agisterInput(t, "yes\n", home, repo, "init"); r.code != 0 {
		t.Fatalf("init: %d %s", r.code, r.stderr)
	}
	shipped, err := fs.ReadFile(examples.Settings(), "service.toml")
	if err != nil {
		t.Fatal(err)
	}
	if got := read(t, filepath.Join(home, "service.toml")); got != string(shipped) {
		t.Fatalf("init wrote a service.toml unlike the shipped one: %.40q...", got)
	}
	write(t, filepath.Join(home, "service.toml"), "\x00\x00\x00\x01Bud1\x00\x00")
	r := agister(t, home, repo, "check")
	if r.code != cli.ExitUsage || !strings.Contains(r.stderr, "\nservice service: not a UTF-8 text file\n  stops every command\n1 problem(s)") {
		t.Fatalf("exit %d\n%s", r.code, r.stderr)
	}
}

func TestRefusedCallIsRecorded(t *testing.T) {
	t.Parallel()
	home, repo := setup(t, "approve")
	r := agister(t, home, repo, "run", "no_such_workflow", "--quiet", "--timeout", "1m")
	if r.code != cli.ExitRefused || !strings.Contains(r.stderr, `no workflow "no_such_workflow": agister run runs a workflow (ADR-030 rule 7)`) {
		t.Fatalf("exit %d\n%s", r.code, r.stderr)
	}
	if last := lastRun(t, home); last.record["result"].(map[string]any)["error"].(map[string]any)["class"] != "refused" {
		t.Fatalf("record = %v", last.record)
	}
}

// New kinds of work, contracts and permissions need no code: this call uses
// a vocabulary, runtime mapping, schema and process that exist only here.
func TestSettingsOnlyExtension(t *testing.T) {
	t.Parallel()
	home := tempDir(t)
	repo := onFakeGit(t, home, "approve")
	write(t, filepath.Join(home, "service.toml"), `schema = "agister.service/v1alpha1"
max_timeout = "5m"
permissions = ["docs.read", "docs.write"]
writing = ["docs.write"]
`)
	write(t, filepath.Join(home, "runtimes", "docs-runtime.yaml"), `schema: agister.runtime/v1alpha1
name: docs-runtime
adapter: claude-code
contract: claude-code/3
primitives:
  select: any
  items:
    Read: {grants: [docs.read], verified: ["2.1."]}
    Write: {grants: [docs.write], verified: ["2.1."]}
`)
	write(t, filepath.Join(home, "agents", "writer.toml"), `schema = "agister.agent/v1alpha1"
name = "writer"
runtime = "docs-runtime"
command = "claude"
`)
	write(t, filepath.Join(home, "schemas", "verdict.json"), `{"type":"object","required":["verdict"],"properties":{"verdict":{"enum":["approve","request_changes"]}}}`)
	write(t, filepath.Join(home, "prompts", "check-docs.md"), "Check the docs read as the code does.\n")
	write(t, filepath.Join(home, "processes", "check_docs.yaml"), `schema: agister.process/v1alpha1
name: check_docs
type: process
prompt: check-docs
tools: {allow: [docs.read]}
timeout: 1m
input:
  instruction: Check the documentation.
  params:
    topic: {default: intro}
  values:
    topic: {source: param, name: topic}
output:
  format: json
  schema: verdict
  require_valid: true
`)
	r := agister(t, home, repo, "run", bound(t, home, "check_docs", "writer"), "--quiet", "--timeout", "1m")
	if r.code != cli.ExitCompleted {
		t.Fatalf("exit %d\n%s", r.code, r.stderr)
	}
	if args := strings.Join(lastRun(t, home).argv(), " "); !strings.Contains(args, "--tools=Read,Skill --allowedTools=Read,Skill") {
		t.Fatalf("argv = %s", args)
	}
}

// A process holds its own workspace access: check finds no problem in one
// that sets read-write, and process show prints it. The process lives only
// in a temp home.
func TestAProcessMayBeReadWrite(t *testing.T) {
	t.Parallel()
	home, repo := setup(t, "approve")
	edit := filepath.Join(home, "processes", "edit.yaml")
	write(t, edit, strings.Replace(read(t, filepath.Join(home, "processes", "ask.yaml")), "name: ask\n", "name: edit\n", 1))
	ownLimits(t, edit, "timeout: 1m\ntools: {allow: [repository.read, repository.write]}\nworkspace: {access: read-write}\n")
	bound(t, home, "edit", "assistant")

	r := agister(t, home, repo, "check")
	if r.code != 0 || !strings.HasPrefix(r.stdout, "settings OK:") || strings.Contains(r.stdout+r.stderr, "process edit:") {
		t.Fatalf("check: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	// A process shown on its own is refused for naming no agent, whatever
	// its workspace (ADR-030 rule 5), so that nothing refuses it for the
	// access is asserted on the workflow that binds it.
	if r := agister(t, home, repo, "workflow", "show", "edit_assistant"); r.code != 0 || strings.Contains(r.stdout, "REFUSED") {
		t.Fatalf("workflow show: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	r = agister(t, home, repo, "process", "show", "edit")
	if r.code != 0 ||
		!regexp.MustCompile(`(?m)^workspace +read-write, scope repository$`).MatchString(r.stdout) ||
		!regexp.MustCompile(`(?m)^  allowed +repository\.read, repository\.write$`).MatchString(r.stdout) {
		t.Fatalf("process show: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
}

// A repository's own .agister adds settings wherever in the repository
// Agister runs; outside it, only global ones apply.
func TestProjectSettingsAddToGlobal(t *testing.T) {
	t.Parallel()
	home, repo := setup(t, "approve")
	ask := strings.Replace(read(t, filepath.Join(home, "processes", "ask.yaml")), "Answer the question", "PROJECT: answer the question", 1)
	write(t, filepath.Join(repo, ".agister", "processes", "ask_here.yaml"), strings.Replace(ask, "name: ask", "name: ask_here", 1))
	sub := filepath.Join(repo, "sub")
	write(t, filepath.Join(sub, "keep"), "")

	if r := agister(t, home, sub, "process", "list"); r.code != 0 || !strings.Contains(r.stdout, "ask_here") {
		t.Fatalf("list in project: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	project := filepath.Join(repo, ".agister", "processes", "ask_here.yaml")
	r := agister(t, home, sub, "process", "show", "ask_here")
	if r.code != 0 || !strings.Contains(r.stdout, "process ask_here: repository "+project) {
		t.Fatalf("show in project: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	if r := agister(t, home, sub, "run", bound(t, filepath.Join(repo, ".agister"), "ask_here", "assistant"), "--quiet", "--param", "question=q", "--timeout", "1m"); r.code != cli.ExitCompleted {
		t.Fatalf("run in project: %d\n%s", r.code, r.stderr)
	}
	last := lastRun(t, home)
	var process map[string]any
	for _, source := range last.record["definitions"].([]any) {
		if source := source.(map[string]any); source["kind"] == "processes" {
			process = source
		}
	}
	if !strings.Contains(strings.Join(last.argv(), " "), "PROJECT: answer") || nearest(process)["path"] != project || nearest(process)["layer"] != "repository" {
		t.Fatalf("project process not used or not attributed: %v, argv %v", process, last.argv())
	}

	outside := tempDir(t)
	if r := agister(t, home, outside, "process", "list"); r.code != 0 || strings.Contains(r.stdout, "ask_here") {
		t.Fatalf("list outside project: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
}

// A branch can swap the reviewer's family: the repository's agent file,
// which sets only the family, takes priority over the global one field by
// field, and check and the run record say so, the record naming the
// fields each layer's file gave.
func TestProjectOverridesAreNoted(t *testing.T) {
	t.Parallel()
	home, repo := setup(t, "approve")
	global := filepath.Join(home, "agents", "reviewer.toml")
	project := filepath.Join(repo, ".agister", "agents", "reviewer.toml")
	const family = "model_family = \"experiment\"\n"
	write(t, project, family)

	r := agister(t, home, repo, "check")
	if r.code != 0 || !strings.Contains(r.stdout, "override agent reviewer: "+project+" overrides "+global) || !strings.Contains(r.stdout, "settings OK") {
		t.Fatalf("check: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	r = agister(t, home, repo, "check", "--tree")
	if r.code != 0 || !regexp.MustCompile(`├─ agent reviewer +repository `+regexp.QuoteMeta(project)+`\n│ +.*model_family.*\n│ +home +`+regexp.QuoteMeta(global)+`\n`).MatchString(r.stdout) {
		t.Fatalf("check --tree: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	var report contract.CheckReport
	r = agister(t, home, repo, "check", "--json")
	if err := json.Unmarshal([]byte(r.stdout), &report); err != nil || r.code != 0 {
		t.Fatalf("check --json: %d %v\n%s", r.code, err, r.stdout)
	}
	for _, d := range report.Definitions {
		if d.Kind == "agents" && d.Name == "reviewer" && (d.Layer != "repository" || d.Path != project || len(d.Layers) != 2 || d.Layers[1].Layer != "home" || d.Layers[1].Path != global || len(d.UsedBy) == 0) {
			t.Fatalf("reviewer = %+v", d)
		}
	}
	// process show adversarial_review listed the agent's two files among its
	// sources while the process named the agent. It names none now (ADR-030
	// rule 2), a process shown on its own resolves no agent, and workflow
	// show lists its own document alone: check --tree above and the run's
	// record below say which file gave what.
	if r := agister(t, home, repo, "run", "adversarial_review_reviewer", "--quiet", "--param", "base=main", "--timeout", "1m"); r.code != cli.ExitCompleted {
		t.Fatalf("run: %d\n%s", r.code, r.stderr)
	}
	last := lastRun(t, home)
	if profile, _ := last.record["profile"].(map[string]any); !strings.Contains(strings.Join(last.argv(), " "), "sonnet") || profile["effort"] != "high" {
		t.Fatalf("the agent ran as %v, by %v", last.record["profile"], last.argv())
	}
	agent := map[string]any{"kind": "agents", "name": "reviewer", "layers": []any{
		map[string]any{"layer": "repository", "path": project, "sha256": digestOf(family), "fields": []any{"model_family"}},
		map[string]any{"layer": "home", "path": global, "sha256": digestOf(read(t, global)), "fields": []any{"schema", "name", "runtime", "model", "effort", "command"}},
	}}
	if got := definitionOf(t, last, "agents", "reviewer"); !reflect.DeepEqual(got, agent) {
		t.Fatalf("agent recorded as\n%v\nwant\n%v", got, agent)
	}
	// Each other document is home's alone: a composed kind's one file gave
	// every field, and a schema or a prompt, taken whole, has none (ADR-028
	// rule 11).
	for _, source := range last.record["definitions"].([]any) {
		source := source.(map[string]any)
		if source["kind"] == "agents" {
			continue
		}
		layers, _ := source["layers"].([]any)
		fields, given := nearest(source)["fields"].([]any)
		whole := source["kind"] == "schemas" || source["kind"] == "prompts"
		if len(layers) != 1 || nearest(source)["layer"] != "home" || given == whole || !whole && !slices.Contains(fields, any("schema")) {
			t.Fatalf("%v %v recorded as %v", source["kind"], source["name"], source)
		}
	}
}

// Overrides are verified as composed: a project service that global
// policies exceed fails check, and refuses the calls of the processes whose
// limits no longer compose, each recorded; every other command still runs
// and shows what is refused (ADR-015).
func TestComposedSettingsAreVerified(t *testing.T) {
	t.Parallel()
	home, repo := setup(t, "approve")
	write(t, filepath.Join(repo, ".agister", "service.toml"), strings.Replace(read(t, filepath.Join(home, "service.toml")), `max_timeout = "1h"`, `max_timeout = "5m"`, 1))

	r := agister(t, home, repo, "check")
	if r.code != cli.ExitUsage || !strings.Contains(r.stdout, "override service service:") || !strings.Contains(r.stderr, "process adversarial_review") ||
		!strings.Contains(r.stderr, "  refuses process adversarial_review") || strings.Contains(r.stderr, "stops every command") {
		t.Fatalf("check: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	r = agister(t, home, repo, "run", "adversarial_review_reviewer", "--quiet", "--param", "base=main", "--timeout", "1m")
	if r.code != cli.ExitRefused || !strings.Contains(r.stderr, "process adversarial_review ("+filepath.Join(home, "processes", "adversarial_review.yaml")+"): ") {
		t.Fatalf("run: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	if last := lastRun(t, home); last.record["result"].(map[string]any)["error"].(map[string]any)["class"] != "refused" || last.first != nil {
		t.Fatalf("record = %v, runtime = %v", last.record, last.first)
	}
	if r := agister(t, home, repo, "runs"); r.code != 0 || !strings.Contains(r.stdout, "adversarial_review") {
		t.Fatalf("runs: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	if r := agister(t, home, repo, "process", "list"); r.code != 0 || !regexp.MustCompile(`(?m)^adversarial_review\t.*\tREFUSED: process adversarial_review \(`).MatchString(r.stdout) {
		t.Fatalf("process list: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	// Help needs no settings, and init is how settings are repaired.
	if r := agister(t, home, repo, "--help"); r.code != 0 {
		t.Fatalf("help: %d\n%s", r.code, r.stderr)
	}
	if r := agisterInput(t, "yes\n", home, repo, "init"); r.code != 0 {
		t.Fatalf("init: %d\n%s", r.code, r.stderr)
	}
}

// init writes nothing until the user types "yes", and --force says which
// existing files it would replace before asking.
func TestInitAsksBeforeWriting(t *testing.T) {
	t.Parallel()
	home, dir := filepath.Join(tempDir(t), "home"), tempDir(t)
	for _, input := range []string{"", "\n", "y\n", "no\n", "YES please\n"} {
		r := agisterInput(t, input, home, dir, "init")
		if r.code != cli.ExitUsage || !strings.Contains(r.stdout, "will create  "+filepath.Join(home, "service.toml")) || !strings.Contains(r.stderr, "Type yes to write") || !strings.Contains(r.stderr, "nothing was written") {
			t.Fatalf("input %q: %d\n%s%s", input, r.code, r.stdout, r.stderr)
		}
		if _, err := os.Stat(home); err == nil {
			if entries, _ := os.ReadDir(home); len(entries) > 1 || (len(entries) == 1 && entries[0].Name() != "logs") {
				t.Fatalf("input %q: wrote %v", input, entries)
			}
		}
	}
	if r := agisterInput(t, " yes \n", home, dir, "init"); r.code != 0 || !strings.Contains(r.stdout, "created  "+filepath.Join(home, "service.toml")) {
		t.Fatalf("yes: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	// Everything exists: nothing to write, nothing to confirm.
	if r := agister(t, home, dir, "init"); r.code != 0 || !strings.Contains(r.stdout, "nothing to write") || strings.Contains(r.stderr, "Type yes") {
		t.Fatalf("again: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	edited := filepath.Join(home, "agents", "reviewer.toml")
	write(t, edited, read(t, edited)+"# mine\n")
	r := agister(t, home, dir, "init", "--force")
	if r.code != cli.ExitUsage || !strings.Contains(r.stdout, "will REPLACE "+edited) || !strings.HasSuffix(read(t, edited), "# mine\n") {
		t.Fatalf("force without yes: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	if r := agisterInput(t, "yes\n", home, dir, "init", "--force"); r.code != 0 || !strings.Contains(r.stdout, "replaced "+edited) || strings.HasSuffix(read(t, edited), "# mine\n") {
		t.Fatalf("force with yes: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
}

// agent create asks for "yes" only when --force would replace an agent.
func TestAgentCreateAsksBeforeReplacing(t *testing.T) {
	t.Parallel()
	home, dir := filepath.Join(tempDir(t), "home"), tempDir(t)
	if r := agisterInput(t, "yes\n", home, dir, "init"); r.code != 0 {
		t.Fatalf("init: %d %s", r.code, r.stderr)
	}
	reviewer := filepath.Join(home, "agents", "reviewer.toml")
	before := read(t, reviewer)
	replace := []string{"agent", "create", "reviewer", "--force", "--runtime", "claude-code", "--model", "opus", "--model-family", "anthropic"}
	for _, input := range []string{"", "y\n", "no\n"} {
		r := agisterInput(t, input, home, dir, replace...)
		if r.code != cli.ExitUsage || !strings.Contains(r.stdout, "will REPLACE "+reviewer) || !strings.Contains(r.stderr, "Type yes to replace agent reviewer") || read(t, reviewer) != before {
			t.Fatalf("input %q: %d\n%s%s", input, r.code, r.stdout, r.stderr)
		}
	}
	if r := agisterInput(t, "yes\n", home, dir, replace...); r.code != 0 || !strings.Contains(r.stdout, "replaced agent reviewer: "+reviewer) || !strings.Contains(read(t, reviewer), `model = "opus"`) {
		t.Fatalf("yes: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	// An agent that would break the settings is refused before the question,
	// and every command still works afterwards. Here the agent's runtime is
	// valid, but the reviewer's processes cannot run on it: its one
	// primitive also grants what their policy does not allow.
	write(t, filepath.Join(home, "runtimes", "narrow.yaml"), `schema: agister.runtime/v1alpha1
name: narrow
adapter: claude-code
contract: claude-code/3
efforts: [high]
primitives:
  select: one
  items:
    Bash: {grants: [process.execute, repository.read], verified: ["2.1."]}
`)
	current := read(t, reviewer)
	r := agisterInput(t, "yes\n", home, dir, "agent", "create", "reviewer", "--force", "--runtime", "narrow")
	if r.code != cli.ExitUsage || strings.Contains(r.stderr, "Type yes") || !strings.Contains(r.stderr, "agent reviewer would break the global settings") || read(t, reviewer) != current {
		t.Fatalf("breaking agent: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	if r := agister(t, home, dir, "check"); r.code != 0 {
		t.Fatalf("check after refusal: %d\n%s", r.code, r.stderr)
	}
	// A new agent replaces nothing, so --force or not, nothing is asked.
	if r := agister(t, home, dir, "agent", "create", "fresh", "--force", "--runtime", "claude-code"); r.code != 0 || strings.Contains(r.stderr, "Type yes") || !strings.Contains(r.stdout, "created agent fresh") {
		t.Fatalf("new agent: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	// Without --force an existing agent is refused, not asked about.
	if r := agister(t, home, dir, "agent", "create", "fresh", "--runtime", "claude-code"); r.code != cli.ExitUsage || strings.Contains(r.stderr, "Type yes") || !strings.Contains(r.stderr, "already exists") {
		t.Fatalf("existing without force: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
}

// agent create writes global settings, so it must keep them valid on their
// own, not only as a project in view composes them.
func TestAgentCreateKeepsEveryScopeValid(t *testing.T) {
	t.Parallel()
	home, repo := setup(t, "approve")
	mapping := strings.Replace(read(t, filepath.Join(home, "runtimes", "claude-code.yaml")), "name: claude-code", "name: local-rt", 1)
	write(t, filepath.Join(repo, ".agister", "runtimes", "local-rt.yaml"), mapping)

	r := agister(t, home, repo, "agent", "create", "g", "--runtime", "local-rt", "--model-family", "anthropic")
	if r.code != cli.ExitUsage || !strings.Contains(r.stderr, "agent g would break the global settings") || !strings.Contains(r.stderr, `runtime mapping "local-rt" does not exist`) {
		t.Fatalf("inside the project: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	if _, err := os.Stat(filepath.Join(home, "agents", "g.toml")); err == nil {
		t.Fatal("an agent valid only in the project was written to global settings")
	}
	if r := agister(t, home, tempDir(t), "check"); r.code != 0 {
		t.Fatalf("outside the project: %d\n%s", r.code, r.stderr)
	}

	// Where the project defines the agent, the global one is shadowed there,
	// so only the global scope judges it.
	write(t, filepath.Join(repo, ".agister", "agents", "solo.toml"), "schema = \"agister.agent/v1alpha1\"\nname = \"solo\"\nruntime = \"claude-code\"\nmodel_family = \"anthropic\"\n")
	process := strings.Replace(strings.Replace(read(t, filepath.Join(home, "processes", "adversarial_review.yaml")), "name: adversarial_review", "name: solo_review", 1), "agent:reviewer", "agent:solo", 1)
	write(t, filepath.Join(repo, ".agister", "processes", "solo_review.yaml"), process)
	if r := agister(t, home, repo, "agent", "create", "solo", "--runtime", "claude-code"); r.code != 0 {
		t.Fatalf("shadowed agent: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
}

// typedAfter answers the prompt, but only after something else happened
// while the user was reading it.
type typedAfter struct {
	meanwhile func()
	answer    io.Reader
}

func (r *typedAfter) Read(p []byte) (int, error) {
	if r.meanwhile != nil {
		r.meanwhile()
		r.meanwhile = nil
	}
	return r.answer.Read(p)
}

// "yes" approves the plan that was shown, not whatever is on disk by then.
func TestConfirmedWritesRefuseChangesMadeWhileAsking(t *testing.T) {
	t.Parallel()
	home, dir := filepath.Join(tempDir(t), "home"), tempDir(t)
	if r := agisterInput(t, "yes\n", home, dir, "init"); r.code != 0 {
		t.Fatalf("init: %d %s", r.code, r.stderr)
	}
	reviewer := filepath.Join(home, "agents", "reviewer.toml")
	edited := read(t, reviewer) + "# edited while asking\n"
	editMeanwhile := func() { write(t, reviewer, edited) }

	r := agisterReading(t, &typedAfter{editMeanwhile, strings.NewReader("yes\n")}, home, dir, "init", "--force")
	if r.code != cli.ExitUsage || !strings.Contains(r.stderr, "changed since you confirmed") || read(t, reviewer) != edited {
		t.Fatalf("init --force: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	r = agisterReading(t, &typedAfter{func() { write(t, reviewer, edited+"# again\n") }, strings.NewReader("yes\n")}, home, dir,
		"agent", "create", "reviewer", "--force", "--runtime", "claude-code", "--model-family", "anthropic")
	if r.code != cli.ExitUsage || !strings.Contains(r.stderr, "changed since you confirmed") || read(t, reviewer) != edited+"# again\n" {
		t.Fatalf("agent create --force: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
}

// On a fresh machine only init and help work; after init everything does.
func TestFreshHomeNeedsInit(t *testing.T) {
	t.Parallel()
	home, dir := filepath.Join(tempDir(t), "home"), tempDir(t)
	if r := agister(t, home, dir, "process", "list"); r.code != cli.ExitUsage || !strings.Contains(r.stderr, "service service: not found") {
		t.Fatalf("before init: %d\n%s", r.code, r.stderr)
	}
	// The refusal, before any run exists, is in the log as an error.
	refusals := loggedAs(t, home, "the settings refused the command")
	if len(refusals) != 1 {
		t.Fatalf("refusals logged = %v", refusals)
	}
	problems, _ := json.Marshal(refusals[0]["problems"])
	if refusals[0]["level"] != "ERROR" || refusals[0]["command"] != "process list" || refusals[0]["cwd"] != dir || !strings.Contains(string(problems), "service service: not found") {
		t.Fatalf("logged = %v", refusals[0])
	}
	if r := agisterInput(t, "yes\n", home, dir, "init"); r.code != 0 {
		t.Fatalf("init: %d\n%s", r.code, r.stderr)
	}
	if r := agister(t, home, dir, "process", "list"); r.code != 0 {
		t.Fatalf("after init: %d\n%s", r.code, r.stderr)
	}
}

// A .agister that exists but cannot be used fails every command instead of
// silently leaving the project's settings out, and the failure, before any
// run exists, is in the log as an error.
func TestUnusableProjectSettingsFail(t *testing.T) {
	t.Parallel()
	home, repo := setup(t, "approve")
	write(t, filepath.Join(repo, ".agister"), "not a directory")
	if r := agister(t, home, repo, "process", "list"); r.code == 0 || !strings.Contains(r.stderr, ".agister: not a directory") {
		t.Fatalf("exit %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	logged := loggedAs(t, home, "the command failed")
	if len(logged) != 1 {
		t.Fatalf("failures logged = %v", logged)
	}
	message, _ := logged[0]["error"].(string)
	if logged[0]["level"] != "ERROR" || !strings.Contains(message, ".agister: not a directory") || logged[0]["command"] != "process list" || logged[0]["cwd"] != repo {
		t.Fatalf("logged = %v", logged[0])
	}
}

// A call whose run folder cannot be made, <home>/runs a file, fails, makes
// no run, and the failure, which no run records, is in the log as an error.
func TestARunThatCannotBeRecordedIsLogged(t *testing.T) {
	t.Parallel()
	home, repo := setup(t, "approve")
	runs := filepath.Join(home, "runs")
	if err := os.RemoveAll(runs); err != nil {
		t.Fatal(err)
	}
	write(t, runs, "not a folder")
	r := agister(t, home, repo, "--quiet", "run", "adversarial_review_reviewer", "--param", "base=main", "--timeout", "1m")
	if r.code == cli.ExitCompleted || !strings.Contains(r.stderr, "not a directory") {
		t.Fatalf("exit %d\n%s", r.code, r.stderr)
	}
	if kept := read(t, runs); kept != "not a folder" {
		t.Fatalf("runs = %q", kept)
	}
	logged := loggedAs(t, home, "the command failed")
	if len(logged) != 1 {
		t.Fatalf("failures logged = %v", logged)
	}
	message, _ := logged[0]["error"].(string)
	if logged[0]["level"] != "ERROR" || logged[0]["command"] != "run" || logged[0]["cwd"] != repo || !strings.Contains(r.stderr, "agister: "+message+"\n") {
		t.Fatalf("logged = %v, stderr:\n%s", logged[0], r.stderr)
	}
}

// loggedAs is every record in home's log whose message is msg.
func loggedAs(t *testing.T, home, msg string) []map[string]any {
	t.Helper()
	var found []map[string]any
	for _, line := range strings.Split(strings.TrimSpace(read(t, filepath.Join(home, "logs", "agister.jsonl"))), "\n") {
		var entry map[string]any
		if err := json.Unmarshal([]byte(line), &entry); err != nil {
			t.Fatalf("log line %q: %v", line, err)
		}
		if entry["msg"] == msg {
			found = append(found, entry)
		}
	}
	return found
}

// Fields that settings once accepted and ignored are refused, so a home
// written for the old format fails check instead of running unverified.
func TestRefusedSettingsFieldsFailCheck(t *testing.T) {
	t.Parallel()
	home, repo := setup(t, "approve")
	mapping := filepath.Join(home, "runtimes", "claude-code.yaml")
	original := read(t, mapping)
	write(t, mapping, strings.Replace(original, "efforts:", "verified_versions: [\"2.1.\"]\nefforts:", 1))
	r := agister(t, home, repo, "check")
	if r.code != cli.ExitUsage || !strings.Contains(r.stderr, "verified_versions: no longer supported") {
		t.Fatalf("exit %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	write(t, mapping, original)

	write(t, filepath.Join(home, "processes", "res.yaml"), strings.Replace(read(t, filepath.Join(home, "processes", "ask.yaml")), "name: ask", "name: res\nresources: [x]", 1))
	r = agister(t, home, repo, "check")
	if r.code != cli.ExitUsage || !strings.Contains(r.stderr, "resources: not supported yet") {
		t.Fatalf("exit %d\n%s%s", r.code, r.stdout, r.stderr)
	}
}

func write(t *testing.T, path, text string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(text), 0o600); err != nil {
		t.Fatal(err)
	}
}

func read(t *testing.T, path string) string {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return string(data)
}

func readJSON(t *testing.T, path string, value any) {
	t.Helper()
	if err := json.Unmarshal([]byte(read(t, path)), value); err != nil {
		t.Fatal(err)
	}
}

// Cancelling through the contract interrupts the runtime and releases the
// workspace; the run finishes interrupted, not lost.
func TestCancelThroughTheContract(t *testing.T) {
	t.Parallel()
	home, repo := setup(t, "hang")
	client, err := unpolledOn(t, cli.Config{Home: home})
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	id, err := client.Submit(ctx, contract.CallRequest{Process: "adversarial_review_reviewer", Params: map[string]string{"base": "main"}, Timeout: "30s", Cwd: repo})
	if err != nil {
		t.Fatal(err)
	}
	cancelled := false
	err = client.Observe(ctx, id, 0, func(event contract.Event) error {
		if event.Kind == "PROCESS_STARTED" && !cancelled {
			cancelled = true
			return client.Cancel(ctx, id)
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	inspected, err := client.Inspect(ctx, id)
	if err != nil || inspected.State != "finished" || inspected.Result.Status != "interrupted" || inspected.Result.Error.Class != "cancelled" {
		t.Fatalf("run = %+v, %v", inspected, err)
	}
	noCheckoutLeft(t, home)
}

// Settings broken mid-run do not strand the run: it stays cancellable,
// observable and inspectable, while other uses are refused when the
// problem stops every command (ADR-015 rule 4).
func TestRunSurvivesSettingsBrokenMidRun(t *testing.T) {
	t.Parallel()
	home, repo := setup(t, "hang")
	client, err := unpolledOn(t, cli.Config{Home: home})
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	id, err := client.Submit(ctx, contract.CallRequest{Process: "adversarial_review_reviewer", Params: map[string]string{"base": "main"}, Timeout: "30s", Cwd: repo})
	if err != nil {
		t.Fatal(err)
	}
	broken := false
	err = client.Observe(ctx, id, 0, func(event contract.Event) error {
		if event.Kind == "PROCESS_STARTED" && !broken {
			broken = true
			write(t, filepath.Join(home, "service.toml"), "schema = \"agister.service/v1alpha1\"\n")
			return client.Cancel(ctx, id)
		}
		return nil
	})
	if err != nil || !broken {
		t.Fatalf("observe: %v", err)
	}
	if inspected, err := client.Inspect(ctx, id); err != nil || inspected.Result.Status != "interrupted" {
		t.Fatalf("inspect: %+v, %v", inspected, err)
	}
	var settings *contract.SettingsError
	if _, err := client.ListRuns(ctx); !errors.As(err, &settings) {
		t.Fatalf("list runs with broken settings: %v", err)
	}
}

// A domain result, even an unfavourable one, is output of a completed node:
// routing on it is the workflow's business.
func TestVerdictIsOutputNotStatus(t *testing.T) {
	t.Parallel()
	home, repo := setup(t, "request_changes")
	r := agister(t, home, repo, "run", "adversarial_review_reviewer", "--param", "base=main", "--json", "--quiet", "--timeout", "1m")
	var result contract.Result
	if err := json.Unmarshal([]byte(r.stdout), &result); err != nil || r.code != cli.ExitCompleted || result.Status != "completed" || !strings.Contains(string(result.Output), `"request_changes"`) {
		t.Fatalf("exit %d, result %s, err %v", r.code, r.stdout, err)
	}
}

// A continuation resumes the earlier run's provider session in place, by the
// ID the runtime reported, and costs what it added to the session's total.
func TestContinuationEndToEnd(t *testing.T) {
	t.Parallel()
	// The fake runtime keeps its sessions' costs here: each turn costs
	// $0.0123, and the result reports the session's total.
	home, repo := setup(t, "approve")
	startThrough(t, home, runtimetest.InProcess{Env: []string{"FAKE_CLAUDE_CONFIG_DIR=" + tempDir(t)}})
	client, err := composeInProcess(cli.Config{Home: home})
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	finish := func(request contract.CallRequest) contract.Run {
		id, err := client.Submit(ctx, request)
		if err != nil {
			t.Fatal(err)
		}
		if err := client.Observe(ctx, id, 0, func(contract.Event) error { return nil }); err != nil {
			t.Fatal(err)
		}
		inspected, err := client.Inspect(ctx, id)
		if err != nil {
			t.Fatal(err)
		}
		return inspected
	}
	first := finish(contract.CallRequest{Process: "ask_assistant", Params: map[string]string{"question": "What is a.txt?"}, Timeout: "1m", Cwd: repo})
	second := finish(contract.CallRequest{Process: "ask_assistant", Params: map[string]string{"question": "And b.txt?"}, Continue: first.ID, Timeout: "1m", Cwd: repo})
	if first.Result.Status != "completed" || second.Result.Status != "completed" {
		t.Fatalf("first %+v, second %+v", first.Result, second.Result)
	}
	earlier, later := first.Result.Session.ProviderSessionID, second.Result.Session.ProviderSessionID
	var provider map[string]any
	_ = json.Unmarshal([]byte(runtimeEcho(filepath.Join(home, "runs", second.ID))), &provider)
	args := fmt.Sprint(provider["argv"])
	if earlier != later || second.Result.Session.Continues != first.ID || !strings.Contains(args, "--resume "+earlier) ||
		strings.Contains(args, "--fork-session") || strings.Contains(args, "--session-id") {
		t.Fatalf("earlier %s, later %s, argv %s", earlier, later, args)
	}
	// A run that was already continued can be continued again: the same
	// session is resumed.
	again := finish(contract.CallRequest{Process: "ask_assistant", Params: map[string]string{"question": "And c.txt?"}, Continue: first.ID, Timeout: "1m", Cwd: repo})
	if again.Result.Status != "completed" || again.Result.Session.ProviderSessionID != earlier || again.Result.Session.Continues != first.ID {
		t.Fatalf("result = %+v", again.Result)
	}
	// The session's total rose to 0.0246 with the second call, which the
	// first never recorded: each call costs its own turn, the third
	// included.
	for _, call := range []contract.Run{first, second, again} {
		if cost := call.Result.Cost; cost.Source != "runtime" || cost.USD == nil || math.Abs(*cost.USD-0.0123) > 1e-9 {
			t.Fatalf("run %s cost %+v, usd %v", call.ID, cost, cost.USD)
		}
	}
	// The reviewer is fresh-only: continuing with it is refused.
	refused := finish(contract.CallRequest{Process: "adversarial_review_reviewer", Params: map[string]string{"base": "main"}, Continue: first.ID, Timeout: "1m", Cwd: repo})
	if refused.Result.Error == nil || refused.Result.Error.Class != "refused" || !strings.Contains(refused.Result.Error.Message, "fresh-only") {
		t.Fatalf("result = %+v", refused.Result)
	}
}

// What the agent changed is kept as an artifact, and the changes stay in
// the caller's worktree, where the agent made them (ADR-025 rule 6).
//
// Contract test: the composition over settings on the filesystem and a real
// git repository. Its runtimes are fakes run in process.
func TestWorkspaceChangesAreKept(t *testing.T) {
	t.Parallel()
	home, repo := setupGit(t, "edit")
	if r := agister(t, home, repo, "run", "adversarial_review_reviewer", "--param", "base=main", "--quiet", "--timeout", "1m"); r.code != cli.ExitCompleted {
		t.Fatalf("exit %d\n%s", r.code, r.stderr)
	}
	last := lastRun(t, home)
	artifacts := last.record["result"].(map[string]any)["artifacts"].([]any)
	artifact := artifacts[0].(map[string]any)
	patch := read(t, filepath.Join(last.dir, artifact["path"].(string)))
	if len(artifacts) != 1 || !strings.Contains(patch, "+++ b/written-by-agent.txt") || !strings.HasPrefix(artifact["digest"].(string), "sha256:") {
		t.Fatalf("artifacts %v, patch:\n%s", artifacts, patch)
	}
	if status := gitCmd(t, repo, "status", "--porcelain"); status != "?? written-by-agent.txt" {
		t.Fatalf("the worktree's status = %q", status)
	}
}

// A process declaring verify, in settings on disk: check and process show
// warn of it, a call records it under the process's digest and completes
// once its fixture command passes in the worktree, which the process needs
// clean (ADR-025 rule 3), and a caller's timeout shorter than one run
// refuses the call.
func TestVerifyDeclarationEndToEnd(t *testing.T) {
	t.Parallel()
	home, repo := setup(t, "approve")
	shipped := read(t, filepath.Join(home, "processes", "adversarial_review.yaml"))
	process := strings.Replace(shipped, "name: adversarial_review", "name: verified", 1)
	process = strings.Replace(process, "  revision: candidate_revision\n", "  revision: candidate_revision\n  clean: true\n", 1) + `
verify:
  command: test -f a.txt
  timeout: 20s
  max_attempts: 1
  instruction: The verification command failed. Fix the cause, not the check.
`
	write(t, filepath.Join(home, "processes", "verified.yaml"), process)
	bound(t, home, "verified", "reviewer")

	r := agister(t, home, repo, "check")
	if r.code != 0 || strings.Count(r.stderr, "warning process verified: verify runs its command with the operator's authority") != 1 || strings.Contains(r.stderr, "adversarial_review") {
		t.Fatalf("check: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	r = agister(t, home, repo, "process", "show", "verified")
	if r.code != 0 || !strings.Contains(r.stdout, "verify       test -f a.txt\n") {
		t.Fatalf("show: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	r = agister(t, home, repo, "workflow", "show", "verified_reviewer")
	if r.code != 0 || !strings.Contains(r.stdout, "WARNING      node verified: verify runs its command with the operator's authority") {
		t.Fatalf("workflow show: %d\n%s%s", r.code, r.stdout, r.stderr)
	}

	r = agister(t, home, repo, "run", "verified_reviewer", "--param", "base=main", "--timeout", "30s")
	if r.code != cli.ExitCompleted {
		t.Fatalf("run: %d\n%s", r.code, r.stderr)
	}
	record := lastRun(t, home).record
	verified := record["id"]
	verify := record["verify"].(map[string]any)
	if verify["command"] != "test -f a.txt" || verify["timeout"] != float64(20e9) || verify["max_attempts"] != 1.0 || !strings.HasPrefix(verify["instruction"].(string), "The verification command failed.") {
		t.Fatalf("verify = %v", verify)
	}
	if attempts, _ := record["attempts"].([]any); len(attempts) != 1 || attempts[0].(map[string]any)["run"].(map[string]any)["passed"] != true {
		t.Fatalf("attempts = %v", record["attempts"])
	}
	for _, source := range record["definitions"].([]any) {
		source := source.(map[string]any)
		if sum := sha256.Sum256([]byte(process)); source["kind"] == "processes" && nearest(source)["sha256"] != hex.EncodeToString(sum[:]) {
			t.Fatalf("process digest %v is not of the file as resolved", nearest(source)["sha256"])
		}
	}

	r = agister(t, home, repo, "run", "verified_reviewer", "--param", "base=main", "--timeout", "10s")
	// Two runs in one second need not list in the order they ran.
	entries, _ := os.ReadDir(filepath.Join(home, "runs"))
	var refused map[string]any
	for _, entry := range entries {
		var record map[string]any
		readJSON(t, filepath.Join(home, "runs", entry.Name(), "record.json"), &record)
		if record["id"] != verified {
			refused = record["result"].(map[string]any)["error"].(map[string]any)
		}
	}
	if r.code == cli.ExitCompleted || len(entries) != 2 || refused["class"] != "refused" ||
		!strings.Contains(refused["message"].(string), "verify.timeout 20s exceeds the effective timeout 10s") {
		t.Fatalf("run with a shorter timeout: %d, %v", r.code, refused)
	}
}

// A runtime that fails with a reason on stderr leaves it in the record: the
// error message quotes it, and the turn keeps a bounded, marked stderr
// tail; one that prints nothing says only its exit code.
func TestARuntimesFailureReasonReachesTheRecord(t *testing.T) {
	t.Parallel()
	for _, c := range []struct {
		scenario, message string
		cut               bool
	}{
		{"exit_nonzero", "exit code 3: fatal: provider exploded", false},
		{"exit_flooded", "exit code 3: fatal: provider exploded", true},
		{"exit_silent", "exit code 3", false},
	} {
		t.Run(c.scenario, func(t *testing.T) {
			t.Parallel()
			home, repo := setup(t, c.scenario)
			if r := agister(t, home, repo, "run", "adversarial_review_reviewer", "--param", "base=main", "--timeout", "1m"); r.code != cli.ExitFailed {
				t.Fatalf("exit %d\n%s", r.code, r.stderr)
			}
			record := lastRun(t, home).record
			failure := record["result"].(map[string]any)["error"].(map[string]any)
			if failure["class"] != "runtime_error" || failure["message"] != c.message {
				t.Fatalf("error = %v", failure)
			}
			turn := record["turn"].(map[string]any)
			tail, _ := turn["stderr_tail"].(string)
			omitted, _ := turn["stderr_omitted"].(float64)
			switch {
			case c.message == "exit code 3":
				if tail != "" || omitted != 0 {
					t.Fatalf("turn = %v", turn)
				}
			case !strings.HasSuffix(tail, "\nfatal: provider exploded") && tail != "fatal: provider exploded":
				t.Fatalf("stderr tail = %q", tail)
			case c.cut != (omitted > 0) || c.cut != strings.HasPrefix(tail, fmt.Sprintf("[%d earlier bytes of stderr cut]\n", int64(omitted))):
				t.Fatalf("omitted %v, tail starts %q", omitted, tail[:min(len(tail), 60)])
			}
		})
	}
}

// bound writes, among the settings in dir, a workflow of one call whose
// node binds process to agent, and returns its name, <process>_<agent>:
// nothing but a workflow's node runs a process (ADR-030 rules 5 and 6).
func bound(t *testing.T, dir, process, agent string) string {
	t.Helper()
	name := strings.ReplaceAll(process+"_"+agent, "-", "_")
	write(t, filepath.Join(dir, "workflows", name+".yaml"), "schema: agister.workflow/v1alpha1\nname: "+name+"\n\ntype: workflow\n\ncall: {node: "+process+", uses: process:"+process+", agent: "+agent+"}\n")
	return name
}

// shownCall is the process a workflow of one call runs, on the agent its
// node binds it to, as workflow show --json prints it: a process alone
// names no agent to be planned on (ADR-030 rule 2).
func shownCall(t *testing.T, home, repo, workflow string) contract.ProcessView {
	t.Helper()
	var shown struct {
		Call struct{ Process contract.ProcessView }
	}
	r := agister(t, home, repo, "workflow", "show", workflow, "--json")
	if err := json.Unmarshal([]byte(r.stdout), &shown); err != nil || r.code != 0 {
		t.Fatalf("workflow show %s --json: %d %v\n%s%s", workflow, r.code, err, r.stdout, r.stderr)
	}
	return shown.Call.Process
}

// sourced reports whether the shown call takes the definition from layer's
// file at path.
func sourced(shown contract.ProcessView, kind, name, layer, path string) bool {
	return slices.ContainsFunc(shown.Sources, func(o contract.DefinitionOrigin) bool {
		return o.Kind == kind && o.Name == name && o.Layer == layer && o.Path == path
	})
}
