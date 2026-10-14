package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"reflect"
	"regexp"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/adapters/fsdefs"
	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/cli"
	"github.com/igor1309/ai-labs/agister/internal/contract"
	"github.com/igor1309/ai-labs/agister/internal/domain/document"
	"github.com/igor1309/ai-labs/gokit/clocktest"
)

// countedStamps names each install's backup by the time and a count, so
// a test knows which is which.
type countedStamps struct{ n *int }

func (s countedStamps) Stamp(now time.Time) string {
	*s.n++
	return fmt.Sprintf("%s-%03d", now.UTC().Format("20060102T150405Z"), *s.n)
}

// homeSpy records, in order, taking and releasing the lock and reading and
// writing home's settings.
type homeSpy struct {
	app.InstallHome
	events *[]string
}

// stagerSpy counts the stagings of an install's result, and their
// removals.
type stagerSpy struct {
	app.InstallStager
	staged, removed *int
}

func (s stagerSpy) Stage(ctx context.Context, docs []document.Document) (app.GateDefinitions, func(), error) {
	staged, remove, err := s.InstallStager.Stage(ctx, docs)
	if err != nil {
		return nil, nil, err
	}
	*s.staged++
	return staged, func() {
		*s.removed++
		remove()
	}, nil
}

func (s homeSpy) Lock(ctx context.Context) (func(), error) {
	*s.events = append(*s.events, "Lock")
	unlock, err := s.InstallHome.Lock(ctx)
	if err != nil {
		return nil, err
	}
	return func() {
		*s.events = append(*s.events, "unlock")
		unlock()
	}, nil
}

func (s homeSpy) Documents(ctx context.Context) ([]document.Document, []document.Source, error) {
	*s.events = append(*s.events, "Documents")
	return s.InstallHome.Documents(ctx)
}

func (s homeSpy) Current(ctx context.Context, kind document.Kind, name string) (string, string, error) {
	*s.events = append(*s.events, "Current "+string(kind)+"/"+name)
	return s.InstallHome.Current(ctx, kind, name)
}

func (s homeSpy) Put(ctx context.Context, kind document.Kind, name string, data []byte) error {
	*s.events = append(*s.events, "Put "+string(kind)+"/"+name)
	return s.InstallHome.Put(ctx, kind, name, data)
}

func (s homeSpy) Remove(ctx context.Context, kind document.Kind, name string) error {
	*s.events = append(*s.events, "Remove "+string(kind)+"/"+name)
	return s.InstallHome.Remove(ctx, kind, name)
}

// installing is the production client over home, its installs on a fixed
// clock and counted stamps, home and the staging spied on, stages made in
// a folder of the test's, and beforeWrite, when set, called before each
// document an install writes.
type installing struct {
	client          contract.Client
	stages          string
	staged, removed int
	events          []string
}

func installClient(t *testing.T, home string, beforeWrite func(path string) error) *installing {
	t.Helper()
	return installClientAdjusted(t, home, func(adapters *app.InstallAdapters) { adapters.BeforeWrite = beforeWrite })
}

// installClientAdjusted is installClient with what its installs run on
// adjusted further by adjust. Each staging is removed once by the end of
// the test.
func installClientAdjusted(t *testing.T, home string, adjust func(*app.InstallAdapters)) *installing {
	t.Helper()
	in := &installing{stages: tempDir(t)}
	stamps := 0
	config := cli.Config{Home: home, Cwd: tempDir(t)}
	compose := inProcess(config)
	compose.stages = in.stages
	compose.adjust = func(infra *app.Infrastructure) {
		infra.Installer.Home = homeSpy{InstallHome: infra.Installer.Home, events: &in.events}
		infra.Installer.Clock = clocktest.NewClock(time.Date(2026, 10, 2, 12, 0, 0, 0, time.UTC))
		infra.Installer.Stamps = countedStamps{&stamps}
		infra.Staging = stagerSpy{InstallStager: infra.Staging, staged: &in.staged, removed: &in.removed}
		adjust(&infra.Installer)
	}
	client, _, err := compose.wire(config)
	if err != nil {
		t.Fatal(err)
	}
	in.client = client
	t.Cleanup(func() { in.stagesRemoved(t) })
	return in
}

