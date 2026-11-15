# Notes generation — QA

Driven through a fake text-attempt port that records the request and
answers a fixture Markdown; templates are fixture values.

## S-1 Notes with the template's headings

Drive: Custom fixture template, answer carrying its headings; read back the
returned Markdown equals the answer. Evidence: `NotesGenerationTests.templateHeadingsAndOptionalSectionsAreAccepted`.

## S-2 The template's instructions reach the runtime

Drive: template with a marker sentence; read back the recorded request
contains the marker. Whether the model follows it is the recorded-
transcript check in `../daily-notes/QA.md`. Evidence: `NotesGenerationTests.requestUsesEditedInstructionsFaithfulnessEvidenceAndTranscript`.

## S-3 Faithfulness is always asked for

Drive: template with one instruction line; read back the recorded request
contains the base rules text. Evidence: `NotesGenerationTests.requestUsesEditedInstructionsFaithfulnessEvidenceAndTranscript`.

## S-4 A missing required heading

Drive: answer missing the template's Blockers heading; read back the failure names
it and no notes are returned. Evidence: `NotesGenerationTests.missingRequiredHeadingNamesIt`.

## S-5 An optional heading may be absent

Drive: Fixture answer without Questions; read back the Markdown.
Evidence: `NotesGenerationTests.templateHeadingsAndOptionalSectionsAreAccepted`.

## S-6 An empty section

Drive: answer whose Blockers section is blank; read back the failure names
it. Evidence: `NotesGenerationTests.structuralFailuresAreReturnedWithTheirReason`.

## S-7 Speaker names are used

Drive: evidence naming the far speaker; read back the name in the recorded
request. Evidence: `NotesGenerationTests.requestUsesEditedInstructionsFaithfulnessEvidenceAndTranscript`.

## S-8 A runtime failure

Drive: fake port answers a timeout; read back the same failure and no
notes. Evidence: `NotesGenerationTests.runtimeFailureIsReturnedWithoutNotes`.

## S-9 A repeated heading

Drive: Fixture answer with Blockers twice; read back the failure naming
it. Evidence: `NotesGenerationTests.structuralFailuresAreReturnedWithTheirReason`.

## S-10 Headings out of order

Drive: Fixture answer with Blockers before Continuation; read back a
failure. Evidence: `NotesGenerationTests.structuralFailuresAreReturnedWithTheirReason`.

## S-11 An unexpected heading

Drive: answer adding a summary heading; read back the failure naming it.
Evidence: `NotesGenerationTests.structuralFailuresAreReturnedWithTheirReason`.

## S-12 A preamble before the notes

Drive: answer opening with "Here are the notes:"; read back a failure.
Evidence: `NotesGenerationTests.structuralFailuresAreReturnedWithTheirReason`.

## S-13 An optional heading present

Drive: Fixture answer with Questions; read back the Markdown.
Evidence: `NotesGenerationTests.templateHeadingsAndOptionalSectionsAreAccepted`.
