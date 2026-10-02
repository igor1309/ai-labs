package app

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"slices"
	"sort"
	"strings"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/contract"
	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
)

// keepBackups is how many install backups are kept (ADR-016 rule 7).
const keepBackups = 5

// Installer merges a folder of settings into home's, and undoes one such
// install from its backup (ADR-016).
type Installer struct {
	source      InstallSource
	home        InstallHome
	backups     InstallBackups
	clock       InstallClock
	stamps      InstallStamps
	beforeWrite func(path string) error
	check       InstallCheck
}

// InstallSource reads the folder installed into home.
type InstallSource interface {
	// Source reads the settings documents of the folder dir, laid out like
	// home, and names its files that are not settings documents. A symbolic
	// link in it, or a path that leaves it, is an error.
	Source(ctx context.Context, dir string) (docs []definition.Document, ignored []string, err error)
}

// InstallHome is home's settings store.
type InstallHome interface {
	// Documents reads every settings document in home.
	Documents(ctx context.Context) ([]definition.Document, error)
	Read(ctx context.Context, kind definition.Kind, name string) (definition.Document, error)
	// Current reports where a document would be stored and a digest of the
	// one there, empty when there is none.
	Current(ctx context.Context, kind definition.Kind, name string) (path, digest string, err error)
	// Stage writes docs into a new temporary folder laid out like home, and
	// returns its settings, read as home's would be, and the folder's
	// removal.
	Stage(ctx context.Context, docs []definition.Document) (staged InstallSettings, remove func(), err error)
	// Lock takes the write lock every writer of home's settings takes, and
	// returns its release.
	Lock(ctx context.Context) (unlock func(), err error)
	// Put writes data as the document, atomically. Only under the lock.
	Put(ctx context.Context, kind definition.Kind, name string, data []byte) error
	// Remove removes the document; none there is no error. Only under the
	// lock.
	Remove(ctx context.Context, kind definition.Kind, name string) error
}

// InstallSettings are staged settings, as check reads them.
type InstallSettings interface {
	Read(ctx context.Context, kind definition.Kind, name string) (definition.Document, error)
	List(ctx context.Context, kind definition.Kind) ([]string, error)
}

// InstallStaged is an install's result, staged in a folder of its own.
type InstallStaged struct{ InstallSettings }

// InstallCheck checks an install's staged result as global settings alone.
type InstallCheck interface {
	Check(ctx context.Context, staged InstallStaged) (contract.CheckReport, error)
}

// InstallBackups keeps one backup per install, by its stamp.
type InstallBackups interface {
	// Save records a backup: the bytes of each document saved, then the
	// manifest. It never writes over another backup.
	Save(ctx context.Context, stamp string, manifest InstallManifest, saved []definition.Document) error
	// List names the backups kept.
	List(ctx context.Context) ([]string, error)
	Manifest(ctx context.Context, stamp string) (InstallManifest, error)
	// Saved reads the bytes the backup keeps of a document.
	Saved(ctx context.Context, stamp string, kind definition.Kind, name string) ([]byte, error)
	Remove(ctx context.Context, stamp string) error
}

// InstallClock tells the time of an install.
type InstallClock interface{ Now() time.Time }

// InstallStamps names an install's backup: unique, and in the order of
// the times they are made at.
type InstallStamps interface {
	Stamp(now time.Time) string
}

// InstallAdapters are what an Installer runs on.
type InstallAdapters struct {
	Source  InstallSource
	Home    InstallHome
	Backups InstallBackups
	Clock   InstallClock
	Stamps  InstallStamps
	// BeforeWrite, when set, is called before each document an install
	// writes, after its backup; an error stops the install there.
	BeforeWrite func(path string) error
}

// InstallManifest records what one install changes, before it changes
// anything, so a restore can undo it even where it stopped halfway.
type InstallManifest struct {
	Stamp     string
	Source    string
	Installed time.Time
	Documents []InstallManifestEntry
}

// InstallManifestEntry is one document an install creates or replaces.
type InstallManifestEntry struct {
	Path   string
	Kind   string
	Name   string
	Action string // create | replace
	Before string // digest; empty for a create
	After  string // digest
}

// NewInstaller returns the use case that installs folders of settings
// into home. check checks the staged result of each.
func NewInstaller(adapters InstallAdapters, check InstallCheck) *Installer {
	return &Installer{
		source: adapters.Source, home: adapters.Home, backups: adapters.Backups, clock: adapters.Clock, stamps: adapters.Stamps,
		beforeWrite: adapters.BeforeWrite, check: check,
	}
}

