package codex_test

import (
	"context"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/codex"
)

// Codex takes skills only from $CODEX_HOME/skills (ADR-021 rule 6): a call
// given skills runs with a home of its thread's.

// userCodexHome is a user's CODEX_HOME: auth.json and AGENTS.md but no
// AGENTS.override.md, and skills/ holding mine, a review of the same name
// as a call's, and Codex's own .system.
func userCodexHome(t *testing.T) string {
	t.Helper()
	user := t.TempDir()
	for path, text := range map[string]string{
		"auth.json":                       `{"token":"user's"}`,
		"AGENTS.md":                       "user's instructions\n",
		"skills/mine/SKILL.md":            "user's mine\n",
		"skills/review/SKILL.md":          "user's review\n",
		"skills/.system/bundled/SKILL.md": "codex's bundled\n",
	} {
		writeFile(t, filepath.Join(user, path), text)
	}
	return user
}

func writeFile(t *testing.T, path, text string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(text), 0o600); err != nil {
		t.Fatal(err)
	}
}

// tree is what dir holds, by slash-separated path: a link as "-> target",
// not followed, and a regular file as its text.
func tree(t *testing.T, dir string) map[string]string {
	t.Helper()
	held := map[string]string{}
	err := filepath.WalkDir(dir, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, _ := filepath.Rel(dir, path)
		switch {
		case entry.Type()&fs.ModeSymlink != 0:
			target, err := os.Readlink(path)
			held[filepath.ToSlash(rel)] = "-> " + target
			return err
		case entry.Type().IsRegular():
			data, err := os.ReadFile(path)
			held[filepath.ToSlash(rel)] = string(data)
			return err
		}
		return err
	})
	if err != nil {
		t.Fatal(err)
	}
	return held
}

// entries are the names in dir; none when it does not exist.
func entries(dir string) []string {
	names := []string{}
	found, _ := os.ReadDir(dir)
	for _, entry := range found {
		names = append(names, entry.Name())
	}
	return names
}

// homeOf is the CODEX_HOME a spec sets; empty when it sets none, and the
// spec must then add nothing to the environment.
func homeOf(t *testing.T, spec codex.Spec) string {
	t.Helper()
	if spec.Env == nil {
		return ""
	}
	if len(spec.Env) != 1 || !strings.HasPrefix(spec.Env[0], "CODEX_HOME=") {
		t.Fatalf("env = %q", spec.Env)
	}
	return strings.TrimPrefix(spec.Env[0], "CODEX_HOME=")
}

// reports is a turn of Codex that reports thread, or no thread at all when
// it is empty.
func reports(thread string) ([]string, codex.Evidence) {
	code := 0
	if thread == "" {
		code = 1
		return nil, codex.Evidence{Exit: &codex.Exit{Code: &code}}
	}
	return []string{`{"type":"thread.started","thread_id":"` + thread + `"}`, `{"type":"turn.completed"}`}, codex.Evidence{Exit: &codex.Exit{Code: &code}}
}

// skilled is a turn request given the skills review and style.
func skilled(prompt string) codex.TurnRequest {
	r := request(prompt)
	r.OutputSchema = nil
	r.Skills = []codex.Skill{{Name: "review", Bytes: []byte("recorded review\n")}, {Name: "style", Bytes: []byte("recorded style\n")}}
	return r
}

// homes is a runner keeping its homes under root, linking to user's, whose
// Codex reports thread and records the home each turn ran with and what
// the home held while it ran.
type homes struct {
	runner *codex.Runner
	spy    *spyTransport
	ran    []string
	held   []map[string]string
}

func runnerOver(t *testing.T, root, user, thread string) *homes {
	h := &homes{}
	h.spy = &spyTransport{Runs: spyRuns{Answer: func(spec codex.Spec) ([]string, codex.Evidence) {
		home := homeOf(t, spec)
		h.ran = append(h.ran, home)
		if home != "" {
			h.held = append(h.held, tree(t, home))
		} else {
			h.held = append(h.held, nil)
		}
		return reports(thread)
	}}}
	h.runner = &codex.Runner{Transport: h.spy, Command: "codex", Homes: root, UserHome: func() (string, error) { return user, nil }}
	return h
}

