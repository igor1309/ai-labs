// Package install composes what keeps home's install backups: the
// installs' own, and a retirement's, which is one of them.
package install

import (
	"context"
	"path/filepath"

	"github.com/igor1309/ai-labs/agister/internal/adapters/fsdefs"
	"github.com/igor1309/ai-labs/agister/internal/adapters/system"
	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
)

var _ app.InstallBackups = Backups{}
var _ app.RetireBackups = Backups{}

// Backups keeps install backups in fsdefs' format, its manifest
// translated to and from app's.
type Backups struct{ fsdefs.Backups }

// BackupsOf keeps the install backups of home, under its backups/.
func BackupsOf(home string) Backups {
	return Backups{fsdefs.Backups{Dir: filepath.Join(home, "backups")}}
}

func (b Backups) Save(ctx context.Context, stamp string, manifest app.InstallManifest, saved []definition.Document) error {
	backup := fsdefs.Manifest{Stamp: manifest.Stamp, Source: manifest.Source, Installed: manifest.Installed}
	for _, entry := range manifest.Documents {
		backup.Documents = append(backup.Documents, fsdefs.ManifestEntry(entry))
	}
	return b.Backups.Save(ctx, stamp, backup, saved)
}

func (b Backups) Manifest(ctx context.Context, stamp string) (app.InstallManifest, error) {
	backup, err := b.Backups.Manifest(ctx, stamp)
	if err != nil {
		return app.InstallManifest{}, err
	}
	manifest := app.InstallManifest{Stamp: backup.Stamp, Source: backup.Source, Installed: backup.Installed}
	for _, entry := range backup.Documents {
		manifest.Documents = append(manifest.Documents, app.InstallManifestEntry(entry))
	}
	return manifest, nil
}

// Stamps names install backups, a retirement's too: to the microsecond,
// then a random suffix.
type Stamps = system.IDs

// Retirer retires documents of home's settings store, each backed up
// first under home's backups/ as an install backup, named by Stamps at
// clock's time. afterBackup, when set, is called once the backup is saved,
// before it is read back.
func Retirer(home string, clock app.RetireClock, afterBackup func(stamp string) error) *app.Retirer {
	return app.NewRetirer(app.RetireAdapters{
		Home:        fsdefs.Store{Dir: home},
		Backups:     BackupsOf(home),
		Clock:       clock,
		Stamps:      Stamps{},
		AfterBackup: afterBackup,
	})
}
