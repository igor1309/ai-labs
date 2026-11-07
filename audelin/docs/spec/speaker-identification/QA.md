# Accept supported speaker identities — QA

Executable boundary checks below use synthetic transcripts and controlled providers.
The fixture/oracle prose describes the broader scenario; a boundary pass does not
claim OCR of every production status or semantic accuracy of model output.
Ordering probes use handshakes, never sleeps. Full validation: `audelin/scripts/gate-step.sh`.

## S-1 Accept supported name

Automated boundary: `cd audelin/macos && swift test --filter SpeakerIdentificationTests/acceptsExactSelfIntroduction`. Setup fixture: a requested label introduces itself in the transcript; drive: I validate matching quoted evidence; read-back oracle: I can use its supported name in notes.

## S-2 Keep unknown identity

Automated boundary: `cd audelin/macos && swift test --filter SpeakerIdentificationTests/unknownSpeakerIsValidWithoutInventedName`. Setup fixture: a requested label cannot be identified; drive: I validate the response; read-back oracle: I can keep its original label.

## S-3 Reject mention as identity

Automated boundary: `cd audelin/macos && swift test --filter SpeakerIdentificationTests/mentionsAndPromptInjectionAreNotIdentity`. Setup fixture: a label only mentions another person; drive: a response proposes that name; read-back oracle: I keep the original label.

## S-4 Reject conflicting identities

Automated boundary: `cd audelin/macos && swift test --filter SpeakerIdentificationTests/conflictingOrInventedEvidenceRetainsLabels`. Setup fixture: evidence gives conflicting names for one label; drive: I validate the response; read-back oracle: I keep the original label.

## S-5 Reject invented evidence

Automated boundary: `cd audelin/macos && swift test --filter SpeakerIdentificationTests/conflictingOrInventedEvidenceRetainsLabels`. Setup fixture: response evidence does not occur at the claimed time and label; drive: I validate the response; read-back oracle: I cannot apply the proposed name.

## S-6 Reject malformed structure

Automated boundary: `cd audelin/macos && swift test --filter SpeakerIdentificationTests/malformedMissingUnknownAndDuplicateLabelsFail`. Setup fixture: the response is malformed JSON; drive: I validate it; read-back oracle: I can report invalid output for fallback.
