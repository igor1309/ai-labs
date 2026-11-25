# Folder index QA

Driven by Go tests that build a fixture folder tree and a temp home folder
holding the setting in `t.TempDir()`, run the generator's entry point with
that home and compare the index it writes with the expected bytes. No test
reads the owner's home, folders or `~/.audelin`, or waits.

## S-1 A repository is listed with its README's first line
Drive: a root with one repository, `.git` a directory, its README a title and a paragraph; the index is the header and one entry with path, first prose line and README link. Evidence: `TestS1_ARepositoryIsListedWithItsREADMEsFirstLine` in `audelin/feed/folderindex`, run by `audelin-feed-core`.

## S-2 A monorepo's projects are listed
Drive: a repository with two subfolders holding READMEs (one `readme.md`, one `README`), one without, a submodule with a `.git` file and no README, and a README two levels down; the repository, the two subfolders and the submodule are entries, sorted. Evidence: `TestS2_AMonoreposProjectsAreListed` in `audelin/feed/folderindex`, run by `audelin-feed-core`.

## S-3 A repository with no README is still listed
Drive: a repository with `.git` as a file and no README; its entry says no README and has no link. Evidence: `TestS3_ARepositoryWithNoREADMEIsStillListed` in `audelin/feed/folderindex`, run by `audelin-feed-core`.

## S-4 Only prose makes the summary
Drive: a README with a heading, a badge line, an HTML tag, a fenced block and then a prose line with a link, longer than 160 characters; the summary is that line with the link's text, cut with `…`; another README with no prose reads `no summary`. Evidence: `TestS4_OnlyProseMakesTheSummary` in `audelin/feed/folderindex`, run by `audelin-feed-core`.

## S-5 Folders that are not repositories are not entries
Drive: a plain folder, a hidden folder and `node_modules`, each with a README, and a repository under a plain folder and another under a hidden one; only the plain folder's nested repository is listed. Evidence: `TestS5_FoldersThatAreNotRepositoriesAreNotEntries` in `audelin/feed/folderindex`, run by `audelin-feed-core`.

## S-6 A run replaces the index and is stable
Drive: an old index with a stale entry; two runs on one tree with two roots; the file holds only the tree's entries, both runs give the same bytes, and a handle on the old index opened before the runs still reads the old bytes, so the file was replaced by a rename and not written in place. Evidence: `TestS6_ARunReplacesTheIndexAndIsStable` in `audelin/feed/folderindex`, run by `audelin-feed-core`.

## S-7 A missing root fails and keeps the old index
Drive: an old index; a run with a missing root exits 1 with its name on stderr, a run with a positional argument exits 2, and the old index is byte for byte unchanged. Evidence: `TestS7_AMissingRootFailsAndKeepsTheOldIndex` in `audelin/feed/folderindex`, run by `audelin-feed-core`.

## S-8 A bad setting fails and keeps the old index
Drive: an old index; a run with no setting file, then with an empty file, broken JSON, `null`, `roots` not a list, no or null roots, an unknown key, `Roots` or `ROOTS`, an extra key beside valid roots, a relative root, a bare `~`, and a valid object followed by `{}`, `}` or `]`; each exits 1 naming the settings file, and the old index is unchanged; the valid object alone then succeeds. Evidence: `TestS8_BadSettingsFailAndKeepTheOldIndex` in `audelin/feed/folderindex`, run by `audelin-feed-core`.

## S-9 The index is written beside the setting by default
Drive: a temp home whose setting names `~/code`, with no `folders.md` yet; a run with no flags writes `.audelin/feed/folders.md` under that home, listing the repository under `code`. Evidence: `TestS9_TheIndexIsWrittenUnderHomeByDefault` in `audelin/feed/folderindex`, run by `audelin-feed-core`.

## S-10 The index is never written into .claude/skills
Drive: `-out` at three paths inside a temp project's `.claude/skills`, one reached through `..`; each run exits 1 saying so and the project folder is not made; `-out` elsewhere under `.claude` succeeds. Evidence: `TestS10_TheIndexIsNeverWrittenIntoClaudeSkills` in `audelin/feed/folderindex`, run by `audelin-feed-core`.
