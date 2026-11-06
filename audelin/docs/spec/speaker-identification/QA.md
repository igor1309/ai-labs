# Accept supported speaker identities — QA

Planned tests; evidence is Missing until execution. Ordering uses handshakes, never sleeps.

## S-1 Accept supported name

Missing — planned `cd audelin/macos && swift test --filter SpeakerIdentificationTests/acceptsupportedname`. Setup fixture: a requested label introduces itself in the transcript; drive: I validate matching quoted evidence; read-back oracle: I can use its supported name in notes.

## S-2 Keep unknown identity

Missing — planned `cd audelin/macos && swift test --filter SpeakerIdentificationTests/keepunknownidentity`. Setup fixture: a requested label cannot be identified; drive: I validate the response; read-back oracle: I can keep its original label.

## S-3 Reject mention as identity

Missing — planned `cd audelin/macos && swift test --filter SpeakerIdentificationTests/rejectmentionasidentity`. Setup fixture: a label only mentions another person; drive: a response proposes that name; read-back oracle: I keep the original label.

## S-4 Reject conflicting identities

Missing — planned `cd audelin/macos && swift test --filter SpeakerIdentificationTests/rejectconflictingidentities`. Setup fixture: evidence gives conflicting names for one label; drive: I validate the response; read-back oracle: I keep the original label.

## S-5 Reject invented evidence

Missing — planned `cd audelin/macos && swift test --filter SpeakerIdentificationTests/rejectinventedevidence`. Setup fixture: response evidence does not occur at the claimed time and label; drive: I validate the response; read-back oracle: I cannot apply the proposed name.

## S-6 Reject malformed structure

Missing — planned `cd audelin/macos && swift test --filter SpeakerIdentificationTests/rejectmalformedstructure`. Setup fixture: the response is malformed JSON; drive: I validate it; read-back oracle: I can report invalid output for fallback.
