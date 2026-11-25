package folderindex

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"testing/fstest"
)

// Contract test: the index written for a repository tree on disk.
func TestS1_ARepositoryIsListedWithItsREADMEsFirstLine(t *testing.T) {
	t.Parallel()

	base := t.TempDir()
	root := filepath.Join(base, "root")
	repo := filepath.Join(root, "sample repo")
	out := filepath.Join(base, "folders.md")
	mkdir(t, filepath.Join(repo, ".git"))
	readme := filepath.Join(repo, "ReadMe.md")
	writeFile(t, readme, "# Sample\n\nThis is the first line.\nThis is the second line.\n")
	writeFile(t, filepath.Join(repo, "README"), "Second choice.\n")
	writeFile(t, filepath.Join(repo, "README.markdown"), "Third choice.\n")

	runIndex(t, 0, base, out, root)
	assertFile(t, out, header(root)+fmt.Sprintf("- `%s`: This is the first line. ([README](<%s>))\n", repo, readme))
}

// Contract test: discovery stops at a repository's direct projects on disk.
func TestS2_AMonoreposProjectsAreListed(t *testing.T) {
	t.Parallel()

	base := t.TempDir()
	root := filepath.Join(base, "root")
	repo := filepath.Join(root, "monorepo")
	a := filepath.Join(repo, "a")
	b := filepath.Join(repo, "b")
	out := filepath.Join(base, "folders.md")
	mkdir(t, filepath.Join(repo, ".git"))
	mkdir(t, filepath.Join(repo, "no-readme"))
	submodule := filepath.Join(repo, "submodule")
	writeFile(t, filepath.Join(submodule, ".git"), "gitdir: ../.git/modules/submodule\n")
	writeFile(t, filepath.Join(repo, "rEaDmE.Markdown"), "The monorepo.\n")
	mkdir(t, filepath.Join(b, "README.md"))
	writeFile(t, filepath.Join(b, "README"), "Project B.\n")
	writeFile(t, filepath.Join(b, "README.markdown"), "Loses to README.\n")
	writeFile(t, filepath.Join(a, "readme.md"), "Project A.\n")
	writeFile(t, filepath.Join(a, "nested", "README.md"), "Too deep.\n")
	writeFile(t, filepath.Join(repo, ".hidden", "README.md"), "Hidden project.\n")
	writeFile(t, filepath.Join(repo, "node_modules", "README.md"), "Dependency.\n")

	runIndex(t, 0, base, out, root)
	assertFile(t, out, header(root)+fmt.Sprintf(
		"- `%s`: The monorepo. ([README](<%s/rEaDmE.Markdown>))\n"+
			"- `%s`: Project A. ([README](<%s/readme.md>))\n"+
			"- `%s`: Project B. ([README](<%s/README>))\n"+
			"- `%s`: no README\n", repo, repo, a, a, b, b, submodule))
}

// Contract test: a worktree's .git file marks a repository on disk.
func TestS3_ARepositoryWithNoREADMEIsStillListed(t *testing.T) {
	t.Parallel()

	base := t.TempDir()
	root := filepath.Join(base, "root")
	repo := filepath.Join(root, "worktree")
	out := filepath.Join(base, "folders.md")
	writeFile(t, filepath.Join(repo, ".git"), "gitdir: /example/worktrees/worktree\n")

	runIndex(t, 0, base, out, root)
	assertFile(t, out, header(root)+fmt.Sprintf("- `%s`: no README\n", repo))
}

// Contract test: the rendered index uses summaries from READMEs on disk.
func TestS4_OnlyProseMakesTheSummary(t *testing.T) {
	t.Parallel()

	base := t.TempDir()
	root := filepath.Join(base, "root")
	blank := filepath.Join(root, "blank")
	repo := filepath.Join(root, "prose")
	out := filepath.Join(base, "folders.md")
	mkdir(t, filepath.Join(blank, ".git"))
	mkdir(t, filepath.Join(repo, ".git"))
	writeFile(t, filepath.Join(blank, "README.md"), "Title\n=====\n\n![logo](logo.png)\n\n~~~sh\necho no prose\n~~~\n")
	writeFile(t, filepath.Join(repo, "README.md"), "# Title\n\n[![status](badge.svg)](https://example.com)\n"+
		"<div></div>\n<!--\ncomment text\n-->\n````go\n```\nvar ignored int\n````\n\n"+
		"See [guide](https://example.com/guide(v2)) and [API][docs]: "+strings.Repeat("界", 160)+"\n"+
		"\n[docs]: https://example.com/api\n")

	runIndex(t, 0, base, out, root)
	assertFile(t, out, header(root)+fmt.Sprintf(
		"- `%s`: no summary ([README](<%s/README.md>))\n"+
			"- `%s`: See guide and API: %s… ([README](<%s/README.md>))\n",
		blank, blank, repo, strings.Repeat("界", 140), repo))
}

