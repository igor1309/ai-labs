package main

import (
	"encoding/json"
	"maps"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"slices"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/contract"
)

// retireScript retires the processes homeProcesses holds from a home, so
// home's settings folder installs over it.
var retireScript = filepath.Join("agister", "scripts", "retire-implement-processes.sh")

// homeProcesses are the processes implement_codex, implement_pi and
// implement_pi_glm as the base revision of home's settings folder holds
// them, and so a home that folder was installed into.
var homeProcesses = filepath.Join("agister", "testdata", "home-before-call-workflows", "processes")

// A home the base revision's folder was installed into, with documents of
// its own besides, does not take home's settings folder: it holds the
// processes implement_codex, implement_pi and implement_pi_glm, which the
// folder's workflows of those names collide with, and the install is
// refused, writing nothing. retireScript backs those three up as an
// install backup of their own and removes them, and nothing else. Home
// then takes the folder and passes check, its own documents kept. The
// script run again, over home as $AGISTER_HOME, retires nothing. Restoring
// the install, then the retirement, puts home back as it was.
//
// Contract test: the retirement script, run by sh on a home of real files.
func TestRetiringTheImplementProcessesLetsHomeTakeTheFolder(t *testing.T) {
	t.Parallel()
	root, err := filepath.Abs(filepath.Join("..", "..", ".."))
	if err != nil {
		t.Fatal(err)
	}
	folder := filepath.Join(root, homeFolder)
	home := filepath.Join(tempDir(t), "home")
	nowhere := tempDir(t)

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
	retired := map[string]string{}
	for rel, text := range files(t, filepath.Join(root, homeProcesses)) {
		retired[filepath.Join("processes", rel)] = text
		write(t, filepath.Join(base, "processes", rel), text)
	}
	if want := []string{"processes/implement_codex.yaml", "processes/implement_pi.yaml", "processes/implement_pi_glm.yaml"}; !slices.Equal(slices.Sorted(maps.Keys(retired)), want) {
		t.Fatalf("%s holds %v, want %v", homeProcesses, slices.Sorted(maps.Keys(retired)), want)
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

	retire := func(env []string, args ...string) (string, []string) {
		t.Helper()
		backed := backups(t, home)
		command := exec.Command("sh", append([]string{filepath.Join(root, retireScript)}, args...)...)
		command.Dir = nowhere
		command.Env = append([]string{"PATH=" + os.Getenv("PATH"), "HOME=" + nowhere}, env...)
		out, err := command.CombinedOutput()
		if err != nil {
			t.Fatalf("%s: %v\n%s", retireScript, err, out)
		}
		var made []string
		for _, stamp := range backups(t, home) {
			if !slices.Contains(backed, stamp) {
				made = append(made, stamp)
			}
		}
		return string(out), made
	}
	out, made := retire(nil, home)
	if len(made) != 1 {
		t.Fatalf("backups made by the retirement: %v, want one\n%s", made, out)
	}
	stamp := made[0]
	if !strings.Contains(out, "agister install --restore "+stamp) {
		t.Errorf("the retirement prints no restore of %s:\n%s", stamp, out)
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
		Documents []struct{ Path, Kind, Name, Action, Before, After string }
	}
	readJSON(t, filepath.Join(home, "backups", stamp, "manifest.json"), &manifest)
	if manifest.Stamp != stamp || len(manifest.Documents) != len(retired) {
		t.Fatalf("manifest of %s: %+v, want its stamp and %d document(s)", stamp, manifest, len(retired))
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
	var install string
	for _, made := range backups(t, home) {
		if !slices.Contains(backed, made) {
			install = made
		}
	}
	installed := files(t, home)
	delete(installed, ".write.lock")
	want = files(t, folder)
	maps.Copy(want, own)
	if !reflect.DeepEqual(installed, want) {
		t.Fatalf("home after the install holds %v, want the folder's files and its own %v", keys(installed), keys(want))
	}
	r = agister(t, home, nowhere, "check", "--json")
	var report contract.CheckReport
	if err := json.Unmarshal([]byte(r.stdout), &report); err != nil || r.code != 0 || len(report.Problems) != 0 {
		t.Fatalf("check: %d %v\n%s%s", r.code, err, r.stdout, r.stderr)
	}

	now := files(t, home)
	if out, made := retire([]string{"AGISTER_HOME=" + home}); len(made) != 0 || !strings.Contains(out, "nothing to retire") {
		t.Errorf("the retirement run again made backups %v, want none and nothing retired\n%s", made, out)
	}
	if after := files(t, home); !reflect.DeepEqual(after, now) {
		t.Errorf("the retirement run again changed home: %v, want %v", keys(after), keys(now))
	}

	for _, stamp := range []string{install, stamp} {
		if r := agisterInstalling(t, "yes\n", home, nowhere, "install", "--restore", stamp); r.code != 0 {
			t.Fatalf("restore %s: %d\n%s%s", stamp, r.code, r.stdout, r.stderr)
		}
	}
	restored := files(t, home)
	if !reflect.DeepEqual(restored, before) {
		t.Fatalf("home after both restores holds %v, want %v as it was", keys(restored), keys(before))
	}
}
