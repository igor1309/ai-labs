package app_test

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
)

// retireBackups keeps one backup in memory, as saved, and records the
// backups removed.
type retireBackups struct {
	manifest app.InstallManifest
	saved    map[string][]byte
	removed  []string
}

func (b *retireBackups) Save(_ context.Context, _ string, manifest app.InstallManifest, saved []definition.Document) error {
	b.manifest, b.saved = manifest, map[string][]byte{}
	for _, doc := range saved {
		b.saved[doc.Source.Name] = doc.Bytes
	}
	return nil
}

func (b *retireBackups) Manifest(context.Context, string) (app.InstallManifest, error) {
	return b.manifest, nil
}

func (b *retireBackups) Saved(_ context.Context, _ string, _ definition.Kind, name string) ([]byte, error) {
	return b.saved[name], nil
}

func (b *retireBackups) Remove(_ context.Context, stamp string) error {
	b.removed = append(b.removed, stamp)
	return nil
}

// A retirement that stops removing keeps its backup, and says which
// restores what it removed.
func TestRetirerStoppedSaysWhichBackupRestores(t *testing.T) {
	t.Parallel()
	home := &installHomeSpy{
		docs: []definition.Document{
			installDoc(definition.KindProcess, "implement_codex", "name: implement_codex\n"),
			installDoc(definition.KindProcess, "implement_pi", "name: implement_pi\n"),
		},
		removeErr: errors.New("disk full"),
	}
	backups := &retireBackups{}
	retirer := app.NewRetirer(app.RetireAdapters{Home: home, Backups: backups, Clock: fixedClock{}, Stamps: installStamps{}})

	done, err := retirer.Retire(context.Background(), "retirement", []app.RetireDocument{
		{Kind: definition.KindProcess, Name: "implement_codex"},
		{Kind: definition.KindProcess, Name: "implement_pi"},
		{Kind: definition.KindProcess, Name: "implement_pi_glm"},
	})
	if err == nil || !strings.Contains(err.Error(), "after 0 of 2 document(s)") || !strings.Contains(err.Error(), "install --restore stamp-1") {
		t.Fatalf("retirement: %v, want stopped, naming the backup that restores", err)
	}
	if done.Stamp != "stamp-1" || len(done.Removed) != 0 || len(backups.removed) != 0 {
		t.Errorf("retirement: %+v, backups removed %v; want its backup kept and nothing removed", done, backups.removed)
	}
	if len(backups.manifest.Documents) != 2 || string(backups.saved["implement_pi"]) != "name: implement_pi\n" {
		t.Errorf("backup %+v, want the two home holds", backups.manifest)
	}
}