// Contract test: ordinary directories, ignored names and symlinks on disk.
func TestS5_FoldersThatAreNotRepositoriesAreNotEntries(t *testing.T) {
	t.Parallel()

	base := t.TempDir()
	root := filepath.Join(base, "root")
	plain := filepath.Join(root, "plain")
	repo := filepath.Join(plain, "nested")
	hidden := filepath.Join(root, ".hidden")
	modules := filepath.Join(root, "node_modules")
	out := filepath.Join(base, "folders.md")
	for _, folder := range []string{plain, hidden, modules} {
		writeFile(t, filepath.Join(folder, "README.md"), "Folder text.\n")
	}
	mkdir(t, filepath.Join(hidden, "repo", ".git"))
	mkdir(t, filepath.Join(modules, "repo", ".git"))
	mkdir(t, filepath.Join(repo, ".git"))
	if err := os.Symlink(repo, filepath.Join(root, "repo symlink")); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(filepath.Join(plain, "README.md"), filepath.Join(repo, "README.md")); err != nil {
		t.Fatal(err)
	}
	mkdir(t, filepath.Join(root, "symlink marker"))
	if err := os.Symlink(filepath.Join(repo, ".git"), filepath.Join(root, "symlink marker", ".git")); err != nil {
		t.Fatal(err)
	}

	runIndex(t, 0, base, out, root)
	assertFile(t, out, header(root)+fmt.Sprintf("- `%s`: no README\n", repo))
}

// Contract test: an existing index on disk is replaced reproducibly.
func TestS6_ARunReplacesTheIndexAndIsStable(t *testing.T) {
	t.Parallel()

	base := t.TempDir()
	a := filepath.Join(base, "a")
	b := filepath.Join(base, "b")
	aRepo := filepath.Join(a, "repo")
	bRepo := filepath.Join(b, "repo")
	out := filepath.Join(base, "folders.md")
	mkdir(t, filepath.Join(bRepo, ".git"))
	mkdir(t, filepath.Join(aRepo, ".git"))
	writeFile(t, out, "# Old index\n\n- `/stale`: no README\n")
	want := header(b, a) + fmt.Sprintf("- `%s`: no README\n- `%s`: no README\n", aRepo, bRepo)

	old, err := os.Open(out)
	if err != nil {
		t.Fatal(err)
	}
	defer old.Close()
	for range 2 {
		runIndex(t, 0, base, out, b, a)
		assertFile(t, out, want)
	}
	// The old index is replaced by a rename, not written over in place: a
	// handle opened before the run still reads the old bytes.
	kept, err := io.ReadAll(old)
	if err != nil {
		t.Fatal(err)
	}
	if string(kept) != "# Old index\n\n- `/stale`: no README\n" {
		t.Errorf("old handle reads %q, want the old index", kept)
	}
}

// Contract test: a missing or invalid input root leaves the old file intact.
func TestS7_AMissingRootFailsAndKeepsTheOldIndex(t *testing.T) {
	t.Parallel()

	base := t.TempDir()
	root := filepath.Join(base, "root")
	missing := filepath.Join(base, "not present")
	file := filepath.Join(base, "not a directory")
	out := filepath.Join(base, "folders.md")
	mkdir(t, filepath.Join(root, "repo", ".git"))
	writeFile(t, file, "An ordinary file.\n")
	const old = "# Old index\n\n- `/old`: old entry\n"
	writeFile(t, out, old)

	for _, badRoot := range []string{missing, file} {
		if stderr := runIndex(t, 1, base, out, root, badRoot); !strings.Contains(stderr, badRoot) {
			t.Errorf("stderr = %q, want root %q", stderr, badRoot)
		}
		assertFile(t, out, old)
	}
	if stderr := run(t, 2, filepath.Join(base, "home"), "-out", out, root); !strings.Contains(stderr, "Usage: audelin-folder-index") {
		t.Errorf("stderr = %q, want usage", stderr)
	}
	assertFile(t, out, old)
}

