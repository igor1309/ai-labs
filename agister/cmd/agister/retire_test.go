package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"maps"
	"os"
	"path/filepath"
	"reflect"
	"regexp"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/composition/install"
	"github.com/igor1309/ai-labs/agister/internal/contract"
	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
	"github.com/igor1309/ai-labs/gokit/clocktest"
)

// homeProcesses are the processes implement_codex, implement_pi and
// implement_pi_glm as the base revision of home's settings folder holds
// them, and so a home that folder was installed into.
var homeProcesses = filepath.Join("agister", "testdata", "home-before-call-workflows", "processes")

// retirementSource names a retirement in its backup's manifest, as
// cmd/retire-implement-processes does.
const retirementSource = "retire-implement-processes"

// repositoryRoot is the root of this repository.
func repositoryRoot(t *testing.T) string {
	t.Helper()
	root, err := filepath.Abs(filepath.Join("..", "..", ".."))
	if err != nil {
		t.Fatal(err)
	}
	return root
}

// legacyProcesses are the documents homeProcesses holds, by their path
// relative to a home, and as a retirement names them, by name.
func legacyProcesses(t *testing.T) (map[string]string, []app.RetireDocument) {
	t.Helper()
	held := map[string]string{}
	var docs []app.RetireDocument
	for rel, text := range files(t, filepath.Join(repositoryRoot(t), homeProcesses)) {
		held[filepath.Join("processes", rel)] = text
		docs = append(docs, app.RetireDocument{Kind: definition.KindProcess, Name: strings.TrimSuffix(rel, ".yaml")})
	}
	slices.SortFunc(docs, func(a, b app.RetireDocument) int { return strings.Compare(a.Name, b.Name) })
	if want := []string{"processes/implement_codex.yaml", "processes/implement_pi.yaml", "processes/implement_pi_glm.yaml"}; !slices.Equal(slices.Sorted(maps.Keys(held)), want) {
		t.Fatalf("%s holds %v, want %v", homeProcesses, slices.Sorted(maps.Keys(held)), want)
	}
	return held, docs
}

// retire retires docs from home through the retirement's composition, on
// clock, with afterBackup called once its backup is saved. It returns
// what was retired and the backups it made.
func retire(t *testing.T, home string, clock app.RetireClock, afterBackup func(string) error, docs []app.RetireDocument) (app.Retired, []string, error) {
	t.Helper()
	backed := backups(t, home)
	done, err := install.Retirer(home, clock, afterBackup).Retire(context.Background(), retirementSource, docs)
	var made []string
	for _, stamp := range backups(t, home) {
		if !slices.Contains(backed, stamp) {
			made = append(made, stamp)
		}
	}
	return done, made, err
}

