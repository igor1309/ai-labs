package app

import (
	"context"
	"encoding/hex"
	"fmt"
	"slices"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/contract"
	"github.com/igor1309/ai-labs/agister/internal/domain/document"
)

// Retirer removes documents of home's settings: the explicit deletion an
// install never makes (ADR-016 rule 8). Each is backed up first as an
// install backup of its own, which records it as replaced by nothing, so
// `install --restore` puts it back. Nothing is removed until that backup
// has been read back as a restore reads it.
type Retirer struct {
	home        RetireHome
	backups     RetireBackups
	clock       RetireClock
	stamps      RetireStamps
	afterBackup func(stamp string) error
}

// RetireHome is home's settings store.
type RetireHome interface {
	// Lock takes the write lock every writer of home's settings takes, and
	// returns its release.
	Lock(ctx context.Context) (unlock func(), err error)
	// Current reports where a document is stored and a digest of the one
	// there, empty when there is none.
	Current(ctx context.Context, kind document.Kind, name string) (path, digest string, err error)
	// File reads the bytes home's own file of the document holds.
	File(ctx context.Context, kind document.Kind, name string) ([]byte, error)
	// Remove removes the document. Only under the lock.
	Remove(ctx context.Context, kind document.Kind, name string) error
}

// RetireBackups keeps the backups installs keep, in their format.
type RetireBackups interface {
	// Save records a backup: the bytes of each document saved, then the
	// manifest. It never writes over another backup.
	Save(ctx context.Context, stamp string, manifest InstallManifest, saved []document.Document) error
	Manifest(ctx context.Context, stamp string) (InstallManifest, error)
	// Saved reads the bytes the backup keeps of a document.
	Saved(ctx context.Context, stamp string, kind document.Kind, name string) ([]byte, error)
	Remove(ctx context.Context, stamp string) error
}

// RetireClock tells the time of a retirement.
type RetireClock interface{ Now() time.Time }

// RetireStamps names a retirement's backup as installs name theirs, so it
// sorts with them by time and is kept, or pruned, in its turn.
type RetireStamps interface {
	Stamp(now time.Time) string
}

// RetireAdapters are what a Retirer runs on.
type RetireAdapters struct {
	Home    RetireHome
	Backups RetireBackups
	Clock   RetireClock
	Stamps  RetireStamps
	// AfterBackup, when set, is called once the backup is saved, before it
	// is read back; an error stops the retirement there, the backup
	// removed and nothing retired.
	AfterBackup func(stamp string) error
}

// NewRetirer returns the use case that retires documents of home's
// settings.
func NewRetirer(adapters RetireAdapters) *Retirer {
	return &Retirer{home: adapters.Home, backups: adapters.Backups, clock: adapters.Clock, stamps: adapters.Stamps, afterBackup: adapters.AfterBackup}
}

// RetireDocument is a document of home's settings a retirement removes.
type RetireDocument struct {
	Kind document.Kind
	Name string
}

// Retired is what a retirement did: the stamp of its backup and the paths
// it removed, in the order asked. Both are empty when home held none of
// the documents.
type Retired struct {
	Stamp   string
	Removed []string
}

// Retire backs up and removes those of docs home holds, under home's
// write lock. source names the retirement in its backup's manifest. The
// backup is read back before anything is removed: its manifest must
// record each document as saved, from a SHA-256 digest, and the bytes it
// keeps of each must have that digest. A backup that fails is removed,
// and nothing is retired.
func (r *Retirer) Retire(ctx context.Context, source string, docs []RetireDocument) (Retired, error) {
	unlock, err := r.home.Lock(ctx)
	if err != nil {
		return Retired{}, err
	}
	defer unlock()
	var held []RetireDocument
	var saved []document.Document
	var entries []InstallManifestEntry
	for _, doc := range docs {
		path, current, err := r.home.Current(ctx, doc.Kind, doc.Name)
		if err != nil {
			return Retired{}, err
		}
		if current == "" {
			continue
		}
		data, err := r.home.File(ctx, doc.Kind, doc.Name)
		if err != nil {
			return Retired{}, err
		}
		before := digestOf(data)
		held = append(held, doc)
		saved = append(saved, document.Document{Source: document.Source{Kind: doc.Kind, Name: doc.Name, Path: path, SHA256: before}, Bytes: data})
		entries = append(entries, InstallManifestEntry{Path: path, Kind: string(doc.Kind), Name: doc.Name, Action: contract.InstallReplace, Before: before})
	}
	if len(held) == 0 {
		return Retired{}, nil
	}
	now := r.clock.Now()
	stamp := r.stamps.Stamp(now)
	manifest := InstallManifest{Stamp: stamp, Source: source, Installed: now, Documents: entries}
	if err := r.backups.Save(ctx, stamp, manifest, saved); err != nil {
		return Retired{}, fmt.Errorf("backing up home's settings failed, so nothing was retired: %w", err)
	}
	if err := r.backedUp(ctx, manifest); err != nil {
		if removeErr := r.backups.Remove(ctx, stamp); removeErr != nil {
			return Retired{}, fmt.Errorf("%w, so nothing was retired; removing the backup failed too: %v", err, removeErr)
		}
		return Retired{}, fmt.Errorf("%w, so nothing was retired", err)
	}
	retired := Retired{Stamp: stamp}
	for n, doc := range held {
		if err := r.home.Remove(ctx, doc.Kind, doc.Name); err != nil {
			return retired, fmt.Errorf("retirement stopped after %d of %d document(s), before %s; install --restore %s puts them back: %w", n, len(held), entries[n].Path, stamp, err)
		}
		retired.Removed = append(retired.Removed, entries[n].Path)
	}
	return retired, nil
}

// backedUp reads the backup of manifest back as a restore reads it, and
// refuses it unless it holds what manifest records.
func (r *Retirer) backedUp(ctx context.Context, manifest InstallManifest) error {
	if r.afterBackup != nil {
		if err := r.afterBackup(manifest.Stamp); err != nil {
			return err
		}
	}
	read, err := r.backups.Manifest(ctx, manifest.Stamp)
	if err != nil {
		return fmt.Errorf("install backup %s: %w", manifest.Stamp, err)
	}
	for _, entry := range read.Documents {
		if !sha256Digest(entry.Before) {
			return fmt.Errorf("install backup %s records %s from no SHA-256 digest: %q", manifest.Stamp, entry.Path, entry.Before)
		}
	}
	if read.Stamp != manifest.Stamp || !slices.Equal(read.Documents, manifest.Documents) {
		return fmt.Errorf("install backup %s does not record what was backed up", manifest.Stamp)
	}
	for _, entry := range read.Documents {
		if _, err := savedBefore(ctx, r.backups, manifest.Stamp, entry, entry.Path); err != nil {
			return err
		}
	}
	return nil
}

// sha256Digest reports whether digest is one digestOf gives.
func sha256Digest(digest string) bool {
	data, err := hex.DecodeString(digest)
	return err == nil && len(data) == 32 && hex.EncodeToString(data) == digest
}