// Contract test: a missing or malformed settings file is said and keeps the old index.
func TestS8_BadSettingsFailAndKeepTheOldIndex(t *testing.T) {
	t.Parallel()

	base := t.TempDir()
	home := filepath.Join(base, "home")
	root := filepath.Join(base, "root")
	mkdir(t, filepath.Join(root, "repo", ".git"))
	settings := filepath.Join(home, ".audelin", "feed", "folder-index.json")
	out := filepath.Join(base, "folders.md")
	const old = "# Old index\n"
	writeFile(t, out, old)

	if stderr := run(t, 1, home, "-out", out); !strings.Contains(stderr, settings) {
		t.Errorf("stderr = %q, want settings path %q", stderr, settings)
	}
	valid := fmt.Sprintf(`{"roots": [%q]}`, root)
	for _, bad := range []string{
		"", "{", "null", `{"roots": "/one"}`, `{"roots": []}`, `{"roots": null}`,
		`{"folders": ["/one"]}`, `{"roots": ["relative"]}`, `{"roots": ["~"]}`,
		valid + " {}", valid + "}", valid + "]",
		fmt.Sprintf(`{"Roots": [%q]}`, root), fmt.Sprintf(`{"ROOTS": [%q]}`, root),
		fmt.Sprintf(`{"roots": [%q], "extra": 1}`, root),
		fmt.Sprintf(`{"roots": ["/elsewhere"], "roots": [%q]}`, root),
		fmt.Sprintf(`{"roots": [%q]}`, root+"/.."),
		fmt.Sprintf(`{"roots": [%q]}`, root+"/../root"),
		`{"roots": ["~/../root"]}`,
	} {
		writeFile(t, settings, bad)
		if stderr := run(t, 1, home, "-out", out); !strings.Contains(stderr, "settings "+settings+":") {
			t.Errorf("settings %q: stderr = %q, want an error naming %q", bad, stderr, settings)
		}
		assertFile(t, out, old)
	}
	writeFile(t, settings, valid)
	run(t, 0, home, "-out", out)
}

// Contract test: with no flags the settings and index are under home's
// .audelin/feed, its folder made, and a ~/ root is under home.
func TestS9_TheIndexIsWrittenUnderHomeByDefault(t *testing.T) {
	t.Parallel()

	home := filepath.Join(t.TempDir(), "home")
	repo := filepath.Join(home, "code", "repo")
	mkdir(t, filepath.Join(repo, ".git"))
	writeFile(t, filepath.Join(home, ".audelin", "feed", "folder-index.json"), `{"roots": ["~/code"]}`)

	run(t, 0, home)
	assertFile(t, filepath.Join(home, ".audelin", "feed", "folders.md"),
		header(filepath.Join(home, "code"))+fmt.Sprintf("- `%s`: no README\n", repo))
}

// Contract test: a failed rename keeps the destination and removes its temporary file.
func TestFailedReplacementRemovesTemporaryFile(t *testing.T) {
	t.Parallel()

	base := t.TempDir()
	root := filepath.Join(base, "root")
	out := filepath.Join(base, "folders.md")
	marker := filepath.Join(out, "keep")
	mkdir(t, root)
	writeFile(t, marker, "Keep this file.\n")

	runIndex(t, 1, base, out, root)
	assertFile(t, marker, "Keep this file.\n")
	files, err := os.ReadDir(base)
	if err != nil {
		t.Fatal(err)
	}
	if len(files) != 3 || files[0].Name() != "folders.md" || files[1].Name() != "home" || files[2].Name() != "root" {
		t.Fatalf("output directory has entries %v, want only folders.md, home and root", files)
	}
}

func TestSummaryKeepsLiteralBracketText(t *testing.T) {
	t.Parallel()
	readme := "# Title\r\r```[label](example)``` is illustrated in [the guide](guide.md).\r\rAnother line."
	if got, want := summary(readme), "```[label](example)``` is illustrated in the guide."; got != want {
		t.Errorf("summary = %q, want %q", got, want)
	}
}

