package pages

import (
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"testing"
)

func symlink(t *testing.T, target, link string) {
	t.Helper()
	mkdir(t, filepath.Dir(link))
	if err := os.Symlink(target, link); err != nil {
		t.Fatal(err)
	}
}

// realDir is dir with its symlinks resolved: a temp dir can sit below one.
func realDir(t *testing.T, dir string) string {
	t.Helper()
	real, err := filepath.EvalSymlinks(dir)
	if err != nil {
		t.Fatal(err)
	}
	return real
}

func skillMD(name, description string) string {
	return "---\nname: " + name + "\ndescription: " + description + "\n---\n# " + name + "\n"
}

// skillsIn reads the folders adapters load in repo and under home, and
// returns them by their name.
func skillsIn(t *testing.T, repo, home string, adapters ...string) map[string]SkillFolder {
	t.Helper()
	folders := map[string]SkillFolder{}
	for _, f := range ReadSkills(repo, adapters, SkillHomes{Home: home}) {
		folders[f.Folder] = f
	}
	return folders
}

func skillNamed(t *testing.T, f SkillFolder, name string) Skill {
	t.Helper()
	for _, s := range f.Skills {
		if s.Name == name {
			return s
		}
	}
	t.Fatalf("%s: no skill %s in %+v", f.Folder, name, f.Skills)
	return Skill{}
}

func TestSkillHomesComeFromTheEnvironment(t *testing.T) {
	t.Parallel()
	env := map[string]string{"HOME": "/h", "CODEX_HOME": "/c", "PI_CODING_AGENT_DIR": "/p"}
	got := SkillHomesFrom(func(k string) string { return env[k] }, "/fallback")
	if got != (SkillHomes{Home: "/h", CodexHome: "/c", PiAgentDir: "/p"}) {
		t.Errorf("got %+v", got)
	}
	got = SkillHomesFrom(func(string) string { return "" }, "/fallback")
	if got != (SkillHomes{Home: "/fallback"}) {
		t.Errorf("unset: %+v", got)
	}
}

func TestSkillFoldersAreTheTablesPerAdapter(t *testing.T) {
	t.Parallel()
	repo, home := "/r", "/h"
	names := func(adapter string, homes SkillHomes) []string {
		var got []string
		for _, f := range ReadSkills(repo, []string{adapter}, homes) {
			got = append(got, f.Scope+" "+f.Folder+" "+f.Path)
		}
		return got
	}
	plain := SkillHomes{Home: home}
	for adapter, want := range map[string][]string{
		"claude-code": {"repo .claude/skills /r/.claude/skills", "home ~/.claude/skills /h/.claude/skills",
			"home ~/.claude/skills/synced /h/.claude/skills/synced"},
		"codex": {"repo .agents/skills /r/.agents/skills", "repo .codex/skills /r/.codex/skills",
			"home ~/.agents/skills /h/.agents/skills", "home ~/.codex/skills /h/.codex/skills",
			"home ~/.codex/skills/.system /h/.codex/skills/.system"},
		"pi": {"repo .agents/skills /r/.agents/skills", "repo .pi/skills /r/.pi/skills",
			"home ~/.agents/skills /h/.agents/skills", "home ~/.pi/agent/skills /h/.pi/agent/skills"},
		"opencode": {"repo .agents/skills /r/.agents/skills", "repo .claude/skills /r/.claude/skills",
			"repo .opencode/skills /r/.opencode/skills", "home ~/.agents/skills /h/.agents/skills",
			"home ~/.claude/skills /h/.claude/skills", "home ~/.claude/skills/synced /h/.claude/skills/synced",
			"home ~/.config/opencode/skills /h/.config/opencode/skills"},
		"unknown": nil,
	} {
		if got := names(adapter, plain); !reflect.DeepEqual(got, want) {
			t.Errorf("%s:\n got %q\nwant %q", adapter, got, want)
		}
	}

	set := SkillHomes{Home: home, CodexHome: "/c", PiAgentDir: "/p"}
	if got := names("codex", set); !reflect.DeepEqual(got[3:], []string{"home $CODEX_HOME/skills /c/skills", "home $CODEX_HOME/skills/.system /c/skills/.system"}) {
		t.Errorf("CODEX_HOME: %q", got)
	}
	if got := names("pi", set); got[3] != "home $PI_CODING_AGENT_DIR/skills /p/skills" {
		t.Errorf("PI_CODING_AGENT_DIR: %q", got)
	}
	// No repo: the home folders only; no home: the repo folders only.
	if got := ReadSkills("", []string{"claude-code"}, plain); len(got) != 2 || got[0].Scope != "home" {
		t.Errorf("no repo: %+v", got)
	}
	if got := ReadSkills(repo, []string{"claude-code"}, SkillHomes{}); len(got) != 1 || got[0].Scope != "repo" {
		t.Errorf("no home: %+v", got)
	}
}

