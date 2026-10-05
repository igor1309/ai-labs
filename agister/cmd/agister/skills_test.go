package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"regexp"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/cli"
)

// Skills are settings (ADR-021), on real settings directories: Agister's
// home and a repository's .agister, composed by the layered store.

// skilledProcess names the skill review; its agent, stylist, names style.
const skilledProcess = `schema: agister.process/v1alpha1
name: skilled
type: process
uses: agent:stylist
policy: process-policy:read-only
skills: [review]
input:
  instruction: Follow the rules.
output:
  format: text
`

func skillFile(name, description string) string {
	return "---\nname: " + name + "\ndescription: " + description + "\n---\n\n# " + name + "\n"
}

// skilledSettings adds to setup's home the process skilled, which names the
// skill review, on the agent stylist, which names style, and the process
// plain, skilled without either: on the assistant, which names none. It
// returns the path of skilled. The skills themselves are the test's.
func skilledSettings(t *testing.T, home string) string {
	t.Helper()
	agent := strings.Replace(read(t, filepath.Join(home, "agents", "assistant.toml")), `name = "assistant"`, `name = "stylist"`, 1)
	write(t, filepath.Join(home, "agents", "stylist.toml"), agent+`skills = ["style"]`+"\n")
	process := filepath.Join(home, "processes", "skilled.yaml")
	write(t, process, skilledProcess)
	plain := strings.NewReplacer("name: skilled", "name: plain", "agent:stylist", "agent:assistant", "skills: [review]\n", "").Replace(skilledProcess)
	write(t, filepath.Join(home, "processes", "plain.yaml"), plain)
	return process
}

// skillsOf are the skills among a run's recorded definitions, in order.
func skillsOf(r run) []map[string]any {
	var skills []map[string]any
	definitions, _ := r.record["definitions"].([]any)
	for _, d := range definitions {
		if d := d.(map[string]any); d["kind"] == "skills" {
			skills = append(skills, d)
		}
	}
	return skills
}

// refusedBeforeItsFirstTurn runs agister, which must refuse the call with
// want, and returns the one run it recorded: the runtime was never started.
func refusedBeforeItsFirstTurn(t *testing.T, runs *newRuns, home, repo, want string, args ...string) run {
	t.Helper()
	r := agister(t, home, repo, append(append([]string{"run"}, args...), "--quiet", "--timeout", "1m")...)
	if r.code != cli.ExitRefused || !strings.Contains(r.stderr, want) {
		t.Fatalf("run %v: %d, want %q\n%s%s", args, r.code, want, r.stdout, r.stderr)
	}
	refused := runs.one(t)
	if refused.first != nil {
		t.Fatalf("run %v: the refused call reached the runtime: %v", args, refused.first)
	}
	return refused
}

// ranWithoutSkills runs agister, whose call names no skill: it runs on the
// runtime as it did, with no skill among its definitions.
func ranWithoutSkills(t *testing.T, runs *newRuns, home, repo string, args ...string) {
	t.Helper()
	r := agister(t, home, repo, append(append([]string{"run"}, args...), "--quiet", "--timeout", "1m")...)
	if r.code != cli.ExitCompleted {
		t.Fatalf("run %v: %d\n%s%s", args, r.code, r.stdout, r.stderr)
	}
	if ran := runs.one(t); ran.first == nil || len(skillsOf(ran)) != 0 {
		t.Fatalf("run %v: runtime %v, skills %v", args, ran.first, skillsOf(ran))
	}
}

