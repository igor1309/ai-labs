# agonara dev sandbox — Linux container for running a coding agent against ai-labs.
# Isolation: namespace-level (shared host kernel). Safe for solo, human-in-the-loop
# dev provided you DO NOT bind-mount the host repo/home, mount the docker socket,
# or run --privileged. See playbook.md.

FROM node:22-bookworm

# System deps: gh (GitHub CLI) for clone/push/PR, plus build tooling that
# better-sqlite3 needs if no prebuilt binary is available for the platform.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates curl gnupg git python3 make g++ \
 && install -m 0755 -d /etc/apt/keyrings \
 && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      -o /etc/apt/keyrings/githubcli-archive-keyring.gpg \
 && chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg \
 && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      > /etc/apt/sources.list.d/github-cli.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends gh \
 && rm -rf /var/lib/apt/lists/*

# Coding agent CLIs. Binaries: `claude`, `codex`.
RUN npm install -g @anthropic-ai/claude-code @openai/codex

# Non-root. The node image ships a `node` user (uid 1000); a named volume mounted
# at /home/node persists the cloned repo and per-tool auth across sessions.
USER node
WORKDIR /home/node

CMD ["bash"]
