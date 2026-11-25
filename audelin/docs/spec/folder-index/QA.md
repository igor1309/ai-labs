# Folder index QA

Driven by Go tests that build a fixture folder tree and a temp home folder
holding the setting in `t.TempDir()`, run the generator's entry point with
that home and compare the index it writes with the expected bytes. No test
reads the owner's home, folders or `~/.audelin`, or waits.

## S-1 A repository is listed with its README's first line
Drive: a root with one repository, `.git` a directory, its README a title and a paragraph; the index is the header and one entry with path, first prose line and README link. Evidence: `TestS1_ARepositoryIsListedWithItsREADMEsFirstLine` in `audelin/feed/folderindex`, run by `audelin-feed-core`.

## S-2 A monorepo's projects are listed
Drive: a repository with two subfolders holding READMEs (one `readme.md`, one `README`), one without, and a README two levels down; the repository and the two subfolders are entries, sorted. Evidence: `TestS2_AMonoreposProjectsAreListed` in `audelin/feed/folderindex`, run by `audelin-feed-core`.

## S-3 A repository with no README is still listed
Drive: a repository with `.git` as a file and no README; its entry says no README and has no link. Evidence: `TestS3_ARepositoryWithNoREADMEIsStillListed` in `audelin/feed/folderindex`, run by `audelin-feed-core`.

## S-4 Only prose makes the summary
Drive: a README with a heading, a badge line, an HTML tag, a fenced block and then a prose line with a link, longer than 160 characters; the summary is that line with the link's text, cut with `…`; another README with no prose reads `no summary`. Evidence: `TestS4_OnlyProseMakesTheSummary` in `audelin/feed/folderindex`, run by `audelin-feed-core`.

## S-5 Folders that are not repositories are not entries
Drive: a plain folder, a hidden folder and `node_modules`, each with a README, and a repository under a plain folder and another under a hidden one; only the plain folder's nested repository is listed. Evidence: `TestS5_FoldersThatAreNotRepositoriesAreNotEntries` in `audelin/feed/folderindex`, run by `audelin-feed-core`.

## S-6 A run replaces the index and is stable
Drive: an old index with a stale entry; two runs on one tree with two roots; the file holds only the tree's entries and both runs give the same bytes. Evidence: `TestS6_ARunReplacesTheIndexAndIsStable` in `audelin/feed/folderindex`, run by `audelin-feed-core`.

## S-7 A missing root fails and keeps the old index
Drive: an old index; a run with a missing root exits 1 with its name on stderr, a run with a positional argument exits 2, and the old index is byte for byte unchanged. Evidence: `TestS7_AMissingRootFailsAndKeepsTheOldIndex` in `audelin/feed/folderindex`, run by `audelin-feed-core`.

## S-8 A bad setting fails and keeps the old index
Drive: an old index; a run with no setting file, then with an empty file, broken JSON, `roots` not a list, no roots, an unknown field, a relative root and data after the object; each exits 1 with a settings error, the missing one naming the file, and the old index is unchanged. Evidence: `TestS8_BadSettingsFailAndKeepTheOldIndex` in `audelin/feed/folderindex`, run by `audelin-feed-core`.

## S-9 The index is written beside the setting by default
Drive: a temp home whose setting names `~/code`, with no `folders.md` yet; a run with no flags writes `.audelin/feed/folders.md` under that home, listing the repository under `code`. Evidence: `TestS9_TheIndexIsWrittenUnderHomeByDefault` in `audelin/feed/folderindex`, run by `audelin-feed-core`.