func TestAFolderSeveralAdaptersLoadIsReadOnce(t *testing.T) {
	t.Parallel()
	folders := ReadSkills("/r", []string{"codex", "pi", "opencode"}, SkillHomes{Home: "/h"})
	var agents []SkillFolder
	for _, f := range folders {
		if f.Folder == ".agents/skills" || f.Folder == "~/.agents/skills" {
			agents = append(agents, f)
		}
	}
	if len(agents) != 2 || !reflect.DeepEqual(agents[0].Adapters, []string{"codex", "pi", "opencode"}) {
		t.Errorf("got %+v", agents)
	}
	if folders[0].Scope != "repo" || folders[len(folders)-1].Scope != "home" {
		t.Errorf("repo folders first: %+v", folders)
	}
}

func TestAPlainSkillIsReadAndPassesItsChecks(t *testing.T) {
	t.Parallel()
	repo := realDir(t, t.TempDir())
	text := skillMD("review", "Reviews a diff.")
	write(t, filepath.Join(repo, ".claude", "skills", "review", "SKILL.md"), text)
	write(t, filepath.Join(repo, ".claude", "skills", "review", "notes.md"), "not read")
	write(t, filepath.Join(repo, ".claude", "skills", "README.md"), "a file, not a skill")
	mkdir(t, filepath.Join(repo, ".claude", "skills", ".git"))

	folders, reads := readsIn(t, repo, "", "claude-code")
	// SKILL.md only: notes.md beside it is never read (ADR-011).
	if want := []string{filepath.Join(repo, ".claude", "skills", "review", "SKILL.md")}; !reflect.DeepEqual(reads, want) {
		t.Errorf("read %q, want %q", reads, want)
	}
	f := folders[".claude/skills"]
	if f.State != "" || f.Real != filepath.Join(repo, ".claude", "skills") || len(f.Skills) != 1 {
		t.Fatalf("folder %+v", f)
	}
	got := f.Skills[0]
	want := Skill{
		Name: "review", Path: filepath.Join(repo, ".claude", "skills", "review"), Real: filepath.Join(repo, ".claude", "skills", "review"),
		Content: text, Description: "Reviews a diff.", Checks: Checks{Passed: true},
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("got  %+v\nwant %+v", got, want)
	}
}

func TestASymlinkedSkillEntryIsReadAtItsRealPath(t *testing.T) {
	t.Parallel()
	root := realDir(t, t.TempDir())
	repo := filepath.Join(root, "repo")
	elsewhere := filepath.Join(root, "shared", "go")
	write(t, filepath.Join(elsewhere, "SKILL.md"), skillMD("go", "Go."))
	symlink(t, elsewhere, filepath.Join(repo, ".claude", "skills", "go"))

	s := skillNamed(t, skillsIn(t, repo, "", "claude-code")[".claude/skills"], "go")
	if s.Link != elsewhere || s.Real != elsewhere || s.Path != filepath.Join(repo, ".claude", "skills", "go") || !s.Checks.Passed || s.Content == "" {
		t.Errorf("got %+v", s)
	}
}

func TestASymlinkedFolderIsReadAtItsRealPath(t *testing.T) {
	t.Parallel()
	root := realDir(t, t.TempDir())
	home := filepath.Join(root, "home")
	dotfiles := filepath.Join(root, "dotfiles", "skills")
	write(t, filepath.Join(dotfiles, "plan", "SKILL.md"), skillMD("plan", "Plans."))
	symlink(t, dotfiles, filepath.Join(home, ".claude", "skills"))

	f := skillsIn(t, "", home, "claude-code")["~/.claude/skills"]
	if f.Link != dotfiles || f.Real != dotfiles || f.Path != filepath.Join(home, ".claude", "skills") {
		t.Errorf("folder %+v", f)
	}
	s := skillNamed(t, f, "plan")
	if s.Path != filepath.Join(home, ".claude", "skills", "plan") || s.Real != filepath.Join(dotfiles, "plan") || !s.Checks.Passed {
		t.Errorf("skill %+v", s)
	}
}