// A fresh thread whose call names skills runs with a new home under the
// root: links to the user's files where they exist, a link to each of the
// user's skills but .system and the one named as the call's, and the call's
// skills from their bytes. argv is as without skills. After the turn the
// home is named by the reported thread.
func TestAFreshThreadGivenSkillsRunsWithAHomeOfItsOwn(t *testing.T) {
	t.Parallel()
	user, root := userCodexHome(t), filepath.Join(t.TempDir(), "homes")
	h := runnerOver(t, root, user, fakeThread)
	r := skilled("hello")
	turn := h.runner.RunTurn(context.Background(), r, &sink{})
	if turn.Status != codex.Completed || turn.ProviderSessionID != fakeThread {
		t.Fatalf("turn = %+v", turn)
	}
	want := map[string]string{
		"auth.json":              "-> " + filepath.Join(user, "auth.json"),
		"AGENTS.md":              "-> " + filepath.Join(user, "AGENTS.md"),
		"skills/mine":            "-> " + filepath.Join(user, "skills", "mine"),
		"skills/review/SKILL.md": "recorded review\n",
		"skills/style/SKILL.md":  "recorded style\n",
	}
	if len(h.ran) != 1 || filepath.Dir(h.ran[0]) != root || !reflect.DeepEqual(h.held[0], want) {
		t.Fatalf("ran with %q holding %v, want a home under %s holding %v", h.ran, h.held, root, want)
	}
	args, err := codex.Arguments(r, "")
	if err != nil {
		t.Fatal(err)
	}
	if specs := h.spy.Specs(); !reflect.DeepEqual(specs[0].Args, args) {
		t.Fatalf("args = %q, want %q", specs[0].Args, args)
	}
	if names := entries(root); !reflect.DeepEqual(names, []string{fakeThread}) {
		t.Fatalf("homes = %q, want the thread's", names)
	}
	if kept := tree(t, filepath.Join(root, fakeThread)); !reflect.DeepEqual(kept, want) {
		t.Fatalf("kept home = %v", kept)
	}
}

// A home whose turn reported no thread, or one that cannot name a folder,
// is removed after the turn.
func TestAFreshHomeWithNoThreadIsRemoved(t *testing.T) {
	t.Parallel()
	for name, thread := range map[string]string{"none": "", "not a folder's name": "../escape"} {
		root := filepath.Join(t.TempDir(), "homes")
		h := runnerOver(t, root, userCodexHome(t), thread)
		h.runner.RunTurn(context.Background(), skilled("hello"), &sink{})
		if len(h.ran) != 1 || h.ran[0] == "" {
			t.Fatalf("%s: ran with %q", name, h.ran)
		}
		if names := entries(root); len(names) != 0 {
			t.Fatalf("%s: homes = %q", name, names)
		}
	}
}

// A fresh thread whose call names no skill runs with the user's home: no
// environment, no folder.
func TestAFreshThreadWithoutSkillsRunsWithTheUsersHome(t *testing.T) {
	t.Parallel()
	root := filepath.Join(t.TempDir(), "homes")
	h := runnerOver(t, root, userCodexHome(t), fakeThread)
	r := request("hello")
	r.OutputSchema = nil
	if turn := h.runner.RunTurn(context.Background(), r, &sink{}); turn.Status != codex.Completed {
		t.Fatalf("turn = %+v", turn)
	}
	if specs := h.spy.Specs(); len(specs) != 1 || specs[0].Env != nil {
		t.Fatalf("specs = %+v", specs)
	}
	if _, err := os.Stat(root); !errors.Is(err, fs.ErrNotExist) {
		t.Fatalf("homes root: %v", err)
	}
}

