package app_test

import (
	"context"
	"errors"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/contract"
	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
)

// installSource is a folder of settings that holds docs.
type installSource struct{ docs []definition.Document }

func (s installSource) Source(context.Context, string) ([]definition.Document, []string, error) {
	return s.docs, nil, nil
}

// installHomeSpy is home's settings in memory; it records what is written,
// and fails each Put with putErr and each Remove with removeErr. left is
// what a failed write left, by kind and name.
type installHomeSpy struct {
	docs              []definition.Document
	left              map[string]string
	writes            []string
	putErr, removeErr error
}

func (h *installHomeSpy) Documents(context.Context) ([]definition.Document, []definition.Source, error) {
	return h.docs, nil, nil
}

func (h *installHomeSpy) Read(_ context.Context, kind definition.Kind, name string) (definition.Document, error) {
	for _, doc := range h.docs {
		if doc.Source.Kind == kind && doc.Source.Name == name {
			return doc, nil
		}
	}
	return definition.Document{}, errors.New("not found")
}

func (h *installHomeSpy) Current(_ context.Context, kind definition.Kind, name string) (string, string, error) {
	path := "home/" + string(kind) + "/" + name
	for _, doc := range h.docs {
		if doc.Source.Kind == kind && doc.Source.Name == name {
			return path, doc.Source.SHA256, nil
		}
	}
	return path, "", nil
}

func (h *installHomeSpy) Left(_ context.Context, kind definition.Kind, name string) (string, error) {
	return h.left[string(kind)+"/"+name], nil
}

func (h *installHomeSpy) Lock(context.Context) (func(), error) { return func() {}, nil }

func (h *installHomeSpy) Put(_ context.Context, kind definition.Kind, name string, _ []byte) error {
	h.writes = append(h.writes, "Put "+string(kind)+"/"+name)
	return h.putErr
}

func (h *installHomeSpy) Remove(_ context.Context, kind definition.Kind, name string) error {
	h.writes = append(h.writes, "Remove "+string(kind)+"/"+name)
	return h.removeErr
}

// installBackupsSpy records the backups saved; it keeps one manifest, and
// the bytes saved of each document by name. Remove fails with removeErr.
type installBackupsSpy struct {
	saved     []string
	manifest  *app.InstallManifest
	bytes     map[string][]byte
	removeErr error
}

func (b *installBackupsSpy) Save(_ context.Context, stamp string, _ app.InstallManifest, _ []definition.Document) error {
	b.saved = append(b.saved, stamp)
	return nil
}

func (b *installBackupsSpy) List(context.Context) ([]string, error) { return b.saved, nil }

func (b *installBackupsSpy) Manifest(context.Context, string) (app.InstallManifest, error) {
	if b.manifest == nil {
		return app.InstallManifest{}, errors.New("no manifest")
	}
	return *b.manifest, nil
}

func (b *installBackupsSpy) Saved(_ context.Context, _ string, _ definition.Kind, name string) ([]byte, error) {
	if data, ok := b.bytes[name]; ok {
		return data, nil
	}
	return nil, errors.New("nothing saved")
}

func (b *installBackupsSpy) Remove(context.Context, string) error { return b.removeErr }

type installStamps struct{}

func (installStamps) Stamp(time.Time) string { return "stamp-1" }

// installCheckStub answers every check of a result with report, and
// records the results checked.
type installCheckStub struct {
	report  contract.CheckReport
	checked [][]definition.Document
}

func (c *installCheckStub) Check(_ context.Context, result []definition.Document) (contract.CheckReport, error) {
	c.checked = append(c.checked, result)
	return c.report, nil
}

func installDoc(kind definition.Kind, name, text string) definition.Document {
	return definition.Document{
		Source: definition.Source{Kind: kind, Name: name, Path: "home/" + string(kind) + "/" + name, SHA256: sha(text)},
		Bytes:  []byte(text),
	}
}

