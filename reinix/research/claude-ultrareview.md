--—
date: 2026-04-25
model:
source: Claude Code release notes
--—

> Added claude ultrareview [target] subcommand to run /ultrareview non-interactively from CI or scripts — prints findings to stdout (—json for raw output) and exits 0 on completion or 1 on failure

/ultrareview already existed as an interactive slash command — it launches a fleet of reviewer agents in a remote sandbox to find bugs in your branch or p ￼ull request, with each finding independently reproduced and verified ￼ before being surfaced. It runs in the cloud, takes 5-10 minutes, and bills as extra usage (~$5-20 per run).
What this release note adds is the non-interactive CLI counterpart: claude ultrareview [target]. It’s a top-level subcommand (alongside claude update, claude doctor, etc.), not a slash command inside a session. The [target] mirrors the slash command’s optional argument — omit it to review the current branch, or pass a PR number for PR mode. The point is CI integration: no TUI, no prompts, no session — just run, print, exit.
The contract is standard Unix-pipeline shape:
	•	Default: human-readable findings to stdout
	•	—json: raw structured output for piping into jq, GitHub Actions annotations, etc.
	•	Exit 0 = review completed (regardless of whether bugs were found), exit 1 = review itself failed (auth, sandbox bundle too large, network, etc.)
One thing worth flagging given your CI plans: exit 0 means the review ran, not the code is clean. If you want a “block merge on findings” gate, you’ll need to parse —json and threshold on findings yourself rather than relying on the exit code. Also note the existing constraints carry over — Ultrareview requires authentication with a Claude.ai ac[count] ￼ and is not available when using Claude Code with Amazon Bedrock, Google Cloud Vertex AI, or Microsoft Foundry, and it is not available to organizations that have enabled Zero Data Retention ￼, which matters for how you wire up the runner’s auth.​​​​​​​​​​​​​​​​