# Folder index

Observer: the call assistant's thread, which reads the index to know where
to look for local context before it hints (`../call-assistant-skill/SPEC.md`).
Its client is the owner, who names the folders to index in a setting and
runs the generator; nothing edits the index by hand.

## Decided

- **The folders are a user setting, and the index is its output;** neither
  is in the repository. Both live in `~/.audelin/feed/`.
- **The setting is `~/.audelin/feed/folder-index.json`:**
  `{"roots": ["<root>", ...]}`, each root an absolute path or one starting
  with `~/`. `-settings <file>` names another file.
- **The index is `~/.audelin/feed/folders.md`;** `-out <file>` names another.
  The generator makes the index's folder when it is missing.
- **The generator is `audelin-folder-index`,** a Go program in
  `audelin/feed`: `audelin-folder-index [-settings <file>] [-out <file>]`.
  It reads only the setting and the roots it names, and writes only the
  index, whole, so a run replaces the file.
- **An entry is a repository:** a folder under a root holding `.git`, a
  directory or a file. Its direct subfolders that hold a README are entries
  too, so a monorepo's projects are listed. The walk goes no deeper inside
  a repository, and skips hidden folders, `node_modules` and symlinks.
- **One line per entry:** `` - `<path>`: <summary> ([README](<readme path>)) ``,
  paths absolute. The summary is the README's first prose line: the first
  non-blank line that is not a heading, an HTML tag, a badge or image line,
  or inside a code fence, with Markdown links reduced to their text, cut to
  160 characters with `…`. A folder with no README reads
  `` - `<path>`: no README `` and links nothing; a README with no prose
  line reads `no summary` and keeps its link.
- **The README is `README.md`, else `README`, else `README.markdown`,**
  matched case-insensitively, the first in that order.
- **The file opens with a heading and one line saying it is generated, by
  which command, from which roots,** then the entries sorted by path. The
  same tree gives the same bytes.
- **A missing or malformed setting fails the run** with a message naming the
  setting file, exit 1: not JSON, not an object with only `roots`, no roots,
  or a relative root. **So does a root that is missing or not a folder,**
  with a message naming it. Either way the old index is left as it was.
  Bad usage, such as a positional argument, exits 2.
  An unreadable folder inside a root is skipped.

```gherkin
Feature: Indexing the owner's folders

  Scenario: S-1 A repository is listed with its README's first line
    Given a root holding a repository whose README has a title and a paragraph
    When the generator runs
    Then the index lists its path, the paragraph's first line and a link to the README

  Scenario: S-2 A monorepo's projects are listed
    Given a repository whose subfolders hold READMEs
    When the generator runs
    Then each such subfolder is an entry, and folders deeper down are not

  Scenario: S-3 A repository with no README is still listed
    Given a repository with no README
    When the generator runs
    Then the index lists it as having no README, with no link

  Scenario: S-4 Only prose makes the summary
    Given a README opening with badges, HTML and a code block before its prose
    When the generator runs
    Then the summary is the prose line, with link text kept and a long line cut

  Scenario: S-5 Folders that are not repositories are not entries
    Given plain folders, hidden folders and node_modules holding READMEs but no repository
    When the generator runs
    Then none is listed, and a repository nested in a plain folder is

  Scenario: S-6 A run replaces the index and is stable
    Given an index from an earlier run
    When the generator runs twice on the same tree
    Then the file holds only this tree's entries, the same bytes both times

  Scenario: S-7 A missing root fails and keeps the old index
    Given an index from an earlier run
    When the generator runs with a root that does not exist
    Then it exits 1 naming the root, and the old index is unchanged

  Scenario: S-8 A bad setting fails and keeps the old index
    Given an index from an earlier run
    When the setting is missing or malformed
    Then it exits 1 naming the setting, and the old index is unchanged

  Scenario: S-9 The index is written beside the setting by default
    Given a setting naming a root under the home folder with ~/
    When the generator runs with no flags
    Then the index is written in ~/.audelin/feed, its folder made
```