// readsIn is skillsIn with the SKILL.md reader spied on: it returns the
// folders and every file read.
func readsIn(t *testing.T, repo, home string, adapters ...string) (map[string]SkillFolder, []string) {
	t.Helper()
	var reads []string
	read := func(path string) ([]byte, error) {
		reads = append(reads, path)
		return os.ReadFile(path)
	}
	folders := map[string]SkillFolder{}
	for _, f := range readSkills(repo, adapters, SkillHomes{Home: home}, read) {
		folders[f.Folder] = f
	}
	return folders, reads
}

func TestASkillMDOutsideItsSkillIsNotRead(t *testing.T) {
	t.Parallel()
	repo := realDir(t, t.TempDir())
	write(t, filepath.Join(repo, "secret.md"), skillMD("leak", "Not a skill's file."))
	symlink(t, filepath.Join(repo, "secret.md"), filepath.Join(repo, ".claude", "skills", "leak", "SKILL.md"))
	// A link to another skill's file is outside this skill too.
	write(t, filepath.Join(repo, ".claude", "skills", "a", "SKILL.md"), skillMD("a", "A."))
	symlink(t, "../a/SKILL.md", filepath.Join(repo, ".claude", "skills", "b", "SKILL.md"))
	// A link inside the skill is read.
	write(t, filepath.Join(repo, ".claude", "skills", "c", "docs", "skill.md"), skillMD("c", "C."))
	symlink(t, "docs/skill.md", filepath.Join(repo, ".claude", "skills", "c", "SKILL.md"))

	folders, reads := readsIn(t, repo, "", "claude-code")
	f := folders[".claude/skills"]
	// Only a's and c's files are read: not secret.md, and a's file not
	// again for b.
	if want := []string{filepath.Join(repo, ".claude", "skills", "a", "SKILL.md"), filepath.Join(repo, ".claude", "skills", "c", "docs", "skill.md")}; !reflect.DeepEqual(reads, want) {
		t.Errorf("read %q, want %q", reads, want)
	}
	for _, name := range []string{"leak", "b"} {
		s := skillNamed(t, f, name)
		if s.State != SkillOutside || s.Content != "" || s.Description != "" || s.Checks.Passed || !reflect.DeepEqual(s.Checks.Failed, []string{"SKILL.md is outside its skill"}) {
			t.Errorf("%s: %+v", name, s)
		}
	}
	if s := skillNamed(t, f, "c"); s.State != "" || !s.Checks.Passed || !strings.Contains(s.Content, "name: c") {
		t.Errorf("c: %+v", s)
	}
}

func TestBrokenAndLoopingLinksAreShownAsBroken(t *testing.T) {
	t.Parallel()
	root := realDir(t, t.TempDir())
	repo := filepath.Join(root, "repo")
	skills := filepath.Join(repo, ".claude", "skills")
	symlink(t, filepath.Join(root, "gone"), filepath.Join(skills, "gone"))
	symlink(t, filepath.Join(skills, "loop-b"), filepath.Join(skills, "loop-a"))
	symlink(t, filepath.Join(skills, "loop-a"), filepath.Join(skills, "loop-b"))
	symlink(t, filepath.Join(root, "nowhere.md"), filepath.Join(skills, "dangling", "SKILL.md"))
	symlink(t, "SKILL.md", filepath.Join(skills, "self", "SKILL.md"))

	f := skillsIn(t, repo, "", "claude-code")[".claude/skills"]
	for name, check := range map[string]string{
		"gone": "the link does not resolve", "loop-a": "the link does not resolve", "loop-b": "the link does not resolve",
		"dangling": "SKILL.md's link does not resolve", "self": "SKILL.md's link does not resolve",
	} {
		s := skillNamed(t, f, name)
		if s.State != SkillBrokenLink || s.Checks.Passed || !reflect.DeepEqual(s.Checks.Failed, []string{check}) {
			t.Errorf("%s: %+v", name, s)
		}
	}

	// A folder that is a broken or looping link lists nothing and says so.
	home := filepath.Join(root, "home")
	symlink(t, filepath.Join(root, "gone"), filepath.Join(home, ".claude", "skills"))
	symlink(t, filepath.Join(home, ".agents", "skills"), filepath.Join(home, ".agents", "skills"))
	folders := skillsIn(t, "", home, "claude-code", "codex")
	for _, name := range []string{"~/.claude/skills", "~/.agents/skills"} {
		if f := folders[name]; f.State != FolderBrokenLink || len(f.Skills) != 0 {
			t.Errorf("%s: %+v", name, f)
		}
	}
}

