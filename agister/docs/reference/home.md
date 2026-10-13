# Home

[Reference](README.md) · [Agister](../../README.md)

## Init, install and restore

`agister init` installs the example settings. `agister install <dir>`
installs a folder laid out like the settings, such as a repository's
`.agister/`, into home, document by document
([ADR-016](../adr/016-settings-are-installed-into-home-with-a-backup.md)).
It shows what it would create, replace (with a diff), leave unchanged and
keep (documents only home has), checks the result on a staged copy, and
writes only after you type yes, and only if home's settings are still as
shown. It backs up what it replaces under `~/.agister/backups/<stamp>/`
first, and prints the command that undoes it, `agister install --restore
<stamp>`. The last five backups are kept. Files that are not settings are
listed and not installed; a symbolic link in the folder refuses it. A
skill, `skills/<name>/SKILL.md`, is installed as any other document
([ADR-027](../adr/027-homes-settings-have-one-source-in-git.md) rules 8
and 9): planned, diffed, checked, backed up and restored; a skill folder
holding anything beside its `SKILL.md`, or whose `SKILL.md` is not a
regular file, refuses the install, naming the skill and those files. Like
`init`, both work on settings that fail check.

## Home's source

Home's settings have one source in git, [home/](../../home/)
([ADR-027](../adr/027-homes-settings-have-one-source-in-git.md)): every
global document home uses, its prompts and skills among them, laid out as
home is. Its processes take their prompts as settings prompts, so no
document names a path of a machine or a repository. Home is brought to it
with `agister install home` from `agister/` in the main checkout, after a
change to the folder merges and the binary that checks it is installed:
any difference shows as a replace, with its diff, in that install's plan.
Live state, `blocks.yaml`, `layer.yaml` and verifications stay out of it.
The Go guidance prompts are home's, and home's `implement`,
`architecture_review`, `adversarial_review` and `tests_review` are given
them ([ADR-033](../adr/033-go-guidance-is-homes.md)); a repository
without Go code sets `guidance: []` on those processes in its layer. This
repository holds no `.agister/` of its own; project layers set their own
verification without copying home's processes. A test installs
the folder into an empty home and checks it as global settings.