// installWrite is one document an install writes.
type installWrite struct {
	doc     definition.Document // the source's
	path    string              // in home
	action  string
	current *definition.Document // home's, for a replace
}

func (i *Installer) Install(ctx context.Context, source string, approved *contract.InstallPlan) (contract.InstallPlan, error) {
	if approved == nil {
		plan, _, err := i.plan(ctx, source)
		return plan, err
	}
	// Planned again under the lock, which every writer of home's settings
	// takes, so what is compared with the approved plan is what is written.
	unlock, err := i.home.Lock(ctx)
	if err != nil {
		return contract.InstallPlan{}, err
	}
	defer unlock()
	plan, writes, err := i.plan(ctx, source)
	if err != nil {
		return contract.InstallPlan{}, err
	}
	if err := installApproved(*approved, plan); err != nil {
		return contract.InstallPlan{}, err
	}
	if len(writes) == 0 {
		return plan, nil
	}
	now := i.clock.Now()
	stamp := i.stamps.Stamp(now)
	manifest := InstallManifest{Stamp: stamp, Source: source, Installed: now}
	var saved []definition.Document
	for _, w := range writes {
		entry := InstallManifestEntry{Path: w.path, Kind: string(w.doc.Source.Kind), Name: w.doc.Source.Name, Action: w.action, After: w.doc.Source.SHA256}
		if w.current != nil {
			entry.Before = w.current.Source.SHA256
			saved = append(saved, *w.current)
		}
		manifest.Documents = append(manifest.Documents, entry)
	}
	if err := i.backups.Save(ctx, stamp, manifest, saved); err != nil {
		return contract.InstallPlan{}, fmt.Errorf("backing up home's settings failed, so nothing was installed: %w", err)
	}
	plan.Stamp = stamp
	write := func(w installWrite) error {
		if i.beforeWrite != nil {
			if err := i.beforeWrite(w.path); err != nil {
				return err
			}
		}
		return i.home.Put(ctx, w.doc.Source.Kind, w.doc.Source.Name, w.doc.Bytes)
	}
	for n, w := range writes {
		if err := write(w); err != nil {
			return plan, fmt.Errorf("install stopped after %d of %d document(s), before %s: %w", n, len(writes), w.path, err)
		}
	}
	if err := i.prune(ctx); err != nil {
		return plan, fmt.Errorf("installed, but removing older backups failed: %w", err)
	}
	return plan, nil
}

// plan reads the source and home's settings and plans each source document
// against home's. When it writes anything, the result is checked on a
// staged copy: a problem refuses it, and warnings are the plan's.
func (i *Installer) plan(ctx context.Context, source string) (contract.InstallPlan, []installWrite, error) {
	plan := contract.InstallPlan{Source: source, Inventory: map[string]string{}}
	docs, ignored, err := i.source.Source(ctx, source)
	if err != nil {
		return contract.InstallPlan{}, nil, err
	}
	plan.Ignored = ignored
	present, err := i.home.Documents(ctx)
	if err != nil {
		return contract.InstallPlan{}, nil, err
	}
	type key struct {
		kind definition.Kind
		name string
	}
	inHome := map[key]*definition.Document{}
	for n := range present {
		doc := &present[n]
		inHome[key{doc.Source.Kind, doc.Source.Name}] = doc
		plan.Inventory[doc.Source.Path] = doc.Source.SHA256
	}
	inSource := map[key]bool{}
	var writes []installWrite
	for _, doc := range docs {
		doc.Source.SHA256 = digestOf(doc.Bytes)
		k := key{doc.Source.Kind, doc.Source.Name}
		inSource[k] = true
		current := inHome[k]
		entry := contract.InstallDocument{Kind: string(k.kind), Name: k.name, After: doc.Source.SHA256}
		switch {
		case current == nil:
			if entry.Path, _, err = i.home.Current(ctx, k.kind, k.name); err != nil {
				return contract.InstallPlan{}, nil, err
			}
			entry.Action = contract.InstallCreate
		case current.Source.SHA256 == entry.After:
			entry.Path, entry.Before, entry.Action = current.Source.Path, current.Source.SHA256, contract.InstallUnchanged
		default:
			entry.Path, entry.Before, entry.Action = current.Source.Path, current.Source.SHA256, contract.InstallReplace
			entry.Diff = unifiedDiff(current.Source.Path, doc.Source.Path, current.Bytes, doc.Bytes)
		}
		plan.Documents = append(plan.Documents, entry)
		if entry.Action != contract.InstallUnchanged {
			writes = append(writes, installWrite{doc: doc, path: entry.Path, action: entry.Action, current: current})
		}
	}
	for _, doc := range present {
		if !inSource[key{doc.Source.Kind, doc.Source.Name}] {
			plan.Kept = append(plan.Kept, doc.Source.Path)
		}
	}
	sort.Slice(plan.Documents, func(a, b int) bool { return plan.Documents[a].Path < plan.Documents[b].Path })
	sort.Slice(writes, func(a, b int) bool { return writes[a].path < writes[b].path })
	sort.Strings(plan.Kept)
	if len(writes) == 0 {
		return plan, nil, nil
	}
	// The result: home's settings with the source's written over them.
	result := make([]definition.Document, 0, len(present)+len(writes))
	for _, doc := range present {
		if !inSource[key{doc.Source.Kind, doc.Source.Name}] {
			result = append(result, doc)
		}
	}
	for _, doc := range docs {
		result = append(result, doc)
	}
	report, err := i.checkStaged(ctx, result)
	if err != nil {
		return contract.InstallPlan{}, nil, err
	}
	if len(report.Problems) > 0 {
		problems := translated(report.Problems, func(problem contract.Problem) string { return problem.Message })
		return contract.InstallPlan{}, nil, &contract.InputError{Message: fmt.Sprintf("home's settings would not pass check once %s is installed, so nothing was installed:\n  %s", source, strings.Join(problems, "\n  "))}
	}
	plan.Warnings = report.Warnings
	return plan, writes, nil
}