func TestATooLargeSkillMDIsNotReadNorChecked(t *testing.T) {
	t.Parallel()
	repo := realDir(t, t.TempDir())
	write(t, filepath.Join(repo, ".claude", "skills", "big", "SKILL.md"), "---\nname: other\n---\n"+strings.Repeat("x", fileCap))
	write(t, filepath.Join(repo, ".claude", "skills", "edge", "SKILL.md"), skillMD("edge", "E.")+strings.Repeat("x", fileCap-len(skillMD("edge", "E."))))

	folders, reads := readsIn(t, repo, "", "claude-code")
	f := folders[".claude/skills"]
	if want := []string{filepath.Join(repo, ".claude", "skills", "edge", "SKILL.md")}; !reflect.DeepEqual(reads, want) {
		t.Errorf("read %q, want %q", reads, want)
	}
	if s := skillNamed(t, f, "big"); s.State != SkillTooLarge || s.Content != "" || !reflect.DeepEqual(s.Checks.Failed, []string{"SKILL.md is over 256 KB"}) {
		t.Errorf("big: %+v", s.Checks)
	}
	if s := skillNamed(t, f, "edge"); s.State != "" || len(s.Content) != fileCap || !s.Checks.Passed {
		t.Errorf("edge: %d bytes, %+v", len(s.Content), s.Checks)
	}
}

func TestTheChecksNameEachFailure(t *testing.T) {
	t.Parallel()
	repo := realDir(t, t.TempDir())
	skills := filepath.Join(repo, ".claude", "skills")
	for name, text := range map[string]string{
		"no-name":     "---\ndescription: D.\n---\n",
		"empty":       "---\nname: \"\"\ndescription: \"  \"\n---\n",
		"no-desc":     "---\nname: no-desc\n---\nbody\n",
		"renamed":     skillMD("other", "D."),
		"bad-yaml":    "---\nname: [unclosed\n---\n",
		"unclosed":    "---\nname: unclosed\ndescription: D.\n",
		"no-front":    "# Just Markdown\n",
		"blank":       "",
		"crlf":        "---\r\nname: crlf\r\ndescription: D.\r\n---\r\nbody\r\n",
		"not-strings": "---\nname: 3\ndescription: [a]\n---\n",
	} {
		write(t, filepath.Join(skills, name, "SKILL.md"), text)
	}
	mkdir(t, filepath.Join(skills, "missing"))
	mkdir(t, filepath.Join(skills, "dir", "SKILL.md"))

	f := skillsIn(t, repo, "", "claude-code")[".claude/skills"]
	for name, want := range map[string][]string{
		"no-name":     {"name is missing or empty"},
		"empty":       {"name is missing or empty", "description is missing or empty"},
		"no-desc":     {"description is missing or empty"},
		"renamed":     {"name other is not the folder's name renamed"},
		"no-front":    {"no front matter"},
		"blank":       {"no front matter"},
		"crlf":        nil,
		"not-strings": {"name is missing or empty", "description is missing or empty"},
		"missing":     {"SKILL.md is missing"},
		"dir":         {"SKILL.md is not a file"},
	} {
		s := skillNamed(t, f, name)
		if s.Checks.Passed != (want == nil) || !reflect.DeepEqual(s.Checks.Failed, want) {
			t.Errorf("%s: %+v, want %q", name, s.Checks, want)
		}
	}
	for _, name := range []string{"bad-yaml", "unclosed"} {
		s := skillNamed(t, f, name)
		if s.Checks.Passed || len(s.Checks.Failed) != 1 || !strings.HasPrefix(s.Checks.Failed[0], "front matter does not parse") || s.Content == "" {
			t.Errorf("%s: %+v", name, s)
		}
	}
	if s := skillNamed(t, f, "missing"); s.State != SkillMissing {
		t.Errorf("missing: %+v", s)
	}
	if s := skillNamed(t, f, "dir"); s.State != SkillNotAFile {
		t.Errorf("dir: %+v", s)
	}
}

