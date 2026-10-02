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

// installHomeSpy is home's settings in memory; it records what is staged
// and written.
type installHomeSpy struct {
	docs   []definition.Document
	staged [][]definition.Document
	writes []string
}

func (h *installHomeSpy) Documents(context.Context) ([]definition.Document, error) {
	return h.docs, nil
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

func (h *installHomeSpy) Stage(_ context.Context, docs []definition.Document) (app.InstallSettings, func(), error) {
	h.staged = append(h.staged, docs)
	return nil, func() {}, nil
}

func (h *installHomeSpy) Lock(context.Context) (func(), error) { return func() {}, nil }

func (h *installHomeSpy) Put(_ context.Context, kind definition.Kind, name string, _ []byte) error {
	h.writes = append(h.writes, "Put "+string(kind)+"/"+name)
	return nil
}

func (h *installHomeSpy) Remove(_ context.Context, kind definition.Kind, name string) error {
	h.writes = append(h.writes, "Remove "+string(kind)+"/"+name)
	return nil
}

// installBackupsSpy records the backups saved.
type installBackupsSpy struct{ saved []string }

func (b *installBackupsSpy) Save(_ context.Context, stamp string, _ app.InstallManifest, _ []definition.Document) error {
	b.saved = append(b.saved, stamp)
	return nil
}

func (b *installBackupsSpy) List(context.Context) ([]string, error) { return b.saved, nil }

func (b *installBackupsSpy) Manifest(context.Context, string) (app.InstallManifest, error) {
	return app.InstallManifest{}, errors.New("no manifest")
}

func (b *installBackupsSpy) Saved(context.Context, string, definition.Kind, string) ([]byte, error) {
	return nil, errors.New("nothing saved")
}

func (b *installBackupsSpy) Remove(context.Context, string) error { return nil }

type installStamps struct{}

func (installStamps) Stamp(time.Time) string { return "stamp-1" }

// installCheckStub answers every check of a staged result with report.
type installCheckStub struct {
	report contract.CheckReport
	checks int
}

func (c *installCheckStub) Check(context.Context, app.InstallStaged) (contract.CheckReport, error) {
	c.checks++
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
	if check.checks != 1 || len(home.staged) != 1 || len(home.staged[0]) != 2 {
		t.Errorf("checks = %d, staged = %v; want the result, both documents, checked once", check.checks, home.staged)
	}
	if len(home.writes) != 0 || len(backups.saved) != 0 {
		t.Errorf("writes = %v, backups = %v; want nothing written", home.writes, backups.saved)
	}
}

func TestInstallerPlansWithTheWarningsItsCheckReports(t *testing.T) {
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
	if check.checks != 1 || len(home.writes) != 0 || len(backups.saved) != 0 {
		t.Errorf("checks = %d, writes = %v, backups = %v; want the result checked once and nothing written before approval",
			check.checks, home.writes, backups.saved)
	}
}