// A home the base revision's folder was installed into, with documents of
// its own besides, does not take home's settings folder: it holds the
// processes implement_codex, implement_pi and implement_pi_glm, which the
// folder's workflows of those names collide with, and the install is
// refused, writing nothing. The retirement backs those three up as an
// install backup of their own and removes them, and nothing else. Home
// then takes the folder and passes check, its own documents kept. The
// retirement run again retires nothing. Restoring the install, then the
// retirement, puts home back as it was.
func TestRetiringTheImplementProcessesLetsHomeTakeTheFolder(t *testing.T) {
	t.Parallel()
	folder := filepath.Join(repositoryRoot(t), homeFolder)
	home := filepath.Join(tempDir(t), "home")
	nowhere := tempDir(t)
	retired, docs := legacyProcesses(t)

	// The base revision's folder: this one's, without the workflows of one
	// call and with the processes of their names.
	base := filepath.Join(tempDir(t), "home")
	for rel, text := range files(t, folder) {
		if name, ok := strings.CutPrefix(rel, "workflows"+string(filepath.Separator)); ok {
			if _, call := callAgents[strings.TrimSuffix(name, ".yaml")]; call {
				continue
			}
		}
		write(t, filepath.Join(base, rel), text)
	}
	for rel, text := range retired {
		write(t, filepath.Join(base, rel), text)
	}
	if r := agisterInstalling(t, "yes\n", home, nowhere, "install", base); r.code != 0 {
		t.Fatalf("install of the base revision's folder: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	own := map[string]string{
		filepath.Join("prompts", "house.md"): "Follow the house style.\n",
		filepath.Join("processes", "house_advisor.yaml"): strings.Replace(read(t, filepath.Join(folder, "processes", "advisor.yaml")),
			"name: advisor\n", "name: house_advisor\n", 1),
	}
	for rel, text := range own {
		write(t, filepath.Join(home, rel), text)
	}
	before := files(t, home)

	r := agisterInstalling(t, "yes\n", home, nowhere, "install", folder)
	if r.code == 0 || !strings.Contains(r.stderr, "home's settings would not pass check once "+folder+" is installed") {
		t.Fatalf("install over the processes: %d, want refused for its check\n%s%s", r.code, r.stdout, r.stderr)
	}
	for name := range callAgents {
		if name != "implement_opus" && name != "implement_sonnet" && !strings.Contains(r.stderr, name) {
			t.Errorf("the refusal names no %s:\n%s", name, r.stderr)
		}
	}
	if after := files(t, home); !reflect.DeepEqual(after, before) {
		t.Fatalf("a refused install changed home: %v, want %v", keys(after), keys(before))
	}

	clock := clocktest.NewClock(time.Date(2026, 10, 11, 3, 51, 48, 123456000, time.UTC))
	done, made, err := retire(t, home, clock, nil, docs)
	if err != nil {
		t.Fatal(err)
	}
	if len(made) != 1 || made[0] != done.Stamp {
		t.Fatalf("backups made by the retirement: %v, want one, %q", made, done.Stamp)
	}
	stamp := done.Stamp
	var removed []string
	for rel := range retired {
		removed = append(removed, filepath.Join(home, rel))
	}
	if slices.Sort(removed); !slices.Equal(done.Removed, removed) {
		t.Errorf("the retirement removed %v, want %v", done.Removed, removed)
	}
	want := maps.Clone(before)
	for rel := range retired {
		delete(want, rel)
	}
	if after := files(t, home); !reflect.DeepEqual(after, want) {
		t.Fatalf("home after the retirement holds %v, want %v", keys(after), keys(want))
	}
	var manifest struct {
		Stamp     string
		Source    string
		Installed time.Time
		Documents []struct{ Path, Kind, Name, Action, Before, After string }
	}
	readJSON(t, filepath.Join(home, "backups", stamp, "manifest.json"), &manifest)
	if manifest.Stamp != stamp || manifest.Source != retirementSource || !manifest.Installed.Equal(clock.Now()) || len(manifest.Documents) != len(retired) {
		t.Fatalf("manifest of %s: %+v, want its stamp, source and time and %d document(s)", stamp, manifest, len(retired))
	}
	for _, doc := range manifest.Documents {
		rel := filepath.Join(doc.Kind, doc.Name+".yaml")
		text, ok := retired[rel]
		if !ok || doc.Path != filepath.Join(home, rel) || doc.Action != contract.InstallReplace || doc.Before != digestText(text) || doc.After != "" {
			t.Errorf("manifest entry %+v, want %s replaced by nothing from digest %s", doc, rel, digestText(text))
		}
		if saved := read(t, filepath.Join(home, "backups", stamp, rel)); saved != text {
			t.Errorf("backup %s holds %s as:\n%s\nwant:\n%s", stamp, rel, saved, text)
		}
	}

	backed := backups(t, home)
	if r := agisterInstalling(t, "yes\n", home, nowhere, "install", folder); r.code != 0 {
		t.Fatalf("install after the retirement: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	var installed string
	for _, made := range backups(t, home) {
		if !slices.Contains(backed, made) {
			installed = made
		}
	}
	got := files(t, home)
	delete(got, ".write.lock")
	want = files(t, folder)
	maps.Copy(want, own)
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("home after the install holds %v, want the folder's files and its own %v", keys(got), keys(want))
	}
	r = agister(t, home, nowhere, "check", "--json")
	var report contract.CheckReport
	if err := json.Unmarshal([]byte(r.stdout), &report); err != nil || r.code != 0 || len(report.Problems) != 0 {
		t.Fatalf("check: %d %v\n%s%s", r.code, err, r.stdout, r.stderr)
	}

	now := files(t, home)
	if again, made, err := retire(t, home, clock, nil, docs); err != nil || again.Stamp != "" || len(again.Removed) != 0 || len(made) != 0 {
		t.Errorf("the retirement run again: %+v, backups %v, %v; want nothing retired and none made", again, made, err)
	}
	if after := files(t, home); !reflect.DeepEqual(after, now) {
		t.Errorf("the retirement run again changed home: %v, want %v", keys(after), keys(now))
	}

	for _, stamp := range []string{installed, stamp} {
		if r := agisterInstalling(t, "yes\n", home, nowhere, "install", "--restore", stamp); r.code != 0 {
			t.Fatalf("restore %s: %d\n%s%s", stamp, r.code, r.stdout, r.stderr)
		}
	}
	restored := files(t, home)
	if !reflect.DeepEqual(restored, before) {
		t.Fatalf("home after both restores holds %v, want %v as it was", keys(restored), keys(before))
	}
}

// A home whose path holds a tab is retired from, and its retirement's
// backup restores it: the manifest names each document's path as the
// installer's does, so the restore reads it.
func TestRetirementBackupRestoresHomeWithTabInPath(t *testing.T) {
	t.Parallel()
	home := filepath.Join(tempDir(t), "home\twith a tab")
	retired, docs := legacyProcesses(t)
	for rel, text := range retired {
		write(t, filepath.Join(home, rel), text)
	}
	before := files(t, home)

	done, made, err := retire(t, home, clocktest.NewClock(time.Date(2026, 10, 11, 3, 51, 48, 123456000, time.UTC)), nil, docs)
	if err != nil || len(made) != 1 || made[0] != done.Stamp {
		t.Fatalf("retirement: %+v, backups %v, %v; want one backup", done, made, err)
	}
	after := files(t, home)
	delete(after, ".write.lock")
	if len(after) != 0 {
		t.Fatalf("home after the retirement holds %v, want nothing", keys(after))
	}
	var manifest struct{ Documents []struct{ Path string } }
	readJSON(t, filepath.Join(home, "backups", done.Stamp, "manifest.json"), &manifest)
	var paths []string
	for _, doc := range manifest.Documents {
		paths = append(paths, doc.Path)
	}
	if want := done.Removed; !slices.Equal(paths, want) || len(want) != len(retired) {
		t.Errorf("the manifest names %q, want %q", paths, want)
	}

	if r := agisterInstalling(t, "yes\n", home, tempDir(t), "install", "--restore", done.Stamp); r.code != 0 {
		t.Fatalf("restore %s: %d\n%s%s", done.Stamp, r.code, r.stdout, r.stderr)
	}
	delete(before, ".write.lock")
	restored := files(t, home)
	delete(restored, ".write.lock")
	if !reflect.DeepEqual(restored, before) {
		t.Fatalf("home after the restore holds %v, want %v as it was", keys(restored), keys(before))
	}
}

// A retirement's backup is stamped as an install's is, at the time its
// clock tells, to the microsecond.
func TestRetirementBackupUsesInstallerTimestamp(t *testing.T) {
	t.Parallel()
	home := filepath.Join(tempDir(t), "home")
	retired, docs := legacyProcesses(t)
	for rel, text := range retired {
		write(t, filepath.Join(home, rel), text)
	}
	now := time.Date(2026, 10, 11, 3, 51, 48, 123456789, time.UTC)

	done, _, err := retire(t, home, clocktest.NewClock(now), nil, docs)
	if err != nil {
		t.Fatal(err)
	}
	if !regexp.MustCompile(`^20261011T035148\.123456Z-[0-9a-f]{6}$`).MatchString(done.Stamp) {
		t.Errorf("stamp %q, want the clock's time to the microsecond and a random suffix", done.Stamp)
	}
	retirement, _, _ := strings.Cut(done.Stamp, "-")
	installs, _, _ := strings.Cut(install.Stamps{}.Stamp(now), "-")
	if retirement != installs {
		t.Errorf("stamp %q, want it named as an install at the same time is: %s-…", done.Stamp, installs)
	}
	var manifest struct{ Installed time.Time }
	readJSON(t, filepath.Join(home, "backups", done.Stamp, "manifest.json"), &manifest)
	if !manifest.Installed.Equal(now) {
		t.Errorf("manifest's time %s, want %s", manifest.Installed, now)
	}
}

// A retirement's backup made after five backups earlier in the same
// second sorts after them, so the install that follows prunes two of them
// and keeps it, and it restores what the retirement removed.
func TestRetirementBackupIsKeptOverBackupsEarlierInItsSecond(t *testing.T) {
	t.Parallel()
	folder := filepath.Join(repositoryRoot(t), homeFolder)
	home := filepath.Join(tempDir(t), "home")
	retired, docs := legacyProcesses(t)
	for rel, text := range retired {
		write(t, filepath.Join(home, rel), text)
	}
	second := time.Date(2026, 10, 11, 3, 51, 48, 0, time.UTC)
	var earlier []string
	for n := range 5 {
		at := second.Add(time.Duration(n+1) * time.Microsecond)
		stamp := install.Stamps{}.Stamp(at)
		write(t, filepath.Join(home, "backups", stamp, "manifest.json"),
			fmt.Sprintf(`{"stamp": %q, "source": "earlier", "installed": %q, "documents": []}`+"\n", stamp, at.Format(time.RFC3339Nano)))
		earlier = append(earlier, stamp)
	}
	slices.Sort(earlier)

	done, _, err := retire(t, home, clocktest.NewClock(second.Add(500*time.Millisecond)), nil, docs)
	if err != nil {
		t.Fatal(err)
	}
	in := installClientAdjusted(t, home, func(adapters *app.InstallAdapters) {
		adapters.Clock = clocktest.NewClock(second.Add(600 * time.Millisecond))
		adapters.Stamps = install.Stamps{}
	})
	plan, err := in.installNow(t, folder)
	if err != nil {
		t.Fatalf("install after the retirement: %v", err)
	}
	if want := append(slices.Clone(earlier[2:]), done.Stamp, plan.Stamp); !slices.Equal(backups(t, home), want) {
		t.Fatalf("backups kept %v, want the three latest earlier, the retirement's and the install's: %v", backups(t, home), want)
	}

	if _, err := in.restoreNow(t, done.Stamp); err != nil {
		t.Fatalf("restore %s: %v", done.Stamp, err)
	}
	got := files(t, home)
	for rel, text := range retired {
		if got[rel] != text {
			t.Errorf("home after the restore holds %s as:\n%s\nwant:\n%s", rel, got[rel], text)
		}
	}
}

// A retirement whose backup does not read back as saved, or whose check
// fails, removes the backup and nothing of home: its documents are as
// they were.
func TestRetirementBackupDigestFailureLeavesDocumentsUntouched(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name string
		// fail fails the check of the backup saved under backup.
		fail func(t *testing.T, backup string) error
		want string
	}{
		{
			name: "saved bytes differ",
			fail: func(t *testing.T, backup string) error {
				write(t, filepath.Join(backup, "processes", "implement_pi.yaml"), "changed\n")
				return nil
			},
			want: filepath.Join("processes", "implement_pi.yaml") + " as it was before the install: its digest differs",
		},
		{
			name: "no digest recorded",
			fail: func(t *testing.T, backup string) error {
				path := filepath.Join(backup, "manifest.json")
				var manifest map[string]any
				readJSON(t, path, &manifest)
				manifest["documents"].([]any)[0].(map[string]any)["before"] = ""
				data, err := json.Marshal(manifest)
				if err != nil {
					t.Fatal(err)
				}
				write(t, path, string(data))
				return nil
			},
			want: "from no SHA-256 digest",
		},
		{
			name: "check fails",
			fail: func(*testing.T, string) error { return errors.New("checksum failed") },
			want: "checksum failed",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			home := filepath.Join(tempDir(t), "home")
			retired, docs := legacyProcesses(t)
			for rel, text := range retired {
				write(t, filepath.Join(home, rel), text)
			}
			before := files(t, home)
			var checked string
			hook := func(stamp string) error {
				checked = stamp
				return tt.fail(t, filepath.Join(home, "backups", stamp))
			}

			done, _, err := retire(t, home, clocktest.NewClock(time.Date(2026, 10, 11, 3, 51, 48, 123456000, time.UTC)), hook, docs)
			if err == nil || !strings.Contains(err.Error(), tt.want) || !strings.Contains(err.Error(), "nothing was retired") {
				t.Fatalf("retirement: %v, want refused for %q and nothing retired", err, tt.want)
			}
			if checked == "" || done.Stamp != "" || len(done.Removed) != 0 {
				t.Errorf("retirement: %+v, its backup %q checked; want its backup checked and nothing retired", done, checked)
			}
			after := files(t, home)
			delete(after, ".write.lock")
			if !reflect.DeepEqual(after, before) {
				t.Errorf("home after the failed retirement holds %v, want %v as it was", keys(after), keys(before))
			}
			if left := backups(t, home); len(left) != 0 {
				t.Errorf("backups left: %v, want the incomplete one removed", left)
			}
			if _, err := os.Stat(filepath.Join(home, "backups", checked)); !errors.Is(err, os.ErrNotExist) {
				t.Errorf("backup %s: %v, want removed", checked, err)
			}
		})
	}
}