// Contract test: no -out path inside .claude/skills is written.
func TestS10_TheIndexIsNeverWrittenIntoClaudeSkills(t *testing.T) {
	t.Parallel()

	base := t.TempDir()
	root := filepath.Join(base, "root")
	mkdir(t, filepath.Join(root, "repo", ".git"))
	skills := filepath.Join(base, "project", ".claude", "skills")
	for _, out := range []string{
		filepath.Join(skills, "call-assistant", "folders.md"),
		filepath.Join(skills, "folders.md"),
		filepath.Join(base, "project", ".claude", "other", "..", "skills", "x", "folders.md"),
	} {
		if stderr := runIndex(t, 1, base, out, root); !strings.Contains(stderr, ".claude/skills") {
			t.Errorf("out %q: stderr = %q, want a .claude/skills refusal", out, stderr)
		}
	}
	if _, err := os.Stat(filepath.Join(base, "project")); !os.IsNotExist(err) {
		t.Errorf("project folder: err = %v, want nothing made", err)
	}
	runIndex(t, 0, base, filepath.Join(base, "project", ".claude", "folders.md"), root)
}

// A folder listed as a directory and swapped for a symlink to outside the
// root before it is opened is not followed.
func TestSwappedSymlinkDoesNotLeaveTheRoot(t *testing.T) {
	t.Parallel()

	base := t.TempDir()
	root := filepath.Join(base, "root")
	outside := filepath.Join(base, "outside")
	mkdir(t, filepath.Join(root, "plain"))
	mkdir(t, filepath.Join(outside, "repo", ".git"))
	writeFile(t, filepath.Join(outside, "repo", "README.md"), "Outside the root.\n")
	opened, err := os.OpenRoot(root)
	if err != nil {
		t.Fatal(err)
	}
	defer opened.Close()
	swap := swappingTree{tree: rootTree{opened}, swap: func() {
		if err := os.Remove(filepath.Join(root, "plain")); err != nil {
			t.Error(err)
		}
		if err := os.Symlink(outside, filepath.Join(root, "plain")); err != nil {
			t.Error(err)
		}
	}}

	entries := make(map[string]entry)
	if err := collectTree(root, &swap, entries); err != nil {
		t.Fatal(err)
	}
	if len(entries) != 0 {
		t.Errorf("entries = %v, want none from outside the root", entries)
	}
}

type swappingTree struct {
	tree
	swap    func()
	swapped bool
}

func (s *swappingTree) ReadDir(name string) ([]fs.DirEntry, error) {
	children, err := s.tree.ReadDir(name)
	if name == "." && !s.swapped {
		s.swapped = true
		s.swap()
	}
	return children, err
}

func TestUnreadableDescendantIsSkipped(t *testing.T) {
	t.Parallel()
	files := fstest.MapFS{
		"skipped/repo/.git": {},
		"visible/.git":      {},
	}
	entries := make(map[string]entry)
	if err := collectTree("/root", failingTree{files, "skipped"}, entries); err != nil {
		t.Fatal(err)
	}
	if got, want := render([]string{"/root"}, entries), header("/root")+"- `/root/visible`: no README\n"; got != want {
		t.Errorf("index = %q, want %q", got, want)
	}
}

type failingTree struct {
	files fstest.MapFS
	fail  string
}

func (f failingTree) ReadDir(name string) ([]fs.DirEntry, error) {
	if name == f.fail {
		return nil, fs.ErrPermission
	}
	return fs.ReadDir(f.files, name)
}

func (f failingTree) ReadFile(name string) ([]byte, error) { return f.files.ReadFile(name) }

// A step that fails stops the generation before the next, and its error is
// the result.
func TestGenerationStopsAtTheFirstFailure(t *testing.T) {
	t.Parallel()
	failure := errors.New("injected")
	for _, failAt := range []string{"load", "collect", "publish"} {
		var steps []string
		step := func(name string) error {
			steps = append(steps, name)
			if name == failAt {
				return failure
			}
			return nil
		}
		var published string
		j := job{
			load: func() ([]string, error) { return []string{"/root"}, step("load") },
			collect: func(roots []string) (map[string]entry, error) {
				return map[string]entry{"/root/repo": {summary: "no README"}}, step("collect")
			},
			publish: func(index string) error { published = index; return step("publish") },
		}
		if err := j.generate(); !errors.Is(err, failure) {
			t.Errorf("fail at %s: err = %v, want the injected failure", failAt, err)
		}
		want := map[string][]string{"load": {"load"}, "collect": {"load", "collect"}, "publish": {"load", "collect", "publish"}}[failAt]
		if !slices.Equal(steps, want) {
			t.Errorf("fail at %s: steps = %v, want %v", failAt, steps, want)
		}
		if failAt == "publish" && published != header("/root")+"- `/root/repo`: no README\n" {
			t.Errorf("published %q", published)
		}
	}
}