// checkStaged checks docs as global settings alone, staged in a folder of
// their own.
func (i *Installer) checkStaged(ctx context.Context, docs []definition.Document) (contract.CheckReport, error) {
	staged, remove, err := i.home.Stage(ctx, docs)
	if err != nil {
		return contract.CheckReport{}, err
	}
	defer remove()
	return i.check.Check(ctx, InstallStaged{staged})
}

// installApproved refuses a plan other than the one approved: home's
// settings or the source's documents changed since, or another folder.
func installApproved(approved, plan contract.InstallPlan) error {
	if approved.Source != plan.Source {
		return &contract.InputError{Message: fmt.Sprintf("not the plan you confirmed, so nothing was installed: %s", plan.Source)}
	}
	changed := map[string]bool{}
	for path, digest := range approved.Inventory {
		if current, ok := plan.Inventory[path]; !ok || current != digest {
			changed[path] = true
		}
	}
	for path := range plan.Inventory {
		if _, ok := approved.Inventory[path]; !ok {
			changed[path] = true
		}
	}
	documents := func(p contract.InstallPlan) map[string]contract.InstallDocument {
		m := map[string]contract.InstallDocument{}
		for _, doc := range p.Documents {
			doc.Diff = ""
			m[doc.Path] = doc
		}
		return m
	}
	want, got := documents(approved), documents(plan)
	for path, doc := range want {
		if got[path] != doc {
			changed[path] = true
		}
	}
	for path := range got {
		if _, ok := want[path]; !ok {
			changed[path] = true
		}
	}
	if len(changed) > 0 {
		paths := make([]string, 0, len(changed))
		for path := range changed {
			paths = append(paths, path)
		}
		sort.Strings(paths)
		return &contract.InputError{Message: fmt.Sprintf("changed since you confirmed, so nothing was installed: %s", strings.Join(paths, ", "))}
	}
	return nil
}

// prune removes all but the newest backups kept.
func (i *Installer) prune(ctx context.Context) error {
	stamps, err := i.backups.List(ctx)
	if err != nil {
		return err
	}
	sort.Strings(stamps)
	for len(stamps) > keepBackups {
		if err := i.backups.Remove(ctx, stamps[0]); err != nil {
			return err
		}
		stamps = stamps[1:]
	}
	return nil
}

// restoreStep is one document a restore puts back or removes.
type restoreStep struct {
	kind   definition.Kind
	name   string
	action string
	data   []byte // put back
}