func TestTheSameNameInTwoFoldersIsShownInBoth(t *testing.T) {
	t.Parallel()
	root := realDir(t, t.TempDir())
	repo, home := filepath.Join(root, "repo"), filepath.Join(root, "home")
	write(t, filepath.Join(repo, ".claude", "skills", "review", "SKILL.md"), skillMD("review", "Repo's."))
	write(t, filepath.Join(home, ".claude", "skills", "review", "SKILL.md"), skillMD("review", "Home's."))

	folders := skillsIn(t, repo, home, "claude-code")
	if d := skillNamed(t, folders[".claude/skills"], "review").Description; d != "Repo's." {
		t.Errorf("repo: %q", d)
	}
	if d := skillNamed(t, folders["~/.claude/skills"], "review").Description; d != "Home's." {
		t.Errorf("home: %q", d)
	}
}

func TestBelowTheTopLevelSymlinkedDirectoriesAreNotFollowed(t *testing.T) {
	t.Parallel()
	root := realDir(t, t.TempDir())
	home := filepath.Join(root, "home")
	elsewhere := filepath.Join(root, "elsewhere")
	write(t, filepath.Join(elsewhere, "hidden", "SKILL.md"), skillMD("hidden", "H."))
	// synced/ is a folder of its own; a symlink there is below the top
	// level of ~/.claude/skills and is not followed.
	symlink(t, elsewhere, filepath.Join(home, ".claude", "skills", "synced"))
	// A group of skills inside a skill is not listed either.
	write(t, filepath.Join(home, ".claude", "skills", "top", "SKILL.md"), skillMD("top", "T."))
	symlink(t, elsewhere, filepath.Join(home, ".claude", "skills", "top", "group"))

	folders := skillsIn(t, "", home, "claude-code")
	parent := folders["~/.claude/skills"]
	if len(parent.Skills) != 1 || parent.Skills[0].Name != "top" {
		t.Errorf("parent lists %+v", parent.Skills)
	}
	if synced := folders["~/.claude/skills/synced"]; synced.State != FolderNotFollowed || len(synced.Skills) != 0 || synced.Link != elsewhere {
		t.Errorf("synced: %+v", synced)
	}

	// A group in synced/ that is a symlinked directory is not followed.
	other := filepath.Join(root, "other")
	symlink(t, elsewhere, filepath.Join(other, ".claude", "skills", "synced", "linked"))
	if synced := skillsIn(t, "", other, "claude-code")["~/.claude/skills/synced"]; synced.State != "" || len(synced.Skills) != 0 {
		t.Errorf("linked group: %+v", synced)
	}
}

func TestSyncedSkillsAreReadFromTheirGroups(t *testing.T) {
	t.Parallel()
	root := realDir(t, t.TempDir())
	home := filepath.Join(root, "home")
	synced := filepath.Join(home, ".claude", "skills", "synced")
	text := skillMD("docx", "Word files.")
	write(t, filepath.Join(synced, "a1b2", "docx", "SKILL.md"), text)
	write(t, filepath.Join(synced, "a1b2", "README.md"), "a file, not a skill")
	mkdir(t, filepath.Join(synced, "a1b2", "empty"))
	write(t, filepath.Join(synced, "c3d4", "pdf", "SKILL.md"), skillMD("pdf", "PDF files."))
	write(t, filepath.Join(synced, "notes.md"), "a file, not a group")
	mkdir(t, filepath.Join(synced, ".cache", "hidden"))

	// OpenCode reads the same ~/.claude/skills, synced/ included.
	for _, adapter := range []string{"claude-code", "opencode"} {
		folders := skillsIn(t, "", home, adapter)
		f := folders["~/.claude/skills/synced"]
		var names []string
		for _, s := range f.Skills {
			names = append(names, s.Name)
		}
		if f.State != "" || !reflect.DeepEqual(names, []string{"docx", "empty", "pdf"}) {
			t.Fatalf("%s: synced %+v", adapter, f)
		}
		want := Skill{
			Name: "docx", Path: filepath.Join(synced, "a1b2", "docx"), Real: filepath.Join(synced, "a1b2", "docx"),
			Content: text, Description: "Word files.", Checks: Checks{Passed: true},
		}
		if got := skillNamed(t, f, "docx"); !reflect.DeepEqual(got, want) {
			t.Errorf("%s:\n got %+v\nwant %+v", adapter, got, want)
		}
		if s := skillNamed(t, f, "empty"); s.State != SkillMissing {
			t.Errorf("%s: empty %+v", adapter, s)
		}
		if n := len(folders["~/.claude/skills"].Skills); n != 0 {
			t.Errorf("%s: synced listed as a skill of its parent: %+v", adapter, folders["~/.claude/skills"].Skills)
		}
	}
}

