package main

import (
	"context"

	"github.com/igor1309/ai-labs/agister/internal/adapters/fsdefs"
	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
)

var _ app.InstallStager = installStager{}
var _ app.InstallBackups = installBackups{}

// installStager stages an install's result as home's settings store does,
// its stages read as app's settings.
type installStager struct{ fsdefs.Store }

func (s installStager) Stage(ctx context.Context, docs []definition.Document) (app.GateDefinitions, func(), error) {
	staged, remove, err := s.Store.Stage(ctx, docs)
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