// installerOver installs a folder that replaces home's reviewer and adds a
// prompt, its result checked by check.
func installerOver(check app.InstallCheck) (*app.Installer, *installHomeSpy, *installBackupsSpy) {
	home := &installHomeSpy{docs: []definition.Document{installDoc(definition.KindAgent, "reviewer", "name = \"reviewer\"\n")}}
	backups := &installBackupsSpy{}
	source := installSource{docs: []definition.Document{
		installDoc(definition.KindAgent, "reviewer", "name = \"reviewer\"\n# tuned\n"),
		installDoc(definition.KindPrompt, "house", "Follow the house style.\n"),
	}}
	installer := app.NewInstaller(app.InstallAdapters{Source: source, Home: home, Backups: backups, Clock: fixedClock{}, Stamps: installStamps{}}, check)
	return installer, home, backups
}

func TestInstallerRefusesAResultItsCheckFindsAProblemIn(t *testing.T) {
	t.Parallel()
	check := &installCheckStub{report: contract.CheckReport{
		Problems: []contract.Problem{{Message: "agent reviewer: runtime: is required"}},
		Warnings: []string{"not shown"},
	}}
	installer, home, backups := installerOver(check)

	plan, err := installer.Install(context.Background(), "src", nil)

	var input *contract.InputError
	if !errors.As(err, &input) || !strings.Contains(err.Error(), "would not pass check once src is installed, so nothing was installed") ||
		!strings.Contains(err.Error(), "agent reviewer: runtime: is required") {
		t.Fatalf("err = %v, want the check's problem refusing the install", err)
	}
	if !reflect.DeepEqual(plan, contract.InstallPlan{}) {
		t.Errorf("plan = %+v, want none to confirm", plan)
	}
	if len(check.checked) != 1 || len(check.checked[0]) != 2 {
		t.Errorf("checked = %v; want the result, both documents, checked once", check.checked)
	}
	if len(home.writes) != 0 || len(backups.saved) != 0 {
		t.Errorf("writes = %v, backups = %v; want nothing written", home.writes, backups.saved)
	}
}

func TestInstallerPlansWithTheWarningsItsCheckReports(t *testing.T) {
	t.Parallel()
	warnings := []string{"process p: verification runs with the operator's authority"}
	check := &installCheckStub{report: contract.CheckReport{Warnings: warnings}}
	installer, home, backups := installerOver(check)

	plan, err := installer.Install(context.Background(), "src", nil)
	if err != nil {
		t.Fatal(err)
	}

	if !reflect.DeepEqual(plan.Warnings, warnings) {
		t.Errorf("warnings = %q, want %q", plan.Warnings, warnings)
	}
	if plan.Writes() != 2 {
		t.Errorf("plan = %+v, want the replace and the create to confirm", plan.Documents)
	}
	if len(check.checked) != 1 || len(home.writes) != 0 || len(backups.saved) != 0 {
		t.Errorf("checked = %v, writes = %v, backups = %v; want the result checked once and nothing written before approval",
			check.checked, home.writes, backups.saved)
	}
}

// A plan approved for another folder installs nothing.
func TestInstallerRefusesAPlanApprovedForAnotherSource(t *testing.T) {
	t.Parallel()
	installer, home, backups := installerOver(&installCheckStub{})
	ctx := context.Background()
	plan, err := installer.Install(ctx, "src", nil)
	if err != nil {
		t.Fatal(err)
	}

	_, err = installer.Install(ctx, "elsewhere", &plan)

	var input *contract.InputError
	if !errors.As(err, &input) || err.Error() != "not the plan you confirmed, so nothing was installed: elsewhere" {
		t.Fatalf("err = %v, want the plan for src refused for elsewhere", err)
	}
	if len(home.writes) != 0 || len(backups.saved) != 0 {
		t.Errorf("writes = %v, backups = %v; want nothing written", home.writes, backups.saved)
	}
}

// An install whose older backups cannot be removed is still installed, and
// says how to restore it.
func TestInstallerReturnsTheStampWhenPruningFails(t *testing.T) {
	t.Parallel()
	installer, home, backups := installerOver(&installCheckStub{})
	backups.saved = []string{"s1", "s2", "s3", "s4", "s5"}
	backups.removeErr = errors.New("busy")
	ctx := context.Background()
	plan, err := installer.Install(ctx, "src", nil)
	if err != nil {
		t.Fatal(err)
	}

	result, err := installer.Install(ctx, "src", &plan)

	if !errors.Is(err, backups.removeErr) || !strings.Contains(err.Error(), "installed, but removing older backups failed") {
		t.Fatalf("err = %v, want the prune's failure", err)
	}
	if result.Stamp != "stamp-1" || len(home.writes) != 2 {
		t.Errorf("stamp = %q, writes = %v; want both written and the stamp that restores them", result.Stamp, home.writes)
	}
}

