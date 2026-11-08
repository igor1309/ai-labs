# Call notes settings — LAB-1034

The `Screen 6 — Settings` board in `visual-language.pen` is the design source.
Call notes adds a second tab beside Recording. Existing recording controls and
their confirmation/error states stay in the Recording tab. The new reusable
runtime fields, cards and navigation use existing Glass Ledger tokens only.

## Layout and interaction

Content is 620 pt wide, padded 24 pt, with 16 pt vertical gaps. Rehearsal adds
24 pt of desktop on every side (668 pt export width). Native window chrome is
excluded from these exports. Production scrolls the content when the desktop
cannot accommodate its height. There is no mobile layout.

Automatic notes defaults off; all runtime fields remain editable while off.
Speaker identification is a separate opt-in. Each runtime has an editable kind
and model; CLI has an executable field, API has endpoint and optional credential
environment-variable name. Never display or persist the credential value.
Use native text editing, keyboard traversal, menus, checkboxes and buttons.
The design's drawn menu chevron is replaced with the native menu affordance.

Primary defaults to Claude Code CLI / sonnet / claude. Fallback defaults to
OpenAI-compatible API / gpt-4.1-mini / https://api.openai.com/v1 /
OPENAI_API_KEY. Each card discloses its recipient and charging model. The footer
explains that either slot can receive the full transcript and speaker naming
adds a request. The loopback variant warns that the local server controls any
onward forwarding. No credentials or transcripts are sent by validation.

Save affects future jobs, and reports saving, success or retained draft after
failure. Save is available for a changed, syntactically valid draft; when notes
are enabled it checks provider availability automatically before persisting.
An edit during that check cancels the pending save. Validate also reports
availability independently without a paid prompt. Loading and load
failure never show invented editable defaults. Stale async replies must not
replace newer edits. Runtime and validation logic belongs to the subsequent
implementation phase, after UI rehearsal comparison.

## Rehearsal oracle

`exports/call-notes/summaries-<state>-<appearance>.png` contains all 22 exports.
Appearances are `light` and `dark`; states are `off`, `on`, `local`, `invalid`,
`unavailable`, `validating`, `saving`, `save-failed`, `saved`, `loading` and
`load-failed`. Every export was visually inspected before UI implementation;
no text or controls are clipped. Local models are illustrative user-supplied
names, not downloaded models. Attached source prompts are examples, not a
verbatim product contract; the reviewed specs define behavior.

Run `macos/scripts/rehearsal.sh all --out <directory>` after implementing the
view. Compare every new state in both appearances to its export before adding
summary logic or production wiring. Include all existing Settings states in
the rehearsal to catch tab/layout regressions. Record deviations and their
resolution in the verification evidence.