// stagesRemoved fails t unless each staging was removed, once.
func (in *installing) stagesRemoved(t *testing.T) {
	t.Helper()
	if in.removed != in.staged {
		t.Errorf("staged %d time(s), removed %d", in.staged, in.removed)
	}
	if left := files(t, in.stages); len(left) != 0 {
		t.Errorf("stages left in %s: %v", in.stages, left)
	}
}

// agisterInstalling runs agister as agisterInput does, its installs
// staged in a folder of the test's, and fails t if a stage is left there.
func agisterInstalling(t *testing.T, input, home, cwd string, args ...string) result {
	t.Helper()
	stages := tempDir(t)
	var stdout, stderr bytes.Buffer
	code := cli.Run(context.Background(), append([]string{"--home", home}, args...), cli.IO{
		Stdin: strings.NewReader(input), Stdout: &stdout, Stderr: &stderr, Cwd: cwd,
		Getenv: func(string) string { return "" },
	}, func(config cli.Config) (contract.Client, error) {
		compose := inProcess(config)
		compose.stages = stages
		client, _, err := compose.wire(config)
		return client, err
	}, diagnostics)
	if left := files(t, stages); len(left) != 0 {
		t.Errorf("stages left in %s: %v", stages, left)
	}
	return result{code, stdout.String(), stderr.String()}
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

// files is every file under dir and its content, a link where it points,
// but for the log the client appends to and the backups.
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
		if entry.Type()&fs.ModeSymlink != 0 {
			target, err := os.Readlink(path)
			found[rel] = "-> " + target
			return err
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
	t.Parallel()
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
				"@@ -4,3 +4,4 @@\n model = \"sonnet\"\n model_family = \"anthropic\"\n effort = \"high\"\n+# tuned\n"},
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
	if len(plan.Kept) != 20 || plan.Kept[0] != filepath.Join(home, "agents", "assistant.toml") {
		t.Fatalf("kept: %v", plan.Kept)
	}
	if len(plan.Inventory) != 22 || plan.Inventory[filepath.Join(home, "service.toml")] != digestText(before["service.toml"]) {
		t.Fatalf("inventory: %v", plan.Inventory)
	}
	if in.staged != 1 || !reflect.DeepEqual(files(t, home), before) || backups(t, home) != nil {
		t.Fatalf("the plan staged %d time(s), backed up %v or wrote", in.staged, backups(t, home))
	}
	// The stage is removed once the plan is made.
	in.stagesRemoved(t)
}

