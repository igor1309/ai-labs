# Session — QA

A Core, driven through fakes of its own interfaces: two tracks that deliver
distinct known tones and can fail, or refuse to start, on cue; a writer that
keeps what it is given; and a fake clock. Every row reads back the written
audio and what the Session tells its client, not a call made.

## S-1 Starting records both sides

The mic's tone is written as mine and the call's tone as theirs, and the
Session reads as recording both. Evidence: Missing.

## S-2 A second start leaves the first recording

A second start is refused; the writer holds one call, and the first's
tones keep being written. Evidence: Missing.

## S-3 Stopping keeps the call

After stop, the written tracks hold every sample delivered, to the last.
Evidence: Missing.

## S-4 A recording can follow a stopped one

After a stop, a second start writes both tones into a second call, and the
Session reads as recording both. Evidence: Missing.

## S-5 My audio can be read as soon as it is written

Each piece the mic delivers is readable from the written track before the
next is delivered and before stop. Evidence: Missing.

## S-6 A failing call track keeps mine

The call track fails mid-call; the mic's tone keeps being written, and the
Session names the call track as missing. Evidence: Missing.

## S-7 A failing mic track keeps theirs

The mic track fails mid-call; the call's tone keeps being written, and the
Session names my track as missing. Evidence: Missing.

## S-8 A call track that cannot start leaves mine

The call track refuses to start; the mic's tone is written, and the call
track is named missing. Evidence: Missing.

## S-9 A mic track that cannot start leaves theirs

The mic track refuses to start; the call's tone is written, and my track is
named missing. Evidence: Missing.

## S-10 A recording with no track fails

Both refuse; the start fails and nothing is written. Evidence: Missing.

## S-11 Their audio can be read as soon as it is written

Each piece the call track delivers is readable from the written track
before the next is delivered and before stop. Evidence: Missing.