func TestAMissingFolderListsNothing(t *testing.T) {
	t.Parallel()
	home := realDir(t, t.TempDir())
	write(t, filepath.Join(home, ".config", "opencode", "skills"), "a file")
	folders := skillsIn(t, "", home, "opencode")
	if f := folders["~/.agents/skills"]; f.State != FolderMissing || f.Skills == nil || len(f.Skills) != 0 {
		t.Errorf("missing: %+v", f)
	}
	if f := folders["~/.config/opencode/skills"]; f.State != FolderNotDirectory {
		t.Errorf("a file: %+v", f)
	}
}

func TestSkillsEndpointReadsTheFoldersOfTheSettingsRuntimes(t *testing.T) {
	t.Parallel()
	root := realDir(t, t.TempDir())
	user := filepath.Join(root, "user")
	home := filepath.Join(user, ".agister")
	write(t, filepath.Join(home, "runtimes", "claude-code.yaml"), "name: claude-code\nadapter: claude-code\n")
	write(t, filepath.Join(home, "runtimes", "main.yaml"), "adapter: pi\n")
	write(t, filepath.Join(home, "runtimes", "broken.yaml"), "adapter: [\n")
	repo := filepath.Join(root, "repo")
	// The repo's main.yml replaces home's main.yaml: codex, not pi.
	write(t, filepath.Join(repo, ".agister", "runtimes", "main.yml"), "adapter: codex\n")
	write(t, filepath.Join(repo, ".claude", "skills", "r", "SKILL.md"), skillMD("r", "R."))
	write(t, filepath.Join(user, ".claude", "skills", "u", "SKILL.md"), skillMD("u", "U."))
	write(t, filepath.Join(user, ".pi", "agent", "skills", "p", "SKILL.md"), skillMD("p", "P."))
	h := Handler(home, noChoose(t), owners(), SkillHomes{Home: user})

	var got SkillsReply
	if code := get(t, h, "127.0.0.1", "/api/skills?path="+q(repo), &got); code != 200 {
		t.Fatalf("status %d", code)
	}
	var folders []string
	for _, f := range got.Folders {
		folders = append(folders, f.Folder)
	}
	if got.Home || !reflect.DeepEqual(got.Adapters, []string{"claude-code", "codex"}) || !reflect.DeepEqual(folders, []string{
		".claude/skills", ".agents/skills", ".codex/skills",
		"~/.claude/skills", "~/.claude/skills/synced", "~/.agents/skills", "~/.codex/skills", "~/.codex/skills/.system",
	}) {
		t.Fatalf("repo: home=%v adapters=%v folders=%q", got.Home, got.Adapters, folders)
	}
	if got.Folders[0].Skills[0].Name != "r" || got.Folders[3].Skills[0].Name != "u" {
		t.Errorf("skills: %+v", got.Folders)
	}

	// ~, however asked: home's runtimes, home folders only.
	for _, path := range []string{"~", user} {
		var tilde SkillsReply
		if code := get(t, h, "localhost", "/api/skills?path="+q(path), &tilde); code != 200 {
			t.Fatalf("%s: status %d", path, code)
		}
		folders = nil
		for _, f := range tilde.Folders {
			folders = append(folders, f.Scope+" "+f.Folder)
		}
		if !tilde.Home || !reflect.DeepEqual(tilde.Adapters, []string{"claude-code", "pi"}) || !reflect.DeepEqual(folders, []string{
			"home ~/.claude/skills", "home ~/.claude/skills/synced", "home ~/.agents/skills", "home ~/.pi/agent/skills",
		}) {
			t.Errorf("%s: home=%v adapters=%v folders=%q", path, tilde.Home, tilde.Adapters, folders)
		}
	}
}