// A skill is found in the settings, the repository's over home's of the
// same name: check passes and links what names each, process show lists
// the call's with the layer of each, and the call records them by digest.
// Claude Code gives the recorded skills to its runtime (rules 5-6);
// a call that names none runs without a skills folder.
func TestACallsSkillsAreFoundInTheSettingsAndGivenToClaudeCode(t *testing.T) {
	t.Parallel()
	home, repo := setup(t, "approve")
	skilledSettings(t, home)
	homeReview, homeText := filepath.Join(home, "skills", "review", "SKILL.md"), skillFile("review", "Home's way to review.")
	style, styleText := filepath.Join(home, "skills", "style", "SKILL.md"), skillFile("style", "The house style.")
	projectReview, projectText := filepath.Join(repo, ".agister", "skills", "review", "SKILL.md"), skillFile("review", "The repository's way to review.")
	write(t, homeReview, homeText)
	write(t, style, styleText)
	write(t, projectReview, projectText)

	r := agister(t, home, repo, "check", "--tree")
	if r.code != 0 || strings.Contains(r.stderr, "problem") || !strings.Contains(r.stdout, "\nsettings OK: ") ||
		!regexp.MustCompile(`process skilled +global .*\n├─ agent stylist +global .*\n(│.*\n)*│  └─ skill style +global +`+regexp.QuoteMeta(style)+`\n(.*\n)*└─ skill review +project `+regexp.QuoteMeta(projectReview)+` \(overrides `+regexp.QuoteMeta(homeReview)+`\)\n`).MatchString(r.stdout) {
		t.Fatalf("check --tree: %d\n%s%s", r.code, r.stdout, r.stderr)
	}

	r = agister(t, home, repo, "process", "show", "skilled")
	for _, want := range []string{
		"skills       review (process): project " + projectReview + "\n" +
			"             style (agent): global " + style + "\n",
		"skill review: project " + projectReview + " (overrides " + homeReview + ")\n",
		"skill style: global " + style + "\n",
	} {
		if r.code != 0 || strings.Contains(r.stdout, "REFUSED") || !strings.Contains(r.stdout, want) {
			t.Fatalf("process show: %d, want %q\n%s%s", r.code, want, r.stdout, r.stderr)
		}
	}
	// With another agent the process's stay and the agent's are that agent's.
	r = agister(t, home, repo, "process", "show", "skilled", "--agent", "assistant")
	if r.code != 0 || !strings.Contains(r.stdout, "skills       review (process): project "+projectReview+"\n") {
		t.Fatalf("process show --agent assistant: %d\n%s%s", r.code, r.stdout, r.stderr)
	}

	runs := &newRuns{home: home}
	runs.take(t)
	ran := ranWithSkills(t, runs, home, repo, "claude-code", map[string]string{"review": projectText, "style": styleText}, "skilled")
	// The run records the skills the call was resolved with: the
	// repository's review, whole, and home's style.
	want := []map[string]any{
		{"kind": "skills", "name": "review", "path": projectReview, "sha256": digestOf(projectText), "project": true, "overrides": homeReview},
		{"kind": "skills", "name": "style", "path": style, "sha256": digestOf(styleText)},
	}
	if got := skillsOf(ran); !reflect.DeepEqual(got, want) {
		t.Fatalf("recorded skills = %v, want %v", got, want)
	}
	// Either the process's or the agent's skills reach the runtime alone.
	ranWithSkills(t, runs, home, repo, "claude-code", map[string]string{"review": projectText}, "skilled", "--agent", "assistant")
	ranWithSkills(t, runs, home, repo, "claude-code", map[string]string{"style": styleText}, "plain", "--agent", "stylist")

	ranWithoutSkills(t, runs, home, repo, "plain")
}