// A turn that resumes a thread whose home is under the root runs with it:
// its skills/ is rebuilt from the user's skills and the turn's, and what
// Codex keeps there, .system and its sessions, stays. A turn naming no
// skill leaves none of Agister's in it, and the user's review, no longer
// one of the call's, is linked.
func TestAResumedThreadRunsWithItsHomeAndItsSkillsRebuilt(t *testing.T) {
	t.Parallel()
	user, root := userCodexHome(t), filepath.Join(t.TempDir(), "homes")
	home := filepath.Join(root, fakeThread)
	codexOwn := map[string]string{
		"skills/.system/bundled/SKILL.md": "codex's bundled\n",
		"sessions/rollout.jsonl":          "codex's rollout\n",
	}
	for path, text := range codexOwn {
		writeFile(t, filepath.Join(home, path), text)
	}
	writeFile(t, filepath.Join(home, "skills", "earlier", "SKILL.md"), "an earlier turn's\n")
	h := runnerOver(t, root, user, fakeThread)

	r := skilled("hello")
	r.ResumeSessionID = fakeThread
	r.Skills = r.Skills[:1]
	if turn := h.runner.RunTurn(context.Background(), r, &sink{}); turn.Status != codex.Completed {
		t.Fatalf("turn = %+v", turn)
	}
	r.Skills = nil
	if turn := h.runner.RunTurn(context.Background(), r, &sink{}); turn.Status != codex.Completed {
		t.Fatalf("turn = %+v", turn)
	}
	withSkill := map[string]string{
		"skills/mine":            "-> " + filepath.Join(user, "skills", "mine"),
		"skills/review/SKILL.md": "recorded review\n",
	}
	withoutSkill := map[string]string{
		"skills/mine":   "-> " + filepath.Join(user, "skills", "mine"),
		"skills/review": "-> " + filepath.Join(user, "skills", "review"),
	}
	for _, held := range []map[string]string{withSkill, withoutSkill} {
		for path, text := range codexOwn {
			held[path] = text
		}
	}
	if !reflect.DeepEqual(h.ran, []string{home, home}) || !reflect.DeepEqual(h.held, []map[string]string{withSkill, withoutSkill}) {
		t.Fatalf("ran with %q holding %v", h.ran, h.held)
	}
	if names := entries(root); !reflect.DeepEqual(names, []string{fakeThread}) {
		t.Fatalf("homes = %q", names)
	}
}

// A resumed thread with no home under the root ran in the user's home: a
// turn naming no skill runs with it as before, and one naming skills is
// refused before Codex starts.
func TestAResumedThreadWithNoHomeRanInTheUsersHome(t *testing.T) {
	t.Parallel()
	root := filepath.Join(t.TempDir(), "homes")
	h := runnerOver(t, root, userCodexHome(t), fakeThread)
	r := request("hello")
	r.OutputSchema = nil
	r.ResumeSessionID = fakeThread
	if turn := h.runner.RunTurn(context.Background(), r, &sink{}); turn.Status != codex.Completed {
		t.Fatalf("turn = %+v", turn)
	}
	if specs := h.spy.Specs(); len(specs) != 1 || specs[0].Env != nil {
		t.Fatalf("specs = %+v", specs)
	}

	refused := runnerOver(t, root, userCodexHome(t), fakeThread)
	r = skilled("hello")
	r.ResumeSessionID = fakeThread
	turn := refused.runner.RunTurn(context.Background(), r, &sink{})
	want := "thread " + fakeThread + " ran in the user's CODEX_HOME, where a call's skills cannot be given (ADR-021): review, style; a fresh run gets them"
	if turn.Status != codex.Failed || turn.Error == nil || turn.Error.Class != codex.ClassRefused || turn.Error.Message != want {
		t.Fatalf("turn = %+v", turn)
	}
	if specs := refused.spy.Specs(); len(specs) != 0 {
		t.Fatalf("the refused turn started Codex: %+v", specs)
	}
	if _, err := os.Stat(root); !errors.Is(err, fs.ErrNotExist) {
		t.Fatalf("homes root: %v", err)
	}
}

// A thread ID that cannot name a folder is not resumed, as Pi's runner
// does not resume such a session: the turn fails before Codex starts.
func TestAThreadIDThatCannotNameAFolderIsNotResumed(t *testing.T) {
	t.Parallel()
	for name, skills := range map[string]bool{"with skills": true, "without": false} {
		h := runnerOver(t, filepath.Join(t.TempDir(), "homes"), userCodexHome(t), fakeThread)
		r := skilled("hello")
		if !skills {
			r.Skills = nil
		}
		r.ResumeSessionID = "../escape"
		turn := h.runner.RunTurn(context.Background(), r, &sink{})
		if turn.Status != codex.Failed || turn.Error == nil || turn.Error.Class != codex.ClassRuntimeError || !strings.Contains(turn.Error.Message, "not a thread ID") || len(h.spy.Specs()) != 0 {
			t.Fatalf("%s: turn = %+v, specs %+v", name, turn, h.spy.Specs())
		}
	}
}