func (i *Installer) Restore(ctx context.Context, stamp string, approved *contract.RestorePlan) (contract.RestorePlan, error) {
	if approved == nil {
		plan, _, err := i.restorePlan(ctx, stamp)
		return plan, err
	}
	unlock, err := i.home.Lock(ctx)
	if err != nil {
		return contract.RestorePlan{}, err
	}
	defer unlock()
	plan, steps, err := i.restorePlan(ctx, stamp)
	if err != nil {
		return contract.RestorePlan{}, err
	}
	if err := restoreApproved(*approved, plan); err != nil {
		return contract.RestorePlan{}, err
	}
	for n, step := range steps {
		if step.action == contract.RestorePutBack {
			err = i.home.Put(ctx, step.kind, step.name, step.data)
		} else {
			err = i.home.Remove(ctx, step.kind, step.name)
		}
		if err != nil {
			return plan, fmt.Errorf("restore stopped after %d of %d document(s); run it again: %w", n, len(steps), err)
		}
	}
	return plan, nil
}

// restorePlan plans, from the backup's manifest, putting back each document
// the install replaced and removing each it created; one already as it was
// before the install is unchanged.
func (i *Installer) restorePlan(ctx context.Context, stamp string) (contract.RestorePlan, []restoreStep, error) {
	stamps, err := i.backups.List(ctx)
	if err != nil {
		return contract.RestorePlan{}, nil, err
	}
	if !slices.Contains(stamps, stamp) {
		sort.Strings(stamps)
		return contract.RestorePlan{}, nil, &contract.InputError{Message: fmt.Sprintf("no install backup %q (kept: %s)", stamp, or(strings.Join(stamps, ", "), "none"))}
	}
	manifest, err := i.backups.Manifest(ctx, stamp)
	if err != nil {
		return contract.RestorePlan{}, nil, fmt.Errorf("install backup %s: %w", stamp, err)
	}
	plan := contract.RestorePlan{Stamp: stamp}
	var steps []restoreStep
	for _, entry := range manifest.Documents {
		kind := definition.Kind(entry.Kind)
		path, current, err := i.home.Current(ctx, kind, entry.Name)
		if err != nil {
			return contract.RestorePlan{}, nil, err
		}
		doc := contract.RestoreDocument{Kind: entry.Kind, Name: entry.Name, Path: path, Current: current, Action: contract.RestoreUnchanged}
		switch entry.Action {
		case contract.InstallReplace:
			data, err := i.backups.Saved(ctx, stamp, kind, entry.Name)
			if err != nil {
				return contract.RestorePlan{}, nil, fmt.Errorf("install backup %s: reading %s as it was before the install: %w", stamp, path, err)
			}
			if digestOf(data) != entry.Before {
				return contract.RestorePlan{}, nil, fmt.Errorf("install backup %s does not hold %s as it was before the install: its digest differs", stamp, path)
			}
			if current == entry.Before {
				break
			}
			var now []byte
			if current != "" {
				home, err := i.home.Read(ctx, kind, entry.Name)
				if err != nil {
					return contract.RestorePlan{}, nil, err
				}
				now = home.Bytes
			}
			doc.Action, doc.Diff = contract.RestorePutBack, unifiedDiff(path, path+" (before install "+stamp+")", now, data)
			steps = append(steps, restoreStep{kind: kind, name: entry.Name, action: doc.Action, data: data})
		case contract.InstallCreate:
			if current == "" {
				break
			}
			doc.Action = contract.RestoreRemove
			steps = append(steps, restoreStep{kind: kind, name: entry.Name, action: doc.Action})
		default:
			return contract.RestorePlan{}, nil, fmt.Errorf("install backup %s: unknown action %q for %s", stamp, entry.Action, path)
		}
		plan.Documents = append(plan.Documents, doc)
	}
	return plan, steps, nil
}

// restoreApproved refuses a restore other than the one approved: a document
// it touches changed since, or another backup.
func restoreApproved(approved, plan contract.RestorePlan) error {
	if approved.Stamp != plan.Stamp || len(approved.Documents) != len(plan.Documents) {
		return &contract.InputError{Message: fmt.Sprintf("not the plan you confirmed, so nothing was restored: %s", plan.Stamp)}
	}
	var changed []string
	for n, doc := range plan.Documents {
		want := approved.Documents[n]
		if want.Path != doc.Path || want.Current != doc.Current || want.Action != doc.Action {
			changed = append(changed, doc.Path)
		}
	}
	if len(changed) > 0 {
		return &contract.InputError{Message: fmt.Sprintf("changed since you confirmed, so nothing was restored: %s", strings.Join(changed, ", "))}
	}
	return nil
}

func digestOf(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}
