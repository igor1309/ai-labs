---
date: 2026-08-22
model: claude-opus-5
description: "Swift style — naming, formatting, the comment ban, type extension scope, helper placement and visibility"
paths:
  - "**/*.swift"
---

# Swift

Always use descriptive variable names. `$0` (and `$1`, etc.) are the preferred style for short closure arguments. They make it explicit that the binding is local to the closure and avoid accidental clashes with outer-scope names.

Function formatting: For declarations ending with `) {` (Void return), do not insert an empty line before the body. For declarations with a return type (e.g., `) -> ViewModel.Avatar? {`), insert a blank line before the body.

Swift files use Xcode defaults (4-space indentation, spaces not tabs). Type declarations should be separated from body by empty line.

Prefer `private extension SomeType { ... }` over private free functions for factory/composition helpers.

## COMMENTS

**Do not add comments.** This covers doc comments restating a field, rationale
above a modifier, and notes explaining a decision — a decision belongs in the
ticket doc. Prose calibration ("be concise", "only when needed") has been tried
and failed: comment density reached ~40% of production lines and 25–30% of test
lines.

`// MARK:`, compiler directives and lint directives are not comments in this
sense, and the Xcode file header is required.

Add DocC only when the user asks for it in the current request — then `///`,
behavior not implementation.

## Type Extension Scope

Do not extend a type unless that type is directly used in the function/property body. Keep pure mappers on the types they actually map, not on unrelated composition/root types.

## Helper Placement

A helper is born `private` in the file that calls it, immediately below its call
site. Promotion into a shared file is earned by the helper being part of the
type's own vocabulary — something any caller of the type would reach for — not
by a second caller existing. Two composition factories that happen to need the
same rule do not make that rule belong to a type; it belongs to neither, and
attaching it to the nearest type gives a policy a home it did not earn. Two
private copies are the cheaper mistake: they are local, greppable, and free to
diverge when the two callers stop agreeing.

When you do promote, promote only what the second caller needs. A sibling added
"while we're here" puts a one-caller detail on a module-wide surface and
routinely strands its real near-twin private in another file — the opposite of
the deduplication that motivated the move.

Use the narrowest access that compiles, and let a real cross-file caller be the
reason to widen `private` → `fileprivate` → `internal`. `internal` reached by
omitting a keyword is not a decision.

Parsing and decoding leaves — query-item extraction, string splitting, date
formatting — do not travel with the helper that calls them. They stay at the
boundary that owns the raw value.

## File Name as Contract

A file named for a type promises the reader that everything in it is that type's
own vocabulary. A file holding the type's mapping, plus a policy over a
collection of it, plus a parser for a string the type never sees, has three
subjects and one name. Split it, or name it for the subject that is really
there.

A prescribed file list in a plan or tracker is not authority over layout. A plan
names behaviors and their owners; which file a helper lands in, and how visible
it is, is decided at implementation time against the rules above. When a plan's
file list conflicts with them, say so before writing the file.
