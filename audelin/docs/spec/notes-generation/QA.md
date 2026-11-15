# Notes generation — QA

Driven through a fake text-attempt port that records the request and
answers a fixture Markdown; templates are fixture values.

## S-1 Notes with the template's headings

Drive: Daily fixture template, answer carrying its headings; read back the
returned Markdown equals the answer. Evidence: Missing.

## S-2 The template's instructions reach the runtime

Drive: template with a marker sentence; read back the recorded request
contains the marker. Whether the model follows it is the recorded-
transcript check in `../daily-notes/QA.md`. Evidence: Missing.

## S-3 Faithfulness is always asked for

Drive: template with one instruction line; read back the recorded request
contains the base rules text. Evidence: Missing.

## S-4 A missing required heading

Drive: answer missing Daily's blockers heading; read back the failure names
it and no notes are returned. Evidence: Missing.

## S-5 An optional heading may be absent

Drive: Default answer without open questions; read back the Markdown.
Evidence: Missing.

## S-6 An empty section

Drive: answer whose decisions section is blank; read back the failure names
it. Evidence: Missing.

## S-7 Speaker names are used

Drive: evidence naming the far speaker; read back the name in the recorded
request. Evidence: Missing.

## S-8 A runtime failure

Drive: fake port answers a timeout; read back the same failure and no
notes. Evidence: Missing.

## S-9 A repeated heading

Drive: Default answer with key points twice; read back the failure naming
it. Evidence: Missing.

## S-10 Headings out of order

Drive: Default answer with decisions before key points; read back a
failure. Evidence: Missing.

## S-11 An unexpected heading

Drive: answer adding a summary heading; read back the failure naming it.
Evidence: Missing.

## S-12 A preamble before the notes

Drive: answer opening with "Here are the notes:"; read back a failure.
Evidence: Missing.

## S-13 An optional heading present

Drive: Default answer with open questions; read back the Markdown.
Evidence: Missing.