// A restore stopped by a failed write says how far it got, and to run it
// again.
func TestInstallerRestoreStoppedSaysToRunItAgain(t *testing.T) {
	t.Parallel()
	for name, tc := range map[string]struct {
		fail func(*installHomeSpy, error)
		want string
	}{
		"put":    {func(h *installHomeSpy, err error) { h.putErr = err }, "restore stopped after 0 of 2 document(s); run it again"},
		"remove": {func(h *installHomeSpy, err error) { h.removeErr = err }, "restore stopped after 1 of 2 document(s); run it again"},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			home := &installHomeSpy{docs: []definition.Document{
				installDoc(definition.KindAgent, "reviewer", "tuned\n"),
				installDoc(definition.KindPrompt, "house", "house\n"),
			}}
			backups := &installBackupsSpy{
				saved: []string{"stamp-1"},
				manifest: &app.InstallManifest{Stamp: "stamp-1", Documents: []app.InstallManifestEntry{
					{Kind: string(definition.KindAgent), Name: "reviewer", Action: contract.InstallReplace, Before: sha("old\n"), After: sha("tuned\n")},
					{Kind: string(definition.KindPrompt), Name: "house", Action: contract.InstallCreate, After: sha("house\n")},
				}},
				bytes: map[string][]byte{"reviewer": []byte("old\n")},
			}
			installer := app.NewInstaller(app.InstallAdapters{Source: installSource{}, Home: home, Backups: backups, Clock: fixedClock{}, Stamps: installStamps{}}, &installCheckStub{})
			ctx := context.Background()
			plan, err := installer.Restore(ctx, "stamp-1", nil)
			if err != nil {
				t.Fatal(err)
			}
			full := errors.New("disk full")
			tc.fail(home, full)

			_, err = installer.Restore(ctx, "stamp-1", &plan)

			if !errors.Is(err, full) || !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("err = %v, want %q", err, tc.want)
			}
		})
	}
}

// A created document that is not there is unchanged, unless a failed write
// left something in its place: that is planned as a remove, under its own
// path, and removed as the document would be.
func TestInstallerRestoreRemovesWhatAFailedWriteLeft(t *testing.T) {
	t.Parallel()
	home := &installHomeSpy{left: map[string]string{"skills/review": "home/skills/review"}}
	backups := &installBackupsSpy{
		saved: []string{"stamp-1"},
		manifest: &app.InstallManifest{Stamp: "stamp-1", Documents: []app.InstallManifestEntry{
			{Kind: string(definition.KindSkill), Name: "review", Action: contract.InstallCreate, After: sha("review\n")},
			{Kind: string(definition.KindSkill), Name: "style", Action: contract.InstallCreate, After: sha("style\n")},
		}},
	}
	installer := app.NewInstaller(app.InstallAdapters{Source: installSource{}, Home: home, Backups: backups, Clock: fixedClock{}, Stamps: installStamps{}}, &installCheckStub{})
	ctx := context.Background()

	plan, err := installer.Restore(ctx, "stamp-1", nil)

	want := []contract.RestoreDocument{
		{Kind: "skills", Name: "review", Path: "home/skills/review", Action: contract.RestoreRemove},
		{Kind: "skills", Name: "style", Path: "home/skills/style", Action: contract.RestoreUnchanged},
	}
	if err != nil || !reflect.DeepEqual(plan.Documents, want) || len(home.writes) != 0 {
		t.Fatalf("plan %+v, %v, writes %v, want %+v and none", plan.Documents, err, home.writes, want)
	}
	if _, err := installer.Restore(ctx, "stamp-1", &plan); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(home.writes, []string{"Remove skills/review"}) {
		t.Fatalf("writes = %v, want the one remove", home.writes)
	}
}