// A skill in neither layer is a problem of the settings, on the agent and
// on the process that name it; either refuses only the calls that depend
// on it, before their first turn (ADR-015).
func TestASkillInNeitherLayerIsAProblemOfWhatNamesIt(t *testing.T) {
	t.Parallel()
	home, repo := setup(t, "approve")
	process := skilledSettings(t, home)
	// Neither layer has either skill.
	r := agister(t, home, repo, "check", "--tree")
	for _, want := range []string{
		"agent stylist: skill \"style\" does not exist\n  refuses process skilled\n",
		"process skilled: skill \"review\" does not exist\n  refuses process skilled\n",
		"2 problem(s) in ",
	} {
		if r.code != cli.ExitUsage || !strings.Contains(r.stderr, want) {
			t.Fatalf("check --tree: %d, want %q\n%s%s", r.code, want, r.stdout, r.stderr)
		}
	}
	if !regexp.MustCompile(`│  └─ skill style +MISSING\n(.*\n)*└─ skill review +MISSING\n`).MatchString(r.stdout) {
		t.Fatalf("check --tree:\n%s%s", r.stdout, r.stderr)
	}

	runs := &newRuns{home: home}
	runs.take(t)
	stylist := filepath.Join(home, "agents", "stylist.toml")
	refusedBeforeItsFirstTurn(t, runs, home, repo, "process skilled uses agent stylist ("+stylist+"): skill \"style\" does not exist", "skilled")
	// With the agent's skill in the repository, the process's is what is
	// left.
	write(t, filepath.Join(repo, ".agister", "skills", "style", "SKILL.md"), skillFile("style", "The house style."))
	r = agister(t, home, repo, "check")
	if r.code != cli.ExitUsage || !strings.Contains(r.stderr, "process skilled: skill \"review\" does not exist\n  refuses process skilled\n1 problem(s) in ") {
		t.Fatalf("check: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	missing := "process skilled (" + process + "): skill \"review\" does not exist"
	refusedBeforeItsFirstTurn(t, runs, home, repo, missing, "skilled")
	r = agister(t, home, repo, "process", "show", "skilled")
	if r.code != 0 || !strings.Contains(r.stdout, "skills       review (process, not resolved)\n") || !strings.Contains(r.stdout, "REFUSED: "+missing) {
		t.Fatalf("process show: %d\n%s%s", r.code, r.stdout, r.stderr)
	}

	ranWithoutSkills(t, runs, home, repo, "plain")
}

// A skill's folder that holds a second file is a problem of that skill
// alone, not of what names it, and home's sound skill of the same name does
// not stand in for it; it refuses the process that names it (ADR-015).
func TestASkillFolderWithASecondFileIsAProblemOfItsOwn(t *testing.T) {
	t.Parallel()
	home, repo := setup(t, "approve")
	skilledSettings(t, home)
	write(t, filepath.Join(home, "skills", "review", "SKILL.md"), skillFile("review", "Home's way to review."))
	write(t, filepath.Join(home, "skills", "style", "SKILL.md"), skillFile("style", "The house style."))
	folder := filepath.Join(repo, ".agister", "skills", "review")
	write(t, filepath.Join(folder, "SKILL.md"), skillFile("review", "The repository's way to review."))
	write(t, filepath.Join(folder, "checklist.md"), "- read the tests\n")

	problem := folder + " holds checklist.md beside SKILL.md: a skill is its SKILL.md alone, and its other files are not given to a call"
	r := agister(t, home, repo, "check", "--tree")
	if r.code != cli.ExitUsage || !strings.Contains(r.stderr, "skill review: "+problem+"\n  refuses process skilled\n1 problem(s) in ") ||
		strings.Contains(r.stderr, "does not exist") || strings.Contains(r.stderr, "process skilled:") {
		t.Fatalf("check --tree: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	if !regexp.MustCompile(`└─ skill review +project ` + regexp.QuoteMeta(filepath.Join(folder, "SKILL.md")) + ` .*INVALID\n`).MatchString(r.stdout) {
		t.Fatalf("check --tree:\n%s%s", r.stdout, r.stderr)
	}

	runs := &newRuns{home: home}
	runs.take(t)
	refusedBeforeItsFirstTurn(t, runs, home, repo, "process skilled uses skill review ("+filepath.Join(folder, "SKILL.md")+"): "+problem, "skilled")

	ranWithoutSkills(t, runs, home, repo, "plain")
}

// install does not install skills (ADR-016 rule 1, ADR-021): a folder's
// skills/ is listed as not settings, and home gets none of it. Home's own
// skills are its documents: one is kept, and an installed agent that names
// it passes the check of the result.
func TestInstallReportsASkillsFolderAsNotSettings(t *testing.T) {
	t.Parallel()
	home := initedHome(t)
	homeStyle, styleText := filepath.Join(home, "skills", "style", "SKILL.md"), skillFile("style", "The house style.")
	write(t, homeStyle, styleText)
	src := repoSettings(t, home)
	reviewer := filepath.Join(src, "agents", "reviewer.toml")
	write(t, reviewer, read(t, reviewer)+`skills = ["style"]`+"\n")
	write(t, filepath.Join(src, "skills", "review", "SKILL.md"), skillFile("review", "The repository's way to review."))
	write(t, filepath.Join(src, "skills", "style", "SKILL.md"), skillFile("style", "The repository's style."))
	r := agisterInstalling(t, "yes\n", home, tempDir(t), "install", src)
	if r.code != 0 || !strings.Contains(r.stdout, "not settings, not installed: skills/\n") ||
		!strings.Contains(r.stdout, "home only, kept "+homeStyle+"\n") || strings.Contains(r.stdout, filepath.Join(home, "skills", "review")) {
		t.Fatalf("install: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	if !strings.Contains(read(t, filepath.Join(home, "agents", "reviewer.toml")), `skills = ["style"]`) {
		t.Fatal("the agent that names home's skill was not installed")
	}
	for path, text := range files(t, home) {
		if strings.HasPrefix(path, "skills"+string(filepath.Separator)) && (path != filepath.Join("skills", "style", "SKILL.md") || text != styleText) {
			t.Fatalf("install wrote %s:\n%s", path, text)
		}
	}
}

// An installed document that names a skill home lacks adds a problem, so
// the install is refused: the folder's own skills/ does not come with it.
func TestInstallRefusesAnAgentNamingASkillHomeLacks(t *testing.T) {
	t.Parallel()
	home := initedHome(t)
	src := repoSettings(t, home)
	reviewer := filepath.Join(src, "agents", "reviewer.toml")
	write(t, reviewer, read(t, reviewer)+`skills = ["review"]`+"\n")
	write(t, filepath.Join(src, "skills", "review", "SKILL.md"), skillFile("review", "The repository's way to review."))
	before := files(t, home)
	r := agisterInstalling(t, "yes\n", home, tempDir(t), "install", src)
	if r.code == 0 || !strings.Contains(r.stdout+r.stderr, `agent reviewer: skill "review" does not exist`) {
		t.Fatalf("install: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	if !reflect.DeepEqual(files(t, home), before) {
		t.Fatal("the refused install wrote")
	}
}

// A process naming a skill runs on every B1 adapter; Codex remains refused.
func TestACallNamingASkillRunsOnPiAndOpenCodeAndIsRefusedOnCodex(t *testing.T) {
	t.Parallel()
	for _, adapter := range []string{"pi", "opencode", "codex"} {
		t.Run(adapter, func(t *testing.T) {
			t.Parallel()
			home, repo := setup(t, "approve")
			process := skilledSettings(t, home)
			// OpenCode requires a nonempty message, apart from the instruction.
			write(t, process, strings.Replace(skilledProcess, "  instruction: Follow the rules.\n", "  instruction: Follow the rules.\n  params:\n    question: {default: Follow the skills.}\n  values:\n    question: {source: param, name: question}\n", 1))
			review, style := skillFile("review", "Review rules."), skillFile("style", "Style rules.")
			write(t, filepath.Join(home, "skills", "review", "SKILL.md"), review)
			write(t, filepath.Join(home, "skills", "style", "SKILL.md"), style)
			// Test-owned mappings describe only the tools this fake needs.
			primitive, contract, version := "read", "pi/1", "0.85."
			if adapter == "opencode" {
				primitive, contract, version = "skill", "opencode/1", "1.18."
			}
			if adapter == "codex" {
				primitive, contract, version = "read-only", "codex/2", "0.158."
			}
			write(t, filepath.Join(home, "runtimes", adapter+".yaml"), "schema: agister.runtime/v1alpha1\nname: "+adapter+"\nadapter: "+adapter+"\ncontract: "+contract+"\nprimitives:\n  select: any\n  items:\n    "+primitive+": {grants: [repository.read], verified: [\""+version+"\"]}\n")
			if r := agisterInput(t, "yes\n", home, repo, "agent", "create", "stylist", "--force", "--runtime", adapter, "--command", adapter); r.code != 0 {
				t.Fatalf("agent create: %d\n%s%s", r.code, r.stdout, r.stderr)
			}
			agent := filepath.Join(home, "agents", "stylist.toml")
			write(t, agent, read(t, agent)+`skills = ["style"]`+"\n")
			runs := &newRuns{home: home}
			runs.take(t)
			if adapter == "codex" {
				refusedBeforeItsFirstTurn(t, runs, home, repo, "process skilled ("+process+"): adapter codex of runtime codex cannot give a call its skills (ADR-021): review, style)", "skilled")
			} else {
				ranWithSkills(t, runs, home, repo, adapter, map[string]string{"review": review, "style": style}, "skilled")
			}
		})
	}
}

// Assert the actual folder and bytes the fake saw while the call ran,
// and that the adapter removed the folder once the call ended.
func ranWithSkills(t *testing.T, runs *newRuns, home, repo, adapter string, skills map[string]string, args ...string) run {
	t.Helper()
	result := agister(t, home, repo, append(append([]string{"run"}, args...), "--quiet", "--timeout", "1m")...)
	if result.code != cli.ExitCompleted {
		t.Fatalf("run %v: %d\n%s%s", args, result.code, result.stdout, result.stderr)
	}
	ran := runs.one(t)
	data, err := json.Marshal(ran.first["skills"])
	if err != nil {
		t.Fatal(err)
	}
	var given map[string]map[string]string
	if err := json.Unmarshal(data, &given); err != nil {
		t.Fatal(err)
	}
	wantFolders := 1
	if adapter == "pi" {
		wantFolders = len(skills)
	}
	if len(given) != wantFolders {
		t.Fatalf("runtime folders = %+v", ran.first)
	}
	seen := map[string]string{}
	for dir, files := range given {
		if _, err := os.Stat(dir); !os.IsNotExist(err) {
			t.Fatalf("folder %s survived call: %v", dir, err)
		}
		for path, text := range files {
			if path == ".claude-plugin/plugin.json" {
				if text != "{\"name\":\"agister\"}\n" {
					t.Fatalf("manifest = %q", text)
				}
				continue
			}
			name := filepath.Base(filepath.Dir(path))
			if adapter == "pi" {
				name = filepath.Base(dir)
			}
			seen[name] = text
		}
	}
	if !reflect.DeepEqual(seen, skills) {
		t.Fatalf("runtime skills = %+v, want %+v", seen, skills)
	}
	return ran
}
