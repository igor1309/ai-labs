# Make each recorded transcript final — shutdown

Observer: the composition root, as in [SPEC.md](SPEC.md). This file holds the same
machine's shutdown and input-ended scenarios.

## Decided

- On shutdown no model work starts; cleaning is model work only and stops at once, while diarizing and committing finish their file writes, since both replace the file.
- Settled requires shutdown, the end of transcript input and every opened call's final transcript published.
- Input ended means no more transcript openings, writes or closes will arrive; it is separate from shutdown. A call may open after shutdown while input is still open, and, if its latest write was saved, is committed as last saved with its stages skipped when it closes, without model work.

```gherkin
Feature: Make each recorded transcript final at shutdown

  Scenario: S-12 Shutdown after input ended with nothing open settles at once
    Given input has ended and no call is open
    When shutdown arrives
    Then I can see the machine settled

  Scenario: S-13 Shutdown stops cleaning
    Given a call being cleaned
    When shutdown arrives
    Then I can see its cleanup stopped and it committed as written, its saved split kept and cleaning told as skipped
    When the commit returns
    Then I can take its final transcript

  Scenario: S-14 Shutdown lets diarizing finish its write
    Given shutdown has arrived and a call is being diarized
    When diarizing returns
    Then I can see it committed with the split, cleaning told as skipped
    When the commit returns
    Then I can take its final transcript

  Scenario: S-17 Shutdown lets a commit finish its write
    Given shutdown has arrived and a call's cleaned side is being committed
    When the replacement returns
    Then I can take its final transcript as the file holds it

  Scenario: S-15 Call closing after shutdown skips model work
    Given shutdown has arrived
    When a saved call's transcript closes
    Then I can see it committed as written, both stages told as skipped

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
    Then I can see it committed as last saved, its stages skipped, without model work
    And I can see the machine not yet settled until input ends and the final transcript is published
```
