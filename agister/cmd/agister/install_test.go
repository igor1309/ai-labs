package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"reflect"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/adapters/git"
	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/cli"
	"github.com/igor1309/ai-labs/agister/internal/contract"
	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
)

// countedStamps names each install's backup by the time and a count, so
// a test knows which is which.
type countedStamps struct{ n *int }

func (s countedStamps) Stamp(now time.Time) string {
	*s.n++
	return fmt.Sprintf("%s-%03d", now.UTC().Format("20060102T150405Z"), *s.n)
}

// stageCounter counts how often home's settings were staged to check an
// install's result.
type stageCounter struct {
	app.InstallHome
	staged *int
}

func (s stageCounter) Stage(ctx context.Context, docs []definition.Document) (app.InstallSettings, func(), error) {
	*s.staged++
	return s.InstallHome.Stage(ctx, docs)
}

// installing is the production client over home, its installs on a fixed
// clock and counted stamps, staging counted, and beforeWrite, when set,
// called before each document an install writes.
type installing struct {
	client contract.Client
	staged int
}

func installClient(t *testing.T, home string, beforeWrite func(path string) error) *installing {
	t.Helper()
	in := &installing{}
	stamps := 0
	compose := composition{
		worktrees: git.NewWorktrees(filepath.Join(home, "locks", "worktrees")),
		installing: func(adapters *app.InstallAdapters) {
			adapters.Home = stageCounter{InstallHome: adapters.Home, staged: &in.staged}
			adapters.Clock = &manualClock{now: time.Date(2026, 10, 2, 12, 0, 0, 0, time.UTC)}
			adapters.Stamps = countedStamps{&stamps}
			adapters.BeforeWrite = beforeWrite
		},
	}
	client, _, err := compose.wire(cli.Config{Home: home, Cwd: tempDir(t)})
	if err != nil {
		t.Fatal(err)
	}
	in.client = client
	return in
}

// installNow approves its own plan, as a user typing yes does.
func (in *installing) installNow(t *testing.T, source string) (contract.InstallPlan, error) {
	t.Helper()
	plan, err := in.client.Install(context.Background(), source, nil)
	if err != nil {
		return plan, err
	}
	return in.client.Install(context.Background(), source, &plan)
}

func (in *installing) restoreNow(t *testing.T, stamp string) (contract.RestorePlan, error) {
	t.Helper()
	plan, err := in.client.Restore(context.Background(), stamp, nil)
	if err != nil {
		return plan, err
	}
	return in.client.Restore(context.Background(), stamp, &plan)
}

// initedHome is a home with the example settings and some live state.
func initedHome(t *testing.T) string {
	t.Helper()
	home := filepath.Join(tempDir(t), "home")
	if r := agisterInput(t, "yes\n", home, tempDir(t), "init"); r.code != 0 {
		t.Fatalf("init: %d %s", r.code, r.stderr)
	}
	write(t, filepath.Join(home, "runs", "r1", "record.json"), `{"id":"r1"}`)
	write(t, filepath.Join(home, "logs", "old.jsonl"), "{}\n")
	write(t, filepath.Join(home, "locks", "worktrees", "repo.lock"), "")
	return home
}

