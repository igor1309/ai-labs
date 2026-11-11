# Speaker attribution

Observer: compose, which hands it a closed transcript's far-side segments and
the call track's turns, and reads each back with its remote speaker (LAB-1131).
A transcript-pipeline operator (`../../../ARCHITECTURE.md`): it reads times only.

## Decided

- **Speakers under 5 % of all turn time are dropped first, unless all are**
  (LAB-1130, `../../research/diarization.md`: Nemotron's extras hold little speech).
- **A word goes to the speaker whose turns, summed, overlap it most:** a
  segment can span a change of speaker. On a tie, here or below, the speaker
  whose deciding turn (earliest overlapping, or nearest) starts first wins,
  then the lower number. Numbers are kept as the turns give them.
- **A segment splits where consecutive words change speaker;** a piece starts
  at its first word and ends where the next begins; the ends keep the segment's.
- **A word no turn overlaps takes the previous word's speaker,** or at a
  segment's start the next overlapped word's: a pause does not split a sentence.
- **A segment with no overlapped word goes whole** to the speaker whose turns
  overlap it most, else to the nearest turn's: with any turn, every segment
  has a speaker; with none, none has.

```gherkin
Feature: Giving the far side's text to remote speakers

  Scenario: S-1 A segment one speaker said is theirs
    Given a segment whose words all fall in one speaker's turn
    When I attribute it
    Then I can read the segment whole, as that speaker's

  Scenario: S-2 A segment is split where the speaker changes
    Given a segment whose first words fall in one speaker's turn and the rest in another's
    When I attribute it
    Then I can read it as two pieces, each with its words and its speaker

  Scenario: S-3 A word between two turns goes to the one overlapping more of it
    Given a word overlapping one speaker's turn more than another's
    When I attribute its segment
    Then I can read the word as said by the speaker overlapping more of it

  Scenario: S-4 A tied word goes to the turn that started first
    Given a word overlapping two speakers' turns equally, one turn starting earlier
    When I attribute its segment
    Then I can read the word as said by the speaker whose turn started first

  Scenario: S-5 A tie between turns starting together goes to the lower speaker
    Given a word overlapping two speakers' turns equally, both starting together
    When I attribute its segment
    Then I can read the word as said by the lower-numbered speaker

  Scenario: S-6 A word in a gap after a heard word stays with it
    Given a segment with a word that no turn overlaps, after a word a turn overlaps
    When I attribute it
    Then I can read that word with the speaker of the word before it

  Scenario: S-7 Words before the first heard word take its speaker
    Given a segment whose first words no turn overlaps, followed by a word a turn overlaps
    When I attribute it
    Then I can read those first words with the speaker of that later word

  Scenario: S-8 A segment without words takes the speaker overlapping more of it
    Given a segment with no words that one speaker's turns overlap more than another's
    When I attribute it
    Then I can read it as said by the speaker overlapping more of it

  Scenario: S-9 Turns between a segment's words decide it whole
    Given a segment whose words no turn overlaps, one speaker's turns between them overlapping it most
    When I attribute it
    Then I can read it whole, as that speaker's

  Scenario: S-10 A segment no turn overlaps takes the nearest speaker
    Given a segment that no turn overlaps, nearer one speaker's turn than another's
    When I attribute it
    Then I can read it whole, as the nearer speaker's

  Scenario: S-11 A minor speaker's words go to a remaining speaker
    Given turns in which one speaker holds too little of the time to count, inside another speaker's turn
    When I attribute the segments
    Then I can read no segment as that speaker's, and its words as the other speaker's

  Scenario: S-12 A minor speaker's lone segment goes to the nearest remaining speaker
    Given a segment only a minor speaker's turn overlaps, one remaining speaker's turn nearest to it
    When I attribute it
    Then I can read it whole, as the nearest remaining speaker's

  Scenario: S-13 A speaker at the least share that counts is kept
    Given turns in which one speaker holds exactly the least share of the time that counts
    When I attribute the segments
    Then I can read that speaker's words as theirs

  Scenario: S-14 Speakers all under the share are all kept
    Given turns in which every speaker holds too little of the time to count
    When I attribute the segments
    Then I can read each speaker's words as theirs

  Scenario: S-15 No turns leave every segment without a speaker
    Given segments and no turns
    When I attribute them
    Then I can read every segment whole, with no speaker
```