// The writer puts a temp file beside the index and renames it over; a
// failed write, close or rename removes the temp file and keeps the index.
func TestPublishReplacesThroughATempFileBesideTheIndex(t *testing.T) {
	t.Parallel()
	failure := errors.New("injected")
	for _, failAt := range []string{"", "write", "close", "rename"} {
		dir := t.TempDir()
		out := filepath.Join(dir, "folders.md")
		writeFile(t, out, "old\n")
		var tempDir, renamedFrom string
		p := diskPublisher
		p.createTemp = func(d, pattern string) (tempFile, error) {
			tempDir = d
			file, err := os.CreateTemp(d, pattern)
			if err != nil {
				return nil, err
			}
			return faultyFile{File: file, failAt: failAt, failure: failure}, nil
		}
		p.rename = func(from, to string) error {
			renamedFrom = from
			if failAt == "rename" {
				return failure
			}
			return os.Rename(from, to)
		}
		err := p.publish(out, "new\n")
		if tempDir != dir {
			t.Errorf("fail at %q: temp file in %q, want %q", failAt, tempDir, dir)
		}
		files, readErr := os.ReadDir(dir)
		if readErr != nil {
			t.Fatal(readErr)
		}
		if len(files) != 1 {
			t.Errorf("fail at %q: folder holds %v, want only the index", failAt, files)
		}
		if failAt == "" {
			if err != nil || filepath.Dir(renamedFrom) != dir {
				t.Errorf("err = %v, renamed from %q", err, renamedFrom)
			}
			assertFile(t, out, "new\n")
			continue
		}
		if !errors.Is(err, failure) {
			t.Errorf("fail at %q: err = %v, want the injected failure", failAt, err)
		}
		assertFile(t, out, "old\n")
	}
}

type faultyFile struct {
	*os.File
	failAt  string
	failure error
}

func (f faultyFile) Write(data []byte) (int, error) {
	if f.failAt == "write" {
		return 0, f.failure
	}
	return f.File.Write(data)
}

func (f faultyFile) Close() error {
	err := f.File.Close()
	if f.failAt == "close" {
		return f.failure
	}
	return err
}

// Lines of unmatched brackets, parentheses and backtick runs are read in
// one pass; a quadratic scan would not finish within the test's timeout.
func TestSummaryOfLongUnmatchedLinesIsLinear(t *testing.T) {
	t.Parallel()
	const size = 1 << 20
	var runs strings.Builder
	for runs.Len() < size {
		runs.WriteString("`` ``` ")
	}
	for _, line := range []string{strings.Repeat("[", size), strings.Repeat("[(", size/2), runs.String()} {
		got := summary("# Title\n\n" + line + " end\n")
		if want := line[:159] + "…"; got != want {
			t.Errorf("summary of %q… = %q…, want %q…", line[:8], got[:8], want[:8])
		}
	}
}

func mkdir(t *testing.T, path string) {
	t.Helper()
	if err := os.MkdirAll(path, 0o755); err != nil {
		t.Fatal(err)
	}
}

func writeFile(t *testing.T, path, data string) {
	t.Helper()
	mkdir(t, filepath.Dir(path))
	if err := os.WriteFile(path, []byte(data), 0o644); err != nil {
		t.Fatal(err)
	}
}

// runIndex writes roots into a settings file under base's temp home and
// runs the generator with the index at out.
func runIndex(t *testing.T, want int, base, out string, roots ...string) string {
	t.Helper()
	home := filepath.Join(base, "home")
	data, err := json.Marshal(map[string][]string{"roots": roots})
	if err != nil {
		t.Fatal(err)
	}
	writeFile(t, filepath.Join(home, ".audelin", "feed", "folder-index.json"), string(data))
	return run(t, want, home, "-out", out)
}

func run(t *testing.T, want int, home string, args ...string) string {
	t.Helper()
	var stderr bytes.Buffer
	if got := Run(args, home, &stderr); got != want {
		t.Fatalf("Run(%q) = %d, want %d; stderr = %q", args, got, want, stderr.String())
	}
	return stderr.String()
}

func assertFile(t *testing.T, path, want string) {
	t.Helper()
	got, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got, []byte(want)) {
		t.Fatalf("%s contents =\n%s\nwant:\n%s", path, got, want)
	}
}

func header(roots ...string) string {
	return "# Folder index\n\nGenerated by `audelin-folder-index` from `" + strings.Join(roots, "`, `") + "`.\n\n"
}
