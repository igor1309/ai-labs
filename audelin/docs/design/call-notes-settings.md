# Call notes settings

The `Screen 6 — Settings` board in `visual-language.pen` is the design source.
Call notes adds a second tab beside Recording. Existing recording controls and
their confirmation/error states stay in the Recording tab. The new reusable
runtime fields, cards and navigation use existing Glass Ledger tokens only.

## Layout and interaction

Content is 620 pt wide, padded 24 pt, with 16 pt vertical gaps. Native window chrome is not drawn. Production scrolls the content when the desktop
cannot accommodate its height. There is no mobile layout.

Automatic notes defaults off; all runtime fields remain editable while off.
Speaker identification is a separate opt-in. Each runtime has an editable kind
and model; CLI has an executable field, API has endpoint and optional credential
environment-variable name. Never display or persist the credential value.
Use native text editing, keyboard traversal, menus, checkboxes and buttons.
The design's drawn menu chevron is replaced with the native menu affordance.

Primary defaults to Claude Code CLI / sonnet with automatic executable discovery.
Fallback is optional and defaults to unconfigured. Only the fallback picker
includes “Не использовать”; choosing it clears the fallback fields.
The fallback header always says “Необязательно”; invalid fields retain the
“требует настройки” title and inline validation.
Existing configured fallbacks remain selected. Each configured card discloses its
recipient and charging model. The initially collapsed “О данных, оплате и проверке” disclosure groups data,
cost and validation guidance. It includes provider-specific CLI discovery/isolation
and API credential-variable help only when that provider is configured. Recipient
and charging details appear once per configured card, without footer repetition.
Expansion is local view state and does not change preferences. The loopback variant
warns that the local server controls any onward forwarding. No credentials or transcripts are sent by validation.

Save affects future jobs, and reports saving, success or retained draft after
failure. Save is available for a changed, syntactically valid draft; when notes
are enabled it checks provider availability automatically before persisting.
An edit during that check cancels the pending save. Validate also reports
availability independently without a paid prompt. Loading and load
failure never show invented editable defaults. Stale async replies must not
replace newer edits.

## Rehearsal

Run `macos/scripts/rehearsal.sh all --out <directory>` and compare every
Settings state in both appearances with its frame in `visual-language.pen`.
States: `off`, `on`, `local`, `invalid`, `unavailable`, `validating`,
`saving`, `save-failed`, `saved`, `loading` and `load-failed`. Local model
names are illustrative; attached source prompts are examples.