func TestARepoRuntimeSettingsLeavesOutReplacesNothing(t *testing.T) {
	t.Parallel()
	root := realDir(t, t.TempDir())
	user := filepath.Join(root, "user")
	home := filepath.Join(user, ".agister")
	write(t, filepath.Join(home, "runtimes", "main.yaml"), "adapter: pi\n")
	repo := filepath.Join(root, "repo")
	write(t, filepath.Join(repo, ".agister", "runtimes", "main.yaml"), "adapter: codex\n"+strings.Repeat("#", fileCap))
	// A file Settings admits that does not parse still replaces home's.
	write(t, filepath.Join(home, "runtimes", "other.yaml"), "adapter: claude-code\n")
	write(t, filepath.Join(repo, ".agister", "runtimes", "other.yaml"), "adapter: [\n")
	write(t, filepath.Join(user, ".pi", "agent", "skills", "p", "SKILL.md"), skillMD("p", "P."))
	h := Handler(home, noChoose(t), owners(), SkillHomes{Home: user})

	var settings struct {
		Files, HomeFiles map[string]string
	}
	if code := get(t, h, "127.0.0.1", "/api/settings?path="+q(repo), &settings); code != 200 {
		t.Fatalf("settings: status %d", code)
	}
	if _, ok := settings.Files["runtimes/main.yaml"]; ok || settings.HomeFiles["runtimes/main.yaml"] != "adapter: pi\n" {
		t.Fatalf("settings: %+v", settings)
	}
	var skills SkillsReply
	if code := get(t, h, "127.0.0.1", "/api/skills?path="+q(repo), &skills); code != 200 {
		t.Fatalf("skills: status %d", code)
	}
	if !reflect.DeepEqual(skills.Adapters, []string{"pi"}) {
		t.Fatalf("adapters %v, want home's pi", skills.Adapters)
	}
	for _, f := range skills.Folders {
		if f.Folder == "~/.pi/agent/skills" && (len(f.Skills) != 1 || f.Skills[0].Name != "p") {
			t.Errorf("pi skills: %+v", f.Skills)
		}
	}
}

func TestSkillsEndpointRefusesWhatSettingsRefuses(t *testing.T) {
	t.Parallel()
	home := t.TempDir()
	h := Handler(home, noChoose(t), owners(), SkillHomes{Home: home})
	for target, want := range map[string]int{
		"/api/skills?path=relative":             400,
		"/api/skills?path=":                     400,
		"/api/skills?path=" + q(t.TempDir()):    404,
		"/api/skills?path=" + q("/no/such/dir"): 404,
	} {
		if code := get(t, h, "127.0.0.1", target, nil); code != want {
			t.Errorf("%s: %d, want %d", target, code, want)
		}
	}
	if code := get(t, h, "evil.example:7465", "/api/skills?path=~", nil); code != 403 {
		t.Errorf("another host: %d", code)
	}
	var tilde struct {
		Adapters []string
		Folders  []SkillFolder
	}
	if code := get(t, h, "127.0.0.1", "/api/skills?path=~", &tilde); code != 200 || tilde.Adapters == nil || tilde.Folders == nil || len(tilde.Folders) != 0 {
		t.Errorf("no runtimes: %d %+v", code, tilde)
	}
}