// A folder home already has, document for document, installs nothing: no
// staging, no backup, no write.
func TestInstallingIdenticalSettingsDoesNothing(t *testing.T) {
	t.Parallel()
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
	t.Parallel()
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
			var manifest fsdefs.Manifest
			readJSON(t, filepath.Join(backup, "manifest.json"), &manifest)
			want := []fsdefs.ManifestEntry{
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
	t.Parallel()
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

// The yes binds home's whole inventory and the source's documents: a
// document changed, added, or created at a planned path since the plan, in
// home or in the source, refuses the install, with nothing written.
func TestInstallRefusesAnInventoryChangedSinceThePlan(t *testing.T) {
	t.Parallel()
	for name, change := range map[string]func(home, src string){
		"changed": func(home, _ string) {
			path := filepath.Join(home, "agents", "assistant.toml")
			write(t, path, read(t, path)+"# edited\n")
		},
		"added":        func(home, _ string) { write(t, filepath.Join(home, "prompts", "extra.md"), "extra\n") },
		"planned path": func(home, _ string) { write(t, filepath.Join(home, "prompts", "house.md"), "mine\n") },
		"source changed": func(_, src string) {
			path := filepath.Join(src, "agents", "reviewer.toml")
			write(t, path, read(t, path)+"# retuned\n")
		},
		"source added": func(_, src string) { write(t, filepath.Join(src, "prompts", "extra.md"), "extra\n") },
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			home := initedHome(t)
			src := repoSettings(t, home)
			in := installClient(t, home, func(string) error { t.Fatal("a document was written"); return nil })
			plan, err := in.client.Install(context.Background(), src, nil)
			if err != nil {
				t.Fatal(err)
			}
			change(home, src)
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
	t.Parallel()
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

// A restore puts back the bytes the install replaced, and reads home's
// file as written: a process the install made extend a base is put back
// though its base was removed since (ADR-016, ADR-030 rule 9).
func TestRestorePutsBackAProcessWhoseBaseIsGone(t *testing.T) {
	t.Parallel()
	home := initedHome(t)
	child := filepath.Join(home, "processes", "child_ask.yaml")
	standalone := strings.NewReplacer("name: base_ask", "name: child_ask").Replace(baseAsk) + "prompt: ask\n"
	write(t, child, standalone)
	src := filepath.Join(tempDir(t), ".agister")
	write(t, filepath.Join(src, "processes", "base_ask.yaml"), baseAsk)
	write(t, filepath.Join(src, "processes", "child_ask.yaml"), childAsk)
	in := installClient(t, home, nil)
	result, err := in.installNow(t, src)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Remove(filepath.Join(home, "processes", "base_ask.yaml")); err != nil {
		t.Fatal(err)
	}

	plan, err := in.restoreNow(t, result.Stamp)
	if err != nil {
		t.Fatalf("restore: %v", err)
	}
	var diff string
	for _, doc := range plan.Documents {
		if doc.Path == child {
			diff = doc.Diff
		}
	}
	if !strings.Contains(diff, "-extends: process:base_ask\n") || !strings.Contains(diff, "+timeout: 10m\n") {
		t.Fatalf("restore plan %+v", plan)
	}
	if got := read(t, child); got != standalone {
		t.Fatalf("after restore %s holds:\n%s", child, got)
	}
}

// The yes binds the restore plan: a document it touches changed since, or
// one the install created already removed, refuses the restore, with
// nothing written.
func TestRestoreRefusesAStateChangedSinceThePlan(t *testing.T) {
	t.Parallel()
	for name, change := range map[string]func(home string){
		"changed": func(home string) {
			path := filepath.Join(home, "agents", "reviewer.toml")
			write(t, path, read(t, path)+"# edited\n")
		},
		"created removed": func(home string) {
			if err := os.Remove(filepath.Join(home, "prompts", "house.md")); err != nil {
				t.Fatal(err)
			}
		},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			home := initedHome(t)
			src := repoSettings(t, home)
			in := installClient(t, home, nil)
			result, err := in.installNow(t, src)
			if err != nil {
				t.Fatal(err)
			}
			plan, err := in.client.Restore(context.Background(), result.Stamp, nil)
			if err != nil {
				t.Fatal(err)
			}
			change(home)
			before := files(t, home)
			var input *contract.InputError
			if _, err := in.client.Restore(context.Background(), result.Stamp, &plan); !errors.As(err, &input) || !strings.Contains(err.Error(), "changed since you confirmed, so nothing was restored") {
				t.Fatalf("approved: %v", err)
			}
			if !reflect.DeepEqual(files(t, home), before) {
				t.Fatal("wrote after the state changed")
			}
		})
	}
}

// An install and a restore plan again under home's lock, and write and
// release it only after: what is compared with the approved plan is what
// is written.
func TestInstallAndRestoreWriteUnderTheLock(t *testing.T) {
	t.Parallel()
	home := initedHome(t)
	src := repoSettings(t, home)
	in := installClient(t, home, nil)
	ctx := context.Background()
	plan, err := in.client.Install(ctx, src, nil)
	if err != nil {
		t.Fatal(err)
	}
	in.events = nil
	result, err := in.client.Install(ctx, src, &plan)
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"Lock", "Documents", "Current prompts/house", "Put agents/reviewer", "Put prompts/house", "unlock"}
	if !reflect.DeepEqual(in.events, want) {
		t.Fatalf("install:\n%q\nwant\n%q", in.events, want)
	}
	restore, err := in.client.Restore(ctx, result.Stamp, nil)
	if err != nil {
		t.Fatal(err)
	}
	in.events = nil
	if _, err := in.client.Restore(ctx, result.Stamp, &restore); err != nil {
		t.Fatal(err)
	}
	want = []string{"Lock", "Current agents/reviewer", "Current prompts/house", "Put agents/reviewer", "Remove prompts/house", "unlock"}
	if !reflect.DeepEqual(in.events, want) {
		t.Fatalf("restore:\n%q\nwant\n%q", in.events, want)
	}
}

// failingBackups fails every backup it is asked to save.
type failingBackups struct {
	app.InstallBackups
	err error
}

func (b failingBackups) Save(context.Context, string, app.InstallManifest, []document.Document) error {
	return b.err
}

// A backup that fails stops the install before anything is written.
func TestInstallWritesNothingWhenTheBackupFails(t *testing.T) {
	t.Parallel()
	home := initedHome(t)
	src := repoSettings(t, home)
	before := files(t, home)
	full := errors.New("disk full")
	in := installClientAdjusted(t, home, func(adapters *app.InstallAdapters) {
		adapters.Backups = failingBackups{InstallBackups: adapters.Backups, err: full}
		adapters.BeforeWrite = func(string) error { t.Fatal("a document was written"); return nil }
	})
	result, err := in.installNow(t, src)
	if !errors.Is(err, full) || !strings.Contains(err.Error(), "nothing was installed") || result.Stamp != "" {
		t.Fatalf("%+v, %v", result, err)
	}
	for _, event := range in.events {
		if strings.HasPrefix(event, "Put ") {
			t.Fatalf("written after the backup failed: %q", in.events)
		}
	}
	if !reflect.DeepEqual(files(t, home), before) {
		t.Fatal("home changed after the backup failed")
	}
}

// An install that fails once approved, its backup's folder a file, makes
// no run: the failure is in the log as an error, as stderr says it.
func TestAnInstallThatFailsIsLogged(t *testing.T) {
	t.Parallel()
	home := initedHome(t)
	src := repoSettings(t, home)
	write(t, filepath.Join(home, "backups"), "not a folder")
	r := agisterInstalling(t, "yes\n", home, tempDir(t), "install", src)
	if r.code == 0 || !strings.Contains(r.stderr, "not a directory") {
		t.Fatalf("install: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	logged := loggedAs(t, home, "the command failed")
	if len(logged) != 1 {
		t.Fatalf("failures logged = %v", logged)
	}
	message, _ := logged[0]["error"].(string)
	if logged[0]["level"] != "ERROR" || logged[0]["command"] != "install" || !strings.Contains(r.stderr, "agister: "+message+"\n") {
		t.Fatalf("logged = %v, stderr:\n%s", logged[0], r.stderr)
	}
}

// A backup whose saved document was changed is refused: a restore never
// puts back what the install did not replace.
func TestRestoreRefusesATamperedBackup(t *testing.T) {
	t.Parallel()
	home := initedHome(t)
	src := repoSettings(t, home)
	in := installClient(t, home, nil)
	result, err := in.installNow(t, src)
	if err != nil {
		t.Fatal(err)
	}
	write(t, filepath.Join(home, "backups", result.Stamp, "agents", "reviewer.toml"), "tampered\n")
	installed := files(t, home)
	if _, err := in.client.Restore(context.Background(), result.Stamp, nil); err == nil || !strings.Contains(err.Error(), "does not hold "+filepath.Join(home, "agents", "reviewer.toml")+" as it was before the install") {
		t.Fatalf("restore of a tampered backup: %v", err)
	}
	if !reflect.DeepEqual(files(t, home), installed) {
		t.Fatal("a refused restore wrote")
	}
}

// checkProblem is the problem home's check reports about subject.
func checkProblem(t *testing.T, client contract.Client, subject string) string {
	t.Helper()
	report, err := client.Check(context.Background(), false)
	if err != nil {
		t.Fatal(err)
	}
	for _, problem := range report.Problems {
		if strings.HasPrefix(problem.Message, subject+": ") {
			return problem.Message
		}
	}
	t.Fatalf("check reports no problem about %s: %+v", subject, report.Problems)
	return ""
}

// A file whose name breaks the naming rule is no document: in home it is
// not planned, but the result is checked with it, as home's check sees
// it, so its problem refuses the install; in the source it is named as not
// installed.
func TestInstallChecksFilesWithInvalidNames(t *testing.T) {
	t.Parallel()
	t.Run("home", func(t *testing.T) {
		t.Parallel()
		home := initedHome(t)
		src := repoSettings(t, home)
		write(t, filepath.Join(home, "agents", "Bad Name.toml"), "not = \"an agent\"\n")
		before := files(t, home)
		in := installClient(t, home, func(string) error { t.Fatal("a document was written"); return nil })
		problem := checkProblem(t, in.client, "agent Bad Name")
		var input *contract.InputError
		if _, err := in.installNow(t, src); !errors.As(err, &input) || !strings.Contains(err.Error(), "would not pass check") || !strings.Contains(err.Error(), problem) {
			t.Fatalf("install: %v, want %q refusing it", err, problem)
		}
		if !reflect.DeepEqual(files(t, home), before) || backups(t, home) != nil {
			t.Fatal("a refused install wrote")
		}
	})
	t.Run("source", func(t *testing.T) {
		t.Parallel()
		home := initedHome(t)
		src := repoSettings(t, home)
		write(t, filepath.Join(src, "agents", "Bad.toml"), "not = \"an agent\"\n")
		in := installClient(t, home, nil)
		result, err := in.installNow(t, src)
		if err != nil || result.Writes() != 2 || !slices.Contains(result.Ignored, "agents/Bad.toml") {
			t.Fatalf("%+v, %v", result, err)
		}
		if _, err := os.Stat(filepath.Join(home, "agents", "Bad.toml")); !errors.Is(err, fs.ErrNotExist) {
			t.Fatalf("Bad.toml installed: %v", err)
		}
	})
}

// A document home lists but cannot read does not stop an install: one the
// source has replaces it, as nothing readable, and its restore removes
// it; one the source has not is kept, and refuses the install as check
// reports it.
func TestInstallOverADocumentHomeCannotRead(t *testing.T) {
	t.Parallel()
	dangle := func(t *testing.T, home string) string {
		path := filepath.Join(home, "prompts", "x.md")
		if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
			t.Fatal(err)
		}
		if err := os.Symlink(filepath.Join(home, "prompts", "nowhere.md"), path); err != nil {
			t.Fatal(err)
		}
		return path
	}
	t.Run("replaced", func(t *testing.T) {
		t.Parallel()
		home := initedHome(t)
		path := dangle(t, home)
		src := filepath.Join(tempDir(t), ".agister")
		write(t, filepath.Join(src, "prompts", "x.md"), "Mind the house style.\n")
		in := installClient(t, home, nil)
		plan, err := in.client.Install(context.Background(), src, nil)
		if err != nil {
			t.Fatal(err)
		}
		want := []contract.InstallDocument{{Kind: "prompts", Name: "x", Path: path, Action: contract.InstallReplace, After: digestText("Mind the house style.\n"),
			Diff: "--- " + path + "\n+++ " + filepath.Join(src, "prompts", "x.md") + "\n@@ -0,0 +1 @@\n+Mind the house style.\n"}}
		if digest, ok := plan.Inventory[path]; !reflect.DeepEqual(plan.Documents, want) || !ok || digest != "" {
			t.Fatalf("plan %+v", plan)
		}
		result, err := in.client.Install(context.Background(), src, &plan)
		if err != nil || result.Stamp == "" || read(t, path) != "Mind the house style.\n" {
			t.Fatalf("install: %+v, %v", result, err)
		}
		restore, err := in.restoreNow(t, result.Stamp)
		if err != nil || len(restore.Documents) != 1 || restore.Documents[0].Action != contract.RestoreRemove {
			t.Fatalf("restore: %+v, %v", restore, err)
		}
		if _, err := os.Lstat(path); !errors.Is(err, fs.ErrNotExist) {
			t.Fatalf("not removed by the restore: %v", err)
		}
	})
	t.Run("kept", func(t *testing.T) {
		t.Parallel()
		home := initedHome(t)
		dangle(t, home)
		src := repoSettings(t, home)
		before := files(t, home)
		in := installClient(t, home, func(string) error { t.Fatal("a document was written"); return nil })
		problem := checkProblem(t, in.client, "prompt x")
		var input *contract.InputError
		if _, err := in.client.Install(context.Background(), src, nil); !errors.As(err, &input) || !strings.Contains(err.Error(), "would not pass check") || !strings.Contains(err.Error(), problem) {
			t.Fatalf("install: %v, want %q refusing it", err, problem)
		}
		if !reflect.DeepEqual(files(t, home), before) || backups(t, home) != nil {
			t.Fatal("a refused install wrote")
		}
	})
}

// An install stopped between its writes is undone by its restore too.
func TestRestoreUndoesAnInstallStoppedHalfway(t *testing.T) {
	t.Parallel()
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
	t.Parallel()
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
	t.Parallel()
	home := initedHome(t)
	src := repoSettings(t, home)
	dir := tempDir(t)
	before := files(t, home)
	for _, input := range []string{"", "no\n"} {
		r := agisterInstalling(t, input, home, dir, "install", src)
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
	r := agisterInstalling(t, "yes\n", home, dir, "install", src)
	match := regexp.MustCompile(`restore with: agister install --restore (\S+)\n`).FindStringSubmatch(r.stdout)
	if r.code != 0 || match == nil || !strings.Contains(r.stdout, "replaced "+filepath.Join(home, "agents", "reviewer.toml")) || strings.Count(r.stdout+r.stderr, "restore with:") != 1 {
		t.Fatalf("yes: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	if r := agisterInstalling(t, "", home, dir, "install", src); r.code != 0 || !strings.Contains(r.stdout, "nothing to install into "+home) || strings.Contains(r.stderr, "Type yes") {
		t.Fatalf("again: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	if r := agisterInstalling(t, "yes\n", home, dir, "install", "--restore", "20200101T000000Z-abcdef"); r.code != cli.ExitUsage || !strings.Contains(r.stderr, `no install backup "20200101T000000Z-abcdef"`) {
		t.Fatalf("unknown stamp: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	r = agisterInstalling(t, "yes\n", home, dir, "install", "--restore", match[1])
	if r.code != 0 || !strings.Contains(r.stdout, "will put back "+filepath.Join(home, "agents", "reviewer.toml")) ||
		!strings.Contains(r.stdout, "removed  "+filepath.Join(home, "prompts", "house.md")) || !strings.Contains(r.stderr, "Type yes to restore 2 document(s)") {
		t.Fatalf("restore: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	if !reflect.DeepEqual(files(t, home), before) {
		t.Fatal("restore did not put home back")
	}
}

// With --json, install and restore print what they did as their plans, and
// show the plans on stderr.
func TestInstallAndRestorePrintJSON(t *testing.T) {
	t.Parallel()
	home := initedHome(t)
	src := repoSettings(t, home)
	dir := tempDir(t)
	r := agisterInstalling(t, "yes\n", home, dir, "install", src, "--json")
	var installed contract.InstallPlan
	if err := json.Unmarshal([]byte(r.stdout), &installed); err != nil || r.code != 0 {
		t.Fatalf("install: %d %v\n%s%s", r.code, err, r.stdout, r.stderr)
	}
	if installed.Source != src || installed.Writes() != 2 || installed.Stamp == "" ||
		!strings.Contains(r.stderr, "will REPLACE "+filepath.Join(home, "agents", "reviewer.toml")) || !strings.Contains(r.stderr, "restore with: agister install --restore "+installed.Stamp) {
		t.Fatalf("install: %+v\n%s", installed, r.stderr)
	}
	r = agisterInstalling(t, "yes\n", home, dir, "install", "--restore", installed.Stamp, "--json")
	var restored contract.RestorePlan
	if err := json.Unmarshal([]byte(r.stdout), &restored); err != nil || r.code != 0 {
		t.Fatalf("restore: %d %v\n%s%s", r.code, err, r.stdout, r.stderr)
	}
	if restored.Stamp != installed.Stamp || restored.Writes() != 2 || !strings.Contains(r.stderr, "will put back "+filepath.Join(home, "agents", "reviewer.toml")) {
		t.Fatalf("restore: %+v\n%s", restored, r.stderr)
	}
}

// Install is not refused by home's broken settings: it is how they are
// repaired.
func TestInstallRepairsBrokenSettings(t *testing.T) {
	t.Parallel()
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
	if r := agisterInstalling(t, "yes\n", home, dir, "install", src); r.code != 0 {
		t.Fatalf("install: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	if r := agister(t, home, dir, "check"); r.code != 0 {
		t.Fatalf("check after install: %d\n%s", r.code, r.stderr)
	}
}

// A symbolic link in the folder refuses the install.
func TestInstallRefusesASymbolicLink(t *testing.T) {
	t.Parallel()
	home := initedHome(t)
	src := repoSettings(t, home)
	outside := filepath.Join(tempDir(t), "secret.md")
	write(t, outside, "outside\n")
	if err := os.Symlink(outside, filepath.Join(src, "prompts", "linked.md")); err != nil {
		t.Fatal(err)
	}
	before := files(t, home)
	r := agisterInstalling(t, "yes\n", home, tempDir(t), "install", src)
	if r.code != cli.ExitUsage || !strings.Contains(r.stderr, "linked.md is a symbolic link, so nothing was installed") || strings.Contains(r.stderr, "Type yes") {
		t.Fatalf("%d\n%s%s", r.code, r.stdout, r.stderr)
	}
	if !reflect.DeepEqual(files(t, home), before) || backups(t, home) != nil {
		t.Fatal("wrote")
	}
}
