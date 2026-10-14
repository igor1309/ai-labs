# Skills

[Reference](README.md) · [Agister](../../README.md)

## Settings skills

A skill the settings give an agent is a document too:
`skills/<name>/SKILL.md`, a folder holding that one file. Its front matter
names it, `name` equal to the folder's, and describes it, `description` not
empty; the rest of the file is the runtime's to read. An agent names its
skills with `skills = ["review"]`, a process with `skills: [review]`; a
name is literal, never interpolated, and named once in a list. A node's
call gets its process's skills, then those of the agent the node binds,
each once. Each is read with the
call and recorded among its definitions with its digest, and `process show`
lists the process's, with the layer each comes from, and `workflow show`
each node's call's.
A skill is found like any other document, so a repository replaces one,
whole, with `.agister/skills/review/SKILL.md`. `check` reports a name that
exists in no layer as a problem of the agent or the process that
names it, and a broken skill as a problem of its own: a folder holding
anything beside its `SKILL.md`, a `SKILL.md` that is not a regular file, or
front matter that does not name and describe it. Either refuses only the
calls that depend on it, and `check --tree` shows each skill under what
names it. `install` installs a folder's skills with its other documents
(ADR-027 rule 8).

## Adapter delivery

Every adapter gives a call its recorded skills on every turn. Claude Code,
Pi and OpenCode give them from a fresh temporary folder outside the
worktree, removed when
the turn ends. Claude Code uses a plugin named `agister` through
`--plugin-dir`, so its skills are `agister:<name>`; Pi passes each skill
folder with `--skill`, in order; OpenCode adds the folder to `skills.paths`
in its inline configuration under `--pure`.

Codex takes skills only from `$CODEX_HOME/skills` and resumes a thread only
with the `CODEX_HOME` it ran in, so a fresh Codex thread whose call names
skills runs with a home of its own under `<home>/codex/homes`, named by its
thread once the turn ends: it links your `auth.json`, `AGENTS.md` and
`AGENTS.override.md` where they exist and each of your skills in
`$CODEX_HOME/skills` (default `~/.codex`) but `.system`, beside the call's
skills; a skill of yours with the name of one of the call's is linked as
`<name>.user`, a folder name no settings skill can take, so both are there.
Such a thread is not in your `~/.codex`, only a turn with its home resumes
it, and it misses your Codex memories and state. A turn that resumes it gets
the call's skills and the links to your files afresh, as your `CODEX_HOME`
holds them then, and the cost lookup reads that home. A Codex run
without skills ran in your own `CODEX_HOME`, so a call that names skills
cannot continue it: it is refused before it holds the worktree, and the
changed settings need a fresh run. A call that names none runs as before
([ADR-021](../adr/021-settings-give-an-agent-its-skills.md)).

## The caller skill

The caller skill, [`skills/agister/SKILL.md`](../../skills/agister/SKILL.md)
in Agister's source folder, is for the agent that runs Agister, not a
settings skill. Install it by linking the
folder into each runtime's home skills folder, from `agister/` in the main
checkout so that the link follows `trunk`:
`ln -s "$PWD/skills/agister" ~/.claude/skills/agister` and
`ln -s "$PWD/skills/agister" ~/.agents/skills/agister` (Codex, Pi and
OpenCode read `~/.agents/skills`, per ADR-011's table). Whether it is
published for others is LAB-85.
