package main

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/adapters/fsdefs"
	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
)

// The rules of the session that delivers a change by delegating its
// implementation and review are the repository's deliver skill, which only
// that session loads (LAB-147). Every agent reads the AGENTS.md files, an
// implementer working on a brief included, so they hold none of them, and
// the implement processes ask for a report of the change only.

// deliverSkillFile is the deliver skill, relative to the repository root.
var deliverSkillFile = filepath.Join(".claude", "skills", "deliver", "SKILL.md")

// The store reads the deliver skill as it reads a settings skill: a folder
// holding its SKILL.md; ParseSkill checks its front matter.
func TestTheDeliverSkillIsALoadableSkill(t *testing.T) {
	t.Parallel()
	dir := filepath.Join("..", "..", "..", ".claude")
	doc, err := fsdefs.Store{Dir: dir}.Read(context.Background(), definition.KindSkill, "deliver")
	if err != nil {
		t.Fatal(err)
	}
	skill, err := definition.ParseSkill(doc)
	if err != nil {
		t.Fatal(err)
	}
	if skill.Name != "deliver" || skill.Description == "" {
		t.Errorf("skill %q, description %q", skill.Name, skill.Description)
	}
}

// No AGENTS.md of the repository says how a change is delegated, reviewed
// or ruled on: those rules are the deliver skill's. A phrase that only
// such a rule has stands in none of them, and the skill has each.
func TestAgentsFilesHoldNoDelegationRules(t *testing.T) {
	t.Parallel()
	root := filepath.Join("..", "..", "..")
	delegation := []string{
		"subagent", "codex exec", "review rounds",
		"agister run implement", "agister run code_review", "agister run adr_review",
		"agister run advisor", "Decision records",
	}
	for _, file := range []string{"AGENTS.md", filepath.Join("agister", "AGENTS.md"), filepath.Join("warder", "AGENTS.md")} {
		text := read(t, filepath.Join(root, file))
		for _, phrase := range delegation {
			if strings.Contains(text, phrase) {
				t.Errorf("%s holds a delegation rule: it says %q", file, phrase)
			}
		}
	}
	skill := read(t, filepath.Join(root, deliverSkillFile))
	for _, phrase := range delegation {
		if !strings.Contains(skill, phrase) {
			t.Errorf("%s lacks %q", deliverSkillFile, phrase)
		}
	}
}

// Each implement process, home's and the repository's own, asks its agent
// to report the change only: what it changed, each check with its exit
// code and final line, the files and the open points, and nothing about
// how the work was organised or dispatched. An instruction is held by its
// short phrases standing in one paragraph, as in
// TestReviewPromptsCarryTheirCoverageContract.
func TestImplementInstructionsAskForTheChangeOnly(t *testing.T) {
	t.Parallel()
	root := filepath.Join("..", "..", "..")
	says := []string{"Report only the change", "what you changed",
		"each check you ran with its exit code and final line",
		"every file you changed, repository-relative", "the points left open",
		"nothing about how the work was organised or dispatched"}
	processes := map[string]string{
		"implement":        filepath.Join(homeFolder, "processes"),
		"implement_codex":  filepath.Join(homeFolder, "processes"),
		"implement_pi":     filepath.Join(homeFolder, "processes"),
		"implement_pi_glm": filepath.Join(homeFolder, "processes"),
		"implement_warder": filepath.Join(".agister", "processes"),
	}
	for name, dir := range processes {
		data, err := os.ReadFile(filepath.Join(root, dir, name+".yaml"))
		if err != nil {
			t.Fatal(err)
		}
		process, err := definition.ParseProcess(definition.Document{
			Source: definition.Source{Kind: definition.KindProcess, Name: name, Path: name + ".yaml"}, Bytes: data,
		})
		if err != nil {
			t.Fatal(err)
		}
		if !carries(process.Instruction, says) {
			t.Errorf("process %s's instruction does not ask for the change only: it lacks one of %q:\n%s",
				name, says, process.Instruction)
		}
	}
}
