# Template files — QA

The adapter is tested for real on a temporary folder, never the user's
Application Support; folder opening through a fake of its workspace binding.

## S-1 First listing makes the folder

Drive: list the catalogue for a temp path that does not exist; read back the
folder's files and the listed entries. Evidence: `TemplateFilesTests.firstListingWritesDefaultAndDailyAndAnExistingFolderIsNeverReplenished` covers both shipped files.

## S-2 An existing folder is not replenished

Drive: make an empty temp folder or one with only a Default file; list; read back that no
Daily file was written and no Daily file entry is listed. Evidence: `TemplateFilesTests.anExistingFolderIsNotReplenished` and `firstListingWritesDefaultAndDailyAndAnExistingFolderIsNeverReplenished`.

## S-4 An unusable file is left as it was

Drive: write an unusable file, list, then compare the file's bytes and modification date with
those written. Evidence: `TemplateFilesTests.brokenFilesAreVisibleUnchangedAndDefaultStillResolves`.

Names rejected by resolution are listed with the same reason, with the file
unchanged and built-in Default available:
`TemplateFilesTests.rejectedNamesAreListedWithTheirReasonAndBuiltInDefault`
covers empty, dot, dot-dot and backslash names in a temporary folder.

## S-5 An edit is resolved

Drive: resolve Daily, rewrite its file, resolve again; read back the second
instructions equal the new file text. Evidence: `TemplateFilesTests.validFilesAndEditsResolveTheirWholeContract` covers edited Default, Daily and custom files; `shippedDailyResolvesTheHandoffContract` covers editing the shipped Daily instructions and headings.

## S-6 Built-in Default without usable files

Drive: empty temp folder; resolve Default; read back the built-in
instructions and the four required headings. Evidence: `TemplateFilesTests.firstListingWritesDefaultAndDailyAndAnExistingFolderIsNeverReplenished`.

## S-7 An unusable Default file stays visible

Drive: write a broken Default file; list; read back an unusable Default
entry with its reason and a usable built-in Default. Evidence: `TemplateFilesTests.brokenFilesAreVisibleUnchangedAndDefaultStillResolves`.

## S-8 A missing chosen template

Drive: list, delete Daily's file, resolve Daily; read back a missing
failure naming Daily, and no instructions. Evidence: `TemplateFilesTests.aMissingOrBrokenChosenTemplateNeverUsesDefault` covers removed and broken custom and shipped Daily files, and checks that deletion is preserved.

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
discussed. Evidence: `TemplateFilesTests.shippedDailyResolvesTheHandoffContract`.

## S-13 A valid file is resolved

Drive: resolve each of the shipped Default and Daily and a fixture custom
file; read back name, required and optional headings in their order, and
instructions equal to the fixture's. Evidence: `TemplateFilesTests.validFilesAndEditsResolveTheirWholeContract` and `firstListingWritesDefaultAndDailyAndAnExistingFolderIsNeverReplenished` cover Default, Daily and custom files; `TemplateFilesTests.shippedDailyResolvesTheHandoffContract` checks shipped Daily's name, headings in order and instructions.

## S-15 Unreadable metadata

Drive: fixture with unterminated front matter; list; read back unusable and
a reason naming the metadata. Evidence: `TemplateFilesTests.brokenFilesAreVisibleUnchangedAndDefaultStillResolves`.

## S-16 No required headings

Drive: fixture whose metadata omits required headings; list; read back the
reason. Evidence: `TemplateFilesTests.brokenFilesAreVisibleUnchangedAndDefaultStillResolves`.

## S-17 Empty instructions

Drive: fixture with metadata and an empty body; list; read back the reason.
Evidence: `TemplateFilesTests.brokenFilesAreVisibleUnchangedAndDefaultStillResolves`.

## S-18 An unedited earlier shipped file is brought up to date

Drive: temp folder holding a Default file with the 2026-11-15 shipped instructions and the
shipped headings; resolve Default; read back the current shipped Default in both the
resolution and the file. Daily has had one text, so it has no earlier one to test. Evidence:
`ShippedTemplateUpdateTests.anUneditedEarlierShippedFileIsBroughtUpToDate`.

## S-19 An edited shipped file is kept

Drive: as S-18 with one word of the earlier text changed, and with changed headings; resolve;
read back the file unchanged and its own instructions. Evidence:
`ShippedTemplateUpdateTests.anEditedShippedFileIsKept`.
