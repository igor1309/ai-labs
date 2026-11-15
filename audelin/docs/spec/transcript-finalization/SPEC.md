# Make each recorded transcript final

Observer: the composition root, which sends transcript output, input ended and shutdown,
answers the ports and reads final transcripts and settled.

## Decided

- Every recorded call is made final, whether or not notes are on; the machine knows nothing of notes, and its final transcript goes to a receiver port the root answers.
- Eligibility follows the latest attempted write: a call whose latest write failed is final as last saved, with no model work, even after earlier saved writes.
- A commit renders with the speaker names taken at close, read once, so a name published later cannot race the replacement.
- On shutdown no model work starts; cleaning is model work only and stops at once, while diarizing and committing finish their file writes, since both replace the file.
- A call's final transcript is published once, and only after its receiver has taken it. Settled requires shutdown, the end of transcript input and every opened call's final transcript published.
- Input ended means no more transcript openings, writes or closes will arrive; it is separate from shutdown. A call may open after shutdown while input is still open, and becomes final as last saved when it closes, without model work.

```gherkin
Feature: Make each recorded transcript final

  Scenario: S-1 Saved call is diarized after it closes
    Given a call whose latest write was saved
    When its transcript closes
    Then I can see its far side being given to speakers

  Scenario: S-2 Failed write is final as last saved
    Given a call whose latest write failed
    When its transcript closes
    Then I can take its final transcript as last saved without model work

  Scenario: S-3 Call with no write is final and empty
    Given a call that never saved a write
    When its transcript closes
    Then I can take a final transcript that is not usable

  Scenario: S-4 Diarized call is cleaned
    Given a call whose far side was given to speakers
    When diarizing returns
    Then I can see its microphone side being heard again

  Scenario: S-5 Failed diarization still cleans
    Given a call being diarized
    When diarizing fails
    Then I can see its microphone side cleaned against the far side as written

  Scenario: S-6 Heard microphone side is committed
    Given a call being cleaned
    When cleanup returns a heard microphone side
    Then I can see it replacing the saved one with the names taken at close

  Scenario: S-7 Kept microphone side is final
    Given a call being cleaned
    When cleanup keeps the microphone side as written
    Then I can take its final transcript with the far side given to speakers

  Scenario: S-8 Committed cleanup is final
    Given a call whose cleaned side is being committed
    When the replacement succeeds
    Then I can take its final transcript with the heard microphone side

  Scenario: S-9 Failed commit is final as written
    Given a call whose cleaned side is being committed
    When the replacement fails
    Then I can take its final transcript with the microphone side as written

  Scenario: S-10 Calls are made final independently
    Given two calls at different stages
    When one call's stage returns
    Then I can see the other call unchanged

  Scenario: S-11 Late results change nothing
    Given a call past the stage a result belongs to
    When that result arrives
    Then I can see the call unchanged and no work started

  Scenario: S-12 Shutdown after input ended with nothing open settles at once
    Given input has ended and no call is open
    When shutdown arrives
    Then I can see the machine settled

  Scenario: S-13 Shutdown stops cleaning
    Given a call being cleaned
    When shutdown arrives
    Then I can take its final transcript as written once its cleanup is stopped

  Scenario: S-14 Shutdown lets diarizing finish its write
    Given shutdown has arrived and a call is being diarized
    When diarizing returns
    Then I can take its final transcript without cleaning

  Scenario: S-17 Shutdown lets a commit finish its write
    Given shutdown has arrived and a call's cleaned side is being committed
    When the replacement returns
    Then I can take its final transcript as the file holds it

  Scenario: S-15 Call closing after shutdown skips model work
    Given shutdown has arrived
    When a saved call's transcript closes
    Then I can take its final transcript as written

  Scenario: S-16 Settled waits for every publication
    Given shutdown has arrived, input has ended and a call's final transcript is not yet published
    When another call's final transcript is published
    Then I can see the machine not yet settled

  Scenario: S-18 Input ends before shutdown
    Given every opened call's final transcript has been published
    When input ends
    Then I can see input ended and the machine not yet settled
    When shutdown arrives
    Then I can see the machine settled

  Scenario: S-19 Shutdown arrives before input ends
    Given every opened call's final transcript has been published
    When shutdown arrives
    Then I can see no new model work starts and the machine not yet settled
    When input ends
    Then I can see the machine settled

  Scenario: S-20 A call opens after shutdown while input is still open
    Given shutdown has arrived and input has not ended
    When a call opens, saves text and closes
    Then I can take its final transcript as last saved without model work
    And I can see the machine not yet settled until input ends and the final transcript is published
```
