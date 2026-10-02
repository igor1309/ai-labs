package main

import (
	"context"

	"github.com/igor1309/ai-labs/agister/internal/adapters/fsdefs"
	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
)

var _ app.InstallHome = installHome{}
var _ app.InstallBackups = installBackups{}

// installHome is home's settings store as installs take it: its stages
// read as app's staged settings.
type installHome struct{ fsdefs.Store }

func (h installHome) Stage(ctx context.Context, docs []definition.Document) (app.InstallSettings, func(), error) {
	staged, remove, err := h.Store.Stage(ctx, docs)
	if err != nil {
		return nil, nil, err
	}
	return staged, remove, nil
}

// installBackups keeps install backups in fsdefs' format, its manifest
// translated to and from app's.
type installBackups struct{ fsdefs.Backups }

func (b installBackups) Save(ctx context.Context, stamp string, manifest app.InstallManifest, saved []definition.Document) error {
	backup := fsdefs.Manifest{Stamp: manifest.Stamp, Source: manifest.Source, Installed: manifest.Installed}
	for _, entry := range manifest.Documents {
		backup.Documents = append(backup.Documents, fsdefs.ManifestEntry(entry))
	}
	return b.Backups.Save(ctx, stamp, backup, saved)
}

func (b installBackups) Manifest(ctx context.Context, stamp string) (app.InstallManifest, error) {
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
