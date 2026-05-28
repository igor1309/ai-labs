publish separate public skills for implementation-plan drafting and review. Right now those exist under `docs/my-way/skills/...`, not `dev-skills/public`. If we want agents to reliably invoke them as skills, create:

- `dev-skills/public/implementation-plan-drafting/SKILL.md`
- `dev-skills/public/implementation-plan-review/SKILL.md`

Then root `AGENTS.md` can point to public skill paths instead of local My Way copies. That is the more durable long-term structure.