// A skill that cannot be written, or a user's home that cannot be found,
// fails the turn before Codex starts, and leaves no home.
func TestAHomeThatCannotBeMadeStopsTheTurnBeforeCodexStarts(t *testing.T) {
	t.Parallel()
	for name, c := range map[string]struct {
		skill    codex.Skill
		userHome func() (string, error)
		reason   string
	}{
		"bad name":     {codex.Skill{Name: "../escape"}, func() (string, error) { return t.TempDir(), nil }, "not a folder's name"},
		"no user home": {codex.Skill{Name: "review"}, func() (string, error) { return "", errors.New("$HOME is not defined") }, "the user's CODEX_HOME is unknown: $HOME is not defined"},
	} {
		root := filepath.Join(t.TempDir(), "homes")
		h := runnerOver(t, root, "", fakeThread)
		h.runner.UserHome = c.userHome
		r := skilled("hello")
		r.Skills = []codex.Skill{c.skill}
		turn := h.runner.RunTurn(context.Background(), r, &sink{})
		if turn.Status != codex.Failed || turn.Error == nil || turn.Error.Class != codex.ClassInternal || !strings.Contains(turn.Error.Message, c.reason) || len(h.spy.Specs()) != 0 {
			t.Fatalf("%s: turn = %+v, specs %+v", name, turn, h.spy.Specs())
		}
		if names := entries(root); len(names) != 0 {
			t.Fatalf("%s: homes = %q", name, names)
		}
	}
}

// The ccusage lookup runs with the turn's home: none for the user's own,
// the thread's home, under its thread's name, otherwise.
func TestTheCostLookupRunsWithTheTurnsHome(t *testing.T) {
	t.Parallel()
	root := filepath.Join(t.TempDir(), "homes")
	h := runnerOver(t, root, userCodexHome(t), fakeThread)
	var looked []string
	h.runner.Sessions = func(_ context.Context, _ time.Duration, home string, _ codex.LookupSink) ([]byte, error) {
		looked = append(looked, home)
		if home != "" {
			if _, err := os.Stat(filepath.Join(home, "skills", "review", "SKILL.md")); err != nil {
				t.Errorf("the lookup's home %s: %v", home, err)
			}
		}
		return []byte(listingJSON("0.25")), nil
	}
	plain := request("hello")
	plain.OutputSchema = nil
	resumed := skilled("hello")
	resumed.ResumeSessionID = fakeThread
	for _, r := range []codex.TurnRequest{plain, skilled("hello"), resumed} {
		if turn := h.runner.RunTurn(context.Background(), r, &sink{}); turn.Session == nil || turn.Session.CostUSD == nil {
			t.Fatalf("turn = %+v", turn)
		}
	}
	home := filepath.Join(root, fakeThread)
	if want := []string{"", home, home}; !reflect.DeepEqual(looked, want) {
		t.Fatalf("lookups ran with %q, want %q", looked, want)
	}
}

// CCUsage sets CODEX_HOME to the home it is given, and adds nothing to the
// environment for the user's own.
func TestCCUsageRunsWithTheHomeItIsGiven(t *testing.T) {
	t.Parallel()
	code := 0
	spy := &spyRuns{Answer: func(codex.Spec) ([]string, codex.Evidence) {
		return []string{listingJSON("0.25")}, codex.Evidence{Exit: &codex.Exit{Code: &code}}
	}}
	lookup := codex.CCUsage(spy, "ccusage", 0)
	for _, home := range []string{"/homes/thread-1", ""} {
		if _, err := lookup(context.Background(), time.Minute, home, &sink{}); err != nil {
			t.Fatal(err)
		}
	}
	specs := spy.Specs()
	if len(specs) != 2 || !reflect.DeepEqual(specs[0].Env, []string{"CODEX_HOME=/homes/thread-1"}) || specs[1].Env != nil {
		t.Fatalf("specs = %+v", specs)
	}
}
