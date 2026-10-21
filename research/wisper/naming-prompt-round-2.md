# Naming prompt — round 2

Sent to the same agent after round 1 ([naming-prompt.md](naming-prompt.md)),
which proposed tolmach first. Uses the reusable prompts in
[`prompts/`](../../prompts/) instead of round 1's method.

---

Bring 15 more name candidates for the same app, all new: none of your 38
earlier names. The owner finds tolmach interesting but hasn't chosen it, so
roles that explain or interpret what was said are a good direction. Also try
others (Slavic and other old roles, interpreters in other languages, coined
words).

This round, don't use naming-prompt.md's method. Use these two reusable
prompts:

- [brainstorming-prompt.md](../../prompts/brainstorming-prompt.md), for
  generation, H/M/L rating per criterion, dropping any Low, and iterating.
  Override: the target is 15 ideas, not 5–7, and up to 5 rounds. Success
  criteria, in order: Product fit, Spoken / CLI usability (Russian and
  English), Tone fit, Memorability, Availability risk.
- [naming-availability-standard.md](../../prompts/naming-availability-standard.md),
  for collision screening, with this context:
  - Target field: macOS meeting recorders, live call transcribers and
    dictation apps (the list in naming-prompt.md § Target field).
  - Adjacent categories: speech-to-text models and libraries, live
    translation and interpreting apps.
  - Intended technical surface: a lowercase CLI command `<name>` and its data
    folder `~/.<name>` on macOS, plus a GitHub repo name.

Take the product description, where the name is used, and the language and
sound rules from naming-prompt.md § Product, § Where the name is used, and
§ Language and sound.

Output: the 15 ideas in the blueprint's list-plus-table format; then a
collision check on all 15 with web search, citing what you found and where,
and never guessing; then your top 5 of the 15, compared with tolmach using
the standard's weights. Return the result as Markdown.
