# ADR-016: Settings are installed into home with a backup

- **Status:** Accepted
- **Date:** 2026-10-02
- **Scope:** how a folder of settings, such as a repository's `.agister`,
  is installed into Agister's home
- **Decision type:** Architecture

## Context

Agister's home holds the global settings next to live state: `runs/`,
`logs/` and `locks/`. Moving a repository's settings into home has been
done by hand: copy, make a backup by hand, and find out afterwards
whether the installed binary accepts the result. Nothing showed what
would change, and going back meant finding the backup by hand.

`agister init` already installs files safely in one respect: it shows
what it would create or replace, asks for yes, and writes only if every
file still has the digest it had when it was shown.

Tools that solve this problem converge on a few practices: apply exactly
the plan that was reviewed, check the whole result with the real binary
before it goes live, write each file atomically, record a backup before
changing anything, and delete only what was recorded as owned.

## Decision drivers

- What is written is exactly what was shown and checked.
- Settings that fail the installed binary's check never reach home.
- An install can be undone while its backup is kept, even one that
  stopped halfway.
- Nothing in home is lost: no live state is touched, and no settings
  document that only home has is removed.

## Decision

`agister install <dir>` merges a folder of settings into home, document
by document. It shows the plan with a diff, checks the result in a
staged copy, asks for yes, then backs up and writes. `agister install
--restore <stamp>` undoes one install.

## Rules

### 1. Only settings are installed

The installed files are the settings documents Agister knows, by kind
and extension, as the store lists them. Live state is never read, copied,
backed up or restored. A file of the source folder that is not a settings
document is reported and not installed; a symbolic link, or a path that
leaves the folder, refuses the install.

### 2. The plan is per document, and identical documents are skipped

Each source document is planned as **create** (home has none), **replace**
(home's differs) or **unchanged** (identical bytes, nothing to do). A
replace shows a unified diff. A document only home has is kept and
listed. If nothing is created or replaced, install ends without writing,
staging or backing up anything.

### 3. The whole result is checked before it goes live

The plan is applied to a staged copy of home's settings in a temporary
directory, without live state, and this binary's `check` runs on it as
global settings, with no project settings. A problem refuses the install;
warnings are shown with the plan.

### 4. The yes binds the plan

As with `init`, the plan carries the inventory of home's settings
documents that were staged, with the digest of each, and the digest of
every source document it will write. After yes, install takes the store's
write lock, and refuses if that inventory changed (a document added,
removed or changed, a planned path included), without writing anything. It writes the bytes that
were shown and checked; it never plans again silently.

### 5. The backup is recorded before anything changes

Under `backups/<stamp>/` in home, install first writes the bytes of every
document it will replace and a manifest: for each planned path, its
action, its digest before and the digest it will have after. Only then
does it write the documents, each atomically: a temporary file in the
same folder, synced, then renamed into place.

### 6. Restore undoes one install from its manifest

`install --restore <stamp>` puts back each replaced document's bytes and
removes each document the install created, from the manifest. It shows
its plan and asks for yes like install. Because the manifest exists before
the first write, a restore also undoes an install that stopped halfway.

### 7. Backups are bounded

Install keeps the last five backups and removes older ones. After every
install it prints the command that restores it.

### 8. Nothing is deleted except by restore

Install never deletes a settings document. Restore deletes only documents
its manifest records as created by that install.

### 9. Install and restore are not refused by broken settings

Like `init`, they do not run behind the check that refuses every other
command, so a home whose settings fail check can still be repaired or
restored.

## Consequences

- A repository's settings can be made global in one command, with a diff,
  a check by the installed binary, and a way back.
- Home gains `backups/`, a folder of state that is not settings.
- An install can no longer be restored once its backup is removed, after
  five later installs.
- An install is not one atomic switch: until it ends, a reader may see
  some documents new and some old. The manifest makes any such state
  restorable.
- What a repository means only for itself, such as its
  `verifies/repo.yaml`, becomes global if installed; the plan shows it.

## Alternatives considered

- **Mirror the folder** (home's settings become exactly the source,
  deletions included). Rejected: it deletes documents only home has, and
  inferring what to delete is the failure mode tools such as `kubectl
  apply --prune` had to fix with a recorded inventory.
- **Settings generations** (each install a new folder, switched by an
  atomic link, rolled back by switching back). Rejected for now: truly
  atomic, but every reader of home would change and existing homes would
  need migrating.

## Explicit non-decisions

Removing documents only home has (a prune, which would delete only what a
recorded earlier install created); installing a selection of a folder's
documents; checking the result composed with the source repository's own
settings; a restore that refuses where a document changed after the
install; settings generations.
