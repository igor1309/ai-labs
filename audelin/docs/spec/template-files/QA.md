# Template files — QA

The adapter is tested for real on a temporary folder, never the user's
Application Support; folder opening through a fake of its workspace binding.

## S-1 First listing makes the folder

Drive: list the catalogue for a temp path that does not exist; read back the
folder's files and the listed entries. Evidence: `TemplateFilesTests.firstListingWritesDefaultAndAnExistingFolderIsNeverReplenished` covers Default; Daily shipping remains Missing.

## S-2 An existing folder is not replenished

Drive: make the temp folder with only a Default file; list; read back that no
Daily file was written and no Daily file entry is listed. Evidence: `TemplateFilesTests.anExistingFolderIsNotReplenished` and `firstListingWritesDefaultAndAnExistingFolderIsNeverReplenished`.

## S-4 An unusable file is left as it was

Drive: write an unusable file, list, then compare the file's bytes and modification date with
those written. Evidence: `TemplateFilesTests.brokenFilesAreVisibleUnchangedAndDefaultStillResolves`.

## S-5 An edit is resolved

Drive: resolve Daily, rewrite its file, resolve again; read back the second
instructions equal the new file text. Evidence: `TemplateFilesTests.validFilesAndEditsResolveTheirWholeContract` covers edited Default and custom files; Daily content remains Missing.

## S-6 Built-in Default without usable files

Drive: empty temp folder; resolve Default; read back the built-in
instructions and the four required headings. Evidence: `TemplateFilesTests.firstListingWritesDefaultAndAnExistingFolderIsNeverReplenished`.

## S-7 An unusable Default file stays visible

Drive: write a broken Default file; list; read back an unusable Default
entry with its reason and a usable built-in Default. Evidence: `TemplateFilesTests.brokenFilesAreVisibleUnchangedAndDefaultStillResolves`.

## S-8 A missing chosen template

Drive: list, delete Daily's file, resolve Daily; read back a missing
failure naming Daily, and no instructions. Evidence: `TemplateFilesTests.aMissingOrBrokenChosenTemplateNeverUsesDefault` covers a removed custom file; Daily content remains Missing.

## S-9 A folder that cannot be read

Drive: temp folder with no read permission; list; read back the folder
reason and the built-in Default entry. Evidence: `TemplateFilesTests.unreadableFolderReportsItsReasonAndOffersDefault`.

## S-10 Opening the folder

Drive: fake workspace binding answering success; read back opened and the
path it was given. Evidence: `TemplateFilesTests.openingReportsTheBindingOutcomeAndUsesTheTemplatesFolder` (success).

## S-12 A folder that cannot be opened

Drive: fake workspace binding failing; read back its reason. Evidence: `TemplateFilesTests.openingReportsTheBindingOutcomeAndUsesTheTemplatesFolder` (failure).

## S-11 Shipped Daily asks for a handoff

Drive: resolve the shipped Daily from a fresh folder; read back that its
instructions ask for continuation, owners, blockers, planned fixes and
meetings, agreed versus suggested, unclear owners and fixes, and topics not
discussed. Evidence: Missing.

## S-13 A valid file is resolved

Drive: resolve each of the shipped Default and Daily and a fixture custom
file; read back name, required and optional headings in their order, and
instructions equal to the fixture's. Evidence: `TemplateFilesTests.validFilesAndEditsResolveTheirWholeContract` and `firstListingWritesDefaultAndAnExistingFolderIsNeverReplenished` cover Default and custom files; shipped Daily remains Missing.

## S-15 Unreadable metadata

Drive: fixture with unterminated front matter; list; read back unusable and
a reason naming the metadata. Evidence: `TemplateFilesTests.brokenFilesAreVisibleUnchangedAndDefaultStillResolves`.

## S-16 No required headings

Drive: fixture whose metadata omits required headings; list; read back the
reason. Evidence: `TemplateFilesTests.brokenFilesAreVisibleUnchangedAndDefaultStillResolves`.

## S-17 Empty instructions

Drive: fixture with metadata and an empty body; list; read back the reason.
Evidence: `TemplateFilesTests.brokenFilesAreVisibleUnchangedAndDefaultStillResolves`.
