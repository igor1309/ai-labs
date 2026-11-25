package folderindex

import (
	"bytes"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
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

	runIndex(t, 0, "-out", out, root)
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
	writeFile(t, filepath.Join(repo, "rEaDmE.Markdown"), "The monorepo.\n")
	mkdir(t, filepath.Join(b, "README.md"))
	writeFile(t, filepath.Join(b, "README"), "Project B.\n")
	writeFile(t, filepath.Join(b, "README.markdown"), "Loses to README.\n")
	writeFile(t, filepath.Join(a, "readme.md"), "Project A.\n")
	writeFile(t, filepath.Join(a, "nested", "README.md"), "Too deep.\n")
	writeFile(t, filepath.Join(repo, ".hidden", "README.md"), "Hidden project.\n")
	writeFile(t, filepath.Join(repo, "node_modules", "README.md"), "Dependency.\n")

	runIndex(t, 0, "-out", out, root)
	assertFile(t, out, header(root)+fmt.Sprintf(
		"- `%s`: The monorepo. ([README](<%s/rEaDmE.Markdown>))\n"+
			"- `%s`: Project A. ([README](<%s/readme.md>))\n"+
			"- `%s`: Project B. ([README](<%s/README>))\n", repo, repo, a, a, b, b))
}

// Contract test: a worktree's .git file marks a repository on disk.
func TestS3_ARepositoryWithNoREADMEIsStillListed(t *testing.T) {
	t.Parallel()

	base := t.TempDir()
	root := filepath.Join(base, "root")
	repo := filepath.Join(root, "worktree")
	out := filepath.Join(base, "folders.md")
	writeFile(t, filepath.Join(repo, ".git"), "gitdir: /example/worktrees/worktree\n")

	runIndex(t, 0, "-out", out, root)
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

	runIndex(t, 0, "-out", out, root)
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

	runIndex(t, 0, "-out", out, root)
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

	for range 2 {
		runIndex(t, 0, "-out", out, b, a)
		assertFile(t, out, want)
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
		if stderr := runIndex(t, 1, "-out", out, root, badRoot); !strings.Contains(stderr, badRoot) {
			t.Errorf("stderr = %q, want root %q", stderr, badRoot)
		}
		assertFile(t, out, old)
	}
	if stderr := runIndex(t, 2, "-out", out); !strings.Contains(stderr, "Usage: audelin-folder-index") {
		t.Errorf("stderr = %q, want usage", stderr)
	}
	assertFile(t, out, old)
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

	runIndex(t, 1, "-out", out, root)
	assertFile(t, marker, "Keep this file.\n")
	files, err := os.ReadDir(base)
	if err != nil {
		t.Fatal(err)
	}
	if len(files) != 2 || files[0].Name() != "folders.md" || files[1].Name() != "root" {
		t.Fatalf("output directory has entries %v, want only folders.md and root", files)
	}
}

func TestUnreadableDescendantIsSkipped(t *testing.T) {
	t.Parallel()
	files := fstest.MapFS{
		"root/skipped/repo/.git": {},
		"root/visible/.git":      {},
	}
	index := catalog{
		readDir: func(path string) ([]fs.DirEntry, error) {
			if path == "root/skipped" {
				return nil, fs.ErrPermission
			}
			return fs.ReadDir(files, path)
		},
		readFile: files.ReadFile,
	}
	entries, err := index.collect([]string{"root"})
	if err != nil {
		t.Fatal(err)
	}
	if got, want := render([]string{"root"}, entries), header("root")+"- `root/visible`: no README\n"; got != want {
		t.Errorf("index = %q, want %q", got, want)
	}
}

func TestSummaryKeepsLiteralBracketText(t *testing.T) {
	t.Parallel()
	readme := "# Title\r\r```[label](example)``` is illustrated in [the guide](guide.md).\r\rAnother line."
	if got, want := summary(readme), "```[label](example)``` is illustrated in the guide."; got != want {
		t.Errorf("summary = %q, want %q", got, want)
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

func runIndex(t *testing.T, want int, args ...string) string {
	t.Helper()
	var stderr bytes.Buffer
	if got := Run(args, &stderr); got != want {
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
