# Speaker attribution — QA

Speaker attribution is no adapter and has no ports: every row gives it
fixed segments of timed words and a fixed list of turns, and reads back each
piece's words, times and speaker.

## S-1 A segment one speaker said is theirs

Evidence: `SpeakerAttributionTests.aSegmentOneSpeakerSaidIsTheirs`.

## S-2 A segment is split where the speaker changes

The pieces' times: the first from the segment's start to the second's first
word, the second from there to the segment's end. Evidence:
`SpeakerAttributionTests.aSegmentIsSplitWhereTheSpeakerChanges`.

## S-3 A word between two turns goes to the one overlapping more of it

A word overlapping speaker 1 by 0.3 s and speaker 0 by 0.1 s; and a word
two short turns of speaker 0 overlap by 0.4 s in sum, more than one longer
turn of speaker 1 overlaps it (0.3 s). Evidence:
`SpeakerAttributionTests.aWordBetweenTwoTurnsGoesToTheOneOverlappingMoreOfIt`,
`SpeakerAttributionTests.aSpeakersTurnsAreSummedOverAWord`.

## S-4 A tied word goes to the turn that started first

Speaker 1's overlapping turn starts first, so a higher number wins; speaker
0 also has an earlier turn that does not overlap the word, which does not
count. Evidence:
`SpeakerAttributionTests.aTiedWordGoesToTheTurnThatStartedFirst`.

## S-5 A tie between turns starting together goes to the lower speaker

Evidence: `SpeakerAttributionTests.aTieBetweenTurnsStartingTogetherGoesToTheLowerSpeaker`.

## S-6 A word in a gap after a heard word stays with it

The gap word's own neighbour after it is another speaker's, so the rule
reads backward. Evidence:
`SpeakerAttributionTests.aWordInAGapAfterAHeardWordStaysWithIt`.

## S-7 Words before the first heard word take its speaker

Evidence: `SpeakerAttributionTests.wordsBeforeTheFirstHeardWordTakeItsSpeaker`.

## S-8 A segment without words takes the speaker overlapping more of it

Evidence:
`SpeakerAttributionTests.aSegmentWithoutWordsTakesTheSpeakerOverlappingMoreOfIt`.

## S-9 Turns between a segment's words decide it whole

Two speakers' turns between the words, one overlapping more of the segment.
Evidence: `SpeakerAttributionTests.turnsBetweenASegmentsWordsDecideItWhole`.

## S-10 A segment no turn overlaps takes the nearest speaker

The nearer turn is the later one; and, for the tie, two turns at equal
distances, before and after, go to the earlier. Evidence:
`SpeakerAttributionTests.aSegmentNoTurnOverlapsTakesTheNearestSpeaker`,
`SpeakerAttributionTests.equallyNearTurnsGoToTheEarlier`.

## S-11 A minor speaker's words go to a remaining speaker

One speaker at 4 % of the turns' time, inside another's turn. Evidence:
`SpeakerAttributionTests.aMinorSpeakersWordsGoToARemainingSpeaker`.

## S-12 A minor speaker's lone segment goes to the nearest remaining speaker

A minor speaker's turn alone over a segment, between two other speakers'
turns at different distances. Evidence:
`SpeakerAttributionTests.aMinorSpeakersLoneSegmentGoesToTheNearestRemainingSpeaker`.

## S-13 A speaker at the least share that counts is kept

One speaker at exactly 5 % of the turns' time, also where the times round
below it; a share made of several turns, and of turns with gaps between them
or overlapping another speaker's. Evidence:
`SpeakerAttributionTests.aSpeakerAtTheLeastShareThatCountsIsKept`,
`SpeakerAttributionTests.aSpeakersShareSumsTheirTurnsOverAllTurnTime`,
`SpeakerAttributionTests.overlappingTurnsCountInTheShareEach`.

## S-14 Speakers all under the share are all kept

Twenty-one speakers with equal time. Evidence:
`SpeakerAttributionTests.speakersAllUnderTheShareAreAllKept`.

## S-15 No turns leave every segment without a speaker

Evidence: `SpeakerAttributionTests.noTurnsLeaveEverySegmentWithoutASpeaker`.
