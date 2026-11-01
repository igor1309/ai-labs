package main

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/composition/install"
	"github.com/igor1309/ai-labs/gokit/clocktest"
)

// Contract test: retirement over real temporary settings files and install
// backups. The manual clock supplies the backup time; no runtime is started.
func TestRetiresOnlyTheCodexJudgeCopiesAndKeepsTheirBackup(t *testing.T) {
	t.Parallel()
	home := t.TempDir()
	docs := map[string]string{
		"processes/review_judge_codex.yaml": "name: review_judge_codex\n",
		"workflows/code_review_codex.yaml":  "name: code_review_codex\n",
		"processes/review_judge.yaml":       "name: review_judge\n",
		"workflows/code_review.yaml":        "name: code_review\n",
	}
	for path, content := range docs {
		file := filepath.Join(home, path)
		if err := os.MkdirAll(filepath.Dir(file), 0700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(file, []byte(content), 0600); err != nil {
			t.Fatal(err)
		}
	}
	var stdout, stderr bytes.Buffer
	clock := clocktest.NewClock(time.Date(2026, 10, 13, 0, 0, 0, 0, time.UTC))
	makeRetirement := func(dir string) retirement { return install.Retirer(dir, clock, nil) }
	if code := run(context.Background(), []string{home, "retire-review-judge-codex", "workflow:code_review_codex", "process:review_judge_codex"}, &stdout, &stderr, makeRetirement); code != 0 || !strings.Contains(stdout.String(), "restore with: agister install --restore") || stderr.Len() != 0 {
		t.Fatalf("exit %d: %s%s", code, &stdout, &stderr)
	}
	stamps, err := install.BackupsOf(home).List(context.Background())
	if err != nil || len(stamps) != 1 {
		t.Fatalf("backups %v: %v", stamps, err)
	}
	for path, want := range docs {
		content, err := os.ReadFile(filepath.Join(home, path))
		if strings.Contains(path, "_codex") {
			if !os.IsNotExist(err) {
				t.Fatalf("retired file %s remains: %v", path, err)
			}
			saved, err := os.ReadFile(filepath.Join(home, "backups", stamps[0], path))
			if err != nil || string(saved) != want {
				t.Fatalf("backup %s = %q, %v", path, saved, err)
			}
		} else if err != nil || string(content) != want {
			t.Fatalf("shared file %s = %q, %v", path, content, err)
		}
	}
	stdout.Reset()
	if code := run(context.Background(), []string{home, "retire-review-judge-codex", "workflow:code_review_codex", "process:review_judge_codex"}, &stdout, &stderr, makeRetirement); code != 0 || stdout.String() != "nothing to retire\n" {
		t.Fatalf("repeat exit %d: %s%s", code, &stdout, &stderr)
	}
	stamps, err = install.BackupsOf(home).List(context.Background())
	if err != nil || len(stamps) != 1 {
		t.Fatalf("repeat backups %v: %v", stamps, err)
	}
}

// Invalid arguments must not construct a writer, even with a valid home.
func TestInvalidRetirementArgumentsDoNotReachTheWriter(t *testing.T) {
	t.Parallel()
	for _, args := range [][]string{
		{}, {t.TempDir(), "source"}, {t.TempDir(), "../source", "process:p"},
		{t.TempDir(), "source", "agent:a"}, {t.TempDir(), "source", "process:../p"},
	} {
		var stdout, stderr bytes.Buffer
		code := run(context.Background(), args, &stdout, &stderr, func(string) retirement { t.Fatal("constructed a writer"); return nil })
		if code != 1 || stderr.Len() == 0 || stdout.Len() != 0 {
			t.Fatalf("exit %d: %s%s", code, &stdout, &stderr)
		}
	}
}