// ADR-021 rule 1, ADR-011 rule 7: a settings skill is checked as any skill
// is, and its folder holds SKILL.md alone; a check names what else it
// holds. Only a regular SKILL.md within the limit is read.
func TestASettingsSkillFailsEachCheckAndPassesWhenWhole(t *testing.T) {
	t.Parallel()
	dir := realDir(t, t.TempDir())
	skills := filepath.Join(dir, "skills")
	for name, text := range map[string]string{
		"whole":    skillMD("whole", "W."),
		"no-front": "# Just Markdown\n",
		"no-name":  "---\ndescription: D.\n---\n",
		"no-desc":  "---\nname: no-desc\n---\n",
		"renamed":  skillMD("other", "D."),
		"extra":    skillMD("extra", "E."),
		"broken":   "---\nname: broken\n---\n",
	} {
		write(t, filepath.Join(skills, name, "SKILL.md"), text)
	}
	write(t, filepath.Join(skills, "extra", "notes.txt"), "beside")
	mkdir(t, filepath.Join(skills, "extra", "scripts"))
	write(t, filepath.Join(skills, "broken", "notes.txt"), "beside")
	write(t, filepath.Join(skills, "bare", "notes.txt"), "no SKILL.md")
	write(t, filepath.Join(skills, "big", "SKILL.md"), "---\nname: big\n---\n"+strings.Repeat("x", fileCap))
	write(t, filepath.Join(dir, "elsewhere", "SKILL.md"), skillMD("linked", "L."))
	symlink(t, filepath.Join(dir, "elsewhere", "SKILL.md"), filepath.Join(skills, "linked", "SKILL.md"))
	mkdir(t, filepath.Join(skills, "dir", "SKILL.md"))
	// A symlinked skill folder is not followed, as the settings files are not.
	symlink(t, filepath.Join(dir, "elsewhere"), filepath.Join(skills, "followed"))
	write(t, filepath.Join(skills, "loose.md"), "a file in skills/ is no skill")

	var reads []string
	read := func(path string) ([]byte, error) {
		reads = append(reads, path)
		return os.ReadFile(path)
	}
	got := map[string]SettingsSkill{}
	for _, s := range readSettingsSkills("repo", dir, read) {
		got[s.Name] = s
	}
	beside := func(what string) string {
		return "holds " + what + " beside SKILL.md: a skill is its SKILL.md alone, and its other files are not given to a call"
	}
	for name, want := range map[string]struct {
		state  string
		failed []string
	}{
		"whole":    {},
		"no-front": {failed: []string{"no front matter"}},
		"no-name":  {failed: []string{"name is missing or empty"}},
		"no-desc":  {failed: []string{"description is missing or empty"}},
		"renamed":  {failed: []string{"name other is not the folder's name renamed"}},
		"extra":    {failed: []string{beside("notes.txt, scripts")}},
		"broken":   {failed: []string{"description is missing or empty", beside("notes.txt")}},
		"bare":     {SkillMissing, []string{"SKILL.md is missing", beside("notes.txt")}},
		"big":      {SkillTooLarge, []string{"SKILL.md is over 256 KB"}},
		"linked":   {SkillNotAFile, []string{"SKILL.md is not a regular file"}},
		"dir":      {SkillNotAFile, []string{"SKILL.md is not a regular file"}},
	} {
		s, ok := got[name]
		if !ok {
			t.Errorf("%s: not listed", name)
			continue
		}
		if s.Scope != "repo" || s.Path != filepath.Join(skills, name) || s.State != want.state ||
			s.Checks.Passed != (want.failed == nil) || !reflect.DeepEqual(s.Checks.Failed, want.failed) {
			t.Errorf("%s: %+v, want state %q failed %q", name, s, want.state, want.failed)
		}
	}
	if s := got["whole"]; s.Description != "W." || s.Content != skillMD("whole", "W.") {
		t.Errorf("whole: %+v", s)
	}
	if len(got) != 11 {
		t.Errorf("listed %d skills, want 11 (no symlinked folder, no file): %v", len(got), got)
	}
	var want []string
	for _, name := range []string{"broken", "extra", "no-desc", "no-front", "no-name", "renamed", "whole"} {
		want = append(want, filepath.Join(skills, name, "SKILL.md"))
	}
	sort.Strings(reads)
	if !reflect.DeepEqual(reads, want) {
		t.Errorf("read %q, want %q", reads, want)
	}
}

// ADR-021 amendment of ADR-011 rule 5: /api/skills carries the skills of
// each settings layer, the repo's first; ~ has home's only.
func TestSkillsEndpointCarriesTheSettingsSkillsOfEachLayer(t *testing.T) {
	t.Parallel()
	root := realDir(t, t.TempDir())
	user := filepath.Join(root, "user")
	home := filepath.Join(user, ".agister")
	write(t, filepath.Join(home, "skills", "plan", "SKILL.md"), skillMD("plan", "Home plan."))
	write(t, filepath.Join(home, "skills", "go", "SKILL.md"), skillMD("go", "Go."))
	repo := filepath.Join(root, "repo")
	write(t, filepath.Join(repo, ".agister", "skills", "plan", "SKILL.md"), skillMD("plan", "Repo plan."))
	h := Handler(home, noChoose(t), owners(), SkillHomes{Home: user})

	layers := func(path string) []string {
		var got SkillsReply
		if code := get(t, h, "127.0.0.1", "/api/skills?path="+q(path), &got); code != 200 {
			t.Fatalf("%s: status %d", path, code)
		}
		var out []string
		for _, s := range got.Settings {
			out = append(out, s.Scope+" "+s.Name+" "+s.Description)
		}
		return out
	}
	if got, want := layers(repo), []string{"repo plan Repo plan.", "home go Go.", "home plan Home plan."}; !reflect.DeepEqual(got, want) {
		t.Errorf("repo: %q, want %q", got, want)
	}
	if got, want := layers("~"), []string{"home go Go.", "home plan Home plan."}; !reflect.DeepEqual(got, want) {
		t.Errorf("~: %q, want %q", got, want)
	}
}
