# Caller skill: `init` and `install` confirm on stdin (LAB-65 acceptance test)

In the LAB-65 acceptance test, a fresh agent ran `agister --home <dir>
init` without a terminal: it read EOF, cancelled, and exited 64; it found
`echo yes |` in `--help`. `agister/skills/agister/SKILL.md` says `init`
"writes only after you type yes" but not that the answer is read from
stdin.

In the skill's paragraph on `agister init` (and in the Rules line on
`agister install`, if the same holds there), say in one sentence that the
confirmation is read from stdin, so a caller without a terminal pipes it
(`echo yes | agister --home <dir> init`), and what happens on any other
answer or EOF. Check the behaviour and the exit code in the code. Change
nothing else.

The caller-skill guard test must still pass. Done when the repository's
verify command passes. List every file you changed.