// files is every file under dir and its content, but for the log the client
// appends to and the backups.
func files(t *testing.T, dir string) map[string]string {
	t.Helper()
	found := map[string]string{}
	err := filepath.WalkDir(dir, func(path string, entry fs.DirEntry, err error) error {
		if err != nil || entry.IsDir() {
			return err
		}
		rel, _ := filepath.Rel(dir, path)
		if rel == filepath.Join("logs", "agister.jsonl") || strings.HasPrefix(rel, "backups"+string(filepath.Separator)) {
			return nil
		}
		found[rel] = read(t, path)
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	return found
}

func backups(t *testing.T, home string) []string {
	t.Helper()
	entries, err := os.ReadDir(filepath.Join(home, "backups"))
	if errors.Is(err, fs.ErrNotExist) {
		return nil
	}
	if err != nil {
		t.Fatal(err)
	}
	var names []string
	for _, entry := range entries {
		names = append(names, entry.Name())
	}
	return names
}

func digestText(text string) string {
	sum := sha256.Sum256([]byte(text))
	return hex.EncodeToString(sum[:])
}

// repoSettings is a folder of settings beside home: the reviewer tuned, a
// new prompt, the service as home has it, and files that are not settings.
func repoSettings(t *testing.T, home string) string {
	t.Helper()
	src := filepath.Join(tempDir(t), ".agister")
	write(t, filepath.Join(src, "agents", "reviewer.toml"), read(t, filepath.Join(home, "agents", "reviewer.toml"))+"# tuned\n")
	write(t, filepath.Join(src, "prompts", "house.md"), "Follow the house style.\n")
	write(t, filepath.Join(src, "service.toml"), read(t, filepath.Join(home, "service.toml")))
	write(t, filepath.Join(src, "notes.txt"), "not settings")
	write(t, filepath.Join(src, "runs", "r9", "record.json"), "{}")
	return src
}

// The plan is per document, with a diff for a replace, and writes nothing.
func TestInstallPlansEachDocument(t *testing.T) {
	home := initedHome(t)
	src := repoSettings(t, home)
	before := files(t, home)
	in := installClient(t, home, nil)

	plan, err := in.client.Install(context.Background(), src, nil)
	if err != nil {
		t.Fatal(err)
	}
	reviewer := read(t, filepath.Join(home, "agents", "reviewer.toml"))
	want := []contract.InstallDocument{
		{Kind: "agents", Name: "reviewer", Path: filepath.Join(home, "agents", "reviewer.toml"), Action: contract.InstallReplace,
			Before: digestText(reviewer), After: digestText(reviewer + "# tuned\n"),
			Diff: "--- " + filepath.Join(home, "agents", "reviewer.toml") + "\n+++ " + filepath.Join(src, "agents", "reviewer.toml") + "\n" +
				"@@ -5,3 +5,4 @@\n model_family = \"anthropic\"\n effort = \"high\"\n session = \"fresh-only\"\n+# tuned\n"},
		{Kind: "prompts", Name: "house", Path: filepath.Join(home, "prompts", "house.md"), Action: contract.InstallCreate, After: digestText("Follow the house style.\n")},
		{Kind: "service", Name: "service", Path: filepath.Join(home, "service.toml"), Action: contract.InstallUnchanged,
			Before: digestText(before["service.toml"]), After: digestText(before["service.toml"])},
	}
	if !reflect.DeepEqual(plan.Documents, want) {
		t.Fatalf("documents:\n%+v\nwant\n%+v", plan.Documents, want)
	}
	if !reflect.DeepEqual(plan.Ignored, []string{"notes.txt", "runs/"}) {
		t.Fatalf("ignored: %v", plan.Ignored)
	}
	// What only home has is kept, and only settings are planned.
	if len(plan.Kept) != 13 || plan.Kept[0] != filepath.Join(home, "agents", "assistant.toml") {
		t.Fatalf("kept: %v", plan.Kept)
	}
	if len(plan.Inventory) != 15 || plan.Inventory[filepath.Join(home, "service.toml")] != digestText(before["service.toml"]) {
		t.Fatalf("inventory: %v", plan.Inventory)
	}
	if in.staged != 1 || !reflect.DeepEqual(files(t, home), before) || backups(t, home) != nil {
		t.Fatalf("the plan staged %d time(s), backed up %v or wrote", in.staged, backups(t, home))
	}
}

// A folder home already has, document for document, installs nothing: no
// staging, no backup, no write.
func TestInstallingIdenticalSettingsDoesNothing(t *testing.T) {
	home := initedHome(t)
	src := filepath.Join(tempDir(t), ".agister")
	for _, name := range []string{"service.toml", filepath.Join("agents", "reviewer.toml")} {
		write(t, filepath.Join(src, name), read(t, filepath.Join(home, name)))
	}
	before := files(t, home)
	in := installClient(t, home, func(string) error { t.Fatal("a document was written"); return nil })
	result, err := in.installNow(t, src)
	if err != nil || result.Writes() != 0 || result.Stamp != "" {
		t.Fatalf("%+v, %v", result, err)
	}
	if in.staged != 0 || backups(t, home) != nil || !reflect.DeepEqual(files(t, home), before) {
		t.Fatalf("staged %d, backups %v", in.staged, backups(t, home))
	}
}

// The backup and its manifest exist before the first document is written;
// what home has besides, settings or live state, is left as it was.
func TestInstallBacksUpBeforeWriting(t *testing.T) {
	home := initedHome(t)
	src := repoSettings(t, home)
	before := files(t, home)
	reviewer := filepath.Join(home, "agents", "reviewer.toml")
	var written []string
	in := installClient(t, home, func(path string) error {
		if len(written) == 0 {
			stamps := backups(t, home)
			if len(stamps) != 1 {
				t.Fatalf("backups before the first write: %v", stamps)
			}
			backup := filepath.Join(home, "backups", stamps[0])
			if read(t, filepath.Join(backup, "agents", "reviewer.toml")) != before[filepath.Join("agents", "reviewer.toml")] {
				t.Fatal("the backup does not hold the replaced document")
			}
			var manifest app.InstallManifest
			readJSON(t, filepath.Join(backup, "manifest.json"), &manifest)
			want := []app.InstallManifestEntry{
				{Path: reviewer, Kind: "agents", Name: "reviewer", Action: "replace", Before: digestText(before[filepath.Join("agents", "reviewer.toml")]), After: digestText(read(t, filepath.Join(src, "agents", "reviewer.toml")))},
				{Path: filepath.Join(home, "prompts", "house.md"), Kind: "prompts", Name: "house", Action: "create", After: digestText("Follow the house style.\n")},
			}
			if manifest.Stamp != stamps[0] || manifest.Source != src || !reflect.DeepEqual(manifest.Documents, want) {
				t.Fatalf("manifest %+v", manifest)
			}
			if read(t, reviewer) != before[filepath.Join("agents", "reviewer.toml")] {
				t.Fatal("a document was written before the backup")
			}
		}
		written = append(written, path)
		return nil
	})
	result, err := in.installNow(t, src)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(written, []string{reviewer, filepath.Join(home, "prompts", "house.md")}) || result.Stamp != "20261002T120000Z-001" {
		t.Fatalf("written %v, stamp %q", written, result.Stamp)
	}
	after := files(t, home)
	if after[filepath.Join("agents", "reviewer.toml")] != read(t, filepath.Join(src, "agents", "reviewer.toml")) || after[filepath.Join("prompts", "house.md")] != "Follow the house style.\n" {
		t.Fatalf("not installed: %v", after)
	}
	delete(after, filepath.Join("agents", "reviewer.toml"))
	delete(after, filepath.Join("prompts", "house.md"))
	delete(before, filepath.Join("agents", "reviewer.toml"))
	if !reflect.DeepEqual(after, before) {
		t.Fatalf("other files changed:\n%v\nwant\n%v", after, before)
	}
	// Nothing that is not settings was copied.
	for _, path := range []string{"notes.txt", filepath.Join("runs", "r9")} {
		if _, err := os.Stat(filepath.Join(home, path)); !errors.Is(err, fs.ErrNotExist) {
			t.Errorf("%s installed: %v", path, err)
		}
	}
}

// A result that would not pass check is refused before anything is written.
func TestInstallRefusesAResultThatFailsCheck(t *testing.T) {
	home := initedHome(t)
	src := filepath.Join(tempDir(t), ".agister")
	write(t, filepath.Join(src, "agents", "reviewer.toml"), strings.Replace(read(t, filepath.Join(home, "agents", "reviewer.toml")), `runtime = "claude-code"`, `runtime = "nowhere"`, 1))
	before := files(t, home)
	in := installClient(t, home, nil)
	var input *contract.InputError
	_, err := in.client.Install(context.Background(), src, nil)
	if !errors.As(err, &input) || !strings.Contains(err.Error(), "would not pass check") || !strings.Contains(err.Error(), "nowhere") {
		t.Fatalf("plan: %v", err)
	}
	if !reflect.DeepEqual(files(t, home), before) || backups(t, home) != nil {
		t.Fatal("a refused install wrote")
	}
}

// The yes binds home's whole inventory: a document changed, added, or
// created at a planned path since the plan refuses the install, with
// nothing written.
func TestInstallRefusesAnInventoryChangedSinceThePlan(t *testing.T) {
	for name, change := range map[string]func(home string){
		"changed": func(home string) {
			path := filepath.Join(home, "agents", "assistant.toml")
			write(t, path, read(t, path)+"# edited\n")
		},
		"added":        func(home string) { write(t, filepath.Join(home, "prompts", "extra.md"), "extra\n") },
		"planned path": func(home string) { write(t, filepath.Join(home, "prompts", "house.md"), "mine\n") },
	} {
		t.Run(name, func(t *testing.T) {
			home := initedHome(t)
			src := repoSettings(t, home)
			in := installClient(t, home, func(string) error { t.Fatal("a document was written"); return nil })
			plan, err := in.client.Install(context.Background(), src, nil)
			if err != nil {
				t.Fatal(err)
			}
			change(home)
			before := files(t, home)
			var input *contract.InputError
			if _, err := in.client.Install(context.Background(), src, &plan); !errors.As(err, &input) || !strings.Contains(err.Error(), "changed since you confirmed, so nothing was installed") {
				t.Fatalf("approved: %v", err)
			}
			if !reflect.DeepEqual(files(t, home), before) || backups(t, home) != nil {
				t.Fatal("wrote after the inventory changed")
			}
		})
	}
}

// Restore puts home's settings back as they were before an install.
func TestRestoreUndoesAnInstall(t *testing.T) {
	home := initedHome(t)
	src := repoSettings(t, home)
	before := files(t, home)
	in := installClient(t, home, nil)
	result, err := in.installNow(t, src)
	if err != nil {
		t.Fatal(err)
	}
	installed := files(t, home)
	plan, err := in.client.Restore(context.Background(), result.Stamp, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(plan.Documents) != 2 || plan.Documents[0].Action != contract.RestorePutBack || !strings.Contains(plan.Documents[0].Diff, "-# tuned\n") ||
		plan.Documents[1].Action != contract.RestoreRemove || plan.Documents[1].Path != filepath.Join(home, "prompts", "house.md") {
		t.Fatalf("restore plan %+v", plan)
	}
	if !reflect.DeepEqual(files(t, home), installed) {
		t.Fatal("the restore plan wrote")
	}
	if _, err := in.client.Restore(context.Background(), result.Stamp, &plan); err != nil {
		t.Fatal(err)
	}
	if after := files(t, home); !reflect.DeepEqual(after, before) {
		t.Fatalf("after restore:\n%v\nwant\n%v", after, before)
	}
}

// An install stopped between its writes is undone by its restore too.
func TestRestoreUndoesAnInstallStoppedHalfway(t *testing.T) {
	home := initedHome(t)
	src := repoSettings(t, home)
	before := files(t, home)
	writes := 0
	stop := errors.New("stopped")
	in := installClient(t, home, func(string) error {
		if writes++; writes == 2 {
			return stop
		}
		return nil
	})
	result, err := in.installNow(t, src)
	if !errors.Is(err, stop) || result.Stamp == "" {
		t.Fatalf("%+v, %v", result, err)
	}
	halfway := files(t, home)
	if halfway[filepath.Join("agents", "reviewer.toml")] == before[filepath.Join("agents", "reviewer.toml")] || halfway[filepath.Join("prompts", "house.md")] != "" {
		t.Fatalf("not stopped halfway: %v", halfway)
	}
	plan, err := in.restoreNow(t, result.Stamp)
	if err != nil {
		t.Fatal(err)
	}
	if plan.Documents[0].Action != contract.RestorePutBack || plan.Documents[1].Action != contract.RestoreUnchanged {
		t.Fatalf("restore plan %+v", plan)
	}
	if after := files(t, home); !reflect.DeepEqual(after, before) {
		t.Fatalf("after restore:\n%v\nwant\n%v", after, before)
	}
}

// The last five backups are kept: a sixth install removes the oldest.
func TestInstallKeepsTheLastFiveBackups(t *testing.T) {
	home := initedHome(t)
	in := installClient(t, home, nil)
	reviewer := read(t, filepath.Join(home, "agents", "reviewer.toml"))
	var stamps []string
	for n := 1; n <= 6; n++ {
		src := filepath.Join(tempDir(t), ".agister")
		write(t, filepath.Join(src, "agents", "reviewer.toml"), fmt.Sprintf("%s# %d\n", reviewer, n))
		result, err := in.installNow(t, src)
		if err != nil {
			t.Fatalf("install %d: %v", n, err)
		}
		stamps = append(stamps, result.Stamp)
		if kept := backups(t, home); !reflect.DeepEqual(kept, stamps[max(0, n-5):]) {
			t.Fatalf("after install %d: %v, want %v", n, kept, stamps[max(0, n-5):])
		}
	}
	var input *contract.InputError
	if _, err := in.client.Restore(context.Background(), stamps[0], nil); !errors.As(err, &input) {
		t.Fatalf("restore of a removed backup: %v", err)
	}
}

// The CLI asks before installing, says how to restore, and restores.
func TestInstallAndRestoreThroughTheCLI(t *testing.T) {
	home := initedHome(t)
	src := repoSettings(t, home)
	dir := tempDir(t)
	before := files(t, home)
	for _, input := range []string{"", "no\n"} {
		r := agisterInput(t, input, home, dir, "install", src)
		if r.code != cli.ExitUsage || !strings.Contains(r.stdout, "will REPLACE "+filepath.Join(home, "agents", "reviewer.toml")+"\n--- ") ||
			!strings.Contains(r.stdout, "will create  "+filepath.Join(home, "prompts", "house.md")) ||
			!strings.Contains(r.stdout, "unchanged    "+filepath.Join(home, "service.toml")) ||
			!strings.Contains(r.stdout, "home only, kept "+filepath.Join(home, "agents", "assistant.toml")) ||
			!strings.Contains(r.stdout, "not settings, not installed: notes.txt") ||
			!strings.Contains(r.stderr, "Type yes to install 2 document(s) into "+home+":") || !strings.Contains(r.stderr, "install cancelled; nothing was written") {
			t.Fatalf("input %q: %d\n%s%s", input, r.code, r.stdout, r.stderr)
		}
		if !reflect.DeepEqual(files(t, home), before) || backups(t, home) != nil {
			t.Fatalf("input %q wrote", input)
		}
	}
	r := agisterInput(t, "yes\n", home, dir, "install", src)
	match := regexp.MustCompile(`restore with: agister install --restore (\S+)\n`).FindStringSubmatch(r.stdout)
	if r.code != 0 || match == nil || !strings.Contains(r.stdout, "replaced "+filepath.Join(home, "agents", "reviewer.toml")) {
		t.Fatalf("yes: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	if r := agister(t, home, dir, "install", src); r.code != 0 || !strings.Contains(r.stdout, "nothing to install into "+home) || strings.Contains(r.stderr, "Type yes") {
		t.Fatalf("again: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	if r := agisterInput(t, "yes\n", home, dir, "install", "--restore", "20200101T000000Z-abcdef"); r.code != cli.ExitUsage || !strings.Contains(r.stderr, `no install backup "20200101T000000Z-abcdef"`) {
		t.Fatalf("unknown stamp: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	r = agisterInput(t, "yes\n", home, dir, "install", "--restore", match[1])
	if r.code != 0 || !strings.Contains(r.stdout, "will put back "+filepath.Join(home, "agents", "reviewer.toml")) ||
		!strings.Contains(r.stdout, "removed  "+filepath.Join(home, "prompts", "house.md")) || !strings.Contains(r.stderr, "Type yes to restore 2 document(s)") {
		t.Fatalf("restore: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	if !reflect.DeepEqual(files(t, home), before) {
		t.Fatal("restore did not put home back")
	}
}

// Install is not refused by home's broken settings: it is how they are
// repaired.
func TestInstallRepairsBrokenSettings(t *testing.T) {
	home := initedHome(t)
	dir := tempDir(t)
	reviewer := filepath.Join(home, "agents", "reviewer.toml")
	good := read(t, reviewer)
	write(t, reviewer, strings.Replace(good, `runtime = "claude-code"`, `runtime = "nowhere"`, 1))
	if r := agister(t, home, dir, "check"); r.code != cli.ExitUsage {
		t.Fatalf("broken home passes check: %d\n%s", r.code, r.stderr)
	}
	src := filepath.Join(tempDir(t), ".agister")
	write(t, filepath.Join(src, "agents", "reviewer.toml"), good)
	if r := agisterInput(t, "yes\n", home, dir, "install", src); r.code != 0 {
		t.Fatalf("install: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	if r := agister(t, home, dir, "check"); r.code != 0 {
		t.Fatalf("check after install: %d\n%s", r.code, r.stderr)
	}
}

// A symbolic link in the folder refuses the install.
func TestInstallRefusesASymbolicLink(t *testing.T) {
	home := initedHome(t)
	src := repoSettings(t, home)
	outside := filepath.Join(tempDir(t), "secret.md")
	write(t, outside, "outside\n")
	if err := os.Symlink(outside, filepath.Join(src, "prompts", "linked.md")); err != nil {
		t.Fatal(err)
	}
	before := files(t, home)
	r := agisterInput(t, "yes\n", home, tempDir(t), "install", src)
	if r.code != cli.ExitUsage || !strings.Contains(r.stderr, "linked.md is a symbolic link, so nothing was installed") || strings.Contains(r.stderr, "Type yes") {
		t.Fatalf("%d\n%s%s", r.code, r.stdout, r.stderr)
	}
	if !reflect.DeepEqual(files(t, home), before) || backups(t, home) != nil {
		t.Fatal("wrote")
	}
}